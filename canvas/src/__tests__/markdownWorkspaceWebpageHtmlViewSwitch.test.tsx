import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import type { MarkdownPresentationApi } from '@/features/markdown-workspace/markdownWorkspaceTypes'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import { useGraphStore } from '@/hooks/useGraphStore'

const WEBPAGE_TEST_URL = 'https://example.test/docs/'

const waitUntil = async (predicate: () => boolean, timeoutMs = 1600) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await new Promise<void>(resolve => setTimeout(resolve, 25))
  }
}

const tick = async (n: number = 1) => {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

export async function testMarkdownWorkspaceEditorHtmlViewSwitchShowsViewerPane() {
  const { dom, restore } = initJsdomHarness()
  const prevFetch = (globalThis as unknown as { fetch?: unknown }).fetch
  const state = useGraphStore.getState()
  const prevMode = state.richMediaPanelMode
  const prevWorkspaceViewMode = state.workspaceViewMode
  const prevWorkspaceCanvasPaneOpen = state.workspaceCanvasPaneOpen
  let root: ReturnType<typeof createRoot> | null = null
  try {
    state.setRichMediaPanelMode('snapshot')
    if (state.setWorkspaceViewState) {
      state.setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    } else {
      state.setWorkspaceViewMode('editor')
      state.setWorkspaceCanvasPaneOpen(true)
    }
    ;(globalThis as unknown as { fetch?: unknown }).fetch = (async (input: unknown) => {
      throw new Error(`expected HTML editor workspace to use direct proxy iframe without prefetching ${String(input || '')}`)
    }) as unknown

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    const editorRef = { current: null as MonacoTextEditorHandle | null }
    const presentationApiRef = { current: null as MarkdownPresentationApi | null }
    const body = ['# Title', '', '| Name | Type |', '| --- | --- |', '| First | text |', '| Second | text |']
    const webpageText = (view: 'markdown' | 'html') =>
      ['---', `kgWebpageUrl: "${WEBPAGE_TEST_URL}"`, `kgWebpageView: "${view}"`, '---', '', ...body, ''].join('\n')

    const render = async (activeText: string) => {
      await act(async () => {
        root?.render(
          React.createElement(MarkdownWorkspaceMain, {
            themeMode: 'light',
            uiPanelTextFontClass: 'font-sans',
            uiPanelMonospaceTextClass: 'font-mono',
            explorerOpen: true,
            setExplorerOpen: () => {},
            layoutMode: 'editor',
            setLayoutMode: () => {},
            markdownWordWrap: true,
            setMarkdownWordWrap: () => {},
            markdownTextHighlight: false,
            setMarkdownTextHighlight: () => {},
            onToggleFullscreen: () => {},
            presentationApiRef,
            isMarkdown: true,
            activeText,
            setActiveText: () => {},
            disableEditorMutations: false,
            activeDocumentKey: '/webpage.md',
            highlightedLineRange: null,
            revealLineInEditor: () => {},
            showInViewer: () => {},
            showInPresentation: () => {},
            showInGallery: () => {},
            editorUri: 'inmemory://webpage.md',
            editorLanguage: 'markdown',
            editorRef: editorRef as unknown as React.MutableRefObject<MonacoTextEditorHandle | null>,
          }),
        )
        await tick(4)
      })
    }

    await render(webpageText('markdown'))
    await act(async () => {
      await waitUntil(() => Boolean(doc.querySelector('section[aria-label="Markdown Editor"]')), 2400)
      await tick(2)
    })
    if (doc.querySelector('section[aria-label="Webpage Viewer"]')) {
      throw new Error('expected Markdown webpage view to start without HTML viewer pane')
    }

    await render(webpageText('html'))
    await act(async () => {
      await waitUntil(() => Boolean(doc.querySelector('section[aria-label="Webpage Viewer"] iframe')), 2400)
      await tick(2)
    })

    const iframe = doc.querySelector('section[aria-label="Webpage Viewer"] iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected HTML view switch to mount webpage iframe inside editor workspace')
    const src = String(iframe.getAttribute('src') || '')
    if (!src.startsWith('/__webpage_proxy?url=')) {
      throw new Error(`expected HTML view switch iframe to use webpage proxy, got ${src}`)
    }
    const viewerPane = doc.querySelector('section[aria-label="Viewer"]') as HTMLElement | null
    if (!viewerPane) throw new Error('expected HTML view switch to keep the Viewer pane visible')
    const tablePanel = () => [...viewerPane.querySelectorAll('article[aria-label="Markdown data view"]')]
      .find(panel => panel.querySelector('summary[aria-label="Column type: Name"]'))
    for (let i = 0; i < 80 && !tablePanel(); i++) await act(async () => { await tick() })
    const panel = tablePanel()
    const table = panel?.querySelector('table')
    if (!panel?.querySelector('button[aria-label="Layout: Table View"]') || !table?.tHead?.textContent?.includes('Type')
      || !table.tBodies[0]?.textContent?.includes('Second')) {
      throw new Error('Expected column headers, source rows and the interactive Table View toolbar for an imported table')
    }
    const htmlPane = doc.querySelector('section[aria-label="HTML Viewer"] section[aria-label="Webpage Viewer"]')
    if (!htmlPane) throw new Error('expected HTML view switch to render HTML in its own pane')
    if (!doc.querySelector('section[aria-label="Markdown Editor"]')) {
      throw new Error('expected HTML view switch to preserve the already-open Markdown pane')
    }
  } finally {
    await act(async () => {
      root?.unmount()
      await tick()
    })
    state.setRichMediaPanelMode(prevMode)
    if (state.setWorkspaceViewState) {
      state.setWorkspaceViewState({ mode: prevWorkspaceViewMode, paneOpen: prevWorkspaceCanvasPaneOpen })
    } else {
      state.setWorkspaceViewMode(prevWorkspaceViewMode)
      state.setWorkspaceCanvasPaneOpen(prevWorkspaceCanvasPaneOpen)
    }
    ;(globalThis as unknown as { fetch?: unknown }).fetch = prevFetch
    restore()
  }
}
