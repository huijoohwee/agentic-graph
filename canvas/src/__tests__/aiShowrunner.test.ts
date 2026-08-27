import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildCanonicalWidgetRegistryDraft,
  getWidgetRegistryEntryLabel,
} from '@/features/storyboard-widget-manager/registryTemplates'
import {
  CreativeStateStore,
  ShowrunnerMessageBus,
  ShowrunnerTokenAttribution,
  buildNarrationManifest,
  createInMemoryShowrunnerSourceFileStore,
  createShowrunnerOrchestrator,
  deriveShowrunnerContentHash,
  showrunnerBriefParser,
  showrunnerScriptSchema,
} from '@/features/ai-showrunner'
import {
  FLOW_SHOWRUNNER_NODE_TYPE_ID,
  runShowrunnerWidgetProperties,
} from '@/features/ai-showrunner/showrunnerFlowNode'
import { buildAgenticGraphVdeoxplnRegistry } from '@/features/agent-ready/agenticgraphVdeoxplnContract.mjs'

const buildBrief = () => ({
  schema: 'agenticgraph-showrunner-brief/v1' as const,
  run_type: 'podcast' as const,
  title: 'Dry Run Podcast',
  run_id: 'dry-run-podcast',
  token_budget: 1200,
  max_retries: 2,
  max_memory_tokens: 300,
  agent_pipeline: ['researcher', 'scriptwriter', 'director', 'narrator_router'],
  agent_roles: [
    { role: 'researcher' },
    { role: 'scriptwriter' },
    { role: 'director' },
    { role: 'narrator_router' },
  ],
  narrator_voice_map: [{ speaker: 'host', voice_endpoint_env_key: 'SHOWRUNNER_HOST_VOICE_URL' }],
  acceptance_criteria: ['complete manifest'],
  dry_run: true,
})

export function testAiShowrunnerBriefAndScriptRoundTrip() {
  for (let i = 0; i < 12; i += 1) {
    const brief = { ...buildBrief(), title: `Round Trip ${i}`, run_id: `round-trip-${i}` }
    const printed = showrunnerBriefParser.print(brief)
    const parsed = showrunnerBriefParser.parse(printed)
    if (parsed.ok === false) throw new Error(`expected valid brief: ${JSON.stringify(parsed.errors)}`)
    if (parsed.spec.title !== brief.title || parsed.spec.agent_pipeline.join(',') !== brief.agent_pipeline.join(',')) {
      throw new Error('expected brief parse-print-parse equivalence')
    }
  }

  const script = {
    schema: 'agenticgraph-script/v1' as const,
    title: 'Episode Script',
    run_id: 'script-run',
    segments: [
      { speaker: 'host', text: 'Intro', stage_direction: 'warm', duration_estimate_s: 10 },
      { speaker: 'guest', text: 'Reply' },
    ],
  }
  const parsedScript = showrunnerScriptSchema.parse(showrunnerScriptSchema.print(script))
  if (parsedScript.ok === false) throw new Error(`expected valid script: ${JSON.stringify(parsedScript.errors)}`)
  if (parsedScript.script.segments.length !== 2 || parsedScript.script.segments[0].speaker !== 'host') {
    throw new Error('expected script round-trip to preserve segments')
  }
}

export async function testAiShowrunnerStateBusAndTokenContracts() {
  const store = createInMemoryShowrunnerSourceFileStore()
  const stateStore = new CreativeStateStore(store)
  const first = await stateStore.append({
    run_id: 'state-run',
    agent_role: 'researcher',
    turn_index: 0,
    content_hash: 'hash-a',
    entry_type: 'research_pack',
    content: 'alpha beta gamma',
    timestamp_iso: '2026-06-19T00:00:00.000Z',
  })
  if (!first.ok) throw new Error('expected first append to succeed')
  const duplicate = await stateStore.append({
    run_id: 'state-run',
    agent_role: 'researcher',
    turn_index: 1,
    content_hash: 'hash-a',
    entry_type: 'research_pack',
    content: 'alpha beta gamma',
    timestamp_iso: '2026-06-19T00:00:00.000Z',
  })
  if (duplicate.ok || duplicate.error.code !== 'DUPLICATE_CONTENT_HASH') throw new Error('expected duplicate hash rejection')
  const emptyContext = await stateStore.readContext('state-run', 0)
  if (emptyContext.entries.length !== 0 || emptyContext.estimatedTokens !== 0 || emptyContext.error?.code !== 'INVALID_TOKEN_BUDGET') {
    throw new Error('expected invalid token budget to return structured empty context')
  }

  const bus = new ShowrunnerMessageBus(stateStore)
  bus.registerBrief(buildBrief())
  const badPublish = await bus.publish({
    run_id: 'dry-run-podcast',
    source_role: 'critic',
    target_role: 'missing',
    message_type: 'critique',
    payload: 'tighten',
    turn_index: 1,
    delivered: false,
    timestamp_iso: '2026-06-19T00:00:00.000Z',
  })
  if (badPublish.ok === true) throw new Error('expected unregistered role error')
  if (badPublish.error.code !== 'UNREGISTERED_ROLE') throw new Error('expected unregistered role error')

  const token = new ShowrunnerTokenAttribution(store)
  token.registerBudget('budget-run', 20)
  if (!(await token.checkBudget('budget-run', 10))) throw new Error('expected budget to allow initial turn')
  await token.record({
    run_id: 'budget-run',
    agent_role: 'researcher',
    model_id: 'runtime-resolved',
    input_tokens: 11,
    output_tokens: 8,
    turn_index: 0,
    stage_id: 'researcher',
    estimated: true,
    timestamp_iso: '2026-06-19T00:00:00.000Z',
  })
  if (await token.checkBudget('budget-run', 2)) throw new Error('expected budget guard before overflow')
}

export async function testAiShowrunnerDryRunProducesArtifactStructure() {
  const orchestrator = createShowrunnerOrchestrator()
  const result = await orchestrator.startRun(showrunnerBriefParser.print(buildBrief()))
  const status = await orchestrator.runStatus(result.runId)
  if (status.status !== 'complete') throw new Error(`expected complete dry-run, got ${status.status}`)
  if (status.paid_call_count !== 0) throw new Error('expected dry-run paid_call_count to remain zero')
  for (const suffix of ['state.json', 'cost-log.jsonl', 'narration-manifest.md', 'manifest.md']) {
    if (!status.source_file_paths.some(filePath => filePath.endsWith(suffix))) {
      throw new Error(`expected dry-run artifact ${suffix}`)
    }
  }
}

export function testAiShowrunnerPodcastVoiceMapCoverage() {
  const manifest = buildNarrationManifest({
    schema: 'agenticgraph-script/v1',
    title: 'Voice Map',
    run_id: 'voice-map',
    segments: [
      { speaker: 'host', text: 'Hello' },
      { speaker: 'guest', text: 'World' },
    ],
  }, [{ speaker: 'host', voice_endpoint_env_key: 'SHOWRUNNER_HOST_VOICE_URL' }])
  if (manifest.segments.filter(segment => segment.status === 'resolved').length !== 1) {
    throw new Error('expected one resolved narrator segment')
  }
  if (manifest.gap_reports.length !== 1 || manifest.gap_reports[0].code !== 'VOICE_MAP_GAP') {
    throw new Error('expected gap report for missing speaker without failing manifest')
  }
}

export async function testAiShowrunnerFlowAndRegistryIntegration() {
  const label = getWidgetRegistryEntryLabel({ nodeTypeId: FLOW_SHOWRUNNER_NODE_TYPE_ID })
  if (label !== 'AI Showrunner') throw new Error(`expected showrunner label, got ${label}`)
  const draft = buildCanonicalWidgetRegistryDraft({ nodeTypeId: FLOW_SHOWRUNNER_NODE_TYPE_ID })
  if (!draft || draft.nodeTypeId !== FLOW_SHOWRUNNER_NODE_TYPE_ID) throw new Error('expected canonical showrunner widget draft')
  const output = await runShowrunnerWidgetProperties({ brief_markdown: showrunnerBriefParser.print(buildBrief()) })
  if (output.run_status !== 'complete') throw new Error('expected showrunner widget dry-run completion')

  const registry = buildAgenticGraphVdeoxplnRegistry()
  const entry = registry.find(item => item.id === 'agenticgraph-ai-showrunner')
  if (!entry) throw new Error('expected vdeoxpln showrunner entry')
  if (!entry.tools.local.includes('agenticgraph.showrunner.start_run')) throw new Error('expected showrunner MCP tool in vdeoxpln entry')
}

export function testAiShowrunnerSourceContractsAvoidProviderHardcodes() {
  const root = resolve(process.cwd(), 'src', 'features', 'ai-showrunner')
  const files = [
    'showrunnerTypes.ts',
    'briefParser.ts',
    'showrunnerOrchestrator.ts',
    'podcastPipeline.ts',
    'showrunnerDryRun.ts',
  ]
  for (const file of files) {
    const text = readFileSync(resolve(root, file), 'utf8')
    for (const forbidden of ['https://api.', 'OPENAI_API_KEY', 'VOICE_ID=', 'elevenlabs']) {
      if (text.includes(forbidden)) throw new Error(`expected ${file} to avoid provider hardcode ${forbidden}`)
    }
  }
  if (!deriveShowrunnerContentHash('same')) throw new Error('expected shared showrunner hash helper')
}
