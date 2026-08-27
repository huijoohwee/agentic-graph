import {
  API_NATIVE_BROWSER_DEFAULT_MCP_COMMAND,
  API_NATIVE_BROWSER_DEFAULT_MCP_PACKAGE,
  API_NATIVE_BROWSER_DEFAULT_MCP_SERVER_KEY,
  API_NATIVE_BROWSER_DEFAULT_MCP_STARTUP_TIMEOUT_MS,
  API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL,
} from 'grph-shared/browser/apiNativeBrowserMcpSsot'
import {
  GRABMAPS_DEFAULT_MCP_AUTH_HEADER_ARG,
  GRABMAPS_DEFAULT_MCP_COMMAND,
  GRABMAPS_DEFAULT_MCP_PACKAGE,
  GRABMAPS_DEFAULT_MCP_SERVER_KEY,
  GRABMAPS_DEFAULT_MCP_STARTUP_TIMEOUT_MS,
  GRABMAPS_DEFAULT_MCP_URL,
} from 'grph-shared/geospatial/grabMapsSsot'
import {
  STRIPE_MCP_DEFAULT_LOCAL_COMMAND,
  STRIPE_MCP_DEFAULT_LOCAL_PACKAGE,
  STRIPE_MCP_DEFAULT_SERVER_KEY,
  STRIPE_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
  STRIPE_MCP_PAYMENT_READINESS_POLICY,
  STRIPE_MCP_PAYMENT_TOOL_NAMES,
  STRIPE_MCP_REGISTRY_URL,
  STRIPE_MCP_REMOTE_URL,
  STRIPE_MCP_RESTRICTED_KEY_ENV_REF,
  STRIPE_MCP_SECRET_ENV_KEY,
} from 'grph-shared/payments/stripeMcpSsot'
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
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_MANIFEST_KIND,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_CHECKLIST,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_METADATA,
  LARK_APP_MCP_REMOTE_MUTATION_PREVIEW_NEXT_STEP,
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
import {
  OPENAI_MCP_CHATGPT_CONNECT_URL,
  OPENAI_MCP_DEFAULT_ALLOWED_TOOLS_JSON,
  OPENAI_MCP_DEFAULT_API_KEY_ENV,
  OPENAI_MCP_DEFAULT_AUTH_MODE,
  OPENAI_MCP_DEFAULT_REQUIRE_APPROVAL,
  OPENAI_MCP_DEFAULT_RESPONSES_MODEL,
  OPENAI_MCP_DEFAULT_SERVER_LABEL,
  OPENAI_MCP_DEFAULT_SERVER_PORT,
  OPENAI_MCP_DEFAULT_SERVER_URL,
  OPENAI_MCP_DEFAULT_TRANSPORT,
  OPENAI_MCP_DEFAULT_VECTOR_STORE_ENV,
  OPENAI_MCP_DOCS_URL,
} from 'grph-shared/openai/openaiMcpSsot'
import {
  CLOUDFLARE_PAY_PER_CRAWL_DOC_URL,
  CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS,
  CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS,
  AGENTICGRAPH_STORAGE_CRAWLER_ACCESS_HEADERS,
  AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  AGENTICGRAPH_STORAGE_ROUTE_PATHS,
  buildAgenticGraphStorageLlmsPath,
  buildAgenticGraphStorageSourceFilesIndexPath,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import {
  SETTINGS_DEFAULT_KTV_HEADER_LABELS,
  SETTINGS_MCP_KTV_HEADER_LABELS,
} from '@/features/panels/views/settingsView.constants'
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

const readRenderedFormValues = (container: Element): string => (
  Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'))
    .map(el => el.value)
    .join('\n')
)

const findKtvValueCell = (container: Element, key: string): HTMLElement => {
  const rows = Array.from(container.querySelectorAll('dl')) as HTMLElement[]
  const row = rows.find(item => item.children[0]?.textContent?.includes(key))
  if (!row) {
    throw new Error(`expected MCP hub to render KTV row ${JSON.stringify(key)}, got ${JSON.stringify(container.textContent || '')}`)
  }
  const valueCell = row.children[2] as HTMLElement | undefined
  if (!valueCell) {
    throw new Error(`expected MCP hub KTV row ${JSON.stringify(key)} to include a configurable Value cell`)
  }
  return valueCell
}

const assertMcpValueCellControl = (container: Element, key: string, selector: string): void => {
  const valueCell = findKtvValueCell(container, key)
  if (!valueCell.querySelector(selector)) {
    throw new Error(`expected MCP hub KTV row ${JSON.stringify(key)} Value cell to render configurable control ${JSON.stringify(selector)}, got ${JSON.stringify(valueCell.textContent || '')}`)
  }
}

export function assertMcpHubRendersConfigurableValueControls(container: Element): void {
  ;[
    ['grabmapsMcp.server_key', 'input'],
    ['grabmapsMcp.args', 'textarea'],
    ['grabmapsMcp.startup_timeout_ms', 'input[type="number"]'],
    ['browserMcp.server_key', 'input'],
    ['browserMcp.args', 'textarea'],
    ['browserMcp.dry_run', 'input[type="checkbox"]'],
    ['browserMcp.agent_config', 'textarea'],
    ['openaiMcp.server_label', 'input'],
    ['openaiMcp.server_url', 'input'],
    ['openaiMcp.transport', 'select'],
    ['openaiMcp.allowed_tools', 'textarea'],
    ['openaiMcp.require_approval', 'input'],
    ['openaiMcp.responses_model', 'input'],
    ['openaiMcp.auth_mode', 'select'],
    ['openaiMcp.api_key_env', 'input'],
    ['openaiMcp.vector_store_env', 'input'],
    ['openaiMcp.server_port', 'input[type="number"]'],
    ['openaiMcp.require_tool_review', 'input[type="checkbox"]'],
    ['openaiMcp.responses_api_tool_config', 'textarea'],
    ['openaiMcp.responses_api_request', 'textarea'],
    ['openaiMcp.chatgpt_app_connection', 'textarea'],
    ['exaMcp.enabled_tools', 'textarea'],
    ['exaMcp.require_fetch_review', 'input[type="checkbox"]'],
    ['feishuBaseMcp.server_key', 'input'],
    ['feishuBaseMcp.connection.mode', 'input'],
    ['feishuBaseMcp.auth_boundary', 'input'],
    ['feishuBaseMcp.phase', 'input'],
    ['feishuBaseMcp.phase_2_status', 'input'],
    ['feishuBaseMcp.phase_3_status', 'input'],
    ['feishuBaseMcp.docs.url', 'input'],
    ['stripeMcp.local.args', 'textarea'],
    ['stripeMcp.tool.confirmation_required', 'input[type="checkbox"]'],
    ['stripeMcp.local_config', 'textarea'],
  ].forEach(([key, selector]) => {
    assertMcpValueCellControl(container, key, selector)
  })
}

export function assertMcpHubMaintainsKeyTypeValueHeader(container: Element): void {
  const header = container.querySelector('header')
  if (!header) {
    throw new Error('expected MCP hub to render a KTV header')
  }
  const text = header.textContent || ''
  const forbiddenCombinedHeaderLabel = ['KeyType', 'Config'].join('')
  if (SETTINGS_MCP_KTV_HEADER_LABELS.valueLabel !== SETTINGS_DEFAULT_KTV_HEADER_LABELS.valueLabel) {
    throw new Error(`expected MCP hub to maintain the shared KTV Value label, got ${JSON.stringify(SETTINGS_MCP_KTV_HEADER_LABELS.valueLabel)}`)
  }
  ;[
    SETTINGS_MCP_KTV_HEADER_LABELS.keyLabel,
    SETTINGS_MCP_KTV_HEADER_LABELS.typeLabel,
    SETTINGS_MCP_KTV_HEADER_LABELS.valueLabel,
  ].forEach(token => {
    if (!text.includes(token)) {
      throw new Error(`expected MCP hub KTV header to include configured label ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
  if (text.includes(forbiddenCombinedHeaderLabel) || /\bConfig\b/.test(text)) {
    throw new Error(`expected MCP hub KTV header to remain KeyTypeValue, got ${JSON.stringify(text)}`)
  }
}
export { assertExternalMcpBridgeIdsAreRuntimeExecutable } from './mainPanelMcpExternalBridgeExpectations'
export function assertMapsHubOmitsGrabMapsMcpConfig(text: string): void {
  ;[
    'grabmaps.mcp.url',
    'grabmaps.mcp.discovery.chat_model',
    'grabmaps.mcp.search_places.query',
    'grabmapsMcp.server_key',
    GRABMAPS_DEFAULT_MCP_SERVER_KEY,
    GRABMAPS_DEFAULT_MCP_URL,
  ].forEach(token => {
    if (text.includes(token)) {
      throw new Error(`expected maps hub MCP guidance to move out of maps tab ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
}

export function assertMcpHubSurfacesGrabMapsMcpConfig(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'maps.grabmaps.mcp.url',
    'grabmaps.mcp.url',
    'grabmapsMcp.server_key',
    'grabmapsMcp.command',
    'grabmapsMcp.args',
    'grabmapsMcp.env',
    'grabmapsMcp.startup_timeout_ms',
    GRABMAPS_DEFAULT_MCP_SERVER_KEY,
    GRABMAPS_DEFAULT_MCP_COMMAND,
    GRABMAPS_DEFAULT_MCP_PACKAGE,
    GRABMAPS_DEFAULT_MCP_URL,
    GRABMAPS_DEFAULT_MCP_AUTH_HEADER_ARG,
    String(GRABMAPS_DEFAULT_MCP_STARTUP_TIMEOUT_MS),
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include MCP server guidance/config ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-'))) {
    throw new Error(`expected MCP hub rows to use MCP-owned anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
  if (mcpAnchors.some(anchor => anchor.startsWith('maps-row-grabmaps-mcp'))) {
    throw new Error(`expected MCP hub to avoid Maps-owned anchors for MCP rows, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export function assertMcpHubSurfacesApiNativeBrowserMcpConfig(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'browserMcp.server_key',
    'browserMcp.command',
    'browserMcp.args',
    'browserMcp.env',
    'browserMcp.runtime_url',
    'browserMcp.default_intent',
    'browserMcp.target_url',
    'browserMcp.dry_run',
    'browserMcp.confirm_unsafe',
    'browserMcp.confirm_third_party_terms',
    'browserMcp.confirm_cookie_import',
    'browserMcp.agent_config',
    'browserMcp.bridge_config',
    'mcpServers',
    'UNBROWSE_URL',
    'AGENTICGRAPH_BROWSER_API_RUNTIME_URL',
    'native browser actions',
    API_NATIVE_BROWSER_DEFAULT_MCP_SERVER_KEY,
    API_NATIVE_BROWSER_DEFAULT_MCP_COMMAND,
    API_NATIVE_BROWSER_DEFAULT_MCP_PACKAGE,
    API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL,
    String(API_NATIVE_BROWSER_DEFAULT_MCP_STARTUP_TIMEOUT_MS),
    'Route cache, native browser actions, loopback runtime URL, dry-run, unsafe-action, third-party terms, and cookie-import confirmation stay configurable in MainPanel MCP.',
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include API-native browser MCP config ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-browser-'))) {
    throw new Error(`expected API-native browser MCP rows to use browser MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export function assertMcpHubSurfacesOpenAiMcpConfig(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'OpenAI MCP Server Configuration',
    'openaiMcp.server_label',
    'openaiMcp.server_url',
    'openaiMcp.transport',
    'openaiMcp.allowed_tools',
    'openaiMcp.require_approval',
    'openaiMcp.responses_model',
    'openaiMcp.auth_mode',
    'openaiMcp.api_key_env',
    'openaiMcp.vector_store_env',
    'openaiMcp.server_port',
    'openaiMcp.require_tool_review',
    'openaiMcp.responses_api_tool_config',
    'openaiMcp.responses_api_request',
    'openaiMcp.chatgpt_app_connection',
    'openaiMcp.safety.prompt_injection',
    'openaiMcp.safety.trusted_servers',
    'server_label',
    'server_url',
    'allowed_tools',
    'require_approval',
    'ChatGPT settings',
    'Apps & Connectors',
    'prompt_injection',
    OPENAI_MCP_DOCS_URL,
    OPENAI_MCP_CHATGPT_CONNECT_URL,
    OPENAI_MCP_DEFAULT_SERVER_LABEL,
    OPENAI_MCP_DEFAULT_SERVER_URL,
    OPENAI_MCP_DEFAULT_TRANSPORT,
    OPENAI_MCP_DEFAULT_ALLOWED_TOOLS_JSON,
    OPENAI_MCP_DEFAULT_REQUIRE_APPROVAL,
    OPENAI_MCP_DEFAULT_RESPONSES_MODEL,
    OPENAI_MCP_DEFAULT_AUTH_MODE,
    OPENAI_MCP_DEFAULT_API_KEY_ENV,
    OPENAI_MCP_DEFAULT_VECTOR_STORE_ENV,
    String(OPENAI_MCP_DEFAULT_SERVER_PORT),
    'Open OpenAI MCP Docs',
    'Open FloatingPanel Chat UI',
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include OpenAI MCP config token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  ;[
    'sk-',
    'YOUR_OPENAI_API_KEY',
    'your_api_key',
  ].forEach(token => {
    if (searchableText.includes(token)) {
      throw new Error(`expected OpenAI MCP surface to avoid embedded secret examples ${JSON.stringify(token)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-openai-'))) {
    throw new Error(`expected OpenAI MCP rows to use OpenAI MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export function assertMcpHubSurfacesStripeMcpPaymentReadiness(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  ;[
    'Stripe MCP Configuration',
    'stripeMcp.server_key',
    'stripeMcp.remote.url',
    'stripeMcp.remote.connection',
    'stripeMcp.local.command',
    'stripeMcp.local.args',
    'stripeMcp.startup_timeout_ms',
    'stripeMcp.tool.confirmation_required',
    'stripeMcp.payment_tools',
    'stripeMcp.remote_config',
    'stripeMcp.local_config',
    'stripeMcp.restricted_key_scope',
    'stripeMcp.accept_payment_ready',
    'stripeMcp.registry.url',
    STRIPE_MCP_DEFAULT_SERVER_KEY,
    STRIPE_MCP_REMOTE_URL,
    STRIPE_MCP_DEFAULT_LOCAL_COMMAND,
    STRIPE_MCP_DEFAULT_LOCAL_PACKAGE,
    STRIPE_MCP_SECRET_ENV_KEY,
    STRIPE_MCP_RESTRICTED_KEY_ENV_REF,
    STRIPE_MCP_REGISTRY_URL,
    String(STRIPE_MCP_DEFAULT_STARTUP_TIMEOUT_MS),
    ...STRIPE_MCP_PAYMENT_TOOL_NAMES,
    STRIPE_MCP_PAYMENT_READINESS_POLICY,
    'Open MainPanel Commerce',
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include Stripe MCP payment-readiness token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  ;['sk_test_', 'sk_live_', 'rk_test_', 'rk_live_'].forEach(token => {
    if (searchableText.includes(token)) {
      throw new Error(`expected Stripe MCP surface to avoid embedded secret key examples ${JSON.stringify(token)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-stripe-'))) {
    throw new Error(`expected Stripe MCP rows to use Stripe MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

export function assertMcpHubSurfacesCrawlerAccessAndPaymentReadiness(container: Element): void {
  const text = container.textContent || ''
  const searchableText = `${text}\n${readRenderedFormValues(container)}`
  const defaultIndexPath = buildAgenticGraphStorageSourceFilesIndexPath(AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID)
  const defaultLlmsPath = buildAgenticGraphStorageLlmsPath(AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID)
  ;[
    'Crawler Access MCP Configuration',
    'crawlerMcp.default_workspace_id',
    'crawlerMcp.route.source_files.index',
    'crawlerMcp.route.source_files.workspace_index',
    'crawlerMcp.route.llms.default',
    'crawlerMcp.route.llms.workspace',
    'crawlerMcp.route.doc_view.default',
    'crawlerMcp.route.doc_view',
    'crawlerMcp.headers.worker',
    'crawlerMcp.headers.cloudflare_pay_per_crawl',
    'crawlerMcp.policy.pay_per_crawl_boundary',
    'crawlerMcp.guard.read_only_source_files',
    'crawlerMcp.payment.handoff',
    'crawlerMcp.readiness_manifest',
    AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
    AGENTICGRAPH_STORAGE_ROUTE_PATHS.sourceFilesIndex,
    AGENTICGRAPH_STORAGE_ROUTE_PATHS.sourceFilesIndexPrefix,
    AGENTICGRAPH_STORAGE_ROUTE_PATHS.sourceFilesLlms,
    AGENTICGRAPH_STORAGE_ROUTE_PATHS.defaultDocPrefix,
    AGENTICGRAPH_STORAGE_ROUTE_PATHS.docPrefix,
    AGENTICGRAPH_STORAGE_ROUTE_PATHS.exportPrefix,
    defaultIndexPath,
    defaultLlmsPath,
    AGENTICGRAPH_STORAGE_CRAWLER_ACCESS_HEADERS.source,
    AGENTICGRAPH_STORAGE_CRAWLER_ACCESS_HEADERS.payPerCrawlPolicy,
    CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS.exactPrice,
    CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS.maxPrice,
    CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.price,
    CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.charged,
    CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.error,
    CLOUDFLARE_PAY_PER_CRAWL_DOC_URL,
    'Web Bot Auth',
    'cloudflare-zone-policy',
    'read-only Source Files',
    'D1 document rows',
    'doc-view URLs',
    'Pay Per Crawl',
    'accept payment',
    'Stripe MCP',
    'MainPanel Commerce',
  ].forEach(token => {
    if (!searchableText.includes(token)) {
      throw new Error(`expected MCP hub to include crawler/payment readiness token ${JSON.stringify(token)}, got ${JSON.stringify(searchableText)}`)
    }
  })
  ;[
    'Worker sets crawler-price',
    'Worker sets crawler-charged',
    'app-local crawler price',
  ].forEach(token => {
    if (searchableText.includes(token)) {
      throw new Error(`expected crawler MCP readiness to avoid app-local Pay Per Crawl emulation ${JSON.stringify(token)}`)
    }
  })
  const mcpAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-kg-anchor]'))
    .map(el => String(el.dataset.kgAnchor || ''))
    .filter(Boolean)
  if (!mcpAnchors.some(anchor => anchor.startsWith('mcp-row-crawler-'))) {
    throw new Error(`expected crawler MCP rows to use crawler MCP anchors, got ${JSON.stringify(mcpAnchors)}`)
  }
}

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
