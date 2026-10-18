import { LANGS, type Lang } from "./lexicon.js";
import { verifyTranslation } from "./invariants.js";

export type Market = { question: string; resolutionRules: string };
export type Translator = { translate(text: string, lang: Lang): Promise<string> };

export type Version = {
  lang: Lang;
  question: string;
  resolutionRules: string;
  status: "ready" | "needs_review";
  issues: string[];
};

export class BlockedError extends Error {}

// One English market in; Hindi, Tamil and Marathi versions out. Both the question
// and the resolution rules are translated, and each is checked against its English source.
export async function translateMarket(source: Market, translator: Translator): Promise<Record<Lang, Version>> {
  const entries = await Promise.all(
    LANGS.map(async (lang) => {
      const [question, resolutionRules] = await Promise.all([
        translator.translate(source.question, lang),
        translator.translate(source.resolutionRules, lang),
      ]);
      const issues: string[] = [];
      for (const [field, en, tr] of [
        ["question", source.question, question],
        ["resolutionRules", source.resolutionRules, resolutionRules],
      ] as const) {
        const r = verifyTranslation(en, tr, lang);
        r.missing.forEach((k) => issues.push(`${field}: ${k} from the English is missing`));
        r.unexpected.forEach((k) => issues.push(`${field}: ${k} appears but is not in the English`));
      }
      const version: Version = { lang, question, resolutionRules, status: issues.length ? "needs_review" : "ready", issues };
      return [lang, version] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<Lang, Version>;
}

// The only way a version goes out. A version that failed its check is refused.
export function publishVersion(v: Version): Version & { publishedAt: string } {
  if (v.status !== "ready") {
    throw new BlockedError(`${v.lang} version is blocked: ${v.issues.join("; ")}`);
  }
  return { ...v, publishedAt: new Date().toISOString() };
}
