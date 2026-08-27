import { hashText } from '@/features/parsers/hash'

export type XrAssetCostLog = {
  model: string
  prompt_tokens: number
  completion_tokens: number
  cache_hits: number
  estimated_cost_usd: number
}

export type XrPngToSvgMode = 'auto' | 'color' | 'bw'
export type XrPngToSvgTool = 'vtracer' | 'potrace'

export type XrPngToSvgCommand = {
  tool: 'vtracer' | 'potrace' | 'magick'
  args: string[]
}

export type XrPngToSvgCommandResult = {
  ok: boolean
  stdout?: string
  stderr?: string
}

export type XrPngToSvgHarnessArgs = {
  sourceName: string
  sourceMime?: string | null
  inputPath: string
  outputPath: string
  bytes?: Uint8Array | ArrayBuffer | null
  byteLength?: number | null
  mode?: XrPngToSvgMode
  maxInputBytes?: number
  maxOutputBytes?: number
  maxPaths?: number
  scratchBitmapPath?: string
  runCommand: (command: XrPngToSvgCommand) => Promise<XrPngToSvgCommandResult>
  readText: (path: string) => Promise<string>
}

export type XrPngToSvgHarnessResult = {
  status: 'converted' | 'fallback'
  tool: XrPngToSvgTool | null
  artifactPath?: string
  svgText?: string
  pathCount: number
  fallbackReason?: string
  costLog: XrAssetCostLog
  commands: XrPngToSvgCommand[]
}

export type XrSvgToGlbInspectReport = {
  byteLength: number
  drawCalls: number
  triangleCount: number
  vertexCount: number
  sourceFormat: 'svg' | 'png'
  sourceHash: string
  sourceWidth: number
  sourceHeight: number
  costLog: XrAssetCostLog
}

export type XrSvgToGlbCompileResult = {
  glb: ArrayBuffer
  inspect: XrSvgToGlbInspectReport
}

export type XrGltfCompileResult = {
  text: string
  inspect: XrSvgToGlbInspectReport
}

const DEFAULT_MAX_PNG_INPUT_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_SVG_OUTPUT_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_SVG_PATHS = 1800
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function buildXrAssetZeroCostLog(): XrAssetCostLog {
  return {
    model: 'none',
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_hits: 0,
    estimated_cost_usd: 0,
  }
}

function toBytes(input: Uint8Array | ArrayBuffer | null | undefined): Uint8Array | null {
  if (!input) return null
  return input instanceof Uint8Array ? input : new Uint8Array(input)
}

function hasPngSignature(bytes: Uint8Array | null): boolean | null {
  if (!bytes) return null
  if (bytes.byteLength < PNG_SIGNATURE.length) return false
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false
  }
  return true
}

function normalizeExt(name: string): string {
  const lower = String(name || '').trim().toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot) : ''
}

function isPngSource(name: string, mime?: string | null): boolean {
  const type = String(mime || '').toLowerCase().split(';')[0].trim()
  return normalizeExt(name) === '.png' || type === 'image/png'
}

function choosePngToSvgTool(mode: XrPngToSvgMode): XrPngToSvgTool {
  return mode === 'bw' ? 'potrace' : 'vtracer'
}

function countSvgPaths(svgText: string): number {
  const text = String(svgText || '')
  const pathMatches = text.match(/<path(?:\s|>|\/)/gi)?.length || 0
  const shapeMatches = text.match(/<(?:rect|circle|ellipse|polygon|polyline|line)(?:\s|>|\/)/gi)?.length || 0
  return pathMatches + shapeMatches
}

function fallback(args: {
  tool: XrPngToSvgTool | null
  reason: string
  commands?: XrPngToSvgCommand[]
  pathCount?: number
}): XrPngToSvgHarnessResult {
  return {
    status: 'fallback',
    tool: args.tool,
    pathCount: Math.max(0, Number(args.pathCount || 0)),
    fallbackReason: args.reason,
    costLog: buildXrAssetZeroCostLog(),
    commands: args.commands || [],
  }
}

function validateSvgArtifact(args: {
  svgText: string
  tool: XrPngToSvgTool
  outputPath: string
  maxOutputBytes: number
  maxPaths: number
  commands: XrPngToSvgCommand[]
}): XrPngToSvgHarnessResult {
  const svgText = String(args.svgText || '').trim()
  const outputBytes = new TextEncoder().encode(svgText).byteLength
  if (!/<svg(?:\s|>)/i.test(svgText)) {
    return fallback({ tool: args.tool, reason: 'svg-missing-root', commands: args.commands })
  }
  if (outputBytes > args.maxOutputBytes) {
    return fallback({ tool: args.tool, reason: 'svg-output-too-large', commands: args.commands })
  }
  const pathCount = countSvgPaths(svgText)
  if (pathCount > args.maxPaths) {
    return fallback({ tool: args.tool, reason: 'svg-path-budget-exceeded', commands: args.commands, pathCount })
  }
  return {
    status: 'converted',
    tool: args.tool,
    artifactPath: args.outputPath,
    svgText,
    pathCount,
    costLog: buildXrAssetZeroCostLog(),
    commands: args.commands,
  }
}

function deriveScratchBitmapPath(outputPath: string): string {
  const raw = String(outputPath || '').trim()
  if (!raw) return 'xr-vectorize-input.pbm'
  return /\.svg$/i.test(raw) ? raw.replace(/\.svg$/i, '.pbm') : `${raw}.pbm`
}

export async function convertPngToSvgWithFossHarness(args: XrPngToSvgHarnessArgs): Promise<XrPngToSvgHarnessResult> {
  const sourceName = String(args.sourceName || '').trim()
  const inputPath = String(args.inputPath || '').trim()
  const outputPath = String(args.outputPath || '').trim()
  const mode = args.mode || 'auto'
  const maxInputBytes = Math.max(1, Number(args.maxInputBytes || DEFAULT_MAX_PNG_INPUT_BYTES))
  const maxOutputBytes = Math.max(1, Number(args.maxOutputBytes || DEFAULT_MAX_SVG_OUTPUT_BYTES))
  const maxPaths = Math.max(1, Number(args.maxPaths || DEFAULT_MAX_SVG_PATHS))
  const bytes = toBytes(args.bytes || null)
  const byteLength = Math.max(0, Number(args.byteLength ?? bytes?.byteLength ?? 0))
  const tool = choosePngToSvgTool(mode)

  if (!sourceName || !isPngSource(sourceName, args.sourceMime)) return fallback({ tool: null, reason: 'not-png' })
  if (!inputPath || !outputPath) return fallback({ tool, reason: 'missing-path' })
  if (byteLength > maxInputBytes) return fallback({ tool, reason: 'input-too-large' })
  const signature = hasPngSignature(bytes)
  if (signature === false) return fallback({ tool, reason: 'invalid-png-signature' })

  const commands: XrPngToSvgCommand[] = []
  const run = async (command: XrPngToSvgCommand): Promise<XrPngToSvgCommandResult> => {
    commands.push(command)
    try {
      return await args.runCommand(command)
    } catch (e) {
      return { ok: false, stderr: String((e as { message?: unknown })?.message ?? e) }
    }
  }

  if (tool === 'vtracer') {
    const command = {
      tool: 'vtracer' as const,
      args: ['--input', inputPath, '--output', outputPath, '--colormode', 'color'],
    }
    const result = await run(command)
    if (!result.ok) return fallback({ tool, reason: 'vtracer-failed', commands })
  } else {
    const bitmapPath = String(args.scratchBitmapPath || '').trim() || deriveScratchBitmapPath(outputPath)
    const preprocess = await run({
      tool: 'magick',
      args: [inputPath, '-alpha', 'remove', '-colorspace', 'Gray', '-threshold', '50%', bitmapPath],
    })
    if (!preprocess.ok) return fallback({ tool, reason: 'bitmap-preprocess-failed', commands })
    const traced = await run({ tool: 'potrace', args: ['-s', bitmapPath, '-o', outputPath] })
    if (!traced.ok) return fallback({ tool, reason: 'potrace-failed', commands })
  }

  let svgText = ''
  try {
    svgText = await args.readText(outputPath)
  } catch (e) {
    return fallback({ tool, reason: `svg-read-failed:${String((e as { message?: unknown })?.message ?? e)}`, commands })
  }
  return validateSvgArtifact({ svgText, tool, outputPath, maxOutputBytes, maxPaths, commands })
}

function parseDimension(raw: unknown): number | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const match = /^(-?\d+(?:\.\d+)?)/.exec(text)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function resolveSvgViewport(svgText: string): { width: number; height: number } {
  const text = String(svgText || '')
  const viewBox = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(text)?.[1] || ''
  const parts = viewBox.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite)
  if (parts.length >= 4 && parts[2]! > 0 && parts[3]! > 0) {
    return { width: Math.abs(parts[2]!), height: Math.abs(parts[3]!) }
  }
  const width = parseDimension(/\bwidth\s*=\s*["']([^"']+)["']/i.exec(text)?.[1])
  const height = parseDimension(/\bheight\s*=\s*["']([^"']+)["']/i.exec(text)?.[1])
  return { width: width || 100, height: height || 100 }
}

function validateSafeSvg(svgText: string): string | null {
  const text = String(svgText || '').trim()
  if (!/<svg(?:\s|>)/i.test(text)) return 'svg-missing-root'
  if (/<(?:script|foreignObject)(?:\s|>)/i.test(text)) return 'svg-unsafe-element'
  if (/\son[a-z]+\s*=/i.test(text)) return 'svg-unsafe-handler'
  if (/javascript:/i.test(text)) return 'svg-unsafe-url'
  return null
}

function align4(value: number): number {
  return (value + 3) & ~3
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function padBytes(bytes: Uint8Array, padByte: number): Uint8Array {
  const paddedLength = align4(bytes.byteLength)
  if (paddedLength === bytes.byteLength) return bytes
  const out = new Uint8Array(paddedLength)
  out.set(bytes)
  out.fill(padByte, bytes.byteLength)
  return out
}

function float32Bytes(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4)
  const view = new DataView(out.buffer)
  values.forEach((value, index) => view.setFloat32(index * 4, value, true))
  return out
}

function uint16Bytes(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2)
  const view = new DataView(out.buffer)
  values.forEach((value, index) => view.setUint16(index * 2, value, true))
  return out
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return out
}

function chunkHeader(length: number, type: number): Uint8Array {
  const out = new Uint8Array(8)
  const view = new DataView(out.buffer)
  view.setUint32(0, length, true)
  view.setUint32(4, type, true)
  return out
}

function glbHeader(length: number): Uint8Array {
  const out = new Uint8Array(12)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, length, true)
  return out
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...Array.from(chunk))
  }
  return btoa(binary)
}

function hashBytes(bytes: Uint8Array): string {
  return hashText(bytesToBase64(bytes))
}

function readPngDimension(bytes: Uint8Array | null): { width: number; height: number } | null {
  if (!bytes || bytes.byteLength < 24) return null
  if (hasPngSignature(bytes) !== true) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { width, height }
}

function buildPlaneModelPayload(args: {
  sourceFormat: 'svg' | 'png'
  sourceName: string
  sourceHash: string
  sourceWidth: number
  sourceHeight: number
  targetMaxDimension?: number
  textureBytes?: Uint8Array | null
  textureMimeType?: string
}): { json: Record<string, unknown>; bin: Uint8Array; binUnpaddedLength: number; inspectBase: Omit<XrSvgToGlbInspectReport, 'byteLength'> } {
  const targetMaxDimension = Math.max(0.1, Number(args.targetMaxDimension || 2))
  const sourceWidth = Math.max(1, Number(args.sourceWidth || 100))
  const sourceHeight = Math.max(1, Number(args.sourceHeight || 100))
  const scale = targetMaxDimension / Math.max(sourceWidth, sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  const halfW = width / 2
  const halfH = height / 2
  const positions = float32Bytes([
    -halfW, 0, -halfH,
    halfW, 0, -halfH,
    halfW, 0, halfH,
    -halfW, 0, halfH,
  ])
  const normals = float32Bytes([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ])
  const texCoords = float32Bytes([
    0, 1,
    1, 1,
    1, 0,
    0, 0,
  ])
  const indices = uint16Bytes([0, 1, 2, 0, 2, 3])
  const textureBytes = args.textureBytes && args.textureBytes.byteLength > 0 ? cloneBytes(args.textureBytes) : null
  const textureMimeType = String(args.textureMimeType || '').trim() || 'image/png'
  const positionOffset = 0
  const normalOffset = align4(positionOffset + positions.byteLength)
  const texCoordOffset = align4(normalOffset + normals.byteLength)
  const indexOffset = align4(texCoordOffset + texCoords.byteLength)
  const textureOffset = textureBytes ? align4(indexOffset + indices.byteLength) : 0
  const binUnpaddedLength = textureBytes ? textureOffset + textureBytes.byteLength : indexOffset + indices.byteLength
  const bin = new Uint8Array(align4(binUnpaddedLength))
  bin.set(positions, positionOffset)
  bin.set(normals, normalOffset)
  bin.set(texCoords, texCoordOffset)
  bin.set(indices, indexOffset)
  if (textureBytes) bin.set(textureBytes, textureOffset)
  const material = textureBytes
    ? {
        name: `XR ${args.sourceFormat.toUpperCase()} source texture plane`,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0, texCoord: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.74,
        },
        doubleSided: true,
      }
    : {
        name: `XR ${args.sourceFormat.toUpperCase()} source plane`,
        pbrMetallicRoughness: {
          baseColorFactor: args.sourceFormat === 'png' ? [0.9, 0.92, 0.95, 1] : [0.2, 0.55, 0.9, 1],
          metallicFactor: 0,
          roughnessFactor: 0.74,
        },
        doubleSided: true,
      }
  const bufferViews: Array<Record<string, unknown>> = [
    { buffer: 0, byteOffset: positionOffset, byteLength: positions.byteLength, target: 34962 },
    { buffer: 0, byteOffset: normalOffset, byteLength: normals.byteLength, target: 34962 },
    { buffer: 0, byteOffset: texCoordOffset, byteLength: texCoords.byteLength, target: 34962 },
    { buffer: 0, byteOffset: indexOffset, byteLength: indices.byteLength, target: 34963 },
  ]
  if (textureBytes) bufferViews.push({ buffer: 0, byteOffset: textureOffset, byteLength: textureBytes.byteLength })
  const json = {
    asset: {
      version: '2.0',
      generator: 'agenticgraph-xr-asset-conversion',
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{
      mesh: 0,
      name: String(args.sourceName || `${args.sourceFormat}-xr-model`),
      extras: {
        sourceFormat: args.sourceFormat,
        sourceName: String(args.sourceName || ''),
        sourceHash: args.sourceHash,
        sourceWidth,
        sourceHeight,
      },
    }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    materials: [material],
    ...(textureBytes
      ? {
          samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }],
          textures: [{ sampler: 0, source: 0 }],
          images: [{ bufferView: 4, mimeType: textureMimeType, name: String(args.sourceName || 'source.png') }],
        }
      : {}),
    buffers: [{ byteLength: binUnpaddedLength }],
    bufferViews,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [-halfW, 0, -halfH],
        max: [halfW, 0, halfH],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [0, 1, 0],
        max: [0, 1, 0],
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: 4,
        type: 'VEC2',
        min: [0, 0],
        max: [1, 1],
      },
      {
        bufferView: 3,
        componentType: 5123,
        count: 6,
        type: 'SCALAR',
        min: [0],
        max: [3],
      },
    ],
  }
  return {
    json,
    bin,
    binUnpaddedLength,
    inspectBase: {
      drawCalls: 1,
      triangleCount: 2,
      vertexCount: 4,
      sourceFormat: args.sourceFormat,
      sourceHash: args.sourceHash,
      sourceWidth,
      sourceHeight,
      costLog: buildXrAssetZeroCostLog(),
    },
  }
}

function buildGlbFromPlanePayload(payload: ReturnType<typeof buildPlaneModelPayload>): XrSvgToGlbCompileResult {
  const jsonBytes = padBytes(new TextEncoder().encode(JSON.stringify(payload.json)), 0x20)
  const binBytes = padBytes(payload.bin, 0x00)
  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binBytes.byteLength
  const glbBytes = concatBytes([
    glbHeader(totalLength),
    chunkHeader(jsonBytes.byteLength, 0x4e4f534a),
    jsonBytes,
    chunkHeader(binBytes.byteLength, 0x004e4942),
    binBytes,
  ])
  return {
    glb: bytesToArrayBuffer(glbBytes),
    inspect: {
      byteLength: glbBytes.byteLength,
      ...payload.inspectBase,
    },
  }
}

function buildGltfFromPlanePayload(payload: ReturnType<typeof buildPlaneModelPayload>): XrGltfCompileResult {
  const binBytes = padBytes(payload.bin, 0x00)
  const json = {
    ...payload.json,
    buffers: [{
      byteLength: binBytes.byteLength,
      uri: `data:application/octet-stream;base64,${bytesToBase64(binBytes)}`,
    }],
  }
  const text = JSON.stringify(json)
  return {
    text,
    inspect: {
      byteLength: new TextEncoder().encode(text).byteLength,
      ...payload.inspectBase,
    },
  }
}

export function compileSvgToXrGlb(args: {
  svgText: string
  sourceName: string
  targetMaxDimension?: number
}): XrSvgToGlbCompileResult {
  const svgText = String(args.svgText || '')
  const unsafe = validateSafeSvg(svgText)
  if (unsafe) throw new Error(unsafe)
  const viewport = resolveSvgViewport(svgText)
  const sourceHash = hashText(svgText)
  return buildGlbFromPlanePayload(buildPlaneModelPayload({
    sourceFormat: 'svg',
    sourceName: args.sourceName,
    sourceHash,
    sourceWidth: viewport.width,
    sourceHeight: viewport.height,
    targetMaxDimension: args.targetMaxDimension,
  }))
}

export function compileSvgToXrGltf(args: {
  svgText: string
  sourceName: string
  targetMaxDimension?: number
}): XrGltfCompileResult {
  const svgText = String(args.svgText || '')
  const unsafe = validateSafeSvg(svgText)
  if (unsafe) throw new Error(unsafe)
  const viewport = resolveSvgViewport(svgText)
  return buildGltfFromPlanePayload(buildPlaneModelPayload({
    sourceFormat: 'svg',
    sourceName: args.sourceName,
    sourceHash: hashText(svgText),
    sourceWidth: viewport.width,
    sourceHeight: viewport.height,
    targetMaxDimension: args.targetMaxDimension,
  }))
}

export function compilePngToXrGlb(args: {
  bytes: Uint8Array | ArrayBuffer
  sourceName: string
  targetMaxDimension?: number
}): XrSvgToGlbCompileResult {
  const bytes = toBytes(args.bytes)
  if (hasPngSignature(bytes) !== true) throw new Error('invalid-png-signature')
  const dimensions = readPngDimension(bytes) || { width: 100, height: 100 }
  return buildGlbFromPlanePayload(buildPlaneModelPayload({
    sourceFormat: 'png',
    sourceName: args.sourceName,
    sourceHash: hashBytes(bytes!),
    sourceWidth: dimensions.width,
    sourceHeight: dimensions.height,
    targetMaxDimension: args.targetMaxDimension,
    textureBytes: bytes,
    textureMimeType: 'image/png',
  }))
}

export function compilePngToXrGltf(args: {
  bytes: Uint8Array | ArrayBuffer
  sourceName: string
  targetMaxDimension?: number
}): XrGltfCompileResult {
  const bytes = toBytes(args.bytes)
  if (hasPngSignature(bytes) !== true) throw new Error('invalid-png-signature')
  const dimensions = readPngDimension(bytes) || { width: 100, height: 100 }
  return buildGltfFromPlanePayload(buildPlaneModelPayload({
    sourceFormat: 'png',
    sourceName: args.sourceName,
    sourceHash: hashBytes(bytes!),
    sourceWidth: dimensions.width,
    sourceHeight: dimensions.height,
    targetMaxDimension: args.targetMaxDimension,
    textureBytes: bytes,
    textureMimeType: 'image/png',
  }))
}
