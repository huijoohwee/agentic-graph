import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import path from 'node:path'

import { parseYamlFrontmatter } from './source-readiness-assertions.mjs'
import {
  inspectKnowgrphPaymentsProviderCandidate,
  KNOWGRPH_PAYMENTS_PROVIDER_PROOF_SCHEMA_ID,
  validateKnowgrphPaymentsProviderProof,
} from './knowgrph-payments-provider-proof.mjs'
import {
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
const EXPECTED_REQUIREMENT_IDS = Array.from({ length: 12 }, (_value, index) => `R${index + 1}`)
const EXPECTED_OPEN_QUESTION_IDS = Array.from({ length: 15 }, (_value, index) => `OQ-${index + 1}`)
const HEX_40_PATTERN = /^[0-9a-f]{40}$/
const PAYMENT_SECRET_VALUE_PATTERNS = [
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bwhsec_[A-Za-z0-9]{16,}\b/g,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
]

const readText = (root, relativePath) => readFileSync(path.join(root, relativePath), 'utf8')
const sha256 = value => createHash('sha256').update(value).digest('hex')

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

const listTextFiles = directory => {
  if (!existsSync(directory)) return []
  const files = []
  const visit = currentDirectory => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(currentDirectory, entry.name)
      if (entry.isDirectory()) visit(absolutePath)
      else if (entry.isFile() && /\.(?:css|html|js|json|map|mjs|txt)$/i.test(entry.name)) {
        files.push(absolutePath)
      }
    }
  }
  visit(directory)
  return files.sort()
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
    stripeApiVersion: null,
    straitsxIntegrationModel: null,
    straitsxAuthMode: null,
    secretNames: [],
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
  ...manifest.runtimeEvidence.map(item => item.file),
  ...manifest.requirements.flatMap(requirement =>
    requirement.evidence.map(item => item.file),
  ),
])

const buildEvidenceDigest = (root, evidencePaths) => {
  const hash = createHash('sha256')
  for (const relativePath of [...evidencePaths].sort()) {
    const bytes = readFileSync(path.join(root, relativePath))
    hash.update(relativePath)
    hash.update('\0')
    hash.update(sha256(bytes))
    hash.update('\n')
  }
  return hash.digest('hex')
}

const inspectSource = async ({ root, requireTracked }) => {
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
      ? 'Manifest covers R1 through R12 exactly once and in order.'
      : 'Manifest must cover R1 through R12 exactly once and in order.',
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
      ? 'Every OQ-1 through OQ-15 is classified exactly once.'
      : 'Every documented OQ-1 through OQ-15 must be classified exactly once.',
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

  let stripeApiVersion = null
  let straitsxIntegrationModel = null
  let straitsxAuthMode = null
  let secretNames = []
  try {
    const contracts = readTrackedPaymentContracts(root)
    stripeApiVersion = contracts.stripeApiVersion
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
    straitsxAuthMode =
      String(defaultVars.get(contracts.straitsxAuthModeKey) || '').trim() || null
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
      [STRIPE_PAYMENT_SSOT_PATH, STRAITSX_PAYMENT_SSOT_PATH],
    )

    const bundleDirectory = path.join(root, 'canvas/dist')
    const bundleFiles = listTextFiles(bundleDirectory)
    if (bundleFiles.length === 0) {
      addCheck(
        checks,
        'client-bundle-secret-values',
        'fail',
        'canvas/dist is absent; run the focused build before evaluating bundle leakage.',
      )
    } else {
      const leaks = []
      for (const bundleFile of bundleFiles) {
        const source = readFileSync(bundleFile, 'utf8')
        for (const pattern of PAYMENT_SECRET_VALUE_PATTERNS) {
          pattern.lastIndex = 0
          if (pattern.test(source)) {
            leaks.push(path.relative(root, bundleFile))
          }
        }
      }
      addCheck(
        checks,
        'client-bundle-secret-values',
        leaks.length === 0 ? 'pass' : 'fail',
        leaks.length === 0
          ? `Scanned ${bundleFiles.length} built client files with no payment secret value pattern present.`
          : `Payment secret value patterns appear in the built client: ${uniqueSorted(leaks).join(', ')}`,
        leaks.length === 0 ? ['canvas/dist'] : uniqueSorted(leaks),
      )
    }
  } catch (error) {
    addCheck(
      checks,
      'payment-ssot-and-secret-boundary',
      'fail',
      error.message,
      [STRIPE_PAYMENT_SSOT_PATH, STRAITSX_PAYMENT_SSOT_PATH, WRANGLER_CONFIG_PATH],
    )
  }

  const declaredCoverageComplete = blockers.length === 0
  addCheck(
    checks,
    'source-coverage',
    declaredCoverageComplete ? 'pass' : 'blocked',
    declaredCoverageComplete
      ? 'The manifest declares all R1-R12 source owners implemented with no source-owned question open.'
      : `${blockers.length} source implementation or decision blocker(s) remain.`,
    [MANIFEST_PATH],
  )
  addCheck(
    checks,
    'trusted-executed-vcc-attestation',
    'blocked',
    'No trusted executed VCC attestation is configured; editable manifest status and source markers cannot establish source readiness.',
    [REQUIREMENTS_PATH, MANIFEST_PATH],
  )

  let evidenceDigest = null
  if (evidenceFilesPresent) {
    try {
      evidenceDigest = buildEvidenceDigest(root, evidencePaths)
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
    stripeApiVersion,
    straitsxIntegrationModel,
    straitsxAuthMode,
    secretNames,
  }
}

const inspectSourceIdentity = root => {
  const revision = runGit(root, ['rev-parse', 'HEAD'], null)
  const tree = runGit(root, ['rev-parse', 'HEAD^{tree}'], null)
  const branch = runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'DETACHED')
  const status = runGit(root, ['status', '--porcelain=v1', '--untracked-files=all'], null)
  return {
    revision: HEX_40_PATTERN.test(revision || '') ? revision : null,
    tree: HEX_40_PATTERN.test(tree || '') ? tree : null,
    branch,
    clean: status === '',
  }
}

const inspectCanonicalRuntime = (root, sourceIdentity) => {
  const originMain = runGit(root, ['rev-parse', 'refs/remotes/origin/main'], null)
  const exactMainSourceIdentity =
    sourceIdentity.branch === 'main'
    && sourceIdentity.clean
    && sourceIdentity.revision !== null
    && sourceIdentity.revision === originMain
  return {
    status: 'not-proven',
    requiredForExit: false,
    sourceIdentityExactMain: exactMainSourceIdentity,
    detail: exactMainSourceIdentity
      ? 'Clean main equals refs/remotes/origin/main, but source identity alone does not prove the supervised Agentic Canvas OS canonical runtime.'
      : 'This local task checkout does not prove exact-main source identity or the supervised Agentic Canvas OS canonical runtime.',
  }
}

export async function inspectKnowgrphPaymentsReadiness({
  root,
  providerProof = null,
  providerProofError = null,
  requireTracked = true,
}) {
  const sourceIdentity = inspectSourceIdentity(root)
  const source = await inspectSource({ root, requireTracked })
  sourceIdentity.evidenceDigest = source.evidenceDigest
  const providerSandbox = inspectKnowgrphPaymentsProviderCandidate({
    proof: providerProof,
    proofError: providerProofError,
    source,
  })
  const canonicalRuntime = inspectCanonicalRuntime(root, sourceIdentity)
  const protectedIntegration = {
    status: 'not-proven',
    requiredForExit: false,
    detail: 'Requires authenticated protected GitHub evidence; local source cannot prove it.',
  }
  const deployment = {
    status: 'not-authorized',
    requiredForExit: false,
    detail: 'Dev-only authority; no production mirror or Cloudflare mutation is authorized.',
  }
  const ok = source.status === 'pass' && providerSandbox.status === 'pass'
  const gates = {
    source: {
      status: source.status,
      requiredForExit: source.requiredForExit,
      checks: source.checks,
      blockers: source.blockers,
    },
    providerSandbox,
    canonicalRuntime,
    protectedIntegration,
    deployment,
  }
  return {
    schemaId: KNOWGRPH_PAYMENTS_READINESS_SCHEMA_ID,
    scope: 'development-sandbox',
    ok,
    verdict: ok ? 'ready-for-protected-integration' : 'implemented-runtime-readiness-blocked',
    sourceIdentity,
    gates,
    blockers: [...source.blockers, ...providerSandbox.blockers],
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
