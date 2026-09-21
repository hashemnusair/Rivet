/**
 * Shared text infrastructure for review-style Jev features (support cases,
 * public-profile drafts). A passage is a bounded, addressable slice of text
 * that the application cut itself: the model only ever chooses among passage
 * ids the request supplied, and every id maps back to the exact substring it
 * came from, so a finding can be highlighted without trusting model output.
 *
 * Pure: no Convex, no DOM. Both adapters and the client import it.
 */

export const PASSAGE_MAX_LENGTH = 400;
export const PASSAGE_MIN_LENGTH = 3;

const ARABIC_DIACRITICS = /[ً-ْٰـ]/g;
const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/** Arabic-Indic and extended digits become ASCII so numbers compare across languages. */
export function asciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_INDIC_DIGITS[digit] ?? digit);
}

/** Lower-case, digit-normalised, diacritic-free, letter-and-number only. */
export function normalizeText(value: string): string {
  return asciiDigits(value)
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "has", "had", "you", "your", "our", "are", "was", "were", "will", "can", "could", "would", "please", "thanks", "thank", "hello", "still", "also", "just", "about", "there", "here", "they", "them", "then", "than", "into", "onto", "over", "when", "what", "which", "who", "how", "why", "not", "but", "any", "all", "its", "it's", "we're", "been", "being", "does", "did", "done", "get", "got", "let", "know", "need", "want", "like",
  "على", "في", "من", "الى", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "تلك", "التي", "الذي", "هل", "لو", "او", "أو", "ثم", "لكن", "كان", "كانت", "نحن", "انتم", "أنتم", "لدينا", "لديكم", "ايضا", "أيضا", "فقط", "بعد", "قبل", "الان", "الآن", "شكرا", "سمحتم", "فضلكم", "الرجاء", "نرجو",
]);

/** Distinct content tokens (length ≥ 3, no stopwords), digits normalised. */
export function contentTokens(value: string): string[] {
  return [...new Set(normalizeText(value).split(/[\s-]+/).filter((token) => token.length >= 3 && !STOPWORDS.has(token)))];
}

/** Equal, or one is a prefix of the other from four characters on ("invoice"/"invoices", "فاتورة"/"فاتورتنا"). */
export function stemMatch(left: string, right: string): boolean {
  return left === right || (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left)));
}

/** How many content tokens of `left` also appear (stem-wise) in `right`. */
export function sharedTokenCount(left: string, right: string): number {
  const rightTokens = contentTokens(right);
  return contentTokens(left).filter((token) => rightTokens.some((candidate) => stemMatch(candidate, token))).length;
}

export function hasArabic(value: string): boolean {
  return /[؀-ۿ]/.test(value);
}

/** Every number in the text, as canonical strings ("1,500" and "1500" agree; "3.0" stays "3.0"). */
export function numbersIn(value: string): string[] {
  const matches = asciiDigits(value).match(/\d+(?:[.,]\d+)*/g) ?? [];
  return [...new Set(matches.map((match) => match.replace(/,(?=\d{3}\b)/g, "")))];
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  single: 1, double: 2, triple: 3,
  واحد: 1, واحده: 1, اثنين: 2, اثنان: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10,
};

/** A count written as digits or as a word, with up to two words between it and the noun ("six branches", "five certified coaches", "ثلاثة فروع"). */
export function countBefore(text: string, nounPattern: RegExp): number | undefined {
  const normalized = normalizeText(text);
  const pattern = new RegExp(`(?:^|\\s)(\\d{1,3}|${Object.keys(WORD_NUMBERS).join("|")})\\s+(?:[^\\s]+\\s+){0,2}?(?:${nounPattern.source})(?:\\s|$)`, "u");
  const match = pattern.exec(normalized);
  if (!match) return undefined;
  const raw = match[1] ?? "";
  return /^\d+$/.test(raw) ? Number(raw) : WORD_NUMBERS[raw];
}

/**
 * Sentence-sized slices of a text, in order, each a verbatim substring so a
 * caller can find it again with `indexOf`. Splits on line breaks and on
 * sentence punctuation in either script; very long sentences are cut at a
 * word boundary before the length cap.
 */
export function splitPassages(text: string, maxLength = PASSAGE_MAX_LENGTH): string[] {
  const passages: string[] = [];
  for (const line of text.split(/\r?\n+/)) {
    const pieces = line.split(/(?<=[.!?؟…])\s+(?=\S)/u);
    for (const piece of pieces) {
      let remaining = piece.trim();
      while (remaining.length > maxLength) {
        const cut = remaining.lastIndexOf(" ", maxLength);
        const head = remaining.slice(0, cut > maxLength / 2 ? cut : maxLength).trim();
        if (head.length >= PASSAGE_MIN_LENGTH) passages.push(head);
        remaining = remaining.slice(head.length).trim();
      }
      if (remaining.length >= PASSAGE_MIN_LENGTH) passages.push(remaining);
    }
  }
  return passages;
}

/** Where a passage sits in its source text, or undefined when the source changed since it was cut. */
export function locatePassage(source: string, passage: string, from = 0): { start: number; end: number } | undefined {
  const start = source.indexOf(passage, from);
  return start >= 0 ? { start, end: start + passage.length } : undefined;
}

export function mentionsAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
