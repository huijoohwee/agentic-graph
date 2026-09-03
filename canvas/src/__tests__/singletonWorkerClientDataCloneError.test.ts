import { requestFromSingletonWorker } from '@/lib/workers/singletonWorkerClient'

export async function testSingletonWorkerClientPostMessageDataCloneErrorResolvesNull() {
  const errors: string[] = []
  const fakeWorker = {
    onmessage: null as ((ev: MessageEvent<unknown>) => void) | null,
    onerror: null as ((ev: ErrorEvent) => void) | null,
    postMessage: () => {
      const e = new Error('The object can not be cloned.')
      ;(e as Error & { name?: string }).name = 'DataCloneError'
      throw e
    },
    terminate: () => void 0,
  } as unknown as Worker

  const value = await requestFromSingletonWorker<number>({
    globalStateKey: '__agentic_os_test_singleton_worker_dataclone__',
    createWorker: () => fakeWorker,
    timeoutMs: 100,
    postMessage: (worker, id) => {
      worker.postMessage({ id, payload: { bad: () => void 0 } })
    },
    readResponse: () => null,
    onWorkerErrorMessage: (message) => {
      errors.push(String(message || ''))
    },
  })

  if (value !== null) throw new Error('expected singleton worker request to resolve null after DataCloneError')
  if (!errors.some(msg => msg.includes('Worker postMessage failed: DataCloneError'))) {
    throw new Error('expected singleton worker request to emit DataCloneError diagnostic message')
  }
}

