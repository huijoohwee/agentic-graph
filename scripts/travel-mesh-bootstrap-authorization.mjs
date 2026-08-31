import { DIGEST, SHA, canonical, digest, requireText } from './travel-mesh-release-plan.mjs'

export const BOOTSTRAP_PLAN_SCHEMA = 'agenticgraph-travel-mesh-provider-bootstrap-plan/v1'
export const BOOTSTRAP_PACKET_SCHEMA = 'agenticgraph-travel-mesh-provider-packet/v1'
export const BOOTSTRAP_AUTHORIZATION_SCHEMA = 'agenticgraph-travel-mesh-provider-bootstrap-authorization/v1'
export const BOOTSTRAP_JOURNAL_SCHEMA = 'agenticgraph-travel-mesh-provider-bootstrap-journal/v1'
export const BOOTSTRAP_COMPLETION_SCHEMA = 'agenticgraph-travel-mesh-provider-bootstrap-completion/v1'
export const BOOTSTRAP_PLAN_CARRIER_MAX_BYTES = 4 * 1024 * 1024
export const BOOTSTRAP_JOURNAL_CARRIER_MAX_BYTES = 48 * 1024
export const BOOTSTRAP_JOURNAL_EFFECT_ORDER = Object.freeze([
  'resources', 'storage-migrations', 'deploy:marketplace', 'deploy:mcp-shell', 'deploy:settlement-executor',
  'deploy:net-settlement', 'deploy:flight-discovery', 'deploy:experience-discovery', 'deploy:overflow',
  'deploy:travel-commerce', 'deploy:mcp', 'deploy:operator-gateway', 'deploy:storage',
  'disable-public-subdomains', 'routes-and-custom-domain', 'live-probes', 'project-environment-packet',
  'persist-receipt', 'enable-release',
])

export const bootstrapPlanCarrier = plan => {
  const serialized = JSON.stringify(plan)
  const size = Buffer.byteLength(serialized)
  if (size > BOOTSTRAP_PLAN_CARRIER_MAX_BYTES) {
    throw new Error(`bootstrap plan exceeds the 4 MiB protected artifact carrier (${size} bytes)`)
  }
  return serialized
}

const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) throw new Error(`${label} has an invalid shape`)
  return value
}
const instant = (value, label) => {
  const text = requireText(value, label)
  if (Number.isNaN(Date.parse(text)) || new Date(text).toISOString() !== text) throw new Error(`${label} must be a canonical ISO instant`)
  return text
}
const namedDigests = (entries, label) => {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error(`${label} must be a non-empty array`)
  const seen = new Set()
  return entries.map((entry, index) => {
    exactKeys(entry, ['name', 'valueDigest'], `${label}[${index}]`)
    const name = requireText(entry.name, `${label}[${index}].name`)
    if (seen.has(name) || !DIGEST.test(entry.valueDigest)) throw new Error(`${label} is duplicated or contains an invalid digest`)
    if (/value|secret|token|password/i.test(Object.keys(entry).filter(key => key !== 'valueDigest').join(' '))) throw new Error(`${label} must never contain secret values`)
    seen.add(name)
    return Object.freeze({ name, valueDigest: entry.valueDigest })
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export const normalizeBootstrapPacket = packet => {
  exactKeys(packet, ['accountId', 'expiresAt', 'issuedAt', 'schema', 'secrets', 'variables', 'zoneId'], 'provider packet')
  if (packet.schema !== BOOTSTRAP_PACKET_SCHEMA || !/^[0-9a-f]{32}$/.test(packet.accountId)
    || !/^[0-9a-f]{32}$/.test(packet.zoneId)) throw new Error('provider packet identity is invalid')
  const issuedAt = instant(packet.issuedAt, 'provider packet issuedAt'), expiresAt = instant(packet.expiresAt, 'provider packet expiresAt')
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error('provider packet must expire after issuance')
  return Object.freeze({ schema: packet.schema, accountId: packet.accountId, zoneId: packet.zoneId,
    issuedAt, expiresAt, variables: namedDigests(packet.variables, 'provider packet variables'),
    secrets: namedDigests(packet.secrets, 'provider packet secrets') })
}

const planBody = plan => {
  const { planDigest, exactAuthorization, ...body } = plan
  return body
}

export const normalizeBootstrapPlan = plan => {
  exactKeys(plan, ['accountId', 'beforeInventory', 'beforeInventoryDigest', 'controllerDigest', 'desired', 'effectGraph',
    'exactAuthorization', 'expiresAt', 'issuedAt', 'packetDigest', 'planDigest', 'schema', 'sourceSha', 'sourceTree',
    'workflowDigest', 'wranglerDigest', 'zoneId'], 'bootstrap plan')
  if (plan.schema !== BOOTSTRAP_PLAN_SCHEMA || !SHA.test(plan.sourceSha) || !SHA.test(plan.sourceTree)
    || !DIGEST.test(plan.beforeInventoryDigest) || digest(plan.beforeInventory) !== plan.beforeInventoryDigest
    || ![plan.controllerDigest, plan.workflowDigest, plan.wranglerDigest, plan.packetDigest].every(value => DIGEST.test(value))) {
    throw new Error('bootstrap plan evidence is invalid')
  }
  instant(plan.issuedAt, 'bootstrap plan issuedAt'); instant(plan.expiresAt, 'bootstrap plan expiresAt')
  if (Date.parse(plan.expiresAt) <= Date.parse(plan.issuedAt)) throw new Error('bootstrap plan expiry is invalid')
  if (!Array.isArray(plan.effectGraph) || plan.effectGraph.length !== BOOTSTRAP_JOURNAL_EFFECT_ORDER.length
    || plan.effectGraph.some((entry, index) => {
      const id = BOOTSTRAP_JOURNAL_EFFECT_ORDER[index]
      const policy = id === 'routes-and-custom-domain' ? 'route-last'
        : id === 'enable-release' ? 'environment-last' : id === 'deploy:mcp' ? 'replace-shell' : 'create-or-adopt'
      const expected = id === 'resources' ? plan.desired?.resources
        : id === 'routes-and-custom-domain' ? plan.desired?.routes
          : id === 'disable-public-subdomains' ? plan.desired?.exposure : { id, desiredDigest: digest(plan.desired) }
      return entry?.index !== index || entry?.id !== id || entry?.policy !== policy || entry?.expectedDigest !== digest(expected)
    })) {
    throw new Error('bootstrap effect graph is invalid')
  }
  const expectedDigest = digest(planBody(plan))
  if (plan.planDigest !== expectedDigest
    || plan.exactAuthorization !== `authorize travel-mesh-provider-bootstrap ${expectedDigest}`) {
    throw new Error('bootstrap plan digest or exact authorization is invalid')
  }
  bootstrapPlanCarrier(plan)
  return Object.freeze(plan)
}

export const buildBootstrapPlan = ({ sourceSha, sourceTree, controllerDigest, workflowDigest, wranglerDigest,
  packet, beforeInventory, desired, effectGraph, issuedAt, expiresAt }) => {
  const normalizedPacket = normalizeBootstrapPacket(packet)
  if (normalizedPacket.accountId !== desired.accountId || normalizedPacket.zoneId !== desired.zoneId) {
    throw new Error('provider packet does not bind the desired account and zone')
  }
  if (Date.parse(expiresAt) > Date.parse(normalizedPacket.expiresAt)) {
    throw new Error('bootstrap plan expiry exceeds the sealed provider packet expiry')
  }
  const body = {
    schema: BOOTSTRAP_PLAN_SCHEMA, sourceSha, sourceTree, controllerDigest, workflowDigest, wranglerDigest,
    accountId: normalizedPacket.accountId, zoneId: normalizedPacket.zoneId, packetDigest: digest(normalizedPacket),
    beforeInventory, beforeInventoryDigest: digest(beforeInventory), desired, effectGraph,
    issuedAt: instant(issuedAt, 'bootstrap plan issuedAt'), expiresAt: instant(expiresAt, 'bootstrap plan expiresAt'),
  }
  const planDigest = digest(body)
  return normalizeBootstrapPlan(Object.freeze({ ...body, planDigest,
    exactAuthorization: `authorize travel-mesh-provider-bootstrap ${planDigest}` }))
}

export const consumeBootstrapAuthorization = ({ plan, authorization, actor, consumedAt, now = Date.now() }) => {
  const normalized = normalizeBootstrapPlan(plan)
  if (authorization !== normalized.exactAuthorization) throw new Error('exact bootstrap authorization is required')
  if (now >= Date.parse(normalized.expiresAt)) throw new Error('bootstrap plan authorization is expired')
  const consumed = instant(consumedAt, 'authorization consumedAt')
  if (Date.parse(consumed) < Date.parse(normalized.issuedAt) || Date.parse(consumed) >= Date.parse(normalized.expiresAt)
    || Math.abs(Date.parse(consumed) - now) > 5 * 60_000) throw new Error('bootstrap authorization time is outside the sealed plan window')
  const body = { schema: BOOTSTRAP_AUTHORIZATION_SCHEMA, status: 'consumed', planDigest: normalized.planDigest,
    actor: requireText(actor, 'bootstrap authorization actor'), consumedAt: consumed }
  return Object.freeze({ ...body, receiptDigest: digest(body) })
}

export const createBootstrapJournal = ({ plan, authorization }) => {
  const normalized = normalizeBootstrapPlan(plan)
  if (authorization?.schema !== BOOTSTRAP_AUTHORIZATION_SCHEMA || authorization?.planDigest !== normalized.planDigest
    || authorization?.receiptDigest !== digest(Object.fromEntries(Object.entries(authorization).filter(([key]) => key !== 'receiptDigest')))) {
    throw new Error('bootstrap authorization receipt is invalid')
  }
  const body = { schema: BOOTSTRAP_JOURNAL_SCHEMA, planDigest: normalized.planDigest,
    authorization: Object.freeze({ ...authorization }), authorizationReceiptDigest: authorization.receiptDigest,
    phase: 'authorized', effects: [] }
  return Object.freeze({ ...body, journalDigest: digest(body) })
}

export const normalizeBootstrapJournal = journal => {
  const { journalDigest, ...body } = journal ?? {}
  if (body.schema !== BOOTSTRAP_JOURNAL_SCHEMA || !DIGEST.test(journalDigest ?? '') || digest(body) !== journalDigest
    || body.authorization?.schema !== BOOTSTRAP_AUTHORIZATION_SCHEMA
    || body.authorization?.planDigest !== body.planDigest
    || body.authorization?.receiptDigest !== body.authorizationReceiptDigest
    || digest(Object.fromEntries(Object.entries(body.authorization).filter(([key]) => key !== 'receiptDigest')))
      !== body.authorizationReceiptDigest
    || !Array.isArray(body.effects)) throw new Error('bootstrap journal seal is invalid')
  instant(body.authorization.consumedAt, 'bootstrap journal authorization consumedAt')
  const seen = new Set()
  for (const [index, effect] of body.effects.entries()) {
    exactKeys(effect, ['attemptedAt', 'disposition', 'effectDigest', 'effectId', 'expectedDigest', 'observedDigest'], 'bootstrap journal effect')
    const { effectDigest, ...effectBody } = effect
    if (effect.effectId !== BOOTSTRAP_JOURNAL_EFFECT_ORDER[index] || seen.has(effect.effectId)
      || !['projected', 'adopted-response-loss'].includes(effect.disposition)
      || ![effectDigest, effect.expectedDigest, effect.observedDigest].every(value => DIGEST.test(value))
      || digest(effectBody) !== effectDigest || instant(effect.attemptedAt, 'bootstrap effect attemptedAt') !== effect.attemptedAt) {
      throw new Error('bootstrap journal effect is invalid or duplicated')
    }
    seen.add(effect.effectId)
  }
  if (body.effects.length > BOOTSTRAP_JOURNAL_EFFECT_ORDER.length
    || body.phase !== (body.effects.at(-1)?.effectId ?? 'authorized')) throw new Error('bootstrap journal phase is not its exact effect prefix')
  return Object.freeze(journal)
}

export const normalizeBootstrapJournalCarrier = carrier => {
  exactKeys(carrier, ['completion', 'journal', 'pending'], 'bootstrap journal carrier')
  const journal = normalizeBootstrapJournal(carrier.journal)
  const pending = carrier.pending == null ? null : exactKeys(carrier.pending, ['effectId', 'expectedDigest'], 'bootstrap pending effect')
  if (pending && (pending.effectId !== BOOTSTRAP_JOURNAL_EFFECT_ORDER[journal.effects.length]
    || !DIGEST.test(pending.expectedDigest))) throw new Error('bootstrap pending effect is not the exact journal successor')
  const completion = carrier.completion == null ? null : normalizeBootstrapCompletion(carrier.completion, journal.planDigest)
  if (completion && (journal.phase !== 'enable-release' || completion.journalDigest !== journal.journalDigest || pending)) {
    throw new Error('bootstrap completion does not close its exact journal carrier')
  }
  const normalized = Object.freeze({ journal, pending, completion })
  const size = Buffer.byteLength(JSON.stringify(normalized))
  if (size > BOOTSTRAP_JOURNAL_CARRIER_MAX_BYTES) throw new Error(`bootstrap journal exceeds the 48 KiB durable carrier (${size} bytes)`)
  return normalized
}

const journalPrefix = (left, right) => {
  if (left.journal.planDigest !== right.journal.planDigest
    || left.journal.authorizationReceiptDigest !== right.journal.authorizationReceiptDigest
    || left.journal.effects.length > right.journal.effects.length
    || left.journal.effects.some((effect, index) => canonical(effect) !== canonical(right.journal.effects[index]))) return false
  if (left.journal.effects.length === right.journal.effects.length && left.pending
    && canonical(left.pending) !== canonical(right.pending)) return false
  if (left.journal.effects.length < right.journal.effects.length && left.pending
    && (left.pending.effectId !== right.journal.effects[left.journal.effects.length].effectId
      || left.pending.expectedDigest !== right.journal.effects[left.journal.effects.length].expectedDigest)) return false
  return !left.completion || (right.completion && canonical(left.completion) === canonical(right.completion))
}

export const selectBootstrapJournalCarrier = ({ local = null, remote = null, planDigest }) => {
  const localCarrier = local == null ? null : normalizeBootstrapJournalCarrier(local)
  const remoteCarrier = remote == null ? null : normalizeBootstrapJournalCarrier(remote)
  if (localCarrier && remoteCarrier && !journalPrefix(localCarrier, remoteCarrier)) {
    throw new Error('local bootstrap journal is not an exact prefix of its remote durable carrier')
  }
  const selected = remoteCarrier ?? localCarrier
  if (!selected) return null
  if (selected.journal.planDigest !== planDigest) {
    if (!selected.completion) throw new Error('a different incomplete bootstrap journal owns the durable carrier')
    return null
  }
  return selected
}

export const appendBootstrapJournal = (journal, effect) => {
  const normalized = normalizeBootstrapJournal(journal)
  const { journalDigest, ...body } = normalized
  exactKeys(effect, ['attemptedAt', 'disposition', 'effectDigest', 'effectId', 'expectedDigest', 'observedDigest'], 'bootstrap effect')
  if (effect.disposition !== 'projected' && effect.disposition !== 'adopted-response-loss') throw new Error('bootstrap effect disposition is invalid')
  if (![effect.effectDigest, effect.expectedDigest, effect.observedDigest].every(value => DIGEST.test(value))) throw new Error('bootstrap effect digest is invalid')
  if (body.effects.some(entry => entry.effectId === effect.effectId)) throw new Error('bootstrap effect is already journaled')
  if (effect.effectId !== BOOTSTRAP_JOURNAL_EFFECT_ORDER[body.effects.length]
    || digest(Object.fromEntries(Object.entries(effect).filter(([key]) => key !== 'effectDigest'))) !== effect.effectDigest) {
    throw new Error('bootstrap effect is not the exact next sealed effect')
  }
  const nextBody = { ...body, phase: effect.effectId, effects: [...body.effects, Object.freeze({ ...effect })] }
  return Object.freeze({ ...nextBody, journalDigest: digest(nextBody) })
}

export const exactResponseLossDisposition = ({ expected, observed, error }) => {
  if (canonical(expected) !== canonical(observed)) throw new Error(`provider response loss was not exactly adopted: ${error?.message ?? error}`)
  return 'adopted-response-loss'
}

export const normalizeBootstrapReceipt = (receipt, plan = null) => {
  const keys = ['accountId', 'authorizationReceiptDigest', 'authorizedBy', 'bindings', 'domains', 'effectJournalDigest',
    'environmentProjection', 'exposure', 'finalEvidenceDigest', 'migrations', 'packetDigest', 'planDigest', 'probes',
    'provisionedAt', 'receiptDigest', 'releaseEnabled', 'resources', 'routes', 'schema', 'secretNames', 'sourceSha',
    'sourceTree', 'status', 'versions', 'workers', 'zoneId']
  exactKeys(receipt, keys, 'bootstrap receipt')
  const { receiptDigest, ...body } = receipt
  const evidence = { versions: body.versions, bindings: body.bindings, secretNames: body.secretNames, routes: body.routes,
    domains: body.domains, migrations: body.migrations, exposure: body.exposure, probes: body.probes }
  if (body.schema !== 'agenticgraph-travel-mesh-bootstrap-receipt/v3' || body.status !== 'provisioned'
    || !SHA.test(body.sourceSha) || !SHA.test(body.sourceTree) || ![body.planDigest, body.packetDigest,
      body.authorizationReceiptDigest, body.effectJournalDigest, body.finalEvidenceDigest, receiptDigest].every(value => DIGEST.test(value))
    || digest(body) !== receiptDigest || digest(evidence) !== body.finalEvidenceDigest || body.releaseEnabled !== true
    || body.environmentProjection?.receiptPersisted !== true || body.environmentProjection?.releaseEnabled !== true
    || instant(body.provisionedAt, 'bootstrap receipt provisionedAt') !== body.provisionedAt
    || (plan && (body.planDigest !== plan.planDigest || body.packetDigest !== plan.packetDigest
      || body.accountId !== plan.accountId || body.zoneId !== plan.zoneId || body.sourceSha !== plan.sourceSha
      || body.sourceTree !== plan.sourceTree || canonical(body.resources) !== canonical(plan.desired.resources)))) {
    throw new Error('bootstrap receipt evidence is invalid')
  }
  return Object.freeze(receipt)
}

export const sealBootstrapCompletion = ({ planDigest, receipt, journalDigest }) => {
  const body = { schema: BOOTSTRAP_COMPLETION_SCHEMA, status: 'complete', planDigest, receipt, journalDigest,
    ownedTerminalDigest: digest({ receiptDigest: receipt?.receiptDigest, journalDigest }) }
  return Object.freeze({ ...body, resultDigest: digest(body) })
}

export const normalizeBootstrapCompletion = (completion, planDigest) => {
  const { resultDigest, ...body } = completion ?? {}
  if (body.schema !== BOOTSTRAP_COMPLETION_SCHEMA || body.status !== 'complete' || body.planDigest !== planDigest
    || !DIGEST.test(resultDigest ?? '') || digest(body) !== resultDigest || !DIGEST.test(body.journalDigest ?? '')
    || body.ownedTerminalDigest !== digest({ receiptDigest: body.receipt?.receiptDigest, journalDigest: body.journalDigest })) {
    throw new Error('bootstrap completion seal is invalid')
  }
  normalizeBootstrapReceipt(body.receipt)
  return Object.freeze(completion)
}

export const bootstrapReceiptCarrier = receipt => {
  const serialized = JSON.stringify(normalizeBootstrapReceipt(receipt))
  const size = Buffer.byteLength(serialized, 'utf8')
  if (size > BOOTSTRAP_JOURNAL_CARRIER_MAX_BYTES) {
    throw new Error(`bootstrap receipt exceeds the 48 KiB configuration-variable carrier (${size} bytes)`)
  }
  return serialized
}

const terminalJournalEffect = ({ effectId, expected, disposition, attemptedAt }) => {
  const body = { effectId, expectedDigest: digest(expected), observedDigest: digest(expected), disposition, attemptedAt }
  return Object.freeze({ ...body, effectDigest: digest(body) })
}

export const preflightBootstrapTerminalCarriers = ({ journal, receipt }) => {
  const normalizedJournal = normalizeBootstrapJournal(journal)
  const normalizedReceipt = normalizeBootstrapReceipt(receipt)
  const serializedReceipt = bootstrapReceiptCarrier(normalizedReceipt)
  const receiptIndex = BOOTSTRAP_JOURNAL_EFFECT_ORDER.indexOf('persist-receipt')
  if (normalizedJournal.effects.length < receiptIndex) {
    throw new Error('bootstrap terminal carrier preflight requires the complete pre-receipt effect prefix')
  }
  if (normalizedJournal.effects.length > receiptIndex + 1) {
    throw new Error('bootstrap terminal carrier preflight must occur before release enable')
  }
  const persistedReceipt = normalizedJournal.effects[receiptIndex]
  if (persistedReceipt && (persistedReceipt.expectedDigest !== digest(normalizedReceipt)
    || persistedReceipt.observedDigest !== digest(normalizedReceipt))) {
    throw new Error('persisted bootstrap receipt effect does not match the preflight receipt')
  }
  const journalBody = Object.fromEntries(Object.entries(normalizedJournal).filter(([key]) => key !== 'journalDigest'))
  const prefixEffects = journalBody.effects.slice(0, receiptIndex)
  const prefixBody = { ...journalBody, phase: prefixEffects.at(-1)?.effectId ?? 'authorized', effects: prefixEffects }
  const prefix = normalizeBootstrapJournal(Object.freeze({ ...prefixBody, journalDigest: digest(prefixBody) }))
  const attemptedAt = prefix.authorization.consumedAt
  const releaseExpectation = Object.freeze({ name: 'TRAVEL_MESH_RELEASE_ENABLED', value: 'true' })
  const dispositions = Object.freeze(['projected', 'adopted-response-loss'])
  const combinations = dispositions.flatMap(receiptDisposition => dispositions.map(releaseDisposition => {
    const receiptJournal = appendBootstrapJournal(prefix, terminalJournalEffect({ effectId: 'persist-receipt',
      expected: normalizedReceipt, disposition: receiptDisposition, attemptedAt }))
    const releaseJournal = appendBootstrapJournal(receiptJournal, terminalJournalEffect({ effectId: 'enable-release',
      expected: releaseExpectation, disposition: releaseDisposition, attemptedAt }))
    const completion = sealBootstrapCompletion({ planDigest: releaseJournal.planDigest, receipt: normalizedReceipt,
      journalDigest: releaseJournal.journalDigest })
    const carrier = normalizeBootstrapJournalCarrier({ journal: releaseJournal, pending: null, completion })
    return Object.freeze({ receiptDisposition, releaseDisposition, carrier })
  }))
  return Object.freeze({ receiptBytes: Buffer.byteLength(serializedReceipt, 'utf8'), combinations: Object.freeze(combinations) })
}
