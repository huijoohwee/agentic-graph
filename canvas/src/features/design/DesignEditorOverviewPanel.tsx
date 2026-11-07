import React from 'react'
import { Film, Hand, Layers, Maximize2, MousePointer, Palette, Redo, Ruler, Undo } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { useActiveGraphData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { dispatchRuntimeFitToViewSoon } from '@/lib/canvas/runtimeZoomDispatch'
import { readSnapGridConfigFromSchema } from '@/lib/canvas/gridSnap'
import { getIconSizeClass } from '@/lib/ui'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import { activateDesignEditorSurface } from '@/features/design/designEditorLaunchState'
import { DesignAgentVideoPanel } from '@/features/design/DesignAgentVideoPanel'
import { summarizeDesignTokens } from '@/features/design/designTokenSummary'

export const DESIGN_EDITOR_OVERVIEW_METRIC_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4'

export function DesignEditorOverviewPanel(props: {
  active: boolean
  onOpenLayers?: () => void
  onOpenInspector?: () => void
  onOpenTokens?: () => void
  onOpenVideo?: () => void
}) {
  const panelTypography = usePanelTypography()
  const graphData = useActiveGraphData()
  const {
    uiIconScale,
    uiIconStrokeWidth,
    graphDataRevision,
    canvasPointerMode2d,
    setCanvasPointerMode2d,
    designRendererNodes,
    selectedNodeId,
    selectedNodeIds,
    schema,
    canUndo,
    canRedo,
    undoDesignHistory,
    redoDesignHistory,
  } = useGraphStore(
    useShallow(s => ({
      uiIconScale: s.uiIconScale,
      uiIconStrokeWidth: s.uiIconStrokeWidth,
      graphDataRevision: s.graphDataRevision || 0,
      canvasPointerMode2d: s.canvasPointerMode2d,
      setCanvasPointerMode2d: s.setCanvasPointerMode2d,
      designRendererNodes: s.designRendererNodes,
      selectedNodeId: s.selectedNodeId,
      selectedNodeIds: Array.isArray(s.selectedNodeIds) ? s.selectedNodeIds : [],
      schema: s.schema,
      canUndo: s.canUndoDesignHistory(),
      canRedo: s.canRedoDesignHistory(),
      undoDesignHistory: s.undoDesignHistory,
      redoDesignHistory: s.redoDesignHistory,
    })),
  )

  const iconSizeClass = getIconSizeClass(uiIconScale)
  const snapGrid = React.useMemo(() => readSnapGridConfigFromSchema(schema), [schema])
  const tokenSummary = React.useMemo(
    () => summarizeDesignTokens({ graphData, graphRevision: graphDataRevision, maxEntries: 8 }),
    [graphData, graphDataRevision],
  )
  const selectedCount = React.useMemo(() => {
    const ids = selectedNodeIds.map(id => String(id || '').trim()).filter(Boolean)
    if (ids.length > 0) return Array.from(new Set(ids)).length
    return String(selectedNodeId || '').trim() ? 1 : 0
  }, [selectedNodeId, selectedNodeIds])
  const layerCount = Array.isArray(designRendererNodes) ? designRendererNodes.length : 0

  const buttonClass = cn(
    'App-toolbar__btn',
    UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
    'gap-1',
    UI_THEME_TOKENS.button.text,
    UI_THEME_TOKENS.button.hoverBg,
    panelTypography.microLabelClass,
  )
  const activeButtonClass = cn(buttonClass, UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeText)
  const statClass = cn('rounded border px-2 py-1', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)

  return (
    <section className="flex min-h-full flex-col gap-2 px-1 pb-2" aria-label="Design editor overview">
      <nav className={cn(uiToolbarRowScrollClassName, 'gap-1')} aria-label="Design editor actions">
        <button
          type="button"
          className={buttonClass}
          onClick={() => activateDesignEditorSurface({ openFloatingPanel: true })}
          aria-label="Activate Design editor"
          title="Activate Design editor"
        >
          <Palette className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          <span className="hidden sm:inline">Design</span>
        </button>
        <button
          type="button"
          className={canvasPointerMode2d === 'select' ? activeButtonClass : buttonClass}
          onClick={() => {
            activateDesignEditorSurface({ openFloatingPanel: true, pointerMode: 'select' })
            setCanvasPointerMode2d('select')
          }}
          aria-label="Select tool"
          title="Select tool"
        >
          <MousePointer className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          <span className="hidden sm:inline">Select</span>
        </button>
        <button
          type="button"
          className={canvasPointerMode2d === 'pan' ? activeButtonClass : buttonClass}
          onClick={() => {
            activateDesignEditorSurface({ openFloatingPanel: true, pointerMode: 'pan' })
            setCanvasPointerMode2d('pan')
          }}
          aria-label="Pan tool"
          title="Pan tool"
        >
          <Hand className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          <span className="hidden sm:inline">Pan</span>
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => dispatchRuntimeFitToViewSoon()}
          aria-label="Fit to view"
          title="Fit to view"
          disabled={!props.active}
        >
          <Maximize2 className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => undoDesignHistory()}
          aria-label="Undo"
          title="Undo"
          disabled={!props.active || !canUndo}
        >
          <Undo className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => redoDesignHistory()}
          aria-label="Redo"
          title="Redo"
          disabled={!props.active || !canRedo}
        >
          <Redo className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
      </nav>

      <section className={DESIGN_EDITOR_OVERVIEW_METRIC_GRID_CLASS_NAME} aria-label="Design editor state">
        <section className={statClass}>
          <section className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.tertiary)}>Mode</section>
          <section className={cn('mt-0.5 truncate font-mono text-xs', UI_THEME_TOKENS.text.primary)}>
            {props.active ? 'design' : 'inactive'}
          </section>
        </section>
        <section className={statClass}>
          <section className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.tertiary)}>Selected</section>
          <section className={cn('mt-0.5 truncate font-mono text-xs', UI_THEME_TOKENS.text.primary)}>{selectedCount}</section>
        </section>
        <section className={statClass}>
          <section className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.tertiary)}>Layers</section>
          <button
            type="button"
            className={cn('mt-0.5 flex max-w-full items-center gap-1 truncate font-mono text-xs', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
            onClick={props.onOpenLayers}
            disabled={!props.onOpenLayers}
          >
            <Layers className="h-3 w-3 shrink-0" strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span className="truncate">{layerCount}</span>
          </button>
        </section>
        <section className={statClass}>
          <section className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.tertiary)}>Snap</section>
          <section className={cn('mt-0.5 truncate font-mono text-xs', snapGrid.enabled ? UI_THEME_TOKENS.text.primary : UI_THEME_TOKENS.text.tertiary)}>
            {snapGrid.enabled ? 'on' : 'off'}
          </section>
        </section>
      </section>

      <section className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} aria-label="Design tokens state">
        <header className={cn(uiToolbarRowScrollClassName, 'justify-between gap-2')}>
          <section className={cn('text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>Tokens</section>
          <button
            type="button"
            className={cn('App-toolbar__btn', UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, 'gap-1', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg, panelTypography.microLabelClass)}
            onClick={props.onOpenTokens}
            disabled={!props.onOpenTokens}
          >
            <Palette className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span className="hidden sm:inline">Open</span>
          </button>
        </header>
        <dl className={`mt-2 ${DESIGN_EDITOR_OVERVIEW_METRIC_GRID_CLASS_NAME}`}>
          {[
            ['Colors', tokenSummary.colorEntries.length],
            ['Typography', tokenSummary.typographyEntries.length],
            ['Spacing', tokenSummary.spacingEntries.length],
            ['Types', tokenSummary.typeEntries.length],
          ].map(([label, value]) => (
            <section key={String(label)} className={cn('rounded border px-2 py-1', UI_THEME_TOKENS.panel.border)}>
              <dt className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.tertiary)}>{label}</dt>
              <dd className={cn('m-0 mt-0.5 font-mono text-xs', UI_THEME_TOKENS.text.primary)}>{value}</dd>
            </section>
          ))}
        </dl>
      </section>

      <DesignAgentVideoPanel active={props.active} />

      <section className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} aria-label="Design inspection shortcuts">
        <nav className={cn(uiToolbarRowScrollClassName, 'gap-1')}>
          <button
            type="button"
            className={buttonClass}
            onClick={props.onOpenInspector}
            disabled={!props.onOpenInspector}
          >
            <Ruler className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span>Inspector</span>
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={props.onOpenLayers}
            disabled={!props.onOpenLayers}
          >
            <Layers className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span>Layers</span>
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={props.onOpenVideo}
            disabled={!props.onOpenVideo}
          >
            <Film className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span>Video</span>
          </button>
        </nav>
      </section>
    </section>
  )
}
