import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { SourceFileCloudSyncIndicator, resolveSourceFileCloudSyncStatus } from '@/features/markdown-workspace/SourceFileCloudSyncIndicator'
import { resolveSourceFileCanonicalCloudTarget } from '@/features/source-files/sourceFileCanonicalCloudSync'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

export async function testSourceFileCloudIndicatorShowsLocalAndCloudStatesAndUploadsOnClick() {
  const harness = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const previousFetch = globalThis.fetch, previousDialog = Object.getOwnPropertyDescriptor(globalThis, 'HTMLDialogElement')
  Object.defineProperty(globalThis, 'HTMLDialogElement', { configurable: true, value: harness.dom.window.HTMLDialogElement })
  harness.dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  harness.dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  globalThis.fetch = async input => new URL(String(input)).pathname.endsWith('/session')
    ? Response.json({ ok: false }, { status: 401 })
    : Response.json({ schema: 'agentic-graph/storage-login-options/v1', mode: 'signin', privacyHref: '/api/storage/auth/privacy',
      providers: [{ id: 'github', label: 'GitHub', method: 'GET', href: '/api/storage/auth/login?provider=github' }] })
  const container = harness.dom.window.document.getElementById('root')
  if (!container) throw new Error('missing test root')
  const entry: WorkspaceEntry = {
    path: '/new-note.md',
    parentPath: '/',
    kind: 'file',
    name: 'new-note.md',
    text: '# New note',
    updatedAtMs: 1,
  }
  const target = resolveSourceFileCanonicalCloudTarget(entry.path)
  if (!target) throw new Error('expected Markdown file to have a canonical cloud target')
  const root = createRoot(container)
  let uploadCount = 0
  try {
    const localStatus = resolveSourceFileCloudSyncStatus({
      entry,
      remoteContentByCanonicalPath: new Map(),
      snapshotStatus: 'ready',
    })
    await act(async () => {
      root.render(<SourceFileCloudSyncIndicator entry={entry} status={localStatus} onUpload={() => { uploadCount += 1 }} />)
      await tick()
    })
    const localButton = container.querySelector('button[data-source-file-cloud-status="local"]') as HTMLButtonElement | null
    if (!localButton || !String(localButton.getAttribute('aria-label')).includes('Upload a shared cloud snapshot')) {
      throw new Error('expected local indicator to expose the shared cloud snapshot action')
    }
    await act(async () => {
      localButton.dispatchEvent(new harness.dom.window.MouseEvent('click', { bubbles: true }))
      await tick()
    })
    if (uploadCount !== 1) throw new Error(`expected local icon click to upload once, got ${uploadCount}`)

    const cloudStatus = resolveSourceFileCloudSyncStatus({
      entry,
      remoteContentByCanonicalPath: new Map([[target.canonicalPath, '# New note']]),
      snapshotStatus: 'ready',
    })
    await act(async () => {
      root.render(<SourceFileCloudSyncIndicator entry={entry} status={cloudStatus} onUpload={() => { uploadCount += 1 }} />)
      await tick()
    })
    const cloudButton = container.querySelector('button[data-source-file-cloud-status="cloud"]')
    if (!cloudButton || !String(cloudButton.getAttribute('aria-label')).startsWith('Cloud synced: new-note.md')) {
      throw new Error('expected matching remote content to render a cloud-synced indicator')
    }

    await act(async () => {
      root.render(<SourceFileCloudSyncIndicator entry={entry} status="auth-required" onUpload={() => { uploadCount += 1 }} />)
      await tick()
    })
    const authRequiredButton = container.querySelector('button[data-source-file-cloud-status="auth-required"]') as HTMLButtonElement | null
    if (
      !authRequiredButton
      || authRequiredButton.disabled
      || !String(authRequiredButton.getAttribute('aria-label')).includes('requires sign-in')
      || String(authRequiredButton.getAttribute('aria-label')).includes('Retry')
    ) {
      throw new Error('expected sign-in-required state to replace the futile retry action')
    }
    await act(async () => {
      root.render(<SourceFileCloudSyncIndicator entry={entry} status="access-required" onUpload={() => { uploadCount += 1 }} />)
      await tick()
    })
    const accessRequiredButton = container.querySelector('button[data-source-file-cloud-status="access-required"]') as HTMLButtonElement | null
    if (!accessRequiredButton || accessRequiredButton.disabled || !String(accessRequiredButton.getAttribute('aria-label')).includes('access is required')) {
      throw new Error('expected membership denial to offer configuration while preserving the local copy')
    }
    let opened = 0
    const onOpen = () => { opened += 1 }
    harness.dom.window.addEventListener('kg:mainPanelOpen', onOpen)
    await import('@/lib/storage/StorageAuthLightbox')
    for (const status of ['unavailable', 'access-required', 'auth-required'] as const) {
      await act(async () => { root.render(<SourceFileCloudSyncIndicator entry={entry} status={status} onUpload={() => { uploadCount += 1 }} />); await tick() })
      const button = container.querySelector('button')!
      if (button.disabled) throw new Error('Cloud setup must remain actionable')
      await act(async () => { button.click(); await tick() })
      for (let attempt = 0; attempt < 10 && !harness.dom.window.document.querySelector('[data-kg-storage-auth-lightbox]'); attempt++) await act(tick)
      if (!harness.dom.window.document.querySelector('[data-kg-storage-auth-lightbox]')) throw new Error(`${status} must open sign-in`)
      await act(async () => { harness.dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Close sign-in"]')!.click(); await tick() })
    }
    harness.dom.window.removeEventListener('kg:mainPanelOpen', onOpen)
    if (opened !== 0 || Number(uploadCount) !== 1) throw new Error('Sign-in icons must bypass Settings and upload')
  } finally {
    await act(async () => {
      root.unmount()
      await tick()
    })
    globalThis.fetch = previousFetch
    if (previousDialog) Object.defineProperty(globalThis, 'HTMLDialogElement', previousDialog)
    else Reflect.deleteProperty(globalThis, 'HTMLDialogElement')
    harness.restore()
  }
}
