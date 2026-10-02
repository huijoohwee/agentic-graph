import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import {
  WORKSPACE_TABLE_VIEW_MODE_OPTIONS,
  type WorkspaceEditorMode,
  type WorkspaceTableViewMode,
} from './workspaceEditorMode'

export const WORKSPACE_EDITOR_MODE_LABELS: Readonly<Record<WorkspaceEditorMode, string>> = {
  table: MARKDOWN_DATA_VIEW_COPY.tableViewLabel,
  multiDimTable: MARKDOWN_DATA_VIEW_COPY.titleDefault,
  kanban: MARKDOWN_DATA_VIEW_COPY.kanbanViewLabel,
  calendar: 'Calendar View',
}

export const WORKSPACE_TABLE_VIEW_MODE_LABELS: Readonly<Record<WorkspaceTableViewMode, string>> = {
  ...WORKSPACE_EDITOR_MODE_LABELS,
  geospatial: MARKDOWN_DATA_VIEW_COPY.geospatialViewLabel,
}

export const WORKSPACE_TABLE_VIEW_MODE_SELECT_OPTIONS: ReadonlyArray<{ value: WorkspaceTableViewMode; label: string }> =
  WORKSPACE_TABLE_VIEW_MODE_OPTIONS.map(value => ({
    value,
    label: WORKSPACE_TABLE_VIEW_MODE_LABELS[value],
  }))

export function getWorkspaceEditorModeLabel(mode: WorkspaceEditorMode): string {
  return WORKSPACE_EDITOR_MODE_LABELS[mode]
}

export function getWorkspaceTableViewModeLabel(mode: WorkspaceTableViewMode): string {
  return WORKSPACE_TABLE_VIEW_MODE_LABELS[mode]
}
