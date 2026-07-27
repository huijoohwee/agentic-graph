#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  APPROVED_LICENSES,
  DEFAULT_SURFACE_PATHS,
  LICENSE_REGISTRY_SCHEMA,
} from './constants.mjs'

export const LICENSE_CATEGORIES = Object.freeze([
  'permissive',
  'no-reuse',
  'unlicensed-private',
])

const LICENSE_CATEGORY_BY_ID = Object.freeze({
  [APPROVED_LICENSES.prose]: 'permissive',
  [APPROVED_LICENSES.machineMetadata]: 'permissive',
  [APPROVED_LICENSES.noReuse]: 'no-reuse',
  [APPROVED_LICENSES.private]: 'unlicensed-private',
})

const MANDATORY_LICENSE_BY_CLASS = Object.freeze({
  'published-document': APPROVED_LICENSES.prose,
  guideline: APPROVED_LICENSES.prose,
  specification: APPROVED_LICENSES.prose,
  'machine-readable-metadata': APPROVED_LICENSES.machineMetadata,
  'invocation-dictionary-metadata': APPROVED_LICENSES.machineMetadata,
  'capability-description': APPROVED_LICENSES.machineMetadata,
  'service-description': APPROVED_LICENSES.machineMetadata,
  'mcp-endpoint': APPROVED_LICENSES.machineMetadata,
  'invocation-token': APPROVED_LICENSES.machineMetadata,
  'mcp-manifest': APPROVED_LICENSES.machineMetadata,
  'agent-card': APPROVED_LICENSES.machineMetadata,
  'api-catalog': APPROVED_LICENSES.machineMetadata,
  'llms-index': APPROVED_LICENSES.machineMetadata,
  'bundled-build-output': APPROVED_LICENSES.noReuse,
  'dist-module': APPROVED_LICENSES.noReuse,
})

export function validateLicenseRegistry(registry, surfaceRegistry = null) {
  const violations = []
  if (!isPlainObject(registry)) {
    return {
      ok: false,
      violations: [{
        code: 'LICENSE_REGISTRY_INVALID',
        artifactClass: '@registry',
        field: 'registry',
        mandatoryValue: 'object',
      }],
    }
  }

  if (registry.schema !== LICENSE_REGISTRY_SCHEMA) {
    violations.push({
      code: 'LICENSE_REGISTRY_INVALID',
      artifactClass: '@registry',
      field: 'schema',
      recordedValue: registry.schema,
      mandatoryValue: LICENSE_REGISTRY_SCHEMA,
    })
  }
  for (const field of ['version', 'declarationFile']) {
    if (!nonEmptyString(registry[field])) {
      violations.push(missingField('@registry', field))
    }
  }
  if (
    nonEmptyString(registry.version)
    && !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(registry.version)
  ) {
    violations.push({
      code: 'LICENSE_REGISTRY_INVALID',
      artifactClass: '@registry',
      field: 'version',
      recordedValue: registry.version,
      mandatoryValue: 'semantic version',
    })
  }

  const licenses = Array.isArray(registry.licenses) ? registry.licenses : []
  const mappings = Array.isArray(registry.classMappings) ? registry.classMappings : []
  if (!Array.isArray(registry.licenses)) {
    violations.push(missingField('@registry', 'licenses'))
  }
  if (!Array.isArray(registry.classMappings)) {
    violations.push(missingField('@registry', 'classMappings'))
  }

  const licensesById = new Map()
  licenses.forEach((license, index) => {
    const licenseId = nonEmptyString(license?.licenseId)
      ? license.licenseId
      : `@licenses/${index}`
    for (const field of ['licenseId', 'category', 'notice']) {
      if (!nonEmptyString(license?.[field])) {
        violations.push(missingField(licenseId, field))
      }
    }
    if (licensesById.has(license?.licenseId)) {
      violations.push({
        code: 'DUPLICATE_LICENSE',
        artifactClass: licenseId,
        field: 'licenseId',
        recordedValue: license?.licenseId,
        mandatoryValue: 'unique license identifier',
      })
    }
    if (nonEmptyString(license?.licenseId)) {
      licensesById.set(license.licenseId, license)
    }

    const mandatoryCategory = LICENSE_CATEGORY_BY_ID[license?.licenseId]
    if (!mandatoryCategory) {
      violations.push({
        code: 'UNKNOWN_LICENSE',
        artifactClass: licenseId,
        field: 'licenseId',
        recordedValue: license?.licenseId,
        mandatoryValue: Object.keys(LICENSE_CATEGORY_BY_ID),
      })
    } else if (license.category !== mandatoryCategory) {
      violations.push({
        code: 'LICENSE_CATEGORY',
        artifactClass: licenseId,
        field: 'category',
        recordedValue: license.category,
        mandatoryValue: mandatoryCategory,
      })
    }
  })

  for (const [licenseId, category] of Object.entries(LICENSE_CATEGORY_BY_ID)) {
    if (!licensesById.has(licenseId)) {
      violations.push({
        code: 'MISSING_LICENSE',
        artifactClass: '@registry',
        field: 'licenses',
        mandatoryValue: { licenseId, category },
      })
    }
  }

  const mappingsByClass = new Map()
  mappings.forEach((mapping, index) => {
    const artifactClass = nonEmptyString(mapping?.artifactClass)
      ? mapping.artifactClass
      : `@classMappings/${index}`
    for (const field of ['artifactClass', 'licenseId', 'category']) {
      if (!nonEmptyString(mapping?.[field])) {
        violations.push(missingField(artifactClass, field))
      }
    }

    const existing = mappingsByClass.get(mapping?.artifactClass) ?? []
    existing.push(mapping)
    mappingsByClass.set(mapping?.artifactClass, existing)

    const license = licensesById.get(mapping?.licenseId)
    if (!license) {
      violations.push({
        code: 'UNKNOWN_LICENSE',
        artifactClass,
        field: 'licenseId',
        recordedValue: mapping?.licenseId,
        mandatoryValue: 'recorded license identifier',
      })
    } else if (mapping.category !== license.category) {
      violations.push({
        code: 'LICENSE_CATEGORY',
        artifactClass,
        field: 'category',
        recordedValue: mapping.category,
        mandatoryValue: license.category,
      })
    }

    const mandatoryLicense = MANDATORY_LICENSE_BY_CLASS[mapping?.artifactClass]
    if (mandatoryLicense && mapping?.licenseId !== mandatoryLicense) {
      violations.push({
        code: 'MANDATORY_LICENSE',
        artifactClass,
        field: 'licenseId',
        recordedValue: mapping?.licenseId,
        mandatoryValue: mandatoryLicense,
      })
    }
  })

  for (const [artifactClass, classMappings] of mappingsByClass) {
    if (artifactClass && classMappings.length > 1) {
      violations.push({
        code: 'DOUBLE_CATEGORIZED_CLASS',
        artifactClass,
        field: 'classMappings',
        recordedValue: classMappings.map(mapping => mapping.licenseId),
        mandatoryValue: 'exactly one class mapping',
      })
    }
  }

  const surfaceClasses = new Set(
    (Array.isArray(surfaceRegistry?.entries) ? surfaceRegistry.entries : [])
      .map(entry => entry?.artifactClass)
      .filter(nonEmptyString),
  )
  for (const artifactClass of surfaceClasses) {
    const classMappings = mappingsByClass.get(artifactClass) ?? []
    if (classMappings.length === 0) {
      violations.push({
        code: 'UNCATEGORIZED_CLASS',
        artifactClass,
        field: 'classMappings',
        mandatoryValue: 'exactly one class mapping',
      })
    }
  }

  const normalizedViolations = sortAndDedupeViolations(violations)
  return {
    ok: normalizedViolations.length === 0,
    violations: normalizedViolations,
  }
}

export function resolveLicense(artifactClassOrRegistry, registryOrArtifactClass) {
  const [artifactClass, registry] = typeof artifactClassOrRegistry === 'string'
    ? [artifactClassOrRegistry, registryOrArtifactClass]
    : [registryOrArtifactClass, artifactClassOrRegistry]
  const matches = (Array.isArray(registry?.classMappings)
    ? registry.classMappings
    : [])
    .filter(mapping => mapping?.artifactClass === artifactClass)

  if (matches.length !== 1) return { licenseId: null, category: null }
  return {
    licenseId: matches[0].licenseId ?? null,
    category: matches[0].category ?? null,
  }
}

export function renderDeclaration(registry) {
  const mappings = [...(Array.isArray(registry?.classMappings)
    ? registry.classMappings
    : [])]
    .filter(mapping => nonEmptyString(mapping?.artifactClass))
    .sort((left, right) => compareText(left.artifactClass, right.artifactClass))
  const licenses = new Map(
    (Array.isArray(registry?.licenses) ? registry.licenses : [])
      .filter(license => nonEmptyString(license?.licenseId))
      .map(license => [license.licenseId, license]),
  )

  const lines = [
    '# Reuse terms',
    '',
    'Generated from `config/license-registry.json`. Do not edit this file directly.',
    '',
    '| Artifact class | License identifier | Category |',
    '| --- | --- | --- |',
    ...mappings.map(mapping => (
      `| ${escapeTableCell(mapping.artifactClass)} | ${escapeTableCell(mapping.licenseId)} | ${escapeTableCell(mapping.category)} |`
    )),
    '',
    '## License notices',
    '',
  ]

  for (const licenseId of [...licenses.keys()].sort(compareText)) {
    const license = licenses.get(licenseId)
    lines.push(`- \`${licenseId}\` (${license.category}): ${singleLine(license.notice)}`)
  }
  return `${lines.join('\n')}\n`
}

export async function readLicenseRegistry(
  registryPath = DEFAULT_SURFACE_PATHS.licenses,
  options = {},
) {
  const loadFile = typeof options?.readFile === 'function' ? options.readFile : readFile
  try {
    const registry = JSON.parse(await loadFile(registryPath, {
      encoding: 'utf8',
      signal: options?.signal,
    }))
    return { registry, ...validateLicenseRegistry(registry) }
  } catch (error) {
    return {
      ok: false,
      registry: null,
      violations: [{
        code: error instanceof SyntaxError ? 'INVALID_JSON' : 'LICENSE_REGISTRY_READ_ERROR',
        artifactClass: '@registry',
        field: error instanceof SyntaxError ? 'json' : 'path',
        mandatoryValue: error instanceof SyntaxError ? 'valid JSON' : 'readable local file',
      }],
    }
  }
}

function missingField(artifactClass, field) {
  return {
    code: 'MISSING_FIELD',
    artifactClass,
    field,
    mandatoryValue: 'non-empty value',
  }
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
      const leftKey = `${left.artifactClass}\0${left.code}\0${left.field ?? ''}`
      const rightKey = `${right.artifactClass}\0${right.code}\0${right.field ?? ''}`
      return compareText(leftKey, rightKey)
    })
}

function escapeTableCell(value) {
  return singleLine(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|')
}

function singleLine(value) {
  return typeof value === 'string'
    ? value.replace(/[\r\n]+/gu, ' ').trim()
    : ''
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
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
  return `${violation.code} class=${violation.artifactClass}${details.length ? ` ${details.join(' ')}` : ''}`
}

export async function runLicenseRegistryCli(args = process.argv.slice(2)) {
  const render = args.includes('--render')
  const registryPath = args.find(argument => !argument.startsWith('--'))
    ?? DEFAULT_SURFACE_PATHS.licenses
  const result = await readLicenseRegistry(registryPath)
  if (!result.ok) {
    for (const violation of result.violations) console.log(formatViolation(violation))
    return 1
  }
  if (render) {
    process.stdout.write(renderDeclaration(result.registry))
  } else {
    console.log(
      `licenses=${result.registry.licenses.length} classes=${result.registry.classMappings.length} categories=${LICENSE_CATEGORIES.length}`,
    )
  }
  return 0
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  process.exitCode = await runLicenseRegistryCli()
}
