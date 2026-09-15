// Purpose: what `ocr_page` hands back, and the little geometry every stage of reading a page
// shares. A page is lines of text, each with where it sits, plus the blocks that are not
// running text — a table read into rows of cells, a formula read into LaTeX. The shapes here
// are the contract with the TypeScript side (apps/desktop/src/lib/library/ocrPage.ts), which
// composes them into the lines that get indexed; the browser edition's worker answers with
// the same shapes, so that composition is written once.

use oar_ocr_core::processors::BoundingBox;

/// Page pixels, `x0,y0` top-left, `x1,y1` bottom-right.
#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq)]
pub struct PageBox {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
}

impl PageBox {
    pub fn new(x0: f32, y0: f32, x1: f32, y1: f32) -> Self {
        Self { x0, y0, x1, y1 }
    }

    /// The axis-aligned box around a detection polygon.
    pub fn around(polygon: &BoundingBox) -> Self {
        Self::new(
            polygon.x_min(),
            polygon.y_min(),
            polygon.x_max(),
            polygon.y_max(),
        )
    }

    pub fn area(&self) -> f32 {
        (self.x1 - self.x0).max(0.0) * (self.y1 - self.y0).max(0.0)
    }

    /// The share of this box's area that lies inside `outer`, 0 to 1.
    pub fn inside_fraction(&self, outer: &PageBox) -> f32 {
        let own = self.area();
        if own <= 0.0 {
            return 0.0;
        }
        let overlap = PageBox::new(
            self.x0.max(outer.x0),
            self.y0.max(outer.y0),
            self.x1.min(outer.x1),
            self.y1.min(outer.y1),
        )
        .area();
        overlap / own
    }

    pub fn center(&self) -> (f32, f32) {
        ((self.x0 + self.x1) / 2.0, (self.y0 + self.y1) / 2.0)
    }

    /// Grown by `margin` on every side and clamped to a `width` × `height` page, as integers
    /// a crop can be taken with. Empty when the box lies off the page.
    pub fn crop_rect(&self, margin: f32, width: u32, height: u32) -> Option<(u32, u32, u32, u32)> {
        let x0 = (self.x0 - margin).max(0.0) as u32;
        let y0 = (self.y0 - margin).max(0.0) as u32;
        let x1 = ((self.x1 + margin).ceil() as u32).min(width);
        let y1 = ((self.y1 + margin).ceil() as u32).min(height);
        if x1 > x0 && y1 > y0 {
            Some((x0, y0, x1 - x0, y1 - y0))
        } else {
            None
        }
    }
}

/// One recognised line of text, in reading order.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
pub struct OcrLine {
    pub text: String,
    pub score: f32,
    #[serde(rename = "box")]
    pub page_box: PageBox,
}

/// A region of the page that is not running text, read by the model made for it.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum OcrBlock {
    /// Rows of cells, spans expanded — a spanning cell's text in its first slot, blanks after.
    Table {
        #[serde(rename = "box")]
        page_box: PageBox,
        rows: Vec<Vec<String>>,
    },
    /// LaTeX without delimiters.
    Formula {
        #[serde(rename = "box")]
        page_box: PageBox,
        latex: String,
    },
}

/// Everything read off one page.
#[derive(serde::Serialize, Debug, Clone, PartialEq, Default)]
pub struct OcrPage {
    pub lines: Vec<OcrLine>,
    pub blocks: Vec<OcrBlock>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_inside_fraction_is_the_share_of_the_inner_box_covered() {
        let outer = PageBox::new(0.0, 0.0, 100.0, 100.0);
        assert_eq!(
            PageBox::new(10.0, 10.0, 20.0, 20.0).inside_fraction(&outer),
            1.0
        );
        assert_eq!(
            PageBox::new(90.0, 0.0, 110.0, 10.0).inside_fraction(&outer),
            0.5
        );
        assert_eq!(
            PageBox::new(200.0, 0.0, 210.0, 10.0).inside_fraction(&outer),
            0.0
        );
        assert_eq!(
            PageBox::new(5.0, 5.0, 5.0, 5.0).inside_fraction(&outer),
            0.0
        );
    }

    #[test]
    fn a_crop_rect_grows_by_the_margin_and_stays_on_the_page() {
        let b = PageBox::new(2.0, 3.0, 50.0, 60.0);
        assert_eq!(b.crop_rect(4.0, 52, 100), Some((0, 0, 52, 64)));
        assert_eq!(
            PageBox::new(60.0, 0.0, 70.0, 5.0).crop_rect(0.0, 52, 100),
            None
        );
    }

    #[test]
    fn blocks_serialise_with_their_kind_first() {
        let block = OcrBlock::Formula {
            page_box: PageBox::new(1.0, 2.0, 3.0, 4.0),
            latex: "x^2".into(),
        };
        let json = serde_json::to_value(&block).unwrap();
        assert_eq!(json["kind"], "formula");
        assert_eq!(json["box"]["x1"], 3.0);
        assert_eq!(json["latex"], "x^2");
        let table = OcrBlock::Table {
            page_box: PageBox::new(0.0, 0.0, 1.0, 1.0),
            rows: vec![vec!["a".into(), "b".into()]],
        };
        assert_eq!(serde_json::to_value(&table).unwrap()["rows"][0][1], "b");
    }
}
