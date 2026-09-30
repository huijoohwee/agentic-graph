import { deriveKeywordGraphFromText } from '@/features/semantic-mode/keywordGraph'
import { mergeKeywordGraphWithSourceNodes } from '@/hooks/useActiveGraphData'
import { markdownToPlainText } from '@/hooks/active-graph-data/keywordSourceText'
import { buildGraphMetaKey } from '@/lib/graph/graphMetaKey'
import { extractMarkdownAnnotationsFromText } from '@/lib/markdown/markdownSigil'

export const testKeywordModeDerivesEntitiesAndPredicateEdges = () => {
  const { graph } = deriveKeywordGraphFromText({
    documentId: 'doc:test',
    documentText: 'The cat eats fish.\nA cat likes fish.\nAbout the cat.',
  })
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  const nodeKeys = new Set<string>()
  let hasNodeSizing = false
  let hasLayer = false
  let hasIdeaTag = false
  for (const n of nodes) {
    const props = (n.properties || {}) as Record<string, unknown>
    const key = String(props['keyword:key'] || '')
    if (key) nodeKeys.add(key)
    const sz = props['visual:nodeSize']
    if (typeof sz === 'number' && Number.isFinite(sz) && sz > 0) hasNodeSizing = true
    const layer = props['visual:layer']
    if (typeof layer === 'number' && Number.isFinite(layer)) hasLayer = true
    const tags = props['tags']
    if (Array.isArray(tags) && tags.map(v => String(v).toLowerCase()).includes('idea')) hasIdeaTag = true
  }
  if (nodeKeys.has('the') || nodeKeys.has('a')) throw new Error('Keyword nodes should exclude stopwords')
  if (nodeKeys.has('about')) throw new Error('Keyword nodes should exclude native function words')
  if (!nodeKeys.has('cat') || !nodeKeys.has('fish')) throw new Error('Keyword nodes missing expected entities')
  if (!hasNodeSizing) throw new Error('Keyword nodes should carry visual:nodeSize scaled by frequency')
  if (!hasLayer) throw new Error('Keyword nodes should carry visual:layer derived from communities')
  if (!hasIdeaTag) throw new Error('Keyword nodes should carry palette tags (idea)')
  const labels = new Set(edges.map(e => String(e.label || '').toLowerCase()).filter(Boolean))
  if (!labels.has('eats') && !labels.has('likes')) {
    throw new Error('Keyword edges should infer relationship keywords from text')
  }
  const hasEdgeWidth = edges.some(e => {
    const props = (e.properties || {}) as Record<string, unknown>
    const w = props['visual:width']
    return typeof w === 'number' && Number.isFinite(w) && w > 0
  })
  if (!hasEdgeWidth) throw new Error('Keyword edges should carry visual:width scaled by strength')
}

export const testKeywordModeMergesMediaNodesForOverlays = () => {
  const baseGraph = {
    type: 'Graph',
    nodes: [
      {
        id: 'media:1',
        label: 'Demo Media',
        type: 'Image',
        properties: { media_url: 'https://example.com/demo.png' },
        metadata: {},
      },
    ],
    edges: [],
  }
  const { graph: keywordGraph } = deriveKeywordGraphFromText({
    documentId: 'doc:test',
    documentText: 'Cat likes fish.',
  })
  const merged = mergeKeywordGraphWithSourceNodes({
    baseGraphData: baseGraph as unknown as typeof keywordGraph,
    keywordGraph,
    sourceId: 'doc:test',
  })
  const ids = new Set((merged.nodes || []).map(n => String(n.id)))
  if (!ids.has('media:1')) throw new Error('Keyword mode should retain media-capable nodes for overlays')
}

export const testKeywordModeCarriesSourceLayerHashForNoStaleViews = () => {
  const a = deriveKeywordGraphFromText({
    documentId: 'doc:test',
    documentText: 'Alpha causes Beta.',
  }).graph
  const b = deriveKeywordGraphFromText({
    documentId: 'doc:test',
    documentText: 'Alpha causes Beta. Gamma appears too.',
  }).graph

  const metaA = (a.metadata || {}) as Record<string, unknown>
  const metaB = (b.metadata || {}) as Record<string, unknown>
  const hA = typeof metaA.sourceLayerHash === 'string' ? metaA.sourceLayerHash.trim() : ''
  const hB = typeof metaB.sourceLayerHash === 'string' ? metaB.sourceLayerHash.trim() : ''
  if (!hA || !hB) throw new Error('expected keyword graph metadata.sourceLayerHash')
  if (hA === hB) throw new Error('expected sourceLayerHash to change when keyword source text changes')
  const keyA = buildGraphMetaKey(a)
  const keyB = buildGraphMetaKey(b)
  if (keyA === keyB) throw new Error('expected graph meta key to change when sourceLayerHash changes')
}

export const testKeywordModePreservesSigilTextForSourceExtraction = () => {
  const plain = markdownToPlainText([
    '## Review',
    '`#D85A30:Urgent migration` depends on ==deployment review==.',
    '`const ignored = true` should not become a keyword.',
  ].join('\n'))
  if (!plain.includes('Urgent migration')) throw new Error('expected color sigil text in keyword source text')
  if (!plain.includes('deployment review')) throw new Error('expected default highlight text in keyword source text')
  if (plain.includes('#D85A30') || plain.includes('==') || plain.includes('ignored')) {
    throw new Error('expected source text to remove sigil wrappers and generic inline code')
  }
}

export const testKeywordModeCarriesSigilHighlightsToKeywordNodes = () => {
  const markdown = [
    '`#D85A30|bg#FEF3C7:Agent labs` coordinate code migration.',
    'Agent labs improve code migration review.',
    'Agent labs reduce deployment review work.',
  ].join('\n')
  const { graph } = deriveKeywordGraphFromText({
    documentId: 'doc:test',
    documentText: markdownToPlainText(markdown),
    markdownAnnotations: extractMarkdownAnnotationsFromText(markdown),
  })
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const agentLabs = nodes.find(node => {
    const props = (node.properties || {}) as Record<string, unknown>
    return props['keyword:key'] === 'agent labs'
  })
  if (!agentLabs) throw new Error('expected annotated keyphrase node')
  const props = (agentLabs.properties || {}) as Record<string, unknown>
  if (props['keyword:highlight'] !== true) throw new Error('expected keyword highlight marker')
  if (props['keyword:highlight:color'] !== '#D85A30') throw new Error('expected keyword highlight text color')
  if (props['keyword:highlight:background'] !== '#FEF3C7') throw new Error('expected keyword highlight background')
  const meta = (graph.metadata || {}) as Record<string, unknown>
  const highlightedCount = meta.keywordHighlightedCount
  if (typeof highlightedCount !== 'number' || highlightedCount <= 0) throw new Error('expected highlighted keyword metadata')
}

export const testKeywordModeExtractsKeyphrasesAndWordCloudMetadata = () => {
  const { graph } = deriveKeywordGraphFromText({
    documentId: 'doc:test',
    documentText: [
      'Agent labs coordinate enterprise code migration. Agent labs use playbooks for code migration.',
      'Secure deployment and custom SSO make agent labs useful for enterprise teams.',
      'Code migration playbooks reduce manual review for enterprise code migration.',
    ].join('\n'),
  })
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const byKey = new Map<string, Record<string, unknown>>()
  for (const node of nodes) {
    const props = (node.properties || {}) as Record<string, unknown>
    const key = typeof props['keyword:key'] === 'string' ? props['keyword:key'] : ''
    if (key) byKey.set(key, props)
  }
  const agentLabs = byKey.get('agent labs')
  if (!agentLabs) throw new Error('expected repeated multi-word keyphrase node')
  if (agentLabs['keyword:extractor'] !== 'document-keyphrase') throw new Error('expected document keyphrase extractor marker')
  const phraseLength = agentLabs['keyword:phraseLength']
  if (typeof phraseLength !== 'number' || phraseLength < 2) throw new Error('expected multi-word phrase length metadata')
  const score = agentLabs['keyword:score']
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) throw new Error('expected positive keyphrase score')
  const rank = agentLabs['keyword:rank']
  if (typeof rank !== 'number' || !Number.isFinite(rank) || rank <= 0) throw new Error('expected keyphrase rank')
  if (agentLabs['visual:wordCloud'] !== true) throw new Error('expected word-cloud node marker')
  for (const field of ['visual:fontSize', 'visual:xIndex', 'visual:yIndex', 'visual:labelRotation']) {
    const value = agentLabs[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`expected finite ${field}`)
  }
  const fontSize = agentLabs['visual:fontSize']
  if (typeof fontSize !== 'number' || fontSize < 15 || fontSize > 54) throw new Error('expected bounded word-cloud font size')
  const meta = (graph.metadata || {}) as Record<string, unknown>
  if (meta.keywordCloudLayout !== 'semantic-spiral') throw new Error('expected keyword cloud layout metadata')
  const candidateCount = meta.keywordCandidateCount
  if (typeof candidateCount !== 'number' || !Number.isFinite(candidateCount) || candidateCount <= 0) {
    throw new Error('expected keyword candidate count metadata')
  }
}

export const testKeywordModeCompactsLargeGraphsForCanvasPerformance = () => {
  const documentText = Array.from({ length: 360 }, (_, i) => {
    const a = `Topic${i}`
    const b = `Signal${(i + 17) % 360}`
    return `${a} coordinates ${b}. ${a} supports migration plan ${i % 23}.`
  }).join('\n')
  const { graph } = deriveKeywordGraphFromText({ documentId: 'doc:large', documentText })
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  if (nodes.length > 220) throw new Error('large keyword graphs should be compacted before canvas rendering')
  if (edges.length > nodes.length * 4) throw new Error('large keyword graph edges should respect compact node count')
  const meta = (graph.metadata || {}) as Record<string, unknown>
  const pruned = meta.keywordNodePrunedCount
  if (typeof pruned !== 'number' || pruned <= 0) throw new Error('expected keyword node pruning metadata')
  const wordCloudNodes = nodes.filter(node => ((node.properties || {}) as Record<string, unknown>)['visual:wordCloud'] === true)
  if (wordCloudNodes.length === 0) throw new Error('compacted keyword graph should still include word-cloud nodes')
}

export const testKeywordModeHonorsLowNodeBudgetForCanvasPerformance = () => {
  const documentText = Array.from({ length: 220 }, (_, i) => {
    return `BudgetTopic${i} connects BudgetSignal${(i + 9) % 220}. BudgetTopic${i} supports review queue ${i % 19}.`
  }).join('\n')
  const { graph } = deriveKeywordGraphFromText({
    documentId: 'doc:budget',
    documentText,
    tuning: { maxNodes: 80, edgesPerNode: 2, maxEdgesCap: 180 },
  })
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  if (nodes.length > 80) throw new Error('keyword graph should honor low node budget')
  if (edges.length > 180) throw new Error('keyword graph should honor low edge cap')
  const meta = (graph.metadata || {}) as Record<string, unknown>
  if (meta.keywordNodeLimit !== 80) throw new Error('expected keyword node limit metadata')
}

export const testKeywordModeCapsMergedSourceNodesForCanvasPerformance = () => {
  const { graph: keywordGraph } = deriveKeywordGraphFromText({
    documentId: 'doc:test',
    documentText: 'Agent labs coordinate code migration. Agent labs improve deployment review.',
  })
  const baseGraph = {
    type: 'Graph',
    nodes: Array.from({ length: 260 }, (_, i) => ({
      id: `source:${i}`,
      label: `Source ${i} agent labs migration deployment`,
      type: 'Element',
      properties: { text: `Agent labs migration deployment source ${i}` },
      metadata: {},
    })),
    edges: [],
  }
  const merged = mergeKeywordGraphWithSourceNodes({
    baseGraphData: baseGraph as unknown as typeof keywordGraph,
    keywordGraph,
    sourceId: 'doc:test',
  })
  const sourceNodes = (merged.nodes || []).filter(node => String(node.type || '') === 'KeywordSource')
  if (sourceNodes.length === 0) throw new Error('expected high-signal keyword source nodes')
  if (sourceNodes.length > 96) throw new Error('keyword source nodes should be capped for large source graphs')
  const sourceMentionEdges = (merged.edges || []).filter(edge => ((edge.properties || {}) as Record<string, unknown>)['keyword:kind'] === 'sourceMention')
  if (sourceMentionEdges.length === 0) throw new Error('expected source mention edges for retained source nodes')
  const meta = (merged.metadata || {}) as Record<string, unknown>
  const pruned = meta.keywordSourceNodePrunedCount
  if (typeof pruned !== 'number' || pruned <= 0) throw new Error('expected source-node pruning metadata')
}
