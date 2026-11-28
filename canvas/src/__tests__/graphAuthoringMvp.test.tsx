import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'
import { commitCanvasAuthoring } from '@/hooks/store/commitCanvasAuthoring'
import { canUndoCanvasTurn, runCanvasAuthoringTurn } from '@/features/graph-editor/canvasAuthoringTurn'
import { stageSketchPrompt } from '@/features/graph-editor/canvasSketchPrompt'
import { createStroke, readNodeSketch } from '@/lib/graph/canvasSketch'
import { isCanvasDrawingRequest, readCanvasDrawingRequest } from '@/features/chat/promptPresetInvocation'
import { stageCanvasReply, stageFlow } from '@/features/graph-editor/canvasAuthoringFlow'
import { submitCanvasProjection } from '@/features/chat/floatingPanelChat/canvasProjectionSubmit'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import { parseChatHistory } from '@/features/chat/floatingPanelChat/useFloatingPanelChatHistory'
import { authorCanvasTool } from '@/features/graph-editor/authorCanvasTool'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { registerWorkspaceSceneMetadataEditor } from '@/features/workspace-table/workspaceSceneMetadataAuthoring'
import { listGatewayPresets, selectGatewayPreset } from '@/features/chat/gatewayPresetCatalog'
import { readSubgraphs } from '@/lib/graph/subgraphs'
import { canvasTools } from 'agentic-design-system/react/panels'

const sourceHash = (text: string | null) => createHash('sha256').update(text ?? '').digest('hex')
const blank = { type: 'Graph', nodes: [], edges: [] }
const store = useGraphStore

export async function testGraphAuthoringMvp() {
  const previous = store.getState()
  let settled = true
  const unregister = registerWorkspaceSceneMetadataEditor(() => ({ path: '/authoring.md', text: store.getState().markdownDocumentText ?? '', settled }))
  const reset = () => store.setState({ graphData: blank, history: [], historyIndex: -1, sourceFiles: [], workspaceViewMode: 'canvas',
    markdownDocumentName: null, markdownDocumentText: '', canvasAuthoringTurn: null, workspaceGraphMutationBlockUntilMs: 0,
    markdownWorkspaceIndexingInFlight: false, workspaceGraphMutationLayoutLockActive: false })
  try {
    reset()
    const catalog = await listGatewayPresets()
    assert.ok(catalog.ok)
    const initialSketch = { ...store.getState(), documentStructureBaselineLock: false }
    const prompt = 'Sketch a robot pair-programming with a human'
    assert.ok(isCanvasDrawingRequest(prompt))
    assert.equal(readCanvasDrawingRequest('/canvas.project #canvas @canvas ' + prompt), prompt)
    assert.equal(readCanvasDrawingRequest('/canvas.project @other #canvas ' + prompt), null)
    assert.equal(readCanvasDrawingRequest('/canvas.project @source.frontmatter @source.body @canvas #canvas\n---\nflow: {}'), null)
    assert.equal(isCanvasDrawingRequest('Draw a conclusion about this graph'), false)
    const scene = stageSketchPrompt(initialSketch, prompt)
    assert.equal(scene.graph.nodes.length, 3)
    assert.equal(scene.graph.edges.length, 2)
    assert.ok(scene.graph.edges.every(e => e.label === '' && e.properties?.relation === 'codes at'))
    assert.ok(scene.graph.nodes.every(n => readNodeSketch(n)!.marks.length >= 6))
    assert.equal(scene.historyLabel, 'Added 3 nodes, 2 edges, 1 group · Pair programming')
    const shapes = stageSketchPrompt(initialSketch, 'Draw a red circle above a blue square')
    assert.deepEqual(shapes.graph.nodes.map(n => readNodeSketch(n)!.marks[0].fill), ['#e88378', '#74a7d3'])
    assert.ok(shapes.graph.nodes[0].y! < shapes.graph.nodes[1].y!)
    const path = stageSketchPrompt(initialSketch, 'Draw path "Wave": M4 40 Q30 8 60 40 T116 40')
    assert.equal(path.graph.nodes[0].label, 'Wave')
    assert.equal(readNodeSketch(path.graph.nodes[0])!.marks[0].d, 'M4 40 Q30 8 60 40 T116 40')
    assert.ok(!Object.hasOwn(path.graph.nodes[0].properties ?? {}, 'properties'))
    assert.throws(() => stageSketchPrompt(initialSketch, 'Draw path: M1 2 Q3 4'), /vector path/)
    const branch = stageSketchPrompt(initialSketch, 'Diagram Draft → Review → Ship; Review → Revise')
    assert.equal(branch.graph.nodes.length, 4)
    assert.equal(branch.graph.edges.length, 3)
    assert.throws(() => stageSketchPrompt(initialSketch, 'Draw a robot with a giraffe'), /Try/)
    assert.throws(() => createStroke(Array(129).fill([1, 2])), /128/)
    const stroke = stageSketchPrompt(initialSketch, 'Draw a line from (10,20) to (50,30)')
    assert.equal(readNodeSketch(stroke.graph.nodes[0])!.caption, false)
    const bad = { marks: [{ d: 'M1 2L3 4', fill: 'url(other)', stroke: 'none', width: 2 }], caption: false }
    assert.equal(readNodeSketch({ ...stroke.graph.nodes[0], properties: { 'visual:sketch': bad } }), null)
    const starters = catalog.presets.filter(preset => preset.authoringStarter)
    assert.equal(starters.length, 4)
    const bodies = join(dirname(createRequire(import.meta.url).resolve('agentic-gateway/catalog/index.json')), 'bodies')
    let reply = ''
    for (const preset of starters) {
      const item = await selectGatewayPreset(preset.id, async digest => readFileSync(join(bodies, digest + '.txt'), 'utf8'))
      assert.ok(item.ok)
      reply = item.prompt.slice(item.prompt.indexOf('\n')).trimStart()
      assert.ok(stageFlow(null, reply).graph.nodes.length)
    }
    assert.equal((await selectGatewayPreset(starters[0].id, async () => 'stale')).ok, false)
    assert.equal(store.getState().markdownDocumentText, '')
    assert.equal(store.getState().historyIndex, -1)
    const request = '/canvas.project @source.frontmatter @source.body @canvas\n' + reply
    const controller = new AbortController()
    let input = request
    let messages: ChatMessage[] = []
    let busyToasts = 0
    const args = {
      input, historyKey: 'authoring-test', abortRef: { current: controller },
      setMessages: (next: React.SetStateAction<ChatMessage[]>) => { messages = typeof next === 'function' ? next(messages) : next },
      setInput: (next: React.SetStateAction<string>) => { input = typeof next === 'function' ? next(input) : next },
    }
    const initial = store.getState()
    const sending = submitCanvasProjection(args, { ...initial, upsertUiToast: () => { busyToasts++ } }, controller)
    assert.deepEqual(messages.map(message => message.role), ['user', 'assistant'])
    assert.equal(messages[0].content, request)
    const pendingId = messages[1].id
    await sending
    assert.equal(messages.length, 2)
    assert.equal(messages[1].id, pendingId)
    assert.equal(messages[1].canvasHistoryEntryId, store.getState().history.at(-1)?.id)
    assert.equal(busyToasts, 0)
    assert.equal(input, '')
    reset()
    const origin = store.getState()
    const before = sourceHash(origin.markdownDocumentText)
    const result = await runCanvasAuthoringTurn(origin, new AbortController(), 'Apply diagram', async state => {
      assert.ok(isWorkspaceGraphMutationBlocked(store.getState()))
      return stageCanvasReply(state, reply)
    })
    assert.equal(store.getState().historyIndex, 1)
    const committed = store.getState()
    assert.equal(result.historyEntryId, committed.history[committed.historyIndex].id)
    assert.equal(result.historyLabel, committed.history[committed.historyIndex].label)
    assert.ok(canUndoCanvasTurn(committed, result.historyEntryId))
    assert.ok(!canUndoCanvasTurn({ ...committed, markdownDocumentText: 'Uncommitted edit' }, result.historyEntryId))
    assert.ok(!canUndoCanvasTurn({ ...committed, markdownDocumentName: 'another.md' }, result.historyEntryId))
    assert.ok(!canUndoCanvasTurn({ ...committed, graphDataRevision: committed.graphDataRevision + 1 }, result.historyEntryId))
    const receipt = { id: 'receipt', role: 'assistant', content: result.historyLabel, canvasHistoryEntryId: result.historyEntryId }
    assert.deepEqual(parseChatHistory([receipt]), [receipt])
    assert.equal(parseChatHistory([{ ...receipt, canvasHistoryEntryId: {} }])?.[0].canvasHistoryEntryId, undefined)
    assert.equal(parseChatHistory([{ id: 'pending', role: 'assistant', content: 'Applying diagram…', canvasPending: true }])?.[0].content, 'Diagram submission interrupted.')
    store.getState().undoHistory()
    assert.equal(sourceHash(store.getState().markdownDocumentText), before)
    store.getState().redoHistory()
    assert.equal(store.getState().markdownDocumentText, result.text)
    assert.equal(Object.keys(canvasTools).length, 5)
    const renderer = store.getState().canvas2dRenderer
    store.getState().setGraphEditorToolId('node')
    assert.equal(store.getState().graphEditorToolId, 'node')
    assert.equal(store.getState().canvas2dRenderer, renderer)
    const initialCount = result.graph.nodes.length
    await authorCanvasTool({ tool: 'node', x: 49, y: 78 })
    const newNode = store.getState().graphData!.nodes.at(-1)!
    const first = result.graph.nodes[0]!.id
    assert.equal(store.getState().graphData!.nodes.length, initialCount + 1)
    await authorCanvasTool({ tool: 'edge', source: first, target: newNode.id })
    await authorCanvasTool({ tool: 'subgraph', members: [first, newNode.id] })
    const reloaded = stageFlow(null, store.getState().markdownDocumentText!).graph
    assert.ok(reloaded.edges.some(edge => edge.source === first && edge.target === newNode.id))
    assert.ok(readSubgraphs(reloaded).some(group => group.memberNodeIds.includes(newNode.id)))
    assert.ok(!canUndoCanvasTurn(store.getState(), result.historyEntryId))
    store.getState().updateNode(first, { label: 'Edited in an untitled diagram' })
    assert.equal(stageFlow(null, store.getState().markdownDocumentText!).graph.nodes.find(node => node.id === first)?.label, 'Edited in an untitled diagram')
    const historyIndex = store.getState().historyIndex
    await assert.rejects(runCanvasAuthoringTurn(store.getState(), new AbortController(), 'Invalid', async state => stageCanvasReply(state, 'broken')), /flow/)
    assert.equal(store.getState().historyIndex, historyIndex)
    for (const refusal of ['cancel', 'switch', 'changed draft', 'stale source']) {
      reset()
      store.setState({ workspaceViewMode: 'editor', markdownDocumentName: '/authoring.md' })
      const controller = new AbortController()
      let finish!: () => void
      const untilReply = new Promise<void>(resolve => { finish = resolve })
      const pending = runCanvasAuthoringTurn(store.getState(), controller, 'Pending', async () => { await untilReply; return result })
      const token = store.getState().canvasAuthoringTurn!
      if (refusal === 'cancel') controller.abort()
      if (refusal === 'switch') store.setState({ markdownDocumentName: '/other.md', markdownDocumentText: 'Other bytes' })
      if (refusal === 'changed draft') settled = false
      if (refusal === 'stale source') store.setState({ markdownDocumentText: 'New bytes' })
      const expected = sourceHash(store.getState().markdownDocumentText)
      finish()
      await assert.rejects(pending)
      assert.equal(store.getState().canvasAuthoringTurn, null)
      assert.equal(commitCanvasAuthoring(token, reply, result.graph, 'Late delivery'), false)
      assert.equal(store.getState().historyIndex, -1)
      assert.equal(sourceHash(store.getState().markdownDocumentText), expected)
      settled = true
    }
  } finally { unregister(); store.setState(previous, true) }
}
