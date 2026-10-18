import { createServer, type Server } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS, type Lang } from "./lexicon.js";
import { BlockedError, FIELDS, publishVersion, reviseVersion, type Field, type Market, type Version } from "./pipeline.js";
import { REVIEW_PAGE } from "./reviewPage.js";

export type Session = { source: Market; versions: Record<Lang, Version> };

type Options = { onChange?: (s: Session) => void; publishDir?: string };

async function readJson(req: import("node:http").IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

// Review lane server. Publishing goes through publishVersion, so a blocked version is refused here too.
export function createReviewServer(session: Session, opts: Options = {}): Server {
  return createServer(async (req, res) => {
    const send = (code: number, body: unknown, type = "application/json") => {
      res.writeHead(code, { "content-type": type });
      res.end(type === "application/json" ? JSON.stringify(body) : (body as string));
    };
    try {
      if (req.method === "GET" && req.url === "/") return send(200, REVIEW_PAGE, "text/html; charset=utf-8");
      if (req.method === "GET" && req.url === "/api/session") return send(200, session);
      if (req.method === "POST" && req.url === "/api/revise") {
        const { lang, field, text } = await readJson(req);
        if (!LANGS.includes(lang) || !FIELDS.includes(field as Field) || typeof text !== "string") return send(400, { error: "bad request" });
        session.versions[lang as Lang] = reviseVersion(session.source, session.versions[lang as Lang], field, text);
        opts.onChange?.(session);
        return send(200, session.versions[lang as Lang]);
      }
      if (req.method === "POST" && req.url === "/api/publish") {
        const { lang } = await readJson(req);
        if (!LANGS.includes(lang)) return send(400, { error: "bad request" });
        try {
          const out = publishVersion(session.versions[lang as Lang]);
          if (opts.publishDir) {
            mkdirSync(opts.publishDir, { recursive: true });
            writeFileSync(join(opts.publishDir, `${lang}.json`), JSON.stringify(out, null, 2));
          }
          return send(200, out);
        } catch (e) {
          if (e instanceof BlockedError) return send(409, { error: e.message });
          throw e;
        }
      }
      send(404, { error: "not found" });
    } catch {
      send(500, { error: "server error" });
    }
  });
}
