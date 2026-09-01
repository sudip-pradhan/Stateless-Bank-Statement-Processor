import * as XLSX from 'xlsx';
import type { ClassifiedTransaction } from '../classification/types';

const HEADER = ['Date', 'Description', 'Category', 'Amount', 'Balance'] as const;

function toRows(transactions: ClassifiedTransaction[]): (string | number)[][] {
  return transactions.map((t) => [
    t.date,
    t.description,
    t.category,
    t.amount,
    t.balance ?? '',
  ]);
}

function buildSheet(transactions: ClassifiedTransaction[]): XLSX.WorkSheet {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  const aoa: (string | number)[][] = [
    [...HEADER],
    ...toRows(transactions),
    ['', '', 'Total', total, ''],
  ];
  return XLSX.utils.aoa_to_sheet(aoa);
}

/**
 * Builds an in-memory workbook with two sheets — Credits and Debits — each
 * carrying a header row and a trailing totals row.
 */
export function buildWorkbook(transactions: ClassifiedTransaction[]): XLSX.WorkBook {
  const credits = transactions.filter((t) => t.type === 'credit');
  const debits = transactions.filter((t) => t.type === 'debit');

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSheet(credits), 'Credits');
  XLSX.utils.book_append_sheet(workbook, buildSheet(debits), 'Debits');
  return workbook;
}

/**
 * Triggers a local download of an already-serialized xlsx buffer via a
 * Blob + object URL. No data ever leaves the browser.
 */
export function downloadWorkbookBuffer(buffer: ArrayBuffer, filename = 'statement.xlsx'): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Serializes the workbook and triggers a local download. See {@link downloadWorkbookBuffer}. */
export function downloadWorkbook(workbook: XLSX.WorkBook, filename = 'statement.xlsx'): void {
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadWorkbookBuffer(buffer, filename);
}

export function exportTransactionsToXlsx(
  transactions: ClassifiedTransaction[],
  filename = 'statement.xlsx',
): void {
  downloadWorkbook(buildWorkbook(transactions), filename);
}
