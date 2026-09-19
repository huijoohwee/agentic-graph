import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { record, type RunTrace } from './missionControlProjection'
import type { MissionCodebaseIndex } from './useAgentMissionCodebaseIndex'

export const AGENT_MISSION_SOURCE_ROOT = '/.workspace'
const segment = (value: unknown) => encodeURIComponent(String(value || 'unobserved'))

/** Session-only navigation over the native archive. Member documents are references, not copied evidence. */
export function agentMissionWorkspace(trace?: RunTrace | null, codebase?: MissionCodebaseIndex) {
  const workflow = record(trace?.profile.workflow), manifest = trace?.workflowManifest
  const id = String(manifest?.value.id ?? trace?.cohortId ?? trace?.runId ?? 'unobserved') || 'unobserved'
  const root = `${AGENT_MISSION_SOURCE_ROOT}/${segment(id)}`
  const manifestPath = `${root}/${manifest ? 'agent-mission.manifest.json' : 'agent-mission.inspection.json'}`
  const markdownPath = `${root}/agent-mission.md`, worktreesPath = `${root}/.worktrees`
  const updatedAtMs = trace?.observedAt ?? 0
  const entry = (path: string, parentPath: string, name: string, kind: WorkspaceEntry['kind']): WorkspaceEntry => ({ path, parentPath, name, kind, updatedAtMs })
  const entries = [entry(AGENT_MISSION_SOURCE_ROOT, '/', '.workspace', 'folder'),
    entry(root, AGENT_MISSION_SOURCE_ROOT, id, 'folder'),
    entry(manifestPath, root, manifest ? 'agent-mission.manifest.json' : 'agent-mission.inspection.json', 'file')]
  if (trace) entries.push(entry(markdownPath, root, 'agent-mission.md', 'file'))
  const references = new Map<string, Record<string, unknown>>()
  const members = Array.isArray(workflow.members) ? workflow.members.slice(0, 32).map(record) : []
  if (members.length) entries.push(entry(worktreesPath, root, '.worktrees', 'folder'))
  for (const member of members) {
    const memberRoot = `${worktreesPath}/${segment(member.id)}`, referencePath = `${memberRoot}/manifest.ref.json`
    entries.push(entry(memberRoot, worktreesPath, String(member.id), 'folder'), entry(referencePath, memberRoot, 'manifest.ref.json', 'file'))
    references.set(referencePath, { schema: 'agentic-graph/workflow-member-reference/v1', authority: false,
      workflowId: id, memberId: member.id, manifest: member.manifest, digest: member.digest,
      source: member.source, context: member.context, coverage: member.coverage, missing: member.missing })
  }
  if (manifest) {
    const path = `${root}/codebase-index.ref.json`
    entries.push(entry(path, root, 'codebase-index.ref.json', 'file'))
    references.set(path, codebase?.reference?.value ?? { schema: 'agentic-graph-codebase-index-reference/v1',
      authority: false, workflowId: id, status: 'unobserved', path: null, graphId: null, snapshotDigest: null,
      reason: 'No retained native Codebase graph index is linked in this browser workspace.' })
  }
  if (codebase) {
    const indexPath = `${root}/codebase-index.manifest.json`
    entries.push(entry(indexPath, root, 'codebase-index.manifest.json', 'file'))
    references.set(indexPath, codebase.index.value)
  }
  return { id, root, manifestPath, markdownPath, entries, references,
    folders: entries.filter(row => row.kind === 'folder').map(row => row.path) }
}

export function resolveAgentMissionSource(trace: RunTrace | null | undefined, source: string | null | undefined, codebase?: MissionCodebaseIndex) {
  if (source === null) return null
  const projection = agentMissionWorkspace(trace, codebase)
  return projection.entries.some(row => row.kind === 'file' && row.path === source) ? source!
    : trace && !trace.workflowManifest ? projection.markdownPath : projection.manifestPath
}
