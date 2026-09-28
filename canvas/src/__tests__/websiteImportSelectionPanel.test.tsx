import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import WebsiteImportSelectionView from '@/features/panels/views/WebsiteImportSelectionView'
import { chooseWebsiteImportPages, finishWebsiteImportSelection } from '@/features/panels/websiteImportSelectionSession'
import { MAIN_PANEL_TABS } from '@/features/panels/mainPanelTabs'

test('discovery is read-only until page selection; folder toggles support partial selection', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
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
    await act(async () => { void chooseWebsiteImportPages(source).then(urls => { resolutions.push(urls) }); root.render(<WebsiteImportSelectionView />) })
    assert.equal(host.querySelector('dialog'), null)
    assert.deepEqual(requests, ['/__website_import/discover'])
    assert.deepEqual(resolutions, [])
    const confirm = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.startsWith('Import selected'))!
    assert.equal(confirm.disabled, true)
    await act(async () => checkbox('Select folder /library/').click())
    assert.equal(confirm.textContent, 'Import selected (2)')
    assert.equal(checkbox(`Select page ${source}`).checked, false)
    await act(async () => checkbox(`Select page ${source}b`).click())
    assert.equal(checkbox('Select folder /library/').indeterminate, true)
    await act(async () => root.render(null))
    await act(async () => root.render(<WebsiteImportSelectionView />))
    assert.equal(checkbox(`Select page ${source}a`).checked, true, 'selection survives leaving and reopening the panel')
    assert.deepEqual(requests, ['/__website_import/discover'], 'reopening does not repeat discovery')
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent?.startsWith('Import selected'))!.click())
    assert.deepEqual(resolutions, [[source + 'a']])
    assert.deepEqual(requests, ['/__website_import/discover'])
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); host.remove(); globalThis.fetch = previousFetch; restore() }
})

test('cancel aborts pending discovery and never resolves an import selection', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  let signal: AbortSignal | undefined, resolution: string[] | null | undefined
  globalThis.fetch = ((_url, init) => { signal = init?.signal as AbortSignal; return new Promise<Response>(() => {}) }) as typeof fetch
  const host = document.createElement('section'), root = createRoot(host)
  try {
    await act(async () => { void chooseWebsiteImportPages('https://example.test/library/').then(urls => { resolution = urls }); root.render(<WebsiteImportSelectionView />) })
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Cancel')!.click())
    assert.equal(resolution, null)
    assert.equal(signal?.aborted, true)
    assert.match(host.textContent || '', /Start from Launch/)
    await act(async () => root.unmount())
  } finally { finishWebsiteImportSelection(null); globalThis.fetch = previousFetch; restore() }
})


test('Import URL opens the shared Main Panel tab immediately after Workflow Manager', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const tabs = MAIN_PANEL_TABS.map(tab => tab.key)
  assert.equal(tabs[tabs.indexOf('workflowManager') + 1], 'websiteImport')
  assert.equal(tabs.filter(tab => tab === 'websiteImport').length, 1)
  let requestedTab: string | undefined
  window.addEventListener('kg:mainPanelOpen', event => { requestedTab = (event as CustomEvent).detail.tab }, { once: true })
  globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch
  try {
    const old = chooseWebsiteImportPages('https://example.test/first/')
    assert.equal(requestedTab, 'websiteImport')
    const next = chooseWebsiteImportPages('https://example.test/next/')
    assert.equal(await old, null, 'a replacement settles the previous pending selection')
    finishWebsiteImportSelection(null)
    assert.equal(await next, null)
  } finally { finishWebsiteImportSelection(null); globalThis.fetch = previousFetch; restore() }
})
