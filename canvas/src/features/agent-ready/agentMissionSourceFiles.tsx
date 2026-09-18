import React from 'react'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import { activateAgentRunWorkspace, useAgentRunInspection, useAgentRunWorkspace } from './agentRunInspectionStore'
import { agentMissionWorkspace, resolveAgentMissionSource } from './agentMissionWorkspace'
import { useAgentMissionCodebaseIndex, type MissionCodebaseIndex } from './useAgentMissionCodebaseIndex'
import { record } from './missionControlProjection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const button = `rounded border px-3 py-2 text-xs disabled:opacity-50 ${UI_THEME_TOKENS.button.neutralMuted}`

export const matchesAgentMissionSource = (search = '') =>
  '.workspace .worktrees agent-mission manifest.json inspection.json manifest.ref.json'.includes(search.trim().toLowerCase())

/** A discoverable session source, never a persisted copy of private run evidence. */
export function AgentMissionSourceFile({ search = '' }: { search?: string }) {
  const inspection = useAgentRunInspection(), workspace = useAgentRunWorkspace()
  const codebase = useAgentMissionCodebaseIndex(inspection?.trace)
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
  const projection = agentMissionWorkspace(inspection?.trace, codebase.data)
  if (!matchesAgentMissionSource(search) && !projection.entries.some(row => row.name.toLowerCase().includes(search.trim().toLowerCase()))) return null
  return <><MarkdownFileTree entries={projection.entries} readOnly
    expandedPaths={new Set(['/', ...projection.folders.filter(path => search || !collapsed.has(path))])}
    toggleExpanded={path => setCollapsed(previous => {
      const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next
    })} activePath={resolveAgentMissionSource(inspection?.trace, workspace?.source, codebase.data)}
    onSelectFile={path => activateAgentRunWorkspace(workspace?.view ?? 'tree', 'editor', path)} />
    {codebase.data ? <AgentMissionCodebaseGraphButton codebase={codebase.data} /> : null}
    {codebase.error ? <p role="status">{codebase.error}</p> : null}</>
}

export function AgentMissionCodebaseGraphButton({ codebase }: { codebase: MissionCodebaseIndex }) {
  const [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
  return <><button type="button" className={button} disabled={busy} onClick={() => {
    if (busy) return
    const { value } = codebase.index
    setBusy(true); setError('')
    void import('@/features/agent-graph/agentGraphWorkspaceArtifact').then(owner =>
      owner.reopenAgentGraphWorkspaceProjection(String(record(value.projection).path),
        { graphId: String(value.graphId), snapshotDigest: String(value.snapshotDigest) }))
      .catch(() => setError('Retained graph unavailable. Inspect the linked index reference.'))
      .finally(() => setBusy(false))
  }}>Open codebase graph · D3</button>{error && <p role="status">{error}</p>}</>
}
