import fs from 'node:fs'
import path from 'node:path'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { computeEffectiveFrontmatterMode } from '@/lib/graph/frontmatterMode'
import { filterGraphToFrontmatterMermaid } from '@/lib/graph/layerDerivation'
import { deriveSceneGroups } from '@/lib/scene/sceneDerivation'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getEdgeLabelForDisplay } from '@/components/GraphCanvas/edgeDisplay'
import { getEdgeBaseStroke, getEdgeLabelColor, getEdgeStrokeWidth, getNodeLabelColor } from '@/components/GraphCanvas/helpers'
import { buildAndSetFlowNativeScene } from '@/components/FlowCanvas/buildNativeScene'
import { readFlowConfig } from '@/components/FlowCanvas/config'
import { resolveCanvas2dRendererId } from '@/lib/config.render'
import { resolveRepoTestDataPath } from '@/tests/lib/repoTestData'
import { readFrontmatterMermaidCode } from '@/lib/mermaid/mermaidFrontmatterCode'
import { resolveMermaidGitGraphCode } from '@/lib/mermaid/mermaidGitGraph'

export const testMermaidFrontmatterModeKeepsMermaidNodesAndGroups = async () => {
  const md = [
    '---',
    'mermaid: |',
    '  graph TD',
    '    subgraph G1 [Group A]',
    '      X[Node X] --> Y[Node Y]',
    '    end',
    '    X -.-> |edge label| Z[Node Z]',
    '---',
    '',
    '# Title',
  ].join('\n')

  const res = await loadGraphDataFromTextViaParser('inline.md', md, { applyToStore: false })
  if (!res?.graphData) throw new Error('expected graphData')

  const base = res.graphData
  const types = new Set((base.nodes || []).map(n => String((n as { type?: unknown }).type || '')))
  if (!types.has('MermaidNode')) throw new Error('expected MermaidNode nodes from frontmatter mermaid')
  if (!types.has('MermaidSubgraph')) throw new Error('expected MermaidSubgraph nodes from frontmatter mermaid')

  const effective = computeEffectiveFrontmatterMode({
    graphData: base,
    frontmatterModeEnabled: true,
    documentSemanticMode: 'document',
  })
  if (!effective) throw new Error('expected effective frontmatter mode when frontmatter mermaid exists')

  const frontmatterGraph = filterGraphToFrontmatterMermaid(base)
  const fmTypes = new Set((frontmatterGraph.nodes || []).map(n => String((n as { type?: unknown }).type || '')))
  if (!fmTypes.has('MermaidNode')) throw new Error('expected MermaidNode nodes in filtered frontmatter graph')
  if (!fmTypes.has('MermaidSubgraph')) throw new Error('expected MermaidSubgraph nodes in filtered frontmatter graph')

  const edges = Array.isArray(frontmatterGraph.edges)
    ? (frontmatterGraph.edges as Array<{ label?: unknown; source?: unknown; target?: unknown }>)
    : []
  const hasMembership = edges.some(e => String(e.label || '') === 'hasMermaidNode')
  if (!hasMembership) throw new Error('expected hasMermaidNode edges for subgraph membership')
  const hasPointsTo = edges.some(e => String(e.label || '') === 'pointsTo')
  if (!hasPointsTo) throw new Error('expected pointsTo edges from mermaid arrows')

  const schema = useGraphStore.getState().schema
  const groups = deriveSceneGroups({
    graphData: frontmatterGraph,
    graphDataRevision: 0,
    schema,
    documentSemanticMode: 'document',
    frontmatterModeEnabled: true,
  })
  if (!groups) throw new Error('expected groups derivation')
  const hasGroupA = (groups.allGroups || []).some(g => String((g as { label?: unknown }).label || '').includes('Group A'))
  if (!hasGroupA) throw new Error('expected Mermaid subgraph to produce a group')
}

export const testMermaidFrontmatterGitGraphPreservesDiagramWithoutFlowchartTopology = async () => {
  const md = [
    '---',
    'kgCanvas2dRenderer: "gitGraph"',
    'kgCanvasRenderMode: "2d"',
    'mermaid: |',
    '  ---',
    '  config:',
    '    theme: base',
    '  ---',
    '  gitGraph:',
    '    commit id:"root" tag:"v1"',
    '    branch feature',
    '    checkout feature',
    '    commit id:"feature-a" type:HIGHLIGHT',
    '    checkout main',
    '    merge feature',
    '---',
    '',
    '# Git history',
  ].join('\n')

  const res = await loadGraphDataFromTextViaParser('inline-gitgraph.md', md, { applyToStore: false })
  if (!res?.graphData) throw new Error('expected graphData')
  const nodes = Array.isArray(res.graphData.nodes) ? res.graphData.nodes : []
  const diagram = nodes.find(n => String(n.type || '') === 'MermaidDiagram') || null
  if (!diagram) throw new Error('expected GitGraph MermaidDiagram node')
  const diagramKind = String((diagram.properties || {}).diagramKind || '')
  if (diagramKind !== 'gitgraph') {
    throw new Error(`expected GitGraph diagramKind, got ${diagramKind}`)
  }
  const flowchartNode = nodes.find(n => String(n.type || '') === 'MermaidNode') || null
  if (flowchartNode) {
    throw new Error('expected GitGraph parser to avoid Flowchart MermaidNode topology')
  }
  const resolved = resolveCanvas2dRendererId('GitGraph')
  if (resolved !== 'gitGraph') {
    throw new Error(`expected GitGraph renderer token to resolve, got ${String(resolved || '')}`)
  }
}

export const testFrontmatterFlowGitGraphRendererCanReadMermaidMetadata = async () => {
  const md = [
    '---',
    'kgCanvas2dRenderer: "gitGraph"',
    'kgFrontmatterModeEnabled: true',
    'mermaid: |',
    '  gitGraph',
    '    commit id:"root"',
    '    branch feature',
    '    checkout feature',
    '    commit id:"feature-a"',
    'flow:',
    '  nodes:',
    '    - id: {key: id, type: string, value: "root"}',
    '      type: {key: type, type: string, value: "commit"}',
    '      label: {key: label, type: string, value: "Root"}',
    '---',
    '',
    '# GitGraph Flow',
  ].join('\n')

  const res = await loadGraphDataFromTextViaParser('inline-gitgraph-flow.md', md, { applyToStore: false })
  if (!res?.graphData) throw new Error('expected graphData')
  if (String(res.graphData.context || '') !== 'frontmatter-flow') {
    throw new Error(`expected frontmatter-flow graph, got ${String(res.graphData.context || '')}`)
  }
  const code = readFrontmatterMermaidCode(res.graphData)
  if (!code.includes('gitGraph')) {
    throw new Error('expected frontmatter-flow metadata to preserve GitGraph Mermaid code')
  }
  const gitGraphCode = resolveMermaidGitGraphCode([code])
  if (!gitGraphCode.includes('commit id:"root"')) {
    throw new Error('expected GitGraph renderer code resolver to read frontmatter-flow Mermaid metadata')
  }
}

const resolveMermaidDocCandidates = (): string[] => {
  const cwd = process.cwd()
  return [
    resolveRepoTestDataPath('md-demo-00.md'),
    path.resolve(cwd, '..', '..', 'huijoohwee.github.io', 'docs', 'agentic-os-ai-pipeline-prd-tad.md'),
  ]
}

export const testMermaidFrontmatterPipelineSupportsDemoAndAgenticOsDocs = async () => {
  const docs = resolveMermaidDocCandidates().filter(p => fs.existsSync(p))
  if (docs.length === 0) return

  for (let i = 0; i < docs.length; i += 1) {
    const docPath = docs[i]!
    const md = fs.readFileSync(docPath, 'utf8')
    const res = await loadGraphDataFromTextViaParser(docPath, md, { applyToStore: false })
    if (!res?.graphData) throw new Error(`expected graphData for ${path.basename(docPath)}`)
    const base = res.graphData
    const baseNodes = Array.isArray(base.nodes) ? base.nodes : []
    const baseEdges = Array.isArray(base.edges) ? base.edges : []
    const isFrontmatterFlow = String((base as { context?: unknown }).context || '').trim() === 'frontmatter-flow'
    if (isFrontmatterFlow) {
      if (baseNodes.length === 0 || baseEdges.length === 0) {
        throw new Error(`expected non-empty frontmatter-flow graph for ${path.basename(docPath)}`)
      }
      continue
    }
    const filtered = filterGraphToFrontmatterMermaid(base)
    const filteredNodes = Array.isArray(filtered.nodes) ? filtered.nodes : []
    const filteredEdges = Array.isArray(filtered.edges) ? filtered.edges : []
    const hasMermaidNode = filteredNodes.some(n => String((n as { type?: unknown }).type || '') === 'MermaidNode')
    if (!hasMermaidNode) throw new Error(`expected MermaidNode for ${path.basename(docPath)}`)
    if (filteredNodes.length === 0 || filteredEdges.length === 0) {
      throw new Error(`expected non-empty frontmatter mermaid graph for ${path.basename(docPath)}`)
    }
  }
}

export const testMermaidFrontmatterModePreservesPureMermaidLabelsAndColors = async () => {
  const md = [
    '---',
    'mermaid: |',
    '  graph TD',
    '    classDef accent fill:#f9f,stroke:#333,color:#111',
    '    style G1 fill:#eef,stroke:#55c,color:#225',
    '    subgraph G1 [Group A]',
    '      A[Node A]:::accent -->|identity-anchor| B[Node B]',
    '    end',
    '    linkStyle 0 stroke:#0af,stroke-width:4px,color:#0af',
    '---',
    '',
    '# Title',
  ].join('\n')

  const res = await loadGraphDataFromTextViaParser('inline-colors.md', md, { applyToStore: false })
  if (!res?.graphData) throw new Error('expected graphData')
  const filtered = filterGraphToFrontmatterMermaid(res.graphData)
  const nodes = Array.isArray(filtered.nodes) ? filtered.nodes : []
  const edges = Array.isArray(filtered.edges) ? filtered.edges : []

  const leaked = nodes.find(n => {
    const type = String((n as { type?: unknown }).type || '')
    return type !== 'MermaidDiagram' && type !== 'MermaidNode' && type !== 'MermaidSubgraph'
  }) || null
  if (leaked) throw new Error(`expected pure Mermaid-only frontmatter graph, got leaked ${String((leaked as { type?: unknown }).type || '')}`)

  const nodeA = nodes.find(n => String((n.properties || {})['nodeName'] || '') === 'A') || null
  if (!nodeA) throw new Error('expected Mermaid node A')
  const nodeAFill = String((nodeA.properties || {})['visual:fill'] || '')
  const nodeAStroke = String((nodeA.properties || {})['visual:stroke'] || '')
  if (nodeAFill !== '#f9f' || nodeAStroke !== '#333') {
    throw new Error(`expected Mermaid node class colors to be preserved, got fill=${nodeAFill} stroke=${nodeAStroke}`)
  }
  const schema = useGraphStore.getState().schema
  const nodeALabelColor = getNodeLabelColor(nodeA, schema)
  if (nodeALabelColor !== '#111') {
    throw new Error(`expected Mermaid node label color to be preserved, got ${nodeALabelColor}`)
  }

  const groupA = nodes.find(n => String(n.type || '') === 'MermaidSubgraph' && String(n.label || '') === 'Group A') || null
  if (!groupA) throw new Error('expected Mermaid subgraph label Group A')
  const groupAFill = String((groupA.properties || {})['visual:fill'] || '')
  const groupAStroke = String((groupA.properties || {})['visual:stroke'] || '')
  if (groupAFill !== '#eef' || groupAStroke !== '#55c') {
    throw new Error(`expected Mermaid subgraph style colors to be preserved, got fill=${groupAFill} stroke=${groupAStroke}`)
  }

  const labeledEdge = edges.find(e => String(getEdgeLabelForDisplay(e) || '') === 'identity-anchor') || null
  if (!labeledEdge) throw new Error('expected Mermaid edge display label identity-anchor')
  const edgeStroke = String(((labeledEdge.properties || {}) as Record<string, unknown>)['visual:stroke'] || '')
  const edgeWidth = Number((((labeledEdge.properties || {}) as Record<string, unknown>)['visual:width']) || 0)
  if (edgeStroke !== '#0af' || edgeWidth !== 4) {
    throw new Error(`expected Mermaid linkStyle to be preserved, got stroke=${edgeStroke} width=${String(edgeWidth)}`)
  }
  const groupDerivation = deriveSceneGroups({
    graphData: filtered,
    graphDataRevision: 0,
    schema,
    documentSemanticMode: 'document',
    frontmatterModeEnabled: true,
  })
  const groupAStyle = (groupDerivation?.allGroups || []).find(g => String(g.label || '') === 'Group A')?.style || null
  if (String(groupAStyle?.labelColor || '') !== '#225') {
    throw new Error(`expected Mermaid subgraph label color to be preserved, got ${String(groupAStyle?.labelColor || '')}`)
  }

  if (getEdgeBaseStroke(labeledEdge, schema) !== '#0af') {
    throw new Error('expected GraphCanvas edge stroke helper to reuse Mermaid linkStyle stroke')
  }
  if (getEdgeLabelColor(labeledEdge, schema) !== '#0af') {
    throw new Error('expected GraphCanvas edge label color helper to reuse Mermaid linkStyle color')
  }
  if (getEdgeStrokeWidth(labeledEdge, schema) !== 4) {
    throw new Error('expected GraphCanvas edge width helper to reuse Mermaid linkStyle stroke width')
  }
}

export const testMermaidFrontmatterFlowNativeSceneUsesSharedEdgeDisplayLabel = async () => {
  const md = [
    '---',
    'mermaid: |',
    '  graph TD',
    '    linkStyle 0 stroke:#0af,stroke-width:4px,color:#0af',
    '    A[Node A] -->|identity-anchor| B[Node B]',
    '---',
    '',
    '# Title',
  ].join('\n')

  const res = await loadGraphDataFromTextViaParser('inline-flow-native-label.md', md, { applyToStore: false })
  if (!res?.graphData) throw new Error('expected graphData')
  const filtered = filterGraphToFrontmatterMermaid(res.graphData)
  const schema = useGraphStore.getState().schema
  const runtime = { rankdir: 'TB', scene: null, dirty: false } as unknown as {
    rankdir: 'TB' | 'LR'
    scene: unknown
    dirty: boolean
  }
  buildAndSetFlowNativeScene({
    runtime: runtime as never,
    graphData: filtered,
    positions: null,
    schema,
    forbidCircleNodes: false,
    flowConfig: readFlowConfig({ schema, rankdir: 'TB' }),
    sceneGroups: [],
    rankdir: 'TB',
    widgetRegistry: [],
  })
  const scene = runtime.scene as unknown as { edges?: Array<{ label?: unknown; displayLabel?: unknown; color?: unknown; widthPx?: unknown }> } | null
  if (!scene || !Array.isArray(scene.edges)) throw new Error('expected Flow native scene edges')
  const labeledEdge = scene.edges.find(e => String(e.label || '') === 'identity-anchor') || null
  if (!labeledEdge) throw new Error('expected Flow native scene to reuse shared Mermaid edge display label')
  if (String(labeledEdge.displayLabel || '') !== 'identity-anchor') {
    throw new Error(`expected Flow native scene explicit displayLabel, got ${String(labeledEdge.displayLabel || '')}`)
  }
  if (String(labeledEdge.color || '') !== '#0af') {
    throw new Error(`expected Flow native scene Mermaid edge color, got ${String(labeledEdge.color || '')}`)
  }
  if (Number(labeledEdge.widthPx || 0) !== 4) {
    throw new Error(`expected Flow native scene Mermaid edge width, got ${String(labeledEdge.widthPx || '')}`)
  }
}

export const testMermaidFrontmatterModeParsesNonPipedEdgeLabelsWithoutPointsToFallback = async () => {
  const md = [
    '---',
    'mermaid: |',
    '  graph TD',
    '    A[Node A] -- identity-anchor --> B[Node B]',
    '---',
    '',
    '# Title',
  ].join('\n')

  const res = await loadGraphDataFromTextViaParser('inline-non-piped-label.md', md, { applyToStore: false })
  if (!res?.graphData) throw new Error('expected graphData')
  const filtered = filterGraphToFrontmatterMermaid(res.graphData)
  const edges = Array.isArray(filtered.edges) ? filtered.edges : []
  const labeledEdge = edges.find(e => String(getEdgeLabelForDisplay(e) || '') === 'identity-anchor') || null
  if (!labeledEdge) throw new Error('expected non-piped Mermaid edge label to be preserved for display')
  if (String(labeledEdge.label || '') !== 'pointsTo') {
    throw new Error(`expected canonical relation label pointsTo, got ${String(labeledEdge.label || '')}`)
  }
  const displayLabel = String(((labeledEdge.properties || {}) as Record<string, unknown>)['frontmatter:displayLabel'] || '')
  if (displayLabel !== 'identity-anchor') {
    throw new Error(`expected frontmatter:displayLabel from non-piped Mermaid edge, got ${displayLabel}`)
  }
}
