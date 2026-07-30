const DEFAULT_SCOPE_PATH = '/knowgrph/'
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/

type EventListenerTarget = {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

type ServiceWorkerStateTarget = EventListenerTarget & {
  state: string
  postMessage(message: unknown, transfer: Transferable[]): void
}

type ServiceWorkerRegistrationTarget = {
  active: ServiceWorkerStateTarget | null
  installing: ServiceWorkerStateTarget | null
  waiting: ServiceWorkerStateTarget | null
  update(): Promise<unknown>
}

type ServiceWorkerContainerTarget = EventListenerTarget & {
  controller: ServiceWorkerStateTarget | null
  register(
    scriptUrl: string,
    options: RegistrationOptions,
  ): Promise<ServiceWorkerRegistrationTarget>
}

type CanonicalServiceWorkerRegistrationOptions = {
  serviceWorkerTarget: ServiceWorkerContainerTarget
  scopePath?: string
  sourceRevision?: string
  reload?: () => void
  onOfflineReady?: () => void
  onRegistered?: (registration: ServiceWorkerRegistrationTarget) => void
}

export type CanonicalServiceWorkerRegistrationOwner = {
  registration: ServiceWorkerRegistrationTarget
  dispose(): void
}

const normalizeScopePath = (scopePath: string): string => {
  if (!scopePath.startsWith('/') || !scopePath.endsWith('/')) {
    throw new Error('service-worker registration scope must be an absolute path ending in /')
  }
  return scopePath
}

const buildCanonicalWorkerScriptUrl = (scopePath: string, sourceRevision?: string): string => {
  const normalizedRevision = String(sourceRevision || '').trim()
  if (!normalizedRevision) return `${scopePath}sw.js`
  if (!SOURCE_REVISION_PATTERN.test(normalizedRevision)) {
    throw new Error('service-worker registration source revision must be an exact commit SHA')
  }
  return `${scopePath}sw.js?revision=${normalizedRevision}`
}

export async function registerCanonicalServiceWorker(
  options: CanonicalServiceWorkerRegistrationOptions,
): Promise<CanonicalServiceWorkerRegistrationOwner> {
  const scopePath = normalizeScopePath(options.scopePath ?? DEFAULT_SCOPE_PATH)
  const scriptUrl = buildCanonicalWorkerScriptUrl(scopePath, options.sourceRevision)
  const previousController = options.serviceWorkerTarget.controller
  let reloaded = false
  let installingWorker: ServiceWorkerStateTarget | null = null

  const handleControllerChange = () => {
    if (
      reloaded
      || !previousController
      || !options.serviceWorkerTarget.controller
      || options.serviceWorkerTarget.controller === previousController
    ) return
    reloaded = true
    options.reload?.()
  }
  const handleInstallingStateChange = () => {
    if (installingWorker?.state === 'installed' && !previousController) {
      options.onOfflineReady?.()
    }
  }

  options.serviceWorkerTarget.addEventListener('controllerchange', handleControllerChange)
  try {
    const registration = await options.serviceWorkerTarget.register(
      scriptUrl,
      {
        scope: scopePath,
        type: 'classic',
        updateViaCache: 'none',
      },
    )
    installingWorker = registration.installing
    installingWorker?.addEventListener('statechange', handleInstallingStateChange)
    handleInstallingStateChange()
    options.onRegistered?.(registration)

    return {
      registration,
      dispose() {
        options.serviceWorkerTarget.removeEventListener('controllerchange', handleControllerChange)
        installingWorker?.removeEventListener('statechange', handleInstallingStateChange)
      },
    }
  } catch (error) {
    options.serviceWorkerTarget.removeEventListener('controllerchange', handleControllerChange)
    throw error
  }
}
