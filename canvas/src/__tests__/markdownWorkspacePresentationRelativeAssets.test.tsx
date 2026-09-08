import React from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { mountReactRoot, unmountReactRoot, waitForReactCondition } from '@/tests/lib/reactRootHarness'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function testMarkdownWorkspacePresentationResolvesRelativeAssetsAndRendersTables() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const markdownText = [
      '# Doc',
      '',
      '![](images/a.png)',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
    ].join('\n')

    const presentationApiRef = { current: null } as React.MutableRefObject<{ prev: () => void; next: () => void } | null>

    await mountReactRoot(
      root,
      React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light',
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        layoutMode: 'presentation',
        setLayoutMode: () => void 0,
        markdownWordWrap: true,
        setMarkdownWordWrap: () => void 0,
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => void 0,
        onToggleFullscreen: () => void 0,
        presentationApiRef,
        isMarkdown: true,
        activeText: markdownText,
        setActiveText: () => void 0,
        viewerTextOverride: null,
        disableViewerMutations: true,
        activeDocumentKey: 'docs/doc.md',
        highlightedLineRange: null,
        revealLineInEditor: () => void 0,
        showInViewer: () => void 0,
        showInPresentation: () => void 0,
        showInGallery: () => void 0,
        editorUri: 'docs/doc.md',
        editorLanguage: 'markdown',
        editorRef: { current: null },
      } as never),
      { window: dom.window as unknown as Window, frames: 2, tasks: 4 },
    )

    await waitForReactCondition(() => Boolean(container.querySelector('[data-testid="markdown-presentation-root"]')), {
      describe: () => `presentation renderer; apiReady=${Boolean(presentationApiRef.current)}, surfaceMounted=${Boolean(container.querySelector('[aria-label="Presentation Surface"]'))}, text=${JSON.stringify(container.textContent?.slice(-300))}`,
    })

    const img = container.querySelector('img')
    if (!img) throw new Error(`expected an <img> in presentation mode; apiReady=${Boolean(presentationApiRef.current)}, surfaceMounted=${Boolean(container.querySelector('[aria-label="Presentation Surface"]'))}, text=${JSON.stringify(container.textContent?.slice(-300))}`)
    const srcAttr = img.getAttribute('src') || ''
    if (srcAttr !== '/__codebase_asset?path=docs%2Fimages%2Fa.png') {
      throw new Error(`expected relative image to resolve to __codebase_asset URL, got ${srcAttr}`)
    }

    const table = container.querySelector('table')
    if (!table) throw new Error('expected a <table> in presentation mode')

    await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 2 })
  } finally {
    try {
      useGraphStore.getState().resetAll()
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
