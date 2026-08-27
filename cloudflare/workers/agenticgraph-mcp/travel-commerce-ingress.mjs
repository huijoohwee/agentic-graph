export const TRAVEL_AGENT_OFFERS_PATH = "/agenticgraph/control-plane/agents/travel-offers";

export async function handleTravelCommerceOfferIngress(
  request,
  env,
  { authorize, route },
) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (pathname !== TRAVEL_AGENT_OFFERS_PATH) return null;
  let authorization;
  try {
    authorization = await authorize(request, env);
  } catch {
    return json(503, { error: { code: "runtime_auth_unavailable" } });
  }
  if (authorization?.ok !== true) {
    const status = authorization?.status === 401 ? 401 : 503;
    const code = typeof authorization?.code === "string"
      ? authorization.code
      : "runtime_auth_unavailable";
    return json(status, { error: { code } },
      status === 401 ? { "www-authenticate": "Bearer" } : {});
  }

  const headers = new Headers({ "x-agenticgraph-component": "Edge_Orchestrator" });
  for (const name of ["content-type", "content-length"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const internalUrl = new URL(request.url);
  internalUrl.pathname = "/v1/route-intent";
  internalUrl.search = "";
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : request.body;
  const internal = new Request(internalUrl, {
    method: request.method,
    headers,
    body,
    signal: request.signal,
    ...(body ? { duplex: "half" } : {}),
  });
  try {
    const response = await route(internal, env);
    return response ?? json(503, { ok: false, code: "travel-guardrail-route-unavailable" });
  } catch {
    return json(503, { ok: false, code: "travel-guardrail-route-unavailable" });
  }
}

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  },
});
