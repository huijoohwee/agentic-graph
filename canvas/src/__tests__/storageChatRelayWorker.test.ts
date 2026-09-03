import storageWorker from '../../../cloudflare/workers/agentic-graph-storage/index.ts'
import { createFakeAgenticGraphStorageWorkerEnv, FakeAgenticGraphStorageD1Database } from '@/__tests__/helpers/fake-agentic-graph-storage-d1'
import {
  AGENTIC_OS_STORAGE_API_VERSION,
  buildAgenticGraphStorageChatAuditPath,
  buildAgenticGraphStorageChatPoliciesPath,
  buildAgenticGraphStorageChatRelayPath,
  buildAgenticGraphStorageChatSessionPath,
} from '@/lib/storage/agentic-graph-storage-sync-contract'

const readStorageWorker = (): { fetch: (request: Request, env: never) => Promise<Response> } => {
  const candidate = storageWorker as unknown as {
    fetch?: (request: Request, env: never) => Promise<Response>
    default?: { fetch?: (request: Request, env: never) => Promise<Response> }
  }
  const fetchImpl = candidate.fetch || candidate.default?.fetch
  if (!fetchImpl) throw new Error('expected storage worker test module to expose fetch')
  return { fetch: fetchImpl }
}

const createStorageWorkerFetch = (env: ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv>) =>
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    return readStorageWorker().fetch(request, env as never)
  }

const hashToken = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const readHeaderValue = (headers: HeadersInit | undefined, name: string): string => {
  if (!headers) return ''
  if (headers instanceof Headers) return String(headers.get(name) || '')
  if (Array.isArray(headers)) {
    const entry = headers.find(([headerName]) => String(headerName).toLowerCase() === name.toLowerCase())
    return String(entry?.[1] || '')
  }
  const record = headers as Record<string, string>
  return String(record[name] || record[name.toLowerCase()] || '')
}

const seedAuthenticatedWorkspace = async (db: FakeAgenticGraphStorageD1Database, args?: {
  token?: string
  workspaceId?: string
  role?: 'viewer' | 'editor' | 'owner' | 'provider-admin'
}) => {
  const token = args?.token || 'session-token'
  const workspaceId = args?.workspaceId || 'workspace:chat'
  const role = args?.role || 'editor'
  const userId = 'user:alice'
  const sessionId = 'sess:alice'
  const membershipId = 'mbr:alice'
  const nowIso = '2026-06-15T10:00:00.000Z'
  db.workspaces.set(workspaceId, {
    id: workspaceId,
    slug: workspaceId,
    title: workspaceId,
    visibility: 'private',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.users.set(userId, {
    id: userId,
    email: 'alice@example.com',
    display_name: 'Alice',
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.authSessions.set(sessionId, {
    id: sessionId,
    user_id: userId,
    session_hash: await hashToken(token),
    expires_at: '2030-01-01T00:00:00.000Z',
    revoked_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.workspaceMemberships.set(membershipId, {
    id: membershipId,
    workspace_id: workspaceId,
    user_id: userId,
    role,
    status: 'active',
    invited_by_user_id: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
  return { token, userId, sessionId, membershipId, workspaceId }
}

export async function testStorageChatSessionRouteResolvesUserAndMemberships() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const db = env.DB as FakeAgenticGraphStorageD1Database
  const { token, workspaceId } = await seedAuthenticatedWorkspace(db, { role: 'owner' })
  const response = await createStorageWorkerFetch(env)(`https://example.com${buildAgenticGraphStorageChatSessionPath()}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) throw new Error(`Expected session route to succeed, got ${response.status}`)
  const body = await response.json() as {
    user?: { email?: string }
    memberships?: Array<{ workspaceId?: string; role?: string }>
  }
  if (body.user?.email !== 'alice@example.com') {
    throw new Error(`Expected resolved session user email, got ${JSON.stringify(body)}`)
  }
  if (!body.memberships?.some(entry => entry.workspaceId === workspaceId && entry.role === 'owner')) {
    throw new Error(`Expected session route to include the active workspace membership, got ${JSON.stringify(body.memberships)}`)
  }
}

export async function testStorageChatPoliciesRouteReturnsWorkspaceProviderPolicies() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const db = env.DB as FakeAgenticGraphStorageD1Database
  const { token, workspaceId } = await seedAuthenticatedWorkspace(db, { role: 'provider-admin' })
  db.workspaceProviderPolicies.set('policy:agnes', {
    id: 'policy:agnes',
    workspace_id: workspaceId,
    provider_id: 'agnes-ai',
    allow_server_managed: 1,
    allow_byok: 1,
    monthly_request_limit: 300,
    monthly_token_limit: 500000,
    monthly_spend_limit_cents: 2500,
    default_model: 'agnes-2.0-flash',
    created_at: '2026-06-15T10:00:00.000Z',
    updated_at: '2026-06-15T10:00:00.000Z',
  })
  const response = await createStorageWorkerFetch(env)(`https://example.com${buildAgenticGraphStorageChatPoliciesPath(workspaceId)}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) throw new Error(`Expected policies route to succeed, got ${response.status}`)
  const body = await response.json() as { policies?: Array<{ providerId?: string; allowServerManaged?: boolean }> }
  if (!body.policies?.some(policy => policy.providerId === 'agnes-ai' && policy.allowServerManaged === true)) {
    throw new Error(`Expected policies route to expose the Agnes server-managed policy, got ${JSON.stringify(body)}`)
  }
}

export async function testStorageChatRelayRouteDelegatesAndWritesAudit() {
  const env = createFakeAgenticGraphStorageWorkerEnv() as ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv> & {
    AGENTIC_OS_STORAGE_CHAT_PROXY_BASE_URL?: string
  }
  env.AGENTIC_OS_STORAGE_CHAT_PROXY_BASE_URL = 'https://airvio.co'
  const db = env.DB as FakeAgenticGraphStorageD1Database
  const { token, workspaceId } = await seedAuthenticatedWorkspace(db, { role: 'editor' })
  db.workspaceProviderPolicies.set('policy:agnes', {
    id: 'policy:agnes',
    workspace_id: workspaceId,
    provider_id: 'agnes-ai',
    allow_server_managed: 1,
    allow_byok: 1,
    monthly_request_limit: null,
    monthly_token_limit: null,
    monthly_spend_limit_cents: null,
    default_model: 'agnes-2.0-flash',
    created_at: '2026-06-15T10:00:00.000Z',
    updated_at: '2026-06-15T10:00:00.000Z',
  })
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (!url.startsWith('https://airvio.co/__chat_proxy/v1/chat/completions')) {
        throw new Error(`Unexpected relay URL ${url}`)
      }
      if (readHeaderValue(init?.headers, 'x-kg-chat-provider') !== 'agnes-ai') {
        throw new Error('Expected relay to forward the provider header to __chat_proxy')
      }
      return new Response(JSON.stringify({
        id: 'chatcmpl:test',
        choices: [{ message: { role: 'assistant', content: 'pong' } }],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch
    const response = await createStorageWorkerFetch(env)(`https://example.com${buildAgenticGraphStorageChatRelayPath()}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-client-request-id': 'req:test-relay',
      },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId,
        providerId: 'agnes-ai',
        authMode: 'serverManaged',
        model: 'agnes-2.0-flash',
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
      }),
    })
    if (!response.ok) throw new Error(`Expected relay route to succeed, got ${response.status}`)
    const body = await response.json() as { providerId?: string; upstreamStatus?: number; body?: { choices?: Array<{ message?: { content?: string } }> } }
    if (body.providerId !== 'agnes-ai' || body.upstreamStatus !== 200 || body.body?.choices?.[0]?.message?.content !== 'pong') {
      throw new Error(`Expected relay route to return the proxied response body, got ${JSON.stringify(body)}`)
    }
    const auditRows = Array.from(db.chatProxyAudit.values())
    if (auditRows.length !== 1) {
      throw new Error(`Expected relay route to persist one audit row, got ${auditRows.length}`)
    }
    if (auditRows[0]?.provider_id !== 'agnes-ai' || auditRows[0]?.auth_mode !== 'serverManaged' || auditRows[0]?.relay_status !== 'allowed') {
      throw new Error(`Expected audit row to capture the provider, auth mode, and allowed status, got ${JSON.stringify(auditRows[0])}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testStorageChatRelayRouteForwardsOpenAiResponsesInput() {
  const env = createFakeAgenticGraphStorageWorkerEnv() as ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv> & {
    AGENTIC_OS_STORAGE_CHAT_PROXY_BASE_URL?: string
  }
  env.AGENTIC_OS_STORAGE_CHAT_PROXY_BASE_URL = 'https://airvio.co'
  const db = env.DB as FakeAgenticGraphStorageD1Database
  const { token, workspaceId } = await seedAuthenticatedWorkspace(db, { role: 'editor' })
  db.workspaceProviderPolicies.set('policy:openai', {
    id: 'policy:openai',
    workspace_id: workspaceId,
    provider_id: 'openai',
    allow_server_managed: 1,
    allow_byok: 1,
    monthly_request_limit: null,
    monthly_token_limit: null,
    monthly_spend_limit_cents: null,
    default_model: 'gpt-5-nano',
    created_at: '2026-06-15T10:00:00.000Z',
    updated_at: '2026-06-15T10:00:00.000Z',
  })
  let forwardedBody: Record<string, unknown> | null = null
  let forwardedAiGatewayMetadata = ''
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (!url.startsWith('https://airvio.co/__chat_proxy/v1/chat/completions')) {
        throw new Error(`Unexpected relay URL ${url}`)
      }
      if (readHeaderValue(init?.headers, 'x-kg-chat-provider') !== 'openai') {
        throw new Error('Expected relay to forward the OpenAI provider header to __chat_proxy')
      }
      if (readHeaderValue(init?.headers, 'x-kg-chat-upstream') !== 'https://api.openai.com/v1/responses') {
        throw new Error('Expected relay to forward the Responses upstream endpoint header')
      }
      if (readHeaderValue(init?.headers, 'x-kg-ai-gateway-route') !== 'dynamic/draft') {
        throw new Error('Expected relay to forward the AI Gateway draft route header')
      }
      if (readHeaderValue(init?.headers, 'x-kg-ai-gateway-cache-ttl') !== '120') {
        throw new Error('Expected relay to derive the workspace AI Gateway cache TTL header')
      }
      forwardedAiGatewayMetadata = readHeaderValue(init?.headers, 'x-kg-ai-gateway-metadata')
      forwardedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({ output_text: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch
    const response = await createStorageWorkerFetch(env)(`https://example.com${buildAgenticGraphStorageChatRelayPath()}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-client-request-id': 'req:test-responses-relay',
      },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId,
        providerId: 'openai',
        authMode: 'serverManaged',
        endpointUrl: 'https://api.openai.com/v1/responses',
        model: 'gpt-5-nano',
        messages: [{ role: 'user', content: "what's in [attached image]" }],
        requestSurface: 'responses',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: "what's in [attached image]" },
              { type: 'input_image', image_url: 'data:image/png;base64,iVBORw==', detail: 'auto' },
            ],
          },
        ],
        stream: false,
        aiGatewayRoute: 'dynamic/draft',
        aiGatewayMetadata: {
          intent: 'draft',
          request_surface: 'responses',
          context_scope: 'workspace',
          workspace_context_cache_key: 'workspace:ctx:kgc',
        },
        providerOptions: { max_output_tokens: 512 },
      }),
    })
    if (!response.ok) throw new Error(`Expected Responses relay route to succeed, got ${response.status}`)
    if (!forwardedBody) throw new Error('Expected relay to forward a provider request body')
    const bodyText = JSON.stringify(forwardedBody)
    if (bodyText.includes('"messages"') || bodyText.includes('kg_media_token') || bodyText.includes('localhost')) {
      throw new Error(`Expected Responses relay provider body to use input without local media leakage, got ${bodyText}`)
    }
    const input = Array.isArray(forwardedBody.input) ? forwardedBody.input as Array<Record<string, unknown>> : []
    const content = Array.isArray(input[0]?.content) ? input[0]?.content as Array<Record<string, unknown>> : []
    const imagePart = content.find(part => part.type === 'input_image')
    if (forwardedBody.model !== 'gpt-5-nano' || forwardedBody.max_output_tokens !== 512 || !imagePart) {
      throw new Error(`Expected Responses relay provider body to preserve model, options, and input_image, got ${bodyText}`)
    }
    const metadata = JSON.parse(String(forwardedAiGatewayMetadata || '{}'))
    if (metadata.intent !== 'draft' || metadata.request_surface !== 'responses') {
      throw new Error(`Expected relay to forward AI Gateway metadata, got ${JSON.stringify(metadata)}`)
    }
    const auditRows = Array.from(db.chatProxyAudit.values())
    if (auditRows[0]?.provider_id !== 'openai' || auditRows[0]?.auth_mode !== 'serverManaged' || auditRows[0]?.relay_status !== 'allowed') {
      throw new Error(`Expected audit row to capture OpenAI Responses relay status, got ${JSON.stringify(auditRows[0])}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testStorageChatRelayRouteDerivesShortAiGatewayCacheTtlWithoutWorkspaceCacheKey() {
  const env = createFakeAgenticGraphStorageWorkerEnv() as ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv> & {
    AGENTIC_OS_STORAGE_CHAT_PROXY_BASE_URL?: string
  }
  env.AGENTIC_OS_STORAGE_CHAT_PROXY_BASE_URL = 'https://airvio.co'
  const db = env.DB as FakeAgenticGraphStorageD1Database
  const { token, workspaceId } = await seedAuthenticatedWorkspace(db, { role: 'editor' })
  db.workspaceProviderPolicies.set('policy:openai', {
    id: 'policy:openai',
    workspace_id: workspaceId,
    provider_id: 'openai',
    allow_server_managed: 1,
    allow_byok: 1,
    monthly_request_limit: null,
    monthly_token_limit: null,
    monthly_spend_limit_cents: null,
    default_model: 'gpt-5-nano',
    created_at: '2026-06-15T10:00:00.000Z',
    updated_at: '2026-06-15T10:00:00.000Z',
  })
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (!url.startsWith('https://airvio.co/__chat_proxy/v1/chat/completions')) {
        throw new Error(`Unexpected relay URL ${url}`)
      }
      if (readHeaderValue(init?.headers, 'x-kg-ai-gateway-cache-ttl') !== '60') {
        throw new Error(`Expected relay to derive the short AI Gateway cache TTL header, got ${readHeaderValue(init?.headers, 'x-kg-ai-gateway-cache-ttl')}`)
      }
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'pong' } }] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch
    const response = await createStorageWorkerFetch(env)(`https://example.com${buildAgenticGraphStorageChatRelayPath()}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-client-request-id': 'req:test-short-cache-relay',
      },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId,
        providerId: 'openai',
        authMode: 'serverManaged',
        endpointUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-5-nano',
        messages: [{ role: 'user', content: 'hello from short cache lane' }],
        requestSurface: 'chat-completions',
        stream: false,
        aiGatewayRoute: 'dynamic/draft',
        aiGatewayMetadata: {
          intent: 'draft',
          request_surface: 'chat-completions',
          context_scope: 'workspace',
          history_key: 'history:chat:1',
        },
      }),
    })
    if (!response.ok) throw new Error(`Expected short cache relay route to succeed, got ${response.status}`)
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testStorageChatAuditRouteRequiresElevatedRole() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const db = env.DB as FakeAgenticGraphStorageD1Database
  const { token, workspaceId, userId, membershipId } = await seedAuthenticatedWorkspace(db, { role: 'viewer' })
  db.chatProxyAudit.set('audit:1', {
    id: 'audit:1',
    workspace_id: workspaceId,
    user_id: userId,
    membership_id: membershipId,
    provider_id: 'agnes-ai',
    auth_mode: 'serverManaged',
    request_id: 'req:1',
    upstream_status: 200,
    relay_status: 'allowed',
    model_id: 'agnes-2.0-flash',
    request_bytes: 10,
    response_bytes: 20,
    latency_ms: 30,
    error_code: null,
    error_message: null,
    created_at: '2026-06-15T10:00:01.000Z',
  })
  const response = await createStorageWorkerFetch(env)(`https://example.com${buildAgenticGraphStorageChatAuditPath(workspaceId)}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
  if (response.status !== 403) {
    throw new Error(`Expected audit route to reject viewer role with 403, got ${response.status}`)
  }
}
