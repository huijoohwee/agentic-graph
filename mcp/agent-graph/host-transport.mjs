// Shared, on-demand transport. The broker never interprets source, invokes a model,
// or executes Git: the already-running, explicitly paired Graph host owns that work.
export const GRAPH_HOST_RELAY_PATH = '/agentic-os/control-plane/mcp/host-relay';
export const GRAPH_HOST_RELAY_LIMITS = Object.freeze({
  sessionMs: 30 * 60_000, operationMs: 16 * 60_000, frameBytes: 96_000,
  requestBytes: 64_000, responseBytes: 8_000_000, operations: 128, chunkBytes: 24_000,
});
const encoder = new TextEncoder();
const bytes = value => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const keyPattern = /^[a-f0-9]{64}$/;
const hex = data => [...new Uint8Array(data)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async text => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const randomKey = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
const failure = message => new Error(`Graph connection: ${message}`);
const b64 = value => btoa(String.fromCharCode(...value));
const unb64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));

export function validateGraphHostRelayRequest(value) {
  if (!value || !idPattern.test(value.id) || typeof value.path !== 'string'
    || typeof value.body !== 'string' || bytes(value.body) > GRAPH_HOST_RELAY_LIMITS.requestBytes) throw failure('invalid bounded request');
  const root = '/__agentic_graph_agent_graph';
  const allowed = value.method === 'GET' && value.path === `${root}/capability`
    || value.method === 'POST' && [
      `${root}/repositories`, `${root}/repositories/stream`, `${root}/proposal`,
      '/__agentic_graph_mcp_probe_generate', '/__agentic_graph_mcp_agentic_os_docs_invoke',
      '/__chat_proxy/v1/responses', '/__chat_proxy/v1/chat/completions',
    ].includes(value.path);
  if (!allowed) throw failure('endpoint is outside the paired host scope');
  if (value.method === 'POST') JSON.parse(value.body);
  if (value.path === `${root}/proposal` && !['ground', 'validate', 'handoff-review', 'handoff-approve', 'handoff-status'].includes(JSON.parse(value.body).action)) throw failure('proposal action outside the paired scope');
  return { type: 'request', id: value.id, path: value.path, method: value.method, body: value.body };
}

async function readSmallJson(request, max = 1024) {
  const reader = request.body?.getReader();
  if (!reader) throw failure('missing request body');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > max) throw failure('request too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(buffer));
}

export async function routeGraphHostRelay(request, env, authorize) {
  const url = new URL(request.url), suffix = url.pathname.slice(GRAPH_HOST_RELAY_PATH.length);
  if (url.pathname !== GRAPH_HOST_RELAY_PATH && !url.pathname.startsWith(`${GRAPH_HOST_RELAY_PATH}/`)) return null;
  const namespace = env.RUN_MANIFEST_STORE;
  if (!namespace) return json({ error: 'graph_host_relay_unbound' }, 503);
  if (url.search) return json({ error: 'credentials_and_parameters_in_urls_forbidden' }, 400);
  if (!suffix && request.method === 'POST') {
    const authorization = await authorize(request, env);
    if (!authorization.ok) return json({ error: authorization.code }, authorization.status);
    try {
      const input = await readSmallJson(request);
      if (!keyPattern.test(input.hostHash) || !keyPattern.test(input.clientHash) || input.hostHash === input.clientHash) throw failure('invalid pairing keys');
      const id = crypto.randomUUID(), expiresAt = Date.now() + GRAPH_HOST_RELAY_LIMITS.sessionMs;
      const stub = namespace.get(namespace.idFromName(`graph-host-relay/${id}`));
      const result = await stub.fetch(new Request('https://graph-host.internal/graph-host/initialize', {
        method: 'POST', body: JSON.stringify({ id, expiresAt, hostHash: input.hostHash, clientHash: input.clientHash }),
      }));
      if (!result.ok) return json({ error: 'pairing_unavailable' }, 503);
      return json({ id, expiresAt });
    } catch { return json({ error: 'invalid_pairing_request' }, 400); }
  }
  const match = suffix.match(/^\/([a-f0-9-]{36})\/(host|client)$/);
  if (!match || request.method !== 'GET') return json({ error: 'not_found' }, 404);
  if (!idPattern.test(match[1])) return json({ error: 'not_found' }, 404);
  const stub = namespace.get(namespace.idFromName(`graph-host-relay/${match[1]}`));
  return stub.fetch(request);
}

// Platform base and existing constant-time authorization primitive are injected;
// Node tests exercise the same broker without importing a Worker-only runtime.
export function createGraphHostRelayClass(DurableObject, equalToken) {
  return class extends DurableObject {
    constructor(ctx, env) { super(ctx, env); this.state = ctx; this.config = env; }
    async fetch(request) {
      const url = new URL(request.url), store = this.state.storage;
      if (url.pathname !== '/graph-host/initialize' && !url.pathname.startsWith(`${GRAPH_HOST_RELAY_PATH}/`)) return super.fetch(request);
      if (url.pathname === '/graph-host/initialize' && request.method === 'POST') {
        const input = await readSmallJson(request);
        return store.transaction(async txn => {
          if (await txn.get('session')) return json({ error: 'already_paired' }, 409);
          if (!idPattern.test(input.id) || !keyPattern.test(input.hostHash) || !keyPattern.test(input.clientHash)
            || input.expiresAt <= Date.now() || input.expiresAt > Date.now() + GRAPH_HOST_RELAY_LIMITS.sessionMs) return json({ error: 'invalid_session' }, 400);
          await txn.put('session', { ...input, seen: [] }); await txn.setAlarm(input.expiresAt);
          return json({ ok: true });
        });
      }
      const session = await store.get('session');
      if (!session || session.expiresAt <= Date.now()) return json({ error: 'pairing_expired' }, 401);
      const match = url.pathname.match(/\/([a-f0-9-]{36})\/(host|client)$/);
      const role = match?.[2], protocols = (request.headers.get('sec-websocket-protocol') || '').split(',').map(s => s.trim());
      const origin = request.headers.get('origin');
      const expectedOrigin = new URL(this.config.AGENTIC_OS_MCP_PUBLIC_BASE_URL || 'https://airvio.co').origin;
      if (match?.[1] !== session.id || !role || protocols.length !== 2 || protocols[0] !== `agent-graph-${role}`
        || !keyPattern.test(protocols[1]) || request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
        || (role === 'client' && origin !== expectedOrigin) || (origin && origin !== expectedOrigin)
        || !await equalToken(await digest(protocols[1]), session[`${role}Hash`])) return json({ error: 'pairing_unauthorized' }, 403);
      if (this.sockets(role).length) return json({ error: 'peer_already_connected' }, 409);
      const pair = new WebSocketPair(), [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server, [role]); server.serializeAttachment({ role });
      server.send(JSON.stringify({ type: 'ready', expiresAt: session.expiresAt }));
      return new Response(null, { status: 101, webSocket: client, headers: { 'sec-websocket-protocol': protocols[0] } });
    }
    sockets(role) { return this.state.getWebSockets(role).filter(socket => socket.readyState === 1); }
    send(role, message) { const socket = this.sockets(role)[0]; if (socket) socket.send(JSON.stringify(message)); }
    async webSocketMessage(socket, raw) {
      let message;
      try {
        if (typeof raw !== 'string' || bytes(raw) > GRAPH_HOST_RELAY_LIMITS.frameBytes) throw failure('frame exceeds limit');
        message = JSON.parse(raw);
        const role = socket.deserializeAttachment()?.role, store = this.state.storage;
        const session = await store.get('session');
        if (!session || session.expiresAt <= Date.now()) { await this.alarm(); return; }
        if (role === 'client' && message.type === 'request') {
          const request = validateGraphHostRelayRequest(message);
          if (!this.sockets('host').length) throw failure('host is disconnected');
          await store.transaction(async txn => {
            const current = await txn.get('operation'), fresh = await txn.get('session');
            if (current?.state === 'running') throw failure('one host operation is already running');
            if (fresh.seen.includes(request.id)) throw failure('request was already admitted; inspect status before recovery');
            if (fresh.seen.length >= GRAPH_HOST_RELAY_LIMITS.operations) throw failure('pairing request budget exhausted');
            fresh.seen.push(request.id);
            await txn.put({ session: fresh, operation: { id: request.id, state: 'running', bytes: 0, startedAt: Date.now(), headers: false } });
            await txn.setAlarm(Math.min(fresh.expiresAt, Date.now() + GRAPH_HOST_RELAY_LIMITS.operationMs));
          });
          this.send('host', request); return;
        }
        const operation = await store.get('operation');
        if (!operation || operation.id !== message.id || operation.state !== 'running') throw failure('no matching active operation');
        if (role === 'client' && ['cancel', 'ack'].includes(message.type)) { this.send('host', { type: message.type, id: message.id }); return; }
        if (role !== 'host') throw failure('invalid peer operation');
        if (message.type === 'headers') {
          if (operation.headers || !Number.isInteger(message.status) || message.status < 200 || message.status > 599
            || typeof message.contentType !== 'string' || message.contentType.length > 160) throw failure('invalid response headers');
          operation.headers = true;
        } else if (message.type === 'chunk') {
          if (!operation.headers || typeof message.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(message.data)
            || message.data.length > GRAPH_HOST_RELAY_LIMITS.chunkBytes * 4 / 3) throw failure('invalid response chunk');
          operation.bytes += unb64(message.data).length;
          if (operation.bytes > GRAPH_HOST_RELAY_LIMITS.responseBytes) throw failure('response budget exhausted');
        } else if (message.type === 'end' || message.type === 'error') {
          operation.state = message.type === 'end' ? 'completed' : 'interrupted';
          message = { type: message.type, id: message.id, ...(message.type === 'error' ? { error: 'Host operation interrupted; use native status before recovery.' } : {}) };
        } else throw failure('unknown response frame');
        await store.put('operation', operation);
        if (operation.state !== 'running') await store.setAlarm(session.expiresAt);
        this.send('client', message);
      } catch (error) {
        socket.send(JSON.stringify({ type: 'error', id: message?.id || '', error: String(error.message || 'Invalid relay frame') }));
        if (socket.deserializeAttachment()?.role === 'host' && (!message?.id || message.id === (await this.state.storage.get('operation'))?.id)) await this.interrupt('Host response rejected');
      }
    }
    async interrupt(reason) {
      const operation = await this.state.storage.get('operation');
      if (operation?.state !== 'running') return;
      await this.state.storage.put('operation', { ...operation, state: 'interrupted' });
      this.send('host', { type: 'cancel', id: operation.id });
      this.send('client', { type: 'error', id: operation.id, error: `${reason}; use native status before recovery.` });
    }
    async webSocketClose(socket) { await this.interrupt('Paired connection closed'); socket.close(1000, 'Closed'); }
    async webSocketError(socket) { await this.webSocketClose(socket); }
    async alarm() {
      const session = await this.state.storage.get('session');
      if (!session) return super.alarm?.();
      await this.interrupt('Connection or operation expired');
      if (session?.expiresAt > Date.now()) { await this.state.storage.setAlarm(session.expiresAt); return; }
      for (const socket of this.state.getWebSockets()) socket.close(1000, 'Pairing expired');
      await this.state.storage.deleteAll();
    }
  };
}

export function normalizeGraphRelayBase(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw failure('invalid control-plane origin');
  if (url.origin !== 'https://airvio.co' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw failure('unsupported control-plane origin');
  return url.origin;
}

export async function connectGraphRelayPeer({ baseUrl, id, key, expiresAt, role, handleRequest, WebSocketImpl = WebSocket }) {
  const base = normalizeGraphRelayBase(baseUrl);
  if (!idPattern.test(id) || !keyPattern.test(key) || !['client', 'host'].includes(role)
    || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + GRAPH_HOST_RELAY_LIMITS.sessionMs) throw failure('invalid or expired pairing');
  const url = `${base.replace(/^http/, 'ws')}${GRAPH_HOST_RELAY_PATH}/${id}/${role}`;
  const socket = new WebSocketImpl(url, [`agent-graph-${role}`, key]);
  let pending = null, running = null, readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const send = frame => { if (socket.readyState !== 1) throw failure('connection is closed'); socket.send(JSON.stringify(frame)); };
  const failPending = reason => { if (pending) { pending.reject(reason); pending.stream?.error(reason); pending.cleanup(); pending = null; } };
  const close = () => { failPending(failure('connection closed; use status before recovery')); running?.controller.abort(); running?.ackReject?.(failure('connection closed')); socket.close(); };
  const deadline = setTimeout(close, Math.max(1, expiresAt - Date.now()));
  const connectTimer = setTimeout(() => { readyReject(failure('connection timed out')); close(); }, 10_000);
  socket.addEventListener('close', () => { clearTimeout(deadline); clearTimeout(connectTimer); readyReject(failure('connection closed')); failPending(failure('connection closed; use status before recovery')); running?.controller.abort(); running?.ackReject?.(failure('connection closed')); });
  socket.addEventListener('error', () => { readyReject(failure('connection failed')); close(); });
  socket.addEventListener('message', event => {
    const receive = async () => {
      if (typeof event.data !== 'string' || bytes(event.data) > GRAPH_HOST_RELAY_LIMITS.frameBytes) throw failure('invalid relay message');
      const frame = JSON.parse(event.data);
      if (frame.type === 'ready') { clearTimeout(connectTimer); readyResolve(); return; }
      if (role === 'host') {
        if (frame.id === running?.id && frame.type === 'cancel') { running.controller.abort(); running.ackReject?.(failure('cancelled')); return; }
        if (frame.id === running?.id && frame.type === 'ack') { running.ackResolve?.(); return; }
        if (frame.type === 'error') { if (frame.id === running?.id) { running.controller.abort(); running.ackReject?.(failure('broker rejected operation')); } return; }
        if (frame.type !== 'request' || running) throw failure('unexpected host request');
        const request = validateGraphHostRelayRequest(frame), controller = new AbortController();
        const operation = { id: request.id, controller, ackResolve: null, ackReject: null }; running = operation;
        const timer = setTimeout(() => controller.abort(), GRAPH_HOST_RELAY_LIMITS.operationMs);
        try {
          const response = await handleRequest(request, controller.signal);
          send({ type: 'headers', id: request.id, status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream' });
          const reader = response.body?.getReader(); let size = 0;
          if (reader) try {
            while (true) {
              const { done, value } = await reader.read(); if (done) break;
              size += value.byteLength; if (size > GRAPH_HOST_RELAY_LIMITS.responseBytes) throw failure('response budget exhausted');
              for (let i = 0; i < value.length; i += GRAPH_HOST_RELAY_LIMITS.chunkBytes) {
                controller.signal.throwIfAborted();
                const acknowledged = new Promise((resolve, reject) => { operation.ackResolve = resolve; operation.ackReject = reject; });
                const ackTimer = setTimeout(() => operation.ackReject?.(failure('reader disconnected')), 30_000);
                send({ type: 'chunk', id: request.id, data: b64(value.slice(i, i + GRAPH_HOST_RELAY_LIMITS.chunkBytes)) });
                try { await acknowledged; } finally { clearTimeout(ackTimer); operation.ackResolve = null; operation.ackReject = null; }
              }
            }
          } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
          send({ type: 'end', id: request.id });
        } catch { if (socket.readyState === 1) send({ type: 'error', id: request.id }); }
        finally { clearTimeout(timer); if (running === operation) running = null; }
        return;
      }
      if (!pending || pending.id !== frame.id) return;
      if (frame.type === 'error') { failPending(failure(frame.error || 'host unavailable')); return; }
      if (frame.type === 'headers') {
        if (pending.stream) throw failure('duplicate response headers');
        const operation = pending;
        const body = new ReadableStream({
          start(stream) { operation.stream = stream; },
          pull() { if (operation.needsAck) { operation.needsAck = false; send({ type: 'ack', id: operation.id }); } },
          cancel() { send({ type: 'cancel', id: operation.id }); operation.cleanup(); if (pending === operation) pending = null; },
        });
        operation.resolve(new Response(body, { status: frame.status, headers: { 'content-type': frame.contentType, 'cache-control': 'no-store' } }));
      } else if (frame.type === 'chunk') {
        if (!pending.stream) throw failure('response chunk before headers');
        const chunk = unb64(frame.data); pending.bytes += chunk.length;
        if (pending.bytes > GRAPH_HOST_RELAY_LIMITS.responseBytes) throw failure('response budget exhausted');
        pending.stream.enqueue(chunk);
        if (pending.stream.desiredSize > 0) send({ type: 'ack', id: frame.id }); else pending.needsAck = true;
      } else if (frame.type === 'end') { pending.stream?.close(); pending.cleanup(); pending = null; }
    };
    void receive().catch(error => { failPending(error); close(); });
  });
  await ready;
  return {
    close,
    fetch(input, init = {}) {
      if (role !== 'client' || pending) return Promise.reject(failure('one host operation is already running'));
      const request = validateGraphHostRelayRequest({ id: crypto.randomUUID(), path: String(input), method: init.method || 'GET', body: init.body || '' });
      init.signal?.throwIfAborted();
      return new Promise((resolve, reject) => {
        const abort = () => { if (socket.readyState === 1) send({ type: 'cancel', id: request.id }); failPending(failure('cancelled; approved effects may continue; inspect status')); };
        const timer = setTimeout(abort, GRAPH_HOST_RELAY_LIMITS.operationMs);
        pending = { id: request.id, resolve, reject, stream: null, bytes: 0, needsAck: false, cleanup: () => { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); } };
        init.signal?.addEventListener('abort', abort, { once: true });
        try { send(request); } catch (error) { failPending(error); }
      });
    },
  };
}

export async function pairGraphHost({ baseUrl, bearer, localOrigin, fetchImpl = fetch, WebSocketImpl = WebSocket }) {
  const base = normalizeGraphRelayBase(baseUrl), local = new URL(localOrigin);
  if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || local.pathname !== '/' || local.search || local.hash) throw failure('canonical loopback Graph host required');
  if (!bearer) throw failure('configure the existing control-plane runtime bearer on the Graph server');
  const hostKey = randomKey(), clientKey = randomKey();
  const response = await fetchImpl(`${base}${GRAPH_HOST_RELAY_PATH}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ hostHash: await digest(hostKey), clientHash: await digest(clientKey) }),
    signal: AbortSignal.timeout(15_000), redirect: 'error',
  });
  if (!response.ok) throw failure(`control plane refused pairing (${response.status})`);
  const grant = await readSmallJson(response);
  const peer = await connectGraphRelayPeer({ ...grant, key: hostKey, baseUrl: base, role: 'host', WebSocketImpl,
    handleRequest: (request, signal) => {
      validateGraphHostRelayRequest(request);
      return fetchImpl(`${local.origin}${request.path}`, {
        method: request.method, ...(request.method === 'POST' ? { body: request.body } : {}), signal, redirect: 'error',
        headers: { 'content-type': 'application/json', origin: local.origin, ...(request.path.startsWith('/__chat_proxy/') ? { 'x-kg-chat-provider': 'openai' } : {}) },
      });
    },
  });
  return { close: peer.close, expiresAt: grant.expiresAt, code: `${grant.id}.${clientKey}.${grant.expiresAt}` };
}
