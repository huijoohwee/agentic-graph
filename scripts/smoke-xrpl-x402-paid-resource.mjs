#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  parseDiscoveryRequest,
  parseVerifiedDiscoveryQuote,
} from '../cloudflare/workers/agentic-graph-travel-discovery/discovery-contract.mjs'
const require = createRequire(import.meta.url)
const EXPECTED_PATH = '/api/payments/commerce/x402/xrpl/travel-requote'
const EXPECTED_NETWORK = 'xrpl:1'
const EXPECTED_NETWORK_ID = '1'
const EXPECTED_VERSIONS = Object.freeze({ 'x402-xrpl': '0.3.2', xrpl: '4.5.0' })
const EXPECTED_CONTRACT = 'agentic-commerce.paid-resource/v1'
const EXPECTED_RESOURCE = 'agentic-commerce.travel-requote/v1'
const EXPECTED_PROVIDER = 'agent-flight'
const MAX_REQUEST_BYTES = 16 * 1024
const MAX_RESPONSE_BYTES = 256 * 1024
const MAX_XRP_DROPS = 100_000_000_000_000_000n
const MAX_XRPL_TAG = 4_294_967_295
const MAX_LEDGER_LOOKUPS = 5
const LEDGER_LOOKUP_DELAY_MS = 500
const CONFIRM_FLAG = '--confirm-testnet-payment'
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const INVOICE_ID_PATTERN = /^[0-9a-f]{64}$/u
const HASH_PATTERN = /^[0-9A-F]{64}$/u
const SIGNED_BLOB_PATTERN = /^(?:[0-9A-F]{2})+$/iu
const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const sha256Evidence = (value) => `sha256:${sha256(value)}`

const packageVersion = (name) => {
  let directory = path.dirname(require.resolve(name))
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(directory, 'package.json')
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
      if (parsed.name === name && typeof parsed.version === 'string') return parsed.version
    } catch {}
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error(`package_metadata_unavailable:${name}`)
}
const isHttpsResourceUrl = (value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.pathname === EXPECTED_PATH
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
  } catch {
    return false
  }
}

const withDeadline = async (operation, deadline) => {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new Error('smoke_timeout')
  let timeout
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('smoke_timeout')), remaining)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

const fetchWithDeadline = async (fetchImpl, input, init, deadline) => {
  const controller = new AbortController()
  const remaining = Math.max(1, deadline - Date.now())
  let timeout
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(input, {
          ...init, redirect: 'error', signal: controller.signal,
        })),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new Error('smoke_timeout'))
        }, remaining)
      }),
    ])
    return { response, body: await readBoundedResponse(response, deadline, controller) }
  } catch (error) {
    controller.abort()
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

const readBoundedResponse = async (response, deadline, controller) => {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await withDeadline(() => reader.read(), deadline)
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => {})
        throw new Error('resource_response_too_large')
      }
      chunks.push(value)
    }
  } catch (error) {
    controller.abort()
    try { void reader.cancel().catch(() => {}) } catch {}
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

const parseJson = (text, code) => {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(code)
  }
}

const exactTag = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_XRPL_TAG

const validateAcceptedRequirement = ({ paymentRequired, input, xrpl, x402 }) => {
  if (paymentRequired.x402Version !== 2) throw new Error('payment_required_version_mismatch')
  if (paymentRequired.resource?.url !== input.url
    || paymentRequired.resource?.mimeType !== 'application/json') {
    throw new Error('payment_required_resource_mismatch')
  }
  if (paymentRequired.accepts?.length !== 1) throw new Error('payment_required_accepts_mismatch')
  const accepted = paymentRequired.accepts[0]
  const extra = accepted?.extra
  if (accepted?.scheme !== 'exact'
    || accepted.network !== input.network
    || accepted.asset !== 'XRP'
    || accepted.payTo !== input.expectedPayTo
    || !xrpl.isValidClassicAddress(accepted.payTo)
    || !/^[1-9][0-9]{0,17}$/u.test(accepted.amount)
    || BigInt(accepted.amount) > BigInt(input.maxDrops)
    || !Number.isSafeInteger(accepted.maxTimeoutSeconds)
    || accepted.maxTimeoutSeconds < 1
    || accepted.maxTimeoutSeconds > 300
    || !isRecord(extra)
    || !INVOICE_ID_PATTERN.test(extra.invoiceId)
    || !exactTag(extra.sourceTag)
    || (extra.destinationTag !== undefined && !exactTag(extra.destinationTag))) {
    throw new Error('payment_requirement_not_acceptable')
  }
  const allowedExtra = new Set(['invoiceId', 'sourceTag', 'destinationTag'])
  if (Object.keys(extra).some(key => !allowedExtra.has(key))) {
    throw new Error('payment_requirement_extra_unexpected')
  }
  x402.canonicalPaymentRequirementsJson(accepted)
  return accepted
}

const hasInvoiceMemo = (transaction, memoHex) => Array.isArray(transaction.Memos)
  && transaction.Memos.some(entry => isRecord(entry)
    && isRecord(entry.Memo)
    && typeof entry.Memo.MemoData === 'string'
    && entry.Memo.MemoData.toUpperCase() === memoHex.toUpperCase())

const validatePaymentTransaction = ({
  transaction,
  requirements,
  payer,
  invoiceField,
  invoiceMemo,
  deliveredAmount,
  requireDelivered,
}) => {
  if (!isRecord(transaction)) throw new Error('ledger_transaction_invalid')
  const requestedAmount = transaction.DeliverMax ?? transaction.Amount
  const destinationTagMatches = requirements.extra.destinationTag === undefined
    ? transaction.DestinationTag === undefined
    : transaction.DestinationTag === requirements.extra.destinationTag
  const matches = transaction.TransactionType === 'Payment'
    && transaction.Account === payer
    && transaction.Destination === requirements.payTo
    && requestedAmount === requirements.amount
    && transaction.SourceTag === requirements.extra.sourceTag
    && destinationTagMatches
    && typeof transaction.InvoiceID === 'string'
    && transaction.InvoiceID.toUpperCase() === invoiceField
    && hasInvoiceMemo(transaction, invoiceMemo)
    && (!requireDelivered || deliveredAmount === requirements.amount)
  if (!matches) throw new Error(requireDelivered
    ? 'ledger_transaction_requirement_mismatch'
    : 'signed_transaction_requirement_mismatch')
}

const parseServerNetworkId = (response) => {
  const observed = response?.result?.info?.network_id
  if (typeof observed === 'number' && Number.isSafeInteger(observed) && observed >= 0) return String(observed)
  if (typeof observed === 'string' && /^[0-9]+$/u.test(observed)) {
    return observed.replace(/^0+(?=[0-9])/u, '')
  }
  return null
}

const verifyConnectedNetwork = async (client, deadline) => {
  let response
  try {
    response = await withDeadline(() => client.request({ command: 'server_info' }), deadline)
  } catch {
    throw new Error('ledger_network_unavailable')
  }
  const networkId = parseServerNetworkId(response)
  if (networkId === null) throw new Error('ledger_network_id_missing')
  if (networkId !== EXPECTED_NETWORK_ID) throw new Error('ledger_network_mismatch')
}

const transactionResult = (meta) => isRecord(meta)
  ? meta.TransactionResult ?? meta.transaction_result
  : null

const ledgerTransaction = async ({ client, transactionHash, deadline, sleep }) => {
  for (let attempt = 0; attempt < MAX_LEDGER_LOOKUPS; attempt += 1) {
    let response
    try {
      response = await withDeadline(() => client.request({
        command: 'tx',
        transaction: transactionHash,
        binary: false,
      }), deadline)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/txnNotFound/u.test(message)) throw new Error('ledger_transaction_unavailable')
    }
    const result = response?.result
    if (isRecord(result) && result.error !== 'txnNotFound' && result.validated === true) return result
    if (attempt + 1 < MAX_LEDGER_LOOKUPS) {
      await withDeadline(() => sleep(LEDGER_LOOKUP_DELAY_MS), deadline)
    }
  }
  throw new Error('ledger_transaction_not_validated')
}

const validatePreparedPayment = async ({ prepared, accepted, wallet, x402, xrpl }) => {
  if (!isRecord(prepared)
    || typeof prepared.paymentHeader !== 'string'
    || !prepared.paymentHeader
    || typeof prepared.signedTxBlob !== 'string'
    || !SIGNED_BLOB_PATTERN.test(prepared.signedTxBlob)
    || prepared.invoiceId !== accepted.extra.invoiceId) {
    throw new Error('prepared_payment_invalid')
  }
  let decodedPayload
  try {
    decodedPayload = x402.decodePaymentSignatureHeader(prepared.paymentHeader)
  } catch {
    throw new Error('prepared_payment_header_invalid')
  }
  if (x402.jsonCanonicalStringify(decodedPayload)
    !== x402.jsonCanonicalStringify(prepared.paymentPayload)
    || decodedPayload.x402Version !== 2
    || x402.canonicalPaymentRequirementsJson(decodedPayload.accepted)
      !== x402.canonicalPaymentRequirementsJson(accepted)
    || decodedPayload.payload?.signedTxBlob !== prepared.signedTxBlob
    || decodedPayload.payload?.invoiceId !== prepared.invoiceId) {
    throw new Error('prepared_payment_payload_mismatch')
  }
  const invoiceField = (await x402.invoiceIdToInvoiceIdField(prepared.invoiceId)).toUpperCase()
  const invoiceMemo = x402.invoiceIdToMemoHex(prepared.invoiceId).toUpperCase()
  let transaction
  let transactionHash
  try {
    transaction = xrpl.decode(prepared.signedTxBlob)
    transactionHash = xrpl.hashes.hashSignedTx(prepared.signedTxBlob).toUpperCase()
  } catch {
    throw new Error('signed_transaction_invalid')
  }
  if (!HASH_PATTERN.test(transactionHash)) throw new Error('signed_transaction_hash_invalid')
  validatePaymentTransaction({
    transaction,
    requirements: accepted,
    payer: wallet.classicAddress,
    invoiceField,
    invoiceMemo,
    deliveredAmount: undefined,
    requireDelivered: false,
  })
  return { decodedPayload, invoiceField, invoiceMemo, transactionHash }
}

const validatePaymentResponse = ({ header, transactionHash, network, amount, payer, x402 }) => {
  let decoded
  let raw
  try {
    decoded = x402.decodePaymentResponseHeader(header)
    raw = JSON.parse(x402.base64DecodeUtf8(header))
  } catch {
    throw new Error('payment_response_invalid')
  }
  if (!isRecord(raw) || decoded.success !== true || raw.success !== true) {
    throw new Error('payment_response_unsuccessful')
  }
  if (!decoded.network || decoded.network !== network || raw.network !== network) {
    throw new Error(decoded.network || raw.network
      ? 'payment_response_network_mismatch'
      : 'payment_response_network_missing')
  }
  if (decoded.transaction?.toUpperCase() !== transactionHash
    || String(raw.transaction ?? '').toUpperCase() !== transactionHash) {
    throw new Error('payment_response_transaction_mismatch')
  }
  if ((raw.amount !== undefined && raw.amount !== amount)
    || (decoded.amount !== undefined && decoded.amount !== amount)) {
    throw new Error('payment_response_amount_mismatch')
  }
  if ((raw.payer !== undefined && raw.payer !== payer)
    || (decoded.payer !== undefined && decoded.payer !== payer)) {
    throw new Error('payment_response_payer_mismatch')
  }
}

const validateResourceResponse = ({ body, invoiceId, request }) => {
  const parsed = parseJson(body, 'resource_response_invalid')
  if (!isRecord(parsed)
    || parsed.ok !== true
    || parsed.contract !== EXPECTED_CONTRACT
    || parsed.resource !== EXPECTED_RESOURCE
    || parsed.provider !== EXPECTED_PROVIDER
    || parsed.invoiceId !== invoiceId
    || !parseVerifiedDiscoveryQuote(parsed.quote, request)) {
    throw new Error('resource_response_contract_mismatch')
  }
  return parsed
}

const safeErrorCode = (error) => {
  const message = error instanceof Error ? error.message : String(error)
  if (/package_metadata_unavailable/u.test(message)) return message
  if (/Cannot find package|Cannot find module|ERR_MODULE_NOT_FOUND/u.test(message)) return 'smoke_dependency_unavailable'
  if (/seed|wallet|secret|private/i.test(message)) return 'buyer_wallet_initialization_failed'
  if (/timeout|abort/i.test(message)) return 'smoke_timeout'
  return /^[a-z0-9_:-]{1,120}$/i.test(message) ? message : 'smoke_failed'
}

export const validateSmokeInputs = ({ args, environment }) => {
  const errors = []
  if (!args.includes(CONFIRM_FLAG)) errors.push(`missing ${CONFIRM_FLAG}`)
  if (args.some(arg => /(?:seed|private[-_]?key|mnemonic)/i.test(arg))) {
    errors.push('wallet secret arguments are forbidden')
  }
  const network = String(environment.XRPL_X402_SMOKE_NETWORK ?? '').trim()
  if (network !== EXPECTED_NETWORK) {
    errors.push('XRPL_X402_SMOKE_NETWORK is required and must be xrpl:1 testnet')
  }
  const expectedPayTo = String(environment.XRPL_X402_SMOKE_EXPECTED_PAY_TO_ADDRESS ?? '').trim()
  if (!expectedPayTo) errors.push('XRPL_X402_SMOKE_EXPECTED_PAY_TO_ADDRESS is required')
  const url = String(environment.XRPL_X402_SMOKE_RESOURCE_URL ?? '').trim()
  if (!isHttpsResourceUrl(url)) errors.push(`smoke resource must be HTTPS at ${EXPECTED_PATH}`)
  const wsUrl = String(environment.XRPL_X402_SMOKE_WS_URL || 'wss://s.altnet.rippletest.net:51233').trim()
  try {
    const parsed = new URL(wsUrl)
    if (parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      errors.push('smoke ledger URL must be a credential-free wss URL')
    }
  } catch {
    errors.push('smoke ledger URL is invalid')
  }
  const maxDrops = String(environment.XRPL_X402_SMOKE_MAX_DROPS ?? '').trim()
  if (!/^[1-9][0-9]{0,17}$/u.test(maxDrops) || BigInt(maxDrops) > MAX_XRP_DROPS) {
    errors.push(`XRPL_X402_SMOKE_MAX_DROPS must be 1-${MAX_XRP_DROPS}`)
  }
  const requestJson = String(environment.XRPL_X402_SMOKE_REQUEST_JSON ?? '').trim()
  if (!requestJson || Buffer.byteLength(requestJson, 'utf8') > MAX_REQUEST_BYTES) {
    errors.push(`XRPL_X402_SMOKE_REQUEST_JSON must be 1-${MAX_REQUEST_BYTES} UTF-8 bytes`)
  } else {
    try {
      const parsed = JSON.parse(requestJson)
      if (!isRecord(parsed)) errors.push('smoke request JSON must be an object')
    } catch {
      errors.push('smoke request JSON is invalid')
    }
  }
  const requestedIdempotencyKey = String(environment.XRPL_X402_SMOKE_IDEMPOTENCY_KEY ?? '').trim()
  if (requestedIdempotencyKey && !IDEMPOTENCY_KEY_PATTERN.test(requestedIdempotencyKey)) {
    errors.push('XRPL_X402_SMOKE_IDEMPOTENCY_KEY must match the paid-resource contract')
  }
  const idempotencyKey = requestedIdempotencyKey || `xrpl-smoke-${randomUUID()}`
  if (!String(environment.XRPL_X402_BUYER_SEED ?? '')) {
    errors.push('XRPL_X402_BUYER_SEED is required in the process environment')
  }
  const timeoutMs = Number(environment.XRPL_X402_SMOKE_TIMEOUT_MS || '90000')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    errors.push('XRPL_X402_SMOKE_TIMEOUT_MS must be an integer from 1000 through 120000')
  }
  return {
    errors,
    network,
    expectedPayTo,
    url,
    wsUrl,
    maxDrops,
    requestJson,
    idempotencyKey,
    timeoutMs,
  }
}

export const runXrplX402Smoke = async ({
  args = process.argv.slice(2),
  environment = process.env,
  dependencies = /** @type {Record<string, any>} */ ({}),
} = {}) => {
  const input = validateSmokeInputs({ args, environment })
  if (input.errors.length > 0) return { ok: false, status: 'preflight_failed', errors: input.errors }

  let seed = String(environment.XRPL_X402_BUYER_SEED)
  delete environment.XRPL_X402_BUYER_SEED
  let client
  const deadline = Date.now() + input.timeoutMs
  try {
    const readPackageVersion = dependencies.packageVersion ?? packageVersion
    for (const [name, expected] of Object.entries(EXPECTED_VERSIONS)) {
      if (readPackageVersion(name) !== expected) {
        return { ok: false, status: 'dependency_version_mismatch', package: name, expected }
      }
    }
    const loadModules = dependencies.loadModules ?? (async () => {
      const [x402, xrpl] = await Promise.all([import('x402-xrpl'), import('xrpl')])
      return { x402, xrpl }
    })
    const { x402, xrpl } = await loadModules()
    if (!xrpl.isValidClassicAddress(input.expectedPayTo)) {
      throw new Error('expected_pay_to_address_invalid')
    }
    const fetchImpl = dependencies.fetchImpl ?? fetch
    const sleep = dependencies.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
    const wallet = xrpl.Wallet.fromSeed(seed)
    seed = ''
    const discoveryRequest = parseDiscoveryRequest(parseJson(input.requestJson, 'resource_request_invalid'))
    if (!discoveryRequest || discoveryRequest.agentId !== EXPECTED_PROVIDER) {
      throw new Error('resource_request_contract_mismatch')
    }

    const requestHeaders = new Headers({
      'content-type': 'application/json',
      'idempotency-key': input.idempotencyKey,
    })
    const firstResult = await fetchWithDeadline(fetchImpl, input.url, {
      method: 'POST',
      headers: requestHeaders,
      body: input.requestJson,
    }, deadline)
    const firstResponse = firstResult.response
    if (firstResponse.status !== 402) throw new Error('payment_required_expected')
    const requiredHeader = firstResponse.headers.get(x402.HEADER_PAYMENT_REQUIRED)
    if (!requiredHeader) throw new Error('payment_required_header_missing')
    const requiredBody = parseJson(
      firstResult.body,
      'payment_required_body_invalid',
    )
    let paymentRequired
    try {
      paymentRequired = x402.decodePaymentRequiredHeader(requiredHeader)
    } catch {
      throw new Error('payment_required_header_invalid')
    }
    if (x402.jsonCanonicalStringify(paymentRequired) !== x402.jsonCanonicalStringify(requiredBody)) {
      throw new Error('payment_required_header_body_mismatch')
    }
    const accepted = validateAcceptedRequirement({ paymentRequired, input, xrpl, x402 })

    client = new xrpl.Client(input.wsUrl, {
      connectionTimeout: Math.min(5_000, input.timeoutMs),
      timeout: Math.min(10_000, input.timeoutMs),
    })
    await withDeadline(() => client.connect(), deadline)
    await verifyConnectedNetwork(client, deadline)
    const payer = new x402.XRPLPresignedPaymentPayer({
      wallet,
      network: input.network,
      wsUrl: input.wsUrl,
      invoiceBinding: 'both',
    }, { client })
    const prepared = await withDeadline(() => payer.preparePayment(accepted), deadline)
    const preparedEvidence = await validatePreparedPayment({ prepared, accepted, wallet, x402, xrpl })

    const paidHeaders = new Headers(requestHeaders)
    paidHeaders.set(x402.HEADER_PAYMENT_SIGNATURE, prepared.paymentHeader)
    const paidResult = await fetchWithDeadline(fetchImpl, input.url, {
      method: 'POST',
      headers: paidHeaders,
      body: input.requestJson,
    }, deadline)
    const paidResponse = paidResult.response
    if (!paidResponse.ok || paidResponse.status !== 200) throw new Error(`resource_http_${paidResponse.status}`)
    const paymentResponseHeader = paidResponse.headers.get(x402.HEADER_PAYMENT_RESPONSE)
    if (!paymentResponseHeader) throw new Error('payment_response_header_missing')
    validatePaymentResponse({
      header: paymentResponseHeader,
      transactionHash: preparedEvidence.transactionHash,
      network: input.network,
      amount: accepted.amount,
      payer: wallet.classicAddress,
      x402,
    })
    const resourceBody = paidResult.body
    validateResourceResponse({
      body: resourceBody,
      invoiceId: prepared.invoiceId,
      request: discoveryRequest,
    })

    const ledger = await ledgerTransaction({
      client,
      transactionHash: preparedEvidence.transactionHash,
      deadline,
      sleep,
    })
    const observedHash = String(ledger.hash ?? ledger.tx_json?.hash ?? '').toUpperCase()
    if (observedHash !== preparedEvidence.transactionHash) throw new Error('ledger_transaction_hash_mismatch')
    if (transactionResult(ledger.meta) !== 'tesSUCCESS') throw new Error('ledger_transaction_failed')
    const ledgerPayment = isRecord(ledger.tx_json) ? ledger.tx_json : ledger
    validatePaymentTransaction({
      transaction: ledgerPayment,
      requirements: accepted,
      payer: wallet.classicAddress,
      invoiceField: preparedEvidence.invoiceField,
      invoiceMemo: preparedEvidence.invoiceMemo,
      deliveredAmount: isRecord(ledger.meta)
        ? ledger.meta.delivered_amount ?? ledger.meta.deliveredAmount
        : undefined,
      requireDelivered: true,
    })

    const paymentRequiredJson = x402.jsonCanonicalStringify(paymentRequired)
    const paymentPayloadJson = x402.jsonCanonicalStringify(preparedEvidence.decodedPayload)
    return {
      ok: true,
      status: 'fulfilled',
      httpStatus: paidResponse.status,
      network: input.network,
      payTo: input.expectedPayTo,
      transactionHash: preparedEvidence.transactionHash,
      payer: wallet.classicAddress,
      acceptedRequirementSha256: await x402.paymentRequirementsHash(accepted),
      paymentRequiredSha256: sha256Evidence(paymentRequiredJson),
      paymentPayloadSha256: sha256Evidence(paymentPayloadJson),
      signedTransactionSha256: sha256Evidence(prepared.signedTxBlob),
      resourceStatus: 'ok',
      resourceBodySha256: sha256(resourceBody),
      ledgerIndex: Number.isSafeInteger(ledger.ledger_index) ? ledger.ledger_index : null,
      evidence: 'testnet-signed-payload-ledger-resource',
    }
  } catch (error) {
    return { ok: false, status: 'failed', reason: safeErrorCode(error) }
  } finally {
    seed = ''
    if (client) {
      let disconnectTimeout
      try {
        await Promise.race([
          Promise.resolve().then(() => client.disconnect()),
          new Promise(resolve => {
            disconnectTimeout = setTimeout(resolve, 1_000)
          }),
        ])
      } catch {
      } finally {
        clearTimeout(disconnectTimeout)
      }
    }
  }
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  const result = await runXrplX402Smoke()
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.ok ? 0 : 1
}
