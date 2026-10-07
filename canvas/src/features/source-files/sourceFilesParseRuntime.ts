import { adaptFeishuBaseRecordsToSourceDocument } from '@/features/source-files/feishuBaseSourceAdapter'
import type {
  FeishuBaseSourceImportRequest,
  FeishuBaseSourceImportResult,
} from '@/features/source-files/feishuBaseSourceImportContract'
import { scheduleApplyComposedGraphFromSourceFiles } from '@/features/source-files/applyComposedGraphFromSourceFiles'
import { findNextSourceFileIndex } from '@/features/source-files/sourceFileNaming'
import { buildSourceFileParseIdentityHash, resolveSourceFileParseInput } from '@/features/source-files/sourceFileParseIdentity'
import {
  buildSourceFileLifecycleState,
  buildSourceFileRecord,
  areSourceFileSourcesEqual,
} from '@/features/source-files/sourceFileParsedState'
import { openMarkdownWorkspaceEditorPane } from '@/features/workspace-table/workspaceTableSsot'
import { useGraphStore } from '@/hooks/useGraphStore'
import { mapLimit } from '@/lib/async/mapLimit'
import { SOURCE_FILES_REPARSE_CONCURRENCY } from '@/lib/config'
import { applyImportedCsvToStore, applyImportedJsonToStore } from '@/features/toolbar/importSideEffects'
import { runImportFlow } from '@/features/toolbar/importFlow'
import { createId } from '@/lib/id'
import { AGENTIC_OS_SOURCE_IMPORT_LIMITS } from '@/lib/storage/agentic-graph-storage-bounds'
import { normalizeMermaidMmdToMarkdown } from 'grph-shared/markdown/mermaidInput'

export const readSourceImportUtf8ByteLength = (value: string): number =>
  new TextEncoder().encode(String(value || '')).byteLength

export const readSourceImportLimitError = (value: string): string | null =>
  readSourceImportUtf8ByteLength(value) > AGENTIC_OS_SOURCE_IMPORT_LIMITS.maxBytes
    ? `Import exceeds ${AGENTIC_OS_SOURCE_IMPORT_LIMITS.maxBytes} bytes`
    : null

const isJsonishName = (name: string): boolean => {
  const lower = String(name || '').trim().toLowerCase()
  return (
    lower.endsWith('.json')
    || lower.endsWith('.jsonld')
    || lower.endsWith('.geojson')
    || lower.endsWith('.csv')
    || lower.endsWith('.yaml')
    || lower.endsWith('.yml')
  )
}

export const resolveSameNameSourceFileId = (
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles'],
  suggestedName: unknown,
): string | null => {
  const suggested = String(suggestedName || '').trim()
  if (!suggested) return null
  const existing = Array.isArray(sourceFiles) ? sourceFiles : []
  return existing.find(file =>
    String(file.name || '').trim().toLowerCase() === suggested.toLowerCase())?.id || null
}

export function ensureTargetSourceFileId(args: {
  fileId: string | null
  suggestedName?: string | null
}): string {
  const store = useGraphStore.getState()
  const existing = Array.isArray(store.sourceFiles) ? store.sourceFiles : []
  if (args.fileId) {
    const found = existing.find(file => file.id === args.fileId)
    if (found) return found.id
  }
  const suggested = String(args.suggestedName || '').trim()
  const sameNameSourceFileId = resolveSameNameSourceFileId(existing, suggested)
  if (sameNameSourceFileId) return sameNameSourceFileId
  const nextName = suggested || (() => {
    const index = findNextSourceFileIndex(existing.map(file => String(file.name || '')), '')
    return `source-${index}.md`
  })()
  const id = createId('sf')
  store.addSourceFile(buildSourceFileRecord({
    id,
    name: nextName,
    text: '',
    enabled: true,
    source: { kind: 'local', path: nextName },
  }))
  return id
}

export function syncDocumentViewFromSourceFile(
  file: { name: string; text: string; source?: { kind: 'url' | 'local'; url?: string } },
  options?: { applyToGraph?: boolean },
) {
  const store = useGraphStore.getState()
  const baselineLocked = store.documentStructureBaselineLock === true
  const name = String(file.name || '').trim() || 'source.md'
  const text = String(file.text || '')
  const sourceUrl = file.source?.kind === 'url' ? String(file.source?.url || '').trim() : ''
  if (isJsonishName(name)) {
    const lower = name.toLowerCase()
    if (lower.endsWith('.csv')) {
      applyImportedCsvToStore({ name, text, sourceUrl: sourceUrl || null })
      return
    }
    if (lower.endsWith('.json') || lower.endsWith('.jsonld') || lower.endsWith('.geojson')) {
      applyImportedJsonToStore({
        name,
        text,
        fallbackFenceLang: lower.endsWith('.jsonld') ? 'jsonld' : 'json',
        sourceUrl: sourceUrl || null,
        applyToGraph: options?.applyToGraph ?? true,
      })
      return
    }
    const trimmed = text.trim()
    const fencedLang = lower.endsWith('.yml') || lower.endsWith('.yaml') ? 'yaml' : 'text'
    const markdown = trimmed ? ['```' + fencedLang, trimmed, '```', ''].join('\n') : text
    if (!baselineLocked) {
      try {
        openMarkdownWorkspaceEditorPane(store)
      } catch {
        void 0
      }
    }
    void store.setActiveMarkdownDocument({
      name,
      text: markdown,
      normalizeMermaidMmd: false,
      sourceUrl: sourceUrl || null,
      jsonSourceText: null,
      autoEnableFrontmatter: false,
      applyViewPreset: false,
    })
    return
  }
  const normalized = normalizeMermaidMmdToMarkdown(name, text)
  if (!baselineLocked) {
    try {
      openMarkdownWorkspaceEditorPane(store)
    } catch {
      void 0
    }
  }
  void store.setActiveMarkdownDocument({
    name,
    text: normalized,
    normalizeMermaidMmd: false,
    sourceUrl: sourceUrl || null,
    autoEnableFrontmatter: false,
    applyViewPreset: options?.applyToGraph === true,
    applyToGraph: options?.applyToGraph ?? true,
    forceApplyToGraph: options?.applyToGraph === true,
  })
}

export const buildSourceFileIdleReset = () =>
  buildSourceFileLifecycleState({ status: 'idle' })

const parseJobBySourceFileId = new Map<string, number>()
const pendingParseBySourceFileId = new Map<string, { promise: Promise<number | null>; source: SourceFileSource; name: string; textHash: string }>()
type SourceFileSource = ReturnType<typeof useGraphStore.getState>['sourceFiles'][number]['source']

export async function applyImportedTextToSourceFile(args: {
  id: string
  name: string
  text: string
  source: { kind: 'url' | 'local'; url?: string; path?: string }
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = useGraphStore.getState()
  const limitError = readSourceImportLimitError(args.text)
  if (limitError) {
    const previous = store.sourceFiles.find(file => file.id === args.id)
    store.updateSourceFile(
      args.id,
      buildSourceFileLifecycleState({
        status: 'error',
        error: limitError,
        previousState: previous,
        preserveParsedState: true,
      }),
    )
    return { ok: false, error: limitError }
  }
  store.updateSourceFile(args.id, {
    name: args.name,
    text: args.text,
    ...buildSourceFileIdleReset(),
    source: args.source,
    enabled: true,
  })
  syncDocumentViewFromSourceFile(
    { name: args.name, text: args.text, source: args.source },
    { applyToGraph: false },
  )
  await parseAndApplySourceFile(args.id)
  return { ok: true }
}

export async function importSourceDocumentIntoSourceFile(args: {
  fileId: string | null
  name: string
  text: string
  source: { kind: 'url' | 'local'; url?: string; path?: string }
}): Promise<{ ok: true; fileId: string } | { ok: false; error: string }> {
  const limitError = readSourceImportLimitError(args.text)
  if (limitError) return { ok: false, error: limitError }
  const fileId = ensureTargetSourceFileId({
    fileId: args.fileId,
    suggestedName: args.name,
  })
  const applied = await applyImportedTextToSourceFile({
    id: fileId,
    name: args.name,
    text: args.text,
    source: args.source,
  })
  return applied.ok === true
    ? { ok: true, fileId }
    : { ok: false, error: applied.error }
}

export async function importFeishuBaseSnapshotIntoSourceFile(
  args: FeishuBaseSourceImportRequest,
): Promise<FeishuBaseSourceImportResult> {
  const adapted = adaptFeishuBaseRecordsToSourceDocument(args.snapshot)
  if (!adapted.ok) {
    return {
      ok: false,
      error: 'error' in adapted ? adapted.error : 'Import failed',
      warnings: adapted.warnings,
    }
  }
  const imported = await importSourceDocumentIntoSourceFile({
    fileId: args.fileId,
    name: adapted.document.name,
    text: adapted.document.text,
    source: { kind: 'local', path: adapted.document.name },
  })
  if (imported.ok === false) {
    return {
      ok: false,
      error: imported.error,
      warnings: adapted.warnings,
    }
  }
  return {
    ok: true,
    fileId: imported.fileId,
    name: adapted.document.name,
    warnings: adapted.warnings,
  }
}

export async function parseAndApplySourceFile(fileId: string, options?: { applyComposedGraph?: boolean }): Promise<void> {
  const before = useGraphStore.getState().sourceFiles.find(file => file.id === fileId)
  if (!before || !String(before.text || '').trim()) return
  const textHash = buildSourceFileParseIdentityHash(resolveSourceFileParseInput(before))
  const pending = pendingParseBySourceFileId.get(fileId)
  const pendingJob = pending?.textHash === textHash && pending.name === before.name && areSourceFileSourcesEqual(before.source, pending.source)
    ? pending : { promise: Promise.resolve().then(() => parseSourceFile(fileId, before)), source: before.source, name: before.name, textHash }
  // Register before loading publication: synchronous subscribers must join this exact job.
  pendingParseBySourceFileId.set(fileId, pendingJob)
  try {
    const token = await pendingJob.promise
    const latest = useGraphStore.getState().sourceFiles.find(file => file.id === fileId)
    if (options?.applyComposedGraph !== false && token !== null && parseJobBySourceFileId.get(fileId) === token
      && latest?.status === 'parsed' && latest.parsedTextHash === textHash && latest.name === before.name
      && latest.text === before.text && areSourceFileSourcesEqual(latest.source, before.source)) scheduleApplyComposedGraphFromSourceFiles()
  } finally {
    if (pendingParseBySourceFileId.get(fileId) === pendingJob) pendingParseBySourceFileId.delete(fileId)
  }
}

async function parseSourceFile(fileId: string, expected: ReturnType<typeof useGraphStore.getState>['sourceFiles'][number]): Promise<number | null> {
  const before = useGraphStore.getState().sourceFiles.find(file => file.id === fileId)
  if (!before || before.name !== expected.name || before.text !== expected.text || !areSourceFileSourcesEqual(before.source, expected.source)) return null
  const parseInput = resolveSourceFileParseInput(before)
  const text = String(before.text || '')
  if (!text.trim()) return null
  const textHash = buildSourceFileParseIdentityHash(parseInput)
  const parseJobToken = (parseJobBySourceFileId.get(fileId) || 0) + 1
  parseJobBySourceFileId.set(fileId, parseJobToken)
  if (before.parsedGraphData && before.parsedTextHash === textHash) {
    useGraphStore.getState().updateSourceFile(fileId, {
      ...buildSourceFileLifecycleState({
        status: 'parsed',
        parserId: before.parsedParserId,
        textHash: before.parsedTextHash,
        graphData: before.parsedGraphData,
        previousState: before,
        preserveExistingRevision: true,
      }),
    })
    return parseJobToken
  }

  const store = useGraphStore.getState()
  store.updateSourceFile(
    fileId,
    buildSourceFileLifecycleState({
      status: 'loading',
      previousState: before,
      preserveParsedState: true,
    }),
  )
  const result = await runImportFlow({
    nameForParse: parseInput.name,
    textForParse: text,
    applyToStore: false,
    sideEffects: false,
  })
  if (parseJobBySourceFileId.get(fileId) !== parseJobToken) return null
  const latest = useGraphStore.getState().sourceFiles.find(file => file.id === fileId)
  if (!latest || latest.name !== before.name || !areSourceFileSourcesEqual(latest.source, before.source)) return null
  if (buildSourceFileParseIdentityHash(resolveSourceFileParseInput(latest)) !== textHash) return null
  const parsedOk = !!(
    result?.graphData
    && result.parserId
    && result.counts
    && (result.counts.n > 0 || result.counts.e > 0)
  )
  if (parsedOk) {
    store.updateSourceFile(fileId, {
      ...buildSourceFileLifecycleState({
        status: 'parsed',
        parserId: result?.parserId,
        textHash,
        graphData: result?.graphData,
      }),
    })
    return parseJobToken
  }
  const message = (
    Array.isArray(result?.warnings)
    && typeof result?.warnings[0] === 'string'
    && result.warnings[0].trim()
  )
    ? result.warnings[0].trim()
    : 'Parse failed'
  store.updateSourceFile(fileId, {
    ...buildSourceFileLifecycleState({
      status: 'error',
      error: message,
      parserId: result?.parserId,
      textHash,
      graphData: undefined,
    }),
  })
  return null
}

export async function refreshPersistedSourceFilesForCurrentParseIdentity(): Promise<void> {
  const files = Array.isArray(useGraphStore.getState().sourceFiles)
    ? useGraphStore.getState().sourceFiles.slice()
    : []
  const idsToReparse: string[] = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (!file) continue
    const id = String(file.id || '').trim()
    const text = String(file.text || '')
    if (!id || !text.trim()) continue
    const nextHash = buildSourceFileParseIdentityHash(resolveSourceFileParseInput(file))
    if (String(file.parsedTextHash || '') !== nextHash) idsToReparse.push(id)
  }
  if (idsToReparse.length === 0) return
  await mapLimit(idsToReparse, SOURCE_FILES_REPARSE_CONCURRENCY, async id => {
    await parseAndApplySourceFile(id)
  })
}
