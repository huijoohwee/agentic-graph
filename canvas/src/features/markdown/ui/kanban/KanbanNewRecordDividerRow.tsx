import React from 'react'
import { WorkspaceDataViewNewRecordButton } from '@/features/markdown-workspace/main/viewer/WorkspaceDataViewNewRecordButton'

export function KanbanNewRecordDividerRow(props: { onClick: () => void }) {
  return (
    <li
      data-kg-kanban-divider="1"
      className="list-none"
    >
      <WorkspaceDataViewNewRecordButton
        onClick={props.onClick}
        presentation="divider"
      />
    </li>
  )
}
