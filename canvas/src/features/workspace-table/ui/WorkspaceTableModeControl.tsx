import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY } from '@/lib/config'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { cn } from '@/lib/utils'
import { MainPanelField } from '@/features/panels/ui/MainPanelField'
import { MainPanelIconButton } from '@/features/panels/ui/MainPanelIconButton'
import type { MainPanelFieldHelp } from '@/features/panels/ui/mainPanelRowHelp'
import {
  JSON_IMPORT_WORKSPACE_TARGET_LABELS,
  JSON_IMPORT_WORKSPACE_TARGET_OPTIONS,
  type JsonImportWorkspaceTarget,
} from '@/features/workspace-table/jsonImportWorkspaceTarget'
import {
  JSON_MARKDOWN_MODE_LABELS,
  JSON_MARKDOWN_MODE_SELECT_OPTIONS,
  JSON_MARKDOWN_TABLE_LIMIT_MAX,
  JSON_MARKDOWN_TABLE_LIMIT_MIN,
} from '@/features/markdown/jsonMarkdownPreferences'
import { JSON_TO_MARKDOWN_DEFAULT_TABLE_MAX_COLUMNS, JSON_TO_MARKDOWN_DEFAULT_TABLE_MAX_ROWS, type JsonToMarkdownMode } from '@/features/markdown/jsonToMarkdown'
import { workspaceTablePreferencesStore } from '@/features/workspace-table/workspaceTablePreferencesStore'
import {
  WORKSPACE_EDITOR_MODE_OPTIONS,
  type WorkspaceEditorMode,
} from '@/features/workspace-table/workspaceEditorMode'
import { getWorkspaceEditorModeLabel } from '@/features/workspace-table/workspaceEditorModePresentation'
import {
  WORKSPACE_CELL_SELECT_PANEL_PLACEMENT_LABELS,
  WORKSPACE_CELL_SELECT_PANEL_PLACEMENT_OPTIONS,
  type WorkspaceCellSelectPanelPlacement,
} from '@/features/workspace-table/cellSelectPanelPlacement'
import { openMarkdownWorkspaceEditorPane } from '@/features/workspace-table/workspaceEditorPane'
import { MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME } from '@/features/panels/ui/mainPanelSettingsSelectClass'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'

type WorkspaceTableModeControlProps = {
  className?: string
}

export function WorkspaceTableModeControl({ className }: WorkspaceTableModeControlProps) {
  const {
    workspaceViewMode,
    editorWorkspacePane,
    workspaceCanvasPaneOpen,
    setWorkspaceViewMode,
    setWorkspaceViewState,
    setEditorWorkspacePane,
    setWorkspaceCanvasPaneOpen,
  } = useGraphStore(
    useShallow(s => ({
      workspaceViewMode: s.workspaceViewMode,
      editorWorkspacePane: s.editorWorkspacePane,
      workspaceCanvasPaneOpen: s.workspaceCanvasPaneOpen,
      setWorkspaceViewMode: s.setWorkspaceViewMode,
      setWorkspaceViewState: s.setWorkspaceViewState,
      setEditorWorkspacePane: s.setEditorWorkspacePane,
      setWorkspaceCanvasPaneOpen: s.setWorkspaceCanvasPaneOpen,
    })),
  )

  const tableWorkspaceOpen = workspaceViewMode === 'editor' && workspaceCanvasPaneOpen === true
  const prefs = React.useSyncExternalStore(
    workspaceTablePreferencesStore.subscribe,
    workspaceTablePreferencesStore.getSnapshot,
    workspaceTablePreferencesStore.getServerSnapshot,
  )
  const workspaceEditorMode = prefs.workspaceEditorMode as WorkspaceEditorMode
  const jsonImportTarget = prefs.jsonImportTarget as JsonImportWorkspaceTarget
  const jsonMarkdownMode = prefs.jsonMarkdownMode as JsonToMarkdownMode
  const jsonTableMaxRows = prefs.jsonTableMaxRows
  const jsonTableMaxColumns = prefs.jsonTableMaxColumns
  const workspaceCellSelectPanelPlacement = prefs.workspaceCellSelectPanelPlacement as WorkspaceCellSelectPanelPlacement

  const openWorkspaceMultiDimTableFromControl = React.useCallback(() => {
    openMarkdownWorkspaceEditorPane({
      workspaceViewMode,
      editorWorkspacePane,
      workspaceCanvasPaneOpen,
      setWorkspaceViewMode,
      setWorkspaceViewState,
      setEditorWorkspacePane,
      setWorkspaceCanvasPaneOpen,
    })
  }, [editorWorkspacePane, setEditorWorkspacePane, setWorkspaceCanvasPaneOpen, setWorkspaceViewMode, setWorkspaceViewState, workspaceCanvasPaneOpen, workspaceViewMode])

  const handleWorkspaceEditorModeChanged = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = event.currentTarget.value as WorkspaceEditorMode
      workspaceTablePreferencesStore.setWorkspaceEditorMode(next)
      openWorkspaceMultiDimTableFromControl()
    },
    [openWorkspaceMultiDimTableFromControl],
  )

  const handleOpenTable = openWorkspaceMultiDimTableFromControl

  const handleJsonImportTargetChanged = React.useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    workspaceTablePreferencesStore.setJsonImportTarget(event.currentTarget.value as JsonImportWorkspaceTarget)
  }, [])

  const handleJsonMarkdownModeChanged = React.useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    workspaceTablePreferencesStore.setJsonMarkdownMode(event.currentTarget.value as JsonToMarkdownMode)
  }, [])

  const handleJsonTableMaxRowsChanged = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    workspaceTablePreferencesStore.setJsonTableMaxRows(event.currentTarget.value)
  }, [])

  const handleJsonTableMaxColumnsChanged = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    workspaceTablePreferencesStore.setJsonTableMaxColumns(event.currentTarget.value)
  }, [])

  const handleWorkspaceCellSelectPanelPlacementChanged = React.useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    workspaceTablePreferencesStore.setWorkspaceCellSelectPanelPlacement(event.currentTarget.value as WorkspaceCellSelectPanelPlacement)
  }, [])

  const typography = usePanelTypography()
  const selectClassName = cn(MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME, typography.panelTextClass, 'flex-1 text-right')
  const numberFieldClassName = cn(typography.keyValueInputClass, typography.panelTextClass)
  const fieldHelp = (key: string, defaultValue: string | number, outcome: string): MainPanelFieldHelp => ({
    role: 'Operator', actions: [`configure ${key}`], outcome,
    value: { key, type: typeof defaultValue === 'number' ? 'number' : 'string', defaultValue, impact: outcome,
      ...(typeof defaultValue === 'number' ? {
        min: JSON_MARKDOWN_TABLE_LIMIT_MIN, max: JSON_MARKDOWN_TABLE_LIMIT_MAX, interval: 1,
        expansionNote: 'Larger limits include more table content', contractionNote: 'smaller limits reduce table size.',
      } : {}),
    },
  })

  return (
    <section className={cn('min-w-0 max-w-full overflow-hidden', className)} aria-label={UI_COPY.markdownDataViewTitleDefault}>
      <MainPanelField label="Workspace editor view" type="enum"
        help={fieldHelp('Workspace editor view', 'Table View', 'choose the workspace layout for browsing and editing')}>
        <PanelSelect
          className={selectClassName}
          value={workspaceEditorMode}
          onChange={handleWorkspaceEditorModeChanged}
          aria-label="Workspace editor view"
        >
          {WORKSPACE_EDITOR_MODE_OPTIONS.map(option => (
            <option key={option} value={option}>
              {getWorkspaceEditorModeLabel(option)}
            </option>
          ))}
        </PanelSelect>
        <MainPanelIconButton iconKey="mainPanel.workflowManager"
          label={tableWorkspaceOpen ? UI_COPY.toolbarMultiDimTableWorkspaceOnTooltip : UI_COPY.toolbarMultiDimTableToggleTitle}
          onClick={handleOpenTable} disabled={tableWorkspaceOpen} />
      </MainPanelField>
      <MainPanelField label="Select panel position" type="enum"
        help={fieldHelp('Select panel position', 'Above cell', 'place selection controls above or below the active cell')}>
        <PanelSelect
          className={selectClassName}
          value={workspaceCellSelectPanelPlacement}
          onChange={handleWorkspaceCellSelectPanelPlacementChanged}
          aria-label="Select panel position"
        >
          {WORKSPACE_CELL_SELECT_PANEL_PLACEMENT_OPTIONS.map(option => (
            <option key={option} value={option}>
              {WORKSPACE_CELL_SELECT_PANEL_PLACEMENT_LABELS[option]}
            </option>
          ))}
        </PanelSelect>
      </MainPanelField>
      <MainPanelField label="JSON import target" type="enum"
        help={fieldHelp('JSON import target', 'Multi-dimensional Table', 'choose where imported JSON opens')}>
        <PanelSelect
          className={selectClassName}
          value={jsonImportTarget}
          onChange={handleJsonImportTargetChanged}
          aria-label="JSON import target"
        >
          {JSON_IMPORT_WORKSPACE_TARGET_OPTIONS.map(option => (
            <option key={option} value={option}>
              {JSON_IMPORT_WORKSPACE_TARGET_LABELS[option]}
            </option>
          ))}
        </PanelSelect>
      </MainPanelField>
      <MainPanelField label="JSON markdown mode" type="enum"
        help={fieldHelp('JSON markdown mode', 'Auto', 'choose how JSON is represented in Markdown')}>
        <PanelSelect
          className={selectClassName}
          value={jsonMarkdownMode}
          onChange={handleJsonMarkdownModeChanged}
          aria-label="JSON markdown mode"
        >
          {JSON_MARKDOWN_MODE_SELECT_OPTIONS.map(option => (
            <option key={option} value={option}>
              {JSON_MARKDOWN_MODE_LABELS[option]}
            </option>
          ))}
        </PanelSelect>
      </MainPanelField>
      <MainPanelField label="JSON table max rows" type="number"
        help={fieldHelp('JSON table max rows', JSON_TO_MARKDOWN_DEFAULT_TABLE_MAX_ROWS, 'bound the number of rows in generated Markdown tables')}>
        <PanelTextInput
          type="number"
          className={numberFieldClassName}
          value={jsonTableMaxRows}
          min={JSON_MARKDOWN_TABLE_LIMIT_MIN}
          max={JSON_MARKDOWN_TABLE_LIMIT_MAX}
          step={1}
          onChange={handleJsonTableMaxRowsChanged}
          aria-label="JSON table max rows"
        />
      </MainPanelField>
      <MainPanelField label="JSON table max columns" type="number"
        help={fieldHelp('JSON table max columns', JSON_TO_MARKDOWN_DEFAULT_TABLE_MAX_COLUMNS, 'bound the number of columns in generated Markdown tables')}>
        <PanelTextInput
          type="number"
          className={numberFieldClassName}
          value={jsonTableMaxColumns}
          min={JSON_MARKDOWN_TABLE_LIMIT_MIN}
          max={JSON_MARKDOWN_TABLE_LIMIT_MAX}
          step={1}
          onChange={handleJsonTableMaxColumnsChanged}
          aria-label="JSON table max columns"
        />
      </MainPanelField>
    </section>
  )
}
