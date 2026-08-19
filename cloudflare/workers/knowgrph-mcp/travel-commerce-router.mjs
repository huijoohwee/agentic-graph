import { sharedAgentDefinitionCache } from "./agent-definition-cache.mjs";

export const TRAVEL_ROUTE_INTENT_PATH = "/v1/route-intent";
export const MCP_LIVE_PATH = "/livez";
export const MCP_READY_PATH = "/readyz";

const MCP_PATH = "/knowgrph/control-plane/mcp";
const MAX_REQUEST_BYTES = 16 * 1024;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,256}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const CONFIG_MODES = new Set(["live", "deterministic-demo"]);
const LIVE_PROVIDER_BINDINGS = Object.freeze({
  flight: "TRAVEL_DISCOVERY_HARNESS",
  experience: "TRAVEL_EXPERIENCE_DISCOVERY_HARNESS",
});
// The 10s parent cascade reserves its final 4s for ledger, settlement, commit,
// and archive. Discovery may not consume that recovery/safety tail budget.
const MAX_DISCOVERY_DEADLINE_MS = 6_000;

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  },
});

const isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const isIdentifier = (value) => typeof value === "string" && ID_PATTERN.test(value);
const normalizeCategory = (value) => typeof value === "string" ? value.trim().toLocaleLowerCase() : "";

const parseDefinitions = (value) => {
  let parsed;
  try {
    parsed = JSON.parse(String(value ?? ""));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 20) return null;
  const definitions = [];
  const agentIds = new Set();
  const categories = new Set();
  for (const item of parsed) {
    if (!isRecord(item) || Object.keys(item).some((key) => key !== "agentId" && key !== "declaredCategory")) return null;
    const category = normalizeCategory(item.declaredCategory);
    if (!isIdentifier(item.agentId) || category.length === 0 || category.length > 64) return null;
    if (agentIds.has(item.agentId) || categories.has(category)) return null;
    agentIds.add(item.agentId);
    categories.add(category);
    definitions.push(Object.freeze({
      agentId: item.agentId,
      declaredCategory: category,
      declaredToolAllowlist: Object.freeze(["discoverOffers"]),
      trustStatus: "declared-and-present",
      schemaRevision: "knowgrph.travel-discovery/v1",
      contentHash: `runtime:${item.agentId}`,
    }));
  }
  return Object.freeze(definitions);
};

const parseDemoRules = (value, definitions) => {
  let parsed;
  try {
    parsed = JSON.parse(String(value ?? ""));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const rules = {};
  for (const definition of definitions) {
    const rule = parsed[definition.declaredCategory];
    if (!isRecord(rule) || Object.keys(rule).some((key) => key !== "deltaMinor")) return null;
    if (typeof rule.deltaMinor !== "number" || !Number.isSafeInteger(rule.deltaMinor)) return null;
    rules[definition.declaredCategory] = Object.freeze({ deltaMinor: rule.deltaMinor });
  }
  return Object.freeze(rules);
};

const readConfig = (env) => {
  const definitions = parseDefinitions(env?.TRAVEL_AGENT_DEFINITIONS_JSON);
  const mode = String(env?.TRAVEL_DISCOVERY_MODE ?? "live").trim();
  const configuredDeadline = Number(env?.TRAVEL_DISCOVERY_DEADLINE_MS ?? MAX_DISCOVERY_DEADLINE_MS);
  const settlementCurrency = String(env?.TRAVEL_SETTLEMENT_CURRENCY ?? "").trim();
  const deadlineMs = Number.isInteger(configuredDeadline) && configuredDeadline > 0
    && configuredDeadline <= MAX_DISCOVERY_DEADLINE_MS
    ? configuredDeadline
    : null;
  const errors = [];
  if (!definitions) errors.push("TRAVEL_AGENT_DEFINITIONS_JSON");
  if (!CONFIG_MODES.has(mode)) errors.push("TRAVEL_DISCOVERY_MODE");
  if (deadlineMs === null) errors.push("TRAVEL_DISCOVERY_DEADLINE_MS");
  if (!CURRENCY_PATTERN.test(settlementCurrency)) errors.push("TRAVEL_SETTLEMENT_CURRENCY");
  const demoRules = mode === "deterministic-demo" && definitions
    ? parseDemoRules(env?.TRAVEL_DEMO_QUOTE_RULES_JSON, definitions)
    : null;
  if (mode === "deterministic-demo" && !demoRules) errors.push("TRAVEL_DEMO_QUOTE_RULES_JSON");
  const providers = {};
  const definitionCache = env?.TRAVEL_AGENT_DEFINITION_CACHE;
  if (!definitionCache || typeof definitionCache.get !== "function" || typeof definitionCache.put !== "function") {
    errors.push("TRAVEL_AGENT_DEFINITION_CACHE");
  }
  if (mode === "live" && definitions) {
    for (const definition of definitions) {
      const binding = LIVE_PROVIDER_BINDINGS[definition.declaredCategory];
      const provider = binding ? env?.[binding] : null;
      if (!binding) {
        errors.push(`TRAVEL_PROVIDER_MAP.${definition.declaredCategory}`);
      } else if (!provider || typeof provider.fetch !== "function") {
        errors.push(binding);
      } else {
        providers[definition.declaredCategory] = provider;
      }
    }
  }
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    definitions: definitions ?? Object.freeze([]),
    mode,
    deadlineMs: deadlineMs ?? MAX_DISCOVERY_DEADLINE_MS,
    settlementCurrency,
    demoRules,
    providers: Object.freeze(providers),
    definitionCache,
  });
};

const readBoundedJson = async (request) => {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const readBoundedResponseJson = async (response) => {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    if (response.body) await response.body.cancel();
    return null;
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return null;
  try {
    const value = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
};

const parseIntentRequest = (value) => {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "operation" && key !== "intent")) return null;
  if (value.operation !== "routeIntent" || !isRecord(value.intent)) return null;
  const intent = value.intent;
  if (Object.keys(intent).some((key) => !["intentId", "category", "constraints"].includes(key))) return null;
  if (!isRecord(intent.constraints)) return null;
  const constraints = intent.constraints;
  if (Object.keys(constraints).some((key) => ![
    "bundle_id", "changed_leg_id", "prior_offer_id", "prior_amount_minor",
  ].includes(key))) return null;
  const category = normalizeCategory(intent.category);
  if (
    typeof intent.intentId !== "string" || !INTENT_ID_PATTERN.test(intent.intentId)
    || category.length === 0 || category.length > 64
    || !isIdentifier(constraints.bundle_id)
    || !isIdentifier(constraints.changed_leg_id)
    || !(constraints.prior_offer_id === null || isIdentifier(constraints.prior_offer_id))
    || !(constraints.prior_amount_minor === null || (
      typeof constraints.prior_amount_minor === "number"
      && Number.isSafeInteger(constraints.prior_amount_minor)
      && constraints.prior_amount_minor >= 0
    ))
  ) return null;
  const targetLegId = intent.intentId.slice(intent.intentId.lastIndexOf(":") + 1);
  if (!isIdentifier(targetLegId)) return null;
  return Object.freeze({
    intent: Object.freeze({
      intentId: intent.intentId,
      category,
      constraints: Object.freeze({ ...constraints }),
    }),
    targetLegId,
  });
};

const readStringRecord = (value) => {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 32 || entries.some(([key, item]) => (
    !isIdentifier(key) || typeof item !== "string" || item.length > 1_024
  ))) return null;
  return Object.freeze(Object.fromEntries(entries));
};

const parseQuote = (value, dispatch, expectedLegId, expectedCurrency) => {
  if (!isRecord(value)) return null;
  const provenance = readStringRecord(value.provenance);
  if (
    value.kind !== "offer"
    || value.legId !== expectedLegId
    || !isIdentifier(value.offerId)
    || value.agentId !== dispatch.agentId
    || typeof value.amountMinor !== "number"
    || !Number.isSafeInteger(value.amountMinor)
    || value.amountMinor < 0
    || value.currency !== expectedCurrency
    || value.priceVerification !== "verified"
    || typeof value.promptTokens !== "number"
    || !Number.isSafeInteger(value.promptTokens)
    || value.promptTokens < 0
    || typeof value.completionTokens !== "number"
    || !Number.isSafeInteger(value.completionTokens)
    || value.completionTokens < 0
    || typeof value.dollarCost !== "number"
    || !Number.isFinite(value.dollarCost)
    || value.dollarCost < 0
    || !provenance
  ) return null;
  return Object.freeze({
    kind: "offer",
    legId: value.legId,
    offerId: value.offerId,
    amountMinor: value.amountMinor,
    currency: value.currency,
    priceVerification: value.priceVerification,
    agentId: value.agentId,
    promptTokens: value.promptTokens,
    completionTokens: value.completionTokens,
    dollarCost: value.dollarCost,
    provenance,
  });
};

const sha256 = async (value) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const demoQuote = async (parsed, dispatch, rules, currency) => {
  const prior = parsed.intent.constraints.prior_amount_minor;
  const rule = rules?.[parsed.intent.category];
  if (prior === null || !rule) return null;
  const amountMinor = prior + rule.deltaMinor;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return null;
  const digest = await sha256(JSON.stringify({
    agentId: dispatch.agentId,
    amountMinor,
    currency,
    priceVerification: "deterministic-demo",
    intentId: parsed.intent.intentId,
  }));
  return Object.freeze({
    kind: "offer",
    legId: parsed.targetLegId,
    offerId: `demo_${digest.slice(0, 32)}`,
    amountMinor,
    currency,
    priceVerification: "deterministic-demo",
    agentId: dispatch.agentId,
    promptTokens: 0,
    completionTokens: 0,
    dollarCost: 0,
    provenance: Object.freeze({
      contractVersion: "knowgrph.travel-discovery/v1",
      mode: "deterministic-demo",
      nonBookable: "true",
      currency,
      priceVerification: "deterministic-demo",
    }),
  });
};

const dispatchLive = async (config, parsed, dispatch) => {
  const provider = config.providers[parsed.intent.category];
  if (!provider) return { ok: false, status: 503, code: "discovery-provider-unconfigured" };
  const request = new Request("https://travel-discovery.internal/v1/requote", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-knowgrph-component": "Agent_Registry",
    },
    signal: AbortSignal.timeout(config.deadlineMs),
    body: JSON.stringify({
      operation: "discoverOffers",
      contractVersion: "knowgrph.travel-discovery/v1",
      agentId: dispatch.agentId,
      legId: parsed.targetLegId,
      intent: dispatch.discoveryInput,
    }),
  });
  const response = await provider.fetch(request);
  if (!response.ok) return { ok: false, status: response.status === 503 ? 503 : 502, code: "discovery-provider-failed" };
  let value;
  try {
    value = await response.json();
  } catch {
    return { ok: false, status: 502, code: "discovery-provider-malformed" };
  }
  const quote = parseQuote(value, dispatch, parsed.targetLegId, config.settlementCurrency);
  return quote
    ? { ok: true, quote }
    : { ok: false, status: 502, code: "discovery-provider-malformed" };
};

const probeLiveProvider = async (config, definition) => {
  const category = definition.declaredCategory;
  const response = await config.providers[category].fetch(new Request(
    `https://travel-discovery.internal/readyz?required_category=${encodeURIComponent(category)}`,
    { signal: AbortSignal.timeout(config.deadlineMs) },
  ));
  if (!response.ok) {
    return Object.freeze({ category, ok: false, code: "dependency-unavailable", detail: `status-${response.status}` });
  }
  const body = await readBoundedResponseJson(response);
  const capabilities = isRecord(body?.capabilities) ? body.capabilities : null;
  const categories = capabilities && Array.isArray(capabilities.categories)
    ? capabilities.categories
    : [];
  const valid = body?.ok === true && categories.includes(category)
    && capabilities?.inventory === "live-search-and-verify"
    && capabilities?.verificationRequired === false;
  return Object.freeze({
    category,
    ok: valid,
    code: valid ? null : "dependency-capability-mismatch",
    detail: valid ? "ready" : "capability-mismatch",
  });
};

const readiness = async (config, registryCache) => {
  if (!config.ok) {
    return json(503, {
      ok: false,
      service: "knowgrph-mcp",
      code: "configuration-missing",
      fields: config.errors,
      dependencies: { registry: config.definitions.length > 0 ? "configured" : "missing", discovery: "blocked" },
    });
  }
  if (config.mode === "deterministic-demo") {
    const registry = await registryCache.resolve(config.definitions, config.definitionCache);
    if (!registry.ok) {
      return json(503, {
        ok: false,
        service: "knowgrph-mcp",
        code: "dependency-unavailable",
        dependencies: { registry: "cache-unavailable", discovery: "deterministic-demo" },
      });
    }
    return json(200, {
      ok: true,
      service: "knowgrph-mcp",
      mode: config.mode,
      bookable: false,
      dependencies: { registry: "configured", discovery: "deterministic-demo" },
    });
  }
  try {
    const registry = await registryCache.resolve(config.definitions, config.definitionCache);
    if (!registry.ok) throw new Error("registry definition cache unavailable");
    // Probe category providers concurrently so the readiness path remains within
    // one discovery deadline instead of multiplying it by the registry size.
    const providerChecks = await Promise.all(
      config.definitions.map((definition) => probeLiveProvider(config, definition)),
    );
    const failed = providerChecks.find((result) => !result.ok);
    if (failed) {
      return json(503, {
        ok: false,
        service: "knowgrph-mcp",
        code: failed.code,
        dependencies: { registry: "configured", discovery: { [failed.category]: failed.detail } },
      });
    }
    const discovery = Object.fromEntries(providerChecks.map(({ category, detail }) => [category, detail]));
    return json(200, {
      ok: true,
      service: "knowgrph-mcp",
      mode: "live",
      dependencies: { registry: "configured", discovery },
    });
  } catch {
    return json(503, {
      ok: false,
      service: "knowgrph-mcp",
      code: "dependency-unavailable",
      dependencies: { registry: "configured", discovery: "unavailable" },
    });
  }
};

const isProbePath = (pathname, probe) => pathname === probe || pathname === `${MCP_PATH}${probe}`;

export const handleTravelCommerceServiceRoute = async (
  request,
  env,
  { registryCache = sharedAgentDefinitionCache } = {},
) => {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (isProbePath(pathname, MCP_LIVE_PATH)) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(405, { ok: false, code: "method-not-allowed" }, { allow: "GET, HEAD" });
    }
    return request.method === "HEAD"
      ? new Response(null, { status: 200, headers: { "cache-control": "no-store" } })
      : json(200, { ok: true, service: "knowgrph-mcp", status: "live" });
  }
  if (isProbePath(pathname, MCP_READY_PATH)) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(405, { ok: false, code: "method-not-allowed" }, { allow: "GET, HEAD" });
    }
    const response = await readiness(readConfig(env), registryCache);
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  }
  if (pathname !== TRAVEL_ROUTE_INTENT_PATH) return null;
  if (request.method !== "POST") return json(405, { ok: false, code: "method-not-allowed" }, { allow: "POST" });
  if (request.headers.get("x-knowgrph-component") !== "Reopt_Worker") {
    return json(403, { ok: false, code: "unauthorized-router-caller" });
  }
  const parsed = parseIntentRequest(await readBoundedJson(request));
  if (!parsed) return json(400, { ok: false, code: "route-intent-invalid" });
  const config = readConfig(env);
  if (!config.ok) return json(503, { ok: false, code: "configuration-missing", fields: config.errors });
  let dispatch;
  try {
    const registry = await registryCache.resolve(config.definitions, config.definitionCache);
    if (!registry.ok) throw new Error("registry definition cache unavailable");
    dispatch = registry.registry.route(parsed.intent, { sessionId: parsed.intent.intentId });
  } catch {
    return json(503, { ok: false, code: "registry-unavailable" });
  }
  if (dispatch.status !== "dispatch") {
    return json(422, { ok: false, code: "route-no-match", reason: dispatch.reason });
  }
  if (config.mode === "deterministic-demo") {
    const quote = await demoQuote(parsed, dispatch, config.demoRules, config.settlementCurrency);
    return quote
      ? json(200, quote)
      : json(422, { ok: false, code: "demo-quote-unavailable" });
  }
  try {
    const result = await dispatchLive(config, parsed, dispatch);
    return result.ok ? json(200, result.quote) : json(result.status, { ok: false, code: result.code });
  } catch (error) {
    return json(error?.name === "TimeoutError" ? 504 : 503, {
      ok: false,
      code: error?.name === "TimeoutError" ? "discovery-provider-timeout" : "discovery-provider-unavailable",
    });
  }
};
