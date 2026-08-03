
import type { StoreApi } from 'zustand'
import type { GraphState } from '@/hooks/store/types'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { getLocalStorage, lsRemove, lsSetBool, lsSetFloat, lsSetJson } from '@/lib/persistence'
import { getInitialLaunchSpotlightEnabled } from '@/features/spotlight/storage'
import { createPanelLayoutUiSlice } from '@/hooks/store/panelLayoutUiSlice'
import { GRABMAPS_DEFAULT_DIRECTIONS_URL, GRABMAPS_DEFAULT_STYLE_URL } from 'grph-shared/geospatial/grabMapsSsot'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'
import { clampFillRatio } from 'grph-shared/zoom/presets'
import {
  clampFrontmatterInitialFitFillRatio,
  clampFrontmatterOverlayFitProxyScale,
  FLOW_FRONTMATTER_INITIAL_FIT_FILL_RATIO,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_DESKTOP,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_LAPTOP,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_PHONE,
  FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_TABLET,
} from '@/components/FlowCanvas/frontmatterLayoutConfig'
import { DEFAULT_DRAG_ALPHA_TARGET, DEFAULT_FIT_TO_SCREEN_FILL_RATIO } from '@/lib/graph/layoutDefaults'
import { buildWorkspaceGraphMutationTransitionState } from '@/features/workspace-table/workspaceTableSsot'
import { readGrabMapsByokApiKeyFromBrowser } from 'grph-shared/geospatial/grabMapsAuth'
import {
  UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME,
  UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { normalizeBadgeChipBaseClassName } from '@/lib/ui/icons'
import type { UiStorageReaders } from './uiSliceStorage'
import type { InitialChatUiContext } from './uiSliceChat'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { createPdfImportInitialState } from './uiSlicePdfImportInitialState'
import { createChatUiInitialState } from './uiSliceChatInitialState'
import {
  readMigratedPaymentsPaywallEnabled,
} from '@/features/payments/paymentPaywallSetting'
import {
  clearSkillsCommandsMcpTargetFromPanelLifecycle,
} from '@/features/agentic-os/skillsCommandsMcpTargetLifecycle'

type SetGraph = StoreApi<GraphState>['setState']
type GetGraph = StoreApi<GraphState>['getState']

const clearPersistedStripeCheckoutUrl = (): string => {
  lsRemove(LS_KEYS.paymentsStripeCheckoutUrl)
  return ''
}

export const createUiInitialState = (
  set: SetGraph,
  get: GetGraph,
  readers: UiStorageReaders,
  chat: InitialChatUiContext,
)=> {
  const { lsNum, lsBool, lsFloat, lsJson } = readers
  const initialWorkspaceViewMode = lsJson<'canvas' | 'editor'>(
    LS_KEYS.workspaceViewMode,
    'canvas',
    value => (value === 'editor' || value === 'canvas' ? value : 'canvas'),
  )
  const initialWorkspaceCanvasPaneOpen = lsBool(LS_KEYS.workspaceCanvasPaneOpen, true)
  return {
    ...createPanelLayoutUiSlice(set),

    isEditMode: false,

    floatingPanelOpen: false,
    setFloatingPanelOpen: (open: boolean) => {
      const next = open === true
      if (!next && get().floatingPanelView === 'skillsCommands') {
        clearSkillsCommandsMcpTargetFromPanelLifecycle()
      }
      set(state => {
        if (state.floatingPanelOpen === next) return {}
        return { floatingPanelOpen: next } as Partial<GraphState>
      })
    },

    floatingPanelView: 'propsPanel' as GraphState['floatingPanelView'],
    setFloatingPanelView: (view: GraphState['floatingPanelView']) => {
      const next =
        view === 'skillsCommands' || view === 'promptPresets'
        || view === 'media'
        || view === 'animation'
        || view === 'motionControl'
        || view === 'gameMode'
        || view === 'flightSim'
        || view === 'cityBuilder'
        || view === 'view'
        || view === 'camera'
        || view === 'design'
        || view === 'chat'
        || view === 'geo'
        || view === 'renderer'
        || view === 'storyboardWidget' || view === 'flowchart'
        || view === 'gitGraph'
        || view === 'gantt'
        || view === 'timeline'
        || view === 'architecture'
        || view === 'eventModeling'
        || view === 'graphTraversal'
          ? view
          : 'propsPanel'
      if (get().floatingPanelView === 'skillsCommands' && next !== 'skillsCommands') {
        clearSkillsCommandsMcpTargetFromPanelLifecycle()
      }
      set(state => {
        if (state.floatingPanelView === next) return {}
        return { floatingPanelView: next } as Partial<GraphState>
      })
    },

    mermaidDiagramSelectedRowKeyByKind: {},
    setMermaidDiagramSelectedRowKey: (kind: 'flowchart' | 'gitgraph' | 'gantt' | 'timeline' | 'architecture' | 'eventmodeling', rowKey: string | null) =>
      set(state => {
        const diagramKind = kind === 'flowchart' || kind === 'gantt' || kind === 'gitgraph' || kind === 'timeline' || kind === 'architecture' || kind === 'eventmodeling' ? kind : null
        if (!diagramKind) return {}
        const nextKey = String(rowKey || '').trim()
        const prev = state.mermaidDiagramSelectedRowKeyByKind || {}
        if ((prev[diagramKind] || '') === nextKey) return {}
        const next = { ...prev }
        if (nextKey) next[diagramKind] = nextKey
        else delete next[diagramKind]
        return { mermaidDiagramSelectedRowKeyByKind: next } as Partial<GraphState>
      }),

    videoSequenceTimelineLaneVisibility: {
      audio: true,
      grade: false,
      mask: false,
      video: true,
    },
    setVideoSequenceTimelineLaneVisibility: (laneId: string, visible: boolean) =>
      set(state => {
        const normalizedLaneId = String(laneId || '').trim().toLowerCase()
        if (!normalizedLaneId) return {}
        const current = state.videoSequenceTimelineLaneVisibility || {}
        const nextVisible = visible === true
        if (current[normalizedLaneId] === nextVisible) return {}
        return {
          videoSequenceTimelineLaneVisibility: {
            ...current,
            [normalizedLaneId]: nextVisible,
          },
        } as Partial<GraphState>
      }),

    timelineTransportDocumentKey: '',
    timelineTransportPosition: 0,
    timelineTransportPlaying: false,
    timelineTransportPlaybackRate: 1,
    timelineTransportTimingSyncMode: 'grouped' as GraphState['timelineTransportTimingSyncMode'], timelineTransportAutoSnappingEnabled: true, timelineTransportRippleEditingEnabled: false,
    setTimelineTransportState: (update: GraphState['setTimelineTransportState'] extends (arg: infer Arg) => void ? Arg : never) => set(state => {
        const documentKey = Object.prototype.hasOwnProperty.call(update || {}, 'documentKey')
          ? String(update?.documentKey || '').trim()
          : state.timelineTransportDocumentKey
        const currentDocumentKey = state.timelineTransportDocumentKey || ''
        const documentChanged = documentKey !== currentDocumentKey
        const positionRaw = typeof update?.position === 'number' && Number.isFinite(update.position)
          ? Math.max(0, update.position)
          : (documentChanged ? 0 : state.timelineTransportPosition)
        const playbackRateRaw = typeof update?.playbackRate === 'number' && Number.isFinite(update.playbackRate)
          ? update.playbackRate
          : (documentChanged ? 1 : state.timelineTransportPlaybackRate)
        const next = { timelineTransportDocumentKey: documentKey, timelineTransportPosition: positionRaw, timelineTransportPlaying: typeof update?.playing === 'boolean' ? update.playing : (documentChanged ? false : state.timelineTransportPlaying), timelineTransportPlaybackRate: playbackRateRaw }
        if (
          state.timelineTransportDocumentKey === next.timelineTransportDocumentKey &&
          Math.abs((state.timelineTransportPosition || 0) - next.timelineTransportPosition) < 0.001 &&
          state.timelineTransportPlaying === next.timelineTransportPlaying &&
          Math.abs((state.timelineTransportPlaybackRate || 1) - next.timelineTransportPlaybackRate) < 0.001
        ) {
          return {}
        }
        return next as Partial<GraphState>
      }),
    setTimelineTransportTimingSyncMode: mode => set(state => {
        const nextMode = mode === 'selected' ? 'selected' : 'grouped'; return state.timelineTransportTimingSyncMode === nextMode ? {} : ({ timelineTransportTimingSyncMode: nextMode } as Partial<GraphState>)
      }),
    setTimelineTransportAutoSnappingEnabled: enabled => set(state => state.timelineTransportAutoSnappingEnabled === enabled ? {} : ({ timelineTransportAutoSnappingEnabled: enabled } as Partial<GraphState>)),
    setTimelineTransportRippleEditingEnabled: enabled => set(state => state.timelineTransportRippleEditingEnabled === enabled ? {} : ({ timelineTransportRippleEditingEnabled: enabled } as Partial<GraphState>)),
    storyboardWidgetSelectedPortRowKey: '',
    setStoryboardWidgetSelectedPortRowKey: (rowKey: string | null) =>
      set(state => {
        const next = String(rowKey || '').trim()
        if (state.storyboardWidgetSelectedPortRowKey === next) return {}
        return { storyboardWidgetSelectedPortRowKey: next } as Partial<GraphState>
      }),

    gitGraphSelectedCommandLineIndex: null,
    setGitGraphSelectedCommandLineIndex: (lineIndex: number | null) =>
      set(state => {
        const next = typeof lineIndex === 'number' && Number.isFinite(lineIndex) ? Math.max(0, Math.floor(lineIndex)) : null
        if (state.gitGraphSelectedCommandLineIndex === next) return {}
        return { gitGraphSelectedCommandLineIndex: next } as Partial<GraphState>
      }),

    workspaceViewMode: initialWorkspaceViewMode,

    editorWorkspacePane: lsJson<'markdown'>(
      LS_KEYS.editorWorkspacePane,
      'markdown',
      value => (value === 'markdown' ? value : 'markdown'),
    ),

    workspaceCanvasPaneOpen: initialWorkspaceCanvasPaneOpen,
    markdownWorkspaceIndexingInFlight: false,
    workspaceGraphMutationBlockUntilMs: 0,
    workspaceGraphMutationBlockKey: '',
    workspaceGraphMutationLayoutLockActive: false,
    setWorkspaceCanvasPaneOpen: (open: boolean) =>
      set(state => {
        const next = open === false ? false : true
        if (state.workspaceGraphMutationLayoutLockActive === true) return {}
        if (state.workspaceCanvasPaneOpen === next) return {}
        lsSetBool(LS_KEYS.workspaceCanvasPaneOpen, next)
        return {
          workspaceCanvasPaneOpen: next,
          ...buildWorkspaceGraphMutationTransitionState({
            workspaceViewMode: state.workspaceViewMode,
            workspaceCanvasPaneOpen: next,
            markdownWorkspaceIndexingInFlight: state.markdownWorkspaceIndexingInFlight,
          }),
        } as Partial<GraphState>
      }),
    setMarkdownWorkspaceIndexingInFlight: (inFlight: boolean) =>
      set(state => {
        const next = inFlight === true
        if (state.markdownWorkspaceIndexingInFlight === next) return {}
        return {
          markdownWorkspaceIndexingInFlight: next,
          ...buildWorkspaceGraphMutationTransitionState({
            workspaceViewMode: state.workspaceViewMode,
            workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen,
            markdownWorkspaceIndexingInFlight: next,
          }),
        } as Partial<GraphState>
      }),

    paymentsPaywallEnabled: readMigratedPaymentsPaywallEnabled(
      readers.storage,
      false,
    ),
    setPaymentsPaywallEnabled: (enabled: boolean) =>
      set(state => {
        const next = enabled === true
        if (state.paymentsPaywallEnabled === next) return {}
        lsSetBool(LS_KEYS.paymentsPaywallEnabled, next)
        return { paymentsPaywallEnabled: next } as Partial<GraphState>
      }),

    paymentsStripeCheckoutUrl: clearPersistedStripeCheckoutUrl(),
    setPaymentsStripeCheckoutUrl: (url: string) =>
      set(state => {
        const next = String(url || '').trim()
        lsRemove(LS_KEYS.paymentsStripeCheckoutUrl)
        if (state.paymentsStripeCheckoutUrl === next) return {}
        return { paymentsStripeCheckoutUrl: next } as Partial<GraphState>
      }),

    documentStructureBaselineLock: lsBool(LS_KEYS.documentStructureBaselineLock, false),
    documentStructureBaselineSnapshot: null,
    setDocumentStructureBaselineLock: (enabled: boolean) =>
      set(state => {
        const next = enabled === false ? false : true
        if (state.documentStructureBaselineLock === next) return {}
        lsSetBool(LS_KEYS.documentStructureBaselineLock, next)
        return {
          documentStructureBaselineLock: next,
          documentStructureBaselineSnapshot: null,
        } as Partial<GraphState>
      }),
    codeHighlightDurationMs: 1000,
    codeSelectThrottleMs: 100,
    codeHighlightUntilClick: true,

    viewportFitFillRatio: clampFillRatio(lsFloat(LS_KEYS.viewportFitFillRatio, DEFAULT_FIT_TO_SCREEN_FILL_RATIO, { min: 0.2, max: 0.95 })),
    setViewportFitFillRatio: (v: number) =>
      set(state => {
        const next = clampFillRatio(typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_FIT_TO_SCREEN_FILL_RATIO)
        if (state.viewportFitFillRatio === next) return {}
        lsSetFloat(LS_KEYS.viewportFitFillRatio, next, { min: 0.2, max: 0.95 })
        return { viewportFitFillRatio: next } as Partial<GraphState>
      }),
    viewportFitReferenceWidth: Math.max(320, Math.floor(lsFloat(LS_KEYS.viewportFitReferenceWidth, 1920, { min: 320, max: 7680 }))),
    setViewportFitReferenceWidth: (v: number) =>
      set(state => {
        const next = Math.max(320, Math.floor(typeof v === 'number' && Number.isFinite(v) ? v : 1920))
        if (state.viewportFitReferenceWidth === next) return {}
        lsSetFloat(LS_KEYS.viewportFitReferenceWidth, next, { min: 320, max: 7680 })
        return { viewportFitReferenceWidth: next } as Partial<GraphState>
      }),
    viewportFitReferenceHeight: Math.max(180, Math.floor(lsFloat(LS_KEYS.viewportFitReferenceHeight, 1080, { min: 180, max: 4320 }))),
    setViewportFitReferenceHeight: (v: number) =>
      set(state => {
        const next = Math.max(180, Math.floor(typeof v === 'number' && Number.isFinite(v) ? v : 1080))
        if (state.viewportFitReferenceHeight === next) return {}
        lsSetFloat(LS_KEYS.viewportFitReferenceHeight, next, { min: 180, max: 4320 })
        return { viewportFitReferenceHeight: next } as Partial<GraphState>
      }),
    frontmatterFlowInitialFitFillRatio: clampFrontmatterInitialFitFillRatio(
      lsFloat(LS_KEYS.frontmatterFlowInitialFitFillRatio, FLOW_FRONTMATTER_INITIAL_FIT_FILL_RATIO, { min: 0.6, max: 0.95 }),
    ),
    setFrontmatterFlowInitialFitFillRatio: (v: number) =>
      set(state => {
        const next = clampFrontmatterInitialFitFillRatio(v)
        if (state.frontmatterFlowInitialFitFillRatio === next) return {}
        lsSetFloat(LS_KEYS.frontmatterFlowInitialFitFillRatio, next, { min: 0.6, max: 0.95 })
        return { frontmatterFlowInitialFitFillRatio: next } as Partial<GraphState>
      }),
    frontmatterFlowOverlayFitProxyScalePhone: clampFrontmatterOverlayFitProxyScale(
      lsFloat(LS_KEYS.frontmatterFlowOverlayFitProxyScalePhone, FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_PHONE, { min: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN, max: 1 }),
    ),
    setFrontmatterFlowOverlayFitProxyScalePhone: (v: number) =>
      set(state => {
        const next = clampFrontmatterOverlayFitProxyScale(v)
        if (state.frontmatterFlowOverlayFitProxyScalePhone === next) return {}
        lsSetFloat(LS_KEYS.frontmatterFlowOverlayFitProxyScalePhone, next, { min: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN, max: 1 })
        return { frontmatterFlowOverlayFitProxyScalePhone: next } as Partial<GraphState>
      }),
    frontmatterFlowOverlayFitProxyScaleTablet: clampFrontmatterOverlayFitProxyScale(
      lsFloat(LS_KEYS.frontmatterFlowOverlayFitProxyScaleTablet, FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_TABLET, { min: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN, max: 1 }),
    ),
    setFrontmatterFlowOverlayFitProxyScaleTablet: (v: number) =>
      set(state => {
        const next = clampFrontmatterOverlayFitProxyScale(v)
        if (state.frontmatterFlowOverlayFitProxyScaleTablet === next) return {}
        lsSetFloat(LS_KEYS.frontmatterFlowOverlayFitProxyScaleTablet, next, { min: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN, max: 1 })
        return { frontmatterFlowOverlayFitProxyScaleTablet: next } as Partial<GraphState>
      }),
    frontmatterFlowOverlayFitProxyScaleLaptop: clampFrontmatterOverlayFitProxyScale(
      lsFloat(LS_KEYS.frontmatterFlowOverlayFitProxyScaleLaptop, FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_LAPTOP, { min: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN, max: 1 }),
    ),
    setFrontmatterFlowOverlayFitProxyScaleLaptop: (v: number) =>
      set(state => {
        const next = clampFrontmatterOverlayFitProxyScale(v)
        if (state.frontmatterFlowOverlayFitProxyScaleLaptop === next) return {}
        lsSetFloat(LS_KEYS.frontmatterFlowOverlayFitProxyScaleLaptop, next, { min: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN, max: 1 })
        return { frontmatterFlowOverlayFitProxyScaleLaptop: next } as Partial<GraphState>
      }),
    frontmatterFlowOverlayFitProxyScaleDesktop: clampFrontmatterOverlayFitProxyScale(
      lsFloat(LS_KEYS.frontmatterFlowOverlayFitProxyScaleDesktop, FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_DESKTOP, { min: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN, max: 1 }),
    ),
    setFrontmatterFlowOverlayFitProxyScaleDesktop: (v: number) =>
      set(state => {
        const next = clampFrontmatterOverlayFitProxyScale(v)
        if (state.frontmatterFlowOverlayFitProxyScaleDesktop === next) return {}
        lsSetFloat(LS_KEYS.frontmatterFlowOverlayFitProxyScaleDesktop, next, { min: FLOW_FRONTMATTER_OVERLAY_FIT_PROXY_SCALE_MIN, max: 1 })
        return { frontmatterFlowOverlayFitProxyScaleDesktop: next } as Partial<GraphState>
      }),

    graphDragAlphaTarget2d: lsFloat(LS_KEYS.graphDragAlphaTarget2d, DEFAULT_DRAG_ALPHA_TARGET, { min: 0, max: 0.6 }),
    setGraphDragAlphaTarget2d: (v: number) =>
      set(state => {
        const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_DRAG_ALPHA_TARGET
        const next = Math.max(0, Math.min(0.6, n))
        if (state.graphDragAlphaTarget2d === next) return {}
        lsSetFloat(LS_KEYS.graphDragAlphaTarget2d, next, { min: 0, max: 0.6 })
        return { graphDragAlphaTarget2d: next } as Partial<GraphState>
      }),

    uiPanelKeyValueTextSizeClass: lsJson<string>(
      LS_KEYS.panelKeyValueTextSizeClass,
      'text-sm',
      value => (typeof value === 'string' ? value : 'text-sm'),
    ),

    uiPanelTextFontClass: lsJson<string>(
      LS_KEYS.panelTextFontClass,
      'font-sans',
      value => (typeof value === 'string' ? value : 'font-sans'),
    ),

    uiPanelKeyValueInputClass: lsJson<string>(
      LS_KEYS.panelKeyValueInputClass,
      PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass,
      value =>
        typeof value === 'string'
          ? value
          : PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass,
    ),

    uiPanelRowDensityDefaultClass: lsJson<string>(
      LS_KEYS.panelRowDensityDefaultClass,
      'py-1',
      value => (typeof value === 'string' ? value : 'py-1'),
    ),

    uiPanelRowDensityCompactClass: lsJson<string>(
      LS_KEYS.panelRowDensityCompactClass,
      'py-0.5',
      value => (typeof value === 'string' ? value : 'py-0.5'),
    ),

    uiPanelMonospaceTextClass: lsJson<string>(
      LS_KEYS.panelMonospaceTextClass,
      'font-mono text-xs',
      value => (typeof value === 'string' ? value : 'font-mono text-xs'),
    ),
    uiPanelMicroLabelTextSizeClass: lsJson<string>(
      LS_KEYS.panelMicroLabelTextSizeClass,
      '',
      value => (typeof value === 'string' ? value : ''),
    ),

    uiHeaderRowHeightClass: lsJson<string>(
      LS_KEYS.headerRowHeightClass,
      UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
      value => (typeof value === 'string' ? value : UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME),
    ),

    uiHeaderRowPaddingClass: lsJson<string>(
      LS_KEYS.headerRowPaddingClass,
      'py-1',
      value => (typeof value === 'string' ? value : 'py-1'),
    ),

    uiSectionHeaderRowHeightClass: lsJson<string>(
      LS_KEYS.sectionHeaderRowHeightClass,
      UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
      value => (typeof value === 'string' ? value : UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME),
    ),

    uiSectionHeaderRowPaddingClass: lsJson<string>(
      LS_KEYS.sectionHeaderRowPaddingClass,
      'py-1',
      value => (typeof value === 'string' ? value : 'py-1'),
    ),

    uiIconScale: lsJson<'compact' | 'default'>(LS_KEYS.iconScale, 'default', value =>
      value === 'compact' || value === 'default' ? value : 'default',
    ),
    uiIconFormat: lsJson<'default' | 'minimal' | '1'>(LS_KEYS.iconFormat, '1', value =>
      value === 'minimal' || value === 'default' || value === '1' ? value : '1',
    ),
    uiIconStrokeWidth: lsNum(LS_KEYS.iconStrokeWidth, 2),
    uiIconColorClass: lsJson<string>(
      LS_KEYS.iconColorClass,
      UI_THEME_TOKENS.text.secondary,
      value => (typeof value === 'string' ? value : UI_THEME_TOKENS.text.secondary),
    ),
    uiIconHoverBgClass: lsJson<string>(
      LS_KEYS.iconHoverBgClass,
      'hover:bg-[var(--kg-panel-action-bg-hover)]',
      value => {
        if (typeof value !== 'string') return 'hover:bg-[var(--kg-panel-action-bg-hover)]'
        const normalized = value.trim()
        if (!normalized || normalized === 'hover:bg-gray-100') return 'hover:bg-[var(--kg-panel-action-bg-hover)]'
        return normalized
      },
    ),
    uiIconButtonPaddingClass: lsJson<string>(
      LS_KEYS.iconButtonPadding,
      'p-2',
      value => (typeof value === 'string' ? value : 'p-2'),
    ),
    uiIconPillClass: lsJson<string>(
      LS_KEYS.iconPillClass,
      `inline-flex items-center justify-center rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.neutralSubtle} px-1.5 py-0.5`,
      value =>
        typeof value === 'string'
          ? value
          : `inline-flex items-center justify-center rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.neutralSubtle} px-1.5 py-0.5`,
    ),
    uiIconBadgeChipClass: lsJson<string>(
      LS_KEYS.iconBadgeChipClass,
      UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME,
      value => (typeof value === 'string' ? normalizeBadgeChipBaseClassName(value) : UI_RESPONSIVE_BADGE_CHIP_DEFAULT_CLASSNAME),
    ),
    uiIconBadgeChipTextSizeClass: lsJson<string>(
      LS_KEYS.iconBadgeChipTextSizeClass,
      'text-[9px]',
      value => (typeof value === 'string' ? value : 'text-[9px]'),
    ),
    uiIconPillLegendTextSizeClass: lsJson<string>(
      LS_KEYS.iconPillLegendTextSizeClass,
      'text-xs',
      value => (typeof value === 'string' ? value : 'text-xs'),
    ),
    uiIconPillBadgeTextSizeClass: lsJson<string>(
      LS_KEYS.iconPillBadgeTextSizeClass,
      'text-[9px]',
      value => (typeof value === 'string' ? value : 'text-[9px]'),
    ),
    uiIconAnimationEnabled: lsBool(LS_KEYS.iconAnimationEnabled, true),
    uiOverlayOpacity: lsNum(LS_KEYS.overlayOpacity, 0.95),
    uiPanelOpacity: lsNum(LS_KEYS.panelOpacity, 0.95),
    uiToolbarOpacity: lsNum(LS_KEYS.toolbarOpacity, 0.95),
    ...createChatUiInitialState(readers, chat),

    grabMapsAuthMode: lsJson<'serverManaged' | 'byok'>(
      LS_KEYS.grabMapsAuthMode,
      'serverManaged',
      value => (value === 'byok' ? 'byok' : 'serverManaged'),
    ),
    grabMapsApiKey: readGrabMapsByokApiKeyFromBrowser(),
    grabMapsDirectionsEndpointUrl: lsJson<string>(
      LS_KEYS.grabMapsDirectionsEndpointUrl,
      GRABMAPS_DEFAULT_DIRECTIONS_URL,
      v => (typeof v === 'string' && v.trim() ? v.trim() : GRABMAPS_DEFAULT_DIRECTIONS_URL),
    ),
    grabMapsDirectionsOverview: lsJson<string>(
      LS_KEYS.grabMapsDirectionsOverview,
      'full',
      v => (typeof v === 'string' && v.trim() ? v.trim() : 'full'),
    ),
    grabMapsDirectionsLatFirst: lsBool(LS_KEYS.grabMapsDirectionsLatFirst, false),
    grabMapsDirectionsAlternatives: lsBool(LS_KEYS.grabMapsDirectionsAlternatives, false),
    grabMapsDirectionsSteps: lsBool(LS_KEYS.grabMapsDirectionsSteps, false),
    grabMapsDirectionsLanguage: lsJson<string>(
      LS_KEYS.grabMapsDirectionsLanguage,
      'en',
      v => (typeof v === 'string' && v.trim() ? v.trim() : 'en'),
    ),
    grabMapsDirectionsUnits: lsJson<string>(
      LS_KEYS.grabMapsDirectionsUnits,
      'metric',
      v => {
        const raw = typeof v === 'string' ? v.trim().toLowerCase() : ''
        return raw === 'imperial' ? 'imperial' : 'metric'
      },
    ),
    grabMapsDirectionsOriginLng: lsFloat(LS_KEYS.grabMapsDirectionsOriginLng, 103.8198, { min: -180, max: 180 }),
    grabMapsDirectionsOriginLat: lsFloat(LS_KEYS.grabMapsDirectionsOriginLat, 1.3521, { min: -90, max: 90 }),
    grabMapsDirectionsDestinationLng: lsFloat(LS_KEYS.grabMapsDirectionsDestinationLng, 103.851959, { min: -180, max: 180 }),
    grabMapsDirectionsDestinationLat: lsFloat(LS_KEYS.grabMapsDirectionsDestinationLat, 1.29027, { min: -90, max: 90 }),
    grabMapsDirectionsWaypointsJson: lsJson<string>(
      LS_KEYS.grabMapsDirectionsWaypointsJson,
      '[]',
      v => (typeof v === 'string' ? v : '[]'),
    ),
    grabMapsDirectionsAnnotationsJson: lsJson<string>(
      LS_KEYS.grabMapsDirectionsAnnotationsJson,
      '[]',
      v => (typeof v === 'string' ? v : '[]'),
    ),
    grabMapsDirectionsExtraParamsJson: lsJson<string>(
      LS_KEYS.grabMapsDirectionsExtraParamsJson,
      '{}',
      v => (typeof v === 'string' ? v : '{}'),
    ),
    grabMapsBasemapStyleUrl: lsJson<string>(
      LS_KEYS.grabMapsBasemapStyleUrl,
      GRABMAPS_DEFAULT_STYLE_URL,
      v => (typeof v === 'string' && v.trim() ? v.trim() : GRABMAPS_DEFAULT_STYLE_URL),
    ),

    autoEnableGeospatialOnGeoImport: lsBool(LS_KEYS.geospatialAutoEnableOnGeoImport, true),

    ...createPdfImportInitialState(readers),
    launchSpotlightMode: 'tour' as const,
    enableLaunchSpotlight: (() => {
      const storage = getLocalStorage();
      return getInitialLaunchSpotlightEnabled(storage, false);
    })(),
    statusPanelPinned: lsBool(LS_KEYS.statusPanelPinned, false),
    workspaceAutosaveEnabled: lsBool(LS_KEYS.workspaceAutosaveEnabled, true),

  }
}
