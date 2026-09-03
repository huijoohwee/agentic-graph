import fs from 'node:fs'
import path from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { readWorkspaceInitializationDocsMirrorEntries } from '@/features/workspace-fs/workspaceSeedProvider'
import {
  readWorkspaceDocsMirrorRootPathSetting,
  writeWorkspaceDocsMirrorRootPathSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import {
  CARE_AGENT_DEMO_WORKSPACE_SEED_BASENAME,
  CARE_AGENT_RUN_READY_DEMO_ID,
  WORKSPACE_RUN_READY_DEMO_ENV,
  resolveWorkspaceRunReadyDemoSeed,
  resolveWorkspaceValidationSeedRelPath,
} from '@/features/workspace-fs/workspaceRunReadyDemos'

type PlainRecord = Record<string, unknown>

const GITHUB_ROOT = path.resolve(process.cwd(), '..', '..')
const CARE_AGENT_DOC_PATH = path.join(GITHUB_ROOT, 'huijoohwee', 'docs', 'agentic-graph-care-agent-demo.md')
const CARE_AGENT_DOCS_ROOT = path.dirname(CARE_AGENT_DOC_PATH)
const RUNTIME_READY_TEST_ID = 'docs.careAgentDemo.runtimeReady'
const RUN_READY_MODE_TEST_ID = 'docs.careAgentDemo.runReadyMode'

const isRecord = (value: unknown): value is PlainRecord => (
  value != null && typeof value === 'object' && !Array.isArray(value)
)

const asRecord = (value: unknown, label: string): PlainRecord => {
  if (!isRecord(value)) throw new Error(`expected ${label} to be an object`)
  return value
}

const asStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`expected ${label} to be a string array`)
  }
  return value as string[]
}

const unwrapFrontmatterCellValue = (value: unknown): unknown => {
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'value')) return value.value
  return value
}

const readStructuredValue = (record: PlainRecord, key: string): unknown =>
  unwrapFrontmatterCellValue(record[key])

const extractFrontmatterYaml = (markdownText: string): string => {
  if (!markdownText.startsWith('---\n')) throw new Error('expected care-agent demo to start with byte-zero YAML frontmatter')
  const endIndex = markdownText.indexOf('\n---\n', 4)
  if (endIndex < 0) throw new Error('expected care-agent demo to close YAML frontmatter before body Markdown')
  return markdownText.slice(4, endIndex)
}

const readCareAgentDoc = (): { markdownText: string; meta: PlainRecord } => {
  const markdownText = fs.readFileSync(CARE_AGENT_DOC_PATH, 'utf8')
  const parsed = parseYaml(extractFrontmatterYaml(markdownText))
  if (!isRecord(parsed)) throw new Error('expected care-agent demo frontmatter to parse as a YAML object')
  return { markdownText, meta: parsed }
}

const readDictionaryEntries = (fileName: string): string[] => {
  const source = fs.readFileSync(path.join(GITHUB_ROOT, 'agentic-canvas-os', 'docs', fileName), 'utf8')
  const parsed = parseYaml(extractFrontmatterYaml(source))
  return asStringArray(asRecord(parsed, `${fileName} frontmatter`).dictionary_entries, `${fileName}.dictionary_entries`)
}

const assertSubset = (label: string, actual: string[], allowed: readonly string[]): void => {
  const allowedSet = new Set(allowed)
  const missing = actual.filter(item => !allowedSet.has(item))
  if (missing.length) {
    throw new Error(`expected ${label} to reuse shared Agentic OS entries, missing=${missing.join(',')}`)
  }
}

const readFlowNode = (meta: PlainRecord, id: string): PlainRecord => {
  const flow = asRecord(meta.flow, 'flow')
  const nodes = flow.nodes
  if (!Array.isArray(nodes)) throw new Error('expected flow.nodes to be an array')
  const found = nodes.find(node => isRecord(node) && readStructuredValue(node, 'id') === id)
  return asRecord(found, `flow.nodes[${id}]`)
}

const assertZeroCostRecord = (record: PlainRecord, label: string): void => {
  for (const key of ['paid_call_count', 'prompt_tokens', 'completion_tokens', 'cache_hits', 'estimated_cost_usd']) {
    if (record[key] !== 0) throw new Error(`expected ${label}.${key} to be exact zero, got ${String(record[key])}`)
  }
}

const assertTrueFlags = (record: PlainRecord, label: string, flags: string[]): void => {
  for (const flag of flags) {
    if (record[flag] !== true) throw new Error(`expected ${label}.${flag}=true, got ${String(record[flag])}`)
  }
}

export function testCareAgentDemoIsRuntimeReadyFromLocalProof() {
  const { markdownText, meta } = readCareAgentDoc()

  if (meta.runtime_status !== 'runtime-ready') {
    throw new Error(`expected runtime_status runtime-ready, got ${String(meta.runtime_status)}`)
  }
  if (meta.deployed_api_claim !== 'false' || meta.publish_scope !== 'local-only') {
    throw new Error(`expected Dev-only publish state, got ${JSON.stringify({ deployed_api_claim: meta.deployed_api_claim, publish_scope: meta.publish_scope })}`)
  }

  const runtimeDefaults = asRecord(meta.runtime_defaults, 'runtime_defaults')
  if (runtimeDefaults.status !== 'runtime-ready') {
    throw new Error(`expected runtime_defaults.status runtime-ready, got ${String(runtimeDefaults.status)}`)
  }
  assertZeroCostRecord(runtimeDefaults, 'runtime_defaults')
  if (runtimeDefaults.provider_job_id !== '' || runtimeDefaults.live_result_url !== '') {
    throw new Error('expected live provider fields to stay blank until operator-approved returned evidence exists')
  }

  const runReadyDemo = asRecord(meta.run_ready_demo, 'run_ready_demo')
  if (
    runReadyDemo.id !== CARE_AGENT_RUN_READY_DEMO_ID
    || runReadyDemo.env_selector !== `${WORKSPACE_RUN_READY_DEMO_ENV}=care-agent`
    || runReadyDemo.validation_seed_path !== `/${CARE_AGENT_DEMO_WORKSPACE_SEED_BASENAME}`
    || runReadyDemo.clean_canvas_recommended !== true
    || runReadyDemo.source_backed !== true
  ) {
    throw new Error(`expected care-agent run-ready demo metadata to match the shared seed selector, got ${JSON.stringify(runReadyDemo)}`)
  }

  const probeTreeRuntime = asRecord(meta.probe_tree_runtime, 'probe_tree_runtime')
  if (probeTreeRuntime.status !== 'runtime-ready') {
    throw new Error(`expected probe_tree_runtime.status runtime-ready, got ${String(probeTreeRuntime.status)}`)
  }
  const probeTools = asRecord(probeTreeRuntime.tools, 'probe_tree_runtime.tools')
  const expectedProbeTools = {
    generate: 'agentic-graph.probe.generate',
    select: 'agentic-graph.probe.select',
    evolve: 'agentic-graph.probe.evolve',
  }
  for (const [key, value] of Object.entries(expectedProbeTools)) {
    if (probeTools[key] !== value) throw new Error(`expected probe_tree_runtime.tools.${key}=${value}`)
  }
  const probeAdapter = asRecord(probeTreeRuntime.local_model_adapter, 'probe_tree_runtime.local_model_adapter')
  for (const key of ['model_env', 'url_env', 'allow_remote_env', 'timeout_env']) {
    if (!String(probeAdapter[key] || '').startsWith('AGENTIC_OS_PROBE_TREE_MODEL')) {
      throw new Error(`expected probe_tree_runtime.local_model_adapter.${key} to use host-owned env config`)
    }
  }
  const probeProof = asRecord(probeTreeRuntime.proof, 'probe_tree_runtime.proof')
  if (probeProof.generate_mutates_graph !== false || probeProof.select_writes_type_probe_node !== true) {
    throw new Error(`expected probe-tree proof to preserve generate/select mutation contract, got ${JSON.stringify(probeProof)}`)
  }
  assertTrueFlags(probeProof, 'probe_tree_runtime.proof', [
    'explicit_zero_recall_verified',
    'select_frontmatter_flow_canvas_sync',
    'select_cost_log_verified',
    'evolve_writes_memory_exemplar',
    'evolve_reports_incomplete_parent_path',
    'evolve_cost_log_verified',
    'process_descriptors_non_idempotent',
    'semantic_frontmatter_keys_verified',
    'clean_room_generate_select_evolve_verified',
    'token_budget_ceiling_enforced',
  ])
  if (probeProof.native_checkpointer_datastore !== false || probeProof.paid_call_count !== 0) {
    throw new Error(`expected probe-tree proof to avoid second datastore and paid calls, got ${JSON.stringify(probeProof)}`)
  }

  const pipeline = asRecord(meta.agentic_os_care_agent_pipeline, 'agentic_os_care_agent_pipeline')
  if (pipeline.status !== 'runtime-ready') throw new Error(`expected pipeline status runtime-ready, got ${String(pipeline.status)}`)
  const routes = asRecord(pipeline.invocation_routes, 'agentic_os_care_agent_pipeline.invocation_routes')
  assertSubset('slash routes', asStringArray(routes.slash, 'slash routes'), readDictionaryEntries('DICTIONARY-COMMAND.md'))
  assertSubset('semantic routes', asStringArray(routes.semantic, 'semantic routes'), readDictionaryEntries('DICTIONARY-SEMANTIC.md'))
  assertSubset('binding routes', asStringArray(routes.binding, 'binding routes'), readDictionaryEntries('DICTIONARY-BINDING.md'))

  const harness = asRecord(meta.care_agent_harness, 'care_agent_harness')
  const bounds = asRecord(harness.bounds, 'care_agent_harness.bounds')
  if (bounds.max_iterations !== 1 || !String(bounds.circuit_breaker || '').includes('validation failure')) {
    throw new Error(`expected bounded one-pass local harness, got ${JSON.stringify(bounds)}`)
  }
  for (const expected of ['recall_top_k=0', 'cost_log', 'non-idempotent process tools']) {
    if (!markdownText.includes(expected)) throw new Error(`expected care-agent body to document Probe-Tree runtime-ready proof term ${expected}`)
  }

  const safetyPolicy = asRecord(meta.safety_policy, 'safety_policy')
  for (const expected of ['not diagnosis', 'Emergency', 'PHI']) {
    const values = Object.values(safetyPolicy).join('\n')
    if (!values.includes(expected)) throw new Error(`expected safety policy to include ${expected}`)
  }

  const parsed = tryParseMarkdownFrontmatterFlowGraph(path.basename(CARE_AGENT_DOC_PATH), markdownText)
  if (!parsed) throw new Error('expected care-agent demo to parse as frontmatter-flow')
  const graphData = parsed.graphData
  if (graphData.context !== 'frontmatter-flow') throw new Error(`expected frontmatter-flow context, got ${String(graphData.context || '')}`)
  const graphMeta = asRecord(graphData.metadata || {}, 'graph metadata')
  const flowSettings = asRecord(graphMeta.frontmatterFlowSettings, 'frontmatterFlowSettings')
  if (flowSettings.computed !== true || flowSettings.snapToGrid !== true) {
    throw new Error(`expected computed frontmatter flow settings, got ${JSON.stringify(flowSettings)}`)
  }
  const frontmatterMeta = asRecord(graphMeta.frontmatterMeta, 'frontmatterMeta')
  if (!frontmatterMeta.flow_diagrams) throw new Error('expected parsed graph metadata to preserve flow_diagrams')
  const graphNodeIds = new Set(graphData.nodes.map(node => String(node.id || '')))
  for (const id of ['care_source', 'care_normalize', 'care_tasks', 'care_probe', 'care_harness', 'care_canvas', 'care_validation']) {
    if (!graphNodeIds.has(id)) throw new Error(`expected parsed frontmatter-flow node ${id}`)
  }

  const canvasNode = readFlowNode(meta, 'care_canvas')
  const outputSrcDoc = String(readStructuredValue(canvasNode, 'outputSrcDoc') || '')
  for (const expected of ['<article', '<header', '<section', '<ol', '</article>']) {
    if (!outputSrcDoc.includes(expected)) throw new Error(`expected care_canvas outputSrcDoc to include semantic ${expected}`)
  }
  if (/<div\b/i.test(outputSrcDoc)) throw new Error('expected care_canvas outputSrcDoc to avoid generic div markup')

  const harnessNode = readFlowNode(meta, 'care_harness')
  const costLog = asRecord(readStructuredValue(harnessNode, 'costLog'), 'care_harness.costLog')
  for (const [key, value] of Object.entries({ prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0 })) {
    if (costLog[key] !== value) throw new Error(`expected care_harness.costLog.${key}=0, got ${String(costLog[key])}`)
  }

  const runtimeProof = asRecord(meta.runtime_proof, 'runtime_proof')
  if (runtimeProof.status !== 'runtime-ready') throw new Error(`expected runtime_proof.status runtime-ready, got ${String(runtimeProof.status)}`)
  assertTrueFlags(runtimeProof, 'runtime_proof', [
    'probe_tree_canvas_sync_verified',
    'probe_tree_token_budget_verified',
    'probe_tree_zero_recall_verified',
    'probe_tree_cost_logs_verified',
    'probe_tree_non_idempotent_descriptors_verified',
    'probe_tree_semantic_frontmatter_keys_verified',
    'probe_tree_clean_room_smoke_verified',
    'dictionary_routes_verified',
    'semantic_html_verified',
    'zero_cost_local_harness_verified',
    'safety_gates_verified',
    'live_provider_fields_blank',
  ])
  const checks = asStringArray(runtimeProof.focused_checks, 'runtime_proof.focused_checks')
  if (!checks.includes(RUNTIME_READY_TEST_ID)) {
    throw new Error(`expected runtime_proof.focused_checks to include ${RUNTIME_READY_TEST_ID}`)
  }
  if (!checks.includes(RUN_READY_MODE_TEST_ID)) {
    throw new Error(`expected runtime_proof.focused_checks to include ${RUN_READY_MODE_TEST_ID}`)
  }
  if (!checks.includes('mcp.probeTree.runtime')) {
    throw new Error('expected runtime_proof.focused_checks to include mcp.probeTree.runtime')
  }
  if (!checks.includes('probeTree.select.frontmatterFlowCanvasSync')) {
    throw new Error('expected runtime_proof.focused_checks to include probeTree.select.frontmatterFlowCanvasSync')
  }
  if (runtimeProof.prod_mirror_mutated !== false || runtimeProof.cloudflare_deploy_mutated !== false) {
    throw new Error(`expected runtime proof to preserve deploy boundary, got ${JSON.stringify(runtimeProof)}`)
  }
  if (/- \[ \]/.test(markdownText)) {
    throw new Error('expected care-agent runtime-ready acceptance checklist to be fully checked after focused proof is surfaced')
  }

  const forbidden = [
    /<div\b/i,
    /data:image/i,
    /BEGIN PRIVATE KEY/i,
    /VIDEODB_API_KEY|SENSENOVA_API_KEY/i,
    /airvio\.co\/agentic-graph\/r2/i,
    /deployed_api_claim:\s*true/i,
    /publish_scope:\s*"(?:prod|cloudflare|public)"/i,
    /live_result_url:\s*"https?:\/\//i,
    /provider_job_id:\s*"[A-Za-z0-9_-]+"/i,
  ]
  for (const pattern of forbidden) {
    if (pattern.test(markdownText)) throw new Error(`expected care-agent runtime-ready doc to avoid forbidden pattern ${pattern.source}`)
  }
}

export async function testCareAgentDemoRunReadyModeLoadsSourceBackedCleanCanvasSeed() {
  const demoSeed = resolveWorkspaceRunReadyDemoSeed(CARE_AGENT_RUN_READY_DEMO_ID)
  if (!demoSeed) throw new Error('expected care-agent run-ready demo seed to be registered')
  if (demoSeed.validationSeedRelPath !== CARE_AGENT_DEMO_WORKSPACE_SEED_BASENAME) {
    throw new Error(`expected care-agent validation seed basename, got ${demoSeed.validationSeedRelPath}`)
  }
  if (demoSeed.sourceRoot !== 'huijoohwee/docs' || demoSeed.cleanCanvasRecommended !== true) {
    throw new Error(`expected care-agent demo to remain source-backed and clean-canvas-ready, got ${JSON.stringify(demoSeed)}`)
  }

  const selectedByDemo = resolveWorkspaceValidationSeedRelPath({
    explicitRelPath: '',
    runReadyDemoId: CARE_AGENT_RUN_READY_DEMO_ID,
    defaultRelPath: 'docs/workspace-seeds/fallback.md',
  })
  if (selectedByDemo !== CARE_AGENT_DEMO_WORKSPACE_SEED_BASENAME) {
    throw new Error(`expected care-agent demo mode to select the care-agent seed, got ${selectedByDemo}`)
  }

  const selectedByExplicitOverride = resolveWorkspaceValidationSeedRelPath({
    explicitRelPath: 'docs/operator-owned.md',
    runReadyDemoId: CARE_AGENT_RUN_READY_DEMO_ID,
    defaultRelPath: 'docs/workspace-seeds/fallback.md',
  })
  if (selectedByExplicitOverride !== 'docs/operator-owned.md') {
    throw new Error(`expected explicit validation seed path to win over demo mode, got ${selectedByExplicitOverride}`)
  }
  const envBridgeText = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'config.env.ts'), 'utf8')
  if (!envBridgeText.includes(WORKSPACE_RUN_READY_DEMO_ENV)) {
    throw new Error(`expected browser env bridge to expose ${WORKSPACE_RUN_READY_DEMO_ENV}`)
  }

  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousDocsRootSetting = readWorkspaceDocsMirrorRootPathSetting()
  const previousFetch = globalThis.fetch
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = CARE_AGENT_DOCS_ROOT
  writeWorkspaceDocsMirrorRootPathSetting(CARE_AGENT_DOCS_ROOT)
  try {
    const sourceText = fs.readFileSync(CARE_AGENT_DOC_PATH, 'utf8')
    const proxyRequests: string[] = []
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as URL).toString())
      if (url !== '/__kg_fs_list') return new Response('', { status: 404 })
      const body = JSON.parse(String(init?.body || '{}')) as { path?: unknown }
      const requestedPath = String(body.path || '').trim()
      proxyRequests.push(requestedPath)
      if (requestedPath !== CARE_AGENT_DOCS_ROOT) {
        return new Response(JSON.stringify({ ok: true, files: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        ok: true,
        files: [{
          relPath: demoSeed.validationSeedRelPath,
          text: sourceText,
          updatedAtMs: 1710000000000,
        }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    const mirroredEntries = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const demoEntry = mirroredEntries.find(entry => entry.relPath === demoSeed.validationSeedRelPath) || null
    if (!demoEntry || demoEntry.text !== sourceText) {
      throw new Error(`expected care-agent demo mode to load the sibling docs source through the docs mirror proxy; docsRoot=${readWorkspaceDocsMirrorRootPathSetting()} requests=${JSON.stringify(proxyRequests)}`)
    }
    const parsed = tryParseMarkdownFrontmatterFlowGraph(demoSeed.validationSeedRelPath, demoEntry.text)
    if (!parsed) throw new Error('expected care-agent demo seed to parse as a clean-canvas frontmatter-flow document')
    const graphNodeIds = new Set(parsed.graphData.nodes.map(node => String(node.id || '')))
    for (const id of ['care_source', 'care_probe', 'care_canvas', 'care_validation']) {
      if (!graphNodeIds.has(id)) throw new Error(`expected run-ready demo seed graph to include ${id}`)
    }
  } finally {
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    writeWorkspaceDocsMirrorRootPathSetting(previousDocsRootSetting)
    if (typeof previousDocsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  }
}
