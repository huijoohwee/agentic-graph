import type { KanbanHostAdapter, KanbanInlineTextEditorProps } from '@agentic-base/views-react/kanban'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { buildCardParagraphEntries } from '@/lib/cards/cardParagraphs'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { DataViewStatusChip, DataViewTagChip } from './MarkdownDataViewChips'
import { WorkspaceDataViewNewRecordButton } from '@/features/markdown-workspace/main/viewer/WorkspaceDataViewNewRecordButton'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME,
  UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_KANBAN_GROUP_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME,
  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_KANBAN_DROP_INDICATOR_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
  UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import { splitMultiValues } from './markdownDataViewValueUtils'

function InlineTextEditor(props: KanbanInlineTextEditorProps) {
  return <CardInlineTextEditor value={props.value} ariaLabel={props.ariaLabel} placeholder={props.placeholder}
    canEdit={props.canEdit} multiline={props.multiline} rows={props.rows} displayClassName={props.displayClassName}
    editorClassName={props.editorClassName} onCommit={props.onCommit} />
}

function NewRecordButton(props: { onClick: () => void; presentation: 'divider' }) {
  return <WorkspaceDataViewNewRecordButton {...props} />
}

export const graphKanbanHost: KanbanHostAdapter = {
  theme: {
    badge: { chip: UI_THEME_TOKENS.badge.chip },
    button: { hoverBg: UI_THEME_TOKENS.button.hoverBg },
    focus: { primarySoftRing: UI_THEME_TOKENS.focus.primarySoftRing, primarySofterRing: UI_THEME_TOKENS.focus.primarySofterRing },
    icon: { color: UI_THEME_TOKENS.icon.color },
    input: { border: UI_THEME_TOKENS.input.border, text: UI_THEME_TOKENS.input.text },
    kanban: {
      cardBg: UI_THEME_TOKENS.kanban.cardBg,
      cardHoverBg: UI_THEME_TOKENS.kanban.cardHoverBg,
      cellBg: UI_THEME_TOKENS.kanban.cellBg,
      groupBg: UI_THEME_TOKENS.kanban.groupBg,
    },
    panel: { bg: UI_THEME_TOKENS.panel.bg, border: UI_THEME_TOKENS.panel.border, divider: UI_THEME_TOKENS.panel.divider },
    text: { primary: UI_THEME_TOKENS.text.primary, secondary: UI_THEME_TOKENS.text.secondary, tertiary: UI_THEME_TOKENS.text.tertiary },
  },
  classes: {
    cardMultilineEditor: UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME,
    cardTitleEditor: UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME,
    compactMenuPanel: UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME,
    clickExpandMenuChildren: 'kg-menu-row--click-expand',
    kanbanCardList: UI_RESPONSIVE_DATA_VIEW_KANBAN_CARD_LIST_CLASSNAME,
    kanbanCardHoverShadow: UI_THEME_TOKENS.kanban.cardHoverShadow,
    kanbanCardRadius: UI_THEME_TOKENS.kanban.cardRadius,
    kanbanCardShadow: UI_THEME_TOKENS.kanban.cardShadow,
    kanbanDropIndicator: UI_RESPONSIVE_KANBAN_DROP_INDICATOR_CLASSNAME,
    kanbanFloatingMenu: 'kg-data-view-floating-menu',
    kanbanFloatingMenuChildren: 'kg-data-view-floating-menu-children',
    kanbanGroup: UI_RESPONSIVE_DATA_VIEW_KANBAN_GROUP_CLASSNAME,
    kanbanStatusRow: UI_RESPONSIVE_DATA_VIEW_KANBAN_STATUS_ROW_CLASSNAME,
    menuRow: UI_RESPONSIVE_MENU_ROW_CLASSNAME,
    panelActionButton: 'kg-panel-action-btn',
    panelBackground: UI_THEME_TOKENS.panel.bg,
    panelIconButton: 'kg-panel-icon-btn',
    responsiveRow: UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
    smallIconAction: UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME,
    textTruncate: UI_TEXT_TRUNCATE,
    toolbarRowScroll: uiToolbarRowScrollClassName,
  },
  copy: {
    cardActionsLabel: MARKDOWN_DATA_VIEW_COPY.cardActionsLabel,
    cardMenuLabel: MARKDOWN_DATA_VIEW_COPY.cardMenuLabel,
    expandCardLabel: MARKDOWN_DATA_VIEW_COPY.expandCardLabel,
    kanbanViewLabel: MARKDOWN_DATA_VIEW_COPY.kanbanViewLabel,
    moveToLabel: MARKDOWN_DATA_VIEW_COPY.moveToLabel,
    ungroupedLabel: MARKDOWN_DATA_VIEW_COPY.ungroupedLabel,
  },
  primaryIndicator: '#3b82f6',
  interactiveTargetSelector: '[data-kg-card-media-interactive="1"]',
  markers: {
    card: 'data-kg-kanban-card', cardActions: 'data-kg-kanban-actions', cardDragRegion: 'data-kg-kanban-card-drag-region',
    divider: 'data-kg-kanban-divider', group: 'data-kg-kanban-group', groupActions: 'data-kg-kanban-group-actions',
    groupHeader: 'data-kg-kanban-group-header', groupList: 'data-kg-kanban-group-list',
  },
  components: { InlineTextEditor, NewRecordButton, StatusChip: DataViewStatusChip, TagChip: DataViewTagChip },
  data: { buildParagraphEntries: buildCardParagraphEntries, splitValues: splitMultiValues },
}
