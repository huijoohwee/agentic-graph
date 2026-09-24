
import type { StoreApi } from 'zustand'
import type { GraphState } from './types'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { getInitialDarkThemeVariant, getInitialThemeMode, resolveThemeMode, type ResolvedThemeMode } from '@/lib/ui/theme'
import { createUiStorageReaders } from './uiSliceStorage'
import { createUiSettingsMonacoSlice } from './uiSettingsSliceMonaco'
import { createUiSettingsRenderSlice } from './uiSettingsSliceRender'
import { createUiSettingsCoreState } from './uiSettingsSliceCoreState'
import { createUiSettingsModeActions } from './uiSettingsSliceModeActions'
import { createUiSettingsDataTableSlice } from './uiSettingsSliceDataTable'
export { ensureSessionTabId, readInitialSessionTabId } from './uiSettingsSliceSession'

type SetGraph = StoreApi<GraphState>['setState']
type GetGraph = StoreApi<GraphState>['getState']

const STARTUP_DOCUMENT_MODE_DEFAULTS = {
  frontmatterModeEnabled: true,
  documentSemanticMode: 'document' as const,
}

export const createUiSettingsSlice = (set: SetGraph, get: GetGraph) => {
  const readers = createUiStorageReaders()
  const { lsInt, storage } = readers
  const themeMode = getInitialThemeMode(storage)
  const darkThemeVariant = getInitialDarkThemeVariant(storage, themeMode)
  const resolvedThemeMode: ResolvedThemeMode = resolveThemeMode(themeMode)
  const keywordDefaults = {
    sourceMaxLines: lsInt(LS_KEYS.keywordSourceMaxLines, 8000),
    sourceMaxChars: lsInt(LS_KEYS.keywordSourceMaxChars, 120_000),
    previewDebounceMs: lsInt(LS_KEYS.keywordGraphPreviewDebounceMs, 200),
    fullDebounceMs: lsInt(LS_KEYS.keywordGraphFullDebounceMs, 800),
    edgesPerNode: lsInt(LS_KEYS.keywordGraphEdgesPerNode, 6),
    maxEdgesCap: lsInt(LS_KEYS.keywordGraphMaxEdgesCap, 2400),
    mentionEdgesPerSourceNode: lsInt(LS_KEYS.keywordGraphMentionEdgesPerSourceNode, 6),
  }
  return {
    ...createUiSettingsMonacoSlice(set, readers),
    ...createUiSettingsRenderSlice(set, readers),
    ...createUiSettingsCoreState(set, get, themeMode, darkThemeVariant, resolvedThemeMode, keywordDefaults),
    ...createUiSettingsModeActions(set, get, keywordDefaults),
    ...createUiSettingsDataTableSlice(set),
    ...STARTUP_DOCUMENT_MODE_DEFAULTS,
  }
}
