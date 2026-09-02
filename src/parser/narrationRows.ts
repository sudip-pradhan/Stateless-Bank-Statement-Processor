import { parseAmount } from './amount';
import { isDateToken } from './dateToken';
import type { TextRow, Transaction } from './types';

const PAGE_FOOTER = /^page\s*no\.?$/i;

function rowTokens(row: TextRow): string[] {
  return row.items.map((i) => i.str.trim()).filter(Boolean);
}

/**
 * Some statements (seen from SBI exports) render each transaction as a
 * standalone data row with two leading dates (value date, transaction date)
 * and no per-page header row at all — the header only appears once, on a
 * summary page, and gets lost when the PDF is split/merged. This detects
 * that row shape directly: two consecutive date tokens followed by at least
 * three trailing amount-or-"-" tokens (ref/cheque no, withdrawal, deposit,
 * closing balance — the ref/cheque no. is sometimes absent, sometimes split
 * across extra tokens, so only the last three are load-bearing).
 */
function isAmountRow(tokens: string[]): boolean {
  return tokens.length >= 5 && isDateToken(tokens[0]) && isDateToken(tokens[1]);
}

/**
 * Builds transactions from a page of headerless rows following the
 * value-date/txn-date/ref/withdrawal/deposit/balance shape described above.
 * Narration (description) is stitched from the label line immediately
 * before the amount row and any continuation lines up to the next
 * transaction's label line, skipping "Page no. N" footers.
 */
export function buildNarrationTransactions(rows: TextRow[]): Transaction[] {
  const amountRowIndices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (isAmountRow(rowTokens(rows[i]))) amountRowIndices.push(i);
  }
  if (amountRowIndices.length === 0) return [];

  const transactions: Transaction[] = [];

  for (let k = 0; k < amountRowIndices.length; k++) {
    const rowIndex = amountRowIndices[k];
    const tokens = rowTokens(rows[rowIndex]);

    const date = tokens[0];
    const [withdrawal, deposit, balanceText] = tokens.slice(-3);

    const withdrawalAmount = parseAmount(withdrawal);
    const depositAmount = parseAmount(deposit);
    const balanceAmount = parseAmount(balanceText);

    // Neither side parsed as a number: not a real transaction row (e.g. a
    // stray line that coincidentally starts with two date-like tokens).
    if (withdrawalAmount === null && depositAmount === null) continue;

    const type: Transaction['type'] = withdrawalAmount !== null ? 'debit' : 'credit';
    const amount = withdrawalAmount !== null ? withdrawalAmount : (depositAmount as number);

    const labelIndex = rowIndex - 1;
    const nextLabelIndex = k + 1 < amountRowIndices.length ? amountRowIndices[k + 1] - 1 : rows.length;

    const descriptionLines: string[] = [];
    if (labelIndex >= 0) descriptionLines.push(...rowTokens(rows[labelIndex]));
    for (let r = rowIndex + 1; r < nextLabelIndex; r++) {
      const rTokens = rowTokens(rows[r]);
      if (rTokens.length === 0) continue;
      if (PAGE_FOOTER.test(rTokens[0])) continue;
      descriptionLines.push(...rTokens);
    }

    const tx: Transaction = {
      date,
      description: descriptionLines.join(' ').replace(/\s+/g, ' ').trim(),
      amount: Math.abs(amount),
      type,
    };
    if (balanceAmount !== null) tx.balance = balanceAmount;

    transactions.push(tx);
  }

  return transactions;
}
