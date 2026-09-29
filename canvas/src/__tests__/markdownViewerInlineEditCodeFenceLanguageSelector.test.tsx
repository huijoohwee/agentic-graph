import { selectMenuValue } from './helpers/semanticMenu'
import React from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = async (n: number = 1) => {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

const baseOpts = (sourceLines: string[], onReplaceLineRange: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void) => ({
  activeDocumentPath: '/tmp/doc.md',
  uiPanelTextFontClass: '',
  uiPanelMonospaceTextClass: 'font-mono text-xs',
  markdownPresentationMode: false,
  highlightedLineRange: null,
  markdownWordWrap: true,
  mermaidFrontmatterConfig: null,
  rootThemeMode: 'light' as const,
  previewOverlayScope: 'container' as const,
  viewerBlockEditingEnabled: true,
  markdownBlockControlsEnabled: true,
  markdownBlockGutterEnabled: false,
  onReplaceLineRange,
  markdownSourceLines: sourceLines,
  forbidCopy: false,
})

export async function testMarkdownViewerCodeFenceLanguageSelectorUpdatesFenceInfoAndKeepsMetadata() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock
    const calls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'select 1;', info: 'sql {lines:true}', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```sql {lines:true}', 'select 1;', '```'], (args) => calls.push(args)) as never}
        wrapClass=""
      />,
    )

    await tick(2)
    const select = dom.window.document.querySelector('button[data-kg-select][aria-label="Code fence language"]') as HTMLButtonElement | null
    if (!select) throw new Error('expected code-fence language selector')
    if (select.value !== 'sql') {
      throw new Error(`expected code-fence language selector to reflect current language; value=${JSON.stringify(select.value)}`)
    }
    selectMenuValue(select, 'typescript')
    await tick(1)
    if (calls.length !== 1) throw new Error(`expected one code-fence language mutation call; count=${calls.length}`)
    const first = calls[0]
    if (first.startLine !== 1 || first.endLine !== 1) {
      throw new Error(`expected code-fence language mutation to update opening fence line only; got=${JSON.stringify(first)}`)
    }
    if (first.replacementLines[0] !== '```typescript {lines:true}') {
      throw new Error(`expected code-fence language mutation to preserve trailing metadata while changing language; line=${JSON.stringify(first.replacementLines[0])}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerCodeFenceLanguageSelectorAllowsAutoModeWithoutOpeningInlineEditor() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock
    const calls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'select 1;', info: 'sql {lines:true}', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```sql {lines:true}', 'select 1;', '```'], (args) => calls.push(args)) as never}
        wrapClass=""
      />,
    )

    await tick(2)
    const host = dom.window.document.querySelector('figure') as HTMLElement | null
    if (!host) throw new Error('expected code block host')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 120,
        width: 640,
        height: 120,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    const select = dom.window.document.querySelector('button[data-kg-select][aria-label="Code fence language"]') as HTMLButtonElement | null
    if (!select) throw new Error('expected code-fence language selector')
    select.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    select.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    selectMenuValue(select, '__auto__')
    await tick(2)

    if (calls.length !== 1) throw new Error(`expected one code-fence language mutation call for auto mode; count=${calls.length}`)
    if (calls[0].replacementLines[0] !== '```{lines:true}') {
      throw new Error(`expected auto mode to preserve metadata and clear explicit language token; line=${JSON.stringify(calls[0].replacementLines[0])}`)
    }
    const editor = dom.window.document.querySelector('[contenteditable="true"]')
    if (editor) throw new Error('expected language selector interaction not to toggle inline contenteditable editor')

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerCodeFenceCopyButtonRespectsExplicitForbidOnly() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'select 1;', info: 'sql', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```sql', 'select 1;', '```'], () => {}) as never}
        wrapClass=""
      />,
    )
    await tick(2)
    const enabledButton = dom.window.document.querySelector('button[aria-label="Copy code to clipboard"]') as HTMLButtonElement | null
    if (!enabledButton) throw new Error('expected code-fence copy button')
    if (enabledButton.disabled) {
      throw new Error('expected code-fence copy button to be enabled when forbidCopy is false')
    }

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'select 1;', info: 'sql', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={{ ...baseOpts(['```sql', 'select 1;', '```'], () => {}), forbidCopy: true } as never}
        wrapClass=""
      />,
    )
    await tick(2)
    const disabledButton = dom.window.document.querySelector('button[aria-label="Copy code to clipboard"]') as HTMLButtonElement | null
    if (!disabledButton) throw new Error('expected code-fence copy button after forbidCopy rerender')
    if (!disabledButton.disabled) {
      throw new Error('expected code-fence copy button to be disabled only when forbidCopy is explicitly true')
    }

    root.unmount()
  } finally {
    restore()
  }
}
