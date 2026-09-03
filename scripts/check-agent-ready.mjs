import {
  AGENTIC_OS_AGENT_READY_DEFAULT_WORKSPACE_ID,
  buildAgenticGraphAgentReadyToolContracts,
} from '../canvas/src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import {
  AGENTIC_OS_AGENT_READY_PROMPT_NAMES,
  buildAgenticGraphAgentReadyPromptContracts,
} from '../canvas/src/features/agent-ready/agentic-graph-agent-ready-prompt-contract.mjs'
import {
  AGENTIC_OS_SOURCE_FILE_RESOURCE_MIME_TYPE,
  buildAgenticGraphAgentReadyResourceTemplateContracts,
  buildAgenticGraphSourceFileResourceUri,
} from '../canvas/src/features/agent-ready/agentic-graph-agent-ready-resource-contract.mjs'
import {
  AGENTIC_OS_MCP_APPS_EXTENSION_ID,
  AGENTIC_OS_MCP_APPS_PROTOCOL_VERSION,
  AGENTIC_OS_MCP_APPS_RESOURCE_MIME_TYPE,
  AGENTIC_OS_MCP_APP_RESOURCE_URI,
  AGENTIC_OS_MCP_CLIENT_IDS,
  AGENTIC_OS_MCP_REMOTE_TRANSPORT_TYPE,
} from '../canvas/src/features/agent-ready/mcpAppsReadyContract.mjs'
import { encodePublishedDocShareToken, PUBLISHED_DOC_SHARE_TOKEN_PARAM } from '../canvas/src/features/canvas/canvasDocShareToken.mjs'
import { buildAgentReadyDiscoveryExpectations } from '../cloudflare/pages/agentic-graph-agent-ready-discovery.mjs'
import { WEB_MCP_LIFECYCLE_SCRIPT_MARKER } from '../cloudflare/pages/webmcp-html-injection.mjs'
import { buildAgentReadyCommerceChecks } from './agent-ready-commerce-checks.mjs'
const canonicalOriginUrl = 'https://airvio.co'
const canonicalBaseUrl = `${canonicalOriginUrl}/agentic-graph`
const requestOriginUrl = new URL(process.env.AGENTIC_OS_AGENT_READY_BASE_URL || canonicalBaseUrl).origin
const toRequestUrl = (url) => url.replace(canonicalOriginUrl, requestOriginUrl)
const baseUrl = canonicalBaseUrl
const originUrl = canonicalOriginUrl
const rootA2aAgentCardUrl = `${originUrl}/.well-known/agent-card.json`
const appBasePath = new URL(baseUrl).pathname.replace(/\/+$/, '') || '/'
const defaultWorkspaceId = AGENTIC_OS_AGENT_READY_DEFAULT_WORKSPACE_ID
const expectedTools = buildAgenticGraphAgentReadyToolContracts({
  defaultWorkspaceId,
})
const expectedPrompts = buildAgenticGraphAgentReadyPromptContracts()
const expectedResourceTemplates = buildAgenticGraphAgentReadyResourceTemplateContracts()
const expectedWebMcpLifecycleTokens = [
  'kgWebmcpContext', 'createWebMcpLifecycleController', 'provideContext', 'registerTool', 'AbortController',
  'awaiting-model-context', 'fallback-readable', 'retry-exhausted', '/api/storage/source-files',
]
const toComparableMcpToolEntry = (tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  securitySchemes: tool.securitySchemes,
  annotations: tool.annotations,
  _meta: tool._meta,
})
const expectedMcpToolEntries = expectedTools
  .map(toComparableMcpToolEntry)
  .sort((left, right) => left.name.localeCompare(right.name))
const hasReadOnlyAnnotations = (tool) =>
  tool?.annotations?.readOnlyHint === true
  && tool?.annotations?.destructiveHint === false
  && tool?.annotations?.openWorldHint === false
  && tool?.annotations?.idempotentHint === true
const expectedBrowserOnlyTools = buildAgenticGraphAgentReadyToolContracts({
  defaultWorkspaceId,
  includeBrowserOnlyTools: true,
}).filter((tool) => !expectedTools.some((sharedTool) => sharedTool.webName === tool.webName))
const expectedWebToolNames = expectedTools.map((tool) => tool.webName)
const expectedBrowserOnlyWebToolNames = expectedBrowserOnlyTools.map((tool) => tool.webName)
const expectedDiscovery = buildAgentReadyDiscoveryExpectations({
  appBasePath,
  appA2aAgentCardPath: `${appBasePath}/.well-known/agent-card.json`,
  healthPath: `${appBasePath}/health`,
  toolContracts: expectedTools,
})
const expectedOpenApiPathKeys = expectedDiscovery.openApiPathKeys
const expectedA2aSkills = expectedDiscovery.a2aSkills
const expectedAgentSkills = expectedDiscovery.agentSkills
const expectedAgentSkillNames = expectedAgentSkills.map((skill) => skill.name)
const includesAll = (values, expected) => Array.isArray(values) && expected.every(value => values.includes(value))
const hasExpectedAuthResourceReference = (payload) => payload.resource === `${baseUrl}/` && includesAll(payload.authorization_servers, [originUrl]) && includesAll(payload.scopes_supported, ['agentic-graph:read'])
const hasExpectedProtectedResource = (payload) => hasExpectedAuthResourceReference(payload) && includesAll(payload.bearer_methods_supported, ['header'])
const hasExpectedAgentAuth = (agentAuth) => agentAuth?.skill === `${originUrl}/auth.md` && agentAuth?.register_uri === `${baseUrl}/agent/auth` && agentAuth?.claim_uri === `${baseUrl}/agent/auth/claim` && agentAuth?.revocation_uri === `${baseUrl}/agent/auth/revoke` && includesAll(agentAuth?.identity_types_supported, ['anonymous', 'identity_assertion']) && includesAll(agentAuth?.anonymous?.credential_types_supported, ['api_key']) && includesAll(agentAuth?.identity_assertion?.assertion_types_supported, ['urn:ietf:params:oauth:token-type:id-jag', 'verified_email']) && includesAll(agentAuth?.identity_assertion?.credential_types_supported, ['access_token', 'api_key']) && includesAll(agentAuth?.events_supported, ['https://schemas.workos.com/events/agent/auth/identity/assertion/revoked'])
const defaultSharedDocCanonicalPath = [
  'agentic-canvas-os',
  'docs',
  'AGENTS.md',
].join('/')
const preferredSharedDocSample = {
  workspaceId: defaultWorkspaceId,
  canonicalPath: process.env.AGENTIC_OS_AGENT_READY_SAMPLE_DOC_CANONICAL_PATH || defaultSharedDocCanonicalPath,
}
const buildSharedDocSample = async ({ workspaceId, canonicalPath, requireNonEmpty = false }) => {
  const encodedWorkspaceId = workspaceId ? encodeURIComponent(workspaceId) : ''
  const encodedCanonicalPath = encodeURIComponent(canonicalPath)
  const shareToken = encodePublishedDocShareToken({ workspaceId, canonicalPath })
  const storagePath = workspaceId
    ? `/api/storage/doc/${encodedWorkspaceId}/${encodedCanonicalPath}`
    : `/api/storage/doc-default/${encodedCanonicalPath}`
  const markdownResponse = await fetch(toRequestUrl(`${canonicalOriginUrl}${storagePath}`), {
    headers: { accept: 'text/markdown' },
  })
  if (!markdownResponse.ok) return null
  const markdown = await markdownResponse.text()
  if (requireNonEmpty && markdown.trim().length === 0) return null
  return {
    workspaceId,
    canonicalPath,
    markdown,
    shareUrl: `${baseUrl}/share/${encodeURIComponent(shareToken)}`,
  }
}
const extractStorageDocEntries = (body) => {
  const entries = []
  const storageDocPathPattern = /\/api\/storage\/doc(?:-default)?\/([^/\s)]+)(?:\/([^\s)]+))?/g
  for (const match of String(body || '').matchAll(storageDocPathPattern)) {
    if (!match?.[1]) continue
    const hasWorkspaceId = typeof match[2] === 'string'
    const encodedWorkspaceId = hasWorkspaceId ? match[1] : ''
    const encodedCanonicalPath = hasWorkspaceId ? String(match[2] || '') : match[1]
    entries.push({
      workspaceId: encodedWorkspaceId ? decodeURIComponent(encodedWorkspaceId) : '',
      canonicalPath: decodeURIComponent(encodedCanonicalPath),
    })
  }
  return entries
}
const resolveSharedDocSampleFromIndex = async ({ requireNonEmpty = false } = {}) => {
  const response = await fetch(toRequestUrl(`${canonicalOriginUrl}/api/storage/source-files`), {
    headers: { accept: 'text/markdown' },
  })
  if (!response.ok) return null
  const body = await response.text()
  for (const entry of extractStorageDocEntries(body)) {
    const sample = await buildSharedDocSample({
      ...entry,
      workspaceId: entry.workspaceId || defaultWorkspaceId,
      requireNonEmpty,
    })
    if (sample) return sample
  }
  return null
}
const sharedDocSample = await buildSharedDocSample({ ...preferredSharedDocSample, requireNonEmpty: true })
  || await resolveSharedDocSampleFromIndex({ requireNonEmpty: true })
  || await buildSharedDocSample(preferredSharedDocSample)
  || await resolveSharedDocSampleFromIndex()
const deepResearchSearchQuery = String(sharedDocSample?.canonicalPath || preferredSharedDocSample.canonicalPath)
  .split('/')
  .filter(Boolean)
  .pop()
  ?.replace(/\.[^.]+$/, '')
  || 'agentic-graph'
const contentAwareSearchQuery = 'revision-fence'
const normalizeSearchEvidence = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const contentAwareSearchEvidence = normalizeSearchEvidence(contentAwareSearchQuery)
const deepResearchFetchCanonicalPath = sharedDocSample?.canonicalPath || preferredSharedDocSample.canonicalPath
const deepResearchFetchId = `kgdoc::${encodeURIComponent(deepResearchFetchCanonicalPath)}`
const sharedDocAliasUrls = sharedDocSample
  ? {
      kgShare: `${baseUrl}/?${PUBLISHED_DOC_SHARE_TOKEN_PARAM}=${encodeURIComponent(encodePublishedDocShareToken({
        workspaceId: sharedDocSample.workspaceId,
        canonicalPath: sharedDocSample.canonicalPath,
      }))}`,
      kgWorkspaceCanonical: `${baseUrl}/?kgWorkspaceId=${encodeURIComponent(sharedDocSample.workspaceId)}&kgCanonicalPath=${encodeURIComponent(sharedDocSample.canonicalPath)}`,
      kgPath: `${baseUrl}/?kgPath=${encodeURIComponent(sharedDocSample.workspaceId
        ? `/doc/${sharedDocSample.workspaceId}/${sharedDocSample.canonicalPath}`
        : `/doc-default/${sharedDocSample.canonicalPath}`)}`,
    }
  : null
const isRootRedirectHtml = (body) => {
  const text = String(body || '')
  return text.includes('Root entrypoint for airvio.co')
    && text.includes('url=/agentic-graph/')
    && text.includes('<title>agentic-graph</title>')
}
const describeFailure = (checkName, response, body) => {
  const contentType = response.headers.get('content-type') || ''
  const routeOwner = response.headers.get('x-agentic-graph-route-owner') || ''
  const routeTag = response.headers.get('x-agentic-graph-route-tag') || ''
  if (checkName === 'shared-doc-markdown-negotiation' && isRootRedirectHtml(body)) {
    return `${response.status} ${contentType} (received apex root redirect HTML instead of shared markdown; routeOwner=${routeOwner || 'missing'}; routeTag=${routeTag || 'missing'})`
  }
  if (routeOwner || routeTag) {
    return `${response.status} ${contentType} (routeOwner=${routeOwner || 'missing'}; routeTag=${routeTag || 'missing'})`
  }
  return `${response.status} ${contentType}`
}

const checks = [
  {
    name: 'robots',
    url: `${baseUrl}/robots.txt`,
    accept: '*/*',
    assert: async (response, body) =>
      response.ok
      && response.headers.get('content-type')?.includes('text/plain')
      && /User-agent: GPTBot/.test(body)
      && /Content-Signal: ai-train=no, search=yes, ai-input=yes/.test(body)
      && /Sitemap:/.test(body),
  },
  {
    name: 'sitemap',
    url: `${baseUrl}/sitemap.xml`,
    accept: '*/*',
    assert: async (response, body) =>
      response.ok
      && response.headers.get('content-type')?.includes('application/xml')
      && /<urlset\b/.test(body)
      && /<loc>/.test(body)
      && /<lastmod>/.test(body),
  },
  {
    name: 'link-headers',
    url: `${baseUrl}/`,
    method: 'HEAD',
    accept: '*/*',
    assert: async (response) => {
      const link = response.headers.get('link') || ''
      return response.ok
        && link.includes('</.well-known/api-catalog>; rel="api-catalog"')
        && link.includes('rel="service-desc"')
        && link.includes('rel="service-doc"')
        && link.includes('rel="status"')
        && link.includes('rel="mcp-server-card"')
        && link.includes('rel="describedby"')
    },
  },
  {
    name: 'root-homepage-link-headers',
    url: `${originUrl}/`,
    method: 'HEAD',
    accept: '*/*',
    assert: async (response) => {
      const link = response.headers.get('link') || ''
      return response.ok
        && link.includes('</.well-known/api-catalog>; rel="api-catalog"')
        && link.includes('rel="service-desc"')
        && link.includes('rel="service-doc"')
        && link.includes('rel="status"')
        && link.includes('rel="mcp-server-card"')
        && link.includes('</.well-known/agent-card.json>; rel="describedby"')
    },
  },
  {
    name: 'root-markdown-negotiation',
    url: `${originUrl}/`,
    accept: 'text/markdown',
    assert: async (response, body) =>
      response.ok
      && response.headers.get('content-type')?.includes('text/markdown')
      && Number(response.headers.get('x-markdown-tokens') || 0) > 0
      && String(response.headers.get('vary') || '').toLowerCase().includes('accept')
      && body.trim().startsWith('# agentic-graph'),
  },
  {
    name: 'root-homepage-app-alias',
    url: `${originUrl}/`,
    accept: 'text/html',
    assert: async (response, body) =>
      response.ok
      && response.headers.get('content-type')?.includes('text/html')
      && body.includes('<main id="root"></main>')
      && body.includes('/agentic-graph/assets/')
      && body.includes('name="x-agentic-graph-root-alias" content="/agentic-graph/"')
      && body.includes('Agent-actionable chat-to-canvas knowledge graph workspace')
      && !body.includes('id="agentic-graph-root-fallback"')
      && !body.includes('data-agentic-graph-root-fallback')
      && !body.includes('Open agentic-graph')
      && !body.includes(['Agent-readable', 'knowledge graph workspace'].join(' '))
      && !/http-equiv=["']refresh["']/i.test(body)
      && !body.includes('url=/agentic-graph/'),
  },
  {
    name: 'markdown-negotiation',
    url: `${baseUrl}/`,
    accept: 'text/markdown',
    assert: async (response, body) =>
      response.ok
      && response.headers.get('content-type')?.includes('text/markdown')
      && Number(response.headers.get('x-markdown-tokens') || 0) > 0
      && String(response.headers.get('vary') || '').toLowerCase().includes('accept')
      && body.trim().startsWith('# agentic-graph'),
  },
  ...(sharedDocSample
    ? [{
        name: 'shared-doc-markdown-negotiation',
        url: sharedDocSample.shareUrl,
        accept: 'text/markdown',
        assert: async (response, body) =>
          response.ok
          && response.headers.get('content-type')?.includes('text/markdown')
          && String(response.headers.get('vary') || '').toLowerCase().includes('accept')
          && body.trim() === sharedDocSample.markdown.trim(),
      }, {
        name: 'shared-doc-markdown-negotiation-kgshare-alias',
        url: sharedDocAliasUrls.kgShare,
        accept: 'text/markdown',
        assert: async (response, body) =>
          response.ok
          && response.headers.get('content-type')?.includes('text/markdown')
          && String(response.headers.get('vary') || '').toLowerCase().includes('accept')
          && body.trim() === sharedDocSample.markdown.trim(),
      }, {
        name: 'shared-doc-markdown-negotiation-kgworkspace-canonical-alias',
        url: sharedDocAliasUrls.kgWorkspaceCanonical,
        accept: 'text/markdown',
        assert: async (response, body) =>
          response.ok
          && response.headers.get('content-type')?.includes('text/markdown')
          && String(response.headers.get('vary') || '').toLowerCase().includes('accept')
          && body.trim() === sharedDocSample.markdown.trim(),
      }, {
        name: 'shared-doc-markdown-negotiation-kgpath-alias',
        url: sharedDocAliasUrls.kgPath,
        accept: 'text/markdown',
        assert: async (response, body) =>
          response.ok
          && response.headers.get('content-type')?.includes('text/markdown')
          && String(response.headers.get('vary') || '').toLowerCase().includes('accept')
          && body.trim() === sharedDocSample.markdown.trim(),
      }]
    : []),
  {
    name: 'health',
    url: `${baseUrl}/health`,
    accept: 'application/health+json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && response.headers.get('content-type')?.includes('application/health+json')
        && payload.status === 'pass'
        && payload.service === 'agentic-agent-ready-pages'
        && payload.health === `${canonicalBaseUrl}/health`
    },
  },
  {
    name: 'api-catalog',
    url: `${baseUrl}/.well-known/api-catalog`,
    accept: 'application/linkset+json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const linksetEntry = payload.linkset?.[0] || {}
      return response.ok
        && response.headers.get('content-type')?.includes('application/linkset+json')
        && Array.isArray(payload.linkset)
        && Boolean(linksetEntry.anchor)
        && Array.isArray(linksetEntry.status)
        && linksetEntry.status.some((entry) => entry?.href === `${canonicalBaseUrl}/health`)
    },
  },
  {
    name: 'openapi',
    url: `${baseUrl}/.well-known/openapi.json`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const actualPathKeys = Object.keys(payload.paths || {}).sort()
      return response.ok
        && payload.openapi === '3.1.0'
        && actualPathKeys.length === expectedOpenApiPathKeys.length
        && actualPathKeys.join('|') === expectedOpenApiPathKeys.join('|')
    },
  },
  {
    name: 'a2a-agent-card',
    url: `${baseUrl}/.well-known/agent-card.json`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && response.headers.get('content-type')?.includes('application/json')
        && payload.name
        && payload.version
        && payload.description
        && Array.isArray(payload.supportedInterfaces)
        && payload.supportedInterfaces.some((entry) => entry?.url === `${canonicalBaseUrl}/mcp`)
        && payload.capabilities
        && Array.isArray(payload.skills)
        && payload.skills.length === expectedA2aSkills.length
        && expectedA2aSkills.every((expectedSkill) =>
          payload.skills.some((skill) =>
            skill?.id === expectedSkill.id
            && skill?.name === expectedSkill.name
            && skill?.description === expectedSkill.description,
          ))
        && payload.skills.every((skill) => skill?.id && skill?.name && skill?.description)
    },
  },
  {
    name: 'oauth-protected-resource',
    url: `${baseUrl}/.well-known/oauth-protected-resource`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok && hasExpectedProtectedResource(payload)
    },
  },
  {
    name: 'oauth-authorization-server',
    url: `${baseUrl}/.well-known/oauth-authorization-server`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok && payload.issuer === originUrl && hasExpectedAuthResourceReference(payload) && payload.authorization_endpoint && payload.token_endpoint && payload.jwks_uri && hasExpectedAgentAuth(payload.agent_auth)
    },
  },
  {
    name: 'mcp-server-card',
    url: `${baseUrl}/.well-known/mcp/server-card.json`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const inspectTool = Array.isArray(payload.capabilities?.tools)
        ? payload.capabilities.tools.find((tool) => tool?.name === 'inspect_agent_surface')
        : null
      const searchTool = Array.isArray(payload.capabilities?.tools)
        ? payload.capabilities.tools.find((tool) => tool?.name === 'search')
        : null
      const fetchTool = Array.isArray(payload.capabilities?.tools)
        ? payload.capabilities.tools.find((tool) => tool?.name === 'fetch')
        : null
      const tools = Array.isArray(payload.capabilities?.tools)
        ? payload.capabilities.tools
          .map((tool) => toComparableMcpToolEntry(tool || {}))
          .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
        : null
      const removedSseFlag = ['leg', 'acySse'].join('')
      return response.ok
        && payload.serverInfo?.name
        && payload.serverInfo?.version
        && payload.transport?.type === AGENTIC_OS_MCP_REMOTE_TRANSPORT_TYPE
        && payload.transport?.stateless === true
        && !Object.prototype.hasOwnProperty.call(payload.transport || {}, removedSseFlag)
        && payload.links?.status === `${canonicalBaseUrl}/health`
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.qwenCode]?.transport === 'http'
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.qwenCode]?.url === `${canonicalBaseUrl}/mcp`
        && String(payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.qwenCode]?.command || '').includes(`qwen mcp add --transport http agentic-graph ${canonicalBaseUrl}/mcp`)
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.qwenCode]?.settingsJson?.mcpServers?.['agentic-graph']?.httpUrl === `${canonicalBaseUrl}/mcp`
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.qwenCode]?.settingsJson?.mcpServers?.['agentic-graph']?.includeTools?.includes('search')
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.qwenCode]?.settingsJson?.mcpServers?.['agentic-graph']?.includeTools?.includes('fetch')
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.kimiCli]?.transport === 'http'
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.kimiCli]?.url === `${canonicalBaseUrl}/mcp`
        && String(payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.kimiCli]?.command || '').includes(`kimi mcp add --transport http agentic-graph ${canonicalBaseUrl}/mcp`)
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.kimiCli]?.configFile === '~/.kimi/mcp.json'
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.kimiCli]?.mcpJson?.mcpServers?.['agentic-graph']?.url === `${canonicalBaseUrl}/mcp`
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.kimiCli]?.mcpJson?.mcpServers?.['agentic-graph']?.transport === 'http'
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.transport === AGENTIC_OS_MCP_REMOTE_TRANSPORT_TYPE
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.url === `${canonicalBaseUrl}/mcp`
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.endpoint === '/responses'
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.requiredHeaders?.['ark-beta-mcp'] === 'true'
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.tools?.[0]?.type === 'mcp'
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.tools?.[0]?.server_label === 'agentic-graph'
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.tools?.[0]?.server_url === `${canonicalBaseUrl}/mcp`
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.tools?.[0]?.require_approval === 'never'
        && payload.clientSetups?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.openAiCompatible?.responsesCreate?.tools?.[0]?.server_url === `${canonicalBaseUrl}/mcp`
        && Array.isArray(tools)
        && tools.length === expectedMcpToolEntries.length
        && JSON.stringify(tools) === JSON.stringify(expectedMcpToolEntries)
        && payload.capabilities?.resources
        && payload.capabilities?.prompts?.listChanged === false
        && JSON.stringify(payload.prompts) === JSON.stringify(expectedPrompts)
        && JSON.stringify(payload.resourceTemplates) === JSON.stringify(expectedResourceTemplates)
        && payload.capabilities?.extensions?.[AGENTIC_OS_MCP_APPS_EXTENSION_ID]?.mimeTypes?.includes(AGENTIC_OS_MCP_APPS_RESOURCE_MIME_TYPE)
        && inspectTool?._meta?.ui?.resourceUri === AGENTIC_OS_MCP_APP_RESOURCE_URI
        && inspectTool?._meta?.['openai/outputTemplate'] === AGENTIC_OS_MCP_APP_RESOURCE_URI
        && inspectTool?.securitySchemes?.[0]?.type === 'noauth'
        && inspectTool?._meta?.securitySchemes?.[0]?.type === 'noauth'
        && inspectTool?._meta?.['openai/widgetAccessible'] === true
        && inspectTool?.outputSchema?.type === 'object'
        && hasReadOnlyAnnotations(inspectTool)
        && searchTool?.outputSchema?.required?.includes('ids')
        && searchTool?.outputSchema?.required?.includes('results')
        && hasReadOnlyAnnotations(searchTool)
        && fetchTool?.outputSchema?.required?.includes('content')
        && fetchTool?.outputSchema?.required?.includes('text')
        && fetchTool?.outputSchema?.required?.includes('url')
        && hasReadOnlyAnnotations(fetchTool)
    },
  },
  {
    name: 'mcp-card-alias',
    url: `${baseUrl}/.well-known/mcp.json`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && payload.transport?.url === `${canonicalBaseUrl}/mcp`
        && payload.transport?.type === AGENTIC_OS_MCP_REMOTE_TRANSPORT_TYPE
        && Array.isArray(payload.capabilities?.tools)
        && payload.capabilities?.prompts?.listChanged === false
    },
  },
  {
    name: 'mcp-initialize',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'agentic-graph-agent-ready-smoke', version: '1.0.0' },
      },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && payload.jsonrpc === '2.0'
        && payload.result?.serverInfo?.name
        && payload.result?.capabilities?.tools
        && payload.result?.capabilities?.resources
        && payload.result?.capabilities?.extensions?.[AGENTIC_OS_MCP_APPS_EXTENSION_ID]?.mimeTypes?.includes(AGENTIC_OS_MCP_APPS_RESOURCE_MIME_TYPE)
    },
  },
  {
    name: 'mcp-streamable-http-sse-get-declined',
    url: `${baseUrl}/mcp`,
    accept: 'text/event-stream',
    assert: async (response, body) => response.status === 405 && body === '',
  },
  {
    name: 'mcp-initialized-notification-accepted',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
    assert: async (response, body) => response.status === 202 && body === '',
  },
  {
    name: 'mcp-tools-list',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const inspectTool = Array.isArray(payload.result?.tools)
        ? payload.result.tools.find((tool) => tool?.name === 'inspect_agent_surface')
        : null
      const searchTool = Array.isArray(payload.result?.tools)
        ? payload.result.tools.find((tool) => tool?.name === 'search')
        : null
      const fetchTool = Array.isArray(payload.result?.tools)
        ? payload.result.tools.find((tool) => tool?.name === 'fetch')
        : null
      const tools = Array.isArray(payload.result?.tools)
        ? payload.result.tools
          .map((tool) => toComparableMcpToolEntry(tool || {}))
          .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
        : null
      return response.ok
        && Array.isArray(tools)
        && tools.length === expectedMcpToolEntries.length
        && JSON.stringify(tools) === JSON.stringify(expectedMcpToolEntries)
        && inspectTool?._meta?.ui?.resourceUri === AGENTIC_OS_MCP_APP_RESOURCE_URI
        && inspectTool?._meta?.['openai/outputTemplate'] === AGENTIC_OS_MCP_APP_RESOURCE_URI
        && inspectTool?.securitySchemes?.[0]?.type === 'noauth'
        && inspectTool?._meta?.securitySchemes?.[0]?.type === 'noauth'
        && inspectTool?._meta?.['openai/widgetAccessible'] === true
        && inspectTool?.outputSchema?.type === 'object'
        && hasReadOnlyAnnotations(inspectTool)
        && searchTool?.outputSchema?.required?.includes('ids')
        && searchTool?.outputSchema?.required?.includes('results')
        && hasReadOnlyAnnotations(searchTool)
        && fetchTool?.outputSchema?.required?.includes('content')
        && fetchTool?.outputSchema?.required?.includes('text')
        && fetchTool?.outputSchema?.required?.includes('url')
        && hasReadOnlyAnnotations(fetchTool)
    },
  },
  {
    name: 'mcp-prompts-list',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 29,
      method: 'prompts/list',
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && JSON.stringify(payload.result?.prompts) === JSON.stringify(expectedPrompts)
    },
  },
  {
    name: 'mcp-prompts-get-source-files-research',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 30,
      method: 'prompts/get',
      params: {
        name: AGENTIC_OS_AGENT_READY_PROMPT_NAMES.researchSourceFiles,
        arguments: {
          query: deepResearchSearchQuery,
          limit: '3',
        },
      },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const text = String(payload.result?.messages?.[0]?.content?.text || '')
      return response.ok
        && payload.result?.messages?.[0]?.role === 'user'
        && text.includes('Call search')
        && text.includes('call fetch')
        && text.includes(deepResearchSearchQuery)
    },
  },
  {
    name: 'mcp-resource-templates-list',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 31,
      method: 'resources/templates/list',
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && JSON.stringify(payload.result?.resourceTemplates) === JSON.stringify(expectedResourceTemplates)
    },
  },
  {
    name: 'mcp-apps-resources-list',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 23,
      method: 'resources/list',
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const resource = Array.isArray(payload.result?.resources)
        ? payload.result.resources.find((entry) => entry?.uri === AGENTIC_OS_MCP_APP_RESOURCE_URI)
        : null
      return response.ok
        && resource?.mimeType === AGENTIC_OS_MCP_APPS_RESOURCE_MIME_TYPE
        && resource?._meta?.ui?.prefersBorder === true
    },
  },
  {
    name: 'mcp-apps-resources-read',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 24,
      method: 'resources/read',
      params: { uri: AGENTIC_OS_MCP_APP_RESOURCE_URI },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const content = payload.result?.contents?.[0]
      return response.ok
        && content?.uri === AGENTIC_OS_MCP_APP_RESOURCE_URI
        && content?.mimeType === AGENTIC_OS_MCP_APPS_RESOURCE_MIME_TYPE
        && content?._meta?.ui?.prefersBorder === true
        && String(content?.text || '').includes(AGENTIC_OS_MCP_APPS_PROTOCOL_VERSION)
        && String(content?.text || '').includes("request('ui/initialize'")
        && String(content?.text || '').includes('appCapabilities')
        && String(content?.text || '').includes('ui/notifications/initialized')
        && String(content?.text || '').includes('ui/notifications/tool-result')
        && String(content?.text || '').includes('ui/notifications/tool-input-partial')
        && String(content?.text || '').includes('ui/notifications/tool-cancelled')
        && String(content?.text || '').includes('ui/notifications/host-context-changed')
        && String(content?.text || '').includes('ui/notifications/size-changed')
        && String(content?.text || '').includes('window.openai')
        && String(content?.text || '').includes('openai:set_globals')
        && String(content?.text || '').includes('openaiAppsBridge')
        && String(content?.text || '').includes('mcpAppsServerReadiness')
        && String(content?.text || '').includes('MCP Apps server-ready')
        && String(content?.text || '').includes('tools/call')
    },
  },
  {
    name: 'mcp-apps-prefixed-static-resource',
    url: `${baseUrl}/.well-known/mcp/apps/agentic-graph-agent-ready.html`,
    accept: 'text/html',
    assert: async (response, body) =>
      response.ok
      && String(response.headers.get('content-type') || '').includes(AGENTIC_OS_MCP_APPS_RESOURCE_MIME_TYPE)
      && body.includes(AGENTIC_OS_MCP_APP_RESOURCE_URI)
      && body.includes('window.openai')
      && body.includes('openai:set_globals')
      && body.includes('openaiAppsBridge')
      && body.includes("request('ui/initialize'")
      && !body.includes('<div id="root"></div>'),
  },
  {
    name: 'mcp-source-file-resource-read',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 32,
      method: 'resources/read',
      params: { uri: buildAgenticGraphSourceFileResourceUri(deepResearchFetchId) },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const content = payload.result?.contents?.[0]
      return response.ok
        && content?.uri === buildAgenticGraphSourceFileResourceUri(deepResearchFetchId)
        && content?.mimeType === AGENTIC_OS_SOURCE_FILE_RESOURCE_MIME_TYPE
        && content?._meta?.id === deepResearchFetchId
        && content?._meta?.metadata?.canonicalPath === deepResearchFetchCanonicalPath
        && String(content?.text || '').trim().length > 0
    },
  },
  {
    name: 'mcp-list-source-files',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'list_source_files',
        arguments: {},
      },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const result = payload.result?.structuredContent
      return response.ok
        && payload.result?.isError === false
        && result?.workspaceId === defaultWorkspaceId
        && typeof result?.markdownIndex === 'string'
        && result.markdownIndex.includes('/api/storage/doc-default/')
        && result.markdownIndex.length > 0
    },
  },
  {
    name: 'mcp-search-source-files',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 25,
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: {
          query: deepResearchSearchQuery,
          limit: 10,
        },
      },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const result = payload.result?.structuredContent
      return response.ok
        && payload.result?.isError === false
        && Array.isArray(result?.ids)
        && result.ids.length > 0
        && result.ids.every((id) => typeof id === 'string' && id.startsWith('kgdoc:'))
        && Array.isArray(result?.results)
        && result.results.length === result.ids.length
        && result.results.every((entry) =>
          result.ids.includes(entry?.id)
          && typeof entry?.title === 'string'
          && typeof entry?.url === 'string'
          && typeof entry?.canonicalPath === 'string',
        )
    },
  },
  {
    name: 'mcp-search-source-files-content-aware',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 33,
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: {
          query: contentAwareSearchQuery,
          limit: 5,
        },
      },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const result = payload.result?.structuredContent
      return response.ok
        && payload.result?.isError === false
        && Array.isArray(result?.ids)
        && result.ids.length > 0
        && result.results?.some((entry) =>
          String(entry?.canonicalPath || '') === 'agentic-canvas-os/docs/AGENT-DEFINITIONS.md'
          && normalizeSearchEvidence(entry?.snippet).includes(contentAwareSearchEvidence),
        )
    },
  },
  {
    name: 'mcp-fetch-source-file',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 26,
      method: 'tools/call',
      params: {
        name: 'fetch',
        arguments: {
          id: deepResearchFetchId,
        },
      },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const result = payload.result?.structuredContent
      return response.ok
        && payload.result?.isError === false
        && result?.id === deepResearchFetchId
        && result?.metadata?.canonicalPath === deepResearchFetchCanonicalPath
        && result?.metadata?.contentType === 'text/markdown'
        && typeof result?.url === 'string'
        && result.text === result.content
        && typeof result?.content === 'string'
        && result.content.trim().length > 0
    },
  },
  {
    name: 'mcp-read-source-file',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'read_source_file',
        arguments: {
          canonicalPath: sharedDocSample?.canonicalPath || preferredSharedDocSample.canonicalPath,
        },
      },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const result = payload.result?.structuredContent
      return response.ok
        && payload.result?.isError === false
        && result?.workspaceId === defaultWorkspaceId
        && result?.canonicalPath === (sharedDocSample?.canonicalPath || preferredSharedDocSample.canonicalPath)
        && typeof result?.markdown === 'string'
        && result.markdown.trim().length > 0
    },
  },
  ...(sharedDocSample
    ? [{
        name: 'mcp-read-shared-document',
        url: `${baseUrl}/mcp`,
        method: 'POST',
        accept: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'read_shared_document',
            arguments: {
              shareUrl: sharedDocSample.shareUrl,
            },
          },
        }),
        assert: async (response, body) => {
          const payload = JSON.parse(body)
          const result = payload.result?.structuredContent
          return response.ok
            && payload.result?.isError === false
            && result?.canonicalPath === sharedDocSample.canonicalPath
            && result?.workspaceId === sharedDocSample.workspaceId
            && String(result?.markdown || '').trim() === sharedDocSample.markdown.trim()
        },
      },
      {
        name: 'mcp-inspect-shared-document-structure',
        url: `${baseUrl}/mcp`,
        method: 'POST',
        accept: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'inspect_shared_document_structure',
            arguments: {
              shareUrl: sharedDocSample.shareUrl,
            },
          },
        }),
        assert: async (response, body) => {
          const payload = JSON.parse(body)
          const result = payload.result?.structuredContent
          return response.ok
            && payload.result?.isError === false
            && result?.canonicalPath === sharedDocSample.canonicalPath
            && result?.workspaceId === sharedDocSample.workspaceId
            && typeof result?.hasFrontmatter === 'boolean'
            && Array.isArray(result?.topLevelKeys)
            && typeof result?.headingCount === 'number'
            && typeof result?.markdownLength === 'number'
            && result.markdownLength > 0
        },
      }]
    : []),
  {
    name: 'mcp-inspect-agent-surface',
    url: `${baseUrl}/mcp`,
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'inspect_agent_surface',
        arguments: {},
      },
    }),
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const result = payload.result?.structuredContent
      return response.ok
        && payload.result?.isError === false
        && result?.healthUrl === `${canonicalBaseUrl}/health`
        && result?.mcpUrl === `${canonicalBaseUrl}/mcp`
        && result?.mcpServerCard?.transport?.url === `${canonicalBaseUrl}/mcp`
        && result?.mcpServerCard?.transport?.type === AGENTIC_OS_MCP_REMOTE_TRANSPORT_TYPE
        && result?.mcpAppsServerReadiness?.ready === true
        && result.mcpAppsServerReadiness.tool?.name === 'inspect_agent_surface'
        && result.mcpAppsServerReadiness.tool?.securitySchemes?.[0]?.type === 'noauth'
        && result.mcpAppsServerReadiness.tool?.mirroredSecuritySchemes?.[0]?.type === 'noauth'
        && result.mcpAppsServerReadiness.tool?.widgetAccessible === true
        && result.mcpAppsServerReadiness.tool?.openAiWidgetBridge === true
        && result.mcpAppsServerReadiness.tool?.annotationsReady === true
        && result.mcpAppsServerReadiness.tool?.openWorld === false
        && result.mcpAppsServerReadiness.tool?.destructive === false
        && result.mcpAppsServerReadiness.tool?.idempotent === true
        && result.mcpAppsServerReadiness.prompts?.ready === true
        && result.mcpAppsServerReadiness.prompts?.names?.includes(AGENTIC_OS_AGENT_READY_PROMPT_NAMES.researchSourceFiles)
        && result.mcpAppsServerReadiness.prompts?.names?.includes(AGENTIC_OS_AGENT_READY_PROMPT_NAMES.inspectAgentSurface)
        && result.mcpAppsServerReadiness.resourceTemplates?.ready === true
        && result.mcpAppsServerReadiness.resourceTemplates?.uriTemplates?.includes(expectedResourceTemplates[0]?.uriTemplate)
        && result.mcpAppsServerReadiness.resource?.mimeType === AGENTIC_OS_MCP_APPS_RESOURCE_MIME_TYPE
        && result.mcpAppsServerReadiness.resource?.openAiWidgetBridge === true
        && Array.isArray(result.mcpAppsServerReadiness.transports)
        && result.mcpAppsServerReadiness.transports.some((transport) => transport?.id === 'pages-http-jsonrpc' && transport?.type === AGENTIC_OS_MCP_REMOTE_TRANSPORT_TYPE)
        && result.mcpAppsServerReadiness.transports.some((transport) => transport?.id === 'local-stdio-jsonrpc')
        && Array.isArray(result.mcpAppsServerReadiness.checklist)
        && result.mcpAppsServerReadiness.checklist.every((check) => check?.ok === true)
        && result.mcpAppsServerReadiness.clients?.[AGENTIC_OS_MCP_CLIENT_IDS.qwenCode]?.settingsJson?.mcpServers?.['agentic-graph']?.httpUrl === `${canonicalBaseUrl}/mcp`
        && String(result.mcpAppsServerReadiness.clients?.[AGENTIC_OS_MCP_CLIENT_IDS.qwenCode]?.command || '').includes(`qwen mcp add --transport http agentic-graph ${canonicalBaseUrl}/mcp`)
        && result.mcpAppsServerReadiness.checklist.some((check) => check?.id === 'qwen-code-http-client-setup' && check?.ok === true)
        && result.mcpAppsServerReadiness.clients?.[AGENTIC_OS_MCP_CLIENT_IDS.kimiCli]?.mcpJson?.mcpServers?.['agentic-graph']?.url === `${canonicalBaseUrl}/mcp`
        && String(result.mcpAppsServerReadiness.clients?.[AGENTIC_OS_MCP_CLIENT_IDS.kimiCli]?.command || '').includes(`kimi mcp add --transport http agentic-graph ${canonicalBaseUrl}/mcp`)
        && result.mcpAppsServerReadiness.checklist.some((check) => check?.id === 'kimi-cli-http-client-setup' && check?.ok === true)
        && result.mcpAppsServerReadiness.clients?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.tools?.[0]?.server_url === `${canonicalBaseUrl}/mcp`
        && result.mcpAppsServerReadiness.clients?.[AGENTIC_OS_MCP_CLIENT_IDS.bytePlusModelArk]?.requiredHeaders?.['ark-beta-mcp'] === 'true'
        && result.mcpAppsServerReadiness.checklist.some((check) => check?.id === 'byteplus-modelark-responses-mcp-setup' && check?.ok === true)
        && result.mcpAppsServerReadiness.retrieval?.mode === 'deep-research-search-fetch'
        && result.mcpAppsServerReadiness.retrieval?.tools?.every((tool) =>
          tool?.readOnly === true
          && tool?.outputSchemaReady === true
          && tool?.annotationsReady === true
          && tool?.openWorld === false
          && tool?.destructive === false
          && tool?.idempotent === true
        )
        && result.mcpAppsServerReadiness.retrieval?.tools?.some((tool) => tool?.name === 'search' && tool?.requiredOutputFields?.includes('ids'))
        && result.mcpAppsServerReadiness.retrieval?.tools?.some((tool) => tool?.name === 'fetch' && tool?.requiredOutputFields?.includes('content') && tool?.requiredOutputFields?.includes('text'))
        && Array.isArray(result?.agentSkills?.skills)
        && result.agentSkills.skills.length > 0
    },
  },
  {
    name: 'agent-skills',
    url: `${baseUrl}/.well-known/agent-skills/index.json`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && Array.isArray(payload.skills)
        && payload.skills.length === expectedAgentSkills.length
        && expectedAgentSkills.every((expectedSkill) =>
          payload.skills.some((skill) =>
            skill?.name === expectedSkill.name
            && skill?.type === expectedSkill.type
            && skill?.description === expectedSkill.description
            && skill?.url === `${canonicalBaseUrl}${expectedSkill.path}`,
          ))
        && payload.skills.every((skill) =>
          skill.name
          && skill.type
          && skill.url
          && skill.sha256
          && skill.vdeoxpln?.id === skill.name
          && String(skill.vdeoxpln?.semanticKey || '').startsWith('kgvx_'))
    },
  },
  ...expectedAgentSkills.map((expectedSkill) => ({
    name: `agent-skill-${expectedSkill.name}-markdown`,
    url: `${baseUrl}${expectedSkill.path}`,
    accept: 'text/markdown',
    assert: async (response, body) =>
      response.ok
      && response.headers.get('content-type')?.includes('text/markdown')
      && body.includes(`# ${expectedSkill.vdeoxpln.title} Skill`)
      && body.includes(`Vdeoxpln id: \`${expectedSkill.name}\``)
      && body.includes(`Semantic key: \`${expectedSkill.vdeoxpln.semanticKey}\``)
      && body.includes('Do not add compatibility aliases for stale vdeoxpln ids.'),
  })),
  {
    name: 'jwks',
    url: `${baseUrl}/.well-known/http-message-signatures-directory`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok && Array.isArray(payload.keys) && payload.keys.length > 0
    },
  },
  {
    name: 'root-robots-alias',
    url: `${originUrl}/robots.txt`,
    accept: '*/*',
    assert: async (response, body) => response.ok && /Sitemap:/.test(body) && /User-agent: GPTBot/.test(body),
  },
  {
    name: 'root-api-catalog-alias',
    url: `${originUrl}/.well-known/api-catalog`,
    accept: 'application/linkset+json',
    assert: async (response, body) => response.ok && JSON.parse(body).linkset?.[0]?.anchor,
  },
  {
    name: 'root-openapi-alias',
    url: `${originUrl}/.well-known/openapi.json`,
    accept: 'application/json',
    assert: async (response, body) => response.ok && JSON.parse(body).paths?.['/agentic-graph/health']?.get,
  },
  {
    name: 'root-a2a-agent-card',
    url: rootA2aAgentCardUrl,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && payload.url === `${canonicalBaseUrl}/mcp`
        && Array.isArray(payload.skills)
        && payload.skills.length > 0
    },
  },
  {
    name: 'root-mcp-card-alias',
    url: `${originUrl}/.well-known/mcp/server-card.json`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && payload.transport?.url === `${canonicalBaseUrl}/mcp`
        && payload.transport?.type === AGENTIC_OS_MCP_REMOTE_TRANSPORT_TYPE
    },
  },
  {
    name: 'root-agent-skills-alias',
    url: `${originUrl}/.well-known/agent-skills/index.json`,
    accept: 'application/json',
    assert: async (response, body) => response.ok && Array.isArray(JSON.parse(body).skills),
  },
  ...buildAgentReadyCommerceChecks({ originUrl, includeX402: process.env.AGENTIC_OS_AGENT_READY_INCLUDE_X402 !== 'false' }),
  {
    name: 'webmcp-html-marker',
    url: `${baseUrl}/?agentReadySmoke=1`,
    accept: 'text/html',
    assert: async (response, body) =>
      response.ok
      && expectedWebToolNames.every((toolName) => body.includes(toolName))
      && expectedBrowserOnlyWebToolNames.every((toolName) => !body.includes(toolName))
      && body.includes('modelContext')
      && body.includes('kgWebmcpTools')
      && body.includes('toolDefinitions')
      && body.includes('toolExecutors'),
  },
  {
    name: 'webmcp-html-lifecycle-contract',
    url: `${baseUrl}/?agentReadySmoke=1`,
    accept: 'text/html',
    assert: async (response, body) =>
      response.ok
      && body.split(WEB_MCP_LIFECYCLE_SCRIPT_MARKER).length === 2
      && expectedWebMcpLifecycleTokens.every((token) => body.includes(token)),
  },
]

let failed = 0
for (const check of checks) {
  try {
    const response = await fetch(toRequestUrl(check.url), {
      method: check.method || 'GET',
      headers: { accept: check.accept },
      body: check.body,
    })
    const body = check.method === 'HEAD' ? '' : await response.text()
    if (await check.assert(response, body)) {
      console.log(`ok ${check.name}`)
    } else {
      failed += 1
      console.error(`not ok ${check.name}: ${describeFailure(check.name, response, body)}`)
    }
  } catch (error) {
    failed += 1
    console.error(`not ok ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failed > 0) {
  console.error(`[agentic-graph] agent-ready smoke failed: ${failed}/${checks.length}`)
  process.exitCode = 1
} else {
  console.log(`[agentic-graph] agent-ready smoke passed: ${checks.length}/${checks.length}`)
}
