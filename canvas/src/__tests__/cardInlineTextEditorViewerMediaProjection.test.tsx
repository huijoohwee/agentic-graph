import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { waitForFrames } from '@/tests/lib/reactRootHarness'

export async function testCardInlineTextEditorViewerAttachedMediaShowsInlineChip() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const sourceText = 'Generate a text response for the active request.'
  const mediaUrl = 'http://localhost:5179/api/storage/media/airvio/runs/upload-demo/image/strybldr-starter-source.png?agentic_os_media_token=token'
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: sourceText,
          ariaLabel: 'Storyboard summary for n1',
          placeholder: 'Add summary',
          canEdit: true,
          editorSurface: 'viewer',
          editActivation: 'click',
          inlineChipDensity: 'compact',
          multiline: true,
          rows: 2,
          projectedMediaAttachments: [{
            mediaKind: 'image',
            label: 'strybldr-starter-source.png',
            sourceUrl: mediaUrl,
            thumbnailUrl: mediaUrl,
          }],
          onCommit: next => committedValues.push(next),
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected Storyboard card display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"][aria-label="Storyboard summary for n1"]')
    if (!(editor instanceof dom.window.HTMLElement)) throw new Error(`expected active Storyboard Viewer edit surface, html=${container.innerHTML}`)
    const inlineMediaChip = editor.querySelector('[data-kg-card-inline-wysiwyg-virtual-media-chip="1"]')
    if (!(inlineMediaChip instanceof dom.window.HTMLElement)) {
      throw new Error(`expected click-to-edit Storyboard Viewer to render its projected @ media chip, html=${editor.innerHTML}`)
    }
    const editorText = String(editor.textContent || '')
    if (!editorText.includes(sourceText) || !editorText.includes('@strybldr-starter-source.png') || editorText.includes(mediaUrl)) {
      throw new Error(`expected Viewer to retain source text plus compact @ chip without URL backfill, got ${JSON.stringify(editorText)}`)
    }
    await act(async () => {
      editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    if (committedValues.length !== 0) throw new Error(`expected unchanged Viewer projection not to mutate or commit source text, got ${JSON.stringify(committedValues)}`)
  } finally {
    await act(async () => root.unmount())
    restore()
  }
}

export async function testCardInlineTextEditorViewerStrippedMediaDisplayKeepsInlineChip() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const mediaUrl = 'http://localhost:5179/api/storage/media/airvio/runs/upload-demo/image/airvio_-3b2fe39beaef6787.jpeg?agentic_os_media_token=token'
  const rawSource = `Generate a ![airvio_.JPEG](${mediaUrl}) text response for the active request.`
  const displaySource = 'Generate a text response for the active request.'
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: rawSource,
          displayValue: displaySource,
          ariaLabel: 'Storyboard summary for n1',
          placeholder: 'Add summary',
          canEdit: true,
          editorSurface: 'viewer',
          editActivation: 'click',
          inlineChipDensity: 'compact',
          multiline: true,
          rows: 2,
          projectedMediaAttachments: [{
            mediaKind: 'image',
            label: 'airvio_-3b2fe39beaef6787.jpeg',
            sourceUrl: mediaUrl,
            thumbnailUrl: mediaUrl,
          }],
          onCommit: next => committedValues.push(next),
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected Storyboard card display surface')
    const displayMediaChip = display.querySelector('[data-kg-card-inline-display-media-chip="1"]')
    if (!(displayMediaChip instanceof dom.window.HTMLElement) || displayMediaChip.textContent !== 'airvio_.JPEG') {
      throw new Error(`expected stripped Storyboard read text to match the edit chip label without a view-only @ prefix, html=${display.innerHTML}`)
    }
    const displayText = String(display.textContent || '')
    if (displayText !== 'Generate a airvio_.JPEG text response for the active request.') {
      throw new Error(`expected stripped Storyboard read text to preserve the authored media label and position, got ${JSON.stringify(displayText)}`)
    }
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"][aria-label="Storyboard summary for n1"]')
    if (!(editor instanceof dom.window.HTMLElement)) throw new Error(`expected active Storyboard Viewer edit surface, html=${container.innerHTML}`)
    const authoredMediaChips = editor.querySelectorAll('[data-kg-inline-media-edit-token="1"]')
    if (authoredMediaChips.length !== 1 || editor.querySelector('[data-kg-card-inline-wysiwyg-virtual-media-chip="1"]')) {
      throw new Error(`expected raw source media to render once in edit mode without a duplicate virtual @ chip, html=${editor.innerHTML}`)
    }
    if (String(authoredMediaChips[0]?.textContent || '') !== 'airvio_.JPEG') {
      throw new Error(`expected edit mode to preserve the same authored media label, html=${editor.innerHTML}`)
    }
    await act(async () => {
      editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    if (committedValues.length !== 0) throw new Error(`expected an unchanged view/edit round trip not to mutate the raw source, got ${JSON.stringify(committedValues)}`)
    const roundTripDisplayChip = container.querySelector('[data-kg-card-inline-display-media-chip="1"]')
    if (!(roundTripDisplayChip instanceof dom.window.HTMLElement) || roundTripDisplayChip.textContent !== 'airvio_.JPEG') {
      throw new Error(`expected view mode to retain the authored media label after edit mode closes, html=${container.innerHTML}`)
    }
  } finally {
    await act(async () => root.unmount())
    restore()
  }
}
