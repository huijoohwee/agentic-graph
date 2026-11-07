import React from 'react'
import type { SettingsRowActions, SettingsRowRefs, SettingsRowStatusState, SettingsRowUi } from './settingsRowTypes'

type UseSettingsRowBundlesArgs = {
  applyActiveWorkspaceFileAsChatHistory: () => void
  applyActiveWorkspaceFileAsAgenticGraph: () => void
  buildChatAssistNodes: (rowKey: string) => React.ReactNode[]
  bytePlusHealthDetails: string | null
  bytePlusHealthOk: boolean | null
  chatHealthDetails: string | null
  chatHealthOk: boolean | null
  chatHistoryPathStatus: string | null
  checkBytePlusHealth: () => void
  checkBytePlusVideoModelPreview: () => void
  checkChatHealth: () => void
  checkGrabMapsHealth: () => Promise<unknown>
  createAndSelectChatHistoryFile: () => Promise<unknown>
  createAndSelectAgenticGraphFile: () => Promise<unknown>
  dirtyRef: React.MutableRefObject<Set<string>>
  grabMapsHealthDetails: string | null
  grabMapsHealthOk: boolean | null
  importCloudUrlForChatHistory: () => void
  importCloudUrlForAgenticGraph: () => void
  isCheckingBytePlusHealth: boolean
  isCheckingBytePlusVideoModelPreview: boolean
  isCheckingGrabMapsHealth: boolean
  isCheckingHealth: boolean
  isUpdatingChatHistoryPath: boolean
  isUpdatingAgenticGraphPath: boolean
  agenticOsLocalImportInputRef: React.RefObject<HTMLInputElement | null>
  agenticOsLocalFolderImportInputRef: React.RefObject<HTMLInputElement | null>
  agenticGraphPathStatus: string | null
  localImportInputRef: React.RefObject<HTMLInputElement | null>
  localFolderImportInputRef: React.RefObject<HTMLInputElement | null>
  normalizedChatProvider: string
  openFilePicker: (el: HTMLInputElement | null) => void
  openWorkspaceFile: (path: string) => void
  pushUiToast: SettingsRowActions['pushUiToast']
  renderInput: SettingsRowActions['renderInput']
  setChatHistoryPathStatus: React.Dispatch<React.SetStateAction<string | null>>
  setAgenticGraphPathStatus: React.Dispatch<React.SetStateAction<string | null>>
  setValues: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>
  settingsTypeIconSizeClass: string
  uiIconStrokeWidth: number
  uiPanelKeyValueTextSizeClass: string
}

export function useSettingsRowBundles({
  applyActiveWorkspaceFileAsChatHistory,
  applyActiveWorkspaceFileAsAgenticGraph,
  buildChatAssistNodes,
  bytePlusHealthDetails,
  bytePlusHealthOk,
  chatHealthDetails,
  chatHealthOk,
  chatHistoryPathStatus,
  checkBytePlusHealth,
  checkBytePlusVideoModelPreview,
  checkChatHealth,
  checkGrabMapsHealth,
  createAndSelectChatHistoryFile,
  createAndSelectAgenticGraphFile,
  dirtyRef,
  grabMapsHealthDetails,
  grabMapsHealthOk,
  importCloudUrlForChatHistory,
  importCloudUrlForAgenticGraph,
  isCheckingBytePlusHealth,
  isCheckingBytePlusVideoModelPreview,
  isCheckingGrabMapsHealth,
  isCheckingHealth,
  isUpdatingChatHistoryPath,
  isUpdatingAgenticGraphPath,
  agenticOsLocalImportInputRef,
  agenticOsLocalFolderImportInputRef,
  agenticGraphPathStatus,
  localImportInputRef,
  localFolderImportInputRef,
  normalizedChatProvider,
  openFilePicker,
  openWorkspaceFile,
  pushUiToast,
  renderInput,
  setChatHistoryPathStatus,
  setAgenticGraphPathStatus,
  setValues,
  settingsTypeIconSizeClass,
  uiIconStrokeWidth,
  uiPanelKeyValueTextSizeClass,
}: UseSettingsRowBundlesArgs) {
  const refs = React.useMemo<SettingsRowRefs>(() => ({
    dirtyRef,
    agenticOsLocalImportInputRef,
    agenticOsLocalFolderImportInputRef,
    localImportInputRef,
    localFolderImportInputRef,
  }), [dirtyRef, agenticOsLocalFolderImportInputRef, agenticOsLocalImportInputRef, localFolderImportInputRef, localImportInputRef])

  const status = React.useMemo<SettingsRowStatusState>(() => ({
    bytePlusHealthDetails,
    bytePlusHealthOk,
    chatHealthDetails,
    chatHealthOk,
    chatHistoryPathStatus,
    grabMapsHealthDetails,
    grabMapsHealthOk,
    isCheckingBytePlusHealth,
    isCheckingBytePlusVideoModelPreview,
    isCheckingGrabMapsHealth,
    isCheckingHealth,
    isUpdatingChatHistoryPath,
    isUpdatingAgenticGraphPath,
    agenticGraphPathStatus,
    normalizedChatProvider,
  }), [
    bytePlusHealthDetails,
    bytePlusHealthOk,
    chatHealthDetails,
    chatHealthOk,
    chatHistoryPathStatus,
    grabMapsHealthDetails,
    grabMapsHealthOk,
    isCheckingBytePlusHealth,
    isCheckingBytePlusVideoModelPreview,
    isCheckingGrabMapsHealth,
    isCheckingHealth,
    isUpdatingChatHistoryPath,
    isUpdatingAgenticGraphPath,
    agenticGraphPathStatus,
    normalizedChatProvider,
  ])

  const ui = React.useMemo<SettingsRowUi>(() => ({
    settingsTypeIconSizeClass,
    uiIconStrokeWidth,
    uiPanelKeyValueTextSizeClass,
  }), [settingsTypeIconSizeClass, uiIconStrokeWidth, uiPanelKeyValueTextSizeClass])

  const actions = React.useMemo<SettingsRowActions>(() => ({
    applyActiveWorkspaceFileAsChatHistory,
    applyActiveWorkspaceFileAsAgenticGraph,
    buildChatAssistNodes,
    checkBytePlusHealth,
    checkBytePlusVideoModelPreview,
    checkChatHealth,
    checkGrabMapsHealth,
    createAndSelectChatHistoryFile,
    createAndSelectAgenticGraphFile,
    importCloudUrlForChatHistory,
    importCloudUrlForAgenticGraph,
    openFilePicker,
    openWorkspaceFile,
    pushUiToast,
    renderInput,
    setChatHistoryPathStatus,
    setAgenticGraphPathStatus,
    setValues,
  }), [
    applyActiveWorkspaceFileAsChatHistory,
    applyActiveWorkspaceFileAsAgenticGraph,
    buildChatAssistNodes,
    checkBytePlusHealth,
    checkBytePlusVideoModelPreview,
    checkChatHealth,
    checkGrabMapsHealth,
    createAndSelectChatHistoryFile,
    createAndSelectAgenticGraphFile,
    importCloudUrlForChatHistory,
    importCloudUrlForAgenticGraph,
    openFilePicker,
    openWorkspaceFile,
    pushUiToast,
    renderInput,
    setChatHistoryPathStatus,
    setAgenticGraphPathStatus,
    setValues,
  ])

  return { actions, refs, status, ui }
}
