import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const RUNTIME_ROOT = ['canvas', 'src', 'features', 'xr-v2']
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
  'knowgrph-xr-v2-readiness/v1',
  'knowgrph-xr-v2-dev-runtime-evidence/v1',
  'XrCapabilityEntryMode',
  'capability',
  'capture',
  'authoring',
  'adapter',
  'source-backed',
  'source-ready',
  'xr-authoring-edited-media-delivery',
  'canonicalEcsEntityZero',
  'materialApplied',
  'timelineCommandRouted',
  'playbackObserved',
  'blocked',
])
const FORBIDDEN_RUNTIME_MARKERS = Object.freeze([
  'webxr-ar',
  'webxr-vr',
  'pseudo-ar-depth-parallax',
  'flat-fallback',
  '/xr.capture',
  '/xr.author',
  'xr_capability_tier',
  'kgc-behavior-graph/v1',
  'navigator.userAgent',
  'navigator.mediaDevices',
  'new WebGLRenderer',
  'new MediaRecorder',
  'createWorld(',
  'muxTracks(',
  'publishEdit(',
  'subscribeToEdits(',
  'devRuntimeEvidence',
  'depthModelLoaded',
  'referenceDeviceProven',
  'browserPlaybackProven',
  'physicalDeviceProven',
  'runtime-ready-dev',
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

export function verifyXrV2RuntimeSourceContract(repositoryRoot) {
  const runtimeRoot = resolve(repositoryRoot, ...RUNTIME_ROOT)
  const publicIndex = resolve(runtimeRoot, 'index.ts')
  const canonicalPolicy = resolve(repositoryRoot, ...CANONICAL_POLICY_PATH)
  if (!existsSync(publicIndex)) {
    throw new Error(`expected XR v2 public index at ${relative(repositoryRoot, publicIndex)}`)
  }
  if (!existsSync(canonicalPolicy)) {
    throw new Error(
      `expected canonical XR entry policy at ${relative(repositoryRoot, canonicalPolicy)}`,
    )
  }
  const runtimeFiles = listRuntimeFiles(runtimeRoot)
  if (runtimeFiles.length < 2) {
    throw new Error('expected XR v2 public index plus focused adapter owners')
  }
  const source = runtimeFiles.map(path => readFileSync(path, 'utf8')).join('\n')
  const indexSource = readFileSync(publicIndex, 'utf8')
  const canonicalPolicySource = readFileSync(canonicalPolicy, 'utf8')

  for (const marker of REQUIRED_RUNTIME_MARKERS) {
    if (!source.includes(marker)) {
      throw new Error(`expected XR v2 runtime source marker ${marker}`)
    }
  }
  for (const mode of REQUIRED_ENTRY_MODES) {
    if (!canonicalPolicySource.includes(mode)) {
      throw new Error(`expected canonical XR entry policy to retain mode ${mode}`)
    }
  }
  for (const marker of FORBIDDEN_RUNTIME_MARKERS) {
    if (source.includes(marker)) {
      throw new Error(`expected XR v2 adapters to avoid unowned runtime marker ${marker}`)
    }
  }
  for (const marker of [
    'capabilityContract',
    'captureContracts',
    'XrV2AuthoringStatusPanel',
    'XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA',
    'createXrV2ReadinessSnapshot',
    'validateXrV2DevRuntimeEvidence',
  ]) {
    if (!indexSource.includes(marker)) {
      throw new Error(`expected public XR v2 index export marker ${marker}`)
    }
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
    schema: 'knowgrph-xr-v2-readiness/v1',
  })
}
