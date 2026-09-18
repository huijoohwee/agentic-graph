import type { PropsPanelOpenEventDetail, FloatingPanelOpenEventDetail } from '@/features/canvas/utils'
import type { FloatingPanelView } from '@/hooks/store/store-types/graph-state-chat-import'
import { useSyncExternalStore } from 'react'
import type { GraphData } from '@/lib/graph/types'

// Ephemeral renderer focus for an embedded read-only D3 surface; never replaces authored graph data.
let rendererInspectionGraph: GraphData | null = null
const rendererInspectionListeners = new Set<() => void>()
const subscribeRendererInspection = (listener: () => void) => {
  rendererInspectionListeners.add(listener)
  return () => { rendererInspectionListeners.delete(listener) }
}
export const useRendererInspectionGraph = () => useSyncExternalStore(subscribeRendererInspection, () => rendererInspectionGraph, () => null)
export function focusRendererInspectionGraph(graph: GraphData): void {
  if (rendererInspectionGraph === graph) return
  rendererInspectionGraph = graph
  rendererInspectionListeners.forEach(listener => listener())
}
export function releaseRendererInspectionGraph(graph: GraphData): void {
  if (rendererInspectionGraph !== graph) return
  rendererInspectionGraph = null
  rendererInspectionListeners.forEach(listener => listener())
}

export type FloatingPanelRequestedView = FloatingPanelView

type FloatingPanelBridge = {
  openPropsPanel: (detail?: PropsPanelOpenEventDetail) => void
  openFloatingPanel: (detail?: FloatingPanelOpenEventDetail) => void
  openRendererPanel: () => void
}

const FLOATING_PANEL_BRIDGE_KEY = '__agenticGraphFloatingPanelBridge'
const floatingPanelBridgeReadyCallbacks = new Set<() => void>()

declare global {
  interface Window {
    __agenticGraphFloatingPanelBridge?: FloatingPanelBridge
  }
}

export function installFloatingPanelBridge(bridge: FloatingPanelBridge): () => void {
  if (typeof window === 'undefined') return () => void 0
  window[FLOATING_PANEL_BRIDGE_KEY] = bridge
  for (const callback of floatingPanelBridgeReadyCallbacks) callback()
  floatingPanelBridgeReadyCallbacks.clear()
  return () => {
    if (window[FLOATING_PANEL_BRIDGE_KEY] === bridge) {
      delete window[FLOATING_PANEL_BRIDGE_KEY]
    }
  }
}

export function isFloatingPanelBridgeReady(): boolean {
  return typeof window !== 'undefined' && Boolean(window[FLOATING_PANEL_BRIDGE_KEY])
}

export function whenFloatingPanelBridgeReady(callback: () => void): () => void {
  if (isFloatingPanelBridgeReady()) {
    callback()
    return () => void 0
  }
  floatingPanelBridgeReadyCallbacks.add(callback)
  return () => floatingPanelBridgeReadyCallbacks.delete(callback)
}

export function requestPropsPanelOpen(detail?: PropsPanelOpenEventDetail): boolean {
  if (typeof window === 'undefined') return false
  const bridge = window[FLOATING_PANEL_BRIDGE_KEY]
  if (!bridge) return false
  bridge.openPropsPanel(detail)
  return true
}

export function requestFloatingPanelOpen(detail?: FloatingPanelOpenEventDetail): boolean {
  if (typeof window === 'undefined') return false
  const bridge = window[FLOATING_PANEL_BRIDGE_KEY]
  if (!bridge) return false
  bridge.openFloatingPanel(detail)
  return true
}

export function requestRendererPanelOpen(): boolean {
  if (typeof window === 'undefined') return false
  const bridge = window[FLOATING_PANEL_BRIDGE_KEY]
  if (!bridge) return false
  bridge.openRendererPanel()
  return true
}
