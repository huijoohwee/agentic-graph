export const SURFACE_REGISTRY_SCHEMA = 'knowgrph-surface-registry/v1'
export const LICENSE_REGISTRY_SCHEMA = 'knowgrph-license-registry/v1'
export const BLOCKING_REPORT_SCHEMA = 'knowgrph-surface-blocking-report/v1'
export const AUDIT_REPORT_SCHEMA = 'knowgrph-surface-audit-report/v1'
export const OPERATOR_INSTRUCTION_SCHEMA = 'knowgrph-surface-operator-instruction/v1'
export const PROMOTION_RECORD_SCHEMA = 'knowgrph-surface-promotion-record/v1'

export const SURFACE_TIERS = Object.freeze([
  'private',
  'gated',
  'public-artifact',
  'public-discoverable',
])

export const SURFACE_TIER_RESTRICTIVENESS = Object.freeze({
  private: 4,
  gated: 3,
  'public-artifact': 2,
  'public-discoverable': 1,
})

export const APPROVED_FETCH_PROXY_RATE_LIMIT = Object.freeze({
  requests: 20,
  windowSeconds: 60,
})

export const FETCH_PROXY_ROUTES = Object.freeze([
  '/api/link-proxy',
  '/api/link-preview',
  '/api/oembed',
  '/__youtube_transcript',
  '/__video_frame',
])

export const GATED_EXECUTION_ROUTES = Object.freeze([
  '/api/llm/responses',
  '/api/llm/chat/completions',
  '/api/llm/models',
  '/api/payments/commerce/x402',
  '/knowgrph/control-plane/mcp',
  '/__chat_proxy/*',
])

export const PUBLIC_DISCOVERY_FILES = Object.freeze([
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'openapi.json',
  '.well-known/api-catalog',
  '.well-known/agent-card.json',
  '.well-known/mcp.json',
])

export const APPROVED_LICENSES = Object.freeze({
  prose: 'CC-BY-4.0',
  machineMetadata: 'Apache-2.0',
  noReuse: 'LicenseRef-airvio-no-reuse-1.0',
  private: 'NONE-private',
})

export const DEFAULT_SURFACE_PATHS = Object.freeze({
  registry: 'config/surface-registry.json',
  licenses: 'config/license-registry.json',
  schema: 'schemas/surface-registry.v1.schema.json',
  staging: '.tmp/surface-staging',
  ledger: 'data/surface/ledger',
  reuseDeclaration: 'REUSE.md',
})

export function stableJson(value) {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, sortJsonValue(value[key])]),
  )
}
