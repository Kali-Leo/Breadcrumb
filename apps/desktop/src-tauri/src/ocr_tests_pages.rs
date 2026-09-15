// Purpose: the by-hand tests that read whole pages with the layout, table and formula models
// — the second half of ocr_tests.rs, which has the setup and the instructions for running
// them. A table page must come back as its rows and a formula page as its LaTeX; both print
// what they read and how long the page took, which is the number the research note quotes.

use super::prepared_engine;
use crate::ocr::read_page;
use crate::ocr_page::OcrBlock;

const BENCH: &str = "/data/leo/bench-retrieval/ocr";

#[test]
#[ignore = "runs the layout and table models on a real page; run with -- --ignored --nocapture"]
fn the_real_models_read_an_openstax_table_into_its_rows() {
    let (engine, dir) = prepared_engine(false);
    let page = image::open(format!("{BENCH}/data/table/chem_307.png"))
        .expect("page image")
        .to_rgb8();
    let started = std::time::Instant::now();
    let whole = read_page(&engine, &page).expect("the page reads");
    println!(
        "chem_307: {:.2}s, {} blocks",
        started.elapsed().as_secs_f64(),
        whole.blocks.len()
    );
    let tables: Vec<&Vec<Vec<String>>> = whole
        .blocks
        .iter()
        .filter_map(|block| match block {
            OcrBlock::Table { rows, .. } => Some(rows),
            OcrBlock::Formula { .. } => None,
        })
        .collect();
    for rows in &tables {
        for row in rows.iter() {
            println!("  | {} |", row.join(" | "));
        }
    }
    // The page also carries a periodic table drawn as a figure, which the layout model calls
    // a table too; the one that matters is the ionisation-energy table under it.
    let energies = tables
        .iter()
        .find(|rows| rows[0].first().is_some_and(|cell| cell == "Element"))
        .expect("the ionisation-energy table");
    assert_eq!((energies.len(), energies[0].len()), (7, 8));
    assert_eq!(energies[0][1], "IE1");
    assert_eq!(energies[1][0], "K");
    assert_eq!(energies[6][7], "Not available");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
#[ignore = "runs the formula model (232 MB) on a real page; run with -- --ignored --nocapture"]
fn the_real_models_read_the_formulas_of_a_textbook_page_into_latex() {
    let (engine, dir) = prepared_engine(true);
    let page = image::open(format!("{BENCH}/data/formula/zh_dlbook/137.png"))
        .expect("page image")
        .to_rgb8();
    let started = std::time::Instant::now();
    let whole = read_page(&engine, &page).expect("the page reads");
    println!(
        "zh_dlbook/137: {:.2}s, {} blocks",
        started.elapsed().as_secs_f64(),
        whole.blocks.len()
    );
    let formulas: Vec<&String> = whole
        .blocks
        .iter()
        .filter_map(|block| match block {
            OcrBlock::Formula { latex, .. } => Some(latex),
            OcrBlock::Table { .. } => None,
        })
        .collect();
    for latex in &formulas {
        println!("  $$ {latex} $$");
    }
    assert!(formulas.len() >= 3, "{} formulas", formulas.len());
    assert!(formulas.iter().any(|latex| latex.contains("\\sum")));
    std::fs::remove_dir_all(&dir).ok();
}
