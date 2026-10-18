import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractInvariants, verifyTranslation } from "../src/invariants.js";
import { BlockedError, publishVersion, translateMarket, type Market, type Translator } from "../src/pipeline.js";
import type { Lang } from "../src/lexicon.js";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const source: Market = read("../fixtures/market.json");
const tr = read("../fixtures/translations.json");

test("source invariants come from code: dates, numbers, percent, grouped amounts", () => {
  const keys = extractInvariants(source.resolutionRules, "en");
  assert.deepEqual(keys.sort(), ["date:2026-06-15", "num:0.25%", "num:100000"].sort());
});

test("dates with and without a year, in either order, are recognised", () => {
  assert.deepEqual(extractInvariants("by June 15, 2026", "en"), ["date:2026-06-15"]);
  assert.deepEqual(extractInvariants("on 3rd March", "en"), ["date:?-03-03"]);
  assert.deepEqual(extractInvariants("2026-06-15 and 15/06/2026", "en"), ["date:2026-06-15", "date:2026-06-15"]);
});

for (const [lang, cases] of Object.entries(tr) as [Lang, Record<string, { question: string; resolutionRules: string }>][]) {
  for (const [name, t] of Object.entries(cases)) {
    if (/^(good|nativeDigits|westernGrouping|lakhWord)$/.test(name)) {
      test(`${lang}/${name} passes the check`, () => {
        assert.ok(verifyTranslation(source.question, t.question, lang).ok);
        assert.ok(verifyTranslation(source.resolutionRules, t.resolutionRules, lang).ok);
      });
    }
  }
}

test("a changed date is flagged", () => {
  const r = verifyTranslation(source.question, tr.hi.changedDate.question, "hi");
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["date:2026-06-15"]);
  assert.deepEqual(r.unexpected, ["date:2026-06-16"]);
});

test("a lakh that became a crore is flagged", () => {
  const r = verifyTranslation(source.resolutionRules, tr.hi.lakhBecameCrore.resolutionRules, "hi");
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["num:100000"]);
});

test("a changed percentage in Marathi is flagged", () => {
  const r = verifyTranslation(source.resolutionRules, tr.mr.changedPercent.resolutionRules, "mr");
  assert.equal(r.ok, false);
});

test("a dropped number is flagged", () => {
  assert.equal(verifyTranslation("Cap is 500 tokens.", "सीमा टोकन है।", "hi").ok, false);
});

// Fake translator: serves fixture text and records every request.
function fakeTranslator(pick: (lang: Lang, field: "question" | "resolutionRules") => string) {
  const calls: { text: string; lang: Lang }[] = [];
  const t: Translator = {
    async translate(text, lang) {
      calls.push({ text, lang });
      return pick(lang, text === source.question ? "question" : "resolutionRules");
    },
  };
  return { t, calls };
}

test("all three languages are requested, and the rules are translated too", async () => {
  const { t, calls } = fakeTranslator((lang, f) => (tr[lang].good ?? tr.hi.good)[f]);
  await translateMarket(source, t);
  for (const lang of ["hi", "ta", "mr"] as const) {
    assert.ok(calls.some((c) => c.lang === lang && c.text === source.question));
    assert.ok(calls.some((c) => c.lang === lang && c.text === source.resolutionRules));
  }
  assert.equal(calls.length, 6);
});

test("good translations are ready and publishable", async () => {
  const { t } = fakeTranslator((lang, f) => tr[lang].good[f]);
  const v = await translateMarket(source, t);
  for (const lang of ["hi", "ta", "mr"] as const) {
    assert.equal(v[lang].status, "ready");
    assert.ok(publishVersion(v[lang]).publishedAt);
  }
});

test("a version with a changed number is blocked and cannot be published", async () => {
  const { t } = fakeTranslator((lang, f) => (lang === "hi" ? tr.hi.lakhBecameCrore[f] : tr[lang].good[f]));
  const v = await translateMarket(source, t);
  assert.equal(v.hi.status, "needs_review");
  assert.ok(v.hi.issues.length > 0);
  assert.throws(() => publishVersion(v.hi), BlockedError);
  assert.equal(v.ta.status, "ready");
  assert.equal(v.mr.status, "ready");
});
