/** Parses a currency-formatted cell like "$1,234.56", "(1,234.56)", "1234.56-" into a signed number, or null if not numeric. */
export function parseAmount(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  const negative = /^\(.*\)$/.test(t) || /-$/.test(t) || /^-/.test(t);
  const cleaned = t.replace(/[()$,\s-]/g, '');
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const value = parseFloat(cleaned);
  return negative ? -value : value;
}
