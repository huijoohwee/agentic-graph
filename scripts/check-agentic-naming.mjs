import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const checkerPath = 'scripts/check-agentic-naming.mjs'
const forbidden = [
  { label: 'retired product namespace', expression: /knowgrph/i },
  { label: 'collapsed product namespace', expression: /agenticgraph/ },
  { label: 'retired canvas protocol token', expression: /\bkgc\b/i },
  { label: 'retired canvas environment prefix', expression: /\b(?:KG|kg)_/ },
  { label: 'retired compact graph namespace', expression: /knowledgegraph/i },
  { label: 'retired hyphenated graph namespace', expression: /knowledge-graph/i },
  { label: 'retired underscored graph namespace', expression: /knowledge_graph/i },
  { label: 'retired dotted graph namespace', expression: /knowledge\.graph/i },
]

const historicalMigrationTokensByPath = new Map([
  ['docs/documents/agentic-graph-ar-vr-xr-prd-tad-adr.md', [
    'kgc-behavior-graph/v1',
    '@kgc-behavior-graph-contract',
  ]],
  ['cloudflare/workers/agentic-graph-mcp/wrangler.toml', [
    'v1_knowgrph_mcp_agent',
    'v3_rename_knowgrph_mcp_agent',
    'KnowgrphMcpAgent',
  ]],
  ['cloudflare/workers/agentic-graph-storage/wrangler.toml', [
    'v1_knowgrph_canvas_sync_room',
    'v2_rename_knowgrph_canvas_sync_room',
    'KnowgrphCanvasSyncRoom',
  ]],
  ['scripts/__tests__/cloudflare-service-identity.test.mjs', [
    'v1_knowgrph_mcp_agent',
    'v3_rename_knowgrph_mcp_agent',
    'KnowgrphMcpAgent',
    'v1_knowgrph_canvas_sync_room',
    'v2_rename_knowgrph_canvas_sync_room',
    'KnowgrphCanvasSyncRoom',
  ]],
  ['scripts/legacy-mirror-inventory.mjs', ['agenticgraph', 'knowgrph']],
  ['scripts/mirror-namespace-contract.mjs', ['agenticgraph', 'knowgrph']],
  ['scripts/pages-mirror-headers.mjs', ['agenticgraph', 'knowgrph']],
  ['scripts/pages-mirror-sync.mjs', ['agenticgraph', 'knowgrph']],
  ['scripts/pages-mirror-legacy-cleanup.mjs', ['agenticgraph', 'knowgrph']],
  ['scripts/__tests__/production-mirror-artifact.test.mjs', ['agenticgraph', 'knowgrph']],
  ['scripts/__tests__/sync-pages-stale-asset-cleanup.test.mjs', ['agenticgraph', 'knowgrph']],
  ['scripts/xr-v2/production-publish-contract.mjs', ['knowgrph']],
  ['canvas/src/__tests__/agentGraphProjectionCompatibility.test.ts', ['knowledgeGraph', 'knowledge-graph']],
  ['canvas/src/features/agent-graph/agentGraphProjectionPolicy.ts', ['knowledgeGraph', 'knowledge-graph']],
  ['canvas/viteAgentGraphBridge.ts', ['KNOWLEDGE_GRAPH']],
  ['mcp/__tests__/agent-graph-completeness-deadline.test.mjs', ['agentic-graph-knowledge-graph']],
  ['mcp/__tests__/agent-graph-json-evidence-performance.test.mjs', ['knowledgeGraph']],
  ['mcp/__tests__/agent-graph-query-pairing.test.mjs', ['knowledgeGraph']],
  ['mcp/__tests__/agent-graph-runtime.test.mjs', ['agentic-graph-knowledge-graph']],
  ['mcp/__tests__/agent-graph-storage-root.test.mjs', ['knowledge-graph']],
  ['mcp/agent-graph-host.js', ['KNOWLEDGE_GRAPH']],
  ['mcp/agent-graph/contract.mjs', ['agentic-graph-knowledge-graph', 'knowledgeGraph']],
  ['mcp/agent-graph/ingest-lock.mjs', ['agentic-graph-knowledge-graph']],
  ['mcp/agent-graph/materialize.mjs', ['knowledgeGraph']],
  ['mcp/agent-graph/query-core.mjs', ['knowledgeGraph']],
  ['mcp/agent-graph/query.mjs', ['knowledgeGraph']],
  ['mcp/agent-graph/resolution-store-validation.mjs', ['agentic-graph-knowledge-graph']],
  ['mcp/agent-graph/source-sharding.mjs', ['agentic-graph-knowledge-graph']],
  ['mcp/agent-graph/storage-root.mjs', ['KNOWLEDGE_GRAPH', 'knowledge-graph']],
  ['mcp/agent-graph/store.mjs', ['agentic-graph-knowledge-graph']],
])

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter(relativePath => relativePath !== checkerPath)

const violations = []
for (const relativePath of trackedFiles) {
  const absolutePath = path.resolve(root, relativePath)
  const content = fs.readFileSync(absolutePath)
  if (content.includes(0)) continue
  const text = content.toString('utf8')
  const scanText = (historicalMigrationTokensByPath.get(relativePath) ?? [])
    .reduce((source, token) => source.replaceAll(token, ''), text)
  for (const rule of forbidden) {
    if (rule.expression.test(relativePath) || rule.expression.test(scanText)) {
      violations.push(`${relativePath}: ${rule.label}`)
    }
  }
}

if (violations.length > 0) {
  throw new Error(`agentic naming violations:\n${violations.join('\n')}`)
}

console.log(`agentic naming contract ok (${trackedFiles.length} tracked files)`)
