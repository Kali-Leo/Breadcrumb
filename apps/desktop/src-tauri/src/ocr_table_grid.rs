// Purpose: turning what the table model says — a run of HTML structure tokens and a box for
// each cell — and what the text model read — lines with positions — into rows of cell text.
// Pure arithmetic, no model, so it is the part with tests.
//
// The tokens are HTML in pieces: `<tr>` opens a row, `<td></td>` is a plain cell, `<td` then
// ` colspan="n"` / ` rowspan="n"` then `>` is a spanning one, `</tr>` closes the row; the box
// list has one entry per cell, in cell order. Cells are laid on a grid the way a browser lays
// a table: a rowspan occupies its slot in the rows below, and a later cell steps over it. Each
// line of text goes to the cell it lies in most, or, when it lies in none (a cell box that
// missed by a pixel), to the cell whose centre is nearest. A spanning cell's text goes in its
// first slot, so the grid reads the way Markdown can write it.

use crate::ocr_page::{OcrLine, PageBox};

#[derive(Debug, Clone, PartialEq)]
pub struct Cell {
    pub page_box: PageBox,
    pub colspan: usize,
    pub rowspan: usize,
}

/// Rows of cells as the model listed them, each with its span and its box on the page. A cell
/// the model gave no box (it ran out of them) is placed with an empty box: it takes no text.
pub fn parse_structure(tokens: &[String], boxes: &[PageBox]) -> Vec<Vec<Cell>> {
    let mut rows: Vec<Vec<Cell>> = Vec::new();
    let mut open: Option<Cell> = None;
    let mut next_box = boxes.iter();
    let mut take_box = || {
        next_box
            .next()
            .copied()
            .unwrap_or(PageBox::new(0.0, 0.0, 0.0, 0.0))
    };
    for token in tokens {
        match token.trim() {
            "<tr>" => rows.push(Vec::new()),
            "<td></td>" => {
                let cell = Cell {
                    page_box: take_box(),
                    colspan: 1,
                    rowspan: 1,
                };
                if let Some(row) = rows.last_mut() {
                    row.push(cell);
                }
            }
            "<td" => {
                open = Some(Cell {
                    page_box: take_box(),
                    colspan: 1,
                    rowspan: 1,
                })
            }
            ">" => {
                if let (Some(cell), Some(row)) = (open.take(), rows.last_mut()) {
                    row.push(cell);
                }
            }
            span if span.starts_with("colspan=") || span.starts_with("rowspan=") => {
                let n: usize = span
                    .trim_start_matches("colspan=")
                    .trim_start_matches("rowspan=")
                    .trim_matches('"')
                    .parse()
                    .unwrap_or(1);
                if let Some(cell) = open.as_mut() {
                    if span.starts_with("colspan=") {
                        cell.colspan = n.max(1);
                    } else {
                        cell.rowspan = n.max(1);
                    }
                }
            }
            _ => {}
        }
    }
    rows
}

/// Where each cell lands on the grid: `(row, column)` of its first slot, with the grid's
/// width. Rowspans reserve their slots in the rows below.
pub fn place(rows: &[Vec<Cell>]) -> (Vec<Vec<(usize, usize)>>, usize) {
    let mut taken: Vec<Vec<bool>> = Vec::new();
    let mut placed = Vec::with_capacity(rows.len());
    let mut width = 0;
    let reserve = |taken: &mut Vec<Vec<bool>>, r: usize, c: usize| {
        while taken.len() <= r {
            taken.push(Vec::new());
        }
        let row = &mut taken[r];
        if row.len() <= c {
            row.resize(c + 1, false);
        }
        row[c] = true;
    };
    for (r, row) in rows.iter().enumerate() {
        let mut column = 0;
        let mut slots = Vec::with_capacity(row.len());
        for cell in row {
            while taken
                .get(r)
                .and_then(|t| t.get(column))
                .copied()
                .unwrap_or(false)
            {
                column += 1;
            }
            slots.push((r, column));
            for dr in 0..cell.rowspan {
                for dc in 0..cell.colspan {
                    reserve(&mut taken, r + dr, column + dc);
                }
            }
            column += cell.colspan;
            width = width.max(column);
        }
        placed.push(slots);
    }
    (placed, width)
}

/// Which cell (by index into the flattened cell list) each line belongs to. A line inside the
/// table that no cell box covers goes to the nearest cell centre.
pub fn assign_lines(cells: &[PageBox], lines: &[&OcrLine]) -> Vec<Option<usize>> {
    lines
        .iter()
        .map(|line| {
            let mut best: Option<(usize, f32)> = None;
            for (index, cell) in cells.iter().enumerate() {
                let fraction = line.page_box.inside_fraction(cell);
                if fraction > 0.0 && best.is_none_or(|(_, f)| fraction > f) {
                    best = Some((index, fraction));
                }
            }
            if let Some((index, _)) = best {
                return Some(index);
            }
            let (lx, ly) = line.page_box.center();
            cells
                .iter()
                .enumerate()
                .map(|(index, cell)| {
                    let (cx, cy) = cell.center();
                    (index, (cx - lx).powi(2) + (cy - ly).powi(2))
                })
                .min_by(|a, b| a.1.total_cmp(&b.1))
                .map(|(index, _)| index)
        })
        .collect()
}

/// The grid of cell text: every row padded to the grid's width, blanks where a span reaches.
/// None when there is no grid to speak of — fewer than two rows or two columns.
pub fn grid_text(rows: &[Vec<Cell>], lines: &[&OcrLine]) -> Option<Vec<Vec<String>>> {
    let (placed, width) = place(rows);
    let height = placed
        .iter()
        .flatten()
        .map(|(r, _)| r + 1)
        .max()
        .unwrap_or(0);
    if height < 2 || width < 2 {
        return None;
    }
    let cells: Vec<PageBox> = rows.iter().flatten().map(|cell| cell.page_box).collect();
    let mut texts: Vec<Vec<&OcrLine>> = vec![Vec::new(); cells.len()];
    for (line, owner) in lines.iter().zip(assign_lines(&cells, lines)) {
        if let Some(index) = owner {
            texts[index].push(line);
        }
    }
    let mut grid = vec![vec![String::new(); width]; height];
    for (index, (r, c)) in placed.iter().flatten().enumerate() {
        let mut owned = texts[index].clone();
        owned.sort_by(|a, b| {
            let (ya, yb) = (a.page_box.y0, b.page_box.y0);
            let tolerance = 0.5 * (a.page_box.y1 - ya).min(b.page_box.y1 - yb);
            if (ya - yb).abs() < tolerance.max(4.0) {
                a.page_box.x0.total_cmp(&b.page_box.x0)
            } else {
                ya.total_cmp(&yb)
            }
        });
        let words: Vec<&str> = owned.iter().map(|line| line.text.trim()).collect();
        grid[*r][*c] = words.join(" ");
    }
    Some(grid)
}

#[cfg(test)]
#[path = "ocr_table_grid_tests.rs"]
mod tests;
