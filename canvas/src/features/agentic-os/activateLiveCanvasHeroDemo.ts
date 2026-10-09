import { dump as dumpYaml } from 'js-yaml'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { activateFirstImportedWorkspaceFile } from '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
import { buildHistoryKey, putChatHistoryCache, publishChatHistoryTransition } from '@/features/chat/floatingPanelChat/floatingPanelChatRuntime'
import { openFloatingPanelChat } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenSeed'
import { whenFloatingPanelBridgeReady } from '@/features/toolbar/floatingPanelBridge'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import { getLocalStorage, writeJsonToStorage } from '@/lib/persistence'
import { buildLiveCanvasHeroPresetDemo, type LiveCanvasHeroPresetSelection } from './liveCanvasHeroPresetDemo'
import {
  buildLiveCanvasHeroDemoReply,
  FLIGHT_SIM_HERO_DEMO_SOURCE_PATH,
  loadLiveCanvasHeroDemo,
  LIVE_CANVAS_HERO_DEMO_SOURCE,
  type LiveCanvasHeroDemo,
} from './liveCanvasHeroDemoSource'

/** Seed only the activated demo's native history identity. */
export function handoffLiveCanvasHeroDemoHistory(id: string, text: string, messages: ChatMessage[]): void {
  const state = useGraphStore.getState()
  if (state.markdownDocumentText !== text || !state.markdownDocumentName?.includes(id)) {
    throw new Error('The active demo changed before its conversation was ready.')
  }
  const key = buildHistoryKey(state.graphData)
  const storage = getLocalStorage()
  if (storage) writeJsonToStorage(storage, key, messages)
  putChatHistoryCache(key, messages)
  publishChatHistoryTransition({ historyKeys: [key], messages })
}

export function buildLiveCanvasHeroDemoDocument(selection: LiveCanvasHeroPresetSelection, demo: LiveCanvasHeroDemo, graphId: string) {
  if (demo.sourcePath) throw new Error('This demo opens its canonical workspace seed directly.')
  const graph = buildLiveCanvasHeroPresetDemo(selection, demo)
  const reply = buildLiveCanvasHeroDemoReply(demo)
  const messages: ChatMessage[] = [
    { id: `${graphId}:prompt`, role: 'user', content: selection.prompt },
    { id: `${graphId}:example`, role: 'assistant', content: reply },
  ]
  const frontmatter = dumpYaml({
    title: `${demo.title} · Demo`, graphId, demo_only: true,
    demo_source: LIVE_CANVAS_HERO_DEMO_SOURCE, preset_id: selection.id,
    prompt_source: demo.demoOnlyPrompt ? LIVE_CANVAS_HERO_DEMO_SOURCE : 'agentic-canvas-os/docs/PROMPT-PRESETS.md',
    kgCanvasSurfaceMode: 'canvas', kgCanvasRenderMode: '2d', kgCanvas2dRenderer: 'storyboard',
    flow: {
      nodes: graph.nodes.map(node => ({ id: node.id, type: node.type, label: node.label,
        position: { x: node.x, y: node.y }, properties: node.properties })),
      edges: graph.edges,
    },
  }, { lineWidth: 100, noRefs: true })
  const text = ['---', frontmatter.trimEnd(), '---', '', `# ${demo.title} · Demo`, '',
    '> Example outputs and conversation from demo.md. No model call or generated artifact.', '',
    '## Prompt preset', '', selection.prompt, '', '## Example response', '', reply, '',
  ].join('\n')
  return { text, messages }
}

/** Explicit Demo creates its own local document and history; existing user files and chats stay intact. */
export async function activateLiveCanvasHeroDemo(selection: LiveCanvasHeroPresetSelection): Promise<void> {
  if (!selection.prompt.trim()) throw new Error('Choose or enter a prompt before opening Demo.')
  if (selection.id === 'agent-observability') {
    const { activateAgentRunPrompt } = await import('@/features/agent-ready/agentRunInspectionStore')
    activateAgentRunPrompt(selection.prompt)
    return
  }
  const demo = await loadLiveCanvasHeroDemo(selection.id)
  if (selection.id === 'flight-sim') {
    if (demo.sourcePath !== FLIGHT_SIM_HERO_DEMO_SOURCE_PATH
      || selection.prompt.trim().replace(/\s+/g, ' ') !== '/flight.sim @canvas #flight operation=open') {
      throw new Error('Reload the source-backed Flight Sim preset before opening Demo.')
    }
    const fs = await getWorkspaceFs()
    const path = demo.sourcePath as `/docs/${string}`
    const text = String(await fs.readFileText(path).catch(() => ''))
    const { isFlightSimRunReadyDemoActive } = await import('@/features/workspace-fs/workspaceRunReadyDemos')
    if (!text || !isFlightSimRunReadyDemoActive(path, text)) {
      throw new Error(`The canonical Flight Sim workspace seed is unavailable or has a conflicting identity: ${path}`)
    }
    useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    if (!await activateFirstImportedWorkspaceFile({ fs, createdPaths: [path], applyToGraph: true })) {
      throw new Error('The canonical Flight Sim seed could not become active. Your existing document is still available.')
    }
    const active = useGraphStore.getState()
    if (!isFlightSimRunReadyDemoActive(active.markdownDocumentName, active.markdownDocumentText)) {
      throw new Error('The active document did not retain the canonical Flight Sim identity.')
    }
    return
  }
  if (selection.id === 'programmatic-drone-flight') {
    const { activateProgrammaticDroneDemo, isProgrammaticDronePrompt } = await import('@/features/python-learning/programmaticDronePreset')
    if (!isProgrammaticDronePrompt(selection.prompt)) throw new Error('Reload the Programmatic Drone Flight preset before opening Demo.')
    await activateProgrammaticDroneDemo()
    return
  }
  if (demo.repository) {
    const { activateLiveCanvasHeroRepositoryDemo } = await import('./activateLiveCanvasHeroRepositoryDemo')
    return activateLiveCanvasHeroRepositoryDemo(selection, demo)
  }
  const id = `preset-demo-${selection.id}-${crypto.randomUUID()}`
  const { text, messages } = buildLiveCanvasHeroDemoDocument(selection, demo, id)
  const fs = await getWorkspaceFs()
  const parentPath = `/docs/demos/${selection.id}/${id}`
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: parentPath })
  const path = await fs.createFile({ parentPath, name: 'demo.md', text, mirrorToHost: false })
  await applyWorkspaceImportToCanvas({ fs, createdPaths: [path], opts: { applyToGraph: false, skipComposedGraphApply: true } })
  useGraphStore.getState().setWorkspaceViewMode('editor')
  if (!await activateFirstImportedWorkspaceFile({ fs, createdPaths: [path], applyToGraph: true })) {
    throw new Error('The demo file could not become the active document. Your prompt is still here; try again.')
  }
  const store = useGraphStore.getState()
  if (store.markdownDocumentText !== text) throw new Error('The active document changed before Demo was ready. Try again.')
  if (!String(store.graphData?.metadata?.source || '').includes(id)) throw new Error('The demo graph is not ready. Try again.')
  handoffLiveCanvasHeroDemoHistory(id, text, messages)
  whenFloatingPanelBridgeReady(() => { openFloatingPanelChat() })
}
