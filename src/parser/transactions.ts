import { parseAmount } from './amount';
import { columnForX } from './columns';
import { extractLeadingDate } from './dateToken';
import type { ColumnBand, TextRow, Transaction } from './types';

/**
 * Builds transaction rows from the statement's body rows (i.e. the rows
 * after the detected header). A leading date token starts a new
 * transaction; rows without a leading date are continuation lines and get
 * appended to the previous transaction's description.
 */
export function buildTransactions(bodyRows: TextRow[], bands: ColumnBand[]): Transaction[] {
  const transactions: Transaction[] = [];

  for (const row of bodyRows) {
    const words = row.items.map((i) => i.str.trim()).filter(Boolean);
    if (words.length === 0) continue;

    const leading = extractLeadingDate(words);

    if (!leading) {
      if (transactions.length > 0) {
        const text = words.join(' ').trim();
        if (text) {
          const prev = transactions[transactions.length - 1];
          prev.description = `${prev.description} ${text}`.trim();
        }
      }
      continue;
    }

    const descriptionParts: string[] = [];
    let debit: number | null = null;
    let credit: number | null = null;
    let balance: number | null = null;

    // Group items by column first, rather than parsing each item in isolation.
    // A single cell's value is often split across multiple positioned text
    // runs by the PDF (e.g. "60.25" and "DR" rendered with a gap between
    // them land as two separate items); parsing them independently would
    // read "60.25" as a bare positive number and silently drop the lone
    // "DR" marker instead of combining them into "60.25 DR".
    const cellText: Partial<Record<'debit' | 'credit' | 'amount' | 'balance', string[]>> = {};

    for (const item of row.items) {
      const text = item.str.trim();
      if (!text) continue;
      const kind = columnForX(bands, item.x);

      switch (kind) {
        case 'debit':
        case 'credit':
        case 'amount':
        case 'balance':
          (cellText[kind] ??= []).push(text);
          break;
        case 'date':
          break;
        case 'description':
        default:
          if (text !== leading.date && !leading.date.includes(text)) {
            descriptionParts.push(text);
          }
          break;
      }
    }

    const debitAmount = cellText.debit ? parseAmount(cellText.debit.join(' ')) : null;
    if (debitAmount !== null) debit = Math.abs(debitAmount);

    const creditAmount = cellText.credit ? parseAmount(cellText.credit.join(' ')) : null;
    if (creditAmount !== null) credit = Math.abs(creditAmount);

    if (cellText.amount) {
      // Single combined column: sign (or a CR/DR suffix, handled in parseAmount)
      // distinguishes a credit from a debit.
      const amount = parseAmount(cellText.amount.join(' '));
      if (amount !== null) {
        if (amount < 0) debit = Math.abs(amount);
        else credit = amount;
      }
    }

    if (cellText.balance) {
      const balanceAmount = parseAmount(cellText.balance.join(' '));
      if (balanceAmount !== null) balance = balanceAmount;
    }

    let description = descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
    if (!description) {
      description = leading.rest.join(' ').trim();
    }

    const type: Transaction['type'] = credit !== null && debit === null ? 'credit' : 'debit';
    const amount = type === 'credit' ? (credit as number) : (debit ?? 0);

    const tx: Transaction = {
      date: leading.date,
      description,
      amount,
      type,
    };
    if (balance !== null) tx.balance = balance;

    transactions.push(tx);
  }

  return transactions;
}
