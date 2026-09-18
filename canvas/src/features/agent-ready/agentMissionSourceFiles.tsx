import React from 'react'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { activateAgentRunWorkspace, useAgentRunInspection, useAgentRunWorkspace } from './agentRunInspectionStore'

export const AGENT_MISSION_SOURCE_ROOT = '/agent-mission'
export const AGENT_MISSION_MANIFEST_PATH = `${AGENT_MISSION_SOURCE_ROOT}/agent-mission.manifest.json`
export const agentMissionSourceFolder: WorkspaceEntry = {
  path: AGENT_MISSION_SOURCE_ROOT, parentPath: '/', kind: 'folder', name: 'agent-mission', updatedAtMs: 0,
}
export const agentMissionManifestEntry: WorkspaceEntry = {
  path: AGENT_MISSION_MANIFEST_PATH, parentPath: AGENT_MISSION_SOURCE_ROOT, kind: 'file', name: 'agent-mission.manifest.json', updatedAtMs: 0,
}
export const matchesAgentMissionSource = (search = '') => agentMissionManifestEntry.name.includes(search.trim().toLowerCase())

/** A discoverable session source, never a persisted copy of private run evidence. */
export function AgentMissionSourceFile({ search = '' }: { search?: string }) {
  const inspection = useAgentRunInspection(), workspace = useAgentRunWorkspace()
  const [expanded, setExpanded] = React.useState(true)
  if (!matchesAgentMissionSource(search)) return null
  const entries: WorkspaceEntry[] = [agentMissionSourceFolder, agentMissionManifestEntry, ...(inspection ? [{
    path: `${AGENT_MISSION_SOURCE_ROOT}/agent-mission.md`, parentPath: AGENT_MISSION_SOURCE_ROOT,
    kind: 'file' as const, name: 'agent-mission.md', updatedAtMs: inspection.trace.observedAt,
  }] : [])]
  return <MarkdownFileTree entries={entries} readOnly
    expandedPaths={new Set(expanded || search ? ['/', AGENT_MISSION_SOURCE_ROOT] : ['/'])}
    toggleExpanded={() => setExpanded(value => !value)} activePath={workspace?.source === null ? null : workspace?.source ?? (inspection ? `${AGENT_MISSION_SOURCE_ROOT}/agent-mission.md` : null)}
    onSelectFile={path => activateAgentRunWorkspace(workspace?.view ?? 'tree', 'editor', path)} />
}
