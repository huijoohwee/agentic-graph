import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CanvasEmbedCodePanelHost } from '@/components/CanvasEmbedCodePanelHost'
import { openCanvasEmbedCodePanel } from '@/features/canvas/canvasEmbedCodePanelEvent'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testCanvasEmbedCodePanelReusesSharedCodeBlockControls(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)

  try {
    await act(async () => {
      root.render(<CanvasEmbedCodePanelHost />)
    })
    await act(async () => {
      if (!openCanvasEmbedCodePanel({
        sourceName: 'shared-canvas.md',
        title: 'Canvas iframe embed',
        language: 'html',
        code: '<iframe src="https://airvio.co/agentic-graph/share/kg-public-token?kgPreview=1"></iframe>',
      })) throw new Error('expected canvas embed event to open the panel')
    })
    const panel = container.querySelector('[role="dialog"]')
    if (!panel || !String(panel.textContent || '').includes('<iframe')) {
      throw new Error('expected Share canvas embed to open an iframe code panel')
    }
    const copyButton = container.querySelector('[aria-label="Copy code to clipboard"]')
    if (!copyButton) throw new Error('expected the shared code-block copy control')
    const closeButton = container.querySelector('[aria-label="Close share code panel"]') as HTMLButtonElement | null
    if (!closeButton) throw new Error('expected the embed panel close control')
    await act(async () => {
      closeButton.click()
    })
    if (container.querySelector('[role="dialog"]')) throw new Error('expected close control to hide the iframe panel')

    await act(async () => {
      if (!openCanvasEmbedCodePanel({
        sourceName: 'shared-canvas.md',
        title: 'Copy Relative Path',
        language: 'plaintext',
        code: 'docs/shared-canvas.md',
      })) throw new Error('expected path share event to open the shared panel')
    })
    const pathPanel = container.querySelector('[role="dialog"]')
    if (!pathPanel || !String(pathPanel.textContent || '').includes('Copy Relative Path') || !String(pathPanel.textContent || '').includes('docs/shared-canvas.md')) {
      throw new Error('expected the same panel to render plaintext share values')
    }
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
    restore()
  }
}
