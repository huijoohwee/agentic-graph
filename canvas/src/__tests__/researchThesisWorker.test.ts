import researchWorkerModule from '../../../cloudflare/workers/agentic-graph-research/index.ts'

const worker = (
  typeof (researchWorkerModule as { fetch?: unknown }).fetch === 'function'
    ? researchWorkerModule
    : (researchWorkerModule as unknown as { default: typeof researchWorkerModule }).default
) as typeof researchWorkerModule

const processResearchThesisQueueMessage = (
  worker as typeof worker & {
    processResearchThesisQueueMessage: (body: unknown, env: unknown) => Promise<'processed' | 'ignored'>
  }
).processResearchThesisQueueMessage

const createEnv = () => ({
  RESEARCH_DEV_RUNS: new Map(),
  RESEARCH_THESIS_ARTIFACTS: {
    artifacts: new Map<string, string>(),
    async put(key: string, value: string) {
      this.artifacts.set(key, value)
    },
  },
  RESEARCH_THESIS_CACHE: {
    cache: new Map<string, string>(),
    async get(key: string) {
      return this.cache.get(key) || null
    },
    async put(key: string, value: string) {
      this.cache.set(key, value)
    },
  },
})

export async function testResearchThesisWorkerCompileStatusCandidatesAndCommit() {
  const env = createEnv()
  const compileResponse = await worker.fetch(
    new Request('https://airvio.co/api/research/thesis-compile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        thesisPrompt: 'Evaluate whether the selected operating thesis is investable.',
        sources: [{
          canonicalPath: '/workspace/research/source-a.md',
          text: 'Source evidence shows revenue growth while cost pressure remains visible.',
        }],
      }),
    }),
    env as never,
  )
  if (!compileResponse.ok) throw new Error(`expected compile route to pass, got ${compileResponse.status}`)
  const compileJson = await compileResponse.json() as { run_id?: string; status?: string }
  if (!compileJson.run_id || compileJson.status !== 'ready') throw new Error(`expected sync dev compile to be ready, got ${JSON.stringify(compileJson)}`)

  const statusResponse = await worker.fetch(
    new Request(`https://airvio.co/api/research/runs/${compileJson.run_id}`),
    env as never,
  )
  const statusJson = await statusResponse.json() as {
    status?: string
    spec?: { schema_version?: string }
    source_summaries?: unknown[]
    evidence_ledger?: unknown[]
    cost_log?: { cache_hits?: number; source_hash_reuse?: boolean }
    artifact_pointers?: Array<{ kind?: string; key?: string; storage?: string }>
  }
  if (statusJson.status !== 'ready' || statusJson.spec?.schema_version !== 'research-thesis-spec/v1') {
    throw new Error(`expected ready run status with thesis spec, got ${JSON.stringify(statusJson)}`)
  }
  if (!Array.isArray(statusJson.source_summaries) || statusJson.source_summaries.length !== 1) {
    throw new Error(`expected persisted source summaries, got ${JSON.stringify(statusJson.source_summaries)}`)
  }
  if (!Array.isArray(statusJson.evidence_ledger) || statusJson.evidence_ledger.length < 1) {
    throw new Error(`expected persisted evidence ledger rows, got ${JSON.stringify(statusJson.evidence_ledger)}`)
  }
  if (!statusJson.cost_log || statusJson.cost_log.cache_hits !== 0) {
    throw new Error(`expected persisted first-run cost log, got ${JSON.stringify(statusJson.cost_log)}`)
  }
  const artifactKinds = new Set((statusJson.artifact_pointers || []).map(pointer => `${pointer.kind}:${pointer.storage}`))
  for (const required of ['manifest:r2', 'source_summaries:r2', 'thesis_spec:r2', 'evidence_ledger:r2', 'candidate_delta:r2', 'cost_log:r2']) {
    if (!artifactKinds.has(required)) throw new Error(`expected artifact pointer ${required}, got ${JSON.stringify(statusJson.artifact_pointers)}`)
  }

  const candidatesResponse = await worker.fetch(
    new Request(`https://airvio.co/api/research/runs/${compileJson.run_id}/candidates`),
    env as never,
  )
  const candidatesJson = await candidatesResponse.json() as { candidate_delta?: { graph?: { nodes?: Array<{ id?: string }> } } }
  const acceptedCandidateId = candidatesJson.candidate_delta?.graph?.nodes?.[0]?.id
  if (!acceptedCandidateId) throw new Error('expected candidate graph delta nodes')

  const commitResponse = await worker.fetch(
    new Request(`https://airvio.co/api/research/runs/${compileJson.run_id}/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acceptedCandidateIds: [acceptedCandidateId], rejectedCandidateIds: [] }),
    }),
    env as never,
  )
  const commitJson = await commitResponse.json() as { audit?: { active_graph_mutated?: boolean; accepted_delta?: { nodes?: unknown[] } } }
  if (commitJson.audit?.active_graph_mutated !== false || commitJson.audit?.accepted_delta?.nodes?.length !== 1) {
    throw new Error(`expected commit route to write staged audit only, got ${JSON.stringify(commitJson)}`)
  }

  const cachedCompileResponse = await worker.fetch(
    new Request('https://airvio.co/api/research/thesis-compile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        thesisPrompt: 'Evaluate whether the selected operating thesis is investable.',
        sources: [{
          canonicalPath: '/workspace/research/source-a.md',
          text: 'Source evidence shows revenue growth while cost pressure remains visible.',
        }],
      }),
    }),
    env as never,
  )
  const cachedCompileJson = await cachedCompileResponse.json() as { run_id?: string }
  const cachedStatusResponse = await worker.fetch(
    new Request(`https://airvio.co/api/research/runs/${cachedCompileJson.run_id}`),
    env as never,
  )
  const cachedStatusJson = await cachedStatusResponse.json() as { cost_log?: { cache_hits?: number; source_hash_reuse?: boolean } }
  if (cachedStatusJson.cost_log?.cache_hits !== 1 || cachedStatusJson.cost_log.source_hash_reuse !== true) {
    throw new Error(`expected Worker compile to reuse KV source-hash summary cache, got ${JSON.stringify(cachedStatusJson.cost_log)}`)
  }
}

export async function testResearchThesisWorkerQueueProcessesCompileMessage() {
  const env = createEnv()
  const processed = await processResearchThesisQueueMessage({
    type: 'research.thesis.compile.requested',
    request: {
      thesisPrompt: 'Evaluate whether queued research can become a reviewable thesis.',
      sources: [{
        canonicalPath: '/workspace/research/queued.md',
        text: 'Queued source says the catalyst depends on operating evidence.',
      }],
    },
  }, env as never)
  if (processed !== 'processed') throw new Error(`expected queue message to process, got ${processed}`)
  if (env.RESEARCH_DEV_RUNS.size !== 1) throw new Error('expected queue processing to write one run row')
}
