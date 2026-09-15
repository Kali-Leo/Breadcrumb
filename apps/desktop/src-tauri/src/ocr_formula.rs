// Purpose: reading one formula the layout model found into LaTeX, through PP-FormulaNet-S.
// The one recognition step the reader opts into: the model is 232 MB, against 62 for
// everything else a scanned page needs, so it is fetched and loaded only when the page's
// request says formulas are wanted (`x-formulas`), and never on the strength of the network
// switch alone.
//
// What it is good for and where it stops (docs/research/2026-09-15-公式与表格识别实测.md):
// a single-line display formula is read in about 0.1 s and, on the research pages, with a
// symbol error of 11–22% against the PDF's own text layer — most of that being the text
// layer's ordering of fractions and limits, not the model's reading. What it cannot do is a
// derivation of five or six lines in one box: the 384 px input makes each glyph a few pixels
// and the decoder loops, emitting the same token over and over. Such an output is recognised
// here and thrown away, and the text the OCR read of that region stands instead.

use crate::ocr_layout::Region;
use crate::ocr_page::OcrBlock;
use oar_ocr_core::core::config::OrtSessionConfig;
use oar_ocr_core::predictors::{FormulaModelKind, FormulaRecognitionPredictor};
use std::path::Path;

/// Around the layout box: a formula's descenders and hats reach past what the model drew.
const MARGIN: f32 = 4.0;
/// A token said this many times in a row is a decoder that has stopped reading.
const LOOP_RUN: usize = 8;
/// One mark making this share of a long output is the same failure in another form.
const LOOP_SHARE: f32 = 0.33;
const LOOP_MIN_LENGTH: usize = 20;

pub fn load(
    model: &Path,
    tokenizer: &Path,
    session: OrtSessionConfig,
) -> Result<FormulaRecognitionPredictor, String> {
    FormulaRecognitionPredictor::builder()
        .model_name("PP-FormulaNet-S")
        .model_kind(FormulaModelKind::PPFormulaNet)
        .tokenizer_path(tokenizer)
        .with_ort_config(session)
        .build(model)
        .map_err(|error| error.to_string())
}

/// The LaTeX with its commands and braces stripped: the marks that are left are what a
/// looping decoder repeats.
fn bare_marks(latex: &str) -> String {
    let mut out = String::with_capacity(latex.len());
    let mut chars = latex.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                // A command name, or one escaped mark.
                if chars.peek().is_some_and(|n| n.is_ascii_alphabetic()) {
                    while chars.peek().is_some_and(|n| n.is_ascii_alphabetic()) {
                        chars.next();
                    }
                } else {
                    chars.next();
                }
            }
            '{' | '}' | ' ' | '\n' | '\t' => {}
            other => out.push(other),
        }
    }
    out
}

/// True for an output the decoder did not really read: a run of one token, or one mark
/// making a third of everything that is not a command.
pub fn is_degenerate(latex: &str) -> bool {
    let mut run = 1;
    let mut previous: Option<&str> = None;
    for token in latex.split_whitespace() {
        run = if previous == Some(token) { run + 1 } else { 1 };
        if run >= LOOP_RUN {
            return true;
        }
        previous = Some(token);
    }
    let marks = bare_marks(latex);
    let count = marks.chars().count();
    if count < LOOP_MIN_LENGTH {
        return false;
    }
    let mut tally: std::collections::HashMap<char, usize> = std::collections::HashMap::new();
    for c in marks.chars().filter(|c| !c.is_alphanumeric()) {
        *tally.entry(c).or_default() += 1;
    }
    tally
        .values()
        .any(|&n| n as f32 >= LOOP_SHARE * count as f32)
}

/// The formula as LaTeX, or None when the model read nothing it can be trusted on.
pub fn read_formula(
    predictor: &FormulaRecognitionPredictor,
    page: &image::RgbImage,
    region: &Region,
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
    let latex = result
        .formulas
        .into_iter()
        .next()
        .unwrap_or_default()
        .trim()
        .to_string();
    if latex.is_empty() || is_degenerate(&latex) {
        return Ok(None);
    }
    Ok(Some(OcrBlock::Formula {
        page_box: region.page_box,
        latex,
    }))
}

#[cfg(test)]
mod tests {
    use super::{bare_marks, is_degenerate};

    #[test]
    fn commands_and_braces_are_not_marks() {
        assert_eq!(
            bare_marks(r"\frac { 1 } { m } \sum _ { i = 1 } ^ { m } x"),
            "1m_i=1^mx"
        );
        assert_eq!(bare_marks(r"a \\ b \, c"), "abc");
    }

    #[test]
    fn a_real_formula_is_kept() {
        assert!(!is_degenerate(
            r"\hat { \theta } _ { m } = \frac { 1 } { m } \sum _ { i = 1 } ^ { m } x ^ { ( i ) } ."
        ));
        assert!(!is_degenerate(r"= \theta - \theta = 0"));
    }

    #[test]
    fn a_looping_decoder_is_thrown_away() {
        assert!(is_degenerate(
            r"\begin{array} { r l } & { \cdots \cdots \cdots \cdots \cdots \cdots \cdots \cdots \cdots }"
        ));
        assert!(is_degenerate(&", ".repeat(30)));
        let commas = format!("( {} )", r"\ , ".repeat(20));
        assert!(is_degenerate(&commas));
    }
}
