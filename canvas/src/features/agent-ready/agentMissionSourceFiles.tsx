import React from 'react'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { activateAgentRunWorkspace } from './agentRunInspectionStore'

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
  const [expanded, setExpanded] = React.useState(true)
  if (!matchesAgentMissionSource(search)) return null
  return <MarkdownFileTree entries={[agentMissionSourceFolder, agentMissionManifestEntry]} readOnly
    expandedPaths={new Set(expanded || search ? ['/', AGENT_MISSION_SOURCE_ROOT] : ['/'])}
    toggleExpanded={() => setExpanded(value => !value)} activePath={null}
    onSelectFile={() => activateAgentRunWorkspace('tree', 'editor', AGENT_MISSION_MANIFEST_PATH)} />
}
