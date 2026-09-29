import React from 'react'
import { FileCode, Film, Hand, Layers, ListTree, Maximize2, MonitorPlay, MousePointer, Palette, Redo, Ruler, Undo } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import { dispatchRuntimeFitToViewSoon } from '@/lib/canvas/runtimeZoomDispatch'
import { readSnapGridConfigFromSchema } from '@/lib/canvas/gridSnap'
import { getIconSizeClass } from '@/lib/ui'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import {
  UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_NARROW_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'

import DesignDomInspectPanel from '@/features/design/DesignDomInspectPanel'
import DesignDomTreePanel from '@/features/design/DesignDomTreePanel'
import { DesignAgentVideoPanel } from '@/features/design/DesignAgentVideoPanel'
import { DesignEditorOverviewPanel } from '@/features/design/DesignEditorOverviewPanel'
import DesignInspectorPanel from '@/features/design/DesignInspectorPanel'
import DesignLayersPanel from '@/features/design/DesignLayersPanel'
import DesignTokensPanel from '@/features/design/DesignTokensPanel'

type DesignFloatingPanelTab = 'overview' | 'layers' | 'inspector' | 'tokens' | 'domTree' | 'domInspect' | 'video'

export function DesignFloatingPanelView({ active }: { active: boolean }) {
  const panelTypography = usePanelTypography()
  const {
    uiIconScale,
    uiIconStrokeWidth,
    canvasPointerMode2d,
    setCanvasPointerMode2d,
    schema,
    canUndo,
    canRedo,
    undoDesignHistory,
    redoDesignHistory,
    lastLabel,
  } = useGraphStore(
    useShallow(s => ({
      uiIconScale: s.uiIconScale,
      uiIconStrokeWidth: s.uiIconStrokeWidth,
      canvasPointerMode2d: s.canvasPointerMode2d,
      setCanvasPointerMode2d: s.setCanvasPointerMode2d,
      schema: s.schema,
      canUndo: s.canUndoDesignHistory(),
      canRedo: s.canRedoDesignHistory(),
      undoDesignHistory: s.undoDesignHistory,
      redoDesignHistory: s.redoDesignHistory,
      lastLabel: s.getDesignHistoryLastLabel(),
    })),
  )
  const iconSizeClass = getIconSizeClass(uiIconScale)

  const [tab, setTab] = React.useState<DesignFloatingPanelTab>('overview')
  const snapGrid = React.useMemo(() => readSnapGridConfigFromSchema(schema), [schema])

  const tabs = React.useMemo(
    () =>
      [
        { id: 'overview' as const, title: 'Overview', icon: MonitorPlay },
        { id: 'layers' as const, title: 'Layers', icon: Layers },
        { id: 'inspector' as const, title: 'Style', icon: Ruler },
        { id: 'tokens' as const, title: 'Tokens', icon: Palette },
        { id: 'domTree' as const, title: 'DOM Tree', icon: ListTree },
        { id: 'domInspect' as const, title: 'DOM Inspect', icon: FileCode },
        { id: 'video' as const, title: 'Video', icon: Film },
      ] satisfies Array<{ id: DesignFloatingPanelTab; title: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }>,
    [],
  )

  return (
    <section className="h-full flex flex-col" aria-label="Design panel">
      <header className={cn(uiToolbarRowScrollClassName, 'justify-between gap-2 w-full select-none', UI_THEME_TOKENS.panel.divider)}>
        <section className="flex min-w-0 items-center gap-2 px-1 py-1">
          <section className={cn('text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>2D Renderer: Design</section>
          {lastLabel ? <section className={cn('min-w-0 truncate text-xs', UI_THEME_TOKENS.text.tertiary)}>{lastLabel}</section> : null}
        </section>
        <nav className={`${uiToolbarRowScrollClassName} gap-1`} aria-label="Design panel controls">
          <button
            type="button"
            className={cn(
              'App-toolbar__btn',
              UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
              'gap-1',
              canvasPointerMode2d === 'select' ? UI_THEME_TOKENS.text.primary : UI_THEME_TOKENS.text.secondary,
              UI_THEME_TOKENS.button.hoverBg,
              panelTypography.microLabelClass,
            )}
            onClick={() => {
              if (!active) return
              setCanvasPointerMode2d('select')
            }}
            title="Select tool (V)"
            aria-label="Select tool"
            disabled={!active}
          >
            <MousePointer className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span className="hidden md:inline">Select</span>
          </button>
          <button
            type="button"
            className={cn(
              'App-toolbar__btn',
              UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
              'gap-1',
              canvasPointerMode2d === 'pan' ? UI_THEME_TOKENS.text.primary : UI_THEME_TOKENS.text.secondary,
              UI_THEME_TOKENS.button.hoverBg,
              panelTypography.microLabelClass,
            )}
            onClick={() => {
              if (!active) return
              setCanvasPointerMode2d('pan')
            }}
            title="Pan tool (H)"
            aria-label="Pan tool"
            disabled={!active}
          >
            <Hand className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span className="hidden md:inline">Pan</span>
          </button>
          <button
            type="button"
            className={cn('App-toolbar__btn', UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, 'gap-1', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg, panelTypography.microLabelClass)}
            onClick={() => {
              if (!active) return
              dispatchRuntimeFitToViewSoon()
            }}
            title="Fit to view"
            aria-label="Fit to view"
            disabled={!active}
          >
            <Maximize2 className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span className="hidden md:inline">Fit</span>
          </button>
          <span className={cn('mx-1 h-4 w-px', UI_THEME_TOKENS.panel.border)} aria-hidden={true} />
          <button
            type="button"
            className={cn('App-toolbar__btn', UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, 'justify-center', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
            onClick={() => {
              if (!active) return
              undoDesignHistory()
            }}
            title="Undo (Cmd/Ctrl+Z)"
            aria-label="Undo"
            disabled={!active || !canUndo}
          >
            <Undo className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          </button>
          <button
            type="button"
            className={cn('App-toolbar__btn', UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, 'justify-center', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
            onClick={() => {
              if (!active) return
              redoDesignHistory()
            }}
            title="Redo (Shift+Cmd/Ctrl+Z)"
            aria-label="Redo"
            disabled={!active || !canRedo}
          >
            <Redo className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          </button>
          <span className={cn('ml-1 text-xs font-mono', snapGrid.enabled ? UI_THEME_TOKENS.text.primary : UI_THEME_TOKENS.text.tertiary)}>
            Snap:{snapGrid.enabled ? 'On' : 'Off'}
          </span>
        </nav>
        <ToolbarDropdownSelect
          value={tab}
          options={tabs}
          title={`Design section: ${tabs.find(item => item.id === tab)?.title || 'Overview'}`}
          showTooltip={false}
          isButtonActive={true}
          onSelect={id => setTab(id as DesignFloatingPanelTab)}
          renderButtonContent={activeOption => {
            const ActiveIcon = activeOption.icon
            return (
              <>
                <ActiveIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
                <span className={cn('hidden sm:inline', panelTypography.microLabelClass)}>
                  {activeOption.title}
                </span>
              </>
            )
          }}
          renderOptionContent={option => {
            const OptionIcon = option.icon
            return (
              <>
                <OptionIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
                <span className="truncate">{option.title}</span>
              </>
            )
          }}
          menuWidthClass={UI_RESPONSIVE_NARROW_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME}
        />
      </header>
      <nav className={cn(uiToolbarRowScrollClassName, 'mt-1 gap-1 px-1')} aria-label="Design workspace sections">
        {tabs.map(item => {
          const Icon = item.icon
          const activeTab = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                'App-toolbar__btn',
                UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
                'gap-1',
                activeTab ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg,
                activeTab ? UI_THEME_TOKENS.button.activeText : UI_THEME_TOKENS.button.text,
                panelTypography.microLabelClass,
              )}
              onClick={() => setTab(item.id)}
              aria-current={activeTab ? 'page' : undefined}
              aria-label={`Open ${item.title}`}
              title={item.title}
            >
              <Icon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
              <span className="hidden sm:inline">{item.title}</span>
            </button>
          )
        })}
      </nav>
      <section className={cn(UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME, 'mt-1', panelTypography.panelTextClass)}>
        {tab === 'overview' && (
          <DesignEditorOverviewPanel
            active={active}
            onOpenLayers={() => setTab('layers')}
            onOpenInspector={() => setTab('inspector')}
            onOpenTokens={() => setTab('tokens')}
            onOpenVideo={() => setTab('video')}
          />
        )}
        {tab === 'layers' && <DesignLayersPanel active={active} />}
        {tab === 'inspector' && <DesignInspectorPanel active={active} />}
        {tab === 'tokens' && <DesignTokensPanel active={active} />}
        {tab === 'domTree' && <DesignDomTreePanel active={active} />}
        {tab === 'domInspect' && <DesignDomInspectPanel active={active} />}
        {tab === 'video' && <section className="px-1 pb-2"><DesignAgentVideoPanel active={active} /></section>}
      </section>
    </section>
  )
}
