import assert from 'node:assert/strict'
import { act } from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { buildMarkdownFileTreeContextMenuItems } from '@/features/markdown-workspace/markdownFileTreeContextMenuItems'
import { AgenticGraphStorageSignInRequiredError } from '@/lib/storage/agentic-graph-storage-browser-session'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS as paths } from '@/lib/storage/agentic-graph-storage-route-paths'

export async function testSourceShareMenuReusesAccountDialog() {
  const { dom, restore } = initJsdomHarness()
  const previousFetch = globalThis.fetch
  const previousDialog = Object.getOwnPropertyDescriptor(globalThis, 'HTMLDialogElement')
  Object.defineProperty(globalThis, 'HTMLDialogElement', { configurable: true, value: dom.window.HTMLDialogElement })
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  const errors: string[] = [], copies: string[] = []
  let closed = 0
  let originRejected = false
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(init?.credentials, 'same-origin')
    assert.ok(!init?.method || init.method === 'GET', 'Opening account recovery must not publish or sync')
    if (url.pathname === paths.browserSession) return Response.json({ ok: false }, { status: 401 })
    assert.equal(url.pathname, paths.browserLogin)
    assert.equal(url.searchParams.get('format'), 'json')
    if (originRejected) return new Response('Origin not allowed', { status: 400 })
    return Response.json({ schema: 'agentic-graph/storage-login-options/v1', mode: 'signin', privacyHref: paths.browserPrivacy,
      providers: [{ id: 'github', label: 'GitHub', method: 'GET', href: paths.browserLogin + '?provider=github' }] })
  }
  try {
    await import('@/lib/storage/StorageAuthLightbox')
    const items = buildMarkdownFileTreeContextMenuItems({
      entry: { path: '/docs/share.md', parentPath: '/docs', name: 'share.md', kind: 'file', updatedAtMs: 1 },
      copyToClipboard: async text => { copies.push(text); return true },
      buildShareUrl: async () => { throw new AgenticGraphStorageSignInRequiredError() },
      buildCanvasEmbedUrl: async () => { throw new AgenticGraphStorageSignInRequiredError() },
      onShareUrlError: message => errors.push(message), closeContextMenu: () => { closed++ },
    })
    for (const key of ['shareUrl', 'shareCanvasEmbed']) {
      await act(async () => { await items.find(item => item.key === key)!.onSelect(); await new Promise(resolve => setTimeout(resolve, 0)) })
      assert.equal(dom.window.document.querySelectorAll('[data-kg-storage-auth-lightbox]').length, 1)
      assert.match(dom.window.document.body.textContent || '', /Sign in to Airvio/)
      assert.match(dom.window.document.body.textContent || '', /Continue with GitHub/)
      assert.deepEqual(errors, [], 'Expected sign-in must not also raise a raw storage error alert')
      assert.deepEqual(copies, [], 'No URL or embed may be copied before publication')
      const close = dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Close sign-in"]')!
      await act(async () => { close.click() })
      assert.equal(dom.window.document.querySelectorAll('[data-kg-storage-auth-lightbox]').length, 0)
    }
    originRejected = true
    await act(async () => { await items.find(item => item.key === 'shareUrl')!.onSelect(); await new Promise(resolve => setTimeout(resolve, 0)) })
    assert.match(dom.window.document.body.textContent || '', /Sign-in is not enabled for http:\/\/localhost/)
    assert.deepEqual(copies, [], 'A rejected preview origin must not yield a fabricated share URL')
    assert.equal(closed, 3)
  } finally {
    const close = dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Close sign-in"]')
    if (close) await act(async () => { close.click() })
    globalThis.fetch = previousFetch
    if (previousDialog) Object.defineProperty(globalThis, 'HTMLDialogElement', previousDialog)
    else Reflect.deleteProperty(globalThis, 'HTMLDialogElement')
    restore()
  }
}
