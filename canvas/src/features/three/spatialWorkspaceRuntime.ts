import yaml from 'js-yaml'
import { spatialWorkspaceProvenance } from './spatialWorkspaceProvenance'
import { SEMANTIC_OBJECT_VIEW_KEY } from '../xr-v2/semanticObjectView'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { JSONValue } from '@/lib/graph/types'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { canAuthorWorkspaceSceneMetadata } from '@/features/workspace-table/workspaceSceneMetadataAuthoring'
import { findComposedSourceFileByPath, normalizeComposedSourcePath } from '@/features/source-files/composedSourceSelection'
import { isCanonicalWorkspaceSeedPath } from '@/features/workspace-fs/workspaceCanonicalSeedBundle'
import { createWorkspacePersistedFs } from '@/features/workspace-fs/workspaceFsPersisted'
import { readWorkspaceSourceTextSnapshot } from '@/features/workspace-fs/workspaceSourceTextTransaction'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan, XR_MOTION_REFERENCE_GRAPH_METADATA_KEY as MOTION_KEY } from './xrMotionReferenceModel'
import { resolveXrMotionReferencePersistedValue } from './xrMotionReferencePersistedValue'
import { readXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { readXrPhysicsRuntime } from './xrPhysicsRuntime'
import { XR_PHYSICS_GRAPH_METADATA_KEY } from './xrPhysicsModel'
import { hydrateCanonicalXrMotionReferenceRuntime, hydrateCanonicalXrPhysicsRuntime } from './XrMotionReferenceRuntimeBridge'
import { readXrSceneDocumentReady } from './xrSceneDocumentReadiness'
import { canonicalSpatialJson, enforceSpatialBudget, freezeSpatial, inverseSpatialEdits, previewSpatialEdits, readSpatialReceipts, refuse, spatialDigest, SpatialReviewError, SPATIAL_REVIEW_KEY, SPATIAL_REVIEW_SCHEMA, type SpatialReceipt } from './spatialWorkspaceModel'

let epoch = 0
let browserSession = ''
let request = 0
let busy = false
useGraphStore.subscribe((next, prior) => {
  if (next.markdownDocumentName !== prior.markdownDocumentName || next.markdownDocumentText !== prior.markdownDocumentText || next.graphContentRevision !== prior.graphContentRevision || next.graphData !== prior.graphData) epoch++
})
const session = () => browserSession ||= crypto.randomUUID()
const listeners = new Set<() => void>()
export type SpatialProposal = Readonly<{
  id: string; digest: string; sourceToken: string; documentName: string; expiresAt: number
  actor: SpatialReceipt['actor']; preview: ReturnType<typeof previewSpatialEdits>
}>
let view: Readonly<{ proposal: SpatialProposal | null; preparing: boolean }> = { proposal: null, preparing: false }
export const readSpatialReview = () => view
export const subscribeSpatialReview = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const publish = (next: typeof view) => { view = freezeSpatial(next); listeners.forEach(listener => listener()) }
export type SpatialResult = { ok: boolean; code?: string; message: string; receipt?: SpatialReceipt; durability?: 'verified' | 'indeterminate' }
export const spatialFailure = (error: unknown): SpatialResult => ({ ok: false, code: error instanceof SpatialReviewError ? error.code : 'source-unavailable', message: error instanceof Error ? error.message : 'Spatial review is unavailable.' })

function capture() {
  const state = useGraphStore.getState(), motion = readXrMotionReferenceRuntime(), physics = readXrPhysicsRuntime()
  const path = normalizeComposedSourcePath(state.markdownDocumentName)
  if (!readXrSceneDocumentReady() || !state.graphData || !path || !state.markdownDocumentText || isCanonicalWorkspaceSeedPath(path)) refuse('source-unavailable', 'Open a local Markdown scene copy before reviewing edits.')
  const source = findComposedSourceFileByPath({ sourceFiles: state.sourceFiles, targetPath: path, enabledOnly: true })
  if (source?.source?.kind !== 'local') refuse('source-unavailable', 'Copy this scene into a local workspace document before review.')
  if (isWorkspaceGraphMutationBlocked(state) && !canAuthorWorkspaceSceneMetadata(state, { [MOTION_KEY]: {} })) refuse('source-unavailable', 'Wait for the source editor to settle before reviewing the scene.')
  if (physics.phase !== 'stopped' || physics.dirty || motion.dirty) refuse('source-unavailable', 'Stop dynamics and save existing scene edits before review.')
  const rawMetadata = state.graphData.metadata || {}, nested = rawMetadata.frontmatterMeta
  const metadata = { ...(nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : {}), ...rawMetadata, [MOTION_KEY]: resolveXrMotionReferencePersistedValue(rawMetadata) }
  if (!metadata[MOTION_KEY]) refuse('source-unavailable', 'This document has no authored spatial scene.')
  const block = extractYamlFrontmatterBlock(state.markdownDocumentText)
  const frontmatter = yaml.load(block?.yamlText || '') as Record<string, unknown> | undefined
  for (const key of [MOTION_KEY, XR_PHYSICS_GRAPH_METADATA_KEY, SPATIAL_REVIEW_KEY, SEMANTIC_OBJECT_VIEW_KEY]) {
    if (canonicalSpatialJson(frontmatter?.[key] ?? null) !== canonicalSpatialJson(metadata[key] ?? null)) refuse('source-unavailable', 'The scene and Markdown source are not synchronized.')
  }
  const plan = readXrMotionReferencePlan(metadata[MOTION_KEY], state.graphData.nodes)
  if (canonicalSpatialJson(serializeXrMotionReferencePlan(plan)) !== canonicalSpatialJson(serializeXrMotionReferencePlan(motion.plan))) refuse('source-unavailable', 'Wait for the active scene to finish loading.')
  const receipts = readSpatialReceipts(metadata[SPATIAL_REVIEW_KEY])
  enforceSpatialBudget({ scene: metadata[MOTION_KEY], physics: metadata[XR_PHYSICS_GRAPH_METADATA_KEY] ?? null, receipts })
  return { state, motion, physics, path, plan, receipts, metadata, epoch }
}
type Capture = ReturnType<typeof capture>
function current(base: Capture) {
  const live = capture()
  if (live.epoch !== base.epoch || live.path !== base.path || live.motion.revision !== base.motion.revision || live.physics.revision !== base.physics.revision) refuse('stale-source', 'The scene changed. Inspect it and preview a fresh proposal.')
  return live
}
async function identify(base: Capture) {
  const sceneDigest = await spatialDigest({ motion: serializeXrMotionReferencePlan(base.plan), physics: base.metadata[XR_PHYSICS_GRAPH_METADATA_KEY] ?? null })
  const sourceDigest = await spatialDigest(base.state.markdownDocumentText)
  const identity = { documentName: base.path, session: session(), epoch: base.epoch, sourceRevision: base.state.graphContentRevision || 0, motionRevision: base.motion.revision, physicsRevision: base.physics.revision, sourceDigest, sceneDigest, implementation: SPATIAL_REVIEW_SCHEMA }
  const token = await spatialDigest(identity)
  current(base)
  return { ...identity, token }
}
export async function inspectSpatialWorkspace() {
  try {
    const base = capture(), identity = await identify(base)
    const space = base.metadata[SEMANTIC_OBJECT_VIEW_KEY] === undefined ? null
      : await (await import('../xr-v2/semanticSpaceStore')).readSemanticSpace()
    current(base)
    return { ok: true as const, message: 'Authored scene inspected; physical correspondence is unknown.', identity,
      subjects: base.plan.subjects.map(subject => ({ id: subject.id, label: subject.label, position: subject.position, scale: subject.scale })),
      provenance: { ...spatialWorkspaceProvenance(base.metadata, space), source: base.path }, receipts: base.receipts }
  } catch (error) { return spatialFailure(error) }
}
let pendingBase: Capture | null = null
export async function proposeSpatialWorkspace(input: { expectedToken: string; edits: unknown }, actor: SpatialReceipt['actor'] = 'local-operator') {
  if (busy || view.preparing || view.proposal) return { ok: false, code: 'budget-exceeded', message: 'Apply or cancel the current proposal before starting another.' }
  const serial = ++request
  publish({ proposal: null, preparing: true })
  try {
    const base = capture(), identity = await identify(base)
    if (input.expectedToken !== identity.token) refuse('stale-source', 'The inspected source changed. Inspect it again.')
    const preview = previewSpatialEdits(base.plan, input.edits, base.state.graphData!.nodes)
    const digest = await spatialDigest({ sourceToken: identity.token, edits: preview.edits, diff: preview.diff, candidate: preview.metadata })
    current(base)
    if (request !== serial) refuse('cancelled', 'Spatial preview was cancelled.')
    const proposal = freezeSpatial({ id: crypto.randomUUID(), digest, sourceToken: identity.token, documentName: base.path, expiresAt: Date.now() + 5 * 60_000, actor, preview })
    pendingBase = base
    publish({ proposal, preparing: false })
    return { ok: true, message: 'Review the exact change in the scene inspector. Only the operator can apply it.', proposal }
  } catch (error) {
    if (request === serial) publish({ proposal: null, preparing: false })
    return spatialFailure(error)
  }
}
export function cancelSpatialWorkspace() {
  if (busy) return
  request++; pendingBase = null; publish({ proposal: null, preparing: false })
}
async function verifyReceipt(receipt: SpatialReceipt, expectedText?: string): Promise<SpatialResult> {
  try {
    const observed = await readWorkspaceSourceTextSnapshot({ path: receipt.documentName, read: () => createWorkspacePersistedFs().readFileText(receipt.documentName) })
    const value = yaml.load(extractYamlFrontmatterBlock(observed.value)?.yamlText || '') as Record<string, unknown>
    const saved = readSpatialReceipts(value?.[SPATIAL_REVIEW_KEY]).find(row => row.id === receipt.id)
    if (!observed.current || !saved || canonicalSpatialJson(saved) !== canonicalSpatialJson(receipt) || (expectedText !== undefined && observed.value !== expectedText)) throw new Error('Receipt not verified')
    return { ok: true, message: receipt.kind === 'undo' ? 'Change undone and verified in local storage.' : 'Change applied and verified in local storage.', receipt, durability: 'verified' }
  } catch {
    return { ok: false, code: 'persistence-indeterminate', message: 'The document contains a change receipt, but storage readback is unverified. Recheck the receipt; do not repeat the edit.', receipt, durability: 'indeterminate' }
  }
}
export async function recheckSpatialReceipt(id: string): Promise<SpatialResult> {
  try { const receipt = capture().receipts.find(row => row.id === id); if (!receipt) refuse('conflict', 'Receipt is unavailable in the active scene.'); return verifyReceipt(receipt) }
  catch (error) { return spatialFailure(error) }
}
async function commit(base: Capture, proposal: SpatialProposal, kind: 'apply' | 'undo', undoOf?: string): Promise<SpatialResult> {
  if (base.receipts.length >= 32) refuse('budget-exceeded', 'Export and prune the existing 32 receipts before another change.')
  const sceneDigest = await spatialDigest({ motion: proposal.preview.metadata, physics: base.metadata[XR_PHYSICS_GRAPH_METADATA_KEY] ?? null })
  const receipt: SpatialReceipt = { id: proposal.id, proposalDigest: proposal.digest, sourceToken: proposal.sourceToken, sceneDigest, documentName: base.path, session: session(), actor: proposal.actor,
    approver: 'local-operator', timestamp: Date.now(), kind, ...(undoOf ? { undoOf } : {}), diff: proposal.preview.diff,
    provenance: { kind: 'authored', units: 'metres', correspondence: 'unknown' } }
  const ledger = { schema: SPATIAL_REVIEW_SCHEMA, receipts: [...base.receipts, receipt] }
  enforceSpatialBudget({ proposal: proposal.preview, ledger })
  if (Date.now() >= proposal.expiresAt) refuse('approval-expired', 'This review expired. Create a fresh preview.')
  current(base) // No await between the final comparison and the existing synchronous store mutation.
  let expectedText: string | undefined
  try {
    base.state.updateGraphMetadata({ [MOTION_KEY]: proposal.preview.metadata, [SPATIAL_REVIEW_KEY]: ledger as unknown as JSONValue })
    const next = useGraphStore.getState()
    if (canonicalSpatialJson(next.graphData?.metadata?.[SPATIAL_REVIEW_KEY]) !== canonicalSpatialJson(ledger)) refuse('source-unavailable', 'The source owner refused the spatial transaction.')
    expectedText = next.markdownDocumentText || undefined
    const source = yaml.load(extractYamlFrontmatterBlock(expectedText || '')?.yamlText || '') as Record<string, unknown>
    if (next.markdownDocumentName !== base.state.markdownDocumentName || canonicalSpatialJson(source?.[MOTION_KEY]) !== canonicalSpatialJson(proposal.preview.metadata) || canonicalSpatialJson(source?.[SPATIAL_REVIEW_KEY]) !== canonicalSpatialJson(ledger)) refuse('persistence-indeterminate', 'Scene source readback changed during commit. Inspect its receipt before continuing.')
    hydrateCanonicalXrMotionReferenceRuntime(); hydrateCanonicalXrPhysicsRuntime()
  } catch (error) {
    // Never restore a whole old store: a subscriber or storage writer may already own a newer state.
    if (useGraphStore.getState().markdownDocumentText === base.state.markdownDocumentText && useGraphStore.getState().graphData === base.state.graphData) throw error
    return { ...spatialFailure(error), code: 'persistence-indeterminate', receipt, durability: 'indeterminate' }
  }
  return verifyReceipt(receipt, expectedText)
}
/** UI-only entry: the exact frozen proposal displayed by the component is the approval capability. */
export async function applySpatialWorkspace(proposal: SpatialProposal): Promise<SpatialResult> {
  if (busy) return { ok: false, code: 'conflict', message: 'A spatial commit is already in progress. Inspect its receipt.' }
  busy = true
  try {
    const live = capture(), prior = live.receipts.find(row => row.id === proposal.id)
    if (prior) {
      if (prior.proposalDigest !== proposal.digest) refuse('proposal-mismatch', 'This proposal ID has different content.')
      return await verifyReceipt(prior)
    }
    if (proposal !== view.proposal || !pendingBase) refuse('approval-required', 'Review the current proposal before applying it.')
    if (Date.now() >= proposal.expiresAt) refuse('approval-expired', 'This review expired. Create a fresh preview.')
    current(pendingBase)
    const result = await commit(pendingBase, proposal, 'apply')
    pendingBase = null; publish({ proposal: null, preparing: false })
    return result
  } catch (error) { return spatialFailure(error) }
  finally { busy = false }
}
/** Undo is an explicit operator action and a new guarded transaction; imported receipts grant no execution. */
export async function undoSpatialWorkspace(id: string): Promise<SpatialResult> {
  if (busy || view.proposal || view.preparing) return { ok: false, code: 'conflict', message: 'Finish or cancel the pending review before undo.' }
  busy = true
  try {
    const base = capture(), receipt = base.receipts.find(row => row.id === id)
    if (!receipt || receipt.kind !== 'apply' || receipt.documentName !== base.path) refuse('conflict', 'This receipt cannot be undone in the active scene.')
    const prior = base.receipts.find(row => row.undoOf === id)
    if (prior) return await verifyReceipt(prior)
    const identity = await identify(base), preview = previewSpatialEdits(base.plan, inverseSpatialEdits(base.plan, receipt), base.state.graphData!.nodes)
    const digest = await spatialDigest({ undoOf: id, sourceToken: identity.token, diff: preview.diff })
    return await commit(base, { id: crypto.randomUUID(), digest, sourceToken: identity.token, documentName: base.path, expiresAt: Date.now() + 300_000, actor: 'local-operator', preview }, 'undo', id)
  } catch (error) { return spatialFailure(error) }
  finally { busy = false }
}
/** The tool boundary never accepts approval, apply/undo, or legacy invocation bypasses. */
export async function controlSpatialWorkspaceAgent(input: Record<string, unknown>) {
  if (input.action !== 'preview') return { ok: false, code: 'approval-required', message: 'Agent scene writes require a spatial preview and an operator action in the scene inspector. Use action=preview with expectedToken and edits.' }
  if (Object.keys(input).some(key => !['action', 'expectedToken', 'edits'].includes(key)) || typeof input.expectedToken !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedToken)) return { ok: false, code: 'invalid-input', message: 'Preview needs the exact inspected source token and bounded edits; approval flags are not accepted.' }
  return proposeSpatialWorkspace({ expectedToken: input.expectedToken, edits: input.edits }, 'browser-agent')
}
