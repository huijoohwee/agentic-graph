import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  XR_BROWSER_GRAPHICS_CAPABILITY_DEFAULTS,
  readBrowserXrGraphicsCapabilities,
  resolveXrPanelRuntimeStack,
  resolveXrPanelSourceProfile,
} from '@/features/three/xrPanelModel'
import {
  SPATIAL_CAPTURE_RAIL_BUTTONS,
  SPATIAL_CAPTURE_TOOL_BUTTONS,
  readSpatialCaptureAxis,
  readSpatialCaptureCenterAction,
  readSpatialCapturePrimaryMode,
  readSpatialCaptureTool,
  readSpatialCaptureToolLabel,
  setSpatialCaptureAxis,
  setSpatialCaptureCenterAction,
  setSpatialCapturePrimaryMode,
  setSpatialCaptureTool,
  subscribeSpatialCaptureAxis,
  subscribeSpatialCaptureCenterAction,
  subscribeSpatialCapturePrimaryMode,
  subscribeSpatialCaptureTool,
} from '@/features/three/xrSpatialCaptureTools'
import type { SpatialCaptureAxisId, SpatialCaptureCenterActionId, SpatialCapturePrimaryModeId, SpatialCaptureToolId } from '@/features/three/xrSpatialCaptureTools'
import { GaussianSplatEditorSection } from '@/features/three/GaussianSplatEditorSection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export function SpatialAssetToolsPanel() {
  const [capabilities, setCapabilities] = React.useState(XR_BROWSER_GRAPHICS_CAPABILITY_DEFAULTS)
  const [spatialTool, setSpatialToolState] = React.useState<SpatialCaptureToolId>(readSpatialCaptureTool())
  const [spatialPrimaryMode, setSpatialPrimaryModeState] = React.useState<SpatialCapturePrimaryModeId>(readSpatialCapturePrimaryMode())
  const [spatialAxis, setSpatialAxisState] = React.useState<SpatialCaptureAxisId>(readSpatialCaptureAxis())
  const [spatialCenterAction, setSpatialCenterActionState] = React.useState<SpatialCaptureCenterActionId>(readSpatialCaptureCenterAction())
  const {
    canvas3dMode,
    canvasRenderMode,
    markdownDocumentName,
    markdownDocumentText,
  } = useGraphStore(
    useShallow(state => ({
      canvas3dMode: state.canvas3dMode,
      canvasRenderMode: state.canvasRenderMode,
      markdownDocumentName: state.markdownDocumentName,
      markdownDocumentText: state.markdownDocumentText,
    })),
  )
  React.useEffect(() => subscribeSpatialCaptureTool(setSpatialToolState), [])
  React.useEffect(() => subscribeSpatialCapturePrimaryMode(setSpatialPrimaryModeState), [])
  React.useEffect(() => subscribeSpatialCaptureAxis(setSpatialAxisState), [])
  React.useEffect(() => subscribeSpatialCaptureCenterAction(setSpatialCenterActionState), [])
  React.useEffect(() => {
    setCapabilities(readBrowserXrGraphicsCapabilities())
  }, [])

  const xrActive = canvasRenderMode === '3d' && canvas3dMode === 'xr'
  const sourceProfile = React.useMemo(() => resolveXrPanelSourceProfile(markdownDocumentText || ''), [markdownDocumentText])
  const runtimeStack = React.useMemo(() => resolveXrPanelRuntimeStack({ capabilities, profile: sourceProfile, xrActive }), [capabilities, sourceProfile, xrActive])
  if (sourceProfile.kind !== 'spatial-capture') return null

  return (
    <section
      className={cn('grid min-w-0 gap-2', UI_THEME_TOKENS.text.primary)}
      aria-label="3D spatial asset tools"
      data-kg-media-3d-spatial-tools="1"
      data-kg-media-3d-spatial-format={sourceProfile.format}
      data-kg-media-3d-ingestion-cache={sourceProfile.ingestionCacheKey ? '1' : '0'}
      data-kg-media-3d-render-cache={sourceProfile.renderCacheKey ? '1' : '0'}
      data-kg-media-3d-runtime-stack={runtimeStack.map(item => `${item.id}:${item.state}`).join('|')}
    >
      <GaussianSplatEditorSection
        documentName={markdownDocumentName || 'spatial-capture'}
        sourceFormat={sourceProfile.format}
      />

      <section className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} aria-label="3D graphics stack" data-kg-media-3d-graphics-stack="1">
        <h3 className="text-xs font-semibold uppercase">Graphics</h3>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
          {runtimeStack.map(item => (
            <React.Fragment key={item.id}>
              <dt className={UI_THEME_TOKENS.text.tertiary}>{item.label}</dt>
              <dd>{item.value}</dd>
              <dd data-kg-media-3d-capability={item.id} data-kg-media-3d-capability-state={item.state}>{item.state}</dd>
            </React.Fragment>
          ))}
        </dl>
      </section>

      <section
        className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
        aria-label="3D spatial capture tools"
        data-kg-media-3d-spatial-controls="1"
        data-kg-media-3d-spatial-tool-active={spatialTool}
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <section className="min-w-0">
            <h3 className="text-xs font-semibold uppercase">Spatial Tools</h3>
            <output className={cn('block truncate text-xs', UI_THEME_TOKENS.text.tertiary)} data-kg-media-3d-spatial-tool-label="1">
              {readSpatialCaptureToolLabel(spatialTool)}
            </output>
          </section>
          <aside className="flex shrink-0 items-center gap-1" aria-label="3D spatial axes" data-kg-media-3d-axis-widget="1">
            {(['x', 'y', 'z'] as const).map(axis => (
              <button
                key={axis}
                type="button"
                aria-label={`3D ${axis.toUpperCase()} axis`}
                aria-pressed={spatialAxis === axis}
                className={cn(
                  'grid size-6 place-items-center rounded-full border text-xs font-semibold',
                  UI_THEME_TOKENS.panel.border,
                  spatialAxis === axis ? 'ring-2 ring-sky-300' : '',
                  axis === 'x' ? 'bg-rose-400/80 text-white' : axis === 'y' ? 'bg-emerald-400/80 text-slate-950' : 'bg-indigo-500/80 text-white',
                )}
                onClick={() => setSpatialCaptureAxis(axis)}
                data-kg-media-3d-axis={axis}
              >
                {axis.toUpperCase()}
              </button>
            ))}
          </aside>
          <fieldset className="flex shrink-0 items-center gap-1" aria-label="3D center actions" data-kg-media-3d-center-controls="1" data-kg-media-3d-center-action-active={spatialCenterAction}>
            {(['set', 'add', 'remove'] as const).map(action => (
              <button
                key={action}
                type="button"
                aria-pressed={spatialCenterAction === action}
                className={cn('App-toolbar__btn capitalize', spatialCenterAction === action ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg)}
                data-kg-media-3d-center-action={action}
                onClick={() => setSpatialCaptureCenterAction(action)}
              >
                {action}
              </button>
            ))}
            <output className={cn('rounded border px-2 py-1 text-xs', UI_THEME_TOKENS.panel.border)} data-kg-media-3d-center-radius="1">1</output>
            <output className={cn('text-xs', UI_THEME_TOKENS.text.tertiary)}>Radius</output>
          </fieldset>
        </header>
        <nav className="mt-2 flex max-w-full items-center gap-1 overflow-x-auto pb-1" aria-label="3D spatial capture primary modes" data-kg-media-3d-primary-modes="1" data-kg-media-3d-primary-mode-active={spatialPrimaryMode}>
          {SPATIAL_CAPTURE_RAIL_BUTTONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={`3D ${label}`}
              aria-pressed={spatialPrimaryMode === id}
              title={label}
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded border',
                UI_THEME_TOKENS.panel.border,
                spatialPrimaryMode === id ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg,
              )}
              onClick={() => setSpatialCapturePrimaryMode(id)}
              data-kg-media-3d-primary-mode={id}
            >
              <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
            </button>
          ))}
        </nav>
        <nav className="mt-2 flex max-w-full items-center gap-1 overflow-x-auto pb-1" aria-label="3D spatial capture viewport tools" data-kg-media-3d-spatial-toolbar="1">
          {SPATIAL_CAPTURE_TOOL_BUTTONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={`3D ${label}`}
              aria-pressed={spatialTool === id}
              title={label}
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded border',
                UI_THEME_TOKENS.panel.border,
                spatialTool === id ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg,
              )}
              onClick={() => setSpatialCaptureTool(id)}
              data-kg-media-3d-spatial-tool={id}
            >
              <Icon className="size-4" strokeWidth={1.7} aria-hidden="true" />
            </button>
          ))}
        </nav>
      </section>
    </section>
  )
}
