export const buildAgenticGraphAppShellAssetRequest = (request, appBasePath) => {
  const appShellUrl = new URL(request.url);
  appShellUrl.pathname = `${appBasePath}/`;
  appShellUrl.search = "";
  appShellUrl.hash = "";
  return new Request(appShellUrl.toString(), request);
};

export const fetchAgenticGraphAppShellAsset = async (context, appBasePath) => {
  const appShellRequest = buildAgenticGraphAppShellAssetRequest(context.request, appBasePath);
  if (typeof context.env?.ASSETS?.fetch === "function") return context.env.ASSETS.fetch(appShellRequest);
  return context.next(appShellRequest);
};

export const handlesAgenticGraphStaticAsset = (pathname, appBasePath) =>
  pathname.startsWith(`${appBasePath}/assets/`)
  || pathname === `${appBasePath}/.well-known/runtime-readiness.json`;

const isHtmlAssetFallback = (response) => {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  return contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
};

const unavailableStaticAssetResponse = (request) =>
  new Response(request.method === "HEAD" ? null : "agentic-graph asset is temporarily unavailable. Retry shortly.\n", {
    status: 503,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "text/plain; charset=utf-8",
      "retry-after": "1",
      "x-content-type-options": "nosniff",
      "x-agentic-graph-asset-status": "temporarily-unavailable",
    },
  });

export const fetchAgenticGraphStaticAsset = async (context) => {
  const headers = new Headers(context.request.headers);
  headers.delete("origin");
  const assetUrl = new URL(context.request.url);
  if (assetUrl.pathname.endsWith("/.well-known/runtime-readiness.json")) {
    assetUrl.pathname = "/.well-known/runtime-readiness.json";
  }
  const assetRequest = new Request(assetUrl, {
    method: context.request.method,
    headers,
  });
  const isRuntimeReadiness = assetUrl.pathname === "/.well-known/runtime-readiness.json";
  const response = isRuntimeReadiness && typeof context.next === "function"
    ? await context.next(assetRequest)
    : typeof context.env?.ASSETS?.fetch === "function"
      ? await context.env.ASSETS.fetch(assetRequest)
      : await context.next(assetRequest);
  if (response.ok && !isHtmlAssetFallback(response)) return response;
  return unavailableStaticAssetResponse(context.request);
};
