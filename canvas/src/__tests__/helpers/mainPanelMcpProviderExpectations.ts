import {
  EXA_MCP_API_KEY_HEADER,
  EXA_MCP_DASHBOARD_URL,
  EXA_MCP_DEFAULT_CONNECTION_MODE,
  EXA_MCP_DEFAULT_ENABLED_TOOLS_JSON,
  EXA_MCP_DEFAULT_FETCH_CONTENT_LIMIT,
  EXA_MCP_DEFAULT_MAX_RESULTS,
  EXA_MCP_DEFAULT_SERVER_KEY,
  EXA_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
  EXA_MCP_DOCS_MARKDOWN_URL,
  EXA_MCP_DOCS_URL,
  EXA_MCP_GITHUB_URL,
  EXA_MCP_LOCAL_API_KEY_ENV,
  EXA_MCP_REMOTE_URL,
} from 'grph-shared/search/exaMcpSsot'
import {
  EXA_SEARCH_API_CODING_AGENT_REQUEST_JSON,
  EXA_SEARCH_API_DOCS_URL,
  EXA_SEARCH_API_ENDPOINT,
  EXA_SEARCH_API_INVOCATION_TEXT,
} from 'grph-shared/search/exaSearchApiSsot'
import {
  MOOMOO_MARKET_MCP_AUTH_HEADER,
  MOOMOO_MARKET_MCP_CONNECTED_STATUS,
  MOOMOO_MARKET_MCP_DEFAULT_CONNECTION_MODE,
  MOOMOO_MARKET_MCP_DEFAULT_ENABLED_TOOLS_JSON,
  MOOMOO_MARKET_MCP_DEFAULT_MAX_ROWS,
  MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY,
  MOOMOO_MARKET_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
  MOOMOO_MARKET_MCP_OPENAPI_URL,
  MOOMOO_MARKET_MCP_READ_ONLY_BOUNDARY,
  MOOMOO_MARKET_MCP_REMOTE_URL,
  MOOMOO_MARKET_MCP_WRITE_TOOLS_JSON,
} from 'grph-shared/search/moomooMarketMcpSsot'
import {
  FEISHU_BASE_MCP_DEFAULT_AUTH_BOUNDARY,
  FEISHU_BASE_MCP_DEFAULT_CONNECTION_MODE,
  FEISHU_BASE_MCP_DEFAULT_PHASE,
  FEISHU_BASE_MCP_DEFAULT_SERVER_KEY,
  FEISHU_BASE_MCP_DOCS_URL,
  FEISHU_BASE_MCP_OPERATOR_GUIDANCE,
  FEISHU_BASE_MCP_PHASE_2_STATUS,
  FEISHU_BASE_MCP_PHASE_3_STATUS,
  FEISHU_BASE_MCP_PHASE_SCOPE,
  FEISHU_BASE_MCP_SKILL_ROUTE,
  FEISHU_BASE_MCP_TROUBLESHOOTING,
} from 'grph-shared/search/feishuBaseMcpSsot'
import {
  LARK_APP_MCP_AUTH_BOUNDARY,
  LARK_APP_MCP_BASEINFO_URL,
  LARK_APP_MCP_CANVAS_SURFACE,
  LARK_APP_MCP_DEFAULT_SERVER_KEY,
  LARK_APP_MCP_DEPLOYED_URL,
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
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_BLOCKING_REASON,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_CHECKLIST,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST_KIND,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_METADATA,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_NEXT_STEP,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_READINESS,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REMEDIATION_HINT,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SEVERITY,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_STATUS,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SUMMARY,
  LARK_APP_MCP_REMOTE_MUTATION_RUNTIME_COMMAND,
  LARK_APP_MCP_REMOTE_MUTATION_SCOPE,
  LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_DRY_RUN_ACTION,
  LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_RUNTIME_ACTION,
  LARK_APP_MCP_TRANSPORT_TYPE,
  LARK_APP_MCP_TROUBLESHOOTING,
  LARK_APP_MCP_WEBPAGE_URL,
} from 'grph-shared/search/larkAppMcpSsot'
import {
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_HEADER,
  CLOUDFLARE_AI_GATEWAY_MCP_DOCS_URL,
  CLOUDFLARE_AI_GATEWAY_MCP_GITHUB_URL,
  CLOUDFLARE_AI_GATEWAY_MCP_REMOTE_URL,
  CLOUDFLARE_AI_GATEWAY_MCP_SERVER_KEY,
  CLOUDFLARE_AI_GATEWAY_MCP_TOOL_NAMES,
  CLOUDFLARE_AI_GATEWAY_OPENAI_ENDPOINT,
  CLOUDFLARE_AI_GATEWAY_PRODUCT_URL,
  CLOUDFLARE_AI_GATEWAY_UNIVERSAL_ENDPOINT,
  CLOUDFLARE_MCP_SERVER_GITHUB_URL,
} from '@/features/panels/views/cloudflareAiGatewayMcpApiDocs'
import {
  VIDEODB_MCP_AI_TOOLS,
  VIDEODB_MCP_CREDENTIAL_ENV,
  VIDEODB_MCP_CREDENTIAL_PLACEHOLDER,
  VIDEODB_MCP_DOCS_URL,
  VIDEODB_MCP_PACKAGE,
  VIDEODB_MCP_POLL_INTERVAL_MS,
  VIDEODB_MCP_POLL_MAX_ITERATIONS,
  VIDEODB_MCP_SERVER_KEY,
  VIDEODB_MCP_UVX_COMMAND,
} from '@/features/panels/views/videodbMcpApiDocs'
import { QUERY_PARAM_LARK_HANDOFF } from '@/lib/routing/queryParams'
import { readRenderedFormValues } from './mainPanelMcpExpectationUtils'

export function assertMcpHubSurfacesExaMcpConfig(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'Exa MCP Configuration',
    'exaMcp.server_key',
    'exaMcp.remote.url',
    'exaMcp.tool_profile',
    'exaMcp.enabled_tools',
    'exaMcp.connection.mode',
    'exaMcp.startup_timeout_ms',
    'exaMcp.max_results',
    'exaMcp.fetch_content_limit',
    'exaMcp.require_fetch_review',
    'exaMcp.search_api.endpoint',
    'exaMcp.search_api.default_request',
    'exaMcp.search_api.response_contract',
    'exaMcp.search_api.invocation',
    'exaMcp.search_api.docs_url',
    'exaMcp.remote_config.codex',
    'exaMcp.remote_config.generic',
    'web_search_exa',
    'web_fetch_exa',
    'web_search_advanced_exa',
    'mcpServers',
    `codex mcp add ${EXA_MCP_DEFAULT_SERVER_KEY} --url '${EXA_MCP_REMOTE_URL}'`,
    EXA_MCP_DEFAULT_SERVER_KEY,
    EXA_MCP_REMOTE_URL,
    EXA_MCP_DEFAULT_ENABLED_TOOLS_JSON,
    EXA_MCP_DEFAULT_CONNECTION_MODE,
    String(EXA_MCP_DEFAULT_STARTUP_TIMEOUT_MS),
    String(EXA_MCP_DEFAULT_MAX_RESULTS),
    String(EXA_MCP_DEFAULT_FETCH_CONTENT_LIMIT),
    String(EXA_MCP_API_KEY_HEADER),
    String(EXA_MCP_LOCAL_API_KEY_ENV),
    EXA_MCP_DOCS_URL,
    EXA_MCP_DOCS_MARKDOWN_URL,
    EXA_MCP_GITHUB_URL,
    EXA_MCP_DASHBOARD_URL,
    EXA_SEARCH_API_ENDPOINT,
    EXA_SEARCH_API_CODING_AGENT_REQUEST_JSON,
    EXA_SEARCH_API_INVOCATION_TEXT,
    EXA_SEARCH_API_DOCS_URL,
    'restart_mcp_client_after_config_change',
    'Open Exa MCP Docs',
    'Open FloatingPanel Chat UI',
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include Exa MCP config token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  ;[
    'YOUR_EXA_API_KEY',
    'your_api_key',
    'exaApiKey=',
    'sk_test_',
    'sk_live_',
  ].forEach(token => {
    if (searchableText.includes(token)) {
      throw new Error(`expected Exa MCP surface to avoid embedded secret examples ${JSON.stringify(token)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-exa-'))) {
    throw new Error(`expected Exa MCP rows to use Exa MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export function assertMcpHubSurfacesMoomooMarketMcpConfig(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'Moomoo Market Data MCP Configuration',
    'moomooMarketMcp.server_key',
    'moomooMarketMcp.remote.url',
    'moomooMarketMcp.tool_profile',
    'moomooMarketMcp.enabled_tools',
    'moomooMarketMcp.connection.mode',
    'moomooMarketMcp.startup_timeout_ms',
    'moomooMarketMcp.max_rows',
    'moomooMarketMcp.require_tool_review',
    'moomooMarketMcp.auth_boundary',
    'moomooMarketMcp.connected_status',
    'moomooMarketMcp.read_only_boundary',
    'moomooMarketMcp.write_tools_excluded',
    'moomooMarketMcp.openapi.url',
    'moomooMarketMcp.remote_config.codex',
    'moomooMarketMcp.remote_config.generic',
    'moomooMarketMcp.troubleshooting.restart',
    'quote_stock_quote',
    'quote_cur_kline',
    'quote_order_book',
    'quote_rt_ticker',
    'mcpServers',
    `codex mcp add ${MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY} --url '${MOOMOO_MARKET_MCP_REMOTE_URL}'`,
    MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY,
    MOOMOO_MARKET_MCP_REMOTE_URL,
    MOOMOO_MARKET_MCP_DEFAULT_ENABLED_TOOLS_JSON,
    MOOMOO_MARKET_MCP_WRITE_TOOLS_JSON,
    MOOMOO_MARKET_MCP_DEFAULT_CONNECTION_MODE,
    String(MOOMOO_MARKET_MCP_DEFAULT_STARTUP_TIMEOUT_MS),
    String(MOOMOO_MARKET_MCP_DEFAULT_MAX_ROWS),
    MOOMOO_MARKET_MCP_AUTH_HEADER,
    MOOMOO_MARKET_MCP_OPENAPI_URL,
    MOOMOO_MARKET_MCP_CONNECTED_STATUS,
    MOOMOO_MARKET_MCP_READ_ONLY_BOUNDARY,
    'restart_mcp_client_after_config_change',
    'Open Moomoo OpenAPI Docs',
    'Open FloatingPanel Chat UI',
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include Moomoo Market MCP config token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  ;[
    'YOUR_MOOMOO_API_KEY',
    'your_api_key',
    'access_token=',
    'refresh_token=',
    'Bearer ey',
    'moomooApiKey=',
    'sk_test_',
    'sk_live_',
  ].forEach(token => {
    if (searchableText.includes(token)) {
      throw new Error(`expected Moomoo Market MCP surface to avoid embedded secret examples ${JSON.stringify(token)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-moomoo-market-'))) {
    throw new Error(`expected Moomoo Market MCP rows to use Moomoo Market MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export function assertMcpHubSurfacesCloudflareAiGatewayMcpConfig(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'Cloudflare AI Gateway MCP Configuration',
    'cloudflareAiGatewayMcp.server_key',
    'cloudflareAiGatewayMcp.remote.url',
    'cloudflareAiGatewayMcp.transport.primary',
    'cloudflareAiGatewayMcp.account.header',
    'cloudflareAiGatewayMcp.gateway.universal_endpoint',
    'cloudflareAiGatewayMcp.gateway.openai_endpoint',
    'cloudflareAiGatewayMcp.capability.dynamic_routing',
    'cloudflareAiGatewayMcp.capability.caching',
    'cloudflareAiGatewayMcp.capability.observability',
    'cloudflareAiGatewayMcp.capability.controls',
    'cloudflareAiGatewayMcp.tool.list_gateways',
    'cloudflareAiGatewayMcp.tool.list_logs',
    'cloudflareAiGatewayMcp.tool.get_log_details',
    'cloudflareAiGatewayMcp.tool.get_log_request_body',
    'cloudflareAiGatewayMcp.tool.get_log_response_body',
    'cloudflareAiGatewayMcp.remote_config.generic',
    'cloudflareAiGatewayMcp.readiness_manifest',
    'cloudflareAiGatewayMcp.docs.product_url',
    'cloudflareAiGatewayMcp.docs.api_url',
    'cloudflareAiGatewayMcp.docs.mcp_server_repo',
    'cloudflareAiGatewayMcp.docs.ai_gateway_mcp_repo',
    CLOUDFLARE_AI_GATEWAY_MCP_SERVER_KEY,
    CLOUDFLARE_AI_GATEWAY_MCP_REMOTE_URL,
    CLOUDFLARE_AI_GATEWAY_ACCOUNT_HEADER,
    CLOUDFLARE_AI_GATEWAY_UNIVERSAL_ENDPOINT,
    CLOUDFLARE_AI_GATEWAY_OPENAI_ENDPOINT,
    CLOUDFLARE_AI_GATEWAY_PRODUCT_URL,
    CLOUDFLARE_AI_GATEWAY_MCP_DOCS_URL,
    CLOUDFLARE_MCP_SERVER_GITHUB_URL,
    CLOUDFLARE_AI_GATEWAY_MCP_GITHUB_URL,
    'streamable-http /mcp',
    'dynamic routing with provider fallbacks',
    'response caching',
    'logs, metrics, usage analytics, evaluations',
    'rate limiting and safety guardrails',
    'Open Cloudflare AI Gateway Docs',
    'Open FloatingPanel Chat UI',
    ...CLOUDFLARE_AI_GATEWAY_MCP_TOOL_NAMES,
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include Cloudflare AI Gateway MCP config token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  ;[
    'CLOUDFLARE_API_TOKEN=',
    'Authorization: Bearer',
    'sk-',
    'YOUR_CLOUDFLARE_API_TOKEN',
    'YOUR_OPENAI_API_KEY',
    '170e89fdb8679ff2fcc2900e25ed04f4',
  ].forEach(token => {
    if (searchableText.includes(token)) {
      throw new Error(`expected Cloudflare AI Gateway MCP surface to avoid embedded secret/account token ${JSON.stringify(token)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-cloudflare-ai-gateway-'))) {
    throw new Error(`expected Cloudflare AI Gateway MCP rows to use Cloudflare MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export function assertMcpHubSurfacesFeishuBaseMcpConfig(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  const feishuSearchableText = Array.from(
    container.querySelectorAll<HTMLElement>('[data-kg-anchor^="mcp-row-feishu-base-"]'),
    row => `${row.textContent || ''}\n${readRenderedFormValues(row)}`,
  ).join('\n')
  ;[
    'Feishu Base MCP Configuration',
    'feishuBaseMcp.server_key',
    'feishuBaseMcp.connection.mode',
    'feishuBaseMcp.auth_boundary',
    'feishuBaseMcp.phase',
    'feishuBaseMcp.phase_2_status',
    'feishuBaseMcp.phase_3_status',
    'feishuBaseMcp.skill.route',
    'feishuBaseMcp.docs.url',
    'feishuBaseMcp.operator_guidance',
    'feishuBaseMcp.phase_scope',
    'feishuBaseMcp.troubleshooting',
    FEISHU_BASE_MCP_DEFAULT_SERVER_KEY,
    FEISHU_BASE_MCP_DEFAULT_CONNECTION_MODE,
    FEISHU_BASE_MCP_DEFAULT_AUTH_BOUNDARY,
    FEISHU_BASE_MCP_DEFAULT_PHASE,
    FEISHU_BASE_MCP_PHASE_2_STATUS,
    FEISHU_BASE_MCP_PHASE_3_STATUS,
    FEISHU_BASE_MCP_SKILL_ROUTE,
    FEISHU_BASE_MCP_DOCS_URL,
    FEISHU_BASE_MCP_OPERATOR_GUIDANCE,
    FEISHU_BASE_MCP_PHASE_SCOPE,
    FEISHU_BASE_MCP_TROUBLESHOOTING,
    'Open Feishu Base Docs',
    'Open FloatingPanel Chat UI',
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include Feishu Base MCP config token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  ;[
    'tenant_access_token',
    'app_secret',
    'appSecret=',
    'app_id',
    'direct graph mutation',
    'implemented source adapter',
    'implemented publish target',
  ].forEach(token => {
    if (feishuSearchableText.includes(token)) {
      throw new Error(`expected Feishu Base MCP surface to avoid forbidden token ${JSON.stringify(token)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-feishu-base-'))) {
    throw new Error(`expected Feishu Base MCP rows to use Feishu Base MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export function assertMcpHubSurfacesLarkAppMcpConfig(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'Lark App MCP to Canvas',
    'larkAppMcp.server_key',
    'larkAppMcp.remote.url',
    'larkAppMcp.transport.type',
    'larkAppMcp.lark_app.baseinfo_url',
    'larkAppMcp.lark_app.webpage_url',
    'larkAppMcp.canvas.surface',
    'larkAppMcp.import.command',
    'larkAppMcp.handoff.query_param',
    'larkAppMcp.handoff.review_query_example',
    'larkAppMcp.webpage.surface_role',
    'larkAppMcp.phase_1_status',
    'larkAppMcp.phase_2_status',
    'larkAppMcp.phase_3_status',
    'larkAppMcp.remote_mutation.bridge_kind',
    'larkAppMcp.remote_mutation.auth_mode',
    'larkAppMcp.remote_mutation.idempotency',
    'larkAppMcp.remote_mutation.conflict_policy',
    'larkAppMcp.remote_mutation.audit',
    'larkAppMcp.remote_mutation.scope',
    'larkAppMcp.remote_mutation.runtime_command',
    'larkAppMcp.remote_mutation.supported_runtime_action',
    'larkAppMcp.remote_mutation.supported_dry_run_action',
    'larkAppMcp.remote_mutation.preview_status',
    'larkAppMcp.remote_mutation.preview_metadata',
    'larkAppMcp.remote_mutation.preview_readiness',
    'larkAppMcp.remote_mutation.preview_blocking_reason',
    'larkAppMcp.remote_mutation.preview_manifest',
    'larkAppMcp.remote_mutation.preview_manifest_kind',
    'larkAppMcp.remote_mutation.preview_summary',
    'larkAppMcp.remote_mutation.preview_severity',
    'larkAppMcp.remote_mutation.preview_checklist',
    'larkAppMcp.remote_mutation.preview_remediation_hint',
    'larkAppMcp.remote_mutation.preview_retry_disposition',
    'larkAppMcp.remote_mutation.preview_required_host_capability',
    'larkAppMcp.remote_mutation.preview_required_host_capability_status',
    'larkAppMcp.remote_mutation.preview_required_host_capability_verification_method',
    'larkAppMcp.remote_mutation.preview_required_host_capability_verification_target',
    'larkAppMcp.remote_mutation.preview_required_host_capability_verification_evidence',
    'larkAppMcp.remote_mutation.preview_required_host_capability_owner',
    'larkAppMcp.remote_mutation.preview_next_step',
    'larkAppMcp.remote_mutation.deferred_action',
    'larkAppMcp.remote_mutation.request_example',
    'larkAppMcp.remote_mutation.preview_result_example',
    'larkAppMcp.auth_boundary',
    'larkAppMcp.remote_config.generic',
    'larkAppMcp.operator_guidance',
    'larkAppMcp.phase_scope',
    'larkAppMcp.troubleshooting',
    LARK_APP_MCP_DEFAULT_SERVER_KEY,
    LARK_APP_MCP_DEPLOYED_URL,
    LARK_APP_MCP_TRANSPORT_TYPE,
    LARK_APP_MCP_BASEINFO_URL,
    LARK_APP_MCP_WEBPAGE_URL,
    LARK_APP_MCP_CANVAS_SURFACE,
    LARK_APP_MCP_IMPORT_COMMAND,
    QUERY_PARAM_LARK_HANDOFF,
    'webpage launch-or-config only',
    LARK_APP_MCP_PHASE_1_STATUS,
    LARK_APP_MCP_PHASE_2_STATUS,
    LARK_APP_MCP_PHASE_3_STATUS,
    LARK_APP_MCP_REMOTE_MUTATION_BRIDGE_KIND,
    LARK_APP_MCP_REMOTE_MUTATION_AUTH_MODE,
    LARK_APP_MCP_REMOTE_MUTATION_IDEMPOTENCY,
    LARK_APP_MCP_REMOTE_MUTATION_CONFLICT_POLICY,
    LARK_APP_MCP_REMOTE_MUTATION_AUDIT,
    LARK_APP_MCP_REMOTE_MUTATION_SCOPE,
    LARK_APP_MCP_REMOTE_MUTATION_RUNTIME_COMMAND,
    LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_RUNTIME_ACTION,
    LARK_APP_MCP_REMOTE_MUTATION_SUPPORTED_DRY_RUN_ACTION,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_STATUS,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_METADATA,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_READINESS,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_BLOCKING_REASON,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST_KIND,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SUMMARY,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_SEVERITY,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_CHECKLIST,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_REMEDIATION_HINT,
    LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_NEXT_STEP,
    LARK_APP_MCP_REMOTE_MUTATION_DEFERRED_ACTION,
    LARK_APP_MCP_AUTH_BOUNDARY,
    LARK_APP_MCP_OPERATOR_GUIDANCE,
    LARK_APP_MCP_PHASE_SCOPE,
    LARK_APP_MCP_TROUBLESHOOTING,
    LARK_APP_MCP_DOCS_URL,
    'Open Lark Platform Docs',
    'Open FloatingPanel Chat UI',
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include Lark App MCP config token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  ;[
    `/${'Users'}/`,
    'tenant_access_token',
    'app_secret',
    'https://example.com/write',
  ].forEach(token => {
    if (searchableText.includes(token)) {
      throw new Error(`expected Lark App MCP surface to avoid forbidden token ${JSON.stringify(token)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-lark-app-'))) {
    throw new Error(`expected Lark App MCP rows to use Lark App MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export function assertMcpHubSurfacesVideodbMcpConfig(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'VideoDB Director MCP',
    'videodb.mcp.server_key',
    'videodb.mcp.uvx.command',
    'videodb.mcp.pipx.command',
    'videodb.mcp.package',
    'videodb.mcp.python.prerequisite',
    'videodb.mcp.api.base_url',
    'videodb.mcp.credential.env',
    'videodb.mcp.credential.placeholder',
    'videodb.mcp.tool.core',
    'videodb.mcp.tool.search',
    'videodb.mcp.tool.index',
    'videodb.mcp.tool.stream',
    'videodb.mcp.tool.transcript',
    'videodb.mcp.tool.ai_generation',
    'videodb.mcp.tool.async',
    'videodb.mcp.tool.confirmation_required',
    'videodb.mcp.async.circuit_breaker',
    'videodb.mcp.config.uvx',
    'videodb.mcp.config.pipx',
    'videodb.mcp.command.claude_code',
    'videodb.mcp.publish.packet_schema',
    'mcpServers',
    VIDEODB_MCP_SERVER_KEY,
    VIDEODB_MCP_PACKAGE,
    VIDEODB_MCP_UVX_COMMAND,
    VIDEODB_MCP_CREDENTIAL_ENV,
    VIDEODB_MCP_CREDENTIAL_PLACEHOLDER,
    VIDEODB_MCP_DOCS_URL,
    `${VIDEODB_MCP_POLL_MAX_ITERATIONS} x ${VIDEODB_MCP_POLL_INTERVAL_MS}ms`,
    'upload_video',
    'get_async_response',
    'index_video',
    'search_videos',
    'stream_video',
    'human confirmation',
    'Open VideoDB MCP Docs',
    'Open FloatingPanel Chat UI',
    ...VIDEODB_MCP_AI_TOOLS,
  ].forEach(token => {
    if (!searchableText.includes(String(token))) {
      throw new Error(`expected MCP hub to include VideoDB MCP token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  ;[
    'sk_',
    'vdb_live_',
    'vdb_test_',
    'YOUR_VIDEODB_API_KEY',
    'your_api_key',
    'stream.videodb.io',
    'job-upload-',
    'job-index-',
    'job-generation-',
  ].forEach(token => {
    if (searchableText.includes(token)) {
      throw new Error(`expected VideoDB MCP surface to avoid secret or fabricated runtime token ${JSON.stringify(token)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-videodb-'))) {
    throw new Error(`expected VideoDB MCP rows to use VideoDB MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}
