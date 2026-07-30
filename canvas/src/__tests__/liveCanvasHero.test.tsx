import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { LIVE_CANVAS_HERO_DOC_PATH, readLiveCanvasHeroContent } from '@/features/agentic-os/liveCanvasHeroContent'
import {
  LIVE_CANVAS_HERO_DEFAULT_QUERY_TOKENS,
  LIVE_CANVAS_HERO_TOKENS,
  appendLiveCanvasHeroToken,
  buildLiveCanvasHeroModel,
} from '@/features/agentic-os/liveCanvasHeroModel'
import {
  hasLiveCanvasHeroBlockingSearchParams,
  shouldDocumentSwitchOwnCanvasViewport,
  shouldShowLiveCanvasHero,
} from '@/features/canvas/liveCanvasHeroVisibility'
import { buildCanvasEmbedIframeMarkup } from '@/features/canvas/canvasEmbedIframeMarkup'
import { encodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'
import {
  KNOWGRPH_CANVAS_EMBED_MESSAGE_VERSION,
  KNOWGRPH_CANVAS_EMBED_SELECT_MESSAGE,
  resolveCanvasEmbedImport,
} from '@/features/canvas/canvasEmbedImportContract'
import { resolveLiveCanvasHeroEmbedUrl } from '@/features/canvas/liveCanvasHeroEmbed'
import { buildLocalDocCanvasEmbedUrl, isSameOriginCanvasEmbedUrl } from '@/features/canvas/canvasDocDeepLink'
import {
  LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT,
  readPersistedLiveCanvasHeroSourceSelection,
  readLiveCanvasHeroSourceSelection,
  selectLiveCanvasHeroSource,
} from '@/features/canvas/liveCanvasHeroSourceSelection'
import {
  resolveLiveCanvasHeroSource,
  resolveLiveCanvasHeroWorkspaceSourceState,
} from '@/features/canvas/useKnowgrphLiveCanvasHero'
import {
  applyFloatingPanelChatInputHandoff,
  consumeFloatingPanelChatInputHandoff,
  flushFloatingPanelChatInputHandoff,
  queueFloatingPanelChatInputHandoff,
} from '@/features/chat/floatingPanelChat/floatingPanelChatInputHandoff'
import { CHAT_INPUT_APPEND_EVENT } from '@/features/canvas/utils'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { buildSourceFileParseIdentityHash } from '@/features/source-files/sourceFileParseIdentity'
import {
  XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import { XR_PHYSICS_WORKSPACE_SEED_PATH } from '@/features/workspace-fs/workspaceFs'
import type { SourceFile } from '@/hooks/store/types'
import type { GraphData } from '@/lib/graph/types'
import { isRouterRootAliasRuntime } from '@/lib/routing/basePath'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

const EXPECTED_TOKENS = ['/video-agent', '@provider.byteplus', '@provider.openai', '#spec.low', '#spec.medium', '#spec.high', '@text', '@image', '@audio', '@video'] as const
const EXPECTED_DEFAULT_QUERY_PREFIX = '/video-agent @provider.byteplus @text @image @audio @video #spec.low'
const readExpectedDefaultQuery = () => buildLiveCanvasHeroModel().defaultQuery
const buildPublishedCanvasEmbedUrl = (canonicalPath: string, workspaceId?: string | null): string => (
  `https://airvio.co/knowgrph/share/${encodePublishedDocShareToken({ canonicalPath, workspaceId })}`
)
;(globalThis as typeof globalThis & { __KNOWGRPH_LIVE_CANVAS_HERO_MARKDOWN__?: string }).__KNOWGRPH_LIVE_CANVAS_HERO_MARKDOWN__ = readFileSync(
  resolve(process.cwd(), '..', LIVE_CANVAS_HERO_DOC_PATH),
  'utf8',
)

export function testLiveCanvasHeroEditorialCopyLoadsFromCanonicalMarkdownSource(): void {
  const expectedMarkdown = readFileSync(resolve(process.cwd(), '..', LIVE_CANVAS_HERO_DOC_PATH), 'utf8').trim()
  const content = readLiveCanvasHeroContent()
  if (content.markdown.trim() !== expectedMarkdown) {
    throw new Error('expected live canvas hero content loader to read the canonical markdown document')
  }
  if (
    content.eyebrow !== 'airvio · agentic canvas os'
    || content.headline.join(' ') !== 'Map intent Run agents Get results'
    || content.lede !== 'An agentic canvas that lets `/` route work, `#` set meaning, and `@` bind context.'
    || content.posture.join(' | ') !== '0 model calls before Run | Frontmatter SSOT | Approval-gated'
  ) {
    throw new Error(`expected canonical hero copy from markdown frontmatter, got ${JSON.stringify(content)}`)
  }
    }
function readPhysicsPlaygroundSource(): {
  text: string
  graphData: GraphData
  sourceFile: SourceFile
} {
  const path = resolve(process.cwd(), '..', XR_PHYSICS_DEMO_REPO_REL_PATH)
  const text = readFileSync(path, 'utf8')
  const parsed = tryParseMarkdownFrontmatterFlowGraph('knowgrph-physics-playground-demo.md', text)
  if (!parsed) throw new Error(`expected canonical Physics Playground to parse from ${path}`)
  const sourceFileId = 'physics-playground-live-hero-proof'
  return {
    text,
    graphData: parsed.graphData,
    sourceFile: {
      id: sourceFileId,
      name: 'knowgrph-physics-playground-demo.md',
      text,
      enabled: true,
      status: 'parsed',
      parsedParserId: 'markdown',
      parsedTextHash: buildSourceFileParseIdentityHash({
        cacheNamespace: `source-file:${sourceFileId}`,
        name: 'knowgrph-physics-playground-demo.md',
        text,
      }),
      parsedGraphRevision: 1,
      parsedGraphData: parsed.graphData,
      source: { kind: 'local', path: `workspace:${XR_PHYSICS_WORKSPACE_SEED_PATH}` },
    } as SourceFile,
  }
    }
export function testLiveCanvasHeroUsesSourceBackedInvocationContract(): void {
  if (JSON.stringify(LIVE_CANVAS_HERO_TOKENS) !== JSON.stringify(EXPECTED_TOKENS)) {
    throw new Error(`expected README-declared hero tokens, got ${JSON.stringify(LIVE_CANVAS_HERO_TOKENS)}`)
  }
  if (LIVE_CANVAS_HERO_DEFAULT_QUERY_TOKENS.join(' ') !== EXPECTED_DEFAULT_QUERY_PREFIX) {
    throw new Error(`expected exact raw default query, got ${LIVE_CANVAS_HERO_DEFAULT_QUERY_TOKENS.join(' ')}`)
  }
  const model = buildLiveCanvasHeroModel()
  if (!model.defaultQuery.startsWith(EXPECTED_DEFAULT_QUERY_PREFIX) || !model.defaultQuery.includes('Chinese, Cantonese, and English audio variants') || 'graphData' in model) {
    throw new Error('expected an editorial-only multilingual video-agent model with no synthetic graph')
  }
  for (const invocation of model.invocations) {
    if (!invocation.sourcePath.endsWith('generationInvocation.ts') || invocation.sourcePath.includes('/Users/')) {
      throw new Error(`expected portable generation grammar source for ${invocation.token}, got ${invocation.sourcePath}`)
    }
  }

  const { text } = readPhysicsPlaygroundSource()
  if (!text.includes('kgCanvasSurfaceMode: "xr"') || !text.includes('kgCanvasRenderMode: "3d"')) {
    throw new Error('expected the canonical startup document to own XR/3D initialization')
  }
}

export function testLiveCanvasHeroPhysicsPlaygroundSourceFidelity(): void {
  const { text, graphData, sourceFile } = readPhysicsPlaygroundSource()
  if (
    sourceFile.source?.path !== `workspace:${XR_PHYSICS_WORKSPACE_SEED_PATH}`
    || XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH !== `agentic-canvas-os/${XR_PHYSICS_DEMO_REPO_REL_PATH}`
  ) {
    throw new Error('expected local and published Physics Playground identities to resolve one canonical startup source')
  }
  if (!text.includes('auto_start: true') || graphData.nodes.length !== 4) {
    throw new Error(`expected the source-backed runtime-ready Physics Playground graph, got ${graphData.nodes.length} nodes/${graphData.edges.length} edges`)
  }
  const nodeIds = new Set(graphData.nodes.map(node => String(node.id)))
  for (const id of ['xr_demo_entry', 'xr_ball_controller', 'xr_rocket_controller', 'xr_runtime_gate']) {
    if (!nodeIds.has(id)) throw new Error(`expected authored Physics Playground node ${id}`)
  }
  for (const connection of ['from: "xr_demo_entry"', 'to: "xr_ball_controller"', 'to: "xr_rocket_controller"']) {
    if (!text.includes(connection)) throw new Error(`expected authored Physics Playground connection ${connection}`)
  }
}

export function testLiveCanvasHeroVisibilityFailsClosedOutsideHydratedApex(): void {
  if (!isRouterRootAliasRuntime('/knowgrph/', { pathname: '/', rootAliasBasePath: '/knowgrph/' })) {
    throw new Error('expected the injected apex alias marker to resolve as root alias runtime')
  }
  if (isRouterRootAliasRuntime('/knowgrph/', { pathname: '/knowgrph/', rootAliasBasePath: '/knowgrph/' })) {
    throw new Error('expected the canonical /knowgrph route to stay outside the apex hero runtime')
  }

  const { sourceFile } = readPhysicsPlaygroundSource()
  const defaultSeedState = resolveLiveCanvasHeroWorkspaceSourceState({
    sourceFiles: [sourceFile],
    markdownDocumentName: 'knowgrph-physics-playground-demo.md',
  })
  if (!defaultSeedState.defaultSeedOnly || defaultSeedState.meaningfulSourceFilesPresent) {
    throw new Error(`expected the default seed to remain hero-eligible, got ${JSON.stringify(defaultSeedState)}`)
  }
  const customSourceState = resolveLiveCanvasHeroWorkspaceSourceState({
    sourceFiles: [{ ...sourceFile, source: { kind: 'local', path: 'workspace:/product.md' } } as SourceFile],
    markdownDocumentName: 'product.md',
  })
  if (!customSourceState.meaningfulSourceFilesPresent || customSourceState.defaultSeedOnly) {
    throw new Error(`expected authored sources to suppress the hero, got ${JSON.stringify(customSourceState)}`)
  }
  const agenticVideoInitializationState = resolveLiveCanvasHeroWorkspaceSourceState({
    sourceFiles: [sourceFile, {
      ...sourceFile,
      id: 'agentic-video-canvas-demo',
      name: 'knowgrph-agentic-video-canvas-demo.md',
      source: { kind: 'local', path: 'workspace:/docs/knowgrph-agentic-video-canvas-demo.md' },
    }],
    markdownDocumentName: 'knowgrph-agentic-video-canvas-demo.md',
  })
  if (agenticVideoInitializationState.meaningfulSourceFilesPresent || !agenticVideoInitializationState.defaultSeedOnly) {
    throw new Error(`expected the canonical agentic video demo to remain part of landing initialization, got ${JSON.stringify(agenticVideoInitializationState)}`)
  }
  const canonicalDocsInitializationState = resolveLiveCanvasHeroWorkspaceSourceState({
    sourceFiles: [{ ...sourceFile, source: { kind: 'local', path: 'workspace:/docs/runtime-proof.md' } } as SourceFile],
    markdownDocumentName: 'runtime-proof.md',
  })
  if (canonicalDocsInitializationState.meaningfulSourceFilesPresent || !canonicalDocsInitializationState.defaultSeedOnly) {
    throw new Error(`expected the canonical docs corpus to remain landing initialization, got ${JSON.stringify(canonicalDocsInitializationState)}`)
  }

  const emptyGraph: GraphData = { type: 'Graph', nodes: [], edges: [] }
  const base = {
    isRootAlias: true,
    sourceFilesBootstrapReady: true,
    liveWorkspaceSourceReady: true,
    dismissed: false,
    hasSearchParams: false,
    isEmbeddedPreview: false,
    workspaceEditorOverlayOpen: false,
    workspaceDocumentSwitchPending: false,
    floatingPanelOpen: false,
    alternateCanvasSurfaceActive: false,
    defaultSeedOnly: true,
    meaningfulSourceFilesPresent: false,
    graphData: emptyGraph,
    markdownDocumentText: '',
  }
  if (!shouldShowLiveCanvasHero(base)) throw new Error('expected a source-ready apex workspace to show the hero')
  if (!hasLiveCanvasHeroBlockingSearchParams('?kgPath=%2Fknowgrph%2F', '/knowgrph/')) {
    throw new Error('expected the single-root workspace route alias to suppress Live Canvas Hero ownership')
  }
  if (!hasLiveCanvasHeroBlockingSearchParams('?kgDoc=workspace-readme.md&kgPreview=1', '/knowgrph/')) {
    throw new Error('expected a document preview query to suppress the outer Live Canvas Hero')
  }
  for (const homeOwnedSearch of [
    '?kgReleaseProof=163e44a5ecbd92ac3547878cc558a946a2a92ede',
    '?kgTrace=network-2',
    '?kgCanvasSurfaceMode=2d&kgCanvasRenderMode=2d&kgCanvas2dRenderer=storyboard&openEditorWorkspace=1',
    '?kgPath=%2Fknowgrph%2Fshare%2FeyJjYW5vbmljYWxQYXRoIjoiZG9jcyJ9',
  ]) {
    if (hasLiveCanvasHeroBlockingSearchParams(homeOwnedSearch, '/knowgrph/')) {
      throw new Error(`expected Home-owned runtime parameters to retain the Live Canvas Hero: ${homeOwnedSearch}`)
    }
  }
  const suppressions = [
    { isRootAlias: false },
    { sourceFilesBootstrapReady: false },
    { liveWorkspaceSourceReady: false },
    { dismissed: true },
    { hasSearchParams: true },
    { isEmbeddedPreview: true },
    { workspaceDocumentSwitchPending: true },
  ]
  for (const suppression of suppressions) {
    if (shouldShowLiveCanvasHero({ ...base, ...suppression })) {
      throw new Error(`expected hero suppression for ${JSON.stringify(suppression)}`)
    }
  }
  for (const persistedWorkspaceState of [
    { floatingPanelOpen: true },
    { alternateCanvasSurfaceActive: true },
  ]) {
    if (!shouldShowLiveCanvasHero({ ...base, ...persistedWorkspaceState })) {
      throw new Error(`expected apex hero to isolate persisted workspace state ${JSON.stringify(persistedWorkspaceState)}`)
    }
  }
  if (!shouldShowLiveCanvasHero({ ...base, meaningfulSourceFilesPresent: true, defaultSeedOnly: false })) {
    throw new Error('expected apex root landing to stay visible over authored workspace content until the user enters /knowgrph/')
  }
  const heroHookSource = readFileSync(new URL('../features/canvas/useKnowgrphLiveCanvasHero.ts', import.meta.url), 'utf8')
  if (heroHookSource.includes('isRootAlias: isRootAlias || selectedEmbedSource != null')) {
    throw new Error('expected a selected iframe to remain a Home background choice, not promote /knowgrph into Home')
  }
  if (!heroHookSource.includes('isRootAlias,\n    // The apex root owns Home')) {
    throw new Error('expected Live Canvas Hero visibility to remain apex-route-owned')
  }
  if (!heroHookSource.includes('dismissed: landingExited || (!isRootAlias && defaultSeedContentChanged)')) {
    throw new Error('expected persisted workspace document changes to stay isolated from apex hero dismissal')
  }
}

export function testLiveCanvasHeroRetainsViewportOwnershipDuringPersistedDocumentSwitch(): void {
  if (shouldDocumentSwitchOwnCanvasViewport({ documentSwitchBlocksCanvas: true, liveCanvasHeroVisible: true })) {
    throw new Error('expected the apex hero to retain viewport ownership during a persisted document switch')
  }
  if (!shouldDocumentSwitchOwnCanvasViewport({ documentSwitchBlocksCanvas: true, liveCanvasHeroVisible: false })) {
    throw new Error('expected the workspace route to retain its fail-closed document-switch placeholder')
  }
}

export function testLiveCanvasHeroUsesInteractiveWorkspaceCanvas(): void {
  const viewportSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'CanvasViewport.tsx'), 'utf8')
  const canvasPageSource = readFileSync(resolve(process.cwd(), 'src', 'pages', 'Canvas.tsx'), 'utf8')
  const heroSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'LiveCanvasHero.tsx'), 'utf8')
  const heroHookSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'canvas', 'useKnowgrphLiveCanvasHero.ts'), 'utf8')
  const modelSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'agentic-os', 'liveCanvasHeroModel.ts'), 'utf8')
  const flowCanvasSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'FlowCanvas.tsx'), 'utf8')
  const flowGraphStateSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasGraphState.ts'), 'utf8')
  const flowZoomSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'applyZoomRequestNative.ts'), 'utf8')
  for (const contract of [
    'data-kg-live-canvas-hero-background={liveCanvasHeroSource.embedUrl ? \'shared-embed\' : \'unavailable\'}',
    "aria-label={liveCanvasHeroSource.embedUrl ? 'Shared interactive canvas background' : 'Home background unavailable'}",
    'data-kg-live-canvas-hero-selected-embed="true"',
    'src={liveCanvasHeroSource.embedUrl}',
    'deriveLiveCanvasHeroCommandRouteGraph(safeGraphData) || safeGraphData',
    '<LiveCanvasHeroLazy source={liveCanvasHeroSource}',
    'data-kg-live-canvas-hero-enter="true"',
    'onClick={props.onEnter}',
    'Enter Knowgrph',
    'authoredOwnershipReady && !isRootAlias',
    'resolveWorkspaceReadmeTextLiveCanvasHeroSource',
    'WORKSPACE_README_PUBLIC_SOURCE_PATH',
    '|| (isRootAlias ? CANONICAL_STARTUP_DOCUMENT_PATH : source?.sourcePath)',
    'sourceFilesBootstrapReady: isRootAlias || args.sourceFilesBootstrapReady',
    'workspaceDocumentSwitchPending: isRootAlias ? false : args.workspaceDocumentSwitchPending',
    'hasSearchParams,\n    isEmbeddedPreview:',
    'data-kg-live-canvas-hero-viewport-owner="true"',
    '&& !liveCanvasHeroVisible\n    && workspaceEditorOverlayOpen',
    "!liveCanvasHeroVisible && canvasRenderMode === '3d'",
    'xrPhysicsRunReadyDemo && !gameFpsActive && !liveCanvasHeroVisible',
  ]) {
    if (!`${viewportSource}\n${heroSource}\n${heroHookSource}`.includes(contract)) throw new Error(`expected interactive workspace canvas contract ${contract}`)
  }
  if (viewportSource.includes('graphDataOverride={liveCanvasHeroSource.canvasGraphData}')
    || viewportSource.includes('flowWidgetStateGraphKeyOverride={`live-hero:${liveCanvasHeroSource.sourceLayerHash}`}')) {
    throw new Error('expected Home to avoid mounting a default workspace FlowCanvas background')
  }
  if (!viewportSource.includes('<iframe') || !viewportSource.includes('sandbox="allow-forms allow-popups allow-same-origin allow-scripts"')) {
    throw new Error('expected Explorer Share canvas embed selection to mount the resolved interactive canvas in the hero background')
  }
  for (const shellIsolationContract of [
    'isRouterRootAliasRuntime(import.meta.env.BASE_URL)',
    'onLiveCanvasHeroVisibilityChange={setLiveCanvasHeroOwnsWorkspace}',
    'workspaceCanvasPaneVisible && !liveCanvasHeroOwnsWorkspace',
    '!workspaceEditorOverlayOpen && !liveCanvasHeroOwnsWorkspace',
    'workspaceEditorOverlayOpen && !liveCanvasHeroOwnsWorkspace',
  ]) {
    if (!canvasPageSource.includes(shellIsolationContract)) {
      throw new Error(`expected Live Canvas Hero to isolate page shell contract ${shellIsolationContract}`)
    }
  }
  if (!viewportSource.includes('!liveCanvasHeroVisible && MARKDOWN_METRICS_DEV_ENABLED')
    || !viewportSource.includes('!liveCanvasHeroVisible && paywallOverlayActive')) {
    throw new Error('expected Live Canvas Hero ownership to suppress ancillary viewport overlays')
  }
  if (!heroHookSource.includes('|| (isRootAlias ? CANONICAL_STARTUP_DOCUMENT_PATH : source?.sourcePath)')
    || !heroHookSource.includes('selectedEmbedSource?.embedUrl')
    || !heroHookSource.includes('resolveCanonicalStartupCanvasEmbedRuntimeUrl()')) {
    throw new Error('expected Home to resolve either the selected embed or the canonical Share canvas embed URL')
  }
  if (!heroHookSource.includes('readPersistedLiveCanvasHeroSourceSelection')) {
    throw new Error('expected Home to restore an explicit Share canvas embed selection for the current session')
  }
  if (!viewportSource.includes("alternateCanvasSurfaceActive: geospatialModeEnabled || canvasRenderMode !== '2d'")
    || viewportSource.includes("alternateCanvasSurfaceActive: geospatialModeEnabled || canvasRenderMode !== '2d' || active2dSurface !== 'storyboard'")) {
    throw new Error('expected the root hero to override any current 2D renderer while preserving alternate 3D and geospatial ownership')
  }
  if (!flowCanvasSource.includes('canvas2dRendererOverride || storeCanvas2dRenderer')
    || !flowZoomSource.includes('args.canvas2dRendererOverride ?? state.canvas2dRenderer')) {
    throw new Error('expected the embedded source route to own flow rendering and fit behavior without mutating the workspace renderer setting')
  }
  if (!flowCanvasSource.includes('data-kg-canvas-scene-node-count') || !flowCanvasSource.includes('data-kg-canvas-scene-edge-count')) {
    throw new Error('expected queryable live scene counts for agent-ready runtime proof')
  }
  if (!flowCanvasSource.includes('suppressMediaOverlays,')
    || !flowGraphStateSource.includes('if (suppressMediaOverlays)')
    || !flowGraphStateSource.includes('stickyOverlayNodeByIdRef.current.clear()')
    || viewportSource.includes('excludeRichMediaOverlayNodeIds=')) {
    throw new Error('expected suppressed overlays to stay in the interactive native node and edge scene')
  }
  for (const stale of ['FlowCanvasLazy', 'presentationOnly', 'graphDataOverride={model.graphData}', 'nodeLayoutByToken']) {
    if (`${heroSource}\n${modelSource}`.includes(stale)) throw new Error(`expected synthetic hero renderer code to be removed: ${stale}`)
  }
  if (!heroSource.includes('pointer-events-none absolute inset-0') || !heroSource.includes('pointer-events-auto absolute')) {
    throw new Error('expected the editorial shell to pass pointer input through except for its command deck')
  }
  if (!heroSource.includes("requestZoom('fit', { intent: 'fitToView' })")) {
    throw new Error('expected the live source route to fit once on hero mount and remain user-interactive afterward')
  }
  for (const forbidden of ['reactflow', '#ff0071', 'cube', 'pyramid', '<img', '?raw']) {
    if (`${heroSource}\n${modelSource}`.toLowerCase().includes(forbidden)) {
      throw new Error(`expected no copied or static reference asset token ${forbidden}`)
    }
  }
}

export function testLiveCanvasHeroCanvasEmbedSelectionEvent(): void {
  const { dom, restore } = initJsdomHarness()
  const selections: Array<{ sourcePath: string; embedUrl: string }> = []
  const listener = (event: Event) => {
    const selection = readLiveCanvasHeroSourceSelection(event)
    if (selection) selections.push(selection)
  }
  try {
    dom.window.addEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, listener)
    const publishedEmbedUrl = buildPublishedCanvasEmbedUrl('docs/shared-canvas.md')
    const selected = selectLiveCanvasHeroSource({
      sourcePath: '/docs/shared-canvas.md',
      embedUrl: `${publishedEmbedUrl}?kgPreview=1`,
    })
    if (!selected || selections.length !== 1) {
      throw new Error(`expected one shared canvas hero selection event, got ${JSON.stringify(selections)}`)
    }
    if (selections[0]?.sourcePath !== '/docs/shared-canvas.md' || !selections[0]?.embedUrl.includes('kgPreview=1')) {
      throw new Error(`expected exact shared canvas selection detail, got ${JSON.stringify(selections[0])}`)
    }
    const restored = readPersistedLiveCanvasHeroSourceSelection()
    if (restored?.sourcePath !== '/docs/shared-canvas.md' || restored.embedUrl !== selections[0]?.embedUrl) {
      throw new Error(`expected the selected canvas to persist for Home, got ${JSON.stringify(restored)}`)
    }
  } finally {
    dom.window.removeEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, listener)
    restore()
  }
}

export function testLiveCanvasHeroEmbedUrlUsesSelectedOrSourceAddress(): void {
  const immediateLocal = buildLocalDocCanvasEmbedUrl({
    relativePath: '/knowgrph-token-economics-model-demo.md',
    origin: 'http://127.0.0.1:4193',
    pathname: '/knowgrph/',
  })
  if (immediateLocal !== 'http://127.0.0.1:4193/knowgrph/?kgDoc=knowgrph-token-economics-model-demo.md&kgPreview=1&kgLiveHero=1') {
    throw new Error(`expected an immediate source-addressed local canvas embed, got ${String(immediateLocal)}`)
  }
  if (!isSameOriginCanvasEmbedUrl(immediateLocal || '', 'http://127.0.0.1:4193')) {
    throw new Error('expected the local canvas embed URL to remain eligible for the live hero')
  }
  if (isSameOriginCanvasEmbedUrl('https://airvio.co/knowgrph/share/source?kgPreview=1', 'http://127.0.0.1:4193')) {
    throw new Error('expected a cross-origin published URL to be rejected as a localhost hero upgrade')
  }
  const selected = resolveLiveCanvasHeroEmbedUrl({
    sourcePath: '/docs/shared-canvas.md',
    selectedEmbedUrl: 'https://airvio.co/knowgrph/share/kg-public-token?kgPreview=1',
    baseUrl: '/',
    origin: 'http://127.0.0.1:4193',
  })
  if (selected !== 'https://airvio.co/knowgrph/share/kg-public-token?kgPreview=1&kgLiveHero=1') {
    throw new Error(`expected exact selected embed URL, got ${String(selected)}`)
  }
  const iframeMarkup = buildCanvasEmbedIframeMarkup(selected)
  for (const contract of [
    '<iframe',
    'sandbox="allow-scripts allow-same-origin"',
    'referrerpolicy="no-referrer"',
    'allow="fullscreen"',
    'loading="lazy"',
    'kgPreview=1&amp;kgLiveHero=1',
  ]) {
    if (!iframeMarkup?.includes(contract)) {
      throw new Error(`expected external iframe embed contract ${contract}, got ${String(iframeMarkup)}`)
    }
  }
  if (buildCanvasEmbedIframeMarkup('javascript:alert(1)') !== null) {
    throw new Error('expected canvas iframe markup to reject non-http URLs')
  }
  const canonical = resolveLiveCanvasHeroEmbedUrl({
    sourcePath: 'workspace:/workspace-readme.md',
    baseUrl: '/',
    origin: 'http://127.0.0.1:4193',
  })
  if (canonical !== 'http://127.0.0.1:4193/?kgDoc=workspace-readme.md&kgPreview=1&kgLiveHero=1') {
    throw new Error(`expected source-addressed canonical embed URL, got ${String(canonical)}`)
  }
}

export function testLiveCanvasHeroImportEmbedAcceptsIframeAndPostMessage(): void {
  const publishedEmbedUrl = buildPublishedCanvasEmbedUrl('docs/shared-canvas.md')
  const iframeSelection = resolveCanvasEmbedImport(`<iframe src="${publishedEmbedUrl}?kgPreview=1&amp;kgLiveHero=1"></iframe>`)
  if (iframeSelection?.embedUrl !== `${publishedEmbedUrl}?kgPreview=1&kgLiveHero=1`) {
    throw new Error(`expected pasted iframe markup to resolve the live embed selection, got ${JSON.stringify(iframeSelection)}`)
  }
  const messageSelection = resolveCanvasEmbedImport({
    type: KNOWGRPH_CANVAS_EMBED_SELECT_MESSAGE,
    version: KNOWGRPH_CANVAS_EMBED_MESSAGE_VERSION,
    sourcePath: '/docs/shared-canvas.md',
    embedUrl: publishedEmbedUrl,
  })
  if (messageSelection?.sourcePath !== '/docs/shared-canvas.md' || !messageSelection.embedUrl.includes('kgPreview=1&kgLiveHero=1')) {
    throw new Error(`expected postMessage v1 to resolve the same live embed selection contract, got ${JSON.stringify(messageSelection)}`)
  }
  if (resolveCanvasEmbedImport({
    type: KNOWGRPH_CANVAS_EMBED_SELECT_MESSAGE,
    version: 2,
    embedUrl: publishedEmbedUrl,
  })) {
    throw new Error('expected unsupported postMessage versions to fail closed')
  }
  if (resolveCanvasEmbedImport('<iframe src="javascript:alert(1)"></iframe>')) {
    throw new Error('expected iframe import to reject non-http sources')
  }

  const heroSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'LiveCanvasHero.tsx'), 'utf8')
  const importPanelSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'canvas', 'CanvasEmbedImportPanel.tsx'), 'utf8')
  const sharedPanelSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'canvas', 'CanvasEmbedPanelShell.tsx'), 'utf8')
  const codePanelSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'CanvasEmbedCodePanel.tsx'), 'utf8')
  for (const contract of [
    'data-kg-live-canvas-hero-import-embed="true"',
    'Import canvas embed',
    'setImportPanelOpen(true)',
    "window.addEventListener('message', handleMessage)",
    'isTrustedCanvasEmbedMessageSource(event)',
    'Use as Home background',
    'selectCanvasEmbedImport(value)',
    '<CanvasEmbedPanelShell',
  ]) {
    if (!`${heroSource}\n${importPanelSource}\n${sharedPanelSource}`.includes(contract)) {
      throw new Error(`expected direct Home canvas embed import contract ${contract}`)
    }
  }
  if (!importPanelSource.includes("from '@/features/canvas/CanvasEmbedPanelShell'")
    || !codePanelSource.includes("from '@/features/canvas/CanvasEmbedPanelShell'")) {
    throw new Error('expected import and share-code surfaces to reuse the same canvas embed panel shell')
  }
  if (importPanelSource.includes("window.addEventListener('keydown'") || codePanelSource.includes("window.addEventListener('keydown'")) {
    throw new Error('expected shared panel chrome to own Escape listener lifecycle without downstream duplication')
  }
}

export async function testLiveCanvasHeroRunAllPreservesRawGrammar(): Promise<void> {
  const expectedDefaultQuery = readExpectedDefaultQuery()
  consumeFloatingPanelChatInputHandoff()
  queueFloatingPanelChatInputHandoff({ text: expectedDefaultQuery, mode: 'replace' })
  const handoff = consumeFloatingPanelChatInputHandoff()
  if (handoff?.text !== expectedDefaultQuery || handoff.mode !== 'replace') {
    throw new Error(`expected exact raw grammar handoff, got ${JSON.stringify(handoff)}`)
  }
  if (consumeFloatingPanelChatInputHandoff() !== null) throw new Error('expected the pending Chat draft to be consumed once')
  const appended = applyFloatingPanelChatInputHandoff('Keep this context', { text: expectedDefaultQuery, mode: 'append' })
  if (appended !== `Keep this context\n\n${expectedDefaultQuery}`) {
    throw new Error(`expected append handoff to preserve editable text, got ${JSON.stringify(appended)}`)
  }
  if (appendLiveCanvasHeroToken(expectedDefaultQuery, '@provider.byteplus') !== expectedDefaultQuery) {
    throw new Error('expected quick tokens to remain idempotent')
  }

}

export async function testLiveCanvasHeroChatHandoffFlushesThroughSharedAppendEvent(): Promise<void> {
  const expectedDefaultQuery = readExpectedDefaultQuery()
  const { dom, restore } = initJsdomHarness()
  const details: Array<{ text?: string; mode?: string }> = []
  const listener = (event: Event) => {
    details.push(((event as CustomEvent<{ text?: string; mode?: string }>).detail) || {})
  }
  try {
    consumeFloatingPanelChatInputHandoff()
    dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, listener as EventListener)
    const queuedQuery = `  ${expectedDefaultQuery}   `
    queueFloatingPanelChatInputHandoff({ text: queuedQuery, mode: 'replace' })
    if (!flushFloatingPanelChatInputHandoff()) throw new Error('expected queued hero handoff to flush')
    if (details.length !== 1 || details[0]?.text !== queuedQuery || details[0]?.mode !== 'replace') {
      throw new Error(`expected one normalized shared append event, got ${JSON.stringify(details)}`)
    }
  } finally {
    dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, listener as EventListener)
    restore()
  }
}
