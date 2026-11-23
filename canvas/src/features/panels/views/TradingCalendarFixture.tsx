import React, { useEffect, useRef, useState } from 'react'
import { getLocalStorage, resolveBrowserStorageKey } from '@/lib/persistence'
import { LearningOfflineControls } from '@/features/python-learning/LearningOfflineControls'
import { parseTradingCalendarReceipt, calendarReceiptByteLimit, type TradingCalendarReceipt } from './tradingCalendarReceipt'

const storageKey = 'trading.synthetic-calendar-receipt.v1'

export default function TradingCalendarFixture() {
  const [receipt, setReceipt] = useState<TradingCalendarReceipt | null>(null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const sequence = useRef(0)

  useEffect(() => {
    async function restore() {
      const turn = ++sequence.current
      const storage = getLocalStorage()
      try {
        const text = storage?.getItem(storageKey) ?? null
        const saved = text ? await parseTradingCalendarReceipt(text) : null
        if (turn === sequence.current) { setReceipt(saved); setError('') }
      } catch {
        if (turn !== sequence.current) return
        setReceipt(null)
        setError('The saved calendar receipt could not be verified.')
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
      if (file.size > calendarReceiptByteLimit) throw Error('Calendar receipt exceeds 4 KiB.')
      const saved = await parseTradingCalendarReceipt(await file.text())
      if (turn !== sequence.current) return
      const storage = getLocalStorage()
      if (!storage) throw Error('Device storage is unavailable.')
      storage.setItem(storageKey, JSON.stringify(saved))
      setReceipt(saved)
      setError('')
    } catch (cause) {
      if (turn === sequence.current) setError(cause instanceof SyntaxError ? 'Choose a valid JSON receipt.' :
        cause instanceof Error ? cause.message : 'Unable to save the calendar receipt.')
    }
  }

  const microseconds = receipt ? new Date(Math.floor(receipt.earnings_timestamp / 1000)).toISOString() : ''

  return (
    <section aria-label="Trading earnings calendar fixture" className="min-w-0 space-y-2 border-b p-2 text-sm">
      <h3 className="font-semibold">Trading earnings calendar fixture</h3>
      <label className="block">Open synthetic calendar receipt
        <input type="file" accept=".json,application/json" className="block max-w-full py-1" onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void openReceipt(file)
        }} />
      </label>
      {error && <p role="alert">{error}</p>}
      {receipt && <div aria-live="polite" className="min-w-0 space-y-1">
        <p>{offline ? 'Offline replay' : 'Saved on this device'} · Synthetic earnings · read.calendar (REST-only)</p>
        <p className="font-semibold">{receipt.code} · {receipt.name}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs">
          <dt>Market</dt><dd>{receipt.market}</dd>
          <dt>Window</dt><dd className="break-words">{receipt.begin_date} → {receipt.end_date} (inclusive)</dd>
          <dt>Earnings date</dt><dd>{receipt.earnings_date} (market-local)</dd>
          <dt>Publication</dt><dd className="break-words">{microseconds} · {receipt.earnings_timestamp} µs</dd>
          <dt>Session</dt><dd>{receipt.pub_type}</dd>
          <dt>Fiscal period</dt><dd>{receipt.period_text}</dd>
          <dt>EPS actual</dt><dd>{receipt.eps_actual === null ? 'Not published (null)' : receipt.eps_actual}</dd>
          <dt>EPS estimate</dt><dd>{receipt.eps_predict === null ? 'Unknown' : receipt.eps_predict}</dd>
          <dt>Price</dt><dd>{receipt.price}</dd>
          <dt>Published</dt><dd>{receipt.published ? 'Yes' : 'No'}</dd>
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