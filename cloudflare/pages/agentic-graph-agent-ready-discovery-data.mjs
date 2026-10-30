import { buildAgenticGraphAgentReadyToolContracts, AGENTIC_OS_AGENT_READY_TOOL_IDS } from "../../canvas/src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs";
import { buildAgenticGraphAgentReadyPromptContracts } from "../../canvas/src/features/agent-ready/agentic-graph-agent-ready-prompt-contract.mjs";
import { buildAgenticGraphAgentReadyResourceTemplateContracts } from "../../canvas/src/features/agent-ready/agentic-graph-agent-ready-resource-contract.mjs";
import {
  AGENTIC_OS_MCP_REMOTE_TRANSPORT_TYPE,
  buildAgenticGraphMcpAppsCapabilities,
  buildAgenticGraphMcpClientSetups,
  buildAgenticGraphMcpAppsResourceDescriptor,
  buildAgenticGraphMcpAppsResourceReadResult,
} from "../../canvas/src/features/agent-ready/mcpAppsReadyContract.mjs";
import {
  AGENT_READY_AGENT_SKILL_DEFINITIONS,
  buildAgentReadyA2aSkills,
  buildAgentReadyAgentSkillsIndex,
  buildAgentReadyOpenApiPaths,
  buildMarkdownDiscoverySitemapXml,
  buildRootLlmsTxt,
} from "./agentic-graph-agent-ready-discovery.mjs";
import { buildAgenticGraphCommerceStaticFiles } from "./agentic-graph-agent-ready-commerce.mjs";
import { buildAgenticGraphVdeoxplnMarkdownByName } from "../../canvas/src/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs";
import { resolveAgenticOsControlPlaneMcpUrl } from "../../canvas/src/features/agent-ready/agenticOsControlPlane.mjs";
import {
  A2A_AGENT_CARD_URL,
  APP_A2A_AGENT_CARD_PATH,
  APP_BASE_PATH,
  APP_URL,
  DEFAULT_WORKSPACE_ID,
  HEALTH_PATH,
  HEALTH_URL,
  ROOT_URL,
  SITE_ORIGIN,
  STORAGE_SOURCE_FILES_URL,
  UPDATED_AT,
} from "./agentic-graph-agent-ready-shared.mjs";

export const AGENT_READY_TOOL_CONTRACTS = buildAgenticGraphAgentReadyToolContracts({
  defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
});
export const AGENT_READY_PROMPT_CONTRACTS = buildAgenticGraphAgentReadyPromptContracts();
export const AGENT_READY_RESOURCE_TEMPLATE_CONTRACTS = buildAgenticGraphAgentReadyResourceTemplateContracts();
const STORAGE_LLMS_URL = `${SITE_ORIGIN}/api/storage/llms.txt`;
const STORAGE_MANIFEST_URL = `${SITE_ORIGIN}/api/storage/content-manifest.json`;
const CONTROL_PLANE_MCP_URL = resolveAgenticOsControlPlaneMcpUrl(SITE_ORIGIN);
const buildRobotsTxt = (sitemapUrl) => `User-agent: *
Allow: /agentic-graph/
Disallow: /api/payments/

User-agent: GPTBot
Allow: /agentic-graph/
Disallow: /api/payments/

User-agent: Claude-Web
Allow: /agentic-graph/
Disallow: /api/payments/

User-agent: Google-Extended
Allow: /agentic-graph/
Disallow: /api/payments/

User-agent: OAI-SearchBot
Allow: /agentic-graph/
Disallow: /api/payments/

Content-Signal: ai-train=no, search=yes, ai-input=yes
Sitemap: ${sitemapUrl}
`;
export const robotsTxt = buildRobotsTxt(`${APP_URL}sitemap.xml`);
const discoveryInputs = { appUrl: APP_URL, rootUrl: ROOT_URL, storageSourceFilesUrl: STORAGE_SOURCE_FILES_URL, storageLlmsUrl: STORAGE_LLMS_URL, storageManifestUrl: STORAGE_MANIFEST_URL, agentCardUrl: A2A_AGENT_CARD_URL, updatedAt: UPDATED_AT };
export const sitemapXml = buildMarkdownDiscoverySitemapXml(discoveryInputs);
export const rootLlmsTxt = buildRootLlmsTxt(discoveryInputs);
export const apiCatalog = {
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

export const openApi = {
  openapi: "3.1.0",
  info: {
    title: "agentic-graph API",
    version: "0.1.0",
    description: "Agent discovery surface for the agentic-graph Cloudflare deployment.",
  },
  servers: [
    { url: SITE_ORIGIN, description: "agentic-graph Cloudflare deployment" },
  ],
  paths: buildAgentReadyOpenApiPaths({
    appBasePath: APP_BASE_PATH,
    appA2aAgentCardPath: APP_A2A_AGENT_CARD_PATH,
    healthPath: HEALTH_PATH,
  }),
};

export const oauthProtectedResource = { resource: APP_URL, resource_name: "agentic-graph", authorization_servers: [SITE_ORIGIN], scopes_supported: ["agentic-graph:read", "agentic-graph:source-files:read"], bearer_methods_supported: ["header"], resource_documentation: `${APP_URL}llms.txt` };
const cloudflareAccessIssuer = `${SITE_ORIGIN}/cdn-cgi/access`;
const agentAuthMetadata = { skill: `${SITE_ORIGIN}/auth.md`, register_uri: `${APP_URL}agent/auth`, claim_uri: `${APP_URL}agent/auth/claim`, revocation_uri: `${APP_URL}agent/auth/revoke`, identity_types_supported: ["anonymous", "identity_assertion"], anonymous: { credential_types_supported: ["api_key"] }, identity_assertion: { assertion_types_supported: ["urn:ietf:params:oauth:token-type:id-jag", "verified_email"], credential_types_supported: ["access_token", "api_key"] }, events_supported: ["https://schemas.workos.com/events/agent/auth/identity/assertion/revoked"], registration_status: "metadata_published_runtime_user_mediated" };
export const oauthAuthorizationServer = { issuer: SITE_ORIGIN, resource: oauthProtectedResource.resource, resource_name: oauthProtectedResource.resource_name, authorization_servers: oauthProtectedResource.authorization_servers, cloudflare_access_issuer: cloudflareAccessIssuer, authorization_endpoint: `${cloudflareAccessIssuer}/login`, token_endpoint: `${cloudflareAccessIssuer}/token`, jwks_uri: `${APP_URL}.well-known/http-message-signatures-directory`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "client_credentials"], token_endpoint_auth_methods_supported: ["client_secret_basic", "private_key_jwt"], scopes_supported: oauthProtectedResource.scopes_supported, agent_auth: agentAuthMetadata };
export const authMd = `# agentic-graph auth.md\n\nagentic-graph publishes agent registration metadata for the read-only agent surface at ${APP_URL}. Agents should first fetch ${SITE_ORIGIN}/.well-known/oauth-protected-resource, follow its authorization_servers entry to ${SITE_ORIGIN}/.well-known/oauth-authorization-server, and read the agent_auth block.\n\n## Registration\n\n- Register: ${agentAuthMetadata.register_uri}\n- Claim: ${agentAuthMetadata.claim_uri}\n- Revoke: ${agentAuthMetadata.revocation_uri}\n- Supported identity types: ${agentAuthMetadata.identity_types_supported.join(", ")}\n- Anonymous credentials: ${agentAuthMetadata.anonymous.credential_types_supported.join(", ")}\n- Identity assertion types: ${agentAuthMetadata.identity_assertion.assertion_types_supported.join(", ")}\n- Identity assertion credentials: ${agentAuthMetadata.identity_assertion.credential_types_supported.join(", ")}\n- Revocation events: ${agentAuthMetadata.events_supported.join(", ")}\n- Current runtime policy: user-mediated access through the existing Cloudflare Access/OAuth boundary; no separate MCP-only auth stack.\n- Pipeline rule: agents must not bypass MainPanel -> FloatingPanel Chat -> AGENTIC_OS -> Canvas for user-mediated graph work; published HTTP MCP tools remain read-only until mutation auth and conflict semantics are implemented.`;

export const a2aAgentCard = {
  name: "agentic-graph Agent",
  description: "Agent-readable discovery, published-document retrieval, and WebMCP-ready metadata surface for agentic-graph.",
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

export const mcpServerCard = {
  serverInfo: {
    name: "agentic-graph",
    version: "0.1.0",
  },
  transport: {
    type: AGENTIC_OS_MCP_REMOTE_TRANSPORT_TYPE,
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
    ...buildAgenticGraphMcpAppsCapabilities(),
  },
  prompts: AGENT_READY_PROMPT_CONTRACTS,
  resourceTemplates: AGENT_READY_RESOURCE_TEMPLATE_CONTRACTS,
  clientSetups: buildAgenticGraphMcpClientSetups({
    baseUrl: APP_URL,
    mcpUrl: `${APP_URL}mcp`,
    serverName: "agentic-graph",
  }),
  surfaceRoles: {
    publicReadMcpUrl: `${APP_URL}mcp`,
    publicReadMcpScope:
      "Canonical public install and discovery endpoint for read-only retrieval, prompt discovery, resource discovery, and inspection.",
    controlPlaneMcpUrl: CONTROL_PLANE_MCP_URL,
    controlPlaneMcpScope:
      "Approval-gated orchestration endpoint for control-plane tools, remote Agentic Canvas OS docs invocation, and spend-bearing workflows where deployed.",
    hostedGrammarDefaultPath: "app-owned-forwarder", hostedGrammarDefaultScope: "Hosted app builders should keep /mcp for discovery and route live /, #, @ through an app-owned forwarder unless the host proves MCP session support.",
    remoteGrammarInvokePublic: true,
    remoteGrammarInvokeToolName: "agentic-graph.agentic_canvas_os.docs.invoke",
    remoteGrammarInvokeStatus:
      "live-control-plane",
  },
  links: {
    apiCatalog: `${APP_URL}.well-known/api-catalog`,
    skills: `${APP_URL}.well-known/agent-skills/index.json`,
    status: HEALTH_URL,
    agentCard: A2A_AGENT_CARD_URL,
    controlPlaneMcp: CONTROL_PLANE_MCP_URL,
  },
};
export const mcpAppResource = buildAgenticGraphMcpAppsResourceDescriptor({
  appUrl: APP_URL,
  updatedAt: UPDATED_AT,
});

export const webMcpTools = AGENT_READY_TOOL_CONTRACTS.map((tool) => ({
  name: tool.webName,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  securitySchemes: tool.securitySchemes,
  annotations: tool.annotations,
  _meta: tool._meta,
}));
const sha256Hex = async (text) => {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const agentSkillMarkdownByName = buildAgenticGraphVdeoxplnMarkdownByName();
const agentSkillSha256ByName = Object.fromEntries(
  AGENT_READY_AGENT_SKILL_DEFINITIONS.map((skill) => [
    skill.name,
    sha256Hex(agentSkillMarkdownByName[skill.name] || ""),
  ]),
);
export const agentSkillMarkdownByRoutePath = new Map(
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

export const agentSkillsIndex = async () => buildAgentReadyAgentSkillsIndex({
  appUrl: APP_URL,
  updatedAt: UPDATED_AT,
  sha256ByName: agentSkillSha256ByName,
});

export const httpMessageSignaturesDirectory = {
  keys: [
    {
      kty: "OKP",
      crv: "Ed25519",
      kid: "agentic-graph-agent-ready-2026-05-21",
      use: "sig",
      alg: "EdDSA",
      x: "11qYAYdkVKxA4G0wV47IxPtYfFVH_H7zmC2Di2PcvLU",
    },
  ],
};

export const mcpInitializeResult = {
  protocolVersion: "2025-06-18",
  capabilities: {
    tools: {},
    resources: {},
    prompts: {
      listChanged: false,
    },
    ...buildAgenticGraphMcpAppsCapabilities(),
  },
  serverInfo: mcpServerCard.serverInfo,
};

export const mcpTools = mcpServerCard.capabilities.tools;
export const mcpResources = [mcpAppResource];
export const mcpPrompts = AGENT_READY_PROMPT_CONTRACTS;
export const mcpResourceTemplates = AGENT_READY_RESOURCE_TEMPLATE_CONTRACTS;

export const buildHealthStatusBody = () => ({
  status: "pass",
  service: "agentic-agent-ready-pages",
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
export const buildAgenticGraphMcpAppHtmlBody = () => buildAgenticGraphMcpAppsResourceReadResult({
  appUrl: APP_URL,
  updatedAt: UPDATED_AT,
  toolNames: mcpTools.map((tool) => tool.name),
}).contents[0].text;

export const buildAgentReadyStaticFiles = async (args = {}) => ({
  ...buildAgenticGraphCommerceStaticFiles({ origin: SITE_ORIGIN, env: args.env || {} }),
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
  ".well-known/mcp/apps/agentic-graph-agent-ready.html": {
    contentType: "text/html;profile=mcp-app; charset=utf-8",
    body: buildAgenticGraphMcpAppHtmlBody(),
  },
  ...agentSkillStaticFiles(),
  ".well-known/http-message-signatures-directory": {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(httpMessageSignaturesDirectory, null, 2),
  },
});


export { AGENTIC_OS_AGENT_READY_TOOL_IDS };
