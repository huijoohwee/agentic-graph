import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const RUNTIME_ROOT = ['canvas', 'src', 'features', 'xr-v2']
const PINNED_CONFORMANCE_PATH = [...RUNTIME_ROOT, 'pinnedContractConformance.ts']
const CANONICAL_POLICY_PATH = [
  'canvas',
  'src',
  'lib',
  'three',
  'ThreeGraphXrSessionPolicy.ts',
]
const PINNED_SOURCE_REVISION = '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7'
const REQUIRED_ENTRY_MODES = Object.freeze([
  'immersive-session',
  'inline-viewer',
  'monocular-capture',
  'native-handoff',
  'unsupported',
])
const REQUIRED_RUNTIME_MARKERS = Object.freeze([
  PINNED_SOURCE_REVISION,
  'knowgrph-xr-v2-pinned-contract-conformance/v1',
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
  'knowgrph-xr-v2-readiness/v1',
  'knowgrph-xr-v2-dev-runtime-evidence/v1',
  'XrCapabilityEntryMode',
  'canonicalEcsEntityZero',
  'materialApplied',
  'timelineCommandRouted',
  'playbackObserved',
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

function assertAcceptanceCriterion(source, criterion, owner) {
  if (!new RegExp(`${criterion}(?!\\d)`, 'u').test(source)) {
    throw new Error(`expected ${owner} marker ${criterion}`)
  }
}

export function verifyXrV2RuntimeSourceContract(repositoryRoot) {
  const runtimeRoot = resolve(repositoryRoot, ...RUNTIME_ROOT)
  const publicIndex = resolve(runtimeRoot, 'index.ts')
  const pinnedConformance = resolve(repositoryRoot, ...PINNED_CONFORMANCE_PATH)
  const canonicalPolicy = resolve(repositoryRoot, ...CANONICAL_POLICY_PATH)
  for (const [label, path] of [
    ['XR v2 public index', publicIndex],
    ['pinned conformance owner', pinnedConformance],
    ['canonical XR entry policy', canonicalPolicy],
  ]) {
    if (!existsSync(path)) throw new Error(`expected ${label} at ${relative(repositoryRoot, path)}`)
  }

  const runtimeFiles = listRuntimeFiles(runtimeRoot)
  if (runtimeFiles.length < 2) throw new Error('expected XR v2 public index plus focused adapter owners')
  const source = runtimeFiles.map(path => readFileSync(path, 'utf8')).join('\n')
  const indexSource = readFileSync(publicIndex, 'utf8')
  const pinnedSource = readFileSync(pinnedConformance, 'utf8')
  const canonicalPolicySource = readFileSync(canonicalPolicy, 'utf8')

  for (const marker of REQUIRED_RUNTIME_MARKERS) assertContains(source, marker, 'XR v2 runtime')
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
  ]) {
    assertContains(indexSource, marker, 'public XR v2 index export')
  }
  for (const path of runtimeFiles) {
    const lineCount = readFileSync(path, 'utf8').split(/\r?\n/u).length
    if (lineCount > 600) {
      throw new Error(`${relative(repositoryRoot, path)} exceeds the 600-line authored-file budget`)
    }
  }

  return Object.freeze({
    entryModes: REQUIRED_ENTRY_MODES,
    files: runtimeFiles.map(path => relative(repositoryRoot, path)),
    pinnedRevision: PINNED_SOURCE_REVISION,
    schema: 'knowgrph-xr-v2-pinned-contract-conformance/v1',
  })
}
