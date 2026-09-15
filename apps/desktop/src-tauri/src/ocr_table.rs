// Purpose: reading one table the layout model found — its crop through SLANet_plus, the
// structure and cell boxes it returns handed to ocr_table_grid.rs together with the text lines
// the page's OCR already read inside the box. The text model is not run again: the lines are
// there, with positions, and the table model's job is only to say which cell each belongs to.
//
// SLANet_plus because it is 8 MB and 0.07–0.11 s a table, and on six OpenStax tables read
// this way it scored a TEDS of 0.978 with 98.7% of cells exactly right
// (docs/research/2026-09-15-公式与表格识别实测.md); the 368 MB SLANeXt pair was not tried
// against that. A table crop carries a 6 px margin — the box the layout model draws clips the
// rule around the outermost cells, and the structure model reads the rules.

use crate::ocr_layout::Region;
use crate::ocr_page::{OcrBlock, OcrLine, PageBox};
use crate::ocr_table_grid::{grid_text, parse_structure};
use oar_ocr_core::core::config::OrtSessionConfig;
use oar_ocr_core::predictors::TableStructureRecognitionPredictor;
use std::path::Path;

/// Around the layout box, so the outer rules land inside the crop.
const MARGIN: f32 = 6.0;
/// How much of a text line has to lie inside the table box for the table to read it.
const LINE_INSIDE: f32 = 0.5;

pub fn load(
    model: &Path,
    dict: &Path,
    session: OrtSessionConfig,
) -> Result<TableStructureRecognitionPredictor, String> {
    TableStructureRecognitionPredictor::builder()
        .model_name("SLANet_plus")
        .dict_path(dict)
        .with_ort_config(session)
        .build(model)
        .map_err(|error| error.to_string())
}

/// A cell box as the model gives it: eight numbers, four corners, in crop pixels. Back to
/// the page by the crop's offset.
fn cell_box(corners: &[f32], offset: (f32, f32)) -> Option<PageBox> {
    if corners.len() < 8 {
        return None;
    }
    let xs = [corners[0], corners[2], corners[4], corners[6]];
    let ys = [corners[1], corners[3], corners[5], corners[7]];
    let min = |v: [f32; 4]| v.iter().copied().fold(f32::INFINITY, f32::min);
    let max = |v: [f32; 4]| v.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    Some(PageBox::new(
        min(xs) + offset.0,
        min(ys) + offset.1,
        max(xs) + offset.0,
        max(ys) + offset.1,
    ))
}

/// The table as rows of cell text, or None when what the model saw was not a table.
pub fn read_table(
    predictor: &TableStructureRecognitionPredictor,
    page: &image::RgbImage,
    region: &Region,
    lines: &[OcrLine],
) -> Result<Option<OcrBlock>, String> {
    let Some((x, y, w, h)) = region
        .page_box
        .crop_rect(MARGIN, page.width(), page.height())
    else {
        return Ok(None);
    };
    let crop = image::imageops::crop_imm(page, x, y, w, h).to_image();
    let result = predictor
        .predict(vec![crop])
        .map_err(|error| error.to_string())?;
    let tokens = result.structures.into_iter().next().unwrap_or_default();
    let offset = (x as f32, y as f32);
    let boxes: Vec<PageBox> = result
        .bboxes
        .into_iter()
        .next()
        .unwrap_or_default()
        .iter()
        .filter_map(|corners| cell_box(corners, offset))
        .collect();
    let inside: Vec<&OcrLine> = lines
        .iter()
        .filter(|line| line.page_box.inside_fraction(&region.page_box) >= LINE_INSIDE)
        .collect();
    let rows = parse_structure(&tokens, &boxes);
    Ok(grid_text(&rows, &inside).map(|rows| OcrBlock::Table {
        page_box: region.page_box,
        rows,
    }))
}

#[cfg(test)]
mod tests {
    use super::cell_box;

    #[test]
    fn a_cell_box_is_the_bounds_of_its_corners_moved_to_the_page() {
        let b = cell_box(
            &[10.0, 5.0, 50.0, 6.0, 49.0, 30.0, 11.0, 29.0],
            (100.0, 200.0),
        )
        .unwrap();
        assert_eq!((b.x0, b.y0, b.x1, b.y1), (110.0, 205.0, 150.0, 230.0));
        assert!(cell_box(&[1.0, 2.0], (0.0, 0.0)).is_none());
    }
}
