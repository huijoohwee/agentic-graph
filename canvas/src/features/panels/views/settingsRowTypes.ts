import React from 'react'

export type SettingsToastPayload = {
  id: string
  kind: 'neutral' | 'error' | 'success'
  message: string
  ttlMs?: number
  dismissible?: boolean
}

export type SettingsRowStatusState = {
  bytePlusHealthDetails: string | null
  bytePlusHealthOk: boolean | null
  chatHealthDetails: string | null
  chatHealthOk: boolean | null
  chatHistoryPathStatus: string | null
  deerFlowHealthDetails: string | null
  deerFlowHealthOk: boolean | null
  grabMapsHealthDetails: string | null
  grabMapsHealthOk: boolean | null
  isCheckingBytePlusHealth: boolean
  isCheckingBytePlusVideoModelPreview: boolean
  isCheckingDeerFlowHealth: boolean
  isCheckingGrabMapsHealth: boolean
  isCheckingHealth: boolean
  isUpdatingChatHistoryPath: boolean
  isUpdatingAgenticGraphPath: boolean
  agenticGraphPathStatus: string | null
  normalizedChatProvider: string
}

export type SettingsRowRefs = {
  dirtyRef: React.MutableRefObject<Set<string>>
  agenticOsLocalImportInputRef: React.RefObject<HTMLInputElement | null>
  agenticOsLocalFolderImportInputRef: React.RefObject<HTMLInputElement | null>
  localImportInputRef: React.RefObject<HTMLInputElement | null>
  localFolderImportInputRef: React.RefObject<HTMLInputElement | null>
}

export type SettingsRowActions = {
  applyActiveWorkspaceFileAsChatHistory: () => void
  applyActiveWorkspaceFileAsAgenticGraph: () => void
  buildChatAssistNodes: (rowKey: string) => React.ReactNode[]
  checkBytePlusHealth: () => void
  checkBytePlusVideoModelPreview: () => void
  checkChatHealth: () => void
  checkDeerFlowHealth: () => void
  checkGrabMapsHealth: () => Promise<unknown>
  createAndSelectChatHistoryFile: () => Promise<unknown>
  createAndSelectAgenticGraphFile: () => Promise<unknown>
  importCloudUrlForChatHistory: () => void
  importCloudUrlForAgenticGraph: () => void
  openFilePicker: (el: HTMLInputElement | null) => void
  openWorkspaceFile: (path: string) => void
  pushUiToast: (toast: SettingsToastPayload) => void
  renderInput: (key: string, type: string, writable: boolean, options?: string[], displayValueOverride?: string | number | boolean) => React.ReactNode
  setChatHistoryPathStatus: React.Dispatch<React.SetStateAction<string | null>>
  setAgenticGraphPathStatus: React.Dispatch<React.SetStateAction<string | null>>
  setValues: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>
}

export type SettingsRowToggleActions = {
  onToggleExpanded: () => void
}

export type SettingsRowUi = {
  settingsTypeIconSizeClass: string
  uiIconStrokeWidth: number
  uiPanelKeyValueTextSizeClass: string
}
