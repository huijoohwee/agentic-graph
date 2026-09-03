import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import {
  OPERATOR_DEPLOY_DEFAULT_CLOUD_DEPLOY_APPROVED,
  OPERATOR_DEPLOY_DEFAULT_FRONTEND_URL,
  OPERATOR_DEPLOY_DEFAULT_LIVE_CLIENTS_ENABLED,
  OPERATOR_DEPLOY_DEFAULT_MCP_ENDPOINT,
  OPERATOR_DEPLOY_DEFAULT_MODE,
  OPERATOR_DEPLOY_MCP_DOC_AREA,
  OPERATOR_DEPLOY_MCP_DOCS_URL,
  OPERATOR_DEPLOY_MODES,
  OPERATOR_DEPLOY_SETTING_KEYS,
} from '@/features/settings/operatorDeploySsot'

export { OPERATOR_DEPLOY_MCP_DOC_AREA, OPERATOR_DEPLOY_MCP_DOCS_URL }

type OperatorDeployDocRow = {
  key: string
  typeLabel: string
  valueKey?: string
  value?: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
  options?: string[]
}

const OPERATOR_DEPLOY_TOOLTIP_ROLE = 'Operator Deploy MCP'

const OPERATOR_DEPLOY_DOC_ROWS: ReadonlyArray<OperatorDeployDocRow> = [
  {
    key: 'endpoint',
    typeLabel: 'url',
    valueKey: OPERATOR_DEPLOY_SETTING_KEYS.mcpEndpoint,
    responsibility: 'Cloudflare MCP Worker endpoint (deploy env MCP_ENDPOINT). The single MCP Streamable HTTP surface for the Director.',
    notes: 'Set after an explicitly authorized deployment. Drives runtime:verify:deployed reachability and Demo_Pack urls[].',
    tooltipDefaultValue: OPERATOR_DEPLOY_DEFAULT_MCP_ENDPOINT,
    searchHints: ['MCP_ENDPOINT', 'airvio.co/agentic-graph/mcp', 'control plane', 'streamable http', 'wrangler'],
  },
  {
    key: 'frontendUrl',
    typeLabel: 'url',
    valueKey: OPERATOR_DEPLOY_SETTING_KEYS.frontendUrl,
    responsibility: 'Cloudflare Pages frontend URL (deploy env FRONTEND_URL). Recorded in the Demo_Pack urls[].',
    notes: 'Set after `npm run pages:deploy-cloudflare` (task 11.3).',
    tooltipDefaultValue: OPERATOR_DEPLOY_DEFAULT_FRONTEND_URL,
    searchHints: ['FRONTEND_URL', 'airvio.co/agentic-graph', 'cloudflare pages', 'reachable frontend'],
  },
  {
    key: 'mode',
    typeLabel: 'enum',
    valueKey: OPERATOR_DEPLOY_SETTING_KEYS.mode,
    responsibility: 'Director run mode for the live-proof step: dry-run (zero spend) or live (gated paid actions).',
    notes: 'Defaults to dry-run. The live-without-approvals halt is always demonstrable in dry-run.',
    tooltipDefaultValue: OPERATOR_DEPLOY_DEFAULT_MODE,
    options: [...OPERATOR_DEPLOY_MODES],
    searchHints: ['dry-run', 'live', 'halt', 'zero spend'],
  },
  {
    key: 'liveClientsEnabled',
    typeLabel: 'boolean',
    valueKey: OPERATOR_DEPLOY_SETTING_KEYS.liveClientsEnabled,
    responsibility: 'Whether live provider clients are wired at the Director boundary (env AGENTIC_OS_LIVE_CLIENTS).',
    notes: 'Off keeps deterministic mocks. On requires provider credentials on the Cloudflare control plane (BytePlus, Stripe).',
    tooltipDefaultValue: OPERATOR_DEPLOY_DEFAULT_LIVE_CLIENTS_ENABLED,
    searchHints: ['AGENTIC_OS_LIVE_CLIENTS', 'live clients', 'byteplus', 'stripe'],
  },
  {
    key: 'cloudDeployApproved',
    typeLabel: 'boolean',
    valueKey: OPERATOR_DEPLOY_SETTING_KEYS.cloudDeployApproved,
    responsibility: 'Operator acknowledgement that a cloud-deploy Approval_Token has been granted for this session.',
    notes: 'Fail-closed default (off). A UI acknowledgement only — never substitutes for the actual Approval_Token at a spend boundary.',
    tooltipDefaultValue: OPERATOR_DEPLOY_DEFAULT_CLOUD_DEPLOY_APPROVED,
    searchHints: ['cloud-deploy', 'approval token', 'operator-gated'],
  },
  {
    key: 'docs.url',
    typeLabel: 'url',
    value: OPERATOR_DEPLOY_MCP_DOCS_URL,
    responsibility: 'The operator deploy + live-proof runbook (authoritative step-by-step).',
    searchHints: ['deploy runbook', 'operator-gated', OPERATOR_DEPLOY_MCP_DOCS_URL],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]') || normalized.includes('map')) return 'json'
  return 'string'
}

export function getOperatorDeployMcpApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-operator-deploy', rowKey)
}

export const OPERATOR_DEPLOY_MCP_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  OPERATOR_DEPLOY_DOC_ROWS.map(row => {
    const fallbackValue = row.value ?? row.tooltipDefaultValue ?? ''
    const details: FlowDetails = {
      area: OPERATOR_DEPLOY_MCP_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['Operator Deploy MCP'],
      classes: ['Configuration'],
      functions: [],
      imports: [],
    }
    return {
      meta: {
        key: `operatorDeployMcp.${row.key}`,
        type: toBaseType(row.typeLabel),
        source: row.valueKey ? 'localStorage' : 'backendEnv',
        read: () => fallbackValue,
        options: row.options,
      },
      value: fallbackValue,
      valueKey: row.valueKey,
      typeLabel: row.typeLabel,
      tooltipRole: OPERATOR_DEPLOY_TOOLTIP_ROLE,
      tooltipDefaultValue: row.tooltipDefaultValue,
      searchHints: ['operator deploy mcp configuration', 'cloud-deploy', row.key, ...(row.searchHints || [])],
      details,
    }
  })
