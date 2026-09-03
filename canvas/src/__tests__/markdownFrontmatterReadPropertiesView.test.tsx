import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = async () => {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  })
}

export async function testMarkdownFrontmatterReadRendersClickablePropertyChips() {
  const previousFrontmatterMode = !!useGraphStore.getState().frontmatterModeEnabled
  useGraphStore.setState({ frontmatterModeEnabled: true } as never)
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root element')
    root = createRoot(container)
    const calls: number[] = []
    const markdownText = [
      '---',
      'title: "agentic-graph Canvas Demos · Storyboard Widget (2D) + D3 Editor Mode"',
      'authors:',
      '  - A. Author 1',
      '  - B. Author 2',
      'venue: "Singapore"',
      'date: "2026-02-23"',
      'mermaid: |',
      '  flowchart TB',
      '    A[One] --> B[Two]',
      '---',
      '',
      'Meeting at {{venue}}',
    ].join('\n')
    await act(async () => {
      root.render(
        <MarkdownPreview
          markdownText={markdownText}
          activeDocumentPath="docs/frontmatter.md"
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
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })
    await tick()
    await tick()
    const propertiesPanel = dom.window.document.querySelector('[data-kg-frontmatter-properties]') as HTMLElement | null
    if (!propertiesPanel) throw new Error('expected frontmatter properties panel in read view')
    const headers = Array.from(propertiesPanel.querySelectorAll('th')).map(el => String(el.textContent || '').trim())
    if (!headers.includes('key') || !headers.includes('Value')) {
      throw new Error(`expected | key | Value | header layout, got ${JSON.stringify(headers)}`)
    }
    const mermaidKeyCell = Array.from(propertiesPanel.querySelectorAll('td')).find(
      el => String(el.textContent || '').trim() === 'mermaid',
    ) as HTMLElement | undefined
    if (mermaidKeyCell) throw new Error('expected mermaid key to be excluded from YAML frontmatter table read view')
    const venueCell = Array.from(propertiesPanel.querySelectorAll('td')).find(
      el => String(el.textContent || '').trim() === 'venue',
    ) as HTMLElement | undefined
    if (!venueCell) throw new Error('expected venue row in frontmatter table')
    const authorsValueCell = Array.from(propertiesPanel.querySelectorAll('td')).find(
      el => String(el.textContent || '').includes('`["A. Author 1","B. Author 2"]`'),
    ) as HTMLElement | undefined
    if (!authorsValueCell) {
      const allCellTexts = Array.from(propertiesPanel.querySelectorAll('td')).map(el => String(el.textContent || '').trim())
      throw new Error(`expected authors array to follow multi-dimensional table backtick JSON array convention; cells=${JSON.stringify(allCellTexts)}`)
    }
    await act(async () => {
      venueCell.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })
    await tick()
    if (calls[0] !== 6) throw new Error(`expected venue row click to reveal frontmatter line 6, got ${JSON.stringify(calls)}`)
    let mermaidDiagram = dom.window.document.querySelector('[aria-label="Mermaid diagram"]') as HTMLElement | null
    let mermaidGate = dom.window.document.querySelector('[data-kg-mermaid-visibility-gate]') as HTMLElement | null
    for (let i = 0; i < 8 && !mermaidDiagram && !mermaidGate; i += 1) {
      await tick()
      mermaidDiagram = dom.window.document.querySelector('[aria-label="Mermaid diagram"]') as HTMLElement | null
      mermaidGate = dom.window.document.querySelector('[data-kg-mermaid-visibility-gate]') as HTMLElement | null
    }
    if (!mermaidDiagram && !mermaidGate) {
      throw new Error('expected mermaid frontmatter to keep using mermaid code block renderer')
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
      })
    } catch {
      void 0
    }
    useGraphStore.setState({ frontmatterModeEnabled: previousFrontmatterMode } as never)
    restore()
  }
}
