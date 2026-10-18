import { monthTable, normalizeDigits, unitsFor, type AnyLang } from "./lexicon.js";

// Facts in a market that must survive translation unchanged. Extracted by code only.
// Each invariant has a string key (so texts can be compared as multisets) and the
// position it was found at (so a reviewer can be shown exactly where).
export type Span = { key: string; start: number; end: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function dateKey(y: string | undefined, m: number, d: number) {
  return `date:${y ?? "?"}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function describeKey(key: string): string {
  if (key.startsWith("date:")) {
    const [y, m, d] = key.slice(5).split("-");
    return `${+d!} ${MONTH_ABBR[+m! - 1]}${y === "?" ? "" : " " + y}`;
  }
  return key.slice(4);
}

// Matched text is blanked with same-length spaces, so offsets stay valid for the original text.
function extractDates(text: string, lang: AnyLang): { spans: Span[]; rest: string } {
  const months = monthTable(lang);
  const names = [...months.keys()].sort((a, b) => b.length - a.length).map(escape).join("|");
  const spans: Span[] = [];
  let rest = text;

  const run = (re: RegExp, read: (g: Record<string, string | undefined>) => string) => {
    rest = rest.replace(re, (...args) => {
      const match = args[0] as string;
      const offset = args[args.length - 3] as number;
      const groups = args[args.length - 1] as Record<string, string | undefined>;
      spans.push({ key: read(groups), start: offset, end: offset + match.length });
      return " ".repeat(match.length);
    });
  };

  run(/(?<!\d)(?<y>\d{4})-(?<mo>\d{2})-(?<d>\d{2})(?!\d)/g, (g) => dateKey(g.y, +g.mo!, +g.d!));
  run(/(?<!\d)(?<d>\d{1,2})[/.-](?<mo>\d{1,2})[/.-](?<y>\d{4})(?!\d)/g, (g) => dateKey(g.y, +g.mo!, +g.d!));
  run(
    new RegExp(`(?<!\\d)(?<d>\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(?<m>${names})\\.?(?:,?\\s*(?<y>\\d{4})(?!\\d))?`, "giu"),
    (g) => dateKey(g.y, months.get(g.m!.toLowerCase())!, +g.d!),
  );
  run(
    new RegExp(`(?<m>${names})\\.?\\s*(?<d>\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s*(?<y>\\d{4})(?!\\d))?`, "giu"),
    (g) => dateKey(g.y, months.get(g.m!.toLowerCase())!, +g.d!),
  );
  return { spans, rest };
}

function extractNumbers(text: string, lang: AnyLang): Span[] {
  const units = unitsFor(lang);
  const unitAlt = units.map((x) => escape(x.word)).join("|");
  const re = new RegExp(`(?<![\\d.,])(?<int>\\d{1,3}(?:,\\d{2,3})+|\\d+)(?<frac>\\.\\d+)?(?:\\s*(?<unit>${unitAlt}))?`, "giu");
  const spans: Span[] = [];
  for (const m of text.matchAll(re)) {
    const unit = m.groups!.unit ? units.find((x) => x.word === m.groups!.unit!.toLowerCase()) : undefined;
    // Grouping commas are dropped so 1,00,000 and 100,000 are the same number.
    const base = Number(m.groups!.int!.replace(/,/g, "") + (m.groups!.frac ?? ""));
    const value = Math.round(base * (unit?.multiplier ?? 1) * 1e6) / 1e6;
    spans.push({ key: `num:${value}${unit?.percent ? "%" : ""}`, start: m.index!, end: m.index! + m[0].length });
  }
  return spans;
}

// Offsets are into the NFC form of `text` (native digits map 1:1 to ASCII, so they line up).
export function extractSpans(text: string, lang: AnyLang): Span[] {
  const { spans: dates, rest } = extractDates(normalizeDigits(text), lang);
  return [...dates, ...extractNumbers(rest, lang)].sort((a, b) => a.start - b.start);
}

export const extractInvariants = (text: string, lang: AnyLang): string[] => extractSpans(text, lang).map((s) => s.key);

export type CheckResult = {
  ok: boolean;
  missing: Span[]; // in the English, absent from the translation (positions in the English)
  unexpected: Span[]; // in the translation, absent from the English (positions in the translation)
};

// Every source invariant must appear in the translation, and nothing extra may appear.
export function compareInvariants(source: Span[], translated: Span[]): CheckResult {
  const left = [...translated];
  const missing: Span[] = [];
  for (const s of source) {
    const i = left.findIndex((t) => t.key === s.key);
    if (i === -1) missing.push(s);
    else left.splice(i, 1);
  }
  return { ok: missing.length === 0 && left.length === 0, missing, unexpected: left };
}

export function verifyTranslation(sourceText: string, translatedText: string, lang: AnyLang): CheckResult {
  return compareInvariants(extractSpans(sourceText, "en"), extractSpans(translatedText, lang));
}
