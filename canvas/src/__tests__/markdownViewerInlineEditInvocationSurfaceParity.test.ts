import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testMarkdownViewerInlineEditInvocationChipToneMatchesReadSurface() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    dom.reconfigure({ url: 'https://airvio.co/agenticgraph/' })
    const { rewriteRenderedInlineMediaForEditorHtml } = await import('@/lib/markdown-core/ui/markdownBlockContainerCore.inlineMediaEditHtml')
    const {
      DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME,
      readInlineKeywordChipToneValue,
      resolveDataViewChipClass,
    } = await import('@/features/markdown/ui/dataViewChipStyles')
    const token = '#canvas'
    const expectedToneClass = resolveDataViewChipClass(readInlineKeywordChipToneValue(token))
    const rawToneClass = resolveDataViewChipClass(token)
    const renderedClassName = `${DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME} ${expectedToneClass} cursor-pointer no-underline hover:underline`
    const html = [
      'This is the ',
      `<a data-kg-agentic-os-invocation-chip="1" data-kg-agentic-os-invocation-token="${token}" class="${renderedClassName}" href="https://example.com">#canvas</a>`,
      ' surface.',
    ].join('')
    const root = document.createElement('section')
    root.innerHTML = rewriteRenderedInlineMediaForEditorHtml(html)
    const editToken = root.querySelector('[data-kg-inline-invocation-edit-token="1"][data-kg-inline-invocation-markdown="#canvas"]') as HTMLElement | null
    if (!editToken) throw new Error(`expected #canvas invocation edit token, html=${root.innerHTML}`)
    const expectedClasses = expectedToneClass.split(/\s+/).filter(Boolean)
    for (const expectedClass of expectedClasses) {
      if (!editToken.classList.contains(expectedClass)) {
        throw new Error(`expected edit token to preserve read-surface tone ${expectedClass}, class=${editToken.className}`)
      }
    }
    for (const rawOnlyClass of rawToneClass.split(/\s+/).filter(cls => cls && !expectedClasses.includes(cls))) {
      if (editToken.classList.contains(rawOnlyClass)) {
        throw new Error(`expected edit token not to switch to raw sigil tone ${rawOnlyClass}, class=${editToken.className}`)
      }
    }
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const {
      INLINE_MEDIA_COMMAND_THUMBNAIL_IMAGE_CLASS_NAME,
      InlineMediaCommandThumbnail,
      readInlineMediaCommandThumbnailClassName,
    } = await import('@/lib/command-menu/InlineMediaCommandThumbnail')
    root.innerHTML = rewriteRenderedInlineMediaForEditorHtml('<img src="https://media.example.test/scene.jpg" alt="Scene">')
    const thumbnail = root.querySelector('[data-kg-inline-media-edit-token="1"] [data-kg-inline-command-thumbnail="image"]') as HTMLElement | null
    const thumbnailImage = thumbnail?.querySelector('img') as HTMLImageElement | null
    const expectedThumbnailClass = readInlineMediaCommandThumbnailClassName({ hasThumbnail: true, kind: 'image', variant: 'inline' })
    if (
      !thumbnail
      || thumbnail.className !== expectedThumbnailClass
      || thumbnail.getAttribute('aria-label') !== 'Scene'
      || thumbnail.getAttribute('role') !== 'img'
      || thumbnail.hasAttribute('aria-hidden')
      || thumbnailImage?.className !== INLINE_MEDIA_COMMAND_THUMBNAIL_IMAGE_CLASS_NAME
    ) {
      throw new Error(`expected Viewer edit media token to reuse read-surface thumbnail geometry, html=${root.innerHTML}`)
    }
    const selectableThumbnailMarkup = renderToStaticMarkup(createElement(InlineMediaCommandThumbnail, {
      kind: 'image',
      thumbnailAlt: 'Storyboard source frame',
      thumbnailUrl: 'https://media.example.test/source-frame.jpg',
      variant: 'inline',
    }))
    if (!selectableThumbnailMarkup.includes('aria-label="Storyboard source frame"') || !selectableThumbnailMarkup.includes('role="img"') || selectableThumbnailMarkup.includes('aria-hidden="true"')) {
      throw new Error(`expected shared media thumbnail wrapper to remain labeled and visible to selection tooling, html=${selectableThumbnailMarkup}`)
    }
    const staleLocalThumbnailMarkup = renderToStaticMarkup(createElement(InlineMediaCommandThumbnail, {
      kind: 'image',
      thumbnailAlt: 'Stale local storage thumbnail',
      thumbnailUrl: 'http://localhost:5181/api/storage/media/airvio/runs/upload-demo/image/source-frame.jpg?kg_media_token=stale',
      variant: 'inline',
    }))
    if (
      !staleLocalThumbnailMarkup.includes('https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/source-frame.jpg?kg_media_token=')
      || staleLocalThumbnailMarkup.includes('localhost:5181')
      || staleLocalThumbnailMarkup.includes('kg_media_token=stale')
    ) {
      throw new Error(`expected shared inline media thumbnails to normalize stale local storage urls, html=${staleLocalThumbnailMarkup}`)
    }
    root.innerHTML = rewriteRenderedInlineMediaForEditorHtml('<img src="http://localhost:5177/api/storage/media/airvio/runs/upload-demo/image/inline-source.jpg?kg_media_token=stale" alt="Inline source">')
    const normalizedEditThumbnail = root.querySelector('[data-kg-inline-media-edit-token="1"] img') as HTMLImageElement | null
    if (
      !normalizedEditThumbnail
      || !String(normalizedEditThumbnail.getAttribute('src') || '').startsWith('https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/inline-source.jpg?kg_media_token=')
      || String(normalizedEditThumbnail.getAttribute('src') || '').includes('localhost:5177')
      || String(normalizedEditThumbnail.getAttribute('src') || '').includes('kg_media_token=stale')
    ) {
      throw new Error(`expected Viewer inline media edit html to normalize stale local storage thumbnail urls, html=${root.innerHTML}`)
    }
  } finally {
    restore()
  }
}

export async function testMarkdownContentEditableSurfaceSharesPointSelectionRuntime() {
  const { restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const {
      applyMarkdownContentEditableSelection,
      readMarkdownContentEditableCaretRangeFromPoint,
    } = await import('@/lib/markdown-core/ui/markdownContentEditableSurface')
    const root = document.createElement('section')
    const textNode = document.createTextNode('shared viewer text')
    root.appendChild(textNode)
    document.body.appendChild(root)
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const range = document.createRange()
        range.setStart(textNode, 7)
        range.collapse(true)
        return range
      },
    })
    const result = readMarkdownContentEditableCaretRangeFromPoint(root, { x: 24, y: 12 })
    if (!result.supported || !result.range || result.range.startContainer !== textNode || result.range.startOffset !== 7) {
      throw new Error('expected shared point-selection helper to resolve an in-surface caret range')
    }
    if (!applyMarkdownContentEditableSelection(root, result.range)) {
      throw new Error('expected shared contenteditable selection application to succeed')
    }
    const selection = document.getSelection()
    if (!selection || selection.anchorNode !== textNode || selection.anchorOffset !== 7) {
      throw new Error('expected shared selection application to place the caret at the resolved point')
    }
  } finally {
    restore()
  }
}
