import fs from 'node:fs'
import path from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'
import { applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'

export const testCanvasFrontmatterPresetClearsStaleBaselineLock = () => {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas3dMode('3d')
  useGraphStore.getState().setDocumentStructureBaselineLock(true)

  const changed = applyCanvasFrontmatterPreset({
    rawText: [
      '---',
      'title: "XR Surface Preset"',
      'kgCanvasSurfaceMode: "3d"',
      'kgCanvas3dMode: "xr"',
      '---',
      '',
      '# XR Surface Preset',
    ].join('\n'),
  })

  const state = useGraphStore.getState()
  if (changed !== true) throw new Error('expected workspace switch preset to apply explicit XR canvas frontmatter')
  if (state.documentStructureBaselineLock !== false) {
    throw new Error('expected explicit XR canvas frontmatter to clear stale baseline lock')
  }
  if (state.canvasRenderMode !== '3d') {
    throw new Error(`expected explicit XR canvas frontmatter to switch to 3d, got ${String(state.canvasRenderMode)}`)
  }
  if (state.canvas3dMode !== 'xr') {
    throw new Error(`expected explicit XR canvas frontmatter to switch to XR mode, got ${String(state.canvas3dMode)}`)
  }
}

export const testSourceFilesWidgetRegistryImportDisablesGeospatialMode = () => {
  const workspaceActionPath = path.resolve(
    process.cwd(),
    'src',
    'features',
    'markdown-workspace',
    'useWorkspaceFileActions',
    'core.ts',
  )
  const workspaceText = fs.readFileSync(workspaceActionPath, 'utf8')
  const rendererIndex = workspaceText.indexOf("store.setCanvas2dRenderer('storyboard')")
  const geoDisableIndex = workspaceText.indexOf('void setGeospatialModeEnabled(false).catch(() => void 0)')
  const viewModeIndex = workspaceText.indexOf("store.setWorkspaceViewMode('canvas')")
  if (rendererIndex < 0 || geoDisableIndex < 0 || viewModeIndex < 0) {
    throw new Error('Expected widget-registry import path to disable Geospatial Mode before switching to canvas Storyboard Widget view')
  }
  if (!(rendererIndex < geoDisableIndex && geoDisableIndex < viewModeIndex)) {
    throw new Error('Expected Geospatial Mode disable call to run after Storyboard renderer selection and before canvas view switch')
  }
  const sourceShouldApplyIndex = workspaceText.indexOf('const shouldApplyToGraph =')
  const sourcePolicyIndex = workspaceText.indexOf('shouldApplyImportedCanvasDocumentToGraph({ path: docKey || String(path || \'\'), text: content })')
  if (sourceShouldApplyIndex < 0 || sourcePolicyIndex < 0) {
    throw new Error('Expected Source Files sync path to infer apply-to-graph for frontmatter and flow markdown documents')
  }
  if (sourceShouldApplyIndex > sourcePolicyIndex) {
    throw new Error('Expected Source Files apply-to-graph policy to stay in the shared graph-apply resolution')
  }

  const documentActionPath = path.resolve(
    process.cwd(),
    'src',
    'hooks',
    'store',
    'graph-data-slice',
    'graphDataDocumentActions.ts',
  )
  const documentActionText = fs.readFileSync(documentActionPath, 'utf8')
  if (documentActionText.includes("nextState.setCanvas2dRenderer('storyboard')")
    || documentActionText.includes('void setGeospatialModeEnabled(false).catch(() => void 0)')) {
    throw new Error('Expected active markdown graph apply to avoid stale Storyboard Widget-only geospatial patches')
  }

  const presetPath = path.resolve(process.cwd(), 'src', 'features', 'parsers', 'canvasFrontmatterPreset.ts')
  const presetText = fs.readFileSync(presetPath, 'utf8')
  if (!presetText.includes('function disableGeospatialForDocumentPreset(): void')
    || !presetText.includes('readGeospatialOverlayEnabledPreferenceRaw()')
    || !presetText.includes("(!raw || raw === '0' || raw === 'false')")
    || !presetText.includes('publishGeospatialModeEnabledState(false)')
    || !presetText.includes('void setGeospatialModeEnabled(false).catch(() => void 0)')) {
    throw new Error('Expected shared canvas frontmatter preset application to republish explicit 2D state while avoiding repeated heavyweight runtime toggles')
  }

  const seedScriptPath = path.resolve(process.cwd(), '..', 'scripts', 'seed-storage-docs-to-cloudflare.mjs')
  const seedScriptText = fs.readFileSync(seedScriptPath, 'utf8')
  const seedSqlPath = path.resolve(process.cwd(), '..', 'scripts', 'lib', 'seed-storage-documents-d1.mjs')
  const seedSqlText = fs.readFileSync(seedSqlPath, 'utf8')
  if (!seedScriptText.includes("SUPPORTED_DOCS_FILE_EXTENSIONS = new Set(['.md', '.gltf', '.glb'])")
    || !seedScriptText.includes("docType: ext === '.gltf' ? 'gltf' : 'markdown'")
    || !seedScriptText.includes("docType: 'glb'")
    || !seedScriptText.includes("entity: 'documentChunk'")
    || !seedScriptText.includes("contentMd: chunkParts.length > 0 ? '' : contentText")
    || !seedSqlText.includes('ON CONFLICT(workspace_id, canonical_path) DO UPDATE SET')
    || !seedSqlText.includes('AND document_id = (${documentIdentitySql});')) {
    throw new Error('Expected D1 docs seeding to include Markdown, GLTF, and GLB source files with chunked large-document fallback')
  }

  const workspaceSeedProviderPath = path.resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'workspaceSeedProvider.ts')
  const workspaceSeedProviderText = fs.readFileSync(workspaceSeedProviderPath, 'utf8')
  const workspaceSourceMirrorFormatsPath = path.resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'workspaceSourceMirrorFormats.ts')
  const workspaceSourceMirrorFormatsText = fs.readFileSync(workspaceSourceMirrorFormatsPath, 'utf8')
  if (!workspaceSeedProviderText.includes("from '@/features/workspace-fs/workspaceSourceMirrorFormats'")
    || !workspaceSourceMirrorFormatsText.includes('SOURCE_FILES_FORMATS.importLocalText')
    || !workspaceSourceMirrorFormatsText.includes("'.gltf'")
    || !workspaceSourceMirrorFormatsText.includes("WORKSPACE_SOURCE_MIRROR_BINARY_EXTENSIONS = ['.glb', '.ply', '.spz']")
    || !workspaceSourceMirrorFormatsText.includes('shouldEncodeWorkspaceSourceMirrorAsBase64')
    || workspaceSeedProviderText.includes('MARKDOWN_MIRROR_EXT_SET')
    || workspaceSeedProviderText.includes('isMarkdownMirrorFileName')) {
    throw new Error('Expected D1 docs mirror materialization to reuse the shared Source Files mirror format owner without stale Markdown-only filters')
  }
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts')
  const viteConfigText = fs.readFileSync(viteConfigPath, 'utf8')
  if (!viteConfigText.includes('isWorkspaceSourceMirrorFileName')
    || !viteConfigText.includes('shouldEncodeWorkspaceSourceMirrorAsBase64')
    || !viteConfigText.includes('walkSourceMirrorFiles')) {
    throw new Error('Expected dev docs mirror proxy to reuse the shared Source Files mirror format owner instead of a stale markdown-only walker')
  }

  const geospatialBridgePath = path.resolve(
    process.cwd(),
    'src',
    'features',
    'geospatial',
    'gympgrphBridge.ts',
  )
  const geospatialBridgeText = fs.readFileSync(geospatialBridgePath, 'utf8')
  if (!geospatialBridgeText.includes('function publishGeospatialModeEnabled(enabled: boolean')
    || !geospatialBridgeText.includes('export function publishGeospatialModeEnabledState(enabled: boolean)')
    || !geospatialBridgeText.includes('emitGeospatialModeChanged({ enabled: next })')
    || !geospatialBridgeText.includes('const previous = publishMode(next, { emitAlways: true })')) {
    throw new Error('Expected geospatial bridge toggles to publish immediate local geospatial mode state before async module handoff so toolbar mode labels do not lag')
  }
}
