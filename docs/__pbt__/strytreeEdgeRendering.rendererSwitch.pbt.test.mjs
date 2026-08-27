// =============================================================================
// Integration check — agenticgraph-strytree-edge-rendering bugfix, Task 4.5
// (design "Integration Tests" > renderer-switch flow invariance).
//
//   Assert that applying the canonical Storyboard renderer changes:
//     - NO edge projection  — the edge-projection contract surfaces
//       (kgSharedRendererContract, socket_types, flow, kgCanvas2dRendererCapability,
//        rendererAgnosticEdges) remain byte-identical,
//        proving edge projection does NOT branch on the active renderer; and
//     - NO non-edge content — every non-edge demo concern remains identical
//       across the switch (integration-level complement to the preservation
//       suite's renderer-switch invariance).
//
//   The switch is simulated with `withActiveRenderer`, which rewrites ONLY the
//   demo's top-level `kgCanvas2dRenderer` scalar. Because the renderer set is
//   declared as PROJECTED DATA (never branched on), rewriting the active value
//   must leave every edge-projection surface and every non-edge concern
//   unchanged. The PRD/TAD edge-projection surfaces are a SEPARATE document and
//   therefore cannot be affected by the demo's active renderer at all — asserted
//   here as the cross-document complement (renderer-agnostic, no single-renderer
//   pin in the shared contract surfaces).
//
// Deterministic, example-based assertions over the FIXED fix-target documents
// (node:test — this is a cross-renderer identity check, enumerated over every
// member of the renderer set). Reuses the shared doc-contract harness
// (strytreeEdgeRenderingDocFixtures.mjs): filesystem reads + raw-text extraction
// only — no YAML/network/graph-rendering dependency, Cloudflare-only topology
// and forbid-hardcode-in-repo invariants honored. Documents/fixtures/baseline
// are NOT modified.
//
// Validates: Requirements 2.9, 3.8
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
  captureDemoConcerns,
  withActiveRenderer,
} from './strytreeEdgeRenderingDocFixtures.mjs'

// The edge-projection contract surfaces carried by the demo frontmatter that
// MUST be invariant under an active-renderer switch (edge projection does not
// branch on the active renderer).
const EDGE_PROJECTION_SURFACES = [
  'kgSharedRendererContract',
  'socket_types',
  'flow',
  'kgCanvas2dRendererCapability',
]

// Extract the single `rendererAgnosticEdges:` line from a frontmatter string
// (it lives inside the kgSharedRendererContract block). Raw text, no YAML parse.
function rendererAgnosticEdgesLine(frontmatter) {
  for (const line of frontmatter.split('\n')) {
    if (/(^|\s)rendererAgnosticEdges:/.test(line)) return line
  }
  return null
}

// Extract ALL edge-projection surfaces from a demo document's frontmatter into a
// normalized map (block text for each top-level surface + the rendererAgnosticEdges
// line). This is the contract that must be identical across every active renderer.
function captureEdgeProjectionSurfaces(demoText) {
  const { frontmatter } = splitFrontmatter(demoText)
  const surfaces = {}
  for (const key of EDGE_PROJECTION_SURFACES) {
    surfaces[key] = topLevelBlock(frontmatter, key)
  }
  surfaces.rendererAgnosticEdges = rendererAgnosticEdgesLine(frontmatter)
  return surfaces
}

// Read the FIXED demo document once and establish the baseline surfaces /
// non-edge concerns from the document AS-AUTHORED (active renderer untouched).
const demoText = readDoc(DEMO_PATH)
const baselineSurfaces = captureEdgeProjectionSurfaces(demoText)
const baselineConcerns = captureDemoConcerns(demoText)
const nonEdgeConcernKeys = Object.keys(baselineConcerns)

// ---------------------------------------------------------------------------
// Sanity: every edge-projection surface resolved to real, non-empty content so
// the invariance assertions below cannot be vacuous (a silent anchor miss must
// not pass as "identical").
// ---------------------------------------------------------------------------
test('renderer-switch: edge-projection surfaces + non-edge concerns resolved (anchors not vacuous)', () => {
  for (const key of EDGE_PROJECTION_SURFACES) {
    assert.ok(
      typeof baselineSurfaces[key] === 'string' && baselineSurfaces[key].trim().length > 0,
      `edge-projection surface ${key} extracted empty — anchor likely missed`,
    )
  }
  assert.ok(
    typeof baselineSurfaces.rendererAgnosticEdges === 'string' &&
      baselineSurfaces.rendererAgnosticEdges.includes('rendererAgnosticEdges'),
    'rendererAgnosticEdges line not found in demo shared contract',
  )
  assert.ok(nonEdgeConcernKeys.length > 0, 'expected at least one non-edge demo concern')
  for (const key of nonEdgeConcernKeys) {
    assert.ok(
      typeof baselineConcerns[key] === 'string' && baselineConcerns[key].trim().length > 0,
      `non-edge concern ${key} extracted empty — anchor likely missed`,
    )
  }
})

// ---------------------------------------------------------------------------
// The simulated projection must be REAL: the canonical renderer value lands in
// frontmatter (so identical-surface assertions are not passing on a no-op).
// ---------------------------------------------------------------------------
test('renderer-switch: withActiveRenderer applies the canonical Storyboard renderer', () => {
  assert.deepEqual(RENDERER_SET, ['storyboard'], 'renderer set must contain only the canonical Storyboard renderer')
  for (const renderer of RENDERER_SET) {
    const switched = withActiveRenderer(demoText, renderer)
    assert.ok(
      switched.includes(`kgCanvas2dRenderer: "${renderer}"`),
      `expected simulated active renderer ${renderer} to be applied`,
    )
  }
})

// ---------------------------------------------------------------------------
// NO edge projection changes: every edge-projection contract surface is
// byte-identical for EVERY renderer in the supported set (edge projection does
// not branch on the active renderer).
// ---------------------------------------------------------------------------
test('renderer-switch: edge-projection surfaces remain identical for Storyboard', () => {
  for (const renderer of RENDERER_SET) {
    const switched = withActiveRenderer(demoText, renderer)
    const surfaces = captureEdgeProjectionSurfaces(switched)
    for (const key of Object.keys(baselineSurfaces)) {
      assert.equal(
        surfaces[key],
        baselineSurfaces[key],
        `edge-projection surface ${key} changed when active renderer = ${renderer} (must not branch on renderer)`,
      )
    }
  }
})

// ---------------------------------------------------------------------------
// NO non-edge content changes: every non-edge demo concern is identical for
// EVERY renderer in the supported set (integration-level complement to the
// preservation suite's renderer-switch invariance).
// ---------------------------------------------------------------------------
test('renderer-switch: non-edge demo content remains identical for Storyboard', () => {
  for (const renderer of RENDERER_SET) {
    const switched = withActiveRenderer(demoText, renderer)
    const concerns = captureDemoConcerns(switched)
    for (const key of nonEdgeConcernKeys) {
      assert.equal(
        concerns[key],
        baselineConcerns[key],
        `non-edge demo concern ${key} changed when active renderer = ${renderer}`,
      )
    }
  }
})

// ---------------------------------------------------------------------------
// Cross-document complement: the PRD/TAD edge-projection surfaces are a SEPARATE
// document and therefore cannot be affected by the demo's active renderer. They
// must be present and renderer-agnostic — never pinned to a single active 2D
// renderer — so the switch leaves "either document" invariant.
// ---------------------------------------------------------------------------
test('renderer-switch: PRD/TAD edge-projection surfaces are renderer-agnostic (no single-renderer pin)', () => {
  const prdFm = splitFrontmatter(readDoc(PRD_TAD_PATH)).frontmatter
  const prdSharedContract = topLevelBlock(prdFm, 'kgSharedRendererContract') || ''
  const prdCapability = topLevelBlock(prdFm, 'kgCanvas2dRendererCapability') || ''

  assert.notEqual(prdSharedContract, '', 'PRD/TAD must carry kgSharedRendererContract')
  assert.notEqual(prdCapability, '', 'PRD/TAD must carry kgCanvas2dRendererCapability')

  // The capability declares the full set as projected data (not branched on),
  // so no individual renderer can change the projection.
  for (const renderer of RENDERER_SET) {
    assert.ok(
      prdCapability.includes(`"${renderer}"`),
      `PRD/TAD must declare ${renderer} as projected data (no single-renderer pin)`,
    )
  }
  assert.ok(
    prdCapability.includes('edgeProjectionInvariance: "identical-across-supportedRenderers"'),
    'PRD/TAD must declare edge-projection invariance across the supported renderer set',
  )
  // The shared contract owns edge data via source-derived projection (not a
  // per-renderer branch), so switching the demo renderer cannot alter it.
  assert.ok(
    prdSharedContract.includes('rendererPolicy'),
    'PRD/TAD shared contract must declare a renderer projection policy (view state only)',
  )
})
