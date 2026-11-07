import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness, settleDiscovery } from '@/tests/lib/importInventoryHarness'
import { SourceFileWebsiteActions } from '@/features/source-files/SourceFileWebsiteActions'
import WebsiteImportSelectionView from '@/features/source-files/WebsiteImportSelectionView'
import { chooseWebsiteImportPages, finishWebsiteImportSelection, useWebsiteImportSelectionSession, toggleWebsiteSelection, importSelectedWebsitePages, importDiscoveredWebsitePage, setWebsiteSelectionQuery, restoreWebsiteImportSelectionDraft } from '@/features/source-files/websiteImportSelectionSession'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { sourceUrl, sourceEntry } from './websiteImportSelectionPanel.testSupport'

test('authenticated website selection reuses the full-content URL importer per page', async () => {
  const calls: Array<{ url: string; preserveActiveDocument?: boolean; browserSessionId?: string; destinationPath?: string }> = []
  let websiteImports = 0
  const unregister = registerMarkdownWorkspaceActionBridge('test-authenticated-crawl', {
    importUrl: async (url, options) => {
      calls.push({ url, preserveActiveDocument: options?.preserveActiveDocument, browserSessionId: options?.browserSessionId,
        ...(options?.destinationPath ? { destinationPath: options.destinationPath } : {}) })
      return { createdPaths: [options?.destinationPath || `/websites/example.test/${new URL(url).pathname.split('/').filter(Boolean).pop() || 'index'}.md`] }
    },
    importWebsite: async () => { websiteImports += 1; return { handled: true } },
  })
  try {
    const selected = [`${sourceUrl}one`, `${sourceUrl}two`]
    const result = await importSelectedWebsitePages(sourceUrl, selected, undefined, undefined, {
      authenticatedBrowserSession: true, browserSessionId: 'session-1',
    })
    if (!result || typeof result !== 'object' || !Array.isArray(result.createdPaths)) {
      throw new Error('Expected authenticated page imports to return their created paths')
    }
    assert.deepEqual(calls, selected.map(url => ({ url, preserveActiveDocument: true, browserSessionId: 'session-1' })))
    assert.equal(websiteImports, 0, 'authenticated pages do not go through the fresh server crawler')
    assert.deepEqual(result.createdPaths, selected.map(url => `/websites/example.test/${new URL(url).pathname.split('/').filter(Boolean).pop()}.md`))
    const destinationPath = '/websites/example.test/saved/page.md'
    const inPlace = await importSelectedWebsitePages(sourceUrl, [selected[0]!], undefined, destinationPath, {
      authenticatedBrowserSession: true, browserSessionId: 'session-1',
    })
    assert.deepEqual(calls[2], { url: selected[0], preserveActiveDocument: true, browserSessionId: 'session-1', destinationPath })
    assert.deepEqual((inPlace as { createdPaths: string[] }).createdPaths, [destinationPath])
  } finally { unregister() }
})

test('authenticated website selection retains its browser-session import mode after restart', async () => {
  const { restore } = await initJsdomHarness()
  const storage = window.localStorage
  const previousDraft = storage.getItem('kg:website-import-selection:v1')
  const pageUrl = `${sourceUrl}one`
  try {
    storage.removeItem('kg:website-import-selection:v1')
    useWebsiteImportSelectionSession.setState({ session: {
      id: 900, url: sourceUrl, pages: [{ url: pageUrl, path: '/library/one' }], selected: new Set([pageUrl]),
      visited: new Set([sourceUrl]), busy: false, error: '', limited: false, query: '', authenticatedBrowserSession: true,
      browserSessionId: 'session-1',
    }, recoveryError: '' })
    setWebsiteSelectionQuery('')
    useWebsiteImportSelectionSession.setState({ session: null, recoveryError: '' })
    restoreWebsiteImportSelectionDraft()
    assert.equal(useWebsiteImportSelectionSession.getState().session?.authenticatedBrowserSession, true)
    assert.equal(useWebsiteImportSelectionSession.getState().session?.browserSessionId, 'session-1')
    assert.deepEqual([...useWebsiteImportSelectionSession.getState().session!.selected], [pageUrl])
  } finally {
    useWebsiteImportSelectionSession.setState({ session: null, recoveryError: '' })
    if (previousDraft === null) storage.removeItem('kg:website-import-selection:v1')
    else storage.setItem('kg:website-import-selection:v1', previousDraft)
    restore()
  }
})

test('discovered page import is explicit, locked while running and preserves the live batch chooser', async () => {
  const { restore } = await initJsdomHarness(), previousFetch = globalThis.fetch
  const host = document.createElement('section'), root = createRoot(host)
  document.body.append(host)
  const page = sourceUrl + 'topic?category=Examples%20Only', other = sourceUrl + 'other'
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, pages: [page, other].map(url => ({ url, path: new URL(url).pathname, title: url === page ? 'Topic page' : 'Other page' })), limited: false }))) as typeof fetch
  const calls: Array<{ url: string; options: unknown }> = [], resolutions: unknown[] = []
  let complete!: () => void, reject!: (error: Error) => void, started!: () => void
  let importStarted = new Promise<void>(resolve => { started = resolve })
  const unregister = registerMarkdownWorkspaceActionBridge('test-direct-page', { importWebsite: async (url, options) => {
    calls.push({ url, options }); started()
    await new Promise<void>((resolve, fail) => { complete = resolve; reject = fail })
    return { handled: true }
  } })
  const importButton = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.getAttribute('aria-label') === 'Import page Topic page')!
  try {
    await act(async () => { void chooseWebsiteImportPages(sourceUrl, sourceEntry.path).then(urls => resolutions.push(urls)); root.render(<><SourceFileWebsiteActions entry={{ ...sourceEntry, name: 'Topic page', path: '/topic.md', text: undefined }} urlOverride={page} destinationPath="/topic.md" confirmationOwner={false} discoveryContext /><WebsiteImportSelectionView /></>) })
    await settleDiscovery()
    assert.equal(useWebsiteImportSelectionSession.getState().session!.selected.size, 0)
    await act(async () => toggleWebsiteSelection([other], true))
    assert.equal(importButton().disabled, false)
    await act(async () => { importButton().click(); await importStarted })
    const id = useWebsiteImportSelectionSession.getState().session!.id
    assert.equal(calls.length, 1)
    const options = calls[0].options as { selectedUrls: string[]; maxPages: number; minPages: number; source: string; destinationPath: string }
    assert.equal(calls[0].url, sourceUrl)
    assert.deepEqual(options.selectedUrls, [page], 'imports the addressed page, not the selected sibling')
    assert.equal(options.maxPages, 1); assert.equal(options.minPages, 1)
    assert.equal(options.source, 'invocation', 'runtime failures must propagate')
    assert.equal(options.destinationPath, '/topic.md', 'the clicked row owns workspace placement')
    assert.ok(importButton().disabled)
    assert.match(document.querySelector('section[aria-label="Website discovery status"]')!.textContent || '', /Importing https:/)
    await act(async () => { importButton().click(); await importDiscoveredWebsitePage(id, page) })
    assert.equal(calls.length, 1, 'duplicate clicks and callbacks are locked')
    await act(async () => reject(new Error('Page capture failed')))
    assert.equal(importButton().disabled, false)
    assert.match(document.querySelector('[role="alert"]')!.textContent || '', /Page capture failed/)
    assert.deepEqual([...useWebsiteImportSelectionSession.getState().session!.selected], [other])
    await act(async () => { await importDiscoveredWebsitePage(id + 1, page); await importDiscoveredWebsitePage(id, 'https://outside.invalid/') })
    assert.equal(calls.length, 1, 'stale sessions and non-members do not import')
    importStarted = new Promise<void>(resolve => { started = resolve })
    await act(async () => { importButton().click(); await importStarted })
    assert.equal(calls.length, 2, 'retry uses the same direct action')
    await act(async () => complete())
    assert.equal(useWebsiteImportSelectionSession.getState().session!.error, '')
    assert.deepEqual([...useWebsiteImportSelectionSession.getState().session!.selected], [other])
    assert.deepEqual(resolutions, [], 'direct import leaves the pending batch chooser intact')
    await act(async () => finishWebsiteImportSelection([other]))
    assert.deepEqual(resolutions, [[other]])
  } finally { await act(async () => { complete?.(); root.unmount(); finishWebsiteImportSelection(null) }); unregister(); host.remove(); globalThis.fetch = previousFetch; restore() }
})
