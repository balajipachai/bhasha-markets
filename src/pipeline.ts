import { LANGS, LANG_NAMES, nfc, type Lang } from "./lexicon.js";
import { describeKey, verifyTranslation } from "./invariants.js";
import { checkComparators, CMP_LABEL } from "./comparators.js";

export const FIELDS = ["question", "resolutionRules", "resolutionSource"] as const;
export type Field = (typeof FIELDS)[number];
export const FIELD_LABEL: Record<Field, string> = {
  question: "question",
  resolutionRules: "resolution rules",
  resolutionSource: "resolution source",
};

// closeDate is an ISO date and travels unchanged; the three text fields are translated.
export type Market = Record<Field, string> & { closeDate: string };
export type Translator = { translate(text: string, lang: Lang): Promise<string> };

export type Range = { start: number; end: number };
export type Issue = {
  field: Field;
  type: "number" | "date" | "comparator";
  message: string; // plain language, for the reviewer
  sourceRanges: Range[]; // where to look in the English
  translationRanges: Range[]; // where to look in the translation
};

export type Version = Record<Field, string> & {
  lang: Lang;
  closeDate: string;
  status: "ready" | "needs_review";
  issues: Issue[];
};

export class BlockedError extends Error {}

function checkField(field: Field, en: string, tr: string, lang: Lang): Issue[] {
  const name = LANG_NAMES[lang];
  const label = FIELD_LABEL[field];
  const issues: Issue[] = [];
  const inv = verifyTranslation(en, tr, lang);
  for (const s of inv.missing) {
    issues.push({
      field,
      type: s.key.startsWith("date:") ? "date" : "number",
      message: `The ${s.key.startsWith("date:") ? "date" : "number"} "${describeKey(s.key)}" in the English ${label} is missing from the ${name}.`,
      sourceRanges: [s],
      translationRanges: [],
    });
  }
  for (const s of inv.unexpected) {
    issues.push({
      field,
      type: s.key.startsWith("date:") ? "date" : "number",
      message: `The ${name} ${label} has ${s.key.startsWith("date:") ? "a date" : "a number"} "${describeKey(s.key)}" that is not in the English.`,
      sourceRanges: [],
      translationRanges: [s],
    });
  }
  for (const p of checkComparators(en, tr, lang)) {
    issues.push({
      field,
      type: "comparator",
      message:
        p.type === "conflict"
          ? `The English says "${CMP_LABEL[p.expected]}" but the ${name} ${label} reads as "${CMP_LABEL[p.found]}". This changes who wins.`
          : `The English says "${CMP_LABEL[p.expected]}" but no matching ${name} wording was found in the ${label}. Check it by hand.`,
      sourceRanges: [p.source],
      translationRanges: p.type === "conflict" ? [p.translated] : [],
    });
  }
  return issues;
}

function build(source: Market, lang: Lang, texts: Record<Field, string>): Version {
  const issues = FIELDS.flatMap((f) => checkField(f, source[f], texts[f], lang));
  return { lang, closeDate: source.closeDate, ...texts, status: issues.length ? "needs_review" : "ready", issues };
}

// One English market in; Hindi, Tamil and Marathi versions out. Every text field is translated
// and each result is checked against its English source in code.
export async function translateMarket(source: Market, translator: Translator): Promise<Record<Lang, Version>> {
  const entries = await Promise.all(
    LANGS.map(async (lang) => {
      const texts = Object.fromEntries(
        await Promise.all(FIELDS.map(async (f) => [f, nfc(await translator.translate(source[f], lang))] as const)),
      ) as Record<Field, string>;
      return [lang, build(source, lang, texts)] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<Lang, Version>;
}

// A reviewer's edit. The version is re-checked from scratch, so an edit can't smuggle a mismatch through.
export function reviseVersion(source: Market, v: Version, field: Field, text: string): Version {
  return build(source, v.lang, { question: v.question, resolutionRules: v.resolutionRules, resolutionSource: v.resolutionSource, [field]: nfc(text) });
}

// The only way a version goes out. A version that failed its check is refused.
export function publishVersion(v: Version): Version & { publishedAt: string } {
  if (v.status !== "ready") {
    throw new BlockedError(`${LANG_NAMES[v.lang]} version is blocked: ${v.issues.map((i) => i.message).join(" ")}`);
  }
  return { ...v, publishedAt: new Date().toISOString() };
}
