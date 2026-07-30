import fs from 'node:fs'
import path from 'node:path'
import { load as parseYaml } from 'js-yaml'

import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { loadWorkspaceSeedText } from '@/features/workspace-fs/workspaceFs'
import { buildLocalFsFetchPath } from '@/lib/url'
import {
  readWorkspaceDocsMirrorRootPathSetting,
  writeWorkspaceDocsMirrorRootPathSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import {
  WORKSPACE_RUN_READY_DEMO_ENV,
  XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
  XR_PHYSICS_RUN_READY_DEMO_ID,
  resolveWorkspaceRunReadyDemoSeed,
  resolveWorkspaceValidationSeedRelPath,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import { ensureXrPhysicsRunReadyDemoRunning } from '@/features/canvas/xrPhysicsRunReadyLifecycle'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  readXrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import { resolveXrMotionReferencePersistedValue } from '@/features/three/xrMotionReferencePersistedValue'

type PlainRecord = Record<string, unknown>

const REPO_ROOT = path.resolve(process.cwd(), '..')
const SEED_REL_PATH = `docs/workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
const SEED_PATH = path.join(REPO_ROOT, SEED_REL_PATH)

const asRecord = (value: unknown, label: string): PlainRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`expected ${label} to be an object`)
  }
  return value as PlainRecord
}

const extractFrontmatterYaml = (text: string): string => {
  if (!text.startsWith('---\n')) throw new Error('expected XR physics demo to start with byte-zero YAML frontmatter')
  const endIndex = text.indexOf('\n---\n', 4)
  if (endIndex < 0) throw new Error('expected XR physics demo to close YAML frontmatter before body Markdown')
  return text.slice(4, endIndex)
}

export async function testXrPhysicsDemoRunReadyModeLoadsNativeInRepoSeed() {
  const lifecycle = { phase: 'off' as 'off' | 'ready' | 'paused' | 'running', revision: 0 }
  let selectedMode = ''
  let launchCount = 0
  const actions = {
    selectMode: (mode: 'ball' | 'rocket') => { selectedMode = mode },
    developAndRun: () => {
      launchCount += 1
      lifecycle.phase = 'running'
      lifecycle.revision += 1
    },
  }
  if (!ensureXrPhysicsRunReadyDemoRunning(lifecycle, actions) || selectedMode !== 'ball' || launchCount !== 1) {
    throw new Error('expected pristine run-ready lifecycle to auto-start the Ball controller exactly once')
  }
  lifecycle.phase = 'off'
  lifecycle.revision += 1
  if (!ensureXrPhysicsRunReadyDemoRunning(lifecycle, actions) || selectedMode !== 'ball' || Number(launchCount) !== 2) {
    throw new Error('expected standalone run-ready lifecycle to reclaim an off fallback')
  }
  if (ensureXrPhysicsRunReadyDemoRunning(lifecycle, actions) || Number(launchCount) !== 2) {
    throw new Error('expected a running standalone lifecycle to avoid duplicate launch')
  }
  lifecycle.phase = 'ready'
  lifecycle.revision += 1
  if (!ensureXrPhysicsRunReadyDemoRunning(lifecycle, actions) || selectedMode !== 'ball' || Number(launchCount) !== 3) {
    throw new Error('expected a ready auto-start lifecycle to develop and run the Ball controller')
  }
  lifecycle.phase = 'paused'
  lifecycle.revision += 1
  if (ensureXrPhysicsRunReadyDemoRunning(lifecycle, actions) || Number(launchCount) !== 3) {
    throw new Error('expected a paused pre-existing runtime not to be relaunched or claimed')
  }
  lifecycle.phase = 'running'
  if (ensureXrPhysicsRunReadyDemoRunning(lifecycle, actions) || Number(launchCount) !== 3) {
    throw new Error('expected a running pre-existing runtime not to be relaunched or claimed')
  }

  const markdownText = fs.readFileSync(SEED_PATH, 'utf8')
  const meta = asRecord(parseYaml(extractFrontmatterYaml(markdownText)), 'frontmatter')

  if (
    meta.status !== 'runtime-ready'
    || meta.runtime_status !== 'runtime-ready'
    || meta.publish_scope !== 'local-only'
  ) {
    throw new Error(`expected local runtime-ready status, got ${JSON.stringify({
      status: meta.status,
      runtime_status: meta.runtime_status,
      publish_scope: meta.publish_scope,
    })}`)
  }
  if (
    meta.kgCanvasSurfaceMode !== 'xr'
    || meta.kgCanvasRenderMode !== '3d'
    || meta.kgCanvas3dMode !== 'xr'
  ) {
    throw new Error('expected the workspace seed to activate the canonical XR surface and 3D renderer')
  }
  if (
    meta.kgFloatingPanelOpen !== true
    || meta.kgFloatingPanelView !== 'motionControl'
    || meta.kgBottomPanelOpen !== false
    || meta.kgBottomPanelTab !== 'timeline'
  ) {
    throw new Error('expected standalone mode to open canonical Motion Control while retaining the Timeline target')
  }

  const runReady = asRecord(meta.run_ready_demo, 'run_ready_demo')
  if (
    runReady.id !== XR_PHYSICS_RUN_READY_DEMO_ID
    || runReady.env_selector !== `${WORKSPACE_RUN_READY_DEMO_ENV}=${XR_PHYSICS_RUN_READY_DEMO_ID}`
    || runReady.validation_seed_path !== `/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
    || runReady.source_root !== 'knowgrph/docs'
    || runReady.source_backed !== true
    || runReady.clean_canvas_recommended !== true
    || runReady.native_runtime !== true
    || runReady.presentation !== 'full-frame-playground'
    || runReady.auto_start !== true
    || !Array.isArray(runReady.external_dependencies)
    || runReady.external_dependencies.length !== 0
  ) {
    throw new Error(`expected native in-repo run-ready metadata, got ${JSON.stringify(runReady)}`)
  }

  const registered = resolveWorkspaceRunReadyDemoSeed('XR_PHYSICS')
  if (
    !registered
    || registered.id !== XR_PHYSICS_RUN_READY_DEMO_ID
    || registered.validationSeedRelPath !== XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME
    || registered.sourceRoot !== 'knowgrph/docs'
    || registered.cleanCanvasRecommended !== true
    || !registered.seedRelPathCandidates.includes(SEED_REL_PATH)
  ) {
    throw new Error(`expected XR physics demo to resolve from the shared run-ready registry, got ${JSON.stringify(registered)}`)
  }
  const selected = resolveWorkspaceValidationSeedRelPath({
    explicitRelPath: '',
    runReadyDemoId: XR_PHYSICS_RUN_READY_DEMO_ID,
    defaultRelPath: 'fallback.md',
  })
  if (selected !== XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME) {
    throw new Error(`expected XR physics demo mode to select its source seed, got ${selected}`)
  }
  const explicit = resolveWorkspaceValidationSeedRelPath({
    explicitRelPath: 'operator-owned.md',
    runReadyDemoId: XR_PHYSICS_RUN_READY_DEMO_ID,
    defaultRelPath: 'fallback.md',
  })
  if (explicit !== 'operator-owned.md') throw new Error(`expected explicit seed selection to remain authoritative, got ${explicit}`)

  const parsed = tryParseMarkdownFrontmatterFlowGraph(XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME, markdownText)
  if (!parsed || parsed.graphData.context !== 'frontmatter-flow') {
    throw new Error('expected XR physics demo to parse through the canonical frontmatter-flow path')
  }
  const graphNodeIds = new Set(parsed.graphData.nodes.map(node => String(node.id || '')))
  for (const id of ['xr_demo_entry', 'xr_ball_controller', 'xr_rocket_controller', 'xr_runtime_gate']) {
    if (!graphNodeIds.has(id)) throw new Error(`expected XR physics demo graph to include ${id}`)
  }
  const frontmatterMeta = asRecord(parsed.graphData.metadata?.frontmatterMeta, 'parsed frontmatter metadata')
  const sourceSeedValue = asRecord(
    frontmatterMeta[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY],
    'source-authored XR motion plan',
  )
  if (resolveXrMotionReferencePersistedValue(parsed.graphData.metadata) !== sourceSeedValue) {
    throw new Error('expected XR motion hydration to fall back to the source-authored frontmatter plan')
  }
  const sourcePlan = readXrMotionReferencePlan(sourceSeedValue, parsed.graphData.nodes)
  const selectableVehicleIds = [
    'xr-subject:vehicle-helicopter:1',
    'xr-subject:vehicle-airplane:1',
    'xr-subject:vehicle-sedan:1',
  ]
  if (sourcePlan.stageId !== 'singapore'
    || sourcePlan.subjects.length !== selectableVehicleIds.length
    || selectableVehicleIds.some(id => !sourcePlan.subjects.some(subject => subject.id === id))
    || selectableVehicleIds.some(id => !sourcePlan.cast.some(track => track.actorId === id))) {
    throw new Error(`expected the source document to seed three selectable Singapore vehicle subjects, got ${JSON.stringify(sourcePlan)}`)
  }
  const persistedEmptyPlan = { ...sourceSeedValue, subjects: [], cast: [] }
  const topLevelMetadata = {
    frontmatterMeta,
    [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: persistedEmptyPlan,
  }
  if (resolveXrMotionReferencePersistedValue(topLevelMetadata) !== persistedEmptyPlan
    || resolveXrMotionReferencePersistedValue({
      frontmatterMeta,
      [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: null,
    }) !== null) {
    throw new Error('expected an explicit persisted XR plan, including empty or null values, to override the frontmatter seed')
  }

  for (const required of [
    'rolling movement',
    'grounded jump',
    'directional thrust',
    'modifier stabilization',
    'standard left stick',
    'fixed-follow',
    'free-orbit',
    '/camera.select @camera #camera',
    'knowgrph.control_local_camera',
    'bounded aerial composition',
    'procedural Singapore waterfront terrain',
    'catalog-driven stable terrain IDs',
    'vehicle-helicopter',
    'vehicle-airplane',
    'vehicle-sedan',
    'prop-ball',
    'Marina Bay towers',
    'source-authored selectable',
    'Placed subjects remain visible',
    'collect key then unlock treasure',
    'full-frame-playground',
    '/xr.physics @canvas #controller operation=develop-run mode=ball',
    'knowgrph.control_local_xr_scene',
    '/motion.control @canvas #pose operation=start backend=auto',
    'knowgrph.inspect_local_motion_control',
    'knowgrph.control_local_motion_control',
    '/game.mode @canvas #gameplay operation=open',
    'knowgrph.inspect_local_game_mode',
    'knowgrph.control_local_game_mode',
    'temporarily suspend the native XR controller stage and restore it on exit',
  ]) {
    if (!markdownText.includes(required)) throw new Error(`expected native demo contract to include ${required}`)
  }
  for (const forbidden of [/https?:\/\//i, /\bgithub\b/i, /\bcdn\b/i, /\bnode_modules\b/i]) {
    if (forbidden.test(markdownText)) throw new Error(`expected standalone seed to avoid external locator ${forbidden.source}`)
  }

  const rootPackage = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as PlainRecord
  const canvasPackage = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'canvas', 'package.json'), 'utf8')) as PlainRecord
  const rootScripts = asRecord(rootPackage.scripts, 'root scripts')
  const canvasScripts = asRecord(canvasPackage.scripts, 'canvas scripts')
  if (rootScripts['demo:xr-physics'] !== 'npm run dev:xr-physics --workspace=@knowgrph/canvas --') {
    throw new Error('expected the repository demo command to delegate to the Canvas workspace')
  }
  const expectedCanvasScript = `VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT=$PWD/../../huijoohwee/docs VITE_KNOWGRPH_RUN_READY_REPO_LOCAL=1 ${WORKSPACE_RUN_READY_DEMO_ENV}=${XR_PHYSICS_RUN_READY_DEMO_ID} vite --configLoader runner --port 5174 --strictPort`
  if (canvasScripts['dev:xr-physics'] !== expectedCanvasScript) {
    throw new Error('expected the Canvas demo command to activate repo-local source authority and the shared run-ready selector')
  }
  const expectedCanvasPredev = 'npm run prepare:linked-packages && npm run prepare:litert-assets && npm run fix:entities-sourcemaps && npm run build:settings'
  if (canvasScripts['predev:xr-physics'] !== expectedCanvasPredev) {
    throw new Error('expected the standalone demo preflight to prepare linked packages plus integrity-pinned same-origin LiteRT assets')
  }

  const sourceText = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, 'canvas', 'src', ...parts), 'utf8')
  const canvasPageSource = sourceText('pages', 'Canvas.tsx')
  const viewportSource = sourceText('components', 'CanvasViewport.tsx')
  const graphStageSource = sourceText('features', 'three', 'XrCanonicalPhysicsStage.tsx')
  const aspectMaskSource = sourceText('features', 'three', 'XrCameraAspectMask.tsx')
  const sessionPanelSource = sourceText('lib', 'three', 'ThreeGraphXr.tsx')
  const threeGraphSource = sourceText('lib', 'three', 'ThreeGraph.impl.tsx')
  const xrRunReadyRuntimeSource = sourceText('features', 'canvas', 'XrPhysicsRunReadyDemoRuntime.tsx')
  if (!canvasPageSource.includes("data-kg-xr-physics-run-ready={xrPhysicsRunReadyDemo ? 'full-frame'")) {
    throw new Error('expected run-ready launch to project the existing viewport without editor chrome')
  }
  if (!canvasPageSource.includes("canvasRenderMode={dedicatedRunReadyDemo ? '3d'")
    || !canvasPageSource.includes("canvas3dMode={dedicatedRunReadyDemo ? 'xr'")) {
    throw new Error('expected late document UI restores to remain unable to replace any dedicated run-ready surface')
  }
  if (
    !canvasPageSource.includes('workspaceVisibleCanvasLeft={workspaceCanvasPaneVisible ? workspacePaneBoundaryCss : undefined}')
    || !viewportSource.includes('workspaceXrViewportInset')
    || !viewportSource.includes('width: `calc(100% - ${workspaceXrViewportInset})`')
  ) {
    throw new Error('expected the document-driven playground to center its camera and controls inside the visible workspace canvas pane')
  }
  if (!viewportSource.includes('<XrNativeControllerDemoHud') || !viewportSource.includes('isXrPhysicsRunReadyDemoActive')) {
    throw new Error('expected the shared viewport to own the standalone controller HUD')
  }
  if (!graphStageSource.includes('<XrNativeControllerDemoStage')
    || !graphStageSource.includes('retainStage')
    || graphStageSource.includes('XrMotionReferenceStage')) {
    throw new Error('expected the standalone playground to retain an exclusive native stage with no fallback constructor')
  }
  if (
    aspectMaskSource.includes('isXrPhysicsRunReadyDemoActive')
    || !aspectMaskSource.includes('framing.claimed')
    || !sessionPanelSource.includes('isXrPhysicsRunReadyDemoActive(markdownDocumentName, markdownDocumentText)')
  ) {
    throw new Error('expected Camera ownership to gate editor optics without a document-specific mask suppressor')
  }
  if (!threeGraphSource.includes('XR_PHYSICS_RUN_READY_GRAPH') || !threeGraphSource.includes('!xrDocumentLoaded && !xrPhysicsRunReadyDemo')) {
    throw new Error('expected standalone launch to bypass the authored XR empty-world loading surface')
  }
  if (!xrRunReadyRuntimeSource.includes('pausedForGameplayRef')
    || !xrRunReadyRuntimeSource.includes('pauseXrNativeControllerDemo()')
    || !xrRunReadyRuntimeSource.includes('resumeXrNativeControllerDemo()')) {
    throw new Error('expected Game Mode to pause and resume the existing XR controller without resetting its world')
  }

  const expectedProviderUrl = buildLocalFsFetchPath(SEED_PATH)
  if (!expectedProviderUrl) throw new Error('expected the in-repo seed to resolve to a local filesystem fetch path')
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousRepoLocal = process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  const previousStoredRoot = readWorkspaceDocsMirrorRootPathSetting()
  const externalRoot = path.join(REPO_ROOT, 'external-conflicting-docs')
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = path.join(REPO_ROOT, 'docs')
  process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = '1'
  writeWorkspaceDocsMirrorRootPathSetting(externalRoot)
  const previousFetch = globalThis.fetch
  const requestedUrls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    requestedUrls.push(url)
    return url === expectedProviderUrl
      ? new Response(markdownText, { status: 200, headers: { 'content-type': 'text/markdown' } })
      : new Response('', { status: 404 })
  }) as typeof fetch
  try {
    const externalConflictText = 'external mirror with conflicting basename must never win'
    const loaded = await loadWorkspaceSeedText({
      basename: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
      relPaths: [`workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`],
      fallbackText: 'fallback must not win',
      sourceExclusive: true,
      docsMirrorEntries: [{
        relPath: `workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`,
        text: externalConflictText,
        updatedAtMs: Date.now() + 60_000,
      }],
    })
    if (
      loaded.isFallback
      || loaded.text !== markdownText.trim()
      || loaded.text === externalConflictText
      || !requestedUrls.includes(expectedProviderUrl)
      || requestedUrls.some(url => url.includes(externalRoot))
      || readWorkspaceDocsMirrorRootPathSetting() !== path.join(REPO_ROOT, 'docs')
    ) {
      throw new Error('expected repo-local source authority to beat a newer conflicting external mirror basename')
    }
  } finally {
    globalThis.fetch = previousFetch
    writeWorkspaceDocsMirrorRootPathSetting(previousStoredRoot)
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousRepoLocal === 'string') process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL = previousRepoLocal
    else delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL
  }
}
