import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useWorkspaceStatusHelpers } from '@/features/markdown-workspace/useWorkspaceFileActions/core'
import { useMarkdownWorkspaceBootstrapState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceBootstrapState'
import { useMarkdownWorkspaceIndexing } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceIndexing'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { readFileSync } from 'node:fs'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'

export async function testMarkdownWorkspaceIndexingSettlesAcrossViewerRenders() {
  const previous = useGraphStore.getState()
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  resetWorkspaceFsForTests()
  const fs = await getWorkspaceFs()
  const path = '/viewer-indexing.md', text = '# Viewer\n\nEditable story.'
  await fs.createFile({ parentPath: '/', name: 'viewer-indexing.md', text, mirrorToHost: false })
  const entry = { path, name: 'viewer-indexing.md', parentPath: '/', kind: 'file' as const, text, updatedAtMs: 1 }
  let reads = 0, renders = 0
  const getFs = async () => { reads += 1; return fs }
  const setActiveMarkdownDocument = async () => undefined
  let latest: ReturnType<typeof useMarkdownWorkspaceBootstrapState> | undefined
  const root = createRoot(env.dom.window.document.getElementById('root')!)
  function Workspace({ editing = false, toastId = 'indexing-test' }) {
    if (++renders > 30) throw new Error('Workspace indexing repeatedly restarted during render')
    const state = useMarkdownWorkspaceBootstrapState({ activePath: path, effectiveBottomSurfaceCollapsed: false })
    latest = state
    const status = useWorkspaceStatusHelpers({ toastId })
    // Bind the same shared status owner as the mounted workspace runtime.
    const setStatusWithAutoClear = React.useCallback((label: string) => status.setStatusInfo(label), [status])
    useMarkdownWorkspaceIndexing({
      ...state, active: true, viewerInlineEditActive: editing, contentMode: 'document', widgetAvailable: false,
      activePath: path, activeEntry: entry, activeEntryKind: 'file', activeEntryText: text,
      activeDocumentKey: 'viewer-indexing.md', activeDocumentSourceUrl: null, sourcesByPath: {}, getFs,
      setActiveMarkdownDocument, setStatusError: status.setStatusError, setStatusProgress: status.setStatusProgress,
      setStatusWithAutoClear,
    })
    return <output>{state.activeText}</output>
  }
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
  }
  try {
    await mountReactRoot(root, <Workspace />)
    await settle()
    assert.equal(latest?.activeText, text, 'the initial document must finish loading')
    assert.equal(latest?.indexingInFlight, false, 'indexing must settle')
    const initialReads = reads
    assert.ok(initialReads > 0 && initialReads <= 2, 'initial indexing must be bounded')
    for (let i = 0; i < 3; i += 1) {
      await act(async () => { root.render(<Workspace />) })
      await settle()
    }
    assert.equal(reads, initialReads, 'unrelated Viewer renders must not restart indexing')
    await act(async () => { root.render(<Workspace editing />) })
    await settle()
    assert.equal(reads, initialReads, 'inline editing must keep indexing paused')
    await act(async () => { root.render(<Workspace toastId="indexing-next" />) })
    await settle()
    assert.equal(latest?.indexingInFlight, false, 'a new status destination must also settle')
    assert.ok(reads <= initialReads + 1, 'a real owner change must not create a restart loop')
  } finally {
    await unmountReactRoot(root)
    resetWorkspaceFsForTests()
    useGraphStore.setState(previous, true)
    env.restore()
  }
}

export async function testMarkdownWorkspaceStoryParagraphEditing() {
  const sourceLines = readFileSync(new URL('../../../docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md', import.meta.url), 'utf8').split('\n')
  const line = sourceLines.findIndex(value => value.startsWith('Open an inline asset chip'))
  assert.ok(line > 0)
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root') as HTMLElement, root = createRoot(container)
  let renders = 0
  const signals: boolean[] = []
  const replacements: string[][] = []
  function Viewer() {
    const [editing, setEditing] = React.useState(false)
    const [, setDraft] = React.useState('')
    if (++renders > 30) throw new Error('Viewer inline editing repeatedly restarted during render')
    return <div data-editing={editing}><MarkdownPreview markdownText={sourceLines.join('\n')}
      activeDocumentPath="docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md"
      highlightedLineRange={null} markdownWordWrap markdownPresentationMode={false} markdownTextHighlight={false}
      uiPanelTextFontClass="font-sans text-xs" uiPanelMonospaceTextClass="font-mono text-xs"
      previewOverlayScope="container" previewOverlayPortalTarget={null} previewScrollable
      onReplaceLineRange={args => replacements.push(args.replacementLines)} onInlineDraftTextChange={setDraft}
      onInlineEditStateChange={active => { signals.push(active); setEditing(active) }} />
    </div>
  }
  const settle = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
  try {
    await mountReactRoot(root, <Viewer />)
    await settle()
    const paragraph = Array.from(container.querySelectorAll('p')).find(p => p.textContent?.startsWith('Open an inline asset chip'))!
    assert.ok(paragraph, 'story paragraph must render')
    await act(async () => { paragraph.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })) })
    await settle()
    assert.ok(container.querySelector('[contenteditable="true"]'), 'story paragraph must enter editing')
    assert.equal(container.querySelector('[data-editing]')?.getAttribute('data-editing'), 'true', 'inactive blocks must not cancel the active edit signal')
    assert.deepEqual(signals, [true], 'the workspace must receive one stable editing transition')
    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement
    await act(async () => {
      editor.textContent = 'An edited story paragraph.'
      editor.dispatchEvent(new env.dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    })
    await settle()
    assert.equal(container.querySelector('[data-editing]')?.getAttribute('data-editing'), 'true', 'draft updates must keep the editor active')
    await act(async () => { editor.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })) })
    await settle()
    assert.equal(container.querySelector('[contenteditable="true"]'), null)
    assert.deepEqual(signals, [true, false], 'cancel must end the shared edit session once')
    assert.deepEqual(replacements, [], 'cancel must not commit a draft')
    await act(async () => { paragraph.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true, cancelable: true })) })
    await settle()
    const nextEditor = container.querySelector('[contenteditable="true"]') as HTMLElement
    await act(async () => {
      nextEditor.textContent = 'The committed story paragraph.'
      nextEditor.dispatchEvent(new env.dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    })
    await settle()
    await act(async () => { nextEditor.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter', ctrlKey: true })) })
    await settle()
    assert.deepEqual(replacements, [['The committed story paragraph.']], 'reopening and saving must commit once')
    assert.deepEqual(signals, [true, false, true, false])
  } finally { await unmountReactRoot(root); env.restore() }
}
