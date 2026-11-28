import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'
import { runCanvasAuthoringTurn } from '@/features/graph-editor/canvasAuthoringTurn'
import { stageCanvasReply, stageFlow } from '@/features/graph-editor/canvasAuthoringFlow'
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
    const origin = store.getState()
    const before = sourceHash(origin.markdownDocumentText)
    const result = await runCanvasAuthoringTurn(origin, new AbortController(), 'Apply diagram', async state => {
      assert.ok(isWorkspaceGraphMutationBlocked(store.getState()))
      return stageCanvasReply(state, reply)
    })
    assert.equal(store.getState().historyIndex, 1)
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
      assert.equal(store.getState().commitCanvasAuthoring(token, reply, result.graph, 'Late delivery'), false)
      assert.equal(store.getState().historyIndex, -1)
      assert.equal(sourceHash(store.getState().markdownDocumentText), expected)
      settled = true
    }
  } finally { unregister(); store.setState(previous, true) }
}
