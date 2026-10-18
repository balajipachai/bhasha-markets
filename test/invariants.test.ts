import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractInvariants, verifyTranslation } from "../src/invariants.js";
import { BlockedError, FIELDS, publishVersion, reviseVersion, translateMarket, type Field, type Market, type Translator } from "../src/pipeline.js";
import { LANGS, type Lang } from "../src/lexicon.js";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const source: Market = read("../fixtures/market.json");
const tr: Record<Lang, Record<string, Record<Field, string>>> = read("../fixtures/translations.json");
const keys = (spans: { key: string }[]) => spans.map((s) => s.key);

test("source invariants come from code: dates, numbers, percent, grouped amounts", () => {
  const found = extractInvariants(source.resolutionRules, "en");
  assert.deepEqual(found.sort(), ["date:2026-06-15", "num:0.25%", "num:100000"].sort());
});

test("dates with and without a year, in either order, are recognised", () => {
  assert.deepEqual(extractInvariants("by June 15, 2026", "en"), ["date:2026-06-15"]);
  assert.deepEqual(extractInvariants("on 3rd March", "en"), ["date:?-03-03"]);
  assert.deepEqual(extractInvariants("2026-06-15 and 15/06/2026", "en"), ["date:2026-06-15", "date:2026-06-15"]);
});

for (const lang of LANGS) {
  for (const name of ["good", "nativeDigits", "westernGrouping", "lakhWord"]) {
    const t = tr[lang][name];
    if (!t) continue;
    test(`${lang}/${name} passes the number and date check`, () => {
      for (const f of FIELDS) assert.ok(verifyTranslation(source[f], t[f], lang).ok, f);
    });
  }
}

test("a changed date is flagged, with positions", () => {
  const r = verifyTranslation(source.question, tr.hi.changedDate.question, "hi");
  assert.equal(r.ok, false);
  assert.deepEqual(keys(r.missing), ["date:2026-06-15"]);
  assert.deepEqual(keys(r.unexpected), ["date:2026-06-16"]);
  const m = r.unexpected[0];
  assert.equal(tr.hi.changedDate.question.slice(m.start, m.end), "16 जून 2026");
});

test("a lakh that became a crore is flagged", () => {
  const r = verifyTranslation(source.resolutionRules, tr.hi.lakhBecameCrore.resolutionRules, "hi");
  assert.equal(r.ok, false);
  assert.deepEqual(keys(r.missing), ["num:100000"]);
});

test("a changed percentage in Marathi is flagged", () => {
  assert.equal(verifyTranslation(source.resolutionRules, tr.mr.changedPercent.resolutionRules, "mr").ok, false);
});

test("a dropped number is flagged", () => {
  assert.equal(verifyTranslation("Cap is 500 tokens.", "सीमा टोकन है।", "hi").ok, false);
});

// Fake translator: serves fixture text and records every request.
function fakeTranslator(pick: (lang: Lang, field: Field) => string) {
  const calls: { text: string; lang: Lang }[] = [];
  const t: Translator = {
    async translate(text, lang) {
      calls.push({ text, lang });
      return pick(lang, FIELDS.find((f) => source[f] === text)!);
    },
  };
  return { t, calls };
}

test("all three languages are requested for every text field, rules included", async () => {
  const { t, calls } = fakeTranslator((lang, f) => tr[lang].good[f]);
  await translateMarket(source, t);
  for (const lang of LANGS) for (const f of FIELDS) assert.ok(calls.some((c) => c.lang === lang && c.text === source[f]), `${lang}/${f}`);
  assert.equal(calls.length, 9);
});

test("good translations are ready and publishable", async () => {
  const { t } = fakeTranslator((lang, f) => tr[lang].good[f]);
  const v = await translateMarket(source, t);
  for (const lang of LANGS) {
    assert.deepEqual(v[lang].issues, [], lang);
    assert.ok(publishVersion(v[lang]).publishedAt);
  }
});

test("a version with a changed number is blocked and cannot be published", async () => {
  const { t } = fakeTranslator((lang, f) => (lang === "hi" ? tr.hi.lakhBecameCrore[f] : tr[lang].good[f]));
  const v = await translateMarket(source, t);
  assert.equal(v.hi.status, "needs_review");
  assert.match(v.hi.issues[0].message, /100000/);
  assert.throws(() => publishVersion(v.hi), BlockedError);
  assert.equal(v.ta.status, "ready");
  assert.equal(v.mr.status, "ready");
});

test("the 'before' that became 'by' incident is caught in every language", async () => {
  for (const lang of LANGS) {
    const { t } = fakeTranslator((l, f) => (l === lang ? tr[l].beforeBecameBy[f] : tr[l].good[f]));
    const v = await translateMarket(source, t);
    const issues = v[lang].issues.filter((i) => i.type === "comparator");
    assert.ok(issues.length >= 1, lang);
    assert.match(issues[0].message, /"before" but the .* reads as "by/);
    assert.equal(v[lang].status, "needs_review");
    assert.throws(() => publishVersion(v[lang]), BlockedError);
  }
});

test("a reviewer fix is re-checked, and only a correct fix unblocks the version", async () => {
  const { t } = fakeTranslator((lang, f) => (lang === "hi" ? tr.hi.changedDate[f] : tr[lang].good[f]));
  const blocked = (await translateMarket(source, t)).hi;
  assert.equal(blocked.status, "needs_review");
  const stillWrong = reviseVersion(source, blocked, "question", tr.hi.changedDate.question + " ");
  assert.equal(stillWrong.status, "needs_review");
  const fixed = reviseVersion(source, blocked, "question", tr.hi.good.question);
  assert.equal(fixed.status, "ready");
  assert.ok(publishVersion(fixed).publishedAt);
});
