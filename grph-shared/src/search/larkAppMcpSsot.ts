export const LARK_APP_MCP_DOC_AREA = 'Lark App MCP to Canvas'

export const LARK_APP_MCP_DOCS_URL = 'https://open.larksuite.com/document/home/index'

export const LARK_APP_MCP_BASEINFO_URL =
  'https://open.larksuite.com/app/cli_a7ddaa5aeff89010/baseinfo'

export const LARK_APP_MCP_WEBPAGE_URL =
  'https://open.larksuite.com/app/cli_a7ddaa5aeff89010/webpage'

export const LARK_APP_MCP_DEPLOYED_URL = 'https://airvio.co/agenticgraph/mcp'

export const LARK_APP_MCP_DEFAULT_SERVER_KEY = 'agenticgraph'

export const LARK_APP_MCP_TRANSPORT_TYPE = 'streamable-http-jsonrpc'

export const LARK_APP_MCP_CANVAS_SURFACE = 'agenticgraph-canvas'

export const LARK_APP_MCP_IMPORT_COMMAND =
  'window.agenticgraphFeishuBaseSourceImportCommand.importSnapshot'

export const LARK_APP_MCP_PHASE_1_STATUS = 'shipped-read-only-pages-mcp'

export const LARK_APP_MCP_PHASE_2_STATUS = 'shipped-canvas-handoff-runtime'

export const LARK_APP_MCP_PHASE_3_STATUS =
  'shipped-runtime-bridge-dry-run-publish-no-remote-endpoint'

export const LARK_APP_MCP_AUTH_BOUNDARY = 'lark-backend-or-host-managed'

export const LARK_APP_MCP_REMOTE_MUTATION_BRIDGE_KIND =
  'authenticated-remote-mutation-bridge'

export const LARK_APP_MCP_REMOTE_MUTATION_AUTH_MODE =
  'backend-signed-or-host-issued'

export const LARK_APP_MCP_REMOTE_MUTATION_IDEMPOTENCY = 'required'

export const LARK_APP_MCP_REMOTE_MUTATION_CONFLICT_POLICY =
  'explicit-no-silent-overwrite'

export const LARK_APP_MCP_REMOTE_MUTATION_AUDIT = 'required'

export const LARK_APP_MCP_REMOTE_MUTATION_SCOPE =
  'runtime-bridge-no-remote-endpoint'

export const LARK_APP_MCP_REMOTE_MUTATION_RUNTIME_COMMAND =
  'window.agenticgraphLarkAppRemoteMutationBridge.execute'

export const LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_RUNTIME_ACTION =
  'import-source-document'

export const LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_DRY_RUN_ACTION =
  'publish-approved-artifact(dry-run-only)'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_STATUS =
  'previewed(publish dry-run only)'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_METADATA =
  'target-plus-conflict-audit-next-step-retry-capability-status-verification-evidence-metadata'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_NEXT_STEP =
  'await-host-managed-remote-publish'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_READINESS =
  'blocked(until-remote-endpoint-ships)'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_BLOCKING_REASON =
  'remote-endpoint-deferred'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST =
  'host-handoff-manifest'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST_KIND =
  'lark-app-publish-preview(v1)'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SUMMARY =
  'human-readable-blocked-preview-summary'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SEVERITY =
  'warning(blocked-preview)'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_CHECKLIST =
  'host-handoff-checklist'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REMEDIATION_HINT =
  'wait-for-host-managed-remote-endpoint'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_RETRY_DISPOSITION =
  'defer-until-host-managed-remote-endpoint'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY =
  'host-managed-remote-publish-endpoint'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_STATUS =
  'unavailable(browser-local-preview)'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_VERIFICATION_METHOD =
  'host-managed-capability-check'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_VERIFICATION_TARGET =
  'remote-publish-endpoint-readiness'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_VERIFICATION_EVIDENCE =
  'host-reported-endpoint-availability'

export const LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REQUIRED_HOST_CAPABILITY_OWNER =
  'host-runtime'

export const LARK_APP_MCP_REMOTE_MUTATION_DEFERRED_ACTION =
  'publish-approved-artifact(non-dry-run)'

export const LARK_APP_MCP_OPERATOR_GUIDANCE =
  'Connect the Lark app backend to the deployed agenticgraph MCP, hand off webpage or operator launch flows into agenticgraph Canvas for review/import, and use the Phase 3 runtime bridge only for import-source-document plus publish-approved-artifact dry-runs that return target, conflict, audit, next-step, blocked-preview metadata, a stable host handoff manifest, a human-readable preview summary, a machine-readable warning severity, a host handoff checklist, a machine-readable remediation hint, a machine-readable retry disposition, a machine-readable required host capability, a machine-readable required host capability status, a machine-readable required host capability verification method, a machine-readable required host capability verification target, a machine-readable required host capability verification evidence type, and a machine-readable required host capability owner until a separate remote write endpoint is explicitly shipped.'

export const LARK_APP_MCP_PHASE_SCOPE =
  'Phase 3 now ships a browser-local runtime bridge over the typed authenticated mutation contract. It supports import-source-document and publish-approved-artifact dry-runs with explicit target, conflict, audit, next-step, blocked-preview metadata, a stable host handoff manifest, a human-readable preview summary, a machine-readable warning severity, a host handoff checklist, a machine-readable remediation hint, a machine-readable retry disposition, a machine-readable required host capability, a machine-readable required host capability status, a machine-readable required host capability verification method, a machine-readable required host capability verification target, a machine-readable required host capability verification evidence type, and a machine-readable required host capability owner only, and it still does not ship a remote write-capable endpoint, remote MCP mutation route, or direct graph mutation shortcut.'

export const LARK_APP_MCP_TROUBLESHOOTING =
  'Do not use baseinfo or webpage as the MCP endpoint, do not target the local repo path, keep Base secrets outside browser state, and do not treat the Phase 3 runtime bridge, preview metadata, or dry-run publish preview as a remote write endpoint.'
