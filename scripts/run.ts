import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { translateMarket } from "../src/pipeline.js";
import { createClaudeTranslator } from "../src/translator.js";

const MarketInput = z.object({
  question: z.string().min(5),
  resolutionRules: z.string().min(5),
  resolutionSource: z.string().min(3),
  closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const file = process.argv[2] ?? "fixtures/market.json";
const source = MarketInput.parse(JSON.parse(readFileSync(file, "utf8")));

const versions = await translateMarket(source, createClaudeTranslator());
mkdirSync("out", { recursive: true });
writeFileSync("out/session.json", JSON.stringify({ source, versions }, null, 2));
for (const v of Object.values(versions)) {
  console.log(`${v.lang}: ${v.status}`);
  v.issues.forEach((i) => console.log(`  - ${i.message}`));
}
console.log("Open the review lane with: npm run review");
