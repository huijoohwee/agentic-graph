import React from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { UPLOADED_MEDIA_PANEL_STORAGE_KEY } from '@/lib/storage/uploadedMediaPanelItems'
const tick = async (times = 1) => {
  const n = Number.isFinite(times) ? Math.max(1, Math.floor(times)) : 1
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}
const setCaretToEnd = (dom: Window, el: HTMLElement) => {
  const sel = dom.getSelection()
  if (!sel) return
  const node = el.firstChild || el
  const len = node.nodeType === Node.TEXT_NODE ? String(node.textContent || '').length : el.textContent?.length || 0
  const range = dom.document.createRange()
  range.setStart(node, Math.max(0, len))
  range.setEnd(node, Math.max(0, len))
  sel.removeAllRanges()
  sel.addRange(range)
}
const setCaretToTextNodeEnd = (dom: Window, node: Text) => {
  const sel = dom.getSelection()
  if (!sel) return
  const len = String(node.nodeValue || '').length
  const range = dom.document.createRange()
  range.setStart(node, len)
  range.setEnd(node, len)
  sel.removeAllRanges()
  sel.addRange(range)
}
export async function testMarkdownViewerInlineEditVariableToolbarInvokesWithAtAndAppliesReference() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['Hello @ve', '{{venue}}']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Hello @ve</span>
      </MarkdownBlockContainer>,
    )
    await tick()
    await tick()
    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host p')
    host.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 42,
        width: 320,
        height: 42,
        toJSON: () => ({}),
      }) as unknown as DOMRect
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(3)
    await tick()
    const editor = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    ;(dom.window.Range.prototype as unknown as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 80,
        bottom: 22,
        width: 80,
        height: 22,
        toJSON: () => ({}),
      }) as unknown as DOMRect
    editor.textContent = 'Hello @ve'
    setCaretToEnd(dom.window, editor)
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true }))
    await tick()
    await tick()
    const variableKeyInput = Array.from(dom.window.document.querySelectorAll('input')).find(
      el => (el as HTMLInputElement).placeholder === 'Find variable or action',
    ) as HTMLInputElement | undefined
    if (!variableKeyInput) throw new Error('expected variable toolbar to open from @ trigger')
    if (variableKeyInput.value !== 've') throw new Error('expected @query to seed shared variable command search')
    const panel = dom.window.document.querySelector('section[aria-label="Variable toolbar"]') as HTMLElement | null
    if (!panel) throw new Error('expected variable toolbar panel')
    const suggestionButton = Array.from(panel.querySelectorAll('button')).find(
      el => String((el as HTMLButtonElement).textContent || '').trim().startsWith('venue'),
    ) as HTMLButtonElement | undefined
    if (!suggestionButton) throw new Error('expected variable suggestion list to include venue')
    suggestionButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    const applyButton = Array.from(panel.querySelectorAll('button')).find(
      el => String((el as HTMLButtonElement).textContent || '').trim() === 'Apply',
    ) as HTMLButtonElement | undefined
    if (!applyButton) throw new Error('expected variable toolbar apply button')
    applyButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    await tick()
    const editorNow = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editorNow) throw new Error('expected contenteditable editor after apply')
    const text = String(editorNow.textContent || '')
    if (!text.includes('{{venue}}')) throw new Error(`expected apply to insert {{venue}} token; text=${JSON.stringify(text)}`)
    if (text.includes('@ve')) throw new Error(`expected apply to replace @ query trigger; text=${JSON.stringify(text)}`)
    root.unmount()
  } finally {
    restore()
  }
}
export async function testMarkdownViewerInlineEditSlashToolbarOpensAfterInlineMediaToken() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    const mediaMarkdown = '![strybldr-starter-source.png](https://airvio.co/agentic-graph/media/strybldr-starter-source.png)'
    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={[`This is the ${mediaMarkdown}minimum viable runnable Strybldr seed /`]}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>This is the strybldr-starter-source.png minimum viable runnable Strybldr seed /</span>
      </MarkdownBlockContainer>,
    )
    await tick(2)
    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host p')
    host.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 42, width: 320, height: 42, toJSON: () => ({}) }) as unknown as DOMRect
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(4)
    const editor = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    const mediaToken = editor.querySelector('[data-kg-inline-media-edit-token="1"]') as HTMLElement | null
    if (!mediaToken) throw new Error(`expected inline media edit token, html=${editor.innerHTML}`)
    const mediaSource = String(mediaToken.getAttribute('data-kg-inline-media-markdown') || '')
    if (!mediaSource.includes('strybldr-starter-source.png')) {
      throw new Error(`expected inline media token to preserve markdown source, got ${JSON.stringify(mediaSource)}`)
    }
    ;(dom.window.Range.prototype as unknown as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 22, width: 80, height: 22, toJSON: () => ({}) }) as unknown as DOMRect
    const walker = dom.window.document.createTreeWalker(editor, dom.window.NodeFilter.SHOW_TEXT)
    let lastTextNode: Text | null = null
    let node = walker.nextNode()
    while (node) {
      lastTextNode = node as Text
      node = walker.nextNode()
    }
    if (!lastTextNode || !String(lastTextNode.nodeValue || '').trim().endsWith('/')) {
      throw new Error(`expected trailing slash text node, text=${JSON.stringify(editor.textContent || '')}`)
    }
    setCaretToTextNodeEnd(dom.window, lastTextNode)
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true }))
    await tick(3)
    const panel = dom.window.document.querySelector('section[aria-label="Slash commands"]') as HTMLElement | null
    if (!panel) throw new Error(`expected slash toolbar panel after inline media paragraph trigger, html=${dom.window.document.body.innerHTML}`)
    const queryInput = panel.querySelector('input[placeholder="Type a command"]') as HTMLInputElement | null
    if (!queryInput) throw new Error('expected slash command search input')
    const commandTexts = Array.from(panel.querySelectorAll('button')).map(button => String(button.textContent || '').replace(/\s+/g, ' ').trim())
    if (!commandTexts.some(text => text.includes('/memory.seed'))) {
      throw new Error(`expected slash menu to include centralized /memory.seed action, got ${JSON.stringify(commandTexts)}`)
    }
    if (commandTexts.some(text => text.includes('/agentic-os.runtime'))) {
      throw new Error(`expected inline slash menu to avoid prose-mutating Agentic OS doc route actions, got ${JSON.stringify(commandTexts)}`)
    }
    root.unmount()
  } finally {
    restore()
  }
}
export async function testMarkdownViewerInlineEditInvocationTokensHydrateAsNonEditableChips() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const { readInlineMediaEditorMarkdownText } = await import('@/lib/markdown-core/ui/markdownBlockContainerCore.inlineMediaEditHtml')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['This is the /prd-tad.create #frontmatter @operator minimum viable runnable seed.']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>This is the /prd-tad.create #frontmatter @operator minimum viable runnable seed.</span>
      </MarkdownBlockContainer>,
    )
    await tick(2)
    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host p')
    host.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 42, width: 320, height: 42, toJSON: () => ({}) }) as unknown as DOMRect
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(4)
    const editor = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    const invocationTokens = Array.from(editor.querySelectorAll('[data-kg-inline-invocation-edit-token="1"]')) as HTMLElement[]
    const invocationMarkdown = invocationTokens.map(token => token.getAttribute('data-kg-inline-invocation-markdown') || '')
    for (const expected of ['/prd-tad.create', '#frontmatter', '@operator']) {
      if (!invocationMarkdown.includes(expected)) {
        throw new Error(`expected ${expected} invocation to hydrate as an edit chip, got ${JSON.stringify(invocationMarkdown)} html=${editor.innerHTML}`)
      }
    }
    if (invocationTokens.some(token => token.getAttribute('contenteditable') !== 'false')) {
      throw new Error(`expected invocation edit chips to be non-editable, html=${editor.innerHTML}`)
    }
    const serialized = readInlineMediaEditorMarkdownText(editor)
    if (!serialized.includes('This is the /prd-tad.create #frontmatter @operator minimum viable runnable seed.')) {
      throw new Error(`expected invocation edit chip serializer to preserve canonical markdown, got ${JSON.stringify(serialized)}`)
    }
    root.unmount()
  } finally {
    restore()
  }
}
export async function testMarkdownViewerInlineEditRenderedInvocationAndMediaChipsSerializeCanonicalMarkdown() {
  const { restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const { rewriteRenderedInlineMediaForEditorHtml, readInlineMediaEditorMarkdownText } = await import('@/lib/markdown-core/ui/markdownBlockContainerCore.inlineMediaEditHtml')
    const html = [
      'This is the ',
      '<a data-kg-agentic-os-invocation-chip="1" data-kg-agentic-os-invocation-token="/prd-tad.create" href="https://example.com">/prd-tad.create</a>',
      ' minimum viable runnable ',
      '<a href="https://example.com/media/source.png" data-kg-card-inline-media-pill="1" title="source.png"><span>source.png</span></a>',
      ' seed for a new ',
      '<a data-kg-agentic-os-invocation-chip="1" data-kg-agentic-os-invocation-token="#token-economics" href="https://example.com">#token-economics</a>',
      ' source. ',
      '<a data-kg-agentic-os-invocation-chip="1" data-kg-agentic-os-invocation-token="/memory.seed" href="https://example.com">/memory.seed</a>',
    ].join('')
    const rewritten = rewriteRenderedInlineMediaForEditorHtml(html)
    const root = document.createElement('section')
    root.innerHTML = rewritten
    const invocationTokens = Array.from(root.querySelectorAll('[data-kg-inline-invocation-edit-token="1"]')) as HTMLElement[]
    const mediaToken = root.querySelector('[data-kg-inline-media-edit-token="1"]') as HTMLElement | null
    if (invocationTokens.length !== 3 || !mediaToken) {
      throw new Error(`expected rendered invocation and media chips to hydrate into edit tokens, html=${rewritten}`)
    }
    const serialized = readInlineMediaEditorMarkdownText(root)
    for (const expected of ['/prd-tad.create', '#token-economics', '/memory.seed', '![source.png](https://example.com/media/source.png)']) {
      if (!serialized.includes(expected)) {
        throw new Error(`expected serialized edit markdown to preserve ${expected}, got ${JSON.stringify(serialized)}`)
      }
    }
    if (serialized.includes('Source:') || serialized.includes('DICTIONARY-') || serialized.includes('undefined')) {
      throw new Error(`expected chip metadata not to leak into serialized markdown, got ${JSON.stringify(serialized)}`)
    }
  } finally {
    restore()
  }
}
export async function testMarkdownViewerInlineEditEscapedMediaTokenHydratesAndCommitsCanonicalMarkdown() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const inlineMediaEditHtmlMod = await import('@/lib/markdown-core/ui/markdownBlockContainerCore.inlineMediaEditHtml')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    const sourceLine = 'This is the !\\[strybldr-starter-source.png]\\(http\\://localhost:5178/api/storage/media/airvio/runs/upload-017d 1e/image/strybldr-starter-source-017d 1e.png?kg\\_media\\_token=abc 123\\) minimum viable runnable Strybldr seed.'
    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={[sourceLine]}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>This is the ![strybldr-starter-source.png](http://localhost:5178/api/storage/media/airvio/runs/upload-017d 1e/image/strybldr-starter-source-017d 1e.png?agentic_os_media_token=abc 123) minimum viable runnable Strybldr seed.</span>
      </MarkdownBlockContainer>,
    )
    await tick(2)
    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host p')
    host.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 720, bottom: 64, width: 720, height: 64, toJSON: () => ({}) }) as unknown as DOMRect
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(4)
    const editor = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    if (String(editor.textContent || '').includes('!\\[') || String(editor.textContent || '').includes('\\(')) {
      throw new Error(`expected edit surface not to expose escaped raw media markdown, text=${JSON.stringify(editor.textContent || '')}`)
    }
    const mediaToken = editor.querySelector('[data-kg-inline-media-edit-token="1"]') as HTMLElement | null
    if (!mediaToken) throw new Error(`expected escaped inline media to hydrate as an edit chip, html=${editor.innerHTML}`)
    const storedMarkdown = String(mediaToken.getAttribute('data-kg-inline-media-markdown') || '')
    const expectedMedia = '![strybldr-starter-source.png](http://localhost:5178/api/storage/media/airvio/runs/upload-017d1e/image/strybldr-starter-source-017d1e.png?agentic_os_media_token=abc123)'
    if (storedMarkdown !== expectedMedia) {
      throw new Error(`expected edit chip to store canonical markdown media token, got ${JSON.stringify(storedMarkdown)}`)
    }
    editor.appendChild(dom.window.document.createTextNode(' Reviewed.'))
    const committed = inlineMediaEditHtmlMod.readInlineMediaEditorMarkdownText(editor)
    if (!committed.includes(expectedMedia) || committed.includes('!\\[') || committed.includes('\\(') || committed.includes('kg\\_media\\_token')) {
      throw new Error(`expected edit serialization to preserve canonical media markdown without escaped mutation, got ${JSON.stringify(committed)}`)
    }
    if (committed.includes('upload-017d 1e') || committed.includes('abc 123')) {
      throw new Error(`expected edit serialization to repair whitespace-corrupted media URL, got ${JSON.stringify(committed)}`)
    }
    root.unmount()
  } finally {
    restore()
  }
}
export async function testMarkdownViewerInlineEditSemanticToolbarOpensAfterInlineMediaToken() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    const mediaMarkdown = '![strybldr-starter-source.png](https://airvio.co/agentic-graph/media/strybldr-starter-source.png)'
    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={[`This is the ${mediaMarkdown}minimum viable runnable Strybldr seed #front`]}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>This is the strybldr-starter-source.png minimum viable runnable Strybldr seed #front</span>
      </MarkdownBlockContainer>,
    )
    await tick(2)
    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host p')
    host.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 42, width: 320, height: 42, toJSON: () => ({}) }) as unknown as DOMRect
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(4)
    const editor = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    if (!editor.querySelector('[data-kg-inline-media-edit-token="1"]')) throw new Error(`expected inline media edit token, html=${editor.innerHTML}`)
    ;(dom.window.Range.prototype as unknown as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 22, width: 80, height: 22, toJSON: () => ({}) }) as unknown as DOMRect
    const walker = dom.window.document.createTreeWalker(editor, dom.window.NodeFilter.SHOW_TEXT)
    let lastTextNode: Text | null = null
    let node = walker.nextNode()
    while (node) {
      lastTextNode = node as Text
      node = walker.nextNode()
    }
    if (!lastTextNode || !String(lastTextNode.nodeValue || '').trim().endsWith('#front')) {
      throw new Error(`expected trailing hash text node, text=${JSON.stringify(editor.textContent || '')}`)
    }
    setCaretToTextNodeEnd(dom.window, lastTextNode)
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true }))
    await tick(3)
    const panel = dom.window.document.querySelector('section[aria-label="Semantic commands"]') as HTMLElement | null
    if (!panel) throw new Error(`expected semantic toolbar panel after inline media paragraph trigger, html=${dom.window.document.body.innerHTML}`)
    const queryInput = panel.querySelector('input[placeholder="Find semantic token"]') as HTMLInputElement | null
    if (!queryInput || queryInput.value !== 'front') {
      throw new Error(`expected # query to seed semantic command search, got ${JSON.stringify(queryInput?.value || '')}`)
    }
    const commandTexts = Array.from(panel.querySelectorAll('button')).map(button => String(button.textContent || '').replace(/\s+/g, ' ').trim())
    if (!commandTexts.some(text => text.includes('#frontmatter'))) {
      throw new Error(`expected semantic menu to include centralized #frontmatter action, got ${JSON.stringify(commandTexts)}`)
    }
    root.unmount()
  } finally {
    restore()
  }
}
export async function testMarkdownViewerInlineEditSemanticToolbarInvokesHashDictionary() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={3}
        endLine={3}
        inlineEditable
        sourceLines={['Use #front']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Use #front</span>
      </MarkdownBlockContainer>,
    )
    await tick(2)
    const host = dom.window.document.querySelector('[data-start-line="3"]') as HTMLElement | null
    if (!host) throw new Error('expected host p')
    host.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 42, width: 320, height: 42, toJSON: () => ({}) }) as unknown as DOMRect
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(4)
    const editor = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    ;(dom.window.Range.prototype as unknown as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 22, width: 80, height: 22, toJSON: () => ({}) }) as unknown as DOMRect
    editor.textContent = 'Use #front'
    setCaretToEnd(dom.window, editor)
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true }))
    await tick(3)
    const panel = dom.window.document.querySelector('section[aria-label="Semantic commands"]') as HTMLElement | null
    if (!panel) throw new Error(`expected semantic toolbar panel, html=${dom.window.document.body.innerHTML}`)
    const queryInput = panel.querySelector('input[placeholder="Find semantic token"]') as HTMLInputElement | null
    if (!queryInput || queryInput.value !== 'front') {
      throw new Error(`expected # query to seed semantic command search, got ${JSON.stringify(queryInput?.value || '')}`)
    }
    const frontmatterButton = Array.from(panel.querySelectorAll('button')).find(
      button => String(button.textContent || '').includes('#frontmatter'),
    ) as HTMLButtonElement | undefined
    if (!frontmatterButton) {
      const buttonText = Array.from(panel.querySelectorAll('button')).map(button => String(button.textContent || '').replace(/\s+/g, ' ').trim())
      throw new Error(`expected semantic dictionary to include #frontmatter, got ${JSON.stringify(buttonText)}`)
    }
    if (frontmatterButton.getAttribute('data-kg-inline-command-item-id') !== 'agentic-os-semantic-semantic:frontmatter') {
      throw new Error(`expected #frontmatter to come from the shared semantic dictionary action, got ${JSON.stringify(frontmatterButton.outerHTML)}`)
    }
    frontmatterButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick(3)
    const editorAfter = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    const nextText = String(editorAfter?.textContent || '')
    if (!nextText.includes('#frontmatter') || !nextText.includes('Frontmatter')) {
      throw new Error(`expected #front trigger to apply centralized semantic dictionary token, got ${JSON.stringify(editorAfter?.innerHTML || nextText)}`)
    }
    if (nextText.includes('#front ') || nextText.endsWith('#front')) {
      throw new Error(`expected semantic command apply to replace #front trigger, got ${JSON.stringify(nextText)}`)
    }
    root.unmount()
  } finally {
    restore()
  }
}
export async function testMarkdownViewerInlineEditVariableToolbarUsesFloatingPanelMediaCandidates() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const publicUrl = 'https://airvio.co/api/storage/media/airvio/runs/upload-demo/video/seedance.mp4'
  const accessUrl = `${publicUrl}?agentic_os_media_token=token`
  try {
    dom.window.localStorage.setItem(UPLOADED_MEDIA_PANEL_STORAGE_KEY, JSON.stringify([{
      id: 'cloudflare-media:sha256:source-video',
      name: 'seedance_source.mp4',
      kind: 'video',
      localUrl: '',
      linkUrl: accessUrl,
      contentType: 'video/mp4',
      sizeBytes: 1234,
      durationSeconds: 52,
      status: 'synced',
      storage: {
        workspaceId: 'airvio',
        runId: 'upload-demo',
        stageId: 'video',
        shotId: 'seedance',
        objectKey: 'airvio/runs/upload-demo/video/seedance.mp4',
        publicPath: '/api/storage/media/airvio/runs/upload-demo/video/seedance.mp4',
        publicUrl,
        accessUrl,
        contentHash: 'sha256:source-video',
        contentType: 'video/mp4',
        provenance: { fileName: 'seedance_source.mp4', durationSeconds: 52, sizeBytes: 1234 },
        response: {},
      },
      error: null,
    }]))
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={2}
        endLine={2}
        inlineEditable
        sourceLines={[`sourceUrl: ${accessUrl}`, 'Insert @source']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Insert @source</span>
      </MarkdownBlockContainer>,
    )
    await tick(2)
    const host = dom.window.document.querySelector('[data-start-line="2"]') as HTMLElement | null
    if (!host) throw new Error('expected host p')
    host.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 42, width: 320, height: 42, toJSON: () => ({}) }) as unknown as DOMRect
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(4)
    const editor = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    ;(dom.window.Range.prototype as unknown as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 22, width: 80, height: 22, toJSON: () => ({}) }) as unknown as DOMRect
    editor.textContent = 'Insert @source'
    setCaretToEnd(dom.window, editor)
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true }))
    await tick(3)
    const panel = dom.window.document.querySelector('section[aria-label="Variable toolbar"]') as HTMLElement | null
    if (!panel) throw new Error('expected variable toolbar panel')
    const buttonTexts = Array.from(panel.querySelectorAll('button')).map(button => String(button.textContent || '').replace(/\s+/g, ' ').trim())
    const mediaButtons = buttonTexts.filter(text => text.includes('seedance_source.mp4') || text.includes('Video: sourceUrl'))
    if (mediaButtons.length !== 1 || !mediaButtons[0]?.includes('Uploaded media from FloatingPanel Media')) {
      throw new Error(`expected Viewer @ menu to prefer the FloatingPanel Media row over duplicate sourceUrl candidates, got ${JSON.stringify(mediaButtons)}`)
    }
    if (buttonTexts.some(text => text.includes('Video: sourceUrl'))) {
      throw new Error(`expected duplicate document-derived sourceUrl media row to be removed, got ${JSON.stringify(buttonTexts)}`)
    }
    root.unmount()
  } finally {
    dom.window.localStorage.removeItem(UPLOADED_MEDIA_PANEL_STORAGE_KEY)
    restore()
  }
}
export async function testMarkdownViewerInlineEditVariableToolbarDeleteUpdatesFrontmatter() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    let replacePayload: { startLine: number; endLine: number; replacementLines: string[] } | null = null
    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={5}
        endLine={5}
        inlineEditable
        sourceLines={['---', 'venue: "Singapore"', '---', '', 'Body line']}
        onReplaceLineRange={(args) => { replacePayload = args }}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Body line @venue</span>
      </MarkdownBlockContainer>,
    )
    await tick()
    await tick()
    const host = dom.window.document.querySelector('[data-start-line="5"]') as HTMLElement | null
    if (!host) throw new Error('expected host')
    host.getBoundingClientRect = () =>
      ({
        x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 42, width: 320, height: 42, toJSON: () => ({})
      }) as unknown as DOMRect
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(3)
    await tick()
    const editor = host.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor')
    ;(dom.window.Range.prototype as unknown as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 22, width: 80, height: 22, toJSON: () => ({}) }) as unknown as DOMRect
    editor.textContent = 'Body line @venue'
    setCaretToEnd(dom.window, editor)
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true }))
    await tick()
    await tick()
    const keyInput = Array.from(dom.window.document.querySelectorAll('input')).find(
      el => (el as HTMLInputElement).placeholder === 'Find variable or action',
    ) as HTMLInputElement | undefined
    if (!keyInput) throw new Error('expected shared variable command search input')
    if (keyInput.value !== 'venue') throw new Error(`expected @ query to seed command search with "venue", got ${keyInput.value}`)
    await tick()
    const deleteButton = Array.from(dom.window.document.querySelectorAll('button')).find(
      el => String((el as HTMLButtonElement).textContent || '').trim() === 'Delete',
    ) as HTMLButtonElement | undefined
    if (!deleteButton) throw new Error('expected delete button')
    deleteButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    await tick()
    if (!replacePayload) throw new Error('expected frontmatter delete to call onReplaceLineRange')
    if (replacePayload.startLine !== 1 || replacePayload.endLine !== 3) {
      throw new Error(`expected frontmatter range replace (1..3), got ${replacePayload.startLine}..${replacePayload.endLine}`)
    }
    const merged = replacePayload.replacementLines.join('\n')
    if (merged.includes('venue: "Singapore"')) throw new Error('expected delete to remove frontmatter key')
    root.unmount()
  } finally {
    restore()
  }
}
