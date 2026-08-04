import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

export const XR_V2_PINNED_DOCUMENT_REVISION =
  '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7'

const DOCUMENTS = Object.freeze([
  Object.freeze({
    name: 'pinned PRD/TAD/ADR overlay',
    parts: ['docs', 'documents', 'knowgrph-ar-vr-xr-prd-tad-adr.md'],
    required: Object.freeze([
      'readiness_scope: "pinned-ac1-ac12-conformance"',
      'pinned_source_revision: "5679d4101f5470fb85816b6df4f2ec0af6ca4eb7"',
      'webxr-ar',
      'webxr-vr',
      'pseudo-ar-depth-parallax',
      'flat-fallback',
      '/xr.capture',
      '/xr.author',
      'kgc-behavior-graph/v1',
      'Depth Anything V2',
      'Rete.js',
      'three.quarks',
      'Theatre.js',
      'custom muxer',
    ]),
  }),
  Object.freeze({
    name: 'runtime-readiness evidence contract',
    parts: ['docs', 'documents', 'knowgrph-xr-v2-runtime-readiness.md'],
    required: Object.freeze([
      'readiness_scope: "pinned-ac1-ac12-conformance"',
      'AC-1–AC-12 evidence ledger',
      'Pinned Runtime-Readiness Evidence',
      'track-preserving mux',
      'connected live transport',
    ]),
  }),
  Object.freeze({
    name: 'testing guide',
    parts: ['docs', 'TESTING.md'],
    required: Object.freeze([
      'positive/tamper contracts',
      'clean exact-commit',
      'No local gate may erase those blockers',
    ]),
  }),
  Object.freeze({
    name: 'runtime API',
    parts: ['docs', 'runtime-api.md'],
    required: Object.freeze([
      'XR_V2_PINNED_SOURCE_REVISION',
      'XR_V2_PINNED_CONFORMANCE_SCHEMA',
      'runXrV2PinnedContractConformanceProbe',
      'validateXrV2PinnedContractConformanceEvidence',
      'liveDepthModel',
      'trackPreservingContainerMux',
      'connectedPreviewTransport',
    ]),
  }),
])

const REQUIRED_SHARED_MARKERS = Object.freeze([
  XR_V2_PINNED_DOCUMENT_REVISION,
  'knowgrph-xr-v2-pinned-contract-conformance/v1',
  'knowgrph-xr-v2-readiness/v1',
  'knowgrph-xr-v2-dev-runtime-evidence/v1',
  'knowgrph-xr-v2-browser-smoke/v1',
  'source-backed',
  'browser-backed',
  'source-ready',
  'blocked',
  'admitted model bytes',
  'reference/physical devices',
  'track-preserving mux proof',
  'connected live transport',
  'Dev-only',
  'canvas/src/lib/three/ThreeGraphXrSessionPolicy.ts',
  'canvas/src/features/xr-v2',
  'canvas/src/components/timeline',
  'canvas/src/features/gitgraph',
  'Root `ecs`',
  'xr-authoring-edited-media-delivery',
  'node --test scripts/__tests__/xr-v2-source-smoke.test.mjs',
  'node scripts/run-xr-v2-source-smoke.mjs',
  'node scripts/run-video-editor-source-smoke.mjs',
  'node canvas/scripts/run_xr_v2_browser_smoke.mjs',
  'npm run xr-v2:review-candidate',
  'npm run xr-v2:review-ready',
])

const REQUIRED_ENTRY_MODES = Object.freeze([
  'immersive-session',
  'inline-viewer',
  'monocular-capture',
  'native-handoff',
  'unsupported',
])

const FORBIDDEN_MISLEADING_MARKERS = Object.freeze([
  'status: "runtime-ready"',
  'local_rung: "runtime-ready"',
  'readiness_scope: "xr-authoring-edited-media-delivery"',
  'The scoped delivery is therefore runtime-ready',
  'runtime-ready-dev',
])

function assertContains(source, marker, owner) {
  if (!source.includes(marker)) throw new Error(`expected ${owner} marker ${marker}`)
}

function assertAcceptanceCriterionRow(source, criterion, owner) {
  if (!source.includes(`| **${criterion} —`)) {
    throw new Error(`expected ${owner} acceptance row ${criterion}`)
  }
}

export function verifyXrV2ReadinessDocumentation(repositoryRoot) {
  const documents = DOCUMENTS.map(document => {
    const path = resolve(repositoryRoot, ...document.parts)
    if (!existsSync(path)) {
      throw new Error(`expected ${document.name} at ${relative(repositoryRoot, path)}`)
    }
    const source = readFileSync(path, 'utf8')
    const lineCount = source.split(/\r?\n/u).length
    if (lineCount > 600) throw new Error(`${relative(repositoryRoot, path)} exceeds 600 lines`)
    assertContains(source, XR_V2_PINNED_DOCUMENT_REVISION, document.name)
    for (const marker of document.required) assertContains(source, marker, document.name)
    return { path, source }
  })
  const combined = documents.map(document => document.source).join('\n')

  for (const acceptanceCriterion of Array.from({ length: 12 }, (_, index) => `AC-${index + 1}`)) {
    assertAcceptanceCriterionRow(
      documents[0].source,
      acceptanceCriterion,
      'pinned PRD/TAD/ADR overlay',
    )
  }
  for (const marker of REQUIRED_SHARED_MARKERS) assertContains(combined, marker, 'XR v2 docs')
  for (const mode of REQUIRED_ENTRY_MODES) assertContains(combined, mode, 'canonical XR entry policy')
  for (const marker of FORBIDDEN_MISLEADING_MARKERS) {
    if (combined.includes(marker)) {
      throw new Error(`expected XR v2 readiness docs to avoid misleading marker ${marker}`)
    }
  }

  return Object.freeze({
    documents: documents.map(document => relative(repositoryRoot, document.path)),
    pinnedRevision: XR_V2_PINNED_DOCUMENT_REVISION,
    schema: 'knowgrph-xr-v2-pinned-contract-conformance/v1',
  })
}
