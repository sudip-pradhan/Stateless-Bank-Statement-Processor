/** Parses a currency-formatted cell like "$1,234.56", "(1,234.56)", "1234.56-", "50.00 DR" into a signed number, or null if not numeric. */
export function parseAmount(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  // Some single-"Amount"-column statements suffix a CR/DR marker instead of (or
  // in addition to) a sign, e.g. "1,234.56 CR" / "50.00 DR" / "50.00 (Dr.)".
  const suffixMatch = /^(.*\S)\s*\(?(CR|DR)\)?\.?$/i.exec(t);
  const core = suffixMatch ? suffixMatch[1] : t;
  const suffixSign = suffixMatch ? suffixMatch[2].toUpperCase() : null;

  const negative = /^\(.*\)$/.test(core) || /-$/.test(core) || /^-/.test(core) || suffixSign === 'DR';
  const cleaned = core.replace(/[()$,\s-]/g, '');
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const value = parseFloat(cleaned);
  return negative ? -value : value;
}
