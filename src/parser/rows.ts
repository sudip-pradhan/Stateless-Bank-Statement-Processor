import type { PositionedText, TextRow } from './types';

/**
 * Groups positioned text items into rows by y-position. pdf.js reports y in
 * PDF user space (origin bottom-left), so rows come out sorted top-to-bottom
 * by sorting y descending. Items within a row are sorted left-to-right.
 */
export function groupTextIntoRows(items: PositionedText[], yTolerance = 2): TextRow[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: TextRow[] = [];
  for (const item of sorted) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= yTolerance);
    if (row) {
      row.items.push(item);
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

/** Joins a row's items into a single whitespace-normalized line of text. */
export function rowText(row: TextRow): string {
  return row.items
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
