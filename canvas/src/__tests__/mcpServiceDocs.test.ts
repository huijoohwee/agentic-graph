import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MCP_DOCUMENT_PATHS = {
  service: 'docs/documents/knowgrph-mcp/knowgrph-mcp-service-prd-tad.md',
  serviceCompanion: 'docs/documents/knowgrph-mcp/knowgrph-mcp-service-prd-tad.companion.md',
  overview: 'docs/documents/knowgrph-mcp/knowgrph-mcp.md',
  agentReady: 'docs/documents/knowgrph-agent-ready-prd-tad.md',
  agentReadyCompanion: 'docs/documents/knowgrph-agent-ready-prd-tad.companion.md',
} as const

function readRepoDocument(filePath: string): string {
  const repoRoot = resolve(process.cwd(), '..')
  return readFileSync(resolve(repoRoot, filePath), 'utf8')
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
    'id: "md:knowgrph-mcp-service-prd-tad"',
    'doc_type: "Product and Technical Specification"',
    'local_rung: "spec-complete"',
    'delivered_rung: "undocumented"',
    'version: "0.5.0"',
    'Keep Pages HTTP at exactly 7 read-only source tools.',
    'Keep app WebMCP at exactly 42 source tools: 30 read-only and 12 guarded controls.',
    'Keep the remote Worker registry at exactly 10 source tools and treat the Worker as a separate delivery unit.',
    'Require bearer `Authorization` for remote Worker MCP requests and preserve `mcp-session-id` after initialization.',
  ])

  assertDocumentContains('MCP service companion', documents.serviceCompanion, [
    'id: "md:knowgrph-mcp-service-prd-tad-companion"',
    'version: "0.5.0"',
    '#### Pages HTTP source contract — 7 read-only tools',
    'The browser registration includes exactly 42 source tools:',
    '- 30 tools annotated read-only.',
    '- 12 guarded controls.',
    '#### Remote Worker source registry — 10 tools',
    'mcp/server.js',
    'mcp/local-tool-contract.js',
    'canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs',
    'canvas/src/features/agent-ready/webMcpRuntime.ts',
    'cloudflare/pages/knowgrph-agent-ready.mjs',
    'cloudflare/workers/knowgrph-mcp/index.ts',
    'cloudflare/workers/knowgrph-mcp/tool-registry.mjs',
  ])

  assertDocumentContains('MCP implementation overview', documents.overview, [
    'id: "md:knowgrph-mcp"',
    'doc_type: "Reference Implementation Overview"',
    'Exactly 7 read-only source tools.',
    'Exactly 42 source tools: 30 read-only and 12 guarded controls.',
    'Exactly 10 source registry tools. The Worker is a separate delivery unit.',
    'Local stdio MCP',
    'Broad local surface; availability is configuration-gated',
  ])

  assertDocumentContains('agent-ready PRD/TAD', documents.agentReady, [
    'id: "md:knowgrph-agent-ready-prd-tad"',
    'version: "1.28.0"',
    'Pages HTTP discovery exposes exactly 7 read-only source tools.',
    'App WebMCP exposes exactly 42 tools: 30 read-only and 12 guarded controls.',
    'Separate 10-tool registry, delivery unit, bearer-authenticated session transport.',
  ])

  assertDocumentContains('agent-ready companion', documents.agentReadyCompanion, [
    'id: "md:knowgrph-agent-ready-prd-tad.companion"',
    'version: "1.28.0"',
    'Exactly 42 tools: 30 read-only, 12 guarded controls.',
    'Exactly 7 read-only tools; no guarded control.',
    'Separate 10-tool source registry; not part of Pages or app WebMCP.',
    'mcp/server.js',
    'mcp/local-tool-contract.js',
    'canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs',
    'canvas/src/features/agent-ready/webMcpRuntime.ts',
    'cloudflare/pages/knowgrph-agent-ready.mjs',
    'cloudflare/workers/knowgrph-mcp/index.ts',
    'cloudflare/workers/knowgrph-mcp/tool-registry.mjs',
    'canvas/src/features/chat/chatResponseStructuredContent.ts',
  ])

  const stale = [
    'id: md:knowgrph-mcp-service-prd-tad-proposed',
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
