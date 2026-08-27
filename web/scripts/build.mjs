// Offline, zero-dependency static build for the agentic-canvas-os Vercel
// Frontend. Spec: agenticgraph-acos-mcp-connector, task 11.3 (Vercel Frontend build
// target; R1, R11.3, R13, R15.7).
//
// WHY ZERO-DEPENDENCY (lenses: min-viable-max-value, tco-zero, token-economics):
// the reused `web/src/lib/*` modules are already plain, browser-compatible ESM
// and the thin `web/src/app/*` glue is hand-written ESM/HTML/CSS — so there is
// NOTHING to transpile or bundle. This build is just deterministic file
// assembly using ONLY Node built-ins. Consequences:
//   * `npm install` succeeds OFFLINE (no dependency tree to fetch);
//   * `npm run build` makes ZERO network/AWS/Cloudflare calls;
//   * Vercel serves `web/dist` as a static output (see vercel.json).
//
// WHAT IT DOES:
//   1. clean + recreate `web/dist`;
//   2. copy the thin app shell (index.html, main.js, components.js, styles.css);
//   3. GENERATE `dist/config.js` from a PUBLIC build-time env var so the
//      Agent_Api base URL is injected, never hard-coded (R1.1, R11.3);
//   4. copy the REUSED browser-safe `web/src/lib/*` view builders into
//      `dist/lib/` (excluding the Node-only `ai-gateway.js` scanner, which the
//      client never imports).
//
// SECRET SAFETY (R15.7): the generated config carries ONLY public deployment
// URLs — never a model provider key and never an auth signing secret.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..");
const SRC_APP = path.join(WEB_ROOT, "src", "app");
const SRC_LIB = path.join(WEB_ROOT, "src", "lib");
const DIST = path.join(WEB_ROOT, "dist");
const DIST_LIB = path.join(DIST, "lib");

/** App shell files copied verbatim into the bundle root. */
const APP_FILES = ["index.html", "main.js", "components.js", "styles.css"];

/**
 * Node-only `web/src/lib` modules the browser client never imports. Excluded so
 * the shipped bundle stays pure browser ESM (no `node:fs` import in the client).
 */
const LIB_EXCLUDE = new Set(["ai-gateway.js"]);

/** Public build-time env var names for the Worker/MCP base URL (first set wins). */
const AGENT_API_ENV_NAMES = [
  "MCP_ENDPOINT",
  "WORKER_URL",
  "NEXT_PUBLIC_AGENT_API_URL",
  "VITE_AGENT_API_URL",
  "PUBLIC_AGENT_API_URL",
  "AGENT_API_URL",
];

/** Public build-time env var names for the optional AI Gateway base URL. */
const AI_GATEWAY_ENV_NAMES = [
  "NEXT_PUBLIC_AI_GATEWAY_URL",
  "VITE_AI_GATEWAY_URL",
  "PUBLIC_AI_GATEWAY_URL",
  "AI_GATEWAY_URL",
];

/** Public build-time env var names for the optional agenticgraph canvas base URL. */
const CANVAS_BASE_ENV_NAMES = [
  "NEXT_PUBLIC_CANVAS_BASE_URL",
  "VITE_CANVAS_BASE_URL",
  "PUBLIC_CANVAS_BASE_URL",
  "CANVAS_BASE_URL",
];

/** First non-empty env value among `names`, trimmed; "" when none set. */
function readEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Validate a configured base URL is an absolute http(s) URL (or empty). */
function assertPublicUrl(value, label) {
  if (value === "") return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute http(s) URL, got: ${value}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http/https, got: ${value}`);
  }
  return value;
}

function rimraf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function generateConfig(agentApiUrl, aiGatewayUrl, canvasBaseUrl) {
  return `// GENERATED at build time by scripts/build.mjs — do not edit.
// PUBLIC deployment values only (R11.3/R15.7): never a model key or auth secret.
export const AGENT_API_BASE_URL = ${JSON.stringify(agentApiUrl)};
export const AI_GATEWAY_BASE_URL = ${JSON.stringify(aiGatewayUrl)};
export const CANVAS_BASE_URL = ${JSON.stringify(canvasBaseUrl)};
`;
}

function main() {
  const agentApiUrl = assertPublicUrl(readEnv(AGENT_API_ENV_NAMES), "Agent_Api base URL");
  const aiGatewayUrl = assertPublicUrl(readEnv(AI_GATEWAY_ENV_NAMES), "AI Gateway base URL");
  const canvasBaseUrl = assertPublicUrl(readEnv(CANVAS_BASE_ENV_NAMES), "Canvas base URL");

  // 1. clean + recreate dist
  rimraf(DIST);
  fs.mkdirSync(DIST_LIB, { recursive: true });

  // 2. copy app shell
  for (const file of APP_FILES) {
    copyFile(path.join(SRC_APP, file), path.join(DIST, file));
  }

  // 3. generate config.js from the public env var (injected, never hard-coded)
  fs.writeFileSync(path.join(DIST, "config.js"), generateConfig(agentApiUrl, aiGatewayUrl, canvasBaseUrl), "utf8");

  // 4. copy reused browser-safe lib modules
  const libFiles = fs
    .readdirSync(SRC_LIB, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".js") && !LIB_EXCLUDE.has(e.name))
    .map((e) => e.name);
  for (const name of libFiles) {
    copyFile(path.join(SRC_LIB, name), path.join(DIST_LIB, name));
  }

  const emitted = [...APP_FILES, "config.js", ...libFiles.map((n) => `lib/${n}`)];
  process.stdout.write(
    `web build complete -> ${path.relative(WEB_ROOT, DIST)}\n` +
      `  Agent_Api base URL: ${agentApiUrl || "(same origin — none set)"}\n` +
      `  AI Gateway base URL: ${aiGatewayUrl || "(none set)"}\n` +
      `  Canvas base URL: ${canvasBaseUrl || "(none set — canvas embed hidden)"}\n` +
      `  artifacts (${emitted.length}): ${emitted.join(", ")}\n`,
  );
}

main();
