import { describe, expect, it } from 'vitest';
import { detectHeaderRow, deriveColumnBands } from './columns';
import { groupTextIntoRows } from './rows';
import { buildTransactions } from './transactions';
import type { PositionedText } from './types';

/** Builds a synthetic positioned-text item, mimicking pdf.js's bottom-left-origin coordinates. */
function item(str: string, x: number, y: number): PositionedText {
  return { str, x, y, width: str.length * 5, height: 10 };
}

// A synthetic one-page statement: header row at y=100, three transaction
// rows below it (descending y, as pdf.js emits top-to-bottom pages), one
// of which has a wrapped continuation line with no leading date.
const PAGE_ITEMS: PositionedText[] = [
  item('Date', 50, 100),
  item('Description', 100, 100),
  item('Debit', 300, 100),
  item('Credit', 360, 100),
  item('Balance', 420, 100),

  item('01/02/2024', 50, 80),
  item('Coffee Shop', 100, 80),
  item('4.50', 300, 80),
  item('995.50', 420, 80),

  item('01/03/2024', 50, 60),
  item('Payroll Deposit', 100, 60),
  item('ACME Corp', 100, 50), // continuation line, no leading date
  item('2000.00', 360, 60),
  item('2995.50', 420, 60),

  item('01/04/2024', 50, 30),
  item('Grocery Store', 100, 30),
  item('60.25', 300, 30),
  item('2935.25', 420, 30),
];

describe('groupTextIntoRows', () => {
  it('groups items sharing a y-position and orders rows top-to-bottom', () => {
    const rows = groupTextIntoRows(PAGE_ITEMS);
    expect(rows).toHaveLength(5); // header + 3 tx rows + 1 continuation row (all distinct y-positions)
    expect(rows[0].items.map((i) => i.str)).toEqual([
      'Date',
      'Description',
      'Debit',
      'Credit',
      'Balance',
    ]);
    // rows are sorted descending y (top of page first)
    expect(rows[0].y).toBeGreaterThan(rows[1].y);
  });
});

describe('detectHeaderRow + deriveColumnBands', () => {
  it('finds the header row and derives x-bands from it', () => {
    const rows = groupTextIntoRows(PAGE_ITEMS);
    const header = detectHeaderRow(rows);
    expect(header).not.toBeNull();
    expect(header!.row.items.map((i) => i.str)).toContain('Balance');

    const bands = deriveColumnBands(header!.row);
    const kinds = bands.map((b) => b.kind);
    expect(kinds).toEqual(['date', 'description', 'debit', 'credit', 'balance']);
    expect(bands[bands.length - 1].xEnd).toBe(Infinity);
  });
});

describe('buildTransactions', () => {
  it('starts a new transaction on a leading date and appends continuation lines to the prior description', () => {
    const rows = groupTextIntoRows(PAGE_ITEMS);
    const header = detectHeaderRow(rows)!;
    const bands = deriveColumnBands(header.row);
    const bodyRows = rows.slice(header.rowIndex + 1);

    const transactions = buildTransactions(bodyRows, bands);

    expect(transactions).toHaveLength(3);

    expect(transactions[0]).toMatchObject({
      date: '01/02/2024',
      description: 'Coffee Shop',
      amount: 4.5,
      type: 'debit',
      balance: 995.5,
    });

    // Continuation line "ACME Corp" (no leading date) merges into transaction 2's description.
    expect(transactions[1]).toMatchObject({
      date: '01/03/2024',
      description: 'Payroll Deposit ACME Corp',
      amount: 2000,
      type: 'credit',
      balance: 2995.5,
    });

    expect(transactions[2]).toMatchObject({
      date: '01/04/2024',
      description: 'Grocery Store',
      amount: 60.25,
      type: 'debit',
      balance: 2935.25,
    });
  });

  it('returns an empty array when there are no body rows', () => {
    expect(buildTransactions([], [])).toEqual([]);
  });
});
