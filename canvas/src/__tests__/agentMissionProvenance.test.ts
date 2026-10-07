import assert from 'node:assert/strict'
import test from 'node:test'
import type { GraphData } from '@/lib/graph/types'
import { readRunTrace } from '@/features/agent-ready/missionControlProjection'
import { agentMissionSpanImpact } from '@/features/agent-ready/agentMissionOverviewModel'
import { joinAgentMissionProvenance } from '@/features/agent-ready/agentMissionProvenance'

const revision = 'a'.repeat(40), tree = 'b'.repeat(40), snapshotDigest = 'c'.repeat(64), fileDigest = 'd'.repeat(64)
const source = Object.freeze({ repository: 'github.com/example/source', revision, tree })
const projectionSource = Object.freeze({ ...source, snapshotDigest })
const context = { source, projectionSource }
const graph: GraphData = { type: 'Graph', metadata: { agentGraphProjection: { snapshotDigest } },
  nodes: [
    { id: 'file:a', label: 'A', type: 'Symbol', properties: { 'corpus:sourcePath': 'src/shared.ts' } },
    { id: 'file:b', label: 'B', type: 'Symbol', properties: {} },
  ], edges: [{ id: 'a-b', label: 'depends on', source: 'file:a', target: 'file:b', type: 'depends_on', properties: {
    'evidence:sourcePath': 'src/shared.ts', 'evidence:sourceDigest': fileDigest,
  } }] }
// Exercise the real trace reader: arbitrary component source fields are not retained by its contract.
const span = readRunTrace({ schema: 'agent-toolkit-run/v1', runId: 'provenance', spans: [{
  spanId: 'selected', component: { id: 'src/shared.ts', revision, digest: fileDigest },
}] }, 'provenance').spans[0]!

test('mission provenance joins an explicit repository revision/tree to the loaded graph and existing file digest', () => {
  assert.equal(joinAgentMissionProvenance(span, graph, context).status, 'matched')
  const impact = agentMissionSpanImpact(span, graph, context)
  assert.deepEqual(impact.nodeIds.sort(), ['file:a', 'file:b'])
  assert.deepEqual(impact.edgeIds, ['a-b'])
  assert.match(impact.reason, /Runtime execution is not inferred/)
})

test('identical component paths and bytes in another repository remain unobserved', () => {
  const impact = agentMissionSpanImpact(span, graph, { ...context,
    source: { ...source, repository: 'github.com/example/other' } })
  assert.deepEqual(impact.nodeIds, [])
  assert.equal(impact.provenance?.status, 'stale')
  assert.match(impact.reason, /repository/)
})

test('strict composition never falls back to digest-only matching with incomplete provenance', () => {
  for (const incomplete of [undefined, null, {}, { revision, tree }, { repository: source.repository },
    { ...source, revision: '' }, { ...source, repository: ' github.com/example/source' }]) {
    const impact = agentMissionSpanImpact(span, graph, { source: incomplete, projectionSource })
    assert.deepEqual(impact.nodeIds, [])
    assert.equal(impact.provenance?.status, 'missing')
  }
  assert.equal(joinAgentMissionProvenance(span, graph, { source, projectionSource: undefined }).status, 'missing')
})

test('every available revision, tree and snapshot must agree, even when another binding agrees', () => {
  for (const field of ['revision', 'tree', 'snapshotDigest'] as const) {
    const length = field === 'snapshotDigest' ? 64 : 40
    const impact = agentMissionSpanImpact(span, graph, {
      source: { ...source, snapshotDigest, [field]: 'e'.repeat(length) }, projectionSource,
    })
    assert.deepEqual(impact.nodeIds, [])
    assert.equal(impact.provenance?.status, 'stale')
  }
  assert.equal(joinAgentMissionProvenance(span, graph, {
    source, projectionSource: { repository: source.repository, revision, snapshotDigest },
  }).status, 'missing')
})

test('a stale envelope cannot substitute its snapshot for the graph actually loaded', () => {
  const impact = agentMissionSpanImpact(span, graph, { source,
    projectionSource: { ...projectionSource, snapshotDigest: 'f'.repeat(64) } })
  assert.deepEqual(impact.nodeIds, [])
  assert.equal(impact.provenance?.status, 'stale')
  assert.equal(joinAgentMissionProvenance(span, graph, { source, projectionSource: source }).status, 'missing')
})

test('a component revision must agree with its supplied source, including reused historical spans', () => {
  const historical = { ...span, status: 'reused', component: { ...span.component, revision: 'f'.repeat(40) } }
  assert.equal(joinAgentMissionProvenance(historical, graph, context).status, 'stale')
  const noRevision = { repository: source.repository, snapshotDigest }
  assert.equal(joinAgentMissionProvenance(span, graph, { source: noRevision, projectionSource: noRevision }).status, 'missing')
})

test('explicit snapshot-only sources can bind exact snapshot components without inventing a Git revision', () => {
  const snapshotSource = { repository: source.repository, snapshotDigest }
  const snapshotSpan = { ...span, component: { id: 'file:a', revision: '', digest: snapshotDigest } }
  assert.deepEqual(agentMissionSpanImpact(snapshotSpan, graph,
    { source: snapshotSource, projectionSource: snapshotSource }).nodeIds.sort(), ['file:a', 'file:b'])
})

test('matching source provenance does not replace existing component digest or identity checks', () => {
  for (const component of [{ ...span.component, digest: 'e'.repeat(64) },
    { ...span.component, id: 'src/unrecorded.ts' }, { ...span.component, digest: '' }]) {
    assert.deepEqual(agentMissionSpanImpact({ ...span, component }, graph, context).nodeIds, [])
  }
})

test('the existing single-snapshot call retains its recorded digest binding', () => {
  assert.deepEqual(agentMissionSpanImpact(span, graph).nodeIds.sort(), ['file:a', 'file:b'])
})
