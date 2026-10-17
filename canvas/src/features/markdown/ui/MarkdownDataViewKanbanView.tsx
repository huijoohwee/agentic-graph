import React from 'react'
import { KanbanHostProvider, KanbanView, type KanbanViewProps } from '@agentic-base/views-react/kanban'
import type { MarkdownDataView } from './markdownDataViewModel'
import { graphKanbanHost } from './GraphKanbanHost'

export type MarkdownDataViewKanbanViewProps = Omit<KanbanViewProps, 'view'> & { view: MarkdownDataView }

/** Graph owns Markdown mutations; Base owns the shared Kanban board and drag presentation. */
export const MarkdownDataViewKanbanView = React.memo(function MarkdownDataViewKanbanView(props: MarkdownDataViewKanbanViewProps) {
  return <KanbanHostProvider value={graphKanbanHost}><KanbanView {...props} view={props.view} /></KanbanHostProvider>
})
