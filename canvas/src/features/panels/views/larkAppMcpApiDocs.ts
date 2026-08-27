import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import {
  LARK_APP_MCP_AUTH_BOUNDARY,
  LARK_APP_MCP_BASEINFO_URL,
  LARK_APP_MCP_CANVAS_SURFACE,
  LARK_APP_MCP_DEFAULT_SERVER_KEY,
  LARK_APP_MCP_DEPLOYED_URL,
  LARK_APP_MCP_DOC_AREA,
  LARK_APP_MCP_DOCS_URL,
  LARK_APP_MCP_IMPORT_COMMAND,
  LARK_APP_MCP_OPERATOR_GUIDANCE,
  LARK_APP_MCP_PHASE_1_STATUS,
  LARK_APP_MCP_PHASE_2_STATUS,
  LARK_APP_MCP_PHASE_3_STATUS,
  LARK_APP_MCP_PHASE_SCOPE,
  LARK_APP_MCP_REMOTE_MUTATION_AUDIT,
  LARK_APP_MCP_REMOTE_MUTATION_AUTH_MODE,
  LARK_APP_MCP_REMOTE_MUTATION_BRIDGE_KIND,
  LARK_APP_MCP_REMOTE_MUTATION_CONFLICT_POLICY,
  LARK_APP_MCP_REMOTE_MUTATION_DEFERRED_ACTION,
  LARK_APP_MCP_REMOTE_MUTATION_IDEMPOTENCY,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_METADATA,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST_KIND,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_CHECKLIST,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_BLOCKING_REASON,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_NEXT_STEP,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_STATUS,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_VERIFICATION_METHOD,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_VERIFICATION_TARGET,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_VERIFICATION_EVIDENCE,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_OWNER,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_RETRY_DISPOSITION,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REMEDIATION_HINT,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SEVERITY,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SUMMARY,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_READINESS,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_STATUS,
  LARK_APP_MCP_REMOTE_MUTATION_RUNTIME_COMMAND,
  LARK_APP_MCP_REMOTE_MUTATION_SCOPE,
  LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_DRY_RUN_ACTION,
  LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_RUNTIME_ACTION,
  LARK_APP_MCP_TRANSPORT_TYPE,
  LARK_APP_MCP_TROUBLESHOOTING,
  LARK_APP_MCP_WEBPAGE_URL,
} from 'grph-shared/search/larkAppMcpSsot'
import { QUERY_PARAM_LARK_HANDOFF } from '@/lib/routing/queryParams'
import { buildLarkAppCanvasReviewHandoffQuery } from '@/features/canvas/larkAppCanvasHandoff'
import {
  buildLarkAppRemoteMutationPreviewResultExample,
  buildLarkAppRemoteMutationRequestExample,
} from '@/features/canvas/larkAppRemoteMutationBridge'

export { LARK_APP_MCP_DOC_AREA, LARK_APP_MCP_DOCS_URL }

type LarkAppMcpDocRow = {
  key: string
  typeLabel: string
  value?: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
}

const LARK_APP_MCP_TOOLTIP_ROLE = 'Lark App MCP'

export const LARK_APP_MCP_REMOTE_CONFIG_KEY = 'larkAppMcp.remote_config.generic'

export function buildLarkAppRemoteMcpConfigJson(): string {
  return JSON.stringify(
    {
      mcpServers: {
        [LARK_APP_MCP_DEFAULT_SERVER_KEY]: {
          url: LARK_APP_MCP_DEPLOYED_URL,
        },
      },
    },
    null,
    2,
  )
}

const LARK_APP_MCP_DOC_ROWS: ReadonlyArray<LarkAppMcpDocRow> = [
  {
    key: 'server_key',
    typeLabel: 'string',
    value: LARK_APP_MCP_DEFAULT_SERVER_KEY,
    responsibility: 'Default MCP server key a Lark app backend or host can use when registering the deployed agenticgraph MCP.',
    searchHints: ['mcpServers', 'agenticgraph', 'server key'],
  },
  {
    key: 'remote.url',
    typeLabel: 'url',
    value: LARK_APP_MCP_DEPLOYED_URL,
    responsibility: 'Canonical remote MCP endpoint for Lark app integration.',
    notes: 'Use the deployed Pages HTTP MCP endpoint instead of the local repo path or the Lark admin page.',
    searchHints: ['https://airvio.co/agenticgraph/mcp', 'pages http mcp', 'remote endpoint'],
  },
  {
    key: 'transport.type',
    typeLabel: 'string',
    value: LARK_APP_MCP_TRANSPORT_TYPE,
    responsibility: 'Transport label for the deployed agenticgraph remote MCP surface.',
    searchHints: ['json-rpc', 'streamable http', 'transport'],
  },
  {
    key: 'lark_app.baseinfo_url',
    typeLabel: 'url',
    value: LARK_APP_MCP_BASEINFO_URL,
    responsibility: 'Current Lark app admin page reference.',
    notes: 'This page is an app-management surface only. It is not the MCP endpoint and it is not a Base URL.',
    searchHints: ['baseinfo', 'open.larksuite.com/app', 'admin page'],
  },
  {
    key: 'docs.url',
    typeLabel: 'url',
    value: LARK_APP_MCP_DOCS_URL,
    responsibility: 'Canonical Lark platform docs landing page for the external app integration surface.',
    searchHints: ['lark docs', 'open.larksuite.com/document', 'platform docs'],
  },
  {
    key: 'lark_app.webpage_url',
    typeLabel: 'url',
    value: LARK_APP_MCP_WEBPAGE_URL,
    responsibility: 'Current Lark webpage surface reference for launch or configuration flows.',
    notes: 'Treat webpage as a launch or configuration surface only. It is not the deployed MCP endpoint and it does not replace Canvas.',
    searchHints: ['webpage', 'open.larksuite.com/app', 'launch surface'],
  },
  {
    key: 'canvas.surface',
    typeLabel: 'string',
    value: LARK_APP_MCP_CANVAS_SURFACE,
    responsibility: 'Canonical user-mediated review, import, and graph visualization surface.',
    notes: 'Open agenticgraph Canvas when imported or reviewed content should be validated before graph apply.',
    searchHints: ['agenticgraph canvas', 'review surface', 'graph visualization'],
  },
  {
    key: 'import.command',
    typeLabel: 'command',
    value: LARK_APP_MCP_IMPORT_COMMAND,
    responsibility: 'Existing Canvas runtime seam for Base snapshot import.',
    notes: 'This command exists only in the Canvas runtime after the app is loaded.',
    searchHints: ['importSnapshot', 'window command', 'canvas runtime'],
  },
  {
    key: 'handoff.query_param',
    typeLabel: 'string',
    value: QUERY_PARAM_LARK_HANDOFF,
    responsibility: 'Stable query parameter used for the Phase 2 Lark-to-Canvas handoff contract.',
    searchHints: ['kgLarkHandoff', 'query param', 'handoff'],
  },
  {
    key: 'handoff.review_query_example',
    typeLabel: 'string',
    value: buildLarkAppCanvasReviewHandoffQuery(),
    responsibility: 'Example review handoff query for webpage-launched Canvas review flows.',
    notes: 'This example launches review context only. It does not encode secrets and it does not mutate graph state directly.',
    searchHints: ['review query example', 'webpage launch', QUERY_PARAM_LARK_HANDOFF],
  },
  {
    key: 'webpage.surface_role',
    typeLabel: 'guidance',
    value: 'webpage launch-or-config only',
    responsibility: 'Declared role of the Lark webpage surface in the Phase 2 contract.',
    notes: 'Use webpage to open or configure Canvas handoff flows only. Keep the remote MCP target on the deployed Pages HTTP endpoint.',
    searchHints: ['webpage role', 'launch only', 'not mcp endpoint'],
  },
  {
    key: 'phase_1_status',
    typeLabel: 'string',
    value: LARK_APP_MCP_PHASE_1_STATUS,
    responsibility: 'Current remote-read phase status for the Lark app integration contract.',
    searchHints: ['phase 1', 'read-only mcp', 'shipped'],
  },
  {
    key: 'phase_2_status',
    typeLabel: 'string',
    value: LARK_APP_MCP_PHASE_2_STATUS,
    responsibility: 'Current Canvas-mediated review/import availability status.',
    notes: 'Canvas import capability is available via the shipped Base snapshot import seam, but it is not yet a dedicated remote Lark automation bridge.',
    searchHints: ['phase 2', 'canvas import', 'available-via-canvas-runtime'],
  },
  {
    key: 'phase_3_status',
    typeLabel: 'string',
    value: LARK_APP_MCP_PHASE_3_STATUS,
    responsibility: 'Future remote mutation bridge status.',
    notes: 'Phase 3 now ships a browser-local runtime bridge with dry-run publish preview support. It still does not expose a live write-capable bridge or remote mutation endpoint.',
    searchHints: ['phase 3', 'remote mutation', 'contract-only'],
  },
  {
    key: 'remote_mutation.bridge_kind',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_BRIDGE_KIND,
    responsibility: 'Declared Phase 3 bridge kind for future authenticated write/import flows.',
    searchHints: ['remote mutation bridge', 'authenticated bridge', 'phase 3'],
  },
  {
    key: 'remote_mutation.auth_mode',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_AUTH_MODE,
    responsibility: 'Auth ownership model required by the Phase 3 contract.',
    notes: 'Auth context must be backend-signed or host-issued. Browser-owned secrets remain forbidden.',
    searchHints: ['auth mode', 'backend-signed', 'host-issued'],
  },
  {
    key: 'remote_mutation.idempotency',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_IDEMPOTENCY,
    responsibility: 'Idempotency requirement for Phase 3 mutation requests.',
    searchHints: ['idempotency', 'dedupe', 'mutation request'],
  },
  {
    key: 'remote_mutation.conflict_policy',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_CONFLICT_POLICY,
    responsibility: 'Conflict-handling requirement for Phase 3 mutation requests.',
    searchHints: ['conflict policy', 'no silent overwrite', 'reject-on-conflict'],
  },
  {
    key: 'remote_mutation.audit',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_AUDIT,
    responsibility: 'Audit requirement for Phase 3 mutation requests.',
    searchHints: ['audit', 'audit required', 'mutation logging'],
  },
  {
    key: 'remote_mutation.scope',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_SCOPE,
    responsibility: 'Scope boundary for the currently shipped Phase 3 slice.',
    notes: 'This is a browser-local runtime bridge only. No remote write-capable endpoint is shipped in this repo slice.',
    searchHints: ['runtime bridge', 'no remote endpoint', 'phase 3 scope'],
  },
  {
    key: 'remote_mutation.runtime_command',
    typeLabel: 'command',
    value: LARK_APP_MCP_REMOTE_MUTATION_RUNTIME_COMMAND,
    responsibility: 'Installed browser-local Phase 3 runtime bridge command.',
    notes: 'Available when Canvas runtime is loaded. This command validates the request contract and can execute the supported import action locally.',
    searchHints: ['runtime command', 'window command', 'remote mutation bridge'],
  },
  {
    key: 'remote_mutation.supported_runtime_action',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_RUNTIME_ACTION,
    responsibility: 'Action currently supported by the browser-local runtime bridge.',
    notes: 'This action delegates to the existing Feishu Base source import seam instead of adding a direct graph mutation path.',
    searchHints: ['supported runtime action', 'import-source-document', 'phase 3 runtime'],
  },
  {
    key: 'remote_mutation.supported_dry_run_action',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_DRY_RUN_ACTION,
    responsibility: 'Publish action currently allowed only as a validated dry-run preview in the browser-local runtime bridge.',
    notes: 'Dry-run publish validates the Phase 3 contract locally but does not call a remote endpoint or apply write-back.',
    searchHints: ['dry-run publish', 'publish-approved-artifact', 'preview only'],
  },
  {
    key: 'remote_mutation.preview_status',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_STATUS,
    responsibility: 'Explicit browser-local result status returned for dry-run publish preview requests.',
    notes: 'Use this result to inspect intended publish target metadata without implying that write-back was applied.',
    searchHints: ['preview status', 'previewed', 'publish dry-run result'],
  },
  {
    key: 'remote_mutation.preview_metadata',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_METADATA,
    responsibility: 'Declared metadata class returned by the browser-local publish dry-run preview result.',
    notes: 'Preview responses surface target, conflict, audit, and next-step details for host-managed orchestration without applying write-back.',
    searchHints: ['preview metadata', 'conflict audit next step', 'publish dry-run'],
  },
  {
    key: 'remote_mutation.preview_readiness',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_READINESS,
    responsibility: 'Declared readiness state returned by the browser-local publish dry-run preview result.',
    notes: 'Dry-run publish remains blocked until a dedicated remote endpoint ships, even when preview metadata is available.',
    searchHints: ['preview readiness', 'blocked', 'remote endpoint deferred'],
  },
  {
    key: 'remote_mutation.preview_blocking_reason',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_BLOCKING_REASON,
    responsibility: 'Canonical blocking reason returned by dry-run publish previews.',
    notes: 'This reason keeps the preview contract explicit about why browser-local publish cannot be applied yet.',
    searchHints: ['blocking reason', 'remote-endpoint-deferred', 'publish blocked'],
  },
  {
    key: 'remote_mutation.preview_manifest',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST,
    responsibility: 'Declared host handoff shape returned by the browser-local publish dry-run preview result.',
    notes: 'Use the preview manifest as the stable handoff payload for downstream host-managed publish orchestration.',
    searchHints: ['preview manifest', 'host handoff', 'publish preview payload'],
  },
  {
    key: 'remote_mutation.preview_manifest_kind',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST_KIND,
    responsibility: 'Canonical manifest kind and version returned by dry-run publish previews.',
    notes: 'This keeps downstream parsing stable without implying that browser-local publish can be applied.',
    searchHints: ['manifest kind', 'lark-app-publish-preview', 'v1'],
  },
  {
    key: 'remote_mutation.preview_summary',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SUMMARY,
    responsibility: 'Declared human-readable summary returned by the browser-local publish dry-run preview result.',
    notes: 'Use this summary for host-side display without reconstructing the blocked preview state from lower-level fields.',
    searchHints: ['preview summary', 'human readable', 'blocked preview message'],
  },
  {
    key: 'remote_mutation.preview_severity',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SEVERITY,
    responsibility: 'Declared machine-readable severity returned by the browser-local publish dry-run preview result.',
    notes: 'Use this severity for host-side branching or UI emphasis without inferring risk from multiple preview fields.',
    searchHints: ['preview severity', 'warning', 'blocked preview risk'],
  },
  {
    key: 'remote_mutation.preview_checklist',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_CHECKLIST,
    responsibility: 'Declared host handoff checklist returned by the browser-local publish dry-run preview result.',
    notes: 'Use this checklist to drive the next operational steps without implying that browser-local publish can be applied.',
    searchHints: ['preview checklist', 'host handoff checklist', 'publish follow-up steps'],
  },
  {
    key: 'remote_mutation.preview_remediation_hint',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REMEDIATION_HINT,
    responsibility: 'Declared machine-readable remediation hint returned by the browser-local publish dry-run preview result.',
    notes: 'Use this hint to route blocked publish previews into one canonical host-managed follow-up path.',
    searchHints: ['remediation hint', 'host-managed remote endpoint', 'blocked publish remediation'],
  },
  {
    key: 'remote_mutation.preview_retry_disposition',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_RETRY_DISPOSITION,
    responsibility: 'Declared machine-readable retry disposition returned by the browser-local publish dry-run preview result.',
    notes: 'Use this disposition to suppress local retry loops and wait for the host-managed remote endpoint before retrying publish.',
    searchHints: ['retry disposition', 'defer retry', 'host-managed remote endpoint'],
  },
  {
    key: 'remote_mutation.preview_required_host_capability',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY,
    responsibility: 'Declared machine-readable host capability required by the browser-local publish dry-run preview result.',
    notes: 'Use this capability marker to confirm the host-managed remote publish endpoint exists before retrying or applying publish.',
    searchHints: ['required host capability', 'remote publish endpoint', 'host capability'],
  },
  {
    key: 'remote_mutation.preview_required_host_capability_status',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_STATUS,
    responsibility: 'Declared machine-readable status of the required host capability during the browser-local publish dry-run preview.',
    notes: 'Use this status to distinguish capability requirement from current browser-local availability before retrying or applying publish.',
    searchHints: ['host capability status', 'unavailable', 'browser-local preview'],
  },
  {
    key: 'remote_mutation.preview_required_host_capability_verification_method',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_VERIFICATION_METHOD,
    responsibility: 'Declared machine-readable verification method for the required host capability during the browser-local publish dry-run preview.',
    notes: 'Use this method marker to decide how the host should verify the remote publish capability before retrying or applying publish.',
    searchHints: ['verification method', 'capability check', 'host-managed verification'],
  },
  {
    key: 'remote_mutation.preview_required_host_capability_verification_target',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_VERIFICATION_TARGET,
    responsibility: 'Declared machine-readable readiness target for the required host capability verification during the browser-local publish dry-run preview.',
    notes: 'Use this target marker to decide what host-managed readiness condition must be checked before retrying or applying publish.',
    searchHints: ['verification target', 'readiness target', 'remote publish readiness'],
  },
  {
    key: 'remote_mutation.preview_required_host_capability_verification_evidence',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_VERIFICATION_EVIDENCE,
    responsibility: 'Declared machine-readable evidence type for the required host capability verification during the browser-local publish dry-run preview.',
    notes: 'Use this evidence marker to decide what host-reported signal should satisfy the readiness check before retrying or applying publish.',
    searchHints: ['verification evidence', 'host signal', 'endpoint availability evidence'],
  },
  {
    key: 'remote_mutation.preview_required_host_capability_owner',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_OWNER,
    responsibility: 'Declared machine-readable owner of the required host capability during the browser-local publish dry-run preview.',
    notes: 'Use this owner marker to route blocked publish follow-up to the host-side component responsible for satisfying the remote publish capability.',
    searchHints: ['capability owner', 'host owner', 'host runtime'],
  },
  {
    key: 'remote_mutation.preview_next_step',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_NEXT_STEP,
    responsibility: 'Canonical next-step marker returned by dry-run publish previews.',
    notes: 'This marker confirms that a host-managed remote publish step is still required after local preview.',
    searchHints: ['preview next step', 'host-managed remote publish', 'deferred publish'],
  },
  {
    key: 'remote_mutation.deferred_action',
    typeLabel: 'string',
    value: LARK_APP_MCP_REMOTE_MUTATION_DEFERRED_ACTION,
    responsibility: 'Action still deferred until a dedicated remote endpoint/runtime exists.',
    notes: 'Non-dry-run publish/write-back remains intentionally unsupported in the live runtime slice.',
    searchHints: ['deferred action', 'publish-approved-artifact', 'no remote endpoint'],
  },
  {
    key: 'remote_mutation.request_example',
    typeLabel: 'json',
    value: buildLarkAppRemoteMutationRequestExample(),
    responsibility: 'Typed Phase 3 request example for future authenticated remote mutation flows.',
    notes: 'This example defines the live runtime request shape for the supported import action. It must not be treated as a remote write endpoint payload.',
    searchHints: ['request example', 'import-source-document', 'idempotencyKey'],
  },
  {
    key: 'remote_mutation.preview_result_example',
    typeLabel: 'json',
    value: buildLarkAppRemoteMutationPreviewResultExample(),
    responsibility: 'Example browser-local preview result returned for publish-approved-artifact dry-run requests.',
    notes: 'This preview result is local metadata only. It confirms what would be targeted while keeping remote write-back deferred.',
    searchHints: ['preview result example', 'previewed', 'publish-approved-artifact'],
  },
  {
    key: 'auth_boundary',
    typeLabel: 'string',
    value: LARK_APP_MCP_AUTH_BOUNDARY,
    responsibility: 'Auth ownership boundary for Lark app integration.',
    notes: 'Lark app auth and Base credentials stay in backend or host-managed layers, not browser state.',
    searchHints: ['host-managed', 'backend-managed', 'no browser secrets'],
  },
  {
    key: 'remote_config.generic',
    typeLabel: 'json',
    value: buildLarkAppRemoteMcpConfigJson(),
    responsibility: 'Generic remote MCP config shape for the Lark-side client layer.',
    notes: 'This is the connectable remote target for Lark integration. It is not the local stdio server.',
    searchHints: ['mcpServers', 'generic remote config', LARK_APP_MCP_DEPLOYED_URL],
  },
  {
    key: 'operator_guidance',
    typeLabel: 'guidance',
    value: LARK_APP_MCP_OPERATOR_GUIDANCE,
    responsibility: 'Operator-facing guidance for the end-to-end Lark app to Canvas flow.',
    searchHints: ['operator guidance', 'canvas review', 'deployed mcp'],
  },
  {
    key: 'phase_scope',
    typeLabel: 'guidance',
    value: LARK_APP_MCP_PHASE_SCOPE,
    responsibility: 'Explicit phase boundary for the initial Lark app integration slice.',
    searchHints: ['phase scope', 'no remote mutation bridge', 'canvas-mediated import'],
  },
  {
    key: 'troubleshooting',
    typeLabel: 'guidance',
    value: LARK_APP_MCP_TROUBLESHOOTING,
    responsibility: 'Troubleshooting guidance for common endpoint and auth-boundary confusion.',
    searchHints: ['troubleshooting', 'local repo path', 'admin page', 'browser state'],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]') || normalized.includes('map') || normalized.includes('json')) return 'json'
  return 'string'
}

export function getLarkAppMcpApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-lark-app', rowKey)
}

export const LARK_APP_MCP_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  LARK_APP_MCP_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: LARK_APP_MCP_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['Lark App MCP'],
      classes: ['Configuration'],
      functions: [],
      imports: [],
    }
    return {
      meta: {
        key: `larkAppMcp.${row.key}`,
        type: toBaseType(row.typeLabel),
        source: 'backendEnv',
        read: () => row.value ?? 'Lark App MCP setting',
      },
      value: row.value ?? 'Lark App MCP setting',
      typeLabel: row.typeLabel,
      tooltipRole: LARK_APP_MCP_TOOLTIP_ROLE,
      searchHints: ['lark app mcp to canvas', 'agenticgraph canvas', row.key, ...(row.searchHints || [])],
      details,
    }
  })
