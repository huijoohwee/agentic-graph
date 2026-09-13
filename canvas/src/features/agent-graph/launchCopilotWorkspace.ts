import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH } from '@/features/workspace-fs/workspaceSourceRoots'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { zipSync, strToU8 } from 'fflate'
import { downloadBlob } from '@/lib/graph/save'
import { retainAgentGraphWorkspaceProjection, reopenAgentGraphWorkspaceProjection } from './agentGraphWorkspaceArtifact'
import { RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID, resolveRichMediaTextOutputVersionSelection } from '@/lib/render/richMediaOutputVersions'
import { normalizeProbeTreeSourceBinding, type ProbeTreeMcpBridgeSuccess } from '@/features/agent-ready/probeTreeMcpBridgeContract'

export type LaunchRecord = {
  request: Record<string, unknown>; evidence: Record<string, any>; proposal: Record<string, any>
  files: { path: string; text: string }[]; digest: string; prompt: string
  publication: { status: string; reason: string }; overlay?: GraphData; sourceWorkspacePath?: string
}
const sessionPath = (cid: string) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cid) || cid.length > 80) throw new Error('Invalid proposal CID')
  return `${WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH}/proposals/${cid}/launch-copilot.json`
}
let active: LaunchRecord | null = null
let writes: Promise<unknown> = Promise.resolve()
const roles = ['prd', 'tad', 'adr', 'mvp', 'gtm']
export function launchProbeBinding(record: LaunchRecord) {
  const binding = normalizeProbeTreeSourceBinding(record.request)
  if (!binding || binding.cid !== record.evidence.cid || binding.graphId !== record.evidence.graphId || binding.snapshotDigest !== record.evidence.snapshotDigest) throw new Error('Invalid proposal source binding')
  return binding
}
export function launchProbeDecisions(record: LaunchRecord) {
  const answers = (record.overlay?.nodes || []).filter(node => node.properties?.launchProbe === true && String(node.properties.output || '').trim())
    .map(node => ({ nodeId: node.id, question: node.properties.summary, answer: node.properties.output }))
  const text = JSON.stringify({ source: launchProbeBinding(record), answers })
  if (text.length > 6000) throw new Error('Probe-Tree answers exceed the context budget; shorten them before continuing')
  return text
}
function retainedLaunchProbes(record: LaunchRecord) {
  const nodes = record.overlay?.nodes.filter(node => node.properties?.launchProbe === true) || []
  if (nodes.length > 20) throw new Error('Probe-Tree is limited to 20 retained questions per proposal')
  if (nodes.length) {
    const binding = JSON.stringify(launchProbeBinding(record)), prefix = `lc:${record.evidence.cid}:${record.evidence.snapshotDigest.slice(0, 12)}:`
    const ids = new Set([`${prefix}prd`, ...nodes.map(node => node.id)])
    for (const node of nodes) {
      const p = node.properties
      const parentDepth = nodes.find(parent => parent.id === p.parentNodeId)?.properties.probeTreeDepth || 0
      if (!node.id.startsWith(`${prefix}probe:`) || p.cardTypeLabel !== 'Probe-Tree Card' || JSON.stringify(normalizeProbeTreeSourceBinding(p.launchSourceBinding)) !== binding
        || !ids.has(String(p.parentNodeId)) || !Number.isInteger(p.probeTreeDepth) || Number(p.probeTreeDepth) < 1 || Number(p.probeTreeDepth) > 5
        || Number(p.probeTreeDepth) !== Number(parentDepth) + 1 || typeof p.output !== 'string' || p.output.length > 2000) throw new Error('Invalid retained Probe-Tree source or answer binding')
    }
  }
  // Derive tree edges from validated parent joins, never accept retained code edges.
  const edges = nodes.map(node => ({ id: `${node.id}:parent`, source: String(node.properties.parentNodeId), target: node.id, label: 'proposal question', properties: { 'visual:dash': '6,4' } }))
  return { nodes, edges }
}
function assertFiles(record: LaunchRecord) {
  if (record.files?.length !== 5 || !record.files.every((file, index) => file.path === `docs/proposals/${record.evidence.cid}/${roles[index]}.md` && typeof file.text === 'string' && file.text.length <= 24000)) throw new Error('Invalid five-file proposal')
}
function reveal(record: LaunchRecord) {
  active = record
  useGraphStore.setState(state => ({ launchProposalOverlay: record.overlay!, graphDataRevision: state.graphDataRevision + 1 }))
  const state = useGraphStore.getState()
  state.setFitToScreenMode(false); state.setZoomToSelectionMode(false)
  state.selectNodesExpanded({ nodeIds: record.overlay!.nodes.filter(node => node.type === 'RichMediaPanel').map(node => node.id), forceMulti: true })
  state.requestZoom('fit')
}
export const launchSourceIdentity = (graph: GraphData | null) => graph?.metadata?.agentGraphProjection as Record<string, unknown> | undefined
export function assertLaunchSource(record: LaunchRecord) {
  const source = launchSourceIdentity(useGraphStore.getState().graphData)
  if (source?.readOnly !== true || source.graphId !== record.evidence.graphId || source.snapshotDigest !== record.evidence.snapshotDigest) throw new Error('Source selection changed; reopen the original graph or ground again')
}
export function buildLaunchOverlay(record: LaunchRecord): GraphData {
  const { evidence, proposal, files } = record
  const prefix = `lc:${evidence.cid}:${evidence.snapshotDigest.slice(0, 12)}`
  const nodes: GraphNode[] = files.map((file, index) => ({
    id: `${prefix}:${proposal.documents[index].role}`, label: proposal.documents[index].role.toUpperCase(), type: 'RichMediaPanel',
    x: 500 + (index % 2) * 650, y: Math.floor(index / 2) * 500, fx: 500 + (index % 2) * 650, fy: Math.floor(index / 2) * 500,
    properties: { output: file.text, richMediaActiveTab: 'text', markdownWorkspaceViewerSurface: true, freezeConnectedOutput: true, richMediaDisplayMode: 'panel-only', 'visual:width': 360, 'visual:height': 400, launchProposalPath: file.path, sourceNodeIds: evidence.nodes.map((node: { id: string }) => node.id), outputVersions: [{ id: 'retained-proposal', createdAt: '', output: file.text, outputMimeType: 'text/markdown' }], selectedOutputVersionId: RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID },
  }))
  const edges: GraphData['edges'] = []
  proposal.documents.forEach((doc: Record<string, any>, index: number) => {
    const linked = new Set<string>(doc.claims.flatMap((claim: Record<string, any>) => claim.nodeIds))
    for (const source of linked) edges.push({ id: `${prefix}:doc:${index}:${source}`, source, target: nodes[index].id, label: 'proposal cites', properties: { 'visual:dash': '6,4' } })
    doc.claims.filter((claim: Record<string, any>) => claim.newWork).forEach((claim: Record<string, any>, count: number) => {
      const id = `${prefix}:new:${index}:${count}`
      nodes.push({ id, label: `NEW: ${claim.newWork.owner}`, type: 'Node', x: 200, y: index * 300 + count * 80, properties: { proposed: true, output: claim.text, owner: claim.newWork.owner, dependency: claim.newWork.dependency, futureCheck: claim.newWork.check } })
      edges.push({ id: `${id}:doc`, source: id, target: `${prefix}:${doc.role}`, label: 'proposed work', properties: { 'visual:dash': '6,4' } })
      if (evidence.nodes[0]) edges.push({ id: `${id}:source`, source: evidence.nodes[0].id, target: id, label: 'proposed context; not a code edge', properties: { 'visual:dash': '6,4' } })
    })
  })
  const evidenceProjection = {
    nodes: evidence.nodes.map((node: any) => ({ id: node.id, type: node.type, label: node.label, properties: { 'corpus:sourcePath': node.sourcePath || '', 'corpus:contentHash': node.sourceDigest || '', evidenceSnapshot: evidence.snapshotDigest } })),
    edges: evidence.edges.map((edge: any) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label || edge.evidence.ruleId, properties: { sourceEvidence: edge.evidence, evidenceSnapshot: evidence.snapshotDigest } })),
  }
  const probes = retainedLaunchProbes(record)
  nodes.push(...probes.nodes); edges.push(...probes.edges)
  return { type: 'Graph', nodes, edges, metadata: { kind: 'launch-proposal', source: prefix, graphId: evidence.graphId, snapshotDigest: evidence.snapshotDigest, cid: evidence.cid, evidenceProjection } }
}
async function persist(record: LaunchRecord) {
  assertFiles(record)
  retainedLaunchProbes(record)
  const fs = await getWorkspaceFs(), filePath = sessionPath(record.evidence.cid)
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: filePath.slice(0, filePath.lastIndexOf('/')) })
  const retained = structuredClone(record)
  for (const panel of retained.overlay?.nodes || []) {
    const file = retained.files.find(file => file.path === panel.properties?.launchProposalPath)
    if (!file) continue
    if (panel.properties.output === file.text) delete panel.properties.output
    const versions = panel.properties.outputVersions as any[]
    if (versions?.length === 1 && versions[0].output === file.text) delete panel.properties.outputVersions
  }
  const text = JSON.stringify(retained) // Files are the SSOT; omit equal panel copies, preserving distinct edited versions.
  if (new TextEncoder().encode(text).length > 160_000) throw new Error('Proposal workspace byte budget exceeded')
  assertLaunchSource(record)
  const parentPath = filePath.slice(0, filePath.lastIndexOf('/'))
  for (const file of record.files) {
    const name = file.path.split('/').at(-1)!, target = `${parentPath}/${name}`
    if (!/^(prd|tad|adr|mvp|gtm)\.md$/.test(name)) throw new Error('Invalid proposal file')
    if (await fs.readFileText(target) === null) await fs.createFile({ parentPath, name, text: file.text, mirrorToHost: false })
    else await fs.writeFileText(target, file.text, { mirrorToHost: false })
  }
  if (await fs.readFileText(filePath) === null) await fs.createFile({ parentPath: filePath.slice(0, filePath.lastIndexOf('/')), name: 'launch-copilot.json', text, mirrorToHost: false })
  else await fs.writeFileText(filePath, text, { mirrorToHost: false })
  await applyWorkspaceImportToCanvas({ fs, createdPaths: [filePath, ...record.files.map(file => `${parentPath}/${file.path.split('/').at(-1)}`)], opts: { applyToGraph: false, skipComposedGraphApply: true } })
}
export async function publishLaunchWorkspace(record: LaunchRecord) {
  assertLaunchSource(record)
  const fs = await getWorkspaceFs()
  if (await fs.readFileText(sessionPath(record.evidence.cid)) !== null) throw new Error('CID already exists; reopen it or choose another CID')
  record.sourceWorkspacePath = await retainAgentGraphWorkspaceProjection(useGraphStore.getState().graphData!)
  record.overlay = buildLaunchOverlay(record)
  await persist(record)
  assertLaunchSource(record)
  reveal(record)
}
export async function reopenLaunchWorkspace(cid: string) {
  await writes
  const text = await (await getWorkspaceFs()).readFileText(sessionPath(cid))
  if (!text || text.length > 160_000) throw new Error('Retained proposal is unavailable')
  const record = JSON.parse(text) as LaunchRecord
  if (record.evidence?.cid !== cid || record.files?.length !== 5 || !record.overlay || record.overlay.nodes.some(node => !node.id.startsWith(`lc:${cid}:`))) throw new Error('Invalid retained proposal')
  assertFiles(record)
  const ids = new Set(record.evidence.nodes.map((node: { id: string }) => node.id))
  if (record.proposal?.documents?.length !== 5 || !record.proposal.documents.every((doc: any, index: number) => doc.role === roles[index] && Array.isArray(doc.claims) && doc.claims.length <= 8 && doc.claims.every((claim: any) => Array.isArray(claim.nodeIds) && claim.nodeIds.every((id: string) => ids.has(id))))) throw new Error('Invalid retained claim bindings')
  const positions = new Map(record.overlay.nodes.map(node => [node.id, node]))
  record.overlay = buildLaunchOverlay(record) // Rebuild panel identities and relations; retained evidence still requires a fresh host check.
  for (const node of record.overlay.nodes) {
    const prior = positions.get(node.id)
    for (const key of ['x', 'y', 'fx', 'fy'] as const) if (typeof prior?.[key] === 'number' && Number.isFinite(prior[key])) node[key] = prior[key]
    const versions = resolveRichMediaTextOutputVersionSelection({ properties: { ...node.properties, ...prior?.properties } })
    if (versions.versions.length === 1 && versions.versions[0].output.length <= 24000) node.properties = { ...node.properties, outputVersions: versions.versions, selectedOutputVersionId: versions.selectedVersionId, ...(typeof prior?.properties?.output === 'string' && prior.properties.output.length <= 24000 ? { output: prior.properties.output } : {}) }
  }
  for (const file of record.files) {
    const saved = await (await getWorkspaceFs()).readFileText(`${sessionPath(cid).replace('launch-copilot.json', '')}${file.path.split('/').at(-1)}`)
    if (saved === null) throw new Error('A retained proposal document is missing')
    const externalEdit = saved !== file.text
    if (externalEdit) record.digest = ''
    file.text = saved
    const panel = record.overlay.nodes.find(node => node.properties?.launchProposalPath === file.path)
    if (panel && (externalEdit || panel.properties?.selectedOutputVersionId === RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID)) panel.properties = { ...panel.properties, output: saved, selectedOutputVersionId: RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID }
  }
  assertFiles(record)
  const source = launchSourceIdentity(useGraphStore.getState().graphData)
  if (record.sourceWorkspacePath && (source?.graphId !== record.evidence.graphId || source.snapshotDigest !== record.evidence.snapshotDigest)) await reopenAgentGraphWorkspaceProjection(record.sourceWorkspacePath, { graphId: record.evidence.graphId, snapshotDigest: record.evidence.snapshotDigest })
  assertLaunchSource(record)
  reveal(record)
  return record
}
export async function retainLaunchProbeResponse(record: LaunchRecord, response: ProbeTreeMcpBridgeSuccess, anchorId: string, provider?: { text: string; model: string }) {
  assertLaunchSource(record)
  const binding = launchProbeBinding(record)
  if (JSON.stringify(response.sourceBinding) !== JSON.stringify(binding) || !response.groundedContext) throw new Error('Probe-Tree response is not bound to this proposal')
  const anchor = record.overlay?.nodes.find(node => node.id === anchorId)
  if (!anchor || anchor.properties?.launchProbe !== true && anchorId !== record.overlay.nodes[0].id) throw new Error('Select a proposal question or its PRD to continue')
  if (Number(anchor.properties.probeTreeDepth || 0) >= 5) throw new Error('Probe-Tree depth limit reached')
  const { materializeStoryboardWidgetProbeTreeStructuredResponse } = await import('@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeStructuredResponse')
  let reason = ''
  const materialized = materializeStoryboardWidgetProbeTreeStructuredResponse({
    graphData: record.overlay, anchorNode: anchor, contextText: response.groundedContext,
    responseText: provider?.text || JSON.stringify({ jsonrpc: '2.0', id: 'launch-probe', result: response.result }),
    responseSource: provider ? 'provider' : 'mcp', model: provider?.model || String((response.result.structuredContent as any)?.model_adapter?.model || 'none'),
    mcpInvoked: true, threadRootId: record.overlay.nodes[0].id, invocationTokens: [], invocationResolutions: response.invocationResolutions,
    onRejected: value => { reason = value },
  })
  if (!materialized) throw new Error(`Native Probe-Tree contract rejected the response: ${reason}`)
  const next = structuredClone(record), prefix = `lc:${binding.cid}:${binding.snapshotDigest.slice(0, 12)}:probe:`
  const ids = new Map(materialized.materializedNodeIds.map(id => [id, `${prefix}${crypto.randomUUID()}`]))
  next.overlay = materialized.graphData
  next.overlay.nodes = next.overlay.nodes.map(node => ids.has(node.id) ? { ...node, id: ids.get(node.id)!, properties: { ...node.properties,
    launchProbe: true, launchSourceBinding: binding, probeTreeCurrentNodeId: ids.get(node.id)!, parentNodeId: anchorId, parentGraphNodeId: anchorId,
  } } as GraphNode : node)
  next.digest = ''; next.overlay = buildLaunchOverlay(next)
  await persist(next); assertLaunchSource(next); reveal(next)
  return next
}
export async function replaceLaunchWorkspaceDraft(record: LaunchRecord) {
  await writes
  assertLaunchSource(record)
  record.overlay = buildLaunchOverlay(record); record.digest = ''
  await persist(record); assertLaunchSource(record); reveal(record)
}
export function updateLaunchNode(id: string, patch: Partial<GraphNode>) {
  writes = writes.then(async () => {
    if (!active?.overlay) return
    assertLaunchSource(active)
    const node = active.overlay.nodes.find(item => item.id === id)
    if (!node) return
    const next = structuredClone(active)
    const position = Object.fromEntries(['x', 'y', 'fx', 'fy'].filter(key => typeof (patch as any)[key] === 'number' && Number.isFinite((patch as any)[key])).map(key => [key, (patch as any)[key]]))
    if ('x' in position && !('fx' in position)) position.fx = position.x
    if ('y' in position && !('fy' in position)) position.fy = position.y
    next.overlay!.nodes = next.overlay!.nodes.map(item => item.id === id ? {
      ...item, ...position,
      properties: { ...item.properties, ...Object.fromEntries(['output', 'richMediaActiveTab', 'freezeConnectedOutput', 'selectedOutputVersionId', 'visual:width', 'visual:height'].filter(key => patch.properties && key in patch.properties).map(key => [key, patch.properties![key]])) } as Record<string, JSONValue>,
    } : item)
    for (const file of next.files) {
      const panel = next.overlay!.nodes.find(item => item.properties?.launchProposalPath === file.path)
      if (panel) file.text = resolveRichMediaTextOutputVersionSelection({ properties: panel.properties, fallbackOutput: panel.properties?.output }).selectedOutput
    }
    next.digest = '' // Any edit invalidates prior review; source claims need renewed semantic review.
    await persist(next); active = next
    useGraphStore.setState(state => ({ launchProposalOverlay: next.overlay!, graphDataRevision: state.graphDataRevision + 1 }))
  }).catch(error => { useGraphStore.getState().pushUiLog({ kind: 'error', message: String(error), source: 'launch-copilot' }) })
}
export async function exportLaunchWorkspace(cid: string) {
  const record = await reopenLaunchWorkspace(cid)
  assertFiles(record)
  const digestBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(record.files)))
  const digest = [...new Uint8Array(digestBytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  const archive = zipSync(Object.fromEntries(record.files.map(file => [file.path, strToU8(file.text)])))
  downloadBlob(new Blob([archive as BlobPart], { type: 'application/zip' }), `${cid}-${digest.slice(0, 12)}.zip`)
  return digest
}
