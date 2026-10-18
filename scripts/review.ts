import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createReviewServer, type Session } from "../src/review.js";

const session: Session = JSON.parse(readFileSync("out/session.json", "utf8"));
const port = Number(process.env.PORT ?? 4000);
createReviewServer(session, {
  publishDir: "out/published",
  onChange: (s) => {
    mkdirSync("out", { recursive: true });
    writeFileSync("out/session.json", JSON.stringify(s, null, 2));
  },
}).listen(port, () => console.log(`Review lane: http://localhost:${port}`));
