import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { parseProviderTickerReceipt } from '../features/panels/views/tradingProviderTickerReceipt'

const signer = generateKeyPairSync('ed25519')
const other = generateKeyPairSync('ed25519')
const pin = { provider: 'conformance-feed', candidate: '1'.repeat(64), definition_digest: '2'.repeat(64),
  public_key: signer.publicKey.export({ format: 'jwk' }).x }
const trust = JSON.stringify(pin)
const quote = {
  schema: 'trading-provider-ticker/v1', operation: 'read.ticker', provider: pin.provider, candidate: pin.candidate,
  definition_digest: pin.definition_digest, result_digest: '3'.repeat(64), rights_digest: '4'.repeat(64),
  request_id: '0831859c-c206-4a22-b17e-706654fd9526', ledger_revision: 2,
  market_time_utc: null, observed_utc: new Date(Date.now() - 120000).toISOString(),
  retain_until_utc: new Date(Date.now() + 3600000).toISOString(),
  symbol: 'US.AAPL', price: '321.123456789012345600', currency: 'USD', delay_class: 'unknown',
}
function issue(p = quote, key = signer.privateKey) {
  const canonical = JSON.stringify(p, Object.keys(p).sort())
  return { payload: p, signature: sign(null, Buffer.from(canonical), key).toString('base64url') }
}

test('accepts a signed provider quote with independently pinned authority, exact decimals and unknown market time', async () => {
  const receipt = issue()
  const text = JSON.stringify({ signature: receipt.signature, payload: Object.fromEntries(Object.entries(quote).reverse()) })
  assert.deepEqual(await parseProviderTickerReceipt(text, trust), receipt)
  const redacted = issue({ ...quote, request_id: 'sha256:' + 'a'.repeat(64) })
  assert.deepEqual(await parseProviderTickerReceipt(JSON.stringify(redacted), trust), redacted)
})

test('refuses unpinned, expired, forged, malformed and overbroad receipts', async () => {
  const good = issue()
  await assert.rejects(parseProviderTickerReceipt(JSON.stringify(good), ''), /needs a trusted/)
  for (const edit of [{ candidate: '5'.repeat(64) }, { provider: 'moomoo' }, { definition_digest: '0'.repeat(64) }]) {
    await assert.rejects(parseProviderTickerReceipt(JSON.stringify(issue({ ...quote, ...edit })), trust), /does not match/)
  }
  for (const edited of [{ ...good, payload: { ...quote, price: '1', result_digest: '8'.repeat(64) } }, issue(quote, other.privateKey)]) {
    await assert.rejects(parseProviderTickerReceipt(JSON.stringify(edited), trust), /signature mismatch/)
  }
  await assert.rejects(parseProviderTickerReceipt(JSON.stringify({ ...good, public_key: pin.public_key }), trust), /does not match/)
  await assert.rejects(parseProviderTickerReceipt(JSON.stringify({ ...good, payload: { ...quote, account_alias: 'private' } }), trust), /does not match/)
  await assert.rejects(parseProviderTickerReceipt(JSON.stringify(issue({ ...quote, retain_until_utc: new Date(Date.now() - 1000).toISOString() })), trust), /expired/)
  for (const edit of [{ currency: 'cash' }, { delay_class: 'maybe' }, { price: '1e500' }, { market_time_utc: quote.retain_until_utc }]) {
    await assert.rejects(parseProviderTickerReceipt(JSON.stringify(issue({ ...quote, ...edit })), trust), /Invalid provider quote/)
  }
  await assert.rejects(parseProviderTickerReceipt('é'.repeat(2049), trust), /4 KiB/)
})
