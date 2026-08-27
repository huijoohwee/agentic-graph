import { TRAVEL_MESH_PLAN, digest, requireText, routeSpecFor } from './travel-mesh-release-plan.mjs'

const CLOUDFLARE_ACCESS_FAILURE = /(?:authentication error|too many authentication failures|rate limited|\bcode:\s*(?:10000|10429|10502)\b)/i
export const isCloudflareAccessFailure = error => CLOUDFLARE_ACCESS_FAILURE.test(String(error?.message ?? error))

export const parseR2BucketNames = stdout => {
  if (typeof stdout !== 'string') throw new Error('R2 bucket inventory is malformed')
  const names = stdout.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*name:\s+([^\s]+)\s*$/)
    return match ? [match[1]] : []
  })
  if (!names.length) throw new Error('R2 bucket inventory did not expose anchored name records')
  return new Set(names)
}

const cloudflareApiEnvelope = async (fetchFn, url, environment, label) => {
  const response = await fetchFn(url, { headers: {
    accept: 'application/json', authorization: `Bearer ${requireText(environment.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN')}`,
  }, signal: AbortSignal.timeout(15_000) })
  const text = await response.text()
  if (text.length > 1_000_000) throw new Error(`${label} response is too large`)
  let value
  try { value = JSON.parse(text) } catch { throw new Error(`${label} did not return JSON`) }
  if (!response.ok || value?.success !== true) throw new Error(`${label} failed with status ${response.status}`)
  return value
}

const cloudflareApiResult = async (fetchFn, url, environment, label) => {
  const value = await cloudflareApiEnvelope(fetchFn, url, environment, label)
  if (!Array.isArray(value.result)) throw new Error(`${label} result is malformed`)
  if (Number(value.result_info?.total_pages ?? 1) > 1) throw new Error(`${label} response was unexpectedly paginated`)
  return value.result
}

export const assertWorkerSubdomainDisabled = async (apiFetch, environment, worker) => {
  const accountId = requireText(environment.CLOUDFLARE_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID')
  const value = await cloudflareApiEnvelope(apiFetch,
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(worker)}/subdomain`,
    environment, `${worker} subdomain inventory`)
  if (!value.result || Object.keys(value.result).sort().join(',') !== 'enabled,previews_enabled'
    || value.result.enabled !== false || value.result.previews_enabled !== false) {
    throw new Error(`${worker} workers.dev and preview URLs must both be disabled`)
  }
  return { worker, enabled: false, previewsEnabled: false }
}

export const assertMeshSubdomainsDisabled = async (apiFetch, environment) => {
  const evidence = []
  for (const entry of TRAVEL_MESH_PLAN) {
    evidence.push(await assertWorkerSubdomainDisabled(apiFetch, environment, entry.worker))
  }
  return evidence
}

export const validateRouteInventory = (routes, domains, environment) => {
  if (!Array.isArray(routes) || !Array.isArray(domains)) throw new Error('travel route inventory is malformed')
  const expected = routeSpecFor(environment)
  const routeRecords = routes.map(route => {
    if (!route || typeof route.pattern !== 'string' || (route.script != null && typeof route.script !== 'string')) throw new Error('Worker route record is malformed')
    return { pattern: route.pattern, script: route.script ?? null }
  })
  const expectedRouteKeys = new Set(expected.routes.map(route => `${route.pattern}\0${route.script}`))
  const protectedPrefixes = [
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agenticgraph/control-plane/mcp`,
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agenticgraph/control-plane/agents`,
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agenticgraph/control-plane/travel/reconciliation`,
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/api/storage`,
    `storage.${environment.TRAVEL_PUBLIC_ZONE_NAME}`,
  ]
  for (const route of expected.routes) {
    if (routeRecords.filter(item => item.pattern === route.pattern && item.script === route.script).length !== 1) {
      throw new Error(`exact Worker route is absent or duplicated: ${route.pattern} -> ${route.script}`)
    }
  }
  for (const route of routeRecords) {
    if (protectedPrefixes.some(prefix => route.pattern === prefix || route.pattern.startsWith(`${prefix}/`))
      && !expectedRouteKeys.has(`${route.pattern}\0${route.script}`)) {
      throw new Error(`unexpected overlapping Worker route: ${route.pattern} -> ${route.script}`)
    }
  }
  const domainRecords = domains.map(domain => {
    if (!domain || typeof domain.hostname !== 'string' || typeof domain.service !== 'string'
      || typeof domain.zone_id !== 'string' || typeof domain.zone_name !== 'string') throw new Error('Worker custom-domain record is malformed')
    return { hostname: domain.hostname, service: domain.service, zoneId: domain.zone_id, zoneName: domain.zone_name }
  })
  for (const domain of expected.domains) {
    if (domainRecords.filter(item => item.hostname === domain.hostname && item.service === domain.service
      && item.zoneId === domain.zoneId && item.zoneName === domain.zoneName).length !== 1 || domainRecords.length !== 1) {
      throw new Error(`exact Worker custom domain is absent or duplicated: ${domain.hostname} -> ${domain.service}`)
    }
  }
  return { routes: expected.routes, domains: expected.domains }
}

export const resourceReadiness = async ({ run, runJson, environment, apiFetch = fetch }) => {
  const checks = [
    ['KV namespaces', async () => {
      const value = await runJson(run, ['--no-install', 'wrangler', 'kv', 'namespace', 'list'], 'KV namespace inventory')
      if (!Array.isArray(value)) throw new Error('inventory is malformed')
      for (const name of ['TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID', 'TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID']) {
        if (!environment[name]) throw new Error(`${name} protected target is missing`)
        if (!value.some(item => item?.id === environment[name])) throw new Error(`${name} target ${environment[name]} is absent`)
      }
      return digest(value.map(item => ({ id: item.id, title: item.title })))
    }],
    ['R2 buckets', async () => {
      const result = await run(['--no-install', 'wrangler', 'r2', 'bucket', 'list'])
      const buckets = parseR2BucketNames(result.stdout)
      for (const name of ['AGENTICGRAPH_MEDIA_R2_BUCKET', 'TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET', 'TRAVEL_STORAGE_R2_BUCKET']) {
        if (!environment[name]) throw new Error(`${name} protected target is missing`)
        if (!buckets.has(environment[name])) throw new Error(`${name} target ${environment[name]} is absent`)
      }
      return digest(result.stdout)
    }],
    ['storage D1', async () => {
      const value = await runJson(run, ['--no-install', 'wrangler', 'd1', 'list', '--json'], 'storage D1 inventory')
      if (!environment.TRAVEL_STORAGE_D1_DATABASE_ID || !environment.TRAVEL_STORAGE_D1_DATABASE_NAME) throw new Error('protected D1 target fields are missing')
      if (!Array.isArray(value) || !value.some(item => (item?.uuid === environment.TRAVEL_STORAGE_D1_DATABASE_ID
        || item?.id === environment.TRAVEL_STORAGE_D1_DATABASE_ID) && item?.name === environment.TRAVEL_STORAGE_D1_DATABASE_NAME)) throw new Error('protected storage D1 target is absent')
      return digest(value)
    }],
    ['Worker routes and custom domains', async () => {
      const zoneId = requireText(environment.TRAVEL_PUBLIC_ZONE_ID, 'TRAVEL_PUBLIC_ZONE_ID')
      const accountId = requireText(environment.CLOUDFLARE_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID')
      const storageHost = `storage.${requireText(environment.TRAVEL_PUBLIC_ZONE_NAME, 'TRAVEL_PUBLIC_ZONE_NAME')}`
      const routes = await cloudflareApiResult(apiFetch,
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`, environment, 'Worker route inventory')
      const domains = await cloudflareApiResult(apiFetch,
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/domains?hostname=${encodeURIComponent(storageHost)}&zone_id=${zoneId}`,
        environment, 'Worker custom-domain inventory')
      return digest(validateRouteInventory(routes, domains, environment))
    }],
    ['Worker subdomain exposure', async () => digest(await assertMeshSubdomainsDisabled(apiFetch, environment))],
  ]
  const evidence = {}, failures = []
  for (const [label, check] of checks) {
    try { evidence[label] = await check() } catch (error) {
      failures.push(`${label}: ${error.message}`)
      if (isCloudflareAccessFailure(error)) break
    }
  }
  return { evidence, failures }
}
