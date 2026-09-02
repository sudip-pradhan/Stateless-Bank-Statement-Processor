import { describe, expect, it } from 'vitest';
import { detectHeaderRow, deriveColumnBands } from './columns';
import { buildNarrationTransactions } from './narrationRows';
import { groupTextIntoRows } from './rows';
import { buildTransactions } from './transactions';
import type { PositionedText, TextRow } from './types';

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

// A second statement layout with a single "Amount" column (signed value, plus
// one row using a trailing CR/DR marker instead of a sign) rather than
// separate Debit/Credit columns.
const AMOUNT_COLUMN_PAGE_ITEMS: PositionedText[] = [
  item('Date', 50, 100),
  item('Description', 100, 100),
  item('Amount', 300, 100),
  item('Balance', 420, 100),

  item('01/02/2024', 50, 80),
  item('Coffee Shop', 100, 80),
  item('-4.50', 300, 80),
  item('995.50', 420, 80),

  item('01/03/2024', 50, 60),
  item('Payroll Deposit', 100, 60),
  item('2000.00', 300, 60),
  item('2995.50', 420, 60),

  item('01/04/2024', 50, 30),
  item('Grocery Store', 100, 30),
  item('60.25 DR', 300, 30),
  item('2935.25', 420, 30),
];

describe('buildTransactions with a single Amount column', () => {
  it('derives debit/credit from the amount sign or a CR/DR suffix', () => {
    const rows = groupTextIntoRows(AMOUNT_COLUMN_PAGE_ITEMS);
    const header = detectHeaderRow(rows)!;
    const bands = deriveColumnBands(header.row);
    const bodyRows = rows.slice(header.rowIndex + 1);

    const transactions = buildTransactions(bodyRows, bands);

    expect(transactions).toHaveLength(3);
    expect(transactions[0]).toMatchObject({ description: 'Coffee Shop', amount: 4.5, type: 'debit' });
    expect(transactions[1]).toMatchObject({ description: 'Payroll Deposit', amount: 2000, type: 'credit' });
    expect(transactions[2]).toMatchObject({ description: 'Grocery Store', amount: 60.25, type: 'debit' });
  });

  // Real PDFs render the value and its CR/DR marker as separate glyph runs
  // whenever there's a rendering gap between them, so pdf.js reports them as
  // two distinct positioned-text items in the same column (rather than one
  // pre-joined "60.25 DR" string, as in the fixture above).
  it('combines a value and its CR/DR marker when the PDF reports them as separate text items', () => {
    const items: PositionedText[] = [
      item('Date', 50, 100),
      item('Description', 100, 100),
      item('Amount', 300, 100),
      item('Balance', 420, 100),

      item('01/02/2024', 50, 80),
      item('Coffee Shop', 100, 80),
      item('60.25', 300, 80),
      item('DR', 330, 80), // still inside the amount column band, separate item
      item('995.50', 420, 80),

      item('01/03/2024', 50, 60),
      item('Payroll Deposit', 100, 60),
      item('2,000.00', 300, 60),
      item('CR', 335, 60),
      item('2995.50', 420, 60),
    ];

    const rows = groupTextIntoRows(items);
    const header = detectHeaderRow(rows)!;
    const bands = deriveColumnBands(header.row);
    const bodyRows = rows.slice(header.rowIndex + 1);

    const transactions = buildTransactions(bodyRows, bands);

    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({ description: 'Coffee Shop', amount: 60.25, type: 'debit' });
    expect(transactions[1]).toMatchObject({ description: 'Payroll Deposit', amount: 2000, type: 'credit' });
  });
});

// Some real-world exports (seen from SBI account statements) have no
// per-page header at all: the header only appears once on a summary page
// and is lost on the per-transaction pages produced when the statement is
// split/merged. Each transaction instead renders as a label line (e.g.
// "WDL TFR") followed by a data line with two leading dates and trailing
// ref/withdrawal/deposit/balance fields, then further narration lines.
function textRow(...tokens: string[]): TextRow {
  return { y: 0, items: tokens.map((str) => ({ str, x: 0, y: 0, width: 0, height: 0 })) };
}

describe('buildNarrationTransactions (headerless value-date/txn-date row layout)', () => {
  it('parses withdrawal and deposit rows, stitching narration from surrounding lines', () => {
    const rows: TextRow[] = [
      textRow('WDL TFR'),
      textRow('', '02/01/2025', ' ', '02/01/2025', ' ', '-', ' ', '30,000.00', ' ', '-', ' ', '40,173.78'),
      textRow('UPI/DR/575004230157/SRI DURG/HDFC/9701622429/Paym'),
      textRow('0097694162092 AT 03478'),
      textRow('SANGAREDDY'),
      textRow('DEP TFR'),
      textRow('03/01/2025', ' ', '03/01/2025', ' ', '-', ' ', '-', ' ', '2,500.00', ' ', '42,472.78'),
      textRow('UPI/CR/974502117974/LYAGALA /HDFC/lnraju570@/Paym'),
      textRow('SANGAREDDY'),
      textRow('Page no.', '', '2'),
    ];

    const transactions = buildNarrationTransactions(rows);

    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      date: '02/01/2025',
      amount: 30000,
      type: 'debit',
      balance: 40173.78,
    });
    expect(transactions[0].description).toContain('WDL TFR');
    expect(transactions[0].description).toContain('SRI DURG');

    expect(transactions[1]).toMatchObject({
      date: '03/01/2025',
      amount: 2500,
      type: 'credit',
      balance: 42472.78,
    });
    expect(transactions[1].description).not.toContain('Page no.');
  });

  it('returns an empty array when no row has the two-leading-dates shape', () => {
    expect(buildNarrationTransactions([textRow('Account Summary'), textRow('Branch Code', ':', '3478')])).toEqual(
      [],
    );
  });
});
