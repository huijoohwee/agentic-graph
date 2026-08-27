// =============================================================================
// Integration check — agenticgraph-strytree-edge-rendering bugfix, Task 4.6
// (design "Integration Tests" > spec-complete → runtime-ready, within the
// Cloudflare-only topology).
//
//   Asserts the two FIXED fix-target documents are now RUNTIME-READY:
//   the PRD/TAD frontmatter carries EVERY field a renderer needs to project
//   Strytree edges WITHOUT prose interpretation, and the honored invariants
//   (no new graph-rendering dependency, Cloudflare-only topology,
//   Dev -> Prod -> Cloudflare hosting, forbid-hardcode-in-repo) all remain
//   present and unchanged.
//
//   "Spec-complete → runtime-ready" means: a renderer can read the frontmatter
//   contract and project the parent_node_id-derived story edges deterministically
//   without reading any prose. This test enumerates the exact machine-projectable
//   fields and proves they are all present.
//
// Deterministic, example-based assertions over the FIXED documents + the repo's
// package.json (node:test; no fast-check needed for this presence/topology
// check). Reuses the shared doc-contract harness
// (strytreeEdgeRenderingDocFixtures.mjs): filesystem reads + raw-text extraction
// only — no YAML/network/graph-rendering dependency, Cloudflare-only topology
// and forbid-hardcode-in-repo invariants honored. This harness itself adds NO
// runtime/graph-rendering dependency (node:test + the repo's existing fast-check
// only; no package.json dependency additions for this spec).
//
// Validates: Requirements 2.7, 3.2, 3.3, 3.4
// =============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  RENDERER_SET,
  PRD_TAD_PATH,
  DEMO_PATH,
  readDoc,
  splitFrontmatter,
  topLevelBlock,
  captureTopologyConstraintConcerns,
} from './strytreeEdgeRenderingDocFixtures.mjs'

// agenticgraph/docs/__pbt__ -> agenticgraph repo root is ../.. (package.json lives there).
const HERE = path.dirname(fileURLToPath(import.meta.url))
const AGENTICGRAPH_ROOT = path.resolve(HERE, '..', '..')
const PACKAGE_JSON_PATH = path.join(AGENTICGRAPH_ROOT, 'package.json')

// Read the FIXED fix-target documents + the repo manifest once.
const prdTad = readDoc(PRD_TAD_PATH)
const demo = readDoc(DEMO_PATH)
const prdFm = splitFrontmatter(prdTad).frontmatter
const demoFm = splitFrontmatter(demo).frontmatter
const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'))

const SIGNAL_TYPES = ['idea_signal', 'evidence_signal', 'approval_signal', 'artifact_signal']

// The two preserved-as-is topology lines + the four preserved constraint lines
// the fix must leave byte-identical (no DB outside Cloudflare, no alternate
// hosting, no new graph-rendering dep, parent_node_id derivation).
const PRESERVED_CONSTRAINTS = [
  '  - "no new external graph-rendering dependency for the Strytree workbench"',
  '  - "no hosted database dependency outside the Cloudflare topology"',
  '  - "no alternate app hosting path outside Dev -> Prod -> Cloudflare"',
]
const PRESERVED_TOPOLOGY = [
  'deployment_topology: "Dev -> Prod -> Cloudflare"',
  'cloudflare_route: "https://airvio.co/agenticgraph"',
]

// The two NEW agnosticity/neutralization constraints the fix appended (must be
// present alongside — not replacing — the preserved constraints).
const ADDED_CONSTRAINTS = [
  '  - "story edge rendering must bind to kgSharedRendererContract@shared-renderer-contract/v1 and buildScopedGraphSemanticKey; no local/downstream/hardcoded edge logic"',
  '  - "story edge projection must use the canonical Storyboard renderer through kgSharedRendererContract; no per-renderer edge path, hardcode, or fork"',
]

// ---------------------------------------------------------------------------
// 1. SPEC-COMPLETE → RUNTIME-READY: the PRD/TAD frontmatter carries EVERY field
//    a renderer needs to project Strytree edges WITHOUT prose interpretation.
// ---------------------------------------------------------------------------

test('runtime-ready: kgSharedRendererContract carries version + semanticIdentity + edgeModel + edgeSource + rendererPolicy', () => {
  const block = topLevelBlock(prdFm, 'kgSharedRendererContract')
  assert.notEqual(block, null, 'PRD/TAD must carry kgSharedRendererContract')
  // Every field a renderer needs to identify, source, and govern edges.
  assert.ok(/version:\s*"shared-renderer-contract\/v1"/.test(block),
    'must declare version shared-renderer-contract/v1')
  assert.ok(/semanticIdentity:\s*"buildScopedGraphSemanticKey"/.test(block),
    'must declare semanticIdentity buildScopedGraphSemanticKey')
  assert.ok(/edgeModel:\s*"[^"]+"/.test(block), 'must declare edgeModel')
  assert.ok(/edgeSource:\s*"strytree_nodes\.parent_node_id"/.test(block),
    'must declare edgeSource strytree_nodes.parent_node_id (source-derived, no edge table)')
  assert.ok(block.includes('renderers project view state only'),
    'rendererPolicy must state renderers project view state only')
})

test('runtime-ready: socket_types carries the four typed signals (typed edge/socket projection)', () => {
  const block = topLevelBlock(prdFm, 'socket_types')
  assert.notEqual(block, null, 'PRD/TAD must carry socket_types')
  for (const signal of SIGNAL_TYPES) {
    const row = block.split('\n').find((l) => new RegExp(`^\\s{2}${signal}:`).test(l)) || ''
    assert.ok(row.length > 0, `socket_types must declare ${signal}`)
    // Each signal must carry the full projection attributes (no prose needed).
    assert.ok(/color:\s*"#[0-9a-fA-F]{6}"/.test(row), `${signal} must declare color`)
    assert.ok(/edgeWidthPx:\s*\d+/.test(row), `${signal} must declare edgeWidthPx`)
    assert.ok(/handleStrokeWidthPx:\s*\d+/.test(row), `${signal} must declare handleStrokeWidthPx`)
    assert.ok(/accepts:\s*\[/.test(row), `${signal} must declare accepts`)
  }
})

test('runtime-ready: flow carries direction + edgeType + storyEdgeProjection(handleModel + portTypeDefault + semanticKeyRule)', () => {
  const block = topLevelBlock(prdFm, 'flow')
  assert.notEqual(block, null, 'PRD/TAD must carry flow')
  assert.ok(/direction:\s*"LR"/.test(block), 'flow must declare direction LR')
  assert.ok(/edgeType:\s*"smoothstep"/.test(block), 'flow must declare edgeType smoothstep')
  assert.ok(/storyEdgeProjection:/.test(block), 'flow must declare storyEdgeProjection')
  assert.ok(/handleModel:\s*"[^"]*parent_node_id[^"]*"/.test(block),
    'storyEdgeProjection.handleModel must derive handles from parent_node_id')
  assert.ok(/portTypeDefault:\s*"idea_signal"/.test(block),
    'storyEdgeProjection.portTypeDefault must be idea_signal')
  assert.ok(/semanticKeyRule:\s*"buildScopedGraphSemanticKey\(storyId, parentNodeId, childNodeId\)"/.test(block),
    'storyEdgeProjection.semanticKeyRule must key edges via buildScopedGraphSemanticKey')
})

test('runtime-ready: kgCanvas2dRendererCapability carries supportedRenderers + selectionModel + edgeProjectionInvariance', () => {
  const block = topLevelBlock(prdFm, 'kgCanvas2dRendererCapability')
  assert.notEqual(block, null, 'PRD/TAD must carry kgCanvas2dRendererCapability')
  assert.ok(/supportedRenderers:\s*\["storyboard"\]/.test(block),
    'supportedRenderers must equal ["storyboard"]')
  for (const r of RENDERER_SET) {
    assert.ok(block.includes(`"${r}"`), `supportedRenderers must declare "${r}"`)
  }
  assert.ok(/selectionModel:\s*"projected-data"/.test(block),
    'selectionModel must be projected-data (renderers project the set, not branch on it)')
  assert.ok(/edgeProjectionInvariance:\s*"identical-across-supportedRenderers"/.test(block),
    'edgeProjectionInvariance must be identical-across-supportedRenderers')
})

test('runtime-ready: every machine-projectable contract field is present (no prose interpretation required)', () => {
  // The complete set of frontmatter blocks a renderer reads to project edges.
  for (const key of ['kgSharedRendererContract', 'socket_types', 'flow', 'kgCanvas2dRendererCapability']) {
    assert.notEqual(topLevelBlock(prdFm, key), null,
      `runtime-ready requires PRD/TAD frontmatter block: ${key}`)
  }
})

// ---------------------------------------------------------------------------
// 2. NO NEW GRAPH-RENDERING DEPENDENCY introduced — in either document AND in
//    the repo manifest AND by this test harness itself.
// ---------------------------------------------------------------------------

test('runtime-ready: the two preserved + agnosticity edge constraints all remain present', () => {
  const fmLines = prdFm.split('\n')
  // The preserved "no new external graph-rendering dependency" constraint (+ the
  // other two topology constraints) remain present and unchanged.
  for (const line of PRESERVED_CONSTRAINTS) {
    assert.ok(fmLines.includes(line), `preserved constraint must remain present: ${line.trim()}`)
  }
  // The two new neutralization/agnosticity constraints (no per-renderer edge
  // path/hardcode/fork; bind to shared contract) are present.
  for (const line of ADDED_CONSTRAINTS) {
    assert.ok(fmLines.includes(line), `agnosticity constraint must be present: ${line.trim()}`)
  }
})

test('runtime-ready: repo manifest introduces NO graph-rendering dependency for this spec', () => {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  const names = Object.keys(deps)
  // No known graph/diagram/flow rendering library is present in the manifest.
  const GRAPH_RENDER_LIBS = [
    'reactflow', '@xyflow', 'react-flow', 'cytoscape', 'd3', 'd3-graph',
    'vis-network', 'sigma', 'dagre', 'elkjs', 'mermaid', 'gojs', 'jsplumb',
    'konva', 'ngraph', 'force-graph', '@antv', 'g6',
  ]
  for (const name of names) {
    for (const lib of GRAPH_RENDER_LIBS) {
      assert.ok(!name.toLowerCase().includes(lib),
        `no new graph-rendering dependency allowed; found "${name}" matching "${lib}"`)
    }
  }
  // The harness uses only node:test + the repo's existing fast-check.
  assert.equal(deps['fast-check'], '3.23.2',
    'harness must use the repo\'s existing fast-check (no version change)')
})

test('runtime-ready: dependency manifest unchanged for this spec (exact known surface)', () => {
  // The full dependency surface is the pre-existing one; this spec added nothing.
  assert.deepEqual(Object.keys(pkg.dependencies || {}).sort(), [
    '@x402/core', '@x402/evm', '@x402/hono', 'drizzle-orm', 'hono', 'jsonwebtoken', 'yjs',
  ].sort(), 'runtime dependencies must be the pre-existing set (no spec additions)')
  assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), [
    'fast-check',
  ].sort(), 'devDependencies must be the pre-existing set (no spec additions)')
})

// ---------------------------------------------------------------------------
// 3. CLOUDFLARE-ONLY TOPOLOGY + Dev -> Prod -> Cloudflare hosting remain present
//    and unchanged.
// ---------------------------------------------------------------------------

test('runtime-ready: Cloudflare-only topology + Dev -> Prod -> Cloudflare hosting present and unchanged', () => {
  const fmLines = prdFm.split('\n')
  for (const line of PRESERVED_TOPOLOGY) {
    assert.ok(fmLines.includes(line), `topology line must remain present and unchanged: ${line}`)
  }
  // Cross-check via the shared harness capture (byte-for-identical-intent set).
  const captured = captureTopologyConstraintConcerns(prdTad)
  assert.ok(captured['topology.preserved'].includes('deployment_topology: "Dev -> Prod -> Cloudflare"'),
    'captured topology must include deployment_topology Dev -> Prod -> Cloudflare')
  assert.ok(captured['topology.preserved'].includes('cloudflare_route: "https://airvio.co/agenticgraph"'),
    'captured topology must include the cloudflare_route')
  // The no-DB-outside-Cloudflare and no-alternate-hosting constraints remain.
  assert.ok(captured['constraints.preserved'].includes('no hosted database dependency outside the Cloudflare topology'),
    'no-DB-outside-Cloudflare constraint must remain')
  assert.ok(captured['constraints.preserved'].includes('no alternate app hosting path outside Dev -> Prod -> Cloudflare'),
    'no-alternate-hosting constraint must remain')
})

// ---------------------------------------------------------------------------
// 4. forbid-hardcode-in-repo principle holds.
// ---------------------------------------------------------------------------

test('runtime-ready: forbid-hardcode-in-repo principle holds (principles + forbid list)', () => {
  const principles = topLevelBlock(prdFm, 'edgeContractPrinciples')
  assert.notEqual(principles, null, 'PRD/TAD must carry edgeContractPrinciples')
  assert.ok(principles.includes('forbid-hardcode-in-repo'),
    'edgeContractPrinciples must include forbid-hardcode-in-repo')
  assert.ok(principles.includes('spec-complete-runtime-ready'),
    'edgeContractPrinciples must include spec-complete-runtime-ready')

  const forbid = topLevelBlock(prdFm, 'edgeContractForbid')
  assert.notEqual(forbid, null, 'PRD/TAD must carry edgeContractForbid')
  assert.ok(/^\s*-\s*"hardcode"\s*$/m.test(forbid),
    'edgeContractForbid must include hardcode')
})

// ---------------------------------------------------------------------------
// 5. Demo doc remains renderer-agnostic + does not introduce any non-Cloudflare
//    target (sanity: the demo carries the agnostic capability, no new dep prose).
// ---------------------------------------------------------------------------

test('runtime-ready: demo doc remains renderer-agnostic (capability + rendererAgnosticEdges)', () => {
  const cap = topLevelBlock(demoFm, 'kgCanvas2dRendererCapability')
  assert.notEqual(cap, null, 'demo doc must carry kgCanvas2dRendererCapability')
  assert.ok(/supportedRenderers:\s*\["storyboard"\]/.test(cap),
    'demo supportedRenderers must equal ["storyboard"]')
  assert.ok(demoFm.includes('rendererAgnosticEdges'),
    'demo doc must declare rendererAgnosticEdges')
})
