// Purpose: the reading order of the boxes text detection found — top to bottom, and left to
// right within a line. PaddleOCR's `sorted_boxes` calls two boxes one line when their tops are
// within ten pixels; that is a rule for 72 dpi. At the 200 dpi pages are rendered at here a
// heading is fifty pixels tall and its two halves can start twelve pixels apart, which put
// "引言" before "第一章" in the measurements. So the ten pixels are a floor, and half the
// shorter box's height is used where that is more. The browser edition applies the same rule
// (apps/web/src/shims/ocr/ocrDetect.ts, sortBoxes).

use oar_ocr_core::processors::BoundingBox;

fn top(b: &BoundingBox) -> f32 {
    b.y_min()
}

fn height(b: &BoundingBox) -> f32 {
    b.y_max() - b.y_min()
}

fn same_line(a: &BoundingBox, b: &BoundingBox) -> bool {
    (top(a) - top(b)).abs() < (0.5 * height(a).min(height(b))).max(10.0)
}

/// Boxes in the order a reader would take them.
pub fn reading_order(boxes: &[BoundingBox]) -> Vec<BoundingBox> {
    let mut sorted: Vec<BoundingBox> = boxes.to_vec();
    sorted.sort_by(|a, b| {
        top(a)
            .total_cmp(&top(b))
            .then(a.x_min().total_cmp(&b.x_min()))
    });
    for i in 0..sorted.len().saturating_sub(1) {
        for j in (0..=i).rev() {
            let (upper, lower) = (&sorted[j], &sorted[j + 1]);
            if same_line(upper, lower) && lower.x_min() < upper.x_min() {
                sorted.swap(j, j + 1);
            } else {
                break;
            }
        }
    }
    sorted
}

#[cfg(test)]
mod tests {
    use super::reading_order;
    use oar_ocr_core::processors::{BoundingBox, Point};

    fn rect(x: f32, y: f32, w: f32, h: f32) -> BoundingBox {
        BoundingBox::new(vec![
            Point::new(x, y),
            Point::new(x + w, y),
            Point::new(x + w, y + h),
            Point::new(x, y + h),
        ])
    }

    #[test]
    fn a_heading_split_in_two_reads_left_to_right_even_when_its_tops_differ() {
        // "第一章" starts 12 px lower than "引言" but sits to its left.
        let chapter = rect(100.0, 112.0, 150.0, 50.0);
        let title = rect(280.0, 100.0, 100.0, 62.0);
        let ordered = reading_order(&[title.clone(), chapter.clone()]);
        assert_eq!(ordered[0].x_min(), chapter.x_min());
        assert_eq!(ordered[1].x_min(), title.x_min());
    }

    #[test]
    fn body_lines_stay_top_to_bottom() {
        let first = rect(100.0, 200.0, 800.0, 30.0);
        let second = rect(60.0, 240.0, 800.0, 30.0);
        let ordered = reading_order(&[second.clone(), first.clone()]);
        assert_eq!(ordered[0].y_min(), first.y_min());
        assert_eq!(ordered[1].y_min(), second.y_min());
    }
}
