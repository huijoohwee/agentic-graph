import {
  AGENTIC_OS_STORAGE_SYNC_API_VERSION,
  hashAgenticGraphStorageContent,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import storageWorker from '../../../../cloudflare/workers/agentic-graph-storage/index.ts'
import type { createFakeAgenticGraphStorageWorkerEnv } from './fake-agentic-graph-storage-d1'

type FakeAgenticGraphStorageWorkerEnv = ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv>

export const readStorageWorker = (): { fetch: (request: Request, env: never) => Promise<Response> } => {
  const candidate = storageWorker as unknown as {
    fetch?: (request: Request, env: never) => Promise<Response>
    default?: { fetch?: (request: Request, env: never) => Promise<Response> }
  }
  const fetchImpl = candidate.fetch || candidate.default?.fetch
  if (!fetchImpl) throw new Error('expected storage worker test module to expose fetch')
  return { fetch: fetchImpl }
}

// Node's Request has no browser base URL. Resolve only at this fixture boundary;
// the real client transport still performs its origin and credential checks first.
export const createStorageWorkerRequest = (input: RequestInfo | URL, init?: RequestInit): Request => {
  if (input instanceof Request) return new Request(input, init)
  let url: URL
  try { url = new URL(String(input)) }
  catch (error) {
    if (typeof window === 'undefined' || !window.location?.href) {
      throw new TypeError('Relative storage fixture requests require a browser URL', { cause: error })
    }
    url = new URL(String(input), window.location.href)
  }
  return new Request(url, init)
}

export const createStorageWorkerFetch = (env: FakeAgenticGraphStorageWorkerEnv) =>
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = createStorageWorkerRequest(input, init)
    return readStorageWorker().fetch(request, env as never)
  }

export const pushCrawlerDocument = async (args: {
  env: FakeAgenticGraphStorageWorkerEnv
  workspaceId: string
  documentId: string
  canonicalPath: string
  title: string
  contentMd: string
  deleted?: boolean
}) => {
  const response = await readStorageWorker().fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION,
        workspaceId: args.workspaceId,
        deviceId: 'dev_crawler',
        mutations: [
          {
            mutationId: `mut_${args.documentId}`,
            workspaceId: args.workspaceId,
            entity: 'document',
            op: 'upsert',
            recordId: args.documentId,
            baseRevision: null,
            record: {
              id: args.documentId,
              workspaceId: args.workspaceId,
              canonicalPath: args.canonicalPath,
              title: args.title,
              docType: 'markdown',
              lang: null,
              graphId: null,
              sourceKind: 'markdown',
              contentMd: args.contentMd,
              contentHash: hashAgenticGraphStorageContent(args.contentMd),
              parserVersion: 'source-files',
              revision: 1,
              updatedAtMs: 1_777_400_000_000,
              deleted: args.deleted === true,
            },
          },
        ],
      }),
    }),
    args.env as never,
  )
  if (!response.ok) throw new Error(`expected crawler fixture push ok, received ${response.status}`)
}
