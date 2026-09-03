export const STRIPE_MCP_DOC_AREA = 'Stripe MCP Configuration'

export const STRIPE_MCP_DOCS_URL = 'https://docs.stripe.com/mcp'

export const STRIPE_MCP_REGISTRY_URL = 'https://github.com/mcp/com.stripe/mcp'

export const STRIPE_MCP_REMOTE_URL = 'https://mcp.stripe.com'

export const STRIPE_MCP_DEFAULT_SERVER_KEY = 'stripe'

export const STRIPE_MCP_CONNECTION_MODES = ['oauth', 'bearer'] as const

export const STRIPE_MCP_DEFAULT_CONNECTION_MODE = 'oauth'

export const STRIPE_MCP_DEFAULT_LOCAL_COMMAND = 'npx'

export const STRIPE_MCP_DEFAULT_LOCAL_PACKAGE = '@stripe/mcp@latest'

export const STRIPE_MCP_DEFAULT_LOCAL_ARGS = [
  '-y',
  STRIPE_MCP_DEFAULT_LOCAL_PACKAGE,
] as const

export const STRIPE_MCP_SECRET_ENV_KEY = 'STRIPE_SECRET_KEY'

export const STRIPE_MCP_RESTRICTED_KEY_ENV_REF = '${PAYMENT_STRIPE_MCP_SANDBOX_RESTRICTED_KEY}'

export const STRIPE_MCP_DEFAULT_LOCAL_ENV_TEMPLATE = {
  [STRIPE_MCP_SECRET_ENV_KEY]: STRIPE_MCP_RESTRICTED_KEY_ENV_REF,
} as const

export const STRIPE_MCP_DEFAULT_STARTUP_TIMEOUT_MS = 60000

export const STRIPE_MCP_DEFAULT_REQUIRE_CONFIRMATION = true

export const STRIPE_MCP_PAYMENT_READINESS_POLICY = [
  'accept payment checkout handoff',
  'Every hosted Stripe MCP tool requires human confirmation.',
  'State-changing and spend-bearing tools additionally require the agentic-graph Approval Gate.',
  'OAuth, autonomous restricted-key, connected-account, sandbox, and live sessions remain separate.',
].join('; ')

export const STRIPE_MCP_PAYMENT_TOOL_NAMES = [
  'stripe_api_search',
  'stripe_api_details',
  'stripe_api_read',
  'stripe_api_write',
  'get_stripe_account_info',
  'create_refund',
  'search_stripe_documentation',
  'stripe_implementation_planner',
  'send_stripe_mcp_feedback',
  'stripe_report',
] as const

export const STRIPE_MCP_EXCLUDED_TOOL_NAMES = [
  'get_balance_summary',
] as const

export const STRIPE_MCP_DEFAULT_LOCAL_ARGS_JSON = JSON.stringify(STRIPE_MCP_DEFAULT_LOCAL_ARGS, null, 2)

export const STRIPE_MCP_DEFAULT_LOCAL_ENV_TEMPLATE_JSON = JSON.stringify(STRIPE_MCP_DEFAULT_LOCAL_ENV_TEMPLATE, null, 2)
