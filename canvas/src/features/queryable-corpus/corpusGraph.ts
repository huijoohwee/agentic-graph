import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { hashText } from '@/features/parsers/hash'

export type CorpusMediaKind =
  | 'code'
  | 'sql'
  | 'script'
  | 'doc'
  | 'paper'
  | 'image'
  | 'video'
  | 'data'
  | 'model'
  | 'unknown'

export type CorpusEvidenceKind = 'extracted' | 'inferred' | 'ambiguous'
export type CorpusConfidence = 'low' | 'medium' | 'high'

export type CorpusSourceUnit = {
  id: string
  workspacePath: string
  relativePath: string
  originalName: string
  mediaKind: CorpusMediaKind
  mimeHint: string | null
  byteSize: number
  textHash: string
  status: 'pending' | 'parsed' | 'cached' | 'unsupported' | 'error'
  provenance: {
    importMode: 'file' | 'folder' | 'url' | 'workspace'
    importedAtMs: number
    parentFolderId?: string
  }
}

export type CorpusGraphFragment = {
  sourceUnitId: string
  parserId: string
  graphData: GraphData
  evidence: Array<{
    edgeId?: string
    nodeId?: string
    kind: CorpusEvidenceKind
    sourcePath: string
    lineStart?: number
    lineEnd?: number
    byteStart?: number
    byteEnd?: number
    confidence: CorpusConfidence
  }>
  metrics: {
    parseMs: number
    inputBytes: number
    outputNodes: number
    outputEdges: number
    cacheHit: boolean
  }
}

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.c', '.cc', '.cpp', '.cs', '.kt', '.rb', '.php'])
const SCRIPT_EXTENSIONS = new Set(['.sh', '.bash', '.zsh', '.ps1', '.r'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.svgz'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v'])

const normalizePath = (raw: string): string => String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()

const extnameLower = (name: string): string => {
  const lower = String(name || '').trim().toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot) : ''
}

const safeIdPart = (raw: string): string => hashText(String(raw || '').trim()).slice(0, 12)

const asJson = (value: unknown): JSONValue => value as JSONValue

const sourceNodeId = (sourcePath: string): string => `corpus:source:${safeIdPart(sourcePath)}`

const symbolNodeId = (sourcePath: string, kind: string, value: string): string =>
  `corpus:${kind}:${safeIdPart(`${sourcePath}:${kind}:${value}`)}`

export function inferCorpusMediaKind(nameRaw: string, mimeHintRaw?: string | null): CorpusMediaKind {
  const name = String(nameRaw || '').trim()
  const ext = extnameLower(name)
  const mimeHint = String(mimeHintRaw || '').toLowerCase()
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (ext === '.sql') return 'sql'
  if (SCRIPT_EXTENSIONS.has(ext)) return 'script'
  if (name.toLowerCase().split('/').pop() === 'dockerfile') return 'script'
  if (ext === '.pdf') return 'paper'
  if (ext === '.md' || ext === '.markdown' || ext === '.txt' || ext === '.html' || ext === '.htm' || ext === '.yaml' || ext === '.yml') return 'doc'
  if (ext === '.csv' || ext === '.json' || ext === '.jsonc' || ext === '.jsonld' || ext === '.geojson' || ext === '.toml' || ext === '.tf' || ext === '.tfvars') return 'data'
  if (ext === '.gltf' || ext === '.glb' || ext === '.ply' || ext === '.spz') return 'model'
  if (IMAGE_EXTENSIONS.has(ext) || mimeHint.startsWith('image/')) return 'image'
  if (VIDEO_EXTENSIONS.has(ext) || mimeHint.startsWith('video/')) return 'video'
  return 'unknown'
}

export function isCorpusMediaImportFileName(nameRaw: string, mimeHintRaw?: string | null): boolean {
  const kind = inferCorpusMediaKind(nameRaw, mimeHintRaw)
  return kind === 'image' || kind === 'video'
}

export function buildCorpusMediaWorkspaceDocumentName(originalNameRaw: string): string {
  const originalName = String(originalNameRaw || '').trim() || 'media'
  return `${originalName}.source.md`
}

function yamlQuote(value: string): string {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function buildCorpusMediaMetadataMarkdown(args: {
  originalName: string
  mimeHint?: string | null
  byteSize?: number | null
  importMode: 'file' | 'folder' | 'url' | 'workspace'
  relativePath?: string | null
}): string {
  const originalName = String(args.originalName || '').trim() || 'media'
  const mediaKind = inferCorpusMediaKind(originalName, args.mimeHint)
  const relativePath = normalizePath(args.relativePath || originalName) || originalName
  const byteSize = Number.isFinite(Number(args.byteSize)) ? Math.max(0, Number(args.byteSize)) : 0
  const sourceId = `corpus-source-${hashText(`${relativePath}:${byteSize}:${mediaKind}`)}`
  return [
    '---',
    'kgCorpusSourceUnit: true',
    `id: ${yamlQuote(sourceId)}`,
    `relativePath: ${yamlQuote(relativePath)}`,
    `originalName: ${yamlQuote(originalName)}`,
    `mediaKind: ${yamlQuote(mediaKind)}`,
    `mimeHint: ${yamlQuote(String(args.mimeHint || ''))}`,
    `byteSize: ${byteSize}`,
    `status: ${yamlQuote('unsupported')}`,
    `importMode: ${yamlQuote(args.importMode)}`,
    '---',
    '',
    `# ${originalName}`,
    '',
    `This ${mediaKind} source was imported as a queryable corpus source unit. Local metadata is available now; content extraction requires an explicit media extraction harness.`,
    '',
  ].join('\n')
}

type ParsedCorpusFrontmatter = {
  kgCorpusSourceUnit?: boolean
  id?: string
  relativePath?: string
  originalName?: string
  mediaKind?: CorpusMediaKind
  mimeHint?: string
  byteSize?: number
  status?: string
  importMode?: string
}

function parseScalar(raw: string): unknown {
  const text = String(raw || '').trim()
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text)
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return text
}

function parseSimpleFrontmatter(raw: string): Record<string, unknown> | null {
  const text = String(raw || '')
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---', 4)
  if (end < 0) return null
  const body = text.slice(4, end)
  const out: Record<string, unknown> = {}
  for (const line of body.split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (!key) continue
    out[key] = parseScalar(value)
  }
  return out
}

export function isCorpusSourceUnitMarkdown(text: string): boolean {
  const fm = parseSimpleFrontmatter(text)
  return fm?.kgCorpusSourceUnit === true
}

function readCorpusSourceUnitMarkdown(text: string): ParsedCorpusFrontmatter | null {
  const fm = parseSimpleFrontmatter(text)
  if (!fm || fm.kgCorpusSourceUnit !== true) return null
  const kind = inferCorpusMediaKind(String(fm.originalName || fm.relativePath || ''), String(fm.mimeHint || ''))
  return {
    kgCorpusSourceUnit: true,
    id: String(fm.id || '').trim(),
    relativePath: String(fm.relativePath || '').trim(),
    originalName: String(fm.originalName || '').trim(),
    mediaKind: (String(fm.mediaKind || kind).trim() as CorpusMediaKind) || kind,
    mimeHint: String(fm.mimeHint || '').trim(),
    byteSize: Number.isFinite(Number(fm.byteSize)) ? Number(fm.byteSize) : 0,
    status: String(fm.status || 'unsupported').trim(),
    importMode: String(fm.importMode || 'file').trim(),
  }
}

function lineNumberForIndex(text: string, index: number): number {
  if (index <= 0) return 1
  return text.slice(0, index).split('\n').length
}

function pushUniqueNode(nodes: GraphNode[], node: GraphNode, seen: Set<string>) {
  if (!node.id || seen.has(node.id)) return
  seen.add(node.id)
  nodes.push(node)
}

function pushUniqueEdge(edges: GraphEdge[], edge: GraphEdge, seen: Set<string>) {
  if (!edge.id || seen.has(edge.id)) return
  seen.add(edge.id)
  edges.push(edge)
}

function makeEvidenceProperties(args: {
  sourcePath: string
  kind?: CorpusEvidenceKind
  confidence?: CorpusConfidence
  lineStart?: number
  lineEnd?: number
  parserId: string
}): Record<string, JSONValue> {
  return {
    'evidence:kind': asJson(args.kind || 'extracted'),
    'evidence:confidence': asJson(args.confidence || 'high'),
    'evidence:sourcePath': asJson(args.sourcePath),
    'evidence:lineStart': asJson(args.lineStart || 1),
    'evidence:lineEnd': asJson(args.lineEnd || args.lineStart || 1),
    'corpus:parserId': asJson(args.parserId),
  }
}

function createSourceNode(args: {
  name: string
  text: string
  parserId: string
  mediaKind: CorpusMediaKind
}): GraphNode {
  const sourcePath = normalizePath(args.name) || args.name
  return {
    id: sourceNodeId(sourcePath),
    label: sourcePath,
    type: 'CorpusSource',
    properties: {
      'corpus:sourcePath': asJson(sourcePath),
      'corpus:mediaKind': asJson(args.mediaKind),
      'corpus:textHash': asJson(hashText(args.text || '')),
      'corpus:parserId': asJson(args.parserId),
    },
  }
}

function createContainmentEdge(args: {
  sourcePath: string
  sourceId: string
  targetId: string
  label: string
  lineStart?: number
  parserId: string
  confidence?: CorpusConfidence
}): GraphEdge {
  return {
    id: `corpus:edge:${safeIdPart(`${args.sourceId}:${args.label}:${args.targetId}:${args.lineStart || 1}`)}`,
    source: args.sourceId,
    target: args.targetId,
    label: args.label,
    properties: makeEvidenceProperties({
      sourcePath: args.sourcePath,
      lineStart: args.lineStart,
      lineEnd: args.lineStart,
      parserId: args.parserId,
      confidence: args.confidence || 'high',
    }),
  }
}

export function parseCorpusSourceUnitMarkdown(name: string, text: string): { graphData: GraphData; warnings: string[] } | null {
  const unit = readCorpusSourceUnitMarkdown(text)
  if (!unit) return null
  const sourcePath = normalizePath(unit.relativePath || unit.originalName || name) || name
  const parserId = 'corpus-source-unit'
  const source = createSourceNode({ name: sourcePath, text, parserId, mediaKind: unit.mediaKind || 'unknown' })
  source.properties = {
    ...(source.properties || {}),
    'corpus:sourceUnitId': asJson(unit.id || source.id),
    'corpus:originalName': asJson(unit.originalName || sourcePath),
    'corpus:mimeHint': asJson(unit.mimeHint || ''),
    'corpus:byteSize': asJson(unit.byteSize || 0),
    'corpus:status': asJson(unit.status || 'unsupported'),
    'corpus:importMode': asJson(unit.importMode || 'file'),
  }
  const statusId = symbolNodeId(sourcePath, 'status', unit.status || 'unsupported')
  const statusNode: GraphNode = {
    id: statusId,
    label: unit.status || 'unsupported',
    type: 'CorpusExtractionStatus',
    properties: {
      'corpus:sourcePath': asJson(sourcePath),
      'corpus:mediaKind': asJson(unit.mediaKind || 'unknown'),
    },
  }
  const edge = createContainmentEdge({
    sourcePath,
    sourceId: source.id,
    targetId: statusId,
    label: 'hasExtractionStatus',
    lineStart: 1,
    parserId,
    confidence: 'high',
  })
  return {
    graphData: {
      context: 'queryable-corpus',
      type: 'Graph',
      nodes: [source, statusNode],
      edges: [edge],
      metadata: {
        kind: 'queryable-corpus',
        parserId,
        sourcePath,
        sourceUnitStatus: unit.status || 'unsupported',
      } as unknown as GraphData['metadata'],
    },
    warnings: unit.status === 'unsupported' ? [`Media extraction pending for ${sourcePath}`] : [],
  }
}

const extractMatches = (text: string, patterns: RegExp[]): Array<{ value: string; line: number; kind: string }> => {
  const out: Array<{ value: string; line: number; kind: string }> = []
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text))) {
      const value = String(match[1] || match[2] || match[0] || '').trim()
      if (!value) continue
      out.push({
        value,
        line: lineNumberForIndex(text, match.index),
        kind: pattern.source,
      })
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1
    }
  }
  return out
}

export function parseCorpusCodeGraph(name: string, text: string): { graphData: GraphData; warnings: string[] } {
  const sourcePath = normalizePath(name) || name
  const parserId = 'corpus-code'
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()
  const source = createSourceNode({ name: sourcePath, text, parserId, mediaKind: 'code' })
  pushUniqueNode(nodes, source, seenNodes)

  const symbolPatterns = [
    /\bclass\s+([A-Za-z_$][\w$]*)/g,
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /\bdef\s+([A-Za-z_]\w*)\s*\(/g,
    /\bfunc\s+([A-Za-z_]\w*)\s*\(/g,
  ]
  const importPatterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"\n]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bfrom\s+([A-Za-z_][\w.]*)\s+import\b/g,
    /\buse\s+([A-Za-z_][\w:]*)(?:::|\s*;)/g,
  ]
  const entityReferencePatterns = [
    /\b(?:table|from|collection)\s*\(\s*['"]([A-Za-z_][\w.$-]*)['"]\s*\)/g,
    /\bdb\.([A-Za-z_][\w$]*)\b/g,
  ]

  for (const item of extractMatches(text, symbolPatterns)) {
    const id = symbolNodeId(sourcePath, 'symbol', item.value)
    pushUniqueNode(nodes, {
      id,
      label: item.value,
      type: 'CorpusSymbol',
      properties: {
        'corpus:sourcePath': asJson(sourcePath),
        'corpus:mediaKind': asJson('code'),
        'corpus:lineStart': asJson(item.line),
      },
    }, seenNodes)
    pushUniqueEdge(edges, createContainmentEdge({
      sourcePath,
      sourceId: source.id,
      targetId: id,
      label: 'declares',
      lineStart: item.line,
      parserId,
    }), seenEdges)
  }

  for (const item of extractMatches(text, importPatterns)) {
    const id = symbolNodeId(sourcePath, 'dependency', item.value)
    pushUniqueNode(nodes, {
      id,
      label: item.value,
      type: 'CorpusDependency',
      properties: {
        'corpus:sourcePath': asJson(sourcePath),
        'corpus:mediaKind': asJson('code'),
        'corpus:lineStart': asJson(item.line),
      },
    }, seenNodes)
    pushUniqueEdge(edges, createContainmentEdge({
      sourcePath,
      sourceId: source.id,
      targetId: id,
      label: 'imports',
      lineStart: item.line,
      parserId,
    }), seenEdges)
  }

  for (const item of extractMatches(text, entityReferencePatterns)) {
    const id = symbolNodeId(sourcePath, 'entity-ref', item.value)
    pushUniqueNode(nodes, {
      id,
      label: item.value,
      type: 'CorpusEntityReference',
      properties: {
        'corpus:sourcePath': asJson(sourcePath),
        'corpus:mediaKind': asJson('code'),
        'corpus:lineStart': asJson(item.line),
      },
    }, seenNodes)
    pushUniqueEdge(edges, createContainmentEdge({
      sourcePath,
      sourceId: source.id,
      targetId: id,
      label: 'referencesEntity',
      lineStart: item.line,
      parserId,
      confidence: 'medium',
    }), seenEdges)
  }

  return {
    graphData: {
      context: 'queryable-corpus',
      type: 'Graph',
      nodes,
      edges,
      metadata: { kind: 'queryable-corpus', parserId, sourcePath } as unknown as GraphData['metadata'],
    },
    warnings: nodes.length <= 1 ? [`No code symbols extracted from ${sourcePath}`] : [],
  }
}

export function parseCorpusSqlGraph(name: string, text: string): { graphData: GraphData; warnings: string[] } {
  const sourcePath = normalizePath(name) || name
  const parserId = 'corpus-sql'
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()
  const source = createSourceNode({ name: sourcePath, text, parserId, mediaKind: 'sql' })
  pushUniqueNode(nodes, source, seenNodes)

  const tablePattern = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`[]?([A-Za-z_][\w.$-]*)["`\]]?/gi
  for (const table of extractMatches(text, [tablePattern])) {
    const tableId = symbolNodeId(sourcePath, 'table', table.value)
    pushUniqueNode(nodes, {
      id: tableId,
      label: table.value,
      type: 'CorpusSqlTable',
      properties: {
        'corpus:sourcePath': asJson(sourcePath),
        'corpus:mediaKind': asJson('sql'),
        'corpus:lineStart': asJson(table.line),
      },
    }, seenNodes)
    pushUniqueEdge(edges, createContainmentEdge({
      sourcePath,
      sourceId: source.id,
      targetId: tableId,
      label: 'definesTable',
      lineStart: table.line,
      parserId,
    }), seenEdges)
  }

  const refPattern = /\breferences\s+["`[]?([A-Za-z_][\w.$-]*)["`\]]?/gi
  for (const ref of extractMatches(text, [refPattern])) {
    const refId = symbolNodeId(sourcePath, 'table-ref', ref.value)
    pushUniqueNode(nodes, {
      id: refId,
      label: ref.value,
      type: 'CorpusSqlTableReference',
      properties: {
        'corpus:sourcePath': asJson(sourcePath),
        'corpus:mediaKind': asJson('sql'),
        'corpus:lineStart': asJson(ref.line),
      },
    }, seenNodes)
    pushUniqueEdge(edges, createContainmentEdge({
      sourcePath,
      sourceId: source.id,
      targetId: refId,
      label: 'referencesTable',
      lineStart: ref.line,
      parserId,
      confidence: 'medium',
    }), seenEdges)
  }

  return {
    graphData: {
      context: 'queryable-corpus',
      type: 'Graph',
      nodes,
      edges,
      metadata: { kind: 'queryable-corpus', parserId, sourcePath } as unknown as GraphData['metadata'],
    },
    warnings: nodes.length <= 1 ? [`No SQL schema entities extracted from ${sourcePath}`] : [],
  }
}

export function parseCorpusScriptGraph(name: string, text: string): { graphData: GraphData; warnings: string[] } {
  const sourcePath = normalizePath(name) || name
  const parserId = 'corpus-script'
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()
  const source = createSourceNode({ name: sourcePath, text, parserId, mediaKind: 'script' })
  pushUniqueNode(nodes, source, seenNodes)

  const ext = extnameLower(name)
  const patterns = ext === '.r'
    ? [/\b(?:library|require)\s*\(\s*([A-Za-z.][\w.]*)\s*\)/g, /\b([A-Za-z.][\w.]*)\s*<-\s*function\s*\(/g]
    : [/^\s*([A-Za-z0-9_./:-]+)\b(?:\s|$)/gm, /\bexport\s+([A-Za-z_][\w]*)=/g]
  const label = ext === '.r' ? 'usesRPackageOrFunction' : 'usesCommandOrEnv'
  for (const item of extractMatches(text, patterns)) {
    if (/^(if|then|fi|for|do|done|while|case|esac|echo|export)$/.test(item.value)) continue
    const id = symbolNodeId(sourcePath, 'script-symbol', item.value)
    pushUniqueNode(nodes, {
      id,
      label: item.value,
      type: 'CorpusScriptSymbol',
      properties: {
        'corpus:sourcePath': asJson(sourcePath),
        'corpus:mediaKind': asJson('script'),
        'corpus:lineStart': asJson(item.line),
      },
    }, seenNodes)
    pushUniqueEdge(edges, createContainmentEdge({
      sourcePath,
      sourceId: source.id,
      targetId: id,
      label,
      lineStart: item.line,
      parserId,
      confidence: 'medium',
    }), seenEdges)
  }

  return {
    graphData: {
      context: 'queryable-corpus',
      type: 'Graph',
      nodes,
      edges,
      metadata: { kind: 'queryable-corpus', parserId, sourcePath } as unknown as GraphData['metadata'],
    },
    warnings: nodes.length <= 1 ? [`No script symbols extracted from ${sourcePath}`] : [],
  }
}

export function everyCorpusEdgeHasEvidence(graphData: GraphData | null | undefined): boolean {
  const edges = Array.isArray(graphData?.edges) ? graphData!.edges : []
  return edges.every(edge => {
    const props = edge.properties || {}
    return Boolean(
      String(props['evidence:kind'] || '').trim()
      && String(props['evidence:sourcePath'] || '').trim()
      && String(props['evidence:confidence'] || '').trim(),
    )
  })
}
