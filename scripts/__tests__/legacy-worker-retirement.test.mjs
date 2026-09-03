import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  LEGACY_WORKER_RETIREMENT_SCHEMA,
  LEGACY_WORKER_RETIREMENT_TARGETS,
  assertLegacyWorkerRetirementDetached,
  assertLegacyWorkerRetirementEvidence,
  legacyWorkerRetirementPlanDigest,
  sealLegacyWorkerRetirementDetached,
  sealLegacyWorkerRetirementPreflight,
} from '../legacy-worker-retirement.mjs'
import { digest as contentDigest } from '../travel-mesh-release-plan.mjs'

const sourceRevision = 'a'.repeat(40)
const now = new Date('2026-09-03T07:00:00.000Z')
const fixtureDigest = index => String(index).toString(16).padStart(64, '0')
const source = path.resolve('scripts/legacy-worker-retirement.mjs')
const worker = (name, index, options = {}) => ({
  worker: name,
  deployment: { versionId: `version-${index}`, percentage: 100 },
  bindingsDigest: fixtureDigest(index + 1), secretNamesDigest: fixtureDigest(index + 2),
  routesDigest: options.routes ? contentDigest(options.routes) : fixtureDigest(index + 3),
  domainsDigest: options.domains ? contentDigest(options.domains) : fixtureDigest(index + 4),
  subdomainEnabled: options.subdomainEnabled ?? false, previewUrlsEnabled: options.previewUrlsEnabled ?? false,
})

const routeRef = route => `route:${route.zoneName}\u0000${route.pattern}`
const domainRef = domain => `domain:${domain.hostname}`
const emptyExposure = () => ({ routes: [], domains: [], workersDev: { enabled: false } })
const legacyExposure = target => {
  if (target.handoff === 'workers-dev') return { ...emptyExposure(), workersDev: { enabled: true } }
  const route = { ...target.successorExposure.routes[0] }
  if (target.id === 'mcp') route.pattern = 'airvio.co/agenticGraph/control-plane/mcp'
  return {
    routes: [route],
    domains: target.handoff === 'route-and-domain' ? [{ ...target.successorExposure.domains[0] }] : [],
    workersDev: { enabled: false },
  }
}
const handoffMappings = (legacy, successor) => [
  ...legacy.routes.map(route => ({ kind: 'route', legacyRef: routeRef(route), successorRef: routeRef(successor.routes[0]) })),
  ...legacy.domains.map(domain => ({ kind: 'domain', legacyRef: domainRef(domain), successorRef: domainRef(successor.domains[0]) })),
  ...(legacy.workersDev.enabled ? [{ kind: 'workers-dev', legacyRef: 'workers-dev', successorRef: 'workers-dev' }] : []),
]
const draft = (status = 'preflight-passed', preflight) => {
  const handoffs = LEGACY_WORKER_RETIREMENT_TARGETS.map((target, index) => {
    const successor = structuredClone(target.successorExposure)
    const legacy = status === 'detached' ? emptyExposure() : legacyExposure(target)
    return {
      id: target.id, status: status === 'detached' ? 'detached' : 'prepared', legacy, successor,
      mappings: status === 'detached' ? [] : handoffMappings(legacy, successor), receiptDigest: fixtureDigest(140 + index),
    }
  })
  const targets = LEGACY_WORKER_RETIREMENT_TARGETS.map((target, index) => {
    // Bind every visible route/domain/Workers.dev exposure to the double-read inventory.
    // The live receipt carries digests only; this fixture derives them from its exact lists.
    const handoff = handoffs.find(value => value.id === target.id)
    return {
      id: target.id,
      legacy: worker(target.legacyWorker, index * 10, {
        routes: handoff.legacy.routes, domains: handoff.legacy.domains, subdomainEnabled: handoff.legacy.workersDev.enabled,
      }),
      successor: worker(target.successorWorker, index * 10 + 5, target.handoff === 'workers-dev'
        ? { routes: handoff.successor.routes, domains: handoff.successor.domains, subdomainEnabled: true, previewUrlsEnabled: true }
        : { routes: handoff.successor.routes, domains: handoff.successor.domains }),
    }
  })
  const targetsDigest = contentDigest(targets)
  const value = {
    schema: LEGACY_WORKER_RETIREMENT_SCHEMA,
    status,
    sourceRevision,
    planDigest: legacyWorkerRetirementPlanDigest(),
    observedAt: '2026-09-03T06:55:00.000Z',
    expiresAt: '2026-09-03T07:10:00.000Z',
    inventory: { firstDigest: targetsDigest, secondDigest: targetsDigest, targets },
    continuity: LEGACY_WORKER_RETIREMENT_TARGETS.flatMap((target, index) => target.continuity.map((kind, kindIndex) => ({
      id: target.id, kind, status: 'passed', legacyVersionId: `version-${index * 10}`, successorVersionId: `version-${index * 10 + 5}`,
      receiptDigest: fixtureDigest(100 + index * 10 + kindIndex),
    }))),
    handoffs,
    probes: LEGACY_WORKER_RETIREMENT_TARGETS.map((target, index) => ({
      id: target.id, status: 'passed', httpStatus: 200, observedAt: '2026-09-03T07:00:00.000Z',
      successorVersionId: `version-${index * 10 + 5}`, receiptDigest: fixtureDigest(150 + index),
    })),
    rollback: LEGACY_WORKER_RETIREMENT_TARGETS.map((target, index) => ({
      id: target.id, status: 'proved', legacyVersionId: `version-${index * 10}`, successorVersionId: `version-${index * 10 + 5}`,
      receiptDigest: fixtureDigest(160 + index),
    })),
    paymentReadiness: {
      schema: 'agentic-os-payment-live-readiness/v1', status: 'ready', worker: 'agentic-payment', versionId: 'version-35',
      network: 'eip155:8453', asset: 'USDC', x402PayToAddress: '0x1111111111111111111111111111111111111111',
      configurationDigest: fixtureDigest(170), operatorAuthorizationReceiptDigest: fixtureDigest(171), receiptDigest: fixtureDigest(172),
    },
  }
  if (status === 'detached') {
    value.preflightReceiptDigest = preflight?.receiptDigest ?? fixtureDigest(180)
    value.preflightInventoryDigest = preflight?.inventory.firstDigest ?? fixtureDigest(181)
  }
  return value
}
const seal = value => sealLegacyWorkerRetirementPreflight(value, { now, sourceRevision })
const sealDetached = (value, preflight) => sealLegacyWorkerRetirementDetached(value, preflight, { now, sourceRevision })
const bindExposureInventory = value => {
  for (const target of value.inventory.targets) {
    const handoff = value.handoffs.find(item => item.id === target.id)
    for (const side of ['legacy', 'successor']) {
      target[side].routesDigest = contentDigest(handoff[side].routes)
      target[side].domainsDigest = contentDigest(handoff[side].domains)
      target[side].subdomainEnabled = handoff[side].workersDev.enabled
    }
  }
  value.inventory.firstDigest = contentDigest(value.inventory.targets)
  value.inventory.secondDigest = value.inventory.firstDigest
}
const rejects = (mutate, pattern) => {
  const value = draft()
  mutate(value)
  assert.throws(() => seal(value), pattern)
}

test('legacy retirement plan binds only the four exact legacy-to-agentic worker mappings', () => {
  assert.deepEqual(LEGACY_WORKER_RETIREMENT_TARGETS.map(target => [target.id, target.legacyWorker, target.successorWorker]), [
    ['storage', 'agentic-graph-storage', 'agentic-storage'],
    ['mcp', 'agentic-graph-mcp', 'agentic-mcp'],
    ['mcp-dev', 'agentic-graph-mcp-dev', 'agentic-mcp-dev'],
    ['payment', 'agentic-graph-payment', 'agentic-payment'],
  ])
  for (const target of LEGACY_WORKER_RETIREMENT_TARGETS) {
    assert.match(target.config, /^cloudflare\/workers\/agentic-graph-/)
    assert.doesNotMatch(target.successorWorker, /agenticGraph|agenticGraph/i)
    const config = fs.readFileSync(path.resolve(target.config), 'utf8')
    const envStart = target.environment ? config.indexOf(`[env.${target.environment}]`) : -1
    const envEnd = envStart < 0 ? -1 : config.indexOf('\n[env.', envStart + 1)
    const baseEnd = config.search(/^\[env\./m)
    const section = target.environment
      ? config.slice(envStart, envEnd < 0 ? config.length : envEnd)
      : config.slice(0, baseEnd < 0 ? config.length : baseEnd)
    assert.match(section, new RegExp(`^name = "${target.successorWorker}"$`, 'm'))
  }
  assert.match(legacyWorkerRetirementPlanDigest(), /^[0-9a-f]{64}$/)
})

test('a sealed preflight requires stable redacted inventories, continuity, probes, rollback, and an operator payment payee', () => {
  const receipt = seal(draft())
  assert.equal(receipt.receiptDigest.length, 64)
  assert.equal(assertLegacyWorkerRetirementEvidence(receipt, { now, sourceRevision }).status, 'preflight-passed')
  assert.throws(() => assertLegacyWorkerRetirementDetached(receipt, receipt, { now, sourceRevision }), /not a detached handoff/)

  rejects(value => { value.inventory.targets.pop() }, /every target exactly once/)
  rejects(value => { value.inventory.targets[0].successor.worker = 'agentic-graph-storage' }, /Worker identity is not exact/)
  rejects(value => { value.inventory.targets[0].successor.deployment.percentage = 50 }, /weighted at 100 percent/)
  rejects(value => { value.inventory.secondDigest = fixtureDigest(91) }, /not stable/)
  rejects(value => { value.inventory.targets[0].successor.routesDigest = fixtureDigest(99) }, /does not bind the exact target snapshots/)
  rejects(value => { value.continuity.pop() }, /does not exactly cover/)
  rejects(value => { value.continuity[0].successorVersionId = 'wrong-version' }, /deployment version drifted/)
  rejects(value => { value.probes[0].status = 'failed' }, /did not pass/)
  rejects(value => { value.probes[0].httpStatus = 503 }, /successful HTTP status/)
  rejects(value => { value.rollback[0].status = 'missing' }, /is not proved/)
  rejects(value => { value.rollback[0].legacyVersionId = 'wrong-version' }, /deployment version drifted/)
  rejects(value => { value.paymentReadiness.x402PayToAddress = `0x${'0'.repeat(40)}` }, /non-placeholder operator x402 payee/)
  rejects(value => { value.expiresAt = '2026-09-03T06:59:59.000Z' }, /expired/)
  rejects(value => { value.observedAt = '2026-09-03T07:01:00.000Z'; value.expiresAt = '2026-09-03T07:10:00.000Z' }, /expired/)
  assert.throws(() => sealLegacyWorkerRetirementPreflight(draft(), { now, sourceRevision: 'b'.repeat(40) }), /source revision is invalid/)

  const tampered = structuredClone(receipt)
  tampered.probes[0].status = 'failed'
  assert.throws(() => assertLegacyWorkerRetirementEvidence(tampered, { now, sourceRevision }), /digest drifted/)
})

test('detached handoff follows one sealed preflight and proves every legacy exposure is gone without exposing a deletion action', () => {
  const preflight = seal(draft())
  const receipt = sealDetached(draft('detached', preflight), preflight)
  assert.equal(assertLegacyWorkerRetirementDetached(receipt, preflight, { now, sourceRevision }).status, 'detached')
  assert.throws(() => seal(draft('detached')), /must not claim detachment/)

  const routeRetained = draft('detached', preflight)
  routeRetained.handoffs.find(item => item.id === 'mcp').legacy.routes.push({ pattern: 'airvio.co/agenticGraph/control-plane/mcp', zoneName: 'airvio.co' })
  bindExposureInventory(routeRetained)
  assert.throws(() => sealDetached(routeRetained, preflight), /retains a legacy exposure/)
  const domainRetained = draft('detached', preflight)
  domainRetained.handoffs.find(item => item.id === 'storage').legacy.domains.push({ hostname: 'storage.airvio.co' })
  bindExposureInventory(domainRetained)
  assert.throws(() => sealDetached(domainRetained, preflight), /retains a legacy exposure/)
  const devRetained = draft('detached', preflight)
  devRetained.handoffs.find(item => item.id === 'mcp-dev').legacy.workersDev.enabled = true
  bindExposureInventory(devRetained)
  assert.throws(() => sealDetached(devRetained, preflight), /retains a legacy exposure/)

  const wrongPreflightDraft = draft()
  wrongPreflightDraft.observedAt = '2026-09-03T06:56:00.000Z'
  wrongPreflightDraft.expiresAt = '2026-09-03T07:11:00.000Z'
  wrongPreflightDraft.probes.forEach(probe => { probe.observedAt = '2026-09-03T07:00:00.000Z' })
  const wrongPreflight = seal(wrongPreflightDraft)
  assert.throws(() => sealDetached(draft('detached', preflight), wrongPreflight), /not bound to its exact preflight/)

  const moduleSource = fs.readFileSync(source, 'utf8')
  assert.doesNotMatch(moduleSource, /\b(?:wrangler|workers)\b[^\n]{0,120}\bdelete\b/i)
  assert.doesNotMatch(moduleSource, /\b(?:rmSync|unlinkSync|spawn)\b/)
})

test('the validation CLI accepts only a sealed receipt bound to its exact source revision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-os-retirement-'))
  try {
    const cliNow = new Date()
    const cliDraft = draft()
    cliDraft.observedAt = new Date(cliNow.getTime() - 5_000).toISOString()
    cliDraft.expiresAt = new Date(cliNow.getTime() + 5 * 60_000).toISOString()
    cliDraft.probes.forEach(probe => { probe.observedAt = cliNow.toISOString() })
    const cliReceipt = sealLegacyWorkerRetirementPreflight(cliDraft, { now: cliNow, sourceRevision })
    const receiptPath = path.join(root, 'receipt.json')
    fs.writeFileSync(receiptPath, JSON.stringify(cliReceipt))
    const result = spawnSync(process.execPath, [source, 'validate', `--receipt=${receiptPath}`, `--source-sha=${sourceRevision}`], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
      schema: 'agentic-os-legacy-worker-retirement/v1/validation', status: 'passed', receiptDigest: cliReceipt.receiptDigest,
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
