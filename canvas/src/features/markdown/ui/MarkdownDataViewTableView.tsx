import React from 'react'
import { TableHostProvider, TableView, type TableViewProps } from '@agentic-base/views-react/table'
import { MultiDimTableView } from '@agentic-base/views-react/table/multi-dimensional'
import type { MarkdownDataView } from './markdownDataViewModel'
import type { MarkdownDataViewColumnType } from './markdownDataViewColumnType'
import { graphTableHost } from './GraphTableHost'
import { MARKDOWN_DATA_VIEW_TABLE_CELL_PREVIEW_CHAR_LIMIT, readMarkdownDataViewTableCellPreviewText } from './markdownDataViewCellPreview'

export { TABLE_INITIAL_RENDER_ROW_LIMIT as MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT,
  TABLE_RENDER_ROW_INCREMENT as MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT } from '@agentic-base/views-react/table'
export { MARKDOWN_DATA_VIEW_TABLE_CELL_PREVIEW_CHAR_LIMIT, readMarkdownDataViewTableCellPreviewText }
export const MARKDOWN_DATA_VIEW_FIELD_COLUMN_ID = '__field'

export type MarkdownDataViewTableViewProps = Omit<TableViewProps, 'view' | 'columnTypesById'> & {
  view: MarkdownDataView
  columnTypesById?: Record<string, MarkdownDataViewColumnType> | null
  multiDimensional?: boolean
}

/** Graph owns source edits and cell operations; Base owns the shared table visuals and interaction shell. */
export const MarkdownDataViewTableView = React.memo(function MarkdownDataViewTableView(props: MarkdownDataViewTableViewProps) {
  const { multiDimensional = false, ...tableProps } = props
  const View = multiDimensional ? MultiDimTableView : TableView
  return <TableHostProvider value={graphTableHost}>
    <View {...tableProps} view={props.view} columnTypesById={props.columnTypesById} />
  </TableHostProvider>
})
