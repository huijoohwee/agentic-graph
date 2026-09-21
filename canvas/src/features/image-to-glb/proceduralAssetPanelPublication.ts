import {
  ensureStoryboardWidgetAssetDerivedOutputEdge,
  ensureStoryboardWidgetAssetDerivedOutputPanelNodeId,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import type { GraphNode } from '@/lib/graph/types'
import { isProceduralAssetOutputPanel, PROCEDURAL_ASSET_OUTPUT_ANCHOR, PROCEDURAL_ASSET_OUTPUT_PANEL } from './proceduralAssetWorkflowContract'

export type ProceduralAssetOutputPublisher = (args: { anchorNode: GraphNode; patch: Record<string, unknown> }) => boolean
type GenericPublisher = (args: {
  panelArgs: Parameters<ProceduralAssetOutputPublisher>[0]
  ensureOutputPanelNodeId: (args: Parameters<typeof ensureStoryboardWidgetAssetDerivedOutputPanelNodeId>[0]) => string | null
  ensureOutputEdge: (args: Parameters<typeof ensureStoryboardWidgetAssetDerivedOutputEdge>[0]) => ReturnType<typeof ensureStoryboardWidgetAssetDerivedOutputEdge>
}) => boolean

/** Marker adapters reuse the same draft transaction, placement and edge owner as other native assets. */
export function createProceduralAssetPanelPublisher(publish: GenericPublisher): ProceduralAssetOutputPublisher {
  return panelArgs => publish({
    panelArgs,
    ensureOutputPanelNodeId: args => ensureStoryboardWidgetAssetDerivedOutputPanelNodeId(args, {
      anchorIdProperty: PROCEDURAL_ASSET_OUTPUT_ANCHOR,
      panelProperty: PROCEDURAL_ASSET_OUTPUT_PANEL,
      label: 'Procedural Asset',
      isOutputPanel: isProceduralAssetOutputPanel,
    }),
    ensureOutputEdge: args => ensureStoryboardWidgetAssetDerivedOutputEdge(args, {
      anchorIdProperty: PROCEDURAL_ASSET_OUTPUT_ANCHOR,
      edgeProperty: 'proceduralAssetOutputEdge',
      edgeLabel: 'asset.create output',
      targetIdProperty: 'proceduralAssetOutputPanelNodeId',
    }),
  })
}
