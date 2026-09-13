import type { GraphData, GraphNode } from '@/lib/graph/types'
import { splitInvocationTokenSegments } from '@/lib/markdown/invocationTokens'
import type { LiveCanvasHeroDemo } from './liveCanvasHeroDemoSource'

export type LiveCanvasHeroPresetSelection = { id: string; prompt: string }

/** A temporary view of the selected prompt, never generated output or repository evidence. */
export function buildLiveCanvasHeroPresetDemo(selection: LiveCanvasHeroPresetSelection, demo?: LiveCanvasHeroDemo): GraphData {
  if (demo && demo.id !== selection.id) throw new Error('The demo does not match the selected preset.')
  const prefix = `prompt-preset:${selection.id}:`
  const segments = splitInvocationTokenSegments(selection.prompt)
  const tokens = [...new Set(segments.filter(part => part.kind === 'token').map(part => part.value))]
  const fields = [
    { id: 'prompt', label: 'Prompt preset', text: selection.prompt },
    ...(demo ? demo.outputs.map((output, index) => ({ id: `output-${index}`, label: `Example · ${output.title}`, text: output.text })) : [
      { id: 'route', label: 'Route', text: tokens.filter(token => token.startsWith('/')).join('\n') },
      { id: 'context', label: 'Context', text: tokens.filter(token => token.startsWith('@')).join('\n') },
      { id: 'meaning', label: 'Parameters', text: tokens.filter(token => token.startsWith('#')).join('\n') },
    ]),
  ].filter(field => field.text.trim())
  const nodes: GraphNode[] = fields.map((field, index) => ({
    id: `${prefix}${field.id}`, label: field.label, type: 'RichMediaPanel',
    x: index === 0 ? 0 : 460, y: index === 0 ? 0 : (index - 1) * 230,
    fx: index === 0 ? 0 : 460, fy: index === 0 ? 0 : (index - 1) * 230,
    properties: {
      output: field.text, richMediaActiveTab: 'text', richMediaDisplayMode: 'panel-only',
      freezeConnectedOutput: true, 'visual:width': 400,
      'visual:height': index === 0 ? 500 : 210, promptPresetDemo: true,
    },
  }))
  return {
    type: 'Graph', nodes,
    edges: nodes.slice(1).map(node => ({
      id: `${node.id}:prompt`, source: nodes[0].id, target: node.id, label: node.label,
      properties: { 'visual:dash': '6,4' },
    })),
    metadata: { kind: 'prompt-preset-demo', presetId: selection.id, transient: true },
  }
}
