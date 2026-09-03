// =============================================================================
// Shared doc-contract fixtures for the agentic-graph-strytree-edge-rendering bugfix
// spec. Both fix targets are DOCUMENTS, so the "harness" deterministically reads
// each doc and extracts named concerns (frontmatter blocks, epic sections, table
// rows, body sections) as raw text so property tests can assert byte-for-
// identical-intent preservation (Property 2) and the bug-condition predicates
// (Property 1, reused by the Task 1 exploration test).
//
// PURE + dependency-free: filesystem reads + string extraction only. No YAML
// dependency (byte-for-identical-intent preservation works on raw text regions),
// no live network, no new graph-rendering dependency, honoring the Cloudflare-
// only topology and forbid-hardcode-in-repo invariants.
// =============================================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// agentic-graph/docs/__pbt__  ->  agentic-graph repo root is ../.. , GitHub root is ../../..
const AGENTIC_OS_ROOT = path.resolve(HERE, '..', '..')
const GITHUB_ROOT = path.resolve(HERE, '..', '..', '..')

// The two fix-target documents (observation-first: read the REAL files).
export const PRD_TAD_PATH = path.join(AGENTIC_OS_ROOT, 'docs', 'documents', 'agentic-graph-strytree-prd-tad.md')
export const DEMO_PATH = path.join(GITHUB_ROOT, 'huijoohwee', 'docs', 'agentic-graph-agentic-canvas-os-demo.md')

// The renderer-agnostic 2D renderer set (design glossary `rendererAgnostic`).
export const RENDERER_SET = ['storyboard']

export const readDoc = (p) => readFileSync(p, 'utf8')

// ---------------------------------------------------------------------------
// Frontmatter / body splitting + block extraction (raw text, no YAML parse)
// ---------------------------------------------------------------------------

export function splitFrontmatter(text) {
  const lines = text.split('\n')
  if ((lines[0] || '').trim() !== '---') return { frontmatter: '', body: text }
  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') { end = i; break }
  }
  if (end === -1) return { frontmatter: '', body: text }
  return {
    frontmatter: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
  }
}

// Extract a top-level (column-0) frontmatter key block: from `key:` until the
// next column-0 key (a line that does not start with whitespace) or end.
export function topLevelBlock(frontmatter, key) {
  const lines = frontmatter.split('\n')
  const keyRe = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\s|$)')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (keyRe.test(lines[i])) { start = i; break }
  }
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^[^\s#]/.test(lines[i])) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

// Extract a heading/anchor-delimited region from start anchor (inclusive) to the
// first subsequent line matching stopRe (exclusive).
export function regionBetween(text, startRe, stopRe) {
  const lines = text.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (startRe.test(lines[i])) { start = i; break }
  }
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (stopRe.test(lines[i])) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

// The demo `flow.nodes` payload (node fields, handles, flow:portTypes, compute,
// outputSrcDoc) — sliced out of the `flow:` block, EXCLUDING `flow.edges` (edge
// content governed by Property 1, not preserved here).
export function demoFlowNodesBlock(frontmatter) {
  const flow = topLevelBlock(frontmatter, 'flow')
  if (!flow) return null
  const lines = flow.split('\n')
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i += 1) {
    if (/^ {2}nodes:/.test(lines[i])) { start = i; break }
  }
  if (start === -1) return null
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}edges:/.test(lines[i])) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

// Simulate switching the demo's active 2D renderer by rewriting the
// `kgCanvas2dRenderer` frontmatter value. Used by the renderer-switch invariance
// property: non-edge concerns MUST be identical regardless of the active value.
export function withActiveRenderer(demoText, renderer) {
  return demoText.replace(/^(kgCanvas2dRenderer:\s*")[^"]*(")/m, `$1${renderer}$2`)
}

// ---------------------------------------------------------------------------
// Preservation concerns (¬isBugCondition) — frozen byte-for-identical-intent
// regions captured from the UNFIXED docs and asserted unchanged after the fix.
// ---------------------------------------------------------------------------

// PRD/TAD non-edge epic sections (E01 + E03..E07 full; E08 non-UI clauses only,
// i.e. the intro + AC-01..AC-03, EXCLUDING the AC-04 UI-surface clause).
export function captureEpicConcerns(prdTad) {
  return {
    'epic.E01.accessIdentity': regionBetween(prdTad, /^### PRD-STR-E01\b/, /^### PRD-STR-E02\b/),
    'epic.E03.wallet': regionBetween(prdTad, /^### PRD-STR-E03\b/, /^### PRD-STR-E04\b/),
    'epic.E04.payment': regionBetween(prdTad, /^### PRD-STR-E04\b/, /^### PRD-STR-E05\b/),
    'epic.E05.unlockSplit': regionBetween(prdTad, /^### PRD-STR-E05\b/, /^### PRD-STR-E06\b/),
    'epic.E06.externalVideoProviderHarness': regionBetween(prdTad, /^### PRD-STR-E06\b/, /^### PRD-STR-E07\b/),
    'epic.E07.observability': regionBetween(prdTad, /^### PRD-STR-E07\b/, /^### PRD-STR-E08\b/),
    // E08 non-UI clauses: intro + AC-01..AC-03 up to (not including) AC-04.
    'epic.E08.forkCompareNonUi': regionBetween(prdTad, /^### PRD-STR-E08\b/, /^\*\*PRD-STR-E08-AC-04\*\*/),
  }
}

// Part C "Edge Strategy" SSOT text — preserved verbatim by the fix (the new
// "Edge Rendering Contract" subsection is added AFTER it). Stop at the next
// `##` or `###` heading so the added subsection is not captured here.
export function captureEdgeStrategyConcern(prdTad) {
  return {
    'partC.edgeStrategy': regionBetween(prdTad, /^### Edge Strategy\b/, /^#{2,3}\s/),
  }
}

// Three preserved constraints + topology/route lines (the fix APPENDS new
// constraints but must leave these byte-identical). Captured as the exact lines.
const PRESERVED_CONSTRAINT_LINES = [
  '  - "story edges derive from parent_node_id unless a later graph index is justified"',
  '  - "no new external graph-rendering dependency for the Strytree workbench"',
  '  - "no hosted database dependency outside the Cloudflare topology"',
  '  - "no alternate app hosting path outside Dev -> Prod -> Cloudflare"',
]
const PRESERVED_TOPOLOGY_LINES = [
  'deployment_topology: "Dev -> Prod -> Cloudflare"',
  'cloudflare_route: "https://airvio.co/agentic-graph"',
]

export function captureTopologyConstraintConcerns(prdTad) {
  const { frontmatter } = splitFrontmatter(prdTad)
  const fmLines = frontmatter.split('\n')
  const present = (line) => fmLines.includes(line)
  return {
    'constraints.preserved': PRESERVED_CONSTRAINT_LINES.filter(present).join('\n'),
    'topology.preserved': PRESERVED_TOPOLOGY_LINES.filter(present).join('\n'),
  }
}

// ALL non-edge demo content: agentic_canvas_os_demo, flow_diagrams, flow.nodes
// payloads (handles, flow:portTypes, compute, outputSrcDoc), socket_types VALUES,
// and the body sections (## Response, ## Rich Media Outputs, ## Inputs, ## Guardrails).
export function captureDemoConcerns(demo) {
  const { frontmatter, body } = splitFrontmatter(demo)
  return {
    'demo.socket_types': topLevelBlock(frontmatter, 'socket_types'),
    'demo.agentic_canvas_os_demo': topLevelBlock(frontmatter, 'agentic_canvas_os_demo'),
    'demo.flow_diagrams': topLevelBlock(frontmatter, 'flow_diagrams'),
    'demo.flow.nodes': demoFlowNodesBlock(frontmatter),
    'demo.body.Response': regionBetween(body, /^## Response\b/, /^## Rich Media Outputs\b/),
    'demo.body.RichMediaOutputs': regionBetween(body, /^## Rich Media Outputs\b/, /^## Inputs\b/),
    'demo.body.Inputs': regionBetween(body, /^## Inputs\b/, /^## Guardrails\b/),
    'demo.body.Guardrails': regionBetween(body, /^## Guardrails\b/, /^\uFFFF$/), // to end
  }
}

// The full set of frozen preservation concerns across both docs.
export function captureAllPreservationConcerns() {
  const prdTad = readDoc(PRD_TAD_PATH)
  const demo = readDoc(DEMO_PATH)
  return {
    ...captureEpicConcerns(prdTad),
    ...captureEdgeStrategyConcern(prdTad),
    ...captureTopologyConstraintConcerns(prdTad),
    ...captureDemoConcerns(demo),
  }
}

// The derivation-invariant facts for PRD-STR-E02-AC-03. The fix EXTENDS AC-03
// with shared-contract binding, so we assert the invariant FACTS persist
// (substring presence) rather than freezing the whole — one edge per non-null
// parent_node_id, NO separate edge table.
export const AC03_INVARIANT_SUBSTRINGS = [
  'without needing a separate edge table',
  'edge list derived from nodes with non-null parent_node_id',
  'no edge table query is made',
]

export function captureAc03Block() {
  const prdTad = readDoc(PRD_TAD_PATH)
  return regionBetween(prdTad, /^\*\*PRD-STR-E02-AC-03\*\*/, /^### PRD-STR-E03\b/)
}
