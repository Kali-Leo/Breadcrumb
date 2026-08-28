// Purpose: personal FSRS parameter fitting (vision/09 #1) — runs the official fsrs-rs
// optimizer over the learner's own diglot review log and returns the 21 personalized
// parameters. Pure compute, no I/O; the frontend gates on data volume and persists.
// Main exports: optimize_fsrs_parameters (Tauri command).

use fsrs::{ComputeParametersInput, FSRSItem, FSRSReview, compute_parameters};
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

/// Fits FSRS parameters to the learner's review history. `items` follow fsrs-rs
/// conventions: one item per review prefix, first review delta_t = 0.
#[tauri::command]
pub fn optimize_fsrs_parameters(items: Vec<TrainItem>) -> Result<Vec<f32>, String> {
    let train_set: Vec<FSRSItem> = items
        .into_iter()
        .map(|item| FSRSItem {
            reviews: item
                .reviews
                .into_iter()
                .map(|review| FSRSReview {
                    rating: review.rating.clamp(1, 4),
                    delta_t: review.delta_t,
                })
                .collect(),
        })
        .collect();
    compute_parameters(ComputeParametersInput {
        train_set,
        ..Default::default()
    })
    .map_err(|error| format!("fsrs optimization failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end smoke: a small synthetic review log yields a finite parameter vector.
    /// fsrs-rs picks its fit path by item count (see its `training.rs`): below 8 items it
    /// returns DEFAULT_PARAMETERS untouched, below 64 it pretrains only w0..w3, and at 64 or
    /// more it runs the full training. This log has 80 items, so it takes the full path.
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
        let params = optimize_fsrs_parameters(items).expect("fit should succeed");
        assert!(params.len() >= 17, "unexpected parameter count {}", params.len());
        assert!(params.iter().all(|p| p.is_finite()));
    }
}
