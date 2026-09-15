// Purpose: finding the parts of a scanned page that are not running text — the tables and the
// formulas — so that the models made for those can be run on them and on nothing else. A page
// of prose costs the layout model 33 ms and gets no further model at all.
//
// PP-DocLayout-M rather than S or plus-L: on the research pages S found 63–80% of display
// formulas and 2 of 6 OpenStax tables, M 85–96% and 6 of 6, plus-L a few points more for 130
// MB and 280 ms a page (docs/research/2026-09-15-公式与表格识别实测.md). M is where the
// bytes stop buying anything. Its thresholds are PaddleOCR's PP-StructureV3 defaults, formula
// at 0.3, table at 0.5.
//
// The model returns overlapping boxes for the same formula more often than not — a line and
// the block it sits in, both scored. Keeping both would read the formula twice, so a box that
// lies almost entirely inside a larger kept box of the same kind is dropped. Two tables never
// overlap, and a table inside a table is not a thing the page has, so the rule serves both.

use crate::ocr_page::PageBox;
use oar_ocr_core::core::config::OrtSessionConfig;
use oar_ocr_core::predictors::layout_detection::LayoutDetectionPredictorBuilder;
use oar_ocr_core::predictors::LayoutDetectionPredictor;
use std::path::Path;

/// How much of a box has to lie inside a larger box of its kind for it to be the same thing.
const DUPLICATE_FRACTION: f32 = 0.8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegionKind {
    Table,
    Formula,
}

impl RegionKind {
    fn from_label(label: &str) -> Option<Self> {
        match label {
            "table" => Some(Self::Table),
            "formula" => Some(Self::Formula),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Region {
    pub kind: RegionKind,
    pub page_box: PageBox,
}

pub fn load(path: &Path, session: OrtSessionConfig) -> Result<LayoutDetectionPredictor, String> {
    LayoutDetectionPredictorBuilder::with_pp_structurev3_thresholds()
        .model_name("pp_doclayout_m")
        .with_ort_config(session)
        .build(path)
        .map_err(|error| error.to_string())
}

/// The tables and formulas on a page, largest first, duplicates dropped.
pub fn find_regions(
    predictor: &LayoutDetectionPredictor,
    page: &image::RgbImage,
) -> Result<Vec<Region>, String> {
    let result = predictor
        .predict(vec![page.clone()])
        .map_err(|error| error.to_string())?;
    let found = result.elements.into_iter().flatten().filter_map(|element| {
        RegionKind::from_label(&element.element_type).map(|kind| Region {
            kind,
            page_box: PageBox::around(&element.bbox),
        })
    });
    Ok(dedupe(found.collect()))
}

/// Largest first; a region mostly inside an already-kept region of its kind is the same one.
pub fn dedupe(mut regions: Vec<Region>) -> Vec<Region> {
    regions.sort_by(|a, b| b.page_box.area().total_cmp(&a.page_box.area()));
    let mut kept: Vec<Region> = Vec::with_capacity(regions.len());
    for region in regions {
        let duplicate = kept.iter().any(|other| {
            other.kind == region.kind
                && region.page_box.inside_fraction(&other.page_box) >= DUPLICATE_FRACTION
        });
        if !duplicate {
            kept.push(region);
        }
    }
    kept
}

#[cfg(test)]
mod tests {
    use super::*;

    fn region(kind: RegionKind, x0: f32, y0: f32, x1: f32, y1: f32) -> Region {
        Region {
            kind,
            page_box: PageBox::new(x0, y0, x1, y1),
        }
    }

    #[test]
    fn a_formula_line_inside_a_formula_block_is_the_block() {
        let block = region(RegionKind::Formula, 100.0, 100.0, 700.0, 500.0);
        let line = region(RegionKind::Formula, 120.0, 300.0, 680.0, 340.0);
        let kept = dedupe(vec![line, block.clone()]);
        assert_eq!(kept, vec![block]);
    }

    #[test]
    fn a_formula_inside_a_table_is_not_a_duplicate_of_it() {
        let table = region(RegionKind::Table, 100.0, 100.0, 700.0, 500.0);
        let formula = region(RegionKind::Formula, 120.0, 300.0, 680.0, 340.0);
        let kept = dedupe(vec![formula.clone(), table.clone()]);
        assert_eq!(kept, vec![table, formula]);
    }

    #[test]
    fn boxes_that_merely_touch_both_stay() {
        let a = region(RegionKind::Formula, 100.0, 100.0, 700.0, 140.0);
        let b = region(RegionKind::Formula, 100.0, 130.0, 700.0, 170.0);
        assert_eq!(dedupe(vec![a, b]).len(), 2);
    }

    #[test]
    fn only_tables_and_formulas_are_regions() {
        assert_eq!(RegionKind::from_label("table"), Some(RegionKind::Table));
        assert_eq!(RegionKind::from_label("formula"), Some(RegionKind::Formula));
        assert_eq!(RegionKind::from_label("text"), None);
        assert_eq!(RegionKind::from_label("formula_number"), None);
    }
}
