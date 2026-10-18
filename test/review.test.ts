import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { translateMarket, type Field, type Market } from "../src/pipeline.js";
import { FIELDS } from "../src/pipeline.js";
import { createReviewServer } from "../src/review.js";
import type { Lang } from "../src/lexicon.js";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const source: Market = read("../fixtures/market.json");
const tr: Record<Lang, Record<string, Record<Field, string>>> = read("../fixtures/translations.json");

test("review lane: blocked version is refused, fixing it unblocks publishing", async () => {
  const versions = await translateMarket(source, {
    translate: async (text, lang) => tr[lang][lang === "hi" ? "beforeBecameBy" : "good"][FIELDS.find((f) => source[f] === text)!],
  });
  const server = createReviewServer({ source, versions });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", body: JSON.stringify(body) });
  try {
    assert.equal((await post("/api/publish", { lang: "hi" })).status, 409);
    assert.equal((await post("/api/publish", { lang: "ta" })).status, 200);

    for (const f of FIELDS) await post("/api/revise", { lang: "hi", field: f, text: tr.hi.good[f] });
    const session = await (await fetch(base + "/api/session")).json();
    assert.equal(session.versions.hi.status, "ready");
    assert.equal((await post("/api/publish", { lang: "hi" })).status, 200);
    assert.ok((await fetch(base + "/")).ok);
  } finally {
    server.close();
  }
});
