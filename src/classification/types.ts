import type { Transaction } from '../parser/types';

export interface ClassificationRule {
  category: string;
  pattern: RegExp;
}

export interface ClassifiedTransaction extends Transaction {
  category: string;
}

export const UNCATEGORIZED = 'Uncategorized';
