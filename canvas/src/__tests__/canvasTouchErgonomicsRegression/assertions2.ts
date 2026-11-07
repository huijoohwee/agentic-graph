import { path, readUtf8, type SourceFixture } from './sourceFixture'

export function assertPhase2(fixture: SourceFixture) {
  const { root, searchPanelText, toolbarStylesText, toolMenuText, launchDropdownText, collaborationViewText, flowchartRendererSettingsText, layoutModeRendererSettingsText, floatingPropsPanelText, storyboardWidgetSpecificationTabText, mainPanelStoryboardWidgetManagerHeaderText, storyboardWidgetInspectorTabsText, designFloatingPanelText, designTokensPanelText, designDomTreePanelText, designLayersPanelText, designDomInspectPanelText, toolbarDropdownSelectText, interactionModeSelectText, zoomModeSelectText, documentModeSelectText, editorWorkspaceSelectText, canvas2dRendererSelectText, historyViewText, responsiveToolbarCssText, toolbarSettingsPanelBodyTexts, designPanelTexts } = fixture
  if (
    !responsiveToolbarCssText.includes('.kg-data-view-field-input') ||
    !responsiveToolbarCssText.includes('--kg-data-view-field-input-height') ||
    !responsiveToolbarCssText.includes('--kg-data-view-field-input-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-import-url-preset-action') ||
    !responsiveToolbarCssText.includes('--kg-import-url-preset-action-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-preset-action-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-import-url-addon-action') ||
    !responsiveToolbarCssText.includes('--kg-import-url-addon-action-size') ||
    !responsiveToolbarCssText.includes('.kg-import-url-field') ||
    !responsiveToolbarCssText.includes('--kg-import-url-field-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-field-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-import-url-confirm-height') ||
    !responsiveToolbarCssText.includes('--kg-import-url-confirm-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-header-cell') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-header-height') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-body-cell') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-text-input') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-input-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-input-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-choice') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-gap') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-choice-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-header-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-header-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-search-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-search-row-margin-block-end') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-inline-row') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-split-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-field-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-field-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-inline-control') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-inline-control-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-stack') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-stack-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-scroll-stack') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-scroll-stack-gap') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-scroll-stack--spacious') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-divider-stack') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-divider-stack-padding-block-start') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-group-frame') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-group-frame-padding') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-wrap-row') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-panel-footer-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-panel-footer-row-margin-block-start') ||
    !responsiveToolbarCssText.includes('.kg-graph-data-table-index-column') ||
    !responsiveToolbarCssText.includes('--kg-graph-data-table-index-column-width') ||
    !responsiveToolbarCssText.includes('.kg-data-view-table-value') ||
    !responsiveToolbarCssText.includes('--kg-data-view-table-value-max-width') ||
    !responsiveToolbarCssText.includes('.kg-data-view-table-progress') ||
    !responsiveToolbarCssText.includes('--kg-data-view-table-progress-width') ||
    !responsiveToolbarCssText.includes('--kg-data-view-table-progress-height') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--wide') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--extra-wide') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-dropdown-inline-clearance') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--narrow') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--compact') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--slim') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-dropdown-menu--tiny') ||
    !responsiveToolbarCssText.includes('.kg-menu-option-row') ||
    !responsiveToolbarCssText.includes('--kg-menu-option-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-launch-menu-root') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-dropdown-width') ||
    !responsiveToolbarCssText.includes('.kg-markdown-geo-panel-empty') ||
    !responsiveToolbarCssText.includes('.kg-markdown-geo-panel-frame') ||
    !responsiveToolbarCssText.includes('.kg-markdown-geo-panel-frame--presentation') ||
    !responsiveToolbarCssText.includes('.kg-markdown-table-frame') ||
    !responsiveToolbarCssText.includes('--kg-markdown-table-frame-max-height') ||
    !responsiveToolbarCssText.includes('.kg-markdown-bounded-image') ||
    !responsiveToolbarCssText.includes('--kg-markdown-bounded-image-max-height') ||
    !responsiveToolbarCssText.includes('.kg-markdown-safe-html-table-shell') ||
    !responsiveToolbarCssText.includes('.kg-markdown-safe-html-embed-frame') ||
    !responsiveToolbarCssText.includes('.kg-markdown-safe-html-embed-frame--presentation') ||
    !responsiveToolbarCssText.includes('.kg-markdown-inline-menu-list') ||
    !responsiveToolbarCssText.includes('.kg-markdown-presentation-meta-text') ||
    !responsiveToolbarCssText.includes('--kg-markdown-presentation-meta-text-max-width') ||
    !responsiveToolbarCssText.includes('.kg-preview-overlay-panel') ||
    !responsiveToolbarCssText.includes('.kg-preview-gallery-drag-card') ||
    !responsiveToolbarCssText.includes('.kg-responsive-wide-dialog-panel') ||
    !responsiveToolbarCssText.includes('.kg-responsive-wide-dialog-message') ||
    !responsiveToolbarCssText.includes('--kg-responsive-wide-dialog-message-max-width') ||
    !responsiveToolbarCssText.includes('.kg-main-panel-card') ||
    !responsiveToolbarCssText.includes('.kg-main-panel-card--open') ||
    !responsiveToolbarCssText.includes('.kg-main-panel-card--collapsed') ||
    !responsiveToolbarCssText.includes('.kg-responsive-floating-notice-card') ||
    !responsiveToolbarCssText.includes('--kg-floating-notice-card-width') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--description') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--template') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--validation') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--default-text') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--default-text-expanded') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-editor--default-json') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-owner-value') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-owner-value-width') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-panel-header') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-header-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-header-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-header-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-panel-strip') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-strip-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-strip-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-strip-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-panel-strip-padding-block: 0.75rem') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-field-input') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-field-input--comfortable') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-height: 2.25rem') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-field-input-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-field-input--short') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-short-field-input-width') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-short-field-input-width: 100%') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-type-select') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-type-select-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-type-select-width') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-type-select-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-inline-field-shell') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-inline-field') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-inline-field-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-inline-field-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-inline-field-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-inline-field-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-compact-icon-cell') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-compact-icon-cell-size') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-row-min-height') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-row-min-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-row-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-drag-handle') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-drag-handle-size') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-drag-handle-size: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-swatch') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-swatch-margin-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-action') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-action-size') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-action-size: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-option-action-margin-inline') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-option-row .kg-graph-fields-option-action') ||
    !responsiveToolbarCssText.includes('visibility: visible') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-list-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-list-row-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-list-row-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-list-row-padding-block: 0.5rem') ||
    !responsiveToolbarCssText.includes('.kg-graph-fields-sample-row') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-sample-row-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-sample-row-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-sample-row-padding-inline: 0.5rem') ||
    !responsiveToolbarCssText.includes('--kg-graph-fields-sample-row-padding-block: 0.5rem') ||
    !responsiveToolbarCssText.includes('.kg-schema-editor-serialization-editor') ||
    !responsiveToolbarCssText.includes('.kg-schema-editor-serialization-editor--compact') ||
    !responsiveToolbarCssText.includes('.kg-schema-editor-serialization-editor--default') ||
    !responsiveToolbarCssText.includes('.kg-multiline-text-input-editor') ||
    !responsiveToolbarCssText.includes('.kg-schema-rules-text-editor') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame') ||
    !responsiveToolbarCssText.includes('--kg-panel-code-editor-frame-min-height') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame--small') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame--compact') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame--large') ||
    !responsiveToolbarCssText.includes('.kg-panel-code-editor-frame--tall') ||
    !responsiveToolbarCssText.includes('.kg-graph-rag-workflow-token') ||
    !responsiveToolbarCssText.includes('.kg-graph-rag-workflow-token--compact') ||
    !responsiveToolbarCssText.includes('--kg-graph-rag-workflow-token-max-width') ||
    !responsiveToolbarCssText.includes('.kg-stats-token-chart-slot') ||
    !responsiveToolbarCssText.includes('--kg-stats-token-chart-slot-min-height')
  ) {
    throw new Error('expected safe viewport panels, side panels, canvas status panels, diagnostic overlays, structured editors, floating action rows, kanban lanes, data-view panels, markdown geo/safe-html panels, preview overlays, wide dialogs, main panel cards, graph-fields editors, schema serialization editors, multiline text input editors, schema rules text editors, panel code editor frames, graph-stats token chart slots, responsive min-width owners, constrained value fields, split controls, touch targets, text action buttons, panel field rows, Storyboard Widget manager frames, History recent-file paths, and anchor previews to use shared responsive owner classes')
  }

  if (
    !responsiveToolbarCssText.includes('.kg-compact-inline-control') ||
    !responsiveToolbarCssText.includes('--kg-compact-inline-control-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-compact-inline-control-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-compact-inline-chip') ||
    !responsiveToolbarCssText.includes('--kg-compact-inline-chip-gap') ||
    !responsiveToolbarCssText.includes('.kg-micro-inline-control') ||
    !responsiveToolbarCssText.includes('--kg-micro-inline-control-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-micro-inline-control-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-micro-inline-chip') ||
    !responsiveToolbarCssText.includes('.kg-compact-list-row') ||
    !responsiveToolbarCssText.includes('--kg-compact-list-row-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-compact-list-row-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-responsive-chip') ||
    !responsiveToolbarCssText.includes('--kg-responsive-chip-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-responsive-chip-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-responsive-badge-chip') ||
    !responsiveToolbarCssText.includes('--kg-responsive-badge-chip-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-responsive-badge-chip-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-inline-status-chip') ||
    !responsiveToolbarCssText.includes('--kg-inline-status-chip-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-inline-status-chip-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-panel-sticky-overlap') ||
    !responsiveToolbarCssText.includes('--kg-panel-sticky-overlap-top') ||
    !responsiveToolbarCssText.includes('.kg-responsive-tooltip-expanded-body') ||
    !responsiveToolbarCssText.includes('.kg-responsive-tooltip-key-label') ||
    !responsiveToolbarCssText.includes('.kg-responsive-status-badge') ||
    !responsiveToolbarCssText.includes('--kg-responsive-status-badge-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-status-badge-message') ||
    !responsiveToolbarCssText.includes('--kg-responsive-status-badge-message-max-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-status-badge-detail') ||
    !responsiveToolbarCssText.includes('--kg-responsive-status-badge-detail-max-width') ||
    !responsiveToolbarCssText.includes('.kg-compact-error-feedback-badge') ||
    !responsiveToolbarCssText.includes('--kg-compact-error-feedback-badge-height') ||
    !responsiveToolbarCssText.includes('.kg-embedded-workspace-left') ||
    !responsiveToolbarCssText.includes('--kg-embedded-workspace-left-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-tag-input-form') ||
    !responsiveToolbarCssText.includes('--kg-responsive-tag-input-form-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-constrained-value-field') ||
    !responsiveToolbarCssText.includes('--kg-responsive-constrained-value-field-max-width') ||
    !responsiveToolbarCssText.includes('.kg-settings-value-wrapper') ||
    !responsiveToolbarCssText.includes('--kg-settings-value-wrapper-min-height') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-flex-input') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-flex-input--compact') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-flex-input-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-inline-field') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-height') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-inline-field-padding-block: 0.5rem') ||
    !responsiveToolbarCssText.includes('.kg-schema-property-name') ||
    !responsiveToolbarCssText.includes('--kg-schema-property-name-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-row') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-responsive-split-control-half') ||
    !responsiveToolbarCssText.includes('.kg-responsive-split-control-half.kg-responsive-split-control-half') ||
    !responsiveToolbarCssText.includes('width: calc(50% - (var(--kg-responsive-control-row-gap) / 2))') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-touch-target') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-touch-target--compact') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-input') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-select') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-toggle-group') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-toggle-group-gap') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-toggle-button') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-value-row') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-value-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-value-row--compact') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-inline-fill') ||
    !responsiveToolbarCssText.includes('.kg-responsive-control-hint') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-hint-min-width') ||
    !responsiveToolbarCssText.includes('--kg-responsive-control-hint-font-size') ||
    !responsiveToolbarCssText.includes('.kg-responsive-text-action-button') ||
    !responsiveToolbarCssText.includes('--kg-responsive-text-action-button-min-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-text-action-button--wide') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-text-action-button') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-text-action-button-height') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-text-action-button-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-text-action-button-height: var(--kg-touch-target, 44px)') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-text-action-button-padding-inline: 0.75rem') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-field-row') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-field-label-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-field-label--wide') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-field-value') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-header-row') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-header-row-min-height') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-header-actions') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-header-actions-max-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-header-secondary') ||
    !responsiveToolbarCssText.includes('--kg-responsive-panel-header-secondary-max-width') ||
    !responsiveToolbarCssText.includes('.kg-responsive-panel-header-secondary--wide') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-header-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-header-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-search-block') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-search-block-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-search-field') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-search-field-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-content') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-content-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-empty-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-empty-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-list-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-list-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-tree-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-tree-row-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-row-action') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-row-action-padding-inline') ||
    !responsiveToolbarCssText.includes('.kg-design-panel-reorder-row') ||
    !responsiveToolbarCssText.includes('--kg-design-panel-reorder-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-data-view-table-frame') ||
    !responsiveToolbarCssText.includes('--kg-data-view-table-frame-max-height') ||
    !responsiveToolbarCssText.includes('.kg-data-view-settings-row-value') ||
    !responsiveToolbarCssText.includes('--kg-data-view-settings-row-value-max-width') ||
    !responsiveToolbarCssText.includes('.kg-data-view-settings-layout-choice') ||
    !responsiveToolbarCssText.includes('--kg-data-view-settings-layout-choice-min-width') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-panel-header') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-header-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-header-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-panel-body') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-body-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-body-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-panel-frame') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-panel-frame-padding') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-toolbar-row') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-toolbar-row-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-action-menu') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-action-menu-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-section-header') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-section-header-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-section-grid') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-section-grid-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-action-group') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-action-group-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-inline-control') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-inline-control-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-frame') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-frame-height') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell-text') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell-text--node') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell-text--editor') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell-text--form') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-cell-text-max-width') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-header-cell') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-header-cell--actions') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-header-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-header-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-table-cell--actions') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-table-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-table-header-cell') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-table-header-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-table-header-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-table-cell') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-table-cell--empty') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-table-cell-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-table-cell-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-form-field') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-form-field-margin-block-start') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-form-field-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-form-field-padding-block') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-item') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-item-padding') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-item-header') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-item-header-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-registry-item-grid') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-registry-item-grid-gap') ||
    !responsiveToolbarCssText.includes('.kg-flow-manager-spec-editor') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-margin-block-start') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-padding-inline')
  ) {
    throw new Error('expected safe viewport panels, side panels, canvas status panels, diagnostic overlays, structured editors, floating action rows, kanban lanes, data-view panels, markdown geo/safe-html panels, preview overlays, wide dialogs, main panel cards, graph-fields editors, schema serialization editors, multiline text input editors, schema rules text editors, panel code editor frames, graph-stats token chart slots, responsive min-width owners, constrained value fields, split controls, touch targets, text action buttons, panel field rows, Storyboard Widget manager frames, History recent-file paths, and anchor previews to use shared responsive owner classes')
  }

  if (
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-padding-block') ||
    !responsiveToolbarCssText.includes('--kg-flow-manager-spec-editor-min-height') ||
    !responsiveToolbarCssText.includes('.kg-history-recent-file-location') ||
    !responsiveToolbarCssText.includes('--kg-history-recent-file-location-max-width') ||
    !responsiveToolbarCssText.includes('inset-block-end: calc(var(--kg-safe-bottom) + var(--kg-mobile-bottom-dock-clearance) + 0.5rem);')
  ) {
    throw new Error('expected safe viewport panels, side panels, canvas status panels, diagnostic overlays, structured editors, floating action rows, kanban lanes, data-view panels, markdown geo/safe-html panels, preview overlays, wide dialogs, main panel cards, graph-fields editors, schema serialization editors, multiline text input editors, schema rules text editors, panel code editor frames, graph-stats token chart slots, responsive min-width owners, constrained value fields, split controls, touch targets, text action buttons, panel field rows, Storyboard Widget manager frames, History recent-file paths, and anchor previews to use shared responsive owner classes')
  }

  if (
    !toolMenuText.includes('UI_RESPONSIVE_SAFE_VIEWPORT_PANEL_CLASSNAME') ||
    toolMenuText.includes('w-80') ||
    !toolbarDropdownSelectText.includes("menuWidthClass = ''") ||
    toolbarDropdownSelectText.includes("menuWidthClass = 'w-72'") ||
    interactionModeSelectText.includes('menuWidthClass="w-72"') ||
    ![zoomModeSelectText, documentModeSelectText, editorWorkspaceSelectText].every(text => text.includes('UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    [zoomModeSelectText, documentModeSelectText, editorWorkspaceSelectText].some(text => text.includes('menuWidthClass="w-64"')) ||
    !canvas2dRendererSelectText.includes('UI_RESPONSIVE_EXTRA_WIDE_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    canvas2dRendererSelectText.includes('[--kg-toolbar-dropdown-width:24rem]') ||
    canvas2dRendererSelectText.includes('max-w-[calc(100vw_-_2rem)]') ||
    ![toolMenuText, designFloatingPanelText].every(text => text.includes('UI_RESPONSIVE_NARROW_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    [toolMenuText, designFloatingPanelText].some(text => text.includes('menuWidthClass="w-56"')) ||
    ![mainPanelStoryboardWidgetManagerHeaderText, storyboardWidgetSpecificationTabText].every(text => text.includes('UI_RESPONSIVE_SLIM_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    [mainPanelStoryboardWidgetManagerHeaderText, storyboardWidgetSpecificationTabText].some(text => text.includes('menuWidthClass="w-44"')) ||
    (historyViewText.includes('ToolbarDropdownSelect') && !historyViewText.includes('UI_RESPONSIVE_TINY_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME')) ||
    !historyViewText.includes('UI_RESPONSIVE_HISTORY_RECENT_FILE_LOCATION_CLASSNAME') ||
    historyViewText.includes('menuWidthClass="w-40"') ||
    historyViewText.includes('max-w-[200px]') ||
    !storyboardWidgetInspectorTabsText.includes('UI_RESPONSIVE_TINY_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME') ||
    storyboardWidgetInspectorTabsText.includes('menuWidthClass="w-40"') ||
    !searchPanelText.includes('UI_RESPONSIVE_WIDE_TOOLBAR_DROPDOWN_PANEL_CLASSNAME') ||
    !searchPanelText.includes('UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME') ||
    !toolbarDropdownSelectText.includes('dropdownMenuOptionClassName') || !readUtf8(path.resolve(root, 'src/lib/ui/dropdownMenu.tsx')).includes('UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME') ||
    !editorWorkspaceSelectText.includes('UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME') ||
    !launchDropdownText.includes('kg-launch-menu-root') ||
    !launchDropdownText.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !launchDropdownText.includes("const menuIconClass = cn(UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME, 'shrink-0')") ||
    toolbarDropdownSelectText.includes('max-w-[45%]') ||
    toolbarDropdownSelectText.includes('gap-2 rounded px-2 py-1 text-sm') ||
    toolbarDropdownSelectText.includes('px-2 py-0.5 text-[10px]') ||
    editorWorkspaceSelectText.includes('gap-2 rounded px-2 py-1 text-sm') ||
    searchPanelText.includes('w-80') ||
    searchPanelText.includes('w-full min-w-0 h-[var(--kg-control-height,28px)] px-2 rounded border') ||
    launchDropdownText.includes("const menuIconClass = 'w-4 h-4 shrink-0'") ||
    launchDropdownText.includes('const menuIconClass = "w-4 h-4 shrink-0"') ||
    launchDropdownText.includes('w-80')
  ) {
    throw new Error('expected floating tool, toolbar dropdown width variants, SearchPanel, and LaunchDropdown widths/icons to live in shared responsive owners')
  }

  if (
    !toolbarStylesText.includes('uiToolbarSettingsPanelBodyClassName') ||
    !toolbarStylesText.includes('uiToolbarSettingsPanelSubsectionClassName') ||
    !toolbarStylesText.includes('uiToolbarSettingsPanelFooterClassName') ||
    !toolbarStylesText.includes('uiToolbarSettingsPanelActionGroupClassName') ||
    !toolbarStylesText.includes('uiToolbarSettingsPanelTextActionClassName') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-body') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-subsection') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-footer') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-action-group') ||
    !responsiveToolbarCssText.includes('.kg-toolbar-settings-panel-text-action') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-body-padding-inline') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-body-gap') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-subsection-padding-block-start') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-subsection-gap') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-footer-gap') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-action-group-gap') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-text-action-min-height') ||
    !responsiveToolbarCssText.includes('--kg-toolbar-settings-panel-text-action-padding-inline') ||
    !toolbarSettingsPanelBodyTexts.every(text => text.includes('uiToolbarSettingsPanelBodyClassName')) ||
    !layoutModeRendererSettingsText.includes('uiToolbarSettingsPanelSubsectionClassName') ||
    !layoutModeRendererSettingsText.includes('uiToolbarSettingsPanelFooterClassName') ||
    !layoutModeRendererSettingsText.includes('uiToolbarSettingsPanelActionGroupClassName') ||
    !layoutModeRendererSettingsText.includes('uiToolbarSettingsPanelTextActionClassName') ||
    toolbarSettingsPanelBodyTexts.some(text => text.includes('px-3 py-2 space-y-2')) ||
    layoutModeRendererSettingsText.includes('pt-2 border-t border-[color:var(--kg-border)] space-y-2') ||
    layoutModeRendererSettingsText.includes('flex items-center justify-between gap-2 pt-1') ||
    layoutModeRendererSettingsText.includes('px-2 py-1 rounded') ||
    flowchartRendererSettingsText.includes('0.5rem, env(safe-area-inset-bottom)')
  ) {
    throw new Error('expected toolbar renderer/settings panel body spacing to live in the shared toolbar settings panel body owner')
  }

  if (
    !collaborationViewText.includes('UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME') ||
    collaborationViewText.includes('min-w-[14rem]')
  ) {
    throw new Error('expected Collaboration panel invite and answer input shells to use the shared responsive flex input owner')
  }

  if (
    ![
      floatingPropsPanelText,
      designTokensPanelText,
      designDomTreePanelText,
      designLayersPanelText,
      designDomInspectPanelText,
    ].every(text => text.includes('UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME')) ||
    [
      floatingPropsPanelText,
      designTokensPanelText,
      designDomTreePanelText,
      designLayersPanelText,
      designDomInspectPanelText,
    ].some(text => text.includes('min-w-56'))
  ) {
    throw new Error('expected floating/design subpanel min widths to live in the shared responsive subpanel owner')
  }

  if (
    !designDomTreePanelText.includes('UI_RESPONSIVE_DESIGN_PANEL_CONTENT_CLASSNAME') ||
    !designDomTreePanelText.includes('UI_RESPONSIVE_DESIGN_PANEL_TREE_ROW_CLASSNAME') ||
    !designLayersPanelText.includes('UI_RESPONSIVE_DESIGN_PANEL_LIST_ROW_CLASSNAME') ||
    !designLayersPanelText.includes('UI_RESPONSIVE_DESIGN_PANEL_REORDER_ROW_CLASSNAME') ||
    designPanelTexts.some(text =>
      [
        'UI_RESPONSIVE_DESIGN_PANEL_HEADER_ROW_CLASSNAME',
        'UI_RESPONSIVE_DESIGN_PANEL_SEARCH_BLOCK_CLASSNAME',
        'UI_RESPONSIVE_DESIGN_PANEL_SEARCH_FIELD_CLASSNAME',
        'UI_RESPONSIVE_DESIGN_PANEL_EMPTY_ROW_CLASSNAME',
        'UI_RESPONSIVE_DESIGN_PANEL_ROW_ACTION_CLASSNAME',
      ].some(owner => !text.includes(owner))
    ) ||
    designPanelTexts.some(text =>
      [
        'px-3 py-2 border-b flex items-center gap-2',
        'px-3 py-2 block',
        'mt-1 flex items-center gap-2 rounded border px-2 py-1',
        'min-w-0 flex-1 text-left rounded px-2 py-1',
      ].some(snippet => text.includes(snippet))
    ) ||
    designDomTreePanelText.includes('flex items-center gap-1 px-2 py-1.5') ||
    designDomTreePanelText.includes('block px-2 py-2 text-[10px]') ||
    designLayersPanelText.includes('px-2 py-2 flex items-center gap-2') ||
    designLayersPanelText.includes('block px-3 py-2 text-[10px]') ||
    designLayersPanelText.includes('className="flex items-center gap-1"')
  ) {
    throw new Error('expected Design DOM and Layers panel rows/search surfaces to use shared responsive design panel owners')
  }
}
