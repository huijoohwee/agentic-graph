#!/usr/bin/env node

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { load } from 'js-yaml'

import { hasFlag, readArgValue, readWranglerVarsFromToml } from './stripe-payment-script-runtime.mjs'
import { XRPL_X402_CONFIG_KEYS, validateXrplX402Config } from './configure-xrpl-x402-paid-resource.mjs'

const EXPECTED_BASE_SHA = 'c8ae522f37668ebb49b3a6c86e2d571c81729b6f'
const EXPECTED_INPUT_SHA = '9eac94e56d7d0e289a9a088f76d9f394788e4a433703b30ced6253c52416c338'
const EXPECTED_PATH = '/api/payments/commerce/x402/xrpl/travel-requote'
const EXPECTED_RESOURCE_ID = 'agentic-commerce.travel-requote/v1'
const EXPECTED_CONTRACT = 'agentic-commerce.paid-resource/v1'
const SOURCE_CHECK_PAYEE = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY'
const DOC_PATH = 'docs/documents/agentic-graph-xrpl-x402-paid-resource-prd-tad-adr.md'
const CONFIG_PATH = 'cloudflare/workers/agentic-graph-payment/wrangler.toml'
const MIGRATION_PATH = 'cloudflare/d1/migrations/0018_agentic_commerce_paid_resources.sql'
const SSOT_PATH = 'grph-shared/src/payments/agenticCommercePaidResourceSsot.ts'
const XRPL_ADDRESS_PATH = 'grph-shared/src/payments/xrplClassicAddress.ts'
const WORKER_PATHS = Object.freeze([
  'cloudflare/workers/agentic-graph-payment/agenticCommerceX402Xrpl.ts',
  'cloudflare/workers/agentic-graph-payment/agenticCommercePaidResourceAdmission.ts',
  'cloudflare/workers/agentic-graph-payment/agenticCommercePaidResourcePersistence.ts',
  'cloudflare/workers/agentic-graph-payment/agenticCommercePaidResourceRejection.ts',
  'cloudflare/workers/agentic-graph-payment/agenticCommercePaidResourceRecord.ts',
  'cloudflare/workers/agentic-graph-payment/agenticCommercePaidResourceResponse.ts',
  'cloudflare/workers/agentic-graph-payment/agenticCommercePaidResourceSettlement.ts',
  'cloudflare/workers/agentic-graph-payment/agenticCommercePaidResource.ts',
  'cloudflare/workers/agentic-graph-payment/index.ts',
])
const REQUIRED_PATHS = Object.freeze([
  DOC_PATH,
  CONFIG_PATH,
  MIGRATION_PATH,
  SSOT_PATH,
  XRPL_ADDRESS_PATH,
  ...WORKER_PATHS,
  'cloudflare/workers/agentic-graph-travel-discovery/discovery-contract.mjs',
  'cloudflare/workers/agentic-graph-travel-discovery/wrangler.toml',
  'cloudflare/pages/agentic-graph-agent-ready-commerce.mjs',
  'cloudflare/pages/agentic-graph-agent-ready.mjs',
  'cloudflare/workers/agentic-graph-payment/tsconfig.xrpl-x402.json',
  'cloudflare/workers/agentic-graph-payment/vitest.net-settlement.config.mts',
  'cloudflare/workers/agentic-graph-payment/vitest.strytree-ledger.config.mts',
  'cloudflare/workers/agentic-graph-payment/__tests__/agentic-commerce-x402-xrpl-admission.test.ts',
  'cloudflare/workers/agentic-graph-payment/__tests__/agentic-commerce-x402-xrpl-adversarial.test.ts',
  'cloudflare/workers/agentic-graph-payment/__tests__/agentic-commerce-x402-xrpl-contract.test.ts',
  'cloudflare/workers/agentic-graph-payment/__tests__/agentic-commerce-x402-xrpl-persistence.test.ts',
  'cloudflare/workers/agentic-graph-payment/__tests__/agentic-commerce-x402-xrpl-route.test.ts',
  'cloudflare/workers/agentic-graph-payment/__tests__/agenticCommerceXrplRouteTestSupport.ts',
  'scripts/configure-xrpl-x402-paid-resource.mjs',
  'scripts/check-xrpl-x402-paid-resource.mjs',
  'scripts/check-xrpl-x402-pages-candidate.mjs',
  'scripts/smoke-xrpl-x402-paid-resource.mjs',
  'scripts/__tests__/xrpl-x402-paid-resource-address.test.mjs',
  'scripts/__tests__/xrpl-x402-paid-resource-discovery.test.mjs',
  'scripts/__tests__/xrpl-x402-paid-resource-pages.test.mjs',
  'scripts/pages-mirror-agent-ready.mjs',
  'package.json',
  'package-lock.json',
])
const STATES = Object.freeze([
  'challenged',
  'verifying',
  'executing',
  'settling',
  'settlement_unknown',
  'fulfilled',
  'expired',
])
const LINE_LIMIT = 599
const LINE_LIMIT_EXEMPT_PATHS = new Set([
  'cloudflare/pages/agentic-graph-agent-ready.mjs',
])

const parseFrontmatter = (source, label) => {
  const match = source.replace(/^\uFEFF/u, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)
  if (!match) throw new Error(`${label} must start with YAML frontmatter`)
  const parsed = load(match[1])
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} frontmatter must be a mapping`)
  }
  return parsed
}

const containsAll = (source, markers) => markers.filter((marker) => !source.includes(marker))
const read = (root, relativePath) => readFileSync(path.join(root, relativePath), 'utf8')

const inspectPackagePins = (root) => {
  const manifest = JSON.parse(read(root, 'package.json'))
  const lock = JSON.parse(read(root, 'package-lock.json'))
  const failures = []
  for (const [name, version] of Object.entries({
    'ripple-address-codec': '5.0.1',
    'x402-xrpl': '0.3.2',
    xrpl: '4.5.0',
  })) {
    if (manifest.dependencies?.[name] !== version && manifest.devDependencies?.[name] !== version) {
      failures.push(`${name} must be declared at exact version ${version}`)
    }
    if (lock.packages?.[`node_modules/${name}`]?.version !== version) {
      failures.push(`${name} lock entry must resolve version ${version}`)
    }
  }
  const expectedScripts = {
    'payment:x402:xrpl:configure': 'node ./scripts/configure-xrpl-x402-paid-resource.mjs',
    'payment:x402:xrpl:typecheck': 'tsc --project cloudflare/workers/agentic-graph-payment/tsconfig.xrpl-x402.json --pretty false',
    'payment:x402:xrpl:test': 'npm -C grph-shared run build && npm run payment:x402:xrpl:typecheck && node --test ./scripts/__tests__/xrpl-x402-paid-resource-*.test.mjs cloudflare/workers/agentic-graph-travel-discovery/__tests__/worker.test.mjs && node --import tsx --test --test-concurrency=1 cloudflare/workers/agentic-graph-payment/__tests__/*.test.ts && vitest run --config cloudflare/workers/agentic-graph-payment/vitest.net-settlement.config.mts && npm run travel-commerce:strytree-ledger:test',
    'payment:x402:xrpl:source-check': 'npm run payment:x402:xrpl:test && node ./scripts/check-xrpl-x402-pages-candidate.mjs && node ./scripts/check-xrpl-x402-paid-resource.mjs --source-template',
    'payment:x402:xrpl:check': 'npm run payment:x402:xrpl:test && node ./scripts/check-xrpl-x402-paid-resource.mjs',
    'payment:x402:xrpl:smoke': 'node ./scripts/smoke-xrpl-x402-paid-resource.mjs',
  }
  for (const [name, command] of Object.entries(expectedScripts)) {
    if (manifest.scripts?.[name] !== command) failures.push(`${name} must equal ${command}`)
  }
  return failures
}

const workerImportFailures = (root) => {
  const failures = []
  const importPattern = /(?:from\s*|import\s*\()\s*['"](x402-xrpl(?:\/[^'"]*)?|xrpl|jose)['"]/gu
  for (const relativePath of [...WORKER_PATHS, SSOT_PATH]) {
    const source = read(root, relativePath)
    for (const match of source.matchAll(importPattern)) {
      failures.push(`${relativePath} imports forbidden Worker dependency ${match[1]}`)
    }
  }
  return failures
}

const visibleConfigFailures = (source) => {
  const vars = readWranglerVarsFromToml(source)
  const failures = []
  for (const name of vars.keys()) {
    if (/(?:SEED|PRIVATE_KEY|MNEMONIC)/i.test(name)) {
      failures.push(`${name} must not be a visible Worker variable`)
    }
  }
  const values = new Map()
  for (const key of Object.values(XRPL_X402_CONFIG_KEYS)) {
    if (vars.has(key)) values.set(key, vars.get(key))
  }
  failures.push(...validateXrplX402Config(values))
  return failures
}

const sourceCheckConfig = (source) => {
  const marker = 'XRPL_X402_PAY_TO_ADDRESS = ""'
  if (!source.includes(marker)) throw new Error('source template must keep the operator payee blank')
  return source.replace(marker, `XRPL_X402_PAY_TO_ADDRESS = "${SOURCE_CHECK_PAYEE}"`)
}

const runWorkerDryRun = (root, configPath, source) => {
  const executable = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler')
  if (!existsSync(executable)) return { ok: false, detail: 'Local Wrangler executable is unavailable.' }
  const outputDirectory = mkdtempSync(path.join(tmpdir(), 'agentic-graph-xrpl-x402-'))
  const sourcePath = source
    ? path.join(path.dirname(path.resolve(root, configPath)), `.wrangler.xrpl-source-check-${process.pid}.toml`)
    : null
  try {
    if (sourcePath) writeFileSync(sourcePath, source, { encoding: 'utf8', flag: 'wx' })
    const result = spawnSync(executable, [
      'deploy',
      '--config',
      sourcePath ?? configPath,
      '--env=',
      '--dry-run',
      '--outdir',
      outputDirectory,
    ], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    })
    if (result.error || result.status !== 0) {
      const detail = String(result.error?.message || result.stderr || result.stdout || `Wrangler exited ${result.status}`).trim()
      return { ok: false, detail: detail.slice(0, 2000) }
    }
    return { ok: true, detail: 'Local Wrangler Worker dry-run completed without deployment.' }
  } finally {
    if (sourcePath) rmSync(sourcePath, { force: true })
    rmSync(outputDirectory, { force: true, recursive: true })
  }
}

export const inspectXrplX402PaidResource = ({
  root = process.cwd(),
  skipDryRun = false,
  configPath = CONFIG_PATH,
  sourceTemplate = false,
} = {}) => {
  const checks = []
  const add = (name, failures, passDetail) => checks.push({
    name,
    status: failures.length > 0 ? 'fail' : 'pass',
    detail: failures.length > 0 ? failures.join('; ') : passDetail,
  })

  const missing = REQUIRED_PATHS.filter((relativePath) => !existsSync(path.join(root, relativePath)))
  add('required-source-files', missing, `All ${REQUIRED_PATHS.length} required source files exist.`)
  if (missing.length > 0) return { ok: false, checks }

  const lineFailures = REQUIRED_PATHS
    .filter((relativePath) => /\.(?:md|mjs|ts)$/u.test(relativePath))
    .filter((relativePath) => !LINE_LIMIT_EXEMPT_PATHS.has(relativePath))
    .map((relativePath) => ({
      relativePath,
      lines: read(root, relativePath).replace(/\r?\n$/u, '').split(/\r?\n/u).length,
    }))
    .filter(({ lines }) => lines > LINE_LIMIT)
    .map(({ relativePath, lines }) => `${relativePath} has ${lines} lines; limit is ${LINE_LIMIT}`)
  add('source-line-budgets', lineFailures, `Every increment-owned text source is at most ${LINE_LIMIT} lines.`)

  let frontmatter
  const frontmatterFailures = []
  try {
    frontmatter = parseFrontmatter(read(root, DOC_PATH), DOC_PATH)
    const expected = {
      doc_type: 'Combined PRD/TAD/ADR',
      frontmatter_contract: 'required',
      delivered_rung: 'undocumented',
      lane: 'authoring',
      universal_scope: false,
      runtime_readiness_policy: 'fail-closed',
      deploy_boundary: 'closed',
      input_sha256: EXPECTED_INPUT_SHA,
      codebase_revision: EXPECTED_BASE_SHA,
      continuity_id: 'PRD-TAD-ADR-TOLLGATE-X402-XRPL',
    }
    for (const [key, value] of Object.entries(expected)) {
      if (frontmatter[key] !== value) frontmatterFailures.push(`${key} must equal ${JSON.stringify(value)}`)
    }
    for (const key of ['title', 'id', 'version', 'date', 'lang', 'owner', 'worktree_id', 'agent_id', 'continuity_revision']) {
      if (typeof frontmatter[key] !== 'string' || !frontmatter[key]) frontmatterFailures.push(`${key} must be a nonempty string`)
    }
    if (frontmatter.local_rung !== 'dev-proven') frontmatterFailures.push('local_rung must equal evidence-derived dev-proven')
    if (frontmatter.lifecycle_status !== 'dev-proven') frontmatterFailures.push('lifecycle_status must equal dev-proven')
    for (const owner of ['agentic_os', 'ai_agent', 'mcp_gateway']) {
      if (frontmatter.agent_platform_readiness?.[owner]?.local_rung !== 'dev-proven') {
        frontmatterFailures.push(`agent_platform_readiness.${owner}.local_rung must equal dev-proven`)
      }
    }
  } catch (error) {
    frontmatterFailures.push(error.message)
  }
  add('document-frontmatter', frontmatterFailures, 'Document identity, provenance, readiness, and deploy boundary are valid.')

  const doc = read(root, DOC_PATH)
  const docMarkers = [
    '## Shared CID, RAO, and SVO',
    '## Codebase Grounding Record',
    '## PRD',
    '## TAD',
    '## Constraints, Outranking, and Argumentation',
    '## ADR',
    'VCC-TOLL-01',
    'VCC-TOLL-06',
    'VCC-TOLL-07',
    '## Economics, WTP, and First Dollar',
    '## Delivery Boundary and Live Blockers',
    EXPECTED_PATH,
    EXPECTED_RESOURCE_ID,
  ]
  add('document-contract', containsAll(doc, docMarkers).map((marker) => `missing ${marker}`), 'Combined document carries grounding, shared directives, decisions, VCCs, economics, and blockers.')

  const ssot = read(root, SSOT_PATH)
  const ssotMarkers = [
    'AGENTIC_COMMERCE_PAID_RESOURCE_CONTRACT',
    EXPECTED_CONTRACT,
    'AGENTIC_COMMERCE_PAID_RESOURCE_ID',
    EXPECTED_RESOURCE_ID,
    'AGENTIC_COMMERCE_PAID_RESOURCE_PATH',
    EXPECTED_PATH,
    'agent-flight',
    'readAgenticCommercePaidResourceConfiguration',
    'buildAgenticCommercePaidResourceTransportDigest',
    ...STATES,
    ...Object.values(XRPL_X402_CONFIG_KEYS),
  ]
  const ssotFailures = containsAll(ssot, ssotMarkers).map((marker) => `missing ${marker}`)
  if (!/maxTimeoutSeconds\s*>\s*300/u.test(ssot)) {
    ssotFailures.push('shared maximum payment timeout must be 300 seconds')
  }
  add('shared-contract', ssotFailures, 'Shared paid-resource contract owns route, identity, states, and visible configuration.')

  const workerSource = WORKER_PATHS.map((relativePath) => read(root, relativePath)).join('\n')
  const workerMarkers = [
    'AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES.paymentRequired',
    'AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES.paymentSignature',
    'AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES.paymentResponse',
    'AGENTIC_COMMERCE_PAID_RESOURCE_PATH',
    'isAgenticCommercePaidResourceRoute',
    'handleAgenticCommercePaidResourceRoute',
    'paid_resource_rate_limited',
    'delivered_amount',
    'paid_resource_receipt_corrupt',
    'settlement_attempt_interrupted',
    'payment_required_digest',
    'agentic_commerce_paid_resource_rejections',
    'settlement_attempts',
    'verification_attempts',
    'paid_resource_verification_exhausted',
    'PAYMENT_SIGNATURE_HEADER_CHARS',
    'JSON_MAX_DEPTH',
    'transport_digest',
    'amount: args.requirements.amount',
    'parseVerifiedDiscoveryQuote',
    'controller.abort()',
    'settlementAttempted',
    'server_info',
    'network_id',
    'settlement_unknown',
    'TRAVEL_DISCOVERY_HARNESS',
  ]
  add('worker-contract', containsAll(workerSource, workerMarkers).map((marker) => `missing ${marker}`), 'Worker route carries the paid-resource wire, state, and service binding.')
  add('worker-import-hygiene', workerImportFailures(root), 'Worker-reachable sources do not import x402-xrpl, xrpl, or jose.')

  const discoverySource = [
    read(root, 'cloudflare/pages/agentic-graph-agent-ready-commerce.mjs'),
    read(root, 'cloudflare/pages/agentic-graph-agent-ready.mjs'),
  ].join('\n')
  const discoveryMarkers = [
    'x-agentic-commerce-paid-resources',
    'xrplX402PaidResource',
    'paidResources',
    'buildAgenticGraphCommerceStaticFiles({',
    'requestUrl: request.url',
    'buildAgentSurfaceInspection(env)',
  ]
  add('agent-discovery', containsAll(discoverySource, discoveryMarkers).map((marker) => `missing ${marker}`), 'Static protocols, Pages runtime discovery, and MCP inspection share the configured paid-resource projection.')

  const config = read(root, configPath)
  let effectiveConfig = config
  const sourceTemplateFailures = []
  if (sourceTemplate) {
    try {
      effectiveConfig = sourceCheckConfig(config)
    } catch (error) {
      sourceTemplateFailures.push(error.message)
    }
  }
  add('source-template-boundary', sourceTemplateFailures, sourceTemplate
    ? 'The source gate uses a non-secret test payee while the operator payee remains blank.'
    : 'Runtime configuration must supply the operator payee.')
  const bindingFailures = []
  if (!/binding\s*=\s*["']TRAVEL_DISCOVERY_HARNESS["']/u.test(config)) bindingFailures.push('missing TRAVEL_DISCOVERY_HARNESS binding')
  if (!/service\s*=\s*["']agentic-travel-discovery["']/u.test(config)) bindingFailures.push('binding must target agentic-travel-discovery')
  add('service-binding', bindingFailures, 'Payment Worker binds TRAVEL_DISCOVERY_HARNESS to agentic-travel-discovery.')
  add('visible-configuration', visibleConfigFailures(effectiveConfig), 'Visible XRPL x402 configuration is complete and contains no wallet secret name.')

  const migration = read(root, MIGRATION_PATH)
  const migrationMarkers = [
    'agentic_commerce_paid_resources',
    'agentic_commerce_paid_resource_admission_windows',
    'idx_paid_resource_retention',
    'request_digest',
    'payment_required_digest',
    'facilitator_url',
    'rpc_url',
    'transport_digest',
    'settlement_attempts',
    'verification_attempts',
    'transaction_hash',
    'revision',
    ...STATES,
  ]
  const migrationFailures = containsAll(migration, migrationMarkers).map((marker) => `missing ${marker}`)
  if (!/UNIQUE[\s\S]{0,180}(?:network|transaction_hash)|CREATE\s+UNIQUE\s+INDEX[\s\S]{0,240}transaction_hash/iu.test(migration)) {
    migrationFailures.push('missing transaction-hash uniqueness contract')
  }
  add('d1-migration', migrationFailures, 'D1 migration carries the complete state and transaction uniqueness contract.')

  add('dependency-and-command-pins', inspectPackagePins(root), 'Node smoke dependencies and operator commands are exact-pinned.')

  if (skipDryRun) {
    checks.push({ name: 'worker-dry-run', status: 'skip', detail: 'Skipped by --skip-dry-run.' })
    checks.push({ name: 'travel-discovery-dry-run', status: 'skip', detail: 'Skipped by --skip-dry-run.' })
  } else {
    const dryRun = runWorkerDryRun(root, configPath, sourceTemplate ? effectiveConfig : null)
    checks.push({ name: 'worker-dry-run', status: dryRun.ok ? 'pass' : 'fail', detail: dryRun.detail })
    const travelDryRun = runWorkerDryRun(root, 'cloudflare/workers/agentic-graph-travel-discovery/wrangler.toml')
    checks.push({ name: 'travel-discovery-dry-run', status: travelDryRun.ok ? 'pass' : 'fail', detail: travelDryRun.detail })
  }

  return { ok: !checks.some((check) => check.status === 'fail'), checks }
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  const args = process.argv.slice(2)
  const result = inspectXrplX402PaidResource({
    root: process.cwd(),
    skipDryRun: hasFlag(args, '--skip-dry-run'),
    configPath: readArgValue(args, '--config', CONFIG_PATH),
    sourceTemplate: hasFlag(args, '--source-template'),
  })
  if (hasFlag(args, '--json')) console.log(JSON.stringify(result, null, 2))
  else {
    for (const check of result.checks) console.log(`${check.status.toUpperCase()} ${check.name}: ${check.detail}`)
    console.log(`${result.ok ? 'OK' : 'FAIL'} xrpl-x402-paid-resource-readiness`)
  }
  process.exitCode = result.ok ? 0 : 1
}
