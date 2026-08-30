import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { splitMarkdownLines, parseMarkdownFrontmatter, parseMarkdownBlocks } from '@/lib/markdown'
import { hashText } from '@/features/parsers/hash'
import { writeWidgetRegistryMetadata } from '@/lib/config.storyboard-widget'
import { FLOW_WIDGET_FORM_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { FLOW_EDGE_DISPLAY_LABEL_KEY, FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import { AG_SUBGRAPHS_KEY } from '@/lib/graph/subgraphs'

type RegistryPort = { portKey: string; direction: 'input' | 'output' }
type RegistryEntry = {
  id: string
  isEnabled: boolean
  nodeTypeId: string
  widgetTypeId: string
  formId: string
  fields: unknown[]
  ports: RegistryPort[]
  updatedAt: string
}

const FRONTMATTER_REGISTRY_UPDATED_AT = '1970-01-01T00:00:00.000Z'
const FLOW_PORT_TYPES_KEY = 'flow:portTypes' as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function cleanIdPart(v: unknown): string {
  return String(typeof v === 'string' ? v : '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

function normalizeKey(v: unknown): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function stripInlineMd(v: unknown): string {
  return String(v || '')
    .replace(/`+/g, '')
    .replace(/\*\*/g, '')
    .replace(/[*_]/g, '')
    .trim()
}

const EMOJI_SOCKET: Record<string, { typeId: string; color: string }> = {
  '🔵': { typeId: 'STRING', color: '#AED6F1' },
  '🟢': { typeId: 'OBJECT', color: '#A9DFBF' },
  '🟡': { typeId: 'BEAT', color: '#F9E79F' },
  '🟣': { typeId: 'COLOR_MAP', color: '#D7BDE2' },
  '🔴': { typeId: 'AUDIO_CLIP', color: '#F1948A' },
}

const CODEPOINT_SOCKET: Record<string, { typeId: string; color: string }> = {
  '0001f535': { typeId: 'STRING', color: '#AED6F1' },
  '0001f7e2': { typeId: 'OBJECT', color: '#A9DFBF' },
  '0001f7e1': { typeId: 'BEAT', color: '#F9E79F' },
  '0001f7e3': { typeId: 'COLOR_MAP', color: '#D7BDE2' },
  '0001f534': { typeId: 'AUDIO_CLIP', color: '#F1948A' },
}

function readEmojiSocketType(raw: string): { typeId: string; color: string } | null {
  for (const k of Object.keys(EMOJI_SOCKET)) {
    if (raw.includes(k)) return EMOJI_SOCKET[k] || null
  }
  const m = /<([0-9a-fA-F]{8})>/.exec(raw)
  if (m) {
    const key = String(m[1] || '').toLowerCase()
    return CODEPOINT_SOCKET[key] || null
  }
  return null
}

function stripArrows(v: unknown): string {
  return String(v || '').replace(/[←→]/g, ' ').replace(/\s+/g, ' ').trim()
}

function parsePortLabel(raw: string): { label: string; socketType: string } | null {
  const s = stripInlineMd(raw)
  if (!s) return null
  const emoji = readEmojiSocketType(s)
  const socketType = emoji?.typeId || ''
  const withoutEmoji = (() => {
    let out = s
    out = out.replace(/<[0-9a-fA-F]{8}>/g, ' ')
    for (const k of Object.keys(EMOJI_SOCKET)) out = out.split(k).join(' ')
    return stripArrows(out).trim()
  })()
  const label = withoutEmoji.trim()
  if (!label) return null
  return { label, socketType }
}

function toPortKey(label: string): string {
  const s = normalizeKey(label)
  if (!s) return ''
  return s.replace(/\s+/g, '_')
}

function buildSocketTypesMetadata(): Record<string, JSONValue> {
  const meta: Record<string, JSONValue> = {}
  for (const { typeId, color } of Object.values(EMOJI_SOCKET)) {
    if (meta[typeId]) continue
    meta[typeId] = { color, accepts: [typeId] } as unknown as JSONValue
  }
  return meta
}

function tryParseEdgeLine(lineRaw: string): { sourceLabel: string; targets: Array<{ nodeLabel: string; portLabel: string }> } | null {
  const line = stripInlineMd(lineRaw)
  if (!line) return null
  const m = /^(.*?)\s*(?:→|->)\s*(.*)$/.exec(line)
  if (!m) return null
  const sourceLabel = stripInlineMd(m[1] || '')
  const rhs = stripInlineMd(m[2] || '')
  if (!sourceLabel || !rhs) return null
  const targets: Array<{ nodeLabel: string; portLabel: string }> = []
  for (const seg of rhs.split('·')) {
    const s = stripInlineMd(seg)
    if (!s) continue
    const idx = s.indexOf(':')
    if (idx < 0) continue
    const nodeLabel = stripInlineMd(s.slice(0, idx))
    const portLabel = stripInlineMd(s.slice(idx + 1))
    if (!nodeLabel || !portLabel) continue
    targets.push({ nodeLabel, portLabel })
  }
  if (targets.length === 0) return null
  return { sourceLabel, targets }
}

export function tryParseMarkdownPanelFlowGraph(
  name: string,
  text: string,
): { graphData: GraphData; warnings: string[] } | null {
  const raw = String(text || '')
  const looksLikePanelSpec =
    raw.includes('← Inputs') &&
    raw.includes('Outputs →') &&
    (raw.includes('**Edges**') || raw.includes('**Edges** '))
  if (!looksLikePanelSpec) return null

  const lines = splitMarkdownLines(raw)
  const { startIndex } = parseMarkdownFrontmatter(lines)
  const blocks = parseMarkdownBlocks(lines, startIndex)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const registry: RegistryEntry[] = []

  const nodeIdByLabel = new Map<string, string>()
  const outPortByLabel = new Map<string, { nodeId: string; portKey: string; socketType: string }>()
  const portTypesByNodeId = new Map<string, { in: Record<string, string>; out: Record<string, string> }>()
  const registryPortsByNodeId = new Map<string, RegistryPort[]>()

  let col = 0
  let row = 0
  const bumpRow = () => {
    row += 1
  }

  const addPort = (nodeId: string, dir: 'in' | 'out', portLabel: string, socketType: string) => {
    const pk = toPortKey(portLabel)
    if (!pk) return
    const cur = portTypesByNodeId.get(nodeId) || { in: {}, out: {} }
    if (dir === 'in') {
      if (!cur.in[pk]) cur.in[pk] = socketType || ''
    } else {
      if (!cur.out[pk]) cur.out[pk] = socketType || ''
    }
    portTypesByNodeId.set(nodeId, cur)
    const list = registryPortsByNodeId.get(nodeId) || []
    const direction = dir === 'in' ? 'input' : 'output'
    if (!list.some(p => p.direction === direction && p.portKey === pk)) {
      registryPortsByNodeId.set(nodeId, [...list, { direction, portKey: pk }])
    }
  }

  const addPanelNodeFromHeading = (label: string) => {
    const idBase = cleanIdPart(label) || hashText(label)
    const nodeId = `panel:${idBase}`
    const formId = `panel:${idBase}`
    const x = 40 + col * 420
    const y = 80 + row * 220
    const properties: Record<string, JSONValue> = {
      category: `column_${col + 1}` as unknown as JSONValue,
      'visual:layer': `column_${col + 1}` as unknown as JSONValue,
      [FLOW_WIDGET_FORM_ID_KEY]: formId as unknown as JSONValue,
    }
    nodes.push({
      id: nodeId,
      label,
      type: 'Panel',
      x,
      y,
      properties,
    })
    nodeIdByLabel.set(normalizeKey(label), nodeId)
    registry.push({
      id: `qer-panel-${idBase}`,
      isEnabled: true,
      nodeTypeId: 'Panel',
      widgetTypeId: 'default',
      formId,
      fields: [],
      ports: [],
      updatedAt: FRONTMATTER_REGISTRY_UPDATED_AT,
    })
    bumpRow()
    return nodeId
  }

  const getRegistryEntry = (nodeId: string): RegistryEntry | null => {
    const node = nodes.find(n => n.id === nodeId) || null
    if (!node) return null
    const formId = String(((node.properties || {}) as Record<string, unknown>)[FLOW_WIDGET_FORM_ID_KEY] || '').trim()
    if (!formId) return null
    const entry = registry.find(r => r.formId === formId) || null
    return entry
  }

  const applyPortsToNodes = () => {
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const nodeId = String(n.id || '').trim()
      if (!nodeId) continue
      const types = portTypesByNodeId.get(nodeId)
      if (!types) continue
      n.properties = {
        ...((n.properties || {}) as Record<string, JSONValue>),
        [FLOW_PORT_TYPES_KEY]: { in: types.in, out: types.out } as unknown as JSONValue,
      }
      const entry = getRegistryEntry(nodeId)
      if (entry) {
        entry.ports = registryPortsByNodeId.get(nodeId) || []
      }
    }
  }

  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i]
    if (!b) continue
    if (b.kind === 'heading' && b.level === 2) {
      const m = /^column\s+(\d+)/i.exec(stripInlineMd(b.text))
      if (m) {
        const next = Math.max(1, Math.min(6, Number(m[1] || 1)))
        col = next - 1
        row = 0
      }
      continue
    }
    if (b.kind === 'heading' && b.level === 3) {
      const label = stripInlineMd(b.text)
      if (!label) continue
      const nodeId = addPanelNodeFromHeading(label)
      const tableBlock = (() => {
        for (let j = i + 1; j < blocks.length; j += 1) {
          const nb = blocks[j]
          if (!nb) continue
          if (nb.kind === 'heading' && nb.level <= 3) return null
          if (nb.kind === 'table') return nb
        }
        return null
      })()
      if (tableBlock && tableBlock.kind === 'table' && Array.isArray(tableBlock.tableRows)) {
        const rows = tableBlock.tableRows || []
        for (let r = 0; r < rows.length; r += 1) {
          const rowCells = rows[r] || []
          const inCell = rowCells[0] || ''
          const outCell = rowCells[2] || ''
          const inp = parsePortLabel(inCell)
          if (inp) addPort(nodeId, 'in', inp.label, inp.socketType)
          const outp = parsePortLabel(outCell)
          if (outp) {
            addPort(nodeId, 'out', outp.label, outp.socketType)
            const pk = toPortKey(outp.label)
            if (pk && !outPortByLabel.has(normalizeKey(outp.label))) {
              outPortByLabel.set(normalizeKey(outp.label), { nodeId, portKey: pk, socketType: outp.socketType })
            }
          }
        }
      }
      continue
    }
  }

  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i]
    if (!b || b.kind !== 'paragraph') continue
    const txt = String(b.text || '')
    const lines = txt.split('\n')
    for (let li = 0; li < lines.length; li += 1) {
      const parsed = tryParseEdgeLine(lines[li] || '')
      if (!parsed) continue
      const src =
        outPortByLabel.get(normalizeKey(parsed.sourceLabel)) ||
        (() => {
          const pk = toPortKey(parsed.sourceLabel)
          if (!pk) return null
          for (const [nodeId, types] of portTypesByNodeId.entries()) {
            const socketType = types.out?.[pk] ?? ''
            if (Object.prototype.hasOwnProperty.call(types.out, pk)) return { nodeId, portKey: pk, socketType }
          }
          return null
        })()
      if (!src) continue
      for (let t = 0; t < parsed.targets.length; t += 1) {
        const tgt = parsed.targets[t]!
        const nodeId = nodeIdByLabel.get(normalizeKey(tgt.nodeLabel)) || ''
        if (!nodeId) continue
        const portKey = toPortKey(tgt.portLabel)
        if (!portKey) continue
        addPort(nodeId, 'in', tgt.portLabel, '')
        const uniq = `${src.nodeId}|${src.portKey}|${nodeId}|${portKey}`
        const id = `panel-e${String(edges.length + 1).padStart(2, '0')}-${hashText(uniq)}`
        edges.push({
          id,
          source: src.nodeId,
          target: nodeId,
          label: '',
          ...(src.socketType ? { type: src.socketType } : {}),
          properties: {
            [FLOW_EDGE_SOURCE_PORT_KEY]: src.portKey,
            [FLOW_EDGE_TARGET_PORT_KEY]: portKey,
            [FLOW_EDGE_DISPLAY_LABEL_KEY]: `${src.portKey} → ${portKey}`,
            ...(src.socketType ? ({ 'flow:socketType': src.socketType } as unknown as Record<string, JSONValue>) : {}),
          },
        })
      }
    }
  }

  applyPortsToNodes()

  if (nodes.length === 0) return null

  const subgraphs = (() => {
    const byCol = new Map<number, string[]>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const cat = String(((n.properties || {}) as Record<string, unknown>).category || '')
      const m = /^column_(\d+)/.exec(cat)
      const colNum = m ? Number(m[1] || '1') : 1
      const ids = byCol.get(colNum) || []
      ids.push(String(n.id || ''))
      byCol.set(colNum, ids)
    }
    return Array.from(byCol.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([colNum, ids]) => ({
        id: `col-${colNum}`,
        label: `Column ${colNum}`,
        memberNodeIds: Array.from(new Set(ids)).filter(Boolean).sort((a, b) => a.localeCompare(b)),
        parentId: null,
        kind: 'cluster' as const,
      }))
  })()

  const metadata = writeWidgetRegistryMetadata({
    kind: 'markdown-panel-flow',
    sourceLayerHash: hashText(`markdown-panel-flow|${String(name || '')}`),
    socketTypes: buildSocketTypesMetadata() as unknown as JSONValue,
    ...(subgraphs.length > 0 ? ({ [AG_SUBGRAPHS_KEY]: subgraphs as unknown as JSONValue } as Record<string, JSONValue>) : {}),
  }, registry as unknown as JSONValue[])

  const graphData: GraphData = {
    type: 'Graph',
    context: 'markdown-panel-flow',
    nodes,
    edges,
    metadata,
  }

  return { graphData, warnings: [] }
}
