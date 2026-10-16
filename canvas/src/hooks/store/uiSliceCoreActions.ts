import { normalizeSingleLineControlClassName, normalizeUiIconStrokeWidth } from 'grph-shared/ui/themeTokens'
import { normalizeUiTextClasses } from 'grph-shared/ui/typography'

import type { StoreApi } from 'zustand'
import type { GraphState } from '@/hooks/store/types'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { lsSetBool, lsSetFloat, lsSetInt, lsSetJson, lsSetNum } from '@/lib/persistence'
import { clampFillRatio } from 'grph-shared/zoom/presets'
import { DEFAULT_DRAG_ALPHA_TARGET, DEFAULT_FIT_TO_SCREEN_FILL_RATIO } from '@/lib/graph/layoutDefaults'
import { buildWorkspaceGraphMutationTransitionState } from '@/features/workspace-table/workspaceTableSsot'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME,
  UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { normalizeBadgeChipBaseClassName } from '@/lib/ui/icons'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'

type SetGraph = StoreApi<GraphState>['setState']

export const createUiCoreActions = (set: SetGraph)=> ({
    setEditMode: (mode: boolean) => set({ isEditMode: mode }),

    setWorkspaceViewState: (next: { mode: 'canvas' | 'editor'; paneOpen?: boolean }) =>
      set(state => {
        const nextMode = next.mode === 'editor' ? 'editor' : 'canvas'
        const nextPaneOpen = nextMode === 'editor'
          ? next.paneOpen === false
            ? false
            : true
          : next.paneOpen === false
            ? false
            : next.paneOpen === true
              ? true
              : state.workspaceCanvasPaneOpen
        if (state.workspaceGraphMutationLayoutLockActive === true) return {}
        if (state.workspaceViewMode === nextMode && state.workspaceCanvasPaneOpen === nextPaneOpen) return {}
        if (state.workspaceViewMode !== nextMode) lsSetJson(LS_KEYS.workspaceViewMode, nextMode)
        if (state.workspaceCanvasPaneOpen !== nextPaneOpen) lsSetBool(LS_KEYS.workspaceCanvasPaneOpen, nextPaneOpen)
        return {
          workspaceViewMode: nextMode,
          workspaceCanvasPaneOpen: nextPaneOpen,
          ...buildWorkspaceGraphMutationTransitionState({
            workspaceViewMode: nextMode,
            workspaceCanvasPaneOpen: nextPaneOpen,
            markdownWorkspaceIndexingInFlight: state.markdownWorkspaceIndexingInFlight,
          }),
        } as Partial<GraphState>
      }),

    setWorkspaceViewMode: (mode: 'canvas' | 'editor') =>
      set(state => {
        const nextMode = mode === 'editor' ? 'editor' : 'canvas'
        const nextPaneOpen = nextMode === 'editor' ? true : state.workspaceCanvasPaneOpen
        if (state.workspaceGraphMutationLayoutLockActive === true) return {}
        if (state.workspaceViewMode === nextMode && state.workspaceCanvasPaneOpen === nextPaneOpen) return {}
        if (nextMode === 'editor' && state.workspaceCanvasPaneOpen !== true) lsSetBool(LS_KEYS.workspaceCanvasPaneOpen, true)
        return {
          workspaceViewMode: lsSetJson(LS_KEYS.workspaceViewMode, nextMode),
          workspaceCanvasPaneOpen: nextPaneOpen,
          ...buildWorkspaceGraphMutationTransitionState({
            workspaceViewMode: nextMode,
            workspaceCanvasPaneOpen: nextPaneOpen,
            markdownWorkspaceIndexingInFlight: state.markdownWorkspaceIndexingInFlight,
          }),
        } as Partial<GraphState>
      }),

    setEditorWorkspacePane: (_pane: 'markdown') =>
      set(state => {
        const next = 'markdown'
        if (state.editorWorkspacePane === next) return {}
        return { editorWorkspacePane: lsSetJson(LS_KEYS.editorWorkspacePane, next) } as Partial<GraphState>
      }),
    toggleWorkspaceViewMode: () =>
      set(s => {
        const current = s.workspaceViewMode === 'editor' ? 'editor' : 'canvas'
        const next = current === 'editor' ? 'canvas' : 'editor'
        const nextPaneOpen = next === 'editor' ? true : s.workspaceCanvasPaneOpen
        if (s.workspaceGraphMutationLayoutLockActive === true) return {}
        if (s.workspaceViewMode === next && s.workspaceCanvasPaneOpen === nextPaneOpen) return {}
        if (next === 'editor' && s.workspaceCanvasPaneOpen !== true) lsSetBool(LS_KEYS.workspaceCanvasPaneOpen, true)
        return {
          workspaceViewMode: lsSetJson(LS_KEYS.workspaceViewMode, next),
          workspaceCanvasPaneOpen: nextPaneOpen,
          ...buildWorkspaceGraphMutationTransitionState({
            workspaceViewMode: next,
            workspaceCanvasPaneOpen: nextPaneOpen,
            markdownWorkspaceIndexingInFlight: s.markdownWorkspaceIndexingInFlight,
          }),
        } as Partial<GraphState>
      }),

    setCodeHighlightDurationMs: (ms: number) => set({ codeHighlightDurationMs: Math.max(0, Math.floor(ms)) }),
    setCodeSelectThrottleMs: (ms: number) => set({ codeSelectThrottleMs: Math.max(0, Math.floor(ms)) }),
    setCodeHighlightUntilClick: (v: boolean) => set({ codeHighlightUntilClick: !!v }),

    setUiPanelKeyValueTextSizeClass: (className: string) =>
      set({
        uiPanelKeyValueTextSizeClass: lsSetJson(
          LS_KEYS.panelKeyValueTextSizeClass,
          normalizeUiTextClasses(String(className || '').trim()) || 'text-sm',
        ),
      }),

    setUiPanelTextFontClass: (className: string) =>
      set({
        uiPanelTextFontClass: lsSetJson(
          LS_KEYS.panelTextFontClass,
          String(className || '').trim() || 'font-sans',
        ),
      }),

    setUiPanelKeyValueInputClass: (className: string) =>
      set({
        uiPanelKeyValueInputClass: lsSetJson(
          LS_KEYS.panelKeyValueInputClass,
          normalizeSingleLineControlClassName(normalizeUiTextClasses(String(className || '').trim()) ||
            PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass),
        ),
      }),

    setUiPanelRowDensityDefaultClass: (className: string) =>
      set({
        uiPanelRowDensityDefaultClass: lsSetJson(
          LS_KEYS.panelRowDensityDefaultClass,
          String(className || '').trim() || 'py-1',
        ),
      }),

    setUiPanelRowDensityCompactClass: (className: string) =>
      set({
        uiPanelRowDensityCompactClass: lsSetJson(
          LS_KEYS.panelRowDensityCompactClass,
          String(className || '').trim() || 'py-0.5',
        ),
      }),

    setUiPanelMonospaceTextClass: (className: string) =>
      set({
        uiPanelMonospaceTextClass: lsSetJson(
          LS_KEYS.panelMonospaceTextClass,
          normalizeUiTextClasses(String(className || '').trim()) || 'font-mono text-xs',
        ),
      }),
    setUiPanelMicroLabelTextSizeClass: (className: string) =>
      set({
        uiPanelMicroLabelTextSizeClass: lsSetJson(
          LS_KEYS.panelMicroLabelTextSizeClass,
          normalizeUiTextClasses(String(className || '').trim()),
        ),
      }),

    setUiHeaderRowHeightClass: (className: string) =>
      set({
        uiHeaderRowHeightClass: lsSetJson(
          LS_KEYS.headerRowHeightClass,
          String(className || '').trim() || UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
        ),
      }),

    setUiHeaderRowPaddingClass: (className: string) =>
      set({
        uiHeaderRowPaddingClass: lsSetJson(
          LS_KEYS.headerRowPaddingClass,
          String(className || '').trim() || 'py-1',
        ),
      }),

    setUiSectionHeaderRowHeightClass: (className: string) =>
      set({
        uiSectionHeaderRowHeightClass: lsSetJson(
          LS_KEYS.sectionHeaderRowHeightClass,
          String(className || '').trim() || UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
        ),
      }),

    setUiSectionHeaderRowPaddingClass: (className: string) =>
      set({
        uiSectionHeaderRowPaddingClass: lsSetJson(
          LS_KEYS.sectionHeaderRowPaddingClass,
          String(className || '').trim() || 'py-1',
        ),
      }),

    setUiIconScale: (scale: 'compact' | 'default') =>
      set({
        uiIconScale: lsSetJson(LS_KEYS.iconScale, scale === 'compact' ? 'compact' : 'default'),
      }),
    setUiIconFormat: (format: 'default' | 'minimal' | '1') =>
      set({
        uiIconFormat: lsSetJson(LS_KEYS.iconFormat, format === 'minimal' || format === 'default' || format === '1' ? format : '1'),
      }),
    setUiIconStrokeWidth: (width: number) =>
      set({
        uiIconStrokeWidth: lsSetFloat(LS_KEYS.iconStrokeWidth, normalizeUiIconStrokeWidth(width)),
      }),
    setUiIconColorClass: (className: string) =>
      set({
        uiIconColorClass: lsSetJson(
          LS_KEYS.iconColorClass,
          String(className || '').trim() || UI_THEME_TOKENS.text.secondary,
        ),
      }),
    setUiIconHoverBgClass: (className: string) =>
      set({
        uiIconHoverBgClass: lsSetJson(
          LS_KEYS.iconHoverBgClass,
          String(className || '').trim() || 'hover:bg-[var(--kg-panel-action-bg-hover)]',
        ),
      }),
    setUiIconButtonPaddingClass: (className: string) =>
      set({
        uiIconButtonPaddingClass: lsSetJson(
          LS_KEYS.iconButtonPadding,
          String(className || '').trim() || 'p-2',
        ),
      }),
    setUiIconPillClass: (className: string) =>
      set({
        uiIconPillClass: lsSetJson(
          LS_KEYS.iconPillClass,
          String(className || '').trim() ||
            `inline-flex items-center justify-center rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.neutralSubtle} px-1.5 py-0.5`,
        ),
      }),
    setUiIconBadgeChipClass: (className: string) =>
      set({
        uiIconBadgeChipClass: lsSetJson(
          LS_KEYS.iconBadgeChipClass,
          normalizeBadgeChipBaseClassName(String(className || '')) || UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME,
        ),
      }),
    setUiIconBadgeChipTextSizeClass: (className: string) =>
      set({
        uiIconBadgeChipTextSizeClass: lsSetJson(
          LS_KEYS.iconBadgeChipTextSizeClass,
          normalizeUiTextClasses(String(className || '').trim()) || 'text-xs',
        ),
      }),
    setUiIconPillLegendTextSizeClass: (className: string) =>
      set({
        uiIconPillLegendTextSizeClass: lsSetJson(
          LS_KEYS.iconPillLegendTextSizeClass,
          normalizeUiTextClasses(String(className || '').trim()) || 'text-xs',
        ),
      }),
    setUiIconPillBadgeTextSizeClass: (className: string) =>
      set({
        uiIconPillBadgeTextSizeClass: lsSetJson(
          LS_KEYS.iconPillBadgeTextSizeClass,
          normalizeUiTextClasses(String(className || '').trim()) || 'text-xs',
        ),
      }),
    setUiIconAnimationEnabled: (v: boolean) =>
      set({
        uiIconAnimationEnabled: lsSetBool(LS_KEYS.iconAnimationEnabled, !!v),
      }),
    setUiOverlayOpacity: (v: number) => set({ uiOverlayOpacity: lsSetNum(LS_KEYS.overlayOpacity, v) }),
    setUiPanelOpacity: (v: number) => set({ uiPanelOpacity: lsSetNum(LS_KEYS.panelOpacity, v) }),
    setUiToolbarOpacity: (v: number) => set({ uiToolbarOpacity: lsSetNum(LS_KEYS.toolbarOpacity, v) }),
})
