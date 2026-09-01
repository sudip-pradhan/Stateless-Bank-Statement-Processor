import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { ClassifiedTransaction } from '../classification/types';
import { buildWorkbook } from './xlsx';

const transactions: ClassifiedTransaction[] = [
  { date: '2026-01-01', description: 'SALARY CREDIT', amount: 50000, type: 'credit', category: 'Salary' },
  { date: '2026-01-02', description: 'UPI/1/A', amount: 200, type: 'debit', category: 'UPI' },
  { date: '2026-01-03', description: 'NACH EMI LOAN', amount: 5000, type: 'debit', category: 'EMI' },
];

describe('buildWorkbook', () => {
  it('creates a Credits sheet and a Debits sheet', () => {
    const wb = buildWorkbook(transactions);
    expect(wb.SheetNames).toEqual(['Credits', 'Debits']);
  });

  it('puts a header row, one row per transaction, and a totals row on each sheet', () => {
    const wb = buildWorkbook(transactions);
    const credits = XLSX.utils.sheet_to_json(wb.Sheets.Credits, { header: 1 }) as unknown[][];
    const debits = XLSX.utils.sheet_to_json(wb.Sheets.Debits, { header: 1 }) as unknown[][];

    expect(credits[0]).toEqual(['Date', 'Description', 'Category', 'Amount', 'Balance']);
    expect(credits).toHaveLength(1 + 1 + 1); // header + 1 credit tx + totals
    expect(credits[2][3]).toBe(50000); // totals row amount

    expect(debits[0]).toEqual(['Date', 'Description', 'Category', 'Amount', 'Balance']);
    expect(debits).toHaveLength(1 + 2 + 1); // header + 2 debit tx + totals
    expect(debits[3][3]).toBe(5200); // totals row amount = 200 + 5000
  });

  it('produces an empty-but-valid sheet (header + zero total) when a side has no transactions', () => {
    const wb = buildWorkbook([]);
    const credits = XLSX.utils.sheet_to_json(wb.Sheets.Credits, { header: 1 }) as unknown[][];
    expect(credits).toEqual([
      ['Date', 'Description', 'Category', 'Amount', 'Balance'],
      ['', '', 'Total', 0, ''],
    ]);
  });
});
