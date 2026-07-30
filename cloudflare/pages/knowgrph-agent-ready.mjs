import {
  buildKnowgrphAgentReadyToolContracts,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from "../../canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs";
import {
  buildKnowgrphAgentReadyPromptContracts,
  getKnowgrphAgentReadyPrompt,
} from "../../canvas/src/features/agent-ready/knowgrphAgentReadyPromptContract.mjs";
import {
  buildKnowgrphAgentReadyResourceTemplateContracts,
  buildKnowgrphSourceFileResourceReadResult,
  parseKnowgrphSourceFileResourceUri,
} from "../../canvas/src/features/agent-ready/knowgrphAgentReadyResourceContract.mjs";
import {
  KNOWGRPH_MCP_APP_RESOURCE_URI,
  KNOWGRPH_MCP_REMOTE_TRANSPORT_TYPE,
  buildKnowgrphMcpAppsCapabilities,
  buildKnowgrphMcpClientSetups,
  buildKnowgrphMcpAppsResourceDescriptor,
  buildKnowgrphMcpAppsResourceReadResult,
} from "../../canvas/src/features/agent-ready/mcpAppsReadyContract.mjs";
import {
  buildAgentSurfaceInspectionPayload,
  createAgentSurfaceInspectionExecutor,
} from "../../canvas/src/features/agent-ready/agentSurfaceInspection.mjs";
import {
  PUBLISHED_AGENT_READY_TOOL_EXECUTORS_BROWSER_SOURCE,
  createPublishedAgentReadyToolExecutors,
} from "../../canvas/src/features/agent-ready/publishedToolExecutors.mjs";
import { WEB_MCP_LIFECYCLE_CONTROLLER_BROWSER_SOURCE } from "../../canvas/src/features/agent-ready/webMcpLifecycleBrowserSource.mjs";
import { inspectSharedDocumentStructure } from "../../canvas/src/features/agent-ready/sharedDocumentStructureInspection.mjs";
import { buildKnowgrphVdeoxplnMarkdownByName } from "../../canvas/src/features/agent-ready/knowgrphVdeoxplnContract.mjs";
import {
  AGENT_READY_AGENT_SKILL_DEFINITIONS,
  buildAgentReadyA2aSkills,
  buildAgentReadyAgentSkillsIndex,
  buildAgentReadyOpenApiPaths,
  buildMarkdownDiscoverySitemapXml,
  buildRootLlmsTxt,
  resolveMachineRouteRedirect,
} from "./knowgrph-agent-ready-discovery.mjs";
import {
  buildKnowgrphCommerceDiscovery,
  buildKnowgrphCommerceStaticFiles,
} from "./knowgrph-agent-ready-commerce.mjs";
import {
  fetchKnowgrphAppShellAsset,
  fetchKnowgrphStaticAsset,
  handlesKnowgrphStaticAsset,
} from "./knowgrph-agent-ready-app-shell.mjs";
import { injectWebMcpScript } from "./webmcp-html-injection.mjs";
import {
  PUBLISHED_DOC_IDENTITY_RESOLVER_BROWSER_SOURCE,
  createPublishedDocIdentityResolver,
  resolvePublishedDocIdentity,
} from "../../canvas/src/features/canvas/canvasDocShareToken.mjs";
import {
  A2A_AGENT_CARD_PATH,
  A2A_AGENT_CARD_URL,
  agentReadyHomepageLinkHeaderValue,
  agentReadyMarkdownBody,
  APP_A2A_AGENT_CARD_PATH,
  APP_BASE_PATH,
  APP_URL,
  buildKnowgrphStorageDefaultDocPath,
  buildKnowgrphStorageDocPath,
  buildKnowgrphStorageSourceFilesIndexPath,
  DEFAULT_WORKSPACE_ID,
  HEALTH_PATH,
  HEALTH_URL,
  KNOWGRPH_AGENT_READY_ROUTE_OWNER,
  markdownResponse,
  ROOT_URL,
  SITE_ORIGIN,
  STORAGE_FETCH_ORIGIN,
  STORAGE_DEFAULT_DOC_PATTERN,
  STORAGE_SOURCE_FILES_URL,
  STORAGE_WORKSPACE_DOC_PATTERN,
  UPDATED_AT,
  withAgentReadyRouteHeaders,
  wantsMarkdown,
} from "./knowgrph-agent-ready-shared.mjs";
const AGENT_READY_TOOL_CONTRACTS = buildKnowgrphAgentReadyToolContracts({
  defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
});
const AGENT_READY_PROMPT_CONTRACTS = buildKnowgrphAgentReadyPromptContracts();
const AGENT_READY_RESOURCE_TEMPLATE_CONTRACTS = buildKnowgrphAgentReadyResourceTemplateContracts();
const STORAGE_LLMS_URL = `${SITE_ORIGIN}/api/storage/llms.txt`;
const STORAGE_MANIFEST_URL = `${SITE_ORIGIN}/api/storage/content-manifest.json`;
const buildStorageDocPath = (canonicalPath, workspaceId = "") => {
  const normalizedCanonicalPath = String(canonicalPath || "").trim();
  const normalizedWorkspaceId = String(workspaceId || "").trim();
  return normalizedWorkspaceId
    ? buildKnowgrphStorageDocPath(normalizedWorkspaceId, normalizedCanonicalPath)
    : buildKnowgrphStorageDefaultDocPath(normalizedCanonicalPath);
};
const normalizeToolString = (value) => String(value || "").trim();
export { agentReadyHomepageLinkHeaderValue };
const jsonResponse = (body, contentType = "application/json; charset=utf-8") =>
  new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
const jsonStatusResponse = (status, body) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
const emptyStatusResponse = (status, headers = {}) =>
  new Response(null, {
    status,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...headers,
    },
  });
const textResponse = (body, contentType) =>
  new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
const mcpAppsHtmlResponse = (body) =>
  textResponse(body, "text/html;profile=mcp-app; charset=utf-8");
const healthResponse = (body) =>
  new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/health+json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });

const GITHUB_WORKSPACE_WRITE_ROUTE_PATH = `${APP_BASE_PATH}/api/workspace/github/write`;
const GITHUB_WORKSPACE_WRITE_ROUTE_ALIAS_PATH = "/api/workspace/github/write";
const GITHUB_WORKSPACE_WRITE_MAX_FILES = 12;
const GITHUB_WORKSPACE_WRITE_MAX_TEXT_BYTES = 900_000;
const GITHUB_WORKSPACE_WRITE_TEXT_EXTENSIONS = new Set([
  "css",
  "html",
  "js",
  "json",
  "md",
  "mdx",
  "mjs",
  "svg",
  "ts",
  "tsx",
  "txt",
  "yaml",
  "yml",
]);

const readEnvString = (env, key) => String(env?.[key] || "").trim();
const readGitHubWriteConfig = (env) => {
  const repository = readEnvString(env, "KNOWGRPH_GITHUB_WRITE_REPOSITORY");
  const token = readEnvString(env, "KNOWGRPH_GITHUB_WRITE_TOKEN");
  const branch = readEnvString(env, "KNOWGRPH_GITHUB_WRITE_BRANCH");
  const missing = [];
  if (!repository) missing.push("KNOWGRPH_GITHUB_WRITE_REPOSITORY");
  if (!token) missing.push("KNOWGRPH_GITHUB_WRITE_TOKEN");
  const parts = repository.split("/").map((part) => part.trim()).filter(Boolean);
  if (repository && parts.length !== 2) missing.push("KNOWGRPH_GITHUB_WRITE_REPOSITORY:owner/repo");
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    owner: parts[0],
    repo: parts[1],
    branch,
    token,
  };
};

const normalizeGitHubWriteWorkspacePath = (value) => {
  const raw = String(value || "")
    .trim()
    .replace(/^workspace:/i, "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!raw) return { ok: false, error: "missing_workspace_path" };
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, error: "invalid_workspace_path" };
  const parts = raw.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return { ok: false, error: "path_traversal_forbidden" };
  if (parts[0] !== "chat-log") return { ok: false, error: "unsupported_workspace_root" };
  if (parts.length < 3) return { ok: false, error: "chat_log_session_file_required" };
  const filename = parts[parts.length - 1] || "";
  const extension = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
  if (!extension || !GITHUB_WORKSPACE_WRITE_TEXT_EXTENSIONS.has(extension)) {
    return { ok: false, error: "unsupported_text_extension" };
  }
  return { ok: true, path: parts.join("/") };
};

const encodeBase64Utf8 = (text) => {
  const bytes = new TextEncoder().encode(String(text || ""));
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
};

class GitHubWorkspaceWriteError extends Error {
  constructor(code, upstreamStatus, upstreamMessage) {
    super(code);
    this.name = "GitHubWorkspaceWriteError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
    this.upstreamMessage = upstreamMessage;
  }
}

const sanitizeGitHubApiMessage = (value) => String(value || "unknown")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 240);

const buildGitHubContentsApiUrl = (config, path) => {
  const encodedPath = String(path || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}`);
  if (config.branch) url.searchParams.set("ref", config.branch);
  return url;
};

const gitHubApiHeaders = (config) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${config.token}`,
  "user-agent": "knowgrph-cloudflare-pages",
  "x-github-api-version": "2022-11-28",
});

const isGitHubWorkspaceWriteRoutePath = (pathname) => {
  const normalizedPathname = String(pathname || "").replace(/\/+$/, "") || "/";
  return normalizedPathname === GITHUB_WORKSPACE_WRITE_ROUTE_PATH
    || normalizedPathname === GITHUB_WORKSPACE_WRITE_ROUTE_ALIAS_PATH;
};

const fetchGitHubExistingFileSha = async (config, path) => {
  const response = await fetch(buildGitHubContentsApiUrl(config, path), {
    method: "GET",
    headers: gitHubApiHeaders(config),
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GitHubWorkspaceWriteError(
      "github_read_failed",
      response.status,
      sanitizeGitHubApiMessage(payload?.message || response.statusText),
    );
  }
  if (payload?.type && payload.type !== "file") {
    throw new GitHubWorkspaceWriteError("github_path_not_file", 409, path);
  }
  return String(payload?.sha || "").trim() || null;
};

const putGitHubWorkspaceFile = async (config, file, message) => {
  const sha = await fetchGitHubExistingFileSha(config, file.repositoryPath);
  const body = {
    message,
    content: encodeBase64Utf8(file.text),
    ...(config.branch ? { branch: config.branch } : {}),
    ...(sha ? { sha } : {}),
  };
  const response = await fetch(buildGitHubContentsApiUrl(config, file.repositoryPath), {
    method: "PUT",
    headers: {
      ...gitHubApiHeaders(config),
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GitHubWorkspaceWriteError(
      "github_write_failed",
      response.status,
      sanitizeGitHubApiMessage(payload?.message || response.statusText),
    );
  }
  return {
    workspacePath: file.workspacePath,
    repositoryPath: file.repositoryPath,
    action: sha ? "updated" : "created",
    commitSha: String(payload?.commit?.sha || ""),
    contentSha: String(payload?.content?.sha || ""),
    htmlUrl: String(payload?.content?.html_url || ""),
  };
};

const handleGitHubWorkspaceWrite = async (request, env) => {
  const config = readGitHubWriteConfig(env);
  if (!config.ok) {
    return jsonStatusResponse(503, {
      ok: false,
      status: "skipped",
      error: "github_write_not_configured",
      missing: config.missing,
    });
  }
  const body = await request.json().catch(() => null);
  const inputFiles = Array.isArray(body?.files) ? body.files : [];
  if (inputFiles.length < 1) {
    return jsonStatusResponse(400, { ok: false, status: "failed", error: "files_required" });
  }
  if (inputFiles.length > GITHUB_WORKSPACE_WRITE_MAX_FILES) {
    return jsonStatusResponse(413, {
      ok: false,
      status: "failed",
      error: "too_many_files",
      maxFiles: GITHUB_WORKSPACE_WRITE_MAX_FILES,
    });
  }
  const files = [];
  const seen = new Set();
  for (const input of inputFiles) {
    const normalized = normalizeGitHubWriteWorkspacePath(input?.workspacePath || input?.path);
    if (!normalized.ok) {
      return jsonStatusResponse(400, {
        ok: false,
        status: "failed",
        error: normalized.error,
        workspacePath: String(input?.workspacePath || input?.path || ""),
      });
    }
    if (seen.has(normalized.path)) continue;
    seen.add(normalized.path);
    const text = String(input?.text ?? "");
    const byteLength = new TextEncoder().encode(text).length;
    if (byteLength > GITHUB_WORKSPACE_WRITE_MAX_TEXT_BYTES) {
      return jsonStatusResponse(413, {
        ok: false,
        status: "failed",
        error: "file_too_large",
        workspacePath: `/${normalized.path}`,
        maxTextBytes: GITHUB_WORKSPACE_WRITE_MAX_TEXT_BYTES,
      });
    }
    files.push({
      workspacePath: `/${normalized.path}`,
      repositoryPath: normalized.path,
      text,
    });
  }
  if (files.length < 1) return jsonStatusResponse(400, { ok: false, status: "failed", error: "files_required" });
  const messageText = String(body?.message || "").trim();
  const message = messageText && messageText.length <= 160
    ? messageText
    : `Knowgrph chat artifact ${files[0].repositoryPath}`;
  if (body?.dryRun === true) {
    return jsonStatusResponse(200, {
      ok: true,
      status: "dry_run",
      repository: `${config.owner}/${config.repo}`,
      branch: config.branch || null,
      files: files.map((file) => ({
        workspacePath: file.workspacePath,
        repositoryPath: file.repositoryPath,
        textBytes: new TextEncoder().encode(file.text).length,
      })),
    });
  }
  try {
    const written = [];
    for (const file of files) {
      written.push(await putGitHubWorkspaceFile(config, file, message));
    }
    return jsonStatusResponse(200, {
      ok: true,
      status: "applied",
      repository: `${config.owner}/${config.repo}`,
      branch: config.branch || null,
      files: written,
    });
  } catch (error) {
    const isGitHubError = error instanceof GitHubWorkspaceWriteError;
    return jsonStatusResponse(isGitHubError ? 424 : 500, {
      ok: false,
      status: "failed",
      error: isGitHubError
        ? error.code
        : error instanceof Error ? error.message : String(error || "github_write_failed"),
      ...(isGitHubError ? {
        upstreamStatus: error.upstreamStatus,
        upstreamMessage: error.upstreamMessage,
      } : {}),
    });
  }
};
const buildRobotsTxt = (sitemapUrl) => `User-agent: *
Allow: /knowgrph/
Disallow: /api/payments/

User-agent: GPTBot
Allow: /knowgrph/
Disallow: /api/payments/

User-agent: Claude-Web
Allow: /knowgrph/
Disallow: /api/payments/

User-agent: Google-Extended
Allow: /knowgrph/
Disallow: /api/payments/

User-agent: OAI-SearchBot
Allow: /knowgrph/
Disallow: /api/payments/

Content-Signal: ai-train=no, search=yes, ai-input=yes
Sitemap: ${sitemapUrl}
`;
const robotsTxt = buildRobotsTxt(`${APP_URL}sitemap.xml`);
const discoveryInputs = { appUrl: APP_URL, rootUrl: ROOT_URL, storageSourceFilesUrl: STORAGE_SOURCE_FILES_URL, storageLlmsUrl: STORAGE_LLMS_URL, storageManifestUrl: STORAGE_MANIFEST_URL, agentCardUrl: A2A_AGENT_CARD_URL, updatedAt: UPDATED_AT };
const sitemapXml = buildMarkdownDiscoverySitemapXml(discoveryInputs);
const rootLlmsTxt = buildRootLlmsTxt(discoveryInputs);
const apiCatalog = {
  linkset: [
    {
      anchor: APP_URL,
      "service-desc": [
        {
          href: `${APP_URL}.well-known/openapi.json`,
          type: "application/vnd.oai.openapi+json;version=3.1",
        },
      ],
      "service-doc": [
        {
          href: `${APP_URL}llms.txt`,
          type: "text/plain",
        },
      ],
      status: [
        {
          href: HEALTH_URL,
          type: "application/health+json",
        },
      ],
      "service-meta": [
        {
          href: `${APP_URL}.well-known/mcp/server-card.json`,
          type: "application/json",
        },
        {
          href: A2A_AGENT_CARD_URL,
          type: "application/json",
        },
      ],
    },
  ],
};

const openApi = {
  openapi: "3.1.0",
  info: {
    title: "Knowgrph API",
    version: "0.1.0",
    description: "Agent discovery surface for the Knowgrph Cloudflare deployment.",
  },
  servers: [
    { url: SITE_ORIGIN, description: "Knowgrph Cloudflare deployment" },
  ],
  paths: buildAgentReadyOpenApiPaths({
    appBasePath: APP_BASE_PATH,
    appA2aAgentCardPath: APP_A2A_AGENT_CARD_PATH,
    healthPath: HEALTH_PATH,
  }),
};

const oauthProtectedResource = { resource: APP_URL, resource_name: "Knowgrph", authorization_servers: [SITE_ORIGIN], scopes_supported: ["knowgrph:read", "knowgrph:source-files:read"], bearer_methods_supported: ["header"], resource_documentation: `${APP_URL}llms.txt` };
const cloudflareAccessIssuer = `${SITE_ORIGIN}/cdn-cgi/access`;
const agentAuthMetadata = { skill: `${SITE_ORIGIN}/auth.md`, register_uri: `${APP_URL}agent/auth`, claim_uri: `${APP_URL}agent/auth/claim`, revocation_uri: `${APP_URL}agent/auth/revoke`, identity_types_supported: ["anonymous", "identity_assertion"], anonymous: { credential_types_supported: ["api_key"] }, identity_assertion: { assertion_types_supported: ["urn:ietf:params:oauth:token-type:id-jag", "verified_email"], credential_types_supported: ["access_token", "api_key"] }, events_supported: ["https://schemas.workos.com/events/agent/auth/identity/assertion/revoked"], registration_status: "metadata_published_runtime_user_mediated" };
const oauthAuthorizationServer = { issuer: SITE_ORIGIN, resource: oauthProtectedResource.resource, resource_name: oauthProtectedResource.resource_name, authorization_servers: oauthProtectedResource.authorization_servers, cloudflare_access_issuer: cloudflareAccessIssuer, authorization_endpoint: `${cloudflareAccessIssuer}/login`, token_endpoint: `${cloudflareAccessIssuer}/token`, jwks_uri: `${APP_URL}.well-known/http-message-signatures-directory`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "client_credentials"], token_endpoint_auth_methods_supported: ["client_secret_basic", "private_key_jwt"], scopes_supported: oauthProtectedResource.scopes_supported, agent_auth: agentAuthMetadata };
const authMd = `# Knowgrph auth.md\n\nKnowgrph publishes agent registration metadata for the read-only agent surface at ${APP_URL}. Agents should first fetch ${SITE_ORIGIN}/.well-known/oauth-protected-resource, follow its authorization_servers entry to ${SITE_ORIGIN}/.well-known/oauth-authorization-server, and read the agent_auth block.\n\n## Registration\n\n- Register: ${agentAuthMetadata.register_uri}\n- Claim: ${agentAuthMetadata.claim_uri}\n- Revoke: ${agentAuthMetadata.revocation_uri}\n- Supported identity types: ${agentAuthMetadata.identity_types_supported.join(", ")}\n- Anonymous credentials: ${agentAuthMetadata.anonymous.credential_types_supported.join(", ")}\n- Identity assertion types: ${agentAuthMetadata.identity_assertion.assertion_types_supported.join(", ")}\n- Identity assertion credentials: ${agentAuthMetadata.identity_assertion.credential_types_supported.join(", ")}\n- Revocation events: ${agentAuthMetadata.events_supported.join(", ")}\n- Current runtime policy: user-mediated access through the existing Cloudflare Access/OAuth boundary; no separate MCP-only auth stack.\n- Pipeline rule: agents must not bypass MainPanel -> FloatingPanel Chat -> KGC -> Canvas for user-mediated graph work; published HTTP MCP tools remain read-only until mutation auth and conflict semantics are implemented.`;

const a2aAgentCard = {
  name: "Knowgrph Agent",
  description: "Agent-readable discovery, published-document retrieval, and WebMCP-ready metadata surface for Knowgrph.",
  version: "0.1.0",
  provider: {
    organization: "airvio / joohwee",
    url: APP_URL,
  },
  url: `${APP_URL}mcp`,
  preferredTransport: "JSONRPC",
  supportedInterfaces: [
    {
      url: `${APP_URL}mcp`,
      protocolBinding: "JSONRPC",
      transportProtocol: "JSONRPC",
      description: "Primary machine interface for read-only discovery and source-file document access.",
    },
    {
      url: STORAGE_SOURCE_FILES_URL,
      protocolBinding: "HTTP+JSON/REST",
      transportProtocol: "HTTP+JSON/REST",
      description: "Published source-files index and storage-backed document read surface.",
    },
  ],
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
    extendedAgentCard: false,
  },
  defaultInputModes: [
    "text/plain",
    "text/markdown",
    "application/json",
  ],
  defaultOutputModes: [
    "text/plain",
    "text/markdown",
    "application/json",
  ],
  skills: buildAgentReadyA2aSkills(AGENT_READY_TOOL_CONTRACTS),
};

const mcpServerCard = {
  serverInfo: {
    name: "knowgrph",
    version: "0.1.0",
  },
  transport: {
    type: KNOWGRPH_MCP_REMOTE_TRANSPORT_TYPE,
    url: `${APP_URL}mcp`,
    stateless: true,
  },
  capabilities: {
    tools: AGENT_READY_TOOL_CONTRACTS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      securitySchemes: tool.securitySchemes,
      annotations: tool.annotations,
      _meta: tool._meta,
    })),
    resources: {
      listChanged: false,
    },
    prompts: {
      listChanged: false,
    },
    ...buildKnowgrphMcpAppsCapabilities(),
  },
  prompts: AGENT_READY_PROMPT_CONTRACTS,
  resourceTemplates: AGENT_READY_RESOURCE_TEMPLATE_CONTRACTS,
  clientSetups: buildKnowgrphMcpClientSetups({
    baseUrl: APP_URL,
    mcpUrl: `${APP_URL}mcp`,
    serverName: "knowgrph",
  }),
  surfaceRoles: {
    publicReadMcpUrl: `${APP_URL}mcp`,
    publicReadMcpScope:
      "Canonical public install and discovery endpoint for read-only retrieval, prompt discovery, resource discovery, and inspection.",
    controlPlaneMcpUrl: `${APP_URL}control-plane/mcp`,
    controlPlaneMcpScope:
      "Approval-gated orchestration endpoint for control-plane tools, remote Agentic Canvas OS docs invocation, and spend-bearing workflows where deployed.",
    hostedGrammarDefaultPath: "app-owned-forwarder", hostedGrammarDefaultScope: "Hosted app builders should keep /mcp for discovery and route live /, #, @ through an app-owned forwarder unless the host proves MCP session support.",
    remoteGrammarInvokePublic: true,
    remoteGrammarInvokeToolName: "knowgrph.agentic_canvas_os.docs.invoke",
    remoteGrammarInvokeStatus:
      "live-control-plane",
  },
  links: {
    apiCatalog: `${APP_URL}.well-known/api-catalog`,
    skills: `${APP_URL}.well-known/agent-skills/index.json`,
    status: HEALTH_URL,
    agentCard: A2A_AGENT_CARD_URL,
    controlPlaneMcp: `${APP_URL}control-plane/mcp`,
  },
};
const mcpAppResource = buildKnowgrphMcpAppsResourceDescriptor({
  appUrl: APP_URL,
  updatedAt: UPDATED_AT,
});

const webMcpTools = AGENT_READY_TOOL_CONTRACTS.map((tool) => ({
  name: tool.webName,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  securitySchemes: tool.securitySchemes,
  annotations: tool.annotations,
  _meta: tool._meta,
}));
const findWebMcpToolName = (toolId) =>
  normalizeToolString(AGENT_READY_TOOL_CONTRACTS.find((tool) => tool.name === toolId)?.webName);
const SEARCH_WEB_TOOL_NAME = findWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.search);
const FETCH_WEB_TOOL_NAME = findWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.fetch);
const LIST_SOURCE_FILES_WEB_TOOL_NAME = findWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.listSourceFiles);
const READ_SOURCE_FILE_WEB_TOOL_NAME = findWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.readSourceFile);
const READ_SHARED_DOCUMENT_WEB_TOOL_NAME = findWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.readSharedDocument);
const INSPECT_SHARED_DOCUMENT_STRUCTURE_WEB_TOOL_NAME = findWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure);
const INSPECT_AGENT_SURFACE_WEB_TOOL_NAME = findWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectAgentSurface);

export const webMcpScript = `(() => {
  const root = globalThis;
  const siteOrigin = ${JSON.stringify(SITE_ORIGIN)};
  const appBasePath = ${JSON.stringify(APP_BASE_PATH)};
  const defaultWorkspaceId = ${JSON.stringify(DEFAULT_WORKSPACE_ID)};
  const toolDefinitions = ${JSON.stringify(webMcpTools)};
  const toolNames = ${JSON.stringify(webMcpTools.map((tool) => tool.name))};
  const lateBindingRetryDelayMs = 500;
  const lateBindingMaxAttempts = 20;
  const inspectSharedDocumentStructure = (args = {}) => {
    const normalizeString = (value) => String(value || "").trim();
    const normalizeMarkdown = (value) => String(value || "").replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n");
    const readIndent = (line) => {
      const match = String(line || "").match(/^\\s*/);
      return match ? match[0].length : 0;
    };
    const isYamlKeyLine = (line) => /^[A-Za-z0-9_:@-]+\\s*:/.test(normalizeString(line));
    const splitLines = (text) => normalizeMarkdown(text).split("\\n");
    const extractLeadingFrontmatter = (markdown) => {
      const lines = splitLines(markdown);
      let start = 0;
      while (start < lines.length && !normalizeString(lines[start])) start += 1;
      if (normalizeString(lines[start]) !== "---") return null;
      for (let i = start + 1; i < lines.length; i += 1) {
        if (normalizeString(lines[i]) !== "---") continue;
        return {
          frontmatter: lines.slice(start + 1, i).join("\\n"),
          body: lines.slice(i + 1).join("\\n"),
        };
      }
      return null;
    };
    const extractTopLevelFrontmatterKeys = (frontmatter) => {
      const keys = [];
      for (const line of splitLines(frontmatter)) {
        if (!normalizeString(line) || readIndent(line) !== 0) continue;
        const match = line.match(/^([A-Za-z0-9_:@-]+)\\s*:/);
        if (!match || !match[1]) continue;
        keys.push(match[1]);
      }
      return Array.from(new Set(keys)).sort((a, b) => a.localeCompare(b));
    };
    const extractYamlBlock = (text, key) => {
      const lines = splitLines(text);
      const expectedPrefix = key + ":";
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = normalizeString(line);
        if (!trimmed.startsWith(expectedPrefix)) continue;
        const indent = readIndent(line);
        const inlineValue = trimmed.slice(expectedPrefix.length).trim();
        if (inlineValue) {
          return { indent, inlineValue, blockLines: [], blockText: "" };
        }
        const blockLines = [];
        for (let j = i + 1; j < lines.length; j += 1) {
          const nextLine = lines[j];
          const nextTrimmed = normalizeString(nextLine);
          const nextIndent = readIndent(nextLine);
          if (nextTrimmed && nextIndent <= indent && isYamlKeyLine(nextLine)) break;
          blockLines.push(nextLine);
        }
        return {
          indent,
          inlineValue: "",
          blockLines,
          blockText: blockLines.join("\\n"),
        };
      }
      return null;
    };
    const extractNestedYamlKeys = (blockText) => {
      const keys = [];
      for (const line of splitLines(blockText)) {
        const trimmed = normalizeString(line);
        if (!trimmed || trimmed.startsWith("- ")) continue;
        const match = trimmed.match(/^([A-Za-z0-9_:@-]+)\\s*:/);
        if (!match || !match[1]) continue;
        keys.push(match[1]);
      }
      return Array.from(new Set(keys)).sort((a, b) => a.localeCompare(b));
    };
    const countInlineSequenceEntries = (inlineValue) => {
      const trimmed = normalizeString(inlineValue);
      if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return 0;
      return inner.split(",").map((part) => normalizeString(part)).filter(Boolean).length;
    };
    const countYamlSequenceEntries = (text, key) => {
      const block = extractYamlBlock(text, key);
      if (!block) return null;
      if (block.inlineValue) return countInlineSequenceEntries(block.inlineValue);
      let count = 0;
      for (const line of block.blockLines) {
        if (!normalizeString(line)) continue;
        if (readIndent(line) <= block.indent) continue;
        if (/^\\s*-\\s+/.test(line)) count += 1;
      }
      return count;
    };
    const extractMarkdownHeadings = (body) => {
      const headings = [];
      for (const line of splitLines(body)) {
        const match = line.match(/^(#{1,6})\\s+(.+?)\\s*$/);
        if (!match || !match[2]) continue;
        headings.push({
          depth: match[1].length,
          text: normalizeString(match[2]),
        });
      }
      return headings;
    };
    const workspaceId = normalizeString(args.workspaceId);
    const canonicalPath = normalizeString(args.canonicalPath);
    const markdown = normalizeMarkdown(args.markdown);
    const parsed = extractLeadingFrontmatter(markdown);
    const topLevelKeys = parsed ? extractTopLevelFrontmatterKeys(parsed.frontmatter) : [];
    const flowBlock = parsed ? extractYamlBlock(parsed.frontmatter, "flow") : null;
    const flowKeys = flowBlock ? extractNestedYamlKeys(flowBlock.blockText) : [];
    const forbiddenGroupingKeySet = new Set(["kg:subgraphs", "clusters", "groups", "layers"]);
    const forbiddenGroupingKeys = Array.from(new Set(topLevelKeys.concat(flowKeys).filter((key) => forbiddenGroupingKeySet.has(key)))).sort((a, b) => a.localeCompare(b));
    const headings = extractMarkdownHeadings(parsed ? parsed.body : markdown);
    return {
      workspaceId,
      canonicalPath,
      markdownLength: markdown.length,
      lineCount: markdown ? splitLines(markdown).length : 0,
      hasFrontmatter: Boolean(parsed),
      topLevelKeys,
      hasFlowBlock: Boolean(flowBlock),
      flowKeys,
      flowNodeCount: flowBlock ? countYamlSequenceEntries(flowBlock.blockText, "nodes") : null,
      flowConnectionCount: flowBlock ? (countYamlSequenceEntries(flowBlock.blockText, "connections") ?? countYamlSequenceEntries(flowBlock.blockText, "edges")) : null,
      flowSubgraphCount: flowBlock ? countYamlSequenceEntries(flowBlock.blockText, "subgraphs") : null,
      forbiddenGroupingKeys,
      headingCount: headings.length,
      headings: headings.map((heading) => heading.text),
      bodyLength: normalizeString(parsed ? parsed.body : markdown).length,
    };
  };
  const fallbackState = {
    fallbackContext: null,
    activeRegisteredContext: null,
    registrations: new WeakMap(),
    lateBindingRetryId: null,
    lateBindingAttemptCount: 0,
  };
  const normalizeString = (value) => String(value || "").trim();
  const isLocalhostHost = (hostname) => {
    const normalized = normalizeString(hostname).toLowerCase();
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "0.0.0.0";
  };
  const markWebMcpRuntime = (state = toolNames.join(",")) => {
    if (typeof document === "undefined" || !document.documentElement) return;
    document.documentElement.dataset.kgWebmcpTools = toolNames.join(",");
    document.documentElement.dataset.kgWebmcpContext = state;
  }; const markWebMcpHostBinding = (state) => { if (typeof document !== "undefined" && document.documentElement) document.documentElement.dataset.kgWebmcpHostContext = state; };
  const buildDocPath = (canonicalPath, workspaceId = "") => {
    const normalizedCanonicalPath = normalizeString(canonicalPath);
    const normalizedWorkspaceId = normalizeString(workspaceId);
    return normalizedWorkspaceId
      ? \`/api/storage/doc/\${encodeURIComponent(normalizedWorkspaceId)}/\${encodeURIComponent(normalizedCanonicalPath)}\`
      : \`/api/storage/doc-default/\${encodeURIComponent(normalizedCanonicalPath)}\`;
  };
  const createPublishedDocIdentityResolver = ${PUBLISHED_DOC_IDENTITY_RESOLVER_BROWSER_SOURCE};
  const resolvePublishedDocIdentity = createPublishedDocIdentityResolver({
    defaultAppBasePath: appBasePath,
  });
  const buildStorageRequestUrl = (path) => {
    const safePath = normalizeString(path);
    if (!safePath) return "";
    if (typeof window !== "undefined") {
      const hostname = normalizeString(window.location && window.location.hostname);
      if (isLocalhostHost(hostname) && safePath.startsWith("/api/storage/")) return safePath;
      const currentOrigin = normalizeString(window.location && window.location.origin);
      const baseUrl = currentOrigin || siteOrigin;
      return new URL(safePath, baseUrl.endsWith("/") ? baseUrl : \`\${baseUrl}/\`).toString();
    }
    return new URL(safePath, siteOrigin.endsWith("/") ? siteOrigin : \`\${siteOrigin}/\`).toString();
  };
  const resolveAgentReadyBaseUrl = () => {
    if (typeof window !== "undefined") {
      const currentOrigin = normalizeString(window.location && window.location.origin);
      if (currentOrigin) {
        return new URL(\`\${appBasePath}/\`, currentOrigin.endsWith("/") ? currentOrigin : \`\${currentOrigin}/\`)
          .toString()
          .replace(/\\/+$/, "");
      }
    }
    return new URL(\`\${appBasePath}/\`, siteOrigin.endsWith("/") ? siteOrigin : \`\${siteOrigin}/\`)
      .toString()
      .replace(/\\/+$/, "");
  };
  const createAgentSurfaceInspectionExecutor = (args = {}) => {
    const baseUrl = String(args.baseUrl || "").replace(/\\/+$/, "");
    const toolName = String(args.toolName || "inspect_agent_surface").trim();
    if (!baseUrl) {
      throw new Error("baseUrl is required");
    }
    return async () => {
      const response = await fetch(baseUrl + "/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: toolName, arguments: {} },
        }),
      });
      if (!response.ok) throw new Error("inspect_agent_surface MCP call failed with " + response.status);
      const payload = await response.json();
      if (payload && payload.error) throw new Error(payload.error.message || "inspect_agent_surface MCP call failed");
      const result = payload && payload.result;
      const structuredContent = result && result.structuredContent;
      if (!structuredContent || typeof structuredContent !== "object") {
        throw new Error("inspect_agent_surface MCP call did not return structured content");
      }
      return structuredContent;
    };
  };
  const createPublishedAgentReadyToolExecutors = ${PUBLISHED_AGENT_READY_TOOL_EXECUTORS_BROWSER_SOURCE};
  const createWebMcpLifecycleController = ${WEB_MCP_LIFECYCLE_CONTROLLER_BROWSER_SOURCE};
  const toolExecutors = createPublishedAgentReadyToolExecutors({
    toolNames: {
      search: ${JSON.stringify(SEARCH_WEB_TOOL_NAME)},
      fetch: ${JSON.stringify(FETCH_WEB_TOOL_NAME)},
      listSourceFiles: ${JSON.stringify(LIST_SOURCE_FILES_WEB_TOOL_NAME)},
      readSourceFile: ${JSON.stringify(READ_SOURCE_FILE_WEB_TOOL_NAME)},
      readSharedDocument: ${JSON.stringify(READ_SHARED_DOCUMENT_WEB_TOOL_NAME)},
      inspectSharedDocumentStructure: ${JSON.stringify(INSPECT_SHARED_DOCUMENT_STRUCTURE_WEB_TOOL_NAME)},
      inspectAgentSurface: ${JSON.stringify(INSPECT_AGENT_SURFACE_WEB_TOOL_NAME)},
    },
    defaultWorkspaceId,
    publicBaseUrl: siteOrigin,
    buildStorageDocPath: buildDocPath,
    fetchSourceFilesIndexResponse: () =>
      fetch(buildStorageRequestUrl("/api/storage/source-files"), {
        headers: { accept: "text/markdown" },
      }),
    fetchStorageMarkdownResponse: (path) =>
      fetch(buildStorageRequestUrl(path), {
        headers: { accept: "text/markdown" },
      }),
    resolveSharedDocumentInput: (input = {}) => resolvePublishedDocIdentity(input),
    inspectSharedDocumentStructure,
    buildAgentSurfaceInspection: createAgentSurfaceInspectionExecutor({
      baseUrl: resolveAgentReadyBaseUrl(),
      toolName: ${JSON.stringify(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectAgentSurface)},
    }),
  });
  const tools = toolDefinitions.map((tool) => {
    const execute = toolExecutors[tool.name];
    if (typeof execute !== "function") {
      throw new Error(\`Missing HTML WebMCP fallback executor for \${tool.name}\`);
    }
    return {
      ...tool,
      execute,
    };
  });
  const webMcpLifecycle = createWebMcpLifecycleController({
    root,
    state: fallbackState,
    tools,
    toolNames,
    lateBindingRetryDelayMs: lateBindingRetryDelayMs,
    lateBindingMaxAttempts: lateBindingMaxAttempts,
    markRuntimeState: markWebMcpRuntime, markHostBindingState: markWebMcpHostBinding,
  });
  webMcpLifecycle.install();
})();`;

const PUBLISHED_TOOL_NAME_CONFIG = {
  search: KNOWGRPH_AGENT_READY_TOOL_IDS.search,
  fetch: KNOWGRPH_AGENT_READY_TOOL_IDS.fetch,
  listSourceFiles: KNOWGRPH_AGENT_READY_TOOL_IDS.listSourceFiles,
  readSourceFile: KNOWGRPH_AGENT_READY_TOOL_IDS.readSourceFile,
  readSharedDocument: KNOWGRPH_AGENT_READY_TOOL_IDS.readSharedDocument,
  inspectSharedDocumentStructure: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure,
  inspectAgentSurface: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectAgentSurface,
};

const sha256Hex = async (text) => {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const agentSkillMarkdownByName = buildKnowgrphVdeoxplnMarkdownByName();
const agentSkillSha256ByName = Object.fromEntries(
  AGENT_READY_AGENT_SKILL_DEFINITIONS.map((skill) => [
    skill.name,
    sha256Hex(agentSkillMarkdownByName[skill.name] || ""),
  ]),
);
const agentSkillMarkdownByRoutePath = new Map(
  AGENT_READY_AGENT_SKILL_DEFINITIONS.map((skill) => [
    `${APP_BASE_PATH}${skill.path}`.replace(/\/+$/, ""),
    agentSkillMarkdownByName[skill.name] || "",
  ]),
);
const agentSkillStaticFiles = () => Object.fromEntries(
  AGENT_READY_AGENT_SKILL_DEFINITIONS.map((skill) => [
    skill.path.replace(/^\/+/, ""),
    {
      contentType: "text/markdown; charset=utf-8",
      body: agentSkillMarkdownByName[skill.name] || "",
    },
  ]),
);

const agentSkillsIndex = async () => buildAgentReadyAgentSkillsIndex({
  appUrl: APP_URL,
  updatedAt: UPDATED_AT,
  sha256ByName: agentSkillSha256ByName,
});

const httpMessageSignaturesDirectory = {
  keys: [
    {
      kty: "OKP",
      crv: "Ed25519",
      kid: "knowgrph-agent-ready-2026-05-21",
      use: "sig",
      alg: "EdDSA",
      x: "11qYAYdkVKxA4G0wV47IxPtYfFVH_H7zmC2Di2PcvLU",
    },
  ],
};

const mcpInitializeResult = {
  protocolVersion: "2025-06-18",
  capabilities: {
    tools: {},
    resources: {},
    prompts: {
      listChanged: false,
    },
    ...buildKnowgrphMcpAppsCapabilities(),
  },
  serverInfo: mcpServerCard.serverInfo,
};

const mcpTools = mcpServerCard.capabilities.tools;
const mcpResources = [mcpAppResource];
const mcpPrompts = AGENT_READY_PROMPT_CONTRACTS;
const mcpResourceTemplates = AGENT_READY_RESOURCE_TEMPLATE_CONTRACTS;

const buildHealthStatusBody = () => ({
  status: "pass",
  service: "knowgrph-agent-ready-pages",
  homepage: APP_URL,
  health: HEALTH_URL,
  updatedAt: UPDATED_AT,
  checks: {
    linkHeaders: true,
    markdownNegotiation: true,
    httpMcp: true,
    webMcp: true,
    mcpApps: true,
    commerce: { acp: true, ucp: true, mpp: true, x402: true },
    defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
  },
});

const buildAgentSurfaceInspection = async () => buildAgentSurfaceInspectionPayload({
  baseUrl: APP_URL,
  health: buildHealthStatusBody(),
  apiCatalog,
  openApi,
  mcpServerCard,
  agentCard: a2aAgentCard,
  agentSkills: await agentSkillsIndex(),
  commerce: buildKnowgrphCommerceDiscovery({ origin: SITE_ORIGIN }),
});

const PUBLISHED_MCP_TOOL_EXECUTORS = createPublishedAgentReadyToolExecutors({
  toolNames: PUBLISHED_TOOL_NAME_CONFIG,
  defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
  publicBaseUrl: SITE_ORIGIN,
  buildStorageDocPath,
  fetchSourceFilesIndexResponse: () =>
    fetch(`${STORAGE_FETCH_ORIGIN}${buildKnowgrphStorageSourceFilesIndexPath()}`, {
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

const executeMcpTool = async (name, args) => {
  const execute = PUBLISHED_MCP_TOOL_EXECUTORS[name];
  if (typeof execute !== "function") {
    throw new Error(`unknown tool: ${name}`);
  }
  return execute(args);
};

const readMcpResource = async (uri) => {
  const normalizedUri = normalizeToolString(uri);
  if (normalizedUri === KNOWGRPH_MCP_APP_RESOURCE_URI) {
    return buildKnowgrphMcpAppsResourceReadResult({
      appUrl: APP_URL,
      updatedAt: UPDATED_AT,
      toolNames: mcpTools.map((tool) => tool.name),
    });
  }
  const sourceFileId = parseKnowgrphSourceFileResourceUri(normalizedUri);
  if (sourceFileId) {
    const sourceFile = await executeMcpTool(KNOWGRPH_AGENT_READY_TOOL_IDS.fetch, { id: sourceFileId });
    return buildKnowgrphSourceFileResourceReadResult({ uri: normalizedUri, sourceFile });
  }
  throw new Error(`unknown resource: ${uri}`);
};

const handleMcpTransport = async (request) => {
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
        return jsonRpcResult(rpc.id, getKnowgrphAgentReadyPrompt(promptName, promptArgs));
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
        return jsonRpcResult(rpc.id, await readMcpResource(uri));
      } catch (error) {
        return jsonRpcError(rpc.id, -32602, error instanceof Error ? error.message : String(error));
      }
    }
    case "tools/call": {
      const toolName = normalizeToolString(rpc.params?.name);
      const toolArgs = rpc.params?.arguments && typeof rpc.params.arguments === "object" ? rpc.params.arguments : {};
      if (!toolName) return jsonRpcError(rpc.id, -32602, "Tool name is required");
      try {
        const result = await executeMcpTool(toolName, toolArgs);
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

const buildKnowgrphMcpAppHtmlBody = () => buildKnowgrphMcpAppsResourceReadResult({
  appUrl: APP_URL,
  updatedAt: UPDATED_AT,
  toolNames: mcpTools.map((tool) => tool.name),
}).contents[0].text;

export const buildAgentReadyStaticFiles = async () => ({
  ...buildKnowgrphCommerceStaticFiles({ origin: SITE_ORIGIN }),
  "llms.txt": { contentType: "text/plain; charset=utf-8", body: rootLlmsTxt },
  "auth.md": { contentType: "text/markdown; charset=utf-8", body: authMd },
  "robots.txt": {
    contentType: "text/plain; charset=utf-8",
    body: buildRobotsTxt(`${ROOT_URL}sitemap.xml`),
  },
  "sitemap.xml": {
    contentType: "application/xml; charset=utf-8",
    body: sitemapXml,
  },
  ".well-known/api-catalog": {
    contentType: "application/linkset+json; charset=utf-8",
    body: JSON.stringify(apiCatalog, null, 2),
  },
  ".well-known/openapi.json": {
    contentType: "application/vnd.oai.openapi+json; charset=utf-8",
    body: JSON.stringify(openApi, null, 2),
  },
  ".well-known/agent-card.json": {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(a2aAgentCard, null, 2),
  },
  ".well-known/oauth-protected-resource": {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(oauthProtectedResource, null, 2),
  },
  ".well-known/oauth-authorization-server": {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(oauthAuthorizationServer, null, 2),
  },
  ".well-known/openid-configuration": {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(oauthAuthorizationServer, null, 2),
  },
  ".well-known/mcp/server-card.json": {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(mcpServerCard, null, 2),
  },
  ".well-known/mcp.json": {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(mcpServerCard, null, 2),
  },
  ".well-known/agent-skills/index.json": {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(await agentSkillsIndex(), null, 2),
  },
  ".well-known/mcp/apps/knowgrph-agent-ready.html": {
    contentType: "text/html;profile=mcp-app; charset=utf-8",
    body: buildKnowgrphMcpAppHtmlBody(),
  },
  ...agentSkillStaticFiles(),
  ".well-known/http-message-signatures-directory": {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(httpMessageSignaturesDirectory, null, 2),
  },
});

const handlesKnowgrphRoot = (pathname) => pathname === APP_BASE_PATH || pathname === `${APP_BASE_PATH}/`;
const handlesKnowgrphHtmlSurface = (pathname) =>
  handlesKnowgrphRoot(pathname) || Boolean(resolvePublishedDocPathIdentity(pathname));
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
  if (handlesKnowgrphRoot(url.pathname)) {
    return wantsMarkdown(request) ? "homepage-markdown" : "homepage-html";
  }
  return "app-surface";
};

const withKnowgrphRouteHeaders = (request, response) =>
  withAgentReadyRouteHeaders(response, {
    owner: KNOWGRPH_AGENT_READY_ROUTE_OWNER,
    tag: resolveAgentReadyRouteTag(request),
  });

const routeResponse = async (request) => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const publishedDocIdentity = resolvePublishedDocRequestIdentity(request.url);
  const machineRedirect = resolveMachineRouteRedirect(pathname);
  if (machineRedirect) return Response.redirect(new URL(machineRedirect, request.url), 308);

  if (publishedDocIdentity && wantsMarkdown(request)) {
    return proxyPublishedDocMarkdownResponse(request, publishedDocIdentity);
  }
  if (handlesKnowgrphRoot(url.pathname) && wantsMarkdown(request)) {
    return markdownResponse(agentReadyMarkdownBody);
  }

  switch (pathname) {
    case HEALTH_PATH:
      return healthResponse(buildHealthStatusBody());
    case `${APP_BASE_PATH}/mcp`:
      return handleMcpTransport(request);
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
    case `${APP_BASE_PATH}/.well-known/mcp/apps/knowgrph-agent-ready.html`:
      return mcpAppsHtmlResponse(buildKnowgrphMcpAppHtmlBody());
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
export async function onRequest(context) {
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
    return withKnowgrphRouteHeaders(request, await routeResponse(request));
  }

  if (method === "POST" && isGitHubWorkspaceWriteRoutePath(url.pathname)) {
    return withKnowgrphRouteHeaders(request, await handleGitHubWorkspaceWrite(request, env));
  }

  if (method !== "GET" && method !== "HEAD") {
    return jsonStatusResponse(405, { ok: false, error: "unsupported_method" });
  }

  if (handlesKnowgrphStaticAsset(url.pathname, APP_BASE_PATH)) {
    return fetchKnowgrphStaticAsset(context);
  }

  const routed = await routeResponse(request);
  if (routed) {
    const next = withKnowgrphRouteHeaders(request, routed);
    if (method === "HEAD") return new Response(null, next);
    return next;
  }

  const publishedDocIdentity = resolvePublishedDocRequestIdentity(request.url);
  const response = publishedDocIdentity ? await fetchKnowgrphAppShellAsset(context, APP_BASE_PATH) : await context.next();
  if (!handlesKnowgrphHtmlSurface(url.pathname)) return response;
  const htmlResponse = method === "HEAD" ? response : await injectWebMcpScript(response, webMcpScript);
  const nextResponse = new Response(method === "HEAD" ? null : htmlResponse.body, htmlResponse);
  nextResponse.headers.set("link", agentReadyHomepageLinkHeaderValue);
  if (handlesKnowgrphRoot(url.pathname) || publishedDocIdentity) {
    nextResponse.headers.delete("x-frame-options");
    nextResponse.headers.delete("content-security-policy-report-only");
    nextResponse.headers.set("content-security-policy", "frame-ancestors *");
  }
  return withKnowgrphRouteHeaders(request, nextResponse);
}
