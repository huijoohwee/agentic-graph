import { AGENTIC_OS_AGENT_READY_TOOL_IDS } from "../../canvas/src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs";
import { getAgenticGraphAgentReadyPrompt } from "../../canvas/src/features/agent-ready/agentic-graph-agent-ready-prompt-contract.mjs";
import {
  buildAgenticGraphSourceFileResourceReadResult,
  parseAgenticGraphSourceFileResourceUri,
} from "../../canvas/src/features/agent-ready/agentic-graph-agent-ready-resource-contract.mjs";
import {
  AGENTIC_OS_MCP_APP_RESOURCE_URI,
  buildAgenticGraphMcpAppsResourceReadResult,
} from "../../canvas/src/features/agent-ready/mcpAppsReadyContract.mjs";
import { buildAgentSurfaceInspectionPayload } from "../../canvas/src/features/agent-ready/agentSurfaceInspection.mjs";
import { createPublishedAgentReadyToolExecutors } from "../../canvas/src/features/agent-ready/publishedToolExecutors.mjs";
import { inspectSharedDocumentStructure } from "../../canvas/src/features/agent-ready/sharedDocumentStructureInspection.mjs";
import { resolveMachineRouteRedirect } from "./agentic-graph-agent-ready-discovery.mjs";
import {
  buildAgenticGraphCommerceDiscovery,
  buildAgenticGraphCommerceRouteResponse,
} from "./agentic-graph-agent-ready-commerce.mjs";
import {
  fetchAgenticGraphAppShellAsset,
  fetchAgenticGraphStaticAsset,
  handlesAgenticGraphStaticAsset,
} from "./agentic-graph-agent-ready-app-shell.mjs";
import { injectWebMcpScript } from "./webmcp-html-injection.mjs";
import { AGENTIC_GRAPH_CSP, AGENTIC_GRAPH_PUBLIC_DOCUMENT_CSP } from "./agentic-graph-security-headers.mjs";
import { resolvePublishedDocIdentity } from "../../canvas/src/features/canvas/canvasDocShareToken.mjs";
import {
  agentReadyHomepageLinkHeaderValue,
  agentReadyMarkdownBody,
  APP_A2A_AGENT_CARD_PATH,
  APP_BASE_PATH,
  APP_URL,
  buildAgenticGraphStorageDefaultDocPath,
  buildAgenticGraphStorageDocPath,
  buildAgenticGraphStorageSourceFilesIndexPath,
  DEFAULT_WORKSPACE_ID,
  HEALTH_PATH,
  AGENTIC_OS_AGENT_READY_ROUTE_OWNER,
  markdownResponse,
  SITE_ORIGIN,
  STORAGE_FETCH_ORIGIN,
  UPDATED_AT,
  withAgentReadyRouteHeaders,
  withAgenticGraphXrPermissionsPolicy,
  wantsMarkdown,
} from "./agentic-graph-agent-ready-shared.mjs";
import {
  jsonResponse,
  jsonStatusResponse,
  emptyStatusResponse,
  textResponse,
  mcpAppsHtmlResponse,
  healthResponse,
} from "./agentic-graph-agent-ready-responses.mjs";
import { handleGitHubWorkspaceWrite, isGitHubWorkspaceWriteRoutePath } from "./agentic-graph-agent-ready-github-write.mjs";
import {
  apiCatalog,
  openApi,
  a2aAgentCard,
  oauthProtectedResource,
  oauthAuthorizationServer,
  mcpServerCard,
  agentSkillMarkdownByRoutePath,
  agentSkillsIndex,
  httpMessageSignaturesDirectory,
  mcpInitializeResult,
  mcpTools,
  mcpResources,
  mcpPrompts,
  mcpResourceTemplates,
  robotsTxt,
  sitemapXml,
  authMd,
  buildHealthStatusBody,
  buildAgenticGraphMcpAppHtmlBody,
  buildAgentReadyStaticFiles,
} from "./agentic-graph-agent-ready-discovery-data.mjs";
import { webMcpScript } from "./agentic-graph-agent-ready-webmcp.mjs";
const normalizeToolString = (value) => String(value || "").trim();
const buildStorageDocPath = (canonicalPath, workspaceId = "") => {
  const normalizedCanonicalPath = String(canonicalPath || "").trim();
  const normalizedWorkspaceId = String(workspaceId || "").trim();
  return normalizedWorkspaceId
    ? buildAgenticGraphStorageDocPath(normalizedWorkspaceId, normalizedCanonicalPath)
    : buildAgenticGraphStorageDefaultDocPath(normalizedCanonicalPath);
};
export { agentReadyHomepageLinkHeaderValue, buildAgentReadyStaticFiles };
const PUBLISHED_TOOL_NAME_CONFIG = {
  search: AGENTIC_OS_AGENT_READY_TOOL_IDS.search,
  fetch: AGENTIC_OS_AGENT_READY_TOOL_IDS.fetch,
  listSourceFiles: AGENTIC_OS_AGENT_READY_TOOL_IDS.listSourceFiles,
  readSourceFile: AGENTIC_OS_AGENT_READY_TOOL_IDS.readSourceFile,
  readSharedDocument: AGENTIC_OS_AGENT_READY_TOOL_IDS.readSharedDocument,
  inspectSharedDocumentStructure: AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure,
  inspectAgentSurface: AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectAgentSurface,
};

const buildAgentSurfaceInspection = async (env = {}) => buildAgentSurfaceInspectionPayload({
  baseUrl: APP_URL,
  health: buildHealthStatusBody(),
  apiCatalog,
  openApi,
  mcpServerCard,
  agentCard: a2aAgentCard,
  agentSkills: await agentSkillsIndex(),
  commerce: buildAgenticGraphCommerceDiscovery({ origin: SITE_ORIGIN, env }),
});
const PUBLISHED_MCP_TOOL_EXECUTORS = createPublishedAgentReadyToolExecutors({
  toolNames: PUBLISHED_TOOL_NAME_CONFIG,
  defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
  publicBaseUrl: SITE_ORIGIN,
  buildStorageDocPath,
  fetchSourceFilesIndexResponse: () =>
    fetch(`${STORAGE_FETCH_ORIGIN}${buildAgenticGraphStorageSourceFilesIndexPath()}`, {
      headers: { accept: "text/markdown" },
    }),
  fetchStorageMarkdownResponse: (path) =>
    fetch(`${STORAGE_FETCH_ORIGIN}${path}`, {
      headers: { accept: "text/markdown" },
    }),
  resolveSharedDocumentInput: (input = {}) =>
    resolvePublishedDocIdentity({
      shareToken: input?.shareToken,
      shareUrl: input?.shareUrl,
      appBasePath: APP_BASE_PATH,
      baseUrl: SITE_ORIGIN,
    }),
  inspectSharedDocumentStructure,
  buildAgentSurfaceInspection,
});

const resolvePublishedDocRequestIdentity = (requestUrl) => {
  try {
    const url = new URL(requestUrl, SITE_ORIGIN);
    return resolvePublishedDocIdentity({
      shareUrl: `${url.pathname}${url.search}`,
      baseUrl: SITE_ORIGIN,
      appBasePath: APP_BASE_PATH,
    });
  } catch {
    return null;
  }
};

const resolvePublishedDocPathIdentity = (pathname) =>
  resolvePublishedDocIdentity({
    shareUrl: String(pathname || ""),
    baseUrl: SITE_ORIGIN,
    appBasePath: APP_BASE_PATH,
  });

const proxyPublishedDocMarkdownResponse = async (request, pathArgs) => {
  const targetUrl = new URL(buildStorageDocPath(pathArgs.canonicalPath, pathArgs.workspaceId), STORAGE_FETCH_ORIGIN);
  const upstream = await fetch(targetUrl, {
    method: "GET",
    headers: {
      accept: "text/markdown, text/plain;q=0.9, */*;q=0.1",
    },
  });
  const headers = new Headers(upstream.headers);
  const vary = String(headers.get("vary") || "");
  headers.set("vary", vary ? `${vary}, Accept` : "Accept");
  return new Response(String(request.method || "").toUpperCase() === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
};

const readJsonRpcRequest = async (request) => {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
};

const jsonRpcResult = (id, result) => jsonStatusResponse(200, {
  jsonrpc: "2.0",
  id: id ?? null,
  result,
});

const jsonRpcError = (id, code, message) => jsonStatusResponse(200, {
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

const requestAcceptsEventStream = (request) =>
  String(request.headers.get("accept") || "")
    .toLowerCase()
    .split(",")
    .some((part) => part.trim().startsWith("text/event-stream"));

const hasOwnProperty = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

const isJsonRpcNotificationOrResponse = (rpc) => {
  if (Array.isArray(rpc)) return rpc.length > 0 && rpc.every(isJsonRpcNotificationOrResponse);
  if (!rpc || typeof rpc !== "object") return false;
  if (String(rpc.jsonrpc || "") !== "2.0") return false;
  const hasMethod = typeof rpc.method === "string" && rpc.method.length > 0;
  const hasId = hasOwnProperty(rpc, "id");
  const hasResultOrError = hasOwnProperty(rpc, "result") || hasOwnProperty(rpc, "error");
  return (hasMethod && !hasId) || (!hasMethod && hasResultOrError);
};
const executeMcpTool = async (name, args, env = {}) => {
  if (name === AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectAgentSurface) return buildAgentSurfaceInspection(env);
  const execute = PUBLISHED_MCP_TOOL_EXECUTORS[name];
  if (typeof execute !== "function") {
    throw new Error(`unknown tool: ${name}`);
  }
  return execute(args);
};
const readMcpResource = async (uri, env = {}) => {
  const normalizedUri = normalizeToolString(uri);
  if (normalizedUri === AGENTIC_OS_MCP_APP_RESOURCE_URI) {
    return buildAgenticGraphMcpAppsResourceReadResult({
      appUrl: APP_URL,
      updatedAt: UPDATED_AT,
      toolNames: mcpTools.map((tool) => tool.name),
    });
  }
  const sourceFileId = parseAgenticGraphSourceFileResourceUri(normalizedUri);
  if (sourceFileId) {
    const sourceFile = await executeMcpTool(AGENTIC_OS_AGENT_READY_TOOL_IDS.fetch, { id: sourceFileId }, env);
    return buildAgenticGraphSourceFileResourceReadResult({ uri: normalizedUri, sourceFile });
  }
  throw new Error(`unknown resource: ${uri}`);
};
const handleMcpTransport = async (request, env = {}) => {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") {
    if (requestAcceptsEventStream(request)) return emptyStatusResponse(405, { allow: "POST" });
    return jsonResponse({
      ok: true,
      transport: mcpServerCard.transport,
      serverInfo: mcpServerCard.serverInfo,
      capabilities: mcpServerCard.capabilities,
      links: mcpServerCard.links,
      surfaceRoles: mcpServerCard.surfaceRoles,
    });
  }
  if (method !== "POST") return jsonStatusResponse(405, { ok: false, error: "unsupported_method" });
  const rpc = await readJsonRpcRequest(request);
  if (!rpc) return jsonRpcError(null, -32700, "Parse error");
  if (isJsonRpcNotificationOrResponse(rpc)) return emptyStatusResponse(202);
  if (Array.isArray(rpc)) return jsonRpcError(null, -32600, "Batch JSON-RPC requests are not supported");
  switch (rpc.method) {
    case "initialize":
      return jsonRpcResult(rpc.id, mcpInitializeResult);
    case "tools/list":
      return jsonRpcResult(rpc.id, { tools: mcpTools });
    case "prompts/list":
      return jsonRpcResult(rpc.id, { prompts: mcpPrompts });
    case "resources/templates/list":
      return jsonRpcResult(rpc.id, { resourceTemplates: mcpResourceTemplates });
    case "prompts/get": {
      const promptName = normalizeToolString(rpc.params?.name);
      const promptArgs = rpc.params?.arguments && typeof rpc.params.arguments === "object" ? rpc.params.arguments : {};
      if (!promptName) return jsonRpcError(rpc.id, -32602, "Prompt name is required");
      try {
        return jsonRpcResult(rpc.id, getAgenticGraphAgentReadyPrompt(promptName, promptArgs));
      } catch (error) {
        return jsonRpcError(rpc.id, -32602, error instanceof Error ? error.message : String(error));
      }
    }
    case "resources/list":
      return jsonRpcResult(rpc.id, { resources: mcpResources });
    case "resources/read": {
      const uri = normalizeToolString(rpc.params?.uri);
      if (!uri) return jsonRpcError(rpc.id, -32602, "Resource URI is required");
      try {
        return jsonRpcResult(rpc.id, await readMcpResource(uri, env));
      } catch (error) {
        return jsonRpcError(rpc.id, -32602, error instanceof Error ? error.message : String(error));
      }
    }
    case "tools/call": {
      const toolName = normalizeToolString(rpc.params?.name);
      const toolArgs = rpc.params?.arguments && typeof rpc.params.arguments === "object" ? rpc.params.arguments : {};
      if (!toolName) return jsonRpcError(rpc.id, -32602, "Tool name is required");
      try {
        const result = await executeMcpTool(toolName, toolArgs, env);
        return jsonRpcResult(rpc.id, {
          content: [
            {
              type: "text",
              text: typeof result?.markdown === "string"
                ? result.markdown
                : JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
          isError: false,
        });
      } catch (error) {
        return jsonRpcResult(rpc.id, {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        });
      }
    }
    default:
      return jsonRpcError(rpc.id, -32601, "Method not found");
  }
};

const handlesAgenticGraphRoot = (pathname) => pathname === APP_BASE_PATH || pathname === `${APP_BASE_PATH}/`;
const handlesAgenticGraphHtmlSurface = (pathname) =>
  handlesAgenticGraphRoot(pathname) || Boolean(resolvePublishedDocPathIdentity(pathname));
const resolveAgentReadyRouteTag = (request) => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const publishedDocIdentity = resolvePublishedDocRequestIdentity(request.url);
  if (pathname === HEALTH_PATH) return "health";
  if (pathname === `${APP_BASE_PATH}/mcp`) return "mcp";
  if (isGitHubWorkspaceWriteRoutePath(pathname)) return "github-workspace-write";
  if (pathname === `${APP_BASE_PATH}/robots.txt`) return "robots";
  if (pathname === `${APP_BASE_PATH}/sitemap.xml`) return "sitemap";
  if (pathname === `${APP_BASE_PATH}/auth.md` || pathname === "/auth.md") return "auth-md";
  if (pathname.startsWith(`${APP_BASE_PATH}/.well-known/`)) return "well-known";
  if (publishedDocIdentity) {
    return wantsMarkdown(request) ? "shared-doc-markdown" : "shared-doc-html";
  }
  if (handlesAgenticGraphRoot(url.pathname)) {
    return wantsMarkdown(request) ? "homepage-markdown" : "homepage-html";
  }
  return "app-surface";
};

const withAgenticGraphRouteHeaders = (request, response) =>
  withAgentReadyRouteHeaders(response, {
    owner: AGENTIC_OS_AGENT_READY_ROUTE_OWNER,
    tag: resolveAgentReadyRouteTag(request),
  });

const routeResponse = async (request, env = {}) => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const publishedDocIdentity = resolvePublishedDocRequestIdentity(request.url);
  const machineRedirect = resolveMachineRouteRedirect(pathname);
  if (machineRedirect) return Response.redirect(new URL(machineRedirect, request.url), 308);

  if (publishedDocIdentity && wantsMarkdown(request)) {
    return proxyPublishedDocMarkdownResponse(request, publishedDocIdentity);
  }
  if (handlesAgenticGraphRoot(url.pathname) && wantsMarkdown(request)) {
    return markdownResponse(agentReadyMarkdownBody);
  }

  switch (pathname) {
    case HEALTH_PATH:
      return healthResponse(buildHealthStatusBody());
    case `${APP_BASE_PATH}/mcp`:
      return handleMcpTransport(request, env);
    case `${APP_BASE_PATH}/robots.txt`:
      return textResponse(robotsTxt, "text/plain; charset=utf-8");
    case `${APP_BASE_PATH}/sitemap.xml`:
      return textResponse(sitemapXml, "application/xml; charset=utf-8");
    case `${APP_BASE_PATH}/auth.md`:
    case "/auth.md":
      return textResponse(authMd, "text/markdown; charset=utf-8");
    case `${APP_BASE_PATH}/.well-known/api-catalog`:
      return jsonResponse(apiCatalog, "application/linkset+json; charset=utf-8");
    case `${APP_BASE_PATH}/.well-known/openapi.json`:
      return jsonResponse(openApi, "application/vnd.oai.openapi+json; charset=utf-8");
    case APP_A2A_AGENT_CARD_PATH:
      return jsonResponse(a2aAgentCard);
    case `${APP_BASE_PATH}/.well-known/oauth-protected-resource`:
      return jsonResponse(oauthProtectedResource);
    case `${APP_BASE_PATH}/.well-known/oauth-authorization-server`:
      return jsonResponse(oauthAuthorizationServer);
    case `${APP_BASE_PATH}/.well-known/openid-configuration`:
      return jsonResponse(oauthAuthorizationServer);
    case `${APP_BASE_PATH}/.well-known/mcp/server-card.json`:
      return jsonResponse(mcpServerCard);
    case `${APP_BASE_PATH}/.well-known/mcp/apps/agentic-graph-agent-ready.html`:
      return mcpAppsHtmlResponse(buildAgenticGraphMcpAppHtmlBody());
    case `${APP_BASE_PATH}/.well-known/mcp.json`:
      return jsonResponse(mcpServerCard);
    case `${APP_BASE_PATH}/.well-known/agent-skills/index.json`:
      return jsonResponse(await agentSkillsIndex());
    case `${APP_BASE_PATH}/.well-known/http-message-signatures-directory`:
      return jsonResponse(httpMessageSignaturesDirectory);
    default:
      if (agentSkillMarkdownByRoutePath.has(pathname)) {
        return textResponse(agentSkillMarkdownByRoutePath.get(pathname), "text/markdown; charset=utf-8");
      }
      return null;
  }
};
async function routeRequest(context) {
  const { env, request } = context;
  const method = String(request.method || "GET").toUpperCase();
  const url = new URL(request.url);

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
        "access-control-allow-headers": "*",
        "access-control-max-age": "86400",
      },
    });
  }

  if (method === "POST" && url.pathname.replace(/\/+$/, "") === `${APP_BASE_PATH}/mcp`) {
    return withAgenticGraphRouteHeaders(request, await routeResponse(request, env));
  }

  if (method === "POST" && isGitHubWorkspaceWriteRoutePath(url.pathname)) {
    return withAgenticGraphRouteHeaders(request, await handleGitHubWorkspaceWrite(request, env));
  }

  if (method !== "GET" && method !== "HEAD") {
    return jsonStatusResponse(405, { ok: false, error: "unsupported_method" });
  }

  const commerceResponse = buildAgenticGraphCommerceRouteResponse(request, env);
  if (commerceResponse) return withAgenticGraphRouteHeaders(request, commerceResponse);

  if (handlesAgenticGraphStaticAsset(url.pathname, APP_BASE_PATH)) {
    return fetchAgenticGraphStaticAsset(context);
  }

  const routed = await routeResponse(request, env);
  if (routed) {
    const next = withAgenticGraphRouteHeaders(request, routed);
    if (method === "HEAD") return new Response(null, next);
    return next;
  }

  const publishedDocIdentity = resolvePublishedDocRequestIdentity(request.url);
  const response = publishedDocIdentity ? await fetchAgenticGraphAppShellAsset(context, APP_BASE_PATH) : await context.next();
  if (!handlesAgenticGraphHtmlSurface(url.pathname)) return response;
  const htmlResponse = method === "HEAD" ? response : await injectWebMcpScript(response, webMcpScript);
  const nextResponse = new Response(method === "HEAD" ? null : htmlResponse.body, htmlResponse);
  nextResponse.headers.set("link", agentReadyHomepageLinkHeaderValue);
  if (handlesAgenticGraphRoot(url.pathname) || publishedDocIdentity) {
    nextResponse.headers.delete("x-frame-options");
    nextResponse.headers.delete("content-security-policy-report-only");
    nextResponse.headers.set("content-security-policy", publishedDocIdentity
      ? AGENTIC_GRAPH_PUBLIC_DOCUMENT_CSP
      : AGENTIC_GRAPH_CSP);
  }
  return withAgenticGraphRouteHeaders(request, nextResponse);
}

export async function onRequest(context) {
  try {
    return withAgenticGraphXrPermissionsPolicy(await routeRequest(context));
  } catch (error) {
    const requestUrl = context?.request?.url || "";
    let pathname = "";
    try {
      pathname = requestUrl ? new URL(requestUrl).pathname : "";
    } catch {
      pathname = "";
    }
    console.error(JSON.stringify({
      message: "agentic-graph Pages request failed",
      pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
    return withAgenticGraphXrPermissionsPolicy(jsonStatusResponse(500, {
      ok: false,
      error: "internal_error",
    }));
  }
}
