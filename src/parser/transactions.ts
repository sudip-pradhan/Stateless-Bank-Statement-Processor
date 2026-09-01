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

    for (const item of row.items) {
      const text = item.str.trim();
      if (!text) continue;
      const kind = columnForX(bands, item.x);
      const amount = parseAmount(text);

      switch (kind) {
        case 'debit':
          if (amount !== null) debit = Math.abs(amount);
          break;
        case 'credit':
          if (amount !== null) credit = Math.abs(amount);
          break;
        case 'balance':
          if (amount !== null) balance = amount;
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
