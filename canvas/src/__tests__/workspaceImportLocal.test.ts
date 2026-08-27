import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { importLocalFilesFallback } from '@/features/toolbar/launchDropdownFallbacks'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import {
  hydrateWorkspaceFileFromPendingLocalImport,
  importWorkspaceLocalFiles,
  importWorkspaceLocalFolder,
  importWorkspaceUrl,
  isPendingLocalImportStubText,
  peekPendingWorkspaceLocalImport,
} from '@/features/markdown-workspace/workspaceImport'
import {
  activateFirstImportedWorkspaceFile,
  resolveImportedCanvasDocumentApplyToGraph,
} from '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
import { shouldApplyImportedCanvasDocumentToGraph } from '@/features/markdown-workspace/workspaceImport/applyPolicy'
import { resolveWorkspaceFileJsonLdExport } from '@/features/markdown-workspace/workspaceImport/workspaceFileJsonLd'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { WORKSPACE_IMPORT_DEFER_LOCAL_FILE_BYTES, WORKSPACE_IMPORT_DEFER_LOCAL_GLB_BYTES } from '@/lib/config'
import { WORKSPACE_EXPORT_MENU_ITEMS } from '@/lib/toolbar/exportMenuSsot'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { GLB_ASSET_MIME_TYPE, GLTF_ASSET_MIME_TYPE, parseGlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import { inspectGlbBytes } from '@/lib/assets/gltfFormat'
import { resolveModelAssetExportBlob } from '@/lib/assets/modelAssetExport'
import { buildGlbAssetMarkdown, buildGltfAssetMarkdown } from '@/features/markdown-workspace/workspaceImport/glbAsset'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { resolveActiveMarkdownBaseGraph } from '@/hooks/active-graph-data/useActiveGraphData.impl'
import {
  buildStrybldrStoryboardDocument,
  buildStrybldrVideoHandoffFromGraphData,
  serializeStrybldrStoryboardMarkdown,
} from '@/features/strybldr/strybldrStoryboard'
import {
  DOCS_SSOT_VALIDATION_FIXTURE_BASENAME,
  DOCS_SSOT_VALIDATION_WORKSPACE_PATH,
  readDocsSsotFixtureText,
} from '@/tests/lib/docsSsotFixture'

const createFile = (name: string, text: string) => {
  const blob = new Blob([text], { type: 'text/plain' })
  return new File([blob], name, { type: 'text/plain' })
}

const createBinaryFile = (name: string, bytes: Uint8Array, type = 'application/octet-stream') => {
  const blob = new Blob([bytes], { type })
  return new File([blob], name, { type })
}

function readStrybldrLocalImportInput(): { name: string; text: string } {
  const inputPath = String(
    process.env.AGENTICGRAPH_STRYTREE_DEMO_INPUT ||
    process.env.AGENTICGRAPH_STRYBLDR_DEMO_INPUT ||
    '',
  ).trim()
  if (inputPath) {
    return {
      name: basename(inputPath) || 'strybldr-local-import.md',
      text: readFileSync(inputPath, 'utf8'),
    }
  }
  return {
    name: 'strybldr-local-import.md',
    text: serializeStrybldrStoryboardMarkdown(buildStrybldrStoryboardDocument({
      createdAtMs: 1,
      sourceUnits: [
        {
          id: 'local-import-strybldr-source',
          workspacePath: '/source.md',
          relativePath: 'source.md',
          originalName: 'source.md',
          mediaKind: 'video',
          mimeHint: 'text/markdown',
          byteSize: 0,
          textHash: 'local-import',
          status: 'parsed',
          provenance: { importMode: 'file', importedAtMs: 1 },
        },
      ],
    })),
  }
}

function createGlbBytes(args?: {
  json?: Record<string, unknown>
  bin?: Uint8Array
  order?: 'json-bin' | 'bin-json'
  jsonPaddingByte?: number
  binPaddingByte?: number
  unknownBetweenJsonAndBin?: boolean
}): Uint8Array {
  const json = JSON.stringify(args?.json || {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
  })
  const jsonRaw = new TextEncoder().encode(json)
  const jsonLength = Math.ceil(jsonRaw.byteLength / 4) * 4
  const binRaw = args?.bin || null
  const binLength = binRaw ? Math.ceil(binRaw.byteLength / 4) * 4 : 0
  const unknownLength = args?.unknownBetweenJsonAndBin ? 4 : 0
  const totalLength = 12 + 8 + jsonLength + (unknownLength ? 8 + unknownLength : 0) + (binRaw ? 8 + binLength : 0)
  const bytes = new Uint8Array(totalLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, totalLength, true)
  const writeChunk = (offset: number, chunkType: number, payload: Uint8Array, paddedLength: number, paddingByte: number) => {
    view.setUint32(offset, paddedLength, true)
    view.setUint32(offset + 4, chunkType, true)
    bytes.set(payload, offset + 8)
    bytes.fill(paddingByte, offset + 8 + payload.byteLength, offset + 8 + paddedLength)
    return offset + 8 + paddedLength
  }
  const jsonChunkType = 0x4e4f534a
  const binChunkType = 0x004e4942
  const unknownChunkType = 0x54534554
  if (args?.order === 'bin-json' && binRaw) {
    const next = writeChunk(12, binChunkType, binRaw, binLength, args?.binPaddingByte ?? 0x00)
    writeChunk(next, jsonChunkType, jsonRaw, jsonLength, args?.jsonPaddingByte ?? 0x20)
  } else {
    let next = writeChunk(12, jsonChunkType, jsonRaw, jsonLength, args?.jsonPaddingByte ?? 0x20)
    if (unknownLength) next = writeChunk(next, unknownChunkType, new Uint8Array([1, 2, 3, 4]), unknownLength, 0x00)
    if (binRaw) writeChunk(next, binChunkType, binRaw, binLength, args?.binPaddingByte ?? 0x00)
  }
  return bytes
}

function createMinimalGlbBytes(): Uint8Array {
  return createGlbBytes()
}

export async function testWorkspaceImportLocalFilesCreatesExpectedEntries() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const files = [createFile('a.md', '# A\n'), createFile('b.txt', 'hello\n')]
    const res = await importWorkspaceLocalFiles({ fs, files, parentPath: '/' })
    if (res.createdPaths.length !== 2) throw new Error('expected 2 created paths')

    const entries = await fs.listEntries()
    const names = entries.filter(e => e.kind === 'file').map(e => e.name).sort()
    if (!names.includes('a.md') || !names.includes('b.txt')) {
      throw new Error(`expected imported files to exist, got: ${names.join(', ')}`)
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLocalVideoCreatesSingleRenderableSequenceDocument() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const file = createBinaryFile('clip.mp4', new Uint8Array([0, 1, 2, 3]), 'video/mp4')
    const res = await importWorkspaceLocalFiles({ fs, files: [file], parentPath: '/' })
    if (res.createdPaths.length !== 1) {
      throw new Error(`expected video import to leave one visible workspace file, got ${res.createdPaths.join(', ')}`)
    }
    const path = res.createdPaths[0] || ''
    if (!path.endsWith('.video-sequence.timeline.md')) {
      throw new Error(`expected video import to focus the sequence document, got ${path}`)
    }
    if (res.createdPaths.some(createdPath => /\.source\.md$/i.test(createdPath))) {
      throw new Error(`expected generated video source sidecars to be pruned from createdPaths, got ${res.createdPaths.join(', ')}`)
    }
    const entries = await fs.listEntries()
    const names = entries.filter(e => e.kind === 'file').map(e => e.name).sort()
    if (names.some(name => /\.source\.md$/i.test(name))) {
      throw new Error(`expected video import workspace to avoid source sidecar files, got: ${names.join(', ')}`)
    }
    const text = String((await fs.readFileText(path)) || '')
    if (
      !text.includes('kgCanvas2dRenderer: "media"') ||
      !text.includes('kgVideoSequenceTimeline: true') ||
      !text.includes('kgVideoSequenceSources:') ||
      !text.includes('clip.mp4')
    ) {
      throw new Error(`expected video import to create a renderable Media sequence document, got ${text}`)
    }
    if (res.corpusManifest?.sourceUnits.length !== 1 || res.corpusManifest.sourceUnits[0]?.mediaKind !== 'video') {
      throw new Error(`expected pruned sidecar import to keep video source unit manifest, got ${JSON.stringify(res.corpusManifest)}`)
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceImportUrlVideoCreatesSingleRenderableSequenceDocument() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const res = await importWorkspaceUrl({
      fs,
      urlRaw: 'https://media.example.test/clip.mp4',
      parentPath: '/',
      fetchUrlContent: async url => ({
        normalizedUrl: url,
        name: 'clip.mp4.source.md',
        text: [
          '---',
          'kgCorpusSourceUnit: true',
          'originalName: "clip.mp4"',
          'relativePath: "https://media.example.test/clip.mp4"',
          'mediaKind: "video"',
          'mimeHint: "video/mp4"',
          'byteSize: 4',
          'status: "unsupported"',
          'importMode: "url"',
          '---',
          '',
        ].join('\n'),
        sourceMediaKind: 'video',
        sourceMimeHint: 'video/mp4',
      }),
    })
    if (res.createdPaths.length !== 1) {
      throw new Error(`expected URL video import to leave one visible workspace file, got ${res.createdPaths.join(', ')}`)
    }
    const path = res.createdPaths[0] || ''
    if (!path.endsWith('.video-sequence.timeline.md') || res.createdPaths.some(createdPath => /\.source\.md$/i.test(createdPath))) {
      throw new Error(`expected URL video import to focus only the sequence document, got ${res.createdPaths.join(', ')}`)
    }
    const names = (await fs.listEntries()).filter(e => e.kind === 'file').map(e => e.name).sort()
    if (names.some(name => /\.source\.md$/i.test(name))) {
      throw new Error(`expected URL video import workspace to avoid source sidecar files, got: ${names.join(', ')}`)
    }
    const text = String((await fs.readFileText(path)) || '')
    if (!text.includes('sourceUrl: "https://media.example.test/clip.mp4"') || !text.includes('kgCanvas2dRenderer: "media"')) {
      throw new Error(`expected URL video import to create a playable Media sequence document, got ${text}`)
    }

    const store = useGraphStore.getState()
    store.resetAll()
    store.setCanvasRenderMode('2d')
    store.setCanvas2dRenderer('storyboard')
    store.setBottomSurfaceTab('gantt')
    store.setBottomSurfaceCollapsed(true)
    store.setFloatingPanelView('storyboardWidget')
    store.setFloatingPanelOpen(false)
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: res.createdPaths,
      opts: {
        applyToGraph: true,
        skipComposedGraphApply: true,
        removedPaths: res.removedPaths,
      },
    })
    await activateFirstImportedWorkspaceFile({ fs, createdPaths: res.createdPaths, applyToGraph: true })
    const next = useGraphStore.getState()
    if (next.canvasRenderMode !== '2d') {
      throw new Error(`expected URL video activation to preserve 2d canvas mode, got ${String(next.canvasRenderMode || '')}`)
    }
    if (next.canvas2dRenderer !== 'media') {
      throw new Error(`expected URL video activation to land on Media renderer, got ${String(next.canvas2dRenderer || '')}`)
    }
    if (next.bottomSurfaceTab !== 'timeline' || next.bottomSurfaceCollapsed === true) {
      throw new Error(`expected URL video activation to open BottomPanel Timeline, got tab=${String(next.bottomSurfaceTab || '')} collapsed=${String(next.bottomSurfaceCollapsed)}`)
    }
    if (next.floatingPanelView !== 'timeline' || next.floatingPanelOpen !== true) {
      throw new Error(`expected URL video activation to show FloatingPanel Timeline rows, got view=${String(next.floatingPanelView || '')} open=${String(next.floatingPanelOpen)}`)
    }
  } finally {
    restore()
  }
}

export async function testLaunchDropdownImportLocalFilesFallbackActivatesWorkspaceAndCanvasState() {
  const { restore } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    const store = useGraphStore.getState()
    store.resetAll()
    store.setWorkspaceViewMode('canvas')

    const text = ['---', 'mermaid: |', '  graph LR', '    A --> B', '---', '', '# Imported', ''].join('\n')
    const file = createFile('imported.md', text)
    await importLocalFilesFallback({
      files: [file] as unknown as FileList,
      pushUiToast: () => void 0,
    })

    const next = useGraphStore.getState()
    const explorer = useMarkdownExplorerStore.getState()
    if (String(next.markdownDocumentText || '').trim().length === 0) {
      throw new Error('expected fallback local import to set non-empty markdownDocumentText')
    }
    if (String(next.markdownDocumentName || '').trim() !== 'imported.md') {
      throw new Error(`expected fallback local import to set markdownDocumentName to imported.md, got ${String(next.markdownDocumentName || '')}`)
    }
    if (String(explorer.activePath || '').trim() !== '/imported.md') {
      throw new Error(`expected fallback local import to set explorer activePath /imported.md, got ${String(explorer.activePath || '')}`)
    }
    if (next.workspaceViewMode !== 'canvas') {
      throw new Error(`expected fallback local import to preserve canvas mode, got ${String(next.workspaceViewMode || '')}`)
    }
    const fs = await getWorkspaceFs()
    const entries = await fs.listEntries()
    const importedPath = entries.find(e => e.kind === 'file' && e.name === 'imported.md')?.path || ''
    if (!importedPath) throw new Error('expected imported.md to exist in workspace fs')
    const importedText = await fs.readFileText(importedPath)
    if (String(importedText || '').trim().length === 0) {
      throw new Error('expected imported.md workspace file text to be non-empty')
    }
  } finally {
    restore()
  }
}

export async function testLaunchDropdownImportLocalFilesFallbackAppliesCanvasFrontmatterLanding() {
  const { restore } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    const store = useGraphStore.getState()
    store.resetAll()
    store.setCanvasRenderMode('2d')
    store.setCanvas2dRenderer('d3')
    store.setDocumentSemanticMode('keyword')
    store.setFrontmatterModeEnabled(false)

    const text = [
      '---',
      'title: "Video Demo"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "storyboard"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      'kgMultiDimTableModeEnabled: false',
      '$schema: "kgc-pipeline/v1"',
      'widget_bundle:',
      '  kind: kg:flow:widgetBundle',
      'flow:',
      '  nodes: []',
      '---',
      '',
      '# Imported Video Demo',
      '',
    ].join('\n')
    const file = createFile(DOCS_SSOT_VALIDATION_FIXTURE_BASENAME, text)
    await importLocalFilesFallback({
      files: [file] as unknown as FileList,
      pushUiToast: () => void 0,
    })

    const next = useGraphStore.getState()
    if (next.canvasRenderMode !== '2d') {
      throw new Error(`expected fallback import to keep 2d canvas mode, got ${String(next.canvasRenderMode || '')}`)
    }
    if (next.canvas2dRenderer !== 'storyboard') {
      throw new Error(`expected fallback import to apply Storyboard renderer, got ${String(next.canvas2dRenderer || '')}`)
    }
    if (next.documentSemanticMode !== 'document') {
      throw new Error(`expected fallback import to apply document semantic mode, got ${String(next.documentSemanticMode || '')}`)
    }
    if (next.frontmatterModeEnabled !== true) {
      throw new Error('expected fallback import to enable frontmatter mode for canvas-frontmatter markdown')
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLocalFilesSvgPreservesBytes() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">', '<circle cx="5" cy="5" r="4"/>', '</svg>', ''].join('\n')
    const files = [createFile('icon.svg', svg)]
    const res = await importWorkspaceLocalFiles({ fs, files, parentPath: '/' })
    if (res.createdPaths.length !== 1) throw new Error('expected 1 created path')

    const entries = await fs.listEntries()
    const svgPath = entries.find(e => e.kind === 'file' && e.name === 'icon.svg')?.path || ''
    if (!svgPath) throw new Error('expected icon.svg to be created')

    const text = await fs.readFileText(svgPath)
    if (text !== svg) throw new Error(`expected icon.svg contents to match exactly, got: ${JSON.stringify(text)}`)
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLocalFilesGlbCreatesModelManifest() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const glbHeader = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0])
    const files = [createBinaryFile('scene.glb', glbHeader, 'model/gltf-binary')]
    const res = await importWorkspaceLocalFiles({ fs, files, parentPath: '/' })
    if (res.createdPaths.length !== 1) throw new Error('expected 1 created path')
    if (res.createdPaths[0] !== '/scene.glb') {
      throw new Error(`expected GLB import to preserve /scene.glb, got ${String(res.createdPaths[0] || '')}`)
    }

    const text = await fs.readFileText('/scene.glb')
    if (!text) throw new Error('expected GLB manifest text')
    if (!text.includes('kgAssetFormat: "glb"')) throw new Error('expected GLB asset format frontmatter')
    if (!text.includes('kgAssetValidGlbMagic: true')) throw new Error('expected GLB magic validation flag')
    if (!text.includes('kgCanvasSurfaceMode: "xr"')) throw new Error('expected GLB manifest to request XR surface mode')
    if (!text.includes('kgCanvasRenderMode: "3d"')) throw new Error('expected GLB manifest to request 3D canvas render mode')
    if (!text.includes('kgCanvas3dMode: "xr"')) throw new Error('expected GLB manifest to request XR 3D mode')
    if (!text.includes('kgAssetEncoding: "base64-body"')) {
      throw new Error('expected GLB manifest to keep encoded model data outside frontmatter')
    }
    if (!text.includes('```kg-glb-base64')) {
      throw new Error('expected GLB manifest to embed chunked model data in a fenced payload')
    }
    const asset = parseGlbAssetDocument(text)
    if (!asset) throw new Error('expected GLB manifest to parse as a renderable asset document')
    if (asset.name !== 'scene.glb') throw new Error(`expected parsed GLB asset name scene.glb, got ${asset.name}`)
    if (!asset.dataUrl?.startsWith('data:model/gltf-binary;base64,')) {
      throw new Error('expected parsed GLB asset to expose the embedded binary data URL')
    }
    if (!shouldApplyImportedCanvasDocumentToGraph({ path: '/scene.glb', text })) {
      throw new Error('expected GLB asset manifest to opt into canvas preset application without a .md suffix')
    }

    const store = useGraphStore.getState()
    store.resetAll()
    store.setCanvasRenderMode('2d')
    store.setCanvas3dMode('3d')
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: res.createdPaths,
      opts: { applyToGraph: true, skipComposedGraphApply: true },
    })
    const next = useGraphStore.getState()
    if (next.canvasRenderMode !== '3d') {
      throw new Error(`expected GLB manifest activation to switch Canvas to 3D, got ${String(next.canvasRenderMode || '')}`)
    }
    if (next.canvas3dMode !== 'xr') {
      throw new Error(`expected GLB manifest activation to switch Canvas 3D mode to XR, got ${String(next.canvas3dMode || '')}`)
    }

    next.setCanvasRenderMode('2d')
    next.setCanvas3dMode('3d')
    await next.setActiveMarkdownDocument({
      name: 'scene.glb',
      text,
      normalizeMermaidMmd: false,
      applyViewPreset: true,
      applyToGraph: true,
    })
    const afterSourceFileOpen = useGraphStore.getState()
    if (afterSourceFileOpen.canvasRenderMode !== '3d') {
      throw new Error(`expected Source Files GLB activation to switch Canvas to 3D, got ${String(afterSourceFileOpen.canvasRenderMode || '')}`)
    }
    if (afterSourceFileOpen.canvas3dMode !== 'xr') {
      throw new Error(`expected Source Files GLB activation to preserve XR, got ${String(afterSourceFileOpen.canvas3dMode || '')}`)
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLocalFilesGltfCreatesModelManifest() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const gltf = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [] }, null, 2)
    const files = [createFile('scene.gltf', `${gltf}\n`)]
    const res = await importWorkspaceLocalFiles({ fs, files, parentPath: '/' })
    if (res.createdPaths.length !== 1) throw new Error('expected 1 created path')
    if (res.createdPaths[0] !== '/scene.gltf') {
      throw new Error(`expected GLTF import to preserve /scene.gltf, got ${String(res.createdPaths[0] || '')}`)
    }

    const text = await fs.readFileText('/scene.gltf')
    if (!text) throw new Error('expected GLTF manifest text')
    if (!text.includes('kgAssetFormat: "gltf"')) throw new Error('expected GLTF asset format frontmatter')
    if (!text.includes('kgAssetValidGltfJson: true')) throw new Error('expected GLTF JSON validation flag')
    if (!text.includes('kgCanvasSurfaceMode: "xr"')) throw new Error('expected GLTF manifest to request XR surface mode')
    if (!text.includes('kgCanvasRenderMode: "3d"')) throw new Error('expected GLTF manifest to request 3D canvas render mode')
    if (!text.includes('kgCanvas3dMode: "xr"')) throw new Error('expected GLTF manifest to request XR 3D mode')
    if (!text.includes('kgAssetEncoding: "json-body"')) {
      throw new Error('expected GLTF manifest to keep JSON payload outside frontmatter')
    }
    if (!text.includes('```kg-gltf-base64')) {
      throw new Error('expected GLTF manifest to embed chunked model JSON in a fenced payload')
    }
    const asset = parseGlbAssetDocument(text)
    if (!asset) throw new Error('expected GLTF manifest to parse as a renderable asset document')
    if (asset.format !== 'gltf') throw new Error(`expected parsed asset format gltf, got ${asset.format}`)
    if (asset.name !== 'scene.gltf') throw new Error(`expected parsed GLTF asset name scene.gltf, got ${asset.name}`)
    if (!asset.dataUrl?.startsWith('data:model/gltf+json;base64,')) {
      throw new Error('expected parsed GLTF asset to expose the embedded JSON data URL')
    }
    if (!shouldApplyImportedCanvasDocumentToGraph({ path: '/scene.gltf', text })) {
      throw new Error('expected GLTF asset manifest to opt into canvas preset application without a .md suffix')
    }

    const store = useGraphStore.getState()
    store.resetAll()
    store.setCanvasRenderMode('2d')
    store.setCanvas3dMode('3d')
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: res.createdPaths,
      opts: { applyToGraph: true, skipComposedGraphApply: true },
    })
    const next = useGraphStore.getState()
    if (next.canvasRenderMode !== '3d') {
      throw new Error(`expected GLTF manifest activation to switch Canvas to 3D, got ${String(next.canvasRenderMode || '')}`)
    }
    if (next.canvas3dMode !== 'xr') {
      throw new Error(`expected GLTF manifest activation to switch Canvas 3D mode to XR, got ${String(next.canvas3dMode || '')}`)
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLargeLocalGlbDefersEditorHydrationButKeepsXrRenderable() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const bytes = new Uint8Array(Math.max(WORKSPACE_IMPORT_DEFER_LOCAL_GLB_BYTES + 32, 1024))
    bytes.set([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0], 0)
    const files = [createBinaryFile('large-scene.glb', bytes, 'model/gltf-binary')]
    const res = await importWorkspaceLocalFiles({ fs, files, parentPath: '/' })
    if (res.createdPaths.length !== 1) throw new Error('expected 1 created path')
    if (res.createdPaths[0] !== '/large-scene.glb') {
      throw new Error(`expected large GLB import to preserve /large-scene.glb, got ${String(res.createdPaths[0] || '')}`)
    }

    const stub = await fs.readFileText('/large-scene.glb')
    if (!stub || !isPendingLocalImportStubText(stub)) throw new Error('expected large GLB import to keep an editor-safe pending stub')
    if (stub.includes('kgAssetDataUrl') || stub.includes('```kg-glb-base64')) {
      throw new Error('expected pending GLB stub to avoid eager embedded base64 payloads')
    }
    const pending = peekPendingWorkspaceLocalImport('/large-scene.glb')
    if (!pending || pending.kind !== 'glb') throw new Error('expected pending GLB local import handle')
    const asset = parseGlbAssetDocument(stub)
    if (!asset || !asset.pendingLocalImport || asset.pendingLocalImportPath !== '/large-scene.glb') {
      throw new Error('expected pending GLB stub to parse as a renderable pending asset document')
    }

    const shouldApply = await resolveImportedCanvasDocumentApplyToGraph({ fs, createdPaths: res.createdPaths })
    if (!shouldApply) throw new Error('expected pending GLB stub to request XR canvas activation')
    const afterResolve = await fs.readFileText('/large-scene.glb')
    if (afterResolve !== stub) throw new Error('expected apply resolution to avoid hydrating pending GLB payloads')

    const store = useGraphStore.getState()
    store.resetAll()
    store.setCanvasRenderMode('2d')
    store.setCanvas3dMode('3d')
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: res.createdPaths,
      opts: { applyToGraph: true, skipComposedGraphApply: true },
    })
    const next = useGraphStore.getState()
    if (next.canvasRenderMode !== '3d') {
      throw new Error(`expected pending GLB activation to switch Canvas to 3D, got ${String(next.canvasRenderMode || '')}`)
    }
    if (next.canvas3dMode !== 'xr') {
      throw new Error(`expected pending GLB activation to switch Canvas 3D mode to XR, got ${String(next.canvas3dMode || '')}`)
    }

    await activateFirstImportedWorkspaceFile({ fs, createdPaths: res.createdPaths, applyToGraph: true })
    const active = useGraphStore.getState()
    if (String(active.markdownDocumentText || '') !== stub) {
      throw new Error('expected active editor text to remain the lightweight pending GLB stub')
    }
    if (peekPendingWorkspaceLocalImport('/large-scene.glb')?.kind !== 'glb') {
      throw new Error('expected pending GLB handle to remain available for XR renderer resolution')
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLargeLocalGltfDefersEditorHydrationButKeepsXrRenderable() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const padding = 'x'.repeat(Math.max(WORKSPACE_IMPORT_DEFER_LOCAL_GLB_BYTES + 32, 1024))
    const gltf = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], extras: { padding } })
    const files = [createFile('large-scene.gltf', gltf)]
    const res = await importWorkspaceLocalFiles({ fs, files, parentPath: '/' })
    if (res.createdPaths.length !== 1) throw new Error('expected 1 created path')
    if (res.createdPaths[0] !== '/large-scene.gltf') {
      throw new Error(`expected large GLTF import to preserve /large-scene.gltf, got ${String(res.createdPaths[0] || '')}`)
    }

    const stub = await fs.readFileText('/large-scene.gltf')
    if (!stub || !isPendingLocalImportStubText(stub)) throw new Error('expected large GLTF import to keep an editor-safe pending stub')
    if (stub.includes('kgAssetDataUrl') || stub.includes('```kg-gltf-base64')) {
      throw new Error('expected pending GLTF stub to avoid eager embedded JSON payloads')
    }
    const pending = peekPendingWorkspaceLocalImport('/large-scene.gltf')
    if (!pending || pending.kind !== 'gltf') throw new Error('expected pending GLTF local import handle')
    const asset = parseGlbAssetDocument(stub)
    if (!asset || asset.format !== 'gltf' || !asset.pendingLocalImport || asset.pendingLocalImportPath !== '/large-scene.gltf') {
      throw new Error('expected pending GLTF stub to parse as a renderable pending asset document')
    }

    const shouldApply = await resolveImportedCanvasDocumentApplyToGraph({ fs, createdPaths: res.createdPaths })
    if (!shouldApply) throw new Error('expected pending GLTF stub to request XR canvas activation')
    const afterResolve = await fs.readFileText('/large-scene.gltf')
    if (afterResolve !== stub) throw new Error('expected apply resolution to avoid hydrating pending GLTF payloads')
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLocalFolderGlbDefersAsModelManifest() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const glbHeader = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0])
    const file = createBinaryFile('scene.glb', glbHeader, 'model/gltf-binary')
    Object.defineProperty(file, 'webkitRelativePath', { value: 'models/scene.glb' })
    const res = await importWorkspaceLocalFolder({ fs, files: [file] })
    if (res.createdPaths.length !== 1) throw new Error('expected 1 created path')
    if (res.createdPaths[0] !== '/models/scene.glb') {
      throw new Error(`expected folder GLB import to preserve /models/scene.glb, got ${String(res.createdPaths[0] || '')}`)
    }

    const before = await fs.readFileText('/models/scene.glb')
    if (!before || !isPendingLocalImportStubText(before)) throw new Error('expected folder GLB import to start as a pending stub')
    const pending = peekPendingWorkspaceLocalImport('/models/scene.glb')
    if (!pending || pending.kind !== 'glb') throw new Error('expected pending GLB local import handle')
    const hydrated = await hydrateWorkspaceFileFromPendingLocalImport({ fs, path: '/models/scene.glb' })
    if (!hydrated || hydrated.kind !== 'glb') throw new Error('expected GLB hydration result')
    if (!hydrated.text.includes('kgAssetFormat: "glb"')) throw new Error('expected hydrated GLB manifest frontmatter')
  } finally {
    restore()
  }
}

export function testWorkspaceExportMenuIncludesGlbAction() {
  const gltf = WORKSPACE_EXPORT_MENU_ITEMS.find(item => item.id === 'gltf')
  if (!gltf) throw new Error('expected workspace export menu to include GLTF')
  if (!gltf.menuLabel.includes('.gltf')) throw new Error(`expected GLTF export menu label to name .gltf, got ${gltf.menuLabel}`)
  const glb = WORKSPACE_EXPORT_MENU_ITEMS.find(item => item.id === 'glb')
  if (!glb) throw new Error('expected workspace export menu to include GLB')
  if (!glb.menuLabel.includes('.glb')) throw new Error(`expected GLB export menu label to name .glb, got ${glb.menuLabel}`)
}

export function testWorkspaceExportMenuIncludesHtmlWorkspaceViewerCanvasParity() {
  const htmlWorkspace = WORKSPACE_EXPORT_MENU_ITEMS.find(item => item.id === 'htmlWorkspace')
  const htmlViewer = WORKSPACE_EXPORT_MENU_ITEMS.find(item => item.id === 'htmlViewer')
  const htmlCanvas = WORKSPACE_EXPORT_MENU_ITEMS.find(item => item.id === 'htmlCanvas')
  if (!htmlWorkspace) throw new Error('expected workspace export menu to include HTML Workspace')
  if (!htmlViewer) throw new Error('expected workspace export menu to include HTML Viewer')
  if (!htmlCanvas) throw new Error('expected workspace export menu to include HTML Canvas')
  if (htmlWorkspace.menuLabel !== 'HTML (.html) — Workspace') throw new Error(`unexpected HTML Workspace label: ${htmlWorkspace.menuLabel}`)
  if (htmlViewer.menuLabel !== 'HTML (.html) — Viewer') throw new Error(`unexpected HTML Viewer label: ${htmlViewer.menuLabel}`)
  if (htmlCanvas.menuLabel !== 'HTML (.html) — Canvas') throw new Error(`unexpected HTML Canvas label: ${htmlCanvas.menuLabel}`)
  const ids = WORKSPACE_EXPORT_MENU_ITEMS.map(item => item.id)
  const order = [ids.indexOf('htmlWorkspace'), ids.indexOf('htmlViewer'), ids.indexOf('htmlCanvas')]
  if (order.some(i => i < 0) || !(order[0] < order[1] && order[1] < order[2])) {
    throw new Error(`expected HTML export order Workspace -> Viewer -> Canvas, got ${order.join(',')}`)
  }
}

export async function testWorkspaceModelAssetExportPreservesImportedGltfJson() {
  const gltf = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    buffers: [{ byteLength: 4, uri: 'geometry.bin' }],
    images: [{ uri: 'data:image/png;base64,AAAA' }],
  })
  const text = buildGltfAssetMarkdown({
    name: 'spec-scene.gltf',
    sourceKind: 'local',
    text: gltf,
  })
  const asset = parseGlbAssetDocument(text)
  if (!asset) throw new Error('expected GLTF import manifest to parse')
  if (asset.validGltfAsset !== true || asset.gltfVersion !== '2.0') {
    throw new Error('expected GLTF import manifest to record a valid glTF 2.x asset')
  }
  if (asset.externalResourceCount !== 1 || asset.embeddedResourceCount !== 1) {
    throw new Error('expected GLTF import manifest to preserve external and embedded resource metadata')
  }

  const exported = await resolveModelAssetExportBlob({
    text,
    requestedFormat: 'gltf',
    fallbackBaseName: 'fallback',
  })
  if (!exported) throw new Error('expected imported GLTF manifest to export as a raw .gltf blob')
  if (exported.name !== 'spec-scene.gltf') throw new Error(`expected original .gltf export name, got ${exported.name}`)
  if (exported.blob.type !== GLTF_ASSET_MIME_TYPE) throw new Error(`expected GLTF MIME type, got ${exported.blob.type}`)
  const exportedText = await exported.blob.text()
  if (exportedText !== gltf) throw new Error('expected .gltf export to preserve the imported JSON payload')
  if (exportedText.includes('kgAssetType') || exportedText.includes('kgAssetFormat')) {
    throw new Error('expected .gltf export to avoid writing workspace manifest metadata into the asset file')
  }
}

export async function testWorkspaceModelAssetExportPreservesImportedGlbContainer() {
  const glbBytes = createGlbBytes({
    json: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      buffers: [{ byteLength: 3 }],
    },
    bin: new Uint8Array([1, 2, 3]),
  })
  const glbBuffer = new ArrayBuffer(glbBytes.byteLength)
  new Uint8Array(glbBuffer).set(glbBytes)
  const text = buildGlbAssetMarkdown({
    name: 'spec-scene.glb',
    sourceKind: 'local',
    buffer: glbBuffer,
  })
  const asset = parseGlbAssetDocument(text)
  if (!asset) throw new Error('expected GLB import manifest to parse')
  if (asset.validMagic !== true || asset.validContainer !== true || asset.validGltfAsset !== true) {
    throw new Error('expected GLB import manifest to record a valid glTF 2.x binary container')
  }

  const exported = await resolveModelAssetExportBlob({
    text,
    requestedFormat: 'glb',
    fallbackBaseName: 'fallback',
  })
  if (!exported) throw new Error('expected imported GLB manifest to export as a raw .glb blob')
  if (exported.name !== 'spec-scene.glb') throw new Error(`expected original .glb export name, got ${exported.name}`)
  if (exported.blob.type !== GLB_ASSET_MIME_TYPE) throw new Error(`expected GLB MIME type, got ${exported.blob.type}`)
  const exportedBytes = new Uint8Array(await exported.blob.arrayBuffer())
  if (exportedBytes.byteLength !== glbBytes.byteLength) {
    throw new Error(`expected GLB export byte length ${glbBytes.byteLength}, got ${exportedBytes.byteLength}`)
  }
  for (let i = 0; i < glbBytes.byteLength; i += 1) {
    if (exportedBytes[i] !== glbBytes[i]) throw new Error(`expected GLB export byte ${i} to be preserved`)
  }
  const inspection = inspectGlbBytes(exportedBytes)
  if (!inspection.validContainer || inspection.assetVersion !== '2.0') {
    throw new Error('expected exported GLB bytes to remain a valid glTF 2.x binary container')
  }
}

export function testWorkspaceModelAssetGlbInspectionRejectsInvalidChunkOrderAndPadding() {
  const wrongOrder = inspectGlbBytes(createGlbBytes({
    json: {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 3 }],
    },
    bin: new Uint8Array([1, 2, 3]),
    order: 'bin-json',
  }))
  if (wrongOrder.validContainer || wrongOrder.validChunkOrder) {
    throw new Error('expected GLB inspector to reject BIN-before-JSON chunk order')
  }

  const wrongJsonPaddingJson = {
    asset: { version: '2.0' },
    extras: { forcePadding: 'x' },
  }
  while (new TextEncoder().encode(JSON.stringify(wrongJsonPaddingJson)).byteLength % 4 === 0) {
    wrongJsonPaddingJson.extras.forcePadding += 'x'
  }
  const wrongJsonPadding = inspectGlbBytes(createGlbBytes({
    json: wrongJsonPaddingJson,
    jsonPaddingByte: 0x00,
  }))
  if (wrongJsonPadding.validContainer || wrongJsonPadding.validJson) {
    throw new Error('expected GLB inspector to reject JSON chunk padding that is not trailing Space chars')
  }

  const wrongBinReference = inspectGlbBytes(createGlbBytes({
    json: {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 3, uri: 'external.bin' }],
    },
    bin: new Uint8Array([1, 2, 3]),
  }))
  if (wrongBinReference.validContainer || wrongBinReference.validBinReference) {
    throw new Error('expected GLB inspector to reject BIN chunk without a first uri-less JSON buffer')
  }

  const unknownBeforeBin = inspectGlbBytes(createGlbBytes({
    json: {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 3 }],
    },
    bin: new Uint8Array([1, 2, 3]),
    unknownBetweenJsonAndBin: true,
  }))
  if (unknownBeforeBin.validContainer || unknownBeforeBin.validChunkOrder) {
    throw new Error('expected GLB inspector to reject unknown chunks inserted before a BIN chunk')
  }
}

export async function testWorkspaceImportLargeLocalFileDefersHydrationUntilOpen() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const largeText = 'x'.repeat(Math.max(WORKSPACE_IMPORT_DEFER_LOCAL_FILE_BYTES + 32, 1024))
    const files = [createFile('large.json', largeText)]
    const res = await importWorkspaceLocalFiles({ fs, files, parentPath: '/' })
    if (res.createdPaths.length !== 1) throw new Error('expected 1 created path')

    const entries = await fs.listEntries()
    const largePath = entries.find(e => e.kind === 'file' && e.name === 'large.json')?.path || ''
    if (!largePath) throw new Error('expected large.json to be created')

    const before = await fs.readFileText(largePath)
    if (!before || !isPendingLocalImportStubText(before)) {
      throw new Error('expected large local import to write pending-import stub instead of eager file contents')
    }
    const pending = peekPendingWorkspaceLocalImport(largePath)
    if (!pending) throw new Error('expected pending local import handle for large.json')

    const hydrated = await hydrateWorkspaceFileFromPendingLocalImport({ fs, path: largePath })
    if (!hydrated || hydrated.text !== largeText) {
      throw new Error('expected hydration to restore original large file text')
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceImportWorkspaceFileJsonLdPreservesHighFidelityJsonLdFile() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const payload = {
      '@context': {
        kg: 'http://example.org/kg#',
        version: 'kg:version',
        document: 'kg:document',
        path: 'kg:path',
        text: 'kg:text',
      },
      '@type': 'kg:WorkspaceFile',
      version: 1,
      document: {
        '@type': 'kg:WorkspaceDocument',
        path: 'docs/note.md',
        text: '# Note\n',
      },
    }

    const files = [createFile('note.workspace.jsonld', `${JSON.stringify(payload, null, 2)}\n`)]
    const res = await importWorkspaceLocalFiles({ fs, files, parentPath: '/' })
    if (res.createdPaths.length !== 1) throw new Error('expected 1 created path')

    const entries = await fs.listEntries()
    const notePath = entries.find(e => e.kind === 'file' && e.name === 'note.workspace.jsonld')?.path || ''
    if (!notePath) throw new Error('expected note.workspace.jsonld to be preserved as a workspace file')

    const text = await fs.readFileText(notePath)
    if (text !== `${JSON.stringify(payload, null, 2)}\n`) {
      throw new Error(`expected workspace jsonld contents to round-trip exactly, got: ${JSON.stringify(text)}`)
    }
  } finally {
    restore()
  }
}

export function testWorkspaceFileJsonLdExportPreservesExistingHighFidelityDocument() {
  const payload = {
    '@context': {
      kg: 'http://example.org/kg#',
      version: 'kg:version',
      document: 'kg:document',
      path: 'kg:path',
      text: 'kg:text',
    },
    '@type': 'kg:WorkspaceFile',
    version: 1,
    document: {
      '@type': 'kg:WorkspaceDocument',
      path: 'docs/note.mdx',
      text: '# Note MDX\n',
    },
  }
  const raw = `${JSON.stringify(payload, null, 2)}\n`
  const exported = resolveWorkspaceFileJsonLdExport({
    activeDocumentPath: '/imports/note.workspace.jsonld',
    exportBaseName: 'note',
    text: raw,
  })
  if (exported.name !== 'note.workspace.jsonld') {
    throw new Error(`expected export to preserve original workspace jsonld filename, got ${exported.name}`)
  }
  if (exported.text !== raw) {
    throw new Error('expected export to preserve existing workspace jsonld content without nested wrapping')
  }
}

export async function testWorkspaceImportDoesNotAcceptLegacyKgw() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const supported = createFile('ok.md', '# ok\n')
    const legacy = createFile(
      'legacy.kgw',
      `${JSON.stringify(
        {
          kind: 'kg:workspaceFile',
          version: 1,
          document: { path: 'legacy.md', text: '# Legacy\n' },
        },
        null,
        2,
      )}\n`,
    )

    const res = await importWorkspaceLocalFiles({ fs, files: [supported, legacy], parentPath: '/' })
    if (res.createdPaths.length !== 1) throw new Error(`expected 1 created path, got ${res.createdPaths.length}`)
    if (!res.skipped.some(s => s.name === 'legacy.kgw' && s.reason === 'unsupported')) {
      throw new Error('expected legacy.kgw to be skipped as unsupported')
    }

    const entries = await fs.listEntries()
    const hasLegacy = entries.some(e => e.kind === 'file' && e.name === 'legacy.kgw')
    if (hasLegacy) throw new Error('expected legacy.kgw not to be imported into workspace fs')
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLocalFolderCreatesNestedFolders() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const file = createFile('note.md', '# Note\n')
    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'MyFolder/sub/note.md',
      configurable: true,
    })

    const files = [file]
    const res = await importWorkspaceLocalFolder({ fs, files })
    if (res.createdPaths.length !== 1) throw new Error('expected 1 created path')

    const entries = await fs.listEntries()
    const hasMyFolder = entries.some(e => e.kind === 'folder' && e.name === 'MyFolder')
    const hasSub = entries.some(e => e.kind === 'folder' && e.name === 'sub')
    const hasNote = entries.some(e => e.kind === 'file' && e.name === 'note.md')
    if (!hasMyFolder || !hasSub || !hasNote) {
      throw new Error('expected nested folder import to create folders and file')
    }

    const notePath = entries.find(e => e.kind === 'file' && e.name === 'note.md')?.path || ''
    if (!notePath) throw new Error('expected note.md path')
    const before = await fs.readFileText(notePath)
    if (!before || !isPendingLocalImportStubText(before)) {
      throw new Error('expected folder import to write a pending-import stub instead of eager file contents')
    }
    const pending = peekPendingWorkspaceLocalImport(notePath)
    if (!pending) throw new Error('expected pending local import handle for note.md')
    const hydrated = await hydrateWorkspaceFileFromPendingLocalImport({ fs, path: notePath })
    if (!hydrated || hydrated.text.trim() !== '# Note') {
      throw new Error('expected hydration to load original file text')
    }
    const after = await fs.readFileText(notePath)
    if (!after || !after.includes('# Note')) throw new Error('expected hydrated file to be written into workspace fs')
  } finally {
    restore()
  }
}

export async function testNormalizeWorkspacePathCollapsesExtraSlashes() {
  const actual = normalizeWorkspacePath('///a//b///c.md')
  if (actual !== '/a/b/c.md') throw new Error(`expected /a/b/c.md, got: ${actual}`)
}

export async function testWorkspaceImportSkipsUnsupportedFilesButContinues() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const supported = createFile('ok.md', '# ok\n')
    const unsupported = new File([new Blob(['x'], { type: 'application/octet-stream' })], 'image.bin', { type: 'application/octet-stream' })

    Object.defineProperty(supported, 'webkitRelativePath', { value: 'MyFolder/ok.md', configurable: true })
    Object.defineProperty(unsupported, 'webkitRelativePath', { value: 'MyFolder/image.bin', configurable: true })

    const res = await importWorkspaceLocalFolder({ fs, files: [supported, unsupported] })
    if (res.createdPaths.length !== 1) throw new Error(`expected 1 created path, got ${res.createdPaths.length}`)
    if (res.skipped.length !== 1) throw new Error(`expected 1 skipped file, got ${res.skipped.length}`)
    if (res.failed.length !== 0) throw new Error(`expected 0 failed files, got ${res.failed.length}`)

    const entries = await fs.listEntries()
    const hasOk = entries.some(e => e.kind === 'file' && e.name === 'ok.md')
    const hasImage = entries.some(e => e.kind === 'file' && e.name === 'image.bin')
    if (!hasOk) throw new Error('expected ok.md to be imported')
    if (hasImage) throw new Error('expected image.bin to be skipped')
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLocalFolderHydratesOnlyOpenedFile() {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const a = createFile('a.md', '# A\n')
    Object.defineProperty(a, 'webkitRelativePath', { value: 'MyFolder/a.md', configurable: true })
    const b = createFile('b.md', '# B\n')
    Object.defineProperty(b, 'webkitRelativePath', { value: 'MyFolder/b.md', configurable: true })

    await importWorkspaceLocalFolder({ fs, files: [a, b] })
    const entries = await fs.listEntries()
    const aPath = entries.find(e => e.kind === 'file' && e.name === 'a.md')?.path || ''
    const bPath = entries.find(e => e.kind === 'file' && e.name === 'b.md')?.path || ''
    if (!aPath || !bPath) throw new Error('expected both a.md and b.md paths')

    const hydratedA = await hydrateWorkspaceFileFromPendingLocalImport({ fs, path: aPath })
    if (!hydratedA || !hydratedA.text.includes('# A')) throw new Error('expected a.md to hydrate')

    const bText = await fs.readFileText(bPath)
    if (!bText || !isPendingLocalImportStubText(bText)) throw new Error('expected b.md to remain pending until opened')
    const pendingB = peekPendingWorkspaceLocalImport(bPath)
    if (!pendingB) throw new Error('expected b.md to remain pending after hydrating a.md')
  } finally {
    restore()
  }
}

export function testWorkspaceImportCanvasFrontmatterDocsOptIntoGraphLanding() {
  const canvasDoc = [
    '---',
    'title: "Video Demo"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: false',
    '$schema: "kgc-pipeline/v1"',
    'widget_bundle:',
    '  kind: kg:flow:widgetBundle',
    'flow:',
    '  nodes: []',
    '---',
    '',
    '# Video Demo',
  ].join('\n')
  const plainDoc = [
    '---',
    'title: "Plain Note"',
    'author: "demo"',
    '---',
    '',
    '# Plain Note',
  ].join('\n')

  if (!shouldApplyImportedCanvasDocumentToGraph({ path: DOCS_SSOT_VALIDATION_WORKSPACE_PATH, text: canvasDoc })) {
    throw new Error('expected imported canvas frontmatter markdown to opt into graph-aware landing')
  }
  if (shouldApplyImportedCanvasDocumentToGraph({ path: '/note.md', text: plainDoc })) {
    throw new Error('expected plain markdown import to remain passive')
  }
  if (shouldApplyImportedCanvasDocumentToGraph({ path: '/diagram.txt', text: canvasDoc })) {
    throw new Error('expected non-markdown imports to remain passive even when text looks like frontmatter')
  }
}

export async function testWorkspaceImportCanvasPresetAppliesNonFrontmatterFlowGraphLanding() {
  const { restore } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const store = useGraphStore.getState()
    store.resetAll()
    store.setCanvasRenderMode('2d')
    store.setCanvas2dRenderer('d3')
    store.setDocumentSemanticMode('keyword')
    store.setFrontmatterModeEnabled(false)

    const text = [
      '---',
      'title: "Mermaid Canvas Preset"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "storyboard"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      'kgMultiDimTableModeEnabled: false',
      '---',
      '',
      '```mermaid',
      'graph LR',
      '  A --> B',
      '```',
      '',
    ].join('\n')
    const file = createFile('mermaid-frontmatter.md', text)
    const result = await importWorkspaceLocalFiles({ fs, files: [file], parentPath: '/' })
    await applyWorkspaceImportToCanvas({ fs, createdPaths: result.createdPaths, opts: { applyToGraph: true } })
    await activateFirstImportedWorkspaceFile({ fs, createdPaths: result.createdPaths, applyToGraph: true })

    const next = useGraphStore.getState()
    if (next.canvas2dRenderer !== 'storyboard') {
      throw new Error(`expected workspace import to honor Storyboard preset for parsed non-frontmatter-flow graph, got ${String(next.canvas2dRenderer || '')}`)
    }
    if (next.documentSemanticMode !== 'document') {
      throw new Error(`expected workspace import to honor document semantic mode from frontmatter preset, got ${String(next.documentSemanticMode || '')}`)
    }
    if (next.frontmatterModeEnabled !== true) {
      throw new Error('expected workspace import to enable frontmatter mode for parsed non-frontmatter-flow graph preset')
    }
  } finally {
    restore()
  }
}

export async function testWorkspaceImportLocalStrybldrMarkdownActivatesRunnableRunAllSurface() {
  const { restore } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const store = useGraphStore.getState()
    store.resetAll()
    store.setCanvasRenderMode('2d')
    store.setCanvas2dRenderer('d3')
    store.setDocumentSemanticMode('keyword')
    store.setFrontmatterModeEnabled(false)
    store.setFloatingPanelOpen(false)
    store.setFloatingPanelView('chat')

    const input = readStrybldrLocalImportInput()
    const file = createFile(input.name, input.text)
    const result = await importWorkspaceLocalFiles({ fs, files: [file], parentPath: '/' })
    const importedPath = String(result.createdPaths[0] || '').trim()
    if (!importedPath) throw new Error('expected local Strybldr import to create a workspace file')

    const applyToGraph = await resolveImportedCanvasDocumentApplyToGraph({ fs, createdPaths: result.createdPaths })
    if (!applyToGraph) throw new Error('expected imported Strybldr markdown to opt into graph-aware landing')

    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: result.createdPaths,
      opts: { applyToGraph: true, skipComposedGraphApply: true },
    })
    const afterApply = useGraphStore.getState()
    if (afterApply.canvasRenderMode !== '2d') {
      throw new Error(`expected local Strybldr import apply to set 2d render mode, got ${String(afterApply.canvasRenderMode || '')}`)
    }
    if (afterApply.canvas2dRenderer !== 'storyboard') {
      throw new Error(`expected local Strybldr import apply to set Storyboard renderer, got ${String(afterApply.canvas2dRenderer || '')}`)
    }
    if (String(afterApply.floatingPanelView) === 'strybldr') {
      throw new Error('expected local Strybldr import apply not to mount a stale Strybldr panel')
    }

    await activateFirstImportedWorkspaceFile({ fs, createdPaths: result.createdPaths, applyToGraph: true })
    const next = useGraphStore.getState()
    if (useMarkdownExplorerStore.getState().activePath !== importedPath) throw new Error(`expected local Strybldr activation to focus imported file, got ${String(useMarkdownExplorerStore.getState().activePath || '')}`)
    if (next.canvas2dRenderer !== 'storyboard') throw new Error(`expected local Strybldr activation to keep Storyboard renderer, got ${String(next.canvas2dRenderer || '')}`)
    if (String(next.floatingPanelView) === 'strybldr') throw new Error('expected local Strybldr activation not to keep a stale Strybldr Run all panel mounted')

    const renderGraph = resolveActiveMarkdownBaseGraph({
      baseGraphDataRaw: next.graphData,
      markdownName: next.markdownDocumentName,
      markdownText: input.text,
    })
    if (!renderGraph || (renderGraph.metadata as Record<string, unknown> | null)?.pending === true) {
      throw new Error('expected local Strybldr import graph to stay active for the rendered Storyboard canvas')
    }
    const board = buildStoryboardBoardModel({ graphData: renderGraph, graphRevision: 1 })
    const lanes = new Set(board.lanes.map(lane => lane.id))
    if (!lanes.has('Source') || !lanes.has('Elements')) throw new Error(`expected local Strybldr graph to expose Source and Elements lanes, got ${Array.from(lanes).join(', ')}`)
    if (/"storytree"\s*:/.test(input.text) && !lanes.has('Storytree')) throw new Error(`expected local Strytree graph to expose Storytree lane, got ${Array.from(lanes).join(', ')}`)
    if (/"candidateRuns"\s*:/.test(input.text) && !lanes.has('ForkCompare')) throw new Error(`expected local Strytree graph to expose ForkCompare lane, got ${Array.from(lanes).join(', ')}`)
    if (/(youtube\.com|youtu\.be|kgYoutubeVideoId)/i.test(input.text)) {
      const cards = board.lanes.flatMap(lane => lane.cards)
      if (!cards.some(card => card.media?.kind === 'iframe' && /\/embed\//i.test(card.media.url))) {
        throw new Error(`expected local Strybldr YouTube source to expose renderable iframe media, got ${JSON.stringify(cards.map(card => card.media))}`)
      }
      const frameReference = cards.flatMap(card => card.references).find(reference => reference.kind === 'image' && reference.url.startsWith('/__video_frame?'))
      if (!frameReference) throw new Error(`expected local Strybldr YouTube source to expose frame-extraction image references, got ${JSON.stringify(cards.map(card => card.references))}`)
      const frameRequest = new URL(frameReference.url, 'https://example.test')
      if (!frameRequest.searchParams.get('url') || frameRequest.searchParams.get('time') !== '0') throw new Error(`expected local Strybldr frame extraction request to carry source URL and default timestamp, got ${frameReference.url}`)
      if (!cards.some(card => card.references.some(reference => reference.kind === 'image' && /ytimg\.com\/vi\//i.test(reference.url)))) {
        throw new Error(`expected local Strybldr YouTube source to retain provider-safe fallback thumbnail references, got ${JSON.stringify(cards.map(card => card.references))}`)
      }
    }
    const handoff = buildStrybldrVideoHandoffFromGraphData(next.graphData)
    if (handoff.cards.length < 2 || !handoff.prompt.includes('approved Strybldr storyboard cards')) {
      throw new Error('expected local Strybldr graph to compile a runnable Toolbar Run all handoff prompt')
    }
    if (/"storytree"\s*:/.test(input.text) && !handoff.cards.some(card => card.lane === 'Storytree')) {
      throw new Error(`expected local Strytree import to feed Storytree cards into Toolbar Run all, got ${JSON.stringify(handoff.cards)}`)
    }
    if (/(youtube\.com|youtu\.be|kgYoutubeVideoId)/i.test(input.text) && !/ytimg\.com\/vi\//i.test(String(handoff.referenceImageUrl || ''))) {
      throw new Error(`expected local Strybldr Run all handoff to carry a thumbnail reference image, got ${String(handoff.referenceImageUrl || '')}`)
    }
    if (/(youtube\.com|youtu\.be|kgYoutubeVideoId)/i.test(input.text) && !handoff.cards.some(card => card.references.some(reference => reference.startsWith('/__video_frame?')))) throw new Error(`expected local Strybldr Run all handoff cards to carry frame-extraction references, got ${JSON.stringify(handoff.cards)}`)
  } finally {
    restore()
  }
}

export async function testActivateFirstImportedWorkspaceFilePreservesImportedFrontmatterLandingFromPreviousSelection() {
  const { restore } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const store = useGraphStore.getState()
    const explorer = useMarkdownExplorerStore.getState()
    store.resetAll()
    store.setCanvasRenderMode('2d')
    store.setCanvas2dRenderer('d3')
    store.setDocumentSemanticMode('keyword')
    store.setFrontmatterModeEnabled(false)

    const priorActiveText = [
      '---',
      'title: "Workspace README"',
      'kgCanvasSurfaceMode: "2d"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "d3"',
      'kgDocumentSemanticMode: "keyword"',
      'kgFrontmatterModeEnabled: false',
      'kgMultiDimTableModeEnabled: true',
      '---',
      '',
      '```mermaid',
      'graph LR',
      '  A --> B',
      '```',
      '',
    ].join('\n')
    const priorActiveFile = createFile('README.md', priorActiveText)
    const priorActiveImport = await importWorkspaceLocalFiles({ fs, files: [priorActiveFile], parentPath: '/' })
    explorer.setActivePath('/README.md')
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: priorActiveImport.createdPaths,
      opts: { applyToGraph: true, skipComposedGraphApply: true },
    })

    const afterPriorActiveImport = useGraphStore.getState()
    if (afterPriorActiveImport.canvas2dRenderer !== 'd3') {
      throw new Error(`expected prior active import to land on d3, got ${String(afterPriorActiveImport.canvas2dRenderer || '')}`)
    }

    const videoText = readDocsSsotFixtureText(DOCS_SSOT_VALIDATION_FIXTURE_BASENAME)
    const videoFile = createFile(DOCS_SSOT_VALIDATION_FIXTURE_BASENAME, videoText)
    const videoImport = await importWorkspaceLocalFiles({ fs, files: [videoFile], parentPath: '/' })
    const importedVideoPath = String(videoImport.createdPaths[0] || '').trim()
    if (!importedVideoPath) {
      throw new Error('expected imported video path')
    }

    // Keep the previously active path selected to reproduce stale active-document state.
    explorer.setActivePath('/README.md')
    await activateFirstImportedWorkspaceFile({ fs, createdPaths: videoImport.createdPaths, applyToGraph: true })

    const next = useGraphStore.getState()
    if (useMarkdownExplorerStore.getState().activePath !== importedVideoPath) {
      throw new Error(`expected import activation to focus imported video doc, got ${String(useMarkdownExplorerStore.getState().activePath || '')}`)
    }
    if (next.canvasRenderMode !== '2d') {
      throw new Error(`expected video import to preserve 2d render mode, got ${String(next.canvasRenderMode || '')}`)
    }
    if (next.canvas2dRenderer !== 'storyboard') {
      throw new Error(`expected video import to preserve storyboard renderer, got ${String(next.canvas2dRenderer || '')}`)
    }
    if (next.documentSemanticMode !== 'document') {
      throw new Error(`expected video import to preserve document mode, got ${String(next.documentSemanticMode || '')}`)
    }
    if (next.frontmatterModeEnabled !== true) {
      throw new Error('expected video import to preserve frontmatter mode')
    }
    if (next.multiDimTableModeEnabled !== false) {
      throw new Error('expected video import to preserve multi-dimensional table disablement from frontmatter')
    }
  } finally {
    restore()
  }
}
