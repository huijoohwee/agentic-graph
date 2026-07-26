import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { resolveXrMotionReferenceStage } from '@/features/three/xrSceneLibrary'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import {
  MainPanelTypeIcon,
  getMainPanelTypeIconMeta,
  resolveMainPanelKtvTypeIconKey,
} from '@/features/panels/ui/mainPanelHelpIconLibrary'

type GeospatialPanelHostProps = {
  active?: boolean
  showDatasetsManager?: boolean
  panelTypography?: unknown
  renderTypeIcon?: (args: { typeLabel: string }) => React.ReactNode
  snapshot?: unknown
  handlers?: unknown
}

const MissingGeospatialPanelHost = React.memo(function MissingGeospatialPanelHost(_props: GeospatialPanelHostProps) {
  return (
    <section className={`h-full w-full flex items-center justify-center text-xs ${UI_THEME_TOKENS.text.secondary}`}>
      Geospatial panel unavailable
    </section>
  )
})

const GeospatialPanelHostLazy = React.lazy(async (): Promise<{ default: React.ComponentType<GeospatialPanelHostProps> }> => {
  const module = (await import('gympgrph')) as unknown as Record<string, unknown>
  const panelHost = module.GeospatialPanelHost as unknown
  if (!panelHost) return { default: MissingGeospatialPanelHost }
  return { default: panelHost as React.ComponentType<GeospatialPanelHostProps> }
})

export const GeoView = React.memo(function GeoView(props: {
  geospatialModeEnabled: boolean
  isEnablingGeospatial: boolean
  geospatialEnableError: string | null
  onEnableGeospatial: () => void
}) {
  const {
    geospatialModeEnabled,
    isEnablingGeospatial,
    geospatialEnableError,
    onEnableGeospatial,
  } = props
  const activeGraphData = useActiveGraphRenderData()
  const xrRuntime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const selectedEnvironment = resolveXrMotionReferenceStage(xrRuntime.plan.stageId)
  const panelTypography = usePanelTypography()
  const uiIconScale = useGraphStore(state => state.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(state => state.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const gympgrphBridge = useGraphStore(
    useShallow(state => ({
      zoomState: state.zoomState,
      canvasRenderMode: state.canvasRenderMode,
      selectedNodeId: state.selectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
      selectedEdgeId: state.selectedEdgeId,
      selectNode: state.selectNode,
      selectEdge: state.selectEdge,
      setSelectionSource: state.setSelectionSource,
      requestZoom: state.requestZoom,
      requestThreeCamera: state.requestThreeCamera,
      pushUiToast: state.pushUiToast,
      upsertUiToast: state.upsertUiToast,
      dismissUiToast: state.dismissUiToast,
    })),
  )
  const renderGeospatialTypeIcon = React.useCallback(({ typeLabel }: { typeLabel: string }) => {
    const iconKey = resolveMainPanelKtvTypeIconKey(typeLabel)
    const meta = getMainPanelTypeIconMeta(iconKey)
    const label = String(typeLabel || meta.label).trim() || meta.label
    return (
      <span
        className="inline-flex min-h-5 min-w-5 items-center justify-center"
        title={`${label}: ${meta.label}`}
        role="img"
        aria-label={label}
      >
        <MainPanelTypeIcon
          iconKey={iconKey}
          className={`${iconSizeClass} ${UI_THEME_TOKENS.text.secondary}`}
          strokeWidth={uiIconStrokeWidth}
          ariaHidden
        />
      </span>
    )
  }, [iconSizeClass, uiIconStrokeWidth])

  return (
    <section className="h-full flex flex-col" aria-label="Geospatial panel">
      <section
        className={cn('grid gap-0.5 border-b px-3 py-2 text-[10px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
        aria-label="Selected XR environment"
        data-kg-geo-xr-environment={selectedEnvironment.id}
        data-kg-geo-xr-environment-source="xr-motion-reference-runtime"
      >
        <span className={UI_THEME_TOKENS.text.tertiary}>XR environment</span>
        <strong className="text-xs">{selectedEnvironment.label}</strong>
        <span className={UI_THEME_TOKENS.text.secondary}>
          {selectedEnvironment.environmentKind} · {selectedEnvironment.sizeMeters.join(' × ')} m · local authored stage
        </span>
      </section>
      {geospatialModeEnabled ? (
        <ErrorBoundary>
          <React.Suspense
            fallback={
              <section className={`p-3 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
                Loading geospatial panel...
              </section>
            }
          >
            <section className={cn('min-h-0 flex-1', UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME)}>
              <GeospatialPanelHostLazy
                active
                showDatasetsManager={false}
                panelTypography={panelTypography}
                renderTypeIcon={renderGeospatialTypeIcon}
                snapshot={{
                  graphData: activeGraphData,
                  zoomState: gympgrphBridge.zoomState,
                  canvasRenderMode: gympgrphBridge.canvasRenderMode,
                  selectedNodeId: gympgrphBridge.selectedNodeId,
                  selectedNodeIds: gympgrphBridge.selectedNodeIds,
                  selectedEdgeId: gympgrphBridge.selectedEdgeId,
                }}
                handlers={{
                  selectNode: gympgrphBridge.selectNode,
                  selectEdge: gympgrphBridge.selectEdge,
                  setSelectionSource: gympgrphBridge.setSelectionSource,
                  requestZoom: gympgrphBridge.requestZoom,
                  requestThreeCamera: gympgrphBridge.requestThreeCamera,
                  pushUiToast: gympgrphBridge.pushUiToast,
                  upsertUiToast: gympgrphBridge.upsertUiToast,
                  dismissUiToast: gympgrphBridge.dismissUiToast,
                }}
              />
            </section>
          </React.Suspense>
        </ErrorBoundary>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 p-3">
          <p className={cn('text-sm', UI_THEME_TOKENS.text.secondary)}>
            {isEnablingGeospatial
              ? 'Enabling Geospatial Mode...'
              : 'Enable Geospatial Mode to view this panel.'}
          </p>
          <button
            type="button"
            className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
            onClick={onEnableGeospatial}
            disabled={isEnablingGeospatial}
          >
            {isEnablingGeospatial ? 'Enabling Geo...' : 'Enable Geospatial Mode'}
          </button>
          {geospatialEnableError ? (
            <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>{geospatialEnableError}</p>
          ) : null}
        </section>
      )}
    </section>
  )
})
