import {
  AGNES_HOST,
  AI_GATEWAY_HOST,
  BYTEPLUS_AP_SOUTHEAST_HOST,
  BYTEPLUS_EU_WEST_HOST,
  CLOUDFLARE_API_HOST,
  MIROMIND_HOST,
  OPENAI_HOST,
  corsHeaders,
  handleOptions,
  isLocalHost,
  jsonResponse,
  normalizeHost,
  parseAllowedHosts,
  readHeader,
} from './runtime-integration-hub.mjs';

const CHAT_PROXY_PREFIX = '/__chat_proxy';
const AGNES_PROVIDER_ID = 'agnes-ai';
const BYTEPLUS_PROVIDER_ID = 'byteplus-modelark';
const MIROMIND_PROVIDER_ID = 'miromind';
const AI_GATEWAY_ROUTE_HEADER = 'x-kg-ai-gateway-route';
const AI_GATEWAY_METADATA_HEADER = 'x-kg-ai-gateway-metadata';
const AI_GATEWAY_CACHE_TTL_HEADER = 'x-kg-ai-gateway-cache-ttl';
const CLOUDFLARE_ACCOUNT_ID_PATTERN = '[a-f0-9]{32}';
const CLOUDFLARE_API_AI_PATH = new RegExp(`^/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID_PATTERN}/ai$`, 'i');
const CLOUDFLARE_GATEWAY_AI_PATH = new RegExp(
  `^/v1/${CLOUDFLARE_ACCOUNT_ID_PATTERN}/[a-z0-9][a-z0-9_-]{0,63}/(?:openai|compat)$`,
  'i',
);

const normalizeProviderId = (value) => {
  const raw = normalizeHost(value);
  if (raw === 'openai') return 'openai';
  if (raw === BYTEPLUS_PROVIDER_ID || raw === 'byteplus') return BYTEPLUS_PROVIDER_ID;
  if (raw === MIROMIND_PROVIDER_ID || raw === 'miromind-api') return MIROMIND_PROVIDER_ID;
  if (raw === AGNES_PROVIDER_ID || raw === 'agnes' || raw === 'agnes-ai-api') return AGNES_PROVIDER_ID;
  return raw;
};

const isAgnesHost = (hostname) => normalizeHost(hostname) === AGNES_HOST;

const isBytePlusHost = (hostname) => {
  const host = normalizeHost(hostname);
  return host === BYTEPLUS_AP_SOUTHEAST_HOST || host === BYTEPLUS_EU_WEST_HOST;
};

const isMiroMindHost = (hostname) => normalizeHost(hostname) === MIROMIND_HOST;

const normalizeDnsHost = (hostname) => normalizeHost(hostname).replace(/\.+$/, '');

const isCloudflareHost = (hostname) => {
  const host = normalizeDnsHost(hostname);
  return host === 'cloudflare.com' || host.endsWith('.cloudflare.com');
};

const isCallerCloudflareHostOverride = (value) => {
  if (!value) return false;
  try {
    return isCloudflareHost(new URL(value).hostname);
  } catch {
    return false;
  }
};

const sanitizeAiGatewayGatewayId = (value) => {
  const gatewayId = String(value || '').trim();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(gatewayId) ? gatewayId : '';
};

const parseOperatorAiGatewayBaseUrl = (value) => {
  let baseUrl;
  try {
    baseUrl = new URL(String(value || '').trim());
  } catch {
    return null;
  }

  if (
    baseUrl.protocol !== 'https:'
    || baseUrl.port
    || baseUrl.username
    || baseUrl.password
    || baseUrl.search
    || baseUrl.hash
  ) {
    return null;
  }

  const host = normalizeHost(baseUrl.hostname);
  if (host === CLOUDFLARE_API_HOST && CLOUDFLARE_API_AI_PATH.test(baseUrl.pathname)) {
    return { baseUrl, kind: 'cloudflare-api' };
  }
  if (host === AI_GATEWAY_HOST && CLOUDFLARE_GATEWAY_AI_PATH.test(baseUrl.pathname)) {
    return { baseUrl, kind: 'provider-gateway' };
  }
  return null;
};

const readOperatorAiGatewayConfig = (env) => {
  const baseUrlRaw = String(env.AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_BASE_URL || '').trim();
  const gatewayIdRaw = String(env.AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_GATEWAY_ID || '').trim();
  const base = baseUrlRaw ? parseOperatorAiGatewayBaseUrl(baseUrlRaw) : null;
  const gatewayId = sanitizeAiGatewayGatewayId(gatewayIdRaw);
  return {
    base,
    isValid: Boolean(base) && (!gatewayIdRaw || Boolean(gatewayId)),
    gatewayId,
  };
};

const sanitizeAiGatewayRoute = (value) => {
  const route = String(value || '').trim();
  return /^dynamic\/[a-z0-9._/-]+$/i.test(route) ? route.slice(0, 128) : '';
};

const sanitizeAiGatewayMetadata = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    const entries = Object.entries(parsed || {})
      .filter(([, entryValue]) => typeof entryValue === 'string' || typeof entryValue === 'number' || typeof entryValue === 'boolean')
      .slice(0, 5)
      .map(([key, entryValue]) => [String(key || '').trim().slice(0, 64), typeof entryValue === 'string' ? entryValue.trim().slice(0, 160) : entryValue])
      .filter(([key]) => key);
    return entries.length ? JSON.stringify(Object.fromEntries(entries)) : '';
  } catch {
    return '';
  }
};

const sanitizeAiGatewayCacheTtl = (value) => {
  const parsed = Number(String(value || '').trim());
  if (!Number.isFinite(parsed)) return '';
  return String(Math.max(1, Math.min(86_400, Math.floor(parsed))));
};

const buildUpstreamUrl = (baseUrl, upstreamPath, search) => {
  const basePath = baseUrl.pathname === '/' ? '' : String(baseUrl.pathname || '').replace(/\/+$/g, '');
  const nextPath = `${basePath}${upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`}`;
  return new URL(`${nextPath}${search || ''}`, `${baseUrl.protocol}//${baseUrl.host}`);
};

const pickUpstreamBase = ({ provider, requestedUpstream, env }) => {
  // Fully independent mode: no external gateway-specific coupling here.
  // The proxy either targets:
  // - OpenAI (https://api.openai.com) when provider=openai
  // - MiroMind (https://api.miromind.ai) when provider=miromind
  // - Agnes AI (https://apihub.agnes-ai.com) when provider=agnes-ai
  // - BytePlus ModelArk (https://ark.ap-southeast.bytepluses.com) when provider=byteplus-modelark
  // - a configured HTTPS upstream (env.AGENTIC_OS_CHAT_PROXY_UPSTREAM or request override)
  if (provider === 'openai') return requestedUpstream || 'https://api.openai.com';
  if (provider === MIROMIND_PROVIDER_ID) return requestedUpstream || `https://${MIROMIND_HOST}`;
  if (provider === AGNES_PROVIDER_ID) return requestedUpstream || `https://${AGNES_HOST}`;
  if (provider === BYTEPLUS_PROVIDER_ID) {
    return requestedUpstream || String(env.AGENTIC_OS_CHAT_PROXY_UPSTREAM || '').trim() || `https://${BYTEPLUS_AP_SOUTHEAST_HOST}`;
  }
  if (requestedUpstream) return requestedUpstream;
  return String(env.AGENTIC_OS_CHAT_PROXY_UPSTREAM || '').trim();
};

export async function onRequest(context) {
  const { request, env } = context;
  const method = String(request.method || 'GET').toUpperCase();
  const requestUrl = new URL(request.url);
  const origin = readHeader(request.headers, 'origin');
  const requestCorsHeaders = corsHeaders(request);

  if (method === 'OPTIONS') {
    return handleOptions(request);
  }
  if (!['GET', 'HEAD', 'POST'].includes(method)) {
    return jsonResponse(request, { ok: false, error: 'Unsupported method' }, 405);
  }
  if (origin && !requestCorsHeaders['access-control-allow-origin']) {
    return jsonResponse(request, { ok: false, error: 'Chat proxy origin is not allowed' }, 403);
  }

  const provider = normalizeProviderId(readHeader(request.headers, 'x-kg-chat-provider'));
  const aiGatewayRoute = sanitizeAiGatewayRoute(readHeader(request.headers, AI_GATEWAY_ROUTE_HEADER));
  const aiGatewayMetadata = sanitizeAiGatewayMetadata(readHeader(request.headers, AI_GATEWAY_METADATA_HEADER));
  const aiGatewayCacheTtl = sanitizeAiGatewayCacheTtl(readHeader(request.headers, AI_GATEWAY_CACHE_TTL_HEADER));
  const requestedUpstream = readHeader(request.headers, 'x-kg-chat-upstream');
  if (isCallerCloudflareHostOverride(requestedUpstream)) {
    return jsonResponse(request, { ok: false, error: 'Caller Cloudflare upstream overrides are not allowed' }, 403);
  }

  const aiGatewayConfig = readOperatorAiGatewayConfig(env);
  const aiGatewayRequested = provider === 'openai' && !!aiGatewayRoute;
  if (aiGatewayRequested && !aiGatewayConfig.isValid) {
    return jsonResponse(
      request,
      { ok: false, error: 'Cloudflare AI Gateway requires a valid operator AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_BASE_URL' },
      500,
    );
  }
  const upstreamBaseRaw = pickUpstreamBase({
    provider,
    requestedUpstream: aiGatewayRequested ? aiGatewayConfig.base.baseUrl.toString() : requestedUpstream,
    env,
  });
  if (!upstreamBaseRaw) {
    return jsonResponse(request, { ok: false, error: 'Missing chat proxy upstream configuration' }, 500);
  }
  let upstreamBase;
  try {
    upstreamBase = new URL(upstreamBaseRaw);
  } catch {
    return jsonResponse(request, { ok: false, error: 'Invalid chat proxy upstream configuration' }, 500);
  }

  const allowedHosts = parseAllowedHosts(env, {
    includeOpenAi: true,
    includeMiroMind: true,
    includeAgnes: true,
    includeBytePlus: true,
  });
  const upstreamHostname = normalizeDnsHost(upstreamBase.hostname);
  if (!aiGatewayRequested && isCloudflareHost(upstreamHostname)) {
    return jsonResponse(request, { ok: false, error: 'Cloudflare AI Gateway requires operator configuration' }, 403);
  }
  if (!aiGatewayRequested && !allowedHosts.has(upstreamHostname)) {
    return jsonResponse(request, { ok: false, error: 'Chat proxy upstream host is not allowed' }, 403);
  }
  if (!isLocalHost(upstreamHostname) && upstreamBase.protocol !== 'https:') {
    return jsonResponse(request, { ok: false, error: 'Chat proxy requires HTTPS for non-local upstream hosts' }, 403);
  }

  const requiresAiGatewayKey = aiGatewayRequested;
  const requiresOpenAiKey = !requiresAiGatewayKey && (provider === 'openai' || upstreamHostname === OPENAI_HOST);
  const requiresMiroMindKey = provider === MIROMIND_PROVIDER_ID || isMiroMindHost(upstreamHostname);
  const requiresAgnesKey = provider === AGNES_PROVIDER_ID || isAgnesHost(upstreamHostname);
  const requiresBytePlusKey = provider === BYTEPLUS_PROVIDER_ID || isBytePlusHost(upstreamHostname);
  const headerApiKey = readHeader(request.headers, 'x-kg-chat-api-key');
  const envAiGatewayApiKey = String(env.AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_TOKEN || '').trim();
  const envOpenAiApiKey = String(env.AGENTIC_OS_CHAT_PROXY_OPENAI_API_KEY || env.OPENAI_API_KEY || '').trim();
  const envMiroMindApiKey = String(env.AGENTIC_OS_CHAT_PROXY_MIROMIND_API_KEY || env.MIROMIND_API_KEY || '').trim();
  const envAgnesApiKey = String(env.AGENTIC_OS_CHAT_PROXY_AGNES_API_KEY || env.AGNES_API_KEY || '').trim();
  const envBytePlusApiKey = String(env.AGENTIC_OS_CHAT_PROXY_BYTEPLUS_API_KEY || env.BYTEPLUS_API_KEY || '').trim();
  const aiGatewayApiKey = envAiGatewayApiKey.slice(0, 512);
  // Operator-held provider credentials are host-bound. A custom allowlisted
  // upstream may use only a caller-held key, never a configured provider key.
  const openAiApiKey = (headerApiKey || (upstreamHostname === OPENAI_HOST ? envOpenAiApiKey : '')).slice(0, 512);
  const miromindApiKey = (headerApiKey || (isMiroMindHost(upstreamHostname) ? envMiroMindApiKey : '')).slice(0, 512);
  const agnesApiKey = (headerApiKey || (isAgnesHost(upstreamHostname) ? envAgnesApiKey : '')).slice(0, 512);
  const bytePlusApiKey = (headerApiKey || (isBytePlusHost(upstreamHostname) ? envBytePlusApiKey : '')).slice(0, 512);
  const providerApiKey = requiresBytePlusKey
    ? bytePlusApiKey
    : requiresAiGatewayKey
      ? aiGatewayApiKey
    : requiresAgnesKey
      ? agnesApiKey
      : requiresMiroMindKey
        ? miromindApiKey
        : openAiApiKey;
  if (requiresAiGatewayKey && !providerApiKey) {
    return jsonResponse(
      request,
      { ok: false, error: 'Missing Cloudflare AI Gateway token for chat proxy upstream (set AGENTIC_OS_CHAT_PROXY_AI_GATEWAY_TOKEN)' },
      401,
    );
  }
  if (requiresOpenAiKey && !openAiApiKey) {
    return jsonResponse(
      request,
      { ok: false, error: 'Missing OpenAI API key for chat proxy upstream (custom upstreams require x-kg-chat-api-key)' },
      401,
    );
  }
  if (requiresMiroMindKey && !providerApiKey) {
    return jsonResponse(
      request,
      { ok: false, error: 'Missing MiroMind API key for chat proxy upstream (set AGENTIC_OS_CHAT_PROXY_MIROMIND_API_KEY or MIROMIND_API_KEY)' },
      401,
    );
  }
  if (requiresAgnesKey && !providerApiKey) {
    return jsonResponse(
      request,
      { ok: false, error: 'Missing Agnes API key for chat proxy upstream (set AGENTIC_OS_CHAT_PROXY_AGNES_API_KEY or AGNES_API_KEY)' },
      401,
    );
  }
  if (requiresBytePlusKey && !providerApiKey) {
    return jsonResponse(
      request,
      { ok: false, error: 'Missing BytePlus API key for chat proxy upstream (set AGENTIC_OS_CHAT_PROXY_BYTEPLUS_API_KEY or BYTEPLUS_API_KEY)' },
      401,
    );
  }

  if (method === 'POST') {
    const contentType = readHeader(request.headers, 'content-type').toLowerCase();
    if (!contentType.includes('application/json')) {
      return jsonResponse(request, { ok: false, error: 'Chat proxy expects application/json payloads' }, 415);
    }
  }

  const suffixRaw = requestUrl.pathname.startsWith(CHAT_PROXY_PREFIX)
    ? requestUrl.pathname.slice(CHAT_PROXY_PREFIX.length) || '/v1/chat/completions'
    : '/v1/chat/completions';
  let upstreamPath = suffixRaw.startsWith('/') ? suffixRaw : `/${suffixRaw}`;
  if (aiGatewayRequested && aiGatewayConfig.base.kind === 'provider-gateway' && upstreamPath.startsWith('/v1/')) {
    upstreamPath = upstreamPath.slice('/v1'.length);
  }

  const upstreamUrl = buildUpstreamUrl(upstreamBase, upstreamPath, requestUrl.search || '');

  const headers = new Headers();
  const contentType = readHeader(request.headers, 'content-type');
  const accept = readHeader(request.headers, 'accept');
  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);
  if (requiresAiGatewayKey) {
    headers.set(aiGatewayConfig.base.kind === 'provider-gateway' ? 'cf-aig-authorization' : 'authorization', `Bearer ${providerApiKey}`);
  } else if (requiresOpenAiKey || requiresMiroMindKey || requiresAgnesKey || requiresBytePlusKey) {
    headers.set('authorization', `Bearer ${providerApiKey}`);
  }
  const clientRequestId = readHeader(request.headers, 'x-client-request-id').slice(0, 512);
  if (clientRequestId) headers.set('x-client-request-id', clientRequestId);
  if (requiresAiGatewayKey && aiGatewayConfig.base.kind === 'cloudflare-api' && aiGatewayConfig.gatewayId) {
    headers.set('cf-aig-gateway-id', aiGatewayConfig.gatewayId);
  }
  if (aiGatewayMetadata) headers.set('cf-aig-metadata', aiGatewayMetadata);
  if (aiGatewayCacheTtl) headers.set('cf-aig-cache-ttl', aiGatewayCacheTtl);

  const abortController = new AbortController();
  const timeoutMsRaw = Number(env.AGENTIC_OS_CHAT_PROXY_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(5_000, Math.min(180_000, Math.floor(timeoutMsRaw))) : 90_000;
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    let upstreamBody = method === 'GET' || method === 'HEAD' ? undefined : request.body;
    if (aiGatewayRequested && method === 'POST') {
      const requestText = await request.clone().text();
      try {
        const parsed = JSON.parse(requestText || '{}');
        parsed.model = aiGatewayRoute;
        upstreamBody = JSON.stringify(parsed);
      } catch {
        upstreamBody = requestText;
      }
    }
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method,
      headers,
      body: upstreamBody,
      signal: abortController.signal,
      redirect: requiresAiGatewayKey ? 'error' : 'follow',
    });
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete('content-length');
    responseHeaders.delete('www-authenticate');
    responseHeaders.set('cache-control', 'no-store');
    for (const [headerName, headerValue] of Object.entries(requestCorsHeaders)) {
      responseHeaders.set(headerName, headerValue);
    }
    if (method === 'HEAD') {
      return new Response(null, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    }
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message || '') : '';
    const aborted = abortController.signal.aborted || /aborted|timeout/i.test(message);
    return jsonResponse(request, { ok: false, error: message || 'Failed to reach chat upstream' }, aborted ? 504 : 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
