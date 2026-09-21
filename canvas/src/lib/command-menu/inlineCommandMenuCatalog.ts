export { buildInlineMediaEmbed, collectInlineMediaCommandCandidates } from './inlineMediaCommandCandidates'
import { getAgenticOsDocInvocations, getAgenticOsSemanticInvocations } from '@/features/agentic-os/agenticOsDocInvocations'
export type InlineCommandMenuKind = 'slash' | 'variable' | 'keyword'
export type InlineSlashCommandId =
  | 'heading'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet-list'
  | 'numbered-list'
  | 'quote'
  | 'code-block'
  | 'image'
  | 'video'
  | 'checklist'
  | 'divider'
export type InlineVariableCommandId =
  | 'browse-variable'
  | 'upload-media'
  | 'insert-reference'
  | 'new-variable'
  | 'inline-declaration'
  | 'insert-image'
  | 'insert-audio'
  | 'insert-video'
  | 'image-reference'
  | 'audio-reference'
  | 'video-reference'
  | 'edit-variable'
  | 'fallback-reference'
  | 'delete-variable'
export type InlineKeywordCommandId =
  | 'source'
  | 'storyboard'
  | 'runtime'
  | 'fork'
  | 'output'
  | 'action'
  | 'dialogue'
  | 'visual-brief'
  | 'reference-pack'
  | 'media'
  | 'image'
  | 'video'
  | 'graph'
  | 'canvas'
  | 'workflow'
export type InlineCommandMenuActionSpec<Id extends string = string> = {
  id: Id
  kind: InlineCommandMenuKind
  label: string
  group: string
  description: string
  keywords: readonly string[]
  danger?: boolean
}
export type ParsedInlineVariableCommandQuery = {
  mode: 'ref' | 'create' | 'fallback'
  key: string
  value: string
  fallback: string
}
export type InlineMediaKind = 'image' | 'audio' | 'video'
export type InlineMediaCommandCandidate = {
  id: string
  kind: InlineMediaKind
  url: string
  thumbnailUrl?: string
  label: string
  sourceKey?: string
  description: string
  keywords: string[]
}
export type InlineKeywordCommandCandidate = {
  id: string
  label: string
  token: string
  group: string
  description: string
  keywords: string[]
}
export const INLINE_VARIABLE_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/
export const INLINE_MEDIA_COMMAND_ENTRY_LABELS = [
  'Image insertion',
  'Audio insertion',
  'Video insertion',
  'Image reference',
  'Audio reference',
  'Video reference',
] as const
export const INLINE_MEDIA_VARIABLE_KEY_BY_ACTION_ID = {
  'image-reference': 'imageUrl',
  'audio-reference': 'audioUrl',
  'video-reference': 'videoUrl',
} as const satisfies Partial<Record<InlineVariableCommandId, string>>
export const INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID = {
  'insert-image': 'image',
  'insert-audio': 'audio',
  'insert-video': 'video',
} as const satisfies Partial<Record<InlineVariableCommandId, InlineMediaKind>>
export const INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID = 'upload-media' as const satisfies InlineVariableCommandId
export const INLINE_SLASH_COMMAND_ACTIONS: readonly InlineCommandMenuActionSpec<InlineSlashCommandId>[] = [
  {
    id: 'heading',
    kind: 'slash',
    label: 'Heading',
    group: 'Turn into',
    description: 'Convert this block to a heading',
    keywords: ['h2', 'title'],
  },
  {
    id: 'h1',
    kind: 'slash',
    label: 'H1',
    group: 'Headings',
    description: 'Turn current line into a level 1 heading',
    keywords: ['heading', 'title'],
  },
  {
    id: 'h2',
    kind: 'slash',
    label: 'H2',
    group: 'Headings',
    description: 'Turn current line into a level 2 heading',
    keywords: ['heading', 'title'],
  },
  {
    id: 'h3',
    kind: 'slash',
    label: 'H3',
    group: 'Headings',
    description: 'Turn current line into a level 3 heading',
    keywords: ['heading', 'title'],
  },
  {
    id: 'bullet-list',
    kind: 'slash',
    label: 'Bulleted list',
    group: 'Turn into',
    description: 'Turn current line into a bullet',
    keywords: ['list', 'ul'],
  },
  {
    id: 'numbered-list',
    kind: 'slash',
    label: 'Numbered list',
    group: 'Turn into',
    description: 'Turn current line into a numbered item',
    keywords: ['list', 'ol'],
  },
  {
    id: 'quote',
    kind: 'slash',
    label: 'Quote',
    group: 'Turn into',
    description: 'Turn current line into a quote',
    keywords: ['blockquote'],
  },
  {
    id: 'code-block',
    kind: 'slash',
    label: 'Code block',
    group: 'Insert',
    description: 'Wrap selection or current text in a fenced code block',
    keywords: ['fence', 'pre'],
  },
  {
    id: 'image',
    kind: 'slash',
    label: 'Image',
    group: 'Insert media',
    description: 'Insert an image embed placeholder',
    keywords: ['media', 'picture', 'imageUrl', 'asset'],
  },
  {
    id: 'video',
    kind: 'slash',
    label: 'Video',
    group: 'Insert media',
    description: 'Insert a video embed placeholder',
    keywords: ['media', 'clip', 'videoUrl', 'asset'],
  },
  {
    id: 'checklist',
    kind: 'slash',
    label: 'Checklist',
    group: 'Insert',
    description: 'Turn current line into a task item',
    keywords: ['task', 'todo'],
  },
  {
    id: 'divider',
    kind: 'slash',
    label: 'Divider',
    group: 'Insert',
    description: 'Insert a horizontal divider',
    keywords: ['hr', 'separator', 'rule'],
  },
] as const
export const INLINE_KEYWORD_COMMAND_ACTIONS: readonly InlineCommandMenuActionSpec<InlineKeywordCommandId>[] = [
  { id: 'source', kind: 'keyword', label: 'Source', group: 'Canvas keywords', description: 'Insert #source', keywords: ['lane', 'input', 'evidence'] },
  { id: 'storyboard', kind: 'keyword', label: 'Storyboard', group: 'Canvas keywords', description: 'Insert #storyboard', keywords: ['card', 'frame', 'strybldr'] },
  { id: 'runtime', kind: 'keyword', label: 'Runtime', group: 'Canvas keywords', description: 'Insert #runtime', keywords: ['execution', 'api', 'operator'] },
  { id: 'fork', kind: 'keyword', label: 'Fork', group: 'Canvas keywords', description: 'Insert #fork', keywords: ['branch', 'compare'] },
  { id: 'output', kind: 'keyword', label: 'Output', group: 'Card fields', description: 'Insert #output', keywords: ['result', 'response'] },
  { id: 'action', kind: 'keyword', label: 'Action', group: 'Card fields', description: 'Insert #action', keywords: ['task', 'step'] },
  { id: 'dialogue', kind: 'keyword', label: 'Dialogue', group: 'Card fields', description: 'Insert #dialogue', keywords: ['script', 'voice'] },
  { id: 'visual-brief', kind: 'keyword', label: 'Visual brief', group: 'Card fields', description: 'Insert #visual-brief', keywords: ['prompt', 'style'] },
  { id: 'reference-pack', kind: 'keyword', label: 'Reference pack', group: 'Media keywords', description: 'Insert #reference-pack', keywords: ['refs', 'evidence'] },
  { id: 'media', kind: 'keyword', label: 'Media', group: 'Media keywords', description: 'Insert #media', keywords: ['asset', 'rich media'] },
  { id: 'image', kind: 'keyword', label: 'Image', group: 'Media keywords', description: 'Insert #image', keywords: ['photo', 'thumbnail'] },
  { id: 'video', kind: 'keyword', label: 'Video', group: 'Media keywords', description: 'Insert #video', keywords: ['clip', 'youtube'] },
  { id: 'graph', kind: 'keyword', label: 'Graph', group: 'Graph keywords', description: 'Insert #graph', keywords: ['node', 'edge'] },
  { id: 'canvas', kind: 'keyword', label: 'Canvas', group: 'Graph keywords', description: 'Insert #canvas', keywords: ['view', 'surface'] },
  { id: 'workflow', kind: 'keyword', label: 'Workflow', group: 'Graph keywords', description: 'Insert #workflow', keywords: ['process', 'stage'] },
] as const
export const INLINE_VARIABLE_COMMAND_ACTIONS: readonly InlineCommandMenuActionSpec<InlineVariableCommandId>[] = [
  {
    id: INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID,
    kind: 'variable',
    label: 'New Media',
    group: 'Insert media',
    description: 'Create or upload image, audio, or video through the shared Media storage flow',
    keywords: ['new', 'upload', 'media', 'image', 'audio', 'video', 'r2', 'storage'],
  },
  {
    id: 'browse-variable',
    kind: 'variable',
    label: 'Browse variables',
    group: 'Actions',
    description: 'Reference an existing variable',
    keywords: ['reference', 'insert'],
  },
  {
    id: 'insert-reference',
    kind: 'variable',
    label: 'Insert reference',
    group: 'Actions',
    description: 'Type key to insert {{key}}',
    keywords: ['variable', 'reference'],
  },
  {
    id: 'new-variable',
    kind: 'variable',
    label: 'New variable',
    group: 'Actions',
    description: 'Create frontmatter variable',
    keywords: ['create', 'frontmatter'],
  },
  {
    id: 'inline-declaration',
    kind: 'variable',
    label: 'Inline declaration',
    group: 'Actions',
    description: 'Type key:value to insert {{key:value}}',
    keywords: ['create', 'define'],
  },
  {
    id: 'insert-image',
    kind: 'variable',
    label: 'Image',
    group: 'Insert media',
    description: 'Open image insertion from @ commands',
    keywords: ['image', 'media', 'insert', 'imageUrl', 'asset'],
  },
  {
    id: 'insert-video',
    kind: 'variable',
    label: 'Video',
    group: 'Insert media',
    description: 'Open video insertion from @ commands',
    keywords: ['video', 'media', 'insert', 'videoUrl', 'clip'],
  },
  {
    id: 'insert-audio',
    kind: 'variable',
    label: 'Audio',
    group: 'Insert media',
    description: 'Open audio insertion from @ commands',
    keywords: ['audio', 'media', 'insert', 'audioUrl', 'sound'],
  },
  {
    id: 'image-reference',
    kind: 'variable',
    label: 'Image reference',
    group: 'Media',
    description: 'Insert {{imageUrl}} for image-backed cards',
    keywords: ['image', 'imageUrl', 'media', 'asset'],
  },
  {
    id: 'audio-reference',
    kind: 'variable',
    label: 'Audio reference',
    group: 'Media',
    description: 'Insert {{audioUrl}} for audio-backed cards',
    keywords: ['audio', 'audioUrl', 'media', 'sound'],
  },
  {
    id: 'video-reference',
    kind: 'variable',
    label: 'Video reference',
    group: 'Media',
    description: 'Insert {{videoUrl}} for video-backed cards',
    keywords: ['video', 'videoUrl', 'media', 'clip'],
  },
  {
    id: 'edit-variable',
    kind: 'variable',
    label: 'Edit key',
    group: 'Actions',
    description: 'Update a frontmatter variable',
    keywords: ['update', 'frontmatter'],
  },
  {
    id: 'fallback-reference',
    kind: 'variable',
    label: 'Fallback reference',
    group: 'Actions',
    description: 'Reference a variable with fallback text',
    keywords: ['fallback', 'default'],
  },
  {
    id: 'delete-variable',
    kind: 'variable',
    label: 'Delete variable',
    group: 'Actions',
    description: 'Remove frontmatter variable',
    keywords: ['remove'],
    danger: true,
  },
] as const
export function parseInlineVariableCommandQuery(query: string): ParsedInlineVariableCommandQuery {
  const raw = String(query || '').trim()
  const createIndex = raw.indexOf(':')
  if (createIndex > 0) {
    return {
      mode: 'create',
      key: raw.slice(0, createIndex).trim(),
      value: raw.slice(createIndex + 1).trim(),
      fallback: '',
    }
  }
  const fallbackIndex = raw.indexOf('|')
  if (fallbackIndex > 0) {
    return {
      mode: 'fallback',
      key: raw.slice(0, fallbackIndex).trim(),
      value: '',
      fallback: raw.slice(fallbackIndex + 1).trim(),
    }
  }
  return { mode: 'ref', key: raw, value: '', fallback: '' }
}
export function isInlineVariableKey(value: string): boolean {
  return INLINE_VARIABLE_KEY_PATTERN.test(String(value || '').trim())
}
const INLINE_KEYWORD_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'for',
  'from',
  'into',
  'of',
  'or',
  'the',
  'then',
  'this',
  'to',
  'with',
])
export function buildInlineKeywordToken(raw: string): string {
  const token = String(raw || '')
    .normalize('NFKC')
    .trim()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}_ -]+/gu, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return token ? `#${token}` : ''
}
function readInlineKeywordLabel(raw: string): string {
  const compact = String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
  return compact ? compact.slice(0, 48) : ''
}
export function collectInlineKeywordCommandCandidates(args: {
  draftText?: string
  limit?: number | null
}): InlineKeywordCommandCandidate[] {
  const seen = new Set<string>()
  const candidates: InlineKeywordCommandCandidate[] = []
  const limit = args.limit == null
    ? null
    : Number.isFinite(args.limit) && Number(args.limit) > 0
      ? Number(args.limit)
      : 0
  const reachedLimit = () => limit !== null && candidates.length >= limit
  const push = (labelRaw: string, group: string, description?: string, keywords?: string[]) => {
    if (reachedLimit()) return
    const label = readInlineKeywordLabel(labelRaw)
    const token = buildInlineKeywordToken(label)
    if (!token || seen.has(token)) return
    seen.add(token)
    candidates.push({
      id: `keyword-${token.slice(1)}`,
      label,
      token,
      group,
      description: description || `Insert ${token}`,
      keywords: [token, label, ...(keywords || [])],
    })
  }
  const text = String(args.draftText || '')
  for (const match of text.matchAll(/#([\p{L}\p{N}_-]{2,48})/gu)) {
    push(match[1] || '', 'Dashboard keywords')
    if (reachedLimit()) return candidates
  }
  for (const action of INLINE_KEYWORD_COMMAND_ACTIONS) {
    push(action.label, action.group, action.description, [...action.keywords])
    if (reachedLimit()) return candidates
  }
  for (const doc of getAgenticOsDocInvocations()) {
    if (reachedLimit()) return candidates
    if (seen.has(doc.hashToken)) continue
    seen.add(doc.hashToken)
    candidates.push({
      id: `keyword-${doc.id}`,
      label: doc.label,
      token: doc.hashToken,
      group: 'Agentic OS docs',
      description: doc.summary,
      keywords: [doc.hashToken, doc.slashCommand, doc.atToken, doc.sourcePath, ...doc.keywords],
    })
  }
  for (const invocation of getAgenticOsSemanticInvocations()) {
    if (reachedLimit()) return candidates
    const token = invocation.token
    if (seen.has(token)) continue
    seen.add(token)
    candidates.push({
      id: `keyword-${invocation.id}`,
      label: invocation.label,
      token,
      group: invocation.group,
      description: invocation.summary,
      keywords: [token, invocation.sourcePath, ...invocation.keywords],
    })
  }
  for (const match of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,47}/gu)) {
    const word = match[0] || ''
    if (INLINE_KEYWORD_STOP_WORDS.has(word.toLowerCase())) continue
    push(word, 'Context keywords')
    if (reachedLimit()) return candidates
  }
  return candidates
}
export function getInlineCommandMenuCatalog() {
  return {
    slash: INLINE_SLASH_COMMAND_ACTIONS,
    variable: INLINE_VARIABLE_COMMAND_ACTIONS,
    keyword: INLINE_KEYWORD_COMMAND_ACTIONS,
  } as const
}
