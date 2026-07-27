import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  appendPromotionRecord,
  readInstruction,
  validateOperatorInstruction,
} from './ledger.mjs'
import { generateDiscoverySurfaces } from './discovery-generate.mjs'
import { parseDiscoveryFiles } from './discovery-parse.mjs'
import { assembleCatalog } from './invocation-assemble.mjs'
import {
  renderDeclaration,
  validateLicenseRegistry,
} from './license-registry.mjs'
import { evaluatePublicationGate } from './publication-gate.mjs'
import { validateRegistry } from './registry-validate.mjs'
import { classifyPath, classifyRoutes } from './route-classify.mjs'
import { scanCandidate } from './secret-scan.mjs'

export const FIXTURE_PROMOTION_ONLY = 'TEMP-FIXTURE-ONLY'
export const FIXTURE_GATE_AUTHORITY_FIELDS = Object.freeze([
  'registry',
  'licenseRegistry',
  'routesManifest',
  'catalogSources',
  'approvedCatalogIds',
  'publishedPaths',
])

const failure = (code, detail, extra = {}) => ({
  promoted: false,
  code,
  detail,
  ...extra,
})

const isStrictDescendant = (parentPath, childPath) => {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

const isWithin = (parentPath, childPath) => (
  path.resolve(parentPath) === path.resolve(childPath)
  || isStrictDescendant(parentPath, childPath)
)

const safeRelativePath = value => {
  if (typeof value !== 'string' || !value || value.trim() !== value || path.isAbsolute(value)) return ''
  const normalized = path.normalize(value)
  if (
    normalized === '.'
    || normalized === '..'
    || normalized.startsWith(`..${path.sep}`)
    || normalized.split(path.sep).includes('.git')
  ) return ''
  return normalized
}

const canonicalUtcTimestamp = value => {
  if (typeof value !== 'string' || !value.endsWith('Z')) return ''
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) return ''
  return new Date(milliseconds).toISOString() === value ? value : ''
}

const isPlainObject = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const validateGateAuthority = authority => {
  if (!isPlainObject(authority)) return failure('GATE_AUTHORITY_REQUIRED', 'trusted gate authority is required')
  const keys = Object.keys(authority).sort()
  const expected = [...FIXTURE_GATE_AUTHORITY_FIELDS].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return failure('INVALID_GATE_AUTHORITY', 'gate authority must contain registry, licenseRegistry, routesManifest, catalogSources, approvedCatalogIds, and publishedPaths')
  }
  if (
    !isPlainObject(authority.registry)
    || !isPlainObject(authority.licenseRegistry)
    || !Array.isArray(authority.catalogSources)
    || !Array.isArray(authority.approvedCatalogIds)
    || authority.approvedCatalogIds.some(candidate => typeof candidate !== 'string')
    || !Array.isArray(authority.publishedPaths)
    || authority.publishedPaths.some(candidate => typeof candidate !== 'string')
    || !(Array.isArray(authority.routesManifest) || isPlainObject(authority.routesManifest))
  ) {
    return failure('INVALID_GATE_AUTHORITY', 'gate authority fields have invalid types')
  }
  return { promoted: true, authority }
}

const validateFixtureRoots = ({
  permittedTempRoot,
  stagingRoot,
  destinationRoot,
  ledgerRoot,
  systemTempRoot,
}) => {
  const fixtureRoot = path.resolve(String(permittedTempRoot || ''))
  const tmpRoot = path.resolve(systemTempRoot)
  if (!isStrictDescendant(tmpRoot, fixtureRoot)) {
    return failure(
      'REAL_ROOT_REJECTED',
      'permittedTempRoot must be a strict descendant of the operating-system temporary directory',
    )
  }
  for (const [label, value] of [
    ['stagingRoot', stagingRoot],
    ['destinationRoot', destinationRoot],
    ['ledgerRoot', ledgerRoot],
  ]) {
    if (!isStrictDescendant(fixtureRoot, path.resolve(String(value || '')))) {
      return failure('OUTSIDE_FIXTURE_ROOT', `${label} must be a strict descendant of permittedTempRoot`)
    }
  }
  return { promoted: true, fixtureRoot }
}

const defaultPathExists = async targetPath => {
  try {
    await fs.lstat(targetPath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

const defaultWriteTransactionFile = async (filePath, bytes) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const handle = await fs.open(filePath, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

const nearestExistingRealPath = async (targetPath, realpath) => {
  let existingPath = path.resolve(targetPath)
  while (true) {
    try {
      return await realpath(existingPath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const parentPath = path.dirname(existingPath)
      if (parentPath === existingPath) throw error
      existingPath = parentPath
    }
  }
}

const validateResolvedRoots = async (request, roots, dependencies) => {
  const realpath = dependencies.realpath ?? fs.realpath
  const systemTempRealPath = await realpath(request.systemTempRoot)
  const fixtureRealPath = await realpath(roots.fixtureRoot)
  if (!isStrictDescendant(systemTempRealPath, fixtureRealPath)) {
    return failure('REAL_ROOT_REJECTED', 'permittedTempRoot resolves outside the operating-system temporary directory')
  }
  const stagingRealPath = await realpath(request.stagingRoot)
  if (!isStrictDescendant(fixtureRealPath, stagingRealPath)) {
    return failure('REAL_ROOT_REJECTED', 'stagingRoot resolves outside permittedTempRoot')
  }
  for (const [label, targetPath] of [
    ['destinationRoot', request.destinationRoot],
    ['ledgerRoot', request.ledgerRoot],
  ]) {
    const realAncestor = await nearestExistingRealPath(targetPath, realpath)
    if (!isWithin(fixtureRealPath, realAncestor)) {
      return failure('REAL_ROOT_REJECTED', `${label} resolves outside permittedTempRoot`)
    }
  }
  return { promoted: true, fixtureRealPath, stagingRealPath, realpath }
}

const isDiscoveryPath = candidatePath => (
  candidatePath.endsWith('robots.txt')
  || candidatePath.endsWith('sitemap.xml')
  || candidatePath.endsWith('llms.txt')
  || candidatePath.endsWith('openapi.json')
  || candidatePath.endsWith('.well-known/api-catalog')
  || candidatePath.endsWith('.well-known/agent-card.json')
  || candidatePath.endsWith('.well-known/mcp.json')
  || candidatePath.includes('/structured-data/')
  || candidatePath.startsWith('structured-data/')
)

const classifyCandidatePaths = (registry, candidatePaths) => {
  const resolved = []
  const unclassified = []
  for (const candidatePath of candidatePaths) {
    const classification = classifyPath(registry, candidatePath)
    if (classification.classified) resolved.push(classification)
    else unclassified.push(candidatePath)
  }
  return { resolved, unclassified }
}

const omittedGatedRoutes = (registry, parsedFiles) => {
  const robotsResult = parsedFiles.get('robots.txt')
  if (!robotsResult) return []
  const disallowedPaths = new Set(robotsResult.crawlControls?.disallowedPaths ?? [])
  return (registry.entries ?? [])
    .filter(entry => entry?.surfaceTier === 'gated' && String(entry?.path ?? '').startsWith('/'))
    .map(entry => entry.path)
    .filter(routePath => !disallowedPaths.has(routePath))
    .sort()
}

const generationBlocks = errors => errors.map(error => ({
  criterionId: error?.field === 'canonicalUrl' ? 'R2.4' : 'R6.9',
  code: error?.field === 'canonicalUrl' ? 'FC-CANONICAL' : 'FC-ENTRY-INVALID',
  subject: error?.artifactId ?? 'discovery-generation',
  field: error?.field,
  detail: String(error?.code ?? 'discovery generation failed'),
}))

const candidateIntegrityBlocks = ({
  preparedArtifacts,
  generated,
  licenseRegistry,
}) => {
  const expectedBytes = new Map(generated.files)
  expectedBytes.set(
    'REUSE.md',
    Buffer.from(renderDeclaration(licenseRegistry), 'utf8'),
  )
  return preparedArtifacts.flatMap(artifact => {
    const expected = expectedBytes.get(artifact.destinationPath)
    if (expected === undefined) {
      return isDiscoveryPath(artifact.destinationPath)
        ? [{
            criterionId: 'R10.1',
            code: 'FC-CANDIDATE-AUTHORITY',
            subject: artifact.artifactId,
            detail: `candidate path is not emitted by the trusted generator: ${artifact.destinationPath}`,
          }]
        : []
    }
    return Buffer.from(artifact.bytes).equals(Buffer.from(expected))
      ? []
      : [{
          criterionId: 'R10.1',
          code: 'FC-CANDIDATE-DRIFT',
          subject: artifact.artifactId,
          detail: `candidate bytes differ from trusted generated bytes: ${artifact.destinationPath}`,
        }]
  })
}

const recomputeGateDecision = ({
  authority,
  preparedArtifacts,
  instruction,
  destination,
  timestamp,
}) => {
  const registryValidation = validateRegistry(authority.registry)
  if (!registryValidation.ok) {
    return evaluatePublicationGate({
      registry: authority.registry,
      registryValidation,
      candidatePaths: preparedArtifacts.map(artifact => artifact.destinationPath),
    }, { now: () => timestamp })
  }

  const candidatePaths = preparedArtifacts.map(artifact => artifact.destinationPath)
  const candidateFiles = preparedArtifacts.map(artifact => ({
    path: artifact.destinationPath,
    bytes: artifact.bytes,
  }))
  const classification = classifyCandidatePaths(authority.registry, candidatePaths)
  const classificationByPath = new Map(
    classification.resolved.map(candidate => [candidate.path, candidate]),
  )
  const identityBlocks = preparedArtifacts
    .filter(artifact => (
      classificationByPath.get(artifact.destinationPath)?.artifactId !== artifact.artifactId
    ))
    .map(artifact => ({
      criterionId: 'R9.9',
      code: 'FC-NO-APPROVAL',
      subject: artifact.artifactId,
      detail: `authorised artifact id does not own destination path ${artifact.destinationPath}`,
    }))
  const scanResult = scanCandidate(candidateFiles, { now: () => timestamp })
  const actualDiscoveryFiles = new Map(
    preparedArtifacts
      .filter(artifact => isDiscoveryPath(artifact.destinationPath))
      .map(artifact => [artifact.destinationPath, artifact.bytes]),
  )
  const parsedFiles = parseDiscoveryFiles(actualDiscoveryFiles)
  const catalog = assembleCatalog(authority.catalogSources, {
    approvedCatalogIds: authority.approvedCatalogIds,
  })
  const generated = generateDiscoverySurfaces(
    authority.registry,
    { invocationCatalog: catalog },
  )
  const integrityBlocks = candidateIntegrityBlocks({
    preparedArtifacts,
    generated,
    licenseRegistry: authority.licenseRegistry,
  })
  const expectedParsedFiles = parseDiscoveryFiles(generated.files)
  const expectedEntryIdsByFile = Object.fromEntries(
    [...actualDiscoveryFiles.keys()].map(fileName => [
      fileName,
      (expectedParsedFiles.get(fileName)?.entries ?? []).map(entry => entry.entryId),
    ]),
  )
  const routes = {
    ...classifyRoutes(authority.registry, authority.routesManifest),
    omittedGatedRoutes: omittedGatedRoutes(authority.registry, parsedFiles),
  }
  const licenseResult = validateLicenseRegistry(authority.licenseRegistry, authority.registry)
  return evaluatePublicationGate({
    registry: authority.registry,
    registryValidation,
    licenseRegistry: authority.licenseRegistry,
    licenseResult,
    catalog,
    candidatePaths,
    candidateFiles,
    classification,
    parsedFiles,
    expectedEntryIdsByFile,
    scanResult,
    routes,
    publishedPaths: authority.publishedPaths,
    injectedBlocks: [
      ...generationBlocks(generated.generationErrors),
      ...identityBlocks,
      ...integrityBlocks,
    ],
    instruction,
    attempt: {
      destination,
      artifactIds: preparedArtifacts.map(artifact => artifact.artifactId),
      timestamp,
    },
  }, { now: () => timestamp })
}

const promoteFixtureUnsafe = async (request = {}, dependencies = {}) => {
  const {
    permittedTempRoot,
    stagingRoot,
    destinationRoot,
    ledgerRoot,
    destination,
    instructionId,
    artifacts,
    attemptTimestamp,
  } = request
  const systemTempRoot = path.resolve(dependencies.systemTempRoot ?? os.tmpdir())
  const roots = validateFixtureRoots({
    permittedTempRoot,
    stagingRoot,
    destinationRoot,
    ledgerRoot,
    systemTempRoot,
  })
  if (!roots.promoted) return roots
  const resolvedRoots = await validateResolvedRoots({
    systemTempRoot,
    stagingRoot,
    destinationRoot,
    ledgerRoot,
  }, roots, dependencies)
  if (!resolvedRoots.promoted) return resolvedRoots
  if (Object.hasOwn(request, 'instruction')) {
    return failure('INLINE_INSTRUCTION_FORBIDDEN', 'promotion accepts only an instructionId read from the append-only ledger')
  }
  if (Object.hasOwn(request, 'gateResult')) {
    return failure('CALLER_GATE_RESULT_FORBIDDEN', 'promotion recomputes the gate and does not accept caller-supplied decisions')
  }
  const gateAuthorityValidation = validateGateAuthority(dependencies.gateAuthority)
  if (!gateAuthorityValidation.promoted) return gateAuthorityValidation

  const timestamp = canonicalUtcTimestamp(attemptTimestamp)
  if (!timestamp) return failure('INVALID_ATTEMPT_TIMESTAMP', 'attemptTimestamp must be a canonical UTC ISO-8601 instant')
  const instruction = await readInstruction(ledgerRoot, instructionId)
  if (!instruction) {
    return failure('NO_RECORDED_INSTRUCTION', 'instructionId does not resolve to a valid append-only ledger record')
  }
  const instructionValidation = validateOperatorInstruction(instruction, { attemptedAt: timestamp })
  if (!instructionValidation.ok) {
    return failure('INVALID_INSTRUCTION', 'fixture promotion requires a valid earlier instruction', {
      violations: instructionValidation.violations,
    })
  }
  if (destination !== instruction.destination) {
    return failure('UNAUTHORISED_DESTINATION', 'attempt destination is not authorised by the instruction', {
      destination,
    })
  }
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return failure('EMPTY_PROMOTION', 'at least one fixture artifact is required')
  }

  const authorisedArtifactIds = new Set(instruction.artifactIds)
  const normalizedArtifacts = []
  const artifactIds = new Set()
  const destinationPaths = new Set()
  for (const artifact of artifacts) {
    const artifactId = typeof artifact?.artifactId === 'string' ? artifact.artifactId : ''
    const sourcePath = safeRelativePath(artifact?.sourcePath)
    const destinationPath = safeRelativePath(artifact?.destinationPath)
    if (!authorisedArtifactIds.has(artifactId)) {
      return failure('UNAUTHORISED_ARTIFACT', 'artifact is not authorised by the instruction', { artifactId })
    }
    if (!sourcePath || !destinationPath) {
      return failure('UNSAFE_ARTIFACT_PATH', 'sourcePath and destinationPath must be safe relative paths', {
        artifactId,
      })
    }
    if (artifactIds.has(artifactId)) {
      return failure('DUPLICATE_ARTIFACT', 'fixture promotion must name each artifact exactly once', {
        artifactId,
      })
    }
    if (destinationPaths.has(destinationPath)) {
      return failure('DUPLICATE_DESTINATION_PATH', 'fixture artifacts must have unique destination paths', {
        destinationPath,
      })
    }
    artifactIds.add(artifactId)
    destinationPaths.add(destinationPath)
    normalizedArtifacts.push({ artifactId, sourcePath, destinationPath })
  }

  const readFile = dependencies.readFile ?? fs.readFile
  const pathExists = dependencies.pathExists ?? defaultPathExists
  const writeTransactionFile = dependencies.writeTransactionFile ?? defaultWriteTransactionFile
  const rename = dependencies.rename ?? fs.rename
  const mkdir = dependencies.mkdir ?? fs.mkdir
  const remove = dependencies.remove ?? ((targetPath, options) => fs.rm(targetPath, options))
  const recordPromotion = dependencies.appendPromotionRecord ?? appendPromotionRecord
  const resolvedDestinationRoot = path.resolve(destinationRoot)
  if (await pathExists(resolvedDestinationRoot)) {
    return failure('DESTINATION_EXISTS', 'fixture destination root must not already exist')
  }

  const preparedArtifacts = []
  try {
    for (const artifact of normalizedArtifacts) {
      const sourceAbsolutePath = path.resolve(stagingRoot, artifact.sourcePath)
      if (!isStrictDescendant(stagingRoot, sourceAbsolutePath)) {
        return failure('SOURCE_OUTSIDE_STAGING', 'artifact source resolves outside stagingRoot', {
          artifactId: artifact.artifactId,
        })
      }
      const sourceRealPath = await resolvedRoots.realpath(sourceAbsolutePath)
      if (!isStrictDescendant(resolvedRoots.stagingRealPath, sourceRealPath)) {
        return failure('SOURCE_OUTSIDE_STAGING', 'artifact source resolves outside stagingRoot', {
          artifactId: artifact.artifactId,
        })
      }
      preparedArtifacts.push({ ...artifact, bytes: await readFile(sourceRealPath) })
    }
  } catch (error) {
    return failure('SOURCE_READ_FAILED', error instanceof Error ? error.message : String(error))
  }

  const gateDecision = recomputeGateDecision({
    authority: gateAuthorityValidation.authority,
    preparedArtifacts,
    instruction,
    destination,
    timestamp,
  })
  if (gateDecision.decision !== 'permit' || gateDecision.blocks.length > 0) {
    return failure('GATE_NOT_PERMITTED', 'recomputed publication decision did not permit the fixture candidate', {
      blocks: gateDecision.blocks,
    })
  }

  const transactionRoot = path.resolve(
    roots.fixtureRoot,
    `.surface-promotion-${instruction.instructionId}-${Date.parse(timestamp)}`,
  )
  if (await pathExists(transactionRoot)) {
    return failure('TRANSACTION_EXISTS', 'fixture promotion transaction already exists')
  }

  const promotionRecords = preparedArtifacts.map(artifact => ({
    artifactId: artifact.artifactId,
    sourcePath: artifact.sourcePath,
    destinationPath: artifact.destinationPath,
    instructionId: instruction.instructionId,
    timestamp,
  }))

  let destinationCreated = false
  let recordingStarted = false
  let ledgerFailure = null
  let unsafeRecordPath = ''
  const writtenRecordPaths = []
  try {
    await mkdir(transactionRoot, { recursive: false, mode: 0o700 })
    for (const artifact of preparedArtifacts) {
      await writeTransactionFile(path.resolve(transactionRoot, artifact.destinationPath), artifact.bytes)
    }

    await rename(transactionRoot, resolvedDestinationRoot)
    destinationCreated = true
    recordingStarted = true
    for (const record of promotionRecords) {
      const result = await recordPromotion(ledgerRoot, record)
      if (!result?.written) {
        ledgerFailure = { record, ledgerResult: result }
        throw new Error('promotion record could not be appended')
      }
      const recordPath = typeof result.path === 'string' ? path.resolve(result.path) : ''
      if (!recordPath || !isStrictDescendant(ledgerRoot, recordPath)) {
        unsafeRecordPath = recordPath || 'unavailable'
        ledgerFailure = { record, ledgerResult: result, recordPath }
        throw new Error('promotion record path is not rollback-safe')
      }
      writtenRecordPaths.push(recordPath)
    }

    return {
      promoted: true,
      mode: FIXTURE_PROMOTION_ONLY,
      destination,
      destinationRoot: resolvedDestinationRoot,
      instructionId: instruction.instructionId,
      artifactIds: preparedArtifacts.map(artifact => artifact.artifactId),
      gateDecision: gateDecision.decision,
      records: promotionRecords,
    }
  } catch (error) {
    const rollbackTargets = [
      ...writtenRecordPaths.reverse(),
      destinationCreated ? resolvedDestinationRoot : transactionRoot,
    ]
    const rollbackFailures = unsafeRecordPath
      ? [{ path: unsafeRecordPath, detail: 'promotion record path cannot be safely rolled back' }]
      : []
    for (const targetPath of rollbackTargets) {
      await remove(targetPath, { recursive: true, force: true }).catch(rollbackError => {
        rollbackFailures.push({
          path: targetPath,
          detail: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        })
      })
    }
    if (rollbackFailures.length > 0) {
      return failure('TRANSACTION_ROLLBACK_FAILED', 'fixture promotion rollback was incomplete', {
        rollbackFailures,
      })
    }
    return recordingStarted
      ? failure('LEDGER_WRITE_FAILED', error instanceof Error ? error.message : String(error), ledgerFailure ?? {})
      : failure('FIXTURE_PROMOTION_FAILED', error instanceof Error ? error.message : String(error))
  }
}

export const promoteFixture = async (request = {}, dependencies = {}) => {
  try {
    return await promoteFixtureUnsafe(request, dependencies)
  } catch (error) {
    return failure(
      'FIXTURE_PROMOTION_FAILED',
      error instanceof Error ? error.message : String(error),
    )
  }
}

export default promoteFixture
