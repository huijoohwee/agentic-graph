// AI Gateway routing + frontend spend-isolation static scan — build-time
// (node:test) assertion for the Vercel Frontend tier (agentic-graph-acos-mcp-connector
// spec, task 7.12 / R11.3, R11.5 / design Frontend "any model call routes
// through Cloudflare AI Gateway (R11.3)" + static-scan note "no model provider
// keys exist in the ... Frontend tier (R11.1, R11.3, R11.5)").
//
// Two concerns, ZERO network/browser:
//   1. ROUTING — `routeThroughAiGateway` builds ONLY AI-Gateway-based URLs and
//      rejects any direct paid-provider host (R11.3 / R11.5).
//   2. STATIC SCAN — the real Frontend source tree (`web/src`, tests excluded)
//      carries NO direct paid-provider host literal in a URL position and NO
//      model provider key literal; AND the scanner is NOT vacuously passing —
//      it catches a PLANTED direct host and a PLANTED key in a sample string.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  routeThroughAiGateway,
  buildAiGatewayBaseUrl,
  assertAiGatewayUrl,
  assertNotDirectProviderUrl,
  isAiGatewayUrl,
  isPaidProviderHost,
  hostOf,
  AiGatewayRoutingError,
  CLOUDFLARE_AI_GATEWAY_HOST,
  PAID_PROVIDER_HOSTS,
  findDirectProviderHostUsages,
  findModelProviderKeyLiterals,
  scanSourceTreeForProviderHosts,
  scanSourceTreeForModelKeys,
} from "../src/lib/ai-gateway.js";

// --- Fixtures ----------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "../src");

const ACCOUNT_ID = "acct_demo_123";
const GATEWAY_ID = "agentic-graph-gw";

// --- 1. routeThroughAiGateway builds ONLY AI-Gateway-based URLs --------------

test("routeThroughAiGateway: builds a URL on the AI Gateway host only", () => {
  const url = routeThroughAiGateway({
    accountId: ACCOUNT_ID,
    gatewayId: GATEWAY_ID,
    provider: "openai",
    path: "chat/completions",
  });

  assert.equal(hostOf(url), CLOUDFLARE_AI_GATEWAY_HOST);
  assert.equal(isAiGatewayUrl(url), true);
  assert.equal(
    url,
    `https://${CLOUDFLARE_AI_GATEWAY_HOST}/v1/${ACCOUNT_ID}/${GATEWAY_ID}/openai/chat/completions`,
  );
});

test("routeThroughAiGateway: works without a provider/path (base only)", () => {
  const url = routeThroughAiGateway({ accountId: ACCOUNT_ID, gatewayId: GATEWAY_ID });
  assert.equal(url, buildAiGatewayBaseUrl({ accountId: ACCOUNT_ID, gatewayId: GATEWAY_ID }));
  assert.equal(isAiGatewayUrl(url), true);
});

test("routeThroughAiGateway: requires accountId and gatewayId", () => {
  for (const bad of [
    {},
    { accountId: ACCOUNT_ID },
    { gatewayId: GATEWAY_ID },
    { accountId: "", gatewayId: GATEWAY_ID },
    { accountId: ACCOUNT_ID, gatewayId: "  " },
  ]) {
    assert.throws(() => routeThroughAiGateway(bad), (err) => {
      assert.ok(err instanceof AiGatewayRoutingError);
      assert.equal(err.code, "missing_gateway_ids");
      return true;
    });
  }
});

// --- 1b. Direct provider hosts are rejected everywhere -----------------------

test("assertAiGatewayUrl: rejects every known direct paid-provider host", () => {
  for (const host of PAID_PROVIDER_HOSTS) {
    const direct = `https://${host}/v1/chat/completions`;
    assert.equal(isPaidProviderHost(host), true, `${host} must be a known paid host`);
    assert.throws(() => assertAiGatewayUrl(direct), (err) => {
      assert.ok(err instanceof AiGatewayRoutingError);
      assert.equal(err.code, "direct_provider_host");
      return true;
    }, `direct host ${host} must be rejected`);
  }
});

test("assertAiGatewayUrl: rejects a subdomain of a paid-provider host", () => {
  assert.equal(isPaidProviderHost("eu.api.openai.com"), true);
  assert.throws(
    () => assertAiGatewayUrl("https://eu.api.openai.com/v1/chat"),
    AiGatewayRoutingError,
  );
});

test("assertAiGatewayUrl: rejects any non-gateway host", () => {
  assert.throws(() => assertAiGatewayUrl("https://example.com/x"), (err) => {
    assert.equal(err.code, "non_gateway_host");
    return true;
  });
});

test("assertAiGatewayUrl: rejects a non-absolute URL", () => {
  assert.throws(() => assertAiGatewayUrl("/relative/path"), (err) => {
    assert.equal(err.code, "invalid_url");
    return true;
  });
});

test("assertNotDirectProviderUrl: blocks a direct host but passes the gateway", () => {
  assert.throws(
    () => assertNotDirectProviderUrl("https://api.anthropic.com/v1/messages"),
    AiGatewayRoutingError,
  );
  const gw = routeThroughAiGateway({ accountId: ACCOUNT_ID, gatewayId: GATEWAY_ID, provider: "anthropic" });
  assert.equal(assertNotDirectProviderUrl(gw), gw);
});

// --- 2. Static scan of the REAL frontend source tree -------------------------

test("web/src carries NO direct paid-provider host literal in a URL position (R11.5)", () => {
  // The deny-list module itself lists bare hostnames; exclude it from the host
  // scan because that file is the routing/deny-list source of truth (it never
  // *invokes* a provider — bare hostnames are not `//host` URL usages anyway).
  const result = scanSourceTreeForProviderHosts(WEB_SRC, {
    excludeFiles: [path.join(WEB_SRC, "lib", "ai-gateway.js")],
  });

  assert.equal(result.scanned, true, "web/src must be present and scanned");
  assert.ok(result.files.length > 0, "scanned at least one source file");
  assert.deepEqual(
    result.findings,
    [],
    `no direct paid-provider host may be invoked from the Frontend; found: ${JSON.stringify(result.findings)}`,
  );
});

test("web/src carries NO model provider key literal (R11.1 / R11.5)", () => {
  const result = scanSourceTreeForModelKeys(WEB_SRC);
  assert.equal(result.scanned, true, "web/src must be present and scanned");
  assert.ok(result.files.length > 0, "scanned at least one source file");
  assert.deepEqual(
    result.findings,
    [],
    `no model provider key may ship in the Frontend; found: ${JSON.stringify(result.findings)}`,
  );
});

// --- 2b. The scanner is NOT vacuously passing --------------------------------

test("scanner DETECTS a planted direct-host usage in a sample string", () => {
  const planted = [
    'const res = await fetch("https://api.openai.com/v1/chat/completions");',
    "const alt = fetch('//api.anthropic.com/v1/messages');",
  ].join("\n");

  const hits = findDirectProviderHostUsages(planted);
  const hosts = hits.map((h) => h.host).sort();
  assert.ok(hosts.includes("api.openai.com"), "planted OpenAI host must be caught");
  assert.ok(hosts.includes("api.anthropic.com"), "planted Anthropic host must be caught");
});

test("a bare hostname in a deny-list position is NOT flagged (no self-trip)", () => {
  // Exactly how PAID_PROVIDER_HOSTS stores them: bare, quoted, no `//`.
  const denyListStyle = 'const HOSTS = ["api.openai.com", "api.stripe.com"];';
  assert.deepEqual(findDirectProviderHostUsages(denyListStyle), []);
});

test("scanner DETECTS planted model provider key literals in a sample string", () => {
  const planted = [
    'const a = "sk-ABCDEF0123456789ABCDEF0123456789";',
    'const b = "sk-ant-api03-ABCDEF0123456789ABCDEF0123456789";',
    'const c = "sk_live_ABCDEF0123456789ABCDEF";',
    'const openaiApiKey = "totally-real-looking-secret-value-123456";',
  ].join("\n");

  const hits = findModelProviderKeyLiterals(planted);
  assert.ok(hits.length >= 4, `planted keys must be caught; got ${JSON.stringify(hits)}`);
  const kinds = new Set(hits.map((h) => h.kind));
  assert.ok(kinds.has("openai/anthropic-sk"));
  assert.ok(kinds.has("stripe-secret"));
  assert.ok(kinds.has("identifier-assigned"));
});

test("key scanner ALLOWS env-name / process.env references (R15.7-style)", () => {
  const clean = [
    'const openaiApiKey = process.env.OPENAI_API_KEY;',
    'const k = "OPENAI_API_KEY";',
    'const stripeSecret = env["STRIPE_SECRET_KEY"];',
    'const placeholder = "set-me";',
  ].join("\n");
  assert.deepEqual(findModelProviderKeyLiterals(clean), []);
});
