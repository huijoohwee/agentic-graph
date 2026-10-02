import React from 'react'
import { Hand, Maximize2, MousePointer, Redo, Undo } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import { dispatchRuntimeFitToViewSoon } from '@/lib/canvas/runtimeZoomDispatch'
import {
  UI_RESPONSIVE_CANVAS_STATUS_ROW_CLASSNAME,
  UI_RESPONSIVE_CANVAS_TOOL_ACTION_CLASSNAME,
  UI_RESPONSIVE_DESIGN_CANVAS_EDITOR_CHROME_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { getIconSizeClass } from '@/lib/ui'
import { cn } from '@/lib/utils'

export function DesignCanvasEditorChrome(props: {
  active: boolean
  interactionActive: boolean
  selectedCount: number
  layerCount: number
}) {
  const {
    uiIconScale,
    uiIconStrokeWidth,
    canvasPointerMode2d,
    setCanvasPointerMode2d,
    canUndo,
    canRedo,
    undoDesignHistory,
    redoDesignHistory,
  } = useGraphStore(
    useShallow(s => ({
      uiIconScale: s.uiIconScale,
      uiIconStrokeWidth: s.uiIconStrokeWidth,
      canvasPointerMode2d: s.canvasPointerMode2d,
      setCanvasPointerMode2d: s.setCanvasPointerMode2d,
      canUndo: s.canUndoDesignHistory(),
      canRedo: s.canRedoDesignHistory(),
      undoDesignHistory: s.undoDesignHistory,
      redoDesignHistory: s.redoDesignHistory,
    })),
  )

  if (!props.active) return null

  const iconSizeClass = getIconSizeClass(uiIconScale)
  const buttonClass = cn(
    'App-toolbar__btn',
    UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
    UI_RESPONSIVE_CANVAS_TOOL_ACTION_CLASSNAME,
    UI_THEME_TOKENS.button.hoverBg,
    UI_THEME_TOKENS.button.text,
  )
  const activeButtonClass = cn(buttonClass, UI_THEME_TOKENS.button.activeText, UI_THEME_TOKENS.button.activeBg)
  const mode = canvasPointerMode2d === 'pan' ? 'Pan' : 'Select'

  return (
    <section className={UI_RESPONSIVE_DESIGN_CANVAS_EDITOR_CHROME_CLASSNAME} aria-label="Design editor chrome">
      <nav
        className={cn('pointer-events-auto flex shrink-0 flex-col gap-1 rounded border p-1 shadow-[var(--kg-shadow-raised)]', UI_THEME_TOKENS.panel.overlayBg, UI_THEME_TOKENS.panel.border)}
        aria-label="Design tools"
      >
        <button
          type="button"
          className={canvasPointerMode2d === 'select' ? activeButtonClass : buttonClass}
          onClick={() => props.interactionActive && setCanvasPointerMode2d('select')}
          title="Select tool"
          aria-label="Select tool"
          disabled={!props.interactionActive}
        >
          <MousePointer className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
        <button
          type="button"
          className={canvasPointerMode2d === 'pan' ? activeButtonClass : buttonClass}
          onClick={() => props.interactionActive && setCanvasPointerMode2d('pan')}
          title="Pan tool"
          aria-label="Pan tool"
          disabled={!props.interactionActive}
        >
          <Hand className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
        <span className={cn('mx-1 h-px', UI_THEME_TOKENS.panel.border)} aria-hidden={true} />
        <button
          type="button"
          className={buttonClass}
          onClick={() => props.interactionActive && undoDesignHistory()}
          title="Undo"
          aria-label="Undo"
          disabled={!props.interactionActive || !canUndo}
        >
          <Undo className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => props.interactionActive && redoDesignHistory()}
          title="Redo"
          aria-label="Redo"
          disabled={!props.interactionActive || !canRedo}
        >
          <Redo className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => props.interactionActive && dispatchRuntimeFitToViewSoon()}
          title="Fit to view"
          aria-label="Fit to view"
          disabled={!props.interactionActive}
        >
          <Maximize2 className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </button>
      </nav>
      <section
        className={cn(
          'pointer-events-none flex min-w-0 items-center gap-2 rounded border px-2 py-1 shadow-[var(--kg-shadow-raised)]',
          UI_RESPONSIVE_CANVAS_STATUS_ROW_CLASSNAME,
          UI_THEME_TOKENS.panel.overlayBg,
          UI_THEME_TOKENS.panel.border,
          UI_THEME_TOKENS.text.tertiary,
        )}
        aria-label="Design status"
      >
        <span className={cn('text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>Design</span>
        <span className="font-mono text-xs">{mode}</span>
        <span className="font-mono text-xs">{props.selectedCount} selected</span>
        <span className="hidden font-mono text-xs sm:inline">{props.layerCount} layers</span>
      </section>
    </section>
  )
}
