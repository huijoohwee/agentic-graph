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

const allowedLegacyTokensByPath = new Map([
  ['docs/documents/agentic-graph-ar-vr-xr-prd-tad-adr.md', [
    { token: 'kgc-behavior-graph/v1', count: 1 },
    { token: '@kgc-behavior-graph-contract', count: 1 },
  ]],
  ['cloudflare/workers/agentic-graph-mcp/wrangler.toml', [
    { token: 'v1_knowgrph_mcp_agent', count: 3 },
    { token: 'v3_rename_knowgrph_mcp_agent', count: 3 },
    { token: 'KnowgrphMcpAgent', count: 6 },
  ]],
  ['cloudflare/workers/agentic-graph-storage/wrangler.toml', [
    { token: 'v1_knowgrph_canvas_sync_room', count: 1 },
    { token: 'v2_rename_knowgrph_canvas_sync_room', count: 1 },
    { token: 'KnowgrphCanvasSyncRoom', count: 2 },
  ]],
  ['scripts/__tests__/cloudflare-service-identity.test.mjs', [
    { token: 'v1_knowgrph_mcp_agent', count: 1 },
    { token: 'v3_rename_knowgrph_mcp_agent', count: 1 },
    { token: 'v1_knowgrph_canvas_sync_room', count: 1 },
    { token: 'v2_rename_knowgrph_canvas_sync_room', count: 1 },
  ]],
  ['scripts/legacy-mirror-inventory.mjs', [{ token: 'agenticgraph', count: 1 }, { token: 'knowgrph', count: 1 }]],
  ['scripts/mirror-namespace-contract.mjs', [{ token: 'agenticgraph', count: 52 }, { token: 'knowgrph', count: 4 }]],
  ['scripts/pages-mirror-headers.mjs', [{ token: 'agenticgraph', count: 3 }, { token: 'knowgrph', count: 3 }]],
  ['scripts/pages-mirror-sync.mjs', [{ token: 'agenticgraph', count: 2 }, { token: 'knowgrph', count: 2 }]],
  ['scripts/pages-mirror-legacy-cleanup.mjs', [{ token: 'agenticgraph', count: 3 }, { token: 'knowgrph', count: 3 }]],
  ['scripts/__tests__/production-mirror-artifact.test.mjs', [{ token: 'agenticgraph', count: 9 }, { token: 'knowgrph', count: 9 }]],
  ['scripts/__tests__/sync-pages-stale-asset-cleanup.test.mjs', [{ token: 'agenticgraph', count: 3 }, { token: 'knowgrph', count: 10 }]],
  ['scripts/xr-v2/production-publish-contract.mjs', [{ token: 'knowgrph', count: 6 }]],
  ['canvas/src/__tests__/agentGraphProjectionCompatibility.test.ts', [
    { token: 'knowledgeGraphProjection', count: 3 },
    { token: 'knowledgeGraphPreview', count: 1 },
    { token: "'knowledge-graph-runtime-preview'", count: 1 },
    { token: "'knowledge-graph-runtime'", count: 1 },
    { token: "'knowledge-graph'", count: 2 },
  ]],
  ['canvas/src/features/agent-graph/agentGraphProjectionPolicy.ts', [
    { token: 'knowledgeGraphProjection', count: 1 },
    { token: 'knowledgeGraphPreview', count: 1 },
    { token: "'knowledge-graph-runtime-preview'", count: 1 },
    { token: "'knowledge-graph-runtime'", count: 1 },
    { token: "'knowledge-graph'", count: 2 },
  ]],
  ['mcp/__tests__/agent-graph-storage-root.test.mjs', [{ token: 'data/outputs/knowledge-graph', count: 1 }]],
  ['mcp/__tests__/agent-graph-query-pairing.test.mjs', [{ token: 'knowledgeGraph', count: 1 }]],
  ['mcp/agent-graph/environment.mjs', [{ token: 'AGENTIC_OS_KNOWLEDGE_GRAPH_', count: 1 }]],
  ['mcp/agent-graph/contract.mjs', [
    { token: 'agentic-graph-knowledge-graph/v1', count: 1 },
    { token: 'knowledgeGraph', count: 1 },
  ]],
  ['mcp/agent-graph/ingest-lock.mjs', [{ token: 'agentic-graph-knowledge-graph-ingest-lock/v1', count: 1 }]],
  ['mcp/agent-graph/resolution-store-validation.mjs', [
    { token: 'agentic-graph-knowledge-graph-repository-index/v3', count: 1 },
    { token: 'agentic-graph-knowledge-graph-repository-index/v2', count: 1 },
    { token: 'agentic-graph-knowledge-graph-repository-index/v1', count: 1 },
    { token: 'agentic-graph-knowledge-graph-resolution-shard/v1', count: 1 },
  ]],
  ['mcp/agent-graph/source-sharding.mjs', [
    { token: 'agentic-graph-knowledge-graph-source-bundle/v1', count: 1 },
    { token: 'agentic-graph-knowledge-graph-source-part/v1', count: 1 },
  ]],
  ['mcp/agent-graph/storage-root.mjs', [{ token: 'data/outputs/knowledge-graph', count: 1 }]],
  ['mcp/agent-graph/store-schema.mjs', [
    { token: 'agentic-graph-knowledge-graph-pointer/v1', count: 1 },
    { token: 'agentic-graph-knowledge-graph-sharded-manifest/v1', count: 1 },
    { token: 'agentic-graph-knowledge-graph-source-shard/v1', count: 1 },
  ]],
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
  let scanText = text
  for (const { token, count } of allowedLegacyTokensByPath.get(relativePath) ?? []) {
    const actual = text.split(token).length - 1
    if (actual !== count) {
      violations.push(`${relativePath}: legacy token ${JSON.stringify(token)} count ${actual}, expected ${count}`)
    }
    scanText = scanText.replaceAll(token, '')
  }
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
