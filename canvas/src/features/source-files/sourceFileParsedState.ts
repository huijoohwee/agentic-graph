import type { GraphData } from '@/lib/graph/types'
import type { SourceFile } from '@/hooks/store/types'
import { matchesMarkdownDocumentPath } from 'grph-shared/markdown/documentPath'
import {
  incrementParsedGraphRevision,
  resolveParsedGraphRevision,
} from '@/features/source-files/sourceFileParsedGraphRevision'

type SourceFileParsedStateLike = {
  parsedParserId?: unknown
  parsedTextHash?: unknown
  parsedGraphRevision?: unknown
  parsedGraphData?: unknown
}

type SourceFileLifecycleStateLike = SourceFileParsedStateLike & {
  status?: unknown
  error?: unknown
}

export type SourceFileLifecycleStatus = 'idle' | 'loading' | 'parsed' | 'error'

export type NormalizedSourceFileParsedState = {
  parsedParserId?: string
  parsedTextHash?: string
  parsedGraphRevision?: number
  parsedGraphData?: GraphData
}

export type SourceFileParsedStatePatch = {
  parsedParserId?: string
  parsedTextHash?: string
  parsedGraphRevision?: number
  parsedGraphData?: GraphData
}

export type SourceFileLifecycleStatePatch = SourceFileParsedStatePatch & {
  status: SourceFileLifecycleStatus
  error?: string
}

export type PersistedSourceFileParsedState = Pick<NormalizedSourceFileParsedState, 'parsedParserId' | 'parsedTextHash'>

type SourceFileRecordArgs = {
  id: string
  name: string
  text?: unknown
  enabled: boolean
  geoLayerEnabled?: boolean
  source?: SourceFile['source']
  status?: SourceFileLifecycleStatus
  error?: unknown
  parserId?: unknown
  textHash?: unknown
  graphData?: unknown
  previousState?: SourceFileLifecycleStateLike | null
  preserveExistingRevision?: boolean
  preserveParsedState?: boolean
}

type SourceFileLike = Partial<SourceFile> | null | undefined
type SourceFileComparableLike = SourceFileParsedStateLike & {
  id?: unknown
  name?: unknown
  text?: unknown
  enabled?: unknown
  geoLayerEnabled?: unknown
  status?: unknown
  error?: unknown
  source?: SourceFile['source']
}

function normalizeParsedParserId(value: unknown): string | undefined {
  const next = String(value || '').trim()
  return next || undefined
}

function normalizeParsedTextHash(value: unknown): string | undefined {
  const next = String(value || '').trim()
  return next || undefined
}

function normalizeParsedGraphData(value: unknown): GraphData | undefined {
  return value && typeof value === 'object' ? (value as GraphData) : undefined
}

function normalizeSourceFileError(value: unknown): string | undefined {
  const next = String(value || '').trim()
  return next || undefined
}

function normalizeSourceFileOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeSourceFileStatus(value: unknown): SourceFileLifecycleStatus {
  const next = String(value || '').trim()
  return next === 'loading' || next === 'parsed' || next === 'error' ? next : 'idle'
}

function normalizeSourceFileSource(
  value: SourceFile['source'] | undefined,
  fallbackName: string,
): SourceFile['source'] | undefined {
  if (!value || typeof value !== 'object') return undefined
  const kind = String(value.kind || '').trim()
  if (kind === 'url') {
    const url = String(value.url || '').trim()
    const path = String(value.path || '').trim()
    return {
      kind: 'url',
      ...(url ? { url } : {}),
      ...(path ? { path } : {}),
    }
  }
  if (kind !== 'local') return undefined
  const path = String(value.path || '').trim() || fallbackName
  return path ? { kind: 'local', path } : undefined
}

export function areSourceFileSourcesEqual(
  left: SourceFile['source'] | undefined,
  right: SourceFile['source'] | undefined,
): boolean {
  if (!left && !right) return true
  if (!left || !right) return false
  return (
    left.kind === right.kind &&
    String(left.path || '') === String(right.path || '') &&
    String(left.url || '') === String(right.url || '')
  )
}

export function sameMaterializationSourceIdentities(left: SourceFile[], right: SourceFile[]): boolean {
  return left.length === right.length && left.every((file, index) => {
    const next = right[index]
    return next && file.id === next.id && file.name === next.name && file.text === next.text
      && file.enabled === next.enabled && file.geoLayerEnabled === next.geoLayerEnabled && areSourceFileSourcesEqual(file.source, next.source)
  })
}

type MaterializationDocument = { markdownDocumentName?: string | null; markdownDocumentText?: string | null }
export function hasMaterializationDocumentDrifted(activePath: string | null, before: MaterializationDocument, current: MaterializationDocument, sourceText?: string): boolean {
  const changed = current.markdownDocumentName !== before.markdownDocumentName || current.markdownDocumentText !== before.markdownDocumentText
  // A native editor can publish this exact requested document while async source work is pending.
  const converged = !!activePath && !!current.markdownDocumentName && typeof sourceText === 'string'
    && matchesMarkdownDocumentPath(activePath, current.markdownDocumentName) && current.markdownDocumentText === sourceText
  return changed && !converged
}

export function canSkipActiveWorkspaceSourceFilesRematerialization(args: { sourceFiles: SourceFile[]; activeSourcePath: string }): boolean {
  const list = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  if (!args.activeSourcePath || list.length === 0) return false
  for (const file of list) {
    if (file && String(file.source?.path || '') === args.activeSourcePath) return file.enabled === true && String(file.text || '').trim().length > 0
  }
  return false
}

type MaterializationSourceSnapshot = MaterializationDocument & { sourceFiles: SourceFile[] }
/** Only the cold graph bootstrap may adopt an inventory published by the same active editor. */
export function readColdStartMaterializationSource(args: {
  applyToGraph?: boolean; activePath: string | null; activeSourcePath: string
  initial: MaterializationSourceSnapshot; before: MaterializationSourceSnapshot; current: MaterializationSourceSnapshot
  requestedSourceFiles: SourceFile[]; preparedSourceFiles?: SourceFile[]
}): SourceFile | null {
  const { initial, before, current, activePath, activeSourcePath } = args
  if (args.applyToGraph !== true || !activePath || args.requestedSourceFiles.length
    || [initial, before].some(state => state.sourceFiles.length || state.markdownDocumentName !== current.markdownDocumentName
      || state.markdownDocumentText !== current.markdownDocumentText)
    || !String(current.markdownDocumentName || '').trim() || !matchesMarkdownDocumentPath(activePath, current.markdownDocumentName)) return null
  const active = current.sourceFiles.filter(file => file.source?.path === activeSourcePath)
  const prepared = (args.preparedSourceFiles || []).filter(file => file.source?.path === activeSourcePath)
  if (active.length !== 1 || prepared.length !== 1 || active[0]!.enabled !== true || !active[0]!.id.trim() || !active[0]!.name.trim()
    || current.sourceFiles.filter(file => file.id === active[0]!.id).length !== 1
    || args.preparedSourceFiles!.filter(file => file.id === active[0]!.id).length !== 1
    || active[0]!.text !== current.markdownDocumentText || !sameMaterializationSourceIdentities(active, prepared)) return null
  return active[0]!
}

export function hasExpectedMaterializationSourceText(sourceFiles: SourceFile[], activeSourcePath: string, expectedText: string | undefined): boolean {
  if (expectedText === undefined) return true
  const active = sourceFiles.filter(file => file.source?.path === activeSourcePath)
  return active.length === 1 && active[0]!.text === expectedText
}

export function areSourceFileRecordsEqual(
  left: SourceFileComparableLike | null | undefined,
  right: SourceFileComparableLike | null | undefined,
  args?: { includeGraphData?: boolean; includeGraphRevision?: boolean },
): boolean {
  if (left === right) return true
  if (String(left?.id || '') !== String(right?.id || '')) return false
  if (String(left?.name || '') !== String(right?.name || '')) return false
  if (String(left?.text || '') !== String(right?.text || '')) return false
  if (!!left?.enabled !== !!right?.enabled) return false
  if (normalizeSourceFileOptionalBoolean(left?.geoLayerEnabled) !== normalizeSourceFileOptionalBoolean(right?.geoLayerEnabled)) return false
  if (String(left?.status || '') !== String(right?.status || '')) return false
  if (String(left?.error || '') !== String(right?.error || '')) return false
  if (!areSourceFileParsedStatesEqual(left, right, args)) return false
  if (!areSourceFileSourcesEqual(left?.source, right?.source)) return false
  return true
}

export function readSourceFileParsedState(
  value: SourceFileParsedStateLike | null | undefined,
): NormalizedSourceFileParsedState {
  return {
    parsedParserId: normalizeParsedParserId(value?.parsedParserId),
    parsedTextHash: normalizeParsedTextHash(value?.parsedTextHash),
    parsedGraphRevision: resolveParsedGraphRevision({
      parsedGraphData: value?.parsedGraphData,
      previousRevision: value?.parsedGraphRevision,
      preserveExisting: true,
    }),
    parsedGraphData: normalizeParsedGraphData(value?.parsedGraphData),
  }
}

export function readPersistedSourceFileParsedState(
  value: SourceFileParsedStateLike | null | undefined,
): PersistedSourceFileParsedState {
  const normalized = readSourceFileParsedState(value)
  return {
    parsedParserId: normalized.parsedParserId,
    parsedTextHash: normalized.parsedTextHash,
  }
}

export function areSourceFileParsedStatesEqual(
  left: SourceFileParsedStateLike | null | undefined,
  right: SourceFileParsedStateLike | null | undefined,
  args?: { includeGraphData?: boolean; includeGraphRevision?: boolean },
): boolean {
  const aa = readSourceFileParsedState(left)
  const bb = readSourceFileParsedState(right)
  if (aa.parsedParserId !== bb.parsedParserId) return false
  if (aa.parsedTextHash !== bb.parsedTextHash) return false
  if (args?.includeGraphRevision !== false && aa.parsedGraphRevision !== bb.parsedGraphRevision) return false
  if (args?.includeGraphData !== false && aa.parsedGraphData !== bb.parsedGraphData) return false
  return true
}

export function buildSourceFileParsedState(args: {
  parserId?: unknown
  textHash?: unknown
  graphData?: unknown
  previousParsedState?: SourceFileParsedStateLike | null
  preserveExistingRevision?: boolean
} = {}): SourceFileParsedStatePatch {
  const graphData = normalizeParsedGraphData(args.graphData)
  return {
    parsedParserId: normalizeParsedParserId(args.parserId),
    parsedTextHash: normalizeParsedTextHash(args.textHash),
    parsedGraphRevision: resolveParsedGraphRevision({
      parsedGraphData: graphData,
      previousRevision: args.previousParsedState?.parsedGraphRevision,
      preserveExisting: args.preserveExistingRevision,
    }),
    parsedGraphData: graphData,
  }
}

export function buildUpdatedSourceFileParsedGraphState(args: {
  previousParsedState?: SourceFileParsedStateLike | null
  graphData?: unknown
}): SourceFileParsedStatePatch {
  const graphData = normalizeParsedGraphData(args.graphData)
  if (!graphData) return buildSourceFileParsedState()
  return {
    parsedParserId: normalizeParsedParserId(args.previousParsedState?.parsedParserId),
    parsedTextHash: normalizeParsedTextHash(args.previousParsedState?.parsedTextHash),
    parsedGraphRevision: incrementParsedGraphRevision(args.previousParsedState?.parsedGraphRevision),
    parsedGraphData: graphData,
  }
}

export function buildSourceFileLifecycleState(args: {
  status: SourceFileLifecycleStatus
  error?: unknown
  parserId?: unknown
  textHash?: unknown
  graphData?: unknown
  previousState?: SourceFileLifecycleStateLike | null
  preserveExistingRevision?: boolean
  preserveParsedState?: boolean
}): SourceFileLifecycleStatePatch {
  const parsedState = args.preserveParsedState
    ? readSourceFileParsedState(args.previousState)
    : buildSourceFileParsedState({
        parserId: args.parserId,
        textHash: args.textHash,
        graphData: args.graphData,
        previousParsedState: args.previousState,
        preserveExistingRevision: args.preserveExistingRevision,
      })
  return {
    status: args.status,
    error: args.status === 'error' ? normalizeSourceFileError(args.error) : undefined,
    ...parsedState,
  }
}

export function buildSourceFileRecord(args: SourceFileRecordArgs): SourceFile {
  const lifecycleState = buildSourceFileLifecycleState({
    status: args.status || 'idle',
    error: args.error,
    parserId: args.parserId,
    textHash: args.textHash,
    graphData: args.graphData,
    previousState: args.previousState,
    preserveExistingRevision: args.preserveExistingRevision,
    preserveParsedState: args.preserveParsedState,
  })
  return {
    id: args.id,
    name: String(args.name || '').trim(),
    text: String(args.text || ''),
    enabled: !!args.enabled,
    ...(typeof args.geoLayerEnabled === 'boolean' ? { geoLayerEnabled: args.geoLayerEnabled } : {}),
    ...lifecycleState,
    ...(args.source ? { source: args.source } : {}),
  }
}

export function normalizeSourceFileRecord(value: SourceFileLike): SourceFile {
  const current = (value && typeof value === 'object' ? value : {}) as Partial<SourceFile>
  const name = String(current.name || '').trim()
  const source = normalizeSourceFileSource(current.source, name)
  const next: SourceFile = {
    id: String(current.id || '').trim(),
    name,
    text: String(current.text || ''),
    enabled: !!current.enabled,
    ...(typeof current.geoLayerEnabled === 'boolean' ? { geoLayerEnabled: current.geoLayerEnabled } : {}),
    ...buildSourceFileLifecycleState({
      status: normalizeSourceFileStatus(current.status),
      error: current.error,
      parserId: current.parsedParserId,
      textHash: current.parsedTextHash,
      graphData: current.parsedGraphData,
      previousState: current,
      preserveExistingRevision: true,
    }),
    ...(source ? { source } : {}),
  }
  if (
    current &&
    typeof current === 'object' &&
    current.id === next.id &&
    current.name === next.name &&
    current.text === next.text &&
    current.enabled === next.enabled &&
    current.geoLayerEnabled === next.geoLayerEnabled &&
    current.status === next.status &&
    current.error === next.error &&
    current.parsedParserId === next.parsedParserId &&
    current.parsedTextHash === next.parsedTextHash &&
    current.parsedGraphRevision === next.parsedGraphRevision &&
    current.parsedGraphData === next.parsedGraphData &&
    areSourceFileSourcesEqual(current.source, next.source)
  ) {
    return current as SourceFile
  }
  return next
}

export function normalizeSourceFiles(value: unknown): SourceFile[] {
  const items = Array.isArray(value) ? value : []
  let changed = !Array.isArray(value)
  const next = items.map((entry, index) => {
    const normalized = normalizeSourceFileRecord(entry as SourceFileLike)
    if (normalized !== items[index]) changed = true
    return normalized
  })
  return changed ? next : (items as SourceFile[])
}

export function readPersistedSourceFileRecord(value: SourceFileLike): SourceFile {
  const normalized = normalizeSourceFileRecord(value)
  const persistedParsedState = readPersistedSourceFileParsedState(normalized)
  const source =
    normalized.source?.kind === 'local'
      ? ({ kind: 'local', path: String(normalized.source.path || '').trim() || normalized.name } satisfies SourceFile['source'])
      : normalized.source?.kind === 'url'
      ? ({
          kind: 'url',
          ...(String(normalized.source.url || '').trim() ? { url: String(normalized.source.url || '').trim() } : {}),
          ...(String(normalized.source.path || '').trim() ? { path: String(normalized.source.path || '').trim() } : {}),
        } satisfies SourceFile['source'])
      : undefined
  return {
    id: String(normalized.id || ''),
    name: String(normalized.name || ''),
    text: String(normalized.text || ''),
    enabled: !!normalized.enabled,
    ...(typeof normalized.geoLayerEnabled === 'boolean' ? { geoLayerEnabled: normalized.geoLayerEnabled } : {}),
    status: normalized.status === 'parsed' || normalized.status === 'error' ? normalized.status : 'idle',
    error: normalizeSourceFileError(normalized.error),
    ...persistedParsedState,
    ...(source ? { source } : {}),
  }
}
