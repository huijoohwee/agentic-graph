import {
  parseDiscoveryRequest,
  probeAtlasCapability,
  readAtlasConfiguration,
  searchAtlasQuote,
} from "./atlas-adapter.mjs";

const MAX_REQUEST_BYTES = 16 * 1024;

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  },
});

const cancelBody = async (body) => {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // The body may already be locked or cancelled by the runtime.
  }
};

const readBoundedText = async (request) => {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declared) || declared > MAX_REQUEST_BYTES) {
      await cancelBody(request.body);
      return null;
    }
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        await reader.cancel();
        return null;
      }
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // Preserve the closed parse result if the stream also rejects cancellation.
    }
    return null;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

const readBoundedJson = async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    await cancelBody(request.body);
    return null;
  }
  const text = await readBoundedText(request);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const costLog = (result) => {
  console.log(JSON.stringify({
    type: "travel_discovery_cost_log",
    provider: "atlas-atriptech",
    probesAttempted: result?.attempted ?? 0,
    probesResolved: result?.ok ? 1 : 0,
    probesFailedOrCancelled: result?.ok || (result?.attempted ?? 0) === 0 ? 0 : 1,
    normalizedFares: result?.normalizedFares ?? 0,
    modelCalls: 0,
    estimatedCostUsd: 0,
    recordedAt: new Date().toISOString(),
  }));
};

const readiness = async (env, fetchFn) => {
  const config = readAtlasConfiguration(env);
  if (!config.ok) {
    return {
      status: 503,
      body: {
        ok: false,
        service: "agentic-travel-discovery",
        code: "provider-unconfigured",
        fields: config.fields,
        dependencies: { atlas: "blocked-by-configuration" },
        capabilities: { categories: ["flight"], inventory: "live-search-and-verify", verificationRequired: false },
      },
    };
  }
  const probe = await probeAtlasCapability({ config, fetchFn });
  if (!probe.ok) {
    return {
      status: 503,
      body: {
        ok: false,
        service: "agentic-travel-discovery",
        code: probe.code,
        dependencies: { atlas: "live-capability-probe-failed" },
        providerStatus: probe.status,
        providerProbe: "failed",
        capabilities: { categories: ["flight"], inventory: "live-search-and-verify", verificationRequired: false },
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      service: "agentic-travel-discovery",
      provider: "atlas-atriptech",
      dependencies: { atlas: "live-capability-probe-passed" },
      configuredRoutes: Object.keys(config.routes).length,
      providerProbe: "live-authenticated-search-verify-passed",
      capabilities: { categories: ["flight"], inventory: "live-search-and-verify", verificationRequired: false },
    },
  };
};

export const createTravelDiscoveryWorker = ({ fetchFn = fetch, nowMs = Date.now } = {}) => {
  let readinessCache = null;
  const readReadiness = async (env) => {
    const cacheKey = JSON.stringify([
      env?.ATLAS_API_BASE_URL, env?.ATLAS_SEARCH_PATH, env?.ATLAS_VERIFY_PATH,
      env?.ATLAS_CLIENT_ID, env?.ATLAS_CLIENT_SECRET, env?.ATLAS_AGENT_ID,
      env?.ATLAS_ROUTE_CATALOGUE_JSON, env?.ATLAS_TIMEOUT_MS,
      env?.ATLAS_READINESS_PROBE_TIMEOUT_MS, env?.ATLAS_MAX_RESPONSE_BYTES,
    ]);
    const now = nowMs();
    if (readinessCache && readinessCache.key === cacheKey && readinessCache.expiresAt > now) {
      return readinessCache.value;
    }
    const value = await readiness(env, fetchFn);
    readinessCache = {
      key: cacheKey,
      value,
      expiresAt: now + (value.status === 200 ? 30_000 : 5_000),
    };
    return value;
  };
  return {
    async fetch(request, env) {
      const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
      if (pathname === "/livez") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return json(405, { ok: false, code: "method-not-allowed" }, { allow: "GET, HEAD" });
        }
        return request.method === "HEAD"
          ? new Response(null, { status: 200, headers: { "cache-control": "no-store" } })
          : json(200, { ok: true, service: "agentic-travel-discovery", status: "live" });
      }
      if (pathname === "/readyz") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return json(405, { ok: false, code: "method-not-allowed" }, { allow: "GET, HEAD" });
        }
        const ready = await readReadiness(env);
        const response = json(ready.status, ready.body);
        return request.method === "HEAD"
          ? new Response(null, { status: response.status, headers: response.headers })
          : response;
      }
      if (pathname !== "/v1/requote") return json(404, { ok: false, code: "not-found" });
      if (request.method !== "POST") return json(405, { ok: false, code: "method-not-allowed" }, { allow: "POST" });
      if (request.headers.get("x-agentic-graph-component") !== "Agent_Registry") {
        return json(403, { ok: false, code: "unauthorized-discovery-caller" });
      }
      const input = parseDiscoveryRequest(await readBoundedJson(request));
      if (!input) return json(400, { ok: false, code: "discovery-request-invalid" });
      const config = readAtlasConfiguration(env);
      if (!config.ok) {
        const result = { attempted: 0 };
        costLog(result);
        return json(503, { ok: false, code: "provider-unconfigured", fields: config.fields });
      }
      if (input.agentId !== config.agentId) {
        const result = { attempted: 0 };
        costLog(result);
        return json(422, { ok: false, code: "agent-not-configured" });
      }
      const result = await searchAtlasQuote({ request: input, config, fetchFn });
      costLog(result);
      return result.ok
        ? json(200, result.quote)
        : json(result.status, {
            ok: false,
            code: result.code,
            ...(result.fields ? { fields: result.fields } : {}),
          });
    },
  };
};

export default createTravelDiscoveryWorker();
