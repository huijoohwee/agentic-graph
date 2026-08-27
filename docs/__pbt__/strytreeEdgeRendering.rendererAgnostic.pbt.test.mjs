// =============================================================================
// Property-based check — agenticgraph-strytree-edge-rendering bugfix, Task 4.3
// (design "Property-Based Tests" > rendererAgnostic bullet + "Preservation
// Checking": the rendererAgnostic predicate exercised across the canonical
// renderer set, not assumed).
//
//   rendererAgnostic(X) ⇔
//     projectsIdenticallyFor(X, {Storyboard})
//       AND NOT hasRendererSpecificEdgePath(X)
//       AND NOT hasPerRendererHardcode(X)
//       AND NOT forksEdgeLogicPerRenderer(X)
//
// This is a focused, per-member ENUMERATION (the Task 1/3.10 exploration test
// only SAMPLES the renderer set via fast-check; the design requires projection
// invariance asserted for EVERY member of the set in BOTH documents). It reuses
// the shared doc-contract harness (strytreeEdgeRenderingDocFixtures.mjs):
// filesystem reads + raw-text extraction only — no YAML/network/graph-rendering
// dependency, Cloudflare-only topology and forbid-hardcode-in-repo invariants
// honored.
//
// Asserts, for the FIXED fix-target documents:
//  - EVERY renderer in {Storyboard} is declared as
//    projected data in BOTH docs' kgCanvas2dRendererCapability.supportedRenderers.
//  - BOTH docs forbid renderer-specific-edge-path / per-renderer-hardcode /
//    per-renderer fork (PRD/TAD edgeContractForbid + Part C "Edge Rendering
//    Contract" prose; demo rendererAgnosticEdges + projected-data selection).
//  - BOTH docs declare edgeProjectionInvariance:
//    "identical-across-supportedRenderers".
//
// fast-check >= 100 runs over the renderer set + deterministic enumeration of
// every canonical member.
//
// Validates: Requirements 2.8, 2.9, 2.10, 3.8
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
} from './strytreeEdgeRenderingDocFixtures.mjs'

const RUNS = 200

// Read both FIXED fix-target documents once; split frontmatter / body.
const prdTad = readDoc(PRD_TAD_PATH)
const demo = readDoc(DEMO_PATH)
const prdFm = splitFrontmatter(prdTad).frontmatter
const demoFm = splitFrontmatter(demo).frontmatter

// The kgCanvas2dRendererCapability block in each document (projected-data set).
const prdCapability = topLevelBlock(prdFm, 'kgCanvas2dRendererCapability') || ''
const demoCapability = topLevelBlock(demoFm, 'kgCanvas2dRendererCapability') || ''

// PRD/TAD forbid list + Part C "Edge Rendering Contract" renderer-agnostic prose.
const prdForbid = topLevelBlock(prdFm, 'edgeContractForbid') || ''
const prdEdgeRenderingContract =
  regionBetween(prdTad, /^#{2,4}\s.*Edge Rendering Contract\b/, /^#{2,4}\s/) || prdTad

// Demo shared-renderer-contract block (carries rendererAgnosticEdges).
const demoSharedContract = topLevelBlock(demoFm, 'kgSharedRendererContract') || ''

// ---------------------------------------------------------------------------
// rendererAgnostic — per-member enumeration helpers.
// ---------------------------------------------------------------------------

// projectsIdenticallyFor(renderer): the renderer is declared as projected data
// (a member of supportedRenderers) in the named capability block.
const declaredAsProjectedData = (capability, renderer) =>
  /supportedRenderers:\s*\[[^\]]*\]/.test(capability) && capability.includes(`"${renderer}"`)

// edgeProjectionInvariance declared identical across the supported set.
const declaresInvariance = (capability) =>
  capability.includes('edgeProjectionInvariance: "identical-across-supportedRenderers"')

// selectionModel says the set is projected, never branched on.
const declaresProjectedSelection = (capability) =>
  capability.includes('selectionModel: "projected-data"')

// PRD/TAD forbids renderer-specific edge path / per-renderer hardcode / fork.
const prdForbidsPerRenderer =
  prdForbid.includes('renderer-specific-edge-path') &&
  prdForbid.includes('per-renderer-hardcode') &&
  /renderer-specific edge code path/.test(prdEdgeRenderingContract) &&
  /per-renderer hardcode/.test(prdEdgeRenderingContract) &&
  /per-renderer fork/.test(prdEdgeRenderingContract)

// Demo forbids renderer-specific edge path + declares agnostic projection (so no
// per-renderer fork: the set is projected data, never branched on).
const demoForbidsPerRenderer =
  demoSharedContract.includes('rendererAgnosticEdges') &&
  /no renderer-specific edge path/.test(demoSharedContract) &&
  declaresProjectedSelection(demoCapability)

// rendererAgnosticFor(renderer): the FULL predicate for one renderer across BOTH
// docs — declared as projected data in both, with no per-renderer path/fork.
const rendererAgnosticFor = (renderer) =>
  declaredAsProjectedData(prdCapability, renderer) &&
  declaredAsProjectedData(demoCapability, renderer) &&
  prdForbidsPerRenderer &&
  demoForbidsPerRenderer

// ---------------------------------------------------------------------------
// Deterministic enumeration: EVERY member of the renderer set is projected
// identically in BOTH documents (projection invariance for every member).
// ---------------------------------------------------------------------------
test('rendererAgnostic: Storyboard is declared projected data in BOTH docs', () => {
  assert.deepEqual(RENDERER_SET, ['storyboard'], 'renderer set must contain only the canonical Storyboard renderer')
  for (const renderer of RENDERER_SET) {
    assert.ok(
      declaredAsProjectedData(prdCapability, renderer),
      `PRD/TAD must declare ${renderer} as projected data in kgCanvas2dRendererCapability.supportedRenderers`,
    )
    assert.ok(
      declaredAsProjectedData(demoCapability, renderer),
      `demo doc must declare ${renderer} as projected data in kgCanvas2dRendererCapability.supportedRenderers`,
    )
  }
})

// ---------------------------------------------------------------------------
// edgeProjectionInvariance declared in BOTH docs.
// ---------------------------------------------------------------------------
test('rendererAgnostic: BOTH docs declare edgeProjectionInvariance "identical-across-supportedRenderers"', () => {
  assert.ok(declaresInvariance(prdCapability), 'PRD/TAD must declare identical-across-supportedRenderers invariance')
  assert.ok(declaresInvariance(demoCapability), 'demo doc must declare identical-across-supportedRenderers invariance')
})

// ---------------------------------------------------------------------------
// NO renderer-specific edge path / per-renderer hardcode / per-renderer fork in
// EITHER document.
// ---------------------------------------------------------------------------
test('rendererAgnostic: BOTH docs forbid renderer-specific edge path / per-renderer hardcode / per-renderer fork', () => {
  assert.ok(
    prdForbidsPerRenderer,
    'PRD/TAD must forbid renderer-specific-edge-path + per-renderer-hardcode (edgeContractForbid) and per-renderer fork (Part C Edge Rendering Contract)',
  )
  assert.ok(
    demoForbidsPerRenderer,
    'demo doc must forbid a renderer-specific edge path (rendererAgnosticEdges) and declare the set as projected data (no per-renderer fork)',
  )
})

// ---------------------------------------------------------------------------
// Property: projection invariance holds for EVERY sampled member of the renderer
// set (fast-check exhaustively covers the 3-member set across >= 100 runs).
// ---------------------------------------------------------------------------
test('rendererAgnostic: projection invariance holds for every member of the renderer set', () => {
  fc.assert(
    fc.property(fc.constantFrom(...RENDERER_SET), (renderer) => {
      assert.ok(
        rendererAgnosticFor(renderer),
        `edge projection is not renderer-agnostic for ${renderer}`,
      )
    }),
    { numRuns: RUNS },
  )

  // Assert the predicate for every canonical member explicitly,
  // so the guarantee is enumeration, not merely sampling.
  for (const renderer of RENDERER_SET) {
    assert.ok(rendererAgnosticFor(renderer), `edge projection is not renderer-agnostic for ${renderer}`)
  }
})
