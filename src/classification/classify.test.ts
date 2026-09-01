import { describe, expect, it } from 'vitest';
import type { Transaction } from '../parser/types';
import { classifyTransaction, classifyTransactions } from './classify';

function tx(description: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    date: '2026-01-01',
    description,
    amount: 100,
    type: 'debit',
    ...overrides,
  };
}

describe('classifyTransaction', () => {
  it('tags an EMI payment even though it also mentions NACH/UPI-style routing', () => {
    expect(classifyTransaction(tx('NACH EMI LOAN AUTO DEBIT XYZ')).category).toBe('EMI');
    expect(classifyTransaction(tx('UPI/EMI/LOAN123/HDFC')).category).toBe('EMI');
  });

  it('prefers EMI over the generic UPI rule ordered after it', () => {
    const result = classifyTransaction(tx('UPI-EMI-PAYMENT-TO-LENDER'));
    expect(result.category).toBe('EMI');
  });

  it('falls back to UPI when no more specific rule matches', () => {
    expect(classifyTransaction(tx('UPI/123456/JOHN DOE/PAYMENT')).category).toBe('UPI');
  });

  it('falls back to NEFT when no more specific rule matches', () => {
    expect(classifyTransaction(tx('NEFT CR-HDFC0001234-ACME CORP')).category).toBe('NEFT');
  });

  it('tags salary credits', () => {
    expect(classifyTransaction(tx('SALARY CREDIT MAR2026', { type: 'credit' })).category).toBe(
      'Salary',
    );
  });

  it('tags ATM withdrawals', () => {
    expect(classifyTransaction(tx('ATM WDL CASH 123456')).category).toBe('ATM Withdrawal');
  });

  it('falls back to Uncategorized when nothing matches', () => {
    expect(classifyTransaction(tx('MISC ENTRY XYZ')).category).toBe('Uncategorized');
  });

  it('classifies a batch preserving order and original fields', () => {
    const input = [tx('UPI/1/A'), tx('SALARY CREDIT', { type: 'credit' })];
    const result = classifyTransactions(input);
    expect(result.map((r) => r.category)).toEqual(['UPI', 'Salary']);
    expect(result[0].date).toBe(input[0].date);
  });
});
