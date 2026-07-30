import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

export const OPERATOR_INSTRUCTION_DESTINATIONS = Object.freeze(['prod', 'edge'])
export const OPERATOR_INSTRUCTION_FIELDS = Object.freeze([
  'instructionId',
  'artifactIds',
  'destination',
  'timestamp',
])
export const OVERRIDE_RECORD_FIELDS = Object.freeze([
  'conflictId',
  'author',
  'scope',
  'justification',
])
export const PROMOTION_RECORD_FIELDS = Object.freeze([
  'artifactId',
  'sourcePath',
  'destinationPath',
  'instructionId',
  'timestamp',
])

const RECORD_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/

const isPlainObject = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const ownKeysEqual = (record, fields) => {
  if (!isPlainObject(record)) return false
  const actual = Object.keys(record).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

const isNonEmptyText = value => typeof value === 'string' && value.trim() === value && value.length > 0

const isRecordId = value => isNonEmptyText(value) && RECORD_ID_PATTERN.test(value)

const isUtcTimestamp = value => {
  if (!isNonEmptyText(value) || !value.endsWith('Z')) return false
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) return false
  return new Date(milliseconds).toISOString() === value
}

const makeViolation = (code, field, detail) => ({ code, field, detail })

const validateStrictFields = (record, expectedFields) => {
  if (!isPlainObject(record)) {
    return [makeViolation('INVALID_RECORD', '', 'record must be a plain object')]
  }
  if (ownKeysEqual(record, expectedFields)) return []
  const actual = new Set(Object.keys(record))
  const expected = new Set(expectedFields)
  return [
    ...expectedFields
      .filter(field => !actual.has(field))
      .map(field => makeViolation('MISSING_FIELD', field, `${field} is required`)),
    ...Object.keys(record)
      .filter(field => !expected.has(field))
      .map(field => makeViolation('UNKNOWN_FIELD', field, `${field} is not allowed`)),
  ]
}

export const validateOperatorInstruction = (instruction, { attemptedAt } = {}) => {
  const violations = validateStrictFields(instruction, OPERATOR_INSTRUCTION_FIELDS)
  if (!isPlainObject(instruction)) return { ok: false, violations }

  if (!isRecordId(instruction.instructionId)) {
    violations.push(makeViolation(
      'INVALID_INSTRUCTION_ID',
      'instructionId',
      'instructionId must be a safe, non-empty identifier',
    ))
  }
  if (
    !Array.isArray(instruction.artifactIds)
    || instruction.artifactIds.length === 0
    || instruction.artifactIds.some(artifactId => !isRecordId(artifactId))
  ) {
    violations.push(makeViolation(
      'INVALID_ARTIFACT_SET',
      'artifactIds',
      'artifactIds must be a non-empty array of safe identifiers',
    ))
  } else if (new Set(instruction.artifactIds).size !== instruction.artifactIds.length) {
    violations.push(makeViolation(
      'DUPLICATE_ARTIFACT',
      'artifactIds',
      'artifactIds must contain unique identifiers',
    ))
  }
  if (!OPERATOR_INSTRUCTION_DESTINATIONS.includes(instruction.destination)) {
    violations.push(makeViolation(
      'INVALID_DESTINATION',
      'destination',
      'destination must be exactly one of prod or edge',
    ))
  }
  if (!isUtcTimestamp(instruction.timestamp)) {
    violations.push(makeViolation(
      'INVALID_TIMESTAMP',
      'timestamp',
      'timestamp must be a canonical UTC ISO-8601 instant',
    ))
  }
  if (
    attemptedAt !== undefined
    && (
      !isUtcTimestamp(attemptedAt)
      || !isUtcTimestamp(instruction.timestamp)
      || Date.parse(instruction.timestamp) >= Date.parse(attemptedAt)
    )
  ) {
    violations.push(makeViolation(
      'INSTRUCTION_NOT_EARLIER',
      'timestamp',
      'instruction timestamp must be strictly earlier than the attempt',
    ))
  }
  return violations.length === 0
    ? { ok: true, instruction, violations: [] }
    : { ok: false, violations }
}

export const validateOverrideRecord = record => {
  const violations = validateStrictFields(record, OVERRIDE_RECORD_FIELDS)
  if (!isPlainObject(record)) return { ok: false, violations }
  if (!isRecordId(record.conflictId)) {
    violations.push(makeViolation('INVALID_CONFLICT_ID', 'conflictId', 'conflictId must be a safe identifier'))
  }
  for (const field of ['author', 'scope', 'justification']) {
    if (!isNonEmptyText(record[field])) {
      violations.push(makeViolation('INVALID_TEXT', field, `${field} must be non-empty trimmed text`))
    }
  }
  return violations.length === 0
    ? { ok: true, record, violations: [] }
    : { ok: false, violations }
}

export const validatePromotionRecord = record => {
  const violations = validateStrictFields(record, PROMOTION_RECORD_FIELDS)
  if (!isPlainObject(record)) return { ok: false, violations }
  for (const field of ['artifactId', 'instructionId']) {
    if (!isRecordId(record[field])) {
      violations.push(makeViolation('INVALID_RECORD_ID', field, `${field} must be a safe identifier`))
    }
  }
  for (const field of ['sourcePath', 'destinationPath']) {
    if (!isNonEmptyText(record[field])) {
      violations.push(makeViolation('INVALID_PATH', field, `${field} must be non-empty trimmed text`))
    }
  }
  if (!isUtcTimestamp(record.timestamp)) {
    violations.push(makeViolation(
      'INVALID_TIMESTAMP',
      'timestamp',
      'timestamp must be a canonical UTC ISO-8601 instant',
    ))
  }
  return violations.length === 0
    ? { ok: true, record, violations: [] }
    : { ok: false, violations }
}

const recordPath = (ledgerRoot, kind, identifier) => {
  if (!isRecordId(identifier)) throw new Error('ledger identifier is invalid')
  return path.resolve(ledgerRoot, `${kind}-${identifier}.json`)
}

export const instructionRecordPath = (ledgerRoot, instructionId) => (
  recordPath(ledgerRoot, 'instruction', instructionId)
)

const writeExclusiveJson = async (filePath, record) => {
  const handle = await fs.open(filePath, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

const appendValidatedRecord = async ({
  ledgerRoot,
  kind,
  identifier,
  record,
  validation,
  dependencies = {},
}) => {
  if (!validation.ok) {
    return { written: false, code: 'INVALID_RECORD', violations: validation.violations }
  }
  const mkdir = dependencies.mkdir ?? fs.mkdir
  const writeExclusive = dependencies.writeExclusive ?? writeExclusiveJson
  try {
    await mkdir(path.resolve(ledgerRoot), { recursive: true, mode: 0o700 })
    const filePath = recordPath(ledgerRoot, kind, identifier)
    await writeExclusive(filePath, record)
    return { written: true, path: filePath, record }
  } catch (error) {
    return {
      written: false,
      code: error?.code === 'EEXIST' ? 'RECORD_EXISTS' : 'LEDGER_WRITE_FAILED',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const appendInstruction = async (ledgerRoot, instruction, dependencies = {}) => (
  appendValidatedRecord({
    ledgerRoot,
    kind: 'instruction',
    identifier: instruction?.instructionId,
    record: instruction,
    validation: validateOperatorInstruction(instruction),
    dependencies,
  })
)

export const appendOverrideRecord = async (ledgerRoot, record, dependencies = {}) => (
  appendValidatedRecord({
    ledgerRoot,
    kind: 'override',
    identifier: record?.conflictId,
    record,
    validation: validateOverrideRecord(record),
    dependencies,
  })
)

export const appendPromotionRecord = async (ledgerRoot, record, dependencies = {}) => (
  appendValidatedRecord({
    ledgerRoot,
    kind: 'promotion',
    identifier: createHash('sha256')
      .update(`${record?.instructionId ?? ''}\0${record?.artifactId ?? ''}`)
      .digest('hex'),
    record,
    validation: validatePromotionRecord(record),
    dependencies,
  })
)

export const readInstruction = async (ledgerRoot, instructionId, dependencies = {}) => {
  const readFile = dependencies.readFile ?? fs.readFile
  const lstat = dependencies.lstat ?? fs.lstat
  try {
    const filePath = recordPath(ledgerRoot, 'instruction', instructionId)
    const status = await lstat(filePath)
    if (
      !status.isFile()
      || status.isSymbolicLink()
      || status.nlink !== 1
      || (status.mode & 0o077) !== 0
    ) return null
    const source = await readFile(filePath, 'utf8')
    const instruction = JSON.parse(source)
    return validateOperatorInstruction(instruction).ok ? instruction : null
  } catch {
    return null
  }
}

const isStrictDescendant = (parentPath, childPath) => {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return Boolean(relative)
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
}

const nearestExistingRealPath = async (targetPath, realpath) => {
  let candidate = path.resolve(targetPath)
  for (;;) {
    try {
      return await realpath(candidate)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const parent = path.dirname(candidate)
      if (parent === candidate) throw error
      candidate = parent
    }
  }
}

export const appendFixtureInstruction = async (request, dependencies = {}) => {
  const expectedFields = ['instruction', 'ledgerRoot', 'permittedTempRoot']
  const fields = isPlainObject(request) ? Object.keys(request).sort() : []
  if (
    fields.length !== expectedFields.length
    || fields.some((field, index) => field !== expectedFields[index])
  ) {
    return { written: false, code: 'INVALID_FIXTURE_INSTRUCTION_REQUEST' }
  }
  const systemTempRoot = path.resolve(dependencies.systemTempRoot ?? os.tmpdir())
  const fixtureRoot = path.resolve(String(request.permittedTempRoot ?? ''))
  const ledgerRoot = path.resolve(String(request.ledgerRoot ?? ''))
  if (
    !isStrictDescendant(systemTempRoot, fixtureRoot)
    || !isStrictDescendant(fixtureRoot, ledgerRoot)
  ) {
    return { written: false, code: 'OUTSIDE_FIXTURE_ROOT' }
  }

  try {
    const realpath = dependencies.realpath ?? fs.realpath
    const [systemRealPath, fixtureRealPath, ledgerAncestor] = await Promise.all([
      realpath(systemTempRoot),
      realpath(fixtureRoot),
      nearestExistingRealPath(ledgerRoot, realpath),
    ])
    if (
      !isStrictDescendant(systemRealPath, fixtureRealPath)
      || (
        fixtureRealPath !== ledgerAncestor
        && !isStrictDescendant(fixtureRealPath, ledgerAncestor)
      )
    ) {
      return { written: false, code: 'REAL_ROOT_REJECTED' }
    }
    return appendInstruction(ledgerRoot, request.instruction, dependencies)
  } catch (error) {
    return {
      written: false,
      code: 'FIXTURE_INSTRUCTION_FAILED',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
