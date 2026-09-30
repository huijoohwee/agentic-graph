import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useWebpageIframeSrcdoc } from '@/features/markdown-workspace/main/useWebpageIframeSrcdoc'
import { clearWebpageIframeSrcdocCaches } from '@/lib/websites/webpageIframeSrcdoc'
import { WEBPAGE_HTML_PREVIEW_MAX_BYTES, WEBPAGE_HTML_PREVIEW_LIMIT_MESSAGE } from '@/lib/websites/webpageHtmlPreviewBudget'

type RenderPreview = (nodeId?: string, policy?: 'strip' | 'allow', url?: string, enabled?: boolean) => Promise<void>
async function withPreview(run: (render: RenderPreview, container: HTMLElement, starts: () => number) => Promise<void>) {
  const { dom, restore } = initJsdomHarness()
  const previousFetch = globalThis.fetch
  const container = dom.window.document.createElement('div') as unknown as HTMLElement
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  let starts = 0
  function Preview({ nodeId = 'first', policy, url = 'https://example.invalid/capture', enabled = true }: { nodeId?: string; policy?: 'strip' | 'allow'; url?: string; enabled?: boolean }) {
    const view = useWebpageIframeSrcdoc({ enabled, url, view: 'html',
      websiteImportMeta: { importId: 'stable', nodeId }, scriptPolicy: policy,
      onStatusProgress: label => { if (label === 'Updating view') starts += 1 } })
    return <output>{view.error || view.srcDoc || view.src || 'Loading'}</output>
  }
  const render: RenderPreview = async (nodeId, policy, url, enabled) => {
    await act(async () => { root.render(<Preview nodeId={nodeId} policy={policy} url={url} enabled={enabled} />) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
  }
  try { clearWebpageIframeSrcdocCaches(); await run(render, container, () => starts) }
  finally { await act(async () => root.unmount()); globalThis.fetch = previousFetch; clearWebpageIframeSrcdocCaches(); restore() }
}

test('equivalent import metadata does not restart or loop, while changed identity loads once', async () => {
  await withPreview(async (render, container, starts) => {
    let requests = 0
    globalThis.fetch = async () => { requests += 1; return new Response('<h1>Capture</h1><script>hydrateSite()</script>') }
    await render()
    assert.ok(container.textContent?.includes('<h1>Capture</h1>'))
    assert.ok(!container.textContent?.includes('hydrateSite()'))
    for (let i = 0; i < 3; i += 1) await render()
    assert.equal(requests, 1)
    assert.equal(starts(), 1, 'equivalent renders must not restart sanitization via cache')
    await render('second')
    assert.equal(requests, 2)
    assert.equal(starts(), 2)
    await render('second', 'allow')
    assert.ok(container.textContent?.includes('hydrateSite()'), 'explicit script policy remains available')
  })
})

test('preview limit is visible without falling back to another website request', async () => {
  await withPreview(async (render, container) => {
    let requests = 0, cancels = 0
    globalThis.fetch = async () => {
      requests += 1
      return new Response(new ReadableStream({ cancel() { cancels += 1 } }), {
        headers: { 'content-length': String(WEBPAGE_HTML_PREVIEW_MAX_BYTES + 1) },
      })
    }
    await render()
    assert.equal(container.textContent, WEBPAGE_HTML_PREVIEW_LIMIT_MESSAGE)
    assert.equal(requests, 1)
    assert.equal(cancels, 1)
  })
})

test('changing imported source cancels the previous request and ignores its late result', async () => {
  await withPreview(async (render, container) => {
    let firstSignal: AbortSignal | undefined
    let finishFirst!: (value: Response) => void
    globalThis.fetch = async (_url, init) => {
      if (String(_url).includes('nodeId=first')) {
        firstSignal = init?.signal as AbortSignal
        return await new Promise<Response>(resolve => { finishFirst = resolve })
      }
      return new Response('<p>Current capture</p>')
    }
    await render()
    await render('second')
    assert.equal(firstSignal?.aborted, true)
    await act(async () => { finishFirst(new Response('<p>Stale capture</p>')); await new Promise(resolve => setTimeout(resolve, 30)) })
    assert.ok(container.textContent?.includes('Current capture'))
    assert.ok(!container.textContent?.includes('Stale capture'))
  })
})

test('a loaded preview is cleared while the next document is still loading', async () => {
  await withPreview(async (render, container) => {
    let finishNext!: (value: Response) => void
    globalThis.fetch = async url => String(url).includes('nodeId=first')
      ? new Response('<p>Previous capture with active resources</p>')
      : await new Promise<Response>(resolve => { finishNext = resolve })
    await render()
    assert.ok(container.textContent?.includes('Previous capture'))
    await render('second')
    assert.equal(container.textContent, 'Loading', 'old iframe content must not remain mounted during the next request')
    await act(async () => { finishNext(new Response('<p>Next capture</p>')); await new Promise(resolve => setTimeout(resolve, 80)) })
    assert.ok(container.textContent?.includes('Next capture'))
  })
})

test('URL changes clear the old frame during debounce and disabling clears a loaded preview', async () => {
  await withPreview(async (render, container) => {
    let requests = 0
    globalThis.fetch = async () => { requests++; return new Response('<p>Saved source</p>') }
    await render()
    assert.ok(container.textContent?.includes('Saved source'))
    await render('second', undefined, 'https://other.example.invalid/capture')
    assert.equal(container.textContent, 'Loading')
    assert.equal(requests, 1, 'do not load the new import using the old debounced URL')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
    assert.equal(requests, 2)
    assert.ok(container.textContent?.includes('<base href="https://other.example.invalid/capture">'))
    await render('second', undefined, 'https://other.example.invalid/capture', false)
    assert.equal(container.textContent, 'Loading')
  })
})
