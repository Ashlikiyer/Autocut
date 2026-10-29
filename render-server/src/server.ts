// AutoCut overlay server: renders the hero cards (hook, pills, step cards,
// focus titles) with HyperFrames and returns a transparent WebM.
// It receives only card text and timings — never the user's video.
//
//   npm start            (PORT=4100, ALLOWED_ORIGINS=http://localhost:3000)
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { renderCards } from "./render.ts";

const PORT = Number(process.env.PORT ?? 4100);
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map((o) => o.trim());
const MAX_BODY = 64 * 1024;
const MAX_QUEUE = Number(process.env.MAX_QUEUE ?? 4);

// Renders are CPU-heavy: run one at a time, queue a few, refuse the rest.
let chain: Promise<unknown> = Promise.resolve();
let waiting = 0;
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  waiting++;
  const next = chain.then(job, job).finally(() => waiting--);
  chain = next.catch(() => {});
  return next;
}

function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin ?? "";
  if (ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "X-Overlay-Segments, X-Render-Seconds");
  }
  // The web app is cross-origin isolated (COEP), so responses must opt in.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, waiting });
  if (req.method !== "POST" || req.url !== "/cards") return json(res, 404, { error: "NOT_FOUND" });
  if (req.headers.origin && !ORIGINS.includes(req.headers.origin)) return json(res, 403, { error: "FORBIDDEN" });
  if (waiting >= MAX_QUEUE) return json(res, 429, { error: "BUSY" });

  let input: unknown;
  try {
    input = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: "BAD_REQUEST" });
  }
  try {
    const result = await enqueue(() => renderCards(input));
    res.writeHead(200, {
      "Content-Type": "video/webm",
      "Content-Length": result.webm.length,
      "X-Overlay-Segments": JSON.stringify(result.segments),
      "X-Render-Seconds": result.seconds.toFixed(1),
    });
    res.end(result.webm);
    console.log(`[cards] ${result.segments.length} cards in ${result.seconds.toFixed(1)} s`);
  } catch (err) {
    if (err instanceof ZodError) return json(res, 400, { error: "BAD_REQUEST" });
    console.error("[cards] render failed", err);
    json(res, 500, { error: "RENDER_FAILED" });
  }
}).listen(PORT, () => console.log(`AutoCut overlay server on http://localhost:${PORT} (origins: ${ORIGINS.join(", ")})`));
