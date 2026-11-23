import React, { useEffect, useRef, useState } from 'react'
import { getLocalStorage, resolveBrowserStorageKey } from '@/lib/persistence'
import { LearningOfflineControls } from '@/features/python-learning/LearningOfflineControls'
import { parseTradingTickerReceipt, tickerReceiptByteLimit, type TradingTickerReceipt } from './tradingTickerReceipt'
import { parseProviderTickerReceipt, type ProviderTickerReceipt } from './tradingProviderTickerReceipt'

type Receipt = TradingTickerReceipt | ProviderTickerReceipt

export default function TradingTickerFixture({ provider = false }: { provider?: boolean }) {
  const storageKey = provider ? 'trading.provider-ticker-receipt.v1' : 'trading.synthetic-ticker-receipt.v1'
  const parse = provider ? parseProviderTickerReceipt : parseTradingTickerReceipt
  const title = provider ? 'Trading provider ticker' : 'Trading ticker fixture'
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const sequence = useRef(0)
  const signed = receipt && 'payload' in receipt ? receipt.payload : null
  const quote = receipt && ('payload' in receipt ? receipt.payload : receipt)

  useEffect(() => {
    async function restore() {
      const turn = ++sequence.current
      const storage = getLocalStorage()
      let text: string | null = null
      try {
        text = storage?.getItem(storageKey) ?? null
        const saved = text ? await parse(text) : null
        if (turn === sequence.current) { setReceipt(saved); setError('') }
      } catch (cause) {
        if (turn !== sequence.current) return
        setReceipt(null)
        setError(provider && cause instanceof Error ? cause.message : 'The saved ticker receipt could not be verified.')
        if (provider && text && storage?.getItem(storageKey) === text) storage.removeItem(storageKey)
      }
    }
    const syncStorage = (event: StorageEvent) => {
      if (event.key === resolveBrowserStorageKey(storageKey) || event.key === null) void restore()
    }
    const syncNetwork = () => setOffline(navigator.onLine === false)
    const onResume = () => { if (provider && !document.hidden) void restore() }
    void restore()
    window.addEventListener('storage', syncStorage)
    window.addEventListener('offline', syncNetwork)
    window.addEventListener('online', syncNetwork)
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('pageshow', onResume)
    return () => {
      ++sequence.current
      window.removeEventListener('storage', syncStorage)
      window.removeEventListener('offline', syncNetwork)
      window.removeEventListener('online', syncNetwork)
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('pageshow', onResume)
    }
  }, [parse, provider, storageKey])

  useEffect(() => {
    if (!signed) return
    let timer: number
    const checkExpiry = () => {
      const remaining = Date.parse(signed.retain_until_utc) - Date.now()
      if (remaining > 0) {
        timer = window.setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647))
        return
      }
      setReceipt(null)
      setError('Provider receipt retention has expired.')
      const storage = getLocalStorage()
      if (storage?.getItem(storageKey) === JSON.stringify(receipt)) storage.removeItem(storageKey)
    }
    checkExpiry()
    return () => window.clearTimeout(timer)
  }, [signed, receipt, storageKey])

  async function openReceipt(file: File) {
    const turn = ++sequence.current
    try {
      if (file.size > tickerReceiptByteLimit) throw Error('Ticker receipt exceeds 4 KiB.')
      const saved = await parse(await file.text())
      if (turn !== sequence.current) return
      const storage = getLocalStorage()
      if (!storage) throw Error('Device storage is unavailable.')
      storage.setItem(storageKey, JSON.stringify(saved))
      setReceipt(saved)
      setError('')
    } catch (cause) {
      if (turn === sequence.current) setError(cause instanceof SyntaxError ? 'Choose a valid JSON receipt.' :
        cause instanceof Error ? cause.message : 'Unable to save the ticker receipt.')
    }
  }

  return (
    <section aria-label={title} className="min-w-0 space-y-2 border-b p-2 text-sm">
      <h3 className="font-semibold">{title}</h3>
      <label className="block">{provider ? 'Open signed provider receipt' : 'Open synthetic receipt'}
        <input type="file" accept=".json,application/json" className="block max-w-full py-1" onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void openReceipt(file)
        }} />
      </label>
      {error && <p role="alert">{error}</p>}
      {quote && <div aria-live="polite" className="min-w-0 space-y-1">
        <p>{offline ? 'Offline replay' : 'Saved on this device'} · {signed ? signed.provider : 'Synthetic quote'}</p>
        <p className="font-semibold">{quote.symbol} · {quote.price} {quote.currency}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs">
          <dt>Market time</dt><dd className="break-words">{quote.market_time_utc ?? 'Unknown'}</dd>
          <dt>Captured</dt><dd className="break-words">{quote.observed_utc}</dd>
          <dt>Age at capture</dt><dd>{quote.market_time_utc
            ? Math.floor((Date.parse(quote.observed_utc) - Date.parse(quote.market_time_utc)) / 1000).toLocaleString() + ' s' : 'Unknown'}</dd>
          <dt>Feed delay</dt><dd>{quote.delay_class === 'unknown' ? 'Unknown' : quote.delay_class}</dd>
          <dt>Ledger revision</dt><dd>{quote.ledger_revision}</dd>
          {signed && <><dt>Replay until</dt><dd>{signed.retain_until_utc}</dd></>}
        </dl>
        <details className="text-xs"><summary>Receipt details</summary>
          <p className="break-all">Request ID {quote.request_id}</p>
          <p className="break-all">SHA-256 {'digest' in quote ? quote.digest : quote.result_digest}</p>
        </details>
        <LearningOfflineControls purpose="workspace" />
      </div>}
    </section>
  )
}
