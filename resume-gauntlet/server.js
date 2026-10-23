// Resume Gauntlet: a small local server that serves the app and calls Claude for it.
// The Anthropic API key stays here, on the server; the browser never sees it.
//
//   npm install
//   npm run set-key         (Windows: saves ANTHROPIC_API_KEY to your user environment; then open a new terminal)
//   npm start
// On macOS or Linux, export ANTHROPIC_API_KEY or put it in a .env file instead.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));

// Optional .env fallback for systems without a saved environment variable. Real environment variables win.
const envFile = path.join(here, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const PORT = Number(process.env.PORT) || 3000;
// Localhost only by default: anyone who can reach this server can spend your API credit.
const HOST = process.env.HOST || "127.0.0.1";
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
// The page asks for a tier per call; it maps to how hard the model thinks, not to a different model.
const EFFORT = { quick: "low", default: "medium", complex: "high" };
const MAX_PROMPT_BYTES = 256 * 1024;

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasKey ? new Anthropic() : null;

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("too large"), { code: "prompt_too_large" })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Maps SDK errors to the codes the page already understands.
function errorCode(err) {
  if (err instanceof Anthropic.AuthenticationError) return "bad_key";
  if (err instanceof Anthropic.PermissionDeniedError) return "no_credit";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.BadRequestError) return "invalid_request";
  return "upstream_error";
}

// Streams Claude's answer back as newline-delimited JSON: {"delta": "..."} lines, then {"done": true, ...}.
async function handleClaude(req, res) {
  if (!client) return sendJson(res, 503, { error: { code: "no_key", message: "ANTHROPIC_API_KEY is not set on the server." } });
  // Only this app's own page may call the endpoint (blocks other websites from using your key).
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
    return sendJson(res, 403, { error: { code: "invalid_request", message: "Cross-origin requests are not allowed." } });
  }
  let input;
  try {
    input = JSON.parse(await readBody(req, MAX_PROMPT_BYTES + 1024));
  } catch (e) {
    return sendJson(res, 400, { error: { code: e.code || "invalid_request", message: "Send JSON with a prompt string." } });
  }
  const prompt = typeof input?.prompt === "string" ? input.prompt : "";
  if (!prompt.trim()) return sendJson(res, 400, { error: { code: "invalid_request", message: "The prompt is empty." } });
  if (Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) return sendJson(res, 413, { error: { code: "prompt_too_large", message: "The prompt is too long." } });
  const effort = EFFORT[input.tier] || EFFORT.default;

  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
  const write = obj => res.write(JSON.stringify(obj) + "\n");

  // Server-side refusal fallback is on: if the model declines a request, the API re-runs it on a
  // fallback model it chooses by refusal category, inside the same call.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    output_config: { effort },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: prompt }],
  });
  // Stop paying for output nobody will read when the page cancels or closes.
  res.on("close", () => { if (!res.writableEnded) stream.abort(); });

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") write({ delta: event.delta.text });
    }
    const message = await stream.finalMessage();
    write({ done: true, stop_reason: message.stop_reason, model: message.model });
  } catch (err) {
    if (res.destroyed) return;
    console.error(`[claude] ${err?.status ?? ""} ${err?.message ?? err}`);
    write({ error: { code: errorCode(err), message: err?.message || "" } });
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  res.setHeader("x-content-type-options", "nosniff");
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = await readFile(path.join(here, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      return res.end(html);
    }
    if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { ok: hasKey, model: MODEL });
    if (req.method === "POST" && url.pathname === "/api/claude") return await handleClaude(req, res);
    sendJson(res, 404, { error: { code: "not_found", message: "Not found." } });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: { code: "upstream_error", message: "Server error." } });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Resume Gauntlet is running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(hasKey ? `Using ${MODEL}.` : process.platform === "win32"
    ? "ANTHROPIC_API_KEY is not set. Run npm run set-key, then open a new terminal and run npm start again."
    : "ANTHROPIC_API_KEY is not set. Export it in your shell or add it to a .env file (see .env.example).");
});
