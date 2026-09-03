import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseStandaloneSpatialCaptureManifest } from '@/features/markdown-workspace/workspaceImport/spatialCaptureFileset'
import { loadSpatialCapturePointCloud, loadSpatialCapturePointCloudPreview, resetSpatialCaptureAssetRuntimeForTests, resolveSpatialCaptureParsePointLimit, resolveSpatialCapturePointBudget, resolveSpatialCapturePreviewPointBudget } from '@/lib/assets/spatialCaptureAssetRuntime'
import { parsePlyPointCloud, readPlyPointCloudBinaryLayout } from '@/lib/assets/plyPointCloud'

function asciiPly(points: string[]): Uint8Array {
  return new TextEncoder().encode([
    'ply',
    'format ascii 1.0',
    `element vertex ${points.length}`,
    'property float x',
    'property float y',
    'property float z',
    'end_header',
    ...points,
    '',
  ].join('\n'))
}

function binaryBigEndianRgbPly(): Uint8Array {
  const header = new TextEncoder().encode([
    'ply',
    'format binary_big_endian 1.0',
    'element vertex 2',
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
    '',
  ].join('\n'))
  const rowBytes = 15
  const out = new Uint8Array(header.length + rowBytes * 2)
  out.set(header, 0)
  const view = new DataView(out.buffer)
  let offset = header.length
  for (const point of [
    { xyz: [1, 2, 3] as const, rgb: [255, 32, 0] as const },
    { xyz: [4, 5, 6] as const, rgb: [0, 128, 255] as const },
  ]) {
    view.setFloat32(offset, point.xyz[0], false)
    view.setFloat32(offset + 4, point.xyz[1], false)
    view.setFloat32(offset + 8, point.xyz[2], false)
    out[offset + 12] = point.rgb[0]
    out[offset + 13] = point.rgb[1]
    out[offset + 14] = point.rgb[2]
    offset += rowBytes
  }
  return out
}

function binaryLittleEndianRgbPly(pointCount: number): Uint8Array {
  const header = new TextEncoder().encode([
    'ply',
    'format binary_little_endian 1.0',
    `element vertex ${pointCount}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
    '',
  ].join('\n'))
  const rowBytes = 15
  const out = new Uint8Array(header.length + rowBytes * pointCount)
  out.set(header, 0)
  const view = new DataView(out.buffer)
  for (let index = 0; index < pointCount; index += 1) {
    const offset = header.length + index * rowBytes
    view.setFloat32(offset, index, true)
    view.setFloat32(offset + 4, index + 0.5, true)
    view.setFloat32(offset + 8, index + 1, true)
    out[offset + 12] = 255
    out[offset + 13] = index % 255
    out[offset + 14] = 128
  }
  return out
}

function readRequestRange(init?: RequestInit): { end: number; raw: string; start: number } | null {
  const headers = init?.headers
  const raw = headers instanceof Headers
    ? headers.get('Range') || headers.get('range') || ''
    : Array.isArray(headers)
      ? String(headers.find(([key]) => key.toLowerCase() === 'range')?.[1] || '')
      : String((headers as Record<string, string> | undefined)?.Range || (headers as Record<string, string> | undefined)?.range || '')
  const match = raw.match(/^bytes=(\d+)-(\d+)$/)
  if (!match) return null
  return { end: Number(match[2]), raw, start: Number(match[1]) }
}

function partialGaussianPly(): Uint8Array {
  return new TextEncoder().encode([
    'ply',
    'format ascii 1.0',
    'element vertex 1',
    'property float x',
    'property float y',
    'property float z',
    'property float f_dc_0',
    'property float f_dc_1',
    'property float f_dc_2',
    'property float scale_0',
    'property float scale_1',
    'end_header',
    '1 2 3 0 0 0 -2 -3',
    '',
  ].join('\n'))
}

function manifestFor(url: string) {
  const text = [
    '---',
    'kgAssetType: "model"',
    'kgAssetFormat: "ply"',
    'kgSpatialCaptureFileset: false',
    'kgSpatialCaptureFormat: "ply"',
    'kgSpatialCaptureSourceKind: "url"',
    `kgSpatialCaptureSourceName: "${url.split('/').pop() || 'scan.ply'}"`,
    `kgSpatialCaptureSourceIdentity: "${url}"`,
    `kgXrIngestionCacheKey: "${url}"`,
    `kgXrRenderCacheKey: "${url}"`,
    'kgCanvas3dMode: "xr"',
    '---',
    '',
  ].join('\n')
  const manifest = parseStandaloneSpatialCaptureManifest(text)
  if (!manifest) throw new Error(`expected manifest for ${url}`)
  return manifest
}

export function testWorkspaceImportXrStandalonePlyParserHandlesEndianSamplingAndPartialGaussianRows() {
  const parser = readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'plyPointCloud.ts'), 'utf8')
  for (const marker of [
    'PROGRESSIVE_SOURCE_ORDER_MIN_POINTS',
    'resolveProgressiveSourceStride',
    'buildVertexIndexResolver',
    'return sampleIndex => (sampleIndex * stride) % sourcePointCount',
    'writeProjectedPlyPosition(positions, positionOffset, x, y, z)',
    'function writeProjectedPlyQuaternion(out: Float32Array',
  ]) {
    if (!parser.includes(marker)) throw new Error(`expected progressive full-source PLY parser marker ${marker}`)
  }
  for (const staleMarker of ['splatRotations.set([', 'projectPlyPosition', 'projectPlyQuaternion', 'normalizeQuaternion(']) {
    if (parser.includes(staleMarker)) throw new Error(`expected parser to avoid per-point allocation marker ${staleMarker}`)
  }

  const sampled = parsePlyPointCloud(asciiPly(['0 0 0', '1 0 0', '2 0 0', '3 0 0', '4 0 0', '5 0 0']), 3)
  if (sampled.sourcePointCount !== 6 || sampled.pointCount !== 3) {
    throw new Error(`expected uniform downsample to honor source and budget counts, got ${JSON.stringify({ source: sampled.sourcePointCount, parsed: sampled.pointCount })}`)
  }
  if (sampled.positions[0] !== 0 || sampled.positions[3] !== -3 || sampled.positions[6] !== -5) {
    throw new Error(`expected uniform downsample to preserve first/middle/last geometry, got ${Array.from(sampled.positions).join(',')}`)
  }

  const bigEndian = parsePlyPointCloud(binaryBigEndianRgbPly(), 10)
  if (bigEndian.pointCount !== 2 || bigEndian.positions[0] !== -1 || bigEndian.positions[3] !== -4 || !bigEndian.colors || bigEndian.colors[0] !== 1 || bigEndian.colors[5] !== 1) {
    throw new Error(`expected binary_big_endian RGB PLY to preserve geometry/color, got ${JSON.stringify({ positions: Array.from(bigEndian.positions), colors: bigEndian.colors ? Array.from(bigEndian.colors) : null })}`)
  }

  const partial = parsePlyPointCloud(partialGaussianPly(), 10)
  if (
    partial.kind !== 'gaussian-splat'
    || !partial.opacities
    || !partial.splatScales
    || !partial.splatRotations
    || partial.opacities[0] !== 1
    || partial.splatScales[2] > 0.000002
    || partial.splatRotations.some((value, index) => Math.abs(value - [0, 0, 1, 0][index]!) > 1e-6)
  ) {
    throw new Error(`expected partial Gaussian PLY rows to keep renderable defaults, got ${JSON.stringify({
      kind: partial.kind,
      opacity: partial.opacities ? Array.from(partial.opacities) : null,
      scales: partial.splatScales ? Array.from(partial.splatScales) : null,
      rotations: partial.splatRotations ? Array.from(partial.splatRotations) : null,
    })}`)
  }

  const layout = readPlyPointCloudBinaryLayout(binaryBigEndianRgbPly())
  if (!layout || layout.format !== 'binary_big_endian' || layout.sourcePointCount !== 2 || layout.rowBytes !== 15 || layout.bodyOffset <= 0) {
    throw new Error(`expected binary PLY layout to expose row offsets for range previews, got ${JSON.stringify(layout)}`)
  }
}

export async function testWorkspaceImportXrStandalonePlyRuntimeDedupesAndBoundsParsedLoadCache() {
  const originalFetch = globalThis.fetch
  const fetchState = { count: 0 }
  const readFetchCount = () => Number(fetchState.count)
  globalThis.fetch = (async () => {
    fetchState.count += 1
    return new Response(asciiPly(['0 0 0', '1 0 0']), { status: 200, headers: { 'content-type': 'model/ply' } })
  }) as typeof fetch
  try {
    resetSpatialCaptureAssetRuntimeForTests()
    const manifestA = manifestFor('https://assets.example.test/a.ply')
    const manifestB = manifestFor('https://assets.example.test/b.ply')
    const manifestC = manifestFor('https://assets.example.test/c.ply')
    const [firstA, secondA] = await Promise.all([
      loadSpatialCapturePointCloud(manifestA, 10),
      loadSpatialCapturePointCloud(manifestA, 10),
    ])
    if (!firstA || firstA !== secondA || readFetchCount() !== 1) {
      throw new Error(`expected concurrent PLY loads to share one parsed task, got ${JSON.stringify({ same: firstA === secondA, fetchCount: readFetchCount() })}`)
    }
    await loadSpatialCapturePointCloud(manifestA, 10)
    if (readFetchCount() !== 1) throw new Error(`expected cached PLY reload to avoid refetch, got ${readFetchCount()}`)
    await loadSpatialCapturePointCloud(manifestB, 10)
    await loadSpatialCapturePointCloud(manifestC, 10)
    await loadSpatialCapturePointCloud(manifestA, 10)
    if (readFetchCount() !== 4) throw new Error(`expected parsed-load cache to prune old entries after the memory-bounded budget, got ${readFetchCount()}`)
  } finally {
    globalThis.fetch = originalFetch
    resetSpatialCaptureAssetRuntimeForTests()
  }
}

export async function testWorkspaceImportXrStandalonePlyRuntimeLoadsPreviewThenFullFromSharedSourceBuffer() {
  const originalFetch = globalThis.fetch
  const fetchState = { count: 0 }
  globalThis.fetch = (async () => {
    fetchState.count += 1
    return new Response(asciiPly(['0 0 0', '1 0 0', '2 0 0', '3 0 0', '4 0 0', '5 0 0']), { status: 200, headers: { 'content-type': 'model/ply' } })
  }) as typeof fetch
  try {
    resetSpatialCaptureAssetRuntimeForTests()
    const manifest = manifestFor('https://assets.example.test/preview-full.ply')
    const preview = await loadSpatialCapturePointCloudPreview(manifest, 3)
    const full = await loadSpatialCapturePointCloud(manifest, 10)
    if (!preview || !full || fetchState.count !== 1) {
      throw new Error(`expected preview/full PLY loads to share one source read, got ${JSON.stringify({ hasPreview: !!preview, hasFull: !!full, fetchCount: fetchState.count })}`)
    }
    if (preview.fidelity !== 'preview' || full.fidelity !== 'full' || preview.pointCloud.pointCount !== 3 || full.pointCloud.pointCount !== 6 || full.pointCloud.sourcePointCount !== 6) {
      throw new Error(`expected preview-first full-fidelity promotion, got ${JSON.stringify({
        preview: { fidelity: preview.fidelity, pointCount: preview.pointCloud.pointCount, sourcePointCount: preview.pointCloud.sourcePointCount },
        full: { fidelity: full.fidelity, pointCount: full.pointCloud.pointCount, sourcePointCount: full.pointCloud.sourcePointCount },
      })}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    resetSpatialCaptureAssetRuntimeForTests()
  }
}

export async function testWorkspaceImportXrStandalonePlyRuntimeLoadsRangePreviewBeforeFullSourceFetch() {
  const originalFetch = globalThis.fetch
  const bytes = binaryLittleEndianRgbPly(12)
  const fetchState: { fullFetches: number; ranges: string[] } = { fullFetches: 0, ranges: [] }
  const readFullFetches = () => Number(fetchState.fullFetches)
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const range = readRequestRange(init)
    if (!range) {
      fetchState.fullFetches += 1
      return new Response(bytes, { status: 200, headers: { 'content-type': 'model/ply' } })
    }
    fetchState.ranges.push(range.raw)
    const start = Math.max(0, Math.min(bytes.byteLength - 1, range.start))
    const end = Math.max(start, Math.min(bytes.byteLength - 1, range.end))
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: {
        'content-range': `bytes ${start}-${end}/${bytes.byteLength}`,
        'content-type': 'model/ply',
      },
    })
  }) as typeof fetch
  try {
    resetSpatialCaptureAssetRuntimeForTests()
    const manifest = manifestFor('https://assets.example.test/range-preview.ply')
    const preview = await loadSpatialCapturePointCloudPreview(manifest, 4)
    if (!preview || preview.fidelity !== 'preview' || preview.pointCloud.sourcePointCount !== 12 || preview.pointCloud.pointCount !== 4 || readFullFetches() !== 0 || fetchState.ranges.length < 2) {
      throw new Error(`expected range-backed preview before full source fetch, got ${JSON.stringify({
        preview: preview ? { fidelity: preview.fidelity, pointCount: preview.pointCloud.pointCount, sourcePointCount: preview.pointCloud.sourcePointCount } : null,
        fetchState,
      })}`)
    }
    const full = await loadSpatialCapturePointCloud(manifest, 20)
    if (!full || full.fidelity !== 'full' || full.pointCloud.pointCount !== 12 || readFullFetches() !== 1) {
      throw new Error(`expected full-fidelity promotion to fetch full source once, got ${JSON.stringify({
        full: full ? { fidelity: full.fidelity, pointCount: full.pointCloud.pointCount, sourcePointCount: full.pointCloud.sourcePointCount } : null,
        fetchState,
      })}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    resetSpatialCaptureAssetRuntimeForTests()
  }
}

export function testWorkspaceImportXrStandalonePlyRuntimeUsesRangeCapableLocalFileRoute() {
  const runtime = readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'spatialCaptureAssetRuntime.ts'), 'utf8')
  const urlHelpers = readFileSync(resolve(process.cwd(), 'src', 'lib', 'url.ts'), 'utf8')
  const rangeServer = readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'server', 'localFileRangeServer.ts'), 'utf8')
  const viteConfig = readFileSync(resolve(process.cwd(), '..', 'canvas', 'vite.config.ts'), 'utf8')
  for (const marker of [
    'buildLocalFsRangeFetchPath',
    '/__agentic_os_local_file?path=',
    'createLocalFileRangeHandler',
    "res.setHeader('Accept-Ranges', 'bytes')",
    "res.setHeader('Content-Range'",
    'createReadStream(filePath, { start: parsedRange.start, end: parsedRange.end })',
  ]) {
    if (![runtime, urlHelpers, rangeServer, viteConfig].some(source => source.includes(marker))) {
      throw new Error(`expected range-capable local PLY route marker ${marker}`)
    }
  }
}

export function testWorkspaceImportXrStandalonePlyRuntimeUsesTransferBackedWorkerParser() {
  const runtime = [
    readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'spatialCaptureAssetRuntime.ts'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'spatialCapturePreviewRange.ts'), 'utf8'),
  ].join('\n')
  const worker = readFileSync(resolve(process.cwd(), 'src', 'lib', 'assets', 'plyPointCloudWorker.ts'), 'utf8')
  const requiredRuntimeMarkers = [
    "new Worker(new URL('./plyPointCloudWorker.ts', import.meta.url)",
    "type: 'module'",
    "name: 'kg-ply-point-cloud-parser'",
    'worker.postMessage({ requestId, buffer, maxPoints }, [buffer])',
    'byteLength: sourceBuffer.byteLength',
    'readSpatialCapturePreviewBuffer(manifest, maxPoints)',
    'fetchByteRange(target.path, 0, SPATIAL_CAPTURE_PREVIEW_HEADER_BYTES - 1)',
    'buildPreviewRowRanges(layout, maxPoints)',
    'patchPreviewSourcePointCount(parsePlyPointCloud(previewBuffer.buffer, maxPoints), previewBuffer.sourcePointCount)',
    'const sourceBuffer = await loadSpatialCaptureSourceBuffer(manifest)',
    'export async function loadSpatialCapturePointCloudPreview',
    "fidelity: 'preview'",
    "fidelity: 'full'",
    'await parseSpatialCapturePointCloud(sourceBuffer.buffer, maxPoints)',
    'SPATIAL_CAPTURE_PARSE_WORKER_TIMEOUT_MS',
  ]
  const missingRuntime = requiredRuntimeMarkers.filter(marker => !runtime.includes(marker))
  if (missingRuntime.length) {
    throw new Error(`expected spatial capture runtime to use a bounded transferable PLY parser worker, missing ${missingRuntime.join(', ')}`)
  }
  const requiredWorkerMarkers = [
    "import { parsePlyPointCloud, type PlyPointCloud } from './plyPointCloud'",
    'collectPointCloudTransfers(pointCloud)',
    'pointCloud.positions.buffer',
    'pointCloud.colors?.buffer',
    'pointCloud.opacities?.buffer',
    'pointCloud.splatScales?.buffer',
    'pointCloud.splatRotations?.buffer',
    'postMessage(message, transfers)',
  ]
  const missingWorker = requiredWorkerMarkers.filter(marker => !worker.includes(marker))
  if (missingWorker.length) {
    throw new Error(`expected PLY parser worker to transfer parsed typed-array ownership, missing ${missingWorker.join(', ')}`)
  }
}

export function testWorkspaceImportXrStandalonePlyRuntimeUsesAdaptiveRenderBudget() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const setNavigator = (value: unknown) => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value })
  }
  try {
    setNavigator({ deviceMemory: 2, hardwareConcurrency: 8 })
    const lowMemory = resolveSpatialCapturePointBudget()
    const lowMemoryPreview = resolveSpatialCapturePreviewPointBudget()
    const lowMemoryParseLimit = resolveSpatialCaptureParsePointLimit()
    setNavigator({ deviceMemory: 16, hardwareConcurrency: 12 })
    const highMemory = resolveSpatialCapturePointBudget()
    const highMemoryPreview = resolveSpatialCapturePreviewPointBudget()
    const highMemoryParseLimit = resolveSpatialCaptureParsePointLimit()
    setNavigator({ deviceMemory: 8, hardwareConcurrency: 4 })
    const lowCore = resolveSpatialCapturePointBudget()
    const lowCorePreview = resolveSpatialCapturePreviewPointBudget()
    const lowCoreParseLimit = resolveSpatialCaptureParsePointLimit()
    if (!(
      lowMemory < highMemory
      && lowCore === lowMemory
      && lowMemoryPreview < lowMemory
      && highMemoryPreview < highMemory
      && lowCorePreview === lowMemoryPreview
      && highMemory <= 1_600_000
      && lowMemoryParseLimit >= 2_000_000
      && lowMemoryParseLimit > lowMemory
      && highMemoryParseLimit > highMemory
      && lowCoreParseLimit === lowMemoryParseLimit
    )) {
      throw new Error(`expected adaptive spatial capture parse/render budgets, got ${JSON.stringify({ lowMemory, highMemory, lowCore, lowMemoryPreview, highMemoryPreview, lowCorePreview, lowMemoryParseLimit, highMemoryParseLimit, lowCoreParseLimit })}`)
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete (globalThis as { navigator?: unknown }).navigator
  }
}
