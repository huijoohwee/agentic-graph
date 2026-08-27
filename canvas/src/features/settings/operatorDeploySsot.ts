// Operator Deploy settings SSOT (single source of truth).
//
// Surfaces the OPERATOR-GATED deploy configuration (the env the deploy
// runbook needs) as USER SETTINGS editable in MainPanel Integrations / MCP /
// Settings. Platform target is Cloudflare-only.
//
// This is a NEUTRAL LEAF module: it imports nothing from the settings registry
// or the panels views, so it can be shared by both the registry
// (`registry-operator-deploy.ts`) and the docs/virtual-entries module
// (`../panels/views/operatorDeployMcpApiDocs.ts`) without an import cycle.
//
// These are operator-facing ENDPOINTS, NAMES, and TOGGLES only —
// never a model provider key or a raw secret value.
// Stored in localStorage like every other MainPanel setting.

/** Section label used to group the rows under MainPanel MCP / Integrations. */
export const OPERATOR_DEPLOY_MCP_DOC_AREA = 'Operator Deploy MCP'

/** Operator runbook reference (kept in-repo; not a network dependency). */
export const OPERATOR_DEPLOY_MCP_DOCS_URL =
  'https://github.com/huijoohwee/knowgrph/blob/main/docs/agenticgraph-deploy-runbook.md'

export const OPERATOR_DEPLOY_MODES = ['dry-run', 'live'] as const
export type OperatorDeployMode = (typeof OPERATOR_DEPLOY_MODES)[number]

// --- Defaults ---------------------------------------------------------------

/** Cloudflare control-plane MCP Streamable HTTP endpoint (env `MCP_ENDPOINT`). */
export const OPERATOR_DEPLOY_DEFAULT_MCP_ENDPOINT = 'https://airvio.co/agenticgraph/mcp'

/** Cloudflare Pages frontend URL (env `FRONTEND_URL`). */
export const OPERATOR_DEPLOY_DEFAULT_FRONTEND_URL = 'https://airvio.co/agenticgraph'

/** Director run mode for the live-proof step. Defaults to the safe dry-run. */
export const OPERATOR_DEPLOY_DEFAULT_MODE: OperatorDeployMode = 'dry-run'

/** Whether live clients (paid providers) are wired (`AGENTICGRAPH_LIVE_CLIENTS`). Default off. */
export const OPERATOR_DEPLOY_DEFAULT_LIVE_CLIENTS_ENABLED = false

/** Operator acknowledgement that a `cloud-deploy` Approval_Token has been granted. Default off (fail-closed). */
export const OPERATOR_DEPLOY_DEFAULT_CLOUD_DEPLOY_APPROVED = false

// --- Setting + storage key strings ------------------------------------------

export const OPERATOR_DEPLOY_SETTING_KEYS = {
  mcpEndpoint: 'operatorDeploy.mcp.endpoint',
  frontendUrl: 'operatorDeploy.mcp.frontendUrl',
  mode: 'operatorDeploy.mcp.mode',
  liveClientsEnabled: 'operatorDeploy.mcp.liveClientsEnabled',
  cloudDeployApproved: 'operatorDeploy.mcp.cloudDeployApproved',
} as const
