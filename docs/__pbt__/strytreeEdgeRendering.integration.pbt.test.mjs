// =============================================================================
// Integration check — agentic-graph-strytree-edge-rendering bugfix, Task 4.4
// (design "Integration Tests" > cross-document unification).
//
//   Assert that Strytree `parent_node_id`-derived edges (PRD/TAD) and the demo
//   flow nodes/handles both resolve to the SAME shared edge projection contract:
//     shared-renderer-contract/v1
//       + buildScopedGraphSemanticKey (semantic identity)
//       + socket_types (typed edge/socket model)
//       + flow port/handle model (flow.edgeType etc.)
//
//   PRD/TAD edgeSource is strytree_nodes.parent_node_id; the demo uses flow
//   nodes/handles — BOTH feed the SAME projection. This test proves the two
//   documents unify onto ONE shared contract (not two parallel/forked edge
//   models).
//
// Deterministic, example-based assertions over the two FIXED fix-target
// documents (node:test, no fast-check needed — this is a cross-document identity
// check). Reuses the shared doc-contract harness
// (strytreeEdgeRenderingDocFixtures.mjs): filesystem reads + raw-text extraction
// only — no YAML/network/graph-rendering dependency, Cloudflare-only topology
// and forbid-hardcode-in-repo invariants honored.
//
// Validates: Requirements 2.10
// =============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PRD_TAD_PATH,
  DEMO_PATH,
  readDoc,
  splitFrontmatter,
  topLevelBlock,
} from './strytreeEdgeRenderingDocFixtures.mjs'

// The four typed signals that constitute the shared edge/socket model.
const SIGNAL_TYPES = ['idea_signal', 'evidence_signal', 'approval_signal', 'artifact_signal']

// Read both FIXED fix-target documents once; split frontmatter / body.
const prdTad = readDoc(PRD_TAD_PATH)
const demo = readDoc(DEMO_PATH)
const prdFm = splitFrontmatter(prdTad).frontmatter
const demoFm = splitFrontmatter(demo).frontmatter

// The shared-contract surfaces carried by BOTH documents.
const prdSharedContract = topLevelBlock(prdFm, 'kgSharedRendererContract') || ''
const demoSharedContract = topLevelBlock(demoFm, 'kgSharedRendererContract') || ''
const prdSocketTypes = topLevelBlock(prdFm, 'socket_types') || ''
const demoSocketTypes = topLevelBlock(demoFm, 'socket_types') || ''
const prdFlow = topLevelBlock(prdFm, 'flow') || ''
const demoFlow = topLevelBlock(demoFm, 'flow') || ''

// ---------------------------------------------------------------------------
// Extract the shared-renderer-contract version from a kgSharedRendererContract
// block (raw text, no YAML parse): `version: "shared-renderer-contract/v1"`.
// ---------------------------------------------------------------------------
function contractVersion(block) {
  const m = block.match(/version:\s*"([^"]+)"/)
  return m ? m[1] : null
}

// Extract the declared semantic identity helper from the contract block.
function semanticIdentity(block) {
  const m = block.match(/semanticIdentity:\s*"([^"]+)"/)
  return m ? m[1] : null
}

// Extract each typed-signal definition line from a socket_types block into a
// normalized name -> definition map (the `{color: ..., edgeWidthPx: ...}` RHS,
// whitespace-collapsed) so two documents can be compared for matching values.
function socketTypeMap(block) {
  const map = {}
  for (const line of block.split('\n')) {
    const m = line.match(/^\s{2}(\w+):\s*(\{.*\})\s*$/)
    if (m) map[m[1]] = m[2].replace(/\s+/g, ' ').trim()
  }
  return map
}

// ---------------------------------------------------------------------------
// 1. BOTH documents reference shared-renderer-contract/v1.
// ---------------------------------------------------------------------------
test('integration: BOTH docs reference kgSharedRendererContract.version == shared-renderer-contract/v1', () => {
  assert.notEqual(prdSharedContract, '', 'PRD/TAD must carry kgSharedRendererContract')
  assert.notEqual(demoSharedContract, '', 'demo doc must carry kgSharedRendererContract')

  const prdVersion = contractVersion(prdSharedContract)
  const demoVersion = contractVersion(demoSharedContract)
  assert.equal(prdVersion, 'shared-renderer-contract/v1', 'PRD/TAD must reference shared-renderer-contract/v1')
  assert.equal(demoVersion, 'shared-renderer-contract/v1', 'demo doc must reference shared-renderer-contract/v1')
  // The SAME contract version across both documents (one shared contract).
  assert.equal(prdVersion, demoVersion, 'both docs must reference the SAME shared-renderer-contract version')
})

// ---------------------------------------------------------------------------
// 2. BOTH reference buildScopedGraphSemanticKey as the semantic identity.
// ---------------------------------------------------------------------------
test('integration: BOTH docs use buildScopedGraphSemanticKey as the shared semantic identity', () => {
  assert.equal(semanticIdentity(prdSharedContract), 'buildScopedGraphSemanticKey',
    'PRD/TAD shared contract must declare buildScopedGraphSemanticKey as semantic identity')
  assert.equal(semanticIdentity(demoSharedContract), 'buildScopedGraphSemanticKey',
    'demo doc shared contract must declare buildScopedGraphSemanticKey as semantic identity')
})

// ---------------------------------------------------------------------------
// 3. BOTH carry socket_types with matching signal types/values.
// ---------------------------------------------------------------------------
test('integration: BOTH docs carry socket_types with matching signal types/values', () => {
  const prdMap = socketTypeMap(prdSocketTypes)
  const demoMap = socketTypeMap(demoSocketTypes)

  for (const signal of SIGNAL_TYPES) {
    assert.ok(prdMap[signal], `PRD/TAD socket_types must declare ${signal}`)
    assert.ok(demoMap[signal], `demo doc socket_types must declare ${signal}`)
    // Identical typed-edge/socket definition across both docs (one shared model).
    assert.equal(prdMap[signal], demoMap[signal],
      `socket_types.${signal} must be identical across both docs (shared typed edge/socket model)`)
  }

  // No divergence: both docs declare exactly the same signal type set.
  assert.deepEqual(
    Object.keys(prdMap).sort(),
    Object.keys(demoMap).sort(),
    'both docs must declare the SAME socket_types signal set (no divergence)',
  )
})

// ---------------------------------------------------------------------------
// 4. BOTH carry the flow port/handle model; PRD edgeSource is
//    strytree_nodes.parent_node_id; demo uses flow nodes/handles — both feed the
//    SAME projection.
// ---------------------------------------------------------------------------
test('integration: BOTH docs carry the flow port/handle model (flow.edgeType etc.)', () => {
  assert.notEqual(prdFlow, '', 'PRD/TAD must carry a flow block')
  assert.notEqual(demoFlow, '', 'demo doc must carry a flow block')
  // The shared flow edge type (smoothstep) is declared in BOTH flow blocks.
  assert.ok(/edgeType/.test(prdFlow) && prdFlow.includes('smoothstep'),
    'PRD/TAD flow must declare edgeType smoothstep')
  assert.ok(/edgeType/.test(demoFlow) && demoFlow.includes('smoothstep'),
    'demo doc flow must declare edgeType smoothstep')
})

test('integration: PRD/TAD edgeSource is strytree_nodes.parent_node_id (source-derived)', () => {
  assert.ok(prdSharedContract.includes('strytree_nodes.parent_node_id'),
    'PRD/TAD shared contract edgeSource must be strytree_nodes.parent_node_id')
  // The Strytree story-edge projection maps parent_node_id-derived edges onto the
  // shared port/handle model via buildScopedGraphSemanticKey.
  assert.ok(prdFlow.includes('parent_node_id'),
    'PRD/TAD flow.storyEdgeProjection must derive handles from parent_node_id')
  assert.ok(prdFlow.includes('buildScopedGraphSemanticKey'),
    'PRD/TAD flow.storyEdgeProjection must key edges via buildScopedGraphSemanticKey')
})

test('integration: demo uses flow nodes/handles feeding the SAME projection', () => {
  assert.ok(/^\s{2}nodes:/m.test(demoFlow), 'demo flow must carry nodes')
  assert.ok(demoFlow.includes('handles'), 'demo flow nodes must carry handles')
  assert.ok(demoFlow.includes('flow:portTypes'), 'demo flow nodes must type ports via flow:portTypes')
})

// ---------------------------------------------------------------------------
// Cross-document unification (the Task 4.4 headline): the PRD/TAD
// parent_node_id-derived edges and the demo flow nodes/handles resolve to the
// SAME shared edge projection contract — same contract version, same semantic
// identity helper, same socket model, same flow edge type. ONE projection, two
// upstream edge sources.
// ---------------------------------------------------------------------------
test('integration: cross-document unification onto ONE shared edge projection contract', () => {
  // Same shared renderer contract version.
  assert.equal(contractVersion(prdSharedContract), contractVersion(demoSharedContract),
    'unified contract version mismatch')
  // Same semantic identity helper.
  assert.equal(semanticIdentity(prdSharedContract), semanticIdentity(demoSharedContract),
    'unified semantic identity helper mismatch')
  // Same typed edge/socket model values.
  const prdMap = socketTypeMap(prdSocketTypes)
  const demoMap = socketTypeMap(demoSocketTypes)
  for (const signal of SIGNAL_TYPES) {
    assert.equal(prdMap[signal], demoMap[signal], `unified socket_types.${signal} mismatch`)
  }
  // Same flow edge type drives projection in both docs.
  assert.ok(prdFlow.includes('smoothstep') && demoFlow.includes('smoothstep'),
    'unified flow edge type (smoothstep) mismatch')

  // Two distinct UPSTREAM edge sources feeding the one projection:
  //  - Strytree: strytree_nodes.parent_node_id (source-derived, no edge table)
  //  - demo: flow nodes/handles
  const prdSourceDerived = prdSharedContract.includes('strytree_nodes.parent_node_id')
  const demoSourceDerived = /^\s{2}nodes:/m.test(demoFlow) && demoFlow.includes('handles')
  assert.ok(prdSourceDerived, 'PRD/TAD edge source must be parent_node_id')
  assert.ok(demoSourceDerived, 'demo edge source must be flow nodes/handles')
  assert.ok(prdSourceDerived && demoSourceDerived,
    'both upstream edge sources must resolve to the SAME shared projection contract',
  )
})
