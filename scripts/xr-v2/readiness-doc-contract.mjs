import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

export const XR_V2_PINNED_DOCUMENT_REVISION =
  '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7'
export const XR_V2_PINNED_DOCUMENT_BLOB = '1c0cc60e8cdfaf4bc1b599e11cd5aba109ad6544'
export const XR_V2_PINNED_DOCUMENT_BYTES = 75_393
export const XR_V2_PINNED_DOCUMENT_SHA256 =
  '9dfcb6b55a5cb510177f0108ebccedace5d640390dbeef4d69a63f1e89edb6ea'

const PINNED_DOCUMENT = Object.freeze({
  name: 'immutable pinned PRD/TAD/ADR',
  parts: ['docs', 'documents', 'knowgrph-ar-vr-xr-prd-tad-adr.md'],
})

const EVIDENCE_DOCUMENTS = Object.freeze([
  Object.freeze({
    name: 'runtime-readiness evidence contract',
    parts: ['docs', 'documents', 'knowgrph-xr-v2-runtime-readiness.md'],
    required: Object.freeze([
      'readiness_scope: "pinned-ac1-ac12-conformance"',
      'local_rung: "browser-local-runtime-ready"',
      'AC-1–AC-12 evidence ledger',
      'Pinned Runtime-Readiness Evidence',
      'without `VITE_KNOWGRPH_RUN_READY_DEMO`',
      'aggregate browser gate runs both scripts',
      'track-preserving mux',
      'connected live transport',
      'existing Asset Contract Writer path',
      'It performs no I/O until an explicit user action.',
      'SHA-256/size/content type on read',
      'commits rehydration atomically',
      'workspace authentication or recompute uploaded digests',
    ]),
  }),
  Object.freeze({
    name: 'testing guide',
    parts: ['docs', 'TESTING.md'],
    required: Object.freeze([
      'positive/tamper contracts',
      'clean exact-commit',
      'Explorer → Source Files → docs → workspace-seeds',
      'camera `off`, sensors `off`',
      'test:smoke:xr-v2:browser:comprehensive',
      'test:smoke:xr-v2:browser:workspace-seed',
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
      'createXrV2CrossDeviceAssetAdapter',
      'blob parts precede a deterministic manifest',
      'Construction and mount perform no network request.',
      'SHA/size/content-type checked',
      'commits raw/blob/catalog state atomically',
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
  'browser-local mounted implementation',
  'source-ready',
  'blocked',
  'admitted model bytes',
  'reference/physical devices',
  'track-preserving mux proof',
  'connected live transport',
  'Dev-only',
  'canvas/src/lib/three/ThreeGraphXrSessionPolicy.ts',
  'canvas/src/features/xr-v2',
  'canvas/src/features/gitgraph',
  'Root `ecs`',
  'xr-authoring-edited-media-delivery',
  'node --test scripts/__tests__/xr-v2-source-smoke.test.mjs',
  'node scripts/run-xr-v2-source-smoke.mjs',
  'node scripts/run-video-editor-source-smoke.mjs',
  'node canvas/scripts/run_xr_v2_workspace_seed_browser_smoke.mjs',
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

export function verifyXrV2ReadinessDocumentation(repositoryRoot) {
  const pinnedPath = resolve(repositoryRoot, ...PINNED_DOCUMENT.parts)
  if (!existsSync(pinnedPath)) {
    throw new Error(
      `expected ${PINNED_DOCUMENT.name} at ${relative(repositoryRoot, pinnedPath)}`,
    )
  }
  const pinnedBytes = readFileSync(pinnedPath)
  const pinnedSha256 = createHash('sha256').update(pinnedBytes).digest('hex')
  if (
    pinnedBytes.byteLength !== XR_V2_PINNED_DOCUMENT_BYTES
    || pinnedSha256 !== XR_V2_PINNED_DOCUMENT_SHA256
  ) {
    throw new Error(
      `immutable pinned PRD/TAD/ADR drift: expected ${XR_V2_PINNED_DOCUMENT_BYTES} bytes and sha256 ${XR_V2_PINNED_DOCUMENT_SHA256}`,
    )
  }

  const documents = EVIDENCE_DOCUMENTS.map(document => {
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
  const evidenceCombined = documents.map(document => document.source).join('\n')
  const combined = `${pinnedBytes.toString('utf8')}\n${evidenceCombined}`

  for (const marker of REQUIRED_SHARED_MARKERS) assertContains(combined, marker, 'XR v2 docs')
  for (const mode of REQUIRED_ENTRY_MODES) assertContains(combined, mode, 'canonical XR entry policy')
  for (const marker of FORBIDDEN_MISLEADING_MARKERS) {
    if (evidenceCombined.includes(marker)) {
      throw new Error(`expected XR v2 readiness docs to avoid misleading marker ${marker}`)
    }
  }

  return Object.freeze({
    documents: [
      relative(repositoryRoot, pinnedPath),
      ...documents.map(document => relative(repositoryRoot, document.path)),
    ],
    pinnedBlob: XR_V2_PINNED_DOCUMENT_BLOB,
    pinnedBytes: XR_V2_PINNED_DOCUMENT_BYTES,
    pinnedRevision: XR_V2_PINNED_DOCUMENT_REVISION,
    pinnedSha256: XR_V2_PINNED_DOCUMENT_SHA256,
    schema: 'knowgrph-xr-v2-pinned-contract-conformance/v1',
  })
}
