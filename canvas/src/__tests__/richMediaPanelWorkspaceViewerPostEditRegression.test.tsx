import React from 'react'
import { createRoot } from 'react-dom/client'
import { RichMediaPanelWorkspaceViewerSurface } from '@/components/RichMediaPanelWorkspaceViewerSurface'
import type { RichMediaPanelProps } from '@/components/RichMediaPanel.types'
import type { RichMediaPanelModel } from '@/components/useRichMediaPanelModel'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames, waitForTasks } from '@/tests/lib/reactRootHarness'
import { resolveRepoTestDataPath } from '@/tests/lib/repoTestData'
import { readFileSync } from 'node:fs'
import { emitStoryboardCardProvenanceFocus } from '@/lib/storyboardWidget/storyboardCardProvenanceFocus'

export async function testRichMediaWorkspaceViewerRetainsCommittedDraftUntilParentPersistence() {
  const { dom, restore } = initJsdomHarness()
  try {
    await import('@/features/markdown/ui/MarkdownPreview')
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container)
    const markdown = readFileSync(resolveRepoTestDataPath('probe-tree-rich-media-edit-parity.md'), 'utf8')
    const panelChanges: Array<{ text?: string }> = []
    const model = {
      panelTextEditable: true,
      panelDisplayText: markdown,
      panelMarkdownDocumentPath: '/fixtures/probe-tree-rich-media-edit-parity.md',
      setPanelDraftText: () => void 0,
    } as unknown as RichMediaPanelModel
    const props = {
      title: 'Probe-Tree Branches',
      url: '',
      kind: 'iframe',
      onPanelChange: next => {
        panelChanges.push(next)
      },
    } as RichMediaPanelProps

    await mountReactRoot(
      root,
      <RichMediaPanelWorkspaceViewerSurface model={model} props={props} />,
      { window: dom.window, frames: 24 },
    )

    const question = Array.from(container.querySelectorAll('p[data-start-line]') as NodeListOf<HTMLElement>)
      .find(element => String(element.textContent || '').includes('For SGD800预算'))
    if (!question) throw new Error(`expected production-shaped Probe-Tree question, html=${container.innerHTML}`)
    question.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 42,
      width: 400,
      height: 42,
      toJSON: () => ({}),
    } as DOMRect)
    question.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
    }))
    await waitForTasks(2)
    await waitForFrames(dom.window, 2)

    const editor = question.querySelector('[contenteditable="true"]') as HTMLElement | null
    const strong = editor?.querySelector('strong')
    if (!editor || !strong) throw new Error(`expected rendered question editor, html=${question.innerHTML}`)
    const editedQuestion = 'What is the most impactful missing variable for this sourcing decision?'
    strong.textContent = editedQuestion
    editor.dispatchEvent(new dom.window.InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: editedQuestion,
    }))
    await waitForTasks(4)
    await waitForFrames(dom.window, 2)
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      ctrlKey: true,
    }))
    await waitForTasks(8)
    await waitForFrames(dom.window, 4)

    const committedQuestion = Array.from(container.querySelectorAll('strong') as NodeListOf<HTMLElement>)
      .find(element => String(element.textContent || '').includes(editedQuestion))
    if (container.querySelector('[contenteditable="true"][aria-label="Edit markdown block"]')) {
      throw new Error('expected the committed question to return to the Viewer surface')
    }
    if (!committedQuestion?.closest('li[data-kg-list-item-index="0"]')) {
      throw new Error(`expected the committed question to remain visible in its first ordered-list row while parent persistence catches up, html=${container.innerHTML}`)
    }
    if (!panelChanges.at(-1)?.text?.includes(`1. **${editedQuestion}**`)) {
      throw new Error(`expected the parent persistence payload to preserve the ordered-list marker, got ${JSON.stringify(panelChanges)}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restore()
  }
}

export async function testRichMediaWorkspaceViewerCommitsListOptionAgainstCanonicalText() {
  const { dom, restore } = initJsdomHarness()
  try {
    await import('@/features/markdown/ui/MarkdownPreview')
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container)
    const markdown = readFileSync(resolveRepoTestDataPath('probe-tree-rich-media-edit-parity.md'), 'utf8')
    const panelChanges: Array<{ text?: string }> = []
    const model = {
      panelTextEditable: true,
      panelDisplayText: markdown,
      panelMarkdownDocumentPath: '/fixtures/probe-tree-rich-media-edit-parity.md',
      setPanelDraftText: () => void 0,
    } as unknown as RichMediaPanelModel
    const props = {
      title: 'Probe-Tree Branches',
      url: '',
      kind: 'iframe',
      onPanelChange: next => {
        panelChanges.push(next)
      },
    } as RichMediaPanelProps

    await mountReactRoot(
      root,
      <RichMediaPanelWorkspaceViewerSurface model={model} props={props} />,
      { window: dom.window, frames: 24 },
    )

    const originalOption = '优先批发库存以实现规模效应，虽成本稍高但单品稳定，利于首月稳定供货'
    const editedOption = originalOption.replace('成本', '成x本')
    const option = Array.from(container.querySelectorAll('li[data-kg-list-item-index]') as NodeListOf<HTMLElement>)
      .find(element => String(element.textContent || '').trim() === originalOption)
    if (!option) throw new Error(`expected production-shaped Probe-Tree list option, html=${container.innerHTML}`)
    const optionLine = option.querySelector('[data-start-line]') as HTMLElement | null
    if (!optionLine) throw new Error(`expected editable list option line, html=${option.innerHTML}`)
    optionLine.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 42,
      width: 400,
      height: 42,
      toJSON: () => ({}),
    } as DOMRect)
    optionLine.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
    }))
    await waitForTasks(2)
    await waitForFrames(dom.window, 2)

    const editor = optionLine.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error(`expected rendered list option editor, html=${option.innerHTML}`)
    editor.textContent = editedOption
    editor.dispatchEvent(new dom.window.InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: 'x',
    }))
    await waitForTasks(4)
    await waitForFrames(dom.window, 2)
    if (panelChanges.length !== 0) {
      throw new Error(`expected transient viewer parity before commit, got ${JSON.stringify(panelChanges)}`)
    }
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      ctrlKey: true,
    }))
    await waitForTasks(8)
    await waitForFrames(dom.window, 4)

    if (container.querySelector('[contenteditable="true"][aria-label="Edit markdown block"]')) {
      throw new Error('expected the committed list option to return to the Viewer surface')
    }
    if (!Array.from(container.querySelectorAll('li[data-kg-list-item-index]') as NodeListOf<HTMLElement>)
      .some(element => String(element.textContent || '').trim() === editedOption)) {
      throw new Error(`expected the committed list option to remain visible while parent persistence catches up, html=${container.innerHTML}`)
    }
    if (!panelChanges.at(-1)?.text?.includes(`   1. ${editedOption}`)) {
      throw new Error(`expected the parent persistence payload to commit the list option against canonical markdown, got ${JSON.stringify(panelChanges)}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restore()
  }
}

export async function testRichMediaWorkspaceViewerRevealsCanonicalProvenanceSelection() {
  const { dom, restore } = initJsdomHarness()
  try {
    await import('@/features/markdown/ui/MarkdownPreview')
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container)
    const markdown = readFileSync(resolveRepoTestDataPath('probe-tree-rich-media-edit-parity.md'), 'utf8')
    const model = {
      panelTextEditable: true,
      panelDisplayText: markdown,
      panelMarkdownDocumentPath: '/fixtures/probe-tree-rich-media-edit-parity.md',
      setPanelDraftText: () => void 0,
    } as unknown as RichMediaPanelModel
    const props = {
      overlayId: 'source-rich-media',
      title: 'Probe-Tree Branches',
      url: '',
      kind: 'iframe',
    } as RichMediaPanelProps

    await mountReactRoot(
      root,
      <RichMediaPanelWorkspaceViewerSurface model={model} props={props} />,
      { window: dom.window, frames: 24 },
    )
    emitStoryboardCardProvenanceFocus({
      sourceNodeId: 'source-rich-media',
      edgeId: 'selection-source-target',
      documentPath: '/fixtures/probe-tree-rich-media-edit-parity.md',
      selectedText: '优先批发库存以实现规模效应',
      startLine: 15,
      endLine: 15,
    })
    await waitForTasks(2)
    await waitForFrames(dom.window, 4)

    const focusedViewer = container.querySelector(
      '[data-kg-provenance-focus-edge-id="selection-source-target"]',
    ) as HTMLElement | null
    if (!focusedViewer
      || focusedViewer.dataset.kgProvenanceFocusSourceNodeId !== 'source-rich-media'
      || focusedViewer.dataset.kgProvenanceFocusStartLine !== '15'
      || focusedViewer.dataset.kgProvenanceFocusEndLine !== '15') {
      throw new Error(`expected the source Viewer to expose the activated canonical provenance, html=${container.innerHTML}`)
    }
    const highlightedBlock = container.querySelector(
      '.kg-semantic-highlight-markdown-text-highlight[data-start-line][data-end-line]',
    ) as HTMLElement | null
    const highlightedStart = Number(highlightedBlock?.dataset.startLine)
    const highlightedEnd = Number(highlightedBlock?.dataset.endLine)
    if (!highlightedBlock || highlightedStart > 15 || highlightedEnd < 15) {
      throw new Error(`expected the canonical provenance line to be visibly highlighted, html=${container.innerHTML}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restore()
  }
}
