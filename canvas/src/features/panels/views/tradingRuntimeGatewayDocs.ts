import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'

export const TRADING_RUNTIME_GATEWAY_DOC_AREA = 'Trading Runtime Gateway'
export const TRADING_RUNTIME_GATEWAY_HTTP_CONFIG_KEY = 'tradingRuntimeGateway.config.local_http_readonly'
export const TRADING_RUNTIME_GATEWAY_SERVER_KEY = 'trading-gateway'
export const TRADING_RUNTIME_GATEWAY_PLACEHOLDER_ENV = 'TRADING_GATEWAY_AUDIENCE_TOKEN'
export const TRADING_RUNTIME_GATEWAY_LOCAL_ORIGIN = 'http://127.0.0.1:<port>'

const TRADING_RUNTIME_GATEWAY_KEY_PREFIX = 'tradingRuntimeGateway.'

type TradingRuntimeGatewayDocRow = {
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
}

export function buildTradingRuntimeGatewayLocalHttpConfigJson(): string {
  return JSON.stringify({
    mcpServers: {
      '<server-key>': {
        type: 'streamable-http',
        url: `${TRADING_RUNTIME_GATEWAY_LOCAL_ORIGIN}/mcp`,
        headers: {
          Authorization: `Bearer \${${TRADING_RUNTIME_GATEWAY_PLACEHOLDER_ENV}}`,
        },
      },
    },
  }, null, 2)
}

const TRADING_RUNTIME_GATEWAY_DOC_ROWS: ReadonlyArray<TradingRuntimeGatewayDocRow> = [
  {
    key: 'gateway.role',
    typeLabel: 'contract',
    value: 'provider-neutral read-only trading runtime gateway',
    responsibility: 'Describe the trading runtime as a provider-neutral admission boundary that exposes only reviewed read-only capabilities to outside agents.',
    notes: 'The gateway holds no downstream provider credential and opens no direct provider route; every decision is delegated to the shared admission boundary.',
    searchHints: ['provider-neutral', 'trading runtime gateway', 'read-only', 'admission boundary'],
  },
  {
    key: 'transport.local_http_mcp',
    typeLabel: 'transport',
    value: 'local HTTP + MCP frontend bound to 127.0.0.1',
    responsibility: 'Primary external-agent route: a local HTTP server exposing /api/gateway, /api/gateway/capabilities, and a /mcp JSON-RPC frontend.',
    notes: 'Host and Origin are pinned to the local listener; browser MainPanel only renders setup metadata and never executes gateway requests.',
    searchHints: ['local http', '127.0.0.1', '/mcp', '/api/gateway', 'streamable-http'],
  },
  {
    key: 'discovery.capabilities',
    typeLabel: 'runtime',
    value: 'GET /api/gateway/capabilities and MCP tools/list project reviewed read-only operations',
    responsibility: 'Make discovery explicit: capability discovery is read-only and MCP tool names are derived from the operations admitted by reviewed capability records.',
    searchHints: ['capabilities', 'tools/list', 'discover', 'read-only discovery'],
  },
  {
    key: 'operations.read_only',
    typeLabel: 'tool list',
    value: 'read.snapshot and market read.* operations admitted by reviewed capabilities',
    responsibility: 'Surface only read-only operations (snapshot and market catalog/candles/ticker/depth/tape reads); mutating, paid, or order-placing operations are never admitted.',
    notes: 'Tool names equal the semantic operation id; the gateway refuses any operation outside the reviewed capability allowlist.',
    searchHints: ['read.snapshot', 'read.catalog', 'read.candles', 'read.ticker', 'read.depth', 'read.tape', 'read-only'],
  },
  {
    key: 'admission.signed_grant',
    typeLabel: 'guard',
    value: 'signed operator grant with unexpired admission proofs and a zero-cost budget',
    responsibility: 'Require a cryptographically verified operator envelope plus admission proofs before any provider read or write capability is dispatched.',
    searchHints: ['signed grant', 'operator envelope', 'admission proof', 'verifyEnvelope', 'requireProofs'],
  },
  {
    key: 'admission.mapping_digest',
    typeLabel: 'guard',
    value: 'capability mapping_digest must bind to the reviewed provider definition',
    responsibility: 'Bind each provider capability to a reviewed provider definition by adapter, schema, mapping, and transport digests so drifted or widened mappings fail closed.',
    searchHints: ['mapping_digest', 'adapter_digest', 'schema_digest', 'provider definition', 'fail-closed'],
  },
  {
    key: 'budget.zero_cap',
    typeLabel: 'guard',
    value: 'hard_cap_usd = 0 with deny_at_exhaustion and a positive remaining-call budget',
    responsibility: 'Keep connected reads on a zero-dollar hard cap that halts at exhaustion, sharing a single budget scope keyed by the cost-proof digest.',
    searchHints: ['zero cap', 'hard_cap_usd', 'deny_at_exhaustion', 'BUDGET_HALT', 'budget scope'],
  },
  {
    key: 'isolation.provider',
    typeLabel: 'guard',
    value: 'unique provider, adapter, schema, mapping, and origin pins per reviewed definition',
    responsibility: 'Enforce cross-provider isolation so no two reviewed definitions share a provider id or transport/mapping pin, and bind fail-closed before dispatch.',
    searchHints: ['provider isolation', 'DUPLICATE_PROVIDER', 'PROVIDER_ISOLATION', 'unique origin'],
  },
  {
    key: 'refusal.typed_codes',
    typeLabel: 'contract',
    value: 'typed refusal codes such as UNQUALIFIED, SCHEMA_DRIFT, SCOPE_DENIED, BUDGET_HALT, STALE_EVIDENCE',
    responsibility: 'Return typed refusal codes mapped from the admission boundary instead of silent fallbacks, so callers can distinguish qualification, drift, scope, budget, and staleness failures.',
    searchHints: ['refusal', 'UNQUALIFIED', 'SCHEMA_DRIFT', 'SCOPE_DENIED', 'BUDGET_HALT', 'STALE_EVIDENCE'],
  },
  {
    key: 'request.semantic_schema',
    typeLabel: 'schema',
    value: 'contract_version, request_id, capability_digest, operation, scope, inputs, deadline_utc',
    responsibility: 'Encode every MCP tool call as the same semantic request used by the HTTP frontend, including an exclusive UTC dispatch cutoff and a bound capability digest.',
    searchHints: ['semantic request', 'capability_digest', 'deadline_utc', 'request_id', 'scope'],
  },
  {
    key: 'secrets.boundary',
    typeLabel: 'security note',
    value: 'host-owned private config only',
    responsibility: 'Keep the gateway audience token and provider credentials in the operator-owned private runtime config, never in browser storage or docs.',
    notes: 'MainPanel may show env variable names and placeholders only; the gateway authenticates solely to its own audience.',
    searchHints: ['host config', 'audience token', 'no browser secret', 'placeholder only'],
  },
  {
    key: 'config.local_http_readonly',
    typeLabel: 'object',
    value: buildTradingRuntimeGatewayLocalHttpConfigJson(),
    responsibility: 'Generic mcpServers JSON for connecting an external MCP client to the local read-only trading runtime gateway.',
    notes: 'Origin port and audience token are placeholders; operators supply their own local listener and host-owned token. This row claims no deployment or live endpoint.',
    searchHints: ['mcpServers', 'streamable-http', '/mcp', 'read-only', '127.0.0.1'],
  },
  {
    key: 'copy.boundary',
    typeLabel: 'guard',
    value: 'provider-neutral runtime contract only',
    responsibility: 'Reuse the reviewed provider-neutral gateway contract for admission, read-only operations, and refusal semantics; do not copy provider prose, schemas, endpoints, or branding into shared native bytes.',
    searchHints: ['provider-neutral', 'no copy', 'no provider branding', 'contract only'],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('schema')) return 'json'
  return 'string'
}

export function getTradingRuntimeGatewayRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-trading-runtime-gateway', rowKey)
}

export const TRADING_RUNTIME_GATEWAY_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  TRADING_RUNTIME_GATEWAY_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: TRADING_RUNTIME_GATEWAY_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: [
        'canvas/src/features/panels/views/tradingRuntimeGatewayDocs.ts',
        'canvas/src/features/panels/views/settingsMcpDocEntries.ts',
        'canvas/src/features/panels/views/settingsOwnershipRegistry.ts',
      ],
      classes: ['Provider-neutral trading runtime gateway', 'External agent read-only connection readiness'],
      functions: [
        'buildTradingRuntimeGatewayLocalHttpConfigJson',
        'getTradingRuntimeGatewayRowAnchorId',
      ],
      imports: [],
    }
    return {
      meta: {
        key: `${TRADING_RUNTIME_GATEWAY_KEY_PREFIX}${row.key}`,
        type: toBaseType(row.typeLabel),
        source: 'backendEnv',
        read: () => row.value,
      },
      value: row.value,
      typeLabel: row.typeLabel,
      searchHints: ['trading runtime gateway', 'provider-neutral gateway', 'read-only trading', row.key, ...(row.searchHints || [])],
      details,
    }
  })