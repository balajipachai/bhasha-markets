import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { checkComparators, extractSourceComparators } from "../src/comparators.js";

const kinds = (t: string) => extractSourceComparators(t).map((s) => s.kind);

test("English comparators are extracted by code", () => {
  assert.deepEqual(kinds("before 15 June"), ["before"]);
  assert.deepEqual(kinds("on or after 1 August"), ["on_or_after"]);
  assert.deepEqual(kinds("at least 2 machines, fewer than 5"), ["at_least", "less_than"]);
  assert.deepEqual(kinds("capped at 1 crore"), ["at_most"]);
});

test("'by' is a deadline only when a date follows", () => {
  assert.deepEqual(kinds("cut the rate by 25 basis points"), []);
  assert.deepEqual(kinds("announced by 10 June 2026"), ["by"]);
  assert.deepEqual(kinds("not declared by 30 June"), ["by"]);
});

test("every sample market has comparators the tool will guard", () => {
  const dir = new URL("../fixtures/samples/", import.meta.url);
  for (const f of readdirSync(dir)) {
    const m = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    assert.ok(extractSourceComparators(m.resolutionRules).length >= 2, f);
  }
});

test("matching wording passes; swapped wording is a conflict; unknown wording needs review", () => {
  assert.deepEqual(checkComparators("before 15 June", "15 जून से पहले", "hi"), []);
  const swapped = checkComparators("before 15 June", "15 जून तक", "hi");
  assert.equal(swapped[0].type, "conflict");
  assert.equal(swapped[0].expected, "before");
  assert.equal(swapped[0].found, "by");
  assert.equal(checkComparators("at least 2 machines", "2 मशीनें", "hi")[0].type, "missing");
});

test("Hindi 'at least' and 'less than' are told apart", () => {
  assert.deepEqual(checkComparators("at least 2", "कम से कम 2", "hi"), []);
  assert.equal(checkComparators("at least 2", "2 से कम", "hi")[0].type, "missing");
});
