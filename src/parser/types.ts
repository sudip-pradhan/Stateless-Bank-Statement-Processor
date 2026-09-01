/** A single positioned text run as read from a PDF page (pdf.js TextItem, reduced). */
export interface PositionedText {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ColumnKind = 'date' | 'description' | 'debit' | 'credit' | 'balance';

export interface ColumnBand {
  kind: ColumnKind;
  /** Inclusive left edge, in PDF user-space units. */
  xStart: number;
  /** Exclusive right edge; Infinity for the last column on the line. */
  xEnd: number;
}

export type TransactionType = 'debit' | 'credit';

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  /** Running balance parsed from the statement, if a Balance column was found. */
  balance?: number;
}

/** A row of text items grouped by shared y-position, sorted left-to-right. */
export interface TextRow {
  y: number;
  items: PositionedText[];
}
