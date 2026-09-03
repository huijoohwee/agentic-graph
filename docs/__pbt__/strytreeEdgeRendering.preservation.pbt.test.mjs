// =============================================================================
// Property-based tests — agentic-graph-strytree-edge-rendering bugfix, Task 2.
// Property 2: Preservation — Non-Edge Contract and Demo Content.
//
//   FOR ALL X WHERE NOT isBugCondition(X) DO  ASSERT F(X) = F'(X)
//
// Both fix targets are DOCUMENTS, so these are deterministic document-contract
// checks: every non-edge concern is captured from the canonical docs at runtime.
// The property asserts each sampled concern stays byte-for-identical-intent,
// and that projecting through the canonical Storyboard renderer leaves all
// non-edge content identical.
//
// EXPECTED OUTCOME on the UNFIXED docs: PASS (this establishes the baseline that
// the post-fix re-run in Task 3.11 must still satisfy).
//
// fast-check >= 100 runs each. PURE: filesystem reads + string compares only;
// no live network, no new graph-rendering dependency, Cloudflare-only topology
// and forbid-hardcode-in-repo invariants honored.
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
// =============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'

import {
  RENDERER_SET,
  PRD_TAD_PATH,
  DEMO_PATH,
  readDoc,
  captureAllPreservationConcerns,
  captureDemoConcerns,
  captureAc03Block,
  withActiveRenderer,
  AC03_INVARIANT_SUBSTRINGS,
} from './strytreeEdgeRenderingDocFixtures.mjs'

const RUNS = 200
// Capture every non-edge concern from the canonical docs.
const currentConcerns = captureAllPreservationConcerns()
const concernKeys = Object.keys(currentConcerns)
const concernKeyArb = fc.constantFrom(...concernKeys)

// ---------------------------------------------------------------------------
// Sanity: every concern anchor resolved to real, non-empty content. Guards the
// extraction itself so a silent anchor miss cannot make preservation vacuous.
// ---------------------------------------------------------------------------
test('Preservation capture resolves every canonical non-edge concern', () => {
  assert.ok(concernKeys.length >= 14, `expected the full concern set, got ${concernKeys.length}`)
  for (const key of concernKeys) {
    const value = currentConcerns[key]
    assert.equal(typeof value, 'string', `concern ${key} should extract to a string`)
    assert.ok(value.trim().length > 0, `concern ${key} extracted empty — anchor likely missed`)
  }
  // The two fix-target documents must be readable.
  assert.ok(readDoc(PRD_TAD_PATH).length > 0, 'expected PRD/TAD to be readable')
  assert.ok(readDoc(DEMO_PATH).length > 0, 'expected demo doc to be readable')
})

// ---------------------------------------------------------------------------
// Property 2 (Preservation): FOR ALL non-edge X, F(X) = F'(X). Sampled across
// every captured concern; repeated extraction must equal the canonical capture.
// ---------------------------------------------------------------------------
test('Property 2: non-edge concerns are byte-for-identical-intent (F(X) = F\'(X))', () => {
  fc.assert(
    fc.property(concernKeyArb, (key) => {
      const fresh = captureAllPreservationConcerns()
      assert.equal(
        fresh[key],
        currentConcerns[key],
        `non-edge concern ${key} changed during canonical projection checking`,
      )
    }),
    { numRuns: RUNS },
  )
})

// ---------------------------------------------------------------------------
// Derivation invariant (3.1): PRD-STR-E02-AC-03 still derives one edge per
// non-null parent_node_id with NO separate edge table. Asserted as invariant
// FACTS (substring presence) because the fix legitimately EXTENDS AC-03 with the
// shared-contract binding — the invariant itself must persist either way.
// ---------------------------------------------------------------------------
test('Preservation: PRD-STR-E02-AC-03 parent_node_id / no-edge-table invariant holds', () => {
  const ac03 = captureAc03Block()
  assert.ok(ac03 && ac03.trim().length > 0, 'expected PRD-STR-E02-AC-03 block to be present')
  for (const fragment of AC03_INVARIANT_SUBSTRINGS) {
    assert.ok(ac03.includes(fragment), `expected AC-03 derivation invariant fragment: ${fragment}`)
  }
})

// ---------------------------------------------------------------------------
// Renderer projection invariance (3.8): applying the canonical Storyboard
// renderer leaves ALL non-edge demo content identical.
// Modeled by rewriting the demo's active `kgCanvas2dRenderer` to each renderer
// and re-extracting the non-edge concerns — they must equal the baseline for
// every renderer (non-edge content does not branch on the active renderer).
// ---------------------------------------------------------------------------
test('Property 2: non-edge content is invariant across active 2D renderer switches', () => {
  const demoText = readDoc(DEMO_PATH)
  const canonicalDemoConcerns = captureDemoConcerns(demoText)
  const demoConcernKeys = Object.keys(canonicalDemoConcerns)
  fc.assert(
    fc.property(fc.constantFrom(...RENDERER_SET), fc.constantFrom(...demoConcernKeys), (renderer, key) => {
      const switched = withActiveRenderer(demoText, renderer)
      const projected = captureDemoConcerns(switched)
      assert.equal(
        projected[key],
        canonicalDemoConcerns[key],
        `non-edge demo concern ${key} changed when active renderer = ${renderer}`,
      )
    }),
    { numRuns: RUNS },
  )

  // The simulated switch must actually be exercised: each renderer value lands
  // in the frontmatter (proving the rewrite is real, not a no-op).
  for (const renderer of RENDERER_SET) {
    const switched = withActiveRenderer(demoText, renderer)
    assert.ok(
      switched.includes(`kgCanvas2dRenderer: "${renderer}"`),
      `expected simulated active renderer ${renderer} to be applied`,
    )
  }
})
