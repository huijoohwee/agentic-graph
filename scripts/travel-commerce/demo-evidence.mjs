export const DEMO_EVIDENCE_SCHEMA = 'agenticgraph-travel-commerce-demo-evidence/v1'
export const DEMO_MODE = 'deterministic-local-service-doubles'
export const DEMO_EVIDENCE_URL_PATTERN = /^\/travel-commerce-demo-evidence-[0-9]+-[0-9]+\.json$/

export function evidenceFileName(pid = process.pid, now = Date.now()) {
  return `travel-commerce-demo-evidence-${pid}-${now}.json`
}

export function readDemoReport(output) {
  const line = output.split(/\r?\n/).find(value => value.startsWith('TRAVEL_COMMERCE_DEMO '))
  if (!line) throw new Error('Executable demo did not emit TRAVEL_COMMERCE_DEMO evidence.')
  return parseDemoReport(JSON.parse(line.slice('TRAVEL_COMMERCE_DEMO '.length)))
}

export function parseDemoReport(value) {
  contract(isRecord(value), 'report-object')
  contract(value.schema === DEMO_EVIDENCE_SCHEMA, 'report-schema')
  contract(value.status === 'passed', 'report-status')
  contract(value.mode === DEMO_MODE, 'report-mode')
  contract(value.deployLane === 'Dev_Lane', 'report-deploy-lane')
  contract(value.providerRequests === 0, 'report-provider-effects')
  contract(value.realPaymentCalls === 0, 'report-payment-effects')
  contract(value.productionMutations === 0, 'report-production-effects')
  contract(Array.isArray(value.beats) && value.beats.length === 8, 'report-beats')

  for (let index = 0; index < value.beats.length; index += 1) {
    const beat = value.beats[index]
    contract(isRecord(beat), `beat-${index + 1}-object`)
    contract(beat.beat === index + 1, `beat-${index + 1}-position`)
    contract(beat.status === 'passed', `beat-${index + 1}-status`)
    contract(nonEmpty(beat.title) && nonEmpty(beat.summary), `beat-${index + 1}-copy`)
    contract(['observed', 'committed', 'rolled-back', 'rejected'].includes(beat.outcome), `beat-${index + 1}-outcome`)
  }

  validateBeat1(value.beats[0])
  validateBeat2(value.beats[1], value.beats[0])
  validateBeat3(value.beats[2], value.beats[0], value.beats[1])
  validateBeat4(value.beats[3])
  validateBeat5(value.beats[4])
  validateBeat6(value.beats[5])
  validateBeat7(value.beats[6])
  validateBeat8(value.beats[7])
  return value
}

function validateBeat1(beat) {
  contract(beat.outcome === 'observed' && beat.graphEngines === 0, 'beat-1-runtime')
  contract(validLegs(beat.legs, 4), 'beat-1-legs')
  const ids = new Set(beat.legs.map(leg => leg.legId))
  contract(ids.size === 4, 'beat-1-leg-identities')
  contract(beat.legs.filter(leg => leg.relation === 'changed').length === 1, 'beat-1-changed-leg')
  contract(beat.legs.filter(leg => leg.relation === 'affected').length === 2, 'beat-1-affected-legs')
  contract(beat.legs.filter(leg => leg.relation === 'unaffected sibling').length === 1, 'beat-1-unaffected-leg')
  contract(Array.isArray(beat.edges) && beat.edges.length === 2, 'beat-1-edges')
  const edges = new Set()
  for (const edge of beat.edges) {
    contract(isRecord(edge) && nonEmpty(edge.fromLegId) && nonEmpty(edge.toLegId), 'beat-1-edge-shape')
    contract(ids.has(edge.fromLegId) && ids.has(edge.toLegId) && edge.fromLegId !== edge.toLegId, 'beat-1-edge-endpoints')
    edges.add(`${edge.fromLegId}->${edge.toLegId}`)
  }
  contract(edges.size === 2, 'beat-1-edge-identity')
}

function validateBeat2(beat, beat1) {
  contract(beat.outcome === 'observed' && nonEmpty(beat.changedLegId), 'beat-2-changed-leg')
  contract(stringArray(beat.affectedLegIds, 2), 'beat-2-affected')
  contract(!beat.affectedLegIds.includes(beat.changedLegId), 'beat-2-excludes-changed')
  contract(sameStrings(beat.affectedLegIds, reachable(beat1.edges, beat.changedLegId)), 'beat-2-reachability')
  contract(Array.isArray(beat.changes) && beat.changes.length === 2, 'beat-2-changes')
  for (const change of beat.changes) {
    contract(isRecord(change) && beat.affectedLegIds.includes(change.legId), 'beat-2-change-leg')
    contract(nonEmpty(change.priorOfferId) && nonEmpty(change.newOfferId) && change.priorOfferId !== change.newOfferId, 'beat-2-change-offers')
    contract(minorUnits(change.priorAmountMinor) && minorUnits(change.newAmountMinor), 'beat-2-change-amounts')
    contract(change.currency === 'SGD' && change.priceVerification === 'deterministic-demo', 'beat-2-change-verification')
  }
  contract(isRecord(beat.unaffectedSibling), 'beat-2-sibling')
  contract(beat.unaffectedSibling.offerIdBefore === beat.unaffectedSibling.offerIdAfter, 'beat-2-sibling-offer')
  contract(beat.unaffectedSibling.amountMinorBefore === beat.unaffectedSibling.amountMinorAfter, 'beat-2-sibling-amount')
  contract(beat.unaffectedSiblingsTouched === 0, 'beat-2-sibling-touch')
}

function validateBeat3(beat, beat1, beat2) {
  contract(beat.outcome === 'rolled-back' && Array.isArray(beat.outcomes) && beat.outcomes.length === 2, 'beat-3-outcomes')
  const [committed, rolledBack] = beat.outcomes
  contract(isRecord(committed) && committed.kind === 'committed' && committed.reason === null, 'beat-3-committed')
  contract(isRecord(rolledBack) && rolledBack.kind === 'rolled-back' && rolledBack.reason === 'requote-rejected', 'beat-3-rollback')
  for (const outcome of beat.outcomes) {
    contract(nonEmpty(outcome.cascadeId) && stringArray(outcome.affectedLegIds, 2), 'beat-3-outcome-identity')
    contract(sameStrings(outcome.affectedLegIds, beat2.affectedLegIds), 'beat-3-outcome-affected')
    contract(outcome.mixedStates === 0, 'beat-3-mixed-state')
    contract(validLegs(outcome.beforeLegs, 4) && validLegs(outcome.afterLegs, 4), 'beat-3-snapshots')
  }
  contract(JSON.stringify(committed.beforeLegs) === JSON.stringify(beat1.legs), 'beat-3-committed-before')
  contract(JSON.stringify(committed.beforeLegs) !== JSON.stringify(committed.afterLegs), 'beat-3-committed-after')
  contract(rolledBack.snapshotRestored === true, 'beat-3-restored-flag')
  contract(JSON.stringify(rolledBack.beforeLegs) === JSON.stringify(rolledBack.afterLegs), 'beat-3-restored-snapshot')
}

function validateBeat4(beat) {
  contract(beat.outcome === 'committed' && beat.currency === 'SGD', 'beat-4-currency')
  contract(isRecord(beat.nonZero) && isRecord(beat.zeroNet), 'beat-4-scenarios')
  contract(nonEmpty(beat.nonZero.cascadeId) && beat.nonZero.idempotencyKey === beat.nonZero.cascadeId, 'beat-4-nonzero-identity')
  contract(stringArray(beat.nonZero.affectedLegIds, 2) && integer(beat.nonZero.netAmountMinor) && beat.nonZero.netAmountMinor !== 0, 'beat-4-nonzero-net')
  contract(beat.nonZero.settlementCallsOnFirstExecution === 1, 'beat-4-first-call')
  contract(beat.nonZero.settlementCallsAfterExactReplay === 1 && beat.nonZero.exactReplayOutcome === 'committed', 'beat-4-replay')
  contract(nonEmpty(beat.zeroNet.cascadeId) && beat.zeroNet.idempotencyKey === beat.zeroNet.cascadeId, 'beat-4-zero-identity')
  contract(stringArray(beat.zeroNet.affectedLegIds, 2) && beat.zeroNet.netAmountMinor === 0, 'beat-4-zero-net')
  contract(beat.zeroNet.settlementCalls === 0 && beat.zeroNet.recordedAs === 'zero-net', 'beat-4-zero-calls')
}

function validateBeat5(beat) {
  contract(beat.outcome === 'rejected' && beat.currency === 'SGD' && minorUnits(beat.envelopeAmountMinor), 'beat-5-envelope')
  contract(isRecord(beat.initialRace) && Array.isArray(beat.initialRace.offers) && beat.initialRace.offers.length === 2, 'beat-5-race')
  contract(beat.initialRace.offers.filter(offer => offer?.result === 'reserved').length === 1, 'beat-5-accepted')
  contract(beat.initialRace.offers.filter(offer => offer?.result === 'rejected').length === 1, 'beat-5-rejected')
  for (const offer of beat.initialRace.offers) {
    contract(isRecord(offer) && nonEmpty(offer.agentId) && nonEmpty(offer.offerId) && minorUnits(offer.amountMinor), 'beat-5-offer')
  }
  const accepted = beat.initialRace.offers.find(offer => offer.result === 'reserved')
  const rejected = beat.initialRace.offers.find(offer => offer.result === 'rejected')
  contract(accepted.offerId === beat.initialRace.acceptedOfferId && rejected.offerId === beat.initialRace.rejectedOfferId, 'beat-5-race-identities')
  contract(rejected.reason === 'insufficient-envelope' && beat.initialRace.rejectedReason === rejected.reason, 'beat-5-race-reason')
  contract(accepted.amountMinor + rejected.amountMinor > beat.envelopeAmountMinor, 'beat-5-overspend-attempt')
  contract(isRecord(beat.release) && beat.release.result === 'released' && beat.release.releasedHolds === 1 && nonEmpty(beat.release.cascadeId), 'beat-5-release')
  contract(isRecord(beat.resubmission) && beat.resubmission.result === 'reserved' && beat.resubmission.availableWithoutDelay === true, 'beat-5-resubmission')
  contract(nonEmpty(beat.resubmission.offerId) && minorUnits(beat.resubmission.amountMinor), 'beat-5-resubmission-offer')
  contract(beat.resubmission.offerId === rejected.offerId && beat.resubmission.agentId === rejected.agentId, 'beat-5-resubmission-identity')
}

function validateBeat6(beat) {
  contract(beat.outcome === 'rejected' && beat.limit === 20 && beat.observed === 21, 'beat-6-limit')
  contract(beat.insertLegOperation === 'real-runtime' && beat.insertLegRejected === true, 'beat-6-leg')
  contract(beat.insertEdgeOperation === 'real-runtime' && beat.cycleRejected === true, 'beat-6-edge')
  contract(beat.rejectedMutationsApplied === 0, 'beat-6-mutations')
}

function validateBeat7(beat) {
  contract(beat.outcome === 'observed' && isRecord(beat.orchestrationCost), 'beat-7-cost')
  contract(beat.orchestrationCost.component === 'Reopt_Worker', 'beat-7-component')
  contract(beat.orchestrationCost.promptTokens === 0 && beat.orchestrationCost.completionTokens === 0 && beat.orchestrationCost.dollarCost === 0, 'beat-7-zero-cost')
  contract(isRecord(beat.cache) && beat.cache.requests === 2 && beat.cache.dispatchesWithoutCache === 2, 'beat-7-cache-baseline')
  contract(beat.cache.dispatchesWithCache === 1 && beat.cache.dispatchesSaved === 1, 'beat-7-cache-result')
  contract(nonEmpty(beat.cache.offerId) && beat.cache.priceVerification === 'deterministic-demo', 'beat-7-cache-offer')
  contract(isRecord(beat.model) && nonEmpty(beat.model.id) && nonEmpty(beat.model.providerId) && beat.model.path === 'workers-ai-free', 'beat-7-model')
  contract(nonEmpty(beat.model.license) && beat.model.metered === true, 'beat-7-license')
  contract(beat.model.freeDailyNeuronLimit === 10_000, 'beat-7-free-neuron-limit')
  contract(beat.model.execution === 'eligible-not-invoked-by-orchestration', 'beat-7-model-execution')
}

function validateBeat8(beat) {
  contract(beat.outcome === 'observed' && isRecord(beat.offline) && isRecord(beat.reconnect), 'beat-8-evidence')
  contract(beat.offline.rendered === true && beat.offline.current === false && beat.offline.outcome === 'committed', 'beat-8-offline')
  contract(beat.offline.observationsRetained === 1, 'beat-8-offline-observations')
  contract(beat.reconnect.converged === true && beat.reconnect.outcome === 'rolled-back', 'beat-8-reconnect')
  contract(beat.reconnect.observationsAfterReconnect === 2 && beat.reconnect.lostObservations === 0, 'beat-8-reconnect-observations')
  contract(beat.browserSessionRequiredForNetworkProof === true, 'beat-8-browser-boundary')
}

function validLegs(value, expectedLength) {
  return Array.isArray(value) && value.length === expectedLength && value.every(leg => (
    isRecord(leg)
    && nonEmpty(leg.legId)
    && nonEmpty(leg.category)
    && ['changed', 'affected', 'unaffected sibling'].includes(leg.relation)
    && nonEmpty(leg.committedOfferId)
    && minorUnits(leg.committedAmountMinor)
  ))
}

function reachable(edges, start) {
  const visited = new Set()
  const queue = [start]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const edge of edges) {
      if (edge.fromLegId !== current || visited.has(edge.toLegId)) continue
      visited.add(edge.toLegId)
      queue.push(edge.toLegId)
    }
  }
  return [...visited]
}

function sameStrings(left, right) {
  return stringArray(left) && stringArray(right)
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}

function stringArray(value, length) {
  return Array.isArray(value)
    && (length == null || value.length === length)
    && value.every(nonEmpty)
    && new Set(value).size === value.length
}

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0
}

function integer(value) {
  return Number.isSafeInteger(value)
}

function minorUnits(value) {
  return integer(value) && value >= 0
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function contract(condition, code) {
  if (!condition) throw new Error(`Executable demo evidence failed its safety contract: ${code}.`)
}
