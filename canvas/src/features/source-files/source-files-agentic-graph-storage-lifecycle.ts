import {
  loadAgenticGraphStorageRuntimeDependencies,
  type AgenticGraphStorageRuntimeDependencies,
} from './source-files-agentic-graph-storage-runtime'

export type AgenticGraphStorageWorkspaceOwnership = Readonly<{
  epoch: number
  signal: AbortSignal
}>

export type AgenticGraphStorageWorkspaceLifecycle = Readonly<{
  begin: () => AgenticGraphStorageWorkspaceOwnership
  isCurrent: (ownership: AgenticGraphStorageWorkspaceOwnership) => boolean
  loadDependencies: (
    ownership?: AgenticGraphStorageWorkspaceOwnership | null,
  ) => Promise<AgenticGraphStorageRuntimeDependencies>
  readDependencies: () => AgenticGraphStorageRuntimeDependencies | null
  readOwnership: () => AgenticGraphStorageWorkspaceOwnership | null
  stop: (reason?: Error) => void
}>

type AgenticGraphStorageChildLifecycleArgs = Readonly<{
  signal?: AbortSignal
}>

export type AgenticGraphStorageOperationTracker = Readonly<{
  begin: () => symbol
  finish: (operation: symbol) => void
  isActive: () => boolean
  size: () => number
}>

export type AgenticGraphStorageLatestOperationRunner<Request> = Readonly<{
  clearPending: () => void
  enqueue: (
    request: Request,
    operation: (request: Request) => Promise<void>,
  ) => void
  isActive: () => boolean
}>

function lifecycleEndedError(): Error {
  return new Error('agentic-graph storage workspace lifecycle ended')
}

export function createAgenticGraphStorageLatestOperationRunner<Request>():
AgenticGraphStorageLatestOperationRunner<Request> {
  type Entry = {
    operation: (request: Request) => Promise<void>
    request: Request
  }
  let active = false
  let pending: Entry | null = null
  const start = (entry: Entry) => {
    active = true
    void Promise.resolve()
      .then(() => entry.operation(entry.request))
      .catch(() => undefined)
      .finally(() => {
        active = false
        const next = pending
        pending = null
        if (next) start(next)
      })
  }
  return Object.freeze({
    clearPending() {
      pending = null
    },
    enqueue(request, operation) {
      const entry = { operation, request }
      if (active) {
        pending = entry
        return
      }
      start(entry)
    },
    isActive: () => active,
  })
}

export function createAgenticGraphStorageOperationTracker(): AgenticGraphStorageOperationTracker {
  const activeOperations = new Set<symbol>()
  return Object.freeze({
    begin() {
      const operation = Symbol('agentic-graph-storage-operation')
      activeOperations.add(operation)
      return operation
    },
    finish(operation: symbol) {
      activeOperations.delete(operation)
    },
    isActive: () => activeOperations.size > 0,
    size: () => activeOperations.size,
  })
}

export function createAgenticGraphStorageCurrentOwnershipHandler<
  Args extends AgenticGraphStorageChildLifecycleArgs,
  Result,
>(
  lifecycle: AgenticGraphStorageWorkspaceLifecycle,
  ownership: AgenticGraphStorageWorkspaceOwnership,
  operation: (
    args: Args,
    ownership: AgenticGraphStorageWorkspaceOwnership,
  ) => Result,
): (args: Args) => Result | undefined {
  return args => {
    if (!lifecycle.isCurrent(ownership) || args.signal?.aborted) return
    return operation(args, ownership)
  }
}

export function createAgenticGraphStorageWorkspaceLifecycle(
  loadDependencies: (
    signal?: AbortSignal,
  ) => Promise<AgenticGraphStorageRuntimeDependencies> = loadAgenticGraphStorageRuntimeDependencies,
): AgenticGraphStorageWorkspaceLifecycle {
  let controller: AbortController | null = null
  let dependencies: AgenticGraphStorageRuntimeDependencies | null = null
  let epoch = 0
  let pending: Promise<AgenticGraphStorageRuntimeDependencies> | null = null
  let pendingSignal: AbortSignal | null = null

  const readOwnership = (): AgenticGraphStorageWorkspaceOwnership | null => (
    controller
      ? Object.freeze({ epoch, signal: controller.signal })
      : null
  )

  const isCurrent = (ownership: AgenticGraphStorageWorkspaceOwnership): boolean => (
    ownership.epoch === epoch
    && ownership.signal === controller?.signal
    && !ownership.signal.aborted
  )

  const assertCurrent = (ownership: AgenticGraphStorageWorkspaceOwnership): void => {
    if (!isCurrent(ownership)) {
      throw ownership.signal.reason instanceof Error
        ? ownership.signal.reason
        : lifecycleEndedError()
    }
  }

  const requestDependencies = async (
    ownership: AgenticGraphStorageWorkspaceOwnership,
    retry: boolean,
  ): Promise<AgenticGraphStorageRuntimeDependencies> => {
    try {
      const result = await loadDependencies(ownership.signal)
      assertCurrent(ownership)
      dependencies = result
      return result
    } catch (error) {
      if (retry && isCurrent(ownership)) {
        await Promise.resolve()
        return requestDependencies(ownership, false)
      }
      throw error
    }
  }

  const loadCurrentDependencies = (
    ownership = readOwnership(),
  ): Promise<AgenticGraphStorageRuntimeDependencies> => {
    if (!ownership) return Promise.reject(lifecycleEndedError())
    try {
      assertCurrent(ownership)
    } catch (error) {
      return Promise.reject(error)
    }
    if (dependencies) return Promise.resolve(dependencies)
    if (pending && pendingSignal === ownership.signal) return pending
    const requested = requestDependencies(ownership, true)
    pending = requested
    pendingSignal = ownership.signal
    const clearPending = () => {
      if (pending !== requested) return
      pending = null
      pendingSignal = null
    }
    void requested.then(clearPending, clearPending)
    return requested
  }

  const stop = (reason = lifecycleEndedError()) => {
    epoch += 1
    controller?.abort(reason)
    controller = null
    pending = null
    pendingSignal = null
  }

  return Object.freeze({
    begin() {
      stop(new Error('agentic-graph storage workspace changed'))
      controller = new AbortController()
      return readOwnership()!
    },
    isCurrent,
    loadDependencies: loadCurrentDependencies,
    readDependencies: () => dependencies,
    readOwnership,
    stop,
  })
}
