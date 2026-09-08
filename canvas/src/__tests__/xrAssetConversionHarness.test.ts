import { PNG_SIGNATURE_BYTES, PNG_WITH_IHDR_BYTES } from './fixtures/pngHeaderFixture'
import { parseGlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import { inspectGlbBytes, inspectGltfJson } from '@/lib/assets/gltfFormat'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import {
  buildXrAssetZeroCostLog,
  compilePngToXrGlb,
  compilePngToXrGltf,
  compileSvgToXrGlb,
  convertPngToSvgWithFossHarness,
  type XrPngToSvgCommand,
} from '@/lib/xr/xrAssetConversion'
import { buildXrSvgGlbAssetMarkdown } from '@/features/markdown-workspace/workspaceImport/xrModelAsset'
import {
  importWorkspaceLocalFiles,
  importWorkspaceUrl,
  setXrImageWorkspaceArtifactMirrorForTests,
  XR_IMAGE_MODEL_WORKSPACE_ROOT,
} from '@/features/markdown-workspace/workspaceImport'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

function createTextFile(name: string, text: string, type = 'text/plain'): File {
  const blob = new Blob([text], { type })
  return new File([blob], name, { type })
}

function assertZeroCost(costLog: ReturnType<typeof buildXrAssetZeroCostLog>): void {
  if (
    costLog.model !== 'none'
    || costLog.prompt_tokens !== 0
    || costLog.completion_tokens !== 0
    || costLog.cache_hits !== 0
    || costLog.estimated_cost_usd !== 0
  ) {
    throw new Error(`expected zero-cost deterministic conversion log, got ${JSON.stringify(costLog)}`)
  }
}

function bytesFromArrayBuffer(buffer: ArrayBuffer | Uint8Array): Uint8Array {
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function assertBytesEqual(actual: Uint8Array | null, expected: Uint8Array, label: string): void {
  if (!actual) throw new Error(`expected ${label} bytes to be present`)
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`expected ${label} byte length ${expected.byteLength}, got ${actual.byteLength}`)
  }
  for (let i = 0; i < expected.byteLength; i += 1) {
    if (actual[i] !== expected[i]) throw new Error(`expected ${label} byte ${i} to match source PNG`)
  }
}

function extractGlbEmbeddedImageBytes(buffer: ArrayBuffer | Uint8Array): Uint8Array | null {
  const bytes = bytesFromArrayBuffer(buffer)
  if (bytes.byteLength < 20) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  let json: Record<string, unknown> | null = null
  let bin: Uint8Array | null = null
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkLength
    if (chunkEnd > bytes.byteLength) return null
    const chunk = bytes.subarray(chunkStart, chunkEnd)
    if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk).replace(/[\u0020]+$/g, '')) as Record<string, unknown>
    if (chunkType === 0x004e4942) bin = chunk
    offset = chunkEnd
  }
  if (!json || !bin) return null
  const images = Array.isArray(json.images) ? json.images as Array<Record<string, unknown>> : []
  const bufferViews = Array.isArray(json.bufferViews) ? json.bufferViews as Array<Record<string, unknown>> : []
  const image = images[0]
  if (!image || image.mimeType !== 'image/png') return null
  const bufferViewIndex = Number(image.bufferView)
  const bufferView = Number.isFinite(bufferViewIndex) ? bufferViews[bufferViewIndex] : null
  if (!bufferView) return null
  const byteOffset = Math.max(0, Number(bufferView.byteOffset || 0))
  const byteLength = Math.max(0, Number(bufferView.byteLength || 0))
  return bin.subarray(byteOffset, byteOffset + byteLength)
}

function extractGltfEmbeddedImageBytes(text: string): Uint8Array | null {
  const json = JSON.parse(text) as Record<string, unknown>
  const buffers = Array.isArray(json.buffers) ? json.buffers as Array<Record<string, unknown>> : []
  const bufferViews = Array.isArray(json.bufferViews) ? json.bufferViews as Array<Record<string, unknown>> : []
  const images = Array.isArray(json.images) ? json.images as Array<Record<string, unknown>> : []
  const uri = typeof buffers[0]?.uri === 'string' ? buffers[0].uri : ''
  const comma = uri.indexOf(',')
  if (!uri.startsWith('data:application/octet-stream;base64,') || comma < 0) return null
  const bin = decodeBase64Bytes(uri.slice(comma + 1))
  const image = images[0]
  if (!image || image.mimeType !== 'image/png') return null
  const bufferViewIndex = Number(image.bufferView)
  const bufferView = Number.isFinite(bufferViewIndex) ? bufferViews[bufferViewIndex] : null
  if (!bufferView) return null
  const byteOffset = Math.max(0, Number(bufferView.byteOffset || 0))
  const byteLength = Math.max(0, Number(bufferView.byteLength || 0))
  return bin.subarray(byteOffset, byteOffset + byteLength)
}

function readGltfAccessorBounds(text: string, accessorIndex: number): { min: number[]; max: number[] } {
  const json = JSON.parse(text) as Record<string, unknown>
  const accessors = Array.isArray(json.accessors) ? json.accessors as Array<Record<string, unknown>> : []
  const accessor = accessors[accessorIndex]
  if (!accessor) throw new Error(`expected accessor ${accessorIndex} to exist`)
  const min = Array.isArray(accessor.min) ? accessor.min.map(Number) : []
  const max = Array.isArray(accessor.max) ? accessor.max.map(Number) : []
  return { min, max }
}

function assertNumberArrayClose(actual: number[], expected: number[], label: string): void {
  if (actual.length !== expected.length) {
    throw new Error(`expected ${label} length ${expected.length}, got ${actual.length}`)
  }
  for (let i = 0; i < expected.length; i += 1) {
    const a = Number(actual[i])
    const e = Number(expected[i])
    if (!Number.isFinite(a) || Math.abs(a - e) > 1e-6) {
      throw new Error(`expected ${label}[${i}] to be ${e}, got ${a}`)
    }
  }
}

export async function testXrPngToSvgHarnessUsesVTracerAndZeroTokenCost() {
  const commands: XrPngToSvgCommand[] = []
  const result = await convertPngToSvgWithFossHarness({
    sourceName: 'diagram.png',
    sourceMime: 'image/png',
    inputPath: '/tmp/diagram.png',
    outputPath: '/tmp/diagram.svg',
    bytes: PNG_SIGNATURE_BYTES,
    mode: 'auto',
    runCommand: async command => {
      commands.push(command)
      return { ok: true }
    },
    readText: async () => '<svg viewBox="0 0 24 12"><path d="M0 0h24v12H0z"/></svg>',
  })

  if (result.status !== 'converted') throw new Error(`expected PNG harness to convert, got ${result.status}`)
  if (result.tool !== 'vtracer') throw new Error(`expected VTracer for color/auto PNG conversion, got ${String(result.tool)}`)
  if (result.pathCount !== 1) throw new Error(`expected one SVG path, got ${result.pathCount}`)
  if (commands.length !== 1 || commands[0]!.tool !== 'vtracer') {
    throw new Error(`expected one vtracer command, got ${JSON.stringify(commands)}`)
  }
  if (result.commands.length !== 1 || result.commands[0]!.tool !== 'vtracer') {
    throw new Error(`expected returned command log to contain vtracer, got ${JSON.stringify(result.commands)}`)
  }
  assertZeroCost(result.costLog)
}

export async function testXrPngToSvgHarnessFallsBackBeforeToolExecution() {
  const commands: XrPngToSvgCommand[] = []
  const invalid = await convertPngToSvgWithFossHarness({
    sourceName: 'bad.png',
    sourceMime: 'image/png',
    inputPath: '/tmp/bad.png',
    outputPath: '/tmp/bad.svg',
    bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    runCommand: async command => {
      commands.push(command)
      return { ok: true }
    },
    readText: async () => '<svg/>',
  })
  if (invalid.status !== 'fallback' || invalid.fallbackReason !== 'invalid-png-signature') {
    throw new Error(`expected invalid PNG signature fallback, got ${JSON.stringify(invalid)}`)
  }
  if (commands.length !== 0) throw new Error('expected invalid PNG to stop before command execution')
  assertZeroCost(invalid.costLog)

  const oversized = await convertPngToSvgWithFossHarness({
    sourceName: 'large.png',
    sourceMime: 'image/png',
    inputPath: '/tmp/large.png',
    outputPath: '/tmp/large.svg',
    byteLength: 1024,
    maxInputBytes: 16,
    runCommand: async command => {
      commands.push(command)
      return { ok: true }
    },
    readText: async () => '<svg/>',
  })
  if (oversized.status !== 'fallback' || oversized.fallbackReason !== 'input-too-large') {
    throw new Error(`expected oversized PNG fallback, got ${JSON.stringify(oversized)}`)
  }
  if (commands.length !== 0) throw new Error('expected oversized PNG to stop before command execution')
  assertZeroCost(oversized.costLog)
}

export async function testXrPngToSvgHarnessFallsBackForPathBudget() {
  const result = await convertPngToSvgWithFossHarness({
    sourceName: 'dense.png',
    sourceMime: 'image/png',
    inputPath: '/tmp/dense.png',
    outputPath: '/tmp/dense.svg',
    bytes: PNG_SIGNATURE_BYTES,
    maxPaths: 1,
    runCommand: async () => ({ ok: true }),
    readText: async () => '<svg viewBox="0 0 8 8"><path d="M0 0h8"/><rect width="8" height="8"/></svg>',
  })
  if (result.status !== 'fallback' || result.fallbackReason !== 'svg-path-budget-exceeded') {
    throw new Error(`expected path budget fallback, got ${JSON.stringify(result)}`)
  }
  if (result.pathCount !== 2) throw new Error(`expected two counted SVG paths/shapes, got ${result.pathCount}`)
  assertZeroCost(result.costLog)
}

export function testXrPngToGlbAndGltfEmbedSourceTextureFidelity() {
  const glb = compilePngToXrGlb({
    sourceName: 'source.png',
    bytes: PNG_WITH_IHDR_BYTES,
  })
  const gltf = compilePngToXrGltf({
    sourceName: 'source.png',
    bytes: PNG_WITH_IHDR_BYTES,
  })
  const glbInspection = inspectGlbBytes(glb.glb)
  const gltfInspection = inspectGltfJson(gltf.text)
  if (!glbInspection.validMagic || !glbInspection.validContainer || !glbInspection.validGltfAsset) {
    throw new Error(`expected textured PNG GLB to inspect as valid, got ${JSON.stringify(glbInspection)}`)
  }
  if (!gltfInspection.validJson || !gltfInspection.validGltfAsset) {
    throw new Error(`expected textured PNG GLTF to inspect as valid, got ${JSON.stringify(gltfInspection)}`)
  }
  assertBytesEqual(extractGlbEmbeddedImageBytes(glb.glb), PNG_WITH_IHDR_BYTES, 'GLB embedded PNG texture')
  assertBytesEqual(extractGltfEmbeddedImageBytes(gltf.text), PNG_WITH_IHDR_BYTES, 'GLTF embedded PNG texture')
}

export function testXrGeneratedImageModelUsesCenteredXyzCoordinates() {
  const gltf = compilePngToXrGltf({
    sourceName: 'source.png',
    bytes: PNG_WITH_IHDR_BYTES,
    targetMaxDimension: 2,
  })
  const json = JSON.parse(gltf.text) as Record<string, unknown>
  const nodes = Array.isArray(json.nodes) ? json.nodes as Array<Record<string, unknown>> : []
  const node = nodes[0] || {}
  if (Object.prototype.hasOwnProperty.call(node, 'translation')) {
    throw new Error('expected generated XR image model node to stay centered without translation offsets')
  }
  if (Object.prototype.hasOwnProperty.call(node, 'rotation')) {
    throw new Error('expected generated XR image model node to avoid hidden rotation-axis compensation')
  }

  const positionBounds = readGltfAccessorBounds(gltf.text, 0)
  assertNumberArrayClose(positionBounds.min, [-1, 0, -0.5], 'generated XR POSITION min XYZ')
  assertNumberArrayClose(positionBounds.max, [1, 0, 0.5], 'generated XR POSITION max XYZ')

  const normalBounds = readGltfAccessorBounds(gltf.text, 1)
  assertNumberArrayClose(normalBounds.min, [0, 1, 0], 'generated XR NORMAL min XYZ')
  assertNumberArrayClose(normalBounds.max, [0, 1, 0], 'generated XR NORMAL max XYZ')
}

export function testXrSvgToGlbCompilerRejectsUnsafeSvg() {
  try {
    compileSvgToXrGlb({
      sourceName: 'unsafe.svg',
      svgText: '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>',
    })
  } catch (e) {
    if (String((e as { message?: unknown })?.message || e) !== 'svg-unsafe-element') {
      throw new Error(`expected unsafe SVG element rejection, got ${String((e as { message?: unknown })?.message || e)}`)
    }
    return
  }
  throw new Error('expected unsafe SVG to be rejected before GLB compile')
}

export function testXrSvgToGlbCompilerProducesValidXrManifest() {
  const result = buildXrSvgGlbAssetMarkdown({
    sourceName: 'diagram.svg',
    svgText: '<svg viewBox="0 0 24 12"><rect width="24" height="12"/></svg>',
    targetMaxDimension: 2,
  })
  if (!result.markdown.includes('kgAssetFormat: "glb"')) throw new Error('expected XR SVG compile manifest to declare GLB format')
  if (!result.markdown.includes('kgCanvasSurfaceMode: "xr"')) throw new Error('expected XR SVG compile manifest to activate XR surface mode')
  if (!result.markdown.includes('kgAssetXrSourceFormat: "svg"')) throw new Error('expected XR SVG source provenance in manifest metadata')
  if (!result.markdown.includes('kgAssetXrPromptTokens: 0')) throw new Error('expected zero prompt-token metadata in XR manifest')
  if (!result.markdown.includes('kgAssetXrCompletionTokens: 0')) throw new Error('expected zero completion-token metadata in XR manifest')

  const asset = parseGlbAssetDocument(result.markdown)
  if (!asset) throw new Error('expected generated XR GLB manifest to parse as a model asset')
  if (asset.name !== 'diagram.glb') throw new Error(`expected generated GLB name diagram.glb, got ${asset.name}`)
  if (asset.validMagic !== true || asset.validContainer !== true || asset.validGltfAsset !== true) {
    throw new Error('expected generated XR GLB manifest to record a valid glTF binary asset')
  }

  const inspection = inspectGlbBytes(result.glb)
  if (!inspection.validMagic || !inspection.validContainer || !inspection.validGltfAsset || !inspection.validBinReference) {
    throw new Error(`expected generated XR GLB bytes to inspect as valid, got ${JSON.stringify(inspection)}`)
  }
  if (result.inspect.drawCalls !== 1 || result.inspect.triangleCount !== 2 || result.inspect.vertexCount !== 4) {
    throw new Error(`expected deterministic SVG plane inspect metrics, got ${JSON.stringify(result.inspect)}`)
  }
  assertZeroCost(result.inspect.costLog)
}

export async function testXrImageLocalSvgImportCreatesSourceFilesAndModelArtifacts() {
  const { restore } = initJsdomHarness()
  const mirrored = new Map<string, string>()
  const mirroredBytes = new Map<string, Uint8Array>()
  setXrImageWorkspaceArtifactMirrorForTests(async ({ workspacePath, text }) => {
    mirrored.set(workspacePath, text)
    return true
  }, async ({ workspacePath, bytes }) => {
    mirroredBytes.set(workspacePath, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    return true
  })
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const file = createTextFile('diagram.svg', '<svg viewBox="0 0 24 12"><rect width="24" height="12"/></svg>', 'image/svg+xml')
    const res = await importWorkspaceLocalFiles({ fs, files: [file], parentPath: '/' })

    const originalSvg = await file.text()
    if (await fs.readFileText(`${XR_IMAGE_MODEL_WORKSPACE_ROOT}/diagram.svg`) !== originalSvg || mirrored.get(`${XR_IMAGE_MODEL_WORKSPACE_ROOT}/diagram.svg`) !== originalSvg) throw new Error('expected exact authored SVG text in workspace and host mirror')
    const expectedSource = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/diagram.source.md`
    const expectedGlb = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/diagram.glb`
    const expectedGltf = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/diagram.gltf`
    for (const path of [expectedSource, expectedGlb, expectedGltf]) {
      if (!res.createdPaths.includes(path)) throw new Error(`expected local SVG import to create ${path}, got ${res.createdPaths.join(', ')}`)
    }
    if (!mirrored.has(expectedSource)) throw new Error(`expected local SVG import to mirror ${expectedSource} source metadata`)
    if (mirrored.has(expectedGlb)) throw new Error('expected local SVG GLB host artifact to use binary mirror, not markdown text')
    if (!mirroredBytes.has(expectedGlb)) throw new Error(`expected local SVG import to mirror raw GLB bytes at ${expectedGlb}`)
    if (!mirrored.has(expectedGltf)) throw new Error(`expected local SVG import to mirror raw GLTF JSON at ${expectedGltf}`)
    const sourceText = await fs.readFileText(expectedSource)
    if (!sourceText?.includes('XR model artifacts:') || !sourceText.includes(expectedGlb) || !sourceText.includes(expectedGltf) || !sourceText.includes(`${XR_IMAGE_MODEL_WORKSPACE_ROOT}/diagram.svg`)) {
      throw new Error(`expected source metadata to link generated GLB/GLTF artifacts, got ${String(sourceText || '')}`)
    }
    const glbText = await fs.readFileText(expectedGlb)
    const gltfText = await fs.readFileText(expectedGltf)
    const glbAsset = parseGlbAssetDocument(glbText || '')
    const gltfAsset = parseGlbAssetDocument(gltfText || '')
    if (!glbAsset || glbAsset.format !== 'glb' || glbAsset.validContainer !== true || glbAsset.validGltfAsset !== true) {
      throw new Error('expected local SVG import to create a valid XR GLB model manifest')
    }
    if (!gltfAsset || gltfAsset.format !== 'gltf' || gltfAsset.validGltfAsset !== true) {
      throw new Error('expected local SVG import to create a valid XR GLTF model manifest')
    }
    if (!glbText?.includes('kgAssetXrSourceFormat: "svg"') || !gltfText?.includes('kgAssetXrSourceFormat: "svg"')) {
      throw new Error('expected local SVG generated manifests to preserve SVG source provenance')
    }
    const mirroredGlb = inspectGlbBytes(mirroredBytes.get(expectedGlb)!)
    if (!mirroredGlb.validMagic || !mirroredGlb.validContainer || !mirroredGlb.validGltfAsset) {
      throw new Error(`expected local SVG host GLB to be a valid raw GLB, got ${JSON.stringify(mirroredGlb)}`)
    }
    const mirroredGltf = inspectGltfJson(mirrored.get(expectedGltf))
    if (!mirroredGltf.validJson || !mirroredGltf.validGltfAsset || mirroredGltf.embeddedResourceDataUriCount < 1) {
      throw new Error(`expected local SVG host GLTF to be valid raw glTF JSON, got ${JSON.stringify(mirroredGltf)}`)
    }
    const unit = res.corpusManifest?.sourceUnits?.[0]
    if (!unit || unit.mediaKind !== 'image' || unit.status !== 'parsed' || unit.workspacePath !== expectedSource.replace(/^\/+/, '')) {
      throw new Error(`expected local SVG import to register a parsed image Source Files unit, got ${JSON.stringify(unit)}`)
    }
  } finally {
    setXrImageWorkspaceArtifactMirrorForTests(null)
    restore()
  }
}

export async function testXrImageUrlPngImportCreatesSourceFilesAndModelArtifacts() {
  const mirrored = new Map<string, string>()
  const mirroredBytes = new Map<string, Uint8Array>()
  const originalFetch = globalThis.fetch
  setXrImageWorkspaceArtifactMirrorForTests(async ({ workspacePath, text }) => {
    mirrored.set(workspacePath, text)
    return true
  }, async ({ workspacePath, bytes }) => {
    mirroredBytes.set(workspacePath, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    return true
  })
  ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () =>
    new Response(PNG_WITH_IHDR_BYTES.slice(), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })) as typeof fetch
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const res = await importWorkspaceUrl({
      fs,
      urlRaw: 'https://example.com/assets/logo.png',
      parentPath: '/',
    })
    const expectedSource = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/logo.source.md`
    const expectedGlb = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/logo.glb`
    const expectedGltf = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/logo.gltf`
    for (const path of [expectedSource, expectedGlb, expectedGltf]) {
      if (!res.createdPaths.includes(path)) throw new Error(`expected URL PNG import to create ${path}, got ${res.createdPaths.join(', ')}`)
    }
    if (!mirrored.has(expectedSource)) throw new Error(`expected URL PNG import to mirror ${expectedSource} source metadata`)
    if (mirrored.has(expectedGlb)) throw new Error('expected URL PNG GLB host artifact to use binary mirror, not markdown text')
    if (!mirroredBytes.has(expectedGlb)) throw new Error(`expected URL PNG import to mirror raw GLB bytes at ${expectedGlb}`)
    if (!mirrored.has(expectedGltf)) throw new Error(`expected URL PNG import to mirror raw GLTF JSON at ${expectedGltf}`)
    const sourceText = await fs.readFileText(expectedSource)
    if (!sourceText?.includes('Source URL: https://example.com/assets/logo.png')) {
      throw new Error(`expected URL PNG source metadata to preserve source URL, got ${String(sourceText || '')}`)
    }
    const glbText = await fs.readFileText(expectedGlb)
    const gltfText = await fs.readFileText(expectedGltf)
    const glbAsset = parseGlbAssetDocument(glbText || '')
    const gltfAsset = parseGlbAssetDocument(gltfText || '')
    if (!glbAsset || glbAsset.format !== 'glb' || glbAsset.validContainer !== true || glbAsset.validGltfAsset !== true) {
      throw new Error('expected URL PNG import to create a valid XR GLB model manifest')
    }
    if (!gltfAsset || gltfAsset.format !== 'gltf' || gltfAsset.validGltfAsset !== true) {
      throw new Error('expected URL PNG import to create a valid XR GLTF model manifest')
    }
    if (!glbText?.includes('kgAssetXrSourceFormat: "png"') || !gltfText?.includes('kgAssetXrSourceFormat: "png"')) {
      throw new Error('expected URL PNG generated manifests to preserve PNG source provenance')
    }
    const mirroredGlb = inspectGlbBytes(mirroredBytes.get(expectedGlb)!)
    if (!mirroredGlb.validMagic || !mirroredGlb.validContainer || !mirroredGlb.validGltfAsset) {
      throw new Error(`expected URL PNG host GLB to be a valid raw GLB, got ${JSON.stringify(mirroredGlb)}`)
    }
    const mirroredGltf = inspectGltfJson(mirrored.get(expectedGltf))
    if (!mirroredGltf.validJson || !mirroredGltf.validGltfAsset || mirroredGltf.embeddedResourceDataUriCount < 1) {
      throw new Error(`expected URL PNG host GLTF to be valid raw glTF JSON, got ${JSON.stringify(mirroredGltf)}`)
    }
    const unit = res.corpusManifest?.sourceUnits?.[0]
    if (!unit || unit.mediaKind !== 'image' || unit.status !== 'parsed' || unit.workspacePath !== expectedSource.replace(/^\/+/, '')) {
      throw new Error(`expected URL PNG import to register a parsed image Source Files unit, got ${JSON.stringify(unit)}`)
    }
  } finally {
    ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch
    setXrImageWorkspaceArtifactMirrorForTests(null)
  }
}

export async function testXrImageUrlAbsolutePngImportPreservesLocalFilename() {
  const mirrored = new Map<string, string>()
  const mirroredBytes = new Map<string, Uint8Array>()
  const originalFetch = globalThis.fetch
  setXrImageWorkspaceArtifactMirrorForTests(async ({ workspacePath, text }) => {
    mirrored.set(workspacePath, text)
    return true
  }, async ({ workspacePath, bytes }) => {
    mirroredBytes.set(workspacePath, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    return true
  })
  ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () =>
    new Response(PNG_WITH_IHDR_BYTES.slice(), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })) as typeof fetch
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const fixtureName = 'local-fixture-11.png'
    const res = await importWorkspaceUrl({
      fs,
      urlRaw: `/${['tmp', 'xr-validation', fixtureName].join('/')}`,
      parentPath: '/',
    })
    const expectedSource = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/local-fixture-11.source.md`
    const expectedGlb = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/local-fixture-11.glb`
    const expectedGltf = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/local-fixture-11.gltf`
    for (const path of [expectedSource, expectedGlb, expectedGltf]) {
      if (!res.createdPaths.includes(path)) {
        throw new Error(`expected absolute local PNG URL import to preserve basename at ${path}, got ${res.createdPaths.join(', ')}`)
      }
    }
    if (!mirrored.has(expectedSource) || !mirroredBytes.has(expectedGlb) || !mirrored.has(expectedGltf)) {
      throw new Error('expected absolute local PNG URL import to mirror source metadata plus raw GLB/GLTF host artifacts')
    }
    const mirroredGlb = inspectGlbBytes(mirroredBytes.get(expectedGlb)!)
    const mirroredGltf = inspectGltfJson(mirrored.get(expectedGltf))
    if (!mirroredGlb.validMagic || !mirroredGlb.validContainer || !mirroredGltf.validJson || !mirroredGltf.validGltfAsset) {
      throw new Error(`expected absolute local PNG URL host artifacts to inspect as valid, got ${JSON.stringify({ mirroredGlb, mirroredGltf })}`)
    }
  } finally {
    ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch
    setXrImageWorkspaceArtifactMirrorForTests(null)
  }
}

export async function testXrImageUrlAbsolutePngImportPreservesUnicodeFilename() {
  const mirrored = new Map<string, string>()
  const mirroredBytes = new Map<string, Uint8Array>()
  const originalFetch = globalThis.fetch
  setXrImageWorkspaceArtifactMirrorForTests(async ({ workspacePath, text }) => {
    mirrored.set(workspacePath, text)
    return true
  }, async ({ workspacePath, bytes }) => {
    mirroredBytes.set(workspacePath, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    return true
  })
  ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () =>
    new Response(PNG_WITH_IHDR_BYTES.slice(), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })) as typeof fetch
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const unicodeStem = `${String.fromCodePoint(0x793a, 0x4f8b)}-${String.fromCodePoint(0x56fe)}-11`
    const fileName = `${unicodeStem}.png`
    const res = await importWorkspaceUrl({
      fs,
      urlRaw: `/${['tmp', 'xr-validation', encodeURIComponent(fileName)].join('/')}`,
      parentPath: '/',
    })
    const expectedSource = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/${unicodeStem}.source.md`
    const expectedGlb = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/${unicodeStem}.glb`
    const expectedGltf = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/${unicodeStem}.gltf`
    for (const path of [expectedSource, expectedGlb, expectedGltf]) {
      if (!res.createdPaths.includes(path)) {
        throw new Error(`expected absolute local PNG URL import to preserve Unicode basename at ${path}, got ${res.createdPaths.join(', ')}`)
      }
    }
    if (!mirrored.has(expectedSource) || !mirroredBytes.has(expectedGlb) || !mirrored.has(expectedGltf)) {
      throw new Error('expected Unicode absolute local PNG URL import to mirror source metadata plus raw GLB/GLTF host artifacts')
    }
  } finally {
    ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch
    setXrImageWorkspaceArtifactMirrorForTests(null)
  }
}

export async function testXrImageUrlGithubBlobPngImportNormalizesAndPreservesFilename() {
  const mirrored = new Map<string, string>()
  const mirroredBytes = new Map<string, Uint8Array>()
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  setXrImageWorkspaceArtifactMirrorForTests(async ({ workspacePath, text }) => {
    mirrored.set(workspacePath, text)
    return true
  }, async ({ workspacePath, bytes }) => {
    mirroredBytes.set(workspacePath, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    return true
  })
  ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async input => {
    requestedUrl = String(input || '')
    return new Response(PNG_WITH_IHDR_BYTES.slice(), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })
  }) as typeof fetch
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const unicodeStem = `${String.fromCodePoint(0x56fe, 0x50cf)}-${String.fromCodePoint(0x9a8c, 0x8bc1)}-11`
    const encodedName = encodeURIComponent(`${unicodeStem}.png`)
    const blobUrl = `https://github.com/example/repo/blob/main/image/${encodedName}`
    const res = await importWorkspaceUrl({
      fs,
      urlRaw: blobUrl,
      parentPath: '/',
    })
    const expectedSource = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/${unicodeStem}.source.md`
    const expectedGlb = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/${unicodeStem}.glb`
    const expectedGltf = `${XR_IMAGE_MODEL_WORKSPACE_ROOT}/${unicodeStem}.gltf`
    for (const path of [expectedSource, expectedGlb, expectedGltf]) {
      if (!res.createdPaths.includes(path)) {
        throw new Error(`expected GitHub blob PNG import to preserve decoded basename at ${path}, got ${res.createdPaths.join(', ')}`)
      }
    }
    if (!requestedUrl.startsWith('https://raw.githubusercontent.com/example/repo/main/image/')) {
      throw new Error(`expected GitHub blob PNG import to fetch normalized raw URL, got ${requestedUrl}`)
    }
    if (!mirrored.has(expectedSource) || !mirroredBytes.has(expectedGlb) || !mirrored.has(expectedGltf)) {
      throw new Error('expected GitHub blob PNG import to mirror source metadata plus raw GLB/GLTF host artifacts')
    }
    const sourceText = await fs.readFileText(expectedSource)
    if (!sourceText?.includes(`Source URL: ${blobUrl}`)) {
      throw new Error(`expected source metadata to preserve original GitHub blob URL, got ${String(sourceText || '')}`)
    }
  } finally {
    ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch
    setXrImageWorkspaceArtifactMirrorForTests(null)
  }
}
