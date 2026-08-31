import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSON5 from 'json5'

export const SHA = /^[0-9a-f]{40}$/
export const DIGEST = /^[0-9a-f]{64}$/
export const SENTINEL = /(?:\.invalid(?:\b|\/)|\bunconfigured\b|replace-with-|\bsandbox\b|\bdisabled\b)/i
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const unit = value => Object.freeze({
  dependencies: Object.freeze([]), secrets: Object.freeze([]), overrides: Object.freeze([]),
  serviceTargets: Object.freeze([]), bindingProofs: Object.freeze([]), configMarkers: Object.freeze([]),
  ...value,
  dependencies: Object.freeze(value.dependencies ?? []), secrets: Object.freeze(value.secrets ?? []),
  overrides: Object.freeze(value.overrides ?? []), serviceTargets: Object.freeze(value.serviceTargets ?? []),
  bindingProofs: Object.freeze(value.bindingProofs ?? []), configMarkers: Object.freeze(value.configMarkers ?? []),
})

// Providers precede consumers except at the MCP/travel-commerce compatibility
// seam. The commerce candidate is backward-compatible with the active MCP
// baseline, while the MCP candidate requires the new named guardrail entrypoint;
// commerce therefore activates first and MCP follows without a broken interval.
// Overflow is ahead of travel-commerce because it is a required service binding.
export const TRAVEL_MESH_PLAN = Object.freeze([
  unit({ id: 'settlement-executor', worker: 'agenticgraph-travel-settlement-executor-production',
    workerEnv: 'TRAVEL_SETTLEMENT_EXECUTOR_SERVICE', bootstrap: false,
    config: 'cloudflare/workers/agenticgraph-travel-settlement-executor/wrangler.jsonc', environment: 'production',
    secrets: [['ISSUANCE_SERVICE_AUTH_TOKEN', 'TRAVEL_ISSUANCE_SERVICE_AUTH_TOKEN']],
    overrides: [['ISSUANCE_SERVICE_BASE_URL', 'TRAVEL_ISSUANCE_SERVICE_BASE_URL']],
    configMarkers: ['"name": "agenticgraph-travel-settlement-executor-production"'] }),
  unit({ id: 'net-settlement', worker: 'agenticgraph-travel-net-settlement-production',
    workerEnv: 'TRAVEL_NET_SETTLEMENT_SERVICE', bootstrap: false,
    config: 'cloudflare/workers/agenticgraph-payment/wrangler.net-settlement.toml', environment: 'production',
    dependencies: ['settlement-executor'],
    serviceTargets: [['NET_SETTLEMENT_EXECUTOR', 'TRAVEL_SETTLEMENT_EXECUTOR_SERVICE', 'agenticgraph-travel-settlement-executor-production']],
    configMarkers: ['service = "agenticgraph-travel-settlement-executor-production"', 'class_name = "NetSettlementStore"'] }),
  unit({ id: 'flight-discovery', worker: 'agenticgraph-travel-discovery',
    workerEnv: 'TRAVEL_FLIGHT_DISCOVERY_SERVICE', bootstrap: false,
    config: 'cloudflare/workers/agenticgraph-travel-discovery/wrangler.toml', environment: null,
    secrets: [
      ['ATLAS_API_BASE_URL', 'TRAVEL_ATLAS_API_BASE_URL'], ['ATLAS_SEARCH_PATH', 'TRAVEL_ATLAS_SEARCH_PATH'],
      ['ATLAS_VERIFY_PATH', 'TRAVEL_ATLAS_VERIFY_PATH'], ['ATLAS_ROUTE_CATALOGUE_JSON', 'TRAVEL_ATLAS_ROUTE_CATALOGUE_JSON'],
      ['ATLAS_CLIENT_ID', 'TRAVEL_ATLAS_CLIENT_ID'], ['ATLAS_CLIENT_SECRET', 'TRAVEL_ATLAS_CLIENT_SECRET'],
    ], configMarkers: ['name = "agenticgraph-travel-discovery"', 'workers_dev = false'] }),
  unit({ id: 'experience-discovery', worker: 'agenticgraph-travel-experience-discovery-production',
    workerEnv: 'TRAVEL_EXPERIENCE_DISCOVERY_SERVICE', bootstrap: false,
    config: 'cloudflare/workers/agenticgraph-travel-experience-discovery/wrangler.jsonc', environment: 'production',
    secrets: [['EXPERIENCE_PROVIDER_API_TOKEN', 'TRAVEL_EXPERIENCE_PROVIDER_API_TOKEN']],
    overrides: [
      ['EXPERIENCE_PROVIDER_ID', 'TRAVEL_EXPERIENCE_PROVIDER_ID'],
      ['EXPERIENCE_PROVIDER_BASE_URL', 'TRAVEL_EXPERIENCE_PROVIDER_BASE_URL'],
      ['EXPERIENCE_PROVIDER_SEARCH_PATH', 'TRAVEL_EXPERIENCE_PROVIDER_SEARCH_PATH'],
      ['EXPERIENCE_PROVIDER_VERIFY_PATH', 'TRAVEL_EXPERIENCE_PROVIDER_VERIFY_PATH'],
      ['EXPERIENCE_ROUTE_CATALOGUE_JSON', 'TRAVEL_EXPERIENCE_ROUTE_CATALOGUE_JSON'],
    ], configMarkers: ['"name": "agenticgraph-travel-experience-discovery-production"'] }),
  unit({ id: 'overflow', worker: 'agenticgraph-travel-ollama-overflow', workerEnv: 'TRAVEL_OVERFLOW_SERVICE', bootstrap: false,
    config: 'cloudflare/workers/agenticgraph-travel-ollama-overflow/wrangler.jsonc', environment: null,
    secrets: [['INFERENCE_OVERFLOW_TOKEN', 'TRAVEL_INFERENCE_OVERFLOW_TOKEN']],
    configMarkers: ['"name": "agenticgraph-travel-ollama-overflow"', '"ai": { "binding": "AI", "remote": true }',
      '@cf/openai/gpt-oss-20b'] }),
  unit({ id: 'travel-commerce', worker: 'agenticgraph-travel-commerce-production',
    workerEnv: 'TRAVEL_COMMERCE_SERVICE', bootstrap: false,
    config: 'cloudflare/workers/agenticgraph-travel-commerce/wrangler.jsonc', environment: 'production',
    dependencies: ['net-settlement', 'overflow'], secrets: [
      ['TRAVEL_COMMERCE_API_TOKEN', 'TRAVEL_COMMERCE_API_TOKEN'],
      ['RECONCILIATION_OPERATOR_TOKEN', 'TRAVEL_RECONCILIATION_OPERATOR_TOKEN'],
      ['INFERENCE_OVERFLOW_TOKEN', 'TRAVEL_INFERENCE_OVERFLOW_TOKEN'],
    ], serviceTargets: [
      ['DISCOVERY_SERVICE', 'TRAVEL_MCP_SERVICE', 'agenticgraph-mcp'],
      ['ISSUANCE_SERVICE', 'TRAVEL_NET_SETTLEMENT_SERVICE', 'agenticgraph-travel-net-settlement-production'],
      ['INFERENCE_OVERFLOW', 'TRAVEL_OVERFLOW_SERVICE', 'agenticgraph-travel-ollama-overflow'],
    ], bindingProofs: [
      ['BALANCE_CACHE', 'kv_namespace', 'TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID', 'namespace_id'],
      ['PROVENANCE_ARCHIVE', 'r2_bucket', 'TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET', 'bucket_name'],
    ], configMarkers: ['"service": "agenticgraph-mcp"', '"service": "agenticgraph-travel-net-settlement-production"',
      '"service": "agenticgraph-travel-ollama-overflow"', '"DEPLOY_LANE": "Production_Lane"'] }),
  unit({ id: 'mcp', worker: 'agenticgraph-mcp', workerEnv: 'TRAVEL_MCP_SERVICE', bootstrap: false,
    config: 'cloudflare/workers/agenticgraph-mcp/wrangler.toml', environment: null,
    dependencies: ['flight-discovery', 'experience-discovery', 'travel-commerce'],
    secrets: [['AGENTICGRAPH_AGENT_RUNTIME_BEARER_TOKEN', 'AGENTICGRAPH_AGENT_RUNTIME_BEARER_TOKEN']],
    overrides: [
      ['AGENTICGRAPH_MCP_PUBLIC_BASE_URL', 'TRAVEL_PUBLIC_BASE_URL'],
      ['AGENTICGRAPH_MCP_TOOL_LIST_NAME', 'AGENTICGRAPH_MCP_TOOL_LIST_NAME'],
      ['AGENTICGRAPH_MEDIA_BUCKET', 'AGENTICGRAPH_MEDIA_BUCKET'],
    ],
    serviceTargets: [
      ['TRAVEL_DISCOVERY_HARNESS', 'TRAVEL_FLIGHT_DISCOVERY_SERVICE', 'agenticgraph-travel-discovery'],
      ['TRAVEL_EXPERIENCE_DISCOVERY_HARNESS', 'TRAVEL_EXPERIENCE_DISCOVERY_SERVICE', 'agenticgraph-travel-experience-discovery-production'],
      ['TRAVEL_GUARDRAIL', 'TRAVEL_COMMERCE_SERVICE', 'agenticgraph-travel-commerce-production', 'TravelAgencyGuardrailService'],
    ], bindingProofs: [
      ['TRAVEL_AGENT_DEFINITION_CACHE', 'kv_namespace', 'TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID', 'namespace_id'],
      ['AGENTICGRAPH_MEDIA_R2', 'r2_bucket', 'AGENTICGRAPH_MEDIA_R2_BUCKET', 'bucket_name'],
    ], protectZone: true, configMarkers: ['service = "agenticgraph-travel-discovery"',
      'service = "agenticgraph-travel-experience-discovery-production"', 'TRAVEL_DISCOVERY_MODE = "live"'] }),
  unit({ id: 'operator-gateway', worker: 'agenticgraph-travel-operator-gateway-production',
    workerEnv: 'TRAVEL_OPERATOR_GATEWAY_SERVICE', bootstrap: false,
    config: 'cloudflare/workers/agenticgraph-travel-operator-gateway/wrangler.jsonc', environment: 'production',
    dependencies: ['travel-commerce'], secrets: [['RECONCILIATION_OPERATOR_TOKEN', 'TRAVEL_RECONCILIATION_OPERATOR_TOKEN']],
    overrides: [['ACCESS_ISSUER', 'TRAVEL_ACCESS_ISSUER'], ['ACCESS_AUDIENCE', 'TRAVEL_ACCESS_AUDIENCE']],
    serviceTargets: [['TRAVEL_COMMERCE_CONTROL', 'TRAVEL_COMMERCE_SERVICE', 'agenticgraph-travel-commerce-production']],
    protectZone: true, configMarkers: ['"service": "agenticgraph-travel-commerce-production"',
      'airvio.co/agenticgraph/control-plane/travel/reconciliation'] }),
  unit({ id: 'storage', worker: 'agenticgraph-storage', workerEnv: 'TRAVEL_STORAGE_SERVICE', bootstrap: false,
    config: 'cloudflare/workers/agenticgraph-storage/wrangler.toml', environment: null,
    dependencies: ['travel-commerce'], secrets: [
      ['AGENTICGRAPH_TRAVEL_COMMERCE_API_TOKEN', 'TRAVEL_COMMERCE_API_TOKEN'],
      ['SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON', 'SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON'],
      ['AGENTICGRAPH_STORAGE_SIGNING_SECRET', 'AGENTICGRAPH_STORAGE_SIGNING_SECRET'],
    ], serviceTargets: [['AGENTICGRAPH_TRAVEL_COMMERCE', 'TRAVEL_COMMERCE_SERVICE', 'agenticgraph-travel-commerce-production']],
    bindingProofs: [
      ['DB', 'd1', 'TRAVEL_STORAGE_D1_DATABASE_ID', 'id'],
      ['AGENTICGRAPH_STORAGE_BLOB_BUCKET', 'r2_bucket', 'TRAVEL_STORAGE_R2_BUCKET', 'bucket_name'],
    ], protectZone: true, configMarkers: ['service = "agenticgraph-travel-commerce-production"',
      'binding = "DB"', 'migrations_dir = "../../d1/migrations"', 'workers_dev = false', 'preview_urls = false'] }),
])

export const D1_MIGRATION = Object.freeze({ database: 'DB', directory: 'cloudflare/d1/migrations' })
export const TRAVEL_STORAGE_D1_DATABASE_ID = '633355bf-1a52-4085-bd3c-eba4220ff152'
export const TRAVEL_STORAGE_D1_DATABASE_NAME = 'airvio'
export const TRAVEL_MARKETPLACE = Object.freeze({
  id: 'marketplace', worker: 'agenticgraph-marketplace-production', workerEnv: 'MARKETPLACE_SERVICE',
  config: 'cloudflare/workers/agenticgraph-marketplace/wrangler.jsonc', environment: 'production',
  routeFree: true, binding: 'MARKETPLACE_DB', databaseId: TRAVEL_STORAGE_D1_DATABASE_ID,
})
export const TRAVEL_MESH_BOOTSTRAP_UNITS = Object.freeze([TRAVEL_MARKETPLACE, ...TRAVEL_MESH_PLAN])

export const PROTECTED_VARIABLE_NAMES = Object.freeze([...new Set([
  ...TRAVEL_MESH_PLAN.flatMap(entry => [entry.workerEnv, ...entry.overrides.map(([, name]) => name),
    ...entry.serviceTargets.map(([, name]) => name), ...entry.bindingProofs.map(([, , name]) => name)]),
  'MARKETPLACE_SERVICE', 'TRAVEL_PUBLIC_ZONE_ID', 'TRAVEL_PUBLIC_ZONE_NAME', 'TRAVEL_MESH_PROBE_SPEC_JSON',
  'TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON', 'TRAVEL_MESH_RELEASE_ENABLED', 'TRAVEL_STORAGE_D1_DATABASE_NAME',
])].sort())

export const PROTECTED_SECRET_NAMES = Object.freeze([...new Set([
  ...TRAVEL_MESH_PLAN.flatMap(entry => entry.secrets.map(([, name]) => name)),
  'TRAVEL_ACCESS_CLIENT_ID', 'TRAVEL_ACCESS_CLIENT_SECRET', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN',
])].sort())

const sortValue = value => Array.isArray(value) ? value.map(sortValue)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])])) : value
export const canonical = value => JSON.stringify(sortValue(value))
export const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')
export const seal = value => Object.freeze({ ...value, receiptDigest: digest(value) })
export const requireText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

const parseObject = (value, label) => {
  let parsed
  try { parsed = JSON.parse(value) } catch { throw new Error(`${label} must be valid JSON`) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    throw new Error(`${label} must be a non-empty object`)
  }
  return parsed
}
const httpsUrl = (value, label, { access = false } = {}) => {
  const text = requireText(value, label)
  if (SENTINEL.test(text)) throw new Error(`${label} contains a production sentinel`)
  let url
  try { url = new URL(text) } catch { throw new Error(`${label} must be an absolute URL`) }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(`${label} must be a credential-free HTTPS URL`)
  if (access && !url.hostname.endsWith('.cloudflareaccess.com')) throw new Error(`${label} must use a Cloudflare Access team domain`)
  return url.toString().replace(/\/$/, '')
}
const providerPath = (value, label) => {
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value)) throw new Error(`${label} must be a safe absolute provider path`)
}

export const parseProbeSpec = (value, { publicHost = process.env.TRAVEL_PUBLIC_ZONE_NAME } = {}) => {
  let entries
  try { entries = typeof value === 'string' ? JSON.parse(value) : value } catch { throw new Error('travel mesh probe spec must be JSON') }
  if (!Array.isArray(entries) || entries.length !== 3) throw new Error('travel mesh probe spec must contain exactly mcp, operator-gateway, and storage probes')
  const expected = new Map([
    ['mcp', { service: 'agenticgraph-mcp', path: '/agenticgraph/control-plane/mcp/readyz', host: publicHost }],
    ['operator-gateway', { service: 'agenticgraph-travel-operator-gateway', path: '/agenticgraph/control-plane/travel/reconciliation/readyz', host: publicHost }],
    ['storage', { service: 'agenticgraph-storage', path: '/readyz', host: publicHost ? `storage.${publicHost}` : '' }],
  ])
  if (!/^[a-z0-9.-]+$/.test(publicHost ?? '')) throw new Error('travel mesh probe public host is required')
  const seen = new Set()
  return entries.map(entry => {
    const target = expected.get(entry?.id)
    if (!entry || Object.keys(entry).sort().join(',') !== 'id,service,url' || !expected.has(entry.id)
      || seen.has(entry.id) || entry.service !== target.service) throw new Error('travel mesh probe identity is invalid or duplicated')
    seen.add(entry.id)
    const url = new URL(httpsUrl(entry.url, `${entry.id} probe URL`))
    if (url.hostname !== target.host || url.pathname !== target.path || url.search) {
      throw new Error(`${entry.id} probe must use its exact protected production host and readiness path without a query`)
    }
    return Object.freeze({ id: entry.id, service: entry.service, url: url.toString() })
  })
}

export const routeSpecFor = environment => Object.freeze({
  routes: Object.freeze([
    { pattern: `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agenticgraph/control-plane/mcp`, script: environment.TRAVEL_MCP_SERVICE },
    { pattern: `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agenticgraph/control-plane/mcp/*`, script: environment.TRAVEL_MCP_SERVICE },
    { pattern: `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agenticgraph/control-plane/agents`, script: environment.TRAVEL_MCP_SERVICE },
    { pattern: `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agenticgraph/control-plane/agents/*`, script: environment.TRAVEL_MCP_SERVICE },
    { pattern: `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agenticgraph/control-plane/travel/reconciliation`, script: environment.TRAVEL_OPERATOR_GATEWAY_SERVICE },
    { pattern: `${environment.TRAVEL_PUBLIC_ZONE_NAME}/agenticgraph/control-plane/travel/reconciliation/*`, script: environment.TRAVEL_OPERATOR_GATEWAY_SERVICE },
    { pattern: `${environment.TRAVEL_PUBLIC_ZONE_NAME}/api/storage/*`, script: environment.TRAVEL_STORAGE_SERVICE },
  ]),
  domains: Object.freeze([{
    hostname: `storage.${environment.TRAVEL_PUBLIC_ZONE_NAME}`, service: environment.TRAVEL_STORAGE_SERVICE,
    zoneId: environment.TRAVEL_PUBLIC_ZONE_ID, zoneName: environment.TRAVEL_PUBLIC_ZONE_NAME,
  }]),
})

export const bootstrapResourceSpecFor = environment => Object.freeze({
  balanceCacheKvNamespaceId: environment.TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID,
  marketplace: Object.freeze({ service: environment.MARKETPLACE_SERVICE, routeFree: true,
    d1DatabaseId: environment.TRAVEL_STORAGE_D1_DATABASE_ID }),
  mcpMediaBucket: environment.AGENTICGRAPH_MEDIA_BUCKET,
  mcpMediaR2Bucket: environment.AGENTICGRAPH_MEDIA_R2_BUCKET,
  mcpDefinitionKvNamespaceId: environment.TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID,
  probeSpecDigest: digest(parseProbeSpec(environment.TRAVEL_MESH_PROBE_SPEC_JSON,
    { publicHost: environment.TRAVEL_PUBLIC_ZONE_NAME })),
  provenanceArchiveR2Bucket: environment.TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET,
  storageD1DatabaseId: environment.TRAVEL_STORAGE_D1_DATABASE_ID,
  storageD1DatabaseName: environment.TRAVEL_STORAGE_D1_DATABASE_NAME,
  storageR2Bucket: environment.TRAVEL_STORAGE_R2_BUCKET,
  publicZoneId: environment.TRAVEL_PUBLIC_ZONE_ID,
  routeSpecDigest: digest(routeSpecFor(environment)),
  workerSubdomainPolicyDigest: digest(TRAVEL_MESH_BOOTSTRAP_UNITS.map(entry => ({
    worker: entry.worker, enabled: false, previewsEnabled: false,
  }))),
})

export const bootstrapRuntimeConfiguration = environment => Object.freeze({
  variables: Object.freeze(Object.fromEntries(PROTECTED_VARIABLE_NAMES
    .filter(name => !['TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON', 'TRAVEL_MESH_RELEASE_ENABLED'].includes(name))
    .map(name => [name, environment[name]]))),
  overrides: Object.freeze(Object.fromEntries(TRAVEL_MESH_PLAN.map(entry => [entry.id,
    Object.freeze(Object.fromEntries(entry.overrides.map(([binding, name]) => [binding, environment[name]])))]))),
  secrets: Object.freeze(Object.fromEntries(TRAVEL_MESH_PLAN.map(entry => [entry.id,
    Object.freeze(Object.fromEntries(entry.secrets.map(([binding, name]) => [binding, environment[name]])))]))),
  serviceTargets: Object.freeze(Object.fromEntries(TRAVEL_MESH_PLAN.map(entry => [entry.id,
    Object.freeze(Object.fromEntries(entry.serviceTargets.map(([binding, name]) => [binding, environment[name]])))]))),
})

const tomlValue = value => {
  const text = value.trim()
  if (text.startsWith('"')) { try { return JSON.parse(text) } catch { throw new Error('route-free TOML string is malformed') } }
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1)
  return text
}
const bindingRecord = (name, type, fields = {}) => ({ name: requireText(name, 'bootstrap binding name'), type, ...fields })
const jsonProviderBindings = (entry, source) => {
  const root = JSON5.parse(source), value = entry.environment ? root.env?.[entry.environment] : root
  if (!value || typeof value !== 'object') throw new Error(`${entry.id} route-free environment is absent`)
  return [
    ...Object.entries(value.vars ?? {}).map(([name, text]) => bindingRecord(name, 'plain_text', { text: String(text) })),
    ...(value.ai?.binding ? [bindingRecord(value.ai.binding, 'ai')] : []),
    ...(value.services ?? []).map(item => bindingRecord(item.binding, 'service', { service: item.service,
      ...(item.entrypoint ? { entrypoint: item.entrypoint } : {}) })),
    ...(value.kv_namespaces ?? []).map(item => bindingRecord(item.binding, 'kv_namespace', { namespace_id: item.id })),
    ...(value.r2_buckets ?? []).map(item => bindingRecord(item.binding, 'r2_bucket', { bucket_name: item.bucket_name })),
    ...(value.d1_databases ?? []).map(item => bindingRecord(item.binding, 'd1', { id: item.database_id })),
    ...(value.durable_objects?.bindings ?? []).map(item => bindingRecord(item.name, 'durable_object_namespace', { class_name: item.class_name,
      ...(item.script_name ? { script_name: item.script_name } : {}), ...(item.environment ? { environment: item.environment } : {}) })),
  ]
}
const tomlProviderBindings = (entry, source) => {
  const headers = [...source.matchAll(/^\s*(?:\[\[([^\]]+)\]\]|\[([^\]]+)\])\s*$/gm)], output = []
  for (const [index, match] of headers.entries()) {
    let section = match[1] ?? match[2]
    const prefix = entry.environment ? `env.${entry.environment}.` : ''
    if ((entry.environment && !section.startsWith(prefix)) || (!entry.environment && section.startsWith('env.'))) continue
    if (entry.environment) section = section.slice(prefix.length)
    const body = source.slice(match.index + match[0].length, headers[index + 1]?.index ?? source.length), values = {}
    for (const line of body.split(/\r?\n/)) { const pair = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/); if (pair) values[pair[1]] = tomlValue(pair[2]) }
    if (section === 'vars') for (const [name, text] of Object.entries(values)) output.push(bindingRecord(name, 'plain_text', { text: String(text) }))
    else if (section === 'ai' && values.binding) output.push(bindingRecord(values.binding, 'ai'))
    else if (section === 'services') output.push(bindingRecord(values.binding, 'service', { service: values.service,
      ...(values.entrypoint ? { entrypoint: values.entrypoint } : {}) }))
    else if (section === 'kv_namespaces') output.push(bindingRecord(values.binding, 'kv_namespace', { namespace_id: values.id }))
    else if (section === 'r2_buckets') output.push(bindingRecord(values.binding, 'r2_bucket', { bucket_name: values.bucket_name }))
    else if (section === 'd1_databases') output.push(bindingRecord(values.binding, 'd1', { id: values.database_id }))
    else if (section === 'durable_objects.bindings') output.push(bindingRecord(values.name, 'durable_object_namespace', { class_name: values.class_name,
      ...(values.script_name ? { script_name: values.script_name } : {}), ...(values.environment ? { environment: values.environment } : {}) }))
  }
  return output
}
export const bootstrapProviderBindingsFor = (entry, file) => {
  const source = fs.readFileSync(file, 'utf8'), configured = /\.jsonc?$/.test(entry.config)
    ? jsonProviderBindings(entry, source) : tomlProviderBindings(entry, source)
  configured.push(...(entry.secrets ?? []).map(([name]) => bindingRecord(name, 'secret_text')))
  if (new Set(configured.map(item => item.name)).size !== configured.length) throw new Error(`${entry.id} route-free bindings are duplicated`)
  return Object.freeze(configured.map(item => Object.freeze(item)).sort((left, right) => left.name.localeCompare(right.name)))
}
const normalizeProviderBinding = binding => {
  const evidence = { name: binding.name, type: binding.type }
  if (binding.type === 'plain_text') evidence.valueDigest = digest(binding.text)
  for (const [provider, output] of [['namespace_id', 'namespaceId'], ['bucket_name', 'bucketName'], ['service', 'service'],
    ['entrypoint', 'entrypoint'], ['environment', 'environment'], ['class_name', 'className'], ['script_name', 'scriptName']]) {
    if (binding[provider] != null) evidence[output] = binding[provider]
  }
  if (binding.type === 'd1') evidence.databaseId = binding.database_id ?? binding.id
  return evidence
}
const unitBindingEvidence = (entry, environment, file, baseline = null) => {
  const configured = bootstrapProviderBindingsFor(entry, file).map(normalizeProviderBinding)
  const records = new Map(configured.map(item => [item.name, item]))
  if (records.size !== configured.length) throw new Error(`${entry.id} route-free bindings are duplicated`)
  for (const item of baseline?.bindings ?? []) if (!records.has(item.name)) records.set(item.name, item)
  return Object.freeze([...records.values()].sort((left, right) => left.name.localeCompare(right.name)))
}

export const bootstrapUnitSpecFor = (entry, environment, baseline = null) => {
  const routeFree = materializeRouteFreeBootstrapConfig(entry, environment)
  try {
  const bindings = unitBindingEvidence(entry, environment, routeFree.file, baseline)
  return Object.freeze({ id: entry.id, worker: entry.worker, routeFree: true,
    d1DatabaseId: ['marketplace', 'storage'].includes(entry.id) ? TRAVEL_STORAGE_D1_DATABASE_ID : null,
    secretNames: Object.freeze(bindings.filter(item => item.type === 'secret_text').map(item => item.name)), bindings,
    bindingSpecDigest: digest(bindings),
    configDigest: routeFree.contentDigest })
  } finally { fs.rmSync(routeFree.file, { force: true }) }
}

export const bootstrapMigrationSpec = () => {
  const names = fs.readdirSync(path.resolve(repoRoot, D1_MIGRATION.directory)).filter(name => name.endsWith('.sql')).sort()
  if (!names.length) throw new Error('bootstrap D1 migration inventory is empty')
  return Object.freeze({ databaseId: TRAVEL_STORAGE_D1_DATABASE_ID, names: Object.freeze(names),
    contentsDigest: digest(names.map(name => ({ name,
      contentDigest: digest(fs.readFileSync(path.resolve(repoRoot, D1_MIGRATION.directory, name), 'utf8')) }))),
    policy: 'additive-only' })
}

const withoutTomlRoutes = source => {
  const lines = source.split(/\r?\n/), kept = []; let skipping = false
  for (const line of lines) {
    if (/^\s*\[\[routes\]\]\s*$/.test(line)) { skipping = true; continue }
    if (skipping && /^\s*\[\[?.+\]\]?\s*$/.test(line)) skipping = false
    if (!skipping) kept.push(line)
  }
  return kept.join('\n').replace(/^workers_dev\s*=\s*true$/gm, 'workers_dev = false')
    .replace(/^preview_urls\s*=\s*true$/gm, 'preview_urls = false')
}

export const materializeRouteFreeBootstrapConfig = (entry, environment) => {
  const runtime = bootstrapRuntimeConfiguration(environment)
  const generated = entry.id === TRAVEL_MARKETPLACE.id ? null : releaseConfigFile(entry, runtime)
  try {
    const source = fs.readFileSync(path.resolve(repoRoot, generated ?? entry.config), 'utf8')
    let routeFree
    if (/\.jsonc?$/.test(entry.config)) {
      const value = JSON5.parse(source)
      value.workers_dev = false; value.preview_urls = false; value.routes = []
      if (entry.environment && value.env?.[entry.environment]) {
        value.env[entry.environment].workers_dev = false
        value.env[entry.environment].preview_urls = false
        value.env[entry.environment].routes = []
      }
      routeFree = `${JSON.stringify(value, null, 2)}\n`
    } else routeFree = `${withoutTomlRoutes(source).replace(/\s+$/u, '')}\n`
    if (/\[\[routes\]\]|"routes"\s*:\s*\[(?!\s*\])|^\s*routes\s*=\s*\[(?!\s*\])/m.test(routeFree)) {
      throw new Error(`${entry.id} route-free bootstrap configuration still exposes a public route`)
    }
    const root = path.dirname(path.resolve(repoRoot, entry.config))
    const file = path.join(root, `agenticgraph-bootstrap-${entry.id}-${crypto.randomUUID()}${path.extname(entry.config)}`)
    fs.writeFileSync(file, routeFree, { flag: 'wx', mode: 0o600 })
    return { file, contentDigest: digest(routeFree) }
  } finally { if (generated) removeEphemeralFile(generated) }
}

export const assertAdditiveBootstrapMigrations = (appliedNames = new Set()) => {
  const spec = bootstrapMigrationSpec()
  for (const name of spec.names) {
    if (appliedNames.has(name)) continue
    const source = fs.readFileSync(path.resolve(repoRoot, D1_MIGRATION.directory, name), 'utf8')
      .replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    if (/(?:^|;)\s*(?:DROP\s|TRUNCATE\s|DELETE\s|UPDATE\s|(?:INSERT\s+OR\s+)?REPLACE\s|ALTER\s+TABLE\s+\S+\s+(?:RENAME|DROP)\s)/im.test(source)) {
      throw new Error(`bootstrap D1 migration is not additive: ${name}`)
    }
  }
  return spec
}

export const validatePlan = (root = repoRoot) => {
  const ids = new Set()
  for (const entry of TRAVEL_MESH_PLAN) {
    if (ids.has(entry.id)) throw new Error(`duplicate travel mesh unit: ${entry.id}`)
    for (const dependency of entry.dependencies) if (!ids.has(dependency)) throw new Error(`${entry.id} is ordered before dependency ${dependency}`)
    ids.add(entry.id)
    const source = fs.readFileSync(path.resolve(root, entry.config), 'utf8')
    for (const marker of entry.configMarkers) if (!source.includes(marker)) throw new Error(`${entry.id} production binding drifted: ${marker}`)
  }
  const marketplaceSource = fs.readFileSync(path.resolve(root, TRAVEL_MARKETPLACE.config), 'utf8')
  for (const marker of [`\"name\": \"${TRAVEL_MARKETPLACE.worker}\"`, `\"database_id\": \"${TRAVEL_STORAGE_D1_DATABASE_ID}\"`,
    '\"workers_dev\": false', '\"preview_urls\": false']) {
    if (!marketplaceSource.includes(marker)) throw new Error(`marketplace production binding drifted: ${marker}`)
  }
  return TRAVEL_MESH_PLAN
}

export const validateProtectedConfiguration = (environment = process.env) => {
  validatePlan()
  const missingVariables = PROTECTED_VARIABLE_NAMES.filter(name => !String(environment[name] ?? '').trim())
  const missingSecrets = PROTECTED_SECRET_NAMES.filter(name => !String(environment[name] ?? '').trim())
  if (missingVariables.length || missingSecrets.length) {
    throw new Error(['protected travel mesh configuration is incomplete',
      ...(missingVariables.length ? [`missing protected variables: ${missingVariables.join(', ')}`] : []),
      ...(missingSecrets.length ? [`missing protected secrets: ${missingSecrets.join(', ')}`] : []),
    ].join('\n'))
  }
  const sentinelNames = [...PROTECTED_VARIABLE_NAMES, ...PROTECTED_SECRET_NAMES].filter(name => SENTINEL.test(environment[name]))
  if (sentinelNames.length) throw new Error(`protected travel mesh values contain production sentinels: ${sentinelNames.join(', ')}`)

  const mismatches = []
  for (const entry of TRAVEL_MESH_PLAN) {
    if (environment[entry.workerEnv] !== entry.worker) mismatches.push(`${entry.workerEnv} must equal ${entry.worker}`)
    for (const [, envName, expected] of entry.serviceTargets) if (environment[envName] !== expected) mismatches.push(`${envName} must equal ${expected}`)
  }
  if (environment.MARKETPLACE_SERVICE !== TRAVEL_MARKETPLACE.worker) mismatches.push(`MARKETPLACE_SERVICE must equal ${TRAVEL_MARKETPLACE.worker}`)
  if (mismatches.length) throw new Error(`protected service topology is invalid\n${mismatches.join('\n')}`)
  if (environment.TRAVEL_MESH_RELEASE_ENABLED !== 'true') throw new Error('TRAVEL_MESH_RELEASE_ENABLED must be exactly true')

  httpsUrl(environment.TRAVEL_ISSUANCE_SERVICE_BASE_URL, 'TRAVEL_ISSUANCE_SERVICE_BASE_URL')
  httpsUrl(environment.TRAVEL_EXPERIENCE_PROVIDER_BASE_URL, 'TRAVEL_EXPERIENCE_PROVIDER_BASE_URL')
  httpsUrl(environment.TRAVEL_ATLAS_API_BASE_URL, 'TRAVEL_ATLAS_API_BASE_URL')
  httpsUrl(environment.TRAVEL_ACCESS_ISSUER, 'TRAVEL_ACCESS_ISSUER', { access: true })
  const publicBase = new URL(httpsUrl(environment.TRAVEL_PUBLIC_BASE_URL, 'TRAVEL_PUBLIC_BASE_URL'))
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/.test(environment.TRAVEL_PUBLIC_ZONE_NAME)
    || publicBase.hostname !== environment.TRAVEL_PUBLIC_ZONE_NAME || publicBase.pathname !== '/') throw new Error('TRAVEL_PUBLIC_BASE_URL and TRAVEL_PUBLIC_ZONE_NAME must identify the same HTTPS origin')
  for (const name of ['TRAVEL_ATLAS_SEARCH_PATH', 'TRAVEL_ATLAS_VERIFY_PATH', 'TRAVEL_EXPERIENCE_PROVIDER_SEARCH_PATH', 'TRAVEL_EXPERIENCE_PROVIDER_VERIFY_PATH']) providerPath(environment[name], name)
  parseObject(environment.TRAVEL_ATLAS_ROUTE_CATALOGUE_JSON, 'TRAVEL_ATLAS_ROUTE_CATALOGUE_JSON')
  parseObject(environment.TRAVEL_EXPERIENCE_ROUTE_CATALOGUE_JSON, 'TRAVEL_EXPERIENCE_ROUTE_CATALOGUE_JSON')
  parseObject(environment.SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON, 'SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON')
  parseProbeSpec(environment.TRAVEL_MESH_PROBE_SPEC_JSON, { publicHost: environment.TRAVEL_PUBLIC_ZONE_NAME })
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(environment.TRAVEL_ACCESS_AUDIENCE)) throw new Error('TRAVEL_ACCESS_AUDIENCE is malformed')
  if (!/^[0-9a-f]{32}$/.test(environment.CLOUDFLARE_ACCOUNT_ID)) throw new Error('CLOUDFLARE_ACCOUNT_ID is malformed')
  if (!/^[0-9a-f]{32}$/.test(environment.TRAVEL_PUBLIC_ZONE_ID)) throw new Error('TRAVEL_PUBLIC_ZONE_ID is malformed')
  for (const name of ['TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID', 'TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID']) {
    if (!/^[0-9a-f]{32}$/.test(environment[name])) throw new Error(`${name} must be an exact KV namespace ID`)
  }
  if (!/^[0-9a-f-]{36}$/.test(environment.TRAVEL_STORAGE_D1_DATABASE_ID)) throw new Error('TRAVEL_STORAGE_D1_DATABASE_ID is malformed')
  if (environment.TRAVEL_STORAGE_D1_DATABASE_ID !== TRAVEL_STORAGE_D1_DATABASE_ID
    || environment.TRAVEL_STORAGE_D1_DATABASE_NAME !== TRAVEL_STORAGE_D1_DATABASE_NAME) {
    throw new Error('protected storage D1 must equal the actual marketplace/storage database identity')
  }
  for (const name of ['AGENTICGRAPH_MEDIA_BUCKET', 'AGENTICGRAPH_MEDIA_R2_BUCKET', 'TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET',
    'TRAVEL_STORAGE_R2_BUCKET']) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(environment[name])) throw new Error(`${name} is malformed`)
  }
  if (environment.AGENTICGRAPH_MEDIA_BUCKET !== environment.AGENTICGRAPH_MEDIA_R2_BUCKET) {
    throw new Error('MCP media name and R2 binding must target the same protected bucket')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(environment.AGENTICGRAPH_MCP_TOOL_LIST_NAME)) {
    throw new Error('AGENTICGRAPH_MCP_TOOL_LIST_NAME is malformed')
  }
  for (const name of PROTECTED_SECRET_NAMES) if (environment[name].length < (name.includes('TOKEN') || name.includes('SECRET') ? 32 : 2)) throw new Error(`protected secret ${name} is too short`)
  if (new Set([environment.TRAVEL_COMMERCE_API_TOKEN, environment.TRAVEL_RECONCILIATION_OPERATOR_TOKEN,
    environment.TRAVEL_INFERENCE_OVERFLOW_TOKEN]).size !== 3) throw new Error('travel API, reconciliation, and overflow secrets must be distinct')

  let bootstrap
  try { bootstrap = JSON.parse(environment.TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON) } catch { throw new Error('TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON must be valid JSON') }
  const { receiptDigest, ...bootstrapBody } = bootstrap ?? {}
  const expectedWorkers = TRAVEL_MESH_BOOTSTRAP_UNITS.map(entry => entry.worker).sort()
  const actualWorkers = Array.isArray(bootstrap?.workers) ? [...bootstrap.workers].sort() : []
  const expectedResources = bootstrapResourceSpecFor(environment)
  if (bootstrap?.schema !== 'agenticgraph-travel-mesh-bootstrap-receipt/v3' || bootstrap.status !== 'provisioned'
    || bootstrap.accountId !== environment.CLOUDFLARE_ACCOUNT_ID
    || JSON.stringify(actualWorkers) !== JSON.stringify(expectedWorkers)
    || canonical(bootstrap.resources) !== canonical(expectedResources)
    || !DIGEST.test(receiptDigest ?? '') || digest(bootstrapBody) !== receiptDigest
    || bootstrap.releaseEnabled !== true || bootstrap.environmentProjection?.releaseEnabled !== true
    || bootstrap.environmentProjection?.receiptPersisted !== true
    || !DIGEST.test(bootstrap.planDigest ?? '') || !DIGEST.test(bootstrap.packetDigest ?? '')
    || !String(bootstrap.authorizedBy ?? '').trim() || Number.isNaN(Date.parse(bootstrap.provisionedAt))) {
    throw new Error('TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON is not an exact authorized provisioning receipt')
  }

  const variables = Object.fromEntries(PROTECTED_VARIABLE_NAMES.map(name => [name, environment[name]]))
  const overrides = Object.fromEntries(TRAVEL_MESH_PLAN.map(entry => [entry.id,
    Object.fromEntries(entry.overrides.map(([binding, name]) => [binding, environment[name]]))]))
  const secrets = Object.fromEntries(TRAVEL_MESH_PLAN.map(entry => [entry.id,
    Object.fromEntries(entry.secrets.map(([binding, name]) => [binding, environment[name]]))]))
  const serviceTargets = Object.fromEntries(TRAVEL_MESH_PLAN.map(entry => [entry.id,
    Object.fromEntries(entry.serviceTargets.map(([binding, name]) => [binding, environment[name]]))]))
  return Object.freeze({ variables, overrides, secrets, serviceTargets, configurationDigest: digest({
    plan: TRAVEL_MESH_PLAN.map(({ id, worker, config, environment: lane, dependencies }) => ({ id, worker, config, lane, dependencies })),
    configs: Object.fromEntries(TRAVEL_MESH_PLAN.map(entry => [entry.id, digest(fs.readFileSync(path.resolve(repoRoot, entry.config), 'utf8'))])),
    variables, secretBindings: Object.fromEntries(TRAVEL_MESH_PLAN.map(entry => [entry.id, entry.secrets.map(([binding]) => binding)])),
  }) })
}

export const validateBootstrapProtectedConfiguration = environment => {
  const bootstrap = { schema: 'agenticgraph-travel-mesh-bootstrap-receipt/v3', status: 'provisioned',
    accountId: environment.CLOUDFLARE_ACCOUNT_ID, authorizedBy: 'bootstrap-semantic-validation',
    provisionedAt: '2026-01-01T00:00:00.000Z', workers: TRAVEL_MESH_BOOTSTRAP_UNITS.map(entry => entry.worker),
    resources: bootstrapResourceSpecFor(environment), planDigest: '0'.repeat(64), packetDigest: '1'.repeat(64),
    releaseEnabled: true, environmentProjection: { receiptPersisted: true, releaseEnabled: true } }
  const candidate = { ...environment, TRAVEL_MESH_RELEASE_ENABLED: 'true',
    TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON: JSON.stringify({ ...bootstrap, receiptDigest: digest(bootstrap) }) }
  validateProtectedConfiguration(candidate)
  return bootstrapRuntimeConfiguration(environment)
}

const replaceRequired = (source, current, replacement, label, all = true) => {
  if (!source.includes(current)) throw new Error(`${label} is missing from its release config`)
  return all ? source.split(current).join(replacement) : source.replace(current, replacement)
}

export const releaseConfigFile = (entry, configuration) => {
  const sourcePath = path.resolve(repoRoot, entry.config)
  let source = fs.readFileSync(sourcePath, 'utf8')
  for (const [, envName, expected] of entry.serviceTargets) source = replaceRequired(source, expected, configuration.variables[envName], `${entry.id} service target`)
  if (entry.protectZone) source = replaceRequired(source, 'airvio.co', configuration.variables.TRAVEL_PUBLIC_ZONE_NAME, `${entry.id} zone`)
  if (entry.id === 'mcp') {
    source = replaceRequired(source, '[vars]', `[vars]\nAGENTICGRAPH_MEDIA_BUCKET = "${configuration.variables.AGENTICGRAPH_MEDIA_BUCKET}"`, 'MCP shared media bucket variable', false)
    source = replaceRequired(source, 'binding = "TRAVEL_AGENT_DEFINITION_CACHE"',
      `binding = "TRAVEL_AGENT_DEFINITION_CACHE"\nid = "${configuration.variables.TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID}"`, 'MCP KV binding', false)
    source = replaceRequired(source, '[[services]]\nbinding = "TRAVEL_DISCOVERY_HARNESS"',
      `[[r2_buckets]]\nbinding = "AGENTICGRAPH_MEDIA_R2"\nbucket_name = "${configuration.variables.AGENTICGRAPH_MEDIA_R2_BUCKET}"\n\n`
      + '[[services]]\nbinding = "TRAVEL_DISCOVERY_HARNESS"', 'MCP shared media R2 bindings', false)
  }
  if (entry.id === 'travel-commerce') {
    source = replaceRequired(source, '{ "binding": "BALANCE_CACHE" }',
      `{ "binding": "BALANCE_CACHE", "id": "${configuration.variables.TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID}" }`, 'travel balance KV')
    source = replaceRequired(source, '{ "binding": "PROVENANCE_ARCHIVE" }',
      `{ "binding": "PROVENANCE_ARCHIVE", "bucket_name": "${configuration.variables.TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET}" }`, 'travel provenance R2')
  }
  if (entry.id === 'storage') {
    if (!/^workers_dev = false$/m.test(source) || !/^preview_urls = false$/m.test(source)
      || /^workers_dev = true$/m.test(source) || /^preview_urls = true$/m.test(source)) throw new Error('storage public subdomain policy is not fail-closed')
    source = replaceRequired(source, 'database_name = "agenticgraph-storage"', `database_name = "${configuration.variables.TRAVEL_STORAGE_D1_DATABASE_NAME}"`, 'storage D1 name')
    source = replaceRequired(source, 'database_id = "633355bf-1a52-4085-bd3c-eba4220ff152"', `database_id = "${configuration.variables.TRAVEL_STORAGE_D1_DATABASE_ID}"`, 'storage D1 ID')
    source = replaceRequired(source, 'bucket_name = "agenticgraph-storage-blobs"', `bucket_name = "${configuration.variables.TRAVEL_STORAGE_R2_BUCKET}"`, 'storage R2')
  }
  const extension = path.extname(sourcePath)
  const file = path.join(path.dirname(sourcePath), `wrangler.release-${entry.id}-${crypto.randomUUID()}${extension}`)
  fs.writeFileSync(file, source, { flag: 'wx', mode: 0o600 })
  return path.relative(repoRoot, file)
}

export const removeEphemeralFile = file => { if (file) fs.unlinkSync(path.resolve(repoRoot, file)) }
