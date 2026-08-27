import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readOptionalEnvFixture(envName: string): string {
  const relPath = typeof process.env[envName] === 'string' ? String(process.env[envName]).trim() : ''
  if (!relPath) return ''
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

export function testCanvasBaselineDefaultsUseStoryboardAndBlockLayout() {
  const configRenderPath = resolve(process.cwd(), 'src', 'lib', 'config.render.ts')
  const schemaPath = resolve(process.cwd(), 'src', 'lib', 'graph', 'schema.ts')
  const importDefaultsPath = resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'applyWorkspaceImportToCanvas.ts')
  const graphStorePath = resolve(process.cwd(), 'src', 'hooks', 'useGraphStore.ts')

  const configRenderText = readFileSync(configRenderPath, 'utf8')
  const schemaText = readFileSync(schemaPath, 'utf8')
  const importDefaultsText = readFileSync(importDefaultsPath, 'utf8')
  const graphStoreText = readFileSync(graphStorePath, 'utf8')

  if (!configRenderText.includes("export const DEFAULT_CANVAS_2D_RENDERER: Canvas2dRendererId = 'storyboard'")) {
    throw new Error('expected default 2d renderer baseline to be Storyboard')
  }
  if (!schemaText.includes("layout: {\n    mode: 'block'")) {
    throw new Error('expected schema baseline layout mode to default to block')
  }
  if (!importDefaultsText.includes("store.setCanvas2dRenderer(DEFAULT_CANVAS_2D_RENDERER)")) {
    throw new Error('expected workspace import defaults to reuse DEFAULT_CANVAS_2D_RENDERER')
  }
  if (!importDefaultsText.includes('store.setFrontmatterModeEnabled(true)')) {
    throw new Error('expected workspace import defaults to keep frontmatter mode enabled')
  }
  if (!importDefaultsText.includes("mode: 'block'")) {
    throw new Error('expected workspace import defaults to keep block layout baseline')
  }
  if (!graphStoreText.includes('rawLayoutMode')) {
    throw new Error('expected graph store schema init to preserve existing layout mode and avoid hard-reset churn')
  }
}

export function testWorkspaceSyncSubscriptionsUseSharedRuntimePersistenceKeys() {
  const sourceFilesBootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const graphStorePath = resolve(process.cwd(), 'src', 'hooks', 'useGraphStore.ts')
  const markdownRuntimePath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'MarkdownWorkspaceRuntime.impl.tsx')
  const syncKeysPath = resolve(process.cwd(), 'src', 'lib', 'async', 'workspaceSyncKeys.ts')
  const canvasPagePath = resolve(process.cwd(), 'src', 'pages', 'Canvas.tsx')

  const sourceFilesBootstrapText = readFileSync(sourceFilesBootstrapPath, 'utf8')
  const graphStoreText = readFileSync(graphStorePath, 'utf8')
  const markdownRuntimeText = readFileSync(markdownRuntimePath, 'utf8')
  const syncKeysText = readFileSync(syncKeysPath, 'utf8')
  const canvasPageText = readFileSync(canvasPagePath, 'utf8')

  if (!syncKeysText.includes('WORKSPACE_SYNC_SCOPE_SOURCE_FILES_RUNTIME_PERSISTENCE')) {
    throw new Error('expected workspace sync keys ssot to define source-files runtime-persistence scope')
  }
  if (!syncKeysText.includes('WORKSPACE_SYNC_SCOPE_PER_DOCUMENT_UI_RUNTIME_PERSISTENCE')) {
    throw new Error('expected workspace sync keys ssot to define per-document-ui runtime-persistence scope')
  }
  if (!syncKeysText.includes('WORKSPACE_SYNC_SCOPE_CANVAS_TAB_SYNC_RUNTIME_PERSISTENCE')) {
    throw new Error('expected workspace sync keys ssot to define canvas tab-sync runtime-persistence scope')
  }
  if (!syncKeysText.includes('WORKSPACE_SYNC_SCOPE_CANVAS_PREVIEW_WRITEBACK_RUNTIME_PERSISTENCE')) {
    throw new Error('expected workspace sync keys ssot to define canvas preview writeback runtime-persistence scope')
  }
  if (!sourceFilesBootstrapText.includes('WORKSPACE_SYNC_SCOPE_SOURCE_FILES_RUNTIME_PERSISTENCE')) {
    throw new Error('expected source-files persistence subscriptions to reuse shared runtime-persistence scope key')
  }
  if (!graphStoreText.includes('WORKSPACE_SYNC_SCOPE_PER_DOCUMENT_UI_RUNTIME_PERSISTENCE')) {
    throw new Error('expected per-document ui persistence subscription to reuse shared runtime-persistence scope key')
  }
  if (!markdownRuntimeText.includes('WORKSPACE_SYNC_SCOPE_MARKDOWN_WORKSPACE_PREFS_RUNTIME_PERSISTENCE')) {
    throw new Error('expected markdown workspace prefs persistence to use shared runtime-persistence scope key')
  }
  if (!canvasPageText.includes('WORKSPACE_SYNC_SCOPE_CANVAS_TAB_SYNC_RUNTIME_PERSISTENCE')) {
    throw new Error('expected canvas tab-sync subscriptions to reuse shared runtime-persistence scope key')
  }
  if (!canvasPageText.includes('WORKSPACE_SYNC_SCOPE_CANVAS_PREVIEW_WRITEBACK_RUNTIME_PERSISTENCE')) {
    throw new Error('expected canvas preview writeback subscriptions to reuse shared runtime-persistence scope key')
  }
}

export function testFrontmatterFlowDoesNotBuildSyntheticFallbackSubgraphMetadata() {
  const parserCorePath = resolve(process.cwd(), 'src', 'features', 'parsers', 'markdownFrontmatterFlowGraph.core.ts')
  const parserCoreText = readFileSync(parserCorePath, 'utf8')
  if (parserCoreText.includes("id: 'frontmatter:all'")) {
    throw new Error('expected frontmatter flow parser to avoid synthetic fallback subgraph metadata')
  }
}

export function testSourceFilesComposeDoesNotBlankPendingRemoteSeeds() {
  const composedSourcePath = resolve(process.cwd(), 'src', 'features', 'source-files', 'applyComposedGraphFromSourceFiles.ts')
  const guardPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'composedApplyGuards.ts')
  const text = readFileSync(composedSourcePath, 'utf8')
  const guardText = readFileSync(guardPath, 'utf8')
  if (!guardText.includes('export function resolveComposedApplyDeferralReason(args:')) {
    throw new Error('expected composed source graph runtime to centralize race-suppression decisions in a shared source-files helper')
  }
  if (!guardText.includes("return 'pending-remote-source'")) {
    throw new Error('expected composed source graph runtime guard helper to preserve live graph while pending remote seeds are still hydrating')
  }
  if (!text.includes('resolveComposedApplyDeferralReason({')) {
    throw new Error('expected composed source graph runtime to reuse the shared race-suppression helper')
  }
}

export function testCanvasWorkspaceFrontmatterPresetKeysAreDocumentedInSourceAndFixture() {
  const frontmatterPath = resolve(process.cwd(), 'src', 'lib', 'markdown', 'frontmatter.ts')
  const frontmatterText = readFileSync(frontmatterPath, 'utf8')
  const demoText = readOptionalEnvFixture('AG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_PATH')
  const seededVideoDemoText = readOptionalEnvFixture('AG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_SEEDED_PATH')
  const richMediaDemoText = readOptionalEnvFixture('AG_TEST_AGENTICGRAPH_RICH_MEDIA_GENERATION_DEMO_PATH')

  if (!frontmatterText.includes('kgCanvas2dRenderer')) {
    throw new Error('expected markdown frontmatter helpers to expose kgCanvas2dRenderer preset support')
  }
  if (!frontmatterText.includes('kgCanvasSurfaceMode')) {
    throw new Error('expected markdown frontmatter helpers to expose kgCanvasSurfaceMode preset support')
  }
  if (!frontmatterText.includes('kgCanvas3dMode')) {
    throw new Error('expected markdown frontmatter helpers to expose kgCanvas3dMode preset support')
  }
  if (!frontmatterText.includes('kgDocumentStructureBaselineLock')) {
    throw new Error('expected markdown frontmatter helpers to expose kgDocumentStructureBaselineLock preset support')
  }
  if (demoText && !demoText.includes('kgCanvasSurfaceMode: "2d"')) {
    throw new Error('expected rich-media demo fixture to declare 2d surface mode explicitly in frontmatter')
  }
  if (demoText && !demoText.includes('kgCanvas2dRenderer: "storyboard"')) {
    throw new Error('expected rich-media demo fixture to declare storyboardWidget preload in frontmatter')
  }
  if (seededVideoDemoText && !seededVideoDemoText.includes('kgCanvasSurfaceMode: "2d"')) {
    throw new Error('expected seeded video demo fixture to declare 2d surface mode explicitly in frontmatter')
  }
  if (seededVideoDemoText && !seededVideoDemoText.includes('kgMultiDimTableModeEnabled: false')) {
    throw new Error('expected seeded video demo fixture to disable multi-dimensional table mode explicitly in frontmatter')
  }
  if (richMediaDemoText && !richMediaDemoText.includes('kgCanvasSurfaceMode: "2d"')) {
    throw new Error('expected rich media generation seed to declare 2d surface mode explicitly in frontmatter')
  }
  if (richMediaDemoText && !richMediaDemoText.includes('kgMultiDimTableModeEnabled: false')) {
    throw new Error('expected rich media generation seed to disable multi-dimensional table mode explicitly in frontmatter')
  }
}
