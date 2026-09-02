import { detectHeaderRow, deriveColumnBands } from './columns';
import { buildNarrationTransactions } from './narrationRows';
import { extractPdfPages } from './pdf';
import { groupTextIntoRows } from './rows';
import { buildTransactions } from './transactions';
import type { Transaction } from './types';

export type { Transaction, TransactionType } from './types';

export interface ParseDiagnostics {
  /** False when no page yielded any positioned text — i.e. a scanned/image-only PDF. */
  hasTextLayer: boolean;
  pageCount: number;
}

export interface ParseResult {
  transactions: Transaction[];
  diagnostics: ParseDiagnostics;
}

/**
 * Parses a bank statement PDF into transaction rows plus diagnostics about
 * the extraction itself, so callers can distinguish "scanned PDF with no
 * text layer" from "text layer present but no transaction table matched".
 * Each page is scanned independently for its own header row so multi-file
 * batches with differing column layouts still work.
 */
export async function parseStatementPdfDetailed(file: ArrayBuffer): Promise<ParseResult> {
  const pages = await extractPdfPages(file);
  const transactions: Transaction[] = [];
  const hasTextLayer = pages.some((pageItems) => pageItems.length > 0);

  for (const pageItems of pages) {
    if (pageItems.length === 0) continue;

    const rows = groupTextIntoRows(pageItems);
    const header = detectHeaderRow(rows);
    if (!header) {
      // No labeled header on this page — some statements (e.g. multi-page
      // exports split per-transaction) only carry the header once, on a
      // summary page, and lose it on subsequent pages. Fall back to
      // detecting the value-date/txn-date/amount row shape directly.
      transactions.push(...buildNarrationTransactions(rows));
      continue;
    }

    const bands = deriveColumnBands(header.row);
    const bodyRows = rows.slice(header.rowIndex + 1);
    transactions.push(...buildTransactions(bodyRows, bands));
  }

  return { transactions, diagnostics: { hasTextLayer, pageCount: pages.length } };
}

/** Convenience wrapper over {@link parseStatementPdfDetailed} for callers that only need the rows. */
export async function parseStatementPdf(file: ArrayBuffer): Promise<Transaction[]> {
  return (await parseStatementPdfDetailed(file)).transactions;
}
