import storageWorker from '../../../../cloudflare/workers/knowgrph-storage/index.ts'
import type { createFakeKnowgrphStorageWorkerEnv } from './fakeKnowgrphStorageD1'

type FakeKnowgrphStorageWorkerEnv = ReturnType<typeof createFakeKnowgrphStorageWorkerEnv>

export const readStorageWorker = (): { fetch: (request: Request, env: never) => Promise<Response> } => {
  const candidate = storageWorker as unknown as {
    fetch?: (request: Request, env: never) => Promise<Response>
    default?: { fetch?: (request: Request, env: never) => Promise<Response> }
  }
  const fetchImpl = candidate.fetch || candidate.default?.fetch
  if (!fetchImpl) throw new Error('expected storage worker test module to expose fetch')
  return { fetch: fetchImpl }
}

export const createStorageWorkerFetch = (env: FakeKnowgrphStorageWorkerEnv) =>
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    return readStorageWorker().fetch(request, env as never)
  }
