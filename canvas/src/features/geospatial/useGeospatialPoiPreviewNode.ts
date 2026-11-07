import React from 'react'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import {
  subscribeGrabMapsPoiRichMediaPreview,
  type GrabMapsPoiRichMediaPreviewPayload,
} from '@/features/geospatial/grabMapsPoiRichMedia'
import { buildRichMediaPanelNode, isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'

export function useGeospatialPoiPreviewNode(documentKey: string, graphData: GraphData): GraphNode | null {
  const [preview, setPreview] = React.useState<GrabMapsPoiRichMediaPreviewPayload | null>(null)
  React.useEffect(() => subscribeGrabMapsPoiRichMediaPreview(setPreview), [])
  const previousDocumentKey = React.useRef(documentKey)
  React.useEffect(() => {
    if (previousDocumentKey.current === documentKey) return
    previousDocumentKey.current = documentKey
    setPreview(null)
  }, [documentKey])
  return React.useMemo(() => {
    const targetNodeId = String(preview?.targetNodeId || '').trim()
    if (!targetNodeId) return null
    const resolved = resolveGraphNodeByCanonicalId(graphData, targetNodeId)
    const existing = resolved && isRichMediaPanelNode(resolved) ? resolved : null
    const base = existing || buildRichMediaPanelNode({ id: targetNodeId })
    return {
      ...base,
      label: String(preview?.label || '').trim() || base.label,
      properties: {
        ...(base.properties || {}),
        media_interactive: true,
        richMediaActiveTab: 'poi',
        output: '',
        outputSrcDoc: String(preview?.srcDoc || '').trim(),
      },
    }
  }, [graphData, preview])
}
