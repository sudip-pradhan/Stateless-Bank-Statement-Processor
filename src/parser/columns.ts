import type { ColumnBand, ColumnKind, TextRow } from './types';

const HEADER_ALIASES: Record<Exclude<ColumnKind, 'description'>, RegExp> = {
  date: /^date$/i,
  debit: /^(debit|withdrawal|withdrawals|money out|payments?\/?debits?)$/i,
  credit: /^(credit|deposit|deposits|money in|receipts?\/?credits?)$/i,
  balance: /^(balance|running balance|ledger balance)$/i,
};

const DESCRIPTION_HEADER = /^(description|details|transaction|narrative|particulars)$/i;

/**
 * Scans candidate rows for a header row containing at least two of the
 * expected column labels (Date/Description/Debit/Credit/Balance) and, if
 * found, returns the row's raw index and the matched header cells.
 */
export function detectHeaderRow(rows: TextRow[]): { rowIndex: number; row: TextRow } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let matches = 0;
    for (const item of row.items) {
      const text = item.str.trim();
      if (!text) continue;
      if (DESCRIPTION_HEADER.test(text)) {
        matches++;
        continue;
      }
      for (const re of Object.values(HEADER_ALIASES)) {
        if (re.test(text)) {
          matches++;
          break;
        }
      }
    }
    if (matches >= 2) {
      return { rowIndex: i, row };
    }
  }
  return null;
}

/**
 * Derives column x-bands from a detected header row. Each header cell's x
 * position becomes the left edge of its column; the right edge is the next
 * header cell's x position (or Infinity for the rightmost column).
 */
export function deriveColumnBands(headerRow: TextRow): ColumnBand[] {
  const labeled: { kind: ColumnKind; x: number }[] = [];

  for (const item of headerRow.items) {
    const text = item.str.trim();
    if (!text) continue;

    if (DESCRIPTION_HEADER.test(text)) {
      labeled.push({ kind: 'description', x: item.x });
      continue;
    }
    for (const [kind, re] of Object.entries(HEADER_ALIASES) as [
      Exclude<ColumnKind, 'description'>,
      RegExp,
    ][]) {
      if (re.test(text)) {
        labeled.push({ kind, x: item.x });
        break;
      }
    }
  }

  labeled.sort((a, b) => a.x - b.x);

  const bands: ColumnBand[] = labeled.map((col, idx) => ({
    kind: col.kind,
    xStart: col.x,
    xEnd: idx + 1 < labeled.length ? labeled[idx + 1].x : Infinity,
  }));

  // Everything left of the first recognized column (typically the date,
  // when no explicit "Date" header exists) still belongs to that column.
  if (bands.length > 0) {
    bands[0] = { ...bands[0], xStart: -Infinity };
  }

  return bands;
}

export function columnForX(bands: ColumnBand[], x: number): ColumnKind | null {
  for (const band of bands) {
    if (x >= band.xStart && x < band.xEnd) return band.kind;
  }
  return null;
}
