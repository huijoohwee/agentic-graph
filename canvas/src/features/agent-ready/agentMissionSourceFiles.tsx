import React from 'react'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import { activateAgentRunWorkspace, useAgentRunInspection, useAgentRunWorkspace } from './agentRunInspectionStore'
import { agentMissionWorkspace, resolveAgentMissionSource } from './agentMissionWorkspace'

export const matchesAgentMissionSource = (search = '') =>
  '.workspace .worktrees agent-mission manifest.json inspection.json manifest.ref.json'.includes(search.trim().toLowerCase())

/** A discoverable session source, never a persisted copy of private run evidence. */
export function AgentMissionSourceFile({ search = '' }: { search?: string }) {
  const inspection = useAgentRunInspection(), workspace = useAgentRunWorkspace()
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
  const projection = agentMissionWorkspace(inspection?.trace)
  if (!matchesAgentMissionSource(search) && !projection.entries.some(row => row.name.toLowerCase().includes(search.trim().toLowerCase()))) return null
  return <MarkdownFileTree entries={projection.entries} readOnly
    expandedPaths={new Set(['/', ...projection.folders.filter(path => search || !collapsed.has(path))])}
    toggleExpanded={path => setCollapsed(previous => {
      const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next
    })} activePath={resolveAgentMissionSource(inspection?.trace, workspace?.source)}
    onSelectFile={path => activateAgentRunWorkspace(workspace?.view ?? 'tree', 'editor', path)} />
}
