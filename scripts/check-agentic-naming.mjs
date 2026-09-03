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
]

const historicalMigrationTokensByPath = new Map([
  ['docs/documents/agentic-graph-ar-vr-xr-prd-tad-adr.md', [
    'kgc-behavior-graph/v1',
    '@kgc-behavior-graph-contract',
  ]],
  ['cloudflare/workers/agentic-graph-mcp/wrangler.toml', ['v1_agenticgraph_mcp_agent']],
  ['cloudflare/workers/agentic-graph-storage/wrangler.toml', ['v1_agenticgraph_canvas_sync_room']],
  ['scripts/__tests__/cloudflare-service-identity.test.mjs', [
    'v1_agenticgraph_mcp_agent',
    'v1_agenticgraph_canvas_sync_room',
  ]],
  ['scripts/legacy-mirror-inventory.mjs', ['agenticgraph', 'knowgrph']],
  ['scripts/pages-mirror-legacy-cleanup.mjs', ['agenticgraph', 'knowgrph']],
  ['scripts/__tests__/production-mirror-artifact.test.mjs', ['agenticgraph', 'knowgrph']],
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
