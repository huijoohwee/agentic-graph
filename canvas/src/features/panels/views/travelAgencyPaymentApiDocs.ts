import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'

export const TRAVEL_AGENCY_PAYMENT_API_DOC_AREA = 'Travel Agency Payment API'

export function getTravelAgencyPaymentApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('travel-agency-payment-api-row', rowKey)
}

type TravelAgencyPaymentRow = {
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  valueKey?: string
  notes?: string
  searchHints?: string[]
}

const TRAVEL_AGENCY_PAYMENT_ROWS: ReadonlyArray<TravelAgencyPaymentRow> = [
  {
    key: 'travelAgencyPayment.route.intent',
    typeLabel: 'endpoint',
    value: 'POST /api/payments/travel-agency/intent',
    responsibility: 'Parses a bounded travel purchase intent through the server-owned OpenAI Responses configuration.',
    searchHints: ['travel agency intent OpenAI Responses payment Worker'],
  },
  {
    key: 'travelAgencyPayment.route.issuance_prepare',
    typeLabel: 'endpoint',
    value: 'POST /api/payments/travel-agency/issuance/prepare',
    responsibility: 'Validates the Payment_Call, cap, currency, and Human_Confirm_Event before any card provider dispatch.',
    searchHints: ['issuance prepare Confirmation Gate Payment Call'],
  },
  {
    key: 'travelAgencyPayment.issuance.mcp_server_key',
    typeLabel: 'string',
    value: 'straitsx-sandbox',
    valueKey: 'payments.travel.issuance.mcpServerKey',
    responsibility: 'Operator-owned MCP profile key for the sandbox card issuance gateway.',
    notes: 'This is a non-secret profile identifier. Provider credentials stay server-side.',
    searchHints: ['StraitsX Card MCP Gateway server key'],
  },
  {
    key: 'travelAgencyPayment.issuance.transport',
    typeLabel: 'enum',
    value: 'sse',
    valueKey: 'payments.travel.issuance.mcpTransport',
    responsibility: 'External tool transport for card issuance. The travel spec requires SSE.',
    searchHints: ['MCP SSE transport card issuance'],
  },
  {
    key: 'travelAgencyPayment.issuance.tool_name',
    typeLabel: 'string',
    value: 'cards.issue',
    valueKey: 'payments.travel.issuance.mcpToolName',
    responsibility: 'Provider-owned MCP tool name used only after guardrail pass and human confirmation.',
    searchHints: ['MCP tool card issue issuance'],
  },
  {
    key: 'travelAgencyPayment.issuance.deadline_ms',
    typeLabel: 'integer',
    value: 30000,
    valueKey: 'payments.travel.issuance.deadlineMs',
    responsibility: 'Deadline from issuance request dispatch to first response frame.',
    notes: 'Requirement 6 bounds each issuance tool call to 30 seconds.',
    searchHints: ['response deadline first response frame 30 seconds'],
  },
  {
    key: 'travelAgencyPayment.issuance.per_card_cap_minor',
    typeLabel: 'integer',
    value: 0,
    valueKey: 'payments.travel.issuance.perCardCapMinor',
    responsibility: 'Maximum single-card amount in the smallest currency unit; over-cap requests fail before provider dispatch.',
    notes: 'A zero default intentionally keeps issuance closed until an operator supplies a cap.',
    searchHints: ['Per_Card_Cap amount-exceeds-per-card-cap'],
  },
  {
    key: 'travelAgencyPayment.issuance.currency',
    typeLabel: 'ISO-4217',
    value: 'SGD',
    valueKey: 'payments.travel.issuance.currency',
    responsibility: 'Settlement currency required to match the guardrail-approved amount currency exactly.',
    searchHints: ['settlement currency guardrail approved amount'],
  },
  {
    key: 'travelAgencyPayment.issuance.production_enabled',
    typeLabel: 'boolean',
    value: false,
    valueKey: 'payments.travel.issuance.productionEnabled',
    responsibility: 'Keeps production card issuance closed unless the external production schema and evidence are explicitly supplied.',
    notes: 'The Kiro spec marks production issuance integration blocked; enabling this in UI does not inject secrets or bypass server evidence gates.',
    searchHints: ['production issuance blocked boundary'],
  },
  {
    key: 'travelAgencyPayment.guardrail.retry_bound',
    typeLabel: 'integer',
    value: 0,
    valueKey: 'payments.travel.guardrail.retryBound',
    responsibility: 'Maximum flexible-date retry attempts after a deterministic budget block.',
    searchHints: ['Guardrail Gate retry bound zero'],
  },
]

export const TRAVEL_AGENCY_PAYMENT_API_REQUEST_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> = TRAVEL_AGENCY_PAYMENT_ROWS.map((row) => {
  const meta: SettingMeta = {
    key: row.key,
    type: 'string',
    source: 'backendEnv',
    read: () => row.value,
  }
  const details: FlowDetails = {
    area: TRAVEL_AGENCY_PAYMENT_API_DOC_AREA,
    responsibility: row.responsibility,
    notes: row.notes,
  }
  return {
    meta,
    details,
    value: row.value,
    typeLabel: row.typeLabel,
    valueKey: row.valueKey,
    searchHints: row.searchHints,
  }
})
