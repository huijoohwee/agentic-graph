import React from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testMarkdownViewerVariableClickNavigatesToSsotLine() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root')
    root = createRoot(container)
    const calls: number[] = []
    const markdownText = [
      '---',
      'venue: "Singapore"',
      '---',
      '',
      'Meet at {{venue}}',
      '',
      'Image token {{1920s_Singapore_Malaya_202606190937.jpeg}}',
    ].join('\n')

    root.render(
      <MarkdownPreview
        markdownText={markdownText}
        activeDocumentPath="docs/sample.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        markdownTextHighlight={false}
        uiPanelTextFontClass="font-sans text-xs"
        uiPanelMonospaceTextClass="font-mono text-xs"
        previewOverlayScope="container"
        previewOverlayPortalTarget={null}
        previewScrollable
        onShowInEditor={(line) => calls.push(line)}
      />,
    )
    await tick()
    await tick()

    const variableLink = dom.window.document.querySelector('[data-kg-var-key="venue"]') as HTMLAnchorElement | null
    if (!variableLink) throw new Error('expected variable link')
    if (!variableLink.getAttribute('data-kg-var-source')?.includes('Source: frontmatter line 2') || !variableLink.getAttribute('title')?.includes('@venue - Markdown variable')) {
      throw new Error(`expected Viewer variable chip to expose @-aligned source metadata, got ${JSON.stringify(variableLink.outerHTML)}`)
    }
    if (variableLink.getAttribute('data-kg-var-token') !== '@venue' || !String(variableLink.textContent || '').includes('Singapore') || String(variableLink.textContent || '').includes('{{venue}}')) {
      throw new Error(`expected Viewer variable chip to render the current frontmatter value instead of raw moustache syntax, got ${JSON.stringify(variableLink.outerHTML)}`)
    }
    if (!variableLink.querySelector('[data-kg-var-rendered-value="venue"]')) {
      throw new Error(`expected plain Viewer variable chip to retain an identifiable source reference, got ${JSON.stringify(variableLink.outerHTML)}`)
    }
    const mediaVariableLink = dom.window.document.querySelector('[data-kg-var-key="1920s_Singapore_Malaya_202606190937.jpeg"]') as HTMLAnchorElement | null
    if (!mediaVariableLink) throw new Error('expected media variable link')
    const mediaThumbnail = mediaVariableLink.querySelector('[data-kg-inline-command-thumbnail="image"] img') as HTMLImageElement | null
    if (!mediaThumbnail) {
      throw new Error(`expected unresolved media-like @ variable chip to render a visible thumbnail, got ${JSON.stringify(mediaVariableLink.outerHTML)}`)
    }
    const mediaThumbnailSrc = String(mediaThumbnail.getAttribute('src') || '')
    if (!mediaThumbnailSrc.includes('/__codebase_asset?path=') || !decodeURIComponent(mediaThumbnailSrc).includes('docs/1920s_Singapore_Malaya_202606190937.jpeg')) {
      throw new Error(`expected media-like @ variable thumbnail to resolve relative to active document, got ${mediaThumbnailSrc}`)
    }
    if (!String(mediaVariableLink.textContent || '').includes('@1920s_Singapore_Malaya_202606190937.jpeg')) {
      throw new Error(`expected media-like variable chip to preserve @ token label, got ${JSON.stringify(mediaVariableLink.outerHTML)}`)
    }
    variableLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    if (calls.length !== 1 || calls[0] !== 2) {
      throw new Error(`expected variable click to navigate to frontmatter ssot line 2; got ${JSON.stringify(calls)}`)
    }
  } finally {
    try {
      root?.unmount()
    } catch {
      void 0
    }
    restore()
  }
}
