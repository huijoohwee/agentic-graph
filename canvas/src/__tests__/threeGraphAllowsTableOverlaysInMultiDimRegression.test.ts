import { useGraphStore } from '@/hooks/useGraphStore'
import { listDisplayRichMediaOverlayNodes } from '@/lib/render/richMediaSsot'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import type { GraphNode } from '@/lib/graph/types'

export function testThreeGraphAllowsTableOverlaysEvenInMultiDimMode() {
  const markdown = '| Item | Cost |\n| --- | --- |\n| Order | 12 |'
  const node: GraphNode = {
    id: 'table-panel', label: 'Order table', type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    properties: { richMediaActiveTab: 'text', output: markdown },
  }
  const previous = useGraphStore.getState().multiDimTableModeEnabled
  try {
    for (const enabled of [false, true]) {
      useGraphStore.setState({ multiDimTableModeEnabled: enabled })
      for (const canvas3dMode of ['3d', 'xr', 'voxel']) {
        const options = { canvasRenderMode: '3d', canvas3dMode, nodes: [node], poolMax: 24 }
        const overlays = listDisplayRichMediaOverlayNodes({ ...options, renderMediaAsNodes: true })
        const table = overlays.find(entry => entry.id === node.id)
        if (!table || table.panel?.activeTab !== 'text' || table.panel.hasText !== true || table.panel.text !== markdown) {
          throw new Error(`Expected intact table overlay in ${canvas3dMode}, multidimensional=${enabled}`)
        }
        if (listDisplayRichMediaOverlayNodes({ ...options, renderMediaAsNodes: false }).length !== 0) {
          throw new Error(`Expected display toggle to hide table overlay in ${canvas3dMode}`)
        }
      }
    }
  } finally {
    useGraphStore.setState({ multiDimTableModeEnabled: previous })
  }
}
