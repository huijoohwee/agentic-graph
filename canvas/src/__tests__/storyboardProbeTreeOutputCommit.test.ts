import { commitStoryboardCardCanonicalText2d } from '@/components/StoryboardWidgetCanvas/storyboardCardCanonicalTextCommit2d'
import { buildStoryboardCardTextModel } from '@/components/StoryboardWidgetCanvas/storyboardCardTextModel'
import type { GraphData } from '@/lib/graph/types'

export function testStoryboardProbeTreeOutputCommitUpdatesDurableDraftAndCanonicalStore() {
  const cardId = 'probe-option'
  const nextOutput = 'An explicit, source-backed answer.'
  const textModel = buildStoryboardCardTextModel({
    summary: 'Which evidence should select this branch?',
    output: '',
    typeLabel: 'Probe-Tree Card',
  })
  if (textModel.secondaryField?.id !== 'output' || !textModel.secondaryEditable) {
    throw new Error(`expected Probe-Tree secondary text to use editable Output, got ${JSON.stringify(textModel)}`)
  }
  const graphData: GraphData = {
    type: 'flow',
    nodes: [{
      id: `frontmatter::${cardId}`,
      type: 'TextGeneration',
      label: 'Probe-Tree Card',
      properties: { response: 'stale alias', keep: 'yes' },
    }],
    edges: [],
  }
  let committedGraph: GraphData | null = null
  let publicationCount = 0
  let downstreamPatchCount = 0
  const history: string[] = []
  commitStoryboardCardCanonicalText2d({
    addHistory: label => history.push(label),
    canonicalKey: textModel.secondaryField.canonicalKey,
    cardId,
    // The graph publisher owns both durable draft and canonical-store updates.
    commitGraphData: next => { committedGraph = next; publicationCount += 1 },
    currentProperties: {},
    graphData,
    historyLabel: 'Storyboard output',
    nextValue: nextOutput,
    preserveFormatting: true,
    propertyKeys: textModel.secondaryField.propertyKeys,
    updateNode: () => { downstreamPatchCount += 1 },
  })
  const committedProperties = committedGraph?.nodes?.[0]?.properties || {}
  if (committedProperties.output !== nextOutput || publicationCount !== 1 || downstreamPatchCount !== 0) {
    throw new Error(`expected one authoritative Output publication without a competing node patch, got ${JSON.stringify({ committedProperties, publicationCount, downstreamPatchCount })}`)
  }
  if ('response' in committedProperties) {
    throw new Error('expected Output commit to remove stale response aliases')
  }
  if (committedProperties.keep !== 'yes' || history.join('|') !== 'Storyboard output') {
    throw new Error(`expected Output commit to retain sibling properties and add one history entry, got ${JSON.stringify({ committedProperties, history })}`)
  }
  if (graphData.nodes[0].properties?.response !== 'stale alias' || 'output' in graphData.nodes[0].properties) {
    throw new Error('expected Output publication to preserve the input graph snapshot')
  }
}
