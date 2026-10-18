import { monthTable, normalizeDigits, unitsFor, type AnyLang } from "./lexicon.js";

// Facts in a market that must survive translation unchanged. Extracted by code only.
// Each invariant is a string key so two texts can be compared as multisets.
export type InvariantSet = string[];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function dateKey(y: string | undefined, m: number, d: number) {
  return `date:${y ?? "?"}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractDates(text: string, lang: AnyLang): { keys: string[]; rest: string } {
  const months = monthTable(lang);
  const names = [...months.keys()].sort((a, b) => b.length - a.length).map(escape).join("|");
  const keys: string[] = [];
  let rest = text;

  const run = (re: RegExp, read: (g: Record<string, string | undefined>) => string | null) => {
    rest = rest.replace(re, (...args) => {
      const groups = args[args.length - 1] as Record<string, string | undefined>;
      const key = read(groups);
      if (key === null) return args[0];
      keys.push(key);
      return " ";
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
  return { keys, rest };
}

function extractNumbers(text: string, lang: AnyLang): string[] {
  const units = unitsFor(lang);
  const unitAlt = units.map((x) => escape(x.word)).join("|");
  const re = new RegExp(`(?<![\\d.,])(?<int>\\d{1,3}(?:,\\d{2,3})+|\\d+)(?<frac>\\.\\d+)?(?:\\s*(?<unit>${unitAlt}))?`, "giu");
  const keys: string[] = [];
  for (const m of text.matchAll(re)) {
    const unit = m.groups!.unit ? units.find((x) => x.word === m.groups!.unit!.toLowerCase()) : undefined;
    // Grouping commas are dropped so 1,00,000 and 100,000 are the same number.
    const base = Number(m.groups!.int!.replace(/,/g, "") + (m.groups!.frac ?? ""));
    const value = Math.round(base * (unit?.multiplier ?? 1) * 1e6) / 1e6;
    keys.push(`num:${value}${unit?.percent ? "%" : ""}`);
  }
  return keys;
}

export function extractInvariants(text: string, lang: AnyLang): InvariantSet {
  const { keys: dates, rest } = extractDates(normalizeDigits(text), lang);
  return [...dates, ...extractNumbers(rest, lang)];
}

export type CheckResult = { ok: boolean; missing: string[]; unexpected: string[] };

// Every source invariant must appear in the translation, and nothing extra may appear.
export function compareInvariants(source: InvariantSet, translated: InvariantSet): CheckResult {
  const left = [...translated];
  const missing: string[] = [];
  for (const key of source) {
    const i = left.indexOf(key);
    if (i === -1) missing.push(key);
    else left.splice(i, 1);
  }
  return { ok: missing.length === 0 && left.length === 0, missing, unexpected: left };
}

export function verifyTranslation(sourceText: string, translatedText: string, lang: AnyLang): CheckResult {
  return compareInvariants(extractInvariants(sourceText, "en"), extractInvariants(translatedText, lang));
}
