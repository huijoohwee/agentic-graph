import React from 'react'

import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import {
  clearTextSelectionWidgetLinkSessionIfCurrent,
  persistTextSelectionWidgetEdgeAfterTargetCreation,
  resolveTextSelectionWidgetTargetPosition,
  TEXT_SELECTION_WIDGET_CREATE_EVENT,
  type TextSelectionWidgetCreateDetail,
} from '@/lib/storyboardWidget/textSelectionWidgetLink'

export function useTextSelectionWidgetCreateBridge(args: {
  active: boolean
  widgetRegistryRef: React.MutableRefObject<ReadonlyArray<WidgetRegistryEntry>>
  resolveRegistryEntry: (
    registry: ReadonlyArray<WidgetRegistryEntry>,
    payload: {
      registryEntryId: string
      nodeTypeId: string
      widgetTypeId: string
      formId: string
    },
  ) => WidgetRegistryEntry | null
  addNodeFromRegistryAtWorld: (payload: {
    entry: WidgetRegistryEntry
    layoutVariantId?: unknown
    x: number
    y: number
  }) => string
  appendDraftEdge?: (edge: GraphData['edges'][number]) => boolean
  authoringGraphDataRef?: React.MutableRefObject<GraphData | null>
  baseGraphData?: GraphData | null
}) {
  const {
    active,
    widgetRegistryRef,
    resolveRegistryEntry,
    addNodeFromRegistryAtWorld,
    appendDraftEdge,
    authoringGraphDataRef,
    baseGraphData,
  } = args

  React.useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const waitForGraphMutation = () => new Promise<void>(resolve => {
      window.requestAnimationFrame(() => resolve())
    })
    const onCreateTarget = (event: Event) => {
      const detail = (event as CustomEvent<TextSelectionWidgetCreateDetail>).detail
      if (!detail || detail.claimed) return
      const stateBefore = useGraphStore.getState()
      const graphBefore = stateBefore.graphData as GraphData | null
      if (!graphBefore) return
      const sourceNode = resolveGraphNodeByCanonicalId(graphBefore, detail.session.sourceNodeId)
      const entry = resolveRegistryEntry(widgetRegistryRef.current || [], detail.target)
      if (!sourceNode || !entry) return
      detail.claimed = true
      const position = resolveTextSelectionWidgetTargetPosition({ sourceNode })
      const targetNodeId = addNodeFromRegistryAtWorld({
        entry,
        layoutVariantId: detail.target.layoutVariantId,
        x: position.x,
        y: position.y,
      })
      if (!targetNodeId) return
      void persistTextSelectionWidgetEdgeAfterTargetCreation({
        readGraphDataCandidates: () => [
          useGraphStore.getState().graphData as GraphData | null,
          authoringGraphDataRef?.current || null,
          baseGraphData || null,
        ],
        session: {
          ...detail.session,
          sourceNodeId: sourceNode.id,
        },
        targetNodeId,
        addEdge: edge => {
          // The authoring draft can lag one render behind the newly-created target.
          // Preserve the normal draft path, but never drop the selection edge when
          // that writer declines the just-created target.
          if (appendDraftEdge?.(edge) !== true) useGraphStore.getState().addEdge(edge)
        },
        waitForGraphMutation,
      }).then(result => {
        if (result.kind === 'unresolved') {
          useGraphStore.getState().upsertUiToast({
            id: 'rich-media-selection-widget-link-error',
            kind: 'error',
            message: 'The target Widget was created, but the selection edge could not be resolved.',
            ttlMs: 5000,
          })
          return
        }
        if (result.kind === 'rejected') {
          useGraphStore.getState().upsertUiToast({
            id: 'rich-media-selection-widget-link-error',
            kind: 'error',
            message: 'The target Widget was created, but the graph rejected the selection edge.',
            ttlMs: 5000,
          })
          return
        }
        clearTextSelectionWidgetLinkSessionIfCurrent(detail.session)
        useGraphStore.getState().upsertUiToast({
          id: 'rich-media-selection-widget-link-complete',
          kind: 'success',
          message: `Created ${entry.nodeTypeId} and linked the selected text.`,
          ttlMs: 3000,
        })
      })
    }
    window.addEventListener(TEXT_SELECTION_WIDGET_CREATE_EVENT, onCreateTarget)
    return () => window.removeEventListener(TEXT_SELECTION_WIDGET_CREATE_EVENT, onCreateTarget)
  }, [
    active,
    addNodeFromRegistryAtWorld,
    appendDraftEdge,
    authoringGraphDataRef,
    baseGraphData,
    resolveRegistryEntry,
    widgetRegistryRef,
  ])
}
