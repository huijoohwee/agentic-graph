import { buildAgenticGraphAgentReadyToolContracts } from '@/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import { readRepoDocumentFamily } from '@/tests/lib/repoDocumentFamily'

const browserTools = buildAgenticGraphAgentReadyToolContracts({ includeBrowserOnlyTools: true })
const browserToolCount = browserTools.length
const readOnlyToolCount = browserTools.filter(tool => tool.annotations.readOnlyHint).length
const guardedToolCount = browserToolCount - readOnlyToolCount

const MCP_DOCUMENT_PATHS = {
  service: 'docs/documents/agentic-graph-mcp/agentic-graph-mcp-service-prd-tad-adr-mvp-gtm.md',
  serviceCompanion: 'docs/documents/agentic-graph-mcp/agentic-graph-mcp-service-prd-tad-adr-mvp-gtm.companion.md',
  overview: 'docs/documents/agentic-graph-mcp/agentic-graph-mcp.md',
  agentReady: 'docs/documents/agentic-graph-agent-ready-prd-tad-adr-mvp-gtm.md',
  agentReadyCompanion: 'docs/documents/agentic-graph-agent-ready-prd-tad-adr-mvp-gtm.companion.md',
} as const

function readRepoDocument(filePath: string): string {
  return readRepoDocumentFamily(filePath)
}

function assertDocumentContains(label: string, document: string, required: readonly string[]): void {
  for (const token of required) {
    if (!document.includes(token)) {
      throw new Error(`Expected ${label} to include implemented-baseline token ${JSON.stringify(token)}`)
    }
  }
}

export function testMcpServiceDocsUseImplementedBaselineContract(): void {
  const documents = Object.fromEntries(
    Object.entries(MCP_DOCUMENT_PATHS).map(([key, filePath]) => [key, readRepoDocument(filePath)]),
  ) as Record<keyof typeof MCP_DOCUMENT_PATHS, string>

  assertDocumentContains('MCP service PRD/TAD', documents.service, [
    'id: "md:agentic-graph-mcp-service-prd-tad"',
    'doc_type: "PRD-TAD-ADR-MVP-GTM"',
    'local_rung: "spec-complete"',
    'delivered_rung: "undocumented"',
    'Keep Pages HTTP at exactly 7 read-only source tools.',
    `Keep app WebMCP at exactly ${browserToolCount} source tools: ${readOnlyToolCount} read-only and ${guardedToolCount} guarded controls.`,
    'Keep the remote Worker registry at exactly 10 source tools and treat the Worker as a separate delivery unit.',
    'Require bearer `Authorization` for remote Worker MCP requests and preserve `mcp-session-id` after initialization.',
  ])

  assertDocumentContains('MCP service companion', documents.serviceCompanion, [
    'id: "md:agentic-graph-mcp-service-prd-tad-companion"',
    '#### Pages HTTP source contract — 7 read-only tools',
    `The browser registration includes exactly ${browserToolCount} source tools:`,
    `- ${readOnlyToolCount} tools annotated read-only.`,
    `- ${guardedToolCount} guarded controls.`,
    '#### Remote Worker source registry — 10 tools',
    'mcp/server.js',
    'mcp/local-tool-contract.js',
    'canvas/src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs',
    'canvas/src/features/agent-ready/webMcpRuntime.ts',
    'cloudflare/pages/agentic-graph-agent-ready.mjs',
    'cloudflare/workers/agentic-graph-mcp/index.ts',
    'cloudflare/workers/agentic-graph-mcp/tool-registry.mjs',
  ])

  assertDocumentContains('MCP implementation overview', documents.overview, [
    'id: "md:agentic-graph-mcp"',
    'doc_type: "Reference Implementation Overview"',
    'Exactly 7 read-only source tools.',
    `Exactly ${browserToolCount} source tools: ${readOnlyToolCount} read-only and ${guardedToolCount} guarded controls.`,
    'Exactly 10 source registry tools. The Worker is a separate delivery unit.',
    'Local stdio MCP',
    'Broad local surface; availability is configuration-gated',
  ])

  assertDocumentContains('agent-ready PRD/TAD', documents.agentReady, [
    'id: "md:agentic-graph-agent-ready-prd-tad"',
    'Pages HTTP discovery exposes exactly 7 read-only source tools.',
    `App WebMCP exposes exactly ${browserToolCount} tools: ${readOnlyToolCount} read-only and ${guardedToolCount} guarded controls.`,
    'Separate 10-tool registry, delivery unit, bearer-authenticated session transport.',
  ])

  assertDocumentContains('agent-ready companion', documents.agentReadyCompanion, [
    'id: "md:agentic-graph-agent-ready-prd-tad.companion"',
    `Exactly ${browserToolCount} tools: ${readOnlyToolCount} read-only, ${guardedToolCount} guarded controls.`,
    'Exactly 7 read-only tools; no guarded control.',
    'Separate 10-tool source registry; not part of Pages or app WebMCP.',
    'mcp/server.js',
    'mcp/local-tool-contract.js',
    'canvas/src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs',
    'canvas/src/features/agent-ready/webMcpRuntime.ts',
    'cloudflare/pages/agentic-graph-agent-ready.mjs',
    'cloudflare/workers/agentic-graph-mcp/index.ts',
    'cloudflare/workers/agentic-graph-mcp/tool-registry.mjs',
    'canvas/src/features/chat/chatResponseStructuredContent.ts',
  ])

  const stale = [
    'id: md:agentic-graph-mcp-service-prd-tad-proposed',
    'status: proposed',
    'status: accepted-implemented-baseline',
    'Proposed only',
    'Shipped Vs Proposed',
    'proposed future remote MCP',
    'still-proposed',
    'remain proposed',
    'none in repo yet',
    'delivered_rung: "runtime-ready"',
  ]
  for (const [label, document] of Object.entries(documents)) {
    for (const token of stale) {
      if (document.includes(token)) {
        throw new Error(`Expected ${label} to remove stale planning token ${JSON.stringify(token)}`)
      }
    }
  }
}
