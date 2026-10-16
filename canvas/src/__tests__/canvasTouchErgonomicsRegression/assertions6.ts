import { type SourceFixture } from './sourceFixture'

export function assertPhase6(fixture: SourceFixture) {
  const { toolMenuText, launchDropdownText, importUrlRendererSelectText, explorerSearchControlText, explorerHeaderActionsText, graphTableKanbanViewText, graphDataTableFieldsPanelText, graphDataTableFilterPanelText, graphDataTableSortPanelText, graphDataTableGroupPanelText, toastHostText, designCanvasEditorChromeText, designCanvasWebpageStatusPanelText, graphEditorRightPanelText, markdownDataViewKanbanViewText, markdownCommentPreviewOverlayText, markdownYouTubeTimestampPreviewText, staticRichMediaPanelTextAnchorOverlayText, canvas2dRendererSelectText, geoJsonGeoPanelRendererText, importUrlPromptText, launchDropdownImportUrlItemText, cssText, responsiveToolbarCssText, graphRecordDbText, kanbanReorderText, kanbanDragHookText, kanbanDragVisualStateText, kanbanDragIntentText, kanbanMoveOutcomesText } = fixture
  if (!kanbanDragHookText.includes('registerFocusableRowElement') || !kanbanDragHookText.includes('requestFocusRow') || !kanbanDragHookText.includes('attemptFocusRow')) {
    throw new Error('expected graph-table kanban focus recovery to stay centralized in the shared drag owner')
  }

  if (!kanbanDragHookText.includes('const commitMove = React.useCallback') || !kanbanDragHookText.includes('const reportBlockedMove = React.useCallback') || !kanbanDragHookText.includes("commitMove(move) === 'committed' ? 'commit' : 'no-op'")) {
    throw new Error('expected graph-table kanban pointer and keyboard moves to share one upstream commit/no-op/boundary resolver')
  }

  if (!kanbanDragVisualStateText.includes('export const getKanbanCardDragVisualState') || !kanbanDragVisualStateText.includes('isCommitFlash') || !graphTableKanbanViewText.includes('getKanbanCardDragVisualState') || !graphTableKanbanViewText.includes('getKanbanLaneDragVisualState') || !graphTableKanbanViewText.includes('commitFlashGroupKey')) {
    throw new Error('expected graph-table kanban drag ghost, lane hover emphasis, and commit flash to reuse the shared visual state helper')
  }

  if (kanbanDragHookText.indexOf('const updateAutoScrollTargets = React.useCallback') > kanbanDragHookText.indexOf('const resolveDropTarget = React.useCallback')) {
    throw new Error('expected graph-table shared auto-scroll callback to be declared before the shared drop-target resolver to avoid TDZ runtime crashes')
  }

  if (!kanbanDragHookText.includes('const clearActiveDropTarget = React.useCallback') || !kanbanDragHookText.includes('if (dragOverRowIdRef.current == null) {') || !kanbanDragHookText.includes('clearActiveDropTarget()')) {
    throw new Error('expected graph-table lane-end drag previews to clear from the shared drag owner when the pointer leaves the lane target')
  }

  if (!kanbanDragHookText.includes('const [dragOutcomeSequence, setDragOutcomeSequence] = React.useState(0)') || !kanbanDragHookText.includes('setDragOutcomeSequence(value => value + 1)') || !graphTableKanbanViewText.includes('kanbanDrag.dragOutcomeSequence')) {
    throw new Error('expected graph-table repeated outcome announcements to be driven by the shared outcome sequence')
  }

  if (!kanbanDragHookText.includes('clearCommitFeedback()') || !kanbanDragHookText.includes("kind: 'no-op'")) {
    throw new Error('expected graph-table kanban no-op moves to clear stale success feedback in the shared drag owner')
  }

  if (!kanbanDragHookText.includes('setCommitFlashRowId(move.rowId)') || !graphTableKanbanViewText.includes('commitFlashRowId === row.id')) {
    throw new Error('expected graph-table kanban commit flash to follow the moved row from the shared drag owner')
  }

  if (!kanbanDragIntentText.includes('export const buildKanbanCardDropIntentLabel') || !graphTableKanbanViewText.includes('buildKanbanDragStatusText') || !graphTableKanbanViewText.includes('activeDragStatusText')) {
    throw new Error('expected graph-table kanban drag intent captions and status text to reuse the shared intent helper')
  }

  if (
    !graphTableKanbanViewText.includes('const liveRegionKey = [') ||
    !graphTableKanbanViewText.includes('kanbanDrag.dragOutcomeSequence') ||
    !graphTableKanbanViewText.includes('aria-live="polite">{statusPillText}</section>') ||
    !graphTableKanbanViewText.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME') ||
    !markdownDataViewKanbanViewText.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME') ||
    graphTableKanbanViewText.includes("setLiveMessage(statusPillText || '')") ||
    graphTableKanbanViewText.includes('min-h-[28px]') ||
    markdownDataViewKanbanViewText.includes('min-h-[28px]')
  ) {
    throw new Error('expected graph-table and markdown kanban live-region announcements to stay aligned with the shared status pill and status-row owner without local churn')
  }

  if (!kanbanMoveOutcomesText.includes("kind: 'blocked' | 'cancelled' | 'no-op' | 'committed'") || !kanbanMoveOutcomesText.includes('export type KanbanBlockedMoveReason') || !kanbanMoveOutcomesText.includes('export const isKanbanMoveNoOp') || !graphTableKanbanViewText.includes('dragOutcomeMessage') || !graphTableKanbanViewText.includes('commitFlashRowId') || !graphTableKanbanViewText.includes('statusPillText')) {
    throw new Error('expected graph-table kanban success, cancel, no-op, and boundary outcomes to reuse the shared move outcome helper')
  }

  if (!graphTableKanbanViewText.includes('registerFocusableRowElement') || !graphTableKanbanViewText.includes('kanbanDrag.commitMove({') || !graphTableKanbanViewText.includes('kanbanDrag.reportBlockedMove({') || !graphTableKanbanViewText.includes("'start-of-lane'") || !graphTableKanbanViewText.includes("'start-of-board'") || !graphTableKanbanViewText.includes("'end-of-board'")) {
    throw new Error('expected graph-table kanban view to reuse the shared keyboard commit, boundary feedback, and focus recovery path')
  }

  if (!kanbanReorderText.includes('export const resolveKanbanGroupOrder') || !graphTableKanbanViewText.includes('resolveKanbanGroupOrder({')) {
    throw new Error('expected graph-table kanban lanes to reuse the shared lane ordering helper instead of local alphabetical sorting')
  }

  if (!graphRecordDbText.includes('export const reorderGraphRecordRows') || graphRecordDbText.includes('await doc.incrementalPatch({ order: nextOrder, data: nextData, updatedAtMs: now })')) {
    throw new Error('expected graph-table db owner to persist manual row reorder upstream and preserve it during graph sync')
  }

  if (!responsiveToolbarCssText.includes('.kg-toast-card') || !toastHostText.includes('kg-toast-list')) {
    throw new Error('expected toast notifications to use valid shared mobile viewport sizing')
  }

  if ([
    explorerSearchControlText,
    explorerHeaderActionsText,
    graphTableKanbanViewText,
    toastHostText,
    designCanvasEditorChromeText,
    designCanvasWebpageStatusPanelText,
    graphEditorRightPanelText,
    toolMenuText,
    markdownCommentPreviewOverlayText,
    markdownYouTubeTimestampPreviewText,
    staticRichMediaPanelTextAnchorOverlayText,
    canvas2dRendererSelectText,
    geoJsonGeoPanelRendererText,
    graphDataTableFieldsPanelText,
    graphDataTableFilterPanelText,
    graphDataTableSortPanelText,
    graphDataTableGroupPanelText,
  ].some(text => text.includes('calc(100vw-') || text.includes('calc(100vh-'))) {
    throw new Error('expected mobile viewport calc classes to avoid invalid no-space calc syntax')
  }

  if (!cssText.includes('min-height: var(--kg-control-height, 36px);')) {
    throw new Error('expected collapsed toolbar and header height to follow the shared control height token')
  }

  if (
    !importUrlPromptText.includes('kg-import-url-prompt') ||
    !importUrlPromptText.includes('kg-import-url-actions') ||
    !importUrlPromptText.includes('UI_RESPONSIVE_IMPORT_URL_PRESET_ACTION_CLASSNAME') ||
    !importUrlPromptText.includes('UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME') ||
    !importUrlPromptText.includes('UI_RESPONSIVE_IMPORT_URL_CONFIRM_ACTION_CLASSNAME') ||
    !importUrlRendererSelectText.includes('UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME') ||
    !launchDropdownImportUrlItemText.includes('UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME') ||
    importUrlPromptText.includes('h-6 px-2 inline-flex items-center justify-center rounded border text-xs') ||
    importUrlPromptText.includes('kg-import-url-input flex-1 min-w-0 h-[var(--kg-control-height,28px)] px-2 rounded border box-border text-xs') ||
    importUrlPromptText.includes('kg-import-url-confirm h-[var(--kg-control-height,28px)] px-2 inline-flex items-center justify-center rounded border text-xs') ||
    importUrlRendererSelectText.includes('h-[var(--kg-control-height,28px)] min-w-0 flex-1 px-2 rounded border text-xs')
  ) {
    throw new Error('expected Import URL controls to expose shared responsive owner classes')
  }

  if (launchDropdownText.includes('h-[var(--kg-control-height,28px)] w-[var(--kg-control-height,28px)] inline-flex items-center justify-center rounded border')) {
    throw new Error('expected LaunchDropdown Import URL addon actions to use shared responsive owner classes instead of local square sizing literals')
  }

  if (
    !responsiveToolbarCssText.includes('.kg-import-url-actions') ||
    !responsiveToolbarCssText.includes('flex-direction: column') ||
    !responsiveToolbarCssText.includes('.kg-import-url-confirm') ||
    !responsiveToolbarCssText.includes('.kg-import-url-preset-action') ||
    !responsiveToolbarCssText.includes('--kg-import-url-preset-action-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-preset-action-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-import-url-addon-action') ||
    !responsiveToolbarCssText.includes('--kg-import-url-addon-action-size: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-import-url-field') ||
    !responsiveToolbarCssText.includes('--kg-import-url-confirm-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-field-padding-inline')
  ) {
    throw new Error('expected Import URL controls to stack and keep touch-sized actions from shared mobile CSS')
  }

  if (!responsiveToolbarCssText.includes('[data-kg-floating-panel-root="true"]:not(.App-toolbar)') || !responsiveToolbarCssText.includes('--kg-floating-tool-menu-bottom-offset')) {
    throw new Error('expected floating tool menus to use a shared bottom-safe mobile panel placement')
  }
}
