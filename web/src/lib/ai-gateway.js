// Cloudflare AI Gateway routing helper + frontend spend-isolation scanner.
//
// Spec: agentic-graph-acos-mcp-connector, task 7.12 (R11.3, R11.5; also R11.2, R11.4;
// design Frontend "any model call routes through Cloudflare AI Gateway (R11.3)"
// + Tech Stack "Hard boundary rule (R11.1–11.5)" + Correctness Property /
// static-scan note "Secret-scan that no model provider keys exist in the ...
// Frontend tier (R11.1, R11.3, R11.5)").
//
// PURPOSE (R11.3 / R11.5): the Vercel Frontend tier holds NO model provider keys
// and MUST NOT invoke any paid model provider endpoint directly. Any client-side
// model call MUST be routed through the Cloudflare AI Gateway base ONLY. This
// module is the single chokepoint that:
//
//   (a) ROUTING — `routeThroughAiGateway(...)` constructs a model-call URL from
//       the Cloudflare AI Gateway base ONLY. It rejects any attempt to target a
//       direct paid-provider host, so a direct provider URL can never be built
//       here (`buildAiGatewayBaseUrl`, `assertAiGatewayUrl`,
//       `assertNotDirectProviderUrl`, `isAiGatewayUrl`, `isPaidProviderHost`).
//
//   (b) STATIC SCAN — pure, deterministic, filesystem-only checks the build-time
//       (node:test) assertion is built from: scan the Frontend source tree and
//       assert NO direct paid-provider host literal appears in a URL position
//       and NO model provider key literal ships in the source/bundle
//       (`findDirectProviderHostUsages`, `findModelProviderKeyLiterals`,
//       `scanSourceTreeForProviderHosts`, `scanSourceTreeForModelKeys`).
//
// This mirrors the reusable secret-hygiene scanner pattern from
// `aws/agent-api/src/lib/secret-hygiene.js` but is a MINIMAL, self-contained
// frontend re-implementation so the Vercel tier stays framework-agnostic with
// ZERO cross-tier coupling and ZERO network/browser dependency.

import fs from "node:fs";
import path from "node:path";

// --- AI Gateway routing constants -------------------------------------------

/** The ONLY host any client-side model call may target (R11.3). */
export const CLOUDFLARE_AI_GATEWAY_HOST = "gateway.ai.cloudflare.com";

/**
 * The Cloudflare AI Gateway universal base URL PATTERN. Concrete calls supply a
 * real `accountId` + `gatewayId`; the placeholders document the route shape and
 * are never persisted in the client bundle (account/gateway ids are operator
 * deployment values supplied at call time).
 */
export const AI_GATEWAY_BASE_PATTERN =
  `https://${CLOUDFLARE_AI_GATEWAY_HOST}/v1/{account_id}/{gateway_id}`;

/**
 * Paid model-provider hosts the Frontend MUST NEVER invoke directly (R11.5).
 * Stored as BARE hostnames; the scanner flags them only when they appear in a
 * URL position (`//host`), so listing them here for the deny-check does not
 * self-trip the static scan. Subdomains of these hosts are also rejected.
 */
export const PAID_PROVIDER_HOSTS = Object.freeze([
  "api.openai.com",
  "api.anthropic.com",
  "api.deepseek.com",
  "api.mistral.ai",
  "api.cohere.ai",
  "api.cohere.com",
  "api.groq.com",
  "api.together.xyz",
  "api.together.ai",
  "api.perplexity.ai",
  "generativelanguage.googleapis.com",
  "api.x.ai",
  "ark.cn-beijing.volces.com", // BytePlus / ModelArk (Volcengine ARK)
  "ark.ap-southeast.bytepluses.com",
  "maas-api.ml-platform-cn-beijing.volces.com",
  "open.volcengineapi.com",
  "api.byteplus.com",
  "api.stripe.com", // Stripe model/commerce calls stay server-side (control plane)
]);

/**
 * Model-provider API key literal patterns the Frontend bundle MUST NEVER carry
 * (R11.1 / R11.5). These are well-known provider key shapes; matching is on the
 * raw source text so a planted key is caught regardless of how it is assigned.
 */
export const MODEL_PROVIDER_KEY_PATTERNS = Object.freeze([
  // OpenAI / Anthropic project & user keys: sk-... / sk-ant-... / sk-proj-...
  { name: "openai/anthropic-sk", re: /sk-(?:ant-|proj-|live-)?[A-Za-z0-9_-]{20,}/g },
  // Stripe secret / restricted keys: sk_live_ / sk_test_ / rk_live_ / rk_test_
  { name: "stripe-secret", re: /[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  // Google AI Studio keys: AIza...
  { name: "google-aistudio", re: /AIza[A-Za-z0-9_-]{30,}/g },
  // Volcengine / BytePlus ARK keys are UUID-ish bearer tokens; flag the common
  // ARK_API_KEY-style 32+ hex/uuid bearer when prefixed as a model bearer.
  { name: "ark-bearer", re: /\b(?:ark|byteplus|modelark)[-_][A-Za-z0-9]{24,}\b/gi },
]);

/**
 * Identifier names that denote a MODEL provider key. Used for assignment-style
 * detection (`provider...key = "<long value>"`) so an inlined key bound to a
 * provider-named variable is caught even if its shape is non-standard.
 */
const MODEL_KEY_IDENTIFIER =
  /(openai|anthropic|deepseek|mistral|cohere|groq|together|perplexity|gemini|google_?ai|byteplus|modelark|volc|stripe)[_a-z0-9]*(apikey|api_key|key|secret|token)/i;

/** Minimum length for an assigned literal to be considered a real key value. */
export const SUSPICIOUS_KEY_MIN_LENGTH = 16;

// --- Routing errors ----------------------------------------------------------

/** Raised when a model-call URL cannot be safely routed through the gateway. */
export class AiGatewayRoutingError extends Error {
  constructor(message, code = "ai_gateway_routing_error") {
    super(message);
    this.name = "AiGatewayRoutingError";
    this.code = code;
  }
}

// --- Routing helpers ---------------------------------------------------------

/**
 * Parse a URL string, returning the lowercased hostname or `null` when the
 * value is not a parseable absolute URL.
 *
 * @param {unknown} url
 * @returns {string|null}
 */
export function hostOf(url) {
  if (typeof url !== "string" || url.length === 0) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Is `host` a paid model-provider host (exact match or a subdomain of one)?
 *
 * @param {unknown} host bare hostname (e.g. `api.openai.com`)
 * @returns {boolean}
 */
export function isPaidProviderHost(host) {
  if (typeof host !== "string" || host.length === 0) return false;
  const h = host.toLowerCase();
  return PAID_PROVIDER_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

/**
 * Is `url` an AI Gateway URL (its host is exactly the Cloudflare AI Gateway
 * host)? Subdomains are intentionally NOT accepted — the single allowed host.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function isAiGatewayUrl(url) {
  return hostOf(url) === CLOUDFLARE_AI_GATEWAY_HOST;
}

/**
 * Assert a constructed URL targets the AI Gateway host ONLY (R11.3). Throws an
 * {@link AiGatewayRoutingError} otherwise.
 *
 * @param {string} url
 * @returns {string} the same url when valid
 */
export function assertAiGatewayUrl(url) {
  const host = hostOf(url);
  if (host === null) {
    throw new AiGatewayRoutingError(`not an absolute URL: ${String(url)}`, "invalid_url");
  }
  if (isPaidProviderHost(host)) {
    throw new AiGatewayRoutingError(
      `direct paid-provider host is forbidden from the Frontend: ${host} (R11.5)`,
      "direct_provider_host",
    );
  }
  if (host !== CLOUDFLARE_AI_GATEWAY_HOST) {
    throw new AiGatewayRoutingError(
      `model calls must route through ${CLOUDFLARE_AI_GATEWAY_HOST} only, got: ${host} (R11.3)`,
      "non_gateway_host",
    );
  }
  return url;
}

/**
 * Assert `url` does NOT target a direct paid-provider host (R11.5). Throws an
 * {@link AiGatewayRoutingError} when it does; otherwise returns the url.
 *
 * @param {string} url
 * @returns {string}
 */
export function assertNotDirectProviderUrl(url) {
  const host = hostOf(url);
  if (host !== null && isPaidProviderHost(host)) {
    throw new AiGatewayRoutingError(
      `direct paid-provider host is forbidden from the Frontend: ${host} (R11.5)`,
      "direct_provider_host",
    );
  }
  return url;
}

/**
 * Build the concrete Cloudflare AI Gateway base URL for a deployment.
 *
 * @param {{ accountId: string, gatewayId: string }} cfg operator deployment ids
 * @returns {string} `https://gateway.ai.cloudflare.com/v1/<accountId>/<gatewayId>`
 */
export function buildAiGatewayBaseUrl({ accountId, gatewayId } = {}) {
  const acct = typeof accountId === "string" ? accountId.trim() : "";
  const gw = typeof gatewayId === "string" ? gatewayId.trim() : "";
  if (acct.length === 0 || gw.length === 0) {
    throw new AiGatewayRoutingError(
      "accountId and gatewayId are required to build the AI Gateway base URL",
      "missing_gateway_ids",
    );
  }
  return `https://${CLOUDFLARE_AI_GATEWAY_HOST}/v1/${encodeURIComponent(acct)}/${encodeURIComponent(gw)}`;
}

/**
 * Construct a client-side model-call URL routed through the Cloudflare AI
 * Gateway base ONLY (R11.3). The provider segment selects the upstream the
 * gateway proxies to (e.g. `openai`, `anthropic`); the path is appended after
 * it. The resulting URL is asserted to target the AI Gateway host, so a direct
 * paid-provider host can never be produced here (R11.5).
 *
 * @param {object} args
 * @param {string} args.accountId Cloudflare account id (deployment value)
 * @param {string} args.gatewayId AI Gateway id (deployment value)
 * @param {string} [args.provider] gateway provider segment (e.g. `openai`)
 * @param {string} [args.path] provider path (e.g. `chat/completions`)
 * @returns {string} an AI-Gateway-based model-call URL
 */
export function routeThroughAiGateway({ accountId, gatewayId, provider = "", path: callPath = "" } = {}) {
  const base = buildAiGatewayBaseUrl({ accountId, gatewayId });

  const segments = [base];
  if (typeof provider === "string" && provider.trim().length > 0) {
    segments.push(encodeURIComponent(provider.trim()));
  }
  const cleanPath = String(callPath || "").replace(/^\/+/, "");
  if (cleanPath.length > 0) segments.push(cleanPath);

  const url = segments.join("/");
  // Defense-in-depth: the constructed URL MUST target the AI Gateway host only.
  return assertAiGatewayUrl(url);
}

// --- Source-tree walking (minimal, self-contained) --------------------------

/** File extensions scanned by default (frontend source + built artifacts). */
export const DEFAULT_SOURCE_EXTENSIONS = Object.freeze([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
]);

/** Directory names never walked (deps, VCS, build caches, AND tests). */
export const DEFAULT_EXCLUDED_DIRS = Object.freeze([
  "node_modules", ".git", ".wrangler", "dist", "build", "coverage",
  ".next", "out", ".turbo", ".cache", "__tests__",
]);

/**
 * Recursively list files under `rootDir`, filtered by extension and excluding
 * configured directory names (and any explicit `excludeFiles`). Returns sorted
 * absolute paths. A non-existent root yields an empty list.
 *
 * @param {string} rootDir
 * @param {object} [opts]
 * @param {readonly string[]} [opts.extensions]
 * @param {readonly string[]} [opts.excludeDirs]
 * @param {readonly string[]} [opts.excludeFiles] absolute paths to skip
 * @returns {string[]}
 */
export function listSourceFiles(rootDir, opts = {}) {
  const extensions = opts.extensions ?? DEFAULT_SOURCE_EXTENSIONS;
  const excludeDirs = new Set(opts.excludeDirs ?? DEFAULT_EXCLUDED_DIRS);
  const excludeFiles = new Set((opts.excludeFiles ?? []).map((f) => path.resolve(f)));
  const out = [];
  if (!rootDir || !fs.existsSync(rootDir)) return out;

  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!excludeDirs.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        if (excludeFiles.has(path.resolve(full))) continue;
        if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
      }
    }
  }
  return out.sort();
}

// --- (a) Direct paid-provider host literal detection ------------------------

/**
 * Find DIRECT paid-provider host usages in source text: a forbidden host that
 * appears in a URL position (`//host` — i.e. `https://host`, `http://host`, or
 * protocol-relative `//host`). Listing a bare hostname in a deny-list does NOT
 * match, so this module's own `PAID_PROVIDER_HOSTS` array never self-trips.
 *
 * @param {string} sourceText
 * @returns {{ host: string, index: number }[]}
 */
export function findDirectProviderHostUsages(sourceText) {
  if (typeof sourceText !== "string" || sourceText.length === 0) return [];
  const findings = [];
  for (const host of PAID_PROVIDER_HOSTS) {
    // `//host` boundary so `api.openai.com` only matches inside a URL, and a
    // host literal isn't matched as a substring of a longer (unrelated) host.
    const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`//${escaped}(?=[/:?#"'\`\\s]|$)`, "g");
    let m;
    while ((m = re.exec(sourceText)) !== null) {
      findings.push({ host, index: m.index });
    }
  }
  return findings;
}

// --- (b) Model provider key literal detection -------------------------------

/**
 * Find MODEL provider key literals in source text. Two complementary families:
 *   1. well-known provider key SHAPES ({@link MODEL_PROVIDER_KEY_PATTERNS});
 *   2. a long literal assigned to a provider-key-named identifier
 *      ({@link MODEL_KEY_IDENTIFIER}).
 * Each finding is `{ kind, identifier?, index }` (the raw value is NOT returned
 * so the scanner never echoes a detected secret).
 *
 * @param {string} sourceText
 * @returns {{ kind: string, identifier?: string, index: number }[]}
 */
export function findModelProviderKeyLiterals(sourceText) {
  if (typeof sourceText !== "string" || sourceText.length === 0) return [];
  const findings = [];

  // 1. Known provider key shapes anywhere in the text.
  for (const { name, re } of MODEL_PROVIDER_KEY_PATTERNS) {
    const scanner = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m;
    while ((m = scanner.exec(sourceText)) !== null) {
      findings.push({ kind: name, index: m.index });
      if (m.index === scanner.lastIndex) scanner.lastIndex++; // avoid zero-width loop
    }
  }

  // 2. provider-key-named identifier = "<long value>"
  const assignment = /([A-Za-z_$][\w$]*)\s*[:=]\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
  let a;
  while ((a = assignment.exec(sourceText)) !== null) {
    const identifier = a[1];
    const value = a[3];
    if (!MODEL_KEY_IDENTIFIER.test(identifier)) continue;
    if (isAllowedKeyValue(value)) continue;
    findings.push({ kind: "identifier-assigned", identifier, index: a.index });
  }

  return findings;
}

/** Allowed (non-leaking) values for a provider-key-named binding. */
function isAllowedKeyValue(value) {
  if (value.length === 0) return true;
  if (value.includes("process.env")) return true;
  if (value.startsWith("${") || value.includes("env[")) return true;
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) return true; // env KEY NAME reference
  if (value.length < SUSPICIOUS_KEY_MIN_LENGTH) return true; // placeholder-ish
  return false;
}

// --- Source-tree scans -------------------------------------------------------

/**
 * Scan a source tree for DIRECT paid-provider host usages.
 *
 * @param {string} rootDir
 * @param {object} [opts] forwarded to {@link listSourceFiles}
 * @returns {{ scanned: boolean, files: string[], findings: { file: string, host: string }[] }}
 */
export function scanSourceTreeForProviderHosts(rootDir, opts = {}) {
  const files = listSourceFiles(rootDir, opts);
  if (files.length === 0) return { scanned: false, files: [], findings: [] };
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const f of findDirectProviderHostUsages(text)) {
      findings.push({ file, host: f.host });
    }
  }
  return { scanned: true, files, findings };
}

/**
 * Scan a source tree for MODEL provider key literals.
 *
 * @param {string} rootDir
 * @param {object} [opts] forwarded to {@link listSourceFiles}
 * @returns {{ scanned: boolean, files: string[], findings: { file: string, kind: string, identifier?: string }[] }}
 */
export function scanSourceTreeForModelKeys(rootDir, opts = {}) {
  const files = listSourceFiles(rootDir, opts);
  if (files.length === 0) return { scanned: false, files: [], findings: [] };
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const f of findModelProviderKeyLiterals(text)) {
      findings.push({ file, kind: f.kind, identifier: f.identifier });
    }
  }
  return { scanned: true, files, findings };
}
