import { useCallback } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { emitPropsPanelOpen, emitFloatingPanelOpen } from '@/features/canvas/utils'
import { openFloatingPanelChat } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenSeed'
import { UI_COPY } from '@/lib/config'
import { getNextThemeMode, type ThemeMode } from '@/lib/ui/theme'
import { type GraphSchema } from '@/lib/graph/schema'
import { setGeospatialModeEnabled } from '@/features/geospatial/gympgrphBridge'
import { togglePortHandlesEnabledInSchema } from '@/lib/graph/portHandlesBehavior'
import type { MainPanelTabKey } from '@/features/toolbar/hooks/useMainPanelDrag'

export function useToolbarActions(
  schema: GraphSchema,
  setSchema: (s: GraphSchema) => void,
  setCanvasRenderMode: (m: '2d' | '3d') => void,
  themeMode: ThemeMode,
  setThemeMode: (mode: ThemeMode) => void,
  launchSpotlight: (mode?: 'tour' | 'stats') => void,
  openMainPanel: (tab: MainPanelTabKey) => void,
  onZoomSelection?: () => void,
  setZoomToSelectionMode?: (v: boolean) => void,
  setFitToScreenMode?: (v: boolean) => void,
  toggleFitToScreenMode?: () => void,
  fitToScreenMode?: boolean,
  zoomToSelectionMode?: boolean,
  renderMediaAsNodes?: boolean,
  setRenderMediaAsNodes?: (v: boolean) => void,
  canvasRenderMode?: '2d' | '3d',
  onGeospatialEnabledChange?: (enabled: boolean) => void,
) {
  const ensureBaselineUnlocked = useCallback((): boolean => {
    const state = useGraphStore.getState()
    if (state.documentStructureBaselineLock !== true) return true
    state.upsertUiToast({
      id: 'baseline-locked',
      kind: 'warning',
      message: UI_COPY.baselineLockedToast,
      ttlMs: 6000,
    })
    return false
  }, [])

  const handleLaunchStats = useCallback(() => {
    launchSpotlight('stats')
  }, [launchSpotlight])

  const handleLaunch = useCallback(() => {
    launchSpotlight()
  }, [launchSpotlight])

  const handleTogglePortHandles = useCallback(() => {
    if (!ensureBaselineUnlocked()) return
    const next = togglePortHandlesEnabledInSchema(schema)
    if (next.changed) setSchema(next.schema)
  }, [ensureBaselineUnlocked, schema, setSchema])

  const handleToggleNodeShapeMode = useCallback(() => {
    if (!ensureBaselineUnlocked()) return
    const current = schema
    const behavior = current.behavior
    const rawCur = behavior.nodeShapeMode
    const cur: NonNullable<NonNullable<GraphSchema['behavior']>['nodeShapeMode']> =
      rawCur === 'rect' || rawCur === 'diamond' || rawCur === 'hex' ? rawCur : 'circle'
    const order: ReadonlyArray<NonNullable<NonNullable<GraphSchema['behavior']>['nodeShapeMode']>> = [
      'circle',
      'rect',
      'diamond',
      'hex',
    ]
    const idx = order.indexOf(cur)
    const nextMode = order[(idx >= 0 ? idx + 1 : 0) % order.length]
    const next = {
      ...current,
      behavior: {
        ...behavior,
        nodeShapeMode: nextMode,
      },
    }
    setSchema(next as GraphSchema)
  }, [ensureBaselineUnlocked, schema, setSchema])

  const handleToggleGroupShapeMode = useCallback(() => {
    if (!ensureBaselineUnlocked()) return
    const current = schema
    const layout = current.layout || {}
    const groups = layout.groups || {}
    const cur = groups.shape === 'rect' ? 'rect' : 'geo'
    const nextShape = cur === 'rect' ? 'geo' : 'rect'
    const next = {
      ...current,
      layout: {
        ...layout,
        groups: {
          ...groups,
          shape: nextShape,
        },
      },
    }
    setSchema(next as GraphSchema)
  }, [ensureBaselineUnlocked, schema, setSchema])

  const handleToggleRadialLayout = useCallback(() => {
    if (!ensureBaselineUnlocked()) return
    const current = schema
    const layout = current.layout || {}
    const nextMode: NonNullable<NonNullable<GraphSchema['layout']>['mode']> =
      layout.mode === 'block' ? 'radial' : 'block'
    if (layout.mode === nextMode) return
    const next = {
      ...current,
      layout: { ...layout, mode: nextMode },
    }
    setSchema(next as GraphSchema)
  }, [ensureBaselineUnlocked, schema, setSchema])

  const handleOpenSettings = useCallback(() => {
    openMainPanel('settings')
  }, [openMainPanel])

  const handleOpenHistory = useCallback(() => {
    openMainPanel('history')
  }, [openMainPanel])

  const handleOpenHelp = useCallback(() => {
    openMainPanel('help')
  }, [openMainPanel])

  const handleOpenPropsPanel = useCallback(() => {
    emitPropsPanelOpen()
  }, [])

  const handleReset = useCallback(() => {
    try {
      useGraphStore.getState().resetAll()
    } catch {
      void 0
    }
  }, [])

  const handleToggleFitToScreen = useCallback(() => {
    if (!toggleFitToScreenMode) return
    toggleFitToScreenMode()
  }, [toggleFitToScreenMode])

  const handleToggleZoomToSelection = useCallback(() => {
    if (!setZoomToSelectionMode) return
    const next = !zoomToSelectionMode
    setZoomToSelectionMode(next)
    if (next) {
      if (onZoomSelection) {
        onZoomSelection()
      }
    }
  }, [zoomToSelectionMode, setZoomToSelectionMode, onZoomSelection])

  const handleToggleRenderMedia = useCallback(() => {
    if (setRenderMediaAsNodes) setRenderMediaAsNodes(!renderMediaAsNodes)
  }, [renderMediaAsNodes, setRenderMediaAsNodes])

  const handleToggle3DMode = useCallback(() => {
    if (!ensureBaselineUnlocked()) return
    const next = canvasRenderMode === '3d' ? '2d' : '3d'
    setCanvasRenderMode(next)
  }, [canvasRenderMode, ensureBaselineUnlocked, setCanvasRenderMode])

  const handleOpenChat = useCallback(() => {
    openFloatingPanelChat()
  }, [])

  const handleOpenGeospatialMode = useCallback(() => {
    void setGeospatialModeEnabled(true)
      .then(nextEnabled => {
        onGeospatialEnabledChange?.(nextEnabled)
        if (nextEnabled) emitFloatingPanelOpen({ tab: 'geo', open: true })
      })
      .catch((err: unknown) => {
        try {
          const msg =
            err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message || '').trim() : ''
          useGraphStore.getState().pushUiToast({
            id: 'geospatial-mode-toggle-error',
            kind: 'error',
            message: `Geospatial Mode failed to load: ${msg || 'Unknown error'}`,
          })
        } catch {
          void 0
        }
      })
  }, [onGeospatialEnabledChange])

  const handleExitGeospatialMode = useCallback(() => {
    emitFloatingPanelOpen({ tab: 'geo', open: false })
    void setGeospatialModeEnabled(false)
      .then(nextEnabled => onGeospatialEnabledChange?.(nextEnabled))
      .catch((err: unknown) => {
        try {
          const msg =
            err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message || '').trim() : ''
          useGraphStore.getState().pushUiToast({
            id: 'geospatial-mode-exit-error',
            kind: 'error',
            message: `Canvas View Mode failed to restore: ${msg || 'Unknown error'}`,
          })
        } catch {
          void 0
        }
      })
  }, [onGeospatialEnabledChange])

  const handleToggleTheme = useCallback(() => {
    setThemeMode(getNextThemeMode(themeMode))
  }, [setThemeMode, themeMode])

  return {
    handleLaunchStats,
    handleLaunch,
    handleToggleNodeShapeMode,
    handleToggleGroupShapeMode,
    handleTogglePortHandles,
    handleToggleRadialLayout,
    handleOpenSettings,
    handleOpenHistory,
    handleOpenHelp,
    handleOpenPropsPanel,
    handleReset,
    handleToggleFitToScreen,
    handleToggleZoomToSelection,
    handleToggleRenderMedia,
    handleToggle3DMode,
    handleOpenChat,
    handleOpenGeospatialMode,
    handleExitGeospatialMode,
    handleToggleTheme,
  }
}
