import {
  mergeDecisionsIntoKgcMarkdown,
  normalizeDecisionBatch,
} from '../../../../ecs/decisionDocument.js'
import {
  ECS_DECISION_NODE_TYPE,
  normalizeDecisionNode,
  readKgcNodeState,
} from '../../../../ecs/kgcNodeContract.js'
import { ensureWorkspaceFolderTreeIfMissing } from './ensureFolderTreeIfMissing'
import {
  normalizeWorkspacePath,
  splitWorkspacePath,
  workspaceBasename,
} from './path'
import type { WorkspaceFs, WorkspacePath } from './types'
import { upsertWorkspaceTextDocument } from './upsertWorkspaceTextDocument'
import { getWorkspaceFs } from './workspaceFs'

export type WorkspaceDecisionRecord = Readonly<{
  decisionId: string
  decisionType: string
  entityRef: string
  payload: Readonly<Record<string, unknown>>
  producedAt: string
}>

export type WorkspaceDecisionStoreSnapshot = Readonly<{
  status: 'idle' | 'saving' | 'saved' | 'error'
  errorKind: 'load' | 'write' | null
  hydrationBlocked: boolean
  retainedCount: number
  savedCount: number
  error: string | null
  revision: number
}>

export type WorkspaceDecisionStoreOptions = Readonly<{
  workspace?: WorkspaceFs
  signal?: AbortSignal
}>

export type WorkspaceDecisionStore<TDecision extends WorkspaceDecisionRecord> = Readonly<{
  savePath: WorkspacePath
  emptyDocument: string
  read: () => WorkspaceDecisionStoreSnapshot
  subscribe: (listener: () => void) => () => void
  reportLoadFailure: (error: unknown) => WorkspaceDecisionStoreSnapshot
  queue: (decisions: readonly TDecision[]) => void
  load: (options?: WorkspaceDecisionStoreOptions) => Promise<TDecision[]>
  reset: (options?: WorkspaceDecisionStoreOptions) => Promise<WorkspaceDecisionStoreSnapshot>
  persistPending: (options?: WorkspaceDecisionStoreOptions) => Promise<WorkspaceDecisionStoreSnapshot>
  resetForTests: () => void
}>

export type WorkspaceDecisionStoreConfig<TDecision extends WorkspaceDecisionRecord> = Readonly<{
  savePath: WorkspacePath
  title: string
  body: string
  validateDecisions: (decisions: readonly TDecision[]) => void
  validatePendingDecisions?: (decisions: readonly TDecision[]) => void
}>

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error || 'Decision save failed')
}

class WorkspaceDecisionDocumentError extends Error {
  constructor(savePath: WorkspacePath) {
    super(`Unreadable ${savePath}: local Decision document is invalid.`)
    this.name = 'WorkspaceDecisionDocumentError'
  }
}

function createDecisionLoadError(
  savePath: WorkspacePath,
): WorkspaceDecisionDocumentError {
  return new WorkspaceDecisionDocumentError(savePath)
}

function operationAbortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error('Workspace Decision operation was aborted')
}

function throwIfOperationAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw operationAbortError(signal)
}

function createEmptyDecisionDocument(title: string, body: string): string {
  const normalizedTitle = title.trim()
  const normalizedBody = body.replace(/\r\n?/g, '\n').trim()
  if (!normalizedTitle) throw new Error('Workspace Decision save title is required')
  if (!normalizedBody) throw new Error('Workspace Decision save body is required')
  return [
    '---',
    `title: ${JSON.stringify(normalizedTitle)}`,
    'schema: "kgc-computing-flow/v1"',
    'flow:',
    '  nodes: []',
    '  edges: []',
    '---',
    '',
    normalizedBody,
    '',
  ].join('\n')
}

function resolveSaveLocation(savePath: WorkspacePath): Readonly<{
  folderPath: WorkspacePath
  fileName: string
}> {
  const segments = splitWorkspacePath(savePath)
  const fileName = workspaceBasename(savePath)
  if (!fileName) throw new Error('Workspace Decision save path must name a file')
  const folderPath = segments.length > 1
    ? normalizeWorkspacePath(`/${segments.slice(0, -1).join('/')}`)
    : normalizeWorkspacePath('/')
  return Object.freeze({ folderPath, fileName })
}

export function createWorkspaceDecisionStore<TDecision extends WorkspaceDecisionRecord>(
  config: WorkspaceDecisionStoreConfig<TDecision>,
): WorkspaceDecisionStore<TDecision> {
  const savePath = normalizeWorkspacePath(config.savePath)
  const { folderPath, fileName } = resolveSaveLocation(savePath)
  const emptyDocument = createEmptyDecisionDocument(config.title, config.body)
  const listeners = new Set<() => void>()
  const pending = new Map<string, TDecision>()
  let mutationQueue: Promise<WorkspaceDecisionStoreSnapshot> | null = null
  let snapshot: WorkspaceDecisionStoreSnapshot = Object.freeze({
    status: 'idle',
    errorKind: null,
    hydrationBlocked: false,
    retainedCount: 0,
    savedCount: 0,
    error: null,
    revision: 0,
  })

  function notifyListeners(): void {
    for (const listener of [...listeners]) listener()
  }

  function publish(patch: Partial<WorkspaceDecisionStoreSnapshot>): WorkspaceDecisionStoreSnapshot {
    snapshot = Object.freeze({
      ...snapshot,
      ...patch,
      retainedCount: pending.size,
      revision: snapshot.revision + 1,
    })
    notifyListeners()
    return snapshot
  }

  function read(): WorkspaceDecisionStoreSnapshot {
    return snapshot
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function reportLoadFailure(_error: unknown): WorkspaceDecisionStoreSnapshot {
    return publish({
      status: 'error',
      errorKind: 'load',
      hydrationBlocked: true,
      error: createDecisionLoadError(savePath).message,
    })
  }

  function queue(decisions: readonly TDecision[]): void {
    const normalized = normalizeDecisionBatch([...decisions]) as TDecision[]
    config.validatePendingDecisions?.(normalized)
    for (const decision of normalized) pending.set(decision.decisionId, decision)
    if (snapshot.hydrationBlocked || snapshot.status === 'error') {
      publish({})
      return
    }
    publish({
      status: pending.size > 0 ? 'idle' : snapshot.status,
      errorKind: null,
      error: null,
    })
  }

  function readValidatedDecisionDocument(text: string): TDecision[] {
    try {
      const { nodes } = readKgcNodeState(text)
      const decisions: TDecision[] = []
      nodes.forEach((node: unknown, index: number) => {
        if ((node as { type?: unknown } | null)?.type !== ECS_DECISION_NODE_TYPE) return
        decisions.push(normalizeDecisionNode(node, index) as TDecision)
      })
      const normalized = normalizeDecisionBatch(decisions) as TDecision[]
      config.validateDecisions(normalized)
      return normalized
    } catch {
      throw createDecisionLoadError(savePath)
    }
  }

  async function load(options: WorkspaceDecisionStoreOptions = {}): Promise<TDecision[]> {
    try {
      throwIfOperationAborted(options.signal)
      const workspace = options.workspace ?? await getWorkspaceFs()
      throwIfOperationAborted(options.signal)
      const text = await workspace.readFileText(savePath)
      throwIfOperationAborted(options.signal)
      if (text == null) return []
      const normalizedDecisions = readValidatedDecisionDocument(text)
      throwIfOperationAborted(options.signal)
      if (!snapshot.hydrationBlocked) {
        const preserveRetainedWriteFailure = pending.size > 0
          && snapshot.status === 'error'
          && snapshot.errorKind === 'write'
        const preserveSavedStatus = snapshot.status === 'saved'
          && snapshot.errorKind === null
        publish(preserveRetainedWriteFailure || preserveSavedStatus
          ? { savedCount: normalizedDecisions.length }
          : {
              status: 'idle',
              errorKind: null,
              savedCount: normalizedDecisions.length,
              error: null,
            })
      }
      return normalizedDecisions
    } catch (error) {
      if (options.signal?.aborted) throw operationAbortError(options.signal)
      const loadError = createDecisionLoadError(savePath)
      reportLoadFailure(loadError)
      throw loadError
    }
  }

  async function restoreWorkspaceText(
    workspace: WorkspaceFs,
    previousText: string | null,
  ): Promise<void> {
    const currentText = await workspace.readFileText(savePath)
    if (currentText !== previousText) {
      if (previousText == null) {
        if (currentText != null) await workspace.deleteEntry(savePath)
      } else {
        await upsertWorkspaceTextDocument({
          fs: workspace,
          parentPath: folderPath,
          name: fileName,
          text: previousText,
        })
      }
    }
    const restoredText = await workspace.readFileText(savePath)
    if (restoredText !== previousText) {
      throw new Error('Decision save rollback read-back mismatch')
    }
  }

  async function resetLocalSave(
    workspaceOverride?: WorkspaceFs,
    signal?: AbortSignal,
  ): Promise<WorkspaceDecisionStoreSnapshot> {
    let workspace: WorkspaceFs | null = null
    let previousText: string | null = null
    let previousTextKnown = false
    try {
      throwIfOperationAborted(signal)
      workspace = workspaceOverride ?? await getWorkspaceFs()
      throwIfOperationAborted(signal)
      previousText = await workspace.readFileText(savePath)
      previousTextKnown = true
      throwIfOperationAborted(signal)
      await ensureWorkspaceFolderTreeIfMissing({ fs: workspace, folderPath })
      throwIfOperationAborted(signal)
      await upsertWorkspaceTextDocument({
        fs: workspace,
        parentPath: folderPath,
        name: fileName,
        text: emptyDocument,
      })
      throwIfOperationAborted(signal)
      const readBack = await workspace.readFileText(savePath)
      throwIfOperationAborted(signal)
      if (readBack !== emptyDocument) throw new Error('Reset save read-back mismatch')
      pending.clear()
      return publish({
        status: 'saved',
        errorKind: null,
        hydrationBlocked: false,
        savedCount: 0,
        error: null,
      })
    } catch (error) {
      if (signal?.aborted) {
        if (workspace && previousTextKnown) {
          await restoreWorkspaceText(workspace, previousText)
        }
        throw operationAbortError(signal)
      }
      return publish({
        status: 'error',
        errorKind: snapshot.hydrationBlocked ? 'load' : 'write',
        error: errorMessage(error),
      })
    }
  }

  function enqueueDecisionMutation(
    mutation: () => Promise<WorkspaceDecisionStoreSnapshot>,
  ): Promise<WorkspaceDecisionStoreSnapshot> {
    mutationQueue = (mutationQueue ?? Promise.resolve(snapshot))
      .catch(() => snapshot)
      .then(mutation)
    return mutationQueue
  }

  function reset(options: WorkspaceDecisionStoreOptions = {}): Promise<WorkspaceDecisionStoreSnapshot> {
    return enqueueDecisionMutation(() => resetLocalSave(options.workspace, options.signal))
  }

  async function persistPending(
    options: WorkspaceDecisionStoreOptions = {},
  ): Promise<WorkspaceDecisionStoreSnapshot> {
    throwIfOperationAborted(options.signal)
    if (snapshot.hydrationBlocked) return publish({})
    if (pending.size === 0) {
      throwIfOperationAborted(options.signal)
      return publish({
        status: 'saved',
        errorKind: null,
        savedCount: snapshot.savedCount,
        error: null,
      })
    }
    const snapshotBeforeSaving = snapshot
    const restoreSnapshotOnAbort = () => {
      snapshot = snapshotBeforeSaving
      notifyListeners()
    }
    options.signal?.addEventListener('abort', restoreSnapshotOnAbort, { once: true })
    publish({ status: 'saving', errorKind: null, error: null })
    const batch = [...pending.values()]
    let workspace: WorkspaceFs | null = null
    let previousText: string | null = null
    let previousTextKnown = false
    try {
      config.validatePendingDecisions?.(batch)
      throwIfOperationAborted(options.signal)
      workspace = options.workspace ?? await getWorkspaceFs()
      throwIfOperationAborted(options.signal)
      previousText = await workspace.readFileText(savePath)
      previousTextKnown = true
      throwIfOperationAborted(options.signal)
      const current = previousText ?? emptyDocument
      readValidatedDecisionDocument(current)
      const merged = mergeDecisionsIntoKgcMarkdown(current, batch)
      await ensureWorkspaceFolderTreeIfMissing({ fs: workspace, folderPath })
      throwIfOperationAborted(options.signal)
      await upsertWorkspaceTextDocument({
        fs: workspace,
        parentPath: folderPath,
        name: fileName,
        text: merged.markdown,
      })
      throwIfOperationAborted(options.signal)
      const readBack = await workspace.readFileText(savePath)
      throwIfOperationAborted(options.signal)
      if (readBack == null) throw new Error('Decision save read-back was empty')
      const readBackDecisions = readValidatedDecisionDocument(readBack)
      const verification = mergeDecisionsIntoKgcMarkdown(readBack, batch)
      if (verification.persistedCount !== 0 || verification.idempotentCount !== batch.length) {
        throw new Error('Decision save read-back did not contain every pending Decision')
      }
      const savedCount = readBackDecisions.length
      throwIfOperationAborted(options.signal)
      for (const decision of batch) pending.delete(decision.decisionId)
      return publish({
        status: 'saved',
        errorKind: null,
        savedCount,
        error: null,
      })
    } catch (error) {
      const documentInvalid = error instanceof WorkspaceDecisionDocumentError
      let rollbackError: unknown = null
      if (workspace && previousTextKnown) {
        try {
          await restoreWorkspaceText(workspace, previousText)
        } catch (caughtRollbackError) {
          rollbackError = caughtRollbackError
        }
      }
      if (options.signal?.aborted) {
        if (rollbackError) {
          throw new Error(
            `${errorMessage(operationAbortError(options.signal))}; rollback failed: ${errorMessage(rollbackError)}`,
          )
        }
        throw operationAbortError(options.signal)
      }
      if (documentInvalid) {
        return publish({
          status: 'error',
          errorKind: 'load',
          hydrationBlocked: true,
          error: createDecisionLoadError(savePath).message,
        })
      }
      if (rollbackError) {
        return publish({
          status: 'error',
          errorKind: 'write',
          error: `${errorMessage(error)}; rollback failed: ${errorMessage(rollbackError)}`,
        })
      }
      return publish({
        status: 'error',
        errorKind: 'write',
        error: errorMessage(error),
      })
    } finally {
      options.signal?.removeEventListener('abort', restoreSnapshotOnAbort)
    }
  }

  function persist(
    options: WorkspaceDecisionStoreOptions = {},
  ): Promise<WorkspaceDecisionStoreSnapshot> {
    return enqueueDecisionMutation(() => persistPending(options))
  }

  function resetForTests(): void {
    pending.clear()
    mutationQueue = null
    snapshot = Object.freeze({
      status: 'idle',
      errorKind: null,
      hydrationBlocked: false,
      retainedCount: 0,
      savedCount: 0,
      error: null,
      revision: snapshot.revision + 1,
    })
    for (const listener of [...listeners]) listener()
  }

  return Object.freeze({
    savePath,
    emptyDocument,
    read,
    subscribe,
    reportLoadFailure,
    queue,
    load,
    reset,
    persistPending: persist,
    resetForTests,
  })
}
