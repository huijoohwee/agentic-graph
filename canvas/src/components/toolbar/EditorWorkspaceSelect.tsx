import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Database, FileCode, Link2, SaveAll } from 'lucide-react'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import {
  openWorkspaceEditorPane,
} from '@/features/workspace-table/workspaceTableSsot'
import { WORKSPACE_TABLE_TOOLBAR_UI } from '@/features/workspace-table/workspaceTableToolbarUi'
import { workspaceTablePreferencesStore } from '@/features/workspace-table/workspaceTablePreferencesStore'
import {
  UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME,
  UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  readWorkspaceSeedSyncEnabledSetting,
  subscribeWorkspaceStoreSyncSettingsChanged,
  writeWorkspaceSeedSyncEnabledSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import { UI_TOAST_TTL_MS } from '@/lib/ui/toastTiming'
import { uiAutomaticRowValue, uiBooleanRowValue, uiSelectableRowClassName } from 'grph-shared/ui/selectedRowClasses'
import { SelectableRowValue } from '@/components/ui/SelectableRowValue'

type EditorWorkspaceSelectProps = {
  iconSizeClass: string
  iconStrokeWidth: number
  ensureBaselineUnlocked?: () => boolean
}

type EditorWorkspaceOptionKey = 'editor'

type Option = {
  key: EditorWorkspaceOptionKey
  label: string
  tooltip: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>
}

export function EditorWorkspaceSelect({ iconSizeClass, iconStrokeWidth, ensureBaselineUnlocked }: EditorWorkspaceSelectProps) {
  const [storageSyncEnabled, setStorageSyncEnabled] = React.useState(() => readWorkspaceSeedSyncEnabledSetting())
  const {
    workspaceViewMode,
    editorWorkspacePane,
    canvasWorkspaceSyncMode,
    setCanvasWorkspaceSyncMode,
    workspaceAutosaveEnabled,
    setWorkspaceAutosaveEnabled,
    pushUiToast,
  } = useGraphStore(
    useShallow(s => ({
      workspaceViewMode: s.workspaceViewMode,
      editorWorkspacePane: s.editorWorkspacePane,
      canvasWorkspaceSyncMode: s.canvasWorkspaceSyncMode,
      setCanvasWorkspaceSyncMode: s.setCanvasWorkspaceSyncMode,
      workspaceAutosaveEnabled: s.workspaceAutosaveEnabled,
      setWorkspaceAutosaveEnabled: s.setWorkspaceAutosaveEnabled,
      pushUiToast: s.pushUiToast,
    })),
  )

  const isEditor = workspaceViewMode === 'editor'

  const options = React.useMemo(
    () =>
      [
        {
          key: 'editor' as const,
          label: WORKSPACE_TABLE_TOOLBAR_UI.editorLabel,
          tooltip: WORKSPACE_TABLE_TOOLBAR_UI.editorOffTooltip,
          Icon: FileCode,
        },
      ] satisfies Option[],
    [],
  )

  const activeKey: EditorWorkspaceOptionKey | null = isEditor ? 'editor' : null

  const triggerTitle = UI_LABELS.workspaceView
  const triggerTooltip = (() => {
    if (isEditor) return WORKSPACE_TABLE_TOOLBAR_UI.editorOnTooltip
    return WORKSPACE_TABLE_TOOLBAR_UI.editorOffTooltip
  })()

  const apply = React.useCallback(
    (_key: EditorWorkspaceOptionKey) => {
      const state = useGraphStore.getState()
      const liveWorkspaceViewMode = state.workspaceViewMode
      const liveEditorWorkspacePane = state.editorWorkspacePane
      const liveWorkspaceCanvasPaneOpen = state.workspaceCanvasPaneOpen

      if (liveWorkspaceViewMode === 'editor' && liveWorkspaceCanvasPaneOpen === true) {
        return
      }

      const snap = workspaceTablePreferencesStore.getSnapshot()
      if (snap.workspaceEditorMode === 'multiDimTable') {
        workspaceTablePreferencesStore.setWorkspaceEditorMode('table')
      }

      openWorkspaceEditorPane({
        workspaceViewMode: liveWorkspaceViewMode,
        editorWorkspacePane: liveEditorWorkspacePane,
        workspaceCanvasPaneOpen: liveWorkspaceCanvasPaneOpen,
        pane: 'markdown',
        setWorkspaceViewMode: state.setWorkspaceViewMode,
        setWorkspaceViewState: state.setWorkspaceViewState,
        setEditorWorkspacePane: state.setEditorWorkspacePane,
        setWorkspaceCanvasPaneOpen: state.setWorkspaceCanvasPaneOpen,
      })
    },
    [],
  )

  const handleTriggerClick = React.useCallback(() => {
    const state = useGraphStore.getState()
    const liveWorkspaceViewMode = state.workspaceViewMode
    const liveEditorWorkspacePane = state.editorWorkspacePane
    const liveWorkspaceCanvasPaneOpen = state.workspaceCanvasPaneOpen
    if (liveWorkspaceViewMode !== 'editor' || liveWorkspaceCanvasPaneOpen === true) return false
    openWorkspaceEditorPane({
      workspaceViewMode: liveWorkspaceViewMode,
      editorWorkspacePane: liveEditorWorkspacePane,
      workspaceCanvasPaneOpen: liveWorkspaceCanvasPaneOpen,
      pane: liveEditorWorkspacePane,
      setWorkspaceViewMode: state.setWorkspaceViewMode,
      setWorkspaceViewState: state.setWorkspaceViewState,
      setEditorWorkspacePane: state.setEditorWorkspacePane,
      setWorkspaceCanvasPaneOpen: state.setWorkspaceCanvasPaneOpen,
    })
    return true
  }, [])

  const toggleWorkspaceSyncMode = React.useCallback(() => {
    if (ensureBaselineUnlocked && !ensureBaselineUnlocked()) return
    setCanvasWorkspaceSyncMode(canvasWorkspaceSyncMode === 'realtime' ? 'manual' : 'realtime')
  }, [canvasWorkspaceSyncMode, ensureBaselineUnlocked, setCanvasWorkspaceSyncMode])

  React.useEffect(() => {
    const syncStorageSyncEnabled = () => setStorageSyncEnabled(readWorkspaceSeedSyncEnabledSetting())
    syncStorageSyncEnabled()
    return subscribeWorkspaceStoreSyncSettingsChanged(syncStorageSyncEnabled)
  }, [])

  const toggleStorageSync = React.useCallback(() => {
    const next = !readWorkspaceSeedSyncEnabledSetting()
    writeWorkspaceSeedSyncEnabledSetting(next)
    setStorageSyncEnabled(next)
    pushUiToast({
      id: 'workspace:storage-sync-policy',
      kind: next ? 'success' : 'neutral',
      message: next ? 'Storage Sync enabled' : 'Storage Sync disabled',
      ttlMs: UI_TOAST_TTL_MS.actionFeedback,
      dismissible: false,
    })
  }, [pushUiToast])

  const toggleAutosave = React.useCallback(() => {
    const next = !workspaceAutosaveEnabled
    setWorkspaceAutosaveEnabled(next)
    pushUiToast({
      id: 'workspace:autosave-policy',
      kind: next ? 'success' : 'neutral',
      message: next ? 'Autosave enabled' : 'Autosave disabled; use Save to persist changes.',
      ttlMs: UI_TOAST_TTL_MS.actionFeedback,
      dismissible: false,
    })
  }, [pushUiToast, setWorkspaceAutosaveEnabled, workspaceAutosaveEnabled])

  const workspaceSyncAutomatic = canvasWorkspaceSyncMode === 'realtime'
  const syncIndicatorLabel = uiAutomaticRowValue(workspaceSyncAutomatic)
  const storageSyncLabel = storageSyncEnabled ? UI_COPY.storageSyncOnLabel : UI_COPY.storageSyncOffLabel

  return (
    <ToolbarDropdownSelect
      value={activeKey || 'editor'}
      options={options.map(option => ({
        id: option.key,
        title: option.label,
        tooltip: option.tooltip,
        Icon: option.Icon,
      }))}
      title={triggerTitle}
      tooltipContent={triggerTooltip}
      isButtonActive={isEditor}
      onSelect={id => apply(id)}
      onTriggerClick={handleTriggerClick}
      renderButtonContent={() =>
        <FileCode className={iconSizeClass} strokeWidth={iconStrokeWidth} />
      }
      renderOptionContent={option => (
        <>
          <option.Icon className={iconSizeClass} strokeWidth={iconStrokeWidth} />
          <span className="truncate">{option.title}</span>
        </>
      )}
      renderMenuAppend={() => (
        <>
          <li className="list-none px-1 py-0.5" aria-hidden="true">
            <hr className={`border-t ${UI_THEME_TOKENS.panel.border}`} />
          </li>
          <li className="list-none">
            <button
              type="button"
              className={`${UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME} ${uiSelectableRowClassName(workspaceSyncAutomatic)}`}
              onClick={toggleWorkspaceSyncMode}
              aria-pressed={workspaceSyncAutomatic}
              aria-label={`${UI_LABELS.workspaceSyncMode}: ${syncIndicatorLabel}`}
              title={
                canvasWorkspaceSyncMode === 'realtime'
                  ? UI_COPY.canvasWorkspaceSyncRealtimeTooltip
                  : UI_COPY.canvasWorkspaceSyncManualTooltip
              }
            >
              <Link2 className={`${iconSizeClass} shrink-0`} strokeWidth={iconStrokeWidth} />
              <span className="truncate">{UI_LABELS.workspaceSyncMode}</span>
              <SelectableRowValue label={UI_LABELS.workspaceSyncMode} value={syncIndicatorLabel} />
            </button>
          </li>
          <li className="list-none">
            <button
              type="button"
              className={`${UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME} ${uiSelectableRowClassName(workspaceAutosaveEnabled)}`}
              onClick={toggleAutosave}
              aria-pressed={workspaceAutosaveEnabled}
              aria-label={`Autosave: ${uiBooleanRowValue(workspaceAutosaveEnabled)}`}
              title={workspaceAutosaveEnabled ? 'Autosave is enabled.' : 'Autosave is disabled; use Save to persist changes.'}
            >
              <SaveAll className={`${iconSizeClass} shrink-0`} strokeWidth={iconStrokeWidth} />
              <span className="truncate">Autosave</span>
              <SelectableRowValue label="Autosave" value={uiBooleanRowValue(workspaceAutosaveEnabled)} />
            </button>
          </li>
          <li className="list-none">
            <button
              type="button"
              className={`${UI_RESPONSIVE_MENU_OPTION_ROW_CLASSNAME} ${uiSelectableRowClassName(storageSyncEnabled)}`}
              onClick={toggleStorageSync}
              aria-pressed={storageSyncEnabled}
              aria-label={`${UI_LABELS.storageSync}: ${storageSyncLabel}`}
              title={
                storageSyncEnabled
                  ? UI_COPY.storageSyncOnTooltip
                  : UI_COPY.storageSyncOffTooltip
              }
            >
              <Database className={`${iconSizeClass} shrink-0`} strokeWidth={iconStrokeWidth} />
              <span className="truncate">{UI_LABELS.storageSync}</span>
              <SelectableRowValue label={UI_LABELS.storageSync} value={storageSyncLabel} />
            </button>
          </li>
        </>
      )}
      menuWidthClass={UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME}
    />
  )
}
