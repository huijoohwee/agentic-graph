import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  snapshotApprovalRecord,
  trackedPathsDigestRecord,
} from './authority-snapshot.mjs'
import { stableJson } from './constants.mjs'
import { classifyPath } from './route-classify.mjs'

const MAX_AUDIT_FILES = 6_000
const MAX_AUDIT_BYTES = 500_000_000
const SOURCE_ARTIFACT_CLASSES = new Set([
  'application-source',
  'prompt-internal',
  'orchestration-wiring',
  'credential-material',
  'unpublished-spec',
  'runtime-config',
  'local-convenience',
])
const PUBLIC_ARTIFACT_CLASSES = new Set([
  'bundled-build-output',
  'dist-module',
])
const PUBLIC_DISCOVERABLE_CLASSES = new Set([
  'published-document',
  'guideline',
  'specification',
  'machine-readable-metadata',
  'capability-description',
  'service-description',
  'mcp-endpoint',
])
const TIER_RESTRICTIVENESS = {
  private: 4,
  gated: 3,
  'public-artifact': 2,
  'public-discoverable': 1,
}
const KNOWN_SOURCE_PREFIXES = Object.freeze([
  'canvas/src/',
  'cloudflare/workers/',
  'mcp/',
])

export function deriveProtectionTier(entry) {
  let derivedTier = SOURCE_ARTIFACT_CLASSES.has(entry?.artifactClass)
    ? 'private'
    : entry?.artifactClass === 'routed-path'
      ? 'gated'
      : PUBLIC_ARTIFACT_CLASSES.has(entry?.artifactClass)
        ? 'public-artifact'
        : PUBLIC_DISCOVERABLE_CLASSES.has(entry?.artifactClass)
          ? 'public-discoverable'
          : 'private'
  if (
    entry?.repositoryVisibility === 'private'
    || ['dev', 'worker'].includes(entry?.owningRepository)
  ) {
    derivedTier = 'private'
  }
  if (
    entry?.spendBearing === true
    || entry?.targetExecutionRoute === 'control-plane-mcp'
  ) {
    if (TIER_RESTRICTIVENESS[derivedTier] < TIER_RESTRICTIVENESS.gated) {
      derivedTier = 'gated'
    }
  }
  return derivedTier
}

const createDeadlineBudget = (options = {}) => {
  const deadlineMs = Number.isFinite(options.deadlineMs)
    ? Math.max(0, Number(options.deadlineMs))
    : null
  const deadlineAt = deadlineMs === null ? null : performance.now() + deadlineMs
  return {
    signal: options.signal,
    remainingMs: () => (
      deadlineAt === null ? null : Math.max(0, deadlineAt - performance.now())
    ),
  }
}

const auditDeadlineError = () => {
  const error = new Error('audit operation deadline exceeded')
  error.code = 'FC-AUDIT-DEADLINE'
  return error
}

const assertWithinBudget = budget => {
  if (!budget) return null
  if (budget?.signal?.aborted) {
    throw budget.signal.reason ?? new Error('audit operation aborted')
  }
  const remainingMs = budget?.remainingMs()
  if (remainingMs !== null && remainingMs <= 0) {
    throw auditDeadlineError()
  }
  return remainingMs
}

function trackedPaths(repositoryRoot, budget = null) {
  const remainingMs = assertWithinBudget(budget)
  try {
    return execFileSync('git', ['ls-files', '-z'], {
      cwd: repositoryRoot,
      ...(remainingMs === null
        ? {}
        : { timeout: Math.max(1, Math.ceil(remainingMs)) }),
    }).toString('utf8').split('\0').filter(Boolean).sort()
  } catch (error) {
    if (
      remainingMs !== null
      && (
        error?.code === 'ETIMEDOUT'
        || error?.signal === 'SIGTERM'
        || budget.remainingMs() <= 0
      )
    ) {
      throw auditDeadlineError()
    }
    throw error
  }
}

function pathPatternMatches(pattern, candidatePath) {
  if (pattern === candidatePath) return true
  const marker = '\u0000'
  const expression = pattern
    .replaceAll('**', marker)
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]')
    .replaceAll(marker, '.*')
  return new RegExp(`^${expression}$`, 'u').test(candidatePath)
}

function classifyTrackedPath(registry, candidatePath) {
  const matchingEntries = (registry.entries ?? []).filter(entry => (
    typeof entry?.path === 'string'
    && !entry.path.startsWith('/')
    && pathPatternMatches(entry.path, candidatePath)
  ))
  const privateOrSourceEntries = matchingEntries.filter(entry => (
    entry.surfaceTier === 'private'
    || SOURCE_ARTIFACT_CLASSES.has(entry.artifactClass)
  ))
  const isSourceMap = candidatePath.endsWith('.map')
  const isKnownSourcePath = KNOWN_SOURCE_PREFIXES.some(prefix => (
    candidatePath.startsWith(prefix)
  ))

  // Protection is intentionally stronger than normal exact-entry precedence:
  // a public-artifact exception can never relabel source selected by a private
  // pattern, and an allowlist is not considered during classification.
  if (
    privateOrSourceEntries.length > 0
    || isSourceMap
    || isKnownSourcePath
  ) {
    const selected = [...privateOrSourceEntries]
      .sort((left, right) => String(left.artifactId).localeCompare(String(right.artifactId)))[0]
    return {
      path: candidatePath,
      tier: 'private',
      classified: matchingEntries.length > 0,
      artifactId: selected?.artifactId ?? null,
      protectedSource: true,
      sourceMap: isSourceMap,
    }
  }

  const classification = classifyPath(registry, candidatePath)
  return {
    path: candidatePath,
    tier: classification.tier,
    classified: classification.classified,
    artifactId: classification.artifactId,
    protectedSource: false,
    sourceMap: false,
  }
}

export function inspectDistributionBoundary(registry, publicOriginRoot, options = {}) {
  const budget = createDeadlineBudget(options)
  const checkpoint = () => assertWithinBudget(budget)
  const publicTrackedPaths = trackedPaths(publicOriginRoot, budget)
  const allowlist = registry.distributionAllowlist ?? []
  const classifications = publicTrackedPaths.map(candidatePath => {
    checkpoint()
    return classifyTrackedPath(registry, candidatePath)
  })
  const unclassified = classifications
    .filter(classification => {
      checkpoint()
      return !classification.classified
    })
    .map(classification => classification.path)
  const privatePaths = classifications
    .filter(classification => {
      checkpoint()
      return classification.tier === 'private'
    })
    .map(classification => classification.path)
  const sourceLeaks = [...new Set(classifications
    .filter(classification => {
      checkpoint()
      return (
        !classification.classified
        || classification.tier === 'private'
        || classification.protectedSource
        || classification.sourceMap
      )
    })
    .map(classification => classification.path))]
  const allowlistOnly = allowlist
    .filter(pattern => {
      checkpoint()
      return !publicTrackedPaths.some(candidatePath => {
        checkpoint()
        return pathPatternMatches(pattern, candidatePath)
      })
    })
  const registryOnly = (registry.entries ?? [])
    .filter(entry => {
      checkpoint()
      return (
        entry.surfaceTier === 'public-artifact'
        && !entry.path.startsWith('/')
        && !allowlist.some(pattern => pattern === entry.path)
      )
    })
    .map(entry => entry.path)
  checkpoint()
  return {
    publicTrackedPaths,
    result: {
      classifications,
      unclassified,
      privatePaths,
      sourceLeaks,
      allowlistOnly,
      registryOnly,
    },
  }
}

function repositoryRootFor(entry, paths) {
  if (entry.owningRepository === 'dev') return paths.repositoryRoot
  if (entry.owningRepository === 'worker') return paths.agenticCanvasOsRoot
  return paths.publicOriginRoot
}

function routeIsCovered(routePath, routesManifest) {
  return (routesManifest.include ?? []).some(pattern => (
    pattern === routePath || new RegExp(
      `^${pattern
        .split('*')
        .map(part => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
        .join('.*')}$`,
      'u',
    ).test(routePath)
  ))
}

async function hashFiles(
  root,
  relativePaths,
  label,
  budget = null,
  { allowMissing = false } = {},
) {
  if (relativePaths.length > MAX_AUDIT_FILES) throw new Error('audit file count limit exceeded')
  const records = []
  let totalBytes = 0
  const sortedPaths = [...relativePaths].sort()
  for (const relativePath of sortedPaths) {
    assertWithinBudget(budget)
    let bytes
    try {
      bytes = await readFile(path.join(root, relativePath), {
        signal: budget?.signal,
      })
    } catch (error) {
      if (!allowMissing || error?.code !== 'ENOENT') throw error
      records.push({
        path: sortedPaths.length === 1 ? label : `${label}:${relativePath}`,
        digest: null,
        missing: true,
      })
      continue
    }
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_AUDIT_BYTES) throw new Error('audit byte limit exceeded')
    records.push({
      path: sortedPaths.length === 1 ? label : `${label}:${relativePath}`,
      digest: createHash('sha256').update(bytes).digest('hex'),
    })
    assertWithinBudget(budget)
  }
  return records
}

async function entryDigestRecords(entry, authority, budget = null) {
  if (entry.path.startsWith('/')) {
    return hashFiles(
      authority.paths.publicOriginRoot,
      ['_routes.json'],
      'public-origin:_routes.json',
      budget,
    )
  }
  const repositoryRoot = repositoryRootFor(entry, authority.paths)
  const repositoryPaths = entry.owningRepository === 'public-origin'
    ? authority.publicTrackedPaths
    : trackedPaths(repositoryRoot, budget)
  const matches = repositoryPaths.filter(candidatePath => (
    pathPatternMatches(entry.path, candidatePath)
  ))
  if (matches.length > 0) {
    return hashFiles(
      repositoryRoot,
      matches,
      `${entry.owningRepository}:${entry.path}`,
      budget,
    )
  }
  return [{
    path: `registry:${entry.artifactId}`,
    digest: createHash('sha256').update(stableJson(entry)).digest('hex'),
  }]
}

function inspectEntryLocation(entry, authority, budget = null) {
  assertWithinBudget(budget)
  const permittedRepositories = authority.registry
    .permittedRepositories?.[entry.surfaceTier] ?? []
  const permittedRepository = permittedRepositories.includes(entry.owningRepository)
    ? entry.owningRepository
    : permittedRepositories[0] ?? ''
  let located = false
  if (entry.path.startsWith('/')) {
    located = routeIsCovered(entry.path, authority.routesManifest)
  } else {
    const repositoryPaths = entry.owningRepository === 'public-origin'
      ? authority.publicTrackedPaths
      : trackedPaths(repositoryRootFor(entry, authority.paths), budget)
    located = repositoryPaths.some(candidatePath => pathPatternMatches(entry.path, candidatePath))
      || entry.pathKind === 'glob'
  }
  return {
    permittedRepository,
    containingRepository: located ? entry.owningRepository : '',
    derivedTier: deriveProtectionTier(entry),
  }
}

function catalogDescriptors(authority) {
  return (authority.registry.catalogSources ?? []).map(source => ({
    catalogId: source.catalogId,
    root: source.repository === 'worker'
      ? authority.paths.agenticCanvasOsRoot
      : authority.paths.repositoryRoot,
    path: source.path,
  }))
}

function catalogApprovalDescriptors(authority) {
  return (authority.registry.catalogSources ?? [])
    .filter(source => source.approvalInstructionId)
    .map(source => ({
      catalogId: source.catalogId,
      instructionId: source.approvalInstructionId,
    }))
}

async function authorityDigestRecords(
  authority,
  budget = null,
  {
    refreshTrackedPaths = false,
    useConsumedInputs = false,
  } = {},
) {
  const publicTrackedPaths = refreshTrackedPaths
    ? trackedPaths(authority.paths.publicOriginRoot, budget)
    : authority.publicTrackedPaths
  const inputs = [
    [authority.paths.repositoryRoot, path.relative(authority.paths.repositoryRoot, authority.paths.registryPath), 'dev:surface-registry'],
    [authority.paths.repositoryRoot, path.relative(authority.paths.repositoryRoot, authority.paths.licenseRegistryPath), 'dev:license-registry'],
    [authority.paths.repositoryRoot, path.relative(authority.paths.repositoryRoot, authority.paths.schemaPath), 'dev:surface-schema'],
    [authority.paths.publicOriginRoot, '_routes.json', 'public-origin:_routes.json'],
    ...catalogDescriptors(authority).map(source => [
      source.root,
      source.path,
      `worker:${source.catalogId}`,
    ]),
  ]
  const records = useConsumedInputs
    ? [...authority.consumedAuthorityDigests]
    : []
  if (!useConsumedInputs) {
    for (const [root, relativePaths, label] of inputs) {
      const paths = Array.isArray(relativePaths) ? relativePaths : [relativePaths]
      records.push(...await hashFiles(root, paths, label, budget, { allowMissing: true }))
    }
    for (const approval of catalogApprovalDescriptors(authority)) {
      assertWithinBudget(budget)
      records.push(await snapshotApprovalRecord(
        authority.paths.ledgerRoot,
        approval.instructionId,
        approval.catalogId,
        { signal: budget?.signal },
      ))
    }
    records.push(trackedPathsDigestRecord(publicTrackedPaths))
  }
  records.push(...await hashFiles(
    authority.paths.publicOriginRoot,
    publicTrackedPaths,
    'public-origin',
    budget,
    { allowMissing: true },
  ))
  return records.sort((left, right) => left.path.localeCompare(right.path))
}

export async function prepareAuditEvidence(authority, options = {}) {
  const preparationBudget = createDeadlineBudget(options)
  const hasConsumedInputs = Array.isArray(authority.consumedAuthorityDigests)
  const beforeAuthorityDigests = await authorityDigestRecords(
    authority,
    preparationBudget,
    { useConsumedInputs: hasConsumedInputs },
  )
  const beforeEntryDigests = new Map()
  for (const entry of authority.registry.entries) {
    beforeEntryDigests.set(
      entry.artifactId,
      await entryDigestRecords(entry, authority, preparationBudget),
    )
  }
  return {
    beforeAuthorityDigests,
    digestEntry: (entry, phase, _index, context = {}) => (
      phase === 'before'
        ? beforeEntryDigests.get(entry.artifactId)
        : entryDigestRecords(entry, authority, createDeadlineBudget(context))
    ),
    inspectEntry: (entry, _index, context = {}) => (
      inspectEntryLocation(entry, authority, createDeadlineBudget(context))
    ),
    resolvePermittedRepository: entry => (
      authority.registry.permittedRepositories?.[entry.surfaceTier]?.includes(entry.owningRepository)
        ? entry.owningRepository
        : ''
    ),
    readAfterAuthorityDigests: (context = {}) => (
      authorityDigestRecords(
        authority,
        createDeadlineBudget(context),
        { refreshTrackedPaths: hasConsumedInputs },
      )
    ),
  }
}
