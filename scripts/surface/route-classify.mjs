#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  APPROVED_FETCH_PROXY_RATE_LIMIT,
  DEFAULT_SURFACE_PATHS,
  FETCH_PROXY_ROUTES,
  SURFACE_TIER_RESTRICTIVENESS,
  SURFACE_TIERS,
} from './constants.mjs'

const FETCH_PROXY_ROUTE_SET = new Set(FETCH_PROXY_ROUTES)

export function classifyPath(registry, routePath) {
  const pathValue = typeof routePath === 'string' ? routePath : ''
  const entries = Array.isArray(registry?.entries) ? registry.entries : []
  const exactMatches = []
  const patternMatches = []

  for (const entry of entries) {
    if (!isClassifiableEntry(entry)) continue
    const pathKind = entry.pathKind ?? (hasGlobToken(entry.path) ? 'glob' : 'exact')
    if (pathKind === 'exact' && entry.path === pathValue) {
      exactMatches.push(entry)
    } else if (pathKind === 'glob' && globMatches(entry.path, pathValue)) {
      patternMatches.push(entry)
    }
  }

  // Literal declarations are deliberate exceptions and therefore outrank
  // directory or route-family patterns.
  const candidates = exactMatches.length > 0 ? exactMatches : patternMatches
  const selected = selectMostRestrictive(candidates)
  if (!selected || !SURFACE_TIERS.includes(selected.surfaceTier)) {
    return {
      path: pathValue,
      tier: 'private',
      executionRoute: 'none',
      classified: false,
      artifactId: null,
    }
  }

  const result = {
    path: pathValue,
    tier: selected.surfaceTier,
    executionRoute: selected.targetExecutionRoute
      ?? selected.executionRoute
      ?? selected.ingressRoute
      ?? 'none',
    classified: true,
    artifactId: selected.artifactId ?? null,
  }
  if (isRateLimit(selected.rateLimit)) {
    result.rateLimit = {
      requests: selected.rateLimit.requests,
      windowSeconds: selected.rateLimit.windowSeconds,
    }
  }
  if (typeof selected.readOnly === 'boolean') result.readOnly = selected.readOnly
  return result
}

export function classifyRoutes(registry, routesManifest) {
  const manifestPaths = extractManifestPaths(routesManifest)
  const routes = []
  const unclassified = []
  const missingRateLimit = []

  for (const routePath of manifestPaths) {
    const classification = classifyPath(registry, routePath)
    const {
      classified,
      artifactId: _artifactId,
      ...route
    } = classification
    routes.push(route)
    if (!classified) unclassified.push(routePath)
    if (
      FETCH_PROXY_ROUTE_SET.has(routePath)
      && !isApprovedFetchProxyRateLimit(route.rateLimit)
    ) {
      missingRateLimit.push(routePath)
    }
  }

  return { routes, unclassified, missingRateLimit }
}

export function isApprovedFetchProxyRateLimit(rateLimit) {
  return rateLimit?.requests === APPROVED_FETCH_PROXY_RATE_LIMIT.requests
    && rateLimit?.windowSeconds === APPROVED_FETCH_PROXY_RATE_LIMIT.windowSeconds
}

function extractManifestPaths(routesManifest) {
  const values = Array.isArray(routesManifest)
    ? routesManifest
    : Array.isArray(routesManifest?.include)
      ? routesManifest.include
      : Array.isArray(routesManifest?.routes)
        ? routesManifest.routes
        : []
  const paths = []
  const seen = new Set()

  values.forEach((value, index) => {
    const routePath = typeof value === 'string'
      ? value
      : typeof value?.path === 'string'
        ? value.path
        : `@invalid-route/${index}`
    if (seen.has(routePath)) return
    seen.add(routePath)
    paths.push(routePath)
  })
  return paths
}

function selectMostRestrictive(entries) {
  return [...entries].sort((left, right) => {
    const tierDifference = (SURFACE_TIER_RESTRICTIVENESS[right.surfaceTier] ?? 0)
      - (SURFACE_TIER_RESTRICTIVENESS[left.surfaceTier] ?? 0)
    if (tierDifference !== 0) return tierDifference
    const leftKey = `${left.artifactId ?? ''}\0${left.path}`
    const rightKey = `${right.artifactId ?? ''}\0${right.path}`
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })[0]
}

function globMatches(pattern, value) {
  if (typeof pattern !== 'string' || typeof value !== 'string') return false
  try {
    const marker = '\u0000'
    const escaped = pattern
      .replaceAll('**', marker)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '.*')
      .replaceAll('?', '.')
      .replaceAll(marker, '.*')
    return new RegExp(`^${escaped}$`, 'u').test(value)
  } catch {
    return false
  }
}

function hasGlobToken(value) {
  return typeof value === 'string' && /[*?]/u.test(value)
}

function isClassifiableEntry(entry) {
  return Boolean(entry)
    && typeof entry === 'object'
    && typeof entry.path === 'string'
    && typeof entry.surfaceTier === 'string'
}

function isRateLimit(value) {
  return Boolean(value)
    && Number.isInteger(value.requests)
    && Number.isInteger(value.windowSeconds)
}

export async function runRouteClassifyCli(args = process.argv.slice(2)) {
  const registryPath = args[0] ?? DEFAULT_SURFACE_PATHS.registry
  const routesPath = args[1]
  if (!routesPath) {
    console.log('ROUTES_READ_ERROR field=path mandatory="route manifest path"')
    return 1
  }

  try {
    const [registryBytes, routesBytes] = await Promise.all([
      readFile(registryPath, 'utf8'),
      readFile(routesPath, 'utf8'),
    ])
    const result = classifyRoutes(
      JSON.parse(registryBytes),
      JSON.parse(routesBytes),
    )
    console.log(
      `routes=${result.routes.length} unclassified=${result.unclassified.length} missingRateLimit=${result.missingRateLimit.length}`,
    )
    for (const routePath of result.unclassified) {
      console.log(`UNCLASSIFIED_ROUTE path=${JSON.stringify(routePath)} mandatory="declared surface tier"`)
    }
    for (const routePath of result.missingRateLimit) {
      console.log(
        `RATE_LIMIT_REQUIRED path=${JSON.stringify(routePath)} mandatory=${JSON.stringify(APPROVED_FETCH_PROXY_RATE_LIMIT)}`,
      )
    }
    return result.unclassified.length === 0 && result.missingRateLimit.length === 0
      ? 0
      : 1
  } catch (error) {
    console.log(
      `${error instanceof SyntaxError ? 'INVALID_JSON' : 'ROUTES_READ_ERROR'} field=${error instanceof SyntaxError ? 'json' : 'path'}`,
    )
    return 1
  }
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  process.exitCode = await runRouteClassifyCli()
}
