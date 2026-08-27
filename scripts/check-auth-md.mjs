const canonicalBaseUrl = 'https://airvio.co/agenticgraph'
const baseUrl = (process.env.AGENTICGRAPH_AGENT_READY_BASE_URL || canonicalBaseUrl).replace(/\/+$/, '')
const originUrl = new URL(baseUrl).origin
const expectedAgentAuth = {
  skill: `${originUrl}/auth.md`,
  register_uri: `${baseUrl}/agent/auth`,
  claim_uri: `${baseUrl}/agent/auth/claim`,
  revocation_uri: `${baseUrl}/agent/auth/revoke`,
}

const includesAll = (values, expected) =>
  Array.isArray(values) && expected.every(value => values.includes(value))

const hasExpectedAgentAuth = (agentAuth) =>
  agentAuth?.skill === expectedAgentAuth.skill
  && agentAuth?.register_uri === expectedAgentAuth.register_uri
  && agentAuth?.claim_uri === expectedAgentAuth.claim_uri
  && agentAuth?.revocation_uri === expectedAgentAuth.revocation_uri
  && includesAll(agentAuth?.identity_types_supported, ['anonymous', 'identity_assertion'])
  && includesAll(agentAuth?.anonymous?.credential_types_supported, ['api_key'])
  && includesAll(agentAuth?.identity_assertion?.assertion_types_supported, [
    'urn:ietf:params:oauth:token-type:id-jag',
    'verified_email',
  ])
  && includesAll(agentAuth?.identity_assertion?.credential_types_supported, ['access_token', 'api_key'])
  && includesAll(agentAuth?.events_supported, [
    'https://schemas.workos.com/events/agent/auth/identity/assertion/revoked',
  ])

const checks = [
  {
    name: 'auth-md',
    url: `${originUrl}/auth.md`,
    accept: 'text/markdown',
    assert: async (response, body) =>
      response.ok
      && response.headers.get('content-type')?.includes('text/markdown')
      && body.includes('# AgenticGraph auth.md')
      && body.includes('/.well-known/oauth-protected-resource')
      && body.includes('/.well-known/oauth-authorization-server')
      && body.includes('agent_auth')
      && body.includes(expectedAgentAuth.register_uri)
      && body.includes(expectedAgentAuth.claim_uri)
      && body.includes(expectedAgentAuth.revocation_uri)
      && body.includes('Identity assertion types')
      && body.includes('Revocation events'),
  },
  {
    name: 'auth-md-app-alias',
    url: `${baseUrl}/auth.md`,
    accept: 'text/markdown',
    assert: async (response, body) =>
      response.ok
      && response.headers.get('content-type')?.includes('text/markdown')
      && body.includes('# AgenticGraph auth.md')
      && body.includes('agent_auth')
      && body.includes(expectedAgentAuth.register_uri)
      && body.includes(expectedAgentAuth.claim_uri)
      && body.includes(expectedAgentAuth.revocation_uri)
      && body.includes('Identity assertion types')
      && body.includes('Revocation events'),
  },
  {
    name: 'oauth-protected-resource',
    url: `${originUrl}/.well-known/oauth-protected-resource`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && payload.resource === `${baseUrl}/`
        && Array.isArray(payload.authorization_servers)
        && payload.authorization_servers.includes(originUrl)
        && Array.isArray(payload.scopes_supported)
        && payload.scopes_supported.includes('agenticgraph:read')
        && Array.isArray(payload.bearer_methods_supported)
        && payload.bearer_methods_supported.includes('header')
    },
  },
  {
    name: 'oauth-authorization-server-agent-auth',
    url: `${originUrl}/.well-known/oauth-authorization-server`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      const agentAuth = payload.agent_auth
      return response.ok
        && payload.issuer === originUrl
        && payload.resource === `${baseUrl}/`
        && Array.isArray(payload.authorization_servers)
        && payload.authorization_servers.includes(originUrl)
        && hasExpectedAgentAuth(agentAuth)
    },
  },
  {
    name: 'openid-configuration-agent-auth',
    url: `${originUrl}/.well-known/openid-configuration`,
    accept: 'application/json',
    assert: async (response, body) => {
      const payload = JSON.parse(body)
      return response.ok
        && payload.issuer === originUrl
        && hasExpectedAgentAuth(payload.agent_auth)
    },
  },
]

let failed = 0
for (const check of checks) {
  try {
    const response = await fetch(check.url, { headers: { accept: check.accept } })
    const body = await response.text()
    if (await check.assert(response, body)) console.log(`ok ${check.name}`)
    else {
      failed += 1
      console.error(`not ok ${check.name}: ${response.status} ${response.headers.get('content-type') || ''}`)
    }
  } catch (error) {
    failed += 1
    console.error(`not ok ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failed > 0) {
  console.error(`[auth-md] failed: ${failed}/${checks.length}`)
  process.exit(1)
}
console.log(`[auth-md] passed: ${checks.length}/${checks.length}`)
