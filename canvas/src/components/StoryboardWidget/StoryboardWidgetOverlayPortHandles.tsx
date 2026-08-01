import React from 'react'

import { WidgetEditorPortHandles } from '@/components/StoryboardWidget/WidgetEditorPortHandles'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { isCanonicalNodeIdEqual, resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import {
  FLOW_PORT_HANDLE_CANCEL_EVENT,
  FLOW_PORT_HANDLE_FINALIZE_EVENT,
  FLOW_PORT_HANDLE_SELECTOR,
  readFlowPortHandleAtClientPoint,
  startFlowPortHandleMouseDrag,
  startFlowPortHandlePointerDrag,
  type FlowPortHandleCancelDetail,
  type FlowPortHandleFinalizeDetail,
} from '@/components/StoryboardWidget/flowPortHandlePointerDrag'
import { hasOutgoingTextSelectionWidgetEdge } from '@/lib/storyboardWidget/textSelectionWidgetLink'

type PortHandleInteractionContextValue = {
  active: boolean
  graphData: GraphData | null
  pendingEdgeSourceId: string | null
  pendingEdgeSourceIds: ReadonlyArray<string>
  registryEntries: ReadonlyArray<WidgetRegistryEntry>
  schema: GraphSchema | null
  toolMode: 'select' | 'addEdge'
  beginEdge: (nodeId: string, portKey?: string | null) => void
  cancelEdge: () => void
  finalizeEdge: (nodeId: string, portKey?: string | null, source?: { nodeId: string; portKey: string | null }) => void
}

const PortHandleInteractionContext = React.createContext<PortHandleInteractionContextValue | null>(null)

export function StoryboardWidgetOverlayPortHandleProvider(props: React.PropsWithChildren<PortHandleInteractionContextValue>) {
  const { children, ...value } = props
  React.useEffect(() => {
    if (!value.active || typeof document === 'undefined') return undefined
    const consumeCoveredHandleEvent = (event: PointerEvent | MouseEvent) => {
      if (event.button !== 0) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(FLOW_PORT_HANDLE_SELECTOR)) return
      const sourceHandle = readFlowPortHandleAtClientPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        dir: 'out',
      })
      if (!sourceHandle || sourceHandle.disabled) return
      const sourceNodeId = String(sourceHandle.dataset.kgPortNodeId || '').trim()
      if (!sourceNodeId) return
      const sourcePortKey = String(sourceHandle.dataset.kgPortKey || '').trim() || null
      try {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      } catch {
        void 0
      }
      const startedDrag = 'pointerId' in event
        ? startFlowPortHandlePointerDrag({ event, sourceNodeId, sourcePortKey })
        : startFlowPortHandleMouseDrag({ event, sourceNodeId, sourcePortKey })
      if (!startedDrag) return
      value.beginEdge(sourceNodeId, sourcePortKey)
    }
    const handleFinalize = (event: Event) => {
      const detail = (event as CustomEvent<FlowPortHandleFinalizeDetail>).detail
      const targetNodeId = String(detail?.targetNodeId || '').trim()
      if (!targetNodeId) return
      event.preventDefault()
      value.finalizeEdge(targetNodeId, detail.targetPortKey, {
        nodeId: String(detail.sourceNodeId || '').trim(),
        portKey: String(detail.sourcePortKey || '').trim() || null,
      })
    }
    const handleCancel = (event: Event) => {
      const detail = (event as CustomEvent<FlowPortHandleCancelDetail>).detail
      if (!String(detail?.sourceNodeId || '').trim()) return
      event.preventDefault()
      value.cancelEdge()
    }
    window.addEventListener('pointerdown', consumeCoveredHandleEvent, { passive: false, capture: true })
    window.addEventListener('mousedown', consumeCoveredHandleEvent, { passive: false, capture: true })
    document.addEventListener(FLOW_PORT_HANDLE_FINALIZE_EVENT, handleFinalize)
    document.addEventListener(FLOW_PORT_HANDLE_CANCEL_EVENT, handleCancel)
    return () => {
      window.removeEventListener('pointerdown', consumeCoveredHandleEvent, true)
      window.removeEventListener('mousedown', consumeCoveredHandleEvent, true)
      document.removeEventListener(FLOW_PORT_HANDLE_FINALIZE_EVENT, handleFinalize)
      document.removeEventListener(FLOW_PORT_HANDLE_CANCEL_EVENT, handleCancel)
    }
  }, [value.active, value.beginEdge, value.cancelEdge, value.finalizeEdge])
  return <PortHandleInteractionContext.Provider value={value}>{children}</PortHandleInteractionContext.Provider>
}

export function StoryboardWidgetOverlayPortHandles(props: {
  node?: GraphNode | null
  nodeId?: string
  selected: boolean
}) {
  const interaction = React.useContext(PortHandleInteractionContext)
  const nodeId = String(props.node?.id || props.nodeId || '').trim()
  const node = props.node || resolveGraphNodeByCanonicalId(interaction?.graphData, nodeId)
  const pendingSourceId = String(interaction?.pendingEdgeSourceId || '').trim()
  const pendingSourceIds = interaction?.pendingEdgeSourceIds?.length
    ? interaction.pendingEdgeSourceIds
    : pendingSourceId ? [pendingSourceId] : []
  const isPendingSource = interaction?.toolMode === 'addEdge'
    && pendingSourceIds.some(sourceId => isCanonicalNodeIdEqual(sourceId, nodeId))
  const isPendingTarget = interaction?.toolMode === 'addEdge'
    && pendingSourceIds.length > 0
    && !isPendingSource
  const hasPersistentProvenanceOutput = hasOutgoingTextSelectionWidgetEdge({
    graphData: interaction?.graphData,
    sourceNodeId: nodeId,
  })
  const isUnselectedAndNotPendingEndpoint = !props.selected && !isPendingSource && !isPendingTarget
  const persistentOutputOnly = isUnselectedAndNotPendingEndpoint && hasPersistentProvenanceOutput
  const pendingSourceOutputOnly = isPendingSource && !props.selected
  if (
    !interaction
    || !interaction.active
    || (isUnselectedAndNotPendingEndpoint && !hasPersistentProvenanceOutput)
    || !node
  ) return null

  return (
    <WidgetEditorPortHandles
      active
      node={node}
      schema={interaction.schema}
      registryEntries={interaction.registryEntries}
      edges={interaction.graphData?.edges || []}
      forceEnabled
      outputOnly={persistentOutputOnly || pendingSourceOutputOnly}
      toolMode={interaction.toolMode}
      pendingEdgeSourceId={interaction.pendingEdgeSourceId}
      onBeginAddEdgeFromNode={interaction.beginEdge}
      onFinalizeAddEdgeToNode={interaction.finalizeEdge}
    />
  )
}
