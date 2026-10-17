import type { TableHostAdapter } from '@agentic-base/views-react/table'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { DataViewTagChip } from '@/features/markdown/ui/MarkdownDataViewChips'
import { MarkdownDataViewColumnTypeMenu } from '@/features/markdown/ui/MarkdownDataViewColumnTypeMenu'
import { iconByColumnType } from '@/features/markdown/ui/markdownDataViewColumnTypeMenuIcons'
import { MarkdownDataViewAddColumnMenu } from '@/features/markdown/ui/MarkdownDataViewAddColumnMenu'
import { ColumnHeaderPropertyTypeMenu } from '@/components/ui/ColumnHeaderPropertyTypeMenu'
import { ColumnHeaderMenu } from '@/components/ui/ColumnHeaderMenu'
import { workspaceTablePreferencesStore } from '@/features/workspace-table/workspaceTablePreferencesStore'
import { splitMultiValues } from '@/features/markdown/ui/markdownDataViewValueUtils'
import {
  UI_RESPONSIVE_ACTION_ROW_CLASSNAME, UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_TABLE_PROGRESS_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME,
  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME, UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { buildInlineMediaCommandContextFromRecord } from '@/lib/command-menu/inlineMediaCommandContext'
import { buildSourceLineNestedTableCellMap, renderMarkdownDataViewTableRichCell } from '@/features/markdown/ui/MarkdownDataViewImageCell'
import { MarkdownDataViewHierarchyCell } from '@/features/markdown/ui/MarkdownDataViewHierarchyCell'
import { MarkdownDataViewInlineTextCellEditor } from '@/features/markdown/ui/MarkdownDataViewInlineTextCellEditor'
import { MarkdownDataViewNestedRowsBulkToggle } from '@/features/markdown/ui/MarkdownDataViewNestedRowsBulkToggle'
import { useMarkdownDataViewNestedRowCollapse } from '@/features/markdown/ui/useMarkdownDataViewNestedRowCollapse'
import { MarkdownDataViewColumnResizeHandle } from '@/features/markdown/ui/MarkdownDataViewColumnResizeHandle'
import { MarkdownDataViewCellSelectPopover } from '@/features/markdown/ui/MarkdownDataViewCellSelectPopover'
import { MARKDOWN_DATA_VIEW_DEFAULT_COLUMN_WIDTH_PX as defaultColumnWidthPx, readMarkdownDataViewDefaultColumnWidth as readDefaultColumnWidth } from '@/features/markdown/ui/markdownDataViewColumnSizing'
import { MARKDOWN_DATA_VIEW_TABLE_STICKY_HEADER_CLASSNAME } from '@/features/markdown/ui/markdownDataViewTableClasses'
import {
  MARKDOWN_DATA_VIEW_TABLE_CELL_PREVIEW_CHAR_LIMIT as cellPreviewCharLimit,
  readMarkdownDataViewTableCellDisplayText as readCellDisplayText,
  readMarkdownDataViewTableCellPreviewText as readCellPreviewText,
} from '@/features/markdown/ui/markdownDataViewCellPreview'
import {
  coerceDataViewFieldLineMode as coerceFieldLineMode,
  coerceDataViewRowHeightPreset as coerceRowHeightPreset,
  readDataViewFieldLineClassName as readFieldLineClassName,
  readDataViewHeaderPaddingClassName as readHeaderPaddingClassName,
  readDataViewTablePaddingClassName as readTablePaddingClassName,
} from '@/lib/ui/dataViewDensity'

export const graphTableHost: TableHostAdapter = {
  contract: 'agentic-base/table-host/v1',
  themeTokens: UI_THEME_TOKENS,
  copy: MARKDOWN_DATA_VIEW_COPY,
  styles: {
    actionRowClass: UI_RESPONSIVE_ACTION_ROW_CLASSNAME,
    compactGlyphClass: UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
    dataViewMenuPanelClass: UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME,
    dataViewTableFrameClass: UI_RESPONSIVE_DATA_VIEW_TABLE_FRAME_CLASSNAME,
    dataViewTableProgressClass: UI_RESPONSIVE_DATA_VIEW_TABLE_PROGRESS_CLASSNAME,
    dataViewTableValueClass: UI_RESPONSIVE_DATA_VIEW_TABLE_VALUE_CLASSNAME,
    elementRowClass: UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
    inlineElementRowClass: UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
    menuIconActionClass: UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME,
    textTruncateClass: UI_TEXT_TRUNCATE,
    toolbarRowScrollClass: uiToolbarRowScrollClassName,
    stickyHeaderClass: MARKDOWN_DATA_VIEW_TABLE_STICKY_HEADER_CLASSNAME,
  },
  icons: { iconByColumnType },
  components: {
    TagChip: DataViewTagChip,
    ColumnTypeMenu: MarkdownDataViewColumnTypeMenu,
    AddColumnMenu: MarkdownDataViewAddColumnMenu,
    ColumnHeaderPropertyTypeMenu,
    ColumnHeaderMenu,
    HierarchyCell: MarkdownDataViewHierarchyCell,
    InlineTextCellEditor: MarkdownDataViewInlineTextCellEditor,
    NestedRowsBulkToggle: MarkdownDataViewNestedRowsBulkToggle,
    ColumnResizeHandle: MarkdownDataViewColumnResizeHandle,
    CellSelectPopover: MarkdownDataViewCellSelectPopover,
  },
  stores: {
    tablePreferences: {
      subscribe: listener => workspaceTablePreferencesStore.subscribe(listener),
      getSnapshot: () => workspaceTablePreferencesStore.getSnapshot(),
      getServerSnapshot: () => workspaceTablePreferencesStore.getServerSnapshot(),
    },
  },
  data: {
    splitMultiValues,
    readDisplayText: readMarkdownSigilDisplayText,
    renderInlineText: renderMarkdownSigilInlineText,
    buildMediaCommandContext: buildInlineMediaCommandContextFromRecord,
    buildNestedCellMap: buildSourceLineNestedTableCellMap,
    renderRichCell: renderMarkdownDataViewTableRichCell,
    useNestedRowCollapse: useMarkdownDataViewNestedRowCollapse,
  },
  helpers: {
    defaultColumnWidthPx,
    readDefaultColumnWidth,
    cellPreviewCharLimit,
    readCellDisplayText,
    readCellPreviewText,
    coerceFieldLineMode,
    coerceRowHeightPreset,
    readFieldLineClassName,
    readHeaderPaddingClassName,
    readTablePaddingClassName,
  },
}
