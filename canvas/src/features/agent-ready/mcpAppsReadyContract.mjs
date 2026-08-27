import {
  AGENTICGRAPH_AGENT_READY_PROMPT_NAMES,
} from './agenticgraphAgentReadyPromptContract.mjs'
import { AGENTICGRAPH_SOURCE_FILE_RESOURCE_URI_TEMPLATE } from './agenticgraphAgentReadyResourceContract.mjs'
import {
  buildMcpOnboarding,
  buildMcpOnboardingHtml,
  MCP_ONBOARDING_CLIENT_SCRIPT,
} from './mcpAppsOnboarding.mjs'

export const AGENTICGRAPH_MCP_APPS_EXTENSION_ID = 'io.modelcontextprotocol/ui'
export const AGENTICGRAPH_MCP_APPS_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app'
export const AGENTICGRAPH_MCP_APPS_PROTOCOL_VERSION = '2026-01-26'
export const AGENTICGRAPH_MCP_APPS_SERVER_READINESS_SCHEMA_VERSION = 'agenticgraph-mcp-apps-server-readiness/v0.1'
export const AGENTICGRAPH_MCP_APP_RESOURCE_URI = 'ui://agenticgraph/agent-ready'
export const AGENTICGRAPH_MCP_APP_RESOURCE_NAME = 'agenticgraph-agent-ready'
export const AGENTICGRAPH_MCP_APP_TOOL_NAME = 'inspect_agent_surface'
export const AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES = Object.freeze(['search', 'fetch'])
export const AGENTICGRAPH_MCP_DEEP_RESEARCH_REQUIRED_OUTPUTS = Object.freeze({
  search: Object.freeze(['ids']),
  fetch: Object.freeze(['id', 'title', 'content', 'text']),
})
export const AGENTICGRAPH_MCP_REQUIRED_PROMPT_NAMES = Object.freeze(Object.values(AGENTICGRAPH_AGENT_READY_PROMPT_NAMES))
export const AGENTICGRAPH_MCP_REMOTE_TRANSPORT_TYPE = 'streamable-http'
export const AGENTICGRAPH_MCP_NOAUTH_SECURITY_SCHEMES = Object.freeze([Object.freeze({ type: 'noauth' })])
export const AGENTICGRAPH_MCP_CLIENT_IDS = Object.freeze({
  openAiApps: 'openai-apps',
  claude: 'claude-mcp-connector',
  qwenCode: 'qwen-code',
  kimiCli: 'kimi-cli',
  bytePlusModelArk: 'byteplus-modelark',
  generic: 'generic-mcp',
})

const normalizeString = (value) => String(value || '').trim()

const escapeHtml = (value) => normalizeString(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const safeJsonForInlineScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

const readUrlOrigin = (value) => {
  const source = normalizeString(value)
  if (!source) return ''
  try {
    return new URL(source).origin
  } catch {
    return ''
  }
}

const buildPublishedPromotionRecoveryContract = () => ({
  availability: 'template-only-published-contract',
  scope: 'mirror-saved-local-artifacts-only',
  commandTemplate: '#promotion.retry <path...>',
  exactCommandSource: 'browser-local finalize inspection after a real mirroring failure',
  reusesSavedLocalArtifacts: true,
  rerunsValidation: false,
  reappliesCanvas: false,
  githubBeforeStorage: true,
  insertionMode: 'append',
  surfaces: [
    'published-operator-card',
    'final-assistant-ledger',
    'browser-local-finalize-inspection',
    'warning-toast',
    'toast-insert-action',
  ],
  note: 'This published card shows the command template only. The exact runnable path-bearing command appears after a real mirroring failure in the browser-local finalize inspection, finalize ledger, and warning toast.',
})

const buildPromotionRecoveryHtml = (contract) => `<section aria-label="Promotion recovery">
  <section id="promotion-recovery" class="readiness">
    <strong>Promotion Recovery</strong>
    <p>${escapeHtml('Retry mirroring only for already-saved local artifacts. Do not regenerate, revalidate, or reapply Canvas.')}</p>
    <p>${escapeHtml(`Command template: ${contract.commandTemplate}`)}</p>
    <ul>
      <li>${escapeHtml(`Scope: ${contract.scope}`)}</li>
      <li>${escapeHtml(`Exact command source: ${contract.exactCommandSource}`)}</li>
      <li>${escapeHtml(`Insert mode: ${contract.insertionMode}`)}</li>
      <li>${escapeHtml(`GitHub before storage: ${contract.githubBeforeStorage ? 'true' : 'false'}`)}</li>
    </ul>
    <p>${escapeHtml(contract.note)}</p>
  </section>
</section>`

export const buildAgenticGraphMcpAppsCapabilities = () => ({
  extensions: {
    [AGENTICGRAPH_MCP_APPS_EXTENSION_ID]: {
      mimeTypes: [AGENTICGRAPH_MCP_APPS_RESOURCE_MIME_TYPE],
    },
  },
})

const arrayFrom = (value) => Array.isArray(value) ? value : []
export const buildAgenticGraphMcpNoauthSecuritySchemes = () =>
  AGENTICGRAPH_MCP_NOAUTH_SECURITY_SCHEMES.map((scheme) => ({ ...scheme }))

const normalizeSecuritySchemes = (value) => {
  const schemes = Array.isArray(value) && value.length ? value : buildAgenticGraphMcpNoauthSecuritySchemes()
  return schemes
    .filter((scheme) => scheme && typeof scheme === 'object')
    .map((scheme) => ({ ...scheme }))
}

const hasNoauthSecurityScheme = (value) =>
  arrayFrom(value).some((scheme) => scheme?.type === 'noauth')
const readSecuritySchemes = (value) =>
  Array.isArray(value) ? normalizeSecuritySchemes(value) : []
const hasOpenAiWidgetBridgeHtml = (value) => {
  const html = normalizeString(value)
  return html.includes('window.openai')
    && html.includes('openai:set_globals')
    && html.includes('toolInput')
    && html.includes('toolOutput')
    && html.includes('callTool')
    && html.includes("request('ui/initialize'")
}

const hasToolOutputSchemaFields = (tool, requiredFields = []) =>
  tool?.outputSchema?.type === 'object'
  && requiredFields.every((field) => arrayFrom(tool.outputSchema?.required).includes(field))

const hasReadOnlyToolAnnotations = (tool) =>
  tool?.annotations?.readOnlyHint === true
  && tool?.annotations?.destructiveHint === false
  && tool?.annotations?.openWorldHint === false
  && tool?.annotations?.idempotentHint === true

const booleanCheck = (id, label, ok, evidence = []) => ({
  id,
  label,
  ok: ok === true,
  evidence: arrayFrom(evidence).map(normalizeString).filter(Boolean),
})

export const buildAgenticGraphMcpClientSetups = (args = {}) => {
  const baseUrl = normalizeString(args.baseUrl).replace(/\/+$/, '')
  const serverName = normalizeString(args.serverName) || 'agenticgraph'
  const mcpUrl = normalizeString(args.mcpUrl) || (baseUrl ? `${baseUrl}/mcp` : '')
  return {
    [AGENTICGRAPH_MCP_CLIENT_IDS.openAiApps]: {
      id: AGENTICGRAPH_MCP_CLIENT_IDS.openAiApps,
      label: 'OpenAI Apps / ChatGPT',
      transport: AGENTICGRAPH_MCP_REMOTE_TRANSPORT_TYPE,
      url: mcpUrl,
      appResourceUri: AGENTICGRAPH_MCP_APP_RESOURCE_URI,
      appToolName: AGENTICGRAPH_MCP_APP_TOOL_NAME,
      requiredMetadata: ['openai/outputTemplate', 'openai/widgetAccessible', 'openai/widgetCSP', 'openai/widgetDomain'],
      requiredTools: [AGENTICGRAPH_MCP_APP_TOOL_NAME, ...AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES],
    },
    [AGENTICGRAPH_MCP_CLIENT_IDS.claude]: {
      id: AGENTICGRAPH_MCP_CLIENT_IDS.claude,
      label: 'Claude MCP connector',
      transport: AGENTICGRAPH_MCP_REMOTE_TRANSPORT_TYPE,
      url: mcpUrl,
      beta: 'mcp-client-2025-11-20',
      mcp_servers: [{
        type: 'url',
        url: mcpUrl,
        name: serverName,
      }],
      tools: [{
        type: 'mcp_toolset',
        mcp_server_name: serverName,
      }],
      requiredTools: AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES,
    },
    [AGENTICGRAPH_MCP_CLIENT_IDS.qwenCode]: {
      id: AGENTICGRAPH_MCP_CLIENT_IDS.qwenCode,
      label: 'Qwen Code',
      transport: 'http',
      url: mcpUrl,
      command: `qwen mcp add --transport http ${serverName} ${mcpUrl}`,
      settingsJson: {
        mcpServers: {
          [serverName]: {
            httpUrl: mcpUrl,
            timeout: 30000,
            trust: false,
            includeTools: ['search', 'fetch', AGENTICGRAPH_MCP_APP_TOOL_NAME],
          },
        },
      },
      requiredTools: AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES,
      primaryFlow: 'Call search with a natural-language query, then call fetch with the returned kgdoc id.',
    },
    [AGENTICGRAPH_MCP_CLIENT_IDS.kimiCli]: {
      id: AGENTICGRAPH_MCP_CLIENT_IDS.kimiCli,
      label: 'Kimi CLI',
      transport: 'http',
      url: mcpUrl,
      command: `kimi mcp add --transport http ${serverName} ${mcpUrl}`,
      configFile: '~/.kimi/mcp.json',
      mcpJson: {
        mcpServers: {
          [serverName]: {
            url: mcpUrl,
            transport: 'http',
          },
        },
      },
      requiredTools: AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES,
      primaryFlow: 'Call search with a natural-language query, then call fetch with the returned kgdoc id.',
    },
    [AGENTICGRAPH_MCP_CLIENT_IDS.bytePlusModelArk]: {
      id: AGENTICGRAPH_MCP_CLIENT_IDS.bytePlusModelArk,
      label: 'BytePlus ModelArk Responses API',
      transport: AGENTICGRAPH_MCP_REMOTE_TRANSPORT_TYPE,
      url: mcpUrl,
      apiBaseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
      endpoint: '/responses',
      requiredHeaders: {
        'ark-beta-mcp': 'true',
      },
      tools: [{
        type: 'mcp',
        server_label: serverName,
        server_url: mcpUrl,
        require_approval: 'never',
      }],
      openAiCompatible: {
        base_url: 'https://ark.ap-southeast.bytepluses.com/api/v3',
        default_headers: {
          'ark-beta-mcp': 'true',
        },
        responsesCreate: {
          model: '<MODELARK_MODEL_OR_ENDPOINT_ID>',
          tools: [{
            type: 'mcp',
            server_label: serverName,
            server_url: mcpUrl,
            require_approval: 'never',
          }],
        },
      },
      invocationScope: 'ModelArk Responses API with MCP service and model permissions enabled.',
      requiredTools: AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES,
      primaryFlow: 'Use ModelArk Responses API with the AgenticGraph MCP tool entry, then ask the model to call search and fetch.',
    },
    [AGENTICGRAPH_MCP_CLIENT_IDS.generic]: {
      id: AGENTICGRAPH_MCP_CLIENT_IDS.generic,
      label: 'Generic MCP clients',
      transport: AGENTICGRAPH_MCP_REMOTE_TRANSPORT_TYPE,
      url: mcpUrl,
      initialize: {
        method: 'initialize',
        accept: ['application/json', 'text/event-stream'],
      },
      requiredMethods: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call'],
      optionalMethods: ['prompts/list', 'prompts/get', 'resources/list', 'resources/templates/list', 'resources/read'],
      requiredTools: AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES,
    },
  }
}

export const buildAgenticGraphMcpAppsServerReadiness = (args = {}) => {
  const baseUrl = normalizeString(args.baseUrl).replace(/\/+$/, '')
  const updatedAt = normalizeString(args.updatedAt)
  const mcpServerCard = args.mcpServerCard && typeof args.mcpServerCard === 'object' ? args.mcpServerCard : {}
  const capabilities = mcpServerCard.capabilities && typeof mcpServerCard.capabilities === 'object'
    ? mcpServerCard.capabilities
    : {}
  const tools = arrayFrom(args.tools).length ? arrayFrom(args.tools) : arrayFrom(capabilities.tools)
  const resources = arrayFrom(args.resources).length
    ? arrayFrom(args.resources)
    : [buildAgenticGraphMcpAppsResourceDescriptor({ appUrl: baseUrl, updatedAt })]
  const prompts = arrayFrom(args.prompts).length ? arrayFrom(args.prompts) : arrayFrom(mcpServerCard.prompts)
  const resourceTemplates = arrayFrom(args.resourceTemplates).length ? arrayFrom(args.resourceTemplates) : arrayFrom(mcpServerCard.resourceTemplates)
  const appTools = tools.filter((tool) => tool?._meta?.ui?.resourceUri === AGENTICGRAPH_MCP_APP_RESOURCE_URI)
  const appTool = appTools.find((tool) => tool?.name === AGENTICGRAPH_MCP_APP_TOOL_NAME) || appTools[0] || null
  const appResource = resources.find((resource) => resource?.uri === AGENTICGRAPH_MCP_APP_RESOURCE_URI) || null
  const extension = capabilities.extensions?.[AGENTICGRAPH_MCP_APPS_EXTENSION_ID]
  const transportUrl = normalizeString(mcpServerCard.transport?.url) || (baseUrl ? `${baseUrl}/mcp` : '')
  const publicReadMcpUrl = normalizeString(mcpServerCard.surfaceRoles?.publicReadMcpUrl) || transportUrl
  const controlPlaneMcpUrl = normalizeString(mcpServerCard.surfaceRoles?.controlPlaneMcpUrl)
    || (baseUrl ? `${baseUrl}/control-plane/mcp` : '')
  const transportType = normalizeString(mcpServerCard.transport?.type) || AGENTICGRAPH_MCP_REMOTE_TRANSPORT_TYPE
  const appResourceHtml = normalizeString(args.appResourceHtml)
    || buildAgenticGraphMcpAppsHtml({
      appUrl: baseUrl,
      updatedAt,
      toolName: appTool?.name || AGENTICGRAPH_MCP_APP_TOOL_NAME,
    })
  const clientSetups = args.clientSetups && typeof args.clientSetups === 'object'
    ? args.clientSetups
    : buildAgenticGraphMcpClientSetups({ baseUrl, mcpUrl: transportUrl, serverName: mcpServerCard.serverInfo?.name })
  const outputSchemaReady = appTool?.outputSchema && typeof appTool.outputSchema === 'object'
  const textFallbackReady = Boolean(appTool?.name)
  const structuredContentReady = outputSchemaReady
  const openAiOutputTemplateReady = appTool?._meta?.['openai/outputTemplate'] === AGENTICGRAPH_MCP_APP_RESOURCE_URI
  const openAiWidgetBridgeReady = hasOpenAiWidgetBridgeHtml(appResourceHtml)
  const appToolSecuritySchemesReady = hasNoauthSecurityScheme(appTool?.securitySchemes)
    && hasNoauthSecurityScheme(appTool?._meta?.securitySchemes)
  const appToolAnnotationsReady = hasReadOnlyToolAnnotations(appTool)
  const appToolWidgetAccessibleReady = appTool?._meta?.['openai/widgetAccessible'] === true
  const promptNames = prompts.map((prompt) => normalizeString(prompt?.name)).filter(Boolean)
  const promptCapabilityReady = mcpServerCard.capabilities?.prompts && typeof mcpServerCard.capabilities.prompts === 'object'
  const promptsReady = AGENTICGRAPH_MCP_REQUIRED_PROMPT_NAMES
    .every((promptName) => promptNames.includes(promptName))
  const resourceTemplateUris = resourceTemplates.map((template) => normalizeString(template?.uriTemplate)).filter(Boolean)
  const sourceFileResourceTemplateReady = resourceTemplateUris.includes(AGENTICGRAPH_SOURCE_FILE_RESOURCE_URI_TEMPLATE)
  const deepResearchTools = Object.fromEntries(
    AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES.map((toolName) => [
      toolName,
      tools.find((tool) => tool?.name === toolName) || null,
    ]),
  )
  const deepResearchToolsReady = AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES
    .every((toolName) => {
      const tool = deepResearchTools[toolName]
      return hasReadOnlyToolAnnotations(tool)
        && hasToolOutputSchemaFields(tool, AGENTICGRAPH_MCP_DEEP_RESEARCH_REQUIRED_OUTPUTS[toolName])
    })
  const qwenCodeSetup = clientSetups[AGENTICGRAPH_MCP_CLIENT_IDS.qwenCode]
  const qwenCodeReady = qwenCodeSetup?.transport === 'http'
    && qwenCodeSetup?.url === transportUrl
    && qwenCodeSetup?.settingsJson?.mcpServers?.[mcpServerCard.serverInfo?.name || 'agenticgraph']?.httpUrl === transportUrl
    && String(qwenCodeSetup?.command || '').includes('--transport http')
    && String(qwenCodeSetup?.command || '').includes(transportUrl)
  const kimiCliSetup = clientSetups[AGENTICGRAPH_MCP_CLIENT_IDS.kimiCli]
  const kimiCliReady = kimiCliSetup?.transport === 'http'
    && kimiCliSetup?.url === transportUrl
    && kimiCliSetup?.mcpJson?.mcpServers?.[mcpServerCard.serverInfo?.name || 'agenticgraph']?.url === transportUrl
    && kimiCliSetup?.mcpJson?.mcpServers?.[mcpServerCard.serverInfo?.name || 'agenticgraph']?.transport === 'http'
    && String(kimiCliSetup?.command || '').includes('kimi mcp add --transport http')
    && String(kimiCliSetup?.command || '').includes(transportUrl)
  const bytePlusModelArkSetup = clientSetups[AGENTICGRAPH_MCP_CLIENT_IDS.bytePlusModelArk]
  const bytePlusModelArkReady = bytePlusModelArkSetup?.transport === AGENTICGRAPH_MCP_REMOTE_TRANSPORT_TYPE
    && bytePlusModelArkSetup?.url === transportUrl
    && bytePlusModelArkSetup?.endpoint === '/responses'
    && bytePlusModelArkSetup?.requiredHeaders?.['ark-beta-mcp'] === 'true'
    && arrayFrom(bytePlusModelArkSetup?.tools).some((tool) =>
      tool?.type === 'mcp'
      && tool?.server_label === (mcpServerCard.serverInfo?.name || 'agenticgraph')
      && tool?.server_url === transportUrl
      && tool?.require_approval === 'never')
    && bytePlusModelArkSetup?.openAiCompatible?.responsesCreate?.tools?.some((tool) =>
      tool?.type === 'mcp'
      && tool?.server_label === (mcpServerCard.serverInfo?.name || 'agenticgraph')
      && tool?.server_url === transportUrl
      && tool?.require_approval === 'never')
  const checklist = [
    booleanCheck('app-tool-resource-link', 'App tool is linked to the UI resource', appTools.length > 0, appTools.map((tool) => tool.name)),
    booleanCheck('output-schema', 'App tool exposes an output schema', outputSchemaReady, [appTool?.name]),
    booleanCheck('text-fallback', 'Tool result keeps a text fallback for non-UI hosts', textFallbackReady, [appTool?.name]),
    booleanCheck('structured-content', 'Tool result returns structured content for the View', structuredContentReady, [appTool?.name]),
    booleanCheck('resource-descriptor', 'MCP resource descriptor uses the MCP Apps MIME type', appResource?.mimeType === AGENTICGRAPH_MCP_APPS_RESOURCE_MIME_TYPE, [appResource?.uri]),
    booleanCheck('resource-security-meta', 'Resource declares UI sandbox metadata', appResource?._meta?.ui?.prefersBorder === true && Boolean(appResource?._meta?.ui?.csp), [appResource?.uri]),
    booleanCheck('openai-output-template', 'App tool exposes the OpenAI output template metadata key', openAiOutputTemplateReady, [appTool?.name]),
    booleanCheck('openai-widget-bridge', 'App resource supports the OpenAI Apps widget bridge', openAiWidgetBridgeReady, ['window.openai', 'openai:set_globals']),
    booleanCheck('tool-security-schemes', 'App tool exposes no-auth securitySchemes and mirrors them in _meta', appToolSecuritySchemesReady, [appTool?.name]),
    booleanCheck('tool-impact-annotations', 'App tool exposes complete read-only impact annotations', appToolAnnotationsReady, [appTool?.name]),
    booleanCheck('widget-accessible', 'App tool allows the widget bridge to call tools', appToolWidgetAccessibleReady, [appTool?.name]),
    booleanCheck('prompt-discovery', 'Server exposes MCP prompt templates for multi-host guidance', promptCapabilityReady && promptsReady, promptNames),
    booleanCheck('source-file-resource-template', 'Server exposes a dynamic Source Files resource template', sourceFileResourceTemplateReady, resourceTemplateUris),
    booleanCheck('deep-research-search-fetch', 'Server exposes read-only search and fetch tools', deepResearchToolsReady, AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES),
    booleanCheck('qwen-code-http-client-setup', 'Server advertises Qwen Code HTTP MCP setup', qwenCodeReady, [qwenCodeSetup?.command]),
    booleanCheck('kimi-cli-http-client-setup', 'Server advertises Kimi CLI HTTP MCP setup', kimiCliReady, [kimiCliSetup?.command]),
    booleanCheck('byteplus-modelark-responses-mcp-setup', 'Server advertises BytePlus ModelArk Responses API MCP setup', bytePlusModelArkReady, [bytePlusModelArkSetup?.apiBaseUrl, bytePlusModelArkSetup?.endpoint]),
    booleanCheck('extension-capability', 'Server advertises the MCP Apps extension capability', extension?.mimeTypes?.includes(AGENTICGRAPH_MCP_APPS_RESOURCE_MIME_TYPE), [AGENTICGRAPH_MCP_APPS_EXTENSION_ID]),
    booleanCheck('streamable-http-transport', 'Server exposes a stateless Streamable HTTP JSON-RPC transport', Boolean(transportUrl) && transportType === AGENTICGRAPH_MCP_REMOTE_TRANSPORT_TYPE, [transportUrl, transportType]),
    booleanCheck('stdio-transport', 'Repo-local MCP server supports stdio host configuration', args.localStdio === false ? false : true, ['node mcp/server.js']),
  ]
  const ready = checklist.every((check) => check.ok)
  const promotionRecovery = buildPublishedPromotionRecoveryContract()
  return {
    schemaVersion: AGENTICGRAPH_MCP_APPS_SERVER_READINESS_SCHEMA_VERSION,
    ready,
    updatedAt,
    app: {
      name: AGENTICGRAPH_MCP_APP_RESOURCE_NAME,
      protocolVersion: AGENTICGRAPH_MCP_APPS_PROTOCOL_VERSION,
      resourceUri: AGENTICGRAPH_MCP_APP_RESOURCE_URI,
      resourceMimeType: AGENTICGRAPH_MCP_APPS_RESOURCE_MIME_TYPE,
      extensionId: AGENTICGRAPH_MCP_APPS_EXTENSION_ID,
    },
    tool: {
      name: appTool?.name || AGENTICGRAPH_MCP_APP_TOOL_NAME,
      title: appTool?.title || 'Inspect Agent Surface',
      resourceUri: appTool?._meta?.ui?.resourceUri || AGENTICGRAPH_MCP_APP_RESOURCE_URI,
      visibility: arrayFrom(appTool?._meta?.ui?.visibility).length ? appTool._meta.ui.visibility : ['model', 'app'],
      readOnly: appTool?.annotations?.readOnlyHint === true,
      destructive: appTool?.annotations?.destructiveHint === true,
      openWorld: appTool?.annotations?.openWorldHint === true,
      idempotent: appTool?.annotations?.idempotentHint === true,
      annotationsReady: appToolAnnotationsReady,
      hasOutputSchema: Boolean(outputSchemaReady),
      textFallback: textFallbackReady,
      structuredContent: structuredContentReady,
      openAiOutputTemplate: openAiOutputTemplateReady,
      openAiWidgetBridge: openAiWidgetBridgeReady,
      securitySchemes: readSecuritySchemes(appTool?.securitySchemes),
      mirroredSecuritySchemes: readSecuritySchemes(appTool?._meta?.securitySchemes),
      widgetAccessible: appToolWidgetAccessibleReady,
    },
    resource: {
      uri: appResource?.uri || AGENTICGRAPH_MCP_APP_RESOURCE_URI,
      name: appResource?.name || AGENTICGRAPH_MCP_APP_RESOURCE_NAME,
      mimeType: appResource?.mimeType || AGENTICGRAPH_MCP_APPS_RESOURCE_MIME_TYPE,
      prefersBorder: appResource?._meta?.ui?.prefersBorder === true,
      domain: normalizeString(appResource?._meta?.ui?.domain),
      csp: appResource?._meta?.ui?.csp || {},
      openAiWidgetBridge: openAiWidgetBridgeReady,
    },
    retrieval: {
      mode: 'deep-research-search-fetch',
      requiredTools: AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES,
      tools: AGENTICGRAPH_MCP_DEEP_RESEARCH_TOOL_NAMES.map((toolName) => {
        const tool = deepResearchTools[toolName]
        return {
          name: toolName,
          readOnly: tool?.annotations?.readOnlyHint === true,
          destructive: tool?.annotations?.destructiveHint === true,
          openWorld: tool?.annotations?.openWorldHint === true,
          idempotent: tool?.annotations?.idempotentHint === true,
          annotationsReady: hasReadOnlyToolAnnotations(tool),
          requiredOutputFields: AGENTICGRAPH_MCP_DEEP_RESEARCH_REQUIRED_OUTPUTS[toolName],
          outputSchemaReady: hasToolOutputSchemaFields(
            tool,
            AGENTICGRAPH_MCP_DEEP_RESEARCH_REQUIRED_OUTPUTS[toolName],
          ),
        }
      }),
    },
    prompts: {
      requiredPrompts: AGENTICGRAPH_MCP_REQUIRED_PROMPT_NAMES,
      names: promptNames,
      capability: Boolean(promptCapabilityReady),
      ready: promptCapabilityReady && promptsReady,
    },
    resourceTemplates: {
      requiredTemplates: [AGENTICGRAPH_SOURCE_FILE_RESOURCE_URI_TEMPLATE],
      uriTemplates: resourceTemplateUris,
      ready: sourceFileResourceTemplateReady,
    },
    clients: clientSetups,
    transports: [
      {
        id: 'pages-http-jsonrpc',
        type: transportType,
        url: transportUrl,
        stateless: true,
        serverFactory: true,
      },
      {
        id: 'local-stdio-jsonrpc',
        type: 'stdio',
        command: 'node mcp/server.js',
        stateless: false,
        serverFactory: true,
      },
    ],
    dataModel: {
      source: 'inspect_agent_surface.structuredContent',
      categories: [
        { id: 'discovery', label: 'Discovery metadata', count: ['health', 'apiCatalog', 'openApi', 'mcpServerCard', 'agentCard', 'agentSkills'].length },
        { id: 'commerce', label: 'Commerce discovery', count: ['acpDiscovery', 'ucpProfile', 'mppOpenApi'].length },
        { id: 'mcp-apps', label: 'MCP Apps server bindings', count: checklist.length },
      ],
      renderMode: 'structured-summary-with-json-fallback',
    },
    onboarding: buildMcpOnboarding({ publicReadMcpUrl, controlPlaneMcpUrl }),
    operatorContracts: {
      promotionRecovery,
    },
    checklist,
  }
}

export const buildAgenticGraphMcpAppsToolMeta = (args = {}) => {
  const resourceUri = normalizeString(args.resourceUri) || AGENTICGRAPH_MCP_APP_RESOURCE_URI
  const securitySchemes = normalizeSecuritySchemes(args.securitySchemes)
  return {
    securitySchemes,
    ui: {
      resourceUri,
      visibility: Array.isArray(args.visibility) && args.visibility.length
        ? args.visibility
        : ['model', 'app'],
    },
    'openai/outputTemplate': resourceUri,
    'openai/widgetAccessible': args.widgetAccessible === false ? false : true,
    'openai/toolInvocation/invoking': normalizeString(args.invoking) || 'Inspecting AgenticGraph.',
    'openai/toolInvocation/invoked': normalizeString(args.invoked) || 'AgenticGraph is ready.',
  }
}

export const AGENTICGRAPH_AGENT_SURFACE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: true,
  required: ['baseUrl', 'healthUrl', 'mcpUrl'],
  properties: {
    baseUrl: { type: 'string' },
    healthUrl: { type: 'string' },
    mcpUrl: { type: 'string' },
    apiCatalogUrl: { type: 'string' },
    openApiUrl: { type: 'string' },
    mcpServerCardUrl: { type: 'string' },
    agentCardUrl: { type: 'string' },
    agentSkillsUrl: { type: 'string' },
    commerceUrls: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    health: { type: 'object', additionalProperties: true },
    apiCatalog: { type: 'object', additionalProperties: true },
    openApi: { type: 'object', additionalProperties: true },
    mcpServerCard: { type: 'object', additionalProperties: true },
    agentCard: { type: 'object', additionalProperties: true },
    agentSkills: { type: 'object', additionalProperties: true },
    commerce: { type: 'object', additionalProperties: true },
    mcpAppsServerReadiness: { type: 'object', additionalProperties: true },
  },
})

export const buildAgenticGraphMcpAppsResourceDescriptor = (args = {}) => {
  const appUrl = normalizeString(args.appUrl)
  const updatedAt = normalizeString(args.updatedAt)
  const domain = normalizeString(args.domain) || readUrlOrigin(appUrl)
  const csp = {
    connectDomains: [],
    resourceDomains: [],
    frameDomains: [],
    baseUriDomains: [],
  }
  return {
    uri: AGENTICGRAPH_MCP_APP_RESOURCE_URI,
    name: AGENTICGRAPH_MCP_APP_RESOURCE_NAME,
    description: [
      'Interactive MCP Apps view for the existing AgenticGraph agent-ready surface.',
      appUrl ? `App URL: ${appUrl}` : '',
      updatedAt ? `Updated: ${updatedAt}` : '',
    ].filter(Boolean).join(' '),
    mimeType: AGENTICGRAPH_MCP_APPS_RESOURCE_MIME_TYPE,
    _meta: {
      ui: {
        csp,
        ...(domain ? { domain } : {}),
        prefersBorder: true,
      },
      'openai/widgetDescription': 'Interactive AgenticGraph agent-ready server-readiness view.',
      'openai/widgetPrefersBorder': true,
      ...(domain ? { 'openai/widgetDomain': domain } : {}),
      'openai/widgetCSP': {
        connect_domains: csp.connectDomains,
        resource_domains: csp.resourceDomains,
        frame_domains: csp.frameDomains,
      },
    },
  }
}

export const buildAgenticGraphMcpAppsHtml = (args = {}) => {
  const appUrl = normalizeString(args.appUrl)
  const updatedAt = normalizeString(args.updatedAt)
  const toolName = normalizeString(args.toolName) || AGENTICGRAPH_MCP_APP_TOOL_NAME
  const publicReadMcpUrl = appUrl ? `${appUrl.replace(/\/+$/, '')}/mcp` : ''
  const controlPlaneMcpUrl = appUrl ? `${appUrl.replace(/\/+$/, '')}/control-plane/mcp` : ''
  const toolNames = Array.isArray(args.toolNames)
    ? args.toolNames.map(normalizeString).filter(Boolean)
    : [toolName]
  const boot = {
    appUrl,
    updatedAt,
    resourceUri: AGENTICGRAPH_MCP_APP_RESOURCE_URI,
    toolName,
    toolNames,
    protocolVersion: AGENTICGRAPH_MCP_APPS_PROTOCOL_VERSION,
    onboarding: buildMcpOnboarding({ publicReadMcpUrl, controlPlaneMcpUrl }),
    promotionRecovery: buildPublishedPromotionRecoveryContract(),
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AgenticGraph Agent Ready</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { display: grid; gap: 12px; min-height: 100vh; padding: 16px; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent); padding-bottom: 10px; }
    h1 { margin: 0; font-size: 16px; line-height: 1.25; letter-spacing: 0; }
    p { margin: 4px 0 0; color: color-mix(in srgb, CanvasText 72%, transparent); font-size: 13px; line-height: 1.45; }
    button, a { border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; background: color-mix(in srgb, Canvas 88%, CanvasText 12%); color: CanvasText; font: inherit; padding: 7px 10px; text-decoration: none; }
    button { cursor: pointer; }
    section { display: grid; gap: 8px; }
    dl { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 6px 10px; margin: 0; font-size: 12px; }
    dt { color: color-mix(in srgb, CanvasText 62%, transparent); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    pre { margin: 0; max-height: 48vh; overflow: auto; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 6px; padding: 10px; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; background: color-mix(in srgb, Canvas 94%, CanvasText 6%); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .status { font-size: 12px; color: color-mix(in srgb, CanvasText 66%, transparent); }
    .readiness { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 6px; padding: 10px; background: color-mix(in srgb, Canvas 96%, CanvasText 4%); font-size: 12px; }
    .readiness strong { display: block; font-size: 13px; margin-bottom: 3px; }
    .readiness ol { display: grid; gap: 6px; margin: 8px 0 0; padding-left: 18px; }
    .readiness ul { display: grid; gap: 4px; margin: 8px 0 0; padding: 0; list-style: none; }
    .check { min-width: 0; overflow-wrap: anywhere; }
    .check.ok { color: color-mix(in srgb, CanvasText 74%, #0f766e 26%); }
    .check.fail { color: color-mix(in srgb, CanvasText 68%, #b91c1c 32%); }
  </style>
</head>
<body>
  <main>
    <header>
      <section>
        <h1>AgenticGraph Agent Ready</h1>
        <p>Interactive MCP Apps view backed by the existing read-only agent surface.</p>
      </section>
      <nav class="actions" aria-label="Agent Ready actions">
        <button id="refresh" type="button">Refresh</button>
        ${appUrl ? `<a href="${escapeHtml(appUrl)}" target="_blank" rel="noreferrer">Open</a>` : ''}
      </nav>
    </header>
    <section aria-label="MCP app state">
      <dl>
        <dt>Resource</dt><dd>${escapeHtml(AGENTICGRAPH_MCP_APP_RESOURCE_URI)}</dd>
        <dt>Tool</dt><dd>${escapeHtml(toolName)}</dd>
        <dt>Host</dt><dd id="host">Not connected.</dd>
        <dt>Updated</dt><dd>${escapeHtml(updatedAt || 'runtime')}</dd>
        <dt>Status</dt><dd id="status" class="status">Initializing MCP Apps host bridge.</dd>
      </dl>
    </section>
    ${buildMcpOnboardingHtml({ publicReadMcpUrl, controlPlaneMcpUrl })}
    ${buildPromotionRecoveryHtml(boot.promotionRecovery)}
    <section aria-label="MCP Apps server readiness">
      <section id="readiness" class="readiness">Waiting for structured server-readiness data.</section>
    </section>
    <section aria-label="Tool result">
      <pre id="structured">No tool result received yet.</pre>
    </section>
  </main>
  <script>
  (() => {
    const boot = ${safeJsonForInlineScript(boot)};
    const statusEl = document.getElementById('status');
    const hostEl = document.getElementById('host');
    const onboardingEl = document.getElementById('onboarding');
    const readinessEl = document.getElementById('readiness');
    const structuredEl = document.getElementById('structured');
    let nextId = 1;
    const pending = new Map();
    const state = { hostCapabilities: null, hostContext: null, input: null, result: null };
    const hasParent = () => window.parent && window.parent !== window;
    const readOpenAiBridge = () => {
      const bridge = window.openai;
      return bridge && typeof bridge === 'object' ? bridge : null;
    };
    const post = (message) => {
      if (!hasParent()) return;
      window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
    };
    const notify = (method, params = {}) => post({ method, params });
    const request = (method, params = {}) => {
      const id = nextId++;
      post({ id, method, params });
      return new Promise((resolve, reject) => {
        pending.set(id, { method, resolve, reject });
        window.setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error(method + ' timed out'));
        }, 8000);
      });
    };
    const requestTool = async () => {
      statusEl.textContent = 'Requesting ' + boot.toolName + ' through the host.';
      try {
        const openAiBridge = readOpenAiBridge();
        const result = openAiBridge && typeof openAiBridge.callTool === 'function'
          ? await openAiBridge.callTool(boot.toolName, {})
          : await request('tools/call', { name: boot.toolName, arguments: {} });
        state.result = result || null;
        render();
      } catch (error) {
        statusEl.textContent = error && error.message ? error.message : 'Tool request failed.';
      }
    };
    const updateHost = (context = {}) => {
      state.hostContext = { ...(state.hostContext || {}), ...context };
      const host = state.hostContext || {};
      const label = [
        host.displayMode,
        host.theme,
        host.platform,
      ].filter(Boolean).join(' / ');
      hostEl.textContent = label || (state.hostCapabilities ? 'Connected.' : 'Not connected.');
      if (host.theme === 'dark' || host.theme === 'light') {
        document.documentElement.dataset.theme = host.theme;
      }
    };
    const syncOpenAiGlobals = (globals = readOpenAiBridge()) => {
      const source = globals && typeof globals === 'object' ? globals : {};
      if (Object.prototype.hasOwnProperty.call(source, 'toolInput')) {
        state.input = source.toolInput || null;
      }
      if (Object.prototype.hasOwnProperty.call(source, 'toolOutput')) {
        state.result = source.toolOutput || null;
      }
      updateHost({
        platform: 'OpenAI Apps',
        displayMode: source.displayMode || source.hostDisplayMode,
        theme: source.theme,
      });
      state.hostCapabilities = { ...(state.hostCapabilities || {}), openaiAppsBridge: true };
    };
    const appendText = (parent, tagName, text, className = '') => {
      const element = document.createElement(tagName);
      if (className) element.className = className;
      element.textContent = text;
      parent.appendChild(element);
      return element;
    };
    ${MCP_ONBOARDING_CLIENT_SCRIPT}
    const renderReadiness = (payload) => {
      readinessEl.replaceChildren();
      const readiness = payload && payload.mcpAppsServerReadiness;
      if (!readiness || typeof readiness !== 'object') {
        readinessEl.textContent = 'Waiting for structured server-readiness data.';
        return;
      }
      readinessEl.className = 'readiness ' + (readiness.ready ? 'ready' : 'not-ready');
      appendText(
        readinessEl,
        'strong',
        readiness.ready ? 'MCP Apps server-ready' : 'MCP Apps server-readiness incomplete',
      );
      const meta = appendText(
        readinessEl,
        'p',
        [readiness.app && readiness.app.protocolVersion, readiness.resource && readiness.resource.mimeType]
          .filter(Boolean)
          .join(' / '),
        'status',
      );
      if (!meta.textContent) meta.remove();
      const list = document.createElement('ul');
      for (const check of Array.isArray(readiness.checklist) ? readiness.checklist : []) {
        const item = document.createElement('li');
        item.className = check && check.ok ? 'check ok' : 'check fail';
        item.textContent = (check && check.ok ? 'OK ' : 'Missing ') + (check && check.label ? check.label : 'readiness check');
        list.appendChild(item);
      }
      readinessEl.appendChild(list);
    };
    const render = () => {
      const payload = state.result && typeof state.result === 'object'
        ? (state.result.structuredContent || state.result)
        : state.result;
      renderOnboarding(payload);
      renderReadiness(payload);
      structuredEl.textContent = payload
        ? JSON.stringify(payload, null, 2)
        : 'No tool result received yet.';
      statusEl.textContent = payload
        ? 'Rendered structured tool result.'
        : (state.hostCapabilities ? 'Connected. Waiting for tool result.' : 'Initializing MCP Apps host bridge.');
    };
    const sendSizeChanged = (() => {
      let last = '';
      return () => {
        const body = document.body;
        const root = document.documentElement;
        const width = Math.ceil(Math.max(body.scrollWidth, root.scrollWidth, root.clientWidth));
        const height = Math.ceil(Math.max(body.scrollHeight, root.scrollHeight, root.clientHeight));
        const key = width + 'x' + height;
        if (key === last || width <= 0 || height <= 0) return;
        last = key;
        notify('ui/notifications/size-changed', { width, height });
      };
    })();
    const connect = async () => {
      if (readOpenAiBridge()) {
        syncOpenAiGlobals();
        render();
        sendSizeChanged();
        return;
      }
      if (!hasParent()) {
        statusEl.textContent = 'Standalone preview. Waiting for embedded MCP Apps host.';
        return;
      }
      try {
        const result = await request('ui/initialize', {
          protocolVersion: boot.protocolVersion,
          appInfo: {
            name: 'agenticgraph-mcp-app',
            title: 'AgenticGraph Agent Ready',
            version: '0.1.0',
            description: 'Interactive view for the AgenticGraph agent-ready MCP surface.',
            websiteUrl: boot.appUrl || undefined,
          },
          appCapabilities: {
            availableDisplayModes: ['inline', 'fullscreen'],
          },
        });
        state.hostCapabilities = result && result.hostCapabilities ? result.hostCapabilities : {};
        updateHost(result && result.hostContext ? result.hostContext : {});
        notify('ui/notifications/initialized', {});
        sendSizeChanged();
        statusEl.textContent = 'Connected. Waiting for tool result.';
      } catch (error) {
        statusEl.textContent = error && error.message ? error.message : 'Host initialization failed.';
      }
    };
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.jsonrpc !== '2.0') return;
      if (Object.prototype.hasOwnProperty.call(message, 'id') && (Object.prototype.hasOwnProperty.call(message, 'result') || Object.prototype.hasOwnProperty.call(message, 'error'))) {
        const pendingRequest = pending.get(message.id);
        if (!pendingRequest) return;
        pending.delete(message.id);
        if (message.error) pendingRequest.reject(new Error(message.error.message || 'MCP Apps request failed'));
        else pendingRequest.resolve(message.result);
        return;
      }
      if (message.method === 'ui/notifications/tool-input') {
        state.input = message.params && (message.params.arguments || message.params);
        statusEl.textContent = 'Received tool input.';
        return;
      }
      if (message.method === 'ui/notifications/tool-input-partial') {
        state.input = { ...(state.input || {}), ...(message.params && (message.params.arguments || message.params) || {}) };
        statusEl.textContent = 'Received partial tool input.';
        return;
      }
      if (message.method === 'ui/notifications/tool-result') {
        state.result = message.params || null;
        render();
        return;
      }
      if (message.method === 'ui/notifications/tool-cancelled') {
        statusEl.textContent = message.params && message.params.reason
          ? 'Tool cancelled: ' + message.params.reason
          : 'Tool cancelled.';
        return;
      }
      if (message.method === 'ui/notifications/host-context-changed') {
        updateHost(message.params || {});
        return;
      }
      if (message.method === 'ui/resource-teardown') {
        if (message.id !== undefined && message.id !== null) post({ id: message.id, result: {} });
      }
    });
    window.addEventListener('openai:set_globals', (event) => {
      syncOpenAiGlobals(event && event.detail && (event.detail.globals || event.detail));
      render();
      sendSizeChanged();
    });
    document.getElementById('refresh')?.addEventListener('click', requestTool);
    render();
    connect();
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(sendSizeChanged).observe(document.body);
    } else {
      window.addEventListener('resize', sendSizeChanged);
    }
  })();
  </script>
</body>
</html>`
}

export const buildAgenticGraphMcpAppsResourceReadResult = (args = {}) => {
  const descriptor = buildAgenticGraphMcpAppsResourceDescriptor(args)
  return {
    contents: [{
      uri: descriptor.uri,
      mimeType: AGENTICGRAPH_MCP_APPS_RESOURCE_MIME_TYPE,
      text: buildAgenticGraphMcpAppsHtml(args),
      _meta: descriptor._meta,
    }],
  }
}
