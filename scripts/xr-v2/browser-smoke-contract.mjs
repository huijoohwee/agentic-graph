import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const SHA_REVISION_PATTERN = /^[0-9a-f]{40}$/u
const TASK_BRANCH_PATTERN = /^agent\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u
const ATTACHED_BRANCH_PATTERN = /^(?:main|agent\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/u

export function resolveXrV2SourceCheckoutContext({
  attachedBranch,
  environment,
  headRevision,
}) {
  assert.match(headRevision, SHA_REVISION_PATTERN)
  if (attachedBranch) {
    assert.match(attachedBranch, ATTACHED_BRANCH_PATTERN)
    return Object.freeze({
      sourceBranch: attachedBranch,
      sourceCandidateRevision: headRevision,
      sourceCheckoutState: 'attached',
      sourceLane: attachedBranch === 'main' ? 'canonical-main' : 'task-review',
    })
  }

  const env = environment || {}
  const headRef = String(env.KNOWGRPH_PR_HEAD_REF || '')
  const prNumber = String(env.KNOWGRPH_PR_NUMBER || '')
  const candidateRevision = String(env.KNOWGRPH_SOURCE_REVISION || '')
  assert.equal(env.GITHUB_ACTIONS, 'true', 'detached source proof is admitted only in GitHub Actions')
  assert.equal(env.GITHUB_EVENT_NAME, 'pull_request')
  assert.equal(env.GITHUB_SHA, headRevision)
  assert.match(headRef, TASK_BRANCH_PATTERN)
  assert.equal(env.GITHUB_HEAD_REF, headRef)
  assert.equal(env.GITHUB_BASE_REF, 'main')
  assert.equal(env.KNOWGRPH_PR_BASE_REF, 'main')
  assert.match(prNumber, /^[1-9][0-9]*$/u)
  assert.equal(env.GITHUB_REF, `refs/pull/${prNumber}/merge`)
  assert.equal(env.GITHUB_REPOSITORY, 'huijoohwee/knowgrph')
  assert.equal(env.KNOWGRPH_REPOSITORY, env.GITHUB_REPOSITORY)
  assert.equal(env.KNOWGRPH_TARGET_REF, `refs/heads/${headRef}`)
  assert.match(candidateRevision, SHA_REVISION_PATTERN)
  return Object.freeze({
    sourceBranch: headRef,
    sourceCandidateRevision: candidateRevision,
    sourceCheckoutState: 'github-pull-request-merge',
    sourceLane: 'pull-request-integration',
  })
}
export function assertXrV2SourceCheckoutGraph(context, {
  originMainRevision,
  parentRevisions,
  remoteHeadRevision,
}) {
  assert.match(originMainRevision, SHA_REVISION_PATTERN)
  assert.match(remoteHeadRevision, SHA_REVISION_PATTERN)
  assert.ok(Array.isArray(parentRevisions))
  for (const revision of parentRevisions) assert.match(revision, SHA_REVISION_PATTERN)
  if (context.sourceCheckoutState === 'github-pull-request-merge') {
    assert.equal(remoteHeadRevision, context.sourceCandidateRevision)
    assert.deepEqual(parentRevisions, [originMainRevision, context.sourceCandidateRevision])
  }
  return Object.freeze({ ...context, sourceParentRevisions: Object.freeze([...parentRevisions]) })
}

const SOURCE_PATHS = Object.freeze([
  ['canvas', 'src', 'App.tsx'],
  ['canvas', 'src', 'features', 'testing', 'XrV2RuntimeSmokePage.tsx'],
  ['canvas', 'src', 'features', 'testing', 'xrV2BrowserObservationSupport.ts'],
  ['canvas', 'src', 'features', 'xr-v2', 'browserRuntimeEvidence.ts'],
  ['canvas', 'src', 'features', 'xr-v2', 'xrV2ConnectedPreviewViewerRuntime.ts'],
  ['canvas', 'src', 'features', 'xr-v2', 'xrV2CrossDeviceAssetAdapter.ts'],
  ['canvas', 'src', 'features', 'xr-v2', 'XrV2CrossDeviceAssetPanel.tsx'],
  ['canvas', 'src', 'features', 'xr-v2', 'XrV2MountedAuthoringSmokeSurface.tsx'],
  ['canvas', 'src', 'features', 'xr-v2', 'mountedAuthoringEvidence.ts'],
  ['canvas', 'scripts', 'run_xr_v2_browser_smoke.mjs'],
  ['canvas', 'scripts', 'verify_xr_v2_browser_smoke.mjs'],
  ['canvas', 'scripts', 'run_xr_v2_workspace_seed_browser_smoke.mjs'],
  ['canvas', 'scripts', 'verify_xr_v2_workspace_seed_browser_smoke.mjs'],
  ['scripts', 'xr-v2', 'extended-browser-observation-contract.mjs'],
])
export const XR_V2_BROWSER_SMOKE_SOURCE_PATHS = Object.freeze(
  SOURCE_PATHS.map(parts => parts.join('/')),
)
const WORKSPACE_VERIFIER_PATH = Object.freeze([
  'canvas',
  'scripts',
  'verify_xr_v2_workspace_seed_browser_smoke.mjs',
])
const WORKSPACE_EVIDENCE_FLOW = Object.freeze([
  ['clean frozen source preflight', /assert\.equal\(sourceEvidenceBefore\.status, '', 'workspace browser proof requires a clean frozen source commit'\)/u],
  ['explicit Chromium override', /process\.env\.KG_XR_V2_CHROMIUM_EXECUTABLE/u],
  ['bundled Chromium preference', /chromium\.executablePath\(\)/u],
  ['software WebGL GL backend', /'--use-gl=angle'/u],
  ['software WebGL ANGLE backend', /'--use-angle=swiftshader-webgl'/u],
  ['explicit SwiftShader admission', /'--enable-unsafe-swiftshader'/u],
  ['bounded initial cold navigation', /await page\.goto\([\s\S]*?waitUntil: 'domcontentloaded',[\s\S]*?timeout: coldStartTimeoutMs,[\s\S]*?\}\)/u],
  ['stable mounted readiness', /__kgXrV2StableReadinessFrames\s*>=\s*12/u],
  ['delivery validation owner', /const deliveryValidation = page\.locator\('\[data-kg-xr-v2-delivery-validation="1"\]'\)/u],
  ['AC-11 action owner', /const runPackaging = page\.locator\('\[data-kg-xr-v2-ac-11-run="1"\]'\)/u],
  ['AC-12 action owner', /const runConnectedPreview = page\.locator\('\[data-kg-xr-v2-ac-12-run="1"\]'\)/u],
  ['local-first saved-asset scope', /await deliveryValidation\.getAttribute\('data-kg-xr-v2-saved-asset-scope'\), 'local-first-explicit-existing-storage'/u],
  ['cross-device blocker', /await deliveryValidation\.getAttribute\('data-kg-xr-v2-cross-device-blocker'\),\s*'shared-storage-auth-and-server-digest-not-enforced'/u],
  ['cross-device no-I/O mount', /await crossDevicePanel\.getAttribute\('data-kg-xr-v2-cross-device-network-on-mount'\), 'false'/u],
  ['AC-11 initial evidence', /await deliveryValidation\.getAttribute\('data-kg-xr-v2-ac-11-evidence'\), 'not-observed'/u],
  ['AC-12 initial evidence', /await deliveryValidation\.getAttribute\('data-kg-xr-v2-ac-12-evidence'\), 'not-observed'/u],
  ['camera explicit click', /await startCamera\.click\(\)/u],
  ['spatial capture explicit click', /await startSpatialCapture\.click\(\)/u],
  ['persisted capture completion', /getAttribute\('data-kg-xr-v2-spatial-capture-phase'\) === 'saved'/u],
  ['camera explicit stop', /await stopCamera\.click\(\)/u],
  ['fresh page reload', /await page\.reload\(\{ waitUntil: 'domcontentloaded' \}\)/u],
  ['persisted catalog listing', /await savedAsset\.waitFor\(\{ state: 'visible', timeout: coldStartTimeoutMs \}\)/u],
  ['persisted asset open', /await savedAsset\.locator\('\[data-kg-xr-v2-saved-asset-open="1"\]'\)\.click\(\)/u],
  ['persisted asset render', /getAttribute\('data-kg-xr-v2-saved-asset-observed'\) === 'true'/u],
  ['AC-4 rendered evidence', /getAttribute\('data-kg-xr-v2-ac-local-evidence'\) === 'browser-observed'/u],
  ['exact metadata inventory', /'depth_metadata_ref', 'fallback_triggered', 'synthesis_mode', 'xr_capability_tier'/u],
  ['AC-11 selected asset binding', /getAttribute\('data-kg-xr-v2-ac-11-source-asset'\), savedAssetId/u],
  ['AC-11 enabled check', /assert\.equal\(await runPackaging\.isDisabled\(\), false/u],
  ['cross-device explicit publish', /await publishCrossDevice\.click\(\)/u],
  ['cross-device manifest-last proof', /manifestPush > Math\.max\(\.\.\.blobUploads\)/u],
  ['AC-11 explicit click', /await runPackaging\.click\(\)/u],
  ['AC-11 panel evidence', /document\.querySelector\('\[data-kg-xr-v2-delivery-validation="1"\]'\)\s*\?\.getAttribute\('data-kg-xr-v2-ac-11-evidence'\) === 'browser-observed'/u],
  ['AC-11 canonical evidence', /await readiness\.locator\('\[data-kg-xr-v2-ac="AC-11"\]'\)\.getAttribute\('data-kg-xr-v2-ac-local-evidence'\),\s*'browser-observed'/u],
  ['AC-11 captured track producer', /getAttribute\('data-kg-xr-v2-ac-11-source-track-producer'\),\s*'captured-frame-bundle-webcodecs'/u],
  ['AC-12 enabled check', /assert\.equal\(await runConnectedPreview\.isDisabled\(\), false/u],
  ['AC-12 explicit click', /await runConnectedPreview\.click\(\)/u],
  ['AC-12 panel evidence', /document\.querySelector\('\[data-kg-xr-v2-delivery-validation="1"\]'\)\s*\?\.getAttribute\('data-kg-xr-v2-ac-12-evidence'\) === 'browser-observed'/u],
  ['AC-12 canonical evidence', /await readiness\.locator\('\[data-kg-xr-v2-ac="AC-12"\]'\)\.getAttribute\('data-kg-xr-v2-ac-local-evidence'\),\s*'browser-observed'/u],
  ['AC-12 mounted author revision', /getAttribute\('data-kg-xr-v2-ac-12-authoring-edit-revision'\), '1'/u],
  ['AC-12 mounted author render', /Number\(await reloadedDelivery\.getAttribute\('data-kg-xr-v2-ac-12-author-rendered-at-ms'\)\) > 0/u],
  ['AC-12 rendered viewer revision', /getAttribute\('data-kg-xr-v2-ac-12-viewer-render-revision'\), '1'/u],
  ['fresh cross-device client', /secondContext = await browser\.newContext\(\{ permissions: \[\] \}\)/u],
  ['bounded second-client cold navigation', /await secondPage\.goto\([\s\S]*?waitUntil: 'domcontentloaded',[\s\S]*?timeout: coldStartTimeoutMs,[\s\S]*?\}\)/u],
  ['cross-device explicit refresh', /await secondList\.click\(\)/u],
  ['cross-device explicit reopen', /await secondRead\.click\(\)/u],
  ['cross-device atomic catalog import', /getAttribute\('data-kg-xr-v2-cross-device-phase'\) === 'ready' && Boolean\(asset\)/u],
  ['cross-device verified part reads', /storageFixture\.events\.filter\(event => event\.startsWith\('blob-read:'\)\)\.length, 2/u],
  ['unchanged source postflight', /assert\.deepEqual\(readFrozenSourceEvidence\(\), sourceEvidenceBefore, 'source commit changed during browser proof'\)/u],
])
const REQUIRED_MARKERS = Object.freeze([
  'openEditorWorkspace=1',
  "getByRole('navigation', { name: 'Source files', exact: true })",
  'Folder docs',
  'Folder workspace-seeds',
  'File knowgrph-ar-vr-xr-runtime-readiness-demo.md',
  'await seedRow.click()',
  'XR v2 must remain inactive until the actual Explorer seed row is selected',
  'data-kg-three-canvas-owner',
  'data-kg-xr-document-loaded',
  'data-kg-xr-v2-authoring-runtime',
  'data-kg-xr-v2-workspace-readiness',
  'data-kg-xr-v2-probe-status',
  'data-kg-xr-v2-browser-api-available',
  'data-kg-xr-v2-spatial-capture-start',
  'data-kg-xr-v2-spatial-capture-stop',
  'data-kg-xr-v2-immersive-enter',
  'data-kg-xr-v2-cross-device-panel',
  'data-kg-xr-v2-cross-device-network-on-mount',
  'data-kg-xr-v2-cross-device-publish',
  'data-kg-xr-v2-cross-device-list',
  'data-kg-xr-v2-cross-device-read',
  'data-kg-xr-v2-connected-viewer-surface',
  'generic XR session controls must stay unmounted',
  'data-kg-motion-control-runtime',
  'data-kg-motion-control-enable-sensors',
  'data-kg-motion-control-disable-sensors',
  "from '@/features/xr-v2'",
  'XrV2RuntimeSmokePageLazy',
  '/__smoke__/xr-v2-runtime',
  'data-kg-xr-v2-runtime-smoke',
  'data-kg-xr-v2-browser-observation-state',
  'data-kg-xr-v2-pinned-conformance-artifact',
  'data-kg-xr-v2-pinned-conformance-evidence',
  'data-kg-xr-v2-pinned-conformance-validation',
  'data-kg-xr-v2-readiness-schema',
  'data-kg-xr-v2-readiness-scope',
  'data-kg-xr-v2-readiness-status',
  'data-kg-xr-v2-raw-observation-schema',
  'data-kg-xr-v2-raw-observation-validation',
  'data-kg-xr-v2-capability-status',
  'data-kg-xr-v2-capture-status',
  'data-kg-xr-v2-authoring-status',
  'data-kg-xr-v2-ecs-entity-zero-probe',
  'data-kg-xr-v2-material-applied-probe',
  'data-kg-xr-v2-timeline-command-probe',
  'data-kg-xr-v2-timeline-command-kind',
  'data-kg-xr-v2-timeline-command-action',
  'data-kg-xr-v2-timeline-command-handled-count',
  'data-kg-xr-v2-timeline-panel-route="mounted"',
  'data-kg-xr-v2-timeline-panel-route-probe',
  'data-kg-xr-v2-timeline-command-target-identity',
  'data-kg-xr-v2-blob-byte-size',
  'data-kg-xr-v2-blob-mime-type',
  'data-kg-xr-v2-decoded-width',
  'data-kg-xr-v2-decoded-height',
  'data-kg-xr-v2-decoded-duration-seconds',
  'data-kg-xr-v2-unbounded-duration',
  'data-kg-xr-v2-playback-observed',
  'data-kg-xr-v2-media-errors',
  'data-kg-xr-v2-video-src-attribute-removed',
  'data-kg-xr-v2-video-network-state-empty',
  'data-kg-xr-v2-object-url-revoked',
  'data-kg-xr-v2-revoked-object-url',
  'data-kg-xr-v2-browser-quiescent',
  'data-kg-xr-v2-observation-error',
  'data-kg-xr-v2-connected-preview-transport',
  'data-kg-xr-v2-encoded-track-decoded-source-frames',
  'data-kg-xr-v2-mounted-evidence-status',
  'data-kg-xr-v2-mounted-canvas-identity',
  'data-kg-xr-v2-mounted-map-uuid',
  'data-kg-xr-v2-mounted-particle-high-water',
  'data-kg-xr-v2-mounted-bone-playhead',
  'data-kg-xr-v2-mounted-behavior-effects',
  'data-kg-xr-v2-mounted-compile-status',
  'data-kg-xr-v2-mounted-dispose-count',
  'XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA',
  'type XrV2DevRuntimeEvidence',
  'validateXrV2DevRuntimeEvidence',
  'runXrV2PinnedContractConformanceProbe',
  'validateXrV2PinnedContractConformanceEvidence',
  'type XrV2PinnedContractConformanceEvidence',
  'assertPinnedXrV2ContractConformance',
  'pinnedContractConformance',
  'projectCanonicalAuthoringEcsWorld',
  'bindMaterialGraphToMeshStandardMaterial',
  'GanttTimelineTransportPanel',
  'GanttTimelineTransportCommandAdapter',
  'SMOKE_MEDIA_GANTT_CODE',
  'runtimeDocumentKey={SMOKE_RUNTIME_DOCUMENT_KEY}',
  'probeMountedXrV2TimelinePanel',
  'button[data-kg-video-sequence-clip-edit="nudge-forward"]',
  'renderVideoSequenceExport',
  'RTCPeerConnection',
  'VideoEncoder',
  'VideoDecoder',
  'verifyXrV2WebmSamplePayload',
  'prepareXrV2MountedAuthoringObservation',
  'observeXrV2MountedAuthoringDisposal',
  '/knowgrph/demo/media-preview-metadata-ready.mp4',
  'timelineStartMinutes: 0.25',
  "args.externalOwner.commandAction === 'nudge-forward'",
  'finalDuration',
  'initiallyUnbounded',
  'abortController.abort()',
  'disposeWorld',
  'bindingResult.binding.dispose()',
  'material.dispose()',
  'URL.createObjectURL',
  'URL.revokeObjectURL',
  'HTMLMediaElement.NETWORK_EMPTY',
  'releaseXrV2ObservedMedia',
  'waitForXrV2ReleasedMediaState',
  'waitForXrV2ObservationQuiescence',
  'waitForBrowserObservationQuiescence',
  'page.exposeBinding',
  '__kgRecordXrV2MediaError',
  "document.addEventListener('error'",
  'probeRevokedObjectUrl',
  'new Worker',
  '--autoplay-policy=no-user-gesture-required',
  'source-ready',
  'review-candidate-observation',
  'browser-observation-only',
  'xr-authoring-edited-media-delivery',
  "logLabel: 'xr-v2-browser-smoke'",
  "existingServerPolicy: 'forbid'",
  "import('@/features/testing/XrV2RuntimeSmokePage')",
  'knowgrph-xr-v2-browser-smoke/v1',
  'knowgrph-xr-v2-dev-runtime-evidence/v1',
  'mediaErrors',
  'assertObservedXrV2MediaErrors',
  'assertExactXrV2RawObservation',
  'playbackObservation',
  'mediaCleanupObservation',
  'sourceHeadTree',
  'proofSourceTree',
  'sourceCheckoutState',
  'sourceCandidateRevision',
  'sourceParentRevisions',
  'sourceLane',
  'sourceUpstreamRef',
  'sourceUpstreamRevision',
  'sourceAheadCount',
  'sourceBehindCount',
  'sourceDescendsFromUpstream',
  'sourceDescendsFromOriginMain',
  'upstreamSynchronized',
  'observedOriginMainRevision',
  'sourceEvidenceBefore',
  'source or worktree state changed during the browser observation',
  'assertCleanCommitSource',
  'resolveXrV2SourceCheckoutContext',
  'assertXrV2SourceCheckoutGraph',
  'github-pull-request-merge',
  'dirty task worktrees fail closed',
  'HEAD^{tree}',
  '--binary',
  '--full-index',
  'ls-files',
  '--others',
  '--exclude-standard',
  'knowgrph-git-worktree-state/v1',
  'worktreeState',
  'worktreeState.digest',
  'worktreeState.dirty',
  'worktreeState.pathCount',
  'trackedPathCount',
  'untrackedPathCount',
  'readinessSchema',
  'readinessScope',
  'observedAt',
  'browserProvenance',
  'navigator.userAgent',
  'navigator.platform',
  'process.platform',
  'process.arch',
  'knowgrph-xr-v2-browser-smoke-artifact/v1',
  'contentDigest',
  'contentByteSize',
  'await page.close()',
  'await context.close()',
  'await browser.close()',
  'assert.deepEqual(pageErrors, [])',
  'xr-v2-browser-smoke.json',
])
const FORBIDDEN_MARKERS = Object.freeze([
  'VITE_KNOWGRPH_RUN_READY_DEMO',
  'getUserMedia(',
  'requestSession(',
  'new MediaRecorder',
  'navigator.mediaDevices',
  'routeGanttTimelineTransportCommand',
  'runtime-ready-dev',
  'mediaErrors: [],',
  '/xr.capture',
  '/xr.author',
])

function assertExactKeys(value, expectedKeys, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  assert.deepEqual(Object.keys(value).sort(), [...expectedKeys].sort(), `${label} keys must be exact`)
}

export function assertExactXrV2RawObservation(observation) {
  assertExactKeys(observation, ['authoringAdapters', 'editedMedia', 'schema'], 'rawObservation')
  assert.equal(observation.schema, 'knowgrph-xr-v2-dev-runtime-evidence/v1')
  assertExactKeys(
    observation.authoringAdapters,
    ['canonicalEcsEntityZero', 'materialApplied', 'timelineCommandRouted'],
    'rawObservation.authoringAdapters',
  )
  assert.deepEqual(observation.authoringAdapters, {
    canonicalEcsEntityZero: true,
    materialApplied: true,
    timelineCommandRouted: true,
  })
  assertExactKeys(
    observation.editedMedia,
    [
      'byteSize',
      'decodedHeight',
      'decodedWidth',
      'durationSeconds',
      'mimeType',
      'playbackObserved',
      'unboundedDuration',
    ],
    'rawObservation.editedMedia',
  )
  const media = observation.editedMedia
  const boundedDuration = Number.isFinite(media.durationSeconds)
    && media.durationSeconds > 0
    && media.unboundedDuration === false
  const unboundedDuration = media.durationSeconds === null && media.unboundedDuration === true
  assert.ok(Number.isSafeInteger(media.byteSize) && media.byteSize > 0)
  assert.match(media.mimeType, /^video\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:\s*;[^\r\n]+)?$/iu)
  assert.ok(Number.isSafeInteger(media.decodedWidth) && media.decodedWidth > 0)
  assert.ok(Number.isSafeInteger(media.decodedHeight) && media.decodedHeight > 0)
  assert.ok(boundedDuration || unboundedDuration)
  assert.equal(media.playbackObserved, true)
}

export function parseXrV2MediaErrors(serialized) {
  const mediaErrors = JSON.parse(String(serialized || 'null'))
  assert.ok(Array.isArray(mediaErrors), 'media errors must be a JSON array')
  for (const [index, mediaError] of mediaErrors.entries()) {
    assertExactKeys(mediaError, ['code', 'message'], `mediaErrors[${index}]`)
    assert.ok(Number.isSafeInteger(mediaError.code) && mediaError.code >= 0)
    assert.equal(typeof mediaError.message, 'string')
  }
  return mediaErrors
}

export function assertObservedXrV2MediaErrors(mediaErrors) {
  for (const [index, mediaError] of mediaErrors.entries()) {
    assertExactKeys(
      mediaError,
      ['code', 'message', 'networkState', 'readyState', 'sourceKind', 'tagName'],
      `observedMediaErrors[${index}]`,
    )
    assert.ok(Number.isSafeInteger(mediaError.code) && mediaError.code >= 0)
    assert.ok(Number.isSafeInteger(mediaError.networkState) && mediaError.networkState >= 0)
    assert.ok(Number.isSafeInteger(mediaError.readyState) && mediaError.readyState >= 0)
    assert.equal(typeof mediaError.message, 'string')
    assert.match(mediaError.sourceKind, /^(?:blob|none|other)$/u)
    assert.match(mediaError.tagName, /^(?:AUDIO|VIDEO)$/u)
  }
}

export function assertPinnedXrV2ContractConformance(evidence) {
  assertExactKeys(
    evidence,
    [
      'acceptanceCriteria',
      'contractVersion',
      'deterministic',
      'overall',
      'pinnedSourceRevision',
      'runtimeObservations',
      'schema',
    ],
    'pinnedContractConformance',
  )
  assert.equal(evidence.schema, 'knowgrph-xr-v2-pinned-contract-conformance/v1')
  assert.equal(evidence.pinnedSourceRevision, '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7')
  assert.equal(evidence.contractVersion, '2.0.0')
  assert.equal(evidence.overall, 'partial')
  const deterministicKeys = [
    'behaviorExactOnce', 'behaviorUnwiredNoop', 'capabilityMatrixComplete', 'captureFrameCount',
    'ecsQueryCorrect', 'fallbackWithinConfiguredBreaches', 'materialGraphCompiled',
    'particleCeilingRespected', 'postProcessJobQueued', 'processLocalPreviewPropagated',
    'rawFramesUnique', 'stereoCoverage', 'stereoFrameCount', 'timelineInterpolationMatched',
  ]
  assertExactKeys(evidence.deterministic, deterministicKeys, 'pinnedContractConformance.deterministic')
  for (const key of deterministicKeys.filter(key => !key.endsWith('Count') && key !== 'stereoCoverage')) {
    assert.equal(evidence.deterministic[key], true, `deterministic ${key} must be observed`)
  }
  assert.ok(Number.isSafeInteger(evidence.deterministic.captureFrameCount))
  assert.ok(Number.isSafeInteger(evidence.deterministic.stereoFrameCount))
  assert.ok(evidence.deterministic.captureFrameCount > 0)
  assert.ok(evidence.deterministic.stereoFrameCount > 0)
  assert.ok(evidence.deterministic.stereoCoverage >= 0.9)
  assertExactKeys(evidence.runtimeObservations, [
    'compiledShaderMeshRender', 'connectedPreviewTransport', 'liveDepthModel',
    'mountedEcsRendering', 'physicalDeviceMatrix', 'progressiveViewerMatrix',
    'referenceFrameBudget', 'trackPreservingContainerMux',
  ], 'pinnedContractConformance.runtimeObservations')
  for (const value of Object.values(evidence.runtimeObservations)) assert.equal(value, 'not-observed')
  assert.ok(Array.isArray(evidence.acceptanceCriteria))
  const expectedCriteria = [
    ['AC-1', ['capabilityMatrixComplete'], ['physicalDeviceMatrix']],
    ['AC-2', ['stereoCoverage', 'rawFramesUnique'], ['liveDepthModel', 'referenceFrameBudget']],
    ['AC-3', ['fallbackWithinConfiguredBreaches', 'postProcessJobQueued'], []],
    ['AC-4', ['capabilityMatrixComplete'], ['progressiveViewerMatrix']],
    ['AC-5', ['capabilityMatrixComplete'], ['physicalDeviceMatrix']],
    ['AC-6', ['ecsQueryCorrect'], ['mountedEcsRendering']],
    ['AC-7', ['materialGraphCompiled'], ['compiledShaderMeshRender']],
    ['AC-8', ['behaviorExactOnce', 'behaviorUnwiredNoop'], []],
    ['AC-9', ['particleCeilingRespected'], []],
    ['AC-10', ['timelineInterpolationMatched'], []],
    ['AC-11', [], ['trackPreservingContainerMux']],
    ['AC-12', ['processLocalPreviewPropagated'], ['connectedPreviewTransport']],
  ]
  assert.equal(evidence.acceptanceCriteria.length, expectedCriteria.length)
  for (const [index, [criterion, deterministicEvidence, blockedBy]] of expectedCriteria.entries()) {
    const entry = evidence.acceptanceCriteria[index]
    assertExactKeys(
      entry,
      ['blockedBy', 'criterion', 'deterministicEvidence', 'status'],
      `pinnedContractConformance.acceptanceCriteria[${index}]`,
    )
    assert.equal(entry.criterion, criterion)
    assert.deepEqual(entry.deterministicEvidence, deterministicEvidence)
    assert.deepEqual(entry.blockedBy, blockedBy)
    assert.equal(entry.status, blockedBy.length ? 'partial' : 'deterministic-proven')
  }
}

function assertWorkspaceEvidenceFlow(source) {
  let cursor = 0
  for (const [label, pattern] of WORKSPACE_EVIDENCE_FLOW) {
    const match = pattern.exec(source.slice(cursor))
    if (!match) throw new Error(`workspace XR v2 browser verifier requires ordered ${label}`)
    cursor += match.index + match[0].length
  }
}

export function verifyXrV2BrowserSmokeSourceContract(repositoryRoot) {
  const sources = SOURCE_PATHS.map(parts => {
    const path = resolve(repositoryRoot, ...parts)
    if (!existsSync(path)) throw new Error(`expected XR v2 browser source at ${relative(repositoryRoot, path)}`)
    return { path, source: readFileSync(path, 'utf8') }
  })
  const combined = sources.map(entry => entry.source).join('\n')
  for (const marker of REQUIRED_MARKERS) {
    if (!combined.includes(marker)) throw new Error(`expected XR v2 browser smoke marker ${marker}`)
  }
  for (const marker of FORBIDDEN_MARKERS) {
    if (combined.includes(marker)) throw new Error(`expected deterministic XR v2 smoke to avoid ${marker}`)
  }
  const workspaceVerifierPath = resolve(repositoryRoot, ...WORKSPACE_VERIFIER_PATH)
  const workspaceVerifier = sources.find(entry => entry.path === workspaceVerifierPath)
  assert.ok(workspaceVerifier, 'workspace XR v2 browser verifier must be in the source ledger')
  assertWorkspaceEvidenceFlow(workspaceVerifier.source)
  for (const entry of sources) {
    const lineCount = entry.source.split(/\r?\n/u).length
    if (lineCount > 600) throw new Error(`${relative(repositoryRoot, entry.path)} exceeds 600 lines`)
  }
  return Object.freeze({
    sources: sources.map(entry => relative(repositoryRoot, entry.path)),
  })
}
