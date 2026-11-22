import test from 'node:test'
import assert from 'node:assert/strict'
import { initJsdomHarness, waitForImportCondition } from '@/tests/lib/importInventoryHarness'
import { chooseWebsiteImportPages, finishWebsiteImportSelection, useWebsiteImportSelectionSession } from '@/features/source-files/websiteImportSelectionSession'
import { sourceUrl } from './websiteImportSelectionPanel.testSupport'

test('discovery becomes selectable before the local website mirror write settles', async () => {
  const { restore } = await initJsdomHarness()
  const previousFetch = globalThis.fetch
  let releaseReveal: (() => void) | null = null
  globalThis.fetch = (async target => {
    const url = String(target)
    if (url === 'http://localhost:6969/v1/sessions') return new Response(JSON.stringify({ sessions: [] }), { status: 200 })
    if (url === '/__website_import/discover') {
      return new Response(JSON.stringify({ ok: true, pages: [{ url: sourceUrl, path: '/library/' }, { url: `${sourceUrl}one`, path: '/library/one' }], limited: false }))
    }
    if (url === '/__agentic_os_fs_reveal') {
      return await new Promise<Response>(resolve => {
        releaseReveal = () => resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }) as typeof fetch
  try {
    const pending = chooseWebsiteImportPages(sourceUrl)
    await waitForImportCondition(() => {
      const session = useWebsiteImportSelectionSession.getState().session
      return session?.busy === false && session.pages.length === 2
    })
    assert.equal(useWebsiteImportSelectionSession.getState().session?.error, '')
    releaseReveal?.()
    finishWebsiteImportSelection(null)
    await pending
  } finally {
    globalThis.fetch = previousFetch
    restore()
  }
})
