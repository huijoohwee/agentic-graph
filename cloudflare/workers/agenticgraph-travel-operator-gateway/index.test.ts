import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { resetAccessJwksCacheForTest } from './access-jwt'
import {
  createTravelOperatorGateway,
  OPERATOR_GATEWAY_BASE_PATH,
  type OperatorGatewayEnv,
} from './index'

const ISSUER = 'https://agenticgraph-test.cloudflareaccess.com'
const AUDIENCE = 'a'.repeat(64)
const INTERNAL_TOKEN = 'operator-internal-token-'.padEnd(48, 'x')
const NOW_MS = 1_800_000_000_000
const KID = 'access-key-1'
const REAL_CASCADE_ID = '~8:bundle-18:flight-110:event-real'
const encoder = new TextEncoder()
const provider = (id: string, contract: string, storageCompatibilityRevision: string) => Object.freeze({
  id,
  contract,
  capabilitiesDigest: 'c'.repeat(64),
  evidence: Object.freeze({
    schema: 'commerce.upstream-runtime-evidence/v1',
    prdRevision: '0.3.0',
    sourceRevision: 'a'.repeat(40),
    receiptDigest: 'd'.repeat(64),
    storageCompatibilityRevision,
    providerVersionId: 'b'.repeat(64),
    checks: Object.freeze([Object.freeze({ name: 'runtime_handler_verified', ok: true })]),
  }),
})
const providerRuntime = Object.freeze({
  schema: 'commerce.provider-runtime-proof/v1',
  sourceRevision: 'a'.repeat(40),
  providerVersionId: 'b'.repeat(64),
  providers: Object.freeze([
    provider('discovery', 'commerce.discovery-provider/v1', 'commerce-discovery-mcp-v1'),
    provider('checkout', 'commerce.checkout-provider/v1', 'commerce-checkout-do-sqlite-v1'),
    provider('marketplace', 'commerce.marketplace-provider/v1', 'marketplace-d1-0017'),
  ]),
})

const generateKeyMaterial = (kid: string) => crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
).then(async keyPair => ({
  keyPair,
  publicJwk: {
    ...await crypto.subtle.exportKey('jwk', keyPair.publicKey),
    kid,
    alg: 'RS256',
    use: 'sig',
  },
}))
const keyMaterial = generateKeyMaterial(KID)
const rotatedKeyMaterial = generateKeyMaterial('access-key-rotated')

const base64Url = (value: string | ArrayBuffer): string => Buffer.from(
  typeof value === 'string' ? value : new Uint8Array(value),
).toString('base64url')

const accessToken = async (
  overrides: Record<string, unknown> = {},
  material: typeof keyMaterial = keyMaterial,
): Promise<string> => {
  const { keyPair, publicJwk } = await material
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: publicJwk.kid }))
  const claims = base64Url(JSON.stringify({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'access-user-123',
    exp: Math.floor(NOW_MS / 1_000) + 300,
    ...overrides,
  }))
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', keyPair.privateKey, encoder.encode(`${header}.${claims}`),
  )
  return `${header}.${claims}.${base64Url(signature)}`
}

const reconciliationUrl = (suffix = ''): string =>
  `https://airvio.co${OPERATOR_GATEWAY_BASE_PATH}/v1/bundles/bundle-1/cascades/${REAL_CASCADE_ID}/reconciliation${suffix}`

const request = async (
  body: Record<string, unknown> = {
    decision_id: 'decision-1',
    decision: 'release',
    reason: 'provider-confirmed-no-effect',
  },
  token?: string,
): Promise<Request> => {
  const assertion = token ?? await accessToken()
  return new Request(reconciliationUrl(), {
    method: 'POST',
    headers: {
      'cf-access-jwt-assertion': assertion,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const envWithService = (
  fetchService: (request: Request) => Promise<Response>,
): OperatorGatewayEnv => Object.freeze({
  TRAVEL_COMMERCE_CONTROL: { fetch: fetchService },
  RECONCILIATION_OPERATOR_TOKEN: INTERNAL_TOKEN,
  DEPLOY_LANE: 'Production_Lane',
  ACCESS_ISSUER: ISSUER,
  ACCESS_AUDIENCE: AUDIENCE,
  ACCESS_JWKS_TIMEOUT_MS: '1000',
  ACCESS_JWKS_CACHE_TTL_MS: '300000',
  TRAVEL_CONTROL_TIMEOUT_MS: '1000',
})

const jwksFetch = async (request: Request): Promise<Response> => {
  const { publicJwk } = await keyMaterial
  assert.equal(request.url, `${ISSUER}/cdn-cgi/access/certs`)
  assert.equal(request.redirect, 'error')
  return Response.json({ keys: [publicJwk] })
}

beforeEach(() => resetAccessJwksCacheForTest())

describe('Cloudflare Access reconciliation gateway', () => {
  it('readiness proves the bounded JWKS and exact authenticated travel capability', async () => {
    const calls: Request[] = []
    const gateway = createTravelOperatorGateway({ fetchJwks: jwksFetch, nowMs: () => NOW_MS })
    const response = await gateway.fetch(
      new Request(`https://airvio.co${OPERATOR_GATEWAY_BASE_PATH}/readyz`),
      envWithService(async downstream => {
        calls.push(downstream)
        return Response.json({
          ok: true,
          service: 'agenticgraph-travel-commerce',
          lane: 'Production_Lane',
          capability: 'resolve-reconciliation',
          contract: 'agenticgraph.travel-reconciliation-control/v1',
          providerRuntime,
        })
      }),
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      ok: true,
      service: 'agenticgraph-travel-operator-gateway',
      lane: 'Production_Lane',
      contract: 'agenticgraph.travel-reconciliation-control/v1',
      dependencies: { accessJwks: 'ready', travelControl: 'ready' },
      providerRuntime,
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://agenticgraph-travel-commerce.internal/v1/reconciliation/runtime')
    assert.equal(calls[0].headers.get('authorization'), `Bearer ${INTERNAL_TOKEN}`)
  })

  it('rejects provider proof fields that could expose authentication material', async () => {
    const gateway = createTravelOperatorGateway({ fetchJwks: jwksFetch, nowMs: () => NOW_MS })
    const response = await gateway.fetch(
      new Request(`https://airvio.co${OPERATOR_GATEWAY_BASE_PATH}/readyz`),
      envWithService(async () => Response.json({
        ok: true,
        service: 'agenticgraph-travel-commerce',
        lane: 'Production_Lane',
        capability: 'resolve-reconciliation',
        contract: 'agenticgraph.travel-reconciliation-control/v1',
        providerRuntime: { ...providerRuntime, providerAuthSignature: '0'.repeat(64) },
      })),
    )
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), {
      ok: false,
      service: 'agenticgraph-travel-operator-gateway',
      code: 'dependency-unavailable',
      dependencies: { accessJwks: 'ready', travelControl: 'unavailable' },
    })
  })

  it('forwards only the exact decision with a hashed sub-derived operator id', async () => {
    const calls: Request[] = []
    const gateway = createTravelOperatorGateway({ fetchJwks: jwksFetch, nowMs: () => NOW_MS })
    const response = await gateway.fetch(await request(), envWithService(async downstream => {
      calls.push(downstream)
      return Response.json({ kind: 'reconciliation-resolved', decision: 'release' })
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { kind: 'reconciliation-resolved', decision: 'release' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url,
      `https://agenticgraph-travel-commerce.internal/v1/bundles/bundle-1/cascades/${encodeURIComponent(REAL_CASCADE_ID)}/reconciliation`)
    assert.equal(calls[0].headers.get('authorization'), `Bearer ${INTERNAL_TOKEN}`)
    assert.equal(calls[0].headers.has('cf-access-jwt-assertion'), false)
    const forwarded = await calls[0].clone().json() as { operator_id: string }
    assert.deepEqual(forwarded, {
      decision_id: 'decision-1',
      decision: 'release',
      reason: 'provider-confirmed-no-effect',
      operator_id: forwarded.operator_id,
    })
    assert.match(forwarded.operator_id, /^cfaccess_[a-f0-9]{40}$/)
    assert.notEqual(forwarded.operator_id, 'access-user-123')
  })

  it('rejects invalid issuer, audience, expiry, and signature before travel', async () => {
    for (const token of [
      await accessToken({ iss: 'https://other.cloudflareaccess.com' }),
      await accessToken({ aud: 'b'.repeat(64) }),
      await accessToken({ exp: Math.floor(NOW_MS / 1_000) }),
      `${await accessToken()}tampered`,
    ]) {
      let travelCalls = 0
      resetAccessJwksCacheForTest()
      const gateway = createTravelOperatorGateway({ fetchJwks: jwksFetch, nowMs: () => NOW_MS })
      const response = await gateway.fetch(await request(undefined, token), envWithService(async () => {
        travelCalls += 1
        return Response.json({ ok: true })
      }))
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { ok: false, code: 'access-denied' })
      assert.equal(travelCalls, 0)
    }
  })

  it('refreshes the bounded JWKS once when Access rotates to an unknown kid', async () => {
    const old = await keyMaterial
    const rotated = await rotatedKeyMaterial
    let jwksCalls = 0
    const gateway = createTravelOperatorGateway({
      nowMs: () => NOW_MS,
      fetchJwks: async () => {
        jwksCalls += 1
        return Response.json({ keys: [jwksCalls === 1 ? old.publicJwk : rotated.publicJwk] })
      },
    })
    const env = envWithService(async () => Response.json({ kind: 'reconciliation-resolved' }))
    assert.equal((await gateway.fetch(await request(), env)).status, 200)
    assert.equal((await gateway.fetch(await request(undefined, await accessToken({}, rotatedKeyMaterial)), env)).status, 200)
    assert.equal(jwksCalls, 2)
  })

  it('rejects client-supplied operator identity and exposes no generic proxy', async () => {
    let travelCalls = 0
    const gateway = createTravelOperatorGateway({ fetchJwks: jwksFetch, nowMs: () => NOW_MS })
    const env = envWithService(async () => {
      travelCalls += 1
      return Response.json({ ok: true })
    })
    const extraIdentity = await gateway.fetch(await request({
      decision_id: 'decision-1', decision: 'release', reason: 'no-effect', operator_id: 'spoofed',
    }), env)
    assert.equal(extraIdentity.status, 400)
    assert.equal(travelCalls, 0)
    assert.equal((await gateway.fetch(new Request(
      `https://airvio.co${OPERATOR_GATEWAY_BASE_PATH}/v1/runtime`,
    ), env)).status, 404)
    assert.equal((await gateway.fetch(new Request(reconciliationUrl(), { method: 'GET' }), env)).status, 405)
  })

  it('cancels an oversized Access-authenticated request without relying on Content-Length', async () => {
    let travelCalls = 0
    let pulls = 0
    let emitted = 0
    const totalChunks = 64
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (emitted >= totalChunks) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(1_024).fill(120))
        emitted += 1
      },
    })
    const oversized = new Request(reconciliationUrl(), {
      method: 'POST',
      headers: {
        'cf-access-jwt-assertion': await accessToken(),
        'content-type': 'application/json',
      },
      body,
      duplex: 'half',
    } as RequestInit)
    assert.equal(oversized.headers.get('content-length'), null)
    const gateway = createTravelOperatorGateway({ fetchJwks: jwksFetch, nowMs: () => NOW_MS })
    const response = await gateway.fetch(oversized, envWithService(async () => {
      travelCalls += 1
      return Response.json({ ok: true })
    }))
    assert.equal(response.status, 400)
    assert.equal(travelCalls, 0)
    assert.ok(pulls < totalChunks, `expected early stream cancellation, observed ${pulls} pulls`)
  })

  it('fails readiness closed for sentinels, wrong lane identity, and malformed JWKS', async () => {
    let jwksCalls = 0
    let travelCalls = 0
    const gateway = createTravelOperatorGateway({
      nowMs: () => NOW_MS,
      fetchJwks: async () => {
        jwksCalls += 1
        return Response.json({ keys: [] })
      },
    })
    const invalidConfig = await gateway.fetch(
      new Request(`https://internal${OPERATOR_GATEWAY_BASE_PATH}/readyz`),
      {
        ...envWithService(async () => {
          travelCalls += 1
          return Response.json({ ok: true })
        }),
        ACCESS_ISSUER: 'https://replace-with-team.cloudflareaccess.com',
        ACCESS_AUDIENCE: 'replace-with-access-audience',
      },
    )
    assert.equal(invalidConfig.status, 503)
    assert.equal(jwksCalls, 0)
    assert.equal(travelCalls, 0)

    const unavailable = await gateway.fetch(
      new Request(`https://internal${OPERATOR_GATEWAY_BASE_PATH}/readyz`),
      envWithService(async () => Response.json({
        ok: true,
        service: 'agenticgraph-travel-commerce',
        lane: 'Staging_Lane',
        capability: 'resolve-reconciliation',
        contract: 'agenticgraph.travel-reconciliation-control/v1',
      })),
    )
    assert.equal(unavailable.status, 503)
    assert.deepEqual((await unavailable.json() as { dependencies: unknown }).dependencies, {
      accessJwks: 'unavailable', travelControl: 'unavailable',
    })
  })
})
