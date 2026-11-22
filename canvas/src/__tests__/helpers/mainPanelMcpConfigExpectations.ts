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
  AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS,
  AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  buildAgenticGraphStorageLlmsPath,
  buildAgenticGraphStorageSourceFilesIndexPath,
  CLOUDFLARE_PAY_PER_CRAWL_DOC_URL,
  CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS,
  CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  SETTINGS_DEFAULT_KTV_HEADER_LABELS,
  SETTINGS_MCP_KTV_HEADER_LABELS,
} from '@/features/panels/views/settingsView.constants'
import {
  assertMcpValueCellControl,
  readRenderedFormValues,
} from './mainPanelMcpExpectationUtils'

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
    ['openaiMcp.transport', 'button[data-kg-select]'],
    ['openaiMcp.allowed_tools', 'textarea'],
    ['openaiMcp.require_approval', 'input'],
    ['openaiMcp.responses_model', 'input'],
    ['openaiMcp.auth_mode', 'button[data-kg-select]'],
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
    'AGENTIC_OS_BROWSER_API_RUNTIME_URL',
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
  const defaultIndexPath = buildAgenticGraphStorageSourceFilesIndexPath(AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID)
  const defaultLlmsPath = buildAgenticGraphStorageLlmsPath(AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID)
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
    AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
    AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndex,
    AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndexPrefix,
    AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesLlms,
    AGENTIC_OS_STORAGE_ROUTE_PATHS.defaultDocPrefix,
    AGENTIC_OS_STORAGE_ROUTE_PATHS.docPrefix,
    AGENTIC_OS_STORAGE_ROUTE_PATHS.exportPrefix,
    defaultIndexPath,
    defaultLlmsPath,
    AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS.source,
    AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS.payPerCrawlPolicy,
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
