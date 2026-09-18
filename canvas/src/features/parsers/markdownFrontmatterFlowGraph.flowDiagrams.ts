import { unwrapKeyTypeValue as unwrapTypedEnvelope } from '@/lib/graph/keyTypeValue'
import { hashText } from '@/features/parsers/hash'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'

const FLOW_DIAGRAMS_KEY = 'flow_diagrams'
const FLOW_DIAGRAM_SOCKET_TYPE = 'flow_diagram_html'
const FLOW_DIAGRAM_SOURCE_PORT = 'diagramSource'
const FLOW_DIAGRAM_OUTPUT_PORT = 'outputSrcDoc'
const FLOW_PORT_TYPES_KEY = 'flow:portTypes'

const FLOW_DIAGRAM_COMPUTE_SOURCE = `(inputs,context)=>{
const p=context&&context.node&&context.node.properties&&typeof context.node.properties=="object"?context.node.properties:{},k=String(p.diagramKind||"mermaid"),t=String(p.diagramTitle||k||"Diagram"),s=String(inputs.diagramSource||"").trim(),e=v=>String(v||"").replace(/[&<>"']/g,c=>c=="&"?"&amp;":c=="<"?"&lt;":c==">"?"&gt;":c=='"'?"&quot;":"&#39;"),ls=s.split(/\\r?\\n/).map(l=>l.trim()).filter(Boolean);
const pick=(r,n)=>{const o=[];for(let i=0;i<ls.length&&o.length<n;i++){const m=ls[i].match(r);if(m&&m[1])o.push(String(m[1]).replace(/^["']|["']$/g,""))}return o},branches=pick(/^branch\\s+([^\\s{]+)/i,8),merges=pick(/^merge\\s+([^\\s{]+)/i,8),critical=ls.filter(l=>/(^|[:,\\s])crit(ical)?([,\\s]|$)/i.test(l)).slice(0,8),tasks=ls.filter(l=>l.includes(":")&&!/^title\\b|^dateFormat\\b|^section\\b/i.test(l)).slice(0,8);
const services=pick(/^service\\s+([^\\s(]+)/i,12),groups=pick(/^group\\s+([^\\s(]+)/i,8),events=ls.filter(l=>/\\b(?:evt|event)\\b/i.test(l)).slice(0,12),commands=ls.filter(l=>/\\b(?:cmd|command)\\b/i.test(l)).slice(0,12),processors=ls.filter(l=>/\\b(?:pcr|processor)\\b/i.test(l)).slice(0,8);
const tm={},pt=v=>{const x=String(v||"").replace(/^["']|["']$/g,"").trim();if(!x||x.length>80)return;const n=x.toLowerCase();if(!tm[n])tm[n]=x};ls.forEach(l=>{l.replace(/id:"([^"]+)"/g,(_m,x)=>(pt(x),""));l.replace(/\\b(?:branch|checkout|switch|merge)\\s+([^\\s{]+)/gi,(_m,x)=>(pt(x),""));pt(l.includes(":")&&!/^title\\b|^dateFormat\\b|^section\\b/i.test(l)?l.split(":")[0].trim():"")});const terms=Object.values(tm).slice(0,12);
const sum=k=="gitgraph"?"Parallel branches: "+(branches.length?branches.join(", "):"main")+". Merges: "+(merges.length?merges.join(", "):"none")+".":k=="gantt"?"Timeline tasks: "+tasks.length+". Critical path tasks: "+(critical.length?critical.map(l=>l.split(":")[0].trim()).join(", "):"none declared")+".":k=="architecture"?"Architecture services: "+(services.length?services.join(", "):"none parsed")+". Groups: "+(groups.length?groups.join(", "):"none parsed")+".":k=="eventmodeling"?"Event model commands: "+commands.length+". Events: "+events.length+". Processors: "+processors.length+".":"Mermaid diagram lines: "+ls.length+".",ts="First-class terms: "+(terms.length?terms.join(", "):"none parsed")+".";
const li=(a,z)=>a.length?a.map(x=>"<li>"+e(x)+"</li>").join(""):"<li>"+e(z)+"</li>",txt=(x,y,v)=>"<text x='"+x+"' y='"+y+"' font-size='12' fill='currentColor'>"+e(v)+"</text>";
const git=()=>{const lanes=["main"];branches.forEach(b=>{if(!lanes.includes(b))lanes.push(b)});let h=70+lanes.length*32,svg="<svg data-kg-flow-diagram-chart='1' viewBox='0 0 640 "+h+"'><rect width='640' height='"+h+"' fill='white'/>";lanes.forEach((b,i)=>{const y=42+i*32;svg+=txt(14,y,b)+"<line x1='150' y1='"+y+"' x2='610' y2='"+y+"' stroke='"+(i?"#84cc16":"#2563eb")+"' stroke-width='5'/><circle cx='"+(190+i*42)+"' cy='"+y+"' r='8' fill='#2563eb'/>"});merges.forEach((m,i)=>{svg+="<path d='M"+(250+i*54)+" 42 V"+(42+(lanes.length-1)*32)+"' stroke='#0f766e' stroke-width='3'/>"+txt(260+i*54,28,m)});return svg+"</svg>"};
const gant=()=>{const rows=(tasks.length?tasks:critical).slice(0,10);let h=70+Math.max(1,rows.length)*28,svg="<svg data-kg-flow-diagram-chart='1' viewBox='0 0 640 "+h+"'><rect width='640' height='"+h+"' fill='white'/><line x1='150' y1='36' x2='610' y2='36' stroke='#64748b'/>";rows.forEach((r,i)=>{const name=r.split(":")[0].trim(),crit=/(^|[:,\\s])crit(ical)?([,\\s]|$)/i.test(r),y=58+i*28,x=170+i*18,w=210+(crit?90:0);svg+=txt(14,y,name)+"<rect x='"+x+"' y='"+(y-14)+"' width='"+w+"' height='18' rx='3' fill='"+(crit?"#ef4444":"#6366f1")+"'/><text x='"+(x+6)+"' y='"+(y-1)+"' font-size='10' fill='white'>"+e(name)+"</text>"});return svg+"</svg>"};
const chart=k=="gitgraph"?git():k=="gantt"?gant():"",detail=k=="gitgraph"?"<section><h2>Parallel lanes</h2><ul>"+li(branches,"main")+"</ul><h2>Merge points</h2><ul>"+li(merges,"none declared")+"</ul></section>":k=="gantt"?"<section><h2>Critical path</h2><ul>"+li(critical.map(l=>l.split(":")[0].trim()),"none declared")+"</ul><h2>Tasks</h2><ul>"+li(tasks.map(l=>l.split(":")[0].trim()),"none declared")+"</ul></section>":k=="architecture"?"<section><h2>Services</h2><ul>"+li(services,"none parsed")+"</ul><h2>Groups</h2><ul>"+li(groups,"none parsed")+"</ul></section>":k=="eventmodeling"?"<section><h2>Commands</h2><ul>"+li(commands,"none parsed")+"</ul><h2>Events</h2><ul>"+li(events,"none parsed")+"</ul></section>":"";
return{output:"~~~mermaid\\n"+s+"\\n~~~\\n\\n"+sum+"\\n"+ts,outputSrcDoc:"<main data-kg-flow-diagram=\\"1\\" data-kg-flow-diagram-kind=\\""+e(k)+"\\"><h1>"+e(t)+"</h1>"+chart+"<p>"+e(sum)+"</p><section><h2>First-class terms</h2><p>"+(terms.length?terms.map(x=>"<span>"+e(x)+"</span> ").join(""):"<span>none parsed</span>")+"</p></section>"+detail+"<pre data-kg-mermaid-source=\\"1\\">"+e(s)+"</pre></main>"}
}`

type DiagramSpec = {
  key: string
  type: string
  kind: string
  title: string
  renderOn: string[]
  source: string
  /** When true the diagram routes to FloatingPanel (row list) + BottomPanel (chart); skip RichMediaPanel derivation */
  routedToPanelSurfaces: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function cleanIdPart(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}


function readRenderOn(value: unknown): string[] {
  const raw = unwrapTypedEnvelope(value)
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < values.length; i += 1) {
    const item = asString(values[i])
    if (!item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function inferDiagramKind(type: string, source: string): string {
  const normalizedType = String(type || '').trim().toLowerCase()
  if (normalizedType === 'mermaid_gitgraph') return 'gitgraph'
  if (normalizedType === 'mermaid_gantt') return 'gantt'
  if (normalizedType === 'mermaid_architecture') return 'architecture'
  if (normalizedType === 'mermaid_eventmodeling') return 'eventmodeling'
  if (normalizedType.startsWith('mermaid_')) return cleanIdPart(normalizedType.slice('mermaid_'.length)) || 'mermaid'
  const firstLine = source.split(/\r?\n/).map(line => line.trim()).find(Boolean) || ''
  if (/^gitgraph:?$/i.test(firstLine)) return 'gitgraph'
  if (/^gantt\b/i.test(firstLine)) return 'gantt'
  if (/^architecture-beta\b/i.test(firstLine)) return 'architecture'
  if (/^eventmodeling\b/i.test(firstLine)) return 'eventmodeling'
  return 'mermaid'
}

function readDiagramSpecs(rawFlowDiagrams: unknown): DiagramSpec[] {
  const root = unwrapTypedEnvelope(rawFlowDiagrams, FLOW_DIAGRAMS_KEY)
  const rootRecord = asRecord(root)
  if (!rootRecord) return []
  const specs: DiagramSpec[] = []
  const seenKeys = new Set<string>()
  for (const [entryKey, rawEntry] of Object.entries(rootRecord)) {
    const rawEntryRecord = asRecord(rawEntry)
    const entry = rawEntryRecord && (Object.prototype.hasOwnProperty.call(rawEntryRecord, 'type') || Object.prototype.hasOwnProperty.call(rawEntryRecord, 'value'))
      ? rawEntryRecord
      : asRecord(unwrapTypedEnvelope(rawEntry, entryKey))
    if (!entry) continue
    const key = asString(entry.key) || entryKey
    const cleanKey = cleanIdPart(key)
    if (!cleanKey || seenKeys.has(cleanKey)) continue
    const type = asString(unwrapTypedEnvelope(entry.type, 'type')) || 'mermaid'
    if (!type.toLowerCase().startsWith('mermaid')) continue
    const source = asString(unwrapTypedEnvelope(entry.value, 'value'))
    if (!source) continue
    seenKeys.add(cleanKey)
    const kind = inferDiagramKind(type, source)
    // Entries that declare both floatingPanelView and bottomPanelTab route their
    // diagram to FloatingPanel (row list, renderMode="list") and BottomPanel
    // (chart, renderMode="diagram"). For architecture and eventmodeling this
    // avoids a duplicate rendering surface. gitgraph and gantt still derive
    // their RichMediaPanel because the panel shows a different chart format
    // than the BottomPanel chart.
    const floatingPanelView = asString(entry.floatingPanelView)
    const bottomPanelTab = asString(entry.bottomPanelTab)
    // When both floatingPanelView and bottomPanelTab are declared the entry opts
    // into FloatingPanel (row list, renderMode="list") + BottomPanel (chart,
    // renderMode="diagram") as its exclusive render surfaces. Skip the derived
    // RichMediaPanel node for ALL diagram kinds in that case — the author has
    // explicitly routed the diagram to the panel surfaces and does not want a
    // duplicate canvas node. Without routing keys the panel is always derived.
    const routedToPanelSurfaces = !!(floatingPanelView && bottomPanelTab)
    specs.push({
      key: cleanKey,
      type,
      kind,
      title: asString(entry.title) || `${kind} flow diagram`,
      renderOn: readRenderOn(entry.render_on ?? entry.renderOn),
      source,
      routedToPanelSurfaces,
    })
  }
  return specs
}

export function hasOnlyRoutedFlowDiagramSpecs(meta: Record<string, unknown>): boolean {
  const specs = readDiagramSpecs(meta[FLOW_DIAGRAMS_KEY])
  return specs.length > 0 && specs.every(spec => spec.routedToPanelSurfaces)
}

function readNodeId(value: unknown): string {
  if (!isRecord(value)) return ''
  return asString(value.id)
}

function readNodePosition(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null
  const pos = isRecord(value.pos) ? value.pos : isRecord(value.position) ? value.position : null
  const rawX = pos ? pos.x : value.pos_x
  const rawY = pos ? pos.y : value.pos_y
  const x = typeof rawX === 'number' && Number.isFinite(rawX) ? rawX : Number(rawX)
  const y = typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : Number(rawY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function readAppendBasePosition(nodes: unknown[]): { x: number; y: number } {
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  for (let i = 0; i < nodes.length; i += 1) {
    const pos = readNodePosition(nodes[i])
    if (!pos) continue
    maxX = Math.max(maxX, pos.x)
    minY = Math.min(minY, pos.y)
  }
  if (!Number.isFinite(maxX) || !Number.isFinite(minY)) return { x: 0, y: 0 }
  return { x: maxX + 420, y: minY }
}

function appendNodeIfMissing(args: {
  nodes: Record<string, unknown>[]
  nodeIds: Set<string>
  node: Record<string, unknown>
}): void {
  const id = readNodeId(args.node)
  if (!id || args.nodeIds.has(id)) return
  args.nodeIds.add(id)
  args.nodes.push(args.node)
}

function appendConnectionIfMissing(args: {
  connections: Record<string, unknown>[]
  signatures: Set<string>
  connection: Record<string, unknown>
}): void {
  const source = asString(args.connection.from_node)
  const fromPort = asString(args.connection.from_port)
  const target = asString(args.connection.to_node)
  const toPort = asString(args.connection.to_port)
  const signature = `${source}|${fromPort}|${target}|${toPort}`
  if (!source || !fromPort || !target || !toPort || args.signatures.has(signature)) return
  args.signatures.add(signature)
  args.connections.push(args.connection)
}

function buildDiagramNodes(args: {
  spec: DiagramSpec
  index: number
  base: { x: number; y: number }
}): {
  sourceNode: Record<string, unknown>
  computeNode: Record<string, unknown>
  panelNode: Record<string, unknown>
  sourceId: string
  computeId: string
  panelId: string
} {
  const key = args.spec.key
  const y = args.base.y + args.index * 280
  const sourceId = `flow-diagram-${key}-source`
  const computeId = `flow-diagram-${key}-compute`
  const panelId = `flow-diagram-${key}-panel`
  const common = {
    diagramKey: args.spec.key,
    diagramType: args.spec.type,
    diagramKind: args.spec.kind,
    diagramTitle: args.spec.title,
    render_on: args.spec.renderOn,
  }
  return {
    sourceId,
    computeId,
    panelId,
    sourceNode: {
      id: sourceId,
      type: 'FlowDiagramSource',
      label: `${args.spec.title} source`,
      pos: { x: args.base.x, y },
      outputs: [{ port: FLOW_DIAGRAM_SOURCE_PORT, type: FLOW_DIAGRAM_SOCKET_TYPE, schemaPath: `properties.${FLOW_DIAGRAM_SOURCE_PORT}` }],
      properties: {
        ...common,
        [FLOW_DIAGRAM_SOURCE_PORT]: args.spec.source,
        output: args.spec.source,
        'flow:widgetFormId': `fm:${sourceId}`,
        [FLOW_PORT_TYPES_KEY]: { out: { [FLOW_DIAGRAM_SOURCE_PORT]: FLOW_DIAGRAM_SOCKET_TYPE } },
      },
    },
    computeNode: {
      id: computeId,
      type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      label: `${args.spec.title} compute`,
      pos: { x: args.base.x + 380, y },
      inputs: [{ port: FLOW_DIAGRAM_SOURCE_PORT, type: FLOW_DIAGRAM_SOCKET_TYPE, from: `${sourceId}.${FLOW_DIAGRAM_SOURCE_PORT}`, schemaPath: `properties.${FLOW_DIAGRAM_SOURCE_PORT}` }],
      outputs: [{ port: FLOW_DIAGRAM_OUTPUT_PORT, type: FLOW_DIAGRAM_SOCKET_TYPE, schemaPath: `properties.${FLOW_DIAGRAM_OUTPUT_PORT}` }],
      properties: {
        ...common,
        'flow:compute': FLOW_DIAGRAM_COMPUTE_SOURCE,
        'flow:widgetFormId': 'flowDiagramCompute',
        'flow:widgetTypeId': 'default',
        output: '',
        [FLOW_DIAGRAM_OUTPUT_PORT]: '',
        [FLOW_PORT_TYPES_KEY]: {
          in: { [FLOW_DIAGRAM_SOURCE_PORT]: FLOW_DIAGRAM_SOCKET_TYPE },
          out: { [FLOW_DIAGRAM_OUTPUT_PORT]: FLOW_DIAGRAM_SOCKET_TYPE },
        },
      },
    },
    panelNode: {
      id: panelId,
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      label: `${args.spec.title} Rich Media Panel`,
      pos: { x: args.base.x + 760, y },
      inputs: [{ port: FLOW_DIAGRAM_OUTPUT_PORT, type: FLOW_DIAGRAM_SOCKET_TYPE, from: `${computeId}.${FLOW_DIAGRAM_OUTPUT_PORT}`, schemaPath: `properties.${FLOW_DIAGRAM_OUTPUT_PORT}` }],
      outputs: [{ port: FLOW_DIAGRAM_OUTPUT_PORT, type: FLOW_DIAGRAM_SOCKET_TYPE, schemaPath: `properties.${FLOW_DIAGRAM_OUTPUT_PORT}` }],
      properties: {
        ...common,
        richMediaActiveTab: 'auto',
        media_interactive: true,
        output: '',
        [FLOW_DIAGRAM_OUTPUT_PORT]: '',
        'flow:widgetFormId': 'richMediaPanel',
        [FLOW_PORT_TYPES_KEY]: { in: { [FLOW_DIAGRAM_OUTPUT_PORT]: FLOW_DIAGRAM_SOCKET_TYPE } },
      },
    },
  }
}

export function deriveFlowDiagramsWidgets(meta: Record<string, unknown>): void {
  const specs = readDiagramSpecs(meta[FLOW_DIAGRAMS_KEY])
  if (specs.length === 0) return

  const nodes = Array.isArray(meta.nodes) ? (meta.nodes as Record<string, unknown>[]) : []
  const connections = Array.isArray(meta.connections) ? (meta.connections as Record<string, unknown>[]) : []
  const nodeIds = new Set(nodes.map(readNodeId).filter(Boolean))
  const connectionSignatures = new Set<string>()
  for (let i = 0; i < connections.length; i += 1) {
    const row = connections[i]
    if (!isRecord(row)) continue
    const source = asString(row.from_node)
    const fromPort = asString(row.from_port)
    const target = asString(row.to_node)
    const toPort = asString(row.to_port)
    if (source && fromPort && target && toPort) connectionSignatures.add(`${source}|${fromPort}|${target}|${toPort}`)
  }

  const base = readAppendBasePosition(nodes)
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i]!
    const built = buildDiagramNodes({ spec, index: i, base })

    // Entries routed to FloatingPanel (row list) + BottomPanel (chart) need NO
    // canvas nodes at all — the panel surfaces read directly from the raw
    // frontmatter YAML text via useMermaidStructuredDiagramDocument.
    // Deriving source, compute, or panel nodes would produce unwanted canvas
    // widgets and duplicate rendering surfaces.
    if (spec.routedToPanelSurfaces) continue

    appendNodeIfMissing({ nodes, nodeIds, node: built.sourceNode })
    appendNodeIfMissing({ nodes, nodeIds, node: built.computeNode })
    appendNodeIfMissing({ nodes, nodeIds, node: built.panelNode })
    appendConnectionIfMissing({
      connections,
      signatures: connectionSignatures,
      connection: {
        id: `flow-diagram-${built.sourceId}-to-${built.computeId}-${hashText(`${built.sourceId}|${built.computeId}`)}`,
        from_node: built.sourceId,
        from_port: FLOW_DIAGRAM_SOURCE_PORT,
        to_node: built.computeId,
        to_port: FLOW_DIAGRAM_SOURCE_PORT,
        label: 'diagram source',
        type: FLOW_DIAGRAM_SOCKET_TYPE,
      },
    })
    appendConnectionIfMissing({
      connections,
      signatures: connectionSignatures,
      connection: {
        id: `flow-diagram-${built.computeId}-to-${built.panelId}-${hashText(`${built.computeId}|${built.panelId}`)}`,
        from_node: built.computeId,
        from_port: FLOW_DIAGRAM_OUTPUT_PORT,
        to_node: built.panelId,
        to_port: FLOW_DIAGRAM_OUTPUT_PORT,
        label: 'diagram panel',
        type: FLOW_DIAGRAM_SOCKET_TYPE,
      },
    })
  }

  meta.nodes = nodes
  meta.connections = connections
}

/**
 * Register the built-in flow-diagram socket type used by generated source/compute/panel
 * edges, so connection validation recognizes it. Must run AFTER any inline markdown-table
 * socket-type extraction so it never suppresses author-declared legends; only seeds the
 * type when the document has flow diagrams and omits an explicit entry.
 */
export function registerFlowDiagramSocketType(meta: Record<string, unknown>): void {
  if (readDiagramSpecs(meta[FLOW_DIAGRAMS_KEY]).length === 0) return
  const socketTypes = isRecord(meta.socket_types) ? (meta.socket_types as Record<string, unknown>) : {}
  if (Object.prototype.hasOwnProperty.call(socketTypes, FLOW_DIAGRAM_SOCKET_TYPE)) return
  socketTypes[FLOW_DIAGRAM_SOCKET_TYPE] = {
    color: '#8b5cf6',
    edgeWidthPx: 2,
    handleStrokeWidthPx: 2,
    accepts: [FLOW_DIAGRAM_SOCKET_TYPE],
  }
  meta.socket_types = socketTypes
}
