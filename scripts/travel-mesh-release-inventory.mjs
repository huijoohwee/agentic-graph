import { TRAVEL_MESH_PLAN, digest, requireText, routeSpecFor } from './travel-mesh-release-plan.mjs'

export const parseR2BucketNames = stdout => {
  if (typeof stdout !== 'string') throw new Error('R2 bucket inventory is malformed')
  const names = stdout.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*name:\s+([^\s]+)\s*$/)
    return match ? [match[1]] : []
  })
  if (!names.length) throw new Error('R2 bucket inventory did not expose anchored name records')
  return new Set(names)
}

export const hasExactContainerImage = (value, reference) => {
  if (!Array.isArray(value)) throw new Error('container image inventory is malformed')
  const match = String(reference).match(/^([a-z0-9.-]+)\/([^@]+)@sha256:([0-9a-f]{64})$/)
  if (!match) throw new Error('immutable container image reference is malformed')
  const [, registry, repositoryPath, expectedDigest] = match
  const pathParts = repositoryPath.split('/').filter(Boolean)
  const repositoryAliases = new Set([`${registry}/${repositoryPath}`, repositoryPath,
    pathParts.length > 1 ? pathParts.slice(1).join('/') : repositoryPath])
  for (const record of value) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('container image inventory record is malformed')
    const repository = typeof record.repository === 'string' ? record.repository : typeof record.name === 'string' ? record.name : null
    const scalarDigest = ['digest', 'manifest_digest', 'image_digest'].flatMap(field => typeof record[field] === 'string' ? [record[field]] : [])
    const digestLists = ['digests', 'tags'].flatMap(field => Array.isArray(record[field]) ? record[field] : [])
    if (!repository || (!scalarDigest.length && !Array.isArray(record.digests) && !Array.isArray(record.tags))) {
      throw new Error('container image inventory schema cannot prove repository and digest together')
    }
    const normalizedDigests = [
      ...scalarDigest.map(item => item.replace(/^(?:@?sha256:)?/, '')),
      ...digestLists.flatMap(item => typeof item === 'string' && /^sha256(?::|-)[0-9a-f]{64}$/.test(item)
        ? [item.replace(/^sha256(?::|-)/, '')] : []),
    ]
    if (repositoryAliases.has(repository.replace(/^\/+/, '')) && normalizedDigests.includes(expectedDigest)) return true
  }
  return false
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

export const assertMeshSubdomainsDisabled = (apiFetch, environment) => Promise.all(TRAVEL_MESH_PLAN
  .map(entry => assertWorkerSubdomainDisabled(apiFetch, environment, entry.worker)))

export const validateRouteInventory = (routes, domains, environment) => {
  if (!Array.isArray(routes) || !Array.isArray(domains)) throw new Error('travel route inventory is malformed')
  const expected = routeSpecFor(environment)
  const routeRecords = routes.map(route => {
    if (!route || typeof route.pattern !== 'string' || (route.script != null && typeof route.script !== 'string')) throw new Error('Worker route record is malformed')
    return { pattern: route.pattern, script: route.script ?? null }
  })
  const expectedRouteKeys = new Set(expected.routes.map(route => `${route.pattern}\0${route.script}`))
  const protectedPrefixes = [
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/knowgrph/control-plane/mcp`,
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/knowgrph/control-plane/agents`,
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/knowgrph/control-plane/travel/reconciliation`,
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
      for (const name of ['KNOWGRPH_MEDIA_R2_BUCKET', 'TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET', 'TRAVEL_STORAGE_R2_BUCKET']) {
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
    ['Containers entitlement', async () => digest(await runJson(run,
      ['--no-install', 'wrangler', 'containers', 'list', '--json'], 'Containers entitlement'))],
    ['overflow container image', async () => {
      const value = await runJson(run, ['--no-install', 'wrangler', 'containers', 'images', 'list', '--json'], 'container image inventory')
      if (!environment.TRAVEL_OVERFLOW_CONTAINER_IMAGE) throw new Error('TRAVEL_OVERFLOW_CONTAINER_IMAGE protected target is missing')
      if (!hasExactContainerImage(value, environment.TRAVEL_OVERFLOW_CONTAINER_IMAGE)) throw new Error('exact immutable overflow container image is absent')
      return digest(value)
    }],
    ['Worker routes and custom domains', async () => {
      const zoneId = requireText(environment.TRAVEL_PUBLIC_ZONE_ID, 'TRAVEL_PUBLIC_ZONE_ID')
      const accountId = requireText(environment.CLOUDFLARE_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID')
      const storageHost = `storage.${requireText(environment.TRAVEL_PUBLIC_ZONE_NAME, 'TRAVEL_PUBLIC_ZONE_NAME')}`
      const [routes, domains] = await Promise.all([
        cloudflareApiResult(apiFetch, `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`, environment, 'Worker route inventory'),
        cloudflareApiResult(apiFetch, `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/domains?hostname=${encodeURIComponent(storageHost)}&zone_id=${zoneId}`,
          environment, 'Worker custom-domain inventory'),
      ])
      return digest(validateRouteInventory(routes, domains, environment))
    }],
    ['Worker subdomain exposure', async () => digest(await assertMeshSubdomainsDisabled(apiFetch, environment))],
  ]
  const results = await Promise.allSettled(checks.map(([, check]) => check()))
  const evidence = {}, failures = []
  results.forEach((result, index) => {
    const label = checks[index][0]
    if (result.status === 'rejected') failures.push(`${label}: ${result.reason.message}`)
    else evidence[label] = result.value
  })
  return { evidence, failures }
}
