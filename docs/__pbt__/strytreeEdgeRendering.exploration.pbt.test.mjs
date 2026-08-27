// =============================================================================
// Property-based test — agenticgraph-strytree-edge-rendering bugfix, Task 1
// (bug-condition exploration) re-run for Task 3.10 (fix checking).
//
// Property 1: Shared, Renderer-Agnostic Edge Projection.
//
//   FOR ALL X WHERE isBugCondition(X) DO
//     ASSERT boundToSharedRendererContract(X)
//        AND usesSharedSemanticKeyHelper(X)         // buildScopedGraphSemanticKey
//        AND derivesEdgesFrom(X, "parent_node_id")  // Strytree, at source/upstream
//        AND projectsViewStateOnly(X)               // renderers project, never own/recompute
//        AND rendererAgnostic(X)                     // canonical Storyboard projection
//        AND forbidsNonNeutralMechanisms(X)         // no hardcode/legacy/alias/patch/re-render/stale
//
// Both fix targets are DOCUMENTS, so this is a deterministic document-contract
// check scoped to the concrete edge-rendering concerns enumerated in the design
// "Exploratory Bug Condition Checking" Test Cases (a-f). On the UNFIXED docs the
// predicate set FAILS (proving the contract gap exists). After the Task 3 fix it
// PASSES (confirming every edge-rendering concern is now bound to the shared,
// renderer-agnostic contract).
//
// fast-check >= 100 runs. PURE: filesystem reads + string checks only; no live
// network, no new graph-rendering dependency, Cloudflare-only topology and
// forbid-hardcode-in-repo invariants honored.
//
// Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
// =============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'

import {
  RENDERER_SET,
  PRD_TAD_PATH,
  DEMO_PATH,
  readDoc,
  splitFrontmatter,
  topLevelBlock,
  regionBetween,
  captureAc03Block,
} from './strytreeEdgeRenderingDocFixtures.mjs'

const RUNS = 200

// ---------------------------------------------------------------------------
// Read both fix-target documents once and split their frontmatter / body.
// ---------------------------------------------------------------------------
const prdTad = readDoc(PRD_TAD_PATH)
const demo = readDoc(DEMO_PATH)
const prdFm = splitFrontmatter(prdTad).frontmatter
const demoFm = splitFrontmatter(demo).frontmatter

// The historical Part A "Prototype Calculation Engine" rows (Edge existence /
// Edge shape Bezier) — captured so Test Case (f) can assert the reclassification.
const partAEngine = regionBetween(prdTad, /^### Prototype Calculation Engine\b/, /^#{2,3}\s/) || prdTad
const ac03 = captureAc03Block() || ''

// ---------------------------------------------------------------------------
// Property 1 predicates, evaluated per concrete edge-rendering concern. Each
// returns true only when the finetuned contract binding is present (so they all
// FAIL on the unfixed docs and PASS on the fixed docs).
// ---------------------------------------------------------------------------

// (a) PRD/TAD frontmatter carries kgSharedRendererContract + socket_types + flow.
const prdTadSharedContractPresent = () =>
  topLevelBlock(prdFm, 'kgSharedRendererContract') !== null &&
  topLevelBlock(prdFm, 'socket_types') !== null &&
  topLevelBlock(prdFm, 'flow') !== null

// (b) PRD-STR-E02-AC-03 references the shared semantic-key helper.
const ac03BindsSemanticKey = () =>
  ac03.includes('buildScopedGraphSemanticKey')

// (c) PRD/TAD carries the forbid list + cleanup rule.
const prdTadForbidCleanupPresent = () =>
  topLevelBlock(prdFm, 'edgeContractForbid') !== null &&
  topLevelBlock(prdFm, 'edgeContractCleanup') !== null

// (d) Demo doc declares kgCanvas2dRendererCapability + rendererAgnosticEdges.
const demoRendererAgnosticCapabilityPresent = () =>
  topLevelBlock(demoFm, 'kgCanvas2dRendererCapability') !== null &&
  demoFm.includes('rendererAgnosticEdges')

// (e) Both docs bind projection to the canonical Storyboard renderer.
const statesIdenticalProjection = (fm) => {
  const cap = topLevelBlock(fm, 'kgCanvas2dRendererCapability')
  if (!cap) return false
  const allRenderersDeclared = RENDERER_SET.every((r) => cap.includes(`"${r}"`))
  const invarianceDeclared =
    cap.includes('identical-across-supportedRenderers') || fm.includes('rendererAgnosticEdges')
  return allRenderersDeclared && invarianceDeclared
}
const crossDocProjectionInvariance = () =>
  statesIdenticalProjection(prdFm) && statesIdenticalProjection(demoFm)

// (f) Part A Bezier / edge-existence rows are marked "(historical prototype only)".
const partAReclassified = () => {
  const lines = partAEngine.split('\n')
  const edgeExistence = lines.find((l) => /^\|\s*Edge existence\b/.test(l)) || ''
  const edgeShape = lines.find((l) => /^\|\s*Edge shape\b/.test(l)) || ''
  return (
    edgeExistence.includes('(historical prototype only)') &&
    edgeShape.includes('(historical prototype only)')
  )
}

// The renderer-agnostic predicate: edges project identically for EVERY renderer
// in the set, with no renderer-specific edge path / per-renderer hardcode / fork.
const rendererAgnosticFor = (renderer) => {
  const inPrd = (topLevelBlock(prdFm, 'kgCanvas2dRendererCapability') || '').includes(`"${renderer}"`)
  const inDemo = (topLevelBlock(demoFm, 'kgCanvas2dRendererCapability') || '').includes(`"${renderer}"`)
  const forbidsPerRenderer =
    prdTad.includes('renderer-specific-edge-path') && prdTad.includes('per-renderer-hardcode')
  return inPrd && inDemo && forbidsPerRenderer
}

// ---------------------------------------------------------------------------
// The concrete edge-rendering concerns (design Test Cases a-f) and the full
// Property 1 predicate that each must satisfy in the finetuned documents.
// ---------------------------------------------------------------------------
const CONCERNS = {
  // (a) shared-contract presence  -> boundToSharedRendererContract
  'prdTad.frontmatter.sharedContract': prdTadSharedContractPresent,
  // (b) semantic-key binding      -> usesSharedSemanticKeyHelper
  'prdTad.ac03.semanticKey': ac03BindsSemanticKey,
  // (c) forbid/cleanup rules      -> forbidsNonNeutralMechanisms
  'prdTad.frontmatter.forbidCleanup': prdTadForbidCleanupPresent,
  // (d) demo agnostic capability  -> rendererAgnostic (demo)
  'demo.frontmatter.rendererAgnosticCapability': demoRendererAgnosticCapabilityPresent,
  // (e) cross-renderer invariance -> rendererAgnostic (both docs)
  'crossDoc.projectionInvariance': crossDocProjectionInvariance,
  // (f) prototype reclassification-> forbidsNonNeutralMechanisms (neutralize legacy)
  'prdTad.partA.historicalReclassification': partAReclassified,
}
const concernKeys = Object.keys(CONCERNS)

// ---------------------------------------------------------------------------
// Test Case (a): PRD/TAD shared-contract presence.
// ---------------------------------------------------------------------------
test('Property 1 (a): PRD/TAD frontmatter carries kgSharedRendererContract + socket_types + flow', () => {
  assert.ok(prdTadSharedContractPresent(), 'PRD/TAD frontmatter must bind edges to the shared renderer contract')
})

// ---------------------------------------------------------------------------
// Test Case (b): PRD-STR-E02-AC-03 semantic-key binding.
// ---------------------------------------------------------------------------
test('Property 1 (b): PRD-STR-E02-AC-03 references buildScopedGraphSemanticKey', () => {
  assert.ok(ac03.trim().length > 0, 'PRD-STR-E02-AC-03 block must be present')
  assert.ok(ac03BindsSemanticKey(), 'AC-03 must bind the derived edge to the shared semantic-key helper')
})

// ---------------------------------------------------------------------------
// Test Case (c): PRD/TAD forbid/cleanup rules.
// ---------------------------------------------------------------------------
test('Property 1 (c): PRD/TAD carries edgeContractForbid + edgeContractCleanup', () => {
  assert.ok(prdTadForbidCleanupPresent(), 'PRD/TAD must forbid non-neutral mechanisms and mandate source cleanup')
})

// ---------------------------------------------------------------------------
// Test Case (d): demo renderer-agnostic capability.
// ---------------------------------------------------------------------------
test('Property 1 (d): demo doc declares kgCanvas2dRendererCapability + rendererAgnosticEdges', () => {
  assert.ok(demoRendererAgnosticCapabilityPresent(), 'demo doc must declare a renderer-agnostic edge capability')
})

// ---------------------------------------------------------------------------
// Test Case (e): cross-renderer projection invariance stated in both docs.
// ---------------------------------------------------------------------------
test('Property 1 (e): both docs bind projection to the canonical Storyboard renderer', () => {
  assert.ok(statesIdenticalProjection(prdFm), 'PRD/TAD must declare identical projection across the renderer set')
  assert.ok(statesIdenticalProjection(demoFm), 'demo doc must declare identical projection across the renderer set')
})

// ---------------------------------------------------------------------------
// Test Case (f): Part A prototype edge rows reclassified as historical.
// ---------------------------------------------------------------------------
test('Property 1 (f): Part A Bezier / edge-existence rows marked "(historical prototype only)"', () => {
  assert.ok(partAReclassified(), 'Part A prototype edge rows must be marked historical so they cannot read as runtime contract')
})

// ---------------------------------------------------------------------------
// Property 1 (full predicate set): FOR ALL edge-rendering concerns X where the
// bug condition held on the unfixed docs, the finetuned documents bind X to the
// shared, renderer-agnostic contract. Sampled across every concern (a-f) plus
  // the rendererAgnostic predicate across the canonical renderer set.
// ---------------------------------------------------------------------------
test('Property 1: every edge-rendering concern is bound to the shared, renderer-agnostic contract', () => {
  fc.assert(
    fc.property(fc.constantFrom(...concernKeys), fc.constantFrom(...RENDERER_SET), (key, renderer) => {
      // Per-concern finetuned predicate (boundToSharedRendererContract /
      // usesSharedSemanticKeyHelper / forbidsNonNeutralMechanisms / rendererAgnostic).
      assert.ok(CONCERNS[key](), `edge-rendering concern ${key} is not bound to the shared contract`)
      // rendererAgnostic(X): identical projection for the sampled renderer, no fork.
      assert.ok(rendererAgnosticFor(renderer), `edge projection is not renderer-agnostic for ${renderer}`)
    }),
    { numRuns: RUNS },
  )

  // derivesEdgesFrom(X, "parent_node_id") + projectsViewStateOnly(X): the source
  // derivation persists and the renderer policy projects view state only.
  assert.ok(
    (topLevelBlock(prdFm, 'kgSharedRendererContract') || '').includes('parent_node_id'),
    'shared contract must derive Strytree edges from parent_node_id at source',
  )
  assert.ok(
    (topLevelBlock(prdFm, 'kgSharedRendererContract') || '').includes('renderers project view state only'),
    'shared contract must state renderers project view state only (no recompute / no data ownership)',
  )
})
