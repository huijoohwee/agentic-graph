import {
  XR_V2_CAPTURE_SNAPSHOT_SCHEMA,
  XR_V2_CONTRACT_VERSION,
  type XrV2CaptureSnapshot,
} from './captureContracts'
import {
  XR_V2_MAX_CAPTURE_BLOB_BYTES,
  XR_V2_MAX_PERSISTED_CAPTURE_FRAMES,
  type XrV2StoredCaptureFrameBundle,
} from './xrV2CaptureArtifactStore'

export const XR_V2_FRAME_BUNDLE_BINARY_SCHEMA =
  'agentic-graph-xr-v2-frame-bundle-binary/v1' as const
export const XR_V2_CROSS_DEVICE_MAX_PART_BYTES = XR_V2_MAX_CAPTURE_BLOB_BYTES

const MAGIC = new TextEncoder().encode('KGXRB001')
const FIXED_HEADER_BYTES = MAGIC.byteLength + 4
const MAX_DIMENSION = 1_024
const MAX_HEADER_BYTES = 512 * 1_024
const PORTABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
const HASH = /^sha256:[0-9a-f]{64}$/
const PHASES = new Set(['idle', 'capturing-live', 'capturing-raw', 'completed'])

export type XrV2CrossDeviceEncodedFrameBundle = Readonly<{
  bytes: Uint8Array
  contentHash: `sha256:${string}`
}>

type BinaryFrameHeader = Readonly<{
  frame_index: number
  captured_at_ms: number
  rgba: Readonly<{ width: number; height: number; byte_length: number }>
  depth: Readonly<{
    width: number
    height: number
    byte_length: number
    confidence: number
  }> | null
}>

type BinaryHeader = Readonly<{
  schema: typeof XR_V2_FRAME_BUNDLE_BINARY_SCHEMA
  bundle_schema: XrV2StoredCaptureFrameBundle['schema']
  session_id: string
  created_at_ms: number
  snapshot: XrV2CaptureSnapshot
  frames: readonly BinaryFrameHeader[]
}>

function abortError(): DOMException {
  return new DOMException('XR v2 cross-device operation was aborted', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

function boundedInteger(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new Error(`${label} is outside the admitted integer bound`)
  }
  return Number(value)
}

function boundedNumber(value: unknown, label: string): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} is outside the admitted numeric bound`)
  }
  return normalized
}

function boundedDimension(value: unknown, label: string): number {
  const dimension = boundedInteger(value, label, MAX_DIMENSION)
  if (dimension < 1) throw new Error(`${label} must be positive`)
  return dimension
}

function portableId(value: unknown, label: string): string {
  const normalized = String(value || '').trim()
  if (!PORTABLE_ID.test(normalized)) throw new Error(`${label} must be a bounded portable identifier`)
  return normalized
}

function snapshot(value: unknown, sessionId: string): XrV2CaptureSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('frame bundle snapshot is malformed')
  }
  const source = value as Record<string, unknown>
  const fallbackSource = source.fallback
  const fallback = fallbackSource === null ? null : (() => {
    if (!fallbackSource || typeof fallbackSource !== 'object' || Array.isArray(fallbackSource)) {
      throw new Error('frame bundle fallback snapshot is malformed')
    }
    const item = fallbackSource as Record<string, unknown>
    if (item.reason !== 'budget-breach' && item.reason !== 'live-processing-error') {
      throw new Error('frame bundle fallback reason is malformed')
    }
    return Object.freeze({
      triggeredAtFrameIndex: boundedInteger(item.triggeredAtFrameIndex, 'fallback frame index'),
      observedDurationMs: boundedNumber(item.observedDurationMs, 'fallback duration'),
      reason: item.reason,
    })
  })()
  const phase = String(source.phase || '')
  if (source.schema !== XR_V2_CAPTURE_SNAPSHOT_SCHEMA
    || source.contractVersion !== XR_V2_CONTRACT_VERSION
    || portableId(source.sessionId, 'snapshot sessionId') !== sessionId
    || !PHASES.has(phase)) {
    throw new Error('frame bundle snapshot identity is malformed')
  }
  const lastFrameIndex = source.lastFrameIndex === null
    ? null
    : boundedInteger(source.lastFrameIndex, 'last frame index')
  return Object.freeze({
    schema: XR_V2_CAPTURE_SNAPSHOT_SCHEMA,
    contractVersion: XR_V2_CONTRACT_VERSION,
    sessionId,
    phase: phase as XrV2CaptureSnapshot['phase'],
    frameBudgetMs: boundedInteger(source.frameBudgetMs, 'frame budget'),
    consecutiveBudgetBreachesRequired: boundedInteger(source.consecutiveBudgetBreachesRequired, 'breach limit'),
    maxFrames: boundedInteger(source.maxFrames, 'maximum frames', XR_V2_MAX_PERSISTED_CAPTURE_FRAMES),
    rawFrameCount: boundedInteger(source.rawFrameCount, 'raw frame count', XR_V2_MAX_PERSISTED_CAPTURE_FRAMES),
    depthFrameCount: boundedInteger(source.depthFrameCount, 'depth frame count', XR_V2_MAX_PERSISTED_CAPTURE_FRAMES),
    synthesizedFrameCount: boundedInteger(source.synthesizedFrameCount, 'synthesized frame count', XR_V2_MAX_PERSISTED_CAPTURE_FRAMES),
    consecutiveBudgetBreaches: boundedInteger(source.consecutiveBudgetBreaches, 'breach count'),
    lastFrameIndex,
    fallback,
  })
}

function assertDepthValues(values: Float32Array): void {
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error('depth values must be finite')
  }
}

function encodeFloat32LittleEndian(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(index * 4, values[index]!, true)
  }
  return bytes
}

function decodeFloat32LittleEndian(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 4 !== 0) throw new Error('depth byte length is malformed')
  const values = new Float32Array(bytes.byteLength / 4)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < values.length; index += 1) {
    values[index] = view.getFloat32(index * 4, true)
  }
  assertDepthValues(values)
  return values
}

export async function sha256XrV2CrossDeviceBytes(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<`sha256:${string}`> {
  throwIfAborted(signal)
  if (bytes.byteLength > XR_V2_CROSS_DEVICE_MAX_PART_BYTES) {
    throw new Error('XR v2 cross-device part exceeds the admitted byte bound')
  }
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await globalThis.crypto.subtle.digest('SHA-256', source)
  throwIfAborted(signal)
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

export async function encodeXrV2CrossDeviceFrameBundle(
  input: XrV2StoredCaptureFrameBundle,
  signal?: AbortSignal,
): Promise<XrV2CrossDeviceEncodedFrameBundle> {
  throwIfAborted(signal)
  const sessionId = portableId(input.sessionId, 'frame bundle sessionId')
  if (input.schema !== 'agentic-graph-xr-v2-capture-frame-bundle/v1'
    || !Array.isArray(input.frames)
    || input.frames.length < 1
    || input.frames.length > XR_V2_MAX_PERSISTED_CAPTURE_FRAMES) {
    throw new Error('frame bundle is outside the admitted frame-count bound')
  }
  const payloads: Uint8Array[] = []
  const seen = new Set<number>()
  let payloadByteLength = 0
  const addPayload = (payload: Uint8Array) => {
    payloadByteLength += payload.byteLength
    if (FIXED_HEADER_BYTES + payloadByteLength > XR_V2_CROSS_DEVICE_MAX_PART_BYTES) {
      throw new Error('encoded frame bundle exceeds the admitted byte bound')
    }
    payloads.push(payload)
  }
  const frames = [...input.frames]
    .sort((left, right) => Number(left.frameIndex) - Number(right.frameIndex))
    .map(item => {
      throwIfAborted(signal)
      const frameIndex = boundedInteger(item.frameIndex, 'frame index')
      if (seen.has(frameIndex)) throw new Error('frame bundle contains a duplicate frame index')
      seen.add(frameIndex)
      const capturedAtMs = boundedNumber(item.capturedAtMs, 'capture timestamp')
      const width = boundedDimension(item.frame.width, 'RGBA width')
      const height = boundedDimension(item.frame.height, 'RGBA height')
      const rgbaLength = width * height * 4
      if (!(item.frame.data instanceof Uint8ClampedArray) || item.frame.data.byteLength !== rgbaLength) {
        throw new Error('RGBA bytes do not match frame dimensions')
      }
      const rgba = new Uint8Array(item.frame.data.buffer, item.frame.data.byteOffset, item.frame.data.byteLength).slice()
      addPayload(rgba)
      const depth = item.estimate ? (() => {
        const depthWidth = boundedDimension(item.estimate.depth.width, 'depth width')
        const depthHeight = boundedDimension(item.estimate.depth.height, 'depth height')
        const confidence = Number(item.estimate.confidence)
        if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1
          || !(item.estimate.depth.values instanceof Float32Array)
          || item.estimate.depth.values.length !== depthWidth * depthHeight) {
          throw new Error('depth estimate is outside the admitted bound')
        }
        assertDepthValues(item.estimate.depth.values)
        const encoded = encodeFloat32LittleEndian(item.estimate.depth.values)
        addPayload(encoded)
        return Object.freeze({ width: depthWidth, height: depthHeight, byte_length: encoded.byteLength, confidence })
      })() : null
      return Object.freeze({
        frame_index: frameIndex,
        captured_at_ms: capturedAtMs,
        rgba: Object.freeze({ width, height, byte_length: rgba.byteLength }),
        depth,
      })
    })
  const header: BinaryHeader = Object.freeze({
    schema: XR_V2_FRAME_BUNDLE_BINARY_SCHEMA,
    bundle_schema: input.schema,
    session_id: sessionId,
    created_at_ms: boundedInteger(input.createdAtMs, 'bundle creation timestamp'),
    snapshot: snapshot(input.snapshot, sessionId),
    frames: Object.freeze(frames),
  })
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const total = FIXED_HEADER_BYTES + headerBytes.byteLength + payloadByteLength
  if (headerBytes.byteLength > MAX_HEADER_BYTES || total > XR_V2_CROSS_DEVICE_MAX_PART_BYTES) {
    throw new Error('encoded frame bundle exceeds the admitted byte bound')
  }
  const bytes = new Uint8Array(total)
  bytes.set(MAGIC, 0)
  new DataView(bytes.buffer).setUint32(MAGIC.byteLength, headerBytes.byteLength, true)
  bytes.set(headerBytes, FIXED_HEADER_BYTES)
  let offset = FIXED_HEADER_BYTES + headerBytes.byteLength
  for (const payload of payloads) { bytes.set(payload, offset); offset += payload.byteLength }
  return Object.freeze({ bytes, contentHash: await sha256XrV2CrossDeviceBytes(bytes, signal) })
}

function parseHeader(bytes: Uint8Array): Readonly<{ header: BinaryHeader; offset: number }> {
  if (bytes.byteLength < FIXED_HEADER_BYTES || bytes.byteLength > XR_V2_CROSS_DEVICE_MAX_PART_BYTES
    || MAGIC.some((value, index) => bytes[index] !== value)) {
    throw new Error('frame bundle binary envelope is malformed')
  }
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(MAGIC.byteLength, true)
  if (headerLength < 2 || headerLength > MAX_HEADER_BYTES || FIXED_HEADER_BYTES + headerLength > bytes.byteLength) {
    throw new Error('frame bundle binary header is outside the admitted bound')
  }
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(FIXED_HEADER_BYTES, FIXED_HEADER_BYTES + headerLength))) } catch {
    throw new Error('frame bundle binary header is not valid UTF-8 JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('frame bundle binary header is malformed')
  return { header: parsed as BinaryHeader, offset: FIXED_HEADER_BYTES + headerLength }
}

export async function decodeXrV2CrossDeviceFrameBundle(
  bytes: Uint8Array,
  expectedContentHash: string,
  signal?: AbortSignal,
): Promise<XrV2StoredCaptureFrameBundle> {
  throwIfAborted(signal)
  if (!HASH.test(expectedContentHash) || await sha256XrV2CrossDeviceBytes(bytes, signal) !== expectedContentHash) {
    throw new Error('frame bundle SHA-256 does not match its committed manifest')
  }
  const parsed = parseHeader(bytes)
  const source = parsed.header
  const sessionId = portableId(source.session_id, 'frame bundle sessionId')
  if (source.schema !== XR_V2_FRAME_BUNDLE_BINARY_SCHEMA
    || source.bundle_schema !== 'agentic-graph-xr-v2-capture-frame-bundle/v1'
    || !Array.isArray(source.frames)
    || source.frames.length < 1
    || source.frames.length > XR_V2_MAX_PERSISTED_CAPTURE_FRAMES) {
    throw new Error('frame bundle binary identity is malformed')
  }
  let offset = parsed.offset
  const seen = new Set<number>()
  const frames = source.frames.map(item => {
    throwIfAborted(signal)
    const frameIndex = boundedInteger(item.frame_index, 'frame index')
    if (seen.has(frameIndex)) throw new Error('frame bundle contains a duplicate frame index')
    seen.add(frameIndex)
    const width = boundedDimension(item.rgba?.width, 'RGBA width')
    const height = boundedDimension(item.rgba?.height, 'RGBA height')
    const rgbaLength = boundedInteger(item.rgba?.byte_length, 'RGBA byte length')
    if (rgbaLength !== width * height * 4 || offset + rgbaLength > bytes.byteLength) {
      throw new Error('RGBA payload does not match its binary header')
    }
    const rgba = new Uint8ClampedArray(bytes.subarray(offset, offset + rgbaLength).slice().buffer)
    offset += rgbaLength
    const estimate = item.depth ? (() => {
      const depthWidth = boundedDimension(item.depth.width, 'depth width')
      const depthHeight = boundedDimension(item.depth.height, 'depth height')
      const depthLength = boundedInteger(item.depth.byte_length, 'depth byte length')
      const confidence = Number(item.depth.confidence)
      if (depthLength !== depthWidth * depthHeight * 4 || offset + depthLength > bytes.byteLength
        || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('depth payload does not match its binary header')
      }
      const values = decodeFloat32LittleEndian(bytes.subarray(offset, offset + depthLength))
      offset += depthLength
      return Object.freeze({
        confidence,
        depth: Object.freeze({ width: depthWidth, height: depthHeight, values }),
      })
    })() : null
    return Object.freeze({
      frameIndex,
      capturedAtMs: boundedNumber(item.captured_at_ms, 'capture timestamp'),
      frame: Object.freeze({ width, height, data: rgba }),
      estimate,
    })
  })
  if (offset !== bytes.byteLength) throw new Error('frame bundle binary envelope has trailing bytes')
  frames.sort((left, right) => left.frameIndex - right.frameIndex)
  return Object.freeze({
    schema: source.bundle_schema,
    sessionId,
    snapshot: snapshot(source.snapshot, sessionId),
    frames: Object.freeze(frames),
    createdAtMs: boundedInteger(source.created_at_ms, 'bundle creation timestamp'),
  })
}
