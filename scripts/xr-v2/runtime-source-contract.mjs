import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { XR_V2_PINNED_DOCUMENT_REVISION } from './readiness-doc-contract.mjs'

const RUNTIME_ROOT = ['canvas', 'src', 'features', 'xr-v2']
const PINNED_CONFORMANCE_PATH = [...RUNTIME_ROOT, 'pinnedContractConformance.ts']
const PINNED_SOURCE_AUTHORITY_PATH = [...RUNTIME_ROOT, 'pinnedSourceAuthority.ts']
const AC_14_OWNERS = Object.freeze([
  Object.freeze({
    key: 'behaviorDispatcher',
    label: 'AC-14 behavior dispatcher owner',
    relativePath: 'canvas/src/features/xr-v2/behaviorDispatcher.ts',
  }),
  Object.freeze({
    key: 'collisionBridge',
    label: 'AC-14 collision event bridge owner',
    relativePath: 'canvas/src/features/xr-v2/collisionEventBridge.ts',
  }),
  Object.freeze({
    key: 'collisionBridgeTest',
    label: 'AC-14 collision event bridge focused proof',
    relativePath: 'canvas/src/features/xr-v2/__tests__/collisionEventBridge.test.ts',
  }),
  Object.freeze({
    key: 'spatialPhysicsAdapter',
    label: 'AC-14 spatial physics adapter owner',
    relativePath: 'canvas/src/features/three/xrSpatialPhysicsAdapter.ts',
  }),
  Object.freeze({
    key: 'physicsRuntime',
    label: 'AC-14 XR physics runtime owner',
    relativePath: 'canvas/src/features/three/xrPhysicsRuntime.ts',
  }),
])
const CANONICAL_POLICY_PATH = [
  'canvas',
  'src',
  'lib',
  'three',
  'ThreeGraphXrSessionPolicy.ts',
]
const REQUIRED_ENTRY_MODES = Object.freeze([
  'immersive-session',
  'inline-viewer',
  'monocular-capture',
  'native-handoff',
  'unsupported',
])
const REQUIRED_RUNTIME_MARKERS = Object.freeze([
  XR_V2_PINNED_DOCUMENT_REVISION,
  'agentic-graph-xr-v2-pinned-contract-conformance/v1',
  'XR_V2_PINNED_SOURCE_REVISION',
  'XR_V2_PINNED_CONFORMANCE_SCHEMA',
  'runXrV2PinnedContractConformanceProbe',
  'validateXrV2PinnedContractConformanceEvidence',
  'partial',
  'liveDepthModel',
  'referenceFrameBudget',
  'physicalDeviceMatrix',
  'progressiveViewerMatrix',
  'mountedEcsRendering',
  'compiledShaderMeshRender',
  'trackPreservingContainerMux',
  'connectedPreviewTransport',
  'agentic-graph-xr-v2-readiness/v1',
  'agentic-graph-xr-v2-dev-runtime-evidence/v1',
  'XrCapabilityEntryMode',
  'canonicalEcsEntityZero',
  'materialApplied',
  'timelineCommandRouted',
  'playbackObserved',
  'createXrV2TemporalEvidenceGate',
  'viewerRenderedFrame',
  'createXrV2SavedAssetEncodedTrackSet',
  'packageXrV2SavedAssetEncodedTrackSet',
  'applyXrV2MountedAuthoringVisibilityEdit',
  'authoringEditRevision',
  'authorRenderedAtMs',
  'XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER',
  'shared-storage-auth-and-server-digest-not-enforced',
  'uploadGeneratedWorkspaceBlobToAgenticGraphStorage',
  'publishXrV2ManifestThroughExistingStorage',
  'importSavedAssetAtomically',
  'data-kg-xr-v2-cross-device-network-on-mount',
  'source-ready',
  'blocked',
])
const FORBIDDEN_DUPLICATE_OWNER_MARKERS = Object.freeze([
  'navigator.userAgent',
  'navigator.mediaDevices',
  'new WebGLRenderer',
  'new MediaRecorder',
  'createWorld(',
  'muxTracks(',
  'publishEdit(',
  'subscribeToEdits(',
  '/api/storage/xr-spatial-assets',
  'xrSpatialAssetPrefix',
  "from 'rete'",
  'from "rete"',
  "from '@theatre",
  'from "@theatre',
  "from 'three.quarks'",
  'from "three.quarks"',
])

function listRuntimeFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...listRuntimeFiles(path))
      continue
    }
    if (stat.isFile() && /\.(?:ts|tsx|mjs)$/u.test(entry) && !/\.test\./u.test(entry)) {
      files.push(path)
    }
  }
  return files.sort()
}

function assertContains(source, marker, owner) {
  if (!source.includes(marker)) throw new Error(`expected ${owner} marker ${marker}`)
}

function assertMatches(source, pattern, marker, owner) {
  if (!pattern.test(source)) throw new Error(`expected ${owner} marker ${marker}`)
}

function assertOccurrenceCount(source, marker, expectedCount, owner) {
  const observedCount = source.split(marker).length - 1
  if (observedCount !== expectedCount) {
    throw new Error(
      `expected ${owner} marker ${marker} exactly ${expectedCount} times; found ${observedCount}`,
    )
  }
}

function assertAcceptanceCriterion(source, criterion, owner) {
  if (!new RegExp(`${criterion}(?!\\d)`, 'u').test(source)) {
    throw new Error(`expected ${owner} marker ${criterion}`)
  }
}

export function verifyXrV2RuntimeSourceContract(repositoryRoot) {
  const runtimeRoot = resolve(repositoryRoot, ...RUNTIME_ROOT)
  const publicIndex = resolve(runtimeRoot, 'index.ts')
  const pinnedConformance = resolve(repositoryRoot, ...PINNED_CONFORMANCE_PATH)
  const pinnedSourceAuthority = resolve(repositoryRoot, ...PINNED_SOURCE_AUTHORITY_PATH)
  const canonicalPolicy = resolve(repositoryRoot, ...CANONICAL_POLICY_PATH)
  const ac14Paths = Object.fromEntries(AC_14_OWNERS.map(owner => [
    owner.key,
    resolve(repositoryRoot, owner.relativePath),
  ]))
  for (const [label, path] of [
    ['XR v2 public index', publicIndex],
    ['pinned conformance owner', pinnedConformance],
    ['pinned source authority', pinnedSourceAuthority],
    ['canonical XR entry policy', canonicalPolicy],
    ...AC_14_OWNERS.map(owner => [owner.label, ac14Paths[owner.key]]),
  ]) {
    if (!existsSync(path)) throw new Error(`expected ${label} at ${relative(repositoryRoot, path)}`)
  }

  const runtimeFiles = listRuntimeFiles(runtimeRoot)
  if (runtimeFiles.length < 2) throw new Error('expected XR v2 public index plus focused adapter owners')
  const source = runtimeFiles.map(path => readFileSync(path, 'utf8')).join('\n')
  const indexSource = readFileSync(publicIndex, 'utf8')
  const pinnedSource = readFileSync(pinnedConformance, 'utf8')
  const pinnedAuthoritySource = readFileSync(pinnedSourceAuthority, 'utf8')
  const canonicalPolicySource = readFileSync(canonicalPolicy, 'utf8')
  const behaviorDispatcherSource = readFileSync(ac14Paths.behaviorDispatcher, 'utf8')
  const collisionBridgeSource = readFileSync(ac14Paths.collisionBridge, 'utf8')
  const collisionBridgeTestSource = readFileSync(ac14Paths.collisionBridgeTest, 'utf8')
  const spatialPhysicsAdapterSource = readFileSync(ac14Paths.spatialPhysicsAdapter, 'utf8')
  const physicsRuntimeSource = readFileSync(ac14Paths.physicsRuntime, 'utf8')

  for (const marker of REQUIRED_RUNTIME_MARKERS) assertContains(source, marker, 'XR v2 runtime')
  for (const marker of [
    'XR_V2_PINNED_SOURCE_REVISION',
    'XR_V2_PINNED_CONFORMANCE_SCHEMA',
    "from './pinnedSourceAuthority'",
  ]) {
    assertContains(pinnedSource, marker, 'pinned conformance owner')
  }
  for (const marker of [
    XR_V2_PINNED_DOCUMENT_REVISION,
  ]) {
    assertContains(pinnedAuthoritySource, marker, 'pinned source authority')
  }
  for (const criterion of Array.from({ length: 12 }, (_, index) => `AC-${index + 1}`)) {
    assertAcceptanceCriterion(pinnedSource, criterion, 'pinned conformance owner')
  }
  for (const mode of REQUIRED_ENTRY_MODES) {
    assertContains(canonicalPolicySource, mode, 'canonical XR entry policy')
  }
  for (const marker of FORBIDDEN_DUPLICATE_OWNER_MARKERS) {
    if (source.includes(marker)) {
      throw new Error(`expected XR v2 adapters to retain canonical ownership instead of ${marker}`)
    }
  }
  for (const marker of [
    'capabilityContract',
    'captureContracts',
    'XrV2AuthoringStatusPanel',
    'XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA',
    'createXrV2ReadinessSnapshot',
    'validateXrV2DevRuntimeEvidence',
    'XR_V2_PINNED_SOURCE_REVISION',
    'XR_V2_PINNED_CONFORMANCE_SCHEMA',
    'runXrV2PinnedContractConformanceProbe',
    'validateXrV2PinnedContractConformanceEvidence',
    'xrV2ConnectedPreviewViewerRuntime',
    'xrV2CrossDeviceAssetAdapter',
    'xrV2DeliveryObservationRuntime',
    'xrV2MountedAuthoringEditRuntime',
    'xrV2SavedAssetPackagingRuntime',
    'xrV2SavedAssetTemporalPlayback',
  ]) {
    assertContains(indexSource, marker, 'public XR v2 index export')
  }
  assertContains(indexSource, "export * from './collisionEventBridge'", 'AC-14 public XR v2 index export')
  assertMatches(
    behaviorDispatcherSource,
    /export type BehaviorTrigger =[\s\S]*?\| 'collision-begin'\s*\n\s*\| 'collision-end'[\s\S]*?\| 'timeline-marker'/u,
    'collision-begin and collision-end BehaviorTrigger variants',
    'AC-14 behavior dispatcher owner',
  )
  assertMatches(
    behaviorDispatcherSource,
    /const TRIGGERS = new Set<BehaviorTrigger>\(\[[\s\S]*?'collision-begin',\s*\n\s*'collision-end',[\s\S]*?\]\)/u,
    'collision-begin and collision-end runtime trigger admission',
    'AC-14 behavior dispatcher owner',
  )
  for (const marker of [
    "import type { SpatialPhysicsEvent } from '../physics/spatialPhysicsTypes'",
    'export function createXrV2CollisionEventBridge',
    "case 'collision-began': return { kind: 'collision-begin', trigger: 'collision-begin' }",
    "case 'collision-ended': return { kind: 'collision-end', trigger: 'collision-end' }",
    'input.dispatcher.dispatch({',
    'trigger: routed.trigger,',
    'sourceEntityId,',
  ]) {
    assertContains(collisionBridgeSource, marker, 'AC-14 collision event bridge owner')
  }
  for (const marker of [
    "import { createXrV2CollisionEventBridge } from '../collisionEventBridge'",
    "test('collision bridge routes one normalized begin and end per native contact event'",
    "test('collision bridge records an unbound native event without consuming dispatcher revision'",
    "test('collision bridge replays the consumed revision as stale and invokes its action exactly once'",
    "test('XR adapter and runtime step results preserve native spatial physics events'",
    "assert.deepEqual(runtimeResult.events, adapterResult.events)",
  ]) {
    assertContains(collisionBridgeTestSource, marker, 'AC-14 collision event bridge focused proof')
  }
  for (const marker of [
    'events: readonly SpatialPhysicsEvent[]',
    'const events = freezeSpatialPhysicsEvents(args.simulation.engine.drainEvents())',
  ]) {
    assertContains(spatialPhysicsAdapterSource, marker, 'AC-14 spatial physics adapter owner')
  }
  assertMatches(
    spatialPhysicsAdapterSource,
    /export function stepXrPhysicsSimulation\([\s\S]*?const events = freezeSpatialPhysicsEvents\(args\.simulation\.engine\.drainEvents\(\)\)[\s\S]*?return Object\.freeze\(\{[\s\S]*?\bevents,[\s\S]*?\}\)/u,
    'stepXrPhysicsSimulation drains and returns native events',
    'AC-14 spatial physics adapter owner',
  )
  for (const marker of [
    'export function stepXrPhysicsRuntime(',
    'export function stepXrPhysicsRuntimeTicks(',
    'events: readonly SpatialPhysicsEvent[]',
  ]) {
    assertContains(physicsRuntimeSource, marker, 'AC-14 XR physics runtime owner')
  }
  assertOccurrenceCount(
    physicsRuntimeSource,
    'events.push(...result.events)',
    2,
    'AC-14 XR physics runtime owner',
  )
  assertOccurrenceCount(
    physicsRuntimeSource,
    'events: Object.freeze(events)',
    2,
    'AC-14 XR physics runtime owner',
  )
  assertOccurrenceCount(
    physicsRuntimeSource,
    'events: EMPTY_PHYSICS_EVENTS',
    2,
    'AC-14 XR physics runtime owner',
  )
  for (const path of runtimeFiles) {
    const lineCount = readFileSync(path, 'utf8').split(/\r?\n/u).length
    if (lineCount > 600) {
      throw new Error(`${relative(repositoryRoot, path)} exceeds the 600-line authored-file budget`)
    }
  }

  return Object.freeze({
    ac14Owners: Object.freeze(AC_14_OWNERS.map(owner => owner.relativePath)),
    entryModes: REQUIRED_ENTRY_MODES,
    files: runtimeFiles.map(path => relative(repositoryRoot, path)),
    pinnedRevision: XR_V2_PINNED_DOCUMENT_REVISION,
    schema: 'agentic-graph-xr-v2-pinned-contract-conformance/v1',
  })
}
