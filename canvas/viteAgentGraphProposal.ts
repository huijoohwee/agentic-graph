import path from 'node:path'
import { createHash } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { runAgentGraphTool } from '../mcp/agent-graph-host.js'
import { readAgentGraphSnapshot } from '../mcp/agent-graph/store.mjs'
import { resolveAgenticCanvasOsDocsRoot, resolveAgenticCanvasOsDocsRevision } from '../mcp/agentic-canvas-os-docs-runtime.js'
import { HostBridgeError } from './viteAgentGraphBridge'
import { normalizeProbeTreeSourceBinding } from './src/features/agent-ready/probeTreeMcpBridgeContract'

type RecordValue = Record<string, any>
const fail = (message: string): never => { throw new HostBridgeError('proposal-invalid', `Launch Copilot: ${message}`, 400) }
let pairedHost: { close(): void } | undefined

export async function serveAgentGraphProposal(input: RecordValue, response: ServerResponse, context: { rootDir: string; env: NodeJS.ProcessEnv; outputRoot: string }) {
  if (input.action === 'connect-host' || input.action === 'disconnect-host') {
    const { worktrees } = await import('agentic-os/compat/git')
    if (worktrees(context.rootDir)[0]?.path !== path.resolve(context.rootDir)) fail('pair the canonical Graph runtime')
    pairedHost?.close(); pairedHost = undefined
    if (input.action === 'disconnect-host') return { status: 'disconnected' }
    const { pairGraphHost } = await import('../mcp/agent-graph/host-transport.mjs')
    const paired = await pairGraphHost({ baseUrl: context.env.AGENTIC_OS_GRAPH_RELAY_ORIGIN || 'https://airvio.co',
      bearer: context.env.AGENTIC_OS_AGENT_RUNTIME_BEARER_TOKEN, localOrigin: `http://${response.req.headers.host}` })
    pairedHost = paired
    return { status: 'paired', code: paired.code, expiresAt: paired.expiresAt }
  }
  const controller = new AbortController(), cancel = () => { if (!response.writableEnded) controller.abort() }
  response.once('close', cancel)
  try { return await runAgentGraphProposal(input, { ...context, abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) }) }
  catch (error) { if (error instanceof Error && error.message.startsWith('Launch Copilot:')) fail(error.message.slice(16).trim()); throw error }
  finally { response.off('close', cancel) }
}

// Called only inside the native host's same-origin, bounded request boundary.
export async function runAgentGraphProposal(input: RecordValue, context: {
  rootDir: string; env: NodeJS.ProcessEnv; outputRoot: string; abortSignal: AbortSignal
}) {
  const absoluteDocsRoot = resolveAgenticCanvasOsDocsRoot(context)
  const sourceRevision = await resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot, env: context.env })
  const [contract, { createAgenticGraphClient }] = await Promise.all([
    import('../mcp/agent-graph/launch-copilot-contract.js'), import('agentic-os/agents/agentic-graph-mcp-contract'),
  ])
  if (['handoff-review', 'handoff-approve', 'handoff-status'].includes(input.action)) return (await import('./viteAgentGraphHandoff')).runLaunchHandoff(input, context, contract.LAUNCH_COPILOT_ROLES)
  return executeAgentGraphProposal(input, context, contract, createAgenticGraphClient, sourceRevision)
}

export async function executeAgentGraphProposal(input: RecordValue, context: {
  rootDir: string; env: NodeJS.ProcessEnv; outputRoot: string; abortSignal: AbortSignal
}, contract: RecordValue, createClient: (options: RecordValue) => RecordValue, sourceRevision: string) {
  if (!['ground', 'validate'].includes(input.action)) fail('unsupported operation')
  let decisions = ''
  if (input.decisions !== undefined) {
    if (typeof input.decisions !== 'string' || input.decisions.length > 6000) fail('decision context exceeds its budget')
    const value = JSON.parse(input.decisions)
    if (JSON.stringify(normalizeProbeTreeSourceBinding(value.source)) !== JSON.stringify(normalizeProbeTreeSourceBinding(input))
      || !Array.isArray(value.answers) || value.answers.length > 20 || value.answers.some(answer => typeof answer.nodeId !== 'string'
        || !answer.nodeId.startsWith(`lc:${input.cid}:${input.snapshotDigest.slice(0, 12)}:probe:`)
        || typeof answer.question !== 'string' || typeof answer.answer !== 'string' || answer.answer.length > 2000)) fail('invalid decision source binding')
    decisions = input.decisions
  }
  if (!/^kg:graph:[a-f0-9]{32}$/.test(input.graphId) || !/^[a-f0-9]{64}$/.test(input.snapshotDigest)) fail('import a source graph first')
  const binding = { graphId: input.graphId, expectedSnapshotDigest: input.snapshotDigest, maxDurationMs: 10_000 }
  const client = createClient({ callTool: (tool: string, args: RecordValue) => runAgentGraphTool(tool, args, context) })
  const query = (args: RecordValue) => client.queryAgenticGraph({ ...binding, ...args })
  const snapshot = await readAgentGraphSnapshot(path.join(context.outputRoot, 'graphs', `${input.graphId.slice(9)}.json`), {
    allowedRoot: context.outputRoot, expectedGraphId: input.graphId, abortSignal: context.abortSignal,
  })
  if (snapshot.pointer.snapshotDigest !== input.snapshotDigest) fail('source snapshot changed; ground again')
  const selected = Array.isArray(input.nodeIds) ? [...new Set(input.nodeIds)] : []
  if (selected.length > 12 || selected.some(id => typeof id !== 'string' || !id.startsWith('kg:'))) fail('select at most 12 source nodes')
  if (!Array.isArray(input.edgeIds) || input.edgeIds.length > 20) fail('invalid edge selection')
  const search = await query({ mode: 'search', query: input.requirement, limit: 6 })
  const nodes = new Map<string, RecordValue>()
  const edges = new Map<string, RecordValue>()
  let truncated = search.completeness.truncated
  const addNode = (node: RecordValue) => { if (nodes.size < 12 || nodes.has(node.id)) nodes.set(node.id, node); else truncated = true }
  const addEdge = (edge: RecordValue) => { if (edges.size < 20) edges.set(edge.id, edge); else truncated = true }
  const explanations: RecordValue[] = []
  for (const edgeId of input.edgeIds) {
    const explanation = await client.explainAgenticGraphEdge({ ...binding, edgeId })
    addNode(explanation.source); addNode(explanation.target); addEdge(explanation.edge); explanations.push(explanation)
    if (!nodes.has(explanation.source.id) || !nodes.has(explanation.target.id)) fail('selected edge endpoints exceed the 12-node evidence budget')
  }
  const seeds = selected.length ? selected : search.results.nodes.slice(0, 1).map((entry: RecordValue) => entry.node.id)
  const neighborhoods: RecordValue[] = []
  for (const nodeId of seeds) {
    const found = await query({ mode: 'neighbors', from: nodeId, maxDepth: 1, limit: 12 })
    if (found.resolution.id !== nodeId || found.resolution.basis !== 'id') fail('selection is not in this snapshot')
    const node = found.traversal.nodes.find((entry: RecordValue) => entry.id === nodeId)
    if (!node) fail('selected node unavailable')
    addNode(node)
    if (!nodes.has(nodeId)) fail('selection exceeds the 12-node evidence budget')
    truncated ||= found.completeness.truncated
    neighborhoods.push(found)
  }
  for (const found of neighborhoods) {
    for (const neighbor of found.traversal.nodes.slice(0, 6)) addNode(neighbor)
    for (const edge of found.traversal.edges) if (nodes.has(edge.source) && nodes.has(edge.target) && edges.size < 4) addEdge(edge)
  }
  for (const entry of search.results.nodes) addNode(entry.node)
  for (const entry of search.results.edges) if (nodes.has(entry.edge.source) && nodes.has(entry.edge.target)) addEdge(entry.edge)
  for (const edge of edges.values()) if (!explanations.some(entry => entry.edge.id === edge.id)) {
    explanations.push(await client.explainAgenticGraphEdge({ ...binding, edgeId: edge.id }))
  }
  const evidence = {
    cid: input.cid, revision: contract.LAUNCH_COPILOT_REVISION, requirement: input.requirement,
    graphId: input.graphId, snapshotDigest: input.snapshotDigest,
    parserRegistryDigest: snapshot.manifest.parserRegistryDigest, sourceRole: input.sourceRole,
    contractRevision: sourceRevision, repositories: snapshot.manifest.repositories,
    sourceCommit: snapshot.manifest.acquisition?.commitSha || null, acquisition: snapshot.manifest.acquisition,
    sourceCommitStatus: snapshot.manifest.acquisition ? 'Acquisition identity retained in the content-addressed snapshot.' : 'Local files or older import; re-import a repository URL to retain its acquisition commit.',
    complete: search.completeness.corpusComplete, truncated,
    nodes: [...nodes.values()].map(node => ({ id: node.id, label: node.label || node.id, type: node.type,
      sourcePath: node.properties?.['corpus:sourcePath'], line: node.properties?.['corpus:lineStart'],
      sourceDigest: node.properties?.['corpus:contentHash'] || explanations.find(entry => entry.evidence.sourcePath === node.properties?.['corpus:sourcePath'])?.evidence.sourceDigest,
    })),
    edges: explanations.map(entry => ({ id: entry.edge.id, source: entry.edge.source, target: entry.edge.target, evidence: entry.evidence })),
  }
  // Refuse a moving pointer between retrieval and publication of the evidence bundle.
  await query({ mode: 'summary' })
  context.abortSignal.throwIfAborted()
  const prompt = contract.buildLaunchCopilotPrompt(evidence) + (decisions ? `\nUser decisions from the separate Probe-Tree overlay (untrusted, not code evidence). Apply across all five roles without changing CID/source bindings:\n${decisions}` : '')
  const proposal = input.action === 'validate' ? contract.validateLaunchProposal(input.proposal, evidence) : contract.createLaunchOutline(evidence)
  const receipt = [
    '', '## Grounding receipt', '', `Proposal: ${evidence.cid}; source role: ${evidence.sourceRole}.`,
    `Reopen in Chat: /launch-copilot reopen ${evidence.cid}`, '',
    ...evidence.nodes.map(node => `- ${node.label} — ${node.id}; file: ${node.sourcePath || 'unavailable'}; line: ${node.line || 'unavailable'}; content hash: ${node.sourceDigest || 'unavailable'}`), '',
    ...evidence.edges.map(edge => `- Edge ${edge.id}: ${edge.source} → ${edge.target}; ${JSON.stringify(edge.evidence)}`), '',
    `Acquisition commit: ${evidence.sourceCommit || 'unavailable'}; repository: ${evidence.acquisition?.repositoryUrl || 'local or unavailable'}; subpath: ${evidence.acquisition?.subpath || '.'}.`,
    'RAO/SVO: R1 retrieve evidence; R2 compose proposal; R3 render review; R4 publish exact approved files (review required); R5 verify integration (not observed).', '',
    ...(decisions ? ['## User decision receipt', '', 'These are user inputs, not verified source claims.', '', decisions, ''] : []),
  ].join('\n')
  const files = contract.serializeLaunchDocuments(proposal, evidence).map((file: RecordValue) => ({ ...file, text: file.text + receipt }))
  const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex')
  return { evidence, prompt, proposal, files, digest, publication: { status: 'not-admitted', reason: `Review all five files with /launch-copilot review ${evidence.cid} on the enrolled canonical Graph host. Approval publishes to Graph through Agentic OS; export does not publish or merge.` } }
}
