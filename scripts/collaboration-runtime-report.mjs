import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { repoRoot } from './collaboration-contract.mjs'

export const COLLABORATION_RUNTIME_REPORT_SCHEMA = 'agenticgraph.collaboration-runtime-report/v1'
export const COLLABORATION_RUNTIME_REPORT_SCHEMA_PATH = path.resolve(
  repoRoot,
  'schemas',
  'collaboration-runtime-report.v1.schema.json',
)
export const COLLABORATION_RUNTIME_VALIDATION_SCHEMA = 'agenticgraph.collaboration-runtime-validation/v1'
export const COLLABORATION_RUNTIME_VALIDATION_SCHEMA_PATH = path.resolve(
  repoRoot,
  'schemas',
  'collaboration-runtime-validation.v1.schema.json',
)

const createValidatorLoader = schemaPath => {
  let validatorPromise = null
  return async () => {
    if (!validatorPromise) {
      validatorPromise = readFile(schemaPath, 'utf8')
        .then(source => {
          const schema = JSON.parse(source)
          const ajv = new Ajv2020({ allErrors: true, strict: true })
          return { ajv, schema, source, validate: ajv.compile(schema) }
        })
    }
    return validatorPromise
  }
}

const loadReportValidator = createValidatorLoader(COLLABORATION_RUNTIME_REPORT_SCHEMA_PATH)
const loadValidationValidator = createValidatorLoader(COLLABORATION_RUNTIME_VALIDATION_SCHEMA_PATH)
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/

export const validateCollaborationRuntimeSourceRevision = sourceRevision => {
  if (!SOURCE_REVISION_PATTERN.test(sourceRevision)) {
    throw new Error(`invalid collaboration source revision: ${sourceRevision}`)
  }
  return sourceRevision
}

export const resolveCollaborationRuntimeSourceRevision = ({
  environment = process.env,
  cwd = repoRoot,
} = {}) => {
  const configuredRevision = environment.AGENTICGRAPH_SOURCE_REVISION
  if (configuredRevision !== undefined && configuredRevision !== '') {
    return validateCollaborationRuntimeSourceRevision(String(configuredRevision))
  }

  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git rev-parse HEAD exited with status ${result.status}`)
  }
  return validateCollaborationRuntimeSourceRevision(result.stdout.trim())
}

export const readCollaborationRuntimeReportSchema = async () => {
  const { schema } = await loadReportValidator()
  return structuredClone(schema)
}

export const readCollaborationRuntimeReportSchemaSource = async () => {
  const { source } = await loadReportValidator()
  return source
}

export const validateCollaborationRuntimeReport = async report => {
  const { ajv, schema, validate } = await loadReportValidator()
  if (!validate(report)) {
    const detail = ajv.errorsText(validate.errors, { dataVar: 'report', separator: '; ' })
    throw new Error(`invalid ${COLLABORATION_RUNTIME_REPORT_SCHEMA}: ${detail}`)
  }
  return {
    schemaId: schema.$id,
    schemaVersion: report.schema,
    sourceRevision: report.sourceRevision,
  }
}

export const calculateCollaborationRuntimeReportDigest = source => (
  createHash('sha256').update(source).digest('hex')
)

export const readCollaborationRuntimeValidationSchema = async () => {
  const { schema } = await loadValidationValidator()
  return structuredClone(schema)
}

export const readCollaborationRuntimeValidationSchemaSource = async () => {
  const { source } = await loadValidationValidator()
  return source
}

export const validateCollaborationRuntimeValidation = async envelope => {
  const { ajv, validate } = await loadValidationValidator()
  if (!validate(envelope)) {
    const detail = ajv.errorsText(validate.errors, { dataVar: 'validation', separator: '; ' })
    throw new Error(`invalid ${COLLABORATION_RUNTIME_VALIDATION_SCHEMA}: ${detail}`)
  }
  return envelope
}

export const validateCollaborationRuntimeValidationSource = async source => {
  const envelope = JSON.parse(source)
  return validateCollaborationRuntimeValidation(envelope)
}

export const validateCollaborationRuntimeValidationArtifact = async artifactPath => {
  const envelope = await validateCollaborationRuntimeValidationSource(await readFile(artifactPath, 'utf8'))
  return { artifactPath, ...envelope }
}

export const validateCollaborationRuntimeValidationPair = (
  envelope,
  reportIdentity,
  expectedSourceRevision = null,
) => {
  if (envelope.status !== 'passed') {
    throw new Error('collaboration validation failure envelopes cannot prove a report pairing')
  }
  if (envelope.reportDigest !== reportIdentity.reportDigest) {
    throw new Error(
      `collaboration report digest mismatch: expected ${envelope.reportDigest}, received ${reportIdentity.reportDigest}`,
    )
  }
  if (envelope.sourceRevision !== reportIdentity.sourceRevision) {
    throw new Error(
      `collaboration source revision mismatch: expected ${envelope.sourceRevision}, received ${reportIdentity.sourceRevision}`,
    )
  }
  if (expectedSourceRevision && reportIdentity.sourceRevision !== expectedSourceRevision) {
    throw new Error(
      `collaboration source revision does not match the expected CI revision: expected ${expectedSourceRevision}, received ${reportIdentity.sourceRevision}`,
    )
  }
  return {
    reportDigest: envelope.reportDigest,
    sourceRevision: envelope.sourceRevision,
  }
}

export const validateCollaborationRuntimeReportSource = async source => {
  const report = JSON.parse(source.toString('utf8'))
  const identity = await validateCollaborationRuntimeReport(report)
  return { ...identity, reportDigest: calculateCollaborationRuntimeReportDigest(source) }
}

export const validateCollaborationRuntimeReportArtifact = async artifactPath => {
  const identity = await validateCollaborationRuntimeReportSource(await readFile(artifactPath))
  return { artifactPath, ...identity }
}
