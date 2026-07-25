import React from 'react'

export type SourceFilesBootstrapPhase = 'resolving' | 'ready' | 'error'
export type SourceFilesDocumentIntentPhase = 'resolving' | 'ready' | 'error'

export type SourceFilesBootstrapSnapshot = Readonly<{
  basePhase: SourceFilesBootstrapPhase
  documentIntentKey: string | null
  documentIntentPhase: SourceFilesDocumentIntentPhase | null
  hasReachedReady: boolean
  hydrated: boolean
  phase: SourceFilesBootstrapPhase
  error: string | null
}>

export type SourceFilesBootstrapState = Readonly<{
  basePhase: SourceFilesBootstrapPhase
  baseError: string | null
  hasReachedReady: boolean
  documentIntent: Readonly<{
    key: string
    phase: SourceFilesDocumentIntentPhase
    error: string | null
  }> | null
}>

export type SourceFilesBootstrapAction =
  | Readonly<{ type: 'complete-bootstrap' }>
  | Readonly<{ type: 'fail-bootstrap'; error: unknown }>
  | Readonly<{ type: 'begin-document-intent'; key: string }>
  | Readonly<{ type: 'complete-document-intent'; key: string }>
  | Readonly<{ type: 'fail-document-intent'; key: string; error: unknown }>
  | Readonly<{ type: 'clear-document-intent'; key: string }>

const INITIAL_STATE: SourceFilesBootstrapState = Object.freeze({
  basePhase: 'resolving',
  baseError: null,
  hasReachedReady: false,
  documentIntent: null,
})

function normalizeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || fallback)
  return message.trim() || fallback
}

export function createInitialSourceFilesBootstrapState(): SourceFilesBootstrapState {
  return INITIAL_STATE
}

export function reduceSourceFilesBootstrapState(
  current: SourceFilesBootstrapState,
  action: SourceFilesBootstrapAction,
): SourceFilesBootstrapState {
  if (action.type === 'complete-bootstrap') {
    return retainSourceFilesBootstrapReady(
      current.basePhase === 'resolving'
        ? { ...current, basePhase: 'ready', baseError: null }
        : current,
    )
  }
  if (action.type === 'fail-bootstrap') {
    return retainSourceFilesBootstrapReady(
      current.basePhase === 'resolving'
        ? {
            ...current,
            basePhase: 'error',
            baseError: normalizeError(action.error, 'Canvas source initialization failed'),
          }
        : current,
    )
  }
  const normalizedKey = String(action.key || '').trim()
  if (!normalizedKey) return current
  if (action.type === 'begin-document-intent') {
    if (current.documentIntent?.key === normalizedKey && current.documentIntent.phase === 'resolving') return current
    return retainSourceFilesBootstrapReady({
      ...current,
      documentIntent: {
        key: normalizedKey,
        phase: 'resolving',
        error: null,
      },
    })
  }
  if (current.documentIntent?.key !== normalizedKey) return current
  if (action.type === 'complete-document-intent') {
    return retainSourceFilesBootstrapReady({
      ...current,
      documentIntent: { key: normalizedKey, phase: 'ready', error: null },
    })
  }
  if (action.type === 'fail-document-intent') {
    return retainSourceFilesBootstrapReady({
      ...current,
      documentIntent: {
        key: normalizedKey,
        phase: 'error',
        error: normalizeError(action.error, 'Canvas document activation failed'),
      },
    })
  }
  return retainSourceFilesBootstrapReady({ ...current, documentIntent: null })
}

export function deriveSourceFilesBootstrapSnapshot(state: SourceFilesBootstrapState): SourceFilesBootstrapSnapshot {
  const hydrated = state.basePhase === 'ready'
  const documentIntent = state.documentIntent
  const phase = state.basePhase === 'error'
    ? 'error'
    : state.basePhase !== 'ready' || documentIntent?.phase === 'resolving'
      ? 'resolving'
      : documentIntent?.phase === 'error'
        ? 'error'
        : 'ready'
  return Object.freeze({
    basePhase: state.basePhase,
    documentIntentKey: documentIntent?.key || null,
    documentIntentPhase: documentIntent?.phase || null,
    hasReachedReady: state.hasReachedReady || phase === 'ready',
    hydrated,
    phase,
    error: state.baseError || documentIntent?.error || null,
  })
}

function retainSourceFilesBootstrapReady(
  current: SourceFilesBootstrapState,
): SourceFilesBootstrapState {
  if (current.hasReachedReady || deriveSourceFilesBootstrapSnapshot(current).phase !== 'ready') return current
  return { ...current, hasReachedReady: true }
}

const INITIAL_SNAPSHOT = deriveSourceFilesBootstrapSnapshot(INITIAL_STATE)
const SourceFilesDocumentIntentContext = React.createContext<string>('')
let state = INITIAL_STATE
let snapshot = INITIAL_SNAPSHOT
const listeners = new Set<() => void>()

function publishSourceFilesBootstrapState(next: SourceFilesBootstrapState): void {
  if (state === next) return
  state = Object.freeze(next)
  snapshot = deriveSourceFilesBootstrapSnapshot(state)
  for (const listener of listeners) listener()
}

export function completeSourceFilesBootstrap(): void {
  publishSourceFilesBootstrapState(reduceSourceFilesBootstrapState(state, { type: 'complete-bootstrap' }))
}

export function failSourceFilesBootstrap(error: unknown): void {
  publishSourceFilesBootstrapState(reduceSourceFilesBootstrapState(state, { type: 'fail-bootstrap', error }))
}

export function beginSourceFilesDocumentIntent(key: string): void {
  publishSourceFilesBootstrapState(reduceSourceFilesBootstrapState(state, { type: 'begin-document-intent', key }))
}

export function completeSourceFilesDocumentIntent(key: string): void {
  publishSourceFilesBootstrapState(reduceSourceFilesBootstrapState(state, { type: 'complete-document-intent', key }))
}

export function failSourceFilesDocumentIntent(key: string, error: unknown): void {
  publishSourceFilesBootstrapState(reduceSourceFilesBootstrapState(state, { type: 'fail-document-intent', key, error }))
}

export function clearSourceFilesDocumentIntent(key: string): void {
  publishSourceFilesBootstrapState(reduceSourceFilesBootstrapState(state, { type: 'clear-document-intent', key }))
}

export function readSourceFilesBootstrapSnapshot(): SourceFilesBootstrapSnapshot {
  return snapshot
}

export function readSourceFilesBootstrapReady(): boolean {
  return snapshot.phase === 'ready'
}

export function subscribeSourceFilesBootstrapReady(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function projectSourceFilesBootstrapSnapshotForIntent(
  current: SourceFilesBootstrapSnapshot,
  expectedDocumentIntentKey: string,
): SourceFilesBootstrapSnapshot {
  const normalizedKey = String(expectedDocumentIntentKey || '').trim()
  if (!normalizedKey || current.documentIntentKey === normalizedKey || current.basePhase === 'error') return current
  return Object.freeze({
    ...current,
    documentIntentKey: normalizedKey,
    documentIntentPhase: 'resolving',
    phase: 'resolving',
    error: null,
  })
}

export function SourceFilesDocumentIntentProvider(props: {
  children: React.ReactNode
  intentKey: string
}): React.ReactElement {
  return React.createElement(
    SourceFilesDocumentIntentContext.Provider,
    { value: String(props.intentKey || '').trim() },
    props.children,
  )
}

export function useSourceFilesBootstrapSnapshot(): SourceFilesBootstrapSnapshot {
  const expectedDocumentIntentKey = React.useContext(SourceFilesDocumentIntentContext)
  const current = React.useSyncExternalStore(
    subscribeSourceFilesBootstrapReady,
    readSourceFilesBootstrapSnapshot,
    () => INITIAL_SNAPSHOT,
  )
  return React.useMemo(
    () => projectSourceFilesBootstrapSnapshotForIntent(current, expectedDocumentIntentKey),
    [current, expectedDocumentIntentKey],
  )
}

export function useSourceFilesBootstrapHydrated(): boolean {
  return useSourceFilesBootstrapSnapshot().basePhase === 'ready'
}

export function useSourceFilesBootstrapReady(): boolean {
  return useSourceFilesBootstrapSnapshot().phase === 'ready'
}

export function useSourceFilesBootstrapHasReachedReady(): boolean {
  return useSourceFilesBootstrapSnapshot().hasReachedReady
}
