#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import surfaceRegistrySchema from '../../schemas/surface-registry.v1.schema.json' with { type: 'json' }
import {
  APPROVED_FETCH_PROXY_RATE_LIMIT,
  APPROVED_LICENSES,
  DEFAULT_SURFACE_PATHS,
  FETCH_PROXY_ROUTES,
  SURFACE_REGISTRY_SCHEMA,
  SURFACE_TIERS,
} from './constants.mjs'

const REQUIRED_ENTRY_FIELDS = Object.freeze([
  'artifactId',
  'surfaceTier',
  'licenseId',
  'publishPolicy',
  'owningRepository',
])

const MANDATORY_TIER_BY_CLASS = Object.freeze({
  'application-source': 'private',
  'prompt-internal': 'private',
  'orchestration-wiring': 'private',
  'credential-material': 'private',
  'unpublished-spec': 'private',
  'runtime-config': 'private',
  'local-convenience': 'private',
  'bundled-build-output': 'public-artifact',
  'dist-module': 'public-artifact',
  'published-document': 'public-discoverable',
  guideline: 'public-discoverable',
  specification: 'public-discoverable',
  'machine-readable-metadata': 'public-discoverable',
  'capability-description': 'public-discoverable',
  'service-description': 'public-discoverable',
})

const MANDATORY_LICENSE_BY_CLASS = Object.freeze({
  'published-document': APPROVED_LICENSES.prose,
  guideline: APPROVED_LICENSES.prose,
  specification: APPROVED_LICENSES.prose,
  'machine-readable-metadata': APPROVED_LICENSES.machineMetadata,
  'capability-description': APPROVED_LICENSES.machineMetadata,
  'service-description': APPROVED_LICENSES.machineMetadata,
  'mcp-endpoint': APPROVED_LICENSES.machineMetadata,
  'invocation-token': APPROVED_LICENSES.machineMetadata,
  'bundled-build-output': APPROVED_LICENSES.noReuse,
  'dist-module': APPROVED_LICENSES.noReuse,
})

const PRIVATE_REPOSITORIES = new Set(['dev', 'worker'])
const PUBLIC_REPOSITORIES = new Set(['public-origin', 'site'])
const FETCH_PROXY_ROUTE_SET = new Set(FETCH_PROXY_ROUTES)
const validatorCache = new WeakMap()

export { SURFACE_TIERS }

export function validateRegistry(registry, options = {}) {
  const config = isPlainObject(options) ? options : {}
  const violations = []
  const schema = config.schema ?? surfaceRegistrySchema

  if (!isPlainObject(registry)) {
    return {
      ok: false,
      violations: [{
        code: 'SCHEMA_VIOLATION',
        artifactId: '@registry',
        field: 'registry',
        mandatoryValue: 'object',
      }],
    }
  }

  const schemaValidator = getSchemaValidator(schema)
  if (!schemaValidator.ok) {
    violations.push({
      code: 'SCHEMA_VIOLATION',
      artifactId: '@registry',
      field: 'schema',
      mandatoryValue: 'valid JSON Schema',
    })
  } else if (!schemaValidator.validate(registry)) {
    for (const error of schemaValidator.validate.errors ?? []) {
      violations.push(mapSchemaError(error, registry))
    }
  }

  if (registry.schema !== SURFACE_REGISTRY_SCHEMA) {
    violations.push({
      code: 'SCHEMA_VIOLATION',
      artifactId: '@registry',
      field: 'schema',
      recordedValue: registry.schema,
      mandatoryValue: SURFACE_REGISTRY_SCHEMA,
    })
  }

  const entries = Array.isArray(registry.entries) ? registry.entries : []
  const seenArtifactIds = new Set()
  const fetchProxyEntries = new Map(
    FETCH_PROXY_ROUTES.map(routePath => [routePath, []]),
  )

  entries.forEach((entry, index) => {
    const artifactId = entryArtifactId(entry, index)
    if (!isPlainObject(entry)) return

    for (const field of REQUIRED_ENTRY_FIELDS) {
      if (isBlank(entry[field])) {
        violations.push({
          code: 'MISSING_FIELD',
          artifactId,
          field,
          mandatoryValue: 'non-empty value',
        })
      }
    }

    if (Array.isArray(entry.surfaceTier)) {
      violations.push({
        code: 'MULTI_TIER',
        artifactId,
        field: 'surfaceTier',
        recordedValue: [...entry.surfaceTier],
        mandatoryValue: 'exactly one surface tier',
      })
    } else if (
      entry.surfaceTier !== undefined
      && !SURFACE_TIERS.includes(entry.surfaceTier)
    ) {
      violations.push({
        code: 'UNKNOWN_TIER',
        artifactId,
        field: 'surfaceTier',
        recordedValue: entry.surfaceTier,
        mandatoryValue: [...SURFACE_TIERS],
      })
    }

    if (typeof entry.artifactId === 'string' && entry.artifactId.length > 0) {
      if (seenArtifactIds.has(entry.artifactId)) {
        violations.push({
          code: 'SCHEMA_VIOLATION',
          artifactId,
          field: 'artifactId',
          mandatoryValue: 'unique value',
        })
      }
      seenArtifactIds.add(entry.artifactId)
    }

    const mandatoryTier = MANDATORY_TIER_BY_CLASS[entry.artifactClass]
    if (mandatoryTier && entry.surfaceTier !== mandatoryTier) {
      violations.push({
        code: 'CLASS_TIER_VIOLATION',
        artifactId,
        field: 'surfaceTier',
        recordedValue: entry.surfaceTier,
        mandatoryValue: mandatoryTier,
      })
    }

    const mandatoryVisibility = PRIVATE_REPOSITORIES.has(entry.owningRepository)
      ? 'private'
      : PUBLIC_REPOSITORIES.has(entry.owningRepository)
        ? 'public'
        : null
    if (
      mandatoryVisibility
      && entry.repositoryVisibility !== mandatoryVisibility
    ) {
      violations.push({
        code: 'REPO_VISIBILITY',
        artifactId,
        field: 'repositoryVisibility',
        recordedValue: entry.repositoryVisibility,
        mandatoryValue: mandatoryVisibility,
      })
    }

    const permittedRepositories = registry.permittedRepositories?.[entry.surfaceTier]
    if (
      Array.isArray(permittedRepositories)
      && !permittedRepositories.includes(entry.owningRepository)
    ) {
      violations.push({
        code: 'REPO_VISIBILITY',
        artifactId,
        field: 'owningRepository',
        recordedValue: entry.owningRepository,
        mandatoryValue: [...permittedRepositories],
      })
    }

    if (
      ['public-artifact', 'public-discoverable'].includes(entry.surfaceTier)
      && (isBlank(entry.licenseId) || entry.licenseId === APPROVED_LICENSES.private)
    ) {
      violations.push({
        code: 'UNLICENSED',
        artifactId,
        field: 'licenseId',
        recordedValue: entry.licenseId,
        mandatoryValue: 'published license identifier',
      })
    }

    const mandatoryLicense = MANDATORY_LICENSE_BY_CLASS[entry.artifactClass]
      ?? (['private', 'gated'].includes(entry.surfaceTier)
        ? APPROVED_LICENSES.private
        : entry.surfaceTier === 'public-artifact'
          ? APPROVED_LICENSES.noReuse
          : null)
    if (mandatoryLicense && entry.licenseId !== mandatoryLicense) {
      violations.push({
        code: 'UNLICENSED',
        artifactId,
        field: 'licenseId',
        recordedValue: entry.licenseId,
        mandatoryValue: mandatoryLicense,
      })
    }

    if (
      entry.spendBearing === true
      && entry.targetExecutionRoute !== 'control-plane-mcp'
    ) {
      violations.push({
        code: 'SPEND_ROUTE_VIOLATION',
        artifactId,
        field: 'targetExecutionRoute',
        recordedValue: entry.targetExecutionRoute,
        mandatoryValue: 'control-plane-mcp',
      })
    }

    if (
      entry.artifactClass === 'mcp-endpoint'
      && (
        entry.ingressRoute === 'public-read-mcp'
        || entry.targetExecutionRoute === 'public-read-mcp'
      )
      && entry.readOnly !== true
    ) {
      violations.push({
        code: 'PUBLIC_READ_MCP_VIOLATION',
        artifactId,
        field: 'readOnly',
        recordedValue: entry.readOnly,
        mandatoryValue: true,
      })
    }

    if (
      entry.artifactClass === 'invocation-token'
      && entry.ingressRoute !== 'invocation-forwarder'
    ) {
      violations.push({
        code: 'INVOCATION_ROUTE_VIOLATION',
        artifactId,
        field: 'ingressRoute',
        recordedValue: entry.ingressRoute,
        mandatoryValue: 'invocation-forwarder',
      })
    }

    if (
      FETCH_PROXY_ROUTE_SET.has(entry.path)
      && entry.pathKind === 'exact'
    ) {
      fetchProxyEntries.get(entry.path).push({ entry, artifactId })
    }
  })

  for (const routePath of FETCH_PROXY_ROUTES) {
    const routeEntries = fetchProxyEntries.get(routePath)
    if (routeEntries.length === 0) {
      violations.push({
        code: 'FETCH_PROXY_MISSING',
        artifactId: `@route:${routePath}`,
        field: 'path',
        mandatoryValue: routePath,
      })
      continue
    }

    for (const { entry, artifactId } of routeEntries) {
      if (entry.surfaceTier !== 'gated') {
        violations.push({
          code: 'FETCH_PROXY_TIER_VIOLATION',
          artifactId,
          field: 'surfaceTier',
          recordedValue: entry.surfaceTier,
          mandatoryValue: 'gated',
        })
      }
      if (!rateLimitsEqual(entry.rateLimit, APPROVED_FETCH_PROXY_RATE_LIMIT)) {
        violations.push({
          code: 'FETCH_PROXY_RATE_LIMIT_VIOLATION',
          artifactId,
          field: 'rateLimit',
          recordedValue: copyRateLimit(entry.rateLimit),
          mandatoryValue: { ...APPROVED_FETCH_PROXY_RATE_LIMIT },
        })
      }
    }
  }

  const normalizedViolations = sortAndDedupeViolations(violations)
  return {
    ok: normalizedViolations.length === 0,
    violations: normalizedViolations,
  }
}

export async function readRegistry(
  registryPath = DEFAULT_SURFACE_PATHS.registry,
  options = {},
) {
  const config = isPlainObject(options) ? options : {}
  const schemaPath = config.schemaPath ?? DEFAULT_SURFACE_PATHS.schema
  const loadFile = typeof config.readFile === 'function' ? config.readFile : readFile

  try {
    const [registryBytes, schemaBytes] = await Promise.all([
      loadFile(registryPath, { encoding: 'utf8', signal: config.signal }),
      schemaPath
        ? loadFile(schemaPath, { encoding: 'utf8', signal: config.signal })
        : Promise.resolve(null),
    ])
    const registry = JSON.parse(registryBytes)
    const schema = schemaBytes === null ? surfaceRegistrySchema : JSON.parse(schemaBytes)
    return { registry, ...validateRegistry(registry, { schema }) }
  } catch (error) {
    return {
      ok: false,
      registry: null,
      violations: [{
        code: error instanceof SyntaxError ? 'INVALID_JSON' : 'REGISTRY_READ_ERROR',
        artifactId: '@registry',
        field: error instanceof SyntaxError ? 'json' : 'path',
        mandatoryValue: error instanceof SyntaxError ? 'valid JSON' : 'readable local file',
      }],
    }
  }
}

function getSchemaValidator(schema) {
  if (!isPlainObject(schema)) return { ok: false }
  const cached = validatorCache.get(schema)
  if (cached) return { ok: true, validate: cached }

  try {
    const ajv = new Ajv({
      allErrors: true,
      coerceTypes: false,
      removeAdditional: false,
      strict: false,
      useDefaults: false,
    })
    addFormats(ajv)
    const validate = ajv.compile(schema)
    validatorCache.set(schema, validate)
    return { ok: true, validate }
  } catch {
    return { ok: false }
  }
}

function mapSchemaError(error, registry) {
  const field = error.keyword === 'required'
    ? error.params.missingProperty
    : lastPathSegment(error.instancePath)
  const artifactId = artifactIdForPath(registry, error.instancePath)
  const recordedValue = valueAtInstancePath(registry, error.instancePath)

  if (field === 'surfaceTier' && Array.isArray(recordedValue)) {
    return {
      code: 'MULTI_TIER',
      artifactId,
      field,
      recordedValue: [...recordedValue],
      mandatoryValue: 'exactly one surface tier',
    }
  }

  if (field === 'surfaceTier' && error.keyword === 'enum') {
    return {
      code: 'UNKNOWN_TIER',
      artifactId,
      field,
      recordedValue,
      mandatoryValue: [...SURFACE_TIERS],
    }
  }

  if (error.keyword === 'required' || error.keyword === 'minLength') {
    return {
      code: 'MISSING_FIELD',
      artifactId,
      field,
      mandatoryValue: 'non-empty value',
    }
  }

  return {
    code: 'SCHEMA_VIOLATION',
    artifactId,
    field: field || error.keyword,
    mandatoryValue: error.keyword,
  }
}

function artifactIdForPath(registry, instancePath) {
  const match = /^\/entries\/(\d+)/.exec(instancePath)
  if (!match) return '@registry'
  return entryArtifactId(registry.entries?.[Number(match[1])], Number(match[1]))
}

function entryArtifactId(entry, index) {
  return typeof entry?.artifactId === 'string' && entry.artifactId.length > 0
    ? entry.artifactId
    : `@entries/${index}`
}

function valueAtInstancePath(root, instancePath) {
  if (!instancePath) return root
  return instancePath
    .split('/')
    .slice(1)
    .map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, segment) => value?.[segment], root)
}

function lastPathSegment(instancePath) {
  return instancePath
    .split('/')
    .at(-1)
    ?.replaceAll('~1', '/')
    .replaceAll('~0', '~') ?? ''
}

function sortAndDedupeViolations(violations) {
  const seen = new Set()
  return violations
    .filter(violation => {
      const key = JSON.stringify(violation)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => {
      const leftKey = `${left.artifactId}\0${left.code}\0${left.field ?? ''}`
      const rightKey = `${right.artifactId}\0${right.code}\0${right.field ?? ''}`
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    })
}

function isBlank(value) {
  return value === undefined
    || value === null
    || (typeof value === 'string' && value.trim().length === 0)
}

function rateLimitsEqual(left, right) {
  return left?.requests === right.requests
    && left?.windowSeconds === right.windowSeconds
}

function copyRateLimit(rateLimit) {
  if (!isPlainObject(rateLimit)) return rateLimit ?? null
  return {
    requests: rateLimit.requests,
    windowSeconds: rateLimit.windowSeconds,
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatViolation(violation) {
  const details = [
    violation.field ? `field=${violation.field}` : null,
    violation.recordedValue !== undefined
      ? `recorded=${JSON.stringify(violation.recordedValue)}`
      : null,
    violation.mandatoryValue !== undefined
      ? `mandatory=${JSON.stringify(violation.mandatoryValue)}`
      : null,
  ].filter(Boolean)
  return `${violation.code} artifact=${violation.artifactId}${details.length ? ` ${details.join(' ')}` : ''}`
}

export async function runRegistryValidateCli(args = process.argv.slice(2)) {
  const registryPath = args[0] ?? DEFAULT_SURFACE_PATHS.registry
  const schemaPath = args[1] ?? DEFAULT_SURFACE_PATHS.schema
  const result = await readRegistry(registryPath, { schemaPath })

  if (result.ok) {
    console.log(`entries=${result.registry.entries.length} tiers=${SURFACE_TIERS.length}`)
    return 0
  }

  for (const violation of result.violations) console.log(formatViolation(violation))
  return 1
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  process.exitCode = await runRegistryValidateCli()
}
