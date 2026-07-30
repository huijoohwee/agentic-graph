import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware'
import { defaultSchema } from '@/lib/graph/schema';
import { createGraphDataSlice } from '@/hooks/store/graphDataSlice';
import { createMinimapSlice } from '@/features/minimap/store';
import { createSelectionSlice } from '@/hooks/store/selectionSlice';
import { cancelScheduledHistoryCommit, createHistorySlice } from '@/hooks/store/historySlice';
import { createUiSlice } from '@/hooks/store/uiSlice';
import { createCanvasSlice } from '@/hooks/store/canvasSlice';
import { createGraphViewSlice } from '@/hooks/store/graphViewSlice';
import { createSchemaSlice, readSchemaFromStorage } from '@/hooks/store/schemaSlice';
import { createUiSettingsSlice } from '@/hooks/store/uiSettingsSlice';
import { createUiToastSlice } from '@/hooks/store/uiToastSlice';
import { createUiLogSlice } from '@/hooks/store/uiLogSlice'
import { createStoryboardWidgetManagerSlice } from '@/hooks/store/storyboardWidgetManagerSlice'
import { createDesignRendererSlice } from '@/hooks/store/designRendererSlice'
import { createDesignHistorySlice } from '@/hooks/store/designHistorySlice'
import { createDesignSystemSlice } from '@/hooks/store/designSystemSlice'
import { createSourceFilesSlice } from '@/hooks/store/sourceFilesSlice';
import { createLocalMarkdownFolderSlice } from '@/hooks/store/localMarkdownFolderSlice'
import { createHtmlCanvasPublishSlice } from '@/hooks/store/htmlCanvasPublishSlice'
import { getLocalStorage } from '@/lib/persistence';
import type { GraphState, NodePosition2d } from '@/hooks/store/types';
import type { GraphSchema } from '@/lib/graph/schema'
import { DEFAULT_BBOX_COLLIDE_PADDING, DEFAULT_FIT_PADDING, DEFAULT_GROUP_BBOX_COLLIDE_PADDING } from '@/lib/graph/layoutDefaults'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'

const positionsMatch = (
  a: Record<string, NodePosition2d> | null | undefined,
  b: Record<string, NodePosition2d> | null | undefined,
): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i]
    const aPos = a[key]
    const bPos = b[key]
    if (!bPos) return false
    if (aPos.x !== bPos.x || aPos.y !== bPos.y) return false
  }
  return true
}

export type { GraphState } from '@/hooks/store/types';

const applyCanvasDefaultInitSchema = (schema: GraphSchema): GraphSchema => {
  const behavior = schema.behavior || { allowEdgeCreation: true, allowNodeDrag: true }
  const portHandles = behavior.portHandles
    ? { ...behavior.portHandles }
    : { enabled: false, placement: 'cardinal' as const, size: 4, offset: 2, strokeWidth: 1.5 }
  const rawNodeShapeMode = behavior.nodeShapeMode
  const nodeShapeMode: NonNullable<GraphSchema['behavior']>['nodeShapeMode'] =
    rawNodeShapeMode === 'rect' || rawNodeShapeMode === 'diamond' || rawNodeShapeMode === 'hex'
      ? rawNodeShapeMode
      : 'circle'
  const nextBehavior = { ...behavior, nodeShapeMode, portHandles }
  const rawLayoutMode = schema.layout?.mode
  const nextLayoutMode =
    rawLayoutMode === 'radial' || rawLayoutMode === 'block'
      ? rawLayoutMode
      : defaultSchema.layout?.mode === 'radial'
        ? 'radial'
        : 'block'
  const nextLayout = { ...(schema.layout || {}), mode: nextLayoutMode }
  return { ...schema, behavior: nextBehavior, layout: nextLayout }
}

const buildKeywordSchemaPreset = (schema: GraphSchema): GraphSchema => {
  const layout = schema.layout || {}
  const forces = layout.forces || {}

  const forcesWithMaybeCharge = forces as typeof forces & { charge?: number }
  const forcesWithoutCharge: typeof forces = (() => {
    const { charge, ...rest } = forcesWithMaybeCharge
    void charge
    return rest
  })()

  const baseBBoxPaddingRaw = (forces as typeof forces & { bboxCollidePadding?: number }).bboxCollidePadding
  const baseGroupPaddingRaw = (forces as typeof forces & { groupBboxCollidePadding?: number }).groupBboxCollidePadding
  const baseFitPaddingRaw = layout.fitPadding
  const baseAntiLineStrengthRaw = (forces as typeof forces & { antiLineStrength?: number }).antiLineStrength
  const basePostFitStrengthRaw = (forces as typeof forces & { postFitStrength?: number }).postFitStrength
  const basePostFitAlphaMaxRaw = (forces as typeof forces & { postFitAlphaMax?: number }).postFitAlphaMax

  const baseBBoxPadding = typeof baseBBoxPaddingRaw === 'number' && Number.isFinite(baseBBoxPaddingRaw)
    ? baseBBoxPaddingRaw
    : DEFAULT_BBOX_COLLIDE_PADDING
  const baseGroupPadding = typeof baseGroupPaddingRaw === 'number' && Number.isFinite(baseGroupPaddingRaw)
    ? baseGroupPaddingRaw
    : DEFAULT_GROUP_BBOX_COLLIDE_PADDING
  const baseFitPadding = typeof baseFitPaddingRaw === 'number' && Number.isFinite(baseFitPaddingRaw)
    ? baseFitPaddingRaw
    : DEFAULT_FIT_PADDING
  const baseAntiLineStrength = typeof baseAntiLineStrengthRaw === 'number' && Number.isFinite(baseAntiLineStrengthRaw)
    ? baseAntiLineStrengthRaw
    : 0.06
  const basePostFitStrength = typeof basePostFitStrengthRaw === 'number' && Number.isFinite(basePostFitStrengthRaw)
    ? basePostFitStrengthRaw
    : 0.34
  const basePostFitAlphaMax = typeof basePostFitAlphaMaxRaw === 'number' && Number.isFinite(basePostFitAlphaMaxRaw)
    ? basePostFitAlphaMaxRaw
    : 0.12

  const keywordBBoxPadding = Math.round(baseBBoxPadding * 1.15)
  const keywordGroupPadding = Math.round(baseGroupPadding * 1.15)
  const keywordFitPadding = Math.round(baseFitPadding * 0.9)
  const keywordAntiLineStrength = Math.max(0.02, Math.min(0.12, baseAntiLineStrength * 1.5))
  const keywordPostFitStrength = Math.max(0.1, Math.min(0.6, basePostFitStrength * 1.3))
  const keywordPostFitAlphaMax = Math.max(0.05, Math.min(0.25, basePostFitAlphaMax * 1.25))

  const nextLayout: GraphSchema['layout'] = {
    ...layout,
    forces: {
      ...forcesWithoutCharge,
      bboxCollidePadding: keywordBBoxPadding,
      groupBboxCollidePadding: keywordGroupPadding,
      antiLineStrength: keywordAntiLineStrength,
      postFitStrength: keywordPostFitStrength,
      postFitAlphaMax: keywordPostFitAlphaMax,
    },
    fitPadding: keywordFitPadding,
  }

  return { ...schema, layout: nextLayout }
}

const initialSchemaBase: GraphSchema = (() => {
  try {
    const storage = getLocalStorage();
    const fromStorage = readSchemaFromStorage(storage)
    return applyCanvasDefaultInitSchema(fromStorage || defaultSchema);
  } catch {
    return applyCanvasDefaultInitSchema(defaultSchema);
  }
})()

const initialKeywordSchema: GraphSchema = buildKeywordSchemaPreset(initialSchemaBase)
const initialSchema: GraphSchema = initialSchemaBase

export const useGraphStore = create<GraphState>()(
  subscribeWithSelector((set, get, api) => ({
  schema: initialSchema,
  schemaBySemanticMode: { document: initialSchema, keyword: initialKeywordSchema },
  layoutPositionCacheByMode: {},
  graphFieldsOpOk: null,
  graphFieldsOpMsg: '',
  orchestratorOpOk: null,
  orchestratorOpMsg: '',
  renderOpOk: null,
  renderOpMsg: '',
  graphValidationStatus: null,
  graphValidationTimestamp: null,
  setGraphValidationResult: (status, timestamp) => {
    set({
      graphValidationStatus: status,
      graphValidationTimestamp: timestamp,
    })
  },
  setLayoutPositionsForMode: (key: string, positions: Record<string, NodePosition2d> | null) => {
    if (isWorkspaceGraphMutationBlocked(get())) return
    const prev = get().layoutPositionCacheByMode || {}
    const prevEntry = prev[key] || null
    if (!positions || Object.keys(positions).length === 0) {
      if (!prevEntry) return
      const next: typeof prev = { ...prev }
      delete next[key]
      set({ layoutPositionCacheByMode: next })
      return
    }
    if (positionsMatch(prevEntry, positions)) return
    set({ layoutPositionCacheByMode: { ...prev, [key]: positions } })
  },
  setGraphFieldsOpStatus: (ok, msg) => {
    set({ graphFieldsOpOk: ok, graphFieldsOpMsg: String(msg || '') })
  },
  setOrchestratorOpStatus: (ok, msg) => {
    set({ orchestratorOpOk: ok, orchestratorOpMsg: String(msg || '') })
  },
  setRenderOpStatus: (ok, msg) => {
    set({ renderOpOk: ok, renderOpMsg: String(msg || '') })
  },
  lifecycleStage: 'idle',
  setLifecycleStage: (v) => set({ lifecycleStage: v }),
  resetAll: () => {
    cancelScheduledHistoryCommit()
    const schema = applyCanvasDefaultInitSchema(defaultSchema)
    const keywordSchema = buildKeywordSchemaPreset(schema)
    set({
      graphData: { nodes: [], edges: [], type: 'application/json' },
      graphDataRevision: 0,
      graphContentRevision: 0,
      docLocationRevision: 0,
      schema,
      schemaBySemanticMode: { document: schema, keyword: keywordSchema },
      layoutPositionCacheByMode: {},
      history: [],
      historyIndex: -1,
      historyRestoreRevision: (get().historyRestoreRevision || 0) + 1,
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedGroupId: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedGroupIds: [],
      collapsedGroupIds: [],
      collapsedGroupIdsByGraphMetaKey: {},
      openWidgetNodeIds: [],
      openWidgetNodeIdsByRenderer: {},
      flowWidgetPinnedByNodeId: {},
      flowWidgetPinnedByNodeIdByGraphMetaKey: {},
      flowWidgetPosByNodeId: {},
      flowWidgetPosByNodeIdByGraphMetaKey: {},
      flowWidgetWorldPosByNodeId: {},
      flowWidgetWorldPosByNodeIdByGraphMetaKey: {},
      zoomState: null,
      zoomStateByKey: {},
      zoomRequest: null,
      designLayerState: { order: [], hiddenById: {} },
      designLayerStateByGraphMetaKey: {},
      designFramePosById: {},
      designFramePosByIdByGraphMetaKey: {},
      designFrameSizeById: {},
      designFrameSizeByIdByGraphMetaKey: {},
      graphFieldsOpOk: null,
      graphFieldsOpMsg: '',
      orchestratorOpOk: null,
      orchestratorOpMsg: '',
      renderOpOk: null,
      renderOpMsg: '',
      jsonSourceDocumentName: null,
      jsonSourceDocumentText: null,
      lifecycleStage: 'idle',
      documentSemanticMode: 'document',
      frontmatterModeEnabled: true,
      videoSequenceTimelineLaneVisibility: {
        audio: true,
        grade: false,
        mask: false,
        video: true,
      },
      uiLogEntries: [],
      chatExchangeLogs: [],
    });
  },
  ...createUiSettingsSlice(set, get),
  ...createGraphDataSlice(set, get),
  ...createMinimapSlice(set, get),
  ...createSelectionSlice(set, get),
  ...createGraphViewSlice(set, get),
  ...createHistorySlice(set, get),
  ...createUiSlice(set, get),
  ...createUiToastSlice(set),
  ...createUiLogSlice(set),
  ...createDesignSystemSlice(set, get),
  ...createStoryboardWidgetManagerSlice(set, get),
  ...createDesignRendererSlice(set, get),
  ...createDesignHistorySlice(set, get),
  ...createSourceFilesSlice(set, get, api),
  ...createLocalMarkdownFolderSlice(set, get, api),
  ...createHtmlCanvasPublishSlice(set, get, api),
  ...createCanvasSlice(set, get),
  ...createSchemaSlice(set, get),
})),
)

let workspaceGraphMutationExpiryTimer: ReturnType<typeof setTimeout> | null = null

function clearWorkspaceGraphMutationExpiryTimer(): void {
  if (workspaceGraphMutationExpiryTimer == null) return
  clearTimeout(workspaceGraphMutationExpiryTimer)
  workspaceGraphMutationExpiryTimer = null
}

export function resetGraphStoreForTests(): void {
  clearWorkspaceGraphMutationExpiryTimer()
  useGraphStore.getState().resetAll()
  useGraphStore.setState({
    workspaceGraphMutationBlockUntilMs: 0,
    workspaceGraphMutationBlockKey: '',
    markdownWorkspaceIndexingInFlight: false,
  } as Partial<GraphState>)
  scheduleWorkspaceGraphMutationExpiryFromStore()
}

function scheduleWorkspaceGraphMutationExpiryFromStore(): void {
  clearWorkspaceGraphMutationExpiryTimer()
  const state = useGraphStore.getState()
  const untilMs = Number(state.workspaceGraphMutationBlockUntilMs || 0)
  const hasTransitionState = Boolean(String(state.workspaceGraphMutationBlockKey || '').trim()) || untilMs > 0
  if (!hasTransitionState) return
  if (isWorkspaceEditorOverlayOpen(state) || state.markdownWorkspaceIndexingInFlight === true) return

  const nowMs = Date.now()
  if (untilMs > nowMs) {
    workspaceGraphMutationExpiryTimer = setTimeout(() => {
      workspaceGraphMutationExpiryTimer = null
      scheduleWorkspaceGraphMutationExpiryFromStore()
    }, Math.max(1, Math.ceil(untilMs - nowMs + 16)))
    const nodeTimer = workspaceGraphMutationExpiryTimer as unknown as { unref?: () => void }
    try {
      nodeTimer.unref?.()
    } catch {
      void 0
    }
    return
  }

  if (isWorkspaceGraphMutationBlocked(state)) return
  useGraphStore.setState({
    workspaceGraphMutationBlockUntilMs: 0,
    workspaceGraphMutationBlockKey: '',
  } as Partial<GraphState>)
}

useGraphStore.subscribe(
  s => [
    s.workspaceGraphMutationBlockUntilMs,
    s.workspaceGraphMutationBlockKey,
    s.workspaceViewMode,
    s.workspaceCanvasPaneOpen,
    s.markdownWorkspaceIndexingInFlight,
  ] as const,
  scheduleWorkspaceGraphMutationExpiryFromStore,
)
scheduleWorkspaceGraphMutationExpiryFromStore()
