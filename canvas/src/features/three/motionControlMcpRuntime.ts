import {
  inspectMotionControlRuntime,
  readMotionControlSnapshot,
  setMotionControlBoundingBoxEnabled,
  startMotionControl,
  stopMotionControl,
  type MotionControlBackendPreference,
} from './motionControlRuntime'
import {
  MOTION_CONTROL_INVOCATION_BINDINGS,
  MOTION_CONTROL_INVOCATION_COMMANDS,
  MOTION_CONTROL_INVOCATION_SEMANTICS,
  MOTION_CONTROL_MCP_SCHEMA,
  MOTION_CONTROL_WEB_MCP_TOOL_IDS,
} from './motionControlMcpContract.mjs'
import {
  inspectMotionControlTargets,
} from './motionControlTargetRuntime'
import { inspectMotionControlCapturePlatform } from './motionControlCapturePlatformBridge'
import {
  motionCaptureSessionRuntime,
  readMotionCaptureSessionSnapshot,
} from './motionCaptureSessionRuntime'
import {
  readMotionCapturePeerSharingSnapshot,
  setMotionCapturePeerSharingEnabled,
} from './motionCapturePeerRuntime'
import {
  motionControlCaptureSurfaceCurrentlyOpen,
  MOTION_CONTROL_XR_UNAVAILABLE_MESSAGE,
  MOTION_CONTROL_XR_SURFACE_REQUIRED_MESSAGE,
  openMotionControlSurface,
} from './motionControlSurfaceRuntime'

export type MotionControlOperation = 'open' | 'start' | 'stop' | 'record' | 'finish' | 'clear' | 'export' | 'share'
export type MotionControlExportFormat = 'json' | 'csv'
export type MotionControlInput = Readonly<{
  invocation?: string
  operation?: MotionControlOperation
  backend?: MotionControlBackendPreference
  boundingBox?: boolean
  format?: MotionControlExportFormat
  enabled?: boolean
}>

type CanonicalTokens = Readonly<{ command: string; semantic: string; binding: string }>
type NormalizedControl = Readonly<{
  operation: MotionControlOperation
  backend: MotionControlBackendPreference
  boundingBox?: boolean
  format?: MotionControlExportFormat
  enabled?: boolean
  invocation: string
}>

const MOTION_CONTROL_OPERATIONS: readonly MotionControlOperation[] = Object.freeze([
  'open', 'start', 'stop', 'record', 'finish', 'clear', 'export', 'share',
])

const canonicalTokens = (): CanonicalTokens => ({
  command: MOTION_CONTROL_INVOCATION_COMMANDS.control,
  semantic: MOTION_CONTROL_INVOCATION_SEMANTICS.pose,
  binding: MOTION_CONTROL_INVOCATION_BINDINGS.canvas,
})

export function buildMotionControlInvocation(operation: Exclude<MotionControlOperation, 'export' | 'share'>, backend: MotionControlBackendPreference = 'auto'): string {
  const tokens = canonicalTokens()
  return `${tokens.command} ${tokens.binding} ${tokens.semantic} operation=${operation}${operation === 'start' ? ` backend=${backend}` : ''}`
}

export function buildMotionControlBoundingBoxInvocation(enabled: boolean): string {
  const invocation = buildMotionControlInvocation('open')
  return invocation ? `${invocation} boundingBox=${enabled}` : ''
}

export function buildMotionControlExportInvocation(format: MotionControlExportFormat): string {
  const tokens = canonicalTokens()
  return `${tokens.command} ${tokens.binding} ${tokens.semantic} operation=export format=${format}`
}

export function buildMotionControlShareInvocation(enabled: boolean): string {
  const tokens = canonicalTokens()
  return `${tokens.command} ${tokens.binding} ${tokens.semantic} operation=share enabled=${enabled}`
}

function parseInvocation(value: unknown): NormalizedControl | null {
  if (typeof value !== 'string') return null
  const invocation = value.trim()
  const canonical = canonicalTokens()
  if (!invocation) return null
  const tokens = invocation.split(/\s+/).filter(Boolean)
  if (tokens[0] !== canonical.command || tokens.filter(token => token.startsWith('/')).length !== 1) return null
  const semantics = tokens.filter(token => token.startsWith('#'))
  const bindings = tokens.filter(token => token.startsWith('@'))
  if (semantics.length !== 1 || semantics[0] !== canonical.semantic || bindings.length !== 1 || bindings[0] !== canonical.binding) return null
  const pairs: Record<string, string> = {}
  for (const token of tokens.slice(1).filter(token => !token.startsWith('#') && !token.startsWith('@'))) {
    const separator = token.indexOf('=')
    if (separator <= 0 || separator === token.length - 1) return null
    const key = token.slice(0, separator)
    if (!['operation', 'backend', 'boundingBox', 'format', 'enabled'].includes(key) || pairs[key]) return null
    pairs[key] = token.slice(separator + 1)
  }
  const operation = pairs.operation as MotionControlOperation
  const backend = (pairs.backend || 'auto') as MotionControlBackendPreference
  if (!MOTION_CONTROL_OPERATIONS.includes(operation) || !['auto', 'webgpu', 'wasm'].includes(backend)) return null
  if (operation !== 'start' && pairs.backend) return null
  if (pairs.boundingBox && !['true', 'false'].includes(pairs.boundingBox)) return null
  if (operation !== 'open' && pairs.boundingBox) return null
  if (pairs.format && !['json', 'csv'].includes(pairs.format)) return null
  if ((operation === 'export') !== Boolean(pairs.format)) return null
  if (pairs.enabled && !['true', 'false'].includes(pairs.enabled)) return null
  if ((operation === 'share') !== Boolean(pairs.enabled)) return null
  return {
    invocation,
    operation,
    backend,
    ...(pairs.boundingBox ? { boundingBox: pairs.boundingBox === 'true' } : {}),
    ...(pairs.format ? { format: pairs.format as MotionControlExportFormat } : {}),
    ...(pairs.enabled ? { enabled: pairs.enabled === 'true' } : {}),
  }
}

function normalizeControl(input: MotionControlInput): NormalizedControl | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (input.invocation !== undefined) {
    if (Object.keys(input).some(key => key !== 'invocation')) return null
    if (input.operation !== undefined || input.backend !== undefined || input.boundingBox !== undefined || input.format !== undefined || input.enabled !== undefined) return null
    return parseInvocation(input.invocation)
  }
  if (Object.keys(input).some(key => !['operation', 'backend', 'boundingBox', 'format', 'enabled'].includes(key))) return null
  const operation = input.operation
  const backend = input.backend === undefined ? 'auto' : input.backend
  if (!operation || !MOTION_CONTROL_OPERATIONS.includes(operation)) return null
  if (!['auto', 'webgpu', 'wasm'].includes(backend) || (operation !== 'start' && input.backend !== undefined)) return null
  if (input.boundingBox !== undefined && (operation !== 'open' || typeof input.boundingBox !== 'boolean')) return null
  if ((operation === 'export') !== (input.format !== undefined) || (input.format !== undefined && !['json', 'csv'].includes(input.format))) return null
  if ((operation === 'share') !== (input.enabled !== undefined) || (input.enabled !== undefined && typeof input.enabled !== 'boolean')) return null
  return {
    invocation: '',
    operation,
    backend,
    ...(input.boundingBox === undefined ? {} : { boundingBox: input.boundingBox }),
    ...(input.format === undefined ? {} : { format: input.format }),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
  }
}

export function inspectLocalMotionControl() {
  const canonical = canonicalTokens()
  const runtime = inspectMotionControlRuntime()
  return {
    ...runtime,
    schema: MOTION_CONTROL_MCP_SCHEMA,
    runtimeSchema: runtime.schema,
    webMcpTools: {
      inspect: `agenticgraph.${MOTION_CONTROL_WEB_MCP_TOOL_IDS.inspect}`,
      control: `agenticgraph.${MOTION_CONTROL_WEB_MCP_TOOL_IDS.control}`,
    },
    invocationGrammar: {
      open: `${canonical.command} ${canonical.binding} ${canonical.semantic} operation=open`,
      boundingBox: `${canonical.command} ${canonical.binding} ${canonical.semantic} operation=open boundingBox=true|false`,
      start: `${canonical.command} ${canonical.binding} ${canonical.semantic} operation=start backend=auto|webgpu|wasm`,
      stop: `${canonical.command} ${canonical.binding} ${canonical.semantic} operation=stop`,
      record: `${canonical.command} ${canonical.binding} ${canonical.semantic} operation=record`,
      finish: `${canonical.command} ${canonical.binding} ${canonical.semantic} operation=finish`,
      clear: `${canonical.command} ${canonical.binding} ${canonical.semantic} operation=clear`,
      export: `${canonical.command} ${canonical.binding} ${canonical.semantic} operation=export format=json|csv`,
      share: `${canonical.command} ${canonical.binding} ${canonical.semantic} operation=share enabled=true|false`,
    },
    targets: inspectMotionControlTargets(),
    capturePlatform: inspectMotionControlCapturePlatform(),
    peerSharing: readMotionCapturePeerSharingSnapshot(),
  }
}

export async function controlLocalMotionControl(input: MotionControlInput) {
  const control = normalizeControl(input)
  if (!control) return { ok: false, message: 'Use a supported structured operation or native /motion.control @canvas #pose invocation.' }
  if (control.operation === 'stop') {
    setMotionCapturePeerSharingEnabled(false)
    const stopped = await stopMotionControl()
    return { ok: true, message: stopped.message, operation: control.operation, motionControl: inspectLocalMotionControl() }
  }
  if (control.operation === 'share') {
    if (control.enabled && !motionControlCaptureSurfaceCurrentlyOpen()) {
      return {
        ok: false,
        message: MOTION_CONTROL_XR_SURFACE_REQUIRED_MESSAGE,
        operation: control.operation,
        motionControl: inspectLocalMotionControl(),
      }
    }
    const peerSharing = setMotionCapturePeerSharingEnabled(control.enabled!)
    return {
      ok: peerSharing.enabled === control.enabled,
      message: control.enabled
        ? peerSharing.enabled ? 'Derived-pose peer sharing enabled for the active collaboration session.' : peerSharing.lastError
        : 'Derived-pose peer sharing disabled.',
      operation: control.operation,
      motionControl: inspectLocalMotionControl(),
    }
  }
  if (control.operation === 'record') {
    if (!motionControlCaptureSurfaceCurrentlyOpen()) {
      return {
        ok: false,
        message: MOTION_CONTROL_XR_SURFACE_REQUIRED_MESSAGE,
        operation: control.operation,
        motionControl: inspectLocalMotionControl(),
      }
    }
    const capture = readMotionCaptureSessionSnapshot()
    if (capture.sources.length === 0) {
      return { ok: false, message: 'Register or start a local motion source before recording.', operation: control.operation, motionControl: inspectLocalMotionControl() }
    }
    try {
      motionCaptureSessionRuntime.startRecording()
      return { ok: true, message: 'Bounded local derived-pose recording started.', operation: control.operation, motionControl: inspectLocalMotionControl() }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error), operation: control.operation, motionControl: inspectLocalMotionControl() }
    }
  }
  if (control.operation === 'finish') {
    const before = readMotionCaptureSessionSnapshot().recording.status
    const capture = motionCaptureSessionRuntime.stopRecording()
    return {
      ok: before === 'recording',
      message: before === 'recording' ? 'Local derived-pose recording finished and is ready to export.' : 'No active motion recording to finish.',
      operation: control.operation,
      recording: capture.recording,
      motionControl: inspectLocalMotionControl(),
    }
  }
  if (control.operation === 'clear') {
    const capture = motionCaptureSessionRuntime.clearRecording()
    return { ok: true, message: 'Local motion recording memory cleared.', operation: control.operation, recording: capture.recording, motionControl: inspectLocalMotionControl() }
  }
  if (control.operation === 'export') {
    try {
      const artifact = await motionCaptureSessionRuntime.exportRecording(control.format!)
      const metadata = {
        schema: artifact.schema,
        format: artifact.format,
        mimeType: artifact.mimeType,
        fileName: artifact.fileName,
        sha256: artifact.sha256,
        byteLength: artifact.byteLength,
        recordingId: artifact.recordingId,
        sourceCount: artifact.sourceCount,
        sampleCount: artifact.sampleCount,
        landmarkCount: artifact.landmarkCount,
        researchReady: artifact.researchReady,
        researchReadyGroupCount: artifact.researchReadyGroupCount,
        researchEvidenceManifestCount: artifact.researchEvidenceManifestCount,
      }
      return { ok: true, message: `Deterministic ${control.format!.toUpperCase()} export prepared locally.`, operation: control.operation, export: metadata, motionControl: inspectLocalMotionControl() }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error), operation: control.operation, motionControl: inspectLocalMotionControl() }
    }
  }
  if (!openMotionControlSurface('motion-control')) {
    return {
      ok: false,
      message: MOTION_CONTROL_XR_UNAVAILABLE_MESSAGE,
      operation: control.operation,
      motionControl: inspectLocalMotionControl(),
    }
  }
  if (control.operation === 'open') {
    if (control.boundingBox !== undefined) setMotionControlBoundingBoxEnabled(control.boundingBox)
    const preferenceMessage = control.boundingBox === undefined ? '' : ` Bounding box ${control.boundingBox ? 'enabled' : 'disabled'}.`
    const cameraMessage = readMotionControlSnapshot().cameraActive ? ' Camera capture remains active.' : ' Camera access still requires Start.'
    return { ok: true, message: `Motion Control opened in XR Mode.${preferenceMessage}${cameraMessage}`, operation: control.operation, motionControl: inspectLocalMotionControl() }
  }
  const started = await startMotionControl(control.backend)
  return {
    ok: started.phase === 'running',
    message: started.message,
    operation: control.operation,
    motionControl: inspectLocalMotionControl(),
  }
}

export function motionControlRuntimeActive(): boolean {
  return readMotionControlSnapshot().phase === 'running'
}
