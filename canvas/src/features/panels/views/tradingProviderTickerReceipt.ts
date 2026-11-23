import { tickerReceiptByteLimit } from './tradingTickerReceipt'

type ProviderQuote = {
  schema: 'trading-provider-ticker/v1'
  operation: 'read.ticker'
  candidate: string
  provider: string
  definition_digest: string
  result_digest: string
  rights_digest: string
  retain_until_utc: string
  request_id: string
  ledger_revision: number
  symbol: string
  price: string
  currency: string
  market_time_utc: string | null
  observed_utc: string
  delay_class: 'unknown' | 'delayed' | 'realtime'
}

export type ProviderTickerReceipt = { payload: ProviderQuote, signature: string }

const fields: (keyof ProviderQuote)[] = [
  'candidate', 'currency', 'definition_digest', 'delay_class', 'ledger_revision', 'market_time_utc',
  'observed_utc', 'operation', 'price', 'provider', 'request_id', 'result_digest', 'retain_until_utc',
  'rights_digest', 'schema', 'symbol',
]
const hex = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s)
const exactKeys = (obj: unknown, keys: string[]) => obj !== null && typeof obj === 'object' &&
  !Array.isArray(obj) && Object.keys(obj).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(obj, k))

function bytes(text: string, size: number) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length !== Math.ceil(size * 4 / 3)) {
    throw Error('Invalid provider receipt key or signature.')
  }
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = atob(base64)
  if (decoded.length !== size || btoa(decoded).replace(/=+$/, '') !== base64) throw Error('Invalid provider receipt encoding.')
  return Uint8Array.from(decoded, c => c.charCodeAt(0))
}

function instant(s: unknown) {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s)) return NaN
  const ms = Date.parse(s)
  return Number.isFinite(ms) && new Date(ms).toISOString() === (s.length === 20 ? s.slice(0, -1) + '.000Z' : s) ? ms : NaN
}

// The installation pins the signer and reviewed provider independently of every imported file.
export async function parseProviderTickerReceipt(text: string, trust = import.meta.env?.VITE_TRADING_TICKER_TRUST): Promise<ProviderTickerReceipt> {
  const encoder = new TextEncoder()
  if (text.length > tickerReceiptByteLimit || encoder.encode(text).length > tickerReceiptByteLimit) throw Error('Ticker receipt exceeds 4 KiB.')
  if (!trust) throw Error('This Graph installation needs a trusted Trading provider key.')
  const pin = JSON.parse(trust)
  if (!exactKeys(pin, ['candidate', 'provider', 'definition_digest', 'public_key']) || !hex(pin.candidate) ||
      !hex(pin.definition_digest) || typeof pin.provider !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(pin.provider)) {
    throw Error('Invalid Trading provider trust configuration.')
  }
  const receipt = JSON.parse(text)
  const p = receipt?.payload
  if (!exactKeys(receipt, ['payload', 'signature']) || !exactKeys(p, fields) || p.schema !== 'trading-provider-ticker/v1' ||
      p.operation !== 'read.ticker' || p.provider !== pin.provider || p.candidate !== pin.candidate || p.definition_digest !== pin.definition_digest) {
    throw Error('Receipt does not match the trusted Trading provider and candidate.')
  }
  const market = instant(p.market_time_utc), observed = instant(p.observed_utc), until = instant(p.retain_until_utc)
  if (!hex(p.rights_digest) || !hex(p.result_digest) || typeof p.symbol !== 'string' || !/^[A-Z0-9][A-Z0-9./_-]{0,39}$/.test(p.symbol) ||
      typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency) || typeof p.price !== 'string' || p.price.length > 64 ||
      !/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(p.price) || !Number.isFinite(Number(p.price)) || Number(p.price) <= 0 ||
      !['unknown', 'realtime', 'delayed'].includes(p.delay_class) || !(observed >= 0 && observed <= Date.now() && until > observed) ||
      (p.market_time_utc !== null && !(market <= observed)) || typeof p.request_id !== 'string' ||
      !/^(?:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}|sha256:[0-9a-f]{64})$/.test(p.request_id) ||
      !Number.isSafeInteger(p.ledger_revision) || p.ledger_revision < 1) throw Error('Invalid provider quote fields.')
  const key = await crypto.subtle.importKey('raw', bytes(pin.public_key, 32), 'Ed25519', false, ['verify'])
  if (!await crypto.subtle.verify('Ed25519', key, bytes(receipt.signature, 64), encoder.encode(JSON.stringify(p, fields)))) {
    throw Error('Trading provider signature mismatch.')
  }
  if (Date.now() >= until) throw Error('Provider receipt retention has expired.')
  return receipt
}
