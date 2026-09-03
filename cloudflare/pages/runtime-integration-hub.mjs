const OPENAI_HOST = 'api.openai.com';
const AI_GATEWAY_HOST = 'gateway.ai.cloudflare.com';
const CLOUDFLARE_API_HOST = 'api.cloudflare.com';
const MIROMIND_HOST = 'api.miromind.ai';
const AGNES_HOST = 'apihub.agnes-ai.com';
const BYTEPLUS_AP_SOUTHEAST_HOST = 'ark.ap-southeast.bytepluses.com';
const BYTEPLUS_EU_WEST_HOST = 'ark.eu-west.bytepluses.com';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const normalizeHost = (value) => String(value || '').trim().toLowerCase();

const readHeader = (headers, name) => String(headers.get(name) || '').trim();

const isLocalHost = (hostname) => LOCAL_HOSTS.has(normalizeHost(hostname));

const parseCsvSet = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return new Set();
  const out = new Set();
  raw
    .split(',')
    .map((part) => normalizeHost(part))
    .filter(Boolean)
    .forEach((host) => out.add(host));
  return out;
};

const parseAllowedHosts = (
  env,
  {
    includeOpenAi = false,
    includeAiGateway = false,
    includeMiroMind = false,
    includeAgnes = false,
    includeBytePlus = false,
  } = {},
) => {
  const primary = parseCsvSet(env.AGENTIC_OS_INTEGRATION_ALLOWED_HOSTS);
  const fallback = parseCsvSet(env.AGENTIC_OS_CHAT_PROXY_ALLOWED_HOSTS);
  const out = primary.size ? primary : fallback;
  const base = out.size ? out : new Set([...LOCAL_HOSTS]);
  if (includeOpenAi) base.add(OPENAI_HOST);
  if (includeAiGateway) {
    base.add(AI_GATEWAY_HOST);
    base.add(CLOUDFLARE_API_HOST);
  }
  if (includeMiroMind) base.add(MIROMIND_HOST);
  if (includeAgnes) base.add(AGNES_HOST);
  if (includeBytePlus) {
    base.add(BYTEPLUS_AP_SOUTHEAST_HOST);
    base.add(BYTEPLUS_EU_WEST_HOST);
  }
  return base;
};

const corsHeaders = (request) => {
  const origin = readHeader(request.headers, 'origin');
  if (!origin) return {};

  let originHost = '';
  try {
    originHost = normalizeHost(new URL(origin).host);
  } catch {
    return {};
  }

  const requestHost = normalizeHost(new URL(request.url).host);
  const isAllowed = originHost === requestHost || originHost.startsWith('localhost:') || originHost.startsWith('127.0.0.1:');
  if (!isAllowed) return {};

  return {
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
};

const jsonResponse = (request, body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(request),
    },
  });

const handleOptions = (request) => {
  const origin = readHeader(request.headers, 'origin');
  const extra = origin ? corsHeaders(request) : { 'access-control-allow-origin': '*', vary: 'Origin' };
  return new Response(null, {
    status: 204,
    headers: {
      ...extra,
      'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-max-age': '86400',
    },
  });
};

const fetchWithTimeout = async (url, init, timeoutMs) => {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: abortController.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timeoutId);
  }
};

const readTimeoutMs = (env, key, fallbackMs) => {
  const raw = Number(env[key]);
  if (!Number.isFinite(raw)) return fallbackMs;
  return Math.max(5_000, Math.min(180_000, Math.floor(raw)));
};

const proxyUpstream = async ({
  request,
  env,
  routePrefix,
  upstreamBase,
  upstreamPrefix,
  allowedMethods = ['GET', 'HEAD', 'POST'],
  allowedHosts,
  timeoutEnvKey = 'AGENTIC_OS_INTEGRATION_TIMEOUT_MS',
}) => {
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return handleOptions(request);
  if (!allowedMethods.includes(method)) return jsonResponse(request, { ok: false, error: 'Unsupported method' }, 405);

  const upstreamBaseUrl = (() => {
    try {
      return new URL(upstreamBase);
    } catch {
      return null;
    }
  })();
  if (!upstreamBaseUrl) return jsonResponse(request, { ok: false, error: 'Invalid upstream configuration' }, 500);

  const upstreamHostname = normalizeHost(upstreamBaseUrl.hostname);
  if (!allowedHosts.has(upstreamHostname)) {
    return jsonResponse(request, { ok: false, error: 'Upstream host is not allowed' }, 403);
  }
  if (!isLocalHost(upstreamHostname) && upstreamBaseUrl.protocol !== 'https:') {
    return jsonResponse(request, { ok: false, error: 'HTTPS required for non-local upstream hosts' }, 403);
  }

  const requestUrl = new URL(request.url);
  const suffix = requestUrl.pathname.startsWith(routePrefix)
    ? requestUrl.pathname.slice(routePrefix.length) || '/'
    : '/';
  const upstreamPath = `${upstreamPrefix}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  const upstreamUrl = new URL(`${upstreamPath}${requestUrl.search || ''}`, upstreamBaseUrl);

  const headers = new Headers();
  const contentType = readHeader(request.headers, 'content-type');
  const accept = readHeader(request.headers, 'accept');
  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);

  const timeoutMs = readTimeoutMs(env, timeoutEnvKey, 90_000);
  try {
    const res = await fetchWithTimeout(
      upstreamUrl.toString(),
      {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
      },
      timeoutMs,
    );

    const responseHeaders = new Headers(res.headers);
    responseHeaders.delete('content-length');
    responseHeaders.delete('www-authenticate');
    responseHeaders.set('cache-control', 'no-store');
    for (const [key, value] of Object.entries(corsHeaders(request))) {
      responseHeaders.set(key, value);
    }
    if (method === 'HEAD') {
      return new Response(null, {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
      });
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message || '') : '';
    const aborted = /aborted|timeout/i.test(message);
    return jsonResponse(request, { ok: false, error: message || 'Failed to reach upstream' }, aborted ? 504 : 502);
  }
};

export {
  OPENAI_HOST,
  AI_GATEWAY_HOST,
  CLOUDFLARE_API_HOST,
  MIROMIND_HOST,
  AGNES_HOST,
  BYTEPLUS_AP_SOUTHEAST_HOST,
  BYTEPLUS_EU_WEST_HOST,
  LOCAL_HOSTS,
  corsHeaders,
  handleOptions,
  isLocalHost,
  jsonResponse,
  normalizeHost,
  parseAllowedHosts,
  proxyUpstream,
  readHeader,
  readTimeoutMs,
};
