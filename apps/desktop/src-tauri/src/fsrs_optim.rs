// Purpose: personal FSRS parameter fitting (vision/09 #1) — runs the official fsrs-rs
// optimizer over the learner's own diglot review log and returns the 21 personalized
// parameters. Pure compute, no I/O; the frontend gates on data volume and persists.
// Main exports: optimize_fsrs_parameters (Tauri command).
//
// SECURITY / LIVENESS: the renderer can invoke this with any JSON it likes, and fsrs-rs
// answers some shapes with a panic rather than an Err — a single review, or a day's worth of
// same-day repeats, reaches `first_long_term_review`, which `expect`s a review with
// delta_t > 0 (fsrs-6.6.1/src/dataset.rs:62). A panic unwinding through the webview's C
// callback aborts the whole process, so this file never lets one reach the caller: the shape
// is checked before fsrs sees it, and the fit itself runs on the blocking pool behind
// catch_unwind so a future fsrs version cannot reintroduce the same crash.

use fsrs::{compute_parameters, ComputeParametersInput, FSRSItem, FSRSReview};
use serde::Deserialize;

#[derive(Deserialize, Clone, Copy)]
pub struct TrainReview {
    /// 1-4 (Again/Hard/Good/Easy).
    pub rating: u32,
    /// Days since the previous review; must be 0 for the first review of an item.
    pub delta_t: u32,
}

#[derive(Deserialize)]
pub struct TrainItem {
    pub reviews: Vec<TrainReview>,
}

/// Ceiling on one fit. The renderer can invoke this command directly, and `compute_parameters`
/// is bound by the item count in both CPU and memory — a train set no review log could produce
/// is a way to wedge the app, not a better fit. 100k review prefixes is decades of studying.
const MAX_TRAIN_ITEMS: usize = 100_000;

/// Turns the renderer's JSON into the train set fsrs-rs is willing to look at, or says which
/// rule it broke. Every item is one review prefix ending at a review that actually happened on
/// a later day: fsrs needs the terminal review's interval to have a length, so an item whose
/// reviews are all delta_t = 0 (a single review, or several inside one session) is not a
/// shorter fit — it is the input its dataset code panics on.
fn validated_train_set(items: Vec<TrainItem>) -> Result<Vec<FSRSItem>, String> {
    if items.len() > MAX_TRAIN_ITEMS {
        return Err(format!("too many review items to fit (limit {MAX_TRAIN_ITEMS})"));
    }
    items
        .into_iter()
        .map(|item| {
            if item.reviews.is_empty() {
                return Err("a review item with no reviews cannot be fitted".to_string());
            }
            if !item.reviews.iter().any(|review| review.delta_t > 0) {
                return Err(
                    "a review item needs at least one review a day or more after the last"
                        .to_string(),
                );
            }
            Ok(FSRSItem {
                reviews: item
                    .reviews
                    .into_iter()
                    .map(|review| FSRSReview {
                        rating: review.rating.clamp(1, 4),
                        delta_t: review.delta_t,
                    })
                    .collect(),
            })
        })
        .collect()
}

/// The last-resort net. `validated_train_set` covers the shape fsrs-6.6.1 panics on today;
/// this covers the one the next version might, because the alternative — an unwind crossing
/// the webview's C frames — is not an error the app can report, it is the app disappearing.
fn fit(train_set: Vec<FSRSItem>) -> Result<Vec<f32>, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        compute_parameters(ComputeParametersInput { train_set, ..Default::default() })
    }))
    .map_err(|_| "fsrs optimization panicked on this review log".to_string())?
    .map_err(|error| format!("fsrs optimization failed: {error}"))
}

/// Fits FSRS parameters to the learner's review history. `items` follow fsrs-rs
/// conventions: one item per review prefix, first review delta_t = 0.
///
/// Async on purpose: a non-async `#[tauri::command]` is compiled to `ExecutionContext::Blocking`
/// and runs inline on the IPC thread, where at the documented ceiling it is a ~190ms stall and
/// where a panic has nowhere to unwind to. `spawn_blocking` moves both off it.
#[tauri::command]
pub async fn optimize_fsrs_parameters(items: Vec<TrainItem>) -> Result<Vec<f32>, String> {
    let train_set = validated_train_set(items)?;
    tauri::async_runtime::spawn_blocking(move || fit(train_set))
        .await
        .map_err(|error| format!("fsrs optimization did not finish: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fit_now(items: Vec<TrainItem>) -> Result<Vec<f32>, String> {
        tauri::async_runtime::block_on(optimize_fsrs_parameters(items))
    }

    /// End-to-end smoke: a small synthetic review log yields a finite parameter vector.
    /// fsrs-rs picks its fit path by item count (see its `training.rs`): below 8 items it
    /// returns DEFAULT_PARAMETERS untouched, below 64 it pretrains only w0..w3, and at 64 or
    /// more it runs the full training. `prepare_training_data` hands the length-2 prefixes to
    /// the initialization set, so of the 80 items here 40 reach the train set — pretrain-only.
    #[test]
    fn optimizes_synthetic_log() {
        // Prefix convention (matches the TS builder): every review index with delta_t > 0
        // yields one item containing the history up to it — pretrain needs the length-2
        // prefixes to estimate initial stability.
        let mut items: Vec<TrainItem> = Vec::new();
        for i in 0..40u32 {
            let first = TrainReview { rating: 1 + (i % 4), delta_t: 0 };
            let second = TrainReview { rating: if i % 4 == 0 { 1 } else { 3 }, delta_t: 1 + i % 5 };
            let third = TrainReview { rating: 3, delta_t: 3 + i % 7 };
            items.push(TrainItem { reviews: vec![first, second] });
            items.push(TrainItem { reviews: vec![first, second, third] });
        }
        let params = fit_now(items).expect("fit should succeed");
        assert!(params.len() >= 17, "unexpected parameter count {}", params.len());
        assert!(params.iter().all(|p| p.is_finite()));
    }

    /// The renderer can call this command with anything; the cap is what stops it from
    /// handing over a train set that never came from a person studying.
    #[test]
    fn refuses_more_items_than_a_review_log_could_hold() {
        let items: Vec<TrainItem> = (0..=MAX_TRAIN_ITEMS)
            .map(|_| TrainItem { reviews: Vec::new() })
            .collect();
        assert!(fit_now(items).is_err());
    }

    /// The crash this file exists to prevent. Both shapes reach fsrs's
    /// `first_long_term_review` and used to panic there — inline on the IPC thread, which
    /// aborts the process rather than failing the call.
    #[test]
    fn refuses_the_item_shapes_fsrs_panics_on_instead_of_crashing() {
        let single = vec![TrainItem { reviews: vec![TrainReview { rating: 3, delta_t: 0 }] }];
        assert!(fit_now(single).is_err(), "a lone first review must be refused, not fitted");

        let same_day = vec![TrainItem {
            reviews: vec![
                TrainReview { rating: 3, delta_t: 0 },
                TrainReview { rating: 2, delta_t: 0 },
                TrainReview { rating: 4, delta_t: 0 },
            ],
        }];
        assert!(fit_now(same_day).is_err(), "same-day-only repeats must be refused");

        let empty = vec![TrainItem { reviews: Vec::new() }];
        assert!(fit_now(empty).is_err());
    }

    /// One bad item poisons the batch rather than being dropped: a fit quietly computed from
    /// less than the log the learner has is a worse answer than a refusal that says so.
    #[test]
    fn refuses_a_batch_where_only_one_item_is_malformed() {
        let mut items: Vec<TrainItem> = (0..80)
            .map(|_| TrainItem {
                reviews: vec![
                    TrainReview { rating: 3, delta_t: 0 },
                    TrainReview { rating: 3, delta_t: 2 },
                ],
            })
            .collect();
        items.push(TrainItem { reviews: vec![TrainReview { rating: 3, delta_t: 0 }] });
        assert!(fit_now(items).is_err());
    }

    /// The net behind the shape check: `fit` is handed the exact train set fsrs panics on,
    /// bypassing validation the way a future fsrs release could bypass it, and still returns.
    #[test]
    fn a_panic_inside_fsrs_comes_back_as_an_error() {
        let train_set = vec![FSRSItem { reviews: vec![FSRSReview { rating: 3, delta_t: 0 }] }];
        let error = fit(train_set).expect_err("fsrs panics on this shape");
        assert!(error.contains("panicked"), "unexpected error: {error}");
    }
}
