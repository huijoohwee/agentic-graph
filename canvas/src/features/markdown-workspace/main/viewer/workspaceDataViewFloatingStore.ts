import React from 'react'
import type { MarkdownDataViewColumn } from '@/features/markdown/ui/markdownDataViewModel'
import type { MarkdownDataViewColumnType } from '@/features/markdown/ui/markdownDataViewColumnType'
import type { WorkspaceDataViewConfig, WorkspaceDataViewLayout } from './workspaceDataViewConfig'
import type { WorkspaceEditorMode } from '@/features/workspace-table/workspaceEditorMode'
import {
  coerceDataViewFieldLineMode,
  coerceDataViewRowHeightPreset,
  type DataViewFieldLineMode,
  type DataViewRowHeightPreset,
} from '@/lib/ui/dataViewDensity'

export const WORKSPACE_DATA_VIEW_SETTINGS_PANEL_KEYS = [
  'layout',
  'properties',
  'filter',
  'sort',
  'group',
  'reset',
] as const

export type WorkspaceDataViewSettingsPanelKey =
  (typeof WORKSPACE_DATA_VIEW_SETTINGS_PANEL_KEYS)[number]

export type WorkspaceDataViewFloatingBinding = {
  registrationId: string
  contextLabel: string
  activePanel: WorkspaceDataViewSettingsPanelKey
  canMutate: boolean
  viewerLayout: WorkspaceDataViewLayout
  viewerMode?: WorkspaceEditorMode
  allowMultiDimLayout?: boolean
  columns: readonly MarkdownDataViewColumn[]
  groupByColumnId: string | null
  viewConfig: WorkspaceDataViewConfig
  setViewConfig: (next: WorkspaceDataViewConfig) => void
  onChangeLayout: (layout: WorkspaceDataViewLayout) => void
  onChangeLayoutMode?: (mode: WorkspaceEditorMode) => void
  onSelectGeospatialView?: () => void
  onReset?: () => void
  onNewRecord?: () => void
  onAddColumn?: (args: { name: string; columnType: MarkdownDataViewColumnType }) => void
  onDuplicateColumn?: (columnId: string) => void
  onDeleteColumn?: (columnId: string) => void
  onRenameColumn?: (columnId: string, nextName: string) => void
}

export type WorkspaceDataViewFloatingDensity = {
  rowHeightPreset: DataViewRowHeightPreset
  fieldLineMode: DataViewFieldLineMode
}

const listeners = new Set<() => void>()
let currentBinding: WorkspaceDataViewFloatingBinding | null = null
const registeredBindings = new Map<string, WorkspaceDataViewFloatingBinding>()
let currentDensity: WorkspaceDataViewFloatingDensity = {
  rowHeightPreset: 'comfortable',
  fieldLineMode: 'single',
}

const notifyListeners = () => {
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => currentBinding
const getDensitySnapshot = () => currentDensity

const readBindingDensity = (binding: WorkspaceDataViewFloatingBinding): WorkspaceDataViewFloatingDensity => ({
  rowHeightPreset: coerceDataViewRowHeightPreset(binding.viewConfig.rowHeightPreset),
  fieldLineMode: coerceDataViewFieldLineMode(binding.viewConfig.fieldLineMode),
})

export function setWorkspaceDataViewFloatingBinding(
  binding: WorkspaceDataViewFloatingBinding | null,
) {
  const previousRegistrationId = currentBinding?.registrationId || null
  const previousBindingDensity = currentBinding ? readBindingDensity(currentBinding) : null
  currentBinding = binding
  if (binding) {
    const nextDensity = readBindingDensity(binding)
    const bindingDensityChanged =
      !previousBindingDensity
      || previousBindingDensity.rowHeightPreset !== nextDensity.rowHeightPreset
      || previousBindingDensity.fieldLineMode !== nextDensity.fieldLineMode
    const snapshotChanged =
      currentDensity.rowHeightPreset !== nextDensity.rowHeightPreset
      || currentDensity.fieldLineMode !== nextDensity.fieldLineMode
    if ((binding.registrationId !== previousRegistrationId || bindingDensityChanged) && snapshotChanged) {
      currentDensity = nextDensity
    }
  }
  notifyListeners()
}

export function setWorkspaceDataViewFloatingDensity(next: WorkspaceDataViewFloatingDensity) {
  const normalized: WorkspaceDataViewFloatingDensity = {
    rowHeightPreset: coerceDataViewRowHeightPreset(next.rowHeightPreset),
    fieldLineMode: coerceDataViewFieldLineMode(next.fieldLineMode),
  }
  if (
    currentDensity.rowHeightPreset === normalized.rowHeightPreset
    && currentDensity.fieldLineMode === normalized.fieldLineMode
  ) {
    return
  }
  currentDensity = normalized
  notifyListeners()
}

export function clearWorkspaceDataViewFloatingBinding(registrationId: string | null) {
  if (!registrationId) return
  if (currentBinding?.registrationId !== registrationId) return
  currentBinding = null
  notifyListeners()
}

export function useWorkspaceDataViewFloatingBinding() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useWorkspaceDataViewFloatingDensity() {
  return React.useSyncExternalStore(subscribe, getDensitySnapshot, getDensitySnapshot)
}

export function useWorkspaceDataViewFloatingRegistration(
  binding: WorkspaceDataViewFloatingBinding | null,
) {
  const registrationId = binding?.registrationId ?? null
  React.useLayoutEffect(() => {
    if (!binding) return
    registeredBindings.set(binding.registrationId, binding)
    if (!currentBinding || currentBinding.registrationId === binding.registrationId) {
      setWorkspaceDataViewFloatingBinding(binding)
    }
  }, [binding])
  React.useLayoutEffect(() => {
    return () => {
      if (!registrationId) return
      registeredBindings.delete(registrationId)
      if (currentBinding?.registrationId === registrationId) {
        setWorkspaceDataViewFloatingBinding(registeredBindings.values().next().value ?? null)
      }
    }
  }, [registrationId])
  return React.useCallback((activePanel: WorkspaceDataViewSettingsPanelKey) => {
    if (!binding) return
    const active = { ...binding, activePanel }
    registeredBindings.set(binding.registrationId, active)
    setWorkspaceDataViewFloatingBinding(active)
  }, [binding])
}
