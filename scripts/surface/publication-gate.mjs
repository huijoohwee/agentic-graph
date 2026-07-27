import { validateOperatorInstruction, validateOverrideRecord } from './ledger.mjs'
export const PUBLICATION_DECISIONS = Object.freeze(['permit', 'block'])
export const PUBLICATION_GATE_STAGES = Object.freeze([
  'tier-resolution', 'secret-scan', 'discovery-parse', 'license-check', 'invocation-check', 'approval-check',
])
const PUBLIC_TIERS = new Set(['public-discoverable', 'public-artifact'])
const PROTECTED_TIERS = new Set(['gated', 'private'])
const HOSTED_PREFIX_ROLES = new Set(['/', '@', '#', 'action', 'binding', 'semantic'])
const asArray = value => Array.isArray(value) ? value : []
const registryEntries = registry => asArray(registry?.entries ?? registry?.artifacts)
const text = value => String(value ?? '').trim()
const uniqueSorted = values => [...new Set(asArray(values).map(value => (
  typeof value === 'string'
    ? value
    : value?.path ?? value?.artifactId ?? value?.entryId ?? value?.token ?? ''
)).map(text).filter(Boolean))].sort()
const timestampFrom = now => {
  try {
    const value = typeof now === 'function' ? now() : new Date().toISOString()
    const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value)
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : new Date(0).toISOString()
  } catch {
    return new Date(0).toISOString()
  }
}
const isPromiseLike = value => Boolean(value && typeof value.then === 'function')
const normalizeBlock = block => ({
  criterionId: text(block?.criterionId) || 'policy',
  code: text(block?.code) || 'FC-POLICY',
  subject: text(block?.subject) || 'publication-candidate',
  detail: text(block?.detail) || 'policy criterion was not satisfied',
  ...(block?.field ? { field: text(block.field) } : {}),
  ...(block?.recordedTier ? { recordedTier: text(block.recordedTier) } : {}),
})
const blockKey = block => [
  block.criterionId, block.code, block.subject, block.detail, block.field ?? '',
].join('\0')
const pathPatternMatches = (pattern, candidatePath) => {
  const normalizedPattern = text(pattern).replaceAll('\\', '/')
  const normalizedCandidate = text(candidatePath).replaceAll('\\', '/')
  if (!normalizedPattern || !normalizedCandidate) return false
  if (normalizedPattern === normalizedCandidate) return true
  if (normalizedPattern.endsWith('/')) return normalizedCandidate.startsWith(normalizedPattern)
  if (!normalizedPattern.includes('*')) return false
  const source = normalizedPattern
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`).test(normalizedCandidate)
}
const fallbackRegistryValidation = registry => {
  const entries = registryEntries(registry)
  if (!registry || !Array.isArray(registry?.entries ?? registry?.artifacts)) {
    return {
      ok: false,
      violations: [{ code: 'MISSING_FIELD', artifactId: 'registry', field: 'entries' }],
    }
  }
  const violations = []
  for (const entry of entries) {
    if (!text(entry?.artifactId)) {
      violations.push({ code: 'MISSING_FIELD', artifactId: 'unknown', field: 'artifactId' })
    }
    if (!['public-discoverable', 'public-artifact', 'gated', 'private'].includes(entry?.surfaceTier)) {
      violations.push({
        code: Array.isArray(entry?.surfaceTier) ? 'MULTI_TIER' : 'UNKNOWN_TIER',
        artifactId: text(entry?.artifactId) || 'unknown',
        field: 'surfaceTier',
      })
    }
  }
  return { ok: violations.length === 0, violations }
}
const registryCriterionFor = code => ({
  MULTI_TIER: 'R1.3',
  CLASS_TIER_VIOLATION: 'R1.11',
  UNKNOWN_TIER: 'R1.12',
  MISSING_FIELD: 'R1.13',
  REPO_VISIBILITY: 'R1.17',
  UNLICENSED: 'R7.2',
})[code] ?? 'R1.1'
const strictAbsoluteUrl = value => {
  try {
    const parsed = new URL(text(value))
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname)
  } catch {
    return false
  }
}
const metadataStubFor = conflict => {
  const values = {
    capabilityName: text(conflict?.capabilityName ?? conflict?.name),
    summary: text(conflict?.summary),
    surfaceTier: text(conflict?.surfaceTier),
    authorisationUrl: text(conflict?.authorisationUrl ?? conflict?.authorizationUrl ?? conflict?.contactUrl),
  }
  const missingFields = []
  if (!values.capabilityName) missingFields.push('capabilityName')
  if (!values.summary || values.summary.length > 200 || /[\r\n]/.test(values.summary)) missingFields.push('summary')
  if (!['public-discoverable', 'public-artifact', 'gated', 'private'].includes(values.surfaceTier)) missingFields.push('surfaceTier')
  if (!strictAbsoluteUrl(values.authorisationUrl)) missingFields.push('authorisationUrl')
  return missingFields.length > 0 ? { stub: null, missingFields } : { stub: values, missingFields: [] }
}
const normalizeParsedFiles = parsedFiles => {
  if (parsedFiles instanceof Map) return [...parsedFiles.entries()].map(([name, result]) => ({ name, ...result }))
  if (Array.isArray(parsedFiles)) return parsedFiles
  if (parsedFiles && typeof parsedFiles === 'object') return Object.entries(parsedFiles).map(([name, result]) => ({ name, ...result }))
  return []
}
const invocationFailureCode = failure => {
  const code = text(failure?.code)
  if (/MCP|PUBLIC_READ|SPEND/i.test(code)) return 'FC-MCP-ROUTE'
  if (/TOKEN|FORWARDER|ENDPOINT/i.test(code)) return 'FC-TOKEN-ROUTE'
  return 'FC-ENTRY-INVALID'
}
export const evaluatePublicationGate = (input = {}, dependencies = {}) => {
  const timestamp = timestampFrom(dependencies.now)
  const blocks = []
  const blockKeys = new Set()
  const skipped = []
  const stubs = []
  const conflictRecords = []
  const addBlock = block => {
    const normalized = normalizeBlock(block)
    const key = blockKey(normalized)
    if (blockKeys.has(key)) return
    blockKeys.add(key)
    blocks.push(normalized)
  }
  let validation
  try {
    validation = input.registryValidation
      ?? (typeof dependencies.validateRegistry === 'function'
        ? dependencies.validateRegistry(input.registry)
        : fallbackRegistryValidation(input.registry))
    if (isPromiseLike(validation)) throw new Error('registry validator must be synchronous')
  } catch (error) {
    validation = {
      ok: false,
      violations: [{
        code: 'VALIDATOR_FAILED',
        artifactId: 'registry',
        field: 'registry',
        detail: error instanceof Error ? error.message : String(error),
      }],
    }
  }
  if (validation?.ok !== true) {
    const violations = asArray(validation?.violations)
    for (const violation of violations.length ? violations : [{ code: 'INVALID_REGISTRY', artifactId: 'registry' }]) {
      addBlock({
        criterionId: registryCriterionFor(violation?.code),
        code: 'FC-REGISTRY-ILLEGAL',
        subject: violation?.artifactId ?? 'registry',
        field: violation?.field,
        detail: `${text(violation?.code) || 'INVALID_REGISTRY'}${violation?.field ? ` in ${text(violation.field)}` : ''}`,
      })
    }
    for (const stage of PUBLICATION_GATE_STAGES) {
      skipped.push({ stage, reason: 'invalid-registry', dependency: 'registry-validation' })
    }
    return {
      decision: 'block',
      blocks,
      candidateCount: asArray(input.candidatePaths).length,
      timestamp,
      skipped,
      dependencySkipped: skipped,
      stubs,
      conflictRecords,
      statePreserved: true,
    }
  }

  const entries = registryEntries(input.registry)
  const entryById = new Map(entries.map(entry => [text(entry?.artifactId), entry]))
  const addEntryBlock = (criterionId, code, entry, field, detail) => addBlock({
    criterionId, code, subject: entry?.artifactId, field, detail,
  })
  const canonicalOwners = new Map()
  for (const entry of entries) {
    if (entry?.surfaceTier === 'public-discoverable') {
      const canonicalUrl = text(entry?.canonicalUrl)
      const previousOwner = canonicalOwners.get(canonicalUrl)
      if (!strictAbsoluteUrl(canonicalUrl)) {
        addEntryBlock('R2.4', 'FC-CANONICAL', entry, 'canonicalUrl', 'public-discoverable artifact has no canonical absolute URL')
      } else if (previousOwner) {
        addEntryBlock('R2.6', 'FC-CANONICAL', entry, 'canonicalUrl', `canonical URL collides with ${previousOwner}: ${canonicalUrl}`)
      } else canonicalOwners.set(canonicalUrl, text(entry?.artifactId))
    }
  }
  const publishedPaths = Array.isArray(input.publishedPaths)
    ? uniqueSorted(input.publishedPaths)
    : null
  for (const entry of entries.filter(candidate => candidate?.surfaceTier === 'public-artifact' || (candidate?.surfaceTier === 'public-discoverable' && text(candidate?.representingPage)))) {
    const representingPage = text(entry?.representingPage)
    if (!representingPage) {
      addEntryBlock('R2.9', 'FC-REPRESENTING-PAGE', entry, 'representingPage', 'public artifact has no declared representing page')
    } else if (!publishedPaths) {
      addEntryBlock('R2.9', 'FC-REPRESENTING-PAGE', entry, 'representingPage', 'trusted published-path evidence is required')
    } else if (!publishedPaths.includes(representingPage)) {
      addEntryBlock('R2.9', 'FC-REPRESENTING-PAGE', entry, 'representingPage', `declared representing page does not resolve to a published path: ${representingPage}`)
    }
  }
  const candidatePaths = uniqueSorted(input.candidatePaths)
  const candidateFiles = asArray(input.candidateFiles).length > 0 ? input.candidateFiles : candidatePaths
  let classification = input.classification ?? input.tierResolution ?? null
  if (!classification && typeof dependencies.resolveCandidateTiers === 'function') {
    try {
      classification = dependencies.resolveCandidateTiers(input.registry, candidatePaths)
      if (isPromiseLike(classification)) throw new Error('tier resolver must be synchronous')
    } catch (error) {
      addBlock({
        criterionId: 'R5.9',
        code: 'FC-UNCLASSIFIED',
        subject: 'candidate-set',
        detail: `tier resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
  if (!classification) {
    const resolved = []
    const unclassified = []
    for (const candidatePath of candidatePaths) {
      const entry = entries.find(candidate => pathPatternMatches(candidate?.path, candidatePath))
      if (entry) resolved.push({ path: candidatePath, tier: entry.surfaceTier, entry })
      else unclassified.push(candidatePath)
    }
    classification = { resolved, unclassified }
  }

  for (const candidatePath of uniqueSorted(classification?.unclassified)) {
    addBlock({
      criterionId: 'R5.10',
      code: 'FC-UNCLASSIFIED',
      subject: candidatePath,
      detail: 'unclassified candidate resolves fail-closed to private',
    })
  }
  const resolvedCandidates = asArray(classification?.resolved ?? classification?.entries)
  for (const candidate of resolvedCandidates) {
    if (candidate?.tier === 'private' || candidate?.surfaceTier === 'private') {
      addBlock({
        criterionId: 'R5.2',
        code: 'FC-SOURCE-LEAK',
        subject: candidate?.path ?? candidate?.artifactId,
        detail: 'private material is present in the publication candidate',
      })
    }
  }
  for (const sourceLeak of asArray(input.sourceLeaks ?? classification?.sourceLeaks)) {
    addBlock({
      criterionId: sourceLeak?.sourceMap ? 'R5.3' : 'R5.2',
      code: 'FC-SOURCE-LEAK',
      subject: sourceLeak?.path ?? sourceLeak,
      detail: sourceLeak?.sourceMap
        ? 'source map references private source content'
        : 'private source content is present',
    })
  }
  for (const moduleId of uniqueSorted([
    ...asArray(input.allowlistResult?.registryOnly),
    ...asArray(input.allowlistResult?.allowlistOnly),
    ...asArray(classification?.allowlistDisagreements),
  ])) {
    addBlock({
      criterionId: 'R5.5',
      code: 'FC-ALLOWLIST',
      subject: moduleId,
      detail: 'Publish Allowlist and Surface Registry disagree',
    })
  }

  let scanResult = input.scanResult ?? null
  if (!scanResult && typeof dependencies.scanCandidate === 'function') {
    try {
      scanResult = dependencies.scanCandidate(candidateFiles, input.scanOptions)
      if (isPromiseLike(scanResult)) throw new Error('secret scanner must be synchronous')
    } catch (error) {
      scanResult = {
        complete: false,
        scannedCount: 0,
        cause: error instanceof Error ? error.message : String(error),
        matches: [],
      }
    }
  }
  if (candidateFiles.length > 0 && scanResult?.complete !== true) {
    addBlock({
      criterionId: 'R6.4',
      code: 'FC-SCAN-INCOMPLETE',
      subject: 'candidate-set',
      detail: text(scanResult?.cause) || 'secret scan did not cover every candidate file',
    })
  }
  if (
    scanResult?.complete === true
    && Number.isInteger(scanResult?.scannedCount)
    && scanResult.scannedCount !== candidateFiles.length
  ) {
    addBlock({
      criterionId: 'R6.4',
      code: 'FC-SCAN-INCOMPLETE',
      subject: 'candidate-set',
      detail: 'secret scan count does not equal candidate file count',
    })
  }
  for (const match of asArray(scanResult?.matches)) {
    addBlock({
      criterionId: 'R6.2',
      code: 'FC-SECRET',
      subject: match?.path,
      detail: `${text(match?.category) || 'secret-match'} at line ${Number(match?.line) || 0}`,
    })
  }

  let parsedFiles = input.parsedFiles
  if (!parsedFiles && typeof dependencies.parseDiscoveryFiles === 'function') {
    try {
      parsedFiles = dependencies.parseDiscoveryFiles(input.discoveryFiles)
      if (isPromiseLike(parsedFiles)) throw new Error('discovery parser must be synchronous')
    } catch (error) {
      parsedFiles = [{
        name: 'discovery-files',
        error: { line: 0, detail: error instanceof Error ? error.message : String(error) },
      }]
    }
  }
  for (const parsedFile of normalizeParsedFiles(parsedFiles)) {
    const fileName = text(parsedFile?.name ?? parsedFile?.file) || 'discovery-file'
    if (parsedFile?.error) {
      addBlock({
        criterionId: 'R10.9',
        code: 'FC-PARSE',
        subject: fileName,
        detail: `first offending line ${Number(parsedFile.error.line) || 0}`,
      })
      continue
    }
    const actualIds = uniqueSorted(asArray(parsedFile?.entries).map(entry => entry?.entryId))
    const expectedIds = uniqueSorted(
      parsedFile?.expectedEntryIds ?? input.expectedEntryIdsByFile?.[fileName] ?? [],
    )
    for (const parsedEntry of asArray(parsedFile?.entries)) {
      const registered = entryById.get(text(parsedEntry?.entryId))
      if (registered && PROTECTED_TIERS.has(registered.surfaceTier)) {
        addBlock({
          criterionId: 'R10.7',
          code: 'FC-GATED-LISTED',
          subject: registered.artifactId,
          recordedTier: registered.surfaceTier,
          detail: `${fileName} lists an entry recorded as ${registered.surfaceTier}`,
        })
      }
    }
    if (expectedIds.length > 0 || parsedFile?.expectedEntryIds || input.expectedEntryIdsByFile?.[fileName]) {
      const actual = new Set(actualIds)
      const expected = new Set(expectedIds)
      for (const entryId of [...actual].filter(id => !expected.has(id)).sort()) {
        addBlock({
          criterionId: 'R10.8',
          code: 'FC-DRIFT',
          subject: entryId,
          detail: `${fileName}: present in file but absent from expected registry projection`,
        })
      }
      for (const entryId of [...expected].filter(id => !actual.has(id)).sort()) {
        addBlock({
          criterionId: 'R10.8',
          code: 'FC-DRIFT',
          subject: entryId,
          detail: `${fileName}: present in expected registry projection but absent from file`,
        })
      }
    }
  }

  const routes = input.routes ?? input.routeClassification ?? {}
  for (const routePath of uniqueSorted(routes?.unclassified)) {
    addBlock({
      criterionId: 'R13.7',
      code: 'FC-UNCLASSIFIED',
      subject: routePath,
      detail: 'routed path is unclassified and resolves fail-closed to private',
    })
  }
  for (const routePath of uniqueSorted(routes?.missingRateLimit)) {
    addBlock({
      criterionId: 'R13.10',
      code: 'FC-RATELIMIT',
      subject: routePath,
      field: 'rateLimit',
      detail: 'gated fetch-on-behalf route has no recorded rate limit',
    })
  }
  for (const routePath of uniqueSorted(input.omittedGatedRoutes ?? routes?.omittedGatedRoutes)) {
    addBlock({
      criterionId: 'R13.5',
      code: 'FC-ROBOTS-OMISSION',
      subject: routePath,
      detail: 'robots.txt omits a disallow directive for a gated route',
    })
  }

  let licenseResult = input.licenseResult ?? null
  if (!licenseResult && typeof dependencies.validateLicenseRegistry === 'function') {
    try {
      licenseResult = dependencies.validateLicenseRegistry(input.licenseRegistry, input.registry)
      if (isPromiseLike(licenseResult)) throw new Error('license validator must be synchronous')
    } catch (error) {
      licenseResult = {
        ok: false,
        violations: [{ artifactId: 'license-registry', detail: error instanceof Error ? error.message : String(error) }],
      }
    }
  }
  for (const entry of entries.filter(entry => PUBLIC_TIERS.has(entry?.surfaceTier) && !text(entry?.licenseId))) {
    addBlock({
      criterionId: 'R7.3',
      code: 'FC-LICENSE',
      subject: entry.artifactId,
      detail: 'public artifact has no license identifier',
    })
  }
  for (const violation of asArray(licenseResult?.violations)) {
    addBlock({
      criterionId: text(violation?.criterionId) || 'R7.11',
      code: 'FC-LICENSE',
      subject: violation?.artifactId ?? violation?.artifactClass ?? 'license-registry',
      field: violation?.field,
      detail: text(violation?.detail ?? violation?.code) || 'license registry violation',
    })
  }

  let catalog = input.catalog ?? null
  if (!catalog && typeof dependencies.assembleCatalog === 'function') {
    try {
      catalog = dependencies.assembleCatalog(input.catalogSources ?? [])
      if (isPromiseLike(catalog)) throw new Error('catalog assembler must be synchronous')
    } catch (error) {
      catalog = {
        entries: [],
        validationFailures: [{ token: 'catalog', detail: error instanceof Error ? error.message : String(error) }],
      }
    }
  }
  for (const failure of asArray(catalog?.validationFailures)) {
    addBlock({
      criterionId: text(failure?.criterionId) || 'R4.8',
      code: invocationFailureCode(failure),
      subject: failure?.token ?? failure?.toolId ?? 'catalog-entry',
      field: failure?.field,
      detail: text(failure?.detail ?? failure?.code) || 'invocation entry is invalid',
    })
  }
  for (const entry of asArray(catalog?.entries)) {
    const prefixRole = text(entry?.prefixRole)
    const hostedToken = HOSTED_PREFIX_ROLES.has(prefixRole) || /^[\/@#]/.test(text(entry?.token))
    const route = text(entry?.executionRoute ?? entry?.ingressRoute)
    const targetRoute = text(entry?.targetExecutionRoute ?? entry?.executionRouteTier)
    if (hostedToken) {
      const containsEndpoint = [entry?.label, entry?.intentSummary, entry?.summary]
        .some(value => /https?:\/\//i.test(String(value ?? '')))
      if (containsEndpoint || route !== 'invocation-forwarder' || (entry?.spendBearing && targetRoute !== 'control-plane-mcp')) {
        addBlock({
          criterionId: 'R4.11',
          code: 'FC-TOKEN-ROUTE',
          subject: entry?.token,
          detail: 'hosted invocation token must expose metadata only and route through the invocation forwarder',
        })
      }
    } else if (
      (route === 'public-read-mcp' && entry?.readOnly !== true)
      || (entry?.spendBearing === true && route !== 'control-plane-mcp')
    ) {
      addBlock({
        criterionId: entry?.spendBearing ? 'R3.18' : 'R3.17',
        code: 'FC-MCP-ROUTE',
        subject: entry?.token ?? entry?.name,
        detail: 'non-read-only or spend-bearing capability must execute through the control-plane MCP endpoint',
      })
    }
  }
  const expectedDigest = text(
    input.expectedCatalogDigest ?? input.registryCatalogDigest ?? input.registry?.catalogDigest,
  )
  if (expectedDigest && text(catalog?.digest) !== expectedDigest) {
    addBlock({
      criterionId: 'R4.5',
      code: 'FC-DIGEST',
      subject: 'invocation-catalog',
      detail: `published digest ${text(catalog?.digest) || 'missing'} differs from registry digest ${expectedDigest}`,
    })
  }

  const attempt = input.attempt ?? (
    input.destination
      ? {
          destination: input.destination,
          artifactIds: input.artifactIds ?? candidatePaths,
          timestamp: input.attemptTimestamp ?? timestamp,
        }
      : null
  )
  if (attempt) {
    const instructionValidator = dependencies.validateInstruction ?? validateOperatorInstruction
    let instructionResult
    try {
      instructionResult = instructionValidator(input.instruction, { attemptedAt: attempt.timestamp })
      if (isPromiseLike(instructionResult)) throw new Error('instruction validator must be synchronous')
    } catch (error) {
      instructionResult = { ok: false, violations: [{ detail: error instanceof Error ? error.message : String(error) }] }
    }
    const attemptedArtifactIds = uniqueSorted(attempt.artifactIds)
    const authorised = new Set(asArray(input.instruction?.artifactIds))
    const destinationAuthorised = input.instruction?.destination === attempt.destination
    if (instructionResult?.ok !== true || !destinationAuthorised) {
      addBlock({
        criterionId: 'R9.5',
        code: 'FC-NO-APPROVAL',
        subject: text(attempt.destination) || 'destination',
        detail: 'no matching, earlier Operator Instruction authorises this destination',
      })
    }
    for (const artifactId of attemptedArtifactIds.filter(id => !authorised.has(id))) {
      addBlock({
        criterionId: 'R9.9',
        code: 'FC-NO-APPROVAL',
        subject: artifactId,
        detail: 'artifact is not authorised by the Operator Instruction',
      })
    }
  }

  const overrides = asArray(input.overrides)
  const namedConflictIds = new Set(asArray(input.conflicts).map(conflict => text(conflict?.conflictId)))
  for (const override of overrides.filter(record => !namedConflictIds.has(text(record?.conflictId)))) {
    addBlock({
      criterionId: 'R8.9',
      code: 'FC-OVERRIDE',
      subject: override?.conflictId ?? 'override',
      detail: 'override does not name a candidate conflict',
    })
  }
  for (const conflict of asArray(input.conflicts)) {
    const conflictId = text(conflict?.conflictId) || 'unknown-conflict'
    const artifactId = text(conflict?.artifactId) || 'unknown-artifact'
    const override = overrides.find(record => text(record?.conflictId) === conflictId)
    const overrideValidation = override ? validateOverrideRecord(override) : null
    if (override && overrideValidation?.ok && conflict?.surfaceTier !== 'private') {
      conflictRecords.push({
        conflictId,
        artifactId,
        outcome: 'override-applied',
        timestampUtc: timestamp,
      })
      continue
    }
    if (override) {
      addBlock({
        criterionId: conflict?.surfaceTier === 'private' ? 'R8.8' : 'R8.9',
        code: 'FC-OVERRIDE',
        subject: conflictId,
        detail: conflict?.surfaceTier === 'private'
          ? 'override cannot publish private material'
          : 'override omits one or more required fields',
      })
    }
    const { stub, missingFields } = metadataStubFor(conflict)
    if (stub) stubs.push(stub)
    const outcome = stub ? 'blocked-with-stub' : 'blocked-without-stub'
    conflictRecords.push({ conflictId, artifactId, outcome, timestampUtc: timestamp })
    addBlock({
      criterionId: 'R8.1',
      code: 'FC-CONFLICT',
      subject: conflictId,
      detail: missingFields.length > 0
        ? `${outcome}; missing stub fields: ${missingFields.join(', ')}`
        : outcome,
    })
  }

  for (const injectedBlock of asArray(input.injectedBlocks)) addBlock(injectedBlock)
  blocks.sort((left, right) => blockKey(left).localeCompare(blockKey(right)))
  return {
    decision: blocks.length === 0 ? 'permit' : 'block',
    blocks,
    candidateCount: candidatePaths.length,
    timestamp,
    skipped,
    dependencySkipped: skipped,
    ...(stubs.length === 1 ? { stub: stubs[0] } : {}),
    stubs,
    conflictRecords,
    statePreserved: true,
  }
}

export const evaluate = evaluatePublicationGate
