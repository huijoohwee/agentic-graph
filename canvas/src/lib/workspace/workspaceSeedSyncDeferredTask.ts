import {
  beginWorkspaceSeedSyncTask,
  subscribeWorkspaceSeedSyncResumed,
} from './workspaceSeedSyncRuntime'

export type WorkspaceSeedSyncDeferredTask<Request> = Readonly<{
  admit: (request: Request) => boolean
  cleanup: (taskInFlight: boolean) => void
  complete: () => void
  peekPending: () => Request | null
  retainPending: (request: Request) => void
  resume: (schedule: (request: Request) => void) => void
  subscribeResume: (schedule: (request: Request) => void) => () => void
  takePending: () => Request | null
}>

export function createWorkspaceSeedSyncDeferredTask<Request>(): WorkspaceSeedSyncDeferredTask<Request> {
  let finishTask: (() => void) | null = null
  let pendingRequest: Request | null = null

  const complete = () => {
    const finish = finishTask
    finishTask = null
    finish?.()
  }

  return Object.freeze({
    admit(request) {
      pendingRequest = request
      if (finishTask) return true
      const finish = beginWorkspaceSeedSyncTask()
      if (!finish) return false
      finishTask = finish
      return true
    },
    cleanup(taskInFlight) {
      pendingRequest = null
      if (!taskInFlight) complete()
    },
    complete,
    peekPending: () => pendingRequest,
    retainPending(request) {
      pendingRequest = request
    },
    resume(schedule) {
      if (pendingRequest) schedule(pendingRequest)
    },
    subscribeResume(schedule) {
      return subscribeWorkspaceSeedSyncResumed(() => {
        if (pendingRequest) schedule(pendingRequest)
      })
    },
    takePending() {
      const request = pendingRequest
      pendingRequest = null
      return request
    },
  })
}

export async function drainWorkspaceSeedSyncDeferredRequests<Request>(args: {
  initialRequest: Request
  task: WorkspaceSeedSyncDeferredTask<Request>
  run: (request: Request) => Promise<unknown>
}): Promise<void> {
  let request: Request | null = args.initialRequest
  while (request) {
    try {
      await args.run(request)
    } catch {
      // A failed snapshot must not strand a newer request retained during the await.
    }
    request = args.task.takePending()
  }
}
