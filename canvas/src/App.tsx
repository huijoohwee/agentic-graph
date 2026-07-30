import { Suspense, lazy, useEffect, useLayoutEffect, useMemo } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import Canvas from '@/pages/Canvas'
import { cancelIdle, scheduleIdle } from '@/features/panels/utils/idle'
import { CanvasRouteRuntime } from '@/features/canvas/CanvasRouteRuntime'
import { LS_KEYS } from '@/lib/config.ls'
import { resolveRouterBasename } from '@/lib/routing/basePath'
import { getLocalStorage, resolveBrowserStorageKey } from '@/lib/persistence'
import { applyThemeMode, getInitialThemeMode } from '@/lib/ui/theme'
import { ensureWorkspaceLayoutTokensInstalled } from '@/lib/workspace/workspaceLayoutSettings'
import { KnowgrphRuntimeIdentityRuntime } from '@/features/runtime-identity/KnowgrphRuntimeIdentityRuntime'
import { XrMotionReferenceRuntimeBridge } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { CanvasSourceAuthorityBoundary } from '@/features/canvas/CanvasSourceAuthorityBoundary'
import { AgenticOsRemoteGrammarAutoHydrationBoundary } from '@/features/agentic-os/useAgenticOsRemoteGrammarAutoHydration'

const PerformanceAutomationReadoutLazy = lazy(async () => ({
  default: (await import('@/features/canvas/PerformanceAutomationReadout')).PerformanceAutomationReadout,
}))
const ToastHostLazy = lazy(() => import('@/components/ui/ToastHost'))
const RichMediaBrowserSmokePageLazy = lazy(async () => ({
  default: (await import('@/features/testing/RichMediaBrowserSmokePage')).RichMediaBrowserSmokePage,
}))
const MobileKeyboardBrowserSmokePageLazy = lazy(async () => ({
  default: (await import('@/features/testing/MobileKeyboardBrowserSmokePage')).MobileKeyboardBrowserSmokePage,
}))
const StoryboardRichMediaDropSmokePageLazy = lazy(async () => ({
  default: (await import('@/features/testing/StoryboardRichMediaDropSmokePage')).StoryboardRichMediaDropSmokePage,
}))

function AppThemeRuntime() {
  useLayoutEffect(() => {
    applyThemeMode(getInitialThemeMode(getLocalStorage()))
    ensureWorkspaceLayoutTokensInstalled()
  }, [])

  return null
}

export default function App() {
  const basename = resolveRouterBasename(import.meta.env.BASE_URL)
  const performanceAutomationReadoutEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('kgAutomationPerf') === '1'
  }, [])
  const richMediaBrowserSmokeRequested = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    const pathname = String(window.location.pathname || '')
    const kgPath = String(params.get('kgPath') || '')
    return pathname === '/__smoke__/rich-media' || kgPath === '/__smoke__/rich-media'
  }, [])
  const mobileKeyboardBrowserSmokeRequested = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    const pathname = String(window.location.pathname || '')
    const kgPath = String(params.get('kgPath') || '')
    return pathname === '/__smoke__/mobile-keyboard' || kgPath === '/__smoke__/mobile-keyboard'
  }, [])
  const storyboardRichMediaDropSmokeRequested = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    const pathname = String(window.location.pathname || '')
    const kgPath = String(params.get('kgPath') || '')
    return pathname === '/__smoke__/storyboard-rich-media-drop' || kgPath === '/__smoke__/storyboard-rich-media-drop'
  }, [])
  useEffect(() => {
    let cancelled = false
    let cleanupTheme = () => void 0
    let cleanupIntegration = () => void 0
    let cleanupWorkspaceRuntime = () => void 0
    let cleanupFeishuBaseSourceImport = () => void 0
    let storageHandler: ((e: StorageEvent) => void) | null = null

    const handle = scheduleIdle(() => {
      void import('@/features/agent-ready/workspaceRuntimeCommand')
        .then(workspaceRuntimeModule => {
          if (cancelled) return
          cleanupWorkspaceRuntime = workspaceRuntimeModule.installWorkspaceRuntimeCommand()
        })
        .catch(error => {
          if (cancelled) return
          console.warn('[knowgrph] workspace runtime command unavailable', error)
        })

      void import('@/features/source-files/feishuBaseSourceImportCommand')
        .then(feishuBaseSourceImportModule => {
          if (cancelled) return
          cleanupFeishuBaseSourceImport = feishuBaseSourceImportModule.installFeishuBaseSourceImportCommand()
        })
        .catch(error => {
          if (cancelled) return
          console.warn('[knowgrph] feishu base source import command unavailable', error)
        })

      void Promise.all([
        import('@/lib/canvas/interaction-user-select'),
        import('@/lib/canvas/interaction-recovery'),
        import('@/lib/canvas/space-pan'),
        import('@/lib/ui/tokens-ssot'),
        import('@/features/integrations/command'),
        import('@/features/spotlight/storage'),
        import('@/lib/persistence'),
        import('@/lib/ui/theme'),
        import('@/hooks/useGraphStore'),
      ])
        .then(([
          interactionUserSelectModule,
          interactionRecoveryModule,
          spacePanModule,
          tokensModule,
          integrationsModule,
          spotlightStorageModule,
          persistenceModule,
          themeModule,
          graphStoreModule,
        ]) => {
          if (cancelled) return

          interactionUserSelectModule.installGlobalUserSelectFailsafe()
          spacePanModule.ensureSpacePanKeyListenerInstalled()
          interactionRecoveryModule.installGlobalInteractionRecovery()
          tokensModule.ensureKgTokensInstalled()
          cleanupIntegration = integrationsModule.installIntegrationUtilityCommand()

          const storage = persistenceModule.getLocalStorage()
          spotlightStorageModule.clearOnboardingSpotlight(storage)

          cleanupTheme = themeModule.subscribeToSystemThemeChanges(() => {
            try {
              graphStoreModule.useGraphStore.getState().refreshResolvedThemeModeFromSystem()
            } catch {
              void 0
            }
            tokensModule.ensureKgTokensInstalled()
          })

          storageHandler = (e: StorageEvent) => {
            try {
              if (e.storageArea !== window.localStorage) return
              if (e.key !== resolveBrowserStorageKey(LS_KEYS.themeMode)) return
              const v = String(e.newValue || '').trim()
              const mode = v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
              graphStoreModule.useGraphStore.getState().setThemeMode(mode)
              tokensModule.ensureKgTokensInstalled()
            } catch {
              void 0
            }
          }
          window.addEventListener('storage', storageHandler)
        })
        .catch(() => {
          if (cancelled) return
        })
    })

    return () => {
      cancelled = true
      try {
        cancelIdle(handle)
      } catch {
        void 0
      }
      try {
        cleanupTheme()
      } catch {
        void 0
      }
      try {
        cleanupIntegration()
      } catch {
        void 0
      }
      try {
        cleanupWorkspaceRuntime()
      } catch {
        void 0
      }
      try {
        cleanupFeishuBaseSourceImport()
      } catch {
        void 0
      }
      if (storageHandler) {
        window.removeEventListener('storage', storageHandler)
      }
    }
  }, [])
  return (
    <Router basename={basename}>
      <CanvasSourceAuthorityBoundary>
        <AgenticOsRemoteGrammarAutoHydrationBoundary>
          <AppThemeRuntime />
          <KnowgrphRuntimeIdentityRuntime />
          <XrMotionReferenceRuntimeBridge />
          <CanvasRouteRuntime />
          {performanceAutomationReadoutEnabled ? (
            <Suspense fallback={null}>
              <PerformanceAutomationReadoutLazy />
            </Suspense>
          ) : null}
          <Suspense fallback={null}>
            <ToastHostLazy />
          </Suspense>
          <ErrorBoundary>
            <Routes>
              <Route
                path="/*"
                element={richMediaBrowserSmokeRequested ? (
                  <Suspense fallback={null}>
                    <RichMediaBrowserSmokePageLazy />
                  </Suspense>
                ) : mobileKeyboardBrowserSmokeRequested ? (
                  <Suspense fallback={null}>
                    <MobileKeyboardBrowserSmokePageLazy />
                  </Suspense>
                ) : storyboardRichMediaDropSmokeRequested ? (
                  <Suspense fallback={null}>
                    <StoryboardRichMediaDropSmokePageLazy />
                  </Suspense>
                ) : <Canvas />}
              />
            </Routes>
          </ErrorBoundary>
        </AgenticOsRemoteGrammarAutoHydrationBoundary>
      </CanvasSourceAuthorityBoundary>
    </Router>
  )
}
