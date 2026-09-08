import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import type { SourceFile } from '@/hooks/store/types'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

const serializeGraphValue = (raw: unknown): string => {
  if (raw == null) return 'null'
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return '""'
    const clipped = s.length > 120 ? `${s.slice(0, 117)}...` : s
    return JSON.stringify(clipped)
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  if (Array.isArray(raw)) {
    const head = raw.slice(0, 3).map(v => serializeGraphValue(v)).join(', ')
    const tail = raw.length > 3 ? ', …' : ''
    return `[${head}${tail}]`
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const keys = Object.keys(obj)
    const visible = keys.slice(0, 6)
    const suffix = keys.length > visible.length ? ', …' : ''
    return `{ ${visible.join(', ')}${suffix} }`
  }
  return JSON.stringify(String(raw))
}

const wrapFence = (content: string, lang: string): string => {
  const safeLang = String(lang || '').trim() || 'text'
  const safe = String(content || '').replace(/\r\n/g, '\n')
  const open = `\`\`\`\`${safeLang}`
  const close = '````'
  return [open, safe, close].join('\n')
}

export const buildBoundedGraphSystemPrompt = (
  graphData: GraphData | null,
  currentNode: GraphNode | null,
): string => {
  const nodesAll = graphData?.nodes || []
  const edgesAll = graphData?.edges || []
  const nodeCount = nodesAll.length
  const edgeCount = edgesAll.length
  const graphContext = typeof graphData?.context === 'string' ? graphData.context : ''

  if (!currentNode || !graphData) {
    return [
      'You operate on BOUNDED GRAPH CONTEXT.',
      '',
      'RULES:',
      '- Reference ONLY entities and relationships provided in this conversation.',
      '- If information is missing, say so and ask for a specific node/edge selection.',
      '- For relationship claims, cite as: "[Entity A] --[Relationship]--> [Entity B]".',
      '',
      'Graph Structure:',
      `Nodes: ${nodeCount} entities`,
      `Edges: ${edgeCount} relationships`,
      graphContext ? `Context: ${graphContext}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  const byId = new Map<string, GraphNode>()
  graphData.nodes.forEach(n => byId.set(n.id, n))
  const focusId = currentNode.id
  const incidentEdges: GraphEdge[] = graphData.edges
    .filter(e => e.source === focusId || e.target === focusId)
    .slice(0, 50)
  const nodeIdSet = new Set<string>([focusId])
  incidentEdges.forEach(e => {
    nodeIdSet.add(e.source)
    nodeIdSet.add(e.target)
  })
  const subNodes = Array.from(nodeIdSet)
    .map(id => byId.get(id))
    .filter((n): n is GraphNode => Boolean(n))
    .slice(0, 25)

  const entityList = subNodes
    .map(n => {
      const label = String(n.label || n.id || '')
      const type = String(n.type || '')
      return `- ${label}${type ? ` (${type})` : ''} [id=${String(n.id)}]`
    })
    .slice(0, 30)

  const relationshipList = incidentEdges
    .map(e => {
      const src = byId.get(e.source)
      const tgt = byId.get(e.target)
      const srcLabel = String(src?.label || src?.id || e.source || '')
      const tgtLabel = String(tgt?.label || tgt?.id || e.target || '')
      const rel = String(e.label || 'rel')
      return `[${srcLabel}] --[${rel}]--> [${tgtLabel}]`
    })
    .slice(0, 30)

  const serializedNodes = subNodes.map(n => {
    const props: Record<string, JSONValue> = n.properties || {}
    const keys = Object.keys(props).slice(0, 6)
    const obj = keys.map(k => `${k}: ${serializeGraphValue(props[k])}`).join(', ')
    return `- (${String(n.id)}:${String(n.type || 'entity')} { label: ${serializeGraphValue(n.label || '')}${obj ? `, ${obj}` : ''} })`
  })

  const serializedEdges = incidentEdges.map(e => {
    const src = String(e.source)
    const tgt = String(e.target)
    const label = String(e.label || 'rel')
    const props: Record<string, JSONValue> = e.properties || {}
    const keys = Object.keys(props).slice(0, 6)
    const obj = keys.map(k => `${k}: ${serializeGraphValue(props[k])}`).join(', ')
    return `- (${src}) -[${label}${obj ? ` { ${obj} }` : ''}]-> (${tgt})`
  })

  return [
    'You operate on BOUNDED GRAPH CONTEXT.',
    '',
    'RULES:',
    '- Reference ONLY entities and relationships in the provided Subgraph Context.',
    '- State graph paths for multi-hop answers using the citation format.',
    '- Express uncertainty if a path does not exist in the provided Subgraph Context.',
    '- Citation format: "[Entity A] --[Relationship]--> [Entity B]".',
    '',
    'Graph Structure:',
    `Nodes: ${nodeCount} entities`,
    `Edges: ${edgeCount} relationships`,
    graphContext ? `Context: ${graphContext}` : '',
    '',
    'Available Entities:',
    entityList.length ? entityList.join('\n') : '- (none)',
    '',
    'Available Relationships:',
    relationshipList.length ? relationshipList.join('\n') : '- (none)',
    '',
    'Subgraph Context:',
    'Nodes:',
    serializedNodes.length ? serializedNodes.join('\n') : '- (none)',
    '',
    'Relationships:',
    serializedEdges.length ? serializedEdges.join('\n') : '- (none)',
  ]
    .filter(Boolean)
    .join('\n')
}

export const buildMarkdownNodeSnippetPrompt = (
  markdownText: string | null,
  currentNode: GraphNode | null,
  parseLine: (raw: unknown) => number | null,
): string | null => {
  if (!markdownText || typeof markdownText !== 'string' || !markdownText.trim() || !currentNode) return null
  const meta = (currentNode.metadata || {}) as { lineStart?: unknown; lineEnd?: unknown }
  const lineStart = parseLine(meta.lineStart)
  const lineEnd = parseLine(meta.lineEnd) ?? lineStart
  if (lineStart == null || lineEnd == null) return null

  const lines = markdownText.split(/\r?\n/)
  const safeStart = Math.max(1, Math.min(lines.length || 1, Math.floor(lineStart)))
  const safeEnd = Math.max(1, Math.min(lines.length || 1, Math.floor(lineEnd)))
  const start = Math.min(safeStart, safeEnd)
  const end = Math.max(safeStart, safeEnd)
  const pad = 8
  const sliceStart = Math.max(1, start - pad)
  const sliceEnd = Math.min(lines.length || end, end + pad)
  const snippet = lines.slice(sliceStart - 1, sliceEnd).join('\n')
  const trimmedSnippet = snippet.length > 2000 ? `${snippet.slice(0, 1997)}...` : snippet

  return [
    'Markdown excerpt associated with the selected node (line-range aligned).',
    `Line range: ${sliceStart}-${sliceEnd}`,
    'Snippet:',
    wrapFence(trimmedSnippet, 'markdown'),
  ].join('\n')
}

const CHAT_WORKSPACE_CONTEXT_MAX_TOTAL_CHARS = 18_000
const CHAT_WORKSPACE_CONTEXT_MAX_SOURCE_FILES = 8
const CHAT_WORKSPACE_CONTEXT_MAX_EXPLORER_FILES = 10
const CHAT_WORKSPACE_CONTEXT_MAX_FILE_SNIPPET_CHARS = 2_400
export type WorkspaceContextCacheStatus = 'disabled' | 'ready' | 'hot' | 'loading'

// Compatibility for status consumers: filesystem caching stays with its source owner.
// A caller hint cannot authenticate current workspace contents or concurrent requests.
export const resolveWorkspaceContextCacheStatus = (_cacheKey: unknown): WorkspaceContextCacheStatus => 'disabled'

export const selectWorkspaceContextFiles = (entries: readonly WorkspaceEntry[]): WorkspaceEntry[] => {
  const selected: WorkspaceEntry[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' || !String(entry.path || '').trim()) continue
    const path = String(entry.path).trim()
    const prior = selected.findIndex(candidate => String(candidate.path).trim() === path)
    const time = Number(entry.updatedAtMs) || 0
    if (prior >= 0) {
      if ((Number(selected[prior].updatedAtMs) || 0) >= time) continue
      selected.splice(prior, 1)
    }
    const position = selected.findIndex(candidate => (Number(candidate.updatedAtMs) || 0) < time)
    if (position >= 0) selected.splice(position, 0, entry)
    else if (selected.length < CHAT_WORKSPACE_CONTEXT_MAX_EXPLORER_FILES) selected.push(entry)
    if (selected.length > CHAT_WORKSPACE_CONTEXT_MAX_EXPLORER_FILES) selected.pop()
  }
  return selected
}

const clipChatContextText = (raw: unknown, maxChars: number): string => {
  const text = typeof raw === 'string' ? raw : ''
  if (!text.trim()) return ''
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`
}

export const buildWorkspaceWideContextPrompt = async ({
  markdownDocumentName,
  markdownText,
  sourceFiles,
}: {
  markdownDocumentName: string | null
  markdownText: string | null
  sourceFiles: SourceFile[]
  cacheKey?: string
}): Promise<string | null> => {
  const sections: string[] = []
  let used = 0
  const appendSection = (title: string, body: string): void => {
    const trimmedBody = String(body || '').trim()
    if (!trimmedBody) return
    const block = `${title}\n${trimmedBody}`
    const projected = used + block.length + 2
    if (projected > CHAT_WORKSPACE_CONTEXT_MAX_TOTAL_CHARS) return
    sections.push(block)
    used = projected
  }

  const editorName = String(markdownDocumentName || '').trim() || 'Untitled'
  const editorText = clipChatContextText(markdownText, CHAT_WORKSPACE_CONTEXT_MAX_FILE_SNIPPET_CHARS)
  if (editorText) {
    appendSection(
      'Workspace Editor (active document):',
      [`File: ${editorName}`, 'Content:', wrapFence(editorText, 'markdown')].join('\n'),
    )
  }

  const sourceLines: string[] = []
  let sourceCount = 0
  for (const file of Array.isArray(sourceFiles) ? sourceFiles : []) {
    if (!file || file.enabled === false || typeof file.text !== 'string' || !file.text.trim()) continue
    const name = String(file.name || file.id || `source-${sourceCount + 1}`).trim() || `source-${sourceCount + 1}`
    const snippet = clipChatContextText(file.text, CHAT_WORKSPACE_CONTEXT_MAX_FILE_SNIPPET_CHARS)
    sourceLines.push(`File: ${name}`, 'Content:', wrapFence(snippet, 'markdown'), '')
    sourceCount += 1
    if (sourceCount >= CHAT_WORKSPACE_CONTEXT_MAX_SOURCE_FILES) break
  }
  appendSection('Source Files (enabled):', sourceLines.join('\n').trim())

  try {
    const fs = await getWorkspaceFs()
    const entries = await fs.listEntries()
    const files = selectWorkspaceContextFiles(entries)
    const seen = new Set<string>()
    const explorerLines: string[] = []
    for (let i = 0; i < files.length; i += 1) {
      if (seen.size >= CHAT_WORKSPACE_CONTEXT_MAX_EXPLORER_FILES) break
      const entry = files[i]
      const path = String(entry.path || '').trim()
      if (!path || seen.has(path)) continue
      seen.add(path)
      const rawText =
        typeof entry.text === 'string' && entry.text.trim()
          ? entry.text
          : (await fs.readFileText(path)) || ''
      const snippet = clipChatContextText(rawText, CHAT_WORKSPACE_CONTEXT_MAX_FILE_SNIPPET_CHARS)
      if (!snippet) continue
      explorerLines.push(`Path: ${path}`)
      explorerLines.push('Content:')
      explorerLines.push(wrapFence(snippet, 'markdown'))
      explorerLines.push('')
    }
    appendSection('Explorer files (workspace):', explorerLines.join('\n').trim())
  } catch {
    void 0
  }

  if (!sections.length) return null
  return [
    'Workspace-wide context is available from Explorer files, Source Files, and Workspace Editor.',
    'Use this context to answer with full-file awareness when possible.',
    '',
    sections.join('\n\n'),
  ].join('\n')
}
