import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { hashText } from '@/features/parsers/hash'
import { LS_KEYS } from '@/lib/config'
import { KNOWGRPH_STORAGE_SYNC_BOUNDS } from '@/lib/storage/knowgrphStorageBounds'

export type DocumentVersionSource = 'editorWorkspace' | 'sourceFiles' | 'gitGraph' | 'manual'
export type DocumentVersionReviewDecision = 'keep' | 'discard'

export type DocumentVersionEntry = {
  id: string
  path: string
  label: string
  source: DocumentVersionSource
  authorId?: string
  authorLabel?: string
  collaborationPeerId?: string
  timestamp: number
  text: string
  textHash: string
  textLength: number
  truncated?: boolean
  reviewDecision?: DocumentVersionReviewDecision
  reviewTimestamp?: number
  reviewLabel?: string
}

export type DocumentVersionDiff = {
  additions: number
  deletions: number
  changed: boolean
  patch: string
}

export type DocumentVersionReviewLineChange = {
  kind: 'added' | 'removed' | 'changed'
  originalStartLine: number
  originalLineCount: number
  modifiedStartLine: number
  modifiedLineCount: number
}

export type DocumentVersionReviewParticipant = {
  id: string
  label: string
  source: DocumentVersionSource
  versionId: string
  timestamp: number
}

export type DocumentVersionReviewModel = {
  path: string
  language: string
  originalUri: string
  modifiedUri: string
  originalText: string
  modifiedText: string
  previous: DocumentVersionEntry | null
  current: DocumentVersionEntry
  diff: DocumentVersionDiff
  lineChanges: DocumentVersionReviewLineChange[]
  participants: DocumentVersionReviewParticipant[]
  summary: string
}

export type DocumentVersionPathSummary = {
  path: string
  count: number
  latest: DocumentVersionEntry
  previous: DocumentVersionEntry | null
}

export type DocumentVersionGitGraphRow = {
  entry: DocumentVersionEntry
  graphId: string
  tag: string
  versionNumber: number
}

type DocumentVersionState = {
  version: 1
  entries: DocumentVersionEntry[]
}

const DOCUMENT_VERSION_STATE_VERSION = 1
const DOCUMENT_VERSION_MAX_ENTRIES_PER_PATH = KNOWGRPH_STORAGE_SYNC_BOUNDS.maxVersionSnapshots
const DOCUMENT_VERSION_MAX_TOTAL_ENTRIES = 240
const DOCUMENT_VERSION_TEXT_MAX_CHARS = 320_000
const DOCUMENT_VERSION_EVENT = 'kg:document-versions-changed'

let memoryStorageText = ''

export const normalizeDocumentVersionPath = (value: unknown): string => {
  const raw = String(value || '').trim().replace(/^workspace:/, '')
  if (!raw) return ''
  return normalizeWorkspacePath(raw).replace(/^\/+/, '')
}

const readStorageText = (): string => {
  if (typeof window === 'undefined' || !window.localStorage) return memoryStorageText
  try {
    return window.localStorage.getItem(LS_KEYS.documentVersions) || ''
  } catch {
    return memoryStorageText
  }
}

const writeStorageText = (text: string): void => {
  memoryStorageText = text
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(LS_KEYS.documentVersions, text)
  } catch {
    void 0
  }
}

const readDocumentVersionState = (): DocumentVersionState => {
  const fallback: DocumentVersionState = { version: DOCUMENT_VERSION_STATE_VERSION, entries: [] }
  const raw = readStorageText()
  if (!raw.trim()) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<DocumentVersionState>
    const entries = Array.isArray(parsed.entries) ? parsed.entries : []
    return {
      version: DOCUMENT_VERSION_STATE_VERSION,
      entries: entries
        .filter((entry): entry is DocumentVersionEntry => {
          return !!entry
            && typeof entry.id === 'string'
            && typeof entry.path === 'string'
            && typeof entry.textHash === 'string'
            && typeof entry.timestamp === 'number'
        })
        .map(entry => {
          const reviewDecision = readDocumentVersionReviewDecision(entry.reviewDecision)
          const reviewTimestamp = typeof entry.reviewTimestamp === 'number'
            ? Math.floor(entry.reviewTimestamp || 0)
            : 0
          const reviewLabel = String(entry.reviewLabel || '').trim()
          return {
            id: String(entry.id || ''),
            path: normalizeDocumentVersionPath(entry.path),
            label: String(entry.label || 'Saved'),
            source: readDocumentVersionSource(entry.source),
            ...(String(entry.authorId || '').trim() ? { authorId: String(entry.authorId || '').trim() } : {}),
            ...(String(entry.authorLabel || '').trim() ? { authorLabel: String(entry.authorLabel || '').trim() } : {}),
            ...(String(entry.collaborationPeerId || '').trim() ? { collaborationPeerId: String(entry.collaborationPeerId || '').trim() } : {}),
            timestamp: Math.floor(entry.timestamp || 0),
            text: String(entry.text || ''),
            textHash: String(entry.textHash || ''),
            textLength: Math.max(0, Math.floor(entry.textLength || String(entry.text || '').length)),
            ...(entry.truncated === true ? { truncated: true } : {}),
            ...(reviewDecision ? { reviewDecision } : {}),
            ...(reviewTimestamp > 0 ? { reviewTimestamp } : {}),
            ...(reviewLabel ? { reviewLabel } : {}),
          }
        })
        .filter(entry => !!entry.path && !!entry.id),
    }
  } catch {
    return fallback
  }
}

const writeDocumentVersionState = (state: DocumentVersionState): void => {
  writeStorageText(JSON.stringify(state))
  notifyDocumentVersionsChanged()
}

const readDocumentVersionSource = (value: unknown): DocumentVersionSource => {
  const raw = String(value || '').trim()
  if (raw === 'sourceFiles' || raw === 'gitGraph' || raw === 'manual') return raw
  return 'editorWorkspace'
}

const readDocumentVersionReviewDecision = (value: unknown): DocumentVersionReviewDecision | null => {
  const raw = String(value || '').trim()
  if (raw === 'keep' || raw === 'discard') return raw
  return null
}

export const trimDocumentVersionState = (entries: DocumentVersionEntry[]): DocumentVersionEntry[] => {
  const byPathCount = new Map<string, number>()
  const kept: DocumentVersionEntry[] = []
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (!entry) continue
    const count = byPathCount.get(entry.path) || 0
    if (count >= DOCUMENT_VERSION_MAX_ENTRIES_PER_PATH) continue
    byPathCount.set(entry.path, count + 1)
    kept.push(entry)
    if (kept.length >= DOCUMENT_VERSION_MAX_TOTAL_ENTRIES) break
  }
  return kept.reverse()
}

const notifyDocumentVersionsChanged = (): void => {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(DOCUMENT_VERSION_EVENT))
  } catch {
    void 0
  }
}

export const subscribeDocumentVersionsChanged = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const handle = () => listener()
  window.addEventListener(DOCUMENT_VERSION_EVENT, handle)
  window.addEventListener('storage', handle)
  return () => {
    window.removeEventListener(DOCUMENT_VERSION_EVENT, handle)
    window.removeEventListener('storage', handle)
  }
}

export const readDocumentVersions = (path?: unknown): DocumentVersionEntry[] => {
  const normalizedPath = normalizeDocumentVersionPath(path)
  const entries = readDocumentVersionState().entries
  return normalizedPath ? entries.filter(entry => entry.path === normalizedPath) : entries
}

export const readDocumentVersionCountsByPath = (): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const entry of readDocumentVersions()) {
    out[entry.path] = (out[entry.path] || 0) + 1
  }
  return out
}

export function buildDocumentVersionPathSummaries(entries: readonly DocumentVersionEntry[]): DocumentVersionPathSummary[] {
  const byPath = new Map<string, DocumentVersionEntry[]>()
  for (const entry of entries) {
    const path = normalizeDocumentVersionPath(entry.path)
    if (!path) continue
    const rows = byPath.get(path) || []
    rows.push(entry)
    byPath.set(path, rows)
  }
  return Array.from(byPath.entries())
    .flatMap(([path, rows]) => {
      const sorted = rows.slice().sort((a, b) => a.timestamp - b.timestamp)
      const latest = sorted[sorted.length - 1] || null
      if (!latest) return []
      return [{
        path,
        count: sorted.length,
        latest,
        previous: sorted.length >= 2 ? sorted[sorted.length - 2] || null : null,
      } satisfies DocumentVersionPathSummary]
    })
    .sort((a, b) => b.latest.timestamp - a.latest.timestamp)
}

export const recordDocumentVersionSnapshot = (args: {
  path: unknown
  text: unknown
  label?: string
  source?: DocumentVersionSource
  authorId?: string
  authorLabel?: string
  collaborationPeerId?: string
  timestamp?: number
}): DocumentVersionEntry | null => {
  const path = normalizeDocumentVersionPath(args.path)
  if (!path) return null
  const rawText = String(args.text ?? '')
  const text = rawText.slice(0, DOCUMENT_VERSION_TEXT_MAX_CHARS)
  const textHash = hashText(text)
  const state = readDocumentVersionState()
  const previous = [...state.entries].reverse().find(entry => entry.path === path) || null
  if (previous?.textHash === textHash) return null
  const timestamp = Math.floor(args.timestamp || Date.now())
  const entry: DocumentVersionEntry = {
    id: `dv-${timestamp.toString(36)}-${textHash.slice(0, 8)}`,
    path,
    label: String(args.label || 'Saved').trim() || 'Saved',
    source: readDocumentVersionSource(args.source),
    ...(String(args.authorId || '').trim() ? { authorId: String(args.authorId || '').trim() } : {}),
    ...(String(args.authorLabel || '').trim() ? { authorLabel: String(args.authorLabel || '').trim() } : {}),
    ...(String(args.collaborationPeerId || '').trim() ? { collaborationPeerId: String(args.collaborationPeerId || '').trim() } : {}),
    timestamp,
    text,
    textHash,
    textLength: rawText.length,
    ...(rawText.length > text.length ? { truncated: true } : {}),
  }
  writeDocumentVersionState({
    version: DOCUMENT_VERSION_STATE_VERSION,
    entries: trimDocumentVersionState([...state.entries, entry]),
  })
  return entry
}

export const recordDocumentVersionReviewDecision = (args: {
  path?: unknown
  versionId: unknown
  decision: DocumentVersionReviewDecision
  label?: string
  timestamp?: number
}): DocumentVersionEntry | null => {
  const versionId = String(args.versionId || '').trim()
  const decision = readDocumentVersionReviewDecision(args.decision)
  if (!versionId || !decision) return null
  const path = normalizeDocumentVersionPath(args.path)
  const state = readDocumentVersionState()
  let reviewed: DocumentVersionEntry | null = null
  const entries = state.entries.map(entry => {
    if (entry.id !== versionId) return entry
    if (path && entry.path !== path) return entry
    const label = String(args.label || '').trim()
    const next: DocumentVersionEntry = {
      ...entry,
      reviewDecision: decision,
      reviewTimestamp: Math.floor(args.timestamp || Date.now()),
      ...(label ? { reviewLabel: label } : {}),
    }
    reviewed = next
    return next
  })
  if (!reviewed) return null
  writeDocumentVersionState({
    version: DOCUMENT_VERSION_STATE_VERSION,
    entries,
  })
  return reviewed
}

const splitDiffLines = (text: string): string[] => {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized) return []
  return normalized.split('\n')
}

type DocumentVersionLineDiffParts = {
  oldLines: string[]
  newLines: string[]
  prefix: number
  oldEnd: number
  newEnd: number
  removed: string[]
  added: string[]
}

const buildDocumentVersionLineDiffParts = (previousText: string, currentText: string): DocumentVersionLineDiffParts => {
  const oldLines = splitDiffLines(previousText)
  const newLines = splitDiffLines(currentText)
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const oldEnd = oldLines.length - suffix
  const newEnd = newLines.length - suffix
  return {
    oldLines,
    newLines,
    prefix,
    oldEnd,
    newEnd,
    removed: oldLines.slice(prefix, oldEnd),
    added: newLines.slice(prefix, newEnd),
  }
}

const formatRange = (start: number, length: number): string => {
  return length === 1 ? String(start) : `${start},${length}`
}

export const buildDocumentVersionDiff = (
  previous: DocumentVersionEntry | null | undefined,
  current: DocumentVersionEntry | null | undefined,
  options?: { contextLines?: number },
): DocumentVersionDiff => {
  if (!current) return { additions: 0, deletions: 0, changed: false, patch: '' }
  const previousText = previous?.text || ''
  const currentText = current.text || ''
  if (previousText === currentText) return { additions: 0, deletions: 0, changed: false, patch: '' }

  const parts = buildDocumentVersionLineDiffParts(previousText, currentText)
  const { oldLines, newLines, prefix, oldEnd, newEnd, removed, added } = parts
  const contextLines = Math.max(0, Math.min(8, Math.floor(options?.contextLines ?? 3)))
  const beforeStart = Math.max(0, prefix - contextLines)
  const afterOldEnd = Math.min(oldLines.length, oldEnd + contextLines)
  const afterNewEnd = Math.min(newLines.length, newEnd + contextLines)
  const patch: string[] = [
    `diff --git a/${current.path} b/${current.path}`,
    `--- a/${current.path}`,
    `+++ b/${current.path}`,
    `@@ -${formatRange(beforeStart + 1, Math.max(0, afterOldEnd - beforeStart))} +${formatRange(beforeStart + 1, Math.max(0, afterNewEnd - beforeStart))} @@`,
  ]
  for (let i = beforeStart; i < prefix; i += 1) patch.push(` ${oldLines[i] || ''}`)
  for (const line of removed) patch.push(`-${line}`)
  for (const line of added) patch.push(`+${line}`)
  for (let i = oldEnd; i < afterOldEnd; i += 1) patch.push(` ${oldLines[i] || ''}`)

  return {
    additions: added.length,
    deletions: removed.length,
    changed: true,
    patch: patch.join('\n'),
  }
}

const inferDocumentVersionLanguage = (path: string): string => {
  const normalized = String(path || '').toLowerCase()
  if (/\.(md|markdown|mdx)$/.test(normalized)) return 'markdown'
  if (/\.(json|jsonld|kgc)$/.test(normalized)) return 'json'
  if (/\.(ya?ml)$/.test(normalized)) return 'yaml'
  if (/\.(sql)$/.test(normalized)) return 'sql'
  if (/\.(ts|tsx)$/.test(normalized)) return 'typescript'
  if (/\.(js|jsx|mjs|cjs)$/.test(normalized)) return 'javascript'
  return 'plaintext'
}

const buildDocumentVersionModelUri = (entry: DocumentVersionEntry | null, path: string, side: 'original' | 'modified'): string => {
  const versionId = entry?.id || 'empty'
  const hash = entry?.textHash || 'blank'
  const encodedPath = encodeURIComponent(path || 'document')
  return `inmemory://knowgrph/document-version/${encodedPath}/${side}/${encodeURIComponent(versionId)}-${hash.slice(0, 12)}`
}

const buildDocumentVersionReviewLineChanges = (
  previous: DocumentVersionEntry | null | undefined,
  current: DocumentVersionEntry,
): DocumentVersionReviewLineChange[] => {
  const previousText = previous?.text || ''
  const currentText = current.text || ''
  if (previousText === currentText) return []
  const parts = buildDocumentVersionLineDiffParts(previousText, currentText)
  if (!parts.removed.length && !parts.added.length) return []
  const kind =
    parts.removed.length > 0 && parts.added.length > 0
      ? 'changed'
      : parts.added.length > 0
        ? 'added'
        : 'removed'
  return [{
    kind,
    originalStartLine: parts.prefix + 1,
    originalLineCount: parts.removed.length,
    modifiedStartLine: parts.prefix + 1,
    modifiedLineCount: parts.added.length,
  }]
}

const readDocumentVersionParticipant = (entry: DocumentVersionEntry): DocumentVersionReviewParticipant => {
  const id = String(entry.authorId || entry.collaborationPeerId || `${entry.source}:${entry.id}`).trim()
  const label = String(entry.authorLabel || entry.collaborationPeerId || entry.source || 'Reviewer').trim()
  return {
    id,
    label,
    source: entry.source,
    versionId: entry.id,
    timestamp: entry.timestamp,
  }
}

export const buildDocumentVersionReviewModel = (
  previous: DocumentVersionEntry | null | undefined,
  current: DocumentVersionEntry | null | undefined,
): DocumentVersionReviewModel | null => {
  if (!current) return null
  const diff = buildDocumentVersionDiff(previous, current)
  const path = current.path || previous?.path || ''
  const participants = [previous, current]
    .filter((entry): entry is DocumentVersionEntry => !!entry)
    .map(readDocumentVersionParticipant)
  const uniqueParticipants = Array.from(
    new Map(participants.map(participant => [`${participant.id}:${participant.versionId}`, participant])).values(),
  )
  return {
    path,
    language: inferDocumentVersionLanguage(path),
    originalUri: buildDocumentVersionModelUri(previous || null, path, 'original'),
    modifiedUri: buildDocumentVersionModelUri(current, path, 'modified'),
    originalText: previous?.text || '',
    modifiedText: current.text || '',
    previous: previous || null,
    current,
    diff,
    lineChanges: buildDocumentVersionReviewLineChanges(previous, current),
    participants: uniqueParticipants,
    summary: diff.changed ? `+${diff.additions} -${diff.deletions}` : 'No text changes',
  }
}

const sanitizeGitGraphId = (value: string): string => {
  const compact = String(value || '').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')
  return compact || 'version'
}

export const buildDocumentVersionGitGraphRows = (
  entries: ReadonlyArray<DocumentVersionEntry>,
): DocumentVersionGitGraphRow[] => {
  const rows = Array.isArray(entries) ? entries : []
  return rows.map((entry, index) => ({
    entry,
    graphId: sanitizeGitGraphId(`v${index + 1}_${entry.textHash.slice(0, 6)}`),
    tag: String(entry.label || entry.source || 'Saved').replace(/"/g, '\\"').slice(0, 28),
    versionNumber: index + 1,
  }))
}

export const buildDocumentVersionsGitGraphCode = (entries: ReadonlyArray<DocumentVersionEntry>): string => {
  const rows = buildDocumentVersionGitGraphRows(entries)
  if (rows.length === 0) return 'gitGraph\n  commit id:"empty" tag:"no versions"'
  const lines = ['gitGraph']
  rows.forEach(row => {
    lines.push(`  commit id:"${row.graphId}" tag:"${row.tag || `v${row.versionNumber}`}"`)
  })
  return lines.join('\n')
}

export const readLatestDocumentVersionPair = (path: unknown): {
  previous: DocumentVersionEntry | null
  current: DocumentVersionEntry | null
} => {
  const versions = readDocumentVersions(path)
  return {
    previous: versions.length >= 2 ? versions[versions.length - 2] || null : null,
    current: versions.length >= 1 ? versions[versions.length - 1] || null : null,
  }
}
