import type { ClassificationRule } from './types';

/**
 * Ordered classification rules — the first match wins, so more specific
 * patterns (e.g. EMI/loan debits) must come before generic payment-rail
 * patterns (e.g. UPI/NEFT) that would otherwise also match the same line.
 * Edit this list to add/reorder categories; parsing logic is untouched.
 */
export const classificationRules: ClassificationRule[] = [
  { category: 'EMI', pattern: /\bEMI\b|LOAN\s*(EMI|INSTAL?LMENT)|NACH.*EMI/i },
  { category: 'Salary', pattern: /\bSAL(ARY)?\b.*CREDIT|SALARY/i },
  { category: 'Credit Card Payment', pattern: /CREDIT\s*CARD|CC\s*(BILL|PAYMENT)/i },
  { category: 'ATM Withdrawal', pattern: /\bATM\b/i },
  { category: 'Card Spend (POS)', pattern: /\bPOS\b|CARD\s*PURCHASE|SWIPE/i },
  { category: 'Interest', pattern: /\bINT(EREST)?\b/i },
  { category: 'Bank Charges', pattern: /CHARGES?|\bFEE\b|\bGST\b|PENALTY/i },
  { category: 'UPI', pattern: /\bUPI\b/i },
  { category: 'IMPS', pattern: /\bIMPS\b/i },
  { category: 'NEFT', pattern: /\bNEFT\b/i },
  { category: 'RTGS', pattern: /\bRTGS\b/i },
  { category: 'Cheque', pattern: /\bCHEQUE\b|\bCHQ\b/i },
];
