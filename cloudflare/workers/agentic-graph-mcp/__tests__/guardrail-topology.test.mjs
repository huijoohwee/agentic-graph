import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mcpConfigUrl = new URL("../wrangler.toml", import.meta.url);
const travelConfigUrl = new URL("../../agentic-graph-travel-commerce/wrangler.jsonc", import.meta.url);
const travelEntryUrl = new URL("../../agentic-graph-travel-commerce/src/index.ts", import.meta.url);
const mcpEntryUrl = new URL("../index.ts", import.meta.url);

test("every lane uses the same-lane named Guardrail entrypoint and only mandatory secrets", async () => {
  const mcp = await readFile(mcpConfigUrl, "utf8");
  const stagingAt = mcp.indexOf("[env.staging]");
  const devAt = mcp.indexOf("[env.dev]");
  assert(stagingAt > 0 && devAt > stagingAt);
  const production = mcp.slice(0, stagingAt);
  const staging = mcp.slice(stagingAt, devAt);
  const dev = mcp.slice(devAt);
  assertGuardrailBinding(production, "agentic-travel-commerce-production");
  assertGuardrailBinding(staging, "agentic-travel-commerce-staging");
  assertGuardrailBinding(dev, "agentic-travel-commerce");
  for (const lane of [production, staging, dev]) {
    assert.match(lane, /required = \[ "AGENTIC_OS_AGENT_RUNTIME_BEARER_TOKEN" \]/);
    assert.doesNotMatch(lane, /required = \[[^\]]*(?:EXA_API_KEY|BYTEPLUS_API_KEY|STRYTREE_API_KEY)/);
  }

  const travel = JSON.parse(await readFile(travelConfigUrl, "utf8"));
  for (const lane of [travel, travel.env.staging, travel.env.production]) {
    assert.deepEqual(lane.secrets.required, [
      "TRAVEL_COMMERCE_API_TOKEN", "RECONCILIATION_OPERATOR_TOKEN", "INFERENCE_OVERFLOW_TOKEN",
      "CHECKOUT_PROVIDER_AUTH_SECRET", "MARKETPLACE_PROVIDER_AUTH_SECRET",
    ]);
    assert.equal(lane.vars.TRAVEL_GUARDRAIL_RETRY_BOUND, "3");
    assert.equal(lane.vars.TRAVEL_INTENT_MIN_BUDGET_MINOR, "1");
    assert.equal(lane.vars.TRAVEL_INTENT_MAX_BUDGET_MINOR, "9007199254740991");
  }
  assert.match(await readFile(travelEntryUrl, "utf8"),
    /export \{ BundleGraphStore, CommerceCheckoutStore, EnvelopeLedger, TravelAgencyGuardrailService \}/);
});

test("production exposes only authenticated control-plane ingress while the component route stays service-only", async () => {
  const mcp = await readFile(mcpConfigUrl, "utf8");
  const stagingAt = mcp.indexOf("[env.staging]");
  const devAt = mcp.indexOf("[env.dev]");
  const production = mcp.slice(0, stagingAt);
  const staging = mcp.slice(stagingAt, devAt);
  const dev = mcp.slice(devAt);
  assert.match(production, /workers_dev = false/);
  assert.match(production, /preview_urls = false/);
  assert.doesNotMatch(production, /pattern = "[^"]*\/v1(?:\/|\")/);
  assert.match(production, /pattern = "airvio\.co\/agentic-os\/control-plane\/agents\/\*"/);
  assert.match(staging, /workers_dev = false/);
  assert.match(staging, /routes = \[\]/);
  assert.match(dev, /TRAVEL_DISCOVERY_MODE = "deterministic-demo"/);

  const entry = await readFile(mcpEntryUrl, "utf8");
  assert.match(entry,
    /handleTravelCommerceOfferIngress\(request, env, \{\s*authorize: authorizeRuntimeRequest,\s*route: handleTravelCommerceServiceRoute,/s);
  assert.ok(entry.indexOf("handleTravelCommerceOfferIngress(request, env")
    < entry.indexOf("handleTravelCommerceServiceRoute(request, env)"));
});

function assertGuardrailBinding(section, service) {
  assert.match(section, new RegExp(
    `binding = "TRAVEL_GUARDRAIL"\\s+service = "${service}"\\s+entrypoint = "TravelAgencyGuardrailService"`,
  ));
}
