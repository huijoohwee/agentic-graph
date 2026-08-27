import { KNOWGRPH_AGENT_READY_TOOL_IDS } from "../../canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs";
import { buildKnowgrphVdeoxplnAgentSkillDefinitions } from "../../canvas/src/features/agent-ready/knowgrphVdeoxplnContract.mjs";

export const buildMarkdownDiscoverySitemapXml = ({ appUrl, rootUrl, storageSourceFilesUrl, storageLlmsUrl, storageManifestUrl, agentCardUrl, updatedAt }) => {
  const locations = [appUrl, `${appUrl}llms.txt`, `${rootUrl}llms.txt`, storageSourceFilesUrl, storageLlmsUrl, storageManifestUrl, `${appUrl}.well-known/openapi.json`, agentCardUrl, `${appUrl}.well-known/mcp/server-card.json`]
  const entries = locations.map((location) => `  <url>\n    <loc>${location}</loc>\n    <lastmod>${updatedAt}</lastmod>\n  </url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
}

export const buildRootLlmsTxt = ({ appUrl, rootUrl, storageLlmsUrl, storageManifestUrl, agentCardUrl }) => `# Airvio

> Agent discovery index for Airvio products and machine-readable interfaces.

## Products

- [Knowgrph](${appUrl}llms.txt): Agent-actionable chat-to-canvas knowledge graph workspace.

## Agent Interfaces

- [Knowgrph Source Files](${storageLlmsUrl})
- [Markdown Content Manifest](${storageManifestUrl})
- [Knowgrph OpenAPI](${appUrl}.well-known/openapi.json)
- [A2A Agent Card](${agentCardUrl})
- [MCP Server Card](${appUrl}.well-known/mcp/server-card.json)
- [Crawl policy](${rootUrl}robots.txt)
- [Sitemap](${rootUrl}sitemap.xml)
`

const MACHINE_ROUTE_REDIRECTS = new Map([
  ['/knowgrph/openapi.json', '/knowgrph/.well-known/openapi.json'],
  ['/knowgrph/api-catalog.json', '/knowgrph/.well-known/api-catalog'],
])

export const resolveMachineRouteRedirect = (pathname) => MACHINE_ROUTE_REDIRECTS.get(pathname) || ''

export const AGENT_READY_A2A_SKILL_META_BY_TOOL_ID = {
  [KNOWGRPH_AGENT_READY_TOOL_IDS.search]: {
    id: "search",
    tags: ["mcp", "search", "source-files", "read-only"],
    examples: ["Search Knowgrph Source Files for renderer architecture."],
    outputModes: ["application/json"],
  },
  [KNOWGRPH_AGENT_READY_TOOL_IDS.fetch]: {
    id: "fetch",
    tags: ["mcp", "fetch", "source-files", "markdown", "read-only"],
    examples: ["Fetch the Knowgrph Source File id returned by search."],
    outputModes: ["text/markdown", "application/json"],
  },
  [KNOWGRPH_AGENT_READY_TOOL_IDS.listSourceFiles]: {
    id: "list-source-files",
    tags: ["mcp", "discovery", "source-files", "read-only"],
    examples: ["List the published Knowgrph Source Files."],
    outputModes: ["text/markdown", "application/json"],
  },
  [KNOWGRPH_AGENT_READY_TOOL_IDS.readSourceFile]: {
    id: "read-source-file",
    tags: ["mcp", "read", "markdown", "workspace"],
    examples: ["Read the published source file for docs/getting-started.md."],
    outputModes: ["text/markdown", "application/json"],
  },
  [KNOWGRPH_AGENT_READY_TOOL_IDS.readSharedDocument]: {
    id: "read-shared-document",
    tags: ["mcp", "read", "shared-document", "markdown"],
    examples: ["Read the Knowgrph shared document behind this share URL."],
    outputModes: ["text/markdown", "application/json"],
  },
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure]: {
    id: "inspect-shared-document-structure",
    tags: ["mcp", "inspect", "shared-document", "structure"],
    examples: ["Inspect the structure of this Knowgrph shared document."],
    outputModes: ["application/json", "text/markdown"],
  },
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectAgentSurface]: {
    id: "inspect-agent-surface",
    tags: ["mcp", "agent-ready", "discovery", "metadata"],
    examples: ["Show the Knowgrph agent discovery metadata."],
    outputModes: ["application/json", "text/markdown"],
  },
};

export const AGENT_READY_AGENT_SKILL_DEFINITIONS = buildKnowgrphVdeoxplnAgentSkillDefinitions();

export const buildAgentReadyA2aSkills = (toolContracts) =>
  toolContracts.map((tool) => {
    const meta = AGENT_READY_A2A_SKILL_META_BY_TOOL_ID[tool.name] || {
      id: String(tool.name || "").replace(/_/g, "-"),
      tags: ["mcp", "read-only"],
      examples: [`Call ${tool.name} on Knowgrph.`],
      outputModes: ["application/json"],
    };
    return {
      id: meta.id,
      name: tool.title,
      description: tool.description,
      tags: meta.tags,
      examples: meta.examples,
      inputModes: ["application/json", "text/plain"],
      outputModes: meta.outputModes,
    };
  });

export const buildAgentReadyAgentSkillsIndex = async ({
  appUrl,
  updatedAt,
  sha256ByName,
}) => ({
  $schema: "https://agent-skills.dev/schemas/skills-index.v0.2.json",
  updated_at: updatedAt,
  skills: await Promise.all(
    AGENT_READY_AGENT_SKILL_DEFINITIONS.map(async (skill) => ({
      name: skill.name,
      type: skill.type,
      description: skill.description,
      url: `${String(appUrl || "").replace(/\/+$/, "")}${skill.path}`,
      sha256: await sha256ByName[skill.name],
      vdeoxpln: skill.vdeoxpln,
    })),
  ),
});

export const buildAgentReadyOpenApiPaths = ({
  appBasePath,
  appA2aAgentCardPath,
  healthPath,
}) => {
  const agentSkillPaths = Object.fromEntries(
    AGENT_READY_AGENT_SKILL_DEFINITIONS.map((skill) => [
      `${appBasePath}${skill.path}`,
      {
        get: {
          summary: `Read the ${skill.name} agent skill markdown`,
          responses: {
            "200": { description: `Agent skill markdown for ${skill.name}` },
          },
        },
      },
    ]),
  );
  return {
  [healthPath]: {
    get: {
      summary: "Read the Knowgrph agent-ready health status",
      responses: {
        "200": { description: "Health status in application/health+json format" },
      },
    },
  },
  [`${appBasePath}/mcp`]: {
    get: {
      summary: "Read MCP transport metadata",
      responses: {
        "200": { description: "MCP transport metadata" },
      },
    },
    post: {
      summary: "Send a JSON-RPC MCP request",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
      responses: {
        "200": { description: "JSON-RPC result payload" },
      },
    },
  },
  [appA2aAgentCardPath]: {
    get: {
      summary: "Read the Knowgrph A2A Agent Card",
      responses: {
        "200": { description: "A2A Agent Card JSON" },
      },
    },
  },
  "/api/storage/llms.txt": {
    get: {
      summary: "Read the Source Files LLM index",
      responses: {
        "200": { description: "Plain-text LLM index" },
      },
    },
  },
  "/api/storage/content-manifest.json": {
    get: {
      summary: "Read the Markdown-first published content manifest",
      responses: {
        "200": { description: "Editor Workspace source paths with canonical HTML and Markdown projections" },
      },
    },
  },
  "/api/storage/source-files": {
    get: {
      summary: "List published Source Files",
      responses: {
        "200": { description: "Source Files index" },
      },
    },
  },
  "/api/storage/source-files/{workspaceId}": {
    get: {
      summary: "List published Source Files for a workspace",
      parameters: [
        { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Workspace-scoped Source Files index" },
      },
    },
  },
  "/api/storage/source-files/{workspaceId}/llms.txt": {
    get: {
      summary: "Read the workspace-scoped Source Files LLM index",
      parameters: [
        { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Workspace-scoped plain-text LLM index" },
      },
    },
  },
  "/api/storage/doc-default/{canonicalPath}": {
    get: {
      summary: "Read a default-workspace Source File markdown document",
      parameters: [
        { name: "canonicalPath", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Markdown document from the default Editor Workspace" },
        "404": { description: "Document not found" },
      },
    },
  },
  "/api/storage/doc/{workspaceId}/{canonicalPath}": {
    get: {
      summary: "Read a Source File markdown document",
      parameters: [
        { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
        { name: "canonicalPath", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Markdown document" },
        "404": { description: "Document not found" },
      },
    },
  },
  "/api/storage/blob/{workspaceId}/{canonicalPath}": {
    post: {
      summary: "Store a workspace binary artifact in R2",
      parameters: [
        { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
        { name: "canonicalPath", in: "path", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/octet-stream": { schema: { type: "string", format: "binary" } },
        },
      },
      responses: {
        "200": { description: "R2 object coordinates and public storage route" },
        "400": { description: "Invalid workspace, path, or declared payload size" },
      },
    },
    get: {
      summary: "Read a workspace binary artifact from R2",
      parameters: [
        { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
        { name: "canonicalPath", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Binary artifact body with stored HTTP metadata" },
        "404": { description: "Object not found" },
      },
    },
    head: {
      summary: "Read workspace binary artifact metadata from R2",
      parameters: [
        { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
        { name: "canonicalPath", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Binary artifact metadata" },
        "404": { description: "Object not found" },
      },
    },
  },
  [`${appBasePath}/doc-default/{canonicalPath}`]: {
    get: {
      summary: "Read a default-workspace shared document",
      parameters: [
        { name: "canonicalPath", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "HTML for browsers or markdown when Accept includes text/markdown" },
        "404": { description: "Document not found" },
      },
    },
  },
  [`${appBasePath}/doc/{workspaceId}/{canonicalPath}`]: {
    get: {
      summary: "Read a shared document",
      parameters: [
        { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
        { name: "canonicalPath", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "HTML for browsers or markdown when Accept includes text/markdown" },
        "404": { description: "Document not found" },
      },
    },
  },
  [`${appBasePath}/share/{shareToken}`]: {
    get: {
      summary: "Read a shared document through the canonical opaque share token route",
      parameters: [
        { name: "shareToken", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "HTML for browsers or published markdown when Accept includes text/markdown" },
        "404": { description: "Document not found" },
      },
    },
  },
  ...agentSkillPaths,
  };
};

export const buildAgentReadyDiscoveryExpectations = ({
  appBasePath,
  appA2aAgentCardPath,
  healthPath,
  toolContracts,
}) => ({
  openApiPathKeys: Object.keys(buildAgentReadyOpenApiPaths({ appBasePath, appA2aAgentCardPath, healthPath })).sort(),
  a2aSkills: buildAgentReadyA2aSkills(toolContracts),
  agentSkills: AGENT_READY_AGENT_SKILL_DEFINITIONS,
});
