import assert from 'node:assert/strict'
import { agentMissionWorkspace, resolveAgentMissionSource } from '@/features/agent-ready/agentMissionWorkspace'
import { readWorkflowImport } from '@/features/agent-ready/agentWorkflowImport'
import { resolveMarkdownWorkspaceInitialPaneVisibility } from '@/features/markdown-workspace/main/types'

export async function testAgentMissionWorkspaceLifecycle() {
  const members = ['os', 'graph'].map(id => ({ id, manifest: `.artifacts/workflows/${id}/manifest.json`,
    digest: id === 'os' ? 'a'.repeat(64) : 'b'.repeat(64), source: { repository: `github.com/example/${id}` },
    context: { workflowId: 'mission-1', worktreeId: `${id}--mission` }, missing: ['ci'] }))
  const importBoundary = async (id: string, boundary: string, sequence: number) => {
    const manifest = { schema: 'agentic-os/workflow-group/v1', id, boundary, sequence, members }
    const text = JSON.stringify(manifest, null, 2) + '\n'
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('')
    let calls = 0
    const request = (async () => {
      calls++
      const page = { schema: 'agent-toolkit-run/v1', runId: `workflow-${id}`, authority: false, status: 'running',
        observedAt: Date.now(), expiresAt: Date.now() + 60000, manifestDigest: digest, cohortId: id,
        profile: { workflow: { members, boundary, sequence } }, spans: [{ spanId: 'root' }],
        page: { offset: 0, total: 1, nextCursor: null }, coverage: { sourcePartial: true } }
      return new Response(`data: ${JSON.stringify(page)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
    }) as typeof fetch
    const trace = await readWorkflowImport(text, 'manifest.json', new AbortController().signal, request)
    assert.equal(calls, 1); assert.equal(trace.workflowManifest?.text, text)
    assert.equal(trace.workflowManifest?.digest, digest)
    return trace
  }
  const start = await importBoundary('mission-1', 'start', 1), projection = agentMissionWorkspace(start)
  assert.equal(projection.root, '/.workspace/mission-1')
  assert.equal(projection.manifestPath, '/.workspace/mission-1/agent-mission.manifest.json')
  assert.equal(projection.references.size, 2)
  assert(projection.entries.some(row => row.path === '/.workspace/mission-1/.worktrees/os/manifest.ref.json'))
  assert.equal(projection.references.get('/.workspace/mission-1/.worktrees/graph/manifest.ref.json')?.digest, 'b'.repeat(64))
  assert.equal(new Set(projection.entries.map(row => row.path)).size, projection.entries.length)
  assert.equal(resolveMarkdownWorkspaceInitialPaneVisibility({ activeDocumentKey: projection.manifestPath }).json, true)
  assert.equal(resolveAgentMissionSource(start, undefined), projection.manifestPath)
  assert.equal(resolveAgentMissionSource(start, '/agent-mission/agent-mission.md'), projection.manifestPath)
  assert.equal(resolveAgentMissionSource(start, projection.markdownPath), projection.markdownPath)
  assert.equal(resolveAgentMissionSource(start, null), null)
  const end = await importBoundary('mission-1', 'end', 2)
  assert.equal(agentMissionWorkspace(end).manifestPath, projection.manifestPath)
  assert.notEqual(end.workflowManifest?.digest, start.workflowManifest?.digest)
  assert.equal(end.status, 'running'); assert.equal(end.partial, true)
  const next = await importBoundary('mission-2', 'start', 1)
  assert.notEqual(agentMissionWorkspace(next).root, projection.root)
  assert.equal(resolveAgentMissionSource(next, projection.manifestPath), agentMissionWorkspace(next).manifestPath)
  assert.equal(resolveAgentMissionSource(next, projection.markdownPath), agentMissionWorkspace(next).manifestPath)
  assert(agentMissionWorkspace({ ...start, workflowManifest: undefined }).manifestPath.endsWith('inspection.json'))
}
