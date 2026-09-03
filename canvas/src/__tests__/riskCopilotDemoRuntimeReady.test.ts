import fs from 'node:fs'
import path from 'node:path'
import { load as parseYaml } from 'js-yaml'

import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { readWorkspaceInitializationDocsMirrorEntries } from '@/features/workspace-fs/workspaceSeedProvider'
import {
  RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME,
  RISK_COPILOT_RUN_READY_DEMO_ID,
  WORKSPACE_RUN_READY_DEMO_ENV,
  resolveWorkspaceRunReadyDemoSeed,
  resolveWorkspaceValidationSeedRelPath,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import {
  readWorkspaceDocsMirrorRootPathSetting,
  writeWorkspaceDocsMirrorRootPathSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'

type PlainRecord = Record<string, unknown>

const GITHUB_ROOT = path.resolve(process.cwd(), '..', '..')
const REPO_ROOT = path.resolve(process.cwd(), '..')
const DOC_PATH = path.join(GITHUB_ROOT, 'huijoohwee', 'docs', RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME)
const DOCS_ROOT = path.dirname(DOC_PATH)
const EVIDENCE_PATH = path.join(REPO_ROOT, 'sme-agent', 'demo', 'sme-care-agent-canvas-evidence.md')

const isRecord = (value: unknown): value is PlainRecord => value != null && typeof value === 'object' && !Array.isArray(value)

const readFrontmatter = (markdown: string): PlainRecord => {
  if (!markdown.startsWith('---\n')) throw new Error('expected byte-zero YAML frontmatter')
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) throw new Error('expected closing YAML frontmatter')
  const parsed = parseYaml(markdown.slice(4, end))
  if (!isRecord(parsed)) throw new Error('expected frontmatter object')
  return parsed
}

const asRecord = (value: unknown, label: string): PlainRecord => {
  if (!isRecord(value)) throw new Error(`expected ${label} object`)
  return value
}

export function testRiskCopilotDemoIsRuntimeReadyFromLocalProof() {
  const markdown = fs.readFileSync(DOC_PATH, 'utf8')
  const meta = readFrontmatter(markdown)
  if (meta.schema !== 'agentic-os-computing-flow/v1' || meta.demo_schema !== 'agentic-os-risk-copilot-demo/v1' || meta.runtime_status !== 'runtime-ready') {
    throw new Error(`unexpected risk-copilot contract ${JSON.stringify({ schema: meta.schema, demo_schema: meta.demo_schema, runtime_status: meta.runtime_status })}`)
  }
  if (meta.deployed_api_claim !== 'false' || meta.publish_scope !== 'local-only') throw new Error('expected local-only, non-deployed demo state')
  const runtimeDefaults = asRecord(meta.runtime_defaults, 'runtime_defaults')
  for (const key of ['paid_call_count', 'prompt_tokens', 'completion_tokens', 'cache_hits', 'estimated_cost_usd']) {
    if (runtimeDefaults[key] !== 0) throw new Error(`expected runtime_defaults.${key}=0`)
  }
  if (runtimeDefaults.runtime_proof_path !== '' || runtimeDefaults.provider_job_id !== '' || runtimeDefaults.live_result_url !== '') {
    throw new Error('expected live runtime fields to remain blank')
  }
  const runReadyDemo = asRecord(meta.run_ready_demo, 'run_ready_demo')
  if (
    runReadyDemo.id !== RISK_COPILOT_RUN_READY_DEMO_ID
    || runReadyDemo.source_root !== 'huijoohwee/docs'
    || runReadyDemo.source_path !== `../huijoohwee/docs/${RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME}`
    || runReadyDemo.validation_seed_path !== `/${RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME}`
  ) {
    throw new Error(`expected risk-copilot source identity to match the shared seed, got ${JSON.stringify(runReadyDemo)}`)
  }
  const probe = asRecord(meta.probe_tree_runtime, 'probe_tree_runtime')
  const thread = asRecord(probe.risk_copilot_thread, 'risk_copilot_thread')
  if (thread.option_count !== 3 || thread.token_budget !== 1200) throw new Error('expected bounded three-option, 1200-token probe contract')
  const proof = asRecord(probe.proof, 'probe_tree_runtime.proof')
  if (proof.generate_mutates_graph !== false || proof.native_checkpointer_datastore !== false || proof.paid_call_count !== 0) {
    throw new Error('expected probe generate to stay read-only, local, and zero-cost')
  }
  for (const route of ['First hire', 'First office/warehouse lease', 'First customer-data-handling tool', 'First cross-border vendor/logistics', 'First overseas market entry', 'Fundraise / key personnel dependency']) {
    if (!markdown.includes(`| ${route}`)) throw new Error(`expected declared Growth-Stage Trigger Map row ${route}`)
  }
  for (const boundary of ['never auto-sends without `@operator` approval', 'never a bindable transaction', 'Publish scope remains `local-only`']) {
    if (!markdown.includes(boundary)) throw new Error(`expected demo boundary ${boundary}`)
  }
  if (/- \[ \]/.test(markdown)) throw new Error('expected completed local acceptance checklist')

  const evidence = fs.readFileSync(EVIDENCE_PATH, 'utf8')
  const parsed = tryParseMarkdownFrontmatterFlowGraph(path.basename(EVIDENCE_PATH), evidence)
  if (!parsed || parsed.warnings.length) throw new Error(`expected shared Canvas evidence to parse cleanly: ${parsed?.warnings.join(' | ') || 'no parse'}`)
  const evidenceMeta = readFrontmatter(evidence)
  const flow = asRecord(evidenceMeta.flow, 'evidence.flow')
  const edges = Array.isArray(flow.edges) ? flow.edges.filter(isRecord) : []
  const coverageEdges = edges.filter(edge => isRecord(edge.data) && edge.data.visual_role === 'risk_coverage')
  if (coverageEdges.length !== 3 || coverageEdges.some(edge => !['#16a34a', '#d97706', '#dc2626'].includes(String((edge.data as PlainRecord).color || '')))) {
    throw new Error('expected one red, amber, or green coverage-state edge per REG exposure')
  }
}

export async function testRiskCopilotDemoRunReadyModeLoadsSourceBackedCleanCanvasSeed() {
  const seed = resolveWorkspaceRunReadyDemoSeed(RISK_COPILOT_RUN_READY_DEMO_ID)
  if (!seed || seed.validationSeedRelPath !== RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME || seed.sourceRoot !== 'huijoohwee/docs' || seed.cleanCanvasRecommended !== true) {
    throw new Error(`unexpected risk-copilot run-ready seed ${JSON.stringify(seed)}`)
  }
  if (resolveWorkspaceValidationSeedRelPath({ explicitRelPath: '', runReadyDemoId: RISK_COPILOT_RUN_READY_DEMO_ID, defaultRelPath: 'fallback.md' }) !== RISK_COPILOT_DEMO_WORKSPACE_SEED_BASENAME) {
    throw new Error('expected risk-copilot selector to own the validation seed')
  }
  if (!fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'config.env.ts'), 'utf8').includes(WORKSPACE_RUN_READY_DEMO_ENV)) {
    throw new Error(`expected browser env bridge to expose ${WORKSPACE_RUN_READY_DEMO_ENV}`)
  }

  const previousRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousSetting = readWorkspaceDocsMirrorRootPathSetting()
  const previousFetch = globalThis.fetch
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = DOCS_ROOT
  writeWorkspaceDocsMirrorRootPathSetting(DOCS_ROOT)
  try {
    const sourceText = fs.readFileSync(DOC_PATH, 'utf8')
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/__agentic_os_fs_list') return new Response('', { status: 404 })
      const body = JSON.parse(String(init?.body || '{}')) as { path?: unknown }
      const files = String(body.path || '') === DOCS_ROOT ? [{ relPath: seed.validationSeedRelPath, text: sourceText, updatedAtMs: 1710000000000 }] : []
      return new Response(JSON.stringify({ ok: true, files }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const entries = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const loaded = entries.find(entry => entry.relPath === seed.validationSeedRelPath)
    if (!loaded || loaded.text !== sourceText) throw new Error('expected run-ready mode to load the actual sibling SME risk-copilot source')
    readFrontmatter(loaded.text)
  } finally {
    if (previousFetch) (globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    writeWorkspaceDocsMirrorRootPathSetting(previousSetting)
    if (typeof previousRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  }
}
