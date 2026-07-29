import { readFileSync } from 'node:fs'
import path from 'node:path'

export const STRIPE_PAYMENT_SSOT_PATH =
  'grph-shared/src/payments/stripePaymentSsot.ts'
export const STRAITSX_PAYMENT_SSOT_PATH =
  'grph-shared/src/payments/straitsxPaymentSsot.ts'

const REQUIREMENT_STATUSES = new Set(['implemented', 'partial', 'not_implemented'])
const OPEN_QUESTION_STATUSES = new Set(['open', 'resolved'])
const OPEN_QUESTION_GATES = new Set(['source', 'providerSandbox', 'non_blocking'])

const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isNonEmptyString = value =>
  typeof value === 'string' && value.trim().length > 0
const isRepositoryRelativePath = value => {
  if (!isNonEmptyString(value) || path.isAbsolute(value) || value.includes('\\')) return false
  const normalized = path.posix.normalize(value)
  return normalized !== '..' && !normalized.startsWith('../')
}

const validateEvidenceEntry = (entry, label, failures) => {
  if (!isRecord(entry)) return failures.push(`${label} must be an object.`)
  if (!isRepositoryRelativePath(entry.file)) {
    failures.push(`${label}.file must be a repository-relative path.`)
  }
  if (!isNonEmptyString(entry.contains)) {
    failures.push(`${label}.contains must be a non-empty string.`)
  }
}

export function validateKnowgrphPaymentsReadinessManifest(manifest) {
  const failures = []
  if (!isRecord(manifest)) return ['Readiness manifest must be a JSON object.']
  if (!isNonEmptyString(manifest.schemaId)) failures.push('Manifest schemaId must be a string.')
  if (!Array.isArray(manifest.runtimeEvidence)) {
    failures.push('Manifest runtimeEvidence must be an array.')
  } else {
    manifest.runtimeEvidence.forEach((entry, index) =>
      validateEvidenceEntry(entry, `runtimeEvidence[${index}]`, failures))
  }
  if (!Array.isArray(manifest.requirements)) {
    failures.push('Manifest requirements must be an array.')
  } else {
    manifest.requirements.forEach((requirement, index) => {
      const label = `requirements[${index}]`
      if (!isRecord(requirement)) return failures.push(`${label} must be an object.`)
      if (!isNonEmptyString(requirement.id)) failures.push(`${label}.id must be a string.`)
      if (!REQUIREMENT_STATUSES.has(requirement.status)) {
        failures.push(`${label}.status is unsupported.`)
      }
      if (!isNonEmptyString(requirement.detail)) {
        failures.push(`${label}.detail must be a string.`)
      }
      if (!Array.isArray(requirement.evidence)) {
        failures.push(`${label}.evidence must be an array.`)
      } else {
        requirement.evidence.forEach((entry, evidenceIndex) =>
          validateEvidenceEntry(entry, `${label}.evidence[${evidenceIndex}]`, failures))
      }
    })
  }
  if (!Array.isArray(manifest.openQuestions)) {
    failures.push('Manifest openQuestions must be an array.')
  } else {
    manifest.openQuestions.forEach((question, index) => {
      const label = `openQuestions[${index}]`
      if (!isRecord(question)) return failures.push(`${label} must be an object.`)
      if (!isNonEmptyString(question.id)) failures.push(`${label}.id must be a string.`)
      if (!OPEN_QUESTION_STATUSES.has(question.status)) {
        failures.push(`${label}.status is unsupported.`)
      }
      if (!OPEN_QUESTION_GATES.has(question.gate)) {
        failures.push(`${label}.gate is unsupported.`)
      }
      if (!isNonEmptyString(question.detail)) {
        failures.push(`${label}.detail must be a string.`)
      }
    })
  }
  return failures
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const readExportedString = (source, exportName) => {
  const match = source.match(
    new RegExp(`export\\s+const\\s+${escapeRegExp(exportName)}\\s*=\\s*(['"])([^'"]+)\\1`),
  )
  if (!match) throw new Error(`Tracked payment SSOT is missing ${exportName}.`)
  return match[2]
}

const readExportedObjectString = (source, exportName, propertyName) => {
  const objectMatch = source.match(
    new RegExp(
      `export\\s+const\\s+${escapeRegExp(exportName)}\\s*=\\s*(?:Object\\.freeze\\(\\s*)?\\{([\\s\\S]*?)\\}\\s*as\\s+const\\s*\\)?`,
    ),
  )
  if (!objectMatch) throw new Error(`Tracked payment SSOT is missing ${exportName}.`)
  const propertyMatch = objectMatch[1].match(
    new RegExp(`(?:^|\\n)\\s*${escapeRegExp(propertyName)}\\s*:\\s*(['"])([^'"]+)\\1`),
  )
  if (!propertyMatch) {
    throw new Error(`Tracked payment SSOT is missing ${exportName}.${propertyName}.`)
  }
  return propertyMatch[2]
}

export function readTrackedPaymentContracts(root) {
  const stripeSource = readFileSync(path.join(root, STRIPE_PAYMENT_SSOT_PATH), 'utf8')
  const straitsxSource = readFileSync(path.join(root, STRAITSX_PAYMENT_SSOT_PATH), 'utf8')
  return {
    stripeApiVersion: readExportedString(stripeSource, 'STRIPE_PAYMENT_API_VERSION'),
    stripeSecretNames: [
      readExportedObjectString(stripeSource, 'STRIPE_PAYMENT_ENV_KEYS', 'restrictedKey'),
      readExportedObjectString(stripeSource, 'STRIPE_PAYMENT_ENV_KEYS', 'secretKey'),
      readExportedObjectString(stripeSource, 'STRIPE_PAYMENT_ENV_KEYS', 'webhookSecret'),
    ],
    straitsxSecretNames: [
      readExportedObjectString(straitsxSource, 'STRAITSX_ENV_KEYS', 'apiKey'),
      readExportedObjectString(straitsxSource, 'STRAITSX_ENV_KEYS', 'signingPrivateKey'),
    ],
    straitsxIntegrationModelKey:
      readExportedObjectString(straitsxSource, 'STRAITSX_ENV_KEYS', 'integrationModel'),
    straitsxAuthModeKey:
      readExportedObjectString(straitsxSource, 'STRAITSX_ENV_KEYS', 'authMode'),
  }
}

const parseTomlScalar = value => {
  const trimmed = String(value || '').trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function readVisibleWranglerVars(source) {
  const entries = []
  let section = ''
  for (const line of String(source || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    const sectionMatch = trimmed.match(/^\[\[?([^\]]+)\]\]?\s*(?:#.*)?$/)
    if (sectionMatch) {
      section = sectionMatch[1].trim()
      continue
    }
    const isVisibleVarsSection = section === 'vars' || /^env\..+\.vars$/.test(section)
    if (!isVisibleVarsSection || !trimmed || trimmed.startsWith('#')) continue
    const assignment = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/)
    if (!assignment) continue
    entries.push({
      section,
      name: assignment[1],
      value: parseTomlScalar(assignment[2]),
    })
  }
  return entries
}
