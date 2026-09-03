import { TRAVEL_MESH_BOOTSTRAP_UNITS, canonical, digest, requireText, routeSpecFor } from './travel-mesh-release-plan.mjs'

const CLOUDFLARE_ACCESS_FAILURE = /(?:authentication error|too many authentication failures|rate limited|\b(?:code|provider codes?)[:\s]+(?:10000|10429|10502)\b)/i
const MAX_PROVIDER_JSON_BYTES = 1_000_000
const PROVIDER_API_TIMEOUT_MS = 15_000
const MAX_PROVIDER_PAGES = 10_000
const PROVIDER_PAGE_SIZE = 100
const ABSENT_WORKER_CODES = new Set([10007])
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

const readBoundedResponseText = async (response, label) => {
  const declaredLength = response.headers?.get?.('content-length')
  if (declaredLength != null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_PROVIDER_JSON_BYTES)) {
    throw new Error(`${label} response is too large`)
  }
  if (!response.body || typeof response.body.getReader !== 'function') throw new Error(`${label} response body is unavailable`)
  const reader = response.body.getReader(), chunks = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) throw new Error(`${label} response body is malformed`)
      length += value.byteLength
      if (length > MAX_PROVIDER_JSON_BYTES) throw new Error(`${label} response is too large`)
      chunks.push(value)
    }
  } catch (error) {
    try { void reader.cancel() } catch {}
    throw error
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new Error(`${label} is not UTF-8 JSON`) }
}

const envelopeErrorCodes = value => Array.isArray(value?.errors)
  ? value.errors.map(item => Number(item?.code)).filter(Number.isInteger).sort((a, b) => a - b) : []

const boundedProviderValue = async (read, label) => {
  let timer
  try {
    const value = await Promise.race([Promise.resolve().then(read), new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${PROVIDER_API_TIMEOUT_MS / 1000}s`)),
        PROVIDER_API_TIMEOUT_MS)
    })])
    let serialized
    try { serialized = JSON.stringify(value) } catch { throw new Error(`${label} JSON is malformed`) }
    if (serialized == null || new TextEncoder().encode(serialized).byteLength > MAX_PROVIDER_JSON_BYTES) {
      throw new Error(`${label} JSON is too large`)
    }
    return value
  } finally { clearTimeout(timer) }
}

export const cloudflareApiEnvelope = async (fetchFn, url, environment, label, options = {}) => {
  if (typeof fetchFn !== 'function') throw new Error(`${label} fetch adapter is required`)
  const response = await fetchFn(url, { headers: {
    accept: 'application/json', authorization: `Bearer ${requireText(environment.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN')}`,
    ...(options.body == null ? {} : { 'content-type': 'application/json' }), ...(options.headers ?? {}),
  }, method: options.method ?? 'GET', ...(options.body == null ? {} : { body: JSON.stringify(options.body) }),
  signal: AbortSignal.timeout(PROVIDER_API_TIMEOUT_MS) })
  if (!response || typeof response.ok !== 'boolean' || !Number.isInteger(response.status)) {
    throw new Error(`${label} response is malformed`)
  }
  const text = await readBoundedResponseText(response, label)
  let value
  try { value = JSON.parse(text) } catch { throw new Error(`${label} did not return JSON`) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} JSON envelope is malformed`)
  if (!response.ok || value.success !== true) {
    const codes = envelopeErrorCodes(value)
    throw new Error(`${label} failed with status ${response.status}${codes.length ? `; provider codes ${codes.join(',')}` : ''}`)
  }
  return value
}

export const cloudflareApiCursorPages = async (fetchFn, rawUrl, environment, label) => {
  const result = [], seenCursors = new Set()
  let cursor = null, expectedTotal = null
  for (let page = 1; page <= MAX_PROVIDER_PAGES; page += 1) {
    const url = new URL(rawUrl)
    url.searchParams.delete('cursor'); url.searchParams.set('per_page', String(PROVIDER_PAGE_SIZE))
    if (cursor !== null) url.searchParams.set('cursor', cursor)
    const value = await cloudflareApiEnvelope(fetchFn, url, environment, `${label} page ${page}`)
    if (!value.result || typeof value.result !== 'object' || Array.isArray(value.result)
      || (value.result.buckets != null && !Array.isArray(value.result.buckets))
      || !value.result_info || typeof value.result_info !== 'object' || Array.isArray(value.result_info)) {
      throw new Error(`${label} cursor pagination is malformed`)
    }
    const buckets = value.result.buckets ?? [], info = value.result_info
    if (Object.hasOwn(info, 'per_page') && info.per_page !== PROVIDER_PAGE_SIZE) {
      throw new Error(`${label} cursor page-size metadata is inconsistent`)
    }
    if (Object.hasOwn(info, 'count') && (!Number.isInteger(info.count) || info.count !== buckets.length)) {
      throw new Error(`${label} cursor count metadata is inconsistent`)
    }
    if (Object.hasOwn(info, 'total_count')) {
      if (!Number.isInteger(info.total_count) || info.total_count < 0) throw new Error(`${label} cursor total metadata is malformed`)
      expectedTotal ??= info.total_count
      if (info.total_count !== expectedTotal) throw new Error(`${label} cursor total metadata drifted`)
    }
    result.push(...buckets)
    const next = info.cursor
    if (next == null || next === '') {
      if (expectedTotal !== null && result.length !== expectedTotal) throw new Error(`${label} cursor total metadata is inconsistent`)
      return result
    }
    if (typeof next !== 'string' || !next || seenCursors.has(next) || buckets.length === 0) {
      throw new Error(`${label} cursor pagination did not advance`)
    }
    seenCursors.add(next)
    cursor = next
  }
  throw new Error(`${label} exceeded the bounded cursor page limit`)
}

const sortRecords = records => [...records].sort((left, right) => canonical(left).localeCompare(canonical(right)))
const providerText = (value, label) => {
  const text = requireText(value, label)
  if (text !== value) throw new Error(`${label} is not an exact provider identifier`)
  return text
}
const providerDigest = (value, label) => {
  const text = providerText(value, label)
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`${label} is malformed`)
  return text
}
const validateWorkerVersionsPageInfo = ({ info, page, itemCount, expected }) => {
  if (info == null) {
    if (expected.totalPages !== null && itemCount > 0 && page > expected.totalPages) throw new Error('Worker version pagination exceeded its declared final page')
    return expected
  }
  if (typeof info !== 'object' || Array.isArray(info)) throw new Error('Worker version pagination metadata is malformed')
  if (Object.hasOwn(info, 'page') && (!Number.isInteger(info.page) || info.page !== page)) {
    throw new Error('Worker version pagination did not advance')
  }
  if (Object.hasOwn(info, 'per_page') && (!Number.isInteger(info.per_page) || info.per_page !== PROVIDER_PAGE_SIZE)) {
    throw new Error('Worker version page-size metadata is inconsistent')
  }
  if (Object.hasOwn(info, 'count') && (!Number.isInteger(info.count) || info.count !== itemCount)) {
    throw new Error('Worker version page count metadata is inconsistent')
  }
  let { totalCount, totalPages } = expected
  if (Object.hasOwn(info, 'total_count')) {
    if (!Number.isInteger(info.total_count) || info.total_count < 0) {
      throw new Error('Worker version total-count metadata is malformed')
    }
    totalCount ??= info.total_count
    if (info.total_count !== totalCount) throw new Error('Worker version total-count metadata drifted')
  }
  if (Object.hasOwn(info, 'total_pages')) {
    if (!Number.isInteger(info.total_pages) || info.total_pages < 0 || info.total_pages > MAX_PROVIDER_PAGES) {
      throw new Error('Worker version total-page metadata is malformed')
    }
    totalPages ??= info.total_pages
    if (info.total_pages !== totalPages) throw new Error('Worker version total-page metadata drifted')
    if (itemCount > 0 && page > totalPages) throw new Error('Worker version pagination exceeded its declared final page')
  }
  return { totalCount, totalPages }
}

export const cloudflareWorkerVersionDetails = async (fetchFn, rawUrl, environment, label) => {
  let endpoint
  try { endpoint = new URL(rawUrl) } catch { throw new Error(`${label} URL is malformed`) }
  const collectionPath = endpoint.pathname.replace(/\/+$/, '')
  if (!collectionPath.endsWith('/versions')) throw new Error(`${label} URL is not a Worker Versions collection`)
  const ids = [], seenIds = new Set(), seenPages = new Set()
  let expected = { totalCount: null, totalPages: null }
  for (let page = 1; page <= MAX_PROVIDER_PAGES; page += 1) {
    const url = new URL(endpoint)
    url.searchParams.delete('deployable')
    url.searchParams.set('page', String(page)); url.searchParams.set('per_page', String(PROVIDER_PAGE_SIZE))
    const value = await cloudflareApiEnvelope(fetchFn, url, environment, `${label} page ${page}`)
    if (!value.result || typeof value.result !== 'object' || Array.isArray(value.result)
      || !Array.isArray(value.result.items) || value.result.items.length > PROVIDER_PAGE_SIZE) {
      throw new Error(`${label} result.items page is malformed`)
    }
    const pageIds = value.result.items.map((item, index) => providerText(item?.id,
      `${label} page ${page} item ${index} id`))
    expected = validateWorkerVersionsPageInfo({ info: value.result_info, page, itemCount: pageIds.length, expected })
    const trulyEmpty = page === 1 && ids.length === 0 && (expected.totalCount === null || expected.totalCount === 0)
      && (expected.totalPages === null || expected.totalPages <= 1)
    if (pageIds.length === 0 && !trulyEmpty && expected.totalPages !== null && page <= expected.totalPages) throw new Error(`${label} pagination ended before its declared final page`)
    if (pageIds.length === 0) {
      if (expected.totalCount !== null && ids.length !== expected.totalCount) {
        throw new Error(`${label} total-count metadata is inconsistent`)
      }
      break
    }
    const pageIdentity = pageIds.join('\0')
    if (seenPages.has(pageIdentity)) throw new Error(`${label} pagination did not advance`)
    seenPages.add(pageIdentity)
    for (const id of pageIds) {
      if (seenIds.has(id)) throw new Error(`${label} contains duplicate version identity ${id}`)
      seenIds.add(id); ids.push(id)
    }
    if (expected.totalCount !== null && ids.length > expected.totalCount) {
      throw new Error(`${label} total-count metadata is inconsistent`)
    }
    if (page === MAX_PROVIDER_PAGES) throw new Error(`${label} exceeded the bounded page limit`)
  }
  const details = []
  for (const [index, id] of ids.entries()) {
    const url = new URL(endpoint)
    url.pathname = `${collectionPath}/${encodeURIComponent(id)}`; url.search = ''; url.hash = ''
    const value = await cloudflareApiEnvelope(fetchFn, url, environment, `${label} version ${index + 1}`)
    if (!value.result || typeof value.result !== 'object' || Array.isArray(value.result)
      || providerText(value.result.id, `${label} version ${index + 1} id`) !== id) {
      throw new Error(`${label} version detail identity drifted from ${id}`)
    }
    if (value.result.annotations != null
      && (typeof value.result.annotations !== 'object' || Array.isArray(value.result.annotations))) {
      throw new Error(`${label} version ${id} annotations are malformed`)
    }
    details.push(value.result)
  }
  return details
}
const uniqueRecords = (records, keyFor, label) => {
  const seen = new Set()
  for (const record of records) {
    const key = keyFor(record)
    if (seen.has(key)) throw new Error(`${label} contains duplicate provider identity ${key}`)
    seen.add(key)
  }
  return sortRecords(records)
}
const optionalText = (value, label) => value == null ? null : providerText(value, label)
const normalizeWorkers = records => uniqueRecords(records.map((record, index) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Worker script record ${index} is malformed`)
  const id = optionalText(record.id, `Worker script record ${index} id`)
  const name = optionalText(record.name, `Worker script record ${index} name`)
  if (id === null && name === null) throw new Error(`Worker script record ${index} identity is absent`)
  return { ...(id === null ? {} : { id }), ...(name === null ? {} : { name }) }
}), record => record.id ?? record.name, 'Worker script inventory')
const normalizeKv = records => uniqueRecords(records.map((record, index) => ({
  id: providerText(record?.id, `KV namespace record ${index} id`),
  title: providerText(record?.title, `KV namespace record ${index} title`),
})), record => record.id, 'KV namespace inventory')
const normalizeR2 = records => uniqueRecords(records.map((record, index) => ({
  name: providerText(record?.name ?? record?.bucket_name, `R2 bucket record ${index} name`),
})), record => record.name, 'R2 bucket inventory')
const normalizeD1 = records => uniqueRecords(records.map((record, index) => {
  const uuid = optionalText(record?.uuid, `D1 database record ${index} uuid`)
  const id = optionalText(record?.id, `D1 database record ${index} id`)
  if (uuid === null && id === null) throw new Error(`D1 database record ${index} identity is absent`)
  return { ...(uuid === null ? {} : { uuid }), ...(id === null ? {} : { id }),
    name: providerText(record?.name, `D1 database record ${index} name`) }
}), record => record.uuid ?? record.id, 'D1 database inventory')
const normalizeZones = records => uniqueRecords(records.map((record, index) => ({
  id: providerText(record?.id, `Zone record ${index} id`), name: providerText(record?.name, `Zone record ${index} name`),
})), record => record.id, 'Zone inventory')
const normalizeRoutes = records => uniqueRecords(records.map((record, index) => ({
  ...(record?.id == null ? {} : { id: providerText(record.id, `Worker route record ${index} id`) }),
  zoneId: providerText(record?.zoneId, `Worker route record ${index} zone id`),
  zoneName: providerText(record?.zoneName, `Worker route record ${index} zone name`),
  pattern: providerText(record?.pattern, `Worker route record ${index} pattern`),
  script: optionalText(record?.script, `Worker route record ${index} script`),
})), record => record.id ?? `${record.pattern}\0${record.script}`, 'Worker route inventory')
const normalizeDomains = records => uniqueRecords(records.map((record, index) => ({
  ...(record?.id == null ? {} : { id: providerText(record.id, `Worker domain record ${index} id`) }),
  hostname: providerText(record?.hostname, `Worker domain record ${index} hostname`),
  service: providerText(record?.service, `Worker domain record ${index} service`),
  zone_id: providerText(record?.zone_id, `Worker domain record ${index} zone id`),
  zone_name: providerText(record?.zone_name, `Worker domain record ${index} zone name`),
  ...(record?.environment == null ? {} : { environment: providerText(record.environment,
    `Worker domain record ${index} environment`) }),
})), record => record.id ?? record.hostname, 'Worker domain inventory')
const exactActiveDeployment = (value, worker) => {
  if (!value || !Array.isArray(value.versions) || value.versions.length !== 1
    || value.versions[0]?.percentage !== 100) {
    throw new Error(`${worker} must expose one active version at exactly 100%`)
  }
  return { deploymentId: providerText(value.id, `${worker} deployment id`),
    versionId: providerText(value.versions[0]?.version_id, `${worker} active version id`),
    percentage: 100 }
}
const bindingField = (binding, provider, evidence, output, label) => {
  if (binding[provider] != null) evidence[output] = providerText(binding[provider], `${label} ${provider}`)
}
const requiredBindingField = (binding, provider, evidence, output, label) => {
  evidence[output] = providerText(binding[provider], `${label} ${provider}`)
}
export const bindingEvidence = (version, label) => {
  if (!Array.isArray(version?.resources?.bindings)) throw new Error(`${label} binding inventory is malformed`)
  const seen = new Set()
  return version.resources.bindings.map(binding => {
    const name = providerText(binding?.name, `${label} binding name`)
    const type = providerText(binding?.type, `${label} binding type`)
    if (seen.has(name)) throw new Error(`${label} binding inventory is duplicated or malformed`)
    seen.add(name)
    const evidence = { name, type }
    if (type === 'plain_text') {
      if (typeof binding.text !== 'string') throw new Error(`${label} plain-text binding is malformed`)
      evidence.valueDigest = digest(binding.text)
    } else if (type === 'json' && Object.hasOwn(binding, 'json')) evidence.valueDigest = digest(binding.json)
    if (type !== 'secret_text') {
      for (const [provider, output] of [['namespace_id', 'namespaceId'], ['bucket_name', 'bucketName'],
        ['service', 'service'], ['entrypoint', 'entrypoint'], ['environment', 'environment'], ['class_name', 'className'],
        ['script_name', 'scriptName'], ['queue_name', 'queueName'], ['dataset', 'dataset'], ['index_name', 'indexName'],
        ['hyperdrive_id', 'hyperdriveId'], ['workflow_name', 'workflowName']]) bindingField(binding, provider, evidence, output, label)
      if (['d1', 'd1_database'].includes(type)) {
        requiredBindingField(binding, binding.database_id == null ? 'id' : 'database_id', evidence, 'databaseId', label)
      }
      if (type === 'kv_namespace') requiredBindingField(binding, 'namespace_id', evidence, 'namespaceId', label)
      if (type === 'r2_bucket') requiredBindingField(binding, 'bucket_name', evidence, 'bucketName', label)
      if (type === 'service') requiredBindingField(binding, 'service', evidence, 'service', label)
    }
    return evidence
  }).sort((left, right) => left.name.localeCompare(right.name))
}

const isExplicitAbsentWorker = error => {
  const candidates = [error?.code, error?.status, error?.statusCode, error?.response?.status,
    ...(Array.isArray(error?.errors) ? error.errors.flatMap(item => [item?.code, item?.status]) : [])]
  if (candidates.some(value => Number(value) === 404 || ABSENT_WORKER_CODES.has(Number(value)))) return true
  return /\b(?:api\s+error|code|provider\s+codes?)\s*[:=]?\s*10007\b|\b(?:http\s+)?status\s*[:=]?\s*404\b/i
    .test(String(error?.message ?? ''))
}

export const bootstrapWorkerEvidence = async ({ entry, wranglerJson }) => {
  const flags = ['--config', entry.config, ...(entry.environment ? ['--env', entry.environment] : []), '--name', entry.worker]
  let rawDeployment
  try {
    rawDeployment = await boundedProviderValue(() => wranglerJson(
      ['--no-install', 'wrangler', 'deployments', 'status', ...flags, '--json']), `${entry.id} deployment inventory`)
  } catch (error) {
    if (isExplicitAbsentWorker(error)) return { id: entry.id, worker: entry.worker, absent: true }
    throw error
  }
  const deployment = exactActiveDeployment(rawDeployment, entry.worker)
  const version = await boundedProviderValue(() => wranglerJson(['--no-install', 'wrangler', 'versions', 'view',
    deployment.versionId, ...flags, '--json']), `${entry.id} active version inventory`)
  if (version?.id !== deployment.versionId) throw new Error(`${entry.id} active version readback identity drifted`)
  const bindings = bindingEvidence(version, `${entry.id} version`)
  if (version.annotations != null && (typeof version.annotations !== 'object' || Array.isArray(version.annotations))) {
    throw new Error(`${entry.id} active version annotations are malformed`)
  }
  const annotations = Object.fromEntries(['workers/tag', 'workers/message'].flatMap(name => version.annotations?.[name] == null
    ? [] : [[name, providerText(version.annotations[name], `${entry.id} active version ${name}`)]]))
  const secrets = await boundedProviderValue(() => wranglerJson(
    ['--no-install', 'wrangler', 'secret', 'list', ...flags, '--format', 'json']), `${entry.id} secret-name inventory`)
  if (!Array.isArray(secrets)) throw new Error(`${entry.id} secret-name inventory is malformed`)
  const secretNames = secrets.map(item => providerText(item?.name, `${entry.id} secret name`)).sort()
  if (new Set(secretNames).size !== secretNames.length) throw new Error(`${entry.id} secret-name inventory is duplicated`)
  return { id: entry.id, worker: entry.worker, deployment, versionId: deployment.versionId, annotations, bindings, secretNames }
}

export const createBootstrapInventoryReader = ({ environment, apiFetch, wranglerJson, readEnvironment }) => async () => {
  const account = requireText(environment.CLOUDFLARE_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID')
  const zone = requireText(environment.TRAVEL_PUBLIC_ZONE_ID, 'TRAVEL_PUBLIC_ZONE_ID')
  if (TRAVEL_MESH_BOOTSTRAP_UNITS.length !== 10) throw new Error('bootstrap unit inventory must contain exactly ten units')
  const api = (suffix, label, options) => cloudflareApiAllPages(apiFetch,
    `https://api.cloudflare.com/client/v4${suffix}`, environment, label, options)
  const workers = normalizeWorkers(await api(`/accounts/${account}/workers/scripts`, 'Worker script inventory',
    { singlePage: true }))
  const kv = normalizeKv(await api(`/accounts/${account}/storage/kv/namespaces`, 'KV namespace inventory',
    { optionalResult: true }))
  const r2 = normalizeR2(await cloudflareApiCursorPages(apiFetch,
    `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets`, environment, 'R2 bucket inventory'))
  const d1 = normalizeD1(await api(`/accounts/${account}/d1/database`, 'D1 database inventory'))
  const zones = normalizeZones(await api(`/zones?account.id=${encodeURIComponent(account)}`, 'Zone inventory'))
  if (!zones.some(item => item.id === zone)) throw new Error('sealed public zone is absent from the account inventory')
  const routes = normalizeRoutes((await Promise.all(zones.map(async item => (await api(`/zones/${item.id}/workers/routes`,
    `${item.name} Worker route inventory`, { singlePage: true })).map(route => ({ ...route, zoneId: item.id, zoneName: item.name }))))).flat())
  const domains = normalizeDomains(await api(`/accounts/${account}/workers/domains`, 'Worker domain inventory', { singlePage: true }))
  const workerNames = new Set(workers.flatMap(record => [record.id, record.name]).filter(Boolean))
  const exposure = []
  for (const { worker } of TRAVEL_MESH_BOOTSTRAP_UNITS) {
    if (!workerNames.has(worker)) { exposure.push({ worker, absent: true }); continue }
    const value = await cloudflareApiEnvelope(apiFetch,
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${encodeURIComponent(worker)}/subdomain`,
      environment, `${worker} subdomain inventory`)
    if (!value.result || typeof value.result.enabled !== 'boolean' || typeof value.result.previews_enabled !== 'boolean') {
      throw new Error(`${worker} subdomain inventory is malformed`)
    }
    exposure.push({ worker, enabled: value.result.enabled, previewsEnabled: value.result.previews_enabled })
  }
  const exposureByWorker = new Map(exposure.map(item => [item.worker, item]))
  const units = []
  for (const entry of TRAVEL_MESH_BOOTSTRAP_UNITS) {
    const evidence = await bootstrapWorkerEvidence({ entry, wranglerJson }), providerExists = workerNames.has(entry.worker)
    if (providerExists === (evidence.absent === true)) throw new Error(`${entry.worker} provider inventories disagree about existence`)
    units.push({ ...evidence, exposure: exposureByWorker.get(entry.worker) })
  }
  const rawEnvironment = await boundedProviderValue(readEnvironment, 'production environment inventory')
  if (!rawEnvironment || !Array.isArray(rawEnvironment.variables) || !Array.isArray(rawEnvironment.secrets)) {
    throw new Error('production environment inventory is malformed')
  }
  const variables = uniqueRecords(rawEnvironment.variables.map((item, index) => ({
    name: providerText(item?.name, `production variable ${index} name`),
    valueDigest: providerDigest(item?.valueDigest, `production variable ${index} digest`),
  })), item => item.name, 'production variable inventory')
  const secrets = uniqueRecords(rawEnvironment.secrets.map((item, index) => ({
    name: providerText(item?.name, `production secret ${index} name`),
  })), item => item.name, 'production secret inventory')
  return { workers, zones, kv, r2, d1, routes, domains, exposure: sortRecords(exposure), units: sortRecords(units),
    environment: { variables, secrets } }
}

export const cloudflareApiAllPages = async (fetchFn, rawUrl, environment, label,
  { optionalResult = false, singlePage = false } = {}) => {
  const result = []
  let expectedPages = null, expectedCount = null
  for (let page = 1; page <= MAX_PROVIDER_PAGES; page += 1) {
    const url = new URL(rawUrl)
    if (!singlePage) { url.searchParams.set('page', String(page)); url.searchParams.set('per_page', String(PROVIDER_PAGE_SIZE)) }
    const value = await cloudflareApiEnvelope(fetchFn, url, environment, `${label} page ${page}`)
    const pageResult = value.result == null && optionalResult ? [] : value.result
    if (!Array.isArray(pageResult)) throw new Error(`${label} result is malformed`)
    const info = value.result_info
    if (singlePage) {
      if (info != null && (typeof info !== 'object' || Array.isArray(info)
        || (Object.hasOwn(info, 'page') && info.page !== 1)
        || (Object.hasOwn(info, 'count') && info.count !== pageResult.length)
        || (Object.hasOwn(info, 'total_count') && info.total_count !== pageResult.length)
        || (Object.hasOwn(info, 'total_pages') && info.total_pages !== 1))) {
        throw new Error(`${label} single-page metadata is inconsistent`)
      }
      return pageResult
    }
    if (info == null) {
      throw new Error(`${label} pagination metadata is absent or ambiguous`)
    }
    if (typeof info !== 'object' || Array.isArray(info)) throw new Error(`${label} pagination metadata is malformed`)
    if (Object.hasOwn(info, 'page') && info.page !== page) throw new Error(`${label} page metadata is inconsistent`)
    if (Object.hasOwn(info, 'per_page') && info.per_page !== PROVIDER_PAGE_SIZE) throw new Error(`${label} page-size metadata is inconsistent`)
    if (Object.hasOwn(info, 'count') && info.count !== pageResult.length) throw new Error(`${label} page count metadata is inconsistent`)
    const derivedPages = Object.hasOwn(info, 'total_count') && Number.isInteger(info.total_count) && info.total_count >= 0
      ? Math.max(1, Math.ceil(info.total_count / PROVIDER_PAGE_SIZE)) : null
    const totalPages = Object.hasOwn(info, 'total_pages') ? info.total_pages : derivedPages
    if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > MAX_PROVIDER_PAGES) {
      throw new Error(`${label} pagination metadata is incomplete or malformed`)
    }
    if (Object.hasOwn(info, 'total_count')) {
      if (!Number.isInteger(info.total_count) || info.total_count < 0) throw new Error(`${label} total-count metadata is malformed`)
      if (Object.hasOwn(info, 'total_pages') && info.total_pages !== derivedPages) {
        throw new Error(`${label} total page/count metadata is inconsistent`)
      }
      expectedCount ??= info.total_count
      if (info.total_count !== expectedCount) throw new Error(`${label} total-count metadata drifted during traversal`)
    }
    expectedPages ??= totalPages
    if (totalPages !== expectedPages || page > totalPages) throw new Error(`${label} pagination drifted during traversal`)
    result.push(...pageResult)
    if (page === totalPages) break
    if (pageResult.length === 0) throw new Error(`${label} pagination terminated before its declared final page`)
  }
  if (expectedPages === null) throw new Error(`${label} exceeded the bounded page limit`)
  if (expectedCount !== null && result.length !== expectedCount) throw new Error(`${label} total-count metadata is inconsistent`)
  return result
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
  for (const entry of TRAVEL_MESH_BOOTSTRAP_UNITS) {
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
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agentic-os/control-plane/mcp`,
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agentic-os/control-plane/agents`,
    `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agentic-os/control-plane/travel/reconciliation`,
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
    const matchingHost = domainRecords.filter(item => item.hostname === domain.hostname)
    if (matchingHost.length !== 1 || matchingHost[0].service !== domain.service
      || matchingHost[0].zoneId !== domain.zoneId || matchingHost[0].zoneName !== domain.zoneName) {
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
      for (const name of ['AGENTIC_OS_MEDIA_R2_BUCKET', 'TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET', 'TRAVEL_STORAGE_R2_BUCKET']) {
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
      const routes = await cloudflareApiAllPages(apiFetch,
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`, environment, 'Worker route inventory',
        { singlePage: true })
      const domains = await cloudflareApiAllPages(apiFetch,
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

export const requireStableCompleteInventory = async readInventory => {
  if (typeof readInventory !== 'function') throw new Error('complete inventory reader is required')
  const first = await readInventory(), second = await readInventory()
  const firstCanonical = canonical(first), secondCanonical = canonical(second)
  if (firstCanonical !== secondCanonical) throw new Error('complete provider inventory drifted across the required double-read')
  const inventory = JSON.parse(secondCanonical)
  return Object.freeze({ inventory, inventoryDigest: digest(secondCanonical),
    stableReadDigest: digest(`${firstCanonical}\n${secondCanonical}`) })
}

export const assertBootstrapTargetsUnexposed = (inventory, desired) => {
  const workers = new Set(desired.units.map(unit => unit.worker))
  const publicExposure = inventory.exposure?.filter(item => workers.has(item.worker)
    && item.absent !== true && (item.enabled !== false || item.previewsEnabled !== false)) ?? []
  const routes = inventory.routes?.filter(item => workers.has(item.script)) ?? []
  const domains = inventory.domains?.filter(item => workers.has(item.service)) ?? []
  if (publicExposure.length || routes.length || domains.length) throw new Error('bootstrap target is already publicly exposed before route-last activation')
  return true
}
