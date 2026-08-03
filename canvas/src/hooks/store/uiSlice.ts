
import type { StoreApi } from 'zustand'
import type { GraphState } from '@/hooks/store/types'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { createUiStorageReaders } from './uiSliceStorage'
import { createInitialChatUiContext, createUiChatActions } from './uiSliceChat'
import { createUiInitialState } from './uiSliceInitialState'
import { createUiCoreActions } from './uiSliceCoreActions'
import { createUiIntegrationActions } from './uiSliceIntegrationActions'

type SetGraph = StoreApi<GraphState>['setState']
type GetGraph = StoreApi<GraphState>['getState']

const UI_STARTUP_PANEL_DEFAULTS = {
  floatingPanelOpen: false,
  floatingPanelView: 'propsPanel' as const,
}

export const createUiSlice = (set: SetGraph, get: GetGraph) => {
  const readers = createUiStorageReaders()
  const { lsBool } = readers
  const chat = createInitialChatUiContext(readers)
  const UI_STARTUP_VIEW_LOCK_DEFAULTS = {
    documentStructureBaselineLock: lsBool(LS_KEYS.documentStructureBaselineLock, false),
  }
  return {
    ...createUiInitialState(set, get, readers, chat),
    ...createUiCoreActions(set),
    ...createUiChatActions(set),
    ...createUiIntegrationActions(set),
    ...UI_STARTUP_PANEL_DEFAULTS,
    ...UI_STARTUP_VIEW_LOCK_DEFAULTS,
  }
}
