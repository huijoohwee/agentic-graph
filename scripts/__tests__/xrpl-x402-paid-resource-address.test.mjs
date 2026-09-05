import assert from 'node:assert/strict'
import test from 'node:test'

import * as pinnedX402 from 'x402-xrpl'
import {
  encodePaymentRequiredHeader as encodeCorePaymentRequiredHeader,
  encodePaymentResponseHeader as encodeCorePaymentResponseHeader,
} from '@x402/core/http'
import { encodeAccountID } from 'ripple-address-codec'
import { isValidClassicAddress } from 'xrpl'

import {
  isAgenticCommercePaidResourceXrplAddress,
  readAgenticCommercePaidResourceConfiguration,
} from '../../grph-shared/dist/payments/agenticCommercePaidResourceSsot.js'
import {
  validateXrplX402Config,
  XRPL_X402_CONFIG_KEYS,
} from '../configure-xrpl-x402-paid-resource.mjs'
import {
  runXrplX402Smoke,
  validateSmokeInputs,
} from '../smoke-xrpl-x402-paid-resource.mjs'

const VALID_ADDRESS = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY'
const BAD_CHECKSUM_ADDRESS = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDZ'
const PAYER_ADDRESS = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const RESOURCE_URL = 'https://payments.test/api/payments/commerce/x402/xrpl/travel-requote'
const SIGNED_TX_BLOB = '1200ABCD'
const TRANSACTION_HASH = 'A'.repeat(64)
const INVOICE_ID = 'b'.repeat(64)
const INVOICE_MEMO = pinnedX402.invoiceIdToMemoHex(INVOICE_ID).toUpperCase()
const SOURCE_TAG = 804681468
const TEST_SEED = 'test-wallet-material-never-output'
const DISCOVERY_REQUEST = Object.freeze({
  operation: 'discoverOffers',
  contractVersion: 'agentic-graph.travel-discovery/v1',
  agentId: 'agent-flight',
  legId: 'leg-01',
  intent: Object.freeze({
    intentId: 'intent-01',
    category: 'flight',
    constraints: Object.freeze({
      bundle_id: 'bundle-01',
      changed_leg_id: 'leg-01',
      prior_offer_id: null,
      prior_amount_minor: null,
    }),
  }),
})
const VERIFIED_QUOTE = Object.freeze({
  kind: 'offer',
  legId: DISCOVERY_REQUEST.legId,
  offerId: 'offer-live-01',
  amountMinor: 125_00,
  currency: 'SGD',
  priceVerification: 'verified',
  agentId: DISCOVERY_REQUEST.agentId,
  promptTokens: 0,
  completionTokens: 0,
  dollarCost: 0,
  provenance: Object.freeze({
    provider: 'atlas-atriptech',
    providerReference: 'atlas-routing-reference-1',
    providerReferenceDigest: 'a'.repeat(64),
    currency: 'SGD',
    priceVerification: 'verified',
    verificationSessionDigest: 'b'.repeat(64),
    verificationValidForSeconds: '1800',
    inventoryState: 'not-held-until-order',
    bookability: 'verified-not-ordered',
    contractVersion: 'agentic-graph.travel-discovery/v1',
  }),
})

const paymentRequired = (accepted) => ({
  x402Version: 2,
  error: 'Payment required',
  resource: {
    url: RESOURCE_URL,
    description: 'Verified live flight requote',
    mimeType: 'application/json',
  },
  accepts: [accepted],
})

const smokeEnvironment = (overrides = {}) => ({
  XRPL_X402_SMOKE_NETWORK: 'xrpl:1',
  XRPL_X402_SMOKE_EXPECTED_PAY_TO_ADDRESS: VALID_ADDRESS,
  XRPL_X402_SMOKE_RESOURCE_URL: RESOURCE_URL,
  XRPL_X402_SMOKE_WS_URL: 'wss://ledger.test',
  XRPL_X402_SMOKE_MAX_DROPS: '1000',
  XRPL_X402_SMOKE_REQUEST_JSON: JSON.stringify(DISCOVERY_REQUEST),
  XRPL_X402_SMOKE_IDEMPOTENCY_KEY: 'smoke-01',
  XRPL_X402_SMOKE_TIMEOUT_MS: '5000',
  XRPL_X402_BUYER_SEED: TEST_SEED,
  ...overrides,
})

const makeSmokeFixture = async (overrides = {}) => {
  const accepted = {
    scheme: 'exact',
    network: 'xrpl:1',
    amount: '1000',
    asset: 'XRP',
    payTo: VALID_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: { invoiceId: INVOICE_ID, sourceTag: SOURCE_TAG },
    ...overrides.accepted,
  }
  const challenge = paymentRequired(accepted)
  const invoiceField = (await pinnedX402.invoiceIdToInvoiceIdField(INVOICE_ID)).toUpperCase()
  const localTransaction = {
    TransactionType: 'Payment',
    Account: PAYER_ADDRESS,
    Destination: VALID_ADDRESS,
    Amount: '1000',
    SourceTag: SOURCE_TAG,
    InvoiceID: invoiceField,
    Memos: [{ Memo: { MemoData: INVOICE_MEMO } }],
    ...overrides.localTransaction,
  }
  const preparedAccepted = { ...accepted, ...overrides.preparedAccepted }
  const paymentPayload = {
    x402Version: 2,
    accepted: preparedAccepted,
    payload: { signedTxBlob: SIGNED_TX_BLOB, invoiceId: INVOICE_ID },
  }
  const prepared = {
    paymentPayload,
    paymentHeader: pinnedX402.base64EncodeUtf8(
      pinnedX402.jsonCanonicalStringify(paymentPayload),
    ),
    signedTxBlob: SIGNED_TX_BLOB,
    invoiceId: INVOICE_ID,
    ...overrides.prepared,
  }
  const paymentResponse = {
    success: true,
    transaction: TRANSACTION_HASH,
    network: 'xrpl:1',
    amount: '1000',
    payer: PAYER_ADDRESS,
    ...overrides.paymentResponse,
  }
  const resource = {
    ok: true,
    contract: 'agentic-commerce.paid-resource/v1',
    resource: 'agentic-commerce.travel-requote/v1',
    provider: 'agent-flight',
    invoiceId: INVOICE_ID,
    quote: VERIFIED_QUOTE,
    ...overrides.resource,
  }
  const ledgerResult = {
    validated: true,
    hash: TRANSACTION_HASH,
    ledger_index: 123,
    meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1000' },
    tx_json: {
      ...localTransaction,
      Amount: undefined,
      DeliverMax: '1000',
      hash: TRANSACTION_HASH,
      ...overrides.ledgerTransaction,
    },
    ...overrides.ledgerResult,
  }
  const state = {
    fetches: [],
    requests: [],
    clientOptions: null,
    preparedRequirements: null,
    disconnected: false,
    seedSeen: null,
  }
  class FakeClient {
    constructor(_url, options) {
      state.clientOptions = options
    }

    async connect() {
      if (overrides.connectError) throw overrides.connectError
    }

    async request(request) {
      state.requests.push(request)
      if (request.command === 'server_info') {
        if (overrides.serverInfoError) throw overrides.serverInfoError
        return overrides.serverInfo ?? { result: { info: { network_id: 1 } } }
      }
      if (request.command === 'tx') return { result: ledgerResult }
      throw new Error('unexpected_rpc_request')
    }

    async disconnect() {
      state.disconnected = true
    }
  }
  class FakePayer {
    constructor(_options, { client }) {
      assert.ok(client instanceof FakeClient)
    }

    async preparePayment(requirements) {
      state.preparedRequirements = requirements
      return prepared
    }
  }
  const fetchImpl = async (_input, init) => {
    const headers = new Headers(init.headers)
    state.fetches.push({
      body: init.body,
      signature: headers.get(pinnedX402.HEADER_PAYMENT_SIGNATURE),
    })
    if (!headers.has(pinnedX402.HEADER_PAYMENT_SIGNATURE)) {
      const body = overrides.challengeBody ?? challenge
      const header = overrides.challengeHeader
        ?? encodeCorePaymentRequiredHeader(challenge)
      return new Response(JSON.stringify(body), {
        status: 402,
        headers: { [pinnedX402.HEADER_PAYMENT_REQUIRED]: header },
      })
    }
    return new Response(JSON.stringify(resource), {
      status: 200,
      headers: {
        [pinnedX402.HEADER_PAYMENT_RESPONSE]: encodeCorePaymentResponseHeader(paymentResponse),
      },
    })
  }
  const x402 = { ...pinnedX402, XRPLPresignedPaymentPayer: FakePayer }
  const xrpl = {
    Client: FakeClient,
    Wallet: {
      fromSeed(seed) {
        state.seedSeen = seed
        return { classicAddress: PAYER_ADDRESS }
      },
    },
    decode: () => localTransaction,
    hashes: { hashSignedTx: () => TRANSACTION_HASH },
    isValidClassicAddress,
  }
  return {
    state,
    accepted,
    prepared,
    environment: smokeEnvironment(overrides.environment),
    dependencies: {
      fetchImpl: overrides.fetchImpl ?? fetchImpl,
      loadModules: async () => ({ x402, xrpl }),
      packageVersion: name => name === 'x402-xrpl' ? '0.3.2' : '4.5.0',
      sleep: async () => {},
    },
  }
}

const validValues = () => new Map([
  [XRPL_X402_CONFIG_KEYS.network, 'xrpl:1'],
  [XRPL_X402_CONFIG_KEYS.payTo, VALID_ADDRESS],
  [XRPL_X402_CONFIG_KEYS.amountDrops, '1000'],
  [XRPL_X402_CONFIG_KEYS.sourceTag, '804681468'],
  [XRPL_X402_CONFIG_KEYS.destinationTag, ''],
  [XRPL_X402_CONFIG_KEYS.facilitatorUrl, 'https://facilitator.test'],
  [XRPL_X402_CONFIG_KEYS.rpcUrl, 'https://rpc.test'],
  [XRPL_X402_CONFIG_KEYS.maxTimeoutSeconds, '300'],
])

test('shared runtime requires a checksum-valid XRPL classic address', () => {
  assert.equal(isAgenticCommercePaidResourceXrplAddress(VALID_ADDRESS), true)
  assert.equal(isAgenticCommercePaidResourceXrplAddress(BAD_CHECKSUM_ADDRESS), false)

  const valid = readAgenticCommercePaidResourceConfiguration(Object.fromEntries(validValues()))
  assert.equal(valid.ok, true)

  const bad = readAgenticCommercePaidResourceConfiguration({
    ...Object.fromEntries(validValues()),
    XRPL_X402_PAY_TO_ADDRESS: BAD_CHECKSUM_ADDRESS,
  })
  assert.deepEqual(bad, {
    ok: false,
    fields: ['XRPL_X402_PAY_TO_ADDRESS'],
  })
})

test('browser-safe classic-address validation matches encoded account IDs', () => {
  for (let index = 0; index < 32; index += 1) {
    const accountId = Uint8Array.from(
      { length: 20 },
      (_, byte) => (index * 31 + byte * 17) % 256,
    )
    const address = encodeAccountID(accountId)
    assert.equal(isValidClassicAddress(address), true)
    assert.equal(isAgenticCommercePaidResourceXrplAddress(address), true)
    const corrupted = `${address.slice(0, -1)}${address.endsWith('r') ? 'p' : 'r'}`
    assert.equal(isValidClassicAddress(corrupted), false)
    assert.equal(isAgenticCommercePaidResourceXrplAddress(corrupted), false)
  }
  for (const invalid of [
    BAD_CHECKSUM_ADDRESS,
    `${VALID_ADDRESS}r`,
    VALID_ADDRESS.slice(1),
    'XVLhHMPHU98es4dbozjVtdWzVrDjtV1AqEL4xcZj5whKbmc',
    'not-an-address',
  ]) assert.equal(isAgenticCommercePaidResourceXrplAddress(invalid), false)
})

test('operator configuration rejects a same-shape address with a bad checksum', () => {
  assert.deepEqual(validateXrplX402Config(validValues()), [])

  const values = validValues()
  values.set(XRPL_X402_CONFIG_KEYS.payTo, BAD_CHECKSUM_ADDRESS)
  assert.deepEqual(validateXrplX402Config(values), [
    'XRPL_X402_PAY_TO_ADDRESS must be a classic XRPL receiving address.',
  ])
})

test('smoke preflight requires an explicitly configured xrpl:1 network', () => {
  const environment = smokeEnvironment()
  delete environment.XRPL_X402_SMOKE_NETWORK
  const result = validateSmokeInputs({
    args: ['--confirm-testnet-payment'],
    environment,
  })
  assert.equal(result.network, '')
  assert.ok(result.errors.includes(
    'XRPL_X402_SMOKE_NETWORK is required and must be xrpl:1 testnet',
  ))
})

test('smoke requires an explicit checksum-valid expected payee', async (t) => {
  await t.test('missing', () => {
    const environment = smokeEnvironment()
    delete environment.XRPL_X402_SMOKE_EXPECTED_PAY_TO_ADDRESS
    const result = validateSmokeInputs({
      args: ['--confirm-testnet-payment'],
      environment,
    })
    assert.ok(result.errors.includes('XRPL_X402_SMOKE_EXPECTED_PAY_TO_ADDRESS is required'))
  })

  await t.test('bad checksum', async () => {
    const fixture = await makeSmokeFixture({
      environment: { XRPL_X402_SMOKE_EXPECTED_PAY_TO_ADDRESS: BAD_CHECKSUM_ADDRESS },
    })
    const result = await runXrplX402Smoke({
      args: ['--confirm-testnet-payment'],
      environment: fixture.environment,
      dependencies: fixture.dependencies,
    })
    assert.deepEqual(result, {
      ok: false,
      status: 'failed',
      reason: 'expected_pay_to_address_invalid',
    })
    assert.equal(fixture.state.fetches.length, 0)
    assert.equal(fixture.state.seedSeen, null)
  })
})

test('live smoke evidence binds the exact requirement, payload, signed blob, ledger, and resource', async () => {
  const fixture = await makeSmokeFixture()
  const result = await runXrplX402Smoke({
    args: ['--confirm-testnet-payment'],
    environment: fixture.environment,
    dependencies: fixture.dependencies,
  })

  assert.deepEqual(result, {
    ok: true,
    status: 'fulfilled',
    httpStatus: 200,
    network: 'xrpl:1',
    payTo: VALID_ADDRESS,
    transactionHash: TRANSACTION_HASH,
    payer: PAYER_ADDRESS,
    acceptedRequirementSha256: await pinnedX402.paymentRequirementsHash(fixture.accepted),
    paymentRequiredSha256: result.paymentRequiredSha256,
    paymentPayloadSha256: result.paymentPayloadSha256,
    signedTransactionSha256: result.signedTransactionSha256,
    resourceStatus: 'ok',
    resourceBodySha256: result.resourceBodySha256,
    ledgerIndex: 123,
    evidence: 'testnet-signed-payload-ledger-resource',
  })
  for (const digest of [
    result.paymentRequiredSha256,
    result.paymentPayloadSha256,
    result.signedTransactionSha256,
  ]) assert.match(digest, /^sha256:[0-9a-f]{64}$/u)
  assert.match(result.resourceBodySha256, /^[0-9a-f]{64}$/u)
  assert.equal(fixture.state.fetches.length, 2)
  assert.equal(fixture.state.fetches[0].signature, null)
  assert.equal(fixture.state.fetches[1].signature, fixture.prepared.paymentHeader)
  assert.deepEqual(fixture.state.preparedRequirements, fixture.accepted)
  assert.deepEqual(fixture.state.requests, [
    { command: 'server_info' },
    { command: 'tx', transaction: TRANSACTION_HASH, binary: false },
  ])
  assert.deepEqual(fixture.state.clientOptions, {
    connectionTimeout: 5_000,
    timeout: 5_000,
  })
  assert.equal(fixture.state.seedSeen, TEST_SEED)
  assert.equal('XRPL_X402_BUYER_SEED' in fixture.environment, false)
  assert.equal(fixture.state.disconnected, true)
  const publicEvidence = JSON.stringify(result)
  assert.equal(publicEvidence.includes(TEST_SEED), false)
  assert.equal(publicEvidence.includes(SIGNED_TX_BLOB), false)
  assert.equal(publicEvidence.includes(fixture.prepared.paymentHeader), false)
})

test('live smoke accepts protocol-optional payment amount and payer', async () => {
  const fixture = await makeSmokeFixture({
    paymentResponse: { amount: undefined, payer: undefined },
  })
  const result = await runXrplX402Smoke({
    args: ['--confirm-testnet-payment'],
    environment: fixture.environment,
    dependencies: fixture.dependencies,
  })
  assert.equal(result.ok, true)
  assert.equal(result.payer, PAYER_ADDRESS)
})

test('smoke timeout aborts and cancels stalled unpaid and paid HTTP bodies', async (t) => {
  for (const phase of ['unpaid', 'paid']) for (const stall of ['fetch', 'body']) {
    await t.test(`${phase} ${stall}`, async () => {
      const fixture = await makeSmokeFixture({
        environment: { XRPL_X402_SMOKE_TIMEOUT_MS: '1000' },
      })
      const normalFetch = fixture.dependencies.fetchImpl
      let aborted = false
      let canceled = false
      fixture.dependencies.fetchImpl = async (input, init) => {
        const paid = new Headers(init.headers).has(pinnedX402.HEADER_PAYMENT_SIGNATURE)
        if (phase === 'paid' && !paid) return normalFetch(input, init)
        init.signal.addEventListener('abort', () => { aborted = true }, { once: true })
        if (stall === 'fetch') return await new Promise(() => {})
        const body = new ReadableStream({
          pull: () => new Promise(() => {}), cancel: () => { canceled = true; return new Promise(() => {}) },
        })
        return new Response(body, { status: paid ? 200 : 402 })
      }
      const result = await runXrplX402Smoke({
        args: ['--confirm-testnet-payment'],
        environment: fixture.environment,
        dependencies: fixture.dependencies,
      })
      assert.deepEqual(result, { ok: false, status: 'failed', reason: 'smoke_timeout' })
      assert.equal(aborted, true)
      if (stall === 'body') assert.equal(canceled, true)
    })
  }
})

test('smoke rejects mismatched response and ledger evidence instead of trusting PAYMENT-RESPONSE', async (t) => {
  const cases = [
    {
      name: 'accepted requirement network differs from configured network',
      overrides: { accepted: { network: 'xrpl:2' } },
      reason: 'payment_requirement_not_acceptable',
      beforeConnection: true,
    },
    {
      name: 'accepted payee differs from the explicitly expected address',
      overrides: {
        environment: { XRPL_X402_SMOKE_EXPECTED_PAY_TO_ADDRESS: PAYER_ADDRESS },
      },
      reason: 'payment_requirement_not_acceptable',
      beforeConnection: true,
    },
    {
      name: 'missing PAYMENT-RESPONSE network',
      overrides: { paymentResponse: { network: undefined } },
      reason: 'payment_response_network_missing',
    },
    {
      name: 'different PAYMENT-RESPONSE network',
      overrides: { paymentResponse: { network: 'xrpl:2' } },
      reason: 'payment_response_network_mismatch',
    },
    {
      name: 'different PAYMENT-RESPONSE transaction',
      overrides: { paymentResponse: { transaction: 'C'.repeat(64) } },
      reason: 'payment_response_transaction_mismatch',
    },
    {
      name: 'different PAYMENT-RESPONSE amount',
      overrides: { paymentResponse: { amount: '999' } },
      reason: 'payment_response_amount_mismatch',
    },
    {
      name: 'different resource invoice',
      overrides: { resource: { invoiceId: 'c'.repeat(64) } },
      reason: 'resource_response_contract_mismatch',
    },
    {
      name: 'empty paid quote',
      overrides: { resource: { quote: {} } },
      reason: 'resource_response_contract_mismatch',
    },
    {
      name: 'unverified paid quote provenance',
      overrides: {
        resource: {
          quote: {
            ...VERIFIED_QUOTE,
            priceVerification: 'estimated',
          },
        },
      },
      reason: 'resource_response_contract_mismatch',
    },
    {
      name: 'partial delivered amount despite a success response',
      overrides: {
        ledgerResult: {
          meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '999' },
        },
      },
      reason: 'ledger_transaction_requirement_mismatch',
    },
    {
      name: 'different ledger transaction hash',
      overrides: { ledgerResult: { hash: 'D'.repeat(64) } },
      reason: 'ledger_transaction_hash_mismatch',
    },
    {
      name: 'different signed transaction amount before submission',
      overrides: { localTransaction: { Amount: '999' } },
      reason: 'signed_transaction_requirement_mismatch',
    },
    {
      name: 'PaymentPayload accepts a different requirement',
      overrides: { preparedAccepted: { amount: '999' } },
      reason: 'prepared_payment_payload_mismatch',
    },
    {
      name: 'payment header does not contain the exact returned signed blob',
      overrides: { prepared: { signedTxBlob: '1200ABCE' } },
      reason: 'prepared_payment_payload_mismatch',
    },
  ]

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const fixture = await makeSmokeFixture(entry.overrides)
      const result = await runXrplX402Smoke({
        args: ['--confirm-testnet-payment'],
        environment: fixture.environment,
        dependencies: fixture.dependencies,
      })
      assert.deepEqual(result, { ok: false, status: 'failed', reason: entry.reason })
      assert.equal(JSON.stringify(result).includes(TEST_SEED), false)
      assert.equal(JSON.stringify(result).includes(SIGNED_TX_BLOB), false)
      assert.equal(fixture.state.disconnected, !entry.beforeConnection)
      if (entry.beforeConnection) assert.equal(fixture.state.clientOptions, null)
    })
  }
})

test('smoke fails closed when the bounded XRPL server network check cannot prove network 1', async (t) => {
  const cases = [
    {
      name: 'explicit mismatch',
      overrides: { serverInfo: { result: { info: { network_id: 2 } } } },
      reason: 'ledger_network_mismatch',
    },
    {
      name: 'missing network_id',
      overrides: { serverInfo: { result: { info: {} } } },
      reason: 'ledger_network_id_missing',
    },
    {
      name: 'server_info unavailable',
      overrides: { serverInfoError: new Error('rpc unavailable') },
      reason: 'ledger_network_unavailable',
    },
  ]

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const fixture = await makeSmokeFixture(entry.overrides)
      const result = await runXrplX402Smoke({
        args: ['--confirm-testnet-payment'],
        environment: fixture.environment,
        dependencies: fixture.dependencies,
      })
      assert.deepEqual(result, { ok: false, status: 'failed', reason: entry.reason })
      assert.equal(fixture.state.fetches.length, 1)
      assert.deepEqual(fixture.state.requests, [{ command: 'server_info' }])
      assert.equal(fixture.state.preparedRequirements, null)
      assert.equal(fixture.state.disconnected, true)
    })
  }
})
