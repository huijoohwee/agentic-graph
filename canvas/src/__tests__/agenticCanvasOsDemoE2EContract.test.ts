import { readFileSync } from 'node:fs'
import path from 'node:path'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { isUnsafeFlowComputeSource, readFlowComputeSource, runFlowComputeSource } from '@/lib/storyboardWidget/flowComputeInline'

const GITHUB_ROOT = path.resolve(process.cwd(), '..', '..')
const DEMO_DOC_PATH = path.join(GITHUB_ROOT, 'huijoohwee', 'docs', 'agenticgraph-agentic-canvas-os-demo.md')

const COMPUTE_NODE_EXPECTATIONS = [
  ['market_radar', 'Market Radar Report'],
  ['artifact_brief', 'Artifact Brief'],
  ['text_generator', 'Launch Copy'],
  ['image_generator', 'Hero Image Prompt'],
  ['audio_generator', 'Audio Script'],
  ['video_generator', 'Video Plan'],
] as const

const BODY_TOKENS = [
  'market_radar.output',
  'artifact_brief.output',
  'text_generator.output',
  'image_generator.output',
  'audio_generator.output',
  'video_generator.output',
] as const

const RICH_MEDIA_PANEL_EXPECTATIONS = [
  ['text_output_panel', 'text_generator', 'Launch Copy'],
  ['image_output_panel', 'image_generator', 'Hero Image Prompt'],
  ['audio_output_panel', 'audio_generator', 'Audio Script'],
  ['video_output_panel', 'video_generator', 'Video Plan'],
] as const

const readDemoMarkdown = (): string => readFileSync(DEMO_DOC_PATH, 'utf8')

const assertIncludes = (label: string, value: unknown, expected: string): void => {
  if (!String(value || '').includes(expected)) {
    throw new Error(`Expected ${label} to include ${JSON.stringify(expected)}`)
  }
}

export function testAgenticCanvasOsDemoRunsMarketToArtifactPipeline() {
  const markdown = readDemoMarkdown()
  const parsed = tryParseMarkdownFrontmatterFlowGraph(path.basename(DEMO_DOC_PATH), markdown)
  if (!parsed) throw new Error('Expected agentic canvas OS demo to parse as a frontmatter Storyboard Widget graph')

  const nodes = parsed.graphData.nodes || []
  const edges = parsed.graphData.edges || []
  const nodeById = new Map(nodes.map(node => [node.id, node]))

  for (const [nodeId] of COMPUTE_NODE_EXPECTATIONS) {
    const node = nodeById.get(nodeId)
    if (!node) throw new Error(`Expected demo graph to include compute node ${nodeId}`)
    const source = readFlowComputeSource(node)
    if (!source) throw new Error(`Expected ${nodeId} to expose inline compute`)
    if (isUnsafeFlowComputeSource(source)) throw new Error(`Expected ${nodeId} inline compute to stay safe`)
  }

  const marketSource = readFlowComputeSource(nodeById.get('market_radar') as never)
  const market = runFlowComputeSource(marketSource, {
    prompt_in: [
      'Validate a lightweight agentic productivity product',
      'solo founder, creator, indie hacker',
      'x, producthunt, reddit, linkedin, xiaohongshu, tiktok, instagram',
      8,
    ],
  })
  if (!market) throw new Error('Expected market radar inline compute to produce an output object')
  assertIncludes('market radar output', market.text_out, 'Market Radar Report')
  assertIncludes('market radar srcdoc', market.outputSrcDoc, '<!doctype html>')

  const approval = 'approved_for_demo_dry_run'
  const briefSource = readFlowComputeSource(nodeById.get('artifact_brief') as never)
  const brief = runFlowComputeSource(briefSource, { prompt_in: `${market.text_out}\n\nApproval: ${approval}` })
  if (!brief) throw new Error('Expected artifact brief inline compute to produce an output object')
  assertIncludes('artifact brief output', brief.text_out, 'Artifact Brief')

  for (const [nodeId, expected] of COMPUTE_NODE_EXPECTATIONS.slice(2)) {
    const source = readFlowComputeSource(nodeById.get(nodeId) as never)
    const output = runFlowComputeSource(source, { prompt_in: brief.text_out })
    if (!output) throw new Error(`Expected ${nodeId} inline compute to produce an output object`)
    assertIncludes(`${nodeId} output`, output.text_out, expected)
    assertIncludes(`${nodeId} srcdoc`, output.outputSrcDoc, '<!doctype html>')
  }

  for (const token of BODY_TOKENS) {
    assertIncludes('demo body token', markdown, `{{${token}}}`)
  }

  const fanOutEdges = edges
    .filter(edge => edge.source === 'artifact_brief' && edge.properties?.['flow:sourcePortKey'] === 'text_out')
    .map(edge => `${edge.target}:${edge.properties?.['flow:targetPortKey']}`)
    .sort()
  const expectedFanOutEdges = ['audio_generator:prompt_in', 'image_generator:prompt_in', 'text_generator:prompt_in', 'video_generator:prompt_in']
  if (fanOutEdges.join('\n') !== expectedFanOutEdges.join('\n')) {
    throw new Error(`Expected artifact brief to fan out to all artifact generators, got:\n${fanOutEdges.join('\n')}`)
  }

  const registry = Array.isArray(parsed.graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? parsed.graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
    : []
  const panelIds = new Set(RICH_MEDIA_PANEL_EXPECTATIONS.map(([panelId]) => panelId))
  const connected = computeFlowConnectedValuesBySchemaPath({
    graphData: parsed.graphData,
    registry,
    targetNodeIds: panelIds,
    preserveMaterializedOutputs: false,
  })

  for (const [panelId, sourceNodeId, expected] of RICH_MEDIA_PANEL_EXPECTATIONS) {
    const panel = nodeById.get(panelId)
    if (!panel) throw new Error(`Expected demo graph to include Rich Media Panel ${panelId}`)
    if (panel.type !== 'RichMediaPanel') throw new Error(`Expected ${panelId} to use RichMediaPanel type`)
    const props = panel.properties || {}
    if (String(props.output || '').trim() || String(props.outputSrcDoc || '').trim()) {
      throw new Error(`Expected ${panelId} to keep local output fields empty and render connected generator values`)
    }
    const panelValues = connected.get(panelId)
    const outputValue = panelValues?.['properties.output']
    const srcDocValue = panelValues?.['properties.outputSrcDoc']
    assertIncludes(`${panelId} connected output`, outputValue?.value, expected)
    assertIncludes(`${panelId} connected srcdoc`, srcDocValue?.value, '<!doctype html>')
    if (!outputValue?.sources.some(source => source.nodeId === sourceNodeId && source.portKey === 'text_out')) {
      throw new Error(`Expected ${panelId}.output to source from ${sourceNodeId}.text_out`)
    }
    if (!srcDocValue?.sources.some(source => source.nodeId === sourceNodeId && source.portKey === 'outputSrcDoc')) {
      throw new Error(`Expected ${panelId}.outputSrcDoc to source from ${sourceNodeId}.outputSrcDoc`)
    }
  }
}
