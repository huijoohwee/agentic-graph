import yaml from 'js-yaml'
import { readSubgraphs } from '@/lib/graph/subgraphs'
import { createUniqueId } from '@/lib/ids'
import { createStroke, readNodeSketch, sketchProperties, type SketchPoint } from '@/lib/graph/canvasSketch'
import type { GraphState } from '@/hooks/store/types'
import { upsertTopLevelFrontmatterSectionMarkdownText as setSection } from '@/hooks/store/graph-data-slice/graphDataFrontmatterSections'
import { stageCanvasReply } from './canvasAuthoringFlow'
import { figureMarks, sketchColors, type FigureKind } from './canvasSketchFigures'

const subject = /\b(robot|droid|human|person|developer|coder|computer|laptop|monitor|workstation|circle|oval|ellipse|rectangle|box|square|triangle|diamond|star|cloud|tree|house|sun)\b/gi
const aliases: Record<string, FigureKind> = { droid: 'robot', person: 'human', developer: 'human', coder: 'human',
  computer: 'workstation', laptop: 'workstation', monitor: 'workstation', oval: 'ellipse', box: 'rectangle' }
const hint = 'Try “Sketch a robot pair-programming with a human”, “Draw a red circle above a blue square”, or “Diagram Draft → Review → Publish”.'
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const view = { kgCanvasSurfaceMode: '2d', kgCanvasRenderMode: '2d', kgCanvas2dRenderer: 'd3', kgFrontmatterModeEnabled: true }

export class CanvasDescriptionNeedsModel extends Error {}

export function stageSketchPrompt(state: GraphState, request: string, paths?: string[][], inferDiagram = false) {
  if (state.documentStructureBaselineLock && (state.canvasRenderMode !== '2d' || state.canvas2dRenderer !== 'd3'))
    throw new Error('Unlock the document view before drawing on the 2D Canvas.')
  const body = request.trim().replace(/^(?:please\s+)?(?:sketch|draw|diagram)\b\s*:?\s*/i, '').replace(/[.!?]+$/, '').trim()
  if (!body || body.length > 2000) throw new Error(hint)
  const data = state.graphData
  const used = new Set([...(data?.nodes ?? []), ...(data?.edges ?? [])].map(item => item.id))
  const id = (kind: string) => { const value = createUniqueId('sketch-' + kind + '-', used); used.add(value); return value }
  const nodes: { id: string; label: string; type: string; position: { x: number; y: number }; properties?: Record<string, unknown> }[] = []
  const edges: { id: string; source: string; target: string; label: string; relation?: string; 'visual:opacity'?: number; 'visual:hideLabel'?: boolean }[] = []
  const y0 = data?.nodes.length ? data.nodes.reduce((max, n) => Math.max(max, Number.isFinite(n.y) ? n.y! : 0), 0) + 180 : 0
  let title = 'Sketch'
  const customPath = /^path(?:\s+"([^"\n]{1,64})")?\s*:\s*(.+)$/i.exec(body)
  const diagram = /^(?:please\s+)?diagram\b/i.test(request.trim()) || /^(?:an?\s+)?(?:simple\s+)?(?:flowchart|diagram|workflow)\b/i.test(body)
  const diagramBody = body.replace(/^(?:an?\s+)?(?:simple\s+)?(?:flowchart|diagram|workflow)\b(?:\s+(?:of|for|showing))?\s*:?\s*/i, '')
  const connectors = /\s*(?:->|→)\s*|\s+(?:connects? to|flows? (?:in)?to|leads? to|feeds? into|followed by|then)\s+/i
  if (inferDiagram && diagram && !connectors.test(diagramBody)) throw new CanvasDescriptionNeedsModel(hint)
  if (customPath) {
    title = customPath[1] || 'Freeform path'
    const properties = sketchProperties({ marks: [{ d: customPath[2], fill: 'none', stroke: '#5294dd', width: 3 }], caption: !!customPath[1] }, 168, 140)
    if (!readNodeSketch({ properties })) throw new Error('Use a vector path starting with M in a 120 × 100 drawing area.')
    nodes.push({ id: id('path'), label: title, type: 'Sketch', position: { x: 0, y: y0 }, properties })
  } else if (paths || diagram || connectors.test(body)) {
    title = 'Diagram'
    const names = new Map<string, string>()
    const chains = paths ?? diagramBody.split(/[;\n]/).map(chain => chain.split(connectors).map(label => label.trim()))
    for (const labels of chains) {
      if (labels.some(label => !label || label.length > 80)) throw new Error('Use short step names, → between steps and a semicolon between branches.')
      let previous = ''
      for (const label of labels) {
        let key = names.get(label)
        if (!key) {
          if (nodes.length >= 32) throw new Error('A local diagram supports up to 32 steps per turn.')
          key = id('step')
          const index = nodes.length
          nodes.push({ id: key, label, type: 'Concept', position: { x: (index % 5) * 180, y: y0 + Math.floor(index / 5) * 125 },
            properties: { 'visual:shape': 'rect', 'visual:width': 150, 'visual:height': 56 } })
          names.set(label, key)
        }
        if (previous && !edges.some(edge => edge.source === previous && edge.target === key))
          edges.push({ id: id('link'), label: 'next', source: previous, target: key })
        previous = key
      }
    }
  } else if (/^(?:(?:a|the)\s+)?(?:freehand\s+)?(?:stroke|line)\b/i.test(body)) {
    const coords = body.replace(/^(?:(?:a|the)\s+)?(?:freehand\s+)?(?:stroke|line)(?:\s+(?:through|from))?\s*:?\s*/i, '')
    const pair = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g
    const points: SketchPoint[] = Array.from(coords.matchAll(pair), m => [Number(m[1]), Number(m[2])])
    if (coords.replace(pair, '').replace(/\b(?:to|and)\b|[,\s]/gi, '')) throw new Error('Use points such as (0,0), (40,20), (80,0).')
    nodes.push({ ...createStroke(points), id: id('stroke') })
    title = 'Freehand stroke'
  } else {
    const subjects = [...body.matchAll(subject)]
    if (!subjects.length) throw new CanvasDescriptionNeedsModel(hint)
    if (subjects.length > 12) throw new Error(hint)
    const remainder = body.replace(subject, '').replace(/\b(?:a|an|the|at|on|of|to|from|with|and|or|by|in|beside|next|above|below|under|over|left|right|shared|using|pair[- ](?:programming|coding)|side[- ]by[- ]side)\b/gi, '')
      .replace(/\b(?:red|orange|yellow|green|blue|purple|pink|teal|white|black)\b/gi, '').replace(/[\s,.&-]/g, '')
    if (remainder) throw new CanvasDescriptionNeedsModel(hint)
    const pairing = /\bpair[\s-]+(?:programming|coding)\b/i.test(body)
    const props = subjects.map((match, i) => {
      const name = match[0].toLowerCase()
      const prefix = body.slice(i ? subjects[i - 1].index! + subjects[i - 1][0].length : 0, match.index)
      const tint = /\b(\w+)\s*$/.exec(prefix)?.[1]?.toLowerCase()
      return { kind: aliases[name] ?? name as FigureKind, label: capitalize(name), color: tint && Object.hasOwn(sketchColors, tint) ? sketchColors[tint] : undefined, prefix }
    })
    if (pairing && props.some(p => p.kind === 'robot') && props.some(p => p.kind === 'human')) {
      title = 'Pair programming'
      if (!props.some(p => p.kind === 'workstation')) props.push({ kind: 'workstation', label: 'Shared workstation', color: undefined, prefix: '' })
    } else title = props.map(p => p.label).join(' and ').slice(0, 80)
    let x = 0, y = y0
    for (const [i, item] of props.entries()) {
      if (i) {
        if (/\b(?:above|over)\b/i.test(item.prefix)) y += 160
        else if (/\b(?:below|under)\b/i.test(item.prefix)) y -= 160
        else x += /\bright of\b/i.test(item.prefix) ? -185 : 185
      }
      const position = title === 'Pair programming' && props.length === 3
        ? { x: item.kind === 'human' ? -170 : item.kind === 'workstation' ? 0 : 170, y: y0 + (item.kind === 'workstation' ? 30 : 0) }
        : { x, y }
      nodes.push({ id: id(item.kind), label: item.label, position, type: 'Sketch',
        properties: sketchProperties({ marks: figureMarks(item.kind, item.color), caption: true }, 168, 140) })
    }
    if (title === 'Pair programming') {
      const screen = nodes[props.findIndex(p => p.kind === 'workstation')].id
      for (const [i, item] of props.entries()) if (item.kind === 'human' || item.kind === 'robot')
        edges.push({ id: id('link'), source: nodes[i].id, target: screen, label: '', relation: 'codes at', 'visual:opacity': 0, 'visual:hideLabel': true })
    }
  }
  const groupId = createUniqueId('sketch-group-', new Set(data ? readSubgraphs(data).map(group => group.id) : []))
  const flow = { nodes, edges, subgraphs: [{ id: groupId, label: title, memberNodeIds: nodes.map(n => n.id) }] }
  const reply = '---\n' + yaml.dump({ title, ...view, flow }, { noRefs: true, lineWidth: -1 }) + '---\n\n# ' + title + '\n'
  if (!state.markdownDocumentText?.trim()) return stageCanvasReply(state, reply)
  let text = state.markdownDocumentText
  for (const [key, value] of Object.entries(view)) text = setSection({ rawText: text, sectionKey: key, sectionValue: value })
  return stageCanvasReply({ ...state, markdownDocumentText: text }, reply)
}
