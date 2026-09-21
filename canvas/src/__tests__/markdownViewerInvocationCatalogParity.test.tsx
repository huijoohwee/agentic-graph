import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import SkillsCommandsView from '@/features/panels/views/SkillsCommandsView'
import { CardMarkdownPreview } from '@/lib/cards/CardMarkdownPreview'
import { registerPinnedAgenticOsDictionaryCatalogForTest } from '@/__tests__/helpers/pinnedAgenticOsDictionary'
import { resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testMarkdownViewerInvocationCatalogParity() {
  resetAgenticOsRemoteGrammarCatalogForTests()
  const invocation = '/motion.control @canvas #pose operation=start backend=auto'
  const original = `MCP uses \`${invocation}\`. Ordinary \`const value = 1\`. Path \`/tmp/example\`.`
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root') as HTMLElement
  const root = createRoot(container)
  let source = original, commits = 0
  function Surfaces() {
    const [text, setText] = React.useState(source)
    return <>
      <section data-test-surface="viewer"><MarkdownPreview markdownText={text} activeDocumentPath="/invocation-parity.md"
        highlightedLineRange={null} markdownWordWrap markdownPresentationMode={false} markdownTextHighlight={false}
        uiPanelTextFontClass="font-sans text-xs" uiPanelMonospaceTextClass="font-mono text-xs"
        previewOverlayScope="container" previewOverlayPortalTarget={null} previewScrollable
        onReplaceLineRange={({ startLine, endLine, replacementLines }) => {
          const lines = source.split('\n'); lines.splice(startLine - 1, endLine - startLine + 1, ...replacementLines)
          source = lines.join('\n'); commits++; setText(source)
        }} /></section>
      <section data-test-surface="card"><CardMarkdownPreview markdownText={original} activeDocumentPath="/widget.md" /></section>
      <section data-test-surface="catalog"><SkillsCommandsView tokenFilter={['/motion.control', '@canvas', '#pose']} /></section>
    </>
  }
  const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
  const viewer = () => container.querySelector('[data-test-surface="viewer"]')!
  const editor = () => viewer().querySelector('[contenteditable="true"]') as HTMLElement
  const open = async () => { await act(async () => {
    viewer().querySelector('[data-kg-paragraph-content]')!.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }))
  }); await settle() }
  const key = async (key: string) => { await act(async () => {
    editor().dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { bubbles: true, key, ctrlKey: key === 'Enter' }))
  }); await settle() }
  try {
    await mountReactRoot(root, <Surfaces />); await settle()
    for (const surface of ['viewer', 'card']) {
      const code = container.querySelector(`[data-test-surface="${surface}"] code[data-kg-inline-code-invocation]`)!
      assert.equal(code.textContent, invocation, 'offline invocation retains arguments and spacing')
      assert.equal(code.querySelectorAll('[data-kg-agentic-os-invocation-token]').length, 3)
      assert.equal(code.querySelector('a'), null, 'deferred catalog does not invent source links')
      const path = container.querySelector(`[data-test-surface="${surface}"] code:last-of-type`)
      assert.equal(path?.textContent, '/tmp/example')
      assert.equal(path?.querySelector('[data-kg-agentic-os-invocation-token]'), null, 'ordinary paths remain code')
    }
    await open()
    assert.equal(editor().querySelectorAll('code [contenteditable="false"]').length, 3)
    await key('Escape'); assert.equal(source, original); assert.equal(commits, 0)
    registerPinnedAgenticOsDictionaryCatalogForTest()
    await act(async () => { root.render(<Surfaces key="catalog-ready" />) }); await settle()
    const chipClasses = new Map<string, string>()
    for (const token of ['/motion.control', '@canvas', '#pose']) {
      const selector = `[data-kg-agentic-os-invocation-token="${token}"]`
      const catalog = container.querySelector(`[data-test-surface="catalog"] ${selector}`) as HTMLElement
      assert.ok(catalog, `catalog must expose ${token}`)
      for (const surface of ['viewer', 'card']) {
        const chip = container.querySelector(`[data-test-surface="${surface}"] code ${selector}`) as HTMLElement
        assert.ok(chip, `${surface} must project ${token}`)
        assert.equal(chip.textContent, catalog.textContent)
        assert.equal(chip.getAttribute('href'), catalog.getAttribute('href'))
        for (const className of catalog.classList) {
          if (!className.startsWith('max-w-') && className !== 'shrink-0') assert.ok(chip.classList.contains(className), `${surface} ${token}: missing shared ${className}`)
        }
        chipClasses.set(token, chip.className)
      }
    }
    assert.equal(viewer().querySelector('code[data-kg-inline-code-invocation]')?.textContent, invocation)
    const ordinary = viewer().querySelectorAll('code')[1]
    const ordinaryHtml = ordinary.outerHTML
    await open()
    assert.equal(editor().querySelectorAll('code')[1].outerHTML, ordinaryHtml, 'ordinary code stays unchanged')
    for (const [token, className] of chipClasses) {
      const chip = editor().querySelector(`[data-kg-inline-invocation-markdown="${token}"]`)
      assert.equal(chip?.className, className, 'edit must retain mounted chip presentation')
      assert.equal(chip?.getAttribute('contenteditable'), 'false')
    }
    assert.equal(commits, 0, 'opening does not write source or execute an invocation')
    await key('Escape'); assert.equal(source, original)
    await open()
    await act(async () => { editor().append(' Continue.'); editor().dispatchEvent(new env.dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText' })) })
    await settle(); await key('Enter')
    assert.equal(source, `${original} Continue.`, 'save retains invocation arguments, backticks and ordinary code')
    assert.equal(commits, 1)
  } finally {
    await unmountReactRoot(root); env.restore(); resetAgenticOsRemoteGrammarCatalogForTests()
  }
}
