import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseLiveCanvasHeroDemos, buildLiveCanvasHeroDemoReply, LIVE_CANVAS_HERO_DEMO_SOURCE } from '@/features/agentic-os/liveCanvasHeroDemoSource'
import { buildLiveCanvasHeroDemoDocument, handoffLiveCanvasHeroDemoHistory } from '@/features/agentic-os/activateLiveCanvasHeroDemo'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { buildHistoryKey, getCachedChatHistory, putChatHistoryCache } from '@/features/chat/floatingPanelChat/floatingPanelChatRuntime'
import { loadPromptPresetCatalog, isPromptPresetCatalogError } from '@/features/chat/promptPresetCatalog'
import { createPresetWorkspace } from './floatingPanelChatVideoPreset.test'
import { useGraphStore } from '@/hooks/useGraphStore'
import { listDisplayRichMediaOverlayNodes } from '@/lib/render/richMediaSsot'
import { activateLiveCanvasHeroRepositoryDemo } from '@/features/agentic-os/activateLiveCanvasHeroRepositoryDemo'
import { agentGraphResult, SOURCE_BACKED_INVOCATION } from './agentGraphWorkspaceArtifact.test'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'

export async function testLiveCanvasHeroDemoDocumentMatchesConversation(): Promise<void> {
  const demos = parseLiveCanvasHeroDemos(readFileSync(resolve(process.cwd(), '..', LIVE_CANVAS_HERO_DEMO_SOURCE), 'utf8'))
  const catalog = await loadPromptPresetCatalog(await createPresetWorkspace())
  if (isPromptPresetCatalogError(catalog)) throw new Error(catalog.error)
  // Unique demo ids are enforced by the source parser. Additional demos may precede paired catalog integration.
  // The loop still requires exactly one source-backed demo for every preset in this fixture.
  const historyKeys = new Set<string>()
  for (const preset of catalog.presets) {
    const demo = demos.find(value => value.id === preset.id)
    if (!demo) throw new Error(`Missing demo: ${preset.id}`)
    const prompt = `${preset.prompt}\nUser-edited example constraint.`
    if (demo.repository) {
      const { restore } = initJsdomHarness()
      const previous = useGraphStore.getState()
      resetWorkspaceFsForTests()
      try {
        let imports = 0
        const result = agentGraphResult()
        result.acquisition = { mode: 'repository-url', repositoryUrl: demo.repository, commitSha: '8'.repeat(40), subpath: '' }
        const options = {
          bridge: { agentGraph: { importRepositoryUrl: async (url: string) => {
            if (url !== demo.repository) throw new Error('Demo must import its authored URL')
            imports += 1
            return result
          } }, materializeAgentGraphImport: async () => { throw new Error('Demo must keep its document local') } },
          resolveMcpInvocation: async () => ({ invocation: SOURCE_BACKED_INVOCATION }),
        }
        await activateLiveCanvasHeroRepositoryDemo({ id: preset.id, prompt }, demo, options)
        const active = useGraphStore.getState()
        const key = buildHistoryKey(active.graphData)
        const messages = getCachedChatHistory(key)
        if (imports !== 1 || active.canvas2dRenderer !== 'd3' || !active.markdownDocumentName?.endsWith('/demo.md')
          || !active.markdownDocumentName.startsWith('notes/demos/launch-copilot/')
          || !active.markdownDocumentText?.includes('8'.repeat(40)) || !active.markdownDocumentText?.includes(prompt)
          || messages?.length !== 2 || !active.markdownDocumentText.includes(messages[1].content)
          || active.graphData?.nodes[0]?.id !== 'repo:alpha' || active.graphData?.edges[0]?.id !== 'edge:alpha-beta'
          || deriveGraphGroups(active.graphData).length !== 1) throw new Error('Repository Demo must activate the native graph, document and matching Chat')
        const text = active.markdownDocumentText
        const name = active.markdownDocumentName
        active.setGraphData({ type: 'Graph', nodes: [], edges: [] })
        await active.setActiveMarkdownDocument({ name, text, applyToGraph: true })
        if (buildHistoryKey(useGraphStore.getState().graphData) !== key || useGraphStore.getState().graphData?.edges[0]?.id !== 'edge:alpha-beta') {
          throw new Error(`Reopening demo.md must preserve its source graph and conversation identity: ${JSON.stringify({ key, actual: buildHistoryKey(useGraphStore.getState().graphData), edge: useGraphStore.getState().graphData?.edges[0]?.id, name: useGraphStore.getState().markdownDocumentName })}`)
        }
        putChatHistoryCache(key, [])
        await activateLiveCanvasHeroRepositoryDemo({ id: preset.id, prompt }, demo, options)
        if (buildHistoryKey(useGraphStore.getState().graphData) === key || getCachedChatHistory(key)?.length !== 0) {
          throw new Error('A new repository Demo must not replace an earlier conversation')
        }
        const beforeFailure = useGraphStore.getState().graphData
        let rejected = false
        try { await activateLiveCanvasHeroRepositoryDemo({ id: preset.id, prompt }, demo, { ...options,
          bridge: { agentGraph: { importRepositoryUrl: async () => { throw new Error('Host unavailable') } } },
        }) } catch { rejected = true }
        if (!rejected || useGraphStore.getState().graphData !== beforeFailure) throw new Error('Import failure must preserve the current graph without an example fallback')
        const fs = await getWorkspaceFs()
        if (!(await fs.listEntries()).some(entry => entry.path.startsWith('/notes/codebase-graph/'))) throw new Error('Native source projection must persist in the workspace')
      } finally { useGraphStore.setState(previous, true); resetWorkspaceFsForTests(); restore() }
      continue
    }
    const { text, messages } = buildLiveCanvasHeroDemoDocument({ id: preset.id, prompt }, demo, `test-demo-${preset.id}`)
    if (messages.length !== 2 || messages[0].content !== prompt || messages[1].content !== buildLiveCanvasHeroDemoReply(demo)
      || !text.includes(messages[1].content) || !text.includes(prompt)) throw new Error('Document and conversation must share the exact prompt and example response')
    const parsed = tryParseMarkdownFrontmatterFlowGraph('demo.md', text)
    if (!parsed || parsed.graphData.nodes.length !== demo.outputs.length + 1) throw new Error(`Demo must parse the selected output graph: ${preset.id}`)
    if (listDisplayRichMediaOverlayNodes({ nodes: parsed.graphData.nodes, renderMediaAsNodes: false,
      canvasRenderMode: '2d', canvas2dRenderer: 'storyboard', poolMax: 24 }).length !== parsed.graphData.nodes.length) {
      throw new Error('Example panels must remain visible when the previous physics view hid rich media')
    }
    for (const output of demo.outputs) {
      if (!parsed.graphData.nodes.some(node => node.properties.output === output.text)) throw new Error(`Missing example output: ${output.title}`)
    }
    if (parsed.graphData.nodes.some(node => node.properties.command)) throw new Error('Demo output nodes must not execute')
    const previous = useGraphStore.getState()
    let key: string
    try {
      const activated = await previous.setActiveMarkdownDocument({ name: `demos/test-demo-${preset.id}/demo.md`, text, applyToGraph: true, applyViewPreset: false })
      if (!activated) throw new Error('Native workspace activation failed')
      key = buildHistoryKey(useGraphStore.getState().graphData)
      handoffLiveCanvasHeroDemoHistory(`test-demo-${preset.id}`, text, messages)
      if (getCachedChatHistory(key)?.length !== 2) throw new Error('Demo must seed the native Chat history')
      putChatHistoryCache(key, [])
      if (getCachedChatHistory(key)?.length !== 0) throw new Error('Demo must respect a later Clear action')
    } finally { useGraphStore.setState(previous, true) }
    if (historyKeys.has(key)) throw new Error('Demo conversations must not share history across presets')
    historyKeys.add(key)
    if ((demo.background === 'xr-physics') !== (preset.id === 'xr-physics')) throw new Error('Only Physics Playground owns the physics background')
  }
}

export function testLiveCanvasHeroDemoSourceRejectsInvalidRecords(): void {
  const text = readFileSync(resolve(process.cwd(), '..', LIVE_CANVAS_HERO_DEMO_SOURCE), 'utf8')
  for (const invalid of [text.replace('demo_only: true', 'demo_only: false'), text.replace('id: launch-copilot', 'id: xr-physics'),
    text.replace('repository: https://github.com/anthropics/commerce-agents', 'repository: file:///tmp/private'),
    text.replace('background: xr-physics', 'background: https://example.com'), 'x'.repeat(40_001)]) {
    let rejected = false
    try { parseLiveCanvasHeroDemos(invalid) } catch { rejected = true }
    if (!rejected) throw new Error('Invalid source must not become a demo')
  }
}
