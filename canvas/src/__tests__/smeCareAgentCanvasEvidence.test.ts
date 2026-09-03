import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load as parseYaml } from 'js-yaml'

import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'

type PlainRecord = Record<string, unknown>

const REPO_ROOT = path.resolve(process.cwd(), '..')
const DEMO_PATH = path.join(REPO_ROOT, 'sme-agent', 'demo', 'sme-care-agent-canvas-evidence.md')

const isRecord = (value: unknown): value is PlainRecord => value != null && typeof value === 'object' && !Array.isArray(value)

const readFrontmatter = (markdown: string): PlainRecord => {
  if (!markdown.startsWith('---\n')) throw new Error('expected byte-zero YAML frontmatter')
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) throw new Error('expected a closing YAML frontmatter fence')
  const parsed = parseYaml(markdown.slice(4, end))
  if (!isRecord(parsed)) throw new Error('expected frontmatter object')
  return parsed
}

export function testSmeCareAgentRuntimeEvidenceParsesAndRendersOnCanvas() {
  const markdown = readFileSync(DEMO_PATH, 'utf8')
  const meta = readFrontmatter(markdown)
  if (meta.schema !== 'agentic-graph-sme-canvas-evidence/v1' || meta.kgSchema !== 'kgc-computing-flow/v1') {
    throw new Error(`unexpected SME Canvas schemas: ${JSON.stringify({ schema: meta.schema, kgSchema: meta.kgSchema })}`)
  }
  if (meta.kgCanvasSurfaceMode !== '2d' || meta.kgCanvas2dRenderer !== 'storyboard') {
    throw new Error('expected explicit 2D Storyboard Canvas preset')
  }
  const proof = isRecord(meta.runtime_evidence) ? meta.runtime_evidence : {}
  for (const [key, expected] of Object.entries({
    invocation: '/sme-care-agent',
    runtime_status: 'runtime-ready',
    exposure_count: 3,
    gap_count: 3,
    unknown_risk_count: 3,
    protection_count: 3,
    rationale_count: 9,
    paid_provider_calls: 0,
    tokens_used: 0,
    estimated_cost_usd: 0,
  })) {
    if (proof[key] !== expected) throw new Error(`expected runtime_evidence.${key}=${String(expected)}, got ${String(proof[key])}`)
  }
  const deployment = isRecord(proof.deployment) ? proof.deployment : {}
  if (deployment.status !== 'dev-only' || deployment.prodMirrorMutation !== false || deployment.cloudflareMutation !== false) {
    throw new Error(`expected honest Dev-only deploy boundary, got ${JSON.stringify(deployment)}`)
  }

  const parsed = tryParseMarkdownFrontmatterFlowGraph(path.basename(DEMO_PATH), markdown)
  if (!parsed) throw new Error('expected SME evidence to parse through the shared frontmatter-flow Canvas path')
  if (parsed.warnings.length > 0) throw new Error(`expected warning-free Canvas parse, got ${parsed.warnings.join(' | ')}`)
  if (parsed.graphData.context !== 'frontmatter-flow') throw new Error(`unexpected graph context ${String(parsed.graphData.context)}`)
  const nodeIds = new Set(parsed.graphData.nodes.map(node => String(node.id || '')))
  const edgePairs = new Set(parsed.graphData.edges.map(edge => `${edge.source}->${edge.target}`))
  const flow = isRecord(meta.flow) ? meta.flow : {}
  const nodes = Array.isArray(flow.nodes) ? flow.nodes.filter(isRecord) : []
  const edges = Array.isArray(flow.edges) ? flow.edges.filter(isRecord) : []
  if (nodeIds.size !== nodes.length || parsed.graphData.edges.length !== edges.length) {
    throw new Error(`Canvas parse lost evidence topology: raw=${nodes.length}/${edges.length}, parsed=${nodeIds.size}/${parsed.graphData.edges.length}`)
  }
  const nodesByKind = new Map<string, PlainRecord[]>()
  for (const item of nodes) {
    const data = isRecord(item.data) ? item.data : {}
    const kind = String(data.kind || '')
    nodesByKind.set(kind, [...(nodesByKind.get(kind) || []), item])
    if (!String(item.id || '').startsWith('kg_')) throw new Error(`expected semantic node id, got ${String(item.id)}`)
  }
  for (const [kind, count] of Object.entries({ risk_exposure: 3, coverage_gap: 3, unknown_risk: 3, protection: 3, rationale: 9, cost_proof: 1, deployment_boundary: 1, canvas_evidence: 1 })) {
    if ((nodesByKind.get(kind) || []).length !== count) throw new Error(`expected ${count} ${kind} nodes`)
  }
  const evidenceId = String(nodesByKind.get('canvas_evidence')?.[0]?.id || '')
  for (const item of [...(nodesByKind.get('coverage_gap') || []), ...(nodesByKind.get('unknown_risk') || []), ...(nodesByKind.get('protection') || [])]) {
    const data = isRecord(item.data) ? item.data : {}
    const rationaleId = String(data.rationale_key || '')
    if (!rationaleId || !nodeIds.has(rationaleId) || !edgePairs.has(`${String(item.id)}->${rationaleId}`) || !edgePairs.has(`${rationaleId}->${evidenceId}`)) {
      throw new Error(`expected ${String(item.id)} to remain traceable through rationale ${rationaleId} to Canvas evidence`)
    }
  }
}
