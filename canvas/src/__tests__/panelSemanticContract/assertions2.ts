import { type SourceFixture } from './sourceFixture'

export function assertPhase2(fixture: SourceFixture) {
  const { responsiveCss, responsiveElementClasses, storyboardWidgetSpecificationTab, kanbanCard, kanbanShortcutCopy, panelConfig, kanbanGroup, flowMappingRowsTable, widgetRegistryTable, kanbanDropPreview, kanbanDragHook, kanbanDragVisualState, kanbanDragIntent, kanbanMoveOutcomes, flowManagerFormEditorTexts, storyboardWidgetGraphTab, storyboardWidgetMappingTabLayout, flowManagerPanelHeaderTexts, flowManagerPanelBodyTexts, kanbanView, dataViewGroups, dataViewModel, fileTree, floatingMenuStyles } = fixture
  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_GRID_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_GROUP_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_TEXT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_ALERT_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_FOOTER_ROW_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FIELD_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_HEADER_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_EMPTY_CELL_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_HEADER_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_GRID_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME') ||
    !responsiveCss.includes('.kg-flow-manager-table-field') ||
    !responsiveCss.includes('--kg-flow-manager-table-field-height') ||
    !responsiveCss.includes('--kg-flow-manager-table-field-padding-inline') ||
    !responsiveCss.includes('.kg-flow-manager-form-field') ||
    !responsiveCss.includes('--kg-flow-manager-form-field-margin-block-start') ||
    !responsiveCss.includes('--kg-flow-manager-form-field-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-form-field-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-registry-item') ||
    !responsiveCss.includes('--kg-flow-manager-registry-item-padding') ||
    !responsiveCss.includes('.kg-flow-manager-registry-item-header') ||
    !responsiveCss.includes('--kg-flow-manager-registry-item-header-gap') ||
    !responsiveCss.includes('.kg-flow-manager-registry-item-grid') ||
    !responsiveCss.includes('--kg-flow-manager-registry-item-grid-gap') ||
    !responsiveCss.includes('.kg-flow-manager-spec-editor') ||
    !responsiveCss.includes('--kg-flow-manager-spec-editor-margin-block-start') ||
    !responsiveCss.includes('--kg-flow-manager-spec-editor-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-spec-editor-padding-block') ||
    !responsiveCss.includes('--kg-flow-manager-spec-editor-min-height') ||
    !responsiveCss.includes('.kg-flow-manager-panel-header') ||
    !responsiveCss.includes('--kg-flow-manager-panel-header-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-panel-header-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-panel-header-row') ||
    !responsiveCss.includes('--kg-flow-manager-panel-header-row-gap') ||
    !responsiveCss.includes('.kg-flow-manager-panel-body') ||
    !responsiveCss.includes('--kg-flow-manager-panel-body-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-panel-body-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-panel-frame') ||
    !responsiveCss.includes('--kg-flow-manager-panel-frame-padding') ||
    !responsiveCss.includes('.kg-flow-manager-toolbar-row') ||
    !responsiveCss.includes('--kg-flow-manager-toolbar-row-gap') ||
    !responsiveCss.includes('.kg-flow-manager-action-menu') ||
    !responsiveCss.includes('--kg-flow-manager-action-menu-gap') ||
    !responsiveCss.includes('.kg-flow-manager-section-header') ||
    !responsiveCss.includes('--kg-flow-manager-section-header-gap') ||
    !responsiveCss.includes('.kg-flow-manager-section-grid') ||
    !responsiveCss.includes('--kg-flow-manager-section-grid-gap') ||
    !responsiveCss.includes('.kg-flow-manager-action-group') ||
    !responsiveCss.includes('--kg-flow-manager-action-group-gap') ||
    !responsiveCss.includes('.kg-flow-manager-inline-control') ||
    !responsiveCss.includes('--kg-flow-manager-inline-control-gap') ||
    !responsiveCss.includes('.kg-flow-manager-status-text') ||
    !responsiveCss.includes('--kg-flow-manager-status-text-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-status-text-padding-block-start') ||
    !responsiveCss.includes('.kg-flow-manager-status-alert') ||
    !responsiveCss.includes('--kg-flow-manager-status-alert-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-status-alert-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-footer-row') ||
    !responsiveCss.includes('--kg-flow-manager-footer-row-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-table-header-cell') ||
    !responsiveCss.includes('.kg-flow-manager-table-header-cell--actions') ||
    !responsiveCss.includes('--kg-flow-manager-table-header-cell-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-table-header-cell-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-table-cell') ||
    !responsiveCss.includes('.kg-flow-manager-table-cell--actions') ||
    !responsiveCss.includes('--kg-flow-manager-table-cell-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-table-cell-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-registry-table-header-cell') ||
    !responsiveCss.includes('--kg-flow-manager-registry-table-header-cell-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-registry-table-header-cell-padding-block') ||
    !responsiveCss.includes('.kg-flow-manager-registry-table-cell') ||
    !responsiveCss.includes('.kg-flow-manager-registry-table-cell--empty') ||
    !responsiveCss.includes('--kg-flow-manager-registry-table-cell-padding-inline') ||
    !responsiveCss.includes('--kg-flow-manager-registry-table-cell-padding-block') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_FIELD_CLASSNAME') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_HEADER_CELL_CLASSNAME') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_HEADER_CELL_CLASSNAME') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_CELL_CLASSNAME') ||
    !flowMappingRowsTable.includes('UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_CELL_CLASSNAME') ||
    !widgetRegistryTable.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_HEADER_CELL_CLASSNAME') ||
    !widgetRegistryTable.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_CELL_CLASSNAME') ||
    !widgetRegistryTable.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_TABLE_EMPTY_CELL_CLASSNAME') ||
    flowManagerPanelHeaderTexts.some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_CLASSNAME')) ||
    !storyboardWidgetGraphTab.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_ROW_CLASSNAME') ||
    flowManagerPanelBodyTexts.some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME')) ||
    !storyboardWidgetMappingTabLayout.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !storyboardWidgetSpecificationTab.includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME') ||
    flowManagerFormEditorTexts[3].includes('sticky bottom-0 py-2 border-t flex items-center justify-between gap-2') ||
    !storyboardWidgetMappingTabLayout.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !storyboardWidgetSpecificationTab.includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_SECTION_GRID_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_ACTION_GROUP_CLASSNAME') ||
    !storyboardWidgetMappingTabLayout.includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !flowManagerFormEditorTexts[0].includes('UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME') ||
    !storyboardWidgetSpecificationTab.includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_TEXT_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_STATUS_ALERT_CLASSNAME') ||
    !flowManagerFormEditorTexts[3].includes('UI_RESPONSIVE_FLOW_MANAGER_FOOTER_ROW_CLASSNAME') ||
    !storyboardWidgetGraphTab.includes('UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME') ||
    flowManagerFormEditorTexts.some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME')) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_CLASSNAME')) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_HEADER_CLASSNAME')) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => !text.includes('UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_GRID_CLASSNAME')) ||
    !storyboardWidgetSpecificationTab.includes('UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME') ||
    flowMappingRowsTable.includes('w-full h-7 px-2') ||
    flowManagerFormEditorTexts.some(text => text.includes('mt-1 w-full rounded border px-2 py-1')) ||
    flowManagerFormEditorTexts.some(text => text.includes("UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME, 'rounded border'")) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => text.includes('rounded border p-2')) ||
    flowManagerFormEditorTexts.slice(0, 3).some(text => text.includes('flex items-center justify-between gap-2')) ||
    flowManagerFormEditorTexts.slice(0, 2).some(text => text.includes('grid grid-cols-1 sm:grid-cols-4 gap-2')) ||
    flowManagerFormEditorTexts[2].includes('grid grid-cols-1 sm:grid-cols-2 gap-2') ||
    storyboardWidgetSpecificationTab.includes('mt-2 ${UI_RESPONSIVE_FLOW_MANAGER_SPEC_EDITOR_CLASSNAME} rounded-md border px-2 py-1') ||
    flowManagerPanelHeaderTexts.some(text => text.includes('px-3 py-2 border-b')) ||
    storyboardWidgetGraphTab.includes('flex items-center justify-between gap-3') ||
    flowManagerPanelBodyTexts.some(text => text.includes('p-3 min-h-0 h-full overflow-hidden')) ||
    flowManagerPanelBodyTexts.some(text => text.includes('h-full min-h-0 p-3')) ||
    flowManagerPanelBodyTexts.some(text => text.includes('overflow-auto p-3')) ||
    flowManagerPanelBodyTexts.some(text => text.includes('overflow-hidden p-3')) ||
    storyboardWidgetMappingTabLayout.includes('flex flex-wrap items-center justify-between gap-2') ||
    storyboardWidgetSpecificationTab.includes('flex flex-wrap items-center justify-between gap-2') ||
    storyboardWidgetMappingTabLayout.includes('m-0 p-0 list-none flex flex-wrap items-center gap-1') ||
    storyboardWidgetSpecificationTab.includes('m-0 p-0 list-none flex items-center gap-1') ||
    flowManagerFormEditorTexts[3].includes('m-0 p-0 list-none flex items-center gap-1') ||
    flowManagerFormEditorTexts[3].includes('flex items-center justify-between gap-2') ||
    flowManagerFormEditorTexts[3].includes('grid grid-cols-1 sm:grid-cols-3 gap-2') ||
    flowManagerFormEditorTexts[3].includes('className="flex items-center gap-2"') ||
    storyboardWidgetMappingTabLayout.includes('inline-flex items-center gap-2') ||
    flowManagerFormEditorTexts[3].includes('inline-flex items-center gap-2') ||
    flowManagerFormEditorTexts[0].includes('inline-flex items-center gap-2') ||
    storyboardWidgetSpecificationTab.includes('px-3 pt-2') ||
    flowManagerFormEditorTexts[3].includes('rounded border px-2 py-2') ||
    flowManagerFormEditorTexts[3].includes('sticky bottom-0 py-2 border-t') ||
    storyboardWidgetGraphTab.includes('rounded border p-2') ||
    flowMappingRowsTable.includes('text-left px-2 py-2 text-xs font-semibold') ||
    flowMappingRowsTable.includes('text-right px-2 py-2 text-xs font-semibold') ||
    flowMappingRowsTable.includes('px-2 py-1 align-top border-t') ||
    widgetRegistryTable.includes('text-left px-3 py-2 text-xs font-semibold') ||
    widgetRegistryTable.includes('px-3 py-2') ||
    widgetRegistryTable.includes('px-3 py-6 text-center')
  ) {
    throw new Error('Expected Flow Manager table cells, form fields, registry items, and spec editors to use shared compact Flow Manager owners')
  }

  if (!kanbanGroup.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_GROUP_CLASSNAME') || kanbanGroup.includes('w-[260px]')) {
    throw new Error('Expected Data View kanban lanes to use the shared responsive lane owner instead of a local fixed width literal')
  }

  if (!kanbanCard.includes('buildKanbanCardDropIntentLabel') || !kanbanGroup.includes('laneDropPreviewLabel')) {
    throw new Error('Expected Kanban cards and lanes to reuse shared drag-intent captions instead of static drop labels')
  }

  if (!kanbanShortcutCopy.includes('KANBAN_SHORTCUT_HELP_LINES') || !panelConfig.includes('...KANBAN_SHORTCUT_HELP_LINES')) {
    throw new Error('Expected Kanban shortcut copy to be owned by a shared helper and surfaced from MainPanel Help shortcuts')
  }

  if (!kanbanDropPreview.includes('export function KanbanDropIndicator') || !kanbanDropPreview.includes('export function KanbanLaneDragOverIndicator') || !kanbanDropPreview.includes('export function KanbanCardDropPreview') || !kanbanDropPreview.includes('export function KanbanLaneDropPreview') || !kanbanDropPreview.includes('UI_RESPONSIVE_KANBAN_DROP_INDICATOR_CLASSNAME') || kanbanDropPreview.includes('h-[2px]')) {
    throw new Error('Expected Kanban drop previews to be owned by a shared helper')
  }

  if (!kanbanDragVisualState.includes('export const getKanbanCardDragVisualState') || !kanbanDragVisualState.includes('export const getKanbanLaneDragVisualState') || !kanbanDragVisualState.includes('isCommitFlash')) {
    throw new Error('Expected Kanban drag ghost, lane emphasis, and commit flash visuals to be owned by a shared helper')
  }

  if (!kanbanDragIntent.includes('export const buildKanbanCardDropIntentLabel') || !kanbanDragIntent.includes('export const buildKanbanDragStatusText')) {
    throw new Error('Expected Kanban drag intent messaging to be owned by a shared helper')
  }

  if (!kanbanMoveOutcomes.includes("kind: 'blocked' | 'cancelled' | 'no-op' | 'committed'") || !kanbanMoveOutcomes.includes('export type KanbanBlockedMoveReason') || !kanbanMoveOutcomes.includes('export const isKanbanMoveNoOp') || !kanbanMoveOutcomes.includes('export const buildKanbanDropOutcomeText')) {
    throw new Error('Expected Kanban move outcome suppression and success/cancel/boundary messaging to be owned by a shared helper')
  }

  if (!kanbanDragHook.includes('getBoardScrollElement?: () => HTMLElement | null') || !kanbanDragHook.includes('getLaneScrollElement?: (groupKey: string) => HTMLElement | null') || !kanbanDragHook.includes('window.requestAnimationFrame(tick)')) {
    throw new Error('Expected Kanban drag owner to manage shared board and lane auto-scroll via a requestAnimationFrame loop')
  }

  if (!kanbanDragHook.includes('KANBAN_LANE_HOVER_DWELL_MS') || !kanbanDragHook.includes('window.setTimeout(() =>') || !kanbanDragHook.includes('resolveDropTarget')) {
    throw new Error('Expected Kanban drag owner to stabilize cross-lane hover with a shared dwell contract instead of immediate target thrash')
  }

  if (!kanbanDragHook.includes('KANBAN_DIRECTIONAL_LANE_ENTRY_BIAS_PX') || !kanbanDragHook.includes('KANBAN_CARD_TARGET_HYSTERESIS_PX') || !kanbanDragHook.includes('lastAppliedTargetPointerRef')) {
    throw new Error('Expected Kanban drag owner to apply shared directional lane-entry bias and card-target hysteresis instead of raw pointer switching')
  }

  if (kanbanDragHook.indexOf('const updateAutoScrollTargets = React.useCallback') > kanbanDragHook.indexOf('const resolveDropTarget = React.useCallback')) {
    throw new Error('Expected Markdown kanban shared auto-scroll callback to be declared before the shared drop-target resolver to avoid TDZ runtime crashes')
  }

  if (!kanbanDragHook.includes('const clearActiveDropTarget = React.useCallback') || !kanbanDragHook.includes('if (dragOverRowIdRef.current == null) {') || !kanbanDragHook.includes('clearActiveDropTarget()')) {
    throw new Error('Expected Markdown kanban lane-end drag previews to clear from the shared drag owner when the pointer leaves the lane target')
  }

  if (!kanbanDragHook.includes('registerFocusableRowElement') || !kanbanDragHook.includes('requestFocusRow') || !kanbanDragHook.includes('attemptFocusRow')) {
    throw new Error('Expected Kanban drag owner to centralize post-move focus recovery instead of per-surface focus patches')
  }

  if (!kanbanDragHook.includes('const commitMove = React.useCallback') || !kanbanDragHook.includes('const reportBlockedMove = React.useCallback') || !kanbanDragHook.includes("commitMove(move) === 'committed' ? 'commit' : 'no-op'")) {
    throw new Error('Expected Kanban drag owner to centralize shared commit/no-op/boundary resolution for pointer and keyboard moves')
  }

  if (!kanbanDragHook.includes('const [dragOutcomeSequence, setDragOutcomeSequence] = React.useState(0)') || !kanbanDragHook.includes('setDragOutcomeSequence(value => value + 1)') || !kanbanView.includes('kanbanDrag.dragOutcomeSequence')) {
    throw new Error('Expected Markdown kanban repeated outcome announcements to be driven by a shared outcome sequence instead of local live-region retries')
  }

  if (!kanbanDragHook.includes('clearCommitFeedback()') || !kanbanDragHook.includes("kind: 'no-op'")) {
    throw new Error('Expected Markdown kanban no-op moves to clear stale success feedback in the shared drag owner before announcing no change')
  }

  if (!kanbanDragHook.includes('const draggingRowIdRef = React.useRef<string | null>(null)') || !kanbanDragHook.includes('const dragSourceGroupKeyRef = React.useRef<string | null>(null)') || !kanbanDragHook.includes('const resolveDraggedRowId = React.useCallback') || !kanbanDragHook.includes('const resolveDraggedGroupKey = React.useCallback')) {
    throw new Error('Expected Kanban drag owner to retain active drag identity in shared refs when browser dragover/drop dataTransfer payloads are unavailable')
  }

  if (!kanbanDragHook.includes('setCommitFlashRowId(move.rowId)') || !kanbanView.includes('commitFlashRowId={kanbanDrag.commitFlashRowId}') || !kanbanGroup.includes('props.commitFlashRowId === row.id')) {
    throw new Error('Expected Markdown kanban commit flash to follow the moved row through the shared drag owner and card registration path')
  }

  if (!kanbanView.includes('useKanbanDragAndDrop') || !kanbanView.includes('reorderKanbanRowIds') || !kanbanView.includes('onReorderRows({') || !kanbanView.includes('handleKeyboardMove')) {
    throw new Error('Expected Markdown kanban view to reuse the shared drag-and-drop hook and keyboard reorder through the root data-view reorder contract')
  }

  if (kanbanView.includes('KanbanShortcutLegend') || kanbanView.includes('KanbanShortcutDetails')) {
    throw new Error('Expected Kanban shortcut guidance to move out of local kanban surfaces and into MainPanel Help shortcuts')
  }

  if (!kanbanView.includes('buildKanbanDragStatusText') || !kanbanView.includes('activeDragStatusText')) {
    throw new Error('Expected Markdown kanban view to expose visible shared drag-intent status before drop')
  }

  if (!kanbanView.includes('const liveRegionKey = [') || !kanbanView.includes('kanbanDrag.dragOutcomeSequence') || !kanbanView.includes('aria-live="polite">{statusPillText}</section>') || !kanbanView.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME') || kanbanView.includes("setLiveMessage(statusPillText || '')") || kanbanView.includes('min-h-[28px]')) {
    throw new Error('Expected Markdown kanban live-region announcements to stay aligned with the shared status pill without local live-message state churn')
  }

  if (!kanbanView.includes('isKanbanMoveNoOp') || !kanbanView.includes('dragOutcomeMessage') || !kanbanView.includes('commitFlashGroupKey') || !kanbanView.includes('statusPillText')) {
    throw new Error('Expected Markdown kanban view to reuse shared success/no-op/cancel messaging and commit flash feedback')
  }

  if (!kanbanView.includes('registerFocusableRowElement') || !kanbanView.includes('kanbanDrag.commitMove({') || !kanbanView.includes('kanbanDrag.reportBlockedMove({') || !kanbanView.includes("'start-of-lane'") || !kanbanView.includes("'start-of-board'") || !kanbanView.includes("'end-of-board'") || !kanbanGroup.includes('onFocusableRowElement={props.onFocusableRowElement}')) {
    throw new Error('Expected Markdown kanban keyboard reorder, boundary feedback, and focus recovery to stay rooted in the shared drag owner and card registration path')
  }

  if (!dataViewGroups.includes('export function projectDataViewGroups') || !kanbanView.includes('projectDataViewGroups(view, groupById)')) {
    throw new Error('Expected Markdown kanban lane ordering to reuse the shared data-view group projection owner')
  }

  if (!kanbanGroup.includes('KanbanLaneDragOverIndicator') || !kanbanGroup.includes('KanbanLaneDropPreview') || kanbanGroup.includes('h-[2px]') || !kanbanView.includes('showLaneDropPreview=')) {
    throw new Error('Expected Markdown kanban lanes to expose a shared end-of-lane drop affordance during pointer drag')
  }

  if (!kanbanGroup.includes('UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME') || kanbanGroup.includes('max-h-[min(65vh,720px)]') || !kanbanView.includes('getBoardScrollElement: () => boardScrollRef.current')) {
    throw new Error('Expected Markdown kanban lanes and board to expose explicit scroll owners for shared edge-aware drag assistance')
  }

  if (!dataViewModel.includes('export const reorderMarkdownDataViewRows') || !dataViewModel.includes('columns: recomputeColumnsForRows')) {
    throw new Error('Expected Markdown data-view model to own persisted row reorder and enum option recomputation upstream')
  }

  if (!fileTree.includes('<AnchorOverlay open anchorPoint=') || !fileTree.includes('FLOATING_ICON_TOOLBAR_PANEL_CLASSNAME') || fileTree.includes('subscribePointerDownDismiss')) {
    throw new Error('Expected workspace file context menus to clamp within mobile viewports')
  }

  if (!floatingMenuStyles.includes('uiToolbarRowScrollClassName') || !floatingMenuStyles.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME')) {
    throw new Error('Expected floating toolbars to reuse row-scroll and responsive inline elements')
  }
}
