import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { WebsiteImportSelectionDialog } from '@/features/toolbar/WebsiteImportSelectionDialog'

test('discovery is read-only until page selection; folder toggles support partial selection', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), source = 'https://example.test/library/'
  const urls = [source, source + 'a', source + 'b']
  const requests: string[] = [], resolutions: Array<string[] | null> = []
  globalThis.fetch = (async url => {
    requests.push(String(url))
    return new Response(JSON.stringify({ ok: true, pages: urls.map(url => ({ url, path: new URL(url).pathname })), limited: false }))
  }) as typeof fetch
  const checkbox = (label: string) => Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).find(input => input.getAttribute('aria-label') === label)!
  try {
    await act(async () => root.render(<WebsiteImportSelectionDialog url={source} onResolve={urls => resolutions.push(urls)} />))
    assert.deepEqual(requests, ['/__website_import/discover'])
    assert.deepEqual(resolutions, [])
    const confirm = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.startsWith('Import selected'))!
    assert.equal(confirm.disabled, true)
    await act(async () => checkbox('Select folder /library/').click())
    assert.equal(confirm.textContent, 'Import selected (2)')
    assert.equal(checkbox(`Select page ${source}`).checked, false)
    await act(async () => checkbox(`Select page ${source}b`).click())
    assert.equal(checkbox('Select folder /library/').indeterminate, true)
    await act(async () => confirm.click())
    assert.deepEqual(resolutions, [[source + 'a']])
    assert.deepEqual(requests, ['/__website_import/discover'])
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = previousFetch; restore() }
})

test('cancel aborts pending discovery and never resolves an import selection', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  let signal: AbortSignal | undefined, resolution: string[] | null | undefined
  globalThis.fetch = ((_url, init) => { signal = init?.signal as AbortSignal; return new Promise<Response>(() => {}) }) as typeof fetch
  const host = document.createElement('section'), root = createRoot(host)
  try {
    await act(async () => root.render(<WebsiteImportSelectionDialog url="https://example.test/library/" onResolve={urls => { resolution = urls; root.unmount() }} />))
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Cancel')!.click())
    assert.equal(resolution, null)
    assert.equal(signal?.aborted, true)
    assert.equal(host.textContent, '')
  } finally { globalThis.fetch = previousFetch; restore() }
})
