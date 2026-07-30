import { fetchWorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport'
import { parseStandaloneSpatialCaptureManifest } from '@/features/markdown-workspace/workspaceImport/spatialCaptureFileset'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import { resolveSpatialCaptureUrlContentForImport } from '@/features/markdown-workspace/workspaceImport/urlSpatialCaptureImportProbe'
import { importLocalFilesFallback, importUrlFallback } from '@/features/toolbar/launchDropdownFallbacks'
import { resetWorkspaceFsForTests, getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useGraphStore } from '@/hooks/useGraphStore'
import { SOURCE_FILES_FORMATS } from '@/lib/config-copy/importExportCopy'
import { runLaunchImportLocalFiles, runLaunchImportUrl } from '@/lib/toolbar/launchImportDispatch'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

function assertSpatialManifest(text: string, format: 'ply' | 'spz') {
  for (const expected of [
    `kgAssetFormat: "${format}"`,
    `kgSpatialCaptureFormat: "${format}"`,
    'kgSpatialCaptureFileset: false',
    'kgXrIngestionPipeline: "source-manifest"',
    'kgXrIngestionCacheKey:',
    'kgXrRenderCacheKey:',
  ]) {
    if (!text.includes(expected)) throw new Error(`expected spatial capture manifest to include ${expected}`)
  }
}

const tinyPlyText = [
  'ply',
  'format ascii 1.0',
  'element vertex 1',
  'property float x',
  'property float y',
  'property float z',
  'property uchar red',
  'property uchar green',
  'property uchar blue',
  'end_header',
  '0 0 0 255 255 255',
  '',
].join('\n')

function assertLaunchLandedInXrMode(label: string) {
  const state = useGraphStore.getState()
  if (state.canvasRenderMode !== '3d' || state.canvas3dMode !== 'xr') {
    throw new Error(`expected ${label} to land in XR Mode, got ${JSON.stringify({ canvasRenderMode: state.canvasRenderMode, canvas3dMode: state.canvas3dMode })}`)
  }
}

function assertScanNeutralSpatialCapturePath(label: string, activePath: string) {
  if (!/^\/scan-neutral\.spatial-capture(?:-\d+)?\.md$/.test(activePath)) {
    throw new Error(`expected ${label} to activate a scan-neutral spatial capture manifest, got ${activePath}`)
  }
}

async function resetLaunchImportTestState() {
  try {
    window.localStorage.clear()
    window.sessionStorage.clear()
  } catch {
    void 0
  }
  resetWorkspaceFsForTests()
  useGraphStore.getState().resetAll()
  await new Promise(resolve => setTimeout(resolve, 120))
  try {
    window.localStorage.clear()
    window.sessionStorage.clear()
  } catch {
    void 0
  }
  resetWorkspaceFsForTests()
}

export async function testWorkspaceImportXrStandalonePlyUrlUsesHeadMimeHintForExtensionlessAssets() {
  resetWorkspaceUrlContentCacheForTests()
  const originalFetch = globalThis.fetch
  let requestCount = 0
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestCount += 1
    if (String(init?.method || 'GET').toUpperCase() !== 'HEAD') {
      throw new Error('extensionless PLY URL import should only use HEAD MIME/name hints')
    }
    return new Response('', {
      status: 200,
      headers: {
        'content-type': 'model/ply; charset=binary',
        'content-disposition': 'attachment; filename="scan-neutral.ply"',
      },
    })
  }) as typeof fetch
  try {
    const imported = await fetchWorkspaceUrlContent('https://assets.example.test/download?id=scan-neutral', { mode: 'import' })
    if (requestCount !== 1) throw new Error(`expected one HEAD probe for ambiguous spatial capture URL, got ${requestCount}`)
    if (imported.name !== 'scan-neutral.spatial-capture.md') throw new Error(`expected manifest name from content-disposition, got ${imported.name}`)
    assertSpatialManifest(imported.text, 'ply')
  } finally {
    globalThis.fetch = originalFetch
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testWorkspaceImportXrStandaloneGenericUrlSkipsSpatialHeadProbe() {
  const originalFetch = globalThis.fetch
  let requestCount = 0
  globalThis.fetch = (async () => {
    requestCount += 1
    throw new Error('generic URL import should not run a spatial capture HEAD probe')
  }) as typeof fetch
  try {
    const imported = await resolveSpatialCaptureUrlContentForImport({
      normalizedUrl: 'https://example.test/articles/plain-note',
      sourceUrl: 'https://example.test/articles/plain-note',
      headFetchPath: '/api/download?url=https%3A%2F%2Fexample.test%2Farticles%2Fplain-note',
    })
    if (requestCount !== 0) throw new Error(`expected no spatial HEAD probe for generic URL, got ${requestCount}`)
    if (imported) throw new Error(`expected generic URL to skip spatial import, got ${imported.name}`)
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testLaunchImportUrlFallsBackWhenBridgeCreatesNoWorkspacePath() {
  const calls: string[] = []
  await runLaunchImportUrl({
    urlRaw: 'https://assets.example.test/scan-neutral.ply',
    bridge: {
      importUrl: async url => {
        calls.push(`bridge:${url}`)
        return undefined
      },
    },
    fallback: async url => {
      calls.push(`fallback:${url}`)
      return { createdPaths: ['/scan-neutral.spatial-capture.md'] }
    },
  })
  const expected = 'bridge:https://assets.example.test/scan-neutral.ply,fallback:https://assets.example.test/scan-neutral.ply'
  if (calls.join(',') !== expected) throw new Error(`expected Launch Import URL to fall back after no-op bridge, got ${calls.join(',')}`)
}

export async function testLaunchImportUrlSkipsFallbackWhenBridgeCreatesWorkspacePath() {
  const calls: string[] = []
  const result = await runLaunchImportUrl({
    urlRaw: 'https://example.test/article',
    bridge: {
      importUrl: async url => {
        calls.push(`bridge:${url}`)
        return { createdPaths: ['/article.md'], removedPaths: [] }
      },
    },
    fallback: async url => {
      calls.push(`fallback:${url}`)
      return { createdPaths: ['/duplicate.md'] }
    },
  })
  if (calls.join(',') !== 'bridge:https://example.test/article') {
    throw new Error(`expected a successful Launch Import URL bridge to skip fallback, got ${calls.join(',')}`)
  }
  if (!result || result.createdPaths?.[0] !== '/article.md') {
    throw new Error(`expected Launch Import URL to preserve bridge mutation evidence, got ${JSON.stringify(result)}`)
  }
}

export async function testLaunchImportUrlSkipsFallbackWhenBridgeHandledWithoutWorkspacePath() {
  const calls: string[] = []
  const result = await runLaunchImportUrl({
    urlRaw: 'https://example.test/article',
    bridge: {
      importUrl: async url => {
        calls.push(`bridge:${url}`)
        return { handled: true, createdPaths: [], removedPaths: [] }
      },
    },
    fallback: async url => {
      calls.push(`fallback:${url}`)
      return { createdPaths: ['/duplicate.md'] }
    },
  })
  if (calls.join(',') !== 'bridge:https://example.test/article') {
    throw new Error(`expected handled Launch Import URL evidence to prevent a duplicate fallback, got ${calls.join(',')}`)
  }
  if (!result || result.handled !== true || result.createdPaths?.length !== 0) {
    throw new Error(`expected Launch Import URL to preserve handled no-path evidence, got ${JSON.stringify(result)}`)
  }
}

export async function testLaunchImportLocalFilesFallsBackWhenBridgeRejects() {
  const calls: string[] = []
  const file = new File([tinyPlyText], 'scan-neutral.ply', { type: 'model/ply' })
  await runLaunchImportLocalFiles({
    files: [file] as unknown as FileList,
    bridge: {
      importLocalFiles: async files => {
        calls.push(`bridge:${Array.from(files || []).map(item => item.name).join('|')}`)
        throw new Error('stale workspace bridge')
      },
    },
    fallback: async files => {
      calls.push(`fallback:${files.map(item => item.name).join('|')}`)
      return { createdPaths: ['/scan-neutral.spatial-capture.md'] }
    },
  })
  const expected = 'bridge:scan-neutral.ply,fallback:scan-neutral.ply'
  if (calls.join(',') !== expected) throw new Error(`expected Launch local import to fall back after rejected bridge, got ${calls.join(',')}`)
}

export async function testLaunchImportUrlFallbackActivatesXrModeForStandalonePlyUrl() {
  const { restore } = initJsdomHarness()
  try {
    await resetLaunchImportTestState()
    resetWorkspaceUrlContentCacheForTests()
    await importUrlFallback({
      urlRaw: 'https://assets.example.test/scan-neutral.ply',
      pushUiToast: () => void 0,
    })
    const activePath = String(useMarkdownExplorerStore.getState().activePath || '')
    assertScanNeutralSpatialCapturePath('Import URL fallback', activePath)
    const fs = await getWorkspaceFs()
    const text = String((await fs.readFileText(activePath)) || '')
    assertSpatialManifest(text, 'ply')
    const manifest = parseStandaloneSpatialCaptureManifest(text)
    if (!manifest || manifest.sourceKind !== 'url' || manifest.sourceIdentity !== 'https://assets.example.test/scan-neutral.ply') {
      throw new Error('expected Import URL fallback to preserve URL spatial capture identity')
    }
    assertLaunchLandedInXrMode('Import URL fallback')
  } finally {
    await resetLaunchImportTestState()
    restore()
    resetWorkspaceUrlContentCacheForTests()
  }
}

export async function testLaunchImportLocalFilesFallbackActivatesXrModeForStandalonePlyFile() {
  const { restore } = initJsdomHarness()
  try {
    await resetLaunchImportTestState()
    const file = new File([tinyPlyText], 'scan-neutral.ply', { type: 'model/ply' })
    await importLocalFilesFallback({
      files: [file] as unknown as FileList,
      pushUiToast: () => void 0,
    })
    const activePath = String(useMarkdownExplorerStore.getState().activePath || '')
    assertScanNeutralSpatialCapturePath('Import local files fallback', activePath)
    const fs = await getWorkspaceFs()
    const text = String((await fs.readFileText(activePath)) || '')
    assertSpatialManifest(text, 'ply')
    const manifest = parseStandaloneSpatialCaptureManifest(text)
    if (!manifest || manifest.pendingLocalImport !== true || manifest.pendingLocalPath !== activePath) {
      throw new Error('expected Import local files fallback to preserve pending local PLY identity')
    }
    assertLaunchLandedInXrMode('Import local files fallback')
  } finally {
    await resetLaunchImportTestState()
    restore()
  }
}

export function testWorkspaceImportXrStandalonePlyLaunchImportFormatsStayAdvertised() {
  const importFormats = new Set(SOURCE_FILES_FORMATS.import.map(ext => ext.toLowerCase()))
  for (const ext of ['.ply', '.spz', '.gltf', '.glb']) {
    if (!importFormats.has(ext)) throw new Error(`expected Launch Import local files to accept ${ext}`)
  }
}
