import { monthTable, nfc, type Lang } from "./lexicon.js";

// Words that change who wins just as much as a digit does: "before 15 June" is not "by 15 June".
export type Cmp = "before" | "by" | "after" | "on_or_after" | "at_least" | "more_than" | "less_than" | "at_most";

export const CMP_LABEL: Record<Cmp, string> = {
  before: "before",
  by: "by / until / on or before",
  after: "after",
  on_or_after: "on or after",
  at_least: "at least",
  more_than: "more than",
  less_than: "less than",
  at_most: "at most / capped at",
};

// Pairs a translator typically mixes up.
const CONFLICT: Record<Cmp, Cmp> = {
  before: "by",
  by: "before",
  after: "on_or_after",
  on_or_after: "after",
  at_least: "more_than",
  more_than: "at_least",
  less_than: "at_most",
  at_most: "less_than",
};

export type CmpSpan = { kind: Cmp; start: number; end: number };

const MONTHS = [...monthTable("en").keys()].sort((a, b) => b.length - a.length).join("|");
const BY_DATE = `by(?=\\s+(?:the\\s+end\\s+of\\s+)?(?:\\d{1,2}(?:st|nd|rd|th)?\\s*(?:of\\s+)?(?:${MONTHS})\\b|(?:${MONTHS})\\b|\\d{4}-\\d{2}))`;

// Order matters: longer phrases first. "by 25 basis points" is not a deadline, so
// "by" only counts when a date follows.
const SOURCE_RULES: [RegExp, Cmp][] = [
  [/\bon or after\b/gi, "on_or_after"],
  [/\bon or before\b|\bno later than\b/gi, "by"],
  [/\bat least\b|\bno less than\b|\bminimum of\b/gi, "at_least"],
  [/\bat most\b|\bno more than\b|\bcapped at\b|\bmaximum of\b/gi, "at_most"],
  [/\bmore than\b|\bgreater than\b|\bexceeds?\b|\b(?:over|above)(?=\s+\d)/gi, "more_than"],
  [/\bless than\b|\bfewer than\b|\b(?:under|below)(?=\s+\d)/gi, "less_than"],
  [/\bbefore\b/gi, "before"],
  [/\bafter\b/gi, "after"],
  [new RegExp(`\\buntil\\b|\\b${BY_DATE}`, "gi"), "by"],
];

export function extractSourceComparators(text: string): CmpSpan[] {
  let rest = text;
  const spans: CmpSpan[] = [];
  for (const [re, kind] of SOURCE_RULES) {
    rest = rest.replace(re, (...args) => {
      const match = args[0] as string;
      const offset = args[args.length - 3] as number;
      spans.push({ kind, start: offset, end: offset + match.length });
      return " ".repeat(match.length);
    });
  }
  return spans.sort((a, b) => a.start - b.start);
}

// Token markers per language. "~x" matches a token that ends with x (agglutinative suffixes).
// Whole-token matching keeps words like Tamil வரையறுக்கப்பட்டுள்ளது ("limited") from reading as வரை ("until").
const MARKERS: Record<Lang, [Cmp, string[]][]> = {
  hi: [
    ["by", ["या", "उससे", "पहले"]],
    ["on_or_after", ["या", "उसके", "बाद"]],
    ["at_least", ["कम", "से", "कम"]],
    ["at_most", ["से", "अधिक", "नहीं"]],
    ["at_most", ["तक", "सीमित"]],
    ["at_most", ["अधिकतम"]],
    ["more_than", ["से", "अधिक"]],
    ["more_than", ["से", "ज़्यादा"]],
    ["more_than", ["से", "ज्यादा"]],
    ["less_than", ["से", "कम"]],
    ["before", ["से", "पहले"]],
    ["before", ["पहले"]],
    ["after", ["के", "बाद"]],
    ["after", ["बाद"]],
    ["by", ["तक"]],
  ],
  mr: [
    ["by", ["किंवा", "त्यापूर्वी"]],
    ["on_or_after", ["किंवा", "त्यानंतर"]],
    ["at_least", ["किमान"]],
    ["at_most", ["कमाल"]],
    ["at_most", ["~पर्यंत", "मर्यादित"]],
    ["at_most", ["मर्यादित"]],
    ["more_than", ["~पेक्षा", "जास्त"]],
    ["more_than", ["~पेक्षा", "अधिक"]],
    ["less_than", ["~पेक्षा", "कमी"]],
    ["before", ["पूर्वी"]],
    ["before", ["पूर्व"]],
    ["before", ["आधी"]],
    ["after", ["नंतर"]],
    ["by", ["~पर्यंत"]],
  ],
  ta: [
    ["by", ["அல்லது", "அதற்கு", "முன்"]],
    ["on_or_after", ["அல்லது", "அதற்குப்", "பிறகு"]],
    ["at_least", ["குறைந்தது"]],
    ["at_least", ["குறைந்தபட்சம்"]],
    ["at_most", ["அதிகபட்சம்"]],
    ["at_most", ["வரையறுக்கப்பட்டுள்ளது"]],
    ["more_than", ["~க்கு", "மேல்"]],
    ["more_than", ["மேல்"]],
    ["less_than", ["குறைவாக"]],
    ["before", ["முன்"]],
    ["before", ["முன்பு"]],
    ["after", ["பிறகு"]],
    ["after", ["பின்"]],
    ["by", ["வரை"]],
  ],
};

function tokenize(text: string) {
  return [...text.matchAll(/[^\s।,.;:!?()"'“”‘’]+/gu)].map((m) => ({ t: m[0], start: m.index!, end: m.index! + m[0].length }));
}

const tokenMatches = (token: string, marker: string) => (marker.startsWith("~") ? token.endsWith(marker.slice(1)) : token === marker);

export function extractTranslatedComparators(text: string, lang: Lang): CmpSpan[] {
  const tokens = tokenize(nfc(text));
  const markers = MARKERS[lang]
    .map(([kind, words]) => [kind, words.map((w) => nfc(w))] as [Cmp, string[]])
    .sort((a, b) => b[1].length - a[1].length);
  const spans: CmpSpan[] = [];
  for (let i = 0; i < tokens.length; ) {
    const hit = markers.find(([, words]) => words.every((w, j) => i + j < tokens.length && tokenMatches(tokens[i + j].t, w)));
    if (hit) {
      spans.push({ kind: hit[0], start: tokens[i].start, end: tokens[i + hit[1].length - 1].end });
      i += hit[1].length;
    } else i++;
  }
  return spans;
}

export type CmpProblem =
  | { type: "conflict"; expected: Cmp; found: Cmp; source: CmpSpan; translated: CmpSpan }
  | { type: "missing"; expected: Cmp; source: CmpSpan };

// Every comparator in the English needs a matching one in the translation. A swapped one
// (before -> by) is a conflict. One we can't find at all goes to a reviewer rather than passing.
export function checkComparators(sourceText: string, translatedText: string, lang: Lang): CmpProblem[] {
  const pool = extractTranslatedComparators(translatedText, lang);
  const take = (kind: Cmp) => {
    const i = pool.findIndex((s) => s.kind === kind);
    return i === -1 ? undefined : pool.splice(i, 1)[0];
  };
  const problems: CmpProblem[] = [];
  const sources = extractSourceComparators(sourceText);
  const unmatched = sources.filter((s) => !take(s.kind));
  // Re-seed the pool for conflict detection: only spans nothing matched are candidates.
  const left = extractTranslatedComparators(translatedText, lang);
  for (const s of sources) {
    const i = left.findIndex((x) => x.kind === s.kind);
    if (i !== -1) left.splice(i, 1);
  }
  for (const s of unmatched) {
    const j = left.findIndex((x) => x.kind === CONFLICT[s.kind]);
    if (j !== -1) {
      const [found] = left.splice(j, 1);
      problems.push({ type: "conflict", expected: s.kind, found: found.kind, source: s, translated: found });
    } else problems.push({ type: "missing", expected: s.kind, source: s });
  }
  return problems;
}
