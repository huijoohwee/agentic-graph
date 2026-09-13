import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import WebSocket from 'ws';
import { GRAPH_HOST_RELAY_PATH as route, connectGraphRelayPeer, pairGraphHost, validateGraphHostRelayRequest, createGraphHostRelayClass } from '../agent-graph/host-transport.mjs';

test('public paired transport preserves streamed bytes and refuses unauthorized or replayed work', async () => {
  const compiled = await build({ stdin: { contents: `
    import { RunManifestStore as Base } from './cloudflare/workers/agentic-graph-mcp/run-manifest-store.mjs';
    import { createGraphHostRelayClass, routeGraphHostRelay } from './mcp/agent-graph/host-transport.mjs';
    import { authorizeRuntimeRequest, timingSafeTokenMatch } from './cloudflare/workers/agentic-graph-mcp/agent-runtime-http.ts';
    export class RunManifestStore extends createGraphHostRelayClass(Base, timingSafeTokenMatch) {}
    export default { fetch(request, env) { return routeGraphHostRelay(request, env, authorizeRuntimeRequest); } };
  `, resolveDir: new URL('../..', import.meta.url).pathname }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers', 'node:*'] });
  const origin = 'https://airvio.co', bearer = 'test-only-private-control-plane-key';
  const mf = new Miniflare(convertV4MiniflareOptions({ port: 0, workers: [{ modules: true, script: compiled.outputFiles[0].text, compatibilityDate: '2026-08-01', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { RUN_MANIFEST_STORE: { className: 'RunManifestStore', useSQLite: true } },
    bindings: { AGENTIC_OS_MCP_PUBLIC_BASE_URL: origin, AGENTIC_OS_AGENT_RUNTIME_BEARER_TOKEN: bearer } }] }));
  const baseUrl = (await mf.ready).origin;
  class BrowserSocket extends WebSocket { constructor(url, protocols) { super(url, protocols, { origin }); } }
  let host, client;
  const sockets = [];
  const rejectedSocket = async (id, key, role, requestOrigin, expectedStatus) => {
    const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}${route}/${id}/${role}`, [`agent-graph-${role}`, key], { origin: requestOrigin });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('unexpected-response', (_request, response) => { response.resume(); try { assert.equal(response.statusCode, expectedStatus); resolve(); } catch (error) { reject(error); } finally { socket.terminate(); } });
      socket.once('open', () => reject(new Error('Unauthorized peer connected'))); socket.on('error', () => {});
    });
  };
  try {
    assert.equal((await fetch(`${baseUrl}${route}`, { method: 'POST', body: '{}' })).status, 401);
    const localCalls = [], exact = 'checkout 💳\n'.repeat(10_000);
    host = await pairGraphHost({ baseUrl, bearer, localOrigin: 'http://127.0.0.1:5173', WebSocketImpl: WebSocket,
      fetchImpl: async (url, init) => {
        if (!String(url).startsWith('http://127.0.0.1:5173/')) return fetch(url, init);
        localCalls.push({ url, init });
        if (String(url).endsWith('/proposal') && JSON.parse(init.body).action === 'validate') {
          return new Response(new ReadableStream({ start(stream) { init.signal.addEventListener('abort', () => stream.error(new Error('aborted')), { once: true }); } }));
        }
        return new Response(exact, { headers: { 'content-type': 'application/x-ndjson' } });
      } });
    const [id, key, deadline] = host.code.split('.');
    await rejectedSocket(id, '0'.repeat(64), 'client', origin, 403);
    await rejectedSocket(id, key, 'host', origin, 403);
    await rejectedSocket(id, key, 'client', 'https://untrusted.example', 403);
    client = await connectGraphRelayPeer({ baseUrl, id, key, expiresAt: Number(deadline), role: 'client', WebSocketImpl: BrowserSocket });
    await rejectedSocket(id, key, 'client', origin, 409);
    const response = await client.fetch('/__agentic_graph_agent_graph/repositories/stream', { method: 'POST', body: '{}' });
    assert.equal(response.headers.get('content-type'), 'application/x-ndjson');
    assert.equal(await response.text(), exact, 'UTF-8 and multiple flow-controlled chunks survive exactly');
    assert.equal(localCalls.length, 1);
    assert.equal(localCalls[0].init.headers.origin, 'http://127.0.0.1:5173');
    assert.equal(localCalls[0].init.redirect, 'error');
    assert.throws(() => validateGraphHostRelayRequest({ id: crypto.randomUUID(), path: '/__agentic_graph_agent_graph/proposal', method: 'POST', body: JSON.stringify({ action: 'connect-host' }) }), /outside/);
    for (const path of ['/__agentic_graph_agent_graph/grants', '/__agentic_graph_agent_graph/repositories?token=x', 'https://attacker.example/', '/__chat_proxy/../secrets']) {
      assert.throws(() => validateGraphHostRelayRequest({ id: crypto.randomUUID(), path, method: 'POST', body: '{}' }), /scope/);
    }
    assert.throws(() => validateGraphHostRelayRequest({ id: crypto.randomUUID(), path: '/__chat_proxy/v1/responses', method: 'POST', body: '界'.repeat(22_000) }), /bounded/);
    const pending = await client.fetch('/__agentic_graph_agent_graph/proposal', { method: 'POST', body: JSON.stringify({ action: 'validate' }) });
    await pending.body.cancel();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(localCalls.at(-1).init.signal.aborted, true, 'consumer cancellation aborts host work');
    client.close(); client = null;
    await new Promise(resolve => setTimeout(resolve, 50));
    const socket = new BrowserSocket(`${baseUrl.replace('http', 'ws')}${route}/${id}/client`, ['agent-graph-client', key]); sockets.push(socket);
    const frames = [], waitFrame = predicate => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('relay frame timed out')), 5000);
      const listener = data => { const frame = JSON.parse(data.toString()); frames.push(frame); if (frame.type === 'chunk') socket.send(JSON.stringify({ type: 'ack', id: frame.id })); if (predicate(frame)) { clearTimeout(timer); socket.off('message', listener); resolve(frame); } };
      socket.on('message', listener);
    });
    await waitFrame(frame => frame.type === 'ready');
    const request = { type: 'request', id: crypto.randomUUID(), path: '/__agentic_graph_agent_graph/capability', method: 'GET', body: '' };
    let finished = waitFrame(frame => frame.type === 'end'); socket.send(JSON.stringify(request)); await finished;
    const callCount = localCalls.length;
    finished = waitFrame(frame => frame.type === 'error'); socket.send(JSON.stringify(request));
    assert.match((await finished).error, /already admitted/); assert.equal(localCalls.length, callCount, 'durable admission prevents request replay');
  } finally {
    client?.close(); host?.close(); for (const socket of sockets) if (socket.readyState < 2) socket.terminate();
    await mf.dispose();
  }
});

test('control-plane owner delegation, hibernation readback and expiry retain the execution fence', async () => {
  const state = new Map(), delivered = { host: [], client: [] }, sockets = {};
  const storage = { get: async key => structuredClone(state.get(key)), put: async (key, value) => {
    for (const [name, item] of typeof key === 'string' ? [[key, value]] : Object.entries(key)) state.set(name, structuredClone(item));
  }, setAlarm: async () => {}, deleteAll: async () => state.clear(), transaction: async work => work(storage) };
  for (const role of ['host', 'client']) sockets[role] = { readyState: 1, deserializeAttachment: () => ({ role }), send: raw => delivered[role].push(JSON.parse(raw)), close() { this.readyState = 3; } };
  const ctx = { storage, getWebSockets: role => role ? [sockets[role]] : Object.values(sockets) };
  class ExistingOwner { async fetch() { return new Response('existing manifest owner'); } async alarm() { state.set('owner-alarm', true); } }
  const Relay = createGraphHostRelayClass(ExistingOwner, async (a, b) => a === b);
  let relay = new Relay(ctx, {});
  assert.equal(await (await relay.fetch(new Request('https://internal/manifest'))).text(), 'existing manifest owner');
  await relay.alarm(); assert.equal(state.get('owner-alarm'), true, 'unpaired objects retain their original alarm owner');
  const request = { type: 'request', id: crypto.randomUUID(), path: '/__agentic_graph_agent_graph/proposal', method: 'POST', body: '{"action":"handoff-status"}' };
  state.set('session', { seen: [], expiresAt: Date.now() + 60_000 });
  await relay.webSocketMessage(sockets.client, JSON.stringify(request));
  assert.equal(delivered.host.length, 1);
  relay = new Relay(ctx, {}); // New instance, same durable state and hibernated socket attachments.
  await relay.webSocketMessage(sockets.client, JSON.stringify({ ...request, id: crypto.randomUUID() }));
  assert.match(delivered.client.at(-1).error, /already running/); assert.equal(delivered.host.length, 1);
  await relay.webSocketMessage(sockets.host, JSON.stringify({ type: 'chunk', id: request.id, data: 'YQ==' }));
  assert.equal(state.get('operation').state, 'interrupted', 'invalid host stream fails closed');
  relay = new Relay(ctx, {});
  await relay.webSocketMessage(sockets.client, JSON.stringify(request));
  assert.match(delivered.client.at(-1).error, /already admitted/);
  const nextRequest = { ...request, id: crypto.randomUUID() };
  await relay.webSocketMessage(sockets.client, JSON.stringify(nextRequest));
  await relay.webSocketMessage(sockets.host, JSON.stringify({ type: 'end', id: request.id }));
  assert.equal(state.get('operation').state, 'running', 'a late frame from an interrupted request cannot cancel its successor');
  state.get('session').expiresAt = Date.now() - 1;
  await relay.alarm(); assert.equal(state.size, 0); assert.equal(sockets.client.readyState, 3); assert.equal(sockets.host.readyState, 3);
});
