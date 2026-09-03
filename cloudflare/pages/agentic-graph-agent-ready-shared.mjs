export const SITE_ORIGIN = "https://airvio.co";
export const STORAGE_FETCH_ORIGIN = "https://storage.airvio.co";
export const APP_BASE_PATH = "/agentic-graph";
export const APP_URL = `${SITE_ORIGIN}${APP_BASE_PATH}/`;
export const ROOT_URL = `${SITE_ORIGIN}/`;
export const DEFAULT_WORKSPACE_ID = "kgws:canonical-docs";
export const UPDATED_AT = "2026-06-05";
export const HEALTH_PATH = `${APP_BASE_PATH}/health`;
export const HEALTH_URL = `${SITE_ORIGIN}${HEALTH_PATH}`;
export const A2A_AGENT_CARD_PATH = "/.well-known/agent-card.json";
export const APP_A2A_AGENT_CARD_PATH = `${APP_BASE_PATH}/.well-known/agent-card.json`;
export const A2A_AGENT_CARD_URL = `${SITE_ORIGIN}${A2A_AGENT_CARD_PATH}`;
export const STORAGE_SOURCE_FILES_PATH = "/api/storage/source-files";
export const STORAGE_SOURCE_FILES_PATH_PREFIX = `${STORAGE_SOURCE_FILES_PATH}/`;
export const STORAGE_DEFAULT_DOC_PATH_PREFIX = "/api/storage/doc-default/";
export const STORAGE_WORKSPACE_DOC_PATH_PREFIX = "/api/storage/doc/";
export const STORAGE_SOURCE_FILES_URL = `${SITE_ORIGIN}${STORAGE_SOURCE_FILES_PATH}`;
export const STORAGE_DEFAULT_DOC_PATTERN = `${SITE_ORIGIN}${STORAGE_DEFAULT_DOC_PATH_PREFIX}{canonicalPath}`;
export const STORAGE_WORKSPACE_DOC_PATTERN = `${SITE_ORIGIN}${STORAGE_WORKSPACE_DOC_PATH_PREFIX}{workspaceId}/{canonicalPath}`;
export const STORAGE_BLOB_PATTERN = `${SITE_ORIGIN}/api/storage/blob/{workspaceId}/{canonicalPath}`;
export const AGENTIC_OS_AGENT_READY_ROUTE_OWNER = "agentic-graph-agent-ready-pages";
export const ROOT_AGENT_READY_ROUTE_OWNER = "root-agent-ready-pages";
export const AGENTIC_OS_XR_PERMISSIONS_POLICY = "accelerometer=(self), autoplay=(self), camera=(self), clipboard-read=(), clipboard-write=(), display-capture=(self), geolocation=(), gyroscope=(self), magnetometer=(self), microphone=(self), payment=(), usb=(), xr-spatial-tracking=(self)";
export const buildAgenticGraphStorageDocPath = (workspaceId, canonicalPath) =>
  `${STORAGE_WORKSPACE_DOC_PATH_PREFIX}${encodeURIComponent(String(workspaceId || "").trim())}/${encodeURIComponent(String(canonicalPath || "").trim())}`;
export const buildAgenticGraphStorageDefaultDocPath = (canonicalPath) =>
  `${STORAGE_DEFAULT_DOC_PATH_PREFIX}${encodeURIComponent(String(canonicalPath || "").trim())}`;
export const buildAgenticGraphStorageSourceFilesIndexPath = (workspaceId) => {
  const normalizedWorkspaceId = String(workspaceId || "").trim();
  return normalizedWorkspaceId
    ? `${STORAGE_SOURCE_FILES_PATH_PREFIX}${encodeURIComponent(normalizedWorkspaceId)}`
    : STORAGE_SOURCE_FILES_PATH;
};
export const agentReadyHomepageLinkHeaderValue = [
  `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
  `<${APP_BASE_PATH}/.well-known/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.1"`,
  `<${APP_BASE_PATH}/llms.txt>; rel="service-doc"; type="text/plain"`,
  `</auth.md>; rel="service-doc"; type="text/markdown"`,
  `<${HEALTH_PATH}>; rel="status"; type="application/health+json"`,
  `<${APP_BASE_PATH}/.well-known/mcp/server-card.json>; rel="mcp-server-card"; type="application/json"`,
  `<${A2A_AGENT_CARD_PATH}>; rel="describedby"; type="application/json"`,
].join(", ");

export const agentReadyMarkdownBody = `# agentic-graph

agentic-graph is an Agent-actionable chat-to-canvas knowledge graph workspace served at ${APP_URL}.

## Discovery

- Crawl policy: ${APP_URL}robots.txt
- Sitemap: ${APP_URL}sitemap.xml
- API catalog: ${APP_URL}.well-known/api-catalog
- Auth.md registration instructions: ${ROOT_URL}auth.md
- Health: ${HEALTH_URL}
- MCP server card: ${APP_URL}.well-known/mcp/server-card.json
- A2A Agent Card: ${A2A_AGENT_CARD_URL}
- Agent skills: ${APP_URL}.well-known/agent-skills/index.json
- LLM reference: ${APP_URL}llms.txt
- Live Canvas Hero discovery markdown: ${ROOT_URL}agentic-graph-live-canvas-hero.md

## APIs

- Agent-ready status: ${HEALTH_URL}
- HTTP MCP: ${APP_URL}mcp
- Storage API: ${SITE_ORIGIN}/api/storage/
- Source Files index: ${STORAGE_SOURCE_FILES_URL}
- Default Source File documents: ${STORAGE_DEFAULT_DOC_PATTERN}
- Workspace Source File documents: ${STORAGE_WORKSPACE_DOC_PATTERN}
- Workspace binary artifacts: ${STORAGE_BLOB_PATTERN}

## WebMCP

- Browser app runtime installs WebMCP on page load via \`navigator.modelContext\`.
- Shared deployed WebMCP/HTTP MCP surface exposes seven read-only tools for published Source Files, shared documents, data-first search/fetch, and agent-surface inspection.
- HTTP MCP and local stdio expose shared read-only prompt templates through \`prompts/list\` and \`prompts/get\` for Source Files research and agent-surface inspection.
- HTTP MCP and local stdio expose Source Files resource templates through \`resources/templates/list\`; \`kgdoc://source-file/{id}\` reads reuse the existing \`fetch\` executor.
- Full app runtime additionally exposes browser-local inspect tools for the active workspace document, canvas topology, canvas snapshot, 3d camera pose, 3d layout positions, 2d zoom viewport, and Source Files snapshot.
- Deployed HTML fallback injects the shared seven-tool WebMCP surface on \`${APP_URL}\` HTML routes.

## MCP Apps

- HTTP MCP advertises \`io.modelcontextprotocol/ui\` with \`text/html;profile=mcp-app\`.
- \`inspect_agent_surface\` links to the shared \`ui://agentic-graph/agent-ready\` resource through \`_meta.ui.resourceUri\`.
- UI-linked tool descriptors expose no-auth \`securitySchemes\`, mirror them in \`_meta.securitySchemes\`, and set OpenAI widget accessibility metadata from the shared contract.
- \`resources/list\` and \`resources/read\` serve the inline, sandbox-friendly agentic-graph Agent Ready app resource while preserving text fallback and structured tool output; \`resources/templates/list\` exposes Source Files markdown reads under the standard MCP \`resources\` capability.
- The View initiates the MCP Apps \`ui/initialize\` handshake, sends \`ui/notifications/initialized\` and \`ui/notifications/size-changed\`, handles host context/tool input/result/cancel notifications, and calls the originating server through \`tools/call\`.
- \`inspect_agent_surface.structuredContent.mcpAppsServerReadiness\` exposes the native server-readiness model used by the View: app tool/resource binding, prompt discovery, resource-template discovery, output-schema and structured-content readiness, sandbox/security metadata, widget accessibility, Streamable HTTP JSON-RPC transport, local stdio transport, and read-only search/fetch retrieval.
`;

export const markdownResponse = (body) =>
  new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
      "vary": "Accept",
      "x-markdown-tokens": String(Math.ceil(String(body || "").length / 4)),
    },
  });

export const wantsMarkdown = (request) => {
  const accept = request.headers.get("accept") || "";
  return accept.toLowerCase().split(",").some((part) => part.trim().startsWith("text/markdown"));
};
export const withAgenticGraphXrPermissionsPolicy = (response) => {
  const next = new Response(response.body, response);
  next.headers.set("permissions-policy", AGENTIC_OS_XR_PERMISSIONS_POLICY);
  return next;
};

export const withAgentReadyRouteHeaders = (response, args) => {
  const next = withAgenticGraphXrPermissionsPolicy(response);
  const owner = String(args?.owner || "").trim();
  const tag = String(args?.tag || "").trim();
  if (owner) {
    next.headers.set("x-agentic-graph-route-owner", owner);
  }
  if (tag) {
    next.headers.set("x-agentic-graph-route-tag", tag);
  }
  return next;
};
