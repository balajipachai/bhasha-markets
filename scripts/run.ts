import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { BlockedError, publishVersion, translateMarket } from "../src/pipeline.js";
import { createClaudeTranslator } from "../src/translator.js";

const Market = z.object({ question: z.string().min(5), resolutionRules: z.string().min(5) });
const file = process.argv[2] ?? "fixtures/market.json";
const market = Market.parse(JSON.parse(readFileSync(file, "utf8")));

const versions = await translateMarket(market, createClaudeTranslator());
mkdirSync("out", { recursive: true });
for (const v of Object.values(versions)) {
  try {
    writeFileSync(`out/${v.lang}.json`, JSON.stringify(publishVersion(v), null, 2));
    console.log(`${v.lang}: published`);
  } catch (e) {
    if (!(e instanceof BlockedError)) throw e;
    console.log(`${v.lang}: BLOCKED, needs review\n  - ${v.issues.join("\n  - ")}`);
  }
}
