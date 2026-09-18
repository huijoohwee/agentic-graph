import React from 'react'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import { activateAgentRunWorkspace, useAgentRunInspection, useAgentRunWorkspace } from './agentRunInspectionStore'
import { agentMissionWorkspace, resolveAgentMissionSource } from './agentMissionWorkspace'
import { useAgentMissionCodebaseIndex } from './useAgentMissionCodebaseIndex'

export const matchesAgentMissionSource = (search = '') =>
  '.workspace .worktrees agent-mission manifest.json inspection.json manifest.ref.json'.includes(search.trim().toLowerCase())

/** A discoverable session source, never a persisted copy of private run evidence. */
export function AgentMissionSourceFile({ search = '' }: { search?: string }) {
  const inspection = useAgentRunInspection(), workspace = useAgentRunWorkspace()
  const codebase = useAgentMissionCodebaseIndex(inspection?.trace)
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
  const [openError, setOpenError] = React.useState('')
  const projection = agentMissionWorkspace(inspection?.trace, codebase.data)
  if (!matchesAgentMissionSource(search) && !projection.entries.some(row => row.name.toLowerCase().includes(search.trim().toLowerCase()))) return null
  return <><MarkdownFileTree entries={projection.entries} readOnly
    expandedPaths={new Set(['/', ...projection.folders.filter(path => search || !collapsed.has(path))])}
    toggleExpanded={path => setCollapsed(previous => {
      const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next
    })} activePath={resolveAgentMissionSource(inspection?.trace, workspace?.source, codebase.data)}
    onSelectFile={path => activateAgentRunWorkspace(workspace?.view ?? 'tree', 'editor', path)} />
    {codebase.data ? <button type="button" className="px-2 py-1 text-xs" onClick={() => {
      const { value } = codebase.data!.index
      setOpenError('')
      void import('@/features/agent-graph/agentGraphWorkspaceArtifact').then(owner =>
        owner.reopenAgentGraphWorkspaceProjection(String((value.projection as Record<string, unknown>).path),
          { graphId: String(value.graphId), snapshotDigest: String(value.snapshotDigest) }))
        .catch(() => setOpenError('Retained codebase graph unavailable. Import its source to create a new snapshot.'))
    }}>Open codebase graph · D3</button> : null}
    {codebase.error || openError ? <p role="status">{codebase.error || openError}</p> : null}</>
}
