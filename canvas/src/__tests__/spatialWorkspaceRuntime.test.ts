import test from 'node:test'
import assert from 'node:assert/strict'
import yaml from 'js-yaml'
import { useGraphStore } from '../hooks/useGraphStore'
import { completeSourceFilesBootstrap } from '../features/source-files/sourceFilesBootstrapReadiness'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan } from '../features/three/xrMotionReferenceModel'
import { hydrateCanonicalXrMotionReferenceRuntime, hydrateCanonicalXrPhysicsRuntime } from '../features/three/XrMotionReferenceRuntimeBridge'
import { readXrMotionReferenceRuntime, restoreXrMotionReferenceRuntimeSnapshot } from '../features/three/xrMotionReferenceRuntime'
import { readXrPhysicsRuntime, restoreXrPhysicsRuntimeSnapshot } from '../features/three/xrPhysicsRuntime'
import { applySpatialWorkspace, cancelSpatialWorkspace, controlSpatialWorkspaceAgent, inspectSpatialWorkspace, proposeSpatialWorkspace, readSpatialReview, undoSpatialWorkspace } from '../features/three/spatialWorkspaceRuntime'
import { SPATIAL_REVIEW_KEY, readSpatialReceipts } from '../features/three/spatialWorkspaceModel'
import { canAuthorWorkspaceSceneMetadata, registerWorkspaceSceneMetadataEditor } from '../features/workspace-table/workspaceSceneMetadataAuthoring'
import { tryParseMarkdownFrontmatterFlowGraph } from '../features/parsers/markdownFrontmatterFlowGraph'
import { extractYamlFrontmatterBlock } from '../lib/markdown/frontmatter'
import { upsertFrontmatterFlowMarkdownText } from '../hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import { resolveWorkspaceCanvasLayerInsetLeft } from '../features/strybldr/strybldrTimelineBottomPanelLayout'
const prior = useGraphStore.getState(), motion = readXrMotionReferenceRuntime(), physics = readXrPhysicsRuntime()
let history = 0
function install(name = '/spatial-unit.md') {
  cancelSpatialWorkspace()
  restoreXrMotionReferenceRuntimeSnapshot(motion); restoreXrPhysicsRuntimeSnapshot(physics)
  const plan = readXrMotionReferencePlan({ stageId: 'neutral-volume', castSource: 'subjects-only', subjects: [{ id: 'box', assetId: 'prop-crate', position: [-3, 0, 0] }] })
  const metadata = { kgXrMotionReference: serializeXrMotionReferencePlan(plan) }
  const text = `---\n${yaml.dump(metadata)}---\n\n# Keep this authored body\n`
  useGraphStore.setState({ ...prior, graphContentRevision: 0, graphDataRevision: 0, markdownDocumentName: name, markdownDocumentText: text,
    sourceFiles: [{ id: name, name, text, enabled: true, status: 'parsed', source: { kind: 'local', path: `workspace:${name}` } }],
    graphData: { type: 'Graph', context: 'frontmatter-flow', nodes: [], edges: [], metadata },
    workspaceViewMode: 'canvas', workspaceCanvasPaneOpen: true, markdownWorkspaceIndexingInFlight: false, workspaceGraphMutationBlockUntilMs: 0, workspaceGraphMutationLayoutLockActive: false, scheduleHistory: () => { history++ } })
  completeSourceFilesBootstrap(); hydrateCanonicalXrMotionReferenceRuntime(); hydrateCanonicalXrPhysicsRuntime(); history = 0
  return text
}
async function proposal() {
  const inspection = await inspectSpatialWorkspace()
  assert.ok('identity' in inspection, JSON.stringify(inspection))
  const result = await proposeSpatialWorkspace({ expectedToken: inspection.identity.token, edits: [{ subjectId: 'box', position: [-2, 0, 0] }] })
  assert.ok('proposal' in result, JSON.stringify(result)); return result.proposal
}
test.after(() => { cancelSpatialWorkspace(); useGraphStore.setState(prior); restoreXrMotionReferenceRuntimeSnapshot(motion); restoreXrPhysicsRuntimeSnapshot(physics) })
test('the mobile timeline retains readable review width beside a restored source editor', () => {
  const layout = (width: number, right: number) => resolveWorkspaceCanvasLayerInsetLeft({
    workspaceEditorOverlayOpen: true, rootRect: { left: 0, right: width, width },
    workspaceLeftPaneRect: { left: 0, right, width: right },
  })
  assert.equal(layout(390, 342), 0, 'a 48px strip cannot host a review form')
  assert.equal(layout(1024, 512), 512, 'desktop panels still avoid the source editor')
  assert.equal(layout(390, 0), 0)
})
test('physics serializer key is admitted only for the current settled editor', () => {
  const text = install(), state = { ...useGraphStore.getState(), workspaceViewMode: 'editor' as const }
  let settled = true
  const unregister = registerWorkspaceSceneMetadataEditor(() => ({ path: '/spatial-unit.md', text, settled }))
  try {
    assert.equal(canAuthorWorkspaceSceneMetadata(state, { kgXrPhysicsWorld: {} }), true)
    assert.equal(canAuthorWorkspaceSceneMetadata(state, { kgXrMotionReference: {}, [SPATIAL_REVIEW_KEY]: {} }), true)
    assert.equal(canAuthorWorkspaceSceneMetadata(state, { kgXrPhysics: {} }), false)
    assert.equal(canAuthorWorkspaceSceneMetadata(state, { unrelated: true }), false)
    settled = false; assert.equal(canAuthorWorkspaceSceneMetadata(state, { kgXrPhysicsWorld: {} }), false)
  } finally { unregister() }
})
test('inspection and agent preview leave source, graph revision and history unchanged', async () => {
  const text = install(), revision = useGraphStore.getState().graphContentRevision
  const inspection = await inspectSpatialWorkspace(); assert.ok('identity' in inspection)
  const result = await controlSpatialWorkspaceAgent({ action: 'preview', expectedToken: inspection.identity.token, edits: [{ subjectId: 'box', scale: 1.2 }] })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(useGraphStore.getState().markdownDocumentText, text)
  assert.equal(useGraphStore.getState().graphContentRevision, revision); assert.equal(history, 0)
  assert.equal((await proposal().catch(() => null)), null, 'a second pending proposal is refused')
  cancelSpatialWorkspace(); assert.equal(readSpatialReview().proposal, null)
})
test('legacy invocations, direct mutations and forged approval flags cannot bypass review', async () => {
  const text = install()
  for (const input of [{ action: 'place', assetId: 'prop-crate' }, { invocation: '/xr.transform @box #transform position=0,0,0' }, { action: 'apply', approved: true }, { action: 'preview', approved: true, expectedToken: 'a'.repeat(64), edits: [{ subjectId: 'box', scale: 2 }] }]) assert.equal((await controlSpatialWorkspaceAgent(input)).ok, false)
  assert.equal(useGraphStore.getState().markdownDocumentText, text); assert.equal(history, 0)
})
test('document switches and stale sources refuse the exact formerly reviewed proposal', async () => {
  const text = install(), first = await proposal()
  useGraphStore.setState({ markdownDocumentText: text + '\nnew author edit' })
  assert.equal((await applySpatialWorkspace(first)).code, 'stale-source'); assert.equal(history, 0)
  install(); const second = await proposal(); useGraphStore.setState({ markdownDocumentName: '/another.md' })
  assert.equal((await applySpatialWorkspace(second)).code, 'source-unavailable'); assert.equal(history, 0)
})
test('commit and receipt are atomic in source; replay and duplicate apply do not write twice', async () => {
  install(); const reviewed = await proposal()
  const forged = { ...reviewed }; assert.equal((await applySpatialWorkspace(forged)).code, 'approval-required')
  const running = applySpatialWorkspace(reviewed), duplicate = await applySpatialWorkspace(reviewed)
  assert.equal(duplicate.code, 'conflict')
  const result = await running; assert.ok(result.receipt, JSON.stringify(result))
  assert.equal(history, 1)
  const text = useGraphStore.getState().markdownDocumentText!
  const metadata = yaml.load(extractYamlFrontmatterBlock(text)!.yamlText) as Record<string, unknown>
  assert.equal(readSpatialReceipts(metadata[SPATIAL_REVIEW_KEY]).length, 1)
  assert.deepEqual(readXrMotionReferencePlan(metadata.kgXrMotionReference).subjects[0].position, [-2, 0, 0])
  assert.ok(text.endsWith('# Keep this authored body\n'))
  await applySpatialWorkspace(reviewed); assert.equal(history, 1); assert.equal(useGraphStore.getState().markdownDocumentText, text)
  const undo = await undoSpatialWorkspace(reviewed.id); assert.ok(undo.receipt, JSON.stringify(undo)); assert.equal(history, 2)
  assert.deepEqual(readXrMotionReferenceRuntime().plan.subjects[0].position, [-3, 0, 0])
  await undoSpatialWorkspace(reviewed.id); assert.equal(history, 2)
})
test('unsupported source projection refuses before any partial store change', async () => {
  install(); useGraphStore.setState({ graphData: { ...useGraphStore.getState().graphData!, context: 'unsupported' } })
  const reviewed = await proposal(), before = useGraphStore.getState()
  const result = await applySpatialWorkspace(reviewed)
  assert.equal(result.ok, false); assert.equal(history, 0)
  assert.equal(useGraphStore.getState().graphData, before.graphData)
  assert.equal(useGraphStore.getState().markdownDocumentText, before.markdownDocumentText)
})
test('preview cancellation and source changes during hashing publish no late proposal', async () => {
  install(); const read = await inspectSpatialWorkspace(); assert.ok('identity' in read)
  const pending = proposeSpatialWorkspace({ expectedToken: read.identity.token, edits: [{ subjectId: 'box', scale: 1.1 }] })
  cancelSpatialWorkspace(); assert.equal((await pending).ok, false); assert.equal(readSpatialReview().proposal, null)
  const inspection = inspectSpatialWorkspace()
  useGraphStore.setState({ markdownDocumentText: useGraphStore.getState().markdownDocumentText + '\nchanged during read' })
  assert.equal((await inspection).ok, false); assert.equal(history, 0)
})
test('expired approvals, settled-editor loss and changed proposal IDs refuse without writes', async () => {
  install(); const reviewed = await proposal(), now = Date.now
  try { Date.now = () => reviewed.expiresAt; assert.equal((await applySpatialWorkspace(reviewed)).code, 'approval-expired') }
  finally { Date.now = now }
  useGraphStore.setState({ workspaceViewMode: 'editor' })
  assert.equal((await applySpatialWorkspace(reviewed)).code, 'source-unavailable'); assert.equal(history, 0)
})
test('physics metadata reaches authored Markdown through the repaired serializer', () => {
  install(); const world = { schema: 'test-physics', gravity: [0, -9.81, 0] }
  useGraphStore.getState().updateGraphMetadata({ kgXrPhysicsWorld: world })
  const source = yaml.load(extractYamlFrontmatterBlock(useGraphStore.getState().markdownDocumentText!)!.yamlText) as Record<string, unknown>
  assert.deepEqual(source.kgXrPhysicsWorld, world)
})
test('undo detects changed object fields and preserves a subsequent unrelated document edit', async () => {
  install(); const reviewed = await proposal(); await applySpatialWorkspace(reviewed)
  const state = useGraphStore.getState()
  useGraphStore.setState({ markdownDocumentText: state.markdownDocumentText + '\nUnrelated note\n' })
  const result = await undoSpatialWorkspace(reviewed.id)
  assert.ok(result.receipt, JSON.stringify(result)); assert.ok(useGraphStore.getState().markdownDocumentText!.endsWith('Unrelated note\n'))
  install(); const other = await proposal(); await applySpatialWorkspace(other)
  const changed = readXrMotionReferencePlan({ ...readXrMotionReferenceRuntime().plan, subjects: readXrMotionReferenceRuntime().plan.subjects.map(subject => ({ ...subject, scale: 2 })) })
  useGraphStore.getState().updateGraphMetadata({ kgXrMotionReference: serializeXrMotionReferencePlan(changed) })
  hydrateCanonicalXrMotionReferenceRuntime(); hydrateCanonicalXrPhysicsRuntime()
  const before = useGraphStore.getState().markdownDocumentText
  assert.equal((await undoSpatialWorkspace(other.id)).code, 'conflict')
  assert.equal(useGraphStore.getState().markdownDocumentText, before)
})

test('unbound and remote documents cannot enter local spatial review', async () => {
  const text = install()
  useGraphStore.setState({ sourceFiles: [] })
  assert.equal((await inspectSpatialWorkspace()).ok, false)
  install()
  const file = useGraphStore.getState().sourceFiles[0]
  useGraphStore.setState({ sourceFiles: [{ ...file, source: { kind: 'url', url: 'https://example.invalid/scene.md' } }] })
  assert.equal((await inspectSpatialWorkspace()).ok, false)
  assert.equal(useGraphStore.getState().markdownDocumentText, text); assert.equal(history, 0)
})

test('actual Markdown parser roundtrips scene receipts and supports undo after rehydration', async () => {
  const text = install().replace('---\n', '---\nflow:\n  nodes:\n    - id: {key: id, type: string, value: scene}\n      type: {key: type, type: string, value: Document}\n      label: {key: label, type: string, value: Scene}\n  edges: []\n')
  const reparse = (text: string) => {
    const parsed = tryParseMarkdownFrontmatterFlowGraph('/spatial-unit.md', text)
    assert.ok(parsed)
    const files = useGraphStore.getState().sourceFiles.map(file => ({ ...file, text }))
    useGraphStore.setState({ markdownDocumentText: text, sourceFiles: files, graphData: parsed.graphData })
    hydrateCanonicalXrMotionReferenceRuntime(); hydrateCanonicalXrPhysicsRuntime()
  }
  reparse(text)
  assert.ok(useGraphStore.getState().graphData?.metadata?.frontmatterMeta)
  const reviewed = await proposal(), applied = await applySpatialWorkspace(reviewed)
  assert.ok(applied.receipt, JSON.stringify(applied))
  reparse(useGraphStore.getState().markdownDocumentText!)
  // An unrelated flow/layout serialization runs after the parser has nested persisted metadata.
  // It must preserve the scene and its receipt before the next operator action.
  const parsedState = useGraphStore.getState()
  assert.equal(parsedState.graphData!.nodes.length, 1)
  const synchronized = upsertFrontmatterFlowMarkdownText(parsedState.markdownDocumentText!, parsedState.graphData!)
  const persisted = yaml.load(extractYamlFrontmatterBlock(synchronized)!.yamlText) as Record<string, unknown>
  const beforeSync = yaml.load(extractYamlFrontmatterBlock(parsedState.markdownDocumentText!)!.yamlText) as Record<string, unknown>
  assert.deepEqual(persisted.kgXrMotionReference, beforeSync.kgXrMotionReference)
  assert.equal(readSpatialReceipts(persisted[SPATIAL_REVIEW_KEY]).length, 1)
  reparse(synchronized)
  const inspected = await inspectSpatialWorkspace()
  assert.ok('receipts' in inspected, JSON.stringify(inspected)); assert.equal(inspected.receipts.length, 1)
  const undone = await undoSpatialWorkspace(reviewed.id); assert.ok(undone.receipt, JSON.stringify(undone))
  assert.deepEqual(readXrMotionReferenceRuntime().plan.subjects[0].position, [-3, 0, 0])
})

test('review refreshes when source hydration releases its mutation fence without changing scene bytes', async () => {
  const { initJsdomHarness } = await import('@/tests/lib/jsdomHarness')
  const { mountReactRoot, unmountReactRoot } = await import('@/tests/lib/reactRootHarness')
  const React = await import('react'), { createRoot } = await import('react-dom/client')
  const { SpatialWorkspaceReview } = await import('../features/three/SpatialWorkspaceReview')
  const environment = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = environment.dom.window.document.getElementById('root')!, root = createRoot(container)
  const source = install()
  useGraphStore.setState({ markdownWorkspaceIndexingInFlight: true })
  const flush = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  try {
    await mountReactRoot(root, React.createElement(SpatialWorkspaceReview)); await flush()
    assert.equal(container.querySelector('fieldset')?.disabled, true)
    await React.act(async () => { useGraphStore.setState({ markdownWorkspaceIndexingInFlight: false }) }); await flush()
    assert.equal(container.querySelector('fieldset')?.disabled, false)
    await React.act(async () => { useGraphStore.setState({ workspaceGraphMutationBlockUntilMs: Date.now() + 100 }) }); await flush()
    assert.equal(container.querySelector('fieldset')?.disabled, true)
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 130)) }); await flush()
    assert.equal(container.querySelector('fieldset')?.disabled, false)
    assert.equal(useGraphStore.getState().markdownDocumentText, source)
  } finally { await unmountReactRoot(root); environment.restore() }
})

test('review follows late local source binding, graph replacement and physics readiness', async () => {
  const { initJsdomHarness } = await import('@/tests/lib/jsdomHarness')
  const { mountReactRoot, unmountReactRoot } = await import('@/tests/lib/reactRootHarness')
  const React = await import('react'), { createRoot } = await import('react-dom/client')
  const { SpatialWorkspaceReview } = await import('../features/three/SpatialWorkspaceReview')
  const environment = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = environment.dom.window.document.getElementById('root')!, root = createRoot(container)
  const source = install(), files = useGraphStore.getState().sourceFiles
  useGraphStore.setState({ sourceFiles: [] })
  const flush = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  const disabled = () => container.querySelector('fieldset')?.disabled
  try {
    await mountReactRoot(root, React.createElement(SpatialWorkspaceReview)); await flush()
    assert.equal(disabled(), true)
    await React.act(async () => { useGraphStore.setState({ sourceFiles: files }) }); await flush()
    assert.equal(disabled(), false, 'local source binding must refresh a previous refusal')
    const graph = useGraphStore.getState().graphData!
    await React.act(async () => { useGraphStore.setState({ graphData: { ...graph, metadata: {} } }) }); await flush()
    assert.equal(disabled(), true, 'graph replacement invalidates the prior inspection')
    await React.act(async () => { useGraphStore.setState({ graphData: graph }) }); await flush()
    assert.equal(disabled(), false)
    const stopped = readXrPhysicsRuntime()
    await React.act(async () => { restoreXrPhysicsRuntimeSnapshot({ ...stopped, dirty: true, revision: stopped.revision + 1 }) }); await flush()
    assert.equal(disabled(), true)
    await React.act(async () => { restoreXrPhysicsRuntimeSnapshot({ ...stopped, revision: stopped.revision + 2 }) }); await flush()
    assert.equal(disabled(), false, 'saved physics readiness must refresh inspection')
    assert.equal(useGraphStore.getState().markdownDocumentText, source)
  } finally { await unmountReactRoot(root); environment.restore() }
})

test('native local import preserves an explicit XR surface when the graph includes widgets', async () => {
  const { initJsdomHarness } = await import('@/tests/lib/jsdomHarness')
  const { mountReactRoot, unmountReactRoot } = await import('@/tests/lib/reactRootHarness')
  const { useWorkspaceFileActionsCore } = await import('../features/markdown-workspace/useWorkspaceFileActions/core')
  const { createMemoryWorkspaceFs } = await import('../features/workspace-fs/workspaceFsMemory')
  const { waitForCanvasFrontmatterSurfaceTransition } = await import('../features/parsers/canvasFrontmatterSurfaceTransition')
  const React = await import('react'), { createRoot } = await import('react-dom/client')
  const environment = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const root = createRoot(environment.dom.window.document.getElementById('root')!)
  const source = install().replace('---\n', '---\nkgCanvasSurfaceMode: 3d\nkgCanvasRenderMode: 3d\nkgCanvas3dMode: xr\n')
  const fs = createMemoryWorkspaceFs({ initialEntries: [{ path: '/spatial-unit.md', parentPath: '/', kind: 'file', name: 'spatial-unit.md', text: source, updatedAtMs: 1 }] })
  const graph = useGraphStore.getState().graphData!
  useGraphStore.setState({ canvasRenderMode: '3d', canvas3dMode: 'xr', workspaceViewMode: 'editor', markdownDocumentText: source,
    graphData: { ...graph, nodes: [{ id: 'scene', type: 'Document', label: 'Scene', properties: {} }], metadata: { ...graph.metadata, 'flow:widgetRegistry': [{ id: 'scene', type: 'Document' }] } } })
  let actions: ReturnType<typeof useWorkspaceFileActionsCore> | undefined
  const noOp = () => {}
  function Harness() {
    actions = useWorkspaceFileActionsCore({ getFs: async () => fs, refresh: async () => ({ entries: [], sourcesByPath: {} }),
      openedPath: null, selectionPath: null, selectionEntryKind: null, activeDocumentKey: '', activeDocumentSourceUrl: null,
      setActiveText: noOp, setEntries: noOp, lastLoadedRef: { current: null }, setExpandedPaths: noOp,
      setActivePathSafe: noOp, setSelectionPathSafe: noOp, setActiveMarkdownDocument: async () => true,
      applyMarkdownDocumentToGraph: async () => true })
    return null
  }
  const unwantedModes: string[] = []
  const unsubscribe = useGraphStore.subscribe((next, before) => {
    if (next.canvasRenderMode !== before.canvasRenderMode && next.canvasRenderMode === '2d') unwantedModes.push('2d')
  })
  try {
    await mountReactRoot(root, React.createElement(Harness))
    await React.act(async () => { await actions!.focusAfterImport('/spatial-unit.md', { applyToGraph: true }); await waitForCanvasFrontmatterSurfaceTransition() })
    assert.deepEqual(unwantedModes, [], 'generic widget fallback must never replace authored XR intent')
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
    assert.equal(useGraphStore.getState().workspaceViewMode, 'canvas', 'import reveals the authored surface above the editor')
    assert.equal(await fs.readFileText('/spatial-unit.md'), source)
    const implicitSource = source.replace('kgCanvasSurfaceMode: 3d\nkgCanvasRenderMode: 3d\nkgCanvas3dMode: xr\n', '')
    for (const header of ['', 'kgCanvasSurfaceMode: 2d\n']) {
      await fs.writeFileText('/spatial-unit.md', implicitSource.replace('---\n', `---\n${header}`))
      useGraphStore.setState({ canvasRenderMode: '3d' })
      await React.act(async () => { await actions!.focusAfterImport('/spatial-unit.md', { applyToGraph: true }); await waitForCanvasFrontmatterSurfaceTransition() })
      assert.equal(useGraphStore.getState().canvasRenderMode, '2d', 'implicit and explicit 2D widget imports retain their fallback')
      assert.equal(useGraphStore.getState().canvas2dRenderer, 'storyboard')
    }
  } finally { unsubscribe(); await unmountReactRoot(root); environment.restore() }
})
