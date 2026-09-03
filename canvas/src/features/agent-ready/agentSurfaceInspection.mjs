import { buildAgenticGraphMcpAppsServerReadiness } from './mcpAppsReadyContract.mjs'
import { resolveAgenticOsControlPlaneMcpUrl } from './agenticOsControlPlane.mjs'

export const buildAgentSurfaceInspectionPayload = (args = {}) => {
  const baseUrl = String(args.baseUrl || '').replace(/\/+$/, '')
  const originUrl = baseUrl ? new URL(`${baseUrl}/`).origin : ''
  const payload = {
    baseUrl,
    healthUrl: `${baseUrl}/health`,
    mcpUrl: `${baseUrl}/mcp`,
    controlPlaneMcpUrl: resolveAgenticOsControlPlaneMcpUrl(baseUrl),
    apiCatalogUrl: `${baseUrl}/.well-known/api-catalog`,
    openApiUrl: `${baseUrl}/.well-known/openapi.json`,
    mcpServerCardUrl: `${baseUrl}/.well-known/mcp/server-card.json`,
    agentCardUrl: `${baseUrl}/.well-known/agent-card.json`,
    agentSkillsUrl: `${baseUrl}/.well-known/agent-skills/index.json`,
    commerceUrls: {
      acpDiscoveryUrl: `${originUrl}/.well-known/acp.json`,
      ucpProfileUrl: `${originUrl}/.well-known/ucp`,
      mppOpenApiUrl: `${originUrl}/openapi.json`,
      x402PaymentRequiredUrl: `${originUrl}/api/payments/commerce/x402`,
    },
    health: args.health,
    apiCatalog: args.apiCatalog,
    openApi: args.openApi,
    mcpServerCard: args.mcpServerCard,
    agentCard: args.agentCard,
    agentSkills: args.agentSkills,
    commerce: args.commerce,
  }
  return {
    ...payload,
    mcpAppsServerReadiness: buildAgenticGraphMcpAppsServerReadiness({
      baseUrl,
      updatedAt: args.updatedAt || args.health?.updatedAt || '',
      mcpServerCard: args.mcpServerCard,
    }),
  }
}

export const createAgentSurfaceInspectionExecutor = (args = {}) => {
  const baseUrl = String(args.baseUrl || '').replace(/\/+$/, '')
  const fetchJson = args.fetchJson
  if (!baseUrl) {
    throw new Error('baseUrl is required')
  }
  if (typeof fetchJson !== 'function') {
    throw new Error('fetchJson is required')
  }
  const fetchJsonOrNull = async (url, accept = 'application/json') => {
    try {
      return await fetchJson(url, accept)
    } catch {
      return null
    }
  }
  return async () => {
    const originUrl = new URL(`${baseUrl}/`).origin
    const [health, apiCatalog, openApi, mcpServerCard, agentCard, agentSkills, acpDiscovery, ucpProfile, mppOpenApi] = await Promise.all([
      fetchJson(`${baseUrl}/health`, 'application/health+json'),
      fetchJson(`${baseUrl}/.well-known/api-catalog`, 'application/linkset+json'),
      fetchJson(`${baseUrl}/.well-known/openapi.json`, 'application/json'),
      fetchJson(`${baseUrl}/.well-known/mcp/server-card.json`, 'application/json'),
      fetchJson(`${baseUrl}/.well-known/agent-card.json`, 'application/json'),
      fetchJson(`${baseUrl}/.well-known/agent-skills/index.json`, 'application/json'),
      fetchJsonOrNull(`${originUrl}/.well-known/acp.json`, 'application/json'),
      fetchJsonOrNull(`${originUrl}/.well-known/ucp`, 'application/json'),
      fetchJsonOrNull(`${originUrl}/openapi.json`, 'application/json'),
    ])
    return buildAgentSurfaceInspectionPayload({
      baseUrl,
      health,
      apiCatalog,
      openApi,
      mcpServerCard,
      agentCard,
      agentSkills,
      commerce: { acpDiscovery, ucpProfile, mppOpenApi },
    })
  }
}
