#!/usr/bin/env node

import {
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import {
  createExecutionEvidenceRecorder,
  withNetworkObservation,
} from './audit-report.mjs'
import {
  buildCatalogDescriptors,
  declaredPublishedPathEvidence,
  declaredRouteManifest,
  publishedPathEvidence,
} from './authority-inputs.mjs'
import { createAuthorityReadRecorder, registerStaticAuthorityPaths } from './authority-snapshot.mjs'
import { resolveCatalogApprovals } from './catalog-approval.mjs'
import { stableJson } from './constants.mjs'
import {
  generateDiscoverySurfaces,
  STRUCTURED_DATA_DIRECTORY,
  writeDiscoverySurfaces,
} from './discovery-generate.mjs'
import { parseDiscoverySurfaces } from './discovery-parse.mjs'
import {
  inspectDistributionBoundary,
} from './estate-audit.mjs'
import { assembleCatalogFromFiles } from './invocation-assemble.mjs'
import {
  readLicenseRegistry,
  renderDeclaration,
  validateLicenseRegistry,
} from './license-registry.mjs'
import { promoteFixture } from './promote-fixture.mjs'
import { evaluatePublicationGate } from './publication-gate.mjs'
import { readRegistry } from './registry-validate.mjs'
import { classifyPath, classifyRoutes } from './route-classify.mjs'
import { evaluateRuntimeReadiness } from './runtime-audit.mjs'
import { scanCandidate } from './secret-scan.mjs'
import { diffStaging } from './staging-diff.mjs'
import { resolveSurfacePaths } from './workspace-paths.mjs'

const RUNTIME_REPORT_SCHEMA = 'agentic-graph-surface-runtime-readiness/v1'
const RUNTIME_AUDIT_DEADLINE_MS = 60_000
async function readJson(filePath, options = {}) {
  const loadFile = options.readFile ?? readFile
  return JSON.parse(await loadFile(filePath, { encoding: 'utf8', signal: options.signal }))
}
async function loadAuthority(options = {}) {
  const includePublicEstate = options.includePublicEstate === true
  const startedAt = performance.now()
  const remaining = () => Math.max(0, Number(options.deadlineMs ?? RUNTIME_AUDIT_DEADLINE_MS) - (performance.now() - startedAt))
  const checkpoint = () => {
    if (options.signal?.aborted) throw options.signal.reason
    if (remaining() <= 0) {
      const error = new Error('runtime audit deadline exceeded while loading authority')
      error.code = 'FC-AUDIT-DEADLINE'
      error.stage = 'load-authority'
      throw error
    }
  }
  const paths = resolveSurfacePaths()
  const authorityReads = createAuthorityReadRecorder({ signal: options.signal })
  registerStaticAuthorityPaths(authorityReads, paths, { includePublicRoutes: includePublicEstate })
  const [registryResult, licenseResult] = await Promise.all([
    readRegistry(paths.registryPath, {
      readFile: authorityReads.readFile,
      schemaPath: paths.schemaPath,
      signal: options.signal,
    }),
    readLicenseRegistry(paths.licenseRegistryPath, {
      readFile: authorityReads.readFile,
      signal: options.signal,
    }),
  ])
  checkpoint()
  const registry = registryResult.registry
  const licenseRegistry = licenseResult.registry
  const licenseValidation = registry && licenseRegistry
    ? validateLicenseRegistry(licenseRegistry, registry)
    : { ok: false, violations: [] }
  let routesManifest = declaredRouteManifest(registry)
  let distributionBoundary = { publicTrackedPaths: [], result: { classifications: [], unclassified: [], privatePaths: [], sourceLeaks: [], allowlistOnly: [], registryOnly: [] } }
  if (includePublicEstate) {
    const [publicRoutesManifest, publicDistributionBoundary] = await Promise.all([
      readJson(path.join(paths.publicOriginRoot, '_routes.json'), {
        ...options,
        readFile: authorityReads.readFile,
      }),
      Promise.resolve(inspectDistributionBoundary(registry, paths.publicOriginRoot, {
        deadlineMs: remaining(),
        signal: options.signal,
      })),
    ])
    routesManifest = publicRoutesManifest
    distributionBoundary = publicDistributionBoundary
  }
  const routeClassification = registry ? classifyRoutes(registry, routesManifest) : { routes: [], unclassified: [], missingRateLimit: [] }
  const { publicTrackedPaths } = distributionBoundary
  if (includePublicEstate) authorityReads.recordTrackedPaths(publicTrackedPaths)
  const publishedPaths = includePublicEstate ? publishedPathEvidence(publicTrackedPaths) : declaredPublishedPathEvidence(registry)
  const allowlistResult = distributionBoundary.result
  const catalogDescriptors = registry ? buildCatalogDescriptors(registry, paths) : []
  const catalogApprovals = registry
    ? await resolveCatalogApprovals(
        registry.catalogSources,
        paths.ledgerRoot,
        {
          readRecordedInstruction: authorityReads.readCatalogApproval,
          signal: options.signal,
        },
      )
    : { approvedCatalogIds: [], failures: [] }
  const catalog = registry
    ? await assembleCatalogFromFiles(catalogDescriptors, {
        approvedCatalogIds: catalogApprovals.approvedCatalogIds,
        readFile: authorityReads.readCatalogSource,
        timeoutMs: remaining(),
      })
    : { entries: [], digest: '', unreachableSources: [], validationFailures: [] }
  const generated = registry
    ? generateDiscoverySurfaces(registry, { invocationCatalog: catalog })
    : { files: new Map(), generationErrors: [] }
  checkpoint()
  const failures = [
    ...registryResult.violations.map(violation => ({
      stage: 'registry',
      code: violation.code,
      subject: violation.artifactId,
      field: violation.field,
    })),
    ...licenseResult.violations.map(violation => ({
      stage: 'license-read',
      code: violation.code,
      subject: violation.artifactClass,
      field: violation.field,
    })),
    ...licenseValidation.violations.map(violation => ({
      stage: 'license',
      code: violation.code,
      subject: violation.artifactClass,
      field: violation.field,
    })),
    ...routeClassification.unclassified.map(route => ({
      stage: 'routes',
      code: 'UNCLASSIFIED_ROUTE',
      subject: route,
    })),
    ...routeClassification.missingRateLimit.map(route => ({
      stage: 'routes',
      code: 'RATE_LIMIT_REQUIRED',
      subject: route,
    })),
    ...generated.generationErrors.map(error => ({
      stage: 'generation',
      code: error.code,
      subject: error.artifactId,
      field: error.field,
    })),
    ...catalog.unreachableSources.map(source => ({
      stage: 'invocation-catalog',
      code: 'UNREACHABLE_SOURCE',
      subject: source,
    })),
    ...catalog.validationFailures.map(failure => ({
      stage: 'invocation-catalog',
      code: failure.code,
      subject: failure.token,
    })),
    ...catalogApprovals.failures.map(failure => ({
      stage: 'invocation-catalog-approval',
      code: failure.code,
      subject: failure.sourceCatalog,
    })),
    ...(catalog.entries.length === 0
      ? [{
          stage: 'invocation-catalog',
          code: 'EMPTY_PUBLISHED_CATALOG',
          subject: 'invocation-catalog',
        }]
      : []),
    ...(catalog.digest !== registry?.catalogDigest
      ? [{
          stage: 'invocation-catalog',
          code: 'CATALOG_DIGEST_MISMATCH',
          subject: 'invocation-catalog',
        }]
      : []),
    ...allowlistResult.unclassified.map(sourcePath => ({
      stage: 'distribution-boundary',
      code: 'UNCLASSIFIED_PUBLIC_PATH',
      subject: sourcePath,
    })),
    ...allowlistResult.privatePaths
      .filter(sourcePath => !allowlistResult.unclassified.includes(sourcePath))
      .map(sourcePath => ({
        stage: 'distribution-boundary',
        code: 'PRIVATE_PATH_IN_PUBLIC_ORIGIN',
        subject: sourcePath,
      })),
    ...allowlistResult.allowlistOnly.map(sourcePath => ({
      stage: 'distribution-boundary',
      code: 'ALLOWLIST_NOT_PUBLISHED',
      subject: sourcePath,
    })),
    ...allowlistResult.registryOnly.map(sourcePath => ({
      stage: 'distribution-boundary',
      code: 'PUBLIC_ARTIFACT_NOT_ALLOWLISTED',
      subject: sourcePath,
    })),
  ]

  const generationReady = registryResult.ok
    && licenseResult.ok
    && licenseValidation.ok
    && routeClassification.unclassified.length === 0
    && routeClassification.missingRateLimit.length === 0
    && generated.generationErrors.length === 0
    && catalogApprovals.failures.length === 0
    && catalog.unreachableSources.length === 0
    && catalog.validationFailures.length === 0
    && catalog.entries.length > 0
    && catalog.digest === registry?.catalogDigest
  const estateReady = includePublicEstate && allowlistResult.sourceLeaks.length === 0
    && allowlistResult.allowlistOnly.length === 0
    && allowlistResult.registryOnly.length === 0

  return {
    ok: generationReady && (!includePublicEstate || estateReady),
    generationReady,
    estateReady,
    publicEstateEvaluated: includePublicEstate,
    paths,
    registry,
    registryResult,
    licenseRegistry,
    licenseValidation,
    routesManifest,
    routeClassification,
    publicTrackedPaths,
    publishedPaths,
    allowlistResult,
    generated,
    catalog,
    catalogApprovals,
    consumedAuthorityDigests: authorityReads.snapshot(),
    failures,
  }
}

function authoritySummary(authority) {
  const tierCounts = (authority.registry?.entries ?? []).reduce((counts, entry) => {
    counts[entry.surfaceTier] = (counts[entry.surfaceTier] ?? 0) + 1
    return counts
  }, {})
  return {
    schema: RUNTIME_REPORT_SCHEMA,
    status: authority.generationReady ? 'valid' : 'invalid',
    runtimeReadinessStatus: authority.publicEstateEvaluated
      ? authority.ok ? 'ready' : 'blocked'
      : 'not-evaluated',
    generationStatus: authority.generationReady ? 'ready' : 'blocked',
    publicEstateStatus: authority.publicEstateEvaluated
      ? authority.estateReady ? 'ready' : 'blocked'
      : 'not-evaluated',
    registryEntries: authority.registry?.entries?.length ?? 0,
    tierCounts,
    licenses: authority.licenseRegistry?.licenses?.length ?? 0,
    routedPaths: authority.routeClassification.routes.length,
    fetchProxyRateLimit: authority.registry?.policy?.fetchProxyRateLimit ?? null,
    noReuseLicenseId: authority.registry?.policy?.noReuseLicenseId ?? null,
    distributionBoundary: {
      trackedPaths: authority.publicTrackedPaths.length,
      classifiedPaths: authority.allowlistResult.classifications.length,
      unclassifiedPaths: authority.allowlistResult.unclassified,
      privatePaths: authority.allowlistResult.privatePaths,
      allowlistedPaths: authority.registry?.distributionAllowlist?.length ?? 0,
      sourceLeaks: authority.allowlistResult.sourceLeaks,
      allowlistOnly: authority.allowlistResult.allowlistOnly,
      registryOnly: authority.allowlistResult.registryOnly,
    },
    generatedFiles: [...authority.generated.files.keys()],
    invocationCatalog: {
      entries: authority.catalog.entries.length,
      digest: authority.catalog.digest,
      expectedDigest: authority.registry?.catalogDigest ?? null,
      unreachableSources: authority.catalog.unreachableSources,
      validationFailures: authority.catalog.validationFailures.length,
      approvedCatalogs: authority.catalogApprovals.approvedCatalogIds,
      approvalFailures: authority.catalogApprovals.failures.length,
    },
    failures: authority.failures,
  }
}

async function writeReuseDeclaration(stagingRoot, declaration) {
  const resolvedStaging = path.resolve(stagingRoot)
  if (
    path.basename(resolvedStaging) !== 'surface-staging'
    || path.basename(path.dirname(resolvedStaging)) !== '.tmp'
  ) {
    throw new Error('reuse declaration must target disposable .tmp/surface-staging')
  }
  const temporaryPath = path.join(
    resolvedStaging,
    `.REUSE.md.${process.pid}.${Date.now()}.tmp`,
  )
  const destinationPath = path.join(resolvedStaging, 'REUSE.md')
  try {
    await writeFile(temporaryPath, declaration, { flag: 'wx', mode: 0o600 })
    await rename(temporaryPath, destinationPath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

async function prepareStaging(authorityArgument) {
  const authority = authorityArgument ?? await loadAuthority()
  if (!authority.generationReady) {
    const error = new Error('surface generation authorities are not ready')
    error.failures = authority.failures
    throw error
  }
  const result = await writeDiscoverySurfaces(
    authority.registry,
    authority.paths.stagingRoot,
    { invocationCatalog: authority.catalog },
  )
  if (!result.written) {
    const error = new Error('discovery generation did not write a candidate')
    error.failures = result.generationErrors
    throw error
  }
  await writeReuseDeclaration(
    authority.paths.stagingRoot,
    renderDeclaration(authority.licenseRegistry),
  )
  return {
    authority,
    writtenPaths: [...result.writtenPaths, 'REUSE.md'].sort(),
    totalBytes: result.totalBytes + Buffer.byteLength(renderDeclaration(authority.licenseRegistry)),
  }
}

function candidateClassification(registry, candidatePaths) {
  const classifications = candidatePaths.map(candidatePath => classifyPath(registry, candidatePath))
  return {
    resolved: classifications.filter(classification => classification.classified),
    unclassified: classifications
      .filter(classification => !classification.classified)
      .map(classification => classification.path),
  }
}

function omittedGatedRoutes(registry, robotsBytes) {
  const directives = new Set(
    Buffer.from(robotsBytes)
      .toString('utf8')
      .split('\n')
      .filter(line => line.startsWith('Disallow: '))
      .map(line => line.slice('Disallow: '.length)),
  )
  return (registry.entries ?? [])
    .filter(entry => entry.surfaceTier === 'gated' && entry.path.startsWith('/'))
    .map(entry => entry.path)
    .filter(route => !directives.has(route))
    .sort()
}

function expectedEntryIdsByFile(registry, discoveryFiles) {
  const publicIds = (registry.entries ?? [])
    .filter(entry => entry.surfaceTier === 'public-discoverable')
    .map(entry => entry.artifactId)
    .sort()
  return Object.fromEntries([...discoveryFiles.keys()].map(fileName => {
    if (fileName.startsWith(`${STRUCTURED_DATA_DIRECTORY}/`)) {
      const artifactId = decodeURIComponent(path.basename(fileName, '.jsonld'))
      return [fileName, [artifactId]]
    }
    return [fileName, publicIds]
  }))
}

function evaluateCandidate(authority) {
  const reuseBytes = Buffer.from(renderDeclaration(authority.licenseRegistry), 'utf8')
  const discoveryFiles = authority.generated.files
  const candidatePaths = [
    ...discoveryFiles.keys(),
    'REUSE.md',
  ]
  const candidateFiles = [
    ...[...discoveryFiles].map(([candidatePath, bytes]) => ({
      path: candidatePath,
      bytes,
    })),
    { path: 'REUSE.md', bytes: reuseBytes },
  ]
  const parsed = parseDiscoverySurfaces(discoveryFiles)
  const scanResult = scanCandidate(candidateFiles)
  const routes = {
    ...authority.routeClassification,
    omittedGatedRoutes: omittedGatedRoutes(
      authority.registry,
      discoveryFiles.get('robots.txt'),
    ),
  }
  const gate = evaluatePublicationGate({
    registry: authority.registry,
    registryValidation: authority.registryResult,
    licenseRegistry: authority.licenseRegistry,
    licenseResult: authority.licenseValidation,
    catalog: authority.catalog,
    candidatePaths,
    candidateFiles,
    classification: candidateClassification(authority.registry, candidatePaths),
    discoveryFiles,
    expectedEntryIdsByFile: expectedEntryIdsByFile(
      authority.registry,
      discoveryFiles,
    ),
    parsedFiles: parsed.results,
    scanResult,
    routes,
    publishedPaths: authority.publishedPaths,
    allowlistResult: authority.allowlistResult,
    sourceLeaks: authority.allowlistResult.sourceLeaks.map(sourcePath => ({ path: sourcePath })),
  })
  return { gate, parsed, scanResult, routes, candidatePaths, candidateFiles }
}

async function runValidate() {
  const authority = await loadAuthority()
  process.stdout.write(stableJson(authoritySummary(authority)))
  return authority.generationReady ? 0 : 1
}

async function runGenerate() {
  const prepared = await prepareStaging()
  process.stdout.write(stableJson({
    schema: RUNTIME_REPORT_SCHEMA,
    status: 'staged',
    stagingRoot: path.relative(prepared.authority.paths.repositoryRoot, prepared.authority.paths.stagingRoot),
    writtenPaths: prepared.writtenPaths,
    totalBytes: prepared.totalBytes,
    publicOriginMutated: false,
  }))
  return 0
}

async function runDiff(args) {
  const prepared = await prepareStaging()
  const result = await diffStaging(
    prepared.authority.paths.stagingRoot,
    prepared.authority.paths.publicOriginRoot,
  )
  const summary = {
    schema: RUNTIME_REPORT_SCHEMA,
    status: 'compared',
    added: result.added,
    removed: result.removed,
    changed: result.changed.map(change => change.path),
    identical: result.identical,
    publicOriginMutated: false,
  }
  process.stdout.write(stableJson(summary))
  if (args.includes('--unified')) {
    for (const change of result.changed) process.stdout.write(change.diff)
  }
  return 0
}

async function runAudit() {
  const invocationStartedAt = performance.now()
  const executionRecorder = createExecutionEvidenceRecorder()
  const loadSignal = AbortSignal.timeout(RUNTIME_AUDIT_DEADLINE_MS)
  return withNetworkObservation(executionRecorder, async () => {
    let authority
    try {
      authority = await loadAuthority({
        deadlineMs: RUNTIME_AUDIT_DEADLINE_MS,
        signal: loadSignal,
        includePublicEstate: true,
      })
    } catch (error) {
      const typedFailure = ['FC-AUDIT-EGRESS', 'FC-AUDIT-DEADLINE'].includes(error?.code)
      if (!loadSignal.aborted && !typedFailure) throw error
      const code = error?.code === 'FC-AUDIT-EGRESS' ? error.code : 'FC-AUDIT-DEADLINE'
      process.stdout.write(stableJson({
        schema: RUNTIME_REPORT_SCHEMA,
        status: 'blocked',
        readinessFailures: [{
          code,
          stage: error?.stage ?? 'load-authority',
          elapsedMs: performance.now() - invocationStartedAt,
          unevaluatedCount: 0,
        }],
        audit: null,
      }))
      return 1
    }
    const candidate = authority.registry
      ? evaluateCandidate(authority)
      : { gate: { decision: 'block', blocks: authority.failures } }
    const readiness = await evaluateRuntimeReadiness({ authority, candidate }, {
      deadlineMs: RUNTIME_AUDIT_DEADLINE_MS,
      executionRecorder,
      invocationHardStartedAt: invocationStartedAt,
      invocationLogicalStartedAt: invocationStartedAt,
    })
    process.stdout.write(stableJson({
      schema: RUNTIME_REPORT_SCHEMA,
      status: readiness.status,
      authority: authoritySummary(authority),
      authorityDigestPair: readiness.authorityDigestPair,
      publicOriginDiff: readiness.publicOriginDiff,
      readinessFailures: readiness.readinessFailures,
      publicationGate: candidate.gate,
      audit: readiness.audit,
    }))
    return readiness.exitStatus
  })
}

async function runGate() {
  const authority = await loadAuthority({ includePublicEstate: true })
  const gate = authority.generationReady
    ? evaluateCandidate(authority).gate
    : { decision: 'block', blocks: authority.failures }
  process.stdout.write(stableJson({
    schema: RUNTIME_REPORT_SCHEMA,
    status: gate.decision === 'permit' ? 'permitted' : 'blocked',
    authority: authoritySummary(authority),
    publicationGate: gate,
    publicOriginMutated: false,
  }))
  return gate.decision === 'permit' ? 0 : 1
}

async function runPromoteFixture(args) {
  const requestPath = args.find(argument => !argument.startsWith('--'))
  if (!requestPath) throw new Error('promote-fixture requires one request JSON path')
  const authority = await loadAuthority()
  const result = await promoteFixture(await readJson(requestPath), {
    gateAuthority: {
      registry: authority.registry,
      licenseRegistry: authority.licenseRegistry,
      routesManifest: authority.routesManifest,
      catalogSources: authority.catalog.sourceDocuments,
      approvedCatalogIds: authority.catalogApprovals.approvedCatalogIds,
      publishedPaths: authority.publishedPaths,
    },
  })
  process.stdout.write(stableJson(result))
  return result.promoted ? 0 : 1
}

function printHelp() {
  console.log('usage: node scripts/surface/cli.mjs <validate|generate|diff|gate|audit|promote-fixture>')
}

export async function runSurfaceCli(args = process.argv.slice(2)) {
  const [command, ...commandArgs] = args
  if (command === 'validate') return runValidate()
  if (command === 'generate') return runGenerate()
  if (command === 'diff') return runDiff(commandArgs)
  if (command === 'gate') return runGate()
  if (command === 'audit') return runAudit()
  if (command === 'promote-fixture') return runPromoteFixture(commandArgs)
  printHelp()
  return 1
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  try {
    process.exitCode = await runSurfaceCli()
  } catch (error) {
    process.stderr.write(stableJson({
      schema: RUNTIME_REPORT_SCHEMA,
      status: 'blocked',
      error: error instanceof Error ? error.message : String(error),
      failures: error?.failures ?? [],
    }))
    process.exitCode = 1
  }
}
