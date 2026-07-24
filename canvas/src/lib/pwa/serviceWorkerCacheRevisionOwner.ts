const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/
const DEFAULT_SCOPE_PATH = '/knowgrph/'
const KNOWGRPH_RUNTIME_CACHE_NAMES = new Set(['kg-assets', 'kg-static', 'kg-data'])
const REVISION_REQUEST = 'KG_SERVICE_WORKER_SOURCE_REVISION_REQUEST'
const REVISION_RESPONSE = 'KG_SERVICE_WORKER_SOURCE_REVISION_RESPONSE'
const REVISION_RESPONSE_TIMEOUT_MS = 2_000

type CacheTarget = {
  keys(): Promise<readonly Request[]>
  match(request: RequestInfo | URL): Promise<Response | undefined>
  delete(request: RequestInfo | URL): Promise<boolean>
}

type CacheStorageTarget = {
  keys(): Promise<string[]>
  open(cacheName: string): Promise<CacheTarget>
}

type ServiceWorkerTarget = {
  state: string
  postMessage(message: unknown, transfer: Transferable[]): void
  addEventListener?(type: 'statechange', listener: EventListener): void
  removeEventListener?(type: 'statechange', listener: EventListener): void
}

type ServiceWorkerRegistrationTarget = {
  active: ServiceWorkerTarget | null
  installing: ServiceWorkerTarget | null
  waiting: ServiceWorkerTarget | null
  addEventListener?(type: 'updatefound', listener: EventListener): void
  removeEventListener?(type: 'updatefound', listener: EventListener): void
}

type ControllerChangeTarget = {
  controller: ServiceWorkerTarget | null
  addEventListener(type: 'controllerchange', listener: EventListener): void
  removeEventListener(type: 'controllerchange', listener: EventListener): void
}

type MessagePortTarget = {
  onmessage: ((event: MessageEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  start(): void
  close(): void
}

type MessageChannelTarget = {
  port1: MessagePortTarget
  port2: MessagePortTarget & Transferable
}

type ServiceWorkerCacheRevisionOptions = {
  cacheStorage: CacheStorageTarget
  controllerTarget: ControllerChangeTarget
  registration: ServiceWorkerRegistrationTarget
  origin: string
  scopePath?: string
  readActiveRevision?: (worker: ServiceWorkerTarget) => Promise<string>
  runInitially?: boolean
  onError?: (error: unknown) => void
}

type ServiceWorkerCachePruneOptions = {
  cacheStorage: CacheStorageTarget
  origin: string
  sourceRevision: string
  scopePath?: string
  canDelete?: () => boolean
}

export type ServiceWorkerCachePruneResult = {
  ready: boolean
  deletedPaths: string[]
}

export type ServiceWorkerCacheRevisionOwner = {
  requestPrune(): void
  dispose(): void
}

const normalizeScopePath = (scopePath: string): string => {
  if (!scopePath.startsWith('/') || !scopePath.endsWith('/')) {
    throw new Error('service-worker cache scope must be an absolute path ending in /')
  }
  return scopePath
}

const isHtmlContentType = (contentType: string | null): boolean =>
  /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(String(contentType || '').trim())

const isStableActiveWorker = (
  registration: ServiceWorkerRegistrationTarget,
  controllerTarget: ControllerChangeTarget,
): ServiceWorkerTarget | null => {
  const active = registration.active
  if (!active || active.state !== 'activated') return null
  if (registration.installing || registration.waiting) return null
  return controllerTarget.controller === active ? active : null
}

export const readActiveServiceWorkerSourceRevision = (
  worker: ServiceWorkerTarget,
  options: {
    createMessageChannel?: () => MessageChannelTarget
    timeoutMs?: number
  } = {},
): Promise<string> => new Promise((resolve, reject) => {
  const channel = (options.createMessageChannel ?? (() => new MessageChannel()))()
  const timeoutMs = options.timeoutMs ?? REVISION_RESPONSE_TIMEOUT_MS
  let settled = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const finish = (error: unknown, sourceRevision = '') => {
    if (settled) return
    settled = true
    if (timeoutId !== null) clearTimeout(timeoutId)
    channel.port1.onmessage = null
    channel.port1.onmessageerror = null
    try {
      channel.port1.close()
    } catch {
      void 0
    }
    try {
      channel.port2.close()
    } catch {
      void 0
    }
    if (error) reject(error)
    else resolve(sourceRevision)
  }

  channel.port1.onmessage = event => {
    const response = event.data
    const sourceRevision = String(response?.sourceRevision || '')
    if (
      response?.type !== REVISION_RESPONSE
      || !SOURCE_REVISION_PATTERN.test(sourceRevision)
    ) {
      finish(new Error('active service worker returned an invalid source revision'))
      return
    }
    finish(null, sourceRevision)
  }
  channel.port1.onmessageerror = () => {
    finish(new Error('active service worker source revision response could not be decoded'))
  }
  channel.port1.start()
  timeoutId = setTimeout(() => {
    finish(new Error('active service worker source revision response timed out'))
  }, timeoutMs)
  try {
    worker.postMessage({ type: REVISION_REQUEST }, [channel.port2])
  } catch (error) {
    finish(error)
  }
})

export async function pruneStaleServiceWorkerCacheEntries(
  options: ServiceWorkerCachePruneOptions,
): Promise<ServiceWorkerCachePruneResult> {
  if (!SOURCE_REVISION_PATTERN.test(options.sourceRevision)) {
    throw new Error('service-worker cache cleanup requires an exact source revision')
  }
  const scopePath = normalizeScopePath(options.scopePath ?? DEFAULT_SCOPE_PATH)
  const scopeRoot = scopePath.slice(0, -1)
  const assetRoot = `${scopePath}assets/`
  const expectedAssetPrefix = `${assetRoot}${options.sourceRevision}/`
  const scopeUrl = new URL(scopePath, options.origin).toString()
  const staleEntries: Array<{ cache: CacheTarget; request: Request; pathname: string }> = []
  let expectedPrecacheReady = false

  for (const cacheName of await options.cacheStorage.keys()) {
    const cache = await options.cacheStorage.open(cacheName)
    const isKnowgrphOwnedCache = KNOWGRPH_RUNTIME_CACHE_NAMES.has(cacheName)
      || (cacheName.startsWith('workbox-precache') && cacheName.includes(scopeUrl))
    for (const request of await cache.keys()) {
      const url = new URL(request.url)
      if (url.origin !== options.origin) continue
      const isScopedPath = url.pathname === scopeRoot || url.pathname.startsWith(scopePath)
      let isHtml = isScopedPath && (
        url.pathname === scopeRoot
        || url.pathname === scopePath
        || url.pathname.endsWith('.html')
      )
      let cachedResponse: Response | undefined
      if (!isHtml && (isScopedPath || isKnowgrphOwnedCache)) {
        cachedResponse = await cache.match(request)
        isHtml = isHtmlContentType(cachedResponse?.headers.get('content-type') ?? null)
      }
      if (
        cacheName.startsWith('workbox-precache')
        && url.pathname.startsWith(expectedAssetPrefix)
        && cachedResponse
        && !isHtml
      ) {
        expectedPrecacheReady = true
      }
      if (
        isHtml
        || (url.pathname.startsWith(assetRoot) && !url.pathname.startsWith(expectedAssetPrefix))
      ) {
        staleEntries.push({ cache, request, pathname: url.pathname })
      }
    }
  }

  if (!expectedPrecacheReady || (options.canDelete && !options.canDelete())) {
    return { ready: false, deletedPaths: [] }
  }

  const deletedPaths = []
  for (const entry of staleEntries) {
    if (options.canDelete && !options.canDelete()) {
      return { ready: false, deletedPaths: [...new Set(deletedPaths)].sort() }
    }
    const deletion = entry.cache.delete(entry.request)
    if (await deletion) deletedPaths.push(entry.pathname)
  }
  return { ready: true, deletedPaths: [...new Set(deletedPaths)].sort() }
}

export function installServiceWorkerCacheRevisionOwner(
  options: ServiceWorkerCacheRevisionOptions,
): ServiceWorkerCacheRevisionOwner {
  const readActiveRevision = options.readActiveRevision ?? readActiveServiceWorkerSourceRevision
  let disposed = false
  let pruneRequested = false
  let pruneInFlight: Promise<void> | null = null
  const watchedWorkers = new Set<ServiceWorkerTarget>()

  const attemptPrune = async () => {
    const activeWorker = isStableActiveWorker(options.registration, options.controllerTarget)
    if (!activeWorker) return
    const sourceRevision = await readActiveRevision(activeWorker)
    if (!SOURCE_REVISION_PATTERN.test(sourceRevision)) {
      throw new Error('active service worker did not attest an exact source revision')
    }
    if (isStableActiveWorker(options.registration, options.controllerTarget) !== activeWorker) return
    await pruneStaleServiceWorkerCacheEntries({
      cacheStorage: options.cacheStorage,
      origin: options.origin,
      sourceRevision,
      scopePath: options.scopePath,
      canDelete: () =>
        !disposed
        && isStableActiveWorker(options.registration, options.controllerTarget) === activeWorker,
    })
  }

  const drainPruneRequests = async () => {
    while (!disposed && pruneRequested) {
      pruneRequested = false
      try {
        await attemptPrune()
      } catch (error) {
        options.onError?.(error)
      }
    }
  }

  const requestPrune = () => {
    if (disposed) return
    pruneRequested = true
    if (pruneInFlight) return
    pruneInFlight = drainPruneRequests().finally(() => {
      pruneInFlight = null
      if (!disposed && pruneRequested) requestPrune()
    })
  }

  function watchTransitionWorkers() {
    for (const worker of [
      options.registration.active,
      options.registration.installing,
      options.registration.waiting,
    ]) {
      if (!worker?.addEventListener || watchedWorkers.has(worker)) continue
      watchedWorkers.add(worker)
      worker.addEventListener('statechange', handleWorkerStateChange)
    }
  }

  function handleWorkerStateChange() {
    watchTransitionWorkers()
    requestPrune()
  }

  function handleRegistrationChange() {
    watchTransitionWorkers()
    requestPrune()
  }

  options.controllerTarget.addEventListener('controllerchange', handleRegistrationChange)
  options.registration.addEventListener?.('updatefound', handleRegistrationChange)
  watchTransitionWorkers()
  if (options.runInitially !== false) requestPrune()

  return {
    requestPrune,
    dispose() {
      disposed = true
      pruneRequested = false
      options.controllerTarget.removeEventListener('controllerchange', handleRegistrationChange)
      options.registration.removeEventListener?.('updatefound', handleRegistrationChange)
      for (const worker of watchedWorkers) {
        worker.removeEventListener?.('statechange', handleWorkerStateChange)
      }
      watchedWorkers.clear()
    },
  }
}
