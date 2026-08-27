// =============================================================================
// Unit checks — agenticgraph-strytree-edge-rendering bugfix, Task 4.1
// (design "Unit Tests"): frontmatter contract presence & binding.
//
// Deterministic, example-based assertions over the two FIXED fix-target
// documents (no fast-check; node:test). Reuses the shared doc-contract harness
// (strytreeEdgeRenderingDocFixtures.mjs): filesystem reads + raw-text extraction
// only — no YAML/network/graph-rendering dependency, Cloudflare-only topology
// and forbid-hardcode-in-repo invariants honored.
//
// Asserts (design "Unit Tests"):
//  - PRD/TAD carries kgSharedRendererContract, socket_types, flow,
//    kgCanvas2dRendererCapability, edgeContractForbid, edgeContractCleanup
//    (and edgeContractPrinciples).
//  - PRD-STR-E02-AC-03 references buildScopedGraphSemanticKey AND preserves the
//    no-edge-table derivation invariant (substring facts).
//  - Part A prototype edge rows (Edge existence / Edge shape) are marked
//    "(historical prototype only)".
//  - Demo doc carries kgCanvas2dRendererCapability.supportedRenderers ==
//    ["storyboard"] and rendererAgnosticEdges.
//
// Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.7, 2.8
// =============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  RENDERER_SET,
  PRD_TAD_PATH,
  DEMO_PATH,
  readDoc,
  splitFrontmatter,
  topLevelBlock,
  regionBetween,
  captureAc03Block,
  AC03_INVARIANT_SUBSTRINGS,
} from './strytreeEdgeRenderingDocFixtures.mjs'

// Read both FIXED fix-target documents once and split their frontmatter / body.
const prdTad = readDoc(PRD_TAD_PATH)
const demo = readDoc(DEMO_PATH)
const prdFm = splitFrontmatter(prdTad).frontmatter
const demoFm = splitFrontmatter(demo).frontmatter

// Part A "Prototype Calculation Engine" table region (for the historical markers).
const partAEngine = regionBetween(prdTad, /^### Prototype Calculation Engine\b/, /^#{2,3}\s/) || ''
const ac03 = captureAc03Block() || ''

// ---------------------------------------------------------------------------
// PRD/TAD frontmatter contract presence (Req 2.1, 2.3, 2.4, 2.7).
// ---------------------------------------------------------------------------
test('unit: PRD/TAD frontmatter carries kgSharedRendererContract', () => {
  assert.notEqual(topLevelBlock(prdFm, 'kgSharedRendererContract'), null,
    'PRD/TAD must carry kgSharedRendererContract')
})

test('unit: PRD/TAD frontmatter carries socket_types', () => {
  assert.notEqual(topLevelBlock(prdFm, 'socket_types'), null,
    'PRD/TAD must carry socket_types (typed edge/socket model)')
})

test('unit: PRD/TAD frontmatter carries flow', () => {
  assert.notEqual(topLevelBlock(prdFm, 'flow'), null,
    'PRD/TAD must carry flow (port/handle projection driver)')
})

test('unit: PRD/TAD frontmatter carries kgCanvas2dRendererCapability', () => {
  assert.notEqual(topLevelBlock(prdFm, 'kgCanvas2dRendererCapability'), null,
    'PRD/TAD must carry kgCanvas2dRendererCapability')
})

test('unit: PRD/TAD frontmatter carries edgeContractForbid', () => {
  assert.notEqual(topLevelBlock(prdFm, 'edgeContractForbid'), null,
    'PRD/TAD must carry edgeContractForbid')
})

test('unit: PRD/TAD frontmatter carries edgeContractCleanup', () => {
  assert.notEqual(topLevelBlock(prdFm, 'edgeContractCleanup'), null,
    'PRD/TAD must carry edgeContractCleanup')
})

test('unit: PRD/TAD frontmatter carries edgeContractPrinciples', () => {
  assert.notEqual(topLevelBlock(prdFm, 'edgeContractPrinciples'), null,
    'PRD/TAD must carry edgeContractPrinciples')
})

test('unit: kgSharedRendererContract binds semantic identity + parent_node_id source + view-state-only policy', () => {
  const block = topLevelBlock(prdFm, 'kgSharedRendererContract') || ''
  assert.ok(block.includes('buildScopedGraphSemanticKey'),
    'shared contract must declare buildScopedGraphSemanticKey as semantic identity')
  assert.ok(block.includes('parent_node_id'),
    'shared contract must derive Strytree edges from parent_node_id at source')
  assert.ok(block.includes('renderers project view state only'),
    'shared contract must state renderers project view state only')
})

// ---------------------------------------------------------------------------
// PRD-STR-E02-AC-03 — semantic-key binding + preserved derivation invariant
// (Req 2.1, 2.5).
// ---------------------------------------------------------------------------
test('unit: PRD-STR-E02-AC-03 references buildScopedGraphSemanticKey', () => {
  assert.ok(ac03.trim().length > 0, 'PRD-STR-E02-AC-03 block must be present')
  assert.ok(ac03.includes('buildScopedGraphSemanticKey'),
    'AC-03 must bind the derived edge to the shared semantic-key helper')
})

test('unit: PRD-STR-E02-AC-03 preserves the no-edge-table derivation invariant', () => {
  for (const fact of AC03_INVARIANT_SUBSTRINGS) {
    assert.ok(ac03.includes(fact),
      `AC-03 must preserve the derivation-invariant fact: "${fact}"`)
  }
})

// ---------------------------------------------------------------------------
// Part A prototype edge rows marked historical (Req 2.7).
// ---------------------------------------------------------------------------
test('unit: Part A "Edge existence" row marked "(historical prototype only)"', () => {
  const row = partAEngine.split('\n').find((l) => /^\|\s*Edge existence\b/.test(l)) || ''
  assert.ok(row.includes('(historical prototype only)'),
    'Part A "Edge existence" row must be marked historical')
})

test('unit: Part A "Edge shape" Bezier row marked "(historical prototype only)"', () => {
  const row = partAEngine.split('\n').find((l) => /^\|\s*Edge shape\b/.test(l)) || ''
  assert.ok(row.includes('(historical prototype only)'),
    'Part A "Edge shape" Bezier row must be marked historical')
})

// ---------------------------------------------------------------------------
// Demo doc renderer-agnostic capability (Req 2.8).
// ---------------------------------------------------------------------------
test('unit: demo doc carries kgCanvas2dRendererCapability.supportedRenderers == ["storyboard"]', () => {
  const cap = topLevelBlock(demoFm, 'kgCanvas2dRendererCapability')
  assert.notEqual(cap, null, 'demo doc must carry kgCanvas2dRendererCapability')
  assert.ok(/supportedRenderers:\s*\["storyboard"\]/.test(cap),
    'supportedRenderers must equal ["storyboard"]')
  // Every renderer in the agreed set is declared as projected data.
  for (const r of RENDERER_SET) {
    assert.ok(cap.includes(`"${r}"`), `supportedRenderers must declare "${r}"`)
  }
})

test('unit: demo doc declares rendererAgnosticEdges', () => {
  assert.ok(demoFm.includes('rendererAgnosticEdges'),
    'demo doc must declare rendererAgnosticEdges in the shared renderer contract')
})
