import { applyParser, builtInParsers, registerParser, resetParsers, toParserId } from '@/features/parsers'
import { readFileSync } from 'node:fs'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import { AG_SUBGRAPHS_KEY } from '@/lib/graph/subgraphs'
import { buildAndSetFlowNativeScene } from '@/components/FlowCanvas/buildNativeScene'
import { readFlowConfig } from '@/components/FlowCanvas/config'

export async function testMarkdownValidationExternalFileParsesAndLinksGraphElements() {
  const path = String(process.env.AG_MARKDOWN_VALIDATION_FILE || '').trim()
  if (!path) {
    await Promise.resolve()
    return
  }

  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const markdown = readFileSync(path, 'utf8')
  const res = applyParser(toParserId('markdown'), { name: path, text: markdown })
  if (!res) throw new Error('markdown parse returned null')

  const nodes = res.graphData.nodes || []
  const edges = res.graphData.edges || []

  const meta = (res.graphData.metadata || {}) as Record<string, unknown>
  const metadataKind = String(meta.kind || '').trim()
  const isFrontmatterFlow = metadataKind === 'frontmatter-flow'
  if (!isFrontmatterFlow) {
    if (nodes.length === 0) throw new Error('expected at least one parsed node for external markdown file')
    if (edges.length < 0) throw new Error('expected edges collection to be present')
    await Promise.resolve()
    return
  }

  const registry = meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  const hasRegistry = Array.isArray(registry) && registry.length > 0
  if (hasRegistry) {
    const hasCanonicalRegistryIdentity = registry.some(e => {
      if (!e || typeof e !== 'object' || Array.isArray(e)) return false
      const rec = e as { formId?: unknown; nodeTypeId?: unknown; widgetTypeId?: unknown }
      const formId = String(rec.formId || '').trim()
      const nodeTypeId = String(rec.nodeTypeId || '').trim()
      const widgetTypeId = String(rec.widgetTypeId || '').trim()
      return !!formId && !!nodeTypeId && !!widgetTypeId
    })
    if (!hasCanonicalRegistryIdentity) {
      throw new Error('expected widget registry metadata to include canonical identity keys')
    }
  }

  const subgraphs = meta[AG_SUBGRAPHS_KEY]
  if (subgraphs != null && !Array.isArray(subgraphs)) throw new Error('expected kg:subgraphs metadata to be an array when present')

  const annotationWiring = meta.frontmatterAnnotationWiring as unknown
  if (annotationWiring && typeof annotationWiring === 'object') {
    const refs = (annotationWiring as { refs?: unknown }).refs
    if (!Array.isArray(refs)) throw new Error('expected frontmatterAnnotationWiring.refs when annotation wiring metadata exists')
  }

  const sigilNodes = nodes.filter(n => typeof n.id === 'string' && String(n.id).startsWith('@node:'))
  if (sigilNodes.length > 0) {
    const annotationWiring = meta.frontmatterAnnotationWiring as unknown
    if (!annotationWiring || typeof annotationWiring !== 'object') throw new Error('expected frontmatterAnnotationWiring for sigil template')
    const refs = (annotationWiring as { refs?: unknown }).refs
    if (!Array.isArray(refs) || refs.length === 0) throw new Error('expected annotation wiring refs for sigil template')
    const hasClusterRef = nodes.some(n => typeof n.id === 'string' && String(n.id).startsWith('@cluster:'))
    if (!hasClusterRef) throw new Error('expected @cluster:* node in sigil template parse')
    if (edges.length === 0) throw new Error('expected at least one expanded edge from sigil template')
    const hasSyntheticSigilExpandedEdge = edges.some(e => String(e.id || '').startsWith('@edge:'))
    if (hasSyntheticSigilExpandedEdge) throw new Error('expected no synthetic @edge:* expanded edges when mermaid wiring exists')
    const hasMermaidWiringSource = edges.some(e => {
      const props = (e.properties || {}) as Record<string, unknown>
      return String(props['frontmatter:edgeSource'] || '') === 'mermaid-wiring'
    })
    if (!hasMermaidWiringSource) throw new Error('expected mermaid-wiring edge source metadata in sigil template parse')
    const hasInlineLabel = edges.some(e => {
      const label = String(e.label || '').trim()
      if (!label) return false
      if (label === 'next') return false
      return true
    })
    if (!hasInlineLabel) throw new Error('expected preserved inline mermaid edge labels on wiring edges')
  } else {
    const frontmatterNodes = nodes.filter(n => typeof n.id === 'string' && /^NODE_/.test(n.id))
    if (frontmatterNodes.length > 0) {
      const frontmatterNodeIdSet = new Set(frontmatterNodes.map(n => String(n.id)))
      const wikilinksToFlow = nodes.filter(n => {
        if (n.type !== 'InternalLink') return false
        const props = (n.properties || {}) as Record<string, unknown>
        return props.kind === 'wikilink' && typeof props.nodeId === 'string' && frontmatterNodeIdSet.has(String(props.nodeId))
      })
      if (wikilinksToFlow.length === 0) throw new Error('expected wikilink InternalLinks targeting NODE_* frontmatter nodes')
      const templateVars = nodes.filter(n => {
        if (n.type !== 'InternalLink') return false
        const props = (n.properties || {}) as Record<string, unknown>
        return props.kind === 'templateVar'
      })
      if (templateVars.length === 0) throw new Error('expected templateVar InternalLinks in markdown content')
      const hasPointsTo = edges.some(e => e.label === 'pointsTo' && frontmatterNodeIdSet.has(String(e.target)))
      if (!hasPointsTo) throw new Error('expected pointsTo edges into NODE_* frontmatter nodes')
    }
  }

  const typedEdge = edges.find(e => String(e.id || '') === 'e54') || null
  if (typedEdge) {
    const props = (typedEdge.properties || {}) as Record<string, unknown>
    const label = typeof props['flow:displayLabel'] === 'string' ? props['flow:displayLabel'] : ''
    if (!String(label || '').includes('·')) throw new Error('expected flow:displayLabel to include socket type suffix')
  }

  const refImageNode = nodes.find(n => String(n.id || '') === 'NODE_REF_IMAGE') || null
  if (refImageNode) {
    const props = (refImageNode.properties || {}) as Record<string, unknown>
    const stroke = typeof props['visual:stroke'] === 'string' ? props['visual:stroke'].trim() : ''
    const fill = typeof props['visual:fill'] === 'string' ? props['visual:fill'].trim() : ''
    if (!stroke || !fill) throw new Error('expected NODE_REF_IMAGE to have visual:stroke and visual:fill')

    const positions: Record<string, { x: number; y: number }> = {}
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const id = String(n.id || '').trim()
      if (!id) continue
      const x = (n as unknown as { x?: unknown }).x
      const y = (n as unknown as { y?: unknown }).y
      if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
        positions[id] = { x, y }
      }
    }

    const runtime = { rankdir: 'LR', scene: null, dirty: false } as unknown as {
      rankdir: 'TB' | 'LR'
      scene: unknown
      dirty: boolean
    }

    buildAndSetFlowNativeScene({
      runtime: runtime as never,
      graphData: res.graphData,
      positions,
      schema: null,
      forbidCircleNodes: false,
      flowConfig: readFlowConfig({ schema: null, rankdir: 'LR' }),
      sceneGroups: [],
      rankdir: 'LR',
      widgetRegistry: registry as never,
    })

    const scene = runtime.scene as unknown as { nodes?: Array<{ id?: unknown; fill?: unknown; stroke?: unknown }> } | null
    const built = scene?.nodes?.find(n => String(n.id || '') === 'NODE_REF_IMAGE') || null
    if (!built) throw new Error('expected NODE_REF_IMAGE to exist in built Flow native scene')
    if (String(built.fill || '').trim() !== fill) throw new Error('expected Flow native node fill to match visual:fill')
    if (String(built.stroke || '').trim() !== stroke) throw new Error('expected Flow native node stroke to match visual:stroke')
  }

  await Promise.resolve()
}
