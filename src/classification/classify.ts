import type { Transaction } from '../parser/types';
import type { ClassificationRule, ClassifiedTransaction } from './types';
import { UNCATEGORIZED } from './types';
import { classificationRules } from './rules';

/**
 * Tags a single transaction by testing rules in order and taking the first
 * match. Matches against the description only.
 */
export function classifyTransaction(
  transaction: Transaction,
  rules: ClassificationRule[] = classificationRules,
): ClassifiedTransaction {
  for (const rule of rules) {
    if (rule.pattern.test(transaction.description)) {
      return { ...transaction, category: rule.category };
    }
  }
  return { ...transaction, category: UNCATEGORIZED };
}

export function classifyTransactions(
  transactions: Transaction[],
  rules: ClassificationRule[] = classificationRules,
): ClassifiedTransaction[] {
  return transactions.map((t) => classifyTransaction(t, rules));
}
