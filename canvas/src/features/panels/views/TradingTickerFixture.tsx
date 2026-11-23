import React, { useEffect, useRef, useState } from 'react'
import { getLocalStorage, resolveBrowserStorageKey } from '@/lib/persistence'
import { LearningOfflineControls } from '@/features/python-learning/LearningOfflineControls'
import { parseTradingTickerReceipt, tickerReceiptByteLimit, type TradingTickerReceipt } from './tradingTickerReceipt'

const storageKey = 'trading.synthetic-ticker-receipt.v1'

export default function TradingTickerFixture() {
  const [receipt, setReceipt] = useState<TradingTickerReceipt | null>(null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const sequence = useRef(0)

  useEffect(() => {
    async function restore() {
      const turn = ++sequence.current
      try {
        const text = getLocalStorage()?.getItem(storageKey)
        const saved = text ? await parseTradingTickerReceipt(text) : null
        if (turn === sequence.current) { setReceipt(saved); setError('') }
      } catch {
        if (turn === sequence.current) { setReceipt(null); setError('The saved ticker receipt could not be verified.') }
      }
    }
    const syncStorage = (event: StorageEvent) => {
      if (event.key === resolveBrowserStorageKey(storageKey) || event.key === null) void restore()
    }
    const syncNetwork = () => setOffline(navigator.onLine === false)
    void restore()
    window.addEventListener('storage', syncStorage)
    window.addEventListener('offline', syncNetwork)
    window.addEventListener('online', syncNetwork)
    return () => {
      ++sequence.current
      window.removeEventListener('storage', syncStorage)
      window.removeEventListener('offline', syncNetwork)
      window.removeEventListener('online', syncNetwork)
    }
  }, [])

  async function openReceipt(file: File) {
    const turn = ++sequence.current
    try {
      if (file.size > tickerReceiptByteLimit) throw Error('Ticker receipt exceeds 4 KiB.')
      const saved = await parseTradingTickerReceipt(await file.text())
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
    <section aria-label="Trading ticker fixture" className="min-w-0 space-y-2 border-b p-2 text-sm">
      <h3 className="font-semibold">Trading ticker fixture</h3>
      <label className="block">Open synthetic receipt
        <input type="file" accept=".json,application/json" className="block max-w-full py-1" onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void openReceipt(file)
        }} />
      </label>
      {error && <p role="alert">{error}</p>}
      {receipt && <div aria-live="polite" className="min-w-0 space-y-1">
        <p>{offline ? 'Offline replay' : 'Saved on this device'} · Synthetic quote</p>
        <p className="font-semibold">{receipt.symbol} · {receipt.price} {receipt.currency}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs">
          <dt>Market time</dt><dd className="break-words">{receipt.market_time_utc}</dd>
          <dt>Captured</dt><dd className="break-words">{receipt.observed_utc}</dd>
          <dt>Age at capture</dt><dd>{Math.floor((Date.parse(receipt.observed_utc) - Date.parse(receipt.market_time_utc)) / 1000).toLocaleString()} s</dd>
          <dt>Feed delay</dt><dd>Unknown</dd>
          <dt>Ledger revision</dt><dd>{receipt.ledger_revision}</dd>
        </dl>
        <details className="text-xs"><summary>Receipt details</summary>
          <p className="break-all">Request ID {receipt.request_id}</p>
          <p className="break-all">SHA-256 {receipt.digest}</p>
        </details>
        <LearningOfflineControls purpose="workspace" />
      </div>}
    </section>
  )
}
