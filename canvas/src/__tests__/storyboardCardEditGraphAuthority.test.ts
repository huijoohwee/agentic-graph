import { resolveStoryboardCardEditGraphAuthority } from '@/components/StoryboardWidgetCanvas/storyboardCardEditGraphAuthority'
import type { GraphData } from '@/lib/graph/types'

export function testStoryboardCardEditUsesRenderedDocumentGraphAuthority() {
  const cardId = 'doc:md:note-20260803t020301z'
  const renderedGraphData: GraphData = {
    type: 'Graph',
    context: 'markdown',
    nodes: [{ id: cardId, type: 'Document', label: 'note_20260803T020301Z', properties: { summary: '' } }],
    edges: [],
  }
  const storeGraphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'workspace-root', type: 'Document', label: 'Workspace', properties: {} }],
    edges: [],
  }
  const resolved = resolveStoryboardCardEditGraphAuthority({ cardId, renderedGraphData, storeGraphData })
  if (resolved.graphData !== renderedGraphData || resolved.node?.id !== cardId) {
    throw new Error('expected a visible document-derived Storyboard card to commit through its rendered source graph instead of an unrelated store graph')
  }
}
