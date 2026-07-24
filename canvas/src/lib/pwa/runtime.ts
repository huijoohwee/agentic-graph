import { useGraphStore } from '@/hooks/useGraphStore'
import { readKnowgrphSourceRevision } from '@/features/runtime-identity/knowgrphRuntimeIdentity'
import {
  installServiceWorkerCacheRevisionOwner,
  readActiveServiceWorkerSourceRevision,
  type ServiceWorkerCacheRevisionOwner,
} from '@/lib/pwa/serviceWorkerCacheRevisionOwner'
import { registerCanonicalServiceWorker } from '@/lib/pwa/serviceWorkerRegistrationOwner'
import { installServiceWorkerRevisionUpdateOwner } from '@/lib/pwa/serviceWorkerRevisionUpdateOwner'

const DISPLAY_MODE_STANDALONE_MEDIA = '(display-mode: standalone)'
const DISPLAY_MODE_FULLSCREEN_MEDIA = '(display-mode: fullscreen)'
const DISPLAY_MODE_MINIMAL_UI_MEDIA = '(display-mode: minimal-ui)'

type NavigatorWithStandalone = Navigator & { standalone?: boolean }
type PwaDisplayMode = 'browser' | 'standalone' | 'fullscreen' | 'minimal-ui'

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
let cacheRevisionOwner: ServiceWorkerCacheRevisionOwner | null = null
let disposeWorkerUpdateOwner: (() => void) | null = null

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredInstallPrompt
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) return false
  try {
    await deferredInstallPrompt.prompt()
    const result = await deferredInstallPrompt.userChoice
    deferredInstallPrompt = null
    return result.outcome === 'accepted'
  } catch {
    deferredInstallPrompt = null
    return false
  }
}

const pushPwaToast = (args: {
  id: string
  kind: 'success' | 'warning' | 'neutral'
  message: string
  ttlMs?: number | null
  dismissible?: boolean
}): void => {
  try {
    useGraphStore.getState().upsertUiToast({
      id: args.id,
      kind: args.kind,
      message: args.message,
      ttlMs: args.ttlMs,
      dismissible: args.dismissible,
      log: false,
    })
  } catch {
    void 0
  }
}

const readPwaDisplayMode = (): PwaDisplayMode => {
  if (typeof window === 'undefined') return 'browser'
  try {
    if (typeof window.matchMedia === 'function') {
      if (window.matchMedia(DISPLAY_MODE_FULLSCREEN_MEDIA).matches) return 'fullscreen'
      if (window.matchMedia(DISPLAY_MODE_STANDALONE_MEDIA).matches) return 'standalone'
      if (window.matchMedia(DISPLAY_MODE_MINIMAL_UI_MEDIA).matches) return 'minimal-ui'
    }
  } catch {
    void 0
  }
  try {
    if ((window.navigator as NavigatorWithStandalone).standalone === true) return 'standalone'
  } catch {
    void 0
  }
  return 'browser'
}

const applyPwaDisplayModeState = (installedHint: boolean, swState?: { offlineReady?: boolean }): void => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (!root) return
  const displayMode = readPwaDisplayMode()
  root.dataset.kgDisplayMode = displayMode
  root.dataset.kgInstalled = displayMode === 'browser' && !installedHint ? '0' : '1'
  root.dataset.kgOfflineReady = swState?.offlineReady ? '1' : '0'
}

export function installPwaRuntime(): void {
  if (typeof window === 'undefined') return
  const swState = { offlineReady: false }
  let installedHint = readPwaDisplayMode() !== 'browser'
  applyPwaDisplayModeState(installedHint, swState)

  const displayModeMediaQueries =
    typeof window.matchMedia === 'function'
      ? [
          window.matchMedia(DISPLAY_MODE_STANDALONE_MEDIA),
          window.matchMedia(DISPLAY_MODE_FULLSCREEN_MEDIA),
          window.matchMedia(DISPLAY_MODE_MINIMAL_UI_MEDIA),
        ]
      : []
  const refreshDisplayModeState = () => applyPwaDisplayModeState(installedHint, swState)
  const handleStandaloneDisplayModeChange = () => {
    installedHint = installedHint || readPwaDisplayMode() !== 'browser'
    refreshDisplayModeState()
  }
  const handleAppInstalled = () => {
    installedHint = true
    refreshDisplayModeState()
    pushPwaToast({
      id: 'pwa:installed',
      kind: 'success',
      message: 'App installed for faster mobile relaunches.',
      ttlMs: 6000,
      dismissible: true,
    })
  }

  for (let i = 0; i < displayModeMediaQueries.length; i += 1) {
    const mediaQuery = displayModeMediaQueries[i]
    if (typeof mediaQuery?.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleStandaloneDisplayModeChange)
    } else if (typeof mediaQuery?.addListener === 'function') {
      mediaQuery.addListener(handleStandaloneDisplayModeChange)
    }
  }
  window.addEventListener('appinstalled', handleAppInstalled)

  const handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault()
    deferredInstallPrompt = event as BeforeInstallPromptEvent
    document.documentElement?.setAttribute('data-kg-installable', '1')
  }
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

  if (import.meta.env.PROD && 'serviceWorker' in window.navigator) {
    void registerCanonicalServiceWorker({
      serviceWorkerTarget: window.navigator.serviceWorker,
      scopePath: import.meta.env.BASE_URL,
      reload: () => window.location.reload(),
      onOfflineReady() {
        swState.offlineReady = true
        refreshDisplayModeState()
        pushPwaToast({
          id: 'pwa:offline-ready',
          kind: 'success',
          message: 'Application assets cached for faster relaunches.',
          ttlMs: 5000,
          dismissible: true,
        })
      },
      onRegistered(registration) {
        cacheRevisionOwner?.dispose()
        cacheRevisionOwner = 'caches' in window
          ? installServiceWorkerCacheRevisionOwner({
              cacheStorage: window.caches,
              controllerTarget: window.navigator.serviceWorker,
              registration,
              origin: window.location.origin,
              runInitially: true,
              onError(error) {
                try {
                  console.warn('[knowgrph] Service worker cache revision cleanup failed.', error)
                } catch {
                  void 0
                }
              },
            })
          : null
        disposeWorkerUpdateOwner?.()
        disposeWorkerUpdateOwner = installServiceWorkerRevisionUpdateOwner({
          registration,
          documentTarget: document,
          windowTarget: window,
          async isExpectedRevisionActive() {
            const activeWorker = registration.active
            if (!activeWorker || activeWorker.state !== 'activated') return false
            return await readActiveServiceWorkerSourceRevision(activeWorker)
              === readKnowgrphSourceRevision()
          },
          onUpdateSettled() {
            cacheRevisionOwner?.requestPrune()
          },
          onError(error) {
            try {
              console.warn('[knowgrph] Service worker revision check failed.', error)
            } catch {
              void 0
            }
          },
        })
      },
    }).catch(error => {
      swState.offlineReady = false
      refreshDisplayModeState()
      try {
        console.warn('[knowgrph] Offline shell registration failed.', error)
      } catch {
        void 0
      }
    })
  }
}
