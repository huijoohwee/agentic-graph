export const calendarReceiptByteLimit = 4096

export type TradingCalendarReceipt = {
  schema: 'trading-calendar-fixture/v1'
  operation: 'read.calendar'
  source: 'synthetic-market/v1'
  market: string
  begin_date: string
  end_date: string
  code: string
  name: string
  earnings_date: string
  earnings_timestamp: number
  pub_type: string
  period_text: string
  eps_actual: number | null
  eps_predict: number | null
  price: string
  published: boolean
  request_id: string
  ledger_revision: number
  digest: string
}

const fields = [
  'begin_date', 'code', 'earnings_date', 'earnings_timestamp', 'end_date', 'eps_actual', 'eps_predict',
  'ledger_revision', 'market', 'name', 'operation', 'period_text', 'price', 'pub_type', 'published',
  'request_id', 'schema', 'source',
] as const

const markets = ['HK', 'US', 'SH', 'SZ', 'CN', 'SG', 'JP', 'AU', 'CA', 'MY']
const dayMs = 86_400_000

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false
  const ms = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
}
const finiteOrNull = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))

export async function parseTradingCalendarReceipt(text: string): Promise<TradingCalendarReceipt> {
  if (text.length > calendarReceiptByteLimit || new TextEncoder().encode(text).length > calendarReceiptByteLimit) throw Error('Calendar receipt exceeds 4 KiB.')
  const row = JSON.parse(text)
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== fields.length + 1
      || !fields.every(key => Object.prototype.hasOwnProperty.call(row, key))
      || row.schema !== 'trading-calendar-fixture/v1' || row.operation !== 'read.calendar' || row.source !== 'synthetic-market/v1'
      || typeof row.digest !== 'string' || !/^[a-f0-9]{64}$/.test(row.digest)
      || !markets.includes(row.market) || !isDate(row.begin_date) || !isDate(row.end_date) || row.end_date < row.begin_date
      || (Date.parse(row.end_date + 'T00:00:00Z') - Date.parse(row.begin_date + 'T00:00:00Z')) / dayMs + 1 > 7
      || typeof row.code !== 'string' || !/^[A-Z]{2,3}\.[A-Z0-9]{1,12}$/.test(row.code)
      || typeof row.name !== 'string' || row.name.length > 128
      || !isDate(row.earnings_date) || row.earnings_date < row.begin_date || row.earnings_date > row.end_date
      || !Number.isSafeInteger(row.earnings_timestamp) || row.earnings_timestamp <= 0
      || typeof row.pub_type !== 'string' || !/^[A-Z0-9_]{1,16}$/.test(row.pub_type)
      || typeof row.period_text !== 'string' || row.period_text.length > 32
      || !finiteOrNull(row.eps_actual) || !finiteOrNull(row.eps_predict)
      || typeof row.price !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(row.price) || Number(row.price) <= 0
      || typeof row.published !== 'boolean'
      || typeof row.request_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.request_id)
      || !Number.isSafeInteger(row.ledger_revision) || row.ledger_revision < 1) {
    throw Error('Expected a synthetic Trading read.calendar receipt with valid market-local dates, microsecond time and estimates.')
  }
  // Trading hashes the flat projection using sorted JSON keys, excluding the digest itself.
  const canonical = JSON.stringify(row, [...fields])
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))
  const digest = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
  if (digest !== row.digest) throw Error('Calendar receipt checksum mismatch.')
  return row
}