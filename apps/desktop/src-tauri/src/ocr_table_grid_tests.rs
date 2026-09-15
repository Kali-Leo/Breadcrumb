// Purpose: the tests for ocr_table_grid.rs — the model's tokens and boxes are made up here,
// so what is checked is the arithmetic that turns them into rows, not the model.

use super::{assign_lines, grid_text, parse_structure, place, Cell};
use crate::ocr_page::{OcrLine, PageBox};

fn tokens(list: &[&str]) -> Vec<String> {
    list.iter().map(|t| t.to_string()).collect()
}

fn line(text: &str, x0: f32, y0: f32, x1: f32, y1: f32) -> OcrLine {
    OcrLine {
        text: text.into(),
        score: 0.99,
        page_box: PageBox::new(x0, y0, x1, y1),
    }
}

#[test]
fn plain_cells_and_spanning_cells_are_parsed_with_their_boxes_in_order() {
    let toks = tokens(&[
        "<thead>",
        "<tr>",
        "<td",
        " colspan=\"2\"",
        ">",
        "<td></td>",
        "</tr>",
        "</thead>",
        "<tbody>",
        "<tr>",
        "<td",
        " rowspan=\"3\"",
        ">",
        "<td></td>",
        "<td></td>",
        "</tr>",
        "</tbody>",
    ]);
    let boxes: Vec<PageBox> = (0..5)
        .map(|i| PageBox::new(i as f32, 0.0, i as f32 + 1.0, 1.0))
        .collect();
    let rows = parse_structure(&toks, &boxes);
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].len(), 2);
    assert_eq!((rows[0][0].colspan, rows[0][0].rowspan), (2, 1));
    assert_eq!(rows[0][0].page_box.x0, 0.0);
    assert_eq!(rows[0][1].page_box.x0, 1.0);
    assert_eq!((rows[1][0].colspan, rows[1][0].rowspan), (1, 3));
    assert_eq!(rows[1][2].page_box.x0, 4.0);
}

#[test]
fn a_rowspan_pushes_the_next_rows_cells_to_the_right() {
    let cell = |colspan, rowspan| Cell {
        page_box: PageBox::new(0.0, 0.0, 1.0, 1.0),
        colspan,
        rowspan,
    };
    let rows = vec![
        vec![cell(1, 2), cell(1, 1), cell(1, 1)],
        vec![cell(1, 1), cell(1, 1)],
        vec![cell(2, 1), cell(1, 1)],
    ];
    let (placed, width) = place(&rows);
    assert_eq!(width, 3);
    assert_eq!(placed[0], vec![(0, 0), (0, 1), (0, 2)]);
    assert_eq!(placed[1], vec![(1, 1), (1, 2)]);
    assert_eq!(placed[2], vec![(2, 0), (2, 2)]);
}

#[test]
fn a_line_goes_to_the_cell_it_lies_in_most_or_the_nearest_one() {
    let cells = [
        PageBox::new(0.0, 0.0, 100.0, 50.0),
        PageBox::new(100.0, 0.0, 200.0, 50.0),
        PageBox::new(0.0, 50.0, 100.0, 100.0),
    ];
    let inside = line("a", 110.0, 10.0, 190.0, 40.0);
    let straddling = line("b", 90.0, 10.0, 130.0, 40.0);
    let outside = line("c", 300.0, 60.0, 340.0, 90.0);
    let owners = assign_lines(&cells, &[&inside, &straddling, &outside]);
    assert_eq!(owners, vec![Some(1), Some(1), Some(1)]);
}

#[test]
fn the_grid_carries_each_cells_lines_in_reading_order_and_blanks_under_spans() {
    let toks = tokens(&[
        "<tr>",
        "<td",
        " colspan=\"2\"",
        ">",
        "</tr>",
        "<tr>",
        "<td></td>",
        "<td></td>",
        "</tr>",
    ]);
    let boxes = [
        PageBox::new(0.0, 0.0, 200.0, 50.0),
        PageBox::new(0.0, 50.0, 100.0, 100.0),
        PageBox::new(100.0, 50.0, 200.0, 100.0),
    ];
    let rows = parse_structure(&toks, &boxes);
    let l1 = line("Title", 10.0, 10.0, 90.0, 40.0);
    let l2 = line("second", 10.0, 80.0, 60.0, 95.0);
    let l3 = line("first", 10.0, 55.0, 60.0, 70.0);
    let l4 = line("right", 110.0, 60.0, 190.0, 90.0);
    let grid = grid_text(&rows, &[&l1, &l2, &l3, &l4]).expect("a grid");
    assert_eq!(
        grid,
        vec![
            vec!["Title".to_string(), String::new()],
            vec!["first second".to_string(), "right".to_string()],
        ]
    );
}

#[test]
fn one_row_or_one_column_is_not_a_table() {
    let one_row = parse_structure(&tokens(&["<tr>", "<td></td>", "<td></td>", "</tr>"]), &[]);
    assert!(grid_text(&one_row, &[]).is_none());
    let one_column = parse_structure(
        &tokens(&["<tr>", "<td></td>", "</tr>", "<tr>", "<td></td>", "</tr>"]),
        &[],
    );
    assert!(grid_text(&one_column, &[]).is_none());
}
