import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { parseMarkdownFrontmatter } from '@/lib/markdown'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testMarkdownViewerReferenceEditParity() {
  const model = { subjects: [{ id: 'visitor', assetId: 'character-wolf' }], camera: [
    { caption: 'The {{kgXrMotionReference.subjects.0.assetId}} huffed.' }, { caption: 'The house stood.' },
  ] }
  const body = '{{kgXrMotionReference.camera.0.caption}} {{kgXrMotionReference.camera.1.caption}}\n\nUse `/xr.stage @stage`; then `/xr.transform @subject #transform asset=asset`.'
  const initial = `---\n# Preserve unrelated YAML bytes\nkeep: 'unchanged'\nkgXrMotionReference: ${JSON.stringify(model)}\n---\n\n${body}`
  let source = initial, commits = 0, external: ((text: string) => void) | undefined
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root') as HTMLElement, root = createRoot(container)
  function Viewer() {
    const [text, setText] = React.useState(source)
    const [, setEditing] = React.useState(false)
    external = setText
    return <MarkdownPreview markdownText={text} activeDocumentPath="/reference-parity.md"
      highlightedLineRange={null} markdownWordWrap markdownPresentationMode={false} markdownTextHighlight={false}
      uiPanelTextFontClass="font-sans text-xs" uiPanelMonospaceTextClass="font-mono text-xs"
      previewOverlayScope="container" previewOverlayPortalTarget={null} previewScrollable
      onInlineEditStateChange={setEditing} onInlineDraftTextChange={() => {}}
      onReplaceLineRange={({ startLine, endLine, replacementLines }) => {
        const lines = source.split('\n'); lines.splice(startLine - 1, endLine - startLine + 1, ...replacementLines)
        source = lines.join('\n'); commits++; setText(source)
      }} />
  }
  const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
  const click = async (node: Element) => { await act(async () => { node.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await settle() }
  const key = async (value: string) => { await act(async () => { container.querySelector('[contenteditable="true"]')!.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { bubbles: true, key: value, ctrlKey: value === 'Enter' })) }); await settle() }
  const input = async (editor: HTMLElement, text: string) => { await act(async () => {
    editor.append(env.dom.window.document.createTextNode(text)); editor.dispatchEvent(new env.dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  }); await settle() }
  try {
    await mountReactRoot(root, <Viewer />); await settle()
    const ordinary = Array.from(container.querySelectorAll('p')).find(p => p.textContent?.startsWith('Use '))!
    const codeBefore = Array.from(ordinary.querySelectorAll('code')).map(c => ({ text: c.textContent, className: c.className }))
    const invocationCount = ordinary.querySelectorAll('code [data-kg-agentic-os-invocation-chip]').length
    await click(ordinary.querySelector('[data-kg-paragraph-content]')!)
    let editor = container.querySelector('[contenteditable="true"]') as HTMLElement
    assert.deepEqual(Array.from(editor.querySelectorAll('code')).map(c => ({ text: c.textContent, className: c.className })), codeBefore, 'opening must retain the mounted inline code representation')
    assert.equal(editor.querySelectorAll('code [data-kg-inline-invocation-edit-token]').length, invocationCount, 'opening must retain the same invocation projection')
    await input(editor, ' Continue.'); await key('Enter')
    assert.ok(source.endsWith(`${body}\n`.trimEnd() + ' Continue.'), 'ordinary edits retain code syntax')
    const beforeCaption = source
    const reference = () => container.querySelector('[id="reference-edit-8-kgXrMotionReference.camera.0.caption"]') || Array.from(container.querySelectorAll('[id^="reference-edit-"]')).find(n => n.id.endsWith('camera.0.caption'))!
    const visible = reference().textContent
    await click(reference().querySelector('[data-kg-paragraph-content]')!)
    editor = container.querySelector('[contenteditable="true"]') as HTMLElement
    assert.equal(editor.textContent, visible, 'caption edit must show prose and asset label, never the placeholder')
    assert.ok(editor.querySelector('[data-kg-inline-invocation-markdown="{{kgXrMotionReference.subjects.0.assetId}}"]'), 'nested asset reference must remain atomic')
    await input(editor, ' Again.'); await key('Escape')
    assert.equal(source, beforeCaption, 'cancel leaves all source bytes unchanged')
    await click(reference().querySelector('[data-kg-paragraph-content]')!)
    editor = container.querySelector('[contenteditable="true"]') as HTMLElement
    await input(editor, ' Again.'); await key('Enter')
    const meta = parseMarkdownFrontmatter(source.split('\n')).meta as { kgXrMotionReference: typeof model }
    assert.equal(meta.kgXrMotionReference.camera[0].caption, model.camera[0].caption + ' Again.')
    assert.deepEqual(meta.kgXrMotionReference.subjects, model.subjects)
    assert.equal(meta.kgXrMotionReference.camera[1].caption, model.camera[1].caption)
    assert.equal(source.slice(source.indexOf('\n---\n') + 5), beforeCaption.slice(beforeCaption.indexOf('\n---\n') + 5), 'bound edits must leave body references unchanged')
    assert.ok(source.includes("# Preserve unrelated YAML bytes\nkeep: 'unchanged'"))
    const second = Array.from(container.querySelectorAll('[id^="reference-edit-"]')).find(n => n.id.endsWith('camera.1.caption'))!
    await click(second.querySelector('[data-kg-paragraph-content]')!)
    editor = container.querySelector('[contenteditable="true"]') as HTMLElement
    assert.equal(editor.textContent, 'The house stood.', 'adjacent plain caption must also open as editable prose')
    await input(editor, ' Still.'); await key('Enter')
    assert.equal((parseMarkdownFrontmatter(source.split('\n')).meta as typeof meta).kgXrMotionReference.camera[1].caption, 'The house stood. Still.')
    assert.equal(commits, 3)
    // An external source update during an open edit must not be overwritten.
    await click(reference().querySelector('[data-kg-paragraph-content]')!)
    editor = container.querySelector('[contenteditable="true"]') as HTMLElement
    await input(editor, ' Stale.')
    source = source.replace('huffed.', 'changed elsewhere.')
    await act(async () => { external!(source) }); await settle(); await key('Enter')
    assert.equal(commits, 3)
    assert.ok(source.includes('changed elsewhere.'))
  } finally { await unmountReactRoot(root); env.restore() }
}
