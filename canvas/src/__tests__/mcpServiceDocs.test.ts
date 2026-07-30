import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readMcpServiceDocs(): string {
  const repoRoot = resolve(process.cwd(), '..')
  const paths = [
    'docs/documents/knowgrph-mcp/knowgrph-mcp-service-prd-tad.md',
    'docs/documents/knowgrph-mcp/knowgrph-mcp-service-prd-tad.companion.md',
    'docs/documents/knowgrph-mcp/knowgrph-mcp.md',
    'docs/documents/knowgrph-agent-ready-prd-tad.md',
    'docs/documents/knowgrph-agent-ready-prd-tad.companion.md',
  ]
  return paths.map(filePath => readFileSync(resolve(repoRoot, filePath), 'utf8')).join('\n')
}

export function testMcpServiceDocsUseImplementedBaselineContract(): void {
  const docs = readMcpServiceDocs()
  const required = [
    'id: md:knowgrph-mcp-service-prd-tad',
    'doc_type: "Product and Technical Specification"',
    'local_rung: "dev-proven"',
    'delivered_rung: "runtime-ready"',
    'version: 0.4.27',
    '**Document Version**: 0.4.24',
    '| Remote Worker MCP gateway / pipeline platform | Planned extension | none in repo yet | must not be described as implemented |',
    '| Remote Worker MCP platform | Planned extension | none in repo yet | must not be documented as implemented |',
    'mcp/server.js',
    'mcp/local-tool-contract.js',
    'canvas/src/features/agent-ready/webMcpRuntime.ts',
    'canvas/src/features/agent-ready/webMcpLifecycle.mjs',
    'cloudflare/pages/knowgrph-agent-ready.mjs',
    'canvas/src/features/panels/views/McpHubView.tsx',
    'canvas/src/features/panels/views/useSettingsChatAssist.tsx',
    'floatingPanelChatSubmitCoordinator.ts',
    'chatMarkdownValidation.ts',
    'applyChatKgcWorkspaceDocumentToCanvas()',
    'knowgrph.inspect_local_settings_chat_readiness',
  ]
  for (const token of required) {
    if (!docs.includes(token)) {
      throw new Error(`Expected MCP service docs to include implemented-baseline token ${JSON.stringify(token)}`)
    }
  }

  const stale = [
    'id: md:knowgrph-mcp-service-prd-tad-proposed',
    'status: proposed',
    'status: accepted-implemented-baseline',
    'Proposed only',
    'Shipped Vs Proposed',
    'proposed future remote MCP',
    'still-proposed',
    'remain proposed',
  ]
  for (const token of stale) {
    if (docs.includes(token)) {
      throw new Error(`Expected MCP service docs to remove stale planning token ${JSON.stringify(token)}`)
    }
  }
}
