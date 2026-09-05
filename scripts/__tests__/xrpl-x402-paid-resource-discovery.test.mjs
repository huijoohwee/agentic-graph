import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAgentReadyStaticFiles,
  onRequest,
} from '../../cloudflare/pages/agentic-graph-agent-ready.mjs'
import { buildAgenticGraphCommerceDiscovery } from '../../cloudflare/pages/agentic-graph-agent-ready-commerce.mjs'

const PAID_RESOURCE_PATH = '/api/payments/commerce/x402/xrpl/travel-requote'
const PAID_RESOURCE_ID = 'agentic-commerce.travel-requote/v1'
const PAID_RESOURCES_EXTENSION = 'x-agentic-commerce-paid-resources'
const XRPL_ENV = Object.freeze({
  XRPL_X402_NETWORK: 'xrpl:1',
  XRPL_X402_PAY_TO_ADDRESS: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY',
  XRPL_X402_AMOUNT_DROPS: '1000',
  XRPL_X402_SOURCE_TAG: '20260905',
  XRPL_X402_DESTINATION_TAG: '',
  XRPL_X402_FACILITATOR_URL: 'https://xrpl-facilitator-testnet.t54.ai',
  XRPL_X402_RPC_URL: 'https://s.altnet.rippletest.net:51234',
  XRPL_X402_MAX_TIMEOUT_SECONDS: '60',
})

const assertPaidResourceProjection = (document) => {
  const resources = document?.[PAID_RESOURCES_EXTENSION]
  assert.equal(resources?.length, 1)
  assert.equal(resources[0]?.id, PAID_RESOURCE_ID)
  assert.equal(resources[0]?.url, `https://airvio.co${PAID_RESOURCE_PATH}`)
  assert.deepEqual(resources[0]?.payment, {
    protocol: 'x402',
    version: 2,
    scheme: 'exact',
    network: 'xrpl:1',
    asset: 'XRP',
    amount: '1000',
  })
}

test('commerce discovery projects a configured XRPL resource into every static protocol document', async () => {
  const discovery = buildAgenticGraphCommerceDiscovery({ origin: 'https://airvio.co', env: XRPL_ENV })
  assertPaidResourceProjection(discovery.acpDiscovery)
  assertPaidResourceProjection(discovery.ucpProfile)
  assertPaidResourceProjection(discovery.mppOpenApi)
  assert.equal(discovery.mppOpenApi.paths[PAID_RESOURCE_PATH]?.post?.responses?.[402]?.description, 'XRPL x402 payment required')

  const staticFiles = await buildAgentReadyStaticFiles({ env: XRPL_ENV })
  assertPaidResourceProjection(JSON.parse(staticFiles['.well-known/acp.json'].body))
  assertPaidResourceProjection(JSON.parse(staticFiles['.well-known/ucp'].body))
  assertPaidResourceProjection(JSON.parse(staticFiles['openapi.json'].body))
})

test('commerce discovery omits the paid resource unless every visible runtime field is valid', async () => {
  const incomplete = { ...XRPL_ENV, XRPL_X402_PAY_TO_ADDRESS: '' }
  const discovery = buildAgenticGraphCommerceDiscovery({ origin: 'https://airvio.co', env: incomplete })
  assert.deepEqual(discovery.paidResources, [])
  assert.equal(discovery.xrplX402PaidResource, undefined)
  assert.equal(discovery.acpDiscovery[PAID_RESOURCES_EXTENSION], undefined)
  assert.equal(discovery.mppOpenApi.paths[PAID_RESOURCE_PATH], undefined)
})

test('Pages root discovery and MCP inspection use the request runtime environment', async () => {
  const rootResponse = await onRequest({
    request: new Request('https://airvio.co/.well-known/acp.json'),
    env: XRPL_ENV,
    next: async () => new Response('static fallback'),
  })
  assert.equal(rootResponse.status, 200)
  assert.equal(rootResponse.headers.get('cache-control'), 'no-store')
  assertPaidResourceProjection(await rootResponse.json())

  const mcpResponse = await onRequest({
    request: new Request('https://airvio.co/agentic-graph/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'inspect_agent_surface', arguments: {} },
      }),
    }),
    env: XRPL_ENV,
    next: async () => new Response('unexpected fallback'),
  })
  assert.equal(mcpResponse.status, 200)
  const payload = await mcpResponse.json()
  const commerce = payload.result?.structuredContent?.commerce
  assert.equal(commerce?.paidResources?.[0]?.id, PAID_RESOURCE_ID)
})
