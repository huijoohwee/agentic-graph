import {
  createWorkspaceSeedSyncDeferredTask,
  drainWorkspaceSeedSyncDeferredRequests,
} from './workspaceSeedSyncDeferredTask'

type TimerHandle = unknown

export type WorkspaceSeedSyncDeferredScheduler<Request> = Readonly<{
  cleanup: () => void
  configure: (config: {
    delayMs: number
    run: (request: Request) => Promise<unknown>
  }) => void
  readSnapshot: () => Readonly<{
    inFlight: boolean
    pending: boolean
    timerScheduled: boolean
  }>
  retainPending: (request: Request) => void
  schedule: (request: Request | null) => void
  subscribeResume: () => () => void
}>

export function createWorkspaceSeedSyncDeferredScheduler<Request>(timerRuntime: {
  clearTimeout: (handle: TimerHandle) => void
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle
}): WorkspaceSeedSyncDeferredScheduler<Request> {
  const task = createWorkspaceSeedSyncDeferredTask<Request>()
  let configuredDelayMs = 0
  let configuredRun: ((request: Request) => Promise<unknown>) | null = null
  let inFlight = false
  let timer: TimerHandle | null = null

  const clearTimer = () => {
    if (timer == null) return
    timerRuntime.clearTimeout(timer)
    timer = null
  }

  const drain = async (initialRequest: Request) => {
    if (inFlight) {
      task.retainPending(initialRequest)
      return
    }
    clearTimer()
    inFlight = true
    try {
      await drainWorkspaceSeedSyncDeferredRequests({
        initialRequest,
        task,
        run: request => {
          if (!configuredRun) {
            throw new Error('Workspace seed sync deferred scheduler is not configured')
          }
          return configuredRun(request)
        },
      })
    } finally {
      inFlight = false
      task.complete()
    }
  }

  const runScheduledRequest = () => {
    timer = null
    const request = task.takePending()
    if (!request) {
      if (!inFlight) task.complete()
      return
    }
    void drain(request)
  }

  const schedule = (request: Request | null) => {
    if (!request) return
    if (!task.admit(request)) return
    if (inFlight) return
    clearTimer()
    const delayMs = Math.max(0, Number(configuredDelayMs || 0))
    if (delayMs === 0) {
      runScheduledRequest()
      return
    }
    timer = timerRuntime.setTimeout(runScheduledRequest, delayMs)
  }

  return Object.freeze({
    cleanup() {
      clearTimer()
      task.cleanup(inFlight)
    },
    configure(config) {
      configuredDelayMs = config.delayMs
      configuredRun = config.run
    },
    readSnapshot: () => Object.freeze({
      inFlight,
      pending: task.peekPending() !== null,
      timerScheduled: timer !== null,
    }),
    retainPending: task.retainPending,
    schedule,
    subscribeResume: () => task.subscribeResume(schedule),
  })
}
