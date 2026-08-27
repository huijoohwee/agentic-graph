import { LS_KEYS } from '@/lib/config'
import { getLocalStorage, readJsonFromStorage, writeJsonToStorage } from '@/lib/persistence'
import type { JSONValue } from '@/lib/graph/types'
import {
  AGENTIC_OS_DOCS_MCP_TOOL_NAME,
  normalizeAgenticOsDocsMcpInvocationTokens,
} from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import type { HeadlessResponsePreparation } from '../headlessResponseCoordinator'

export const CHAT_DURABLE_STREAM_WORKER_SCRIPT = 'agenticgraph-chat-stream-sw.js'
export const CHAT_DURABLE_STREAM_START = 'AG_CHAT_STREAM_START'
export const CHAT_DURABLE_STREAM_ATTACH = 'AG_CHAT_STREAM_ATTACH'
export const CHAT_DURABLE_STREAM_ABORT = 'AG_CHAT_STREAM_ABORT'
export const CHAT_DURABLE_STREAM_FORGET = 'AG_CHAT_STREAM_FORGET'
export const CHAT_DURABLE_STREAM_RESPONSE = 'AG_CHAT_STREAM_RESPONSE'
export const CHAT_DURABLE_STREAM_CHUNK = 'AG_CHAT_STREAM_CHUNK'
export const CHAT_DURABLE_STREAM_DONE = 'AG_CHAT_STREAM_DONE'
export const CHAT_DURABLE_STREAM_ERROR = 'AG_CHAT_STREAM_ERROR'

const durableChatStreamTransportSuspensions = new Set<symbol>()

export const DURABLE_CHAT_HEADLESS_PREPARATION_SEED_SCHEMA =
  'agenticgraph-durable-chat-headless-preparation/v1' as const

export type DurableChatHeadlessPreparationSeed = {
  schema: typeof DURABLE_CHAT_HEADLESS_PREPARATION_SEED_SCHEMA
  runId: string
  source: {
    kind: 'chat'
    id: string
  }
  responseContract: HeadlessResponsePreparation['responseContract']
  invocation: {
    tokens: string[]
    tool: typeof AGENTIC_OS_DOCS_MCP_TOOL_NAME | null
    mcpInvoked: boolean
  }
}

const parseDurableChatHeadlessPreparationSeed = (
  value: unknown,
): DurableChatHeadlessPreparationSeed | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<DurableChatHeadlessPreparationSeed>
  const rawSource = raw.source as Partial<DurableChatHeadlessPreparationSeed['source']> | undefined
  const rawInvocation = raw.invocation as Partial<DurableChatHeadlessPreparationSeed['invocation']> | undefined
  const rawTokens = Array.isArray(rawInvocation?.tokens) ? rawInvocation.tokens : []
  const tokens = normalizeAgenticOsDocsMcpInvocationTokens(rawTokens)
  if (
    raw.schema !== DURABLE_CHAT_HEADLESS_PREPARATION_SEED_SCHEMA
    || rawSource?.kind !== 'chat'
    || (raw.responseContract !== 'plain' && raw.responseContract !== 'kgc')
    || tokens.length !== rawTokens.length
    || tokens.some((token, index) => token !== rawTokens[index])
  ) return null
  const runId = typeof raw.runId === 'string' ? raw.runId.trim() : ''
  const sourceId = typeof rawSource.id === 'string' ? rawSource.id.trim() : ''
  if (!runId || !sourceId) return null
  const tool = rawInvocation?.tool === AGENTIC_OS_DOCS_MCP_TOOL_NAME
    ? AGENTIC_OS_DOCS_MCP_TOOL_NAME
    : rawInvocation?.tool === null
      ? null
      : undefined
  const mcpInvoked = rawInvocation?.mcpInvoked
  if (
    tool === undefined
    || typeof mcpInvoked !== 'boolean'
    || (tokens.length > 0 && (tool !== AGENTIC_OS_DOCS_MCP_TOOL_NAME || mcpInvoked !== true))
    || (tokens.length === 0 && (tool !== null || mcpInvoked !== false))
  ) return null
  return {
    schema: DURABLE_CHAT_HEADLESS_PREPARATION_SEED_SCHEMA,
    runId,
    source: { kind: 'chat', id: sourceId },
    responseContract: raw.responseContract,
    invocation: {
      tokens,
      tool,
      mcpInvoked,
    },
  }
}

export const projectDurableChatHeadlessPreparationSeed = (
  prepared: HeadlessResponsePreparation,
): DurableChatHeadlessPreparationSeed | null => parseDurableChatHeadlessPreparationSeed({
  schema: DURABLE_CHAT_HEADLESS_PREPARATION_SEED_SCHEMA,
  runId: prepared.runId,
  source: prepared.source,
  responseContract: prepared.responseContract,
  invocation: {
    tokens: prepared.invocation.tokens,
    tool: prepared.invocation.mcpResponse?.tool || null,
    mcpInvoked: prepared.invocation.mcpResponse?.mcpInvoked === true,
  },
})

export const restoreDurableChatHeadlessPreparation = (
  value: unknown,
  args: {
    requestText: string
    expectedRunId: string
    expectedAssistantMessageId: string
  },
): HeadlessResponsePreparation | null => {
  const seed = parseDurableChatHeadlessPreparationSeed(value)
  const requestText = typeof args.requestText === 'string' ? args.requestText.trim() : ''
  const expectedRunId = String(args.expectedRunId || '').trim()
  const expectedAssistantMessageId = String(args.expectedAssistantMessageId || '').trim()
  if (
    !seed
    || !requestText
    || seed.runId !== expectedRunId
    || seed.source.id !== expectedAssistantMessageId
  ) return null
  return {
    runId: seed.runId,
    source: seed.source,
    requestText,
    providerText: requestText,
    responseContract: seed.responseContract,
    systemMessages: [],
    invocation: {
      tokens: [...seed.invocation.tokens],
      mcpResponse: seed.invocation.mcpInvoked && seed.invocation.tool === AGENTIC_OS_DOCS_MCP_TOOL_NAME
        ? {
            ok: true,
            tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
            mcpInvoked: true,
            invocations: seed.invocation.tokens.map(token => ({ token, ok: true })),
          }
        : null,
    },
  }
}

export class DurableChatStreamTransportSuspendedError extends Error {
  readonly code = 'DURABLE_CHAT_STREAM_TRANSPORT_SUSPENDED'

  constructor() {
    super('Durable chat stream transport is suspended while Flight Sim owns the runtime.')
    this.name = 'DurableChatStreamTransportSuspendedError'
  }
}

export type DurableChatStreamMetadata = {
  runId: string
  traceId: string
  assistantMessageId: string
  requestText: string
  requestTimestampMs: number
  chatStorageTarget: 'chatHistory' | 'chatAgenticGraph'
  liveKgcPath: string | null
  providerSummary: string
  defaultLocalRootPath: string
  modelId: string | null
  packedFrontmatter?: Record<string, JSONValue> | null
  headlessPreparationSeed?: DurableChatHeadlessPreparationSeed | null
}

export type DurableChatStreamRequestMetadata = Omit<DurableChatStreamMetadata, 'modelId'> & {
  modelId?: string | null
}

export type DurableChatStreamActiveRun = DurableChatStreamMetadata & {
  status: 'active'
  startedAtMs: number
  updatedAtMs: number
}

type WorkerResponseMessage = {
  type: typeof CHAT_DURABLE_STREAM_RESPONSE
  runId: string
  status?: number
  statusText?: string
  contentType?: string
}

type WorkerChunkMessage = {
  type: typeof CHAT_DURABLE_STREAM_CHUNK
  runId: string
  chunk?: string
}

type WorkerDoneMessage = {
  type: typeof CHAT_DURABLE_STREAM_DONE
  runId: string
}

type WorkerErrorMessage = {
  type: typeof CHAT_DURABLE_STREAM_ERROR
  runId: string
  error?: string
}

type WorkerStreamMessage = WorkerResponseMessage | WorkerChunkMessage | WorkerDoneMessage | WorkerErrorMessage

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeString = (value: unknown): string => String(value || '').trim()

const parseActiveRun = (value: unknown): DurableChatStreamActiveRun | null => {
  if (!isRecord(value)) return null
  if (value.status !== 'active') return null
  const runId = normalizeString(value.runId)
  const traceId = normalizeString(value.traceId)
  const assistantMessageId = normalizeString(value.assistantMessageId)
  const requestText = typeof value.requestText === 'string' ? value.requestText : ''
  const chatStorageTarget = value.chatStorageTarget === 'chatHistory' ? 'chatHistory' : 'chatAgenticGraph'
  if (!runId || !traceId || !assistantMessageId) return null
  const parsedHeadlessSeed = parseDurableChatHeadlessPreparationSeed(value.headlessPreparationSeed)
  const headlessPreparationSeed = parsedHeadlessSeed
    && parsedHeadlessSeed.runId === assistantMessageId
    && parsedHeadlessSeed.source.id === assistantMessageId
    ? parsedHeadlessSeed
    : null
  return {
    runId,
    traceId,
    assistantMessageId,
    requestText,
    requestTimestampMs: Number(value.requestTimestampMs || 0) || Date.now(),
    chatStorageTarget,
    liveKgcPath: normalizeString(value.liveKgcPath) || null,
    providerSummary: normalizeString(value.providerSummary),
    defaultLocalRootPath: normalizeString(value.defaultLocalRootPath),
    modelId: normalizeString(value.modelId) || null,
    packedFrontmatter: isRecord(value.packedFrontmatter) ? value.packedFrontmatter as Record<string, JSONValue> : null,
    headlessPreparationSeed,
    status: 'active',
    startedAtMs: Number(value.startedAtMs || 0) || Date.now(),
    updatedAtMs: Number(value.updatedAtMs || 0) || Date.now(),
  }
}

export const readActiveDurableChatStreamRun = (): DurableChatStreamActiveRun | null => {
  const storage = getLocalStorage()
  if (!storage) return null
  return readJsonFromStorage(storage, LS_KEYS.chatDurableStreamActiveRun, null, parseActiveRun)
}

export const writeActiveDurableChatStreamRun = (metadata: DurableChatStreamRequestMetadata): DurableChatStreamActiveRun | null => {
  const storage = getLocalStorage()
  if (!storage) return null
  const nowMs = Date.now()
  const assistantMessageId = normalizeString(metadata.assistantMessageId)
  const parsedHeadlessSeed = parseDurableChatHeadlessPreparationSeed(metadata.headlessPreparationSeed)
  const headlessPreparationSeed = parsedHeadlessSeed
    && parsedHeadlessSeed.runId === assistantMessageId
    && parsedHeadlessSeed.source.id === assistantMessageId
    ? parsedHeadlessSeed
    : null
  const active: DurableChatStreamActiveRun = {
    runId: normalizeString(metadata.runId),
    traceId: normalizeString(metadata.traceId),
    assistantMessageId,
    requestText: typeof metadata.requestText === 'string' ? metadata.requestText : '',
    requestTimestampMs: Number(metadata.requestTimestampMs || 0) || nowMs,
    chatStorageTarget: metadata.chatStorageTarget === 'chatHistory' ? 'chatHistory' : 'chatAgenticGraph',
    liveKgcPath: normalizeString(metadata.liveKgcPath) || null,
    providerSummary: normalizeString(metadata.providerSummary),
    defaultLocalRootPath: normalizeString(metadata.defaultLocalRootPath),
    modelId: normalizeString(metadata.modelId) || null,
    packedFrontmatter: metadata.packedFrontmatter || null,
    headlessPreparationSeed,
    status: 'active',
    startedAtMs: nowMs,
    updatedAtMs: nowMs,
  }
  if (!active.runId || !active.traceId || !active.assistantMessageId) return null
  writeJsonToStorage(storage, LS_KEYS.chatDurableStreamActiveRun, active)
  return active
}

export const clearActiveDurableChatStreamRun = (runId?: string | null): void => {
  const storage = getLocalStorage()
  if (!storage) return
  const active = readActiveDurableChatStreamRun()
  const expected = normalizeString(runId)
  if (expected && active?.runId && active.runId !== expected) return
  try {
    storage.removeItem(LS_KEYS.chatDurableStreamActiveRun)
  } catch {
    void 0
  }
}

const assertDurableChatStreamTransportAvailable = (): void => {
  if (durableChatStreamTransportSuspensions.size === 0) return
  throw new DurableChatStreamTransportSuspendedError()
}

export const acquireDurableChatStreamTransportSuspension = (): (() => void) => {
  if (readActiveDurableChatStreamRun()) {
    throw new Error(
      'Flight Sim cannot suspend durable chat stream transport while a durable chat run is active.',
    )
  }
  const owner = Symbol('durable-chat-stream-transport-suspension')
  durableChatStreamTransportSuspensions.add(owner)
  return () => {
    durableChatStreamTransportSuspensions.delete(owner)
  }
}

const readBasePath = (): string => {
  const meta = import.meta as unknown as { env?: { BASE_URL?: unknown; PROD?: unknown } }
  const raw = typeof meta.env?.BASE_URL === 'string' && meta.env.BASE_URL ? meta.env.BASE_URL : '/'
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

const canUseServiceWorker = (): boolean => {
  if (typeof window === 'undefined') return false
  if (typeof navigator === 'undefined') return false
  return 'serviceWorker' in navigator && typeof MessageChannel !== 'undefined' && typeof ReadableStream !== 'undefined'
}

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const resolveServiceWorkerTarget = async (): Promise<ServiceWorker | null> => {
  if (!canUseServiceWorker()) return null
  const meta = import.meta as unknown as { env?: { PROD?: unknown } }
  const isProd = meta.env?.PROD === true
  try {
    if (!isProd && !navigator.serviceWorker.controller) {
      await navigator.serviceWorker.register(`/${CHAT_DURABLE_STREAM_WORKER_SCRIPT}`, { scope: '/' })
    }
  } catch {
    void 0
  }

  const deadlineMs = Date.now() + 2_000
  while (Date.now() < deadlineMs) {
    const registration = await navigator.serviceWorker.ready.catch(() => null)
    const target = navigator.serviceWorker.controller || registration?.active || registration?.waiting || registration?.installing || null
    if (target) return target
    await wait(80)
  }
  return navigator.serviceWorker.controller || null
}

const postWorkerControlMessage = async (type: string, runId: string): Promise<void> => {
  const target = await resolveServiceWorkerTarget()
  if (!target) return
  try {
    target.postMessage({ type, runId })
  } catch {
    void 0
  }
}

export const abortDurableChatStreamRun = async (runId: string): Promise<void> => {
  await postWorkerControlMessage(CHAT_DURABLE_STREAM_ABORT, runId)
}

export const forgetDurableChatStreamRun = async (runId: string): Promise<void> => {
  await postWorkerControlMessage(CHAT_DURABLE_STREAM_FORGET, runId)
}

const createWorkerBackedResponse = async (args: {
  runId: string
  start?: {
    requestUrl: string
    method: string
    headers: Record<string, string>
    body: string
  }
  signal?: AbortSignal | null
}): Promise<Response | null> => {
  const target = await resolveServiceWorkerTarget()
  if (!target) return null

  const encoder = new TextEncoder()
  const channel = new MessageChannel()
  let responseMessage: WorkerResponseMessage | null = null
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
  let streamClosed = false
  let failedError: Error | null = null
  const pendingChunks: string[] = []

  const closeStream = () => {
    if (streamClosed) return
    streamClosed = true
    try {
      streamController?.close()
    } catch {
      void 0
    }
    try {
      channel.port1.close()
    } catch {
      void 0
    }
  }

  const failStream = (error: Error) => {
    failedError = error
    if (streamClosed) return
    streamClosed = true
    try {
      streamController?.error(error)
    } catch {
      void 0
    }
    try {
      channel.port1.close()
    } catch {
      void 0
    }
  }

  const responseReady = new Promise<WorkerResponseMessage>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Durable chat stream worker did not respond.')), 5_000)
    channel.port1.onmessage = event => {
      const data = event.data as WorkerStreamMessage
      if (!isRecord(data) || data.runId !== args.runId) return
      if (data.type === CHAT_DURABLE_STREAM_RESPONSE) {
        responseMessage = data
        clearTimeout(timeoutId)
        resolve(data)
        return
      }
      if (data.type === CHAT_DURABLE_STREAM_CHUNK) {
        const chunk = typeof data.chunk === 'string' ? data.chunk : ''
        if (!chunk) return
        if (streamController) {
          streamController.enqueue(encoder.encode(chunk))
        } else {
          pendingChunks.push(chunk)
        }
        return
      }
      if (data.type === CHAT_DURABLE_STREAM_DONE) {
        clearTimeout(timeoutId)
        closeStream()
        if (!responseMessage) {
          resolve({
            type: CHAT_DURABLE_STREAM_RESPONSE,
            runId: args.runId,
            status: 200,
            statusText: 'OK',
            contentType: 'text/event-stream; charset=utf-8',
          })
        }
        return
      }
      if (data.type === CHAT_DURABLE_STREAM_ERROR) {
        clearTimeout(timeoutId)
        failStream(new Error(data.error || 'Durable chat stream failed.'))
        if (!responseMessage) reject(failedError || new Error(data.error || 'Durable chat stream failed.'))
      }
    }
    channel.port1.onmessageerror = () => {
      clearTimeout(timeoutId)
      reject(new Error('Durable chat stream worker message channel failed.'))
    }
    channel.port1.start()
  })

  const message = args.start
    ? {
        type: CHAT_DURABLE_STREAM_START,
        runId: args.runId,
        request: args.start,
      }
    : {
        type: CHAT_DURABLE_STREAM_ATTACH,
        runId: args.runId,
      }

  try {
    target.postMessage(message, [channel.port2])
  } catch {
    return null
  }

  const abortHandler = () => {
    void abortDurableChatStreamRun(args.runId)
    failStream(new Error('Request aborted'))
  }
  if (args.signal) {
    if (args.signal.aborted) abortHandler()
    else args.signal.addEventListener('abort', abortHandler, { once: true })
  }

  const header = await responseReady
  if (failedError) throw failedError
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
      while (pendingChunks.length > 0) {
        controller.enqueue(encoder.encode(pendingChunks.shift() || ''))
      }
      if (streamClosed) {
        try {
          controller.close()
        } catch {
          void 0
        }
      }
    },
    cancel() {
      try {
        channel.port1.close()
      } catch {
        void 0
      }
    },
  })
  return new Response(body, {
    status: Number(header.status || 200),
    statusText: header.statusText || 'OK',
    headers: {
      'content-type': header.contentType || 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

const headersToRecord = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}

export const fetchWithDurableChatStream = async (args: {
  runMetadata: DurableChatStreamRequestMetadata
  input: RequestInfo | URL
  init?: RequestInit
  signal?: AbortSignal | null
  fallbackFetch?: typeof fetch
}): Promise<Response> => {
  assertDurableChatStreamTransportAvailable()
  const fallbackFetch = args.fallbackFetch || fetch
  const method = normalizeString(args.init?.method || 'GET').toUpperCase()
  const body = typeof args.init?.body === 'string' ? args.init.body : ''
  if (method !== 'POST' || !body || !canUseServiceWorker()) {
    return await fallbackFetch(args.input, args.init)
  }
  const parsedBody = (() => {
    try {
      return JSON.parse(body) as { stream?: unknown }
    } catch {
      return null
    }
  })()
  if (parsedBody?.stream !== true) return await fallbackFetch(args.input, args.init)

  const run = writeActiveDurableChatStreamRun(args.runMetadata)
  if (!run) return await fallbackFetch(args.input, args.init)
  const headers = new Headers(args.init?.headers || undefined)
  const durableResponse = await createWorkerBackedResponse({
    runId: run.runId,
    start: {
      requestUrl: String(args.input),
      method,
      headers: headersToRecord(headers),
      body,
    },
    signal: args.signal || null,
  }).catch(() => null)
  if (durableResponse) return durableResponse
  clearActiveDurableChatStreamRun(run.runId)
  return await fallbackFetch(args.input, args.init)
}

export const attachDurableChatStreamResponse = async (runId: string): Promise<Response> => {
  assertDurableChatStreamTransportAvailable()
  const response = await createWorkerBackedResponse({ runId })
  if (!response) throw new Error('No active durable chat stream worker is available.')
  return response
}

export const getDurableChatStreamWorkerScriptPath = (): string =>
  `${readBasePath()}${CHAT_DURABLE_STREAM_WORKER_SCRIPT}`.replace(/\/{2,}/g, '/')
