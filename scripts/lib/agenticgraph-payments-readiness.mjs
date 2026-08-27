import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
} from 'node:fs'
import path from 'node:path'

import { parseYamlFrontmatter } from './source-readiness-assertions.mjs'
import {
  inspectKnowgrphPaymentsClientBundleSecrets,
  PAYMENT_SECRET_VALUE_PATTERNS,
} from './knowgrph-payments-bundle-secrets.mjs'
import {
  runKnowgrphPaymentsLocalVcc,
} from './knowgrph-payments-local-vcc.mjs'
import {
  inspectKnowgrphPaymentsCanonicalRuntime,
  inspectKnowgrphPaymentsSourceIdentity,
} from './knowgrph-payments-delivery-gates.mjs'
import {
  inspectKnowgrphAgenticPurchaseReadiness,
} from './knowgrph-agentic-purchase-readiness.mjs'
import {
  inspectKnowgrphPaymentsProviderCandidate,
  KNOWGRPH_PAYMENTS_PROVIDER_PROOF_SCHEMA_ID,
  validateKnowgrphPaymentsProviderProof,
} from './knowgrph-payments-provider-proof.mjs'
import {
  buildKnowgrphPaymentsEvidenceDigest,
  PAYMENT_BUYER_PRODUCT_SSOT_PATH,
  readTrackedPaymentContracts,
  readVisibleWranglerVars,
  STRAITSX_PAYMENT_SSOT_PATH,
  STRIPE_PAYMENT_SSOT_PATH,
  validateKnowgrphPaymentsReadinessManifest,
} from './knowgrph-payments-source-evidence.mjs'

export const KNOWGRPH_PAYMENTS_READINESS_SCHEMA_ID = 'knowgrph-payments-readiness/v1'
export {
  KNOWGRPH_PAYMENTS_PROVIDER_PROOF_SCHEMA_ID,
  validateKnowgrphPaymentsProviderProof,
}
export const KNOWGRPH_PAYMENTS_MANIFEST_SCHEMA_ID =
  'knowgrph-payments-readiness-properties/v1'

const REQUIREMENTS_PATH = '.kiro/specs/knowgrph-payments/requirements.md'
const PRD_PATH = 'docs/documents/knowgrph-payments-prd-tad.md'
const MANIFEST_PATH = 'scripts/knowgrph-payments-readiness-properties.json'
const WRANGLER_CONFIG_PATH = 'cloudflare/workers/knowgrph-payment/wrangler.toml'
const SOURCE_EVIDENCE_HELPER_PATH =
  'scripts/lib/knowgrph-payments-source-evidence.mjs'
const CLIENT_BUNDLE_SECRET_CHECK_ID = 'client-bundle-secret-values'
const EXPECTED_REQUIREMENT_IDS = Array.from({ length: 17 }, (_value, index) => `R${index + 1}`)
const EXPECTED_OPEN_QUESTION_IDS = Array.from({ length: 25 }, (_value, index) => `OQ-${index + 1}`)

const readText = (root, relativePath) => readFileSync(path.join(root, relativePath), 'utf8')
const runGit = (root, args, fallback = '') => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return fallback
  }
}

const addCheck = (checks, id, status, detail, evidence = []) => {
  checks.push({ id, status, detail, evidence })
}

const inspectEvidenceMarker = ({ checks, root, id, evidence, label }) => {
  let status = 'pass'
  let detail = `${label} marker is present in ${evidence.file}.`
  try {
    const source = readFileSync(path.join(root, evidence.file), 'utf8')
    if (!source.includes(evidence.contains)) {
      status = 'fail'
      detail = `${label} marker is missing from ${evidence.file}.`
    }
  } catch (error) {
    status = 'fail'
    detail = `${label} evidence is unreadable at ${evidence.file}: ${error.message}`
  }
  addCheck(checks, id, status, detail, [evidence.file])
}

const failedSourceInspection = (checks, id, detail, evidence = []) => {
  addCheck(checks, id, 'fail', detail, evidence)
  return {
    status: 'fail',
    requiredForExit: true,
    checks,
    blockers: [{
      id: `source-check-${id}`,
      gate: 'source',
      detail,
      evidence,
    }],
    evidencePaths: [],
    evidenceDigest: null,
    stripeRequestApiVersion: null,
    stripeWebhookApiVersion: null,
    straitsxIntegrationModel: null,
    straitsxFundFlow: null,
    straitsxAuthMode: null,
    straitsxGrantedProducts: [],
    buyerProductEnvironmentNames: [],
    buyerProductConfigured: false,
    secretNames: [],
    localVcc: { status: 'fail', attestation: null },
  }
}

const uniqueSorted = values => [...new Set(values)].sort()
const sortOpenQuestionIds = values =>
  [...new Set(values)].sort((left, right) =>
    Number(left.slice(3)) - Number(right.slice(3)),
  )

const extractOpenQuestionIds = (requirementsSource, prdSource) => sortOpenQuestionIds([
  ...requirementsSource.matchAll(/^- \*\*(OQ-\d+)\b/gm),
  ...prdSource.matchAll(/^\| (OQ-\d+) \|/gm),
].map(match => match[1]))

const collectEvidencePaths = manifest => uniqueSorted([
  REQUIREMENTS_PATH,
  PRD_PATH,
  MANIFEST_PATH,
  WRANGLER_CONFIG_PATH,
  SOURCE_EVIDENCE_HELPER_PATH,
  STRIPE_PAYMENT_SSOT_PATH,
  STRAITSX_PAYMENT_SSOT_PATH,
  PAYMENT_BUYER_PRODUCT_SSOT_PATH,
  ...manifest.runtimeEvidence.map(item => item.file),
  ...manifest.requirements.flatMap(requirement =>
    requirement.evidence.map(item => item.file),
  ),
])

const inspectSource = async ({ root, requireTracked, executeLocalVcc }) => {
  const checks = []
  const blockers = []
  let manifest = null
  let requirementsSource = ''
  let prdSource = ''

  try {
    requirementsSource = readText(root, REQUIREMENTS_PATH)
    prdSource = readText(root, PRD_PATH)
    manifest = JSON.parse(readText(root, MANIFEST_PATH))
    addCheck(checks, 'authority-files-readable', 'pass', 'Read the requirements, PRD/TAD, and readiness manifest.', [
      REQUIREMENTS_PATH,
      PRD_PATH,
      MANIFEST_PATH,
    ])
  } catch (error) {
    return failedSourceInspection(checks, 'authority-files-readable', error.message)
  }

  const manifestStructureFailures = validateKnowgrphPaymentsReadinessManifest(manifest)
  if (manifestStructureFailures.length > 0) {
    return failedSourceInspection(
      checks,
      'manifest-structure',
      manifestStructureFailures.join(' '),
      [MANIFEST_PATH],
    )
  }

  if (manifest.schemaId === KNOWGRPH_PAYMENTS_MANIFEST_SCHEMA_ID) {
    addCheck(checks, 'manifest-schema', 'pass', `Manifest uses ${KNOWGRPH_PAYMENTS_MANIFEST_SCHEMA_ID}.`, [
      MANIFEST_PATH,
    ])
  } else {
    addCheck(checks, 'manifest-schema', 'fail', 'Readiness manifest schema is unknown.', [MANIFEST_PATH])
  }

  try {
    const requirementsFrontmatter = parseYamlFrontmatter(requirementsSource, REQUIREMENTS_PATH)
    const prdFrontmatter = parseYamlFrontmatter(prdSource, PRD_PATH)
    const authorityMatches =
      requirementsFrontmatter.companion_document === PRD_PATH
      && requirementsFrontmatter.companion_document_state === 'populated'
      && prdFrontmatter.spec_ref === REQUIREMENTS_PATH
      && requirementsFrontmatter.version === prdFrontmatter.spec_version
      && requirementsSource.includes('normative requirements source of truth')
      && prdSource.includes('The spec remains the normative requirements source of truth')
    addCheck(
      checks,
      'document-authority',
      authorityMatches ? 'pass' : 'fail',
      authorityMatches
        ? 'Requirements and PRD/TAD declare one matching authority and version.'
        : 'Requirements and PRD/TAD authority, companion state, or version drifted.',
      [REQUIREMENTS_PATH, PRD_PATH],
    )
  } catch (error) {
    addCheck(checks, 'document-authority', 'fail', error.message, [REQUIREMENTS_PATH, PRD_PATH])
  }

  const requirementIds = manifest.requirements?.map(item => item.id) || []
  const requirementsComplete =
    JSON.stringify(requirementIds) === JSON.stringify(EXPECTED_REQUIREMENT_IDS)
  addCheck(
    checks,
    'requirement-inventory',
    requirementsComplete ? 'pass' : 'fail',
    requirementsComplete
      ? 'Manifest covers R1 through R17 exactly once and in order.'
      : 'Manifest must cover R1 through R17 exactly once and in order.',
    [MANIFEST_PATH],
  )

  const documentedOpenQuestions = extractOpenQuestionIds(requirementsSource, prdSource)
  const manifestOpenQuestions = manifest.openQuestions?.map(item => item.id) || []
  const openQuestionsComplete =
    JSON.stringify(documentedOpenQuestions) === JSON.stringify(EXPECTED_OPEN_QUESTION_IDS)
    && JSON.stringify(sortOpenQuestionIds(manifestOpenQuestions)) === JSON.stringify(EXPECTED_OPEN_QUESTION_IDS)
    && manifestOpenQuestions.length === EXPECTED_OPEN_QUESTION_IDS.length
  addCheck(
    checks,
    'open-question-inventory',
    openQuestionsComplete ? 'pass' : 'fail',
    openQuestionsComplete
      ? 'Every OQ-1 through OQ-25 is classified exactly once.'
      : 'Every documented OQ-1 through OQ-25 must be classified exactly once.',
    [REQUIREMENTS_PATH, PRD_PATH, MANIFEST_PATH],
  )

  for (const requirement of manifest.requirements || []) {
    for (const [evidenceIndex, evidence] of requirement.evidence.entries()) {
      inspectEvidenceMarker({
        checks,
        root,
        id: `evidence-${requirement.id}-${evidenceIndex}-${evidence.file}`,
        evidence,
        label: requirement.id,
      })
    }
    if (requirement.status !== 'implemented') {
      blockers.push({
        id: `${requirement.id.toLowerCase()}-source-${requirement.status}`,
        gate: 'source',
        detail: `${requirement.id}: ${requirement.detail}`,
        evidence: (requirement.evidence || []).map(item => item.file),
      })
    }
  }

  for (const [evidenceIndex, evidence] of manifest.runtimeEvidence.entries()) {
    inspectEvidenceMarker({
      checks,
      root,
      id: `runtime-evidence-${evidenceIndex}-${evidence.file}`,
      evidence,
      label: 'Runtime topology',
    })
  }

  for (const question of manifest.openQuestions || []) {
    if (question.status === 'open' && question.gate === 'source') {
      blockers.push({
        id: question.id.toLowerCase(),
        gate: 'source',
        detail: question.detail,
        evidence: [REQUIREMENTS_PATH, PRD_PATH],
      })
    }
  }

  const evidencePaths = collectEvidencePaths(manifest)
  const evidenceFilesPresent = evidencePaths.every(relativePath => existsSync(path.join(root, relativePath)))
  addCheck(
    checks,
    'evidence-files-present',
    evidenceFilesPresent ? 'pass' : 'fail',
    evidenceFilesPresent
      ? `All ${evidencePaths.length} source evidence files are present.`
      : 'One or more source evidence files are missing.',
    evidencePaths,
  )

  if (requireTracked) {
    const untrackedEvidence = evidencePaths.filter(relativePath =>
      !runGit(root, ['ls-files', '--error-unmatch', '--', relativePath]),
    )
    addCheck(
      checks,
      'evidence-files-tracked',
      untrackedEvidence.length === 0 ? 'pass' : 'fail',
      untrackedEvidence.length === 0
        ? 'Every source evidence file is git-tracked.'
        : `Untracked source evidence: ${untrackedEvidence.join(', ')}`,
      evidencePaths,
    )
  }

  let stripeRequestApiVersion = null
  let stripeWebhookApiVersion = null
  let straitsxIntegrationModel = null
  let straitsxFundFlow = null
  let straitsxAuthMode = null
  let straitsxGrantedProducts = []
  let buyerProductEnvironmentNames = []
  let buyerProductConfigured = false
  let secretNames = []
  try {
    const contracts = readTrackedPaymentContracts(root)
    stripeRequestApiVersion = contracts.stripeRequestApiVersion
    stripeWebhookApiVersion = contracts.stripeWebhookApiVersion
    secretNames = uniqueSorted([
      ...contracts.stripeSecretNames,
      ...contracts.straitsxSecretNames,
    ])
    const wranglerSource = readText(root, WRANGLER_CONFIG_PATH)
    const visibleVars = readVisibleWranglerVars(wranglerSource)
    const defaultVars = new Map(
      visibleVars
        .filter(entry => entry.section === 'vars')
        .map(entry => [entry.name, entry.value]),
    )
    straitsxIntegrationModel =
      String(defaultVars.get(contracts.straitsxIntegrationModelKey) || '').trim() || null
    straitsxFundFlow =
      String(defaultVars.get(contracts.straitsxFundFlowKey) || '').trim() || null
    straitsxAuthMode =
      String(defaultVars.get(contracts.straitsxAuthModeKey) || '').trim() || null
    straitsxGrantedProducts =
      String(defaultVars.get(contracts.straitsxGrantedProductsKey) || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .sort()
    buyerProductEnvironmentNames = [...contracts.buyerProductEnvironmentNames]
    const [amountName, currencyName, settlementAssetName] =
      buyerProductEnvironmentNames
    const amountText = String(defaultVars.get(amountName) || '').trim()
    const amountMinor = /^[1-9]\d*$/.test(amountText)
      ? Number(amountText)
      : Number.NaN
    buyerProductConfigured =
      Number.isSafeInteger(amountMinor)
      && /^[a-z]{3}$/.test(
        String(defaultVars.get(currencyName) || '').trim().toLowerCase(),
      )
      && ['fiat', 'xsgd'].includes(
        String(defaultVars.get(settlementAssetName) || '').trim().toLowerCase(),
      )
    const visibleSecretNames = visibleVars
      .filter(entry => secretNames.includes(entry.name))
      .map(entry => `${entry.section}:${entry.name}`)
    const visibleSecretValues = visibleVars.flatMap(({ section, name, value }) =>
      PAYMENT_SECRET_VALUE_PATTERNS.some(pattern => {
        pattern.lastIndex = 0
        return pattern.test(String(value))
      }) ? [`${section}:${name}`] : [],
    )
    addCheck(
      checks,
      'visible-worker-secret-bindings',
      visibleSecretNames.length === 0 && visibleSecretValues.length === 0 ? 'pass' : 'fail',
      visibleSecretNames.length === 0 && visibleSecretValues.length === 0
        ? 'No payment credential is bound through visible Worker variables.'
        : `Payment credentials appear in visible Worker variables: ${uniqueSorted([
            ...visibleSecretNames,
            ...visibleSecretValues,
          ]).join(', ')}`,
      [WRANGLER_CONFIG_PATH],
    )
    addCheck(
      checks,
      'tracked-payment-ssot',
      'pass',
      'Payment readiness derives configuration names from tracked TypeScript SSOT sources without executing generated dist.',
      [
        STRIPE_PAYMENT_SSOT_PATH,
        STRAITSX_PAYMENT_SSOT_PATH,
        PAYMENT_BUYER_PRODUCT_SSOT_PATH,
      ],
    )

  } catch (error) {
    addCheck(
      checks,
      'payment-ssot-and-secret-boundary',
      'fail',
      error.message,
      [
        STRIPE_PAYMENT_SSOT_PATH,
        STRAITSX_PAYMENT_SSOT_PATH,
        PAYMENT_BUYER_PRODUCT_SSOT_PATH,
        WRANGLER_CONFIG_PATH,
      ],
    )
  }

  const declaredCoverageComplete = blockers.length === 0
  addCheck(
    checks,
    'source-coverage',
    declaredCoverageComplete ? 'pass' : 'blocked',
    declaredCoverageComplete
      ? 'The manifest declares all R1-R17 deterministic source owners implemented with no source-owned question open.'
      : `${blockers.length} source implementation or decision blocker(s) remain.`,
    [MANIFEST_PATH],
  )

  let evidenceDigest = null
  if (evidenceFilesPresent) {
    try {
      evidenceDigest = buildKnowgrphPaymentsEvidenceDigest(root, evidencePaths)
    } catch (error) {
      addCheck(
        checks,
        'evidence-digest',
        'fail',
        `Could not digest source evidence: ${error.message}`,
        evidencePaths,
      )
    }
  }
  let localVcc = { status: 'blocked', attestation: null }
  if (!executeLocalVcc) {
    addCheck(
      checks,
      'executed-local-vcc-attestation',
      'blocked',
      'Local VCCs were not executed; source markers and editable manifest claims cannot establish the local rung.',
      [REQUIREMENTS_PATH, MANIFEST_PATH],
    )
  } else if (!evidenceDigest) {
    addCheck(
      checks,
      'executed-local-vcc-attestation',
      'fail',
      'Local VCCs cannot execute without a complete source-evidence digest.',
      evidencePaths,
    )
    localVcc = { status: 'fail', attestation: null }
  } else {
    try {
      const result = await runKnowgrphPaymentsLocalVcc({
        root,
        sourceEvidenceDigest: evidenceDigest,
      })
      const stableDigest = buildKnowgrphPaymentsEvidenceDigest(root, evidencePaths)
      const digestStable = stableDigest === evidenceDigest
      const passed = result.ok && digestStable
      addCheck(
        checks,
        'executed-local-vcc-attestation',
        passed ? 'pass' : 'fail',
        passed
          ? `Executed ${result.attestation.suites.length} allowlisted local VCC suites against the inspected source digest.`
          : [
              ...result.validation.failures,
              ...(digestStable ? [] : ['Source evidence changed while local VCCs executed.']),
            ].join(' '),
        [MANIFEST_PATH, 'scripts/lib/knowgrph-payments-local-vcc.mjs'],
      )
      localVcc = {
        status: passed ? 'pass' : 'fail',
        attestation: result.attestation,
      }
    } catch (error) {
      addCheck(
        checks,
        'executed-local-vcc-attestation',
        'fail',
        `Local VCC execution failed: ${error.message}`,
        ['scripts/lib/knowgrph-payments-local-vcc.mjs'],
      )
      localVcc = { status: 'fail', attestation: null }
    }
  }
  inspectKnowgrphPaymentsClientBundleSecrets(
    checks,
    root,
    CLIENT_BUNDLE_SECRET_CHECK_ID,
  )

  const failedChecks = checks.filter(check => check.status === 'fail')
  const blockedChecks = checks.filter(check => check.status === 'blocked')
  for (const check of [...failedChecks, ...blockedChecks]) {
    if (check.id === 'source-coverage') continue
    blockers.push({
      id: `source-check-${check.id}`,
      gate: 'source',
      detail: check.detail,
      evidence: check.evidence,
    })
  }
  return {
    status: failedChecks.length > 0 ? 'fail' : blockedChecks.length > 0 ? 'blocked' : 'pass',
    requiredForExit: true,
    checks,
    blockers,
    evidencePaths,
    evidenceDigest,
    stripeRequestApiVersion,
    stripeWebhookApiVersion,
    straitsxIntegrationModel,
    straitsxFundFlow,
    straitsxAuthMode,
    straitsxGrantedProducts,
    buyerProductEnvironmentNames,
    buyerProductConfigured,
    secretNames,
    localVcc,
  }
}

export async function inspectKnowgrphPaymentsReadiness({
  root,
  providerProof = null,
  providerProofError = null,
  requireTracked = true,
  executeLocalVcc = false,
}) {
  const sourceIdentity = inspectKnowgrphPaymentsSourceIdentity(root)
  const source = await inspectSource({ root, requireTracked, executeLocalVcc })
  sourceIdentity.evidenceDigest = source.evidenceDigest
  const providerSandbox = inspectKnowgrphPaymentsProviderCandidate({
    proof: providerProof,
    proofError: providerProofError,
    source,
  })
  const agenticPurchase = inspectKnowgrphAgenticPurchaseReadiness(source)
  const canonicalRuntime = inspectKnowgrphPaymentsCanonicalRuntime(root, sourceIdentity)
  const protectedIntegration = {
    status: 'not-proven',
    requiredForExit: false,
    detail: 'Requires authenticated protected GitHub evidence; local source cannot prove it.',
  }
  const browserRuntime = {
    status: 'not-proven',
    requiredForExit: false,
    detail: 'No browser acceptance run is executed by the local source gate.',
  }
  const productionMirror = {
    status: 'not-authorized',
    requiredForExit: false,
    detail: 'No production mirror mutation is authorized by this development task.',
  }
  const deployment = {
    status: 'not-authorized',
    requiredForExit: false,
    detail: 'Dev-only authority; no production mirror or Cloudflare mutation is authorized.',
  }
  const ok =
    source.status === 'pass'
    && providerSandbox.status === 'pass'
    && agenticPurchase.status === 'pass'
  const gates = {
    source: {
      status: source.status,
      requiredForExit: source.requiredForExit,
      checks: source.checks,
      blockers: source.blockers,
    },
    localVcc: {
      status: source.localVcc.status,
      requiredForExit: true,
      attestation: source.localVcc.attestation,
    },
    providerSandbox,
    agenticPurchase,
    browserRuntime,
    canonicalRuntime,
    protectedIntegration,
    productionMirror,
    deployment,
  }
  return {
    schemaId: KNOWGRPH_PAYMENTS_READINESS_SCHEMA_ID,
    scope: 'development-sandbox',
    ok,
    localDevelopmentReady: source.status === 'pass',
    verdict: ok ? 'ready-for-protected-integration' : 'implemented-runtime-readiness-blocked',
    sourceIdentity,
    gates,
    blockers: [
      ...source.blockers,
      ...providerSandbox.blockers,
      ...agenticPurchase.blockers,
    ],
  }
}

export function readKnowgrphPaymentsProviderProof(proofPath) {
  if (!proofPath) return { proof: null, error: null }
  try {
    return { proof: JSON.parse(readFileSync(proofPath, 'utf8')), error: null }
  } catch (error) {
    return { proof: null, error: `Could not read provider proof: ${error.message}` }
  }
}
