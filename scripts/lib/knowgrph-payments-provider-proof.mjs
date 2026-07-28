export const KNOWGRPH_PAYMENTS_PROVIDER_PROOF_SCHEMA_ID =
  'knowgrph-payments-provider-sandbox-proof/v1'

const HEX_64_PATTERN = /^[0-9a-f]{64}$/

const exactKeys = (value, expected) =>
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.keys(value).sort().join('\n') === [...expected].sort().join('\n')

const validateDigest = value => typeof value === 'string' && HEX_64_PATTERN.test(value)

const EXPECTED_RAIL_KEYS = [
  'rail',
  'mode',
  'terminalState',
  'authenticatedSettlement',
  'verification',
  'providerObjectCount',
  'paymentRecordRoundTrip',
  'providerCallCount',
  'costLogEntryCount',
  'modelCallCount',
  'modelCostUsd',
  'providerObjectIdDigest',
  'providerRequestIdDigest',
]

const validateRailCandidate = entry => {
  const failures = []
  if (!exactKeys(entry, EXPECTED_RAIL_KEYS)) {
    failures.push('Rail candidate must contain only the canonical digest and count fields.')
    return { valid: false, failures }
  }
  if (entry.rail !== 'stripe' && entry.rail !== 'straitsx') {
    failures.push(`Unknown rail candidate ${String(entry.rail)}.`)
    return { valid: false, failures }
  }
  const expectedVerification =
    entry.rail === 'stripe'
      ? 'stripe-signature-and-provider-read'
      : 'straitsx-provider-state-read'
  if (
    entry.mode !== 'sandbox'
    || entry.terminalState !== 'paid'
    || entry.authenticatedSettlement !== true
    || entry.verification !== expectedVerification
    || entry.providerObjectCount !== 1
    || entry.paymentRecordRoundTrip !== true
    || !Number.isSafeInteger(entry.providerCallCount)
    || entry.providerCallCount < 1
    || entry.costLogEntryCount !== entry.providerCallCount
    || entry.modelCallCount !== 0
    || entry.modelCostUsd !== '0.00'
    || !validateDigest(entry.providerObjectIdDigest)
    || (entry.providerRequestIdDigest !== null && !validateDigest(entry.providerRequestIdDigest))
  ) {
    failures.push(`${entry.rail} candidate does not describe one authenticated paid sandbox settlement.`)
  }
  return { valid: failures.length === 0, failures }
}

export function validateKnowgrphPaymentsProviderProof(proof, expectedEvidenceDigest) {
  const failures = []
  let envelopeValid = true
  if (!exactKeys(proof, ['schemaId', 'sourceEvidenceDigest', 'rails'])) {
    failures.push('Provider candidate must contain only schemaId, sourceEvidenceDigest, and rails.')
    envelopeValid = false
  }
  if (proof?.schemaId !== KNOWGRPH_PAYMENTS_PROVIDER_PROOF_SCHEMA_ID) {
    failures.push('Provider candidate schema is unknown.')
    envelopeValid = false
  }
  if (!validateDigest(proof?.sourceEvidenceDigest) || proof.sourceEvidenceDigest !== expectedEvidenceDigest) {
    failures.push('Provider candidate sourceEvidenceDigest does not match this source evidence.')
    envelopeValid = false
  }
  if (!Array.isArray(proof?.rails) || proof.rails.length !== 2) {
    failures.push('Provider candidate must contain exactly one stripe and one straitsx rail entry.')
    envelopeValid = false
  }

  const railEntries = new Map()
  const railResults = new Map()
  const railCandidates = Array.isArray(proof?.rails) ? proof.rails : []
  for (const entry of railCandidates) {
    const result = validateRailCandidate(entry)
    if (entry?.rail !== 'stripe' && entry?.rail !== 'straitsx') {
      failures.push(...result.failures)
      envelopeValid = false
      continue
    }
    if (railEntries.has(entry.rail)) {
      failures.push(`Duplicate ${entry.rail} rail candidate.`)
      envelopeValid = false
      continue
    }
    railEntries.set(entry.rail, entry)
    railResults.set(entry.rail, result)
    failures.push(...result.failures)
  }
  for (const rail of ['stripe', 'straitsx']) {
    if (!railEntries.has(rail)) {
      failures.push(`Missing ${rail} rail candidate.`)
      envelopeValid = false
    }
  }
  for (const rail of ['stripe', 'straitsx']) {
    const result = railResults.get(rail)
    if (result) result.candidateEligible = envelopeValid && result.valid
  }
  return {
    candidateValid: failures.length === 0,
    readinessProven: false,
    failures,
    railEntries,
    railResults,
  }
}

export function inspectKnowgrphPaymentsProviderCandidate({
  proof,
  proofError,
  source,
}) {
  const configuredRail = (rail, candidate = {}) => {
    const { proofEntry = null, candidateResult = null, proofSupplied = false } = candidate
    let status = proofError ? 'fail' : 'blocked'
    if (proofSupplied) status = candidateResult?.candidateEligible ? 'candidate' : 'fail'
    return {
      status,
      configuredApiVersion: rail === 'stripe' ? source.stripeApiVersion : null,
      configuredIntegrationModel: rail === 'straitsx' ? source.straitsxIntegrationModel : null,
      credentialNames: source.secretNames.filter(name =>
        rail === 'stripe' ? name.startsWith('STRIPE_') : name.startsWith('STRAITSX_')),
      proof: proofEntry
        ? {
            candidateOnly: true,
            sourceDigest: proof.sourceEvidenceDigest,
            paid: proofEntry.terminalState === 'paid',
            authenticated: proofEntry.authenticatedSettlement === true,
            recordRoundTrip: proofEntry.paymentRecordRoundTrip === true,
          }
        : null,
    }
  }
  if (!proof) {
    const detail = proofError || 'No two-rail paid sandbox candidate was supplied.'
    return {
      status: proofError ? 'fail' : 'blocked',
      requiredForExit: true,
      rails: {
        stripe: configuredRail('stripe'),
        straitsx: configuredRail('straitsx'),
      },
      blockers: [{
        id: 'two-rail-paid-sandbox-proof',
        gate: 'providerSandbox',
        detail,
        evidence: [],
      }],
    }
  }

  const validation = validateKnowgrphPaymentsProviderProof(proof, source.evidenceDigest)
  const railCandidate = rail => configuredRail(rail, {
    proofEntry: validation.railEntries.get(rail),
    candidateResult: validation.railResults.get(rail),
    proofSupplied: true,
  })
  return {
    status: validation.candidateValid ? 'blocked' : 'fail',
    requiredForExit: true,
    rails: {
      stripe: railCandidate('stripe'),
      straitsx: railCandidate('straitsx'),
    },
    blockers: [
      {
        id: 'provider-candidate-untrusted',
        gate: 'providerSandbox',
        detail:
          'Caller-authored provider JSON is an unsigned candidate only. A trusted verifier must execute authenticated provider-state and record-round-trip checks before readiness can pass.',
        evidence: [],
      },
      ...validation.failures.map((detail, index) => ({
        id: `provider-candidate-${index + 1}`,
        gate: 'providerSandbox',
        detail,
        evidence: [],
      })),
    ],
  }
}
