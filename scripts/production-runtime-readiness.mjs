import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { resolveAgenticCanvasOsDocsRoot } from '../mcp/agentic-canvas-os-docs-runtime.js'
import { repoRoot } from './collaboration-contract.mjs'

export const PRODUCTION_RUNTIME_READINESS_SCHEMA = 'agenticgraph-production-runtime-readiness/v2'
export const PRODUCTION_RUNTIME_READINESS_FILENAME = 'runtime-readiness.json'
const SCHEMA_FILENAME = 'production-runtime-readiness.v2.schema.json'
let validatorPromise = null

export const resolveProductionRuntimeReadinessSchemaPath = ({ rootDir = repoRoot, env = process.env } = {}) => path.resolve(
  resolveAgenticCanvasOsDocsRoot({ rootDir, env }),
  'schemas',
  SCHEMA_FILENAME,
)

const loadValidator = async () => {
  if (!validatorPromise) {
    validatorPromise = fs.readFile(resolveProductionRuntimeReadinessSchemaPath(), 'utf8').then(source => {
      const schema = JSON.parse(source)
      const ajv = new Ajv2020({ allErrors: true, strict: true })
      return { ajv, validate: ajv.compile(schema) }
    })
  }
  return validatorPromise
}

export const validateProductionRuntimeReadiness = async (readiness, expected = {}) => {
  const { ajv, validate } = await loadValidator()
  if (!validate(readiness)) {
    const detail = ajv.errorsText(validate.errors, { dataVar: 'readiness', separator: '; ' })
    throw new Error(`invalid ${PRODUCTION_RUNTIME_READINESS_SCHEMA}: ${detail}`)
  }
  if (readiness.catalogRevision !== readiness.agenticCanvasOs.revision) {
    throw new Error('production catalog revision must equal the Agentic Canvas OS revision')
  }
  const comparisons = [
    ['source revision', readiness.source.revision, expected.sourceRevision],
    ['source tree', readiness.source.tree, expected.sourceTree],
    ['docs revision', readiness.agenticCanvasOs.revision, expected.agenticCanvasOsRevision],
    ['artifact digest', readiness.artifact.digest, expected.artifactDigest],
    ['immutable manifest digest', readiness.immutableManifest.digest, expected.immutableManifestDigest],
  ]
  for (const [label, actual, expectedValue] of comparisons) {
    if (expectedValue && actual !== expectedValue) {
      throw new Error(`production ${label} mismatch: expected ${expectedValue}, received ${actual}`)
    }
  }
  return readiness
}

export const serializeProductionRuntimeReadiness = readiness => `${JSON.stringify(readiness, null, 2)}\n`

export const calculateRuntimeArtifactDigest = async entries => {
  const normalized = await Promise.all(entries.map(async entry => ({
    relativePath: String(entry.relativePath).split(path.sep).join('/'),
    digest: createHash('sha256').update(await fs.readFile(entry.absolutePath)).digest('hex'),
  })))
  normalized.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  const hash = createHash('sha256')
  for (const entry of normalized) hash.update(entry.relativePath).update('\0').update(entry.digest).update('\0')
  return hash.digest('hex')
}
