// Matches common bank-statement date formats: 01/02/2024, 1-2-24, 2024-01-02,
// "Jan 1 2024", "1 Jan 2024", "January 1, 2024".
const NUMERIC_DATE = /^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$/;
const MONTH_NAMES =
  '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
const MONTH_FIRST_DATE = new RegExp(`^${MONTH_NAMES}\\.?,?\\s+\\d{1,2}(st|nd|rd|th)?,?(\\s+\\d{2,4})?$`, 'i');
const DAY_FIRST_DATE = new RegExp(`^\\d{1,2}(st|nd|rd|th)?[\\s-]+${MONTH_NAMES}\\.?,?(\\s+\\d{2,4})?$`, 'i');

/** True if `text` on its own reads as a transaction date (possibly split across the leading cell(s) of a row). */
export function isDateToken(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return NUMERIC_DATE.test(t) || MONTH_FIRST_DATE.test(t) || DAY_FIRST_DATE.test(t);
}

/**
 * Consumes a leading date from the start of a row's joined text, matching
 * against 1-3 leading words (dates can span multiple text items, e.g. "Jan" "1" "2024").
 * Returns the matched date string and the remainder, or null if the row doesn't start with a date.
 */
export function extractLeadingDate(words: string[]): { date: string; rest: string[] } | null {
  for (const span of [3, 2, 1]) {
    if (words.length < span) continue;
    const candidate = words.slice(0, span).join(' ');
    if (isDateToken(candidate)) {
      return { date: candidate, rest: words.slice(span) };
    }
  }
  return null;
}
