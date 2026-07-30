export type WorkspaceSeedSyncRuntimeSnapshot = Readonly<{
  activeTaskCount: number
  suspensionCount: number
}>

declare const workspaceSeedSyncTaskContextBrand: unique symbol

export type WorkspaceSeedSyncTaskContext = Readonly<{
  signal: AbortSignal
  [workspaceSeedSyncTaskContextBrand]: true
}>

type IdleWaiter = {
  reject: (error: unknown) => void
  resolve: () => void
  signal?: AbortSignal
  stopListeningForAbort?: () => void
}

type ResumeWaiter = {
  reject: (error: unknown) => void
  resolve: () => void
  stopListeningForAbort?: () => void
}

type WorkspaceSeedSyncTaskContextState = {
  controller: AbortController
  expectedGeneration: number
  open: boolean
  stopListeningForAbort?: () => void
}

const activeTasks = new Set<symbol>()
const suspensions = new Set<symbol>()
const idleWaiters = new Set<IdleWaiter>()
const resumeWaiters = new Set<ResumeWaiter>()
const resumedListeners = new Set<() => void>()
const taskContextStates = new WeakMap<object, WorkspaceSeedSyncTaskContextState>()
let runtimeGeneration = 0

function runtimeResetError(): Error {
  return new Error('Workspace seed sync runtime was reset')
}

function throwIfWorkspaceSeedSyncRuntimeReset(expectedGeneration: number): void {
  if (expectedGeneration !== runtimeGeneration) throw runtimeResetError()
}

function operationAbortedError(signal: AbortSignal): unknown {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Workspace seed sync operation was aborted')
}

function closedTaskContextError(): Error {
  return new Error('Workspace seed sync task context is closed')
}

function createWorkspaceSeedSyncTaskContext(
  expectedGeneration: number,
  signal?: AbortSignal,
): WorkspaceSeedSyncTaskContext {
  const controller = new AbortController()
  const context = Object.freeze({
    signal: controller.signal,
  }) as WorkspaceSeedSyncTaskContext
  const state: WorkspaceSeedSyncTaskContextState = {
    controller,
    expectedGeneration,
    open: true,
  }
  const handleAbort = () => {
    if (!controller.signal.aborted) controller.abort(operationAbortedError(signal!))
  }
  if (signal?.aborted) {
    handleAbort()
  } else if (signal) {
    signal.addEventListener('abort', handleAbort, { once: true })
    state.stopListeningForAbort = () => signal.removeEventListener('abort', handleAbort)
  }
  taskContextStates.set(context, state)
  return context
}

function readWorkspaceSeedSyncTaskContextState(
  context: WorkspaceSeedSyncTaskContext,
): WorkspaceSeedSyncTaskContextState {
  if (!context || typeof context !== 'object') {
    throw new Error('Workspace seed sync task context is foreign')
  }
  const state = taskContextStates.get(context)
  if (!state) throw new Error('Workspace seed sync task context is foreign')
  throwIfWorkspaceSeedSyncRuntimeReset(state.expectedGeneration)
  if (!state.open) throw closedTaskContextError()
  if (state.controller.signal.aborted) throw operationAbortedError(state.controller.signal)
  return state
}

function closeWorkspaceSeedSyncTaskContext(context: WorkspaceSeedSyncTaskContext): void {
  const state = taskContextStates.get(context)
  if (!state || !state.open) return
  state.open = false
  state.stopListeningForAbort?.()
  state.stopListeningForAbort = undefined
  if (!state.controller.signal.aborted) state.controller.abort(closedTaskContextError())
}

function removeIdleWaiter(waiter: IdleWaiter): void {
  idleWaiters.delete(waiter)
  waiter.stopListeningForAbort?.()
}

function resolveIdleWaiters(): void {
  if (activeTasks.size !== 0) return
  for (const waiter of [...idleWaiters]) {
    removeIdleWaiter(waiter)
    waiter.resolve()
  }
}

function removeResumeWaiter(waiter: ResumeWaiter): void {
  resumeWaiters.delete(waiter)
  waiter.stopListeningForAbort?.()
}

function resolveResumeWaiters(): void {
  if (suspensions.size !== 0) return
  for (const waiter of [...resumeWaiters]) {
    removeResumeWaiter(waiter)
    waiter.resolve()
  }
}

function notifyWorkspaceSeedSyncResumed(): void {
  if (suspensions.size !== 0) return
  resolveResumeWaiters()
  for (const listener of [...resumedListeners]) {
    try {
      listener()
    } catch {
      void 0
    }
  }
}

function removeWorkspaceSeedSyncSuspension(suspension: symbol): void {
  const resumes = suspensions.size === 1 && suspensions.has(suspension)
  if (!suspensions.delete(suspension) || !resumes) return
  notifyWorkspaceSeedSyncResumed()
}

function waitForWorkspaceSeedSyncResumed(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(operationAbortedError(signal))
  if (suspensions.size === 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const waiter: ResumeWaiter = { reject, resolve }
    const handleAbort = () => {
      removeResumeWaiter(waiter)
      reject(operationAbortedError(signal!))
    }
    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true })
      waiter.stopListeningForAbort = () => {
        signal.removeEventListener('abort', handleAbort)
      }
    }
    resumeWaiters.add(waiter)
    if (suspensions.size === 0) {
      removeResumeWaiter(waiter)
      resolve()
    }
  })
}

function waitForWorkspaceSeedSyncIdle(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(operationAbortedError(signal))
  if (activeTasks.size === 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const waiter: IdleWaiter = { reject, resolve, signal }
    if (signal) {
      const handleAbort = () => {
        removeIdleWaiter(waiter)
        reject(operationAbortedError(signal))
      }
      signal.addEventListener('abort', handleAbort, { once: true })
      waiter.stopListeningForAbort = () => {
        signal.removeEventListener('abort', handleAbort)
      }
    }
    idleWaiters.add(waiter)
  })
}

export function beginWorkspaceSeedSyncTask(): (() => void) | null {
  if (suspensions.size !== 0) return null
  const task = Symbol('workspace-seed-sync-task')
  activeTasks.add(task)
  let finished = false
  return () => {
    if (finished) return
    finished = true
    activeTasks.delete(task)
    resolveIdleWaiters()
  }
}

export async function acquireWorkspaceSeedSyncSuspension(
  signal?: AbortSignal,
): Promise<() => void> {
  const expectedGeneration = runtimeGeneration
  if (signal?.aborted) throw operationAbortedError(signal)
  throwIfWorkspaceSeedSyncRuntimeReset(expectedGeneration)
  const suspension = Symbol('workspace-seed-sync-suspension')
  suspensions.add(suspension)
  try {
    await waitForWorkspaceSeedSyncIdle(signal)
    throwIfWorkspaceSeedSyncRuntimeReset(expectedGeneration)
    if (signal?.aborted) throw operationAbortedError(signal)
  } catch (error) {
    removeWorkspaceSeedSyncSuspension(suspension)
    throw error
  }
  let released = false
  return () => {
    if (released) return
    released = true
    removeWorkspaceSeedSyncSuspension(suspension)
  }
}

export async function acquireWorkspaceSeedSyncTask(
  signal?: AbortSignal,
): Promise<() => void> {
  const expectedGeneration = runtimeGeneration
  while (true) {
    throwIfWorkspaceSeedSyncRuntimeReset(expectedGeneration)
    if (signal?.aborted) throw operationAbortedError(signal)
    throwIfWorkspaceSeedSyncRuntimeReset(expectedGeneration)
    const finish = beginWorkspaceSeedSyncTask()
    if (finish) return finish
    await waitForWorkspaceSeedSyncResumed(signal)
    throwIfWorkspaceSeedSyncRuntimeReset(expectedGeneration)
  }
}

export async function runWorkspaceSeedSyncTask<Result>(
  signal: AbortSignal | undefined,
  operation: (context: WorkspaceSeedSyncTaskContext) => Promise<Result> | Result,
): Promise<Result> {
  const expectedGeneration = runtimeGeneration
  while (true) {
    throwIfWorkspaceSeedSyncRuntimeReset(expectedGeneration)
    if (signal?.aborted) throw operationAbortedError(signal)
    const finish = beginWorkspaceSeedSyncTask()
    if (finish) {
      const context = createWorkspaceSeedSyncTaskContext(expectedGeneration, signal)
      try {
        return await runWorkspaceSeedSyncTaskWithContext(context, operation)
      } finally {
        closeWorkspaceSeedSyncTaskContext(context)
        finish()
      }
    }
    await waitForWorkspaceSeedSyncResumed(signal)
    throwIfWorkspaceSeedSyncRuntimeReset(expectedGeneration)
  }
}

export async function runWorkspaceSeedSyncTaskWithContext<Result>(
  context: WorkspaceSeedSyncTaskContext,
  operation: (context: WorkspaceSeedSyncTaskContext) => Promise<Result> | Result,
): Promise<Result> {
  readWorkspaceSeedSyncTaskContextState(context)
  const result = await operation(context)
  readWorkspaceSeedSyncTaskContextState(context)
  return result
}

export function readWorkspaceSeedSyncRuntimeSnapshot(): WorkspaceSeedSyncRuntimeSnapshot {
  return Object.freeze({
    activeTaskCount: activeTasks.size,
    suspensionCount: suspensions.size,
  })
}

export function subscribeWorkspaceSeedSyncResumed(listener: () => void): () => void {
  resumedListeners.add(listener)
  return () => resumedListeners.delete(listener)
}

export function resetWorkspaceSeedSyncRuntimeForTests(): void {
  if (activeTasks.size !== 0) {
    throw new Error('Finish active workspace seed sync tasks before resetting the runtime')
  }
  runtimeGeneration += 1
  const resetError = runtimeResetError()
  activeTasks.clear()
  suspensions.clear()
  for (const waiter of [...idleWaiters]) {
    removeIdleWaiter(waiter)
    waiter.reject(resetError)
  }
  for (const waiter of [...resumeWaiters]) {
    removeResumeWaiter(waiter)
    waiter.reject(resetError)
  }
  resumedListeners.clear()
}
