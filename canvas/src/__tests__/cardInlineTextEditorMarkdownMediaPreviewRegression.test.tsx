import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { StoryboardWidgetInlineValueEditor } from '@/components/StoryboardWidget/StoryboardWidgetInlineValueEditor'
import CommandMenuCatalogPanel from '@/features/command-menu/CommandMenuCatalogPanel'
import {
  clearWorkspaceDataViewFloatingBinding,
  setWorkspaceDataViewFloatingBinding,
  setWorkspaceDataViewFloatingDensity,
  useWorkspaceDataViewFloatingDensity,
  type WorkspaceDataViewFloatingBinding,
} from '@/features/markdown-workspace/main/viewer/workspaceDataViewFloatingStore'
import { coerceWorkspaceDataViewConfig, type WorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { CardMediaAlbum } from '@/lib/cards/CardMediaAlbum'
import { CardMarkdownPreview } from '@/lib/cards/CardMarkdownPreview'
import { CardInlineTextProjectedMediaChip } from '@/lib/cards/CardInlineTextProjectedMediaChip'
import { insertMediaIntoActiveCardInlineTextEditor } from '@/lib/cards/cardInlineTextExternalCommands'
import { writeCommandMenuMediaNameDraft } from '@/lib/command-menu/commandMenuMediaNameSync'
import { collectInlineKeywordCommandCandidates } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { UPLOADED_MEDIA_PANEL_STORAGE_KEY } from '@/lib/storage/uploadedMediaPanelItems'
import {
  DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME,
  resolveDataViewChipClass,
} from '@/features/markdown/ui/dataViewChipStyles'
import { renderSafeHtmlBlock } from '@/features/markdown/ui/markdownPreviewLinks'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { waitForFrames } from '@/tests/lib/reactRootHarness'
const readUtf8 = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const buildFloatingBinding = (viewConfig: WorkspaceDataViewConfig): WorkspaceDataViewFloatingBinding => ({
  registrationId: 'storybook-refresh-density',
  contextLabel: 'Storyboard',
  activePanel: 'layout',
  canMutate: true,
  viewerLayout: 'kanban',
  viewerMode: 'multiDimTable',
  allowMultiDimLayout: true,
  columns: [],
  groupByColumnId: null,
  viewConfig,
  setViewConfig: () => void 0,
  onChangeLayout: () => void 0,
})
const buildViewConfig = (density: { rowHeightPreset: 'compact' | 'comfortable'; fieldLineMode: 'single' | 'double' }): WorkspaceDataViewConfig => {
  const viewConfig = coerceWorkspaceDataViewConfig({
    v: 2,
    id: 'v0',
    name: 'Kanban View',
    layout: 'kanban',
    groupByColumnId: null,
    visibleColumnIds: null,
    columnTypesById: null,
    filterGroups: [{ id: 'g0', rules: [] }],
    sortRules: [],
    rowHeightPreset: density.rowHeightPreset,
    fieldLineMode: density.fieldLineMode,
  })
  if (!viewConfig) throw new Error('expected test view config to coerce')
  return viewConfig
}
export async function testCardMarkdownPreviewInlineVideoChipKeepsParagraphFlow() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  container.className = 'text-[10px] leading-4'
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(
        React.createElement(React.Fragment, null, renderSafeHtmlBlock(
          'Review source <video src="https://example.com/demo.mp4" title="sd123" controls></video> evidence into editable storyboard elements.',
          {
            activeDocumentPath: 'workspace:/card.md',
            uiPanelTextFontClass: 'font-sans',
            uiPanelMonospaceTextClass: 'font-mono',
            markdownPresentationMode: false,
            markdownCardPreviewMode: true,
            renderNodeText: (text, key) => React.createElement(React.Fragment, { key }, text),
            fragmentOptions: null,
          },
        )),
      )
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const chip = container.querySelector('[data-kg-card-inline-media-pill="1"]')
    if (!(chip instanceof dom.window.HTMLElement)) {
      throw new Error(`expected inline video chip in card preview, html=${container.innerHTML}`)
    }
    for (const expectedClass of ['mr-1', 'items-center', 'align-baseline', 'gap-0.5', '[font-size:inherit]', '[line-height:inherit]']) {
      if (!chip.className.includes(expectedClass)) {
        throw new Error(`expected inline video chip to use inherited compact spacing ${expectedClass}, got ${chip.className}`)
      }
    }
    for (const staleClass of ['align-middle', 'text-[11px]', 'gap-1']) {
      if (chip.className.includes(staleClass)) {
        throw new Error(`expected inline video chip to avoid stale spacing class ${staleClass}, got ${chip.className}`)
      }
    }
    const stackWrapper = chip.closest('.space-y-1')
    if (stackWrapper) {
      throw new Error(`expected inline media chip to avoid vertical stack wrapper inside card paragraph, html=${container.innerHTML}`)
    }
    const text = String(container.textContent || '').replace(/\s+/g, ' ').trim()
    if (text !== 'Review source sd123 evidence into editable storyboard elements.') {
      throw new Error(`expected inline media chip to remain spaced inside paragraph text flow, got ${JSON.stringify(text)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardMarkdownPreviewStandaloneMediaDoesNotMutateProse() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(
        React.createElement(CardMarkdownPreview, {
          markdownText: [
            'Review the source evidence into editable storyboard elements.',
            '',
            '![airvio_.JPEG](https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg?agentic_os_media_token=token)',
          ].join('\n'),
          activeDocumentPath: '/__card_inline_text_editor/preview.md',
        }),
      )
      await waitForFrames(dom.window, 8)
    })
    const previewRoot = container.querySelector('[data-kg-card-markdown-preview="1"]')
    if (!(previewRoot instanceof dom.window.HTMLElement)) throw new Error(`expected card markdown preview root, html=${container.innerHTML}`)
    const attachments = previewRoot.querySelector('[data-kg-card-markdown-preview-attachments="1"]')
    if (attachments) throw new Error(`expected standalone media to remain inline, not render in a separate attachment strip, html=${container.innerHTML}`)
    const inlineChip = previewRoot.querySelector('[data-kg-card-inline-media-pill="1"]')
    if (!(inlineChip instanceof dom.window.HTMLElement)) throw new Error(`expected uploaded media chip inline in the card text run, html=${container.innerHTML}`)
    if (!String(inlineChip.textContent || '').includes('airvio_.JPEG')) {
      throw new Error(`expected inline media chip to preserve media label, got ${JSON.stringify(inlineChip.textContent)}`)
    }
    const rootText = String(previewRoot.textContent || '').replace(/\s+/g, ' ').trim()
    const chipText = String(inlineChip.textContent || '').replace(/\s+/g, ' ').trim()
    const proseText = rootText.replace(chipText, '').replace(/\s+/g, ' ').trim()
    if (proseText !== 'Review the source evidence into editable storyboard elements.') {
      throw new Error(`expected card prose preview to keep text typography separate from media label, got ${JSON.stringify({ rootText, chipText, proseText })}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardMarkdownPreviewBoundaryMediaDoesNotMutateProseTypography() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(
        React.createElement(CardMarkdownPreview, {
          markdownText: '![airvio_.JPEG](https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg?agentic_os_media_token=token) Review the source evidence into editable storyboard elements.',
          activeDocumentPath: '/__card_inline_text_editor/preview.md',
          className: 'm-0 mt-1 text-xs leading-5 text-[color:var(--kg-text-secondary)]',
        }),
      )
      await waitForFrames(dom.window, 8)
    })
    const previewRoot = container.querySelector('[data-kg-card-markdown-preview="1"]')
    if (!(previewRoot instanceof dom.window.HTMLElement)) throw new Error(`expected card markdown preview root, html=${container.innerHTML}`)
    const attachments = previewRoot.querySelector('[data-kg-card-markdown-preview-attachments="1"]')
    if (attachments) throw new Error(`expected boundary media to remain inline, not render in a separate attachment strip, html=${container.innerHTML}`)
    const inlineChip = previewRoot.querySelector('[data-kg-card-inline-media-pill="1"]')
    if (!(inlineChip instanceof dom.window.HTMLElement)) throw new Error(`expected boundary media to render as an inline chip, html=${container.innerHTML}`)
    const proseText = String(previewRoot.textContent || '')
      .replace(String(inlineChip.textContent || ''), '')
      .replace(/\s+/g, ' ')
      .trim()
    if (proseText !== 'Review the source evidence into editable storyboard elements.') {
      throw new Error(`expected boundary media to leave prose text unchanged, got ${JSON.stringify(proseText)}`)
    }
    const markdownParagraph = previewRoot.querySelector('article p, .prose p')
    if (markdownParagraph) {
      throw new Error(`expected boundary-media prose to avoid markdown paragraph typography, html=${container.innerHTML}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardMarkdownPreviewInlineImageDoesNotMutateProseTypography() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  container.className = 'text-[10px] leading-4'
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(
        React.createElement(CardMarkdownPreview, {
          markdownText: 'Review the\n\n![airvio_.JPEG](https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/airvio-demo.jpg?agentic_os_media_token=token)\n#image source evidence into editable storyboard elements.\n',
          activeDocumentPath: '/__card_inline_text_editor/preview.md',
          className: 'm-0 mt-1 text-[color:var(--kg-text-secondary)]',
          inlineChipDensity: 'compact',
        }),
      )
      await waitForFrames(dom.window, 8)
    })
    const previewRoot = container.querySelector('[data-kg-card-markdown-preview="1"]')
    if (!(previewRoot instanceof dom.window.HTMLElement)) throw new Error(`expected card markdown preview root, html=${container.innerHTML}`)
    if (previewRoot.getAttribute('data-kg-card-inline-chip-density') !== 'compact') {
      throw new Error(`expected compact card markdown preview density, html=${previewRoot.outerHTML}`)
    }
    const previewRootClassName = previewRoot.getAttribute('class') || ''
    for (const expectedClass of ['[font-size:inherit]', '[line-height:inherit]']) {
      if (!previewRootClassName.includes(expectedClass)) {
        throw new Error(`expected compact card markdown preview to inherit card text metrics ${expectedClass}, got ${previewRootClassName}`)
      }
    }
    for (const staleClass of ['text-xs', 'leading-5']) {
      if (previewRootClassName.includes(staleClass)) {
        throw new Error(`expected compact card markdown preview not to hardcode ${staleClass}, got ${previewRootClassName}`)
      }
    }
    const attachments = previewRoot.querySelector('[data-kg-card-markdown-preview-attachments="1"]')
    if (attachments) throw new Error(`expected inline image media to remain inline, not render in a separate attachment strip, html=${container.innerHTML}`)
    if (previewRoot.querySelector('br')) throw new Error(`expected compact card markdown preview to flatten media-adjacent soft line breaks, html=${previewRoot.innerHTML}`)
    const inlineChip = previewRoot.querySelector('[data-kg-card-inline-media-pill="1"]')
    if (!(inlineChip instanceof dom.window.HTMLElement)) throw new Error(`expected inline image media to render as an inline chip, html=${container.innerHTML}`)
    if (!inlineChip.className.includes('[font-size:inherit]') || !inlineChip.className.includes('[line-height:inherit]')) {
      throw new Error(`expected inline image media chip to inherit surrounding card preview text metrics, got ${inlineChip.className}`)
    }
    for (const staleClass of ['text-[11px]', 'leading-4', 'align-middle', 'gap-1', 'px-2']) {
      if (inlineChip.className.includes(staleClass)) {
        throw new Error(`expected inline image media chip to avoid stale card preview spacing or text metrics ${staleClass}, got ${inlineChip.className}`)
      }
    }
    for (const expectedClass of ['align-baseline', 'gap-0.5', 'pl-1', 'pr-1.5', 'py-0']) {
      if (!inlineChip.className.includes(expectedClass)) {
        throw new Error(`expected inline image media chip to keep compact baseline-aligned spacing ${expectedClass}, got ${inlineChip.className}`)
      }
    }
    const keywordChip = previewRoot.querySelector('[data-kg-card-inline-keyword-pill="1"]')
    if (!(keywordChip instanceof dom.window.HTMLElement)) throw new Error(`expected #keyword token to reuse the shared inline chip renderer in card preview text, html=${container.innerHTML}`)
    if (String(keywordChip.textContent || '').trim() !== '#image') {
      throw new Error(`expected #image chip to preserve readable keyword text, got ${JSON.stringify(keywordChip.textContent)}`)
    }
    for (const expectedClass of DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME.split(' ')) {
      if (expectedClass && !keywordChip.className.includes(expectedClass)) {
        throw new Error(`expected card preview #keyword chip to reuse DataView inline-text chip class ${expectedClass}, got ${keywordChip.className}`)
      }
    }
    if (keywordChip.className.includes('text-[10px]') || keywordChip.className.includes('leading-[15px]')) {
      throw new Error(`expected card preview #keyword chip to inherit surrounding text metrics, got ${keywordChip.className}`)
    }
    const proseText = String(previewRoot.textContent || '')
      .replace(String(inlineChip.textContent || ''), '')
      .replace(String(keywordChip.textContent || ''), '')
      .replace(/\s+/g, ' ')
      .trim()
    if (proseText !== 'Review the source evidence into editable storyboard elements.') {
      throw new Error(`expected inline image media to leave prose typography text unchanged, got ${JSON.stringify(proseText)}`)
    }
    const markdownParagraph = previewRoot.querySelector('article p, .prose p')
    if (markdownParagraph) {
      throw new Error(`expected inline image media to avoid markdown paragraph typography, html=${container.innerHTML}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorCompactProjectedAtMediaKeepsParagraphFlow() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const sourceText = [
    'Imported 123 document source unit:',
    'Strybldr starter source.',
    '',
    '@空武.jpg',
  ].join('\n')
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: sourceText,
          ariaLabel: 'Summary for workspace-source',
          placeholder: 'Add summary',
          canEdit: true,
          editActivation: 'click',
          multiline: true,
          markdownPreview: 'auto',
          inlineChipDensity: 'compact',
          projectedMediaAttachments: [{
            mediaKind: 'image',
            label: '空武.jpg',
            sourceUrl: 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/%E7%A9%BA%E6%AD%A6.jpg',
            thumbnailUrl: 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/%E7%A9%BA%E6%AD%A6.jpg',
          }],
          displayClassName: 'm-0 min-w-0 whitespace-pre-wrap break-words text-[10px] leading-4',
          onCommit: () => void 0,
        }),
      )
      await waitForFrames(dom.window, 8)
    })
    const display = container.querySelector('[aria-label="Summary for workspace-source"][data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error(`expected card inline display surface, html=${container.innerHTML}`)
    const chip = display.querySelector('[data-kg-card-inline-display-media-chip="1"]')
    if (!(chip instanceof dom.window.HTMLElement)) throw new Error(`expected authored @ media reference to render as projected media chip, html=${display.innerHTML}`)
    const text = String(display.textContent || '')
    if (!text.includes('Imported 123 document source unit:\nStrybldr starter source.')) {
      throw new Error(`expected compact card display to preserve non-media paragraph break, got ${JSON.stringify(text)}`)
    }
    if (!text.includes('Strybldr starter source. @空武.jpg')) {
      throw new Error(`expected compact card display to keep @ media chip in paragraph flow, got ${JSON.stringify(text)}`)
    }
    if (text.includes('Strybldr starter source.\n@空武.jpg')) {
      throw new Error(`expected compact card display not to force authored @ media chip onto a new line, got ${JSON.stringify(text)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardMediaSurfacesReuseSharedHoverPreview() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const imageUrl = 'https://example.com/shared-hover-preview.png'
  try {
    await act(async () => {
      root.render(
        React.createElement(React.Fragment, null,
          React.createElement(CardMarkdownPreview, {
            markdownText: `Review ![shared-hover-preview.png](${imageUrl}) source.`,
            activeDocumentPath: '/hover-preview.md',
            inlineChipDensity: 'compact',
          }),
          React.createElement(CardMediaAlbum, {
            items: [{ kind: 'image', url: imageUrl, sourceUrl: imageUrl }],
            title: 'Text Widget',
          }),
          React.createElement(CardInlineTextProjectedMediaChip, {
            chip: { mediaKind: 'image', label: '空武.jpg', displayLabel: '@空武.jpg', sourceUrl: imageUrl, thumbnailUrl: imageUrl, virtual: false },
            index: 0,
          }),
        ),
      )
      await waitForFrames(dom.window, 4)
    })
    const chip = container.querySelector('[data-kg-card-inline-media-pill="1"]')
    if (!(chip instanceof dom.window.HTMLElement)) throw new Error(`expected inline media hover anchor, html=${container.innerHTML}`)
    await act(async () => {
      chip.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const chipPreview = dom.window.document.querySelector('[data-kg-card-media-hover-preview="1"]')
    if (!(chipPreview instanceof dom.window.HTMLElement) || !chipPreview.querySelector('img[data-kg-card-media-kind="image"]')) {
      throw new Error(`expected inline media hover to render the shared CardMediaPreview overlay, body=${dom.window.document.body.innerHTML}`)
    }
    await act(async () => {
      chip.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: dom.window.document.body }))
      await waitForFrames(dom.window, 2)
    })
    if (dom.window.document.querySelector('[data-kg-card-media-hover-preview="1"]')) {
      throw new Error('expected inline media hover preview to close on mouse leave')
    }
    const albumTile = container.querySelector('[data-kg-card-media-album-item="1"]')
    if (!(albumTile instanceof dom.window.HTMLElement)) throw new Error(`expected album media hover anchor, html=${container.innerHTML}`)
    await act(async () => {
      albumTile.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const albumPreview = dom.window.document.querySelector('[data-kg-card-media-hover-preview="1"]')
    if (!(albumPreview instanceof dom.window.HTMLElement) || albumPreview.getAttribute('data-kg-card-media-hover-preview-kind') !== 'image') {
      throw new Error(`expected album tile to reuse shared media hover preview, body=${dom.window.document.body.innerHTML}`)
    }
    await act(async () => {
      albumTile.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: dom.window.document.body }))
      await waitForFrames(dom.window, 2)
    })
    const projectedChip = container.querySelector('[data-kg-card-inline-display-media-chip="1"]')
    if (!(projectedChip instanceof dom.window.HTMLElement)) throw new Error(`expected projected Card media chip hover anchor, html=${container.innerHTML}`)
    await act(async () => {
      projectedChip.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const projectedChipPreview = dom.window.document.querySelector('[data-kg-card-media-hover-preview="1"]')
    if (!(projectedChipPreview instanceof dom.window.HTMLElement) || !projectedChipPreview.querySelector('img[data-kg-card-media-kind="image"]')) {
      throw new Error(`expected projected Card media chip to reuse the shared hover preview, body=${dom.window.document.body.innerHTML}`)
    }
    await act(async () => {
      projectedChip.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: dom.window.document.body }))
      await waitForFrames(dom.window, 2)
    })
    const directMediaSurfaceText = readUtf8('../components/RichMediaPanelDirectMediaSurface.tsx')
    const albumText = readUtf8('../lib/cards/CardMediaAlbum.tsx')
    const markdownPreviewText = readUtf8('../lib/cards/CardMarkdownPreview.tsx')
    for (const [label, source] of [
      ['Rich Media Panel', directMediaSurfaceText],
      ['Card media album', albumText],
      ['inline media chip', markdownPreviewText],
      ['projected Card media chip', readUtf8('../lib/cards/CardInlineTextProjectedMediaChip.tsx')],
      ['Storyboard Card media drop zone', readUtf8('../components/StoryboardWidgetCanvas/StoryboardCardMediaDropSlot2d.tsx')],
    ] as const) {
      if (!source.includes('useCardMediaHoverPreview') || !source.includes('<CardMediaHoverPreview')) {
        throw new Error(`expected ${label} to consume the shared media hover preview owner`)
      }
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
