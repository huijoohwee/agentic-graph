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

export async function testLiveCanvasHeroDemoDocumentMatchesConversation(): Promise<void> {
  const demos = parseLiveCanvasHeroDemos(readFileSync(resolve(process.cwd(), '..', LIVE_CANVAS_HERO_DEMO_SOURCE), 'utf8'))
  const catalog = await loadPromptPresetCatalog(await createPresetWorkspace())
  if (isPromptPresetCatalogError(catalog)) throw new Error(catalog.error)
  if (catalog.presets.length !== demos.length) throw new Error('Every catalog preset needs exactly one demo')
  const historyKeys = new Set<string>()
  for (const preset of catalog.presets) {
    const demo = demos.find(value => value.id === preset.id)
    if (!demo) throw new Error(`Missing demo: ${preset.id}`)
    const prompt = `${preset.prompt}\nUser-edited example constraint.`
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
    text.replace('background: xr-physics', 'background: https://example.com'), 'x'.repeat(40_001)]) {
    let rejected = false
    try { parseLiveCanvasHeroDemos(invalid) } catch { rejected = true }
    if (!rejected) throw new Error('Invalid source must not become a demo')
  }
}
