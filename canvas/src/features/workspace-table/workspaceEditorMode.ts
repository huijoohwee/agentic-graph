import { LS_KEYS } from '@/lib/config'
import { lsJson, lsSetJson } from '@/lib/persistence'

export type WorkspaceEditorMode = 'table' | 'multiDimTable' | 'kanban' | 'calendar'
export type WorkspaceTableViewMode = WorkspaceEditorMode | 'geospatial'
export type WorkspaceBackedTableViewMode = WorkspaceEditorMode

export const WORKSPACE_EDITOR_MODE_OPTIONS: WorkspaceEditorMode[] = ['table', 'multiDimTable', 'kanban', 'calendar']
export const WORKSPACE_TABLE_VIEW_MODE_OPTIONS: WorkspaceTableViewMode[] = ['calendar', 'geospatial', 'kanban', 'multiDimTable', 'table']

export function parseWorkspaceEditorMode(raw: unknown): WorkspaceEditorMode | null {
  if (raw === 'table' || raw === 'multiDimTable' || raw === 'kanban' || raw === 'calendar') return raw
  return null
}

export function parseWorkspaceTableViewMode(raw: unknown): WorkspaceTableViewMode | null {
  const editorMode = parseWorkspaceEditorMode(raw)
  if (editorMode) return editorMode
  if (raw === 'geospatial') return 'geospatial'
  return null
}

export function toWorkspaceBackedTableViewMode(
  mode: WorkspaceEditorMode,
): WorkspaceBackedTableViewMode {
  return mode
}

export function toWorkspaceEditorModeFromTableViewMode(
  mode: WorkspaceTableViewMode | null | undefined,
): WorkspaceEditorMode {
  return mode === 'calendar' ? 'calendar' : mode === 'kanban' ? 'kanban' : mode === 'multiDimTable' || mode === 'geospatial' ? 'multiDimTable' : 'table'
}

export function readWorkspaceEditorMode(): WorkspaceEditorMode {
  return lsJson(LS_KEYS.workspaceEditorMode, 'table' as WorkspaceEditorMode, parseWorkspaceEditorMode)
}

export function writeWorkspaceEditorMode(next: WorkspaceEditorMode): WorkspaceEditorMode {
  const mode = parseWorkspaceEditorMode(next) || 'table'
  const currentWorkspaceMode = parseWorkspaceEditorMode(lsJson(LS_KEYS.workspaceEditorMode, mode, parseWorkspaceEditorMode)) || 'table'
  if (currentWorkspaceMode !== mode) {
    lsSetJson(LS_KEYS.workspaceEditorMode, mode)
  }
  return mode
}
