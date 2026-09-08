import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useMarkdownSourceFileDnD } from '@/features/markdown/ui/useMarkdownSourceFileDnD'

export async function testUseMarkdownSourceFileDnDCentralizesSourcePanelReorderState() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const reorderCalls: Array<{ fromId: string; toId: string }> = []
  let afterReorderCalls = 0

  function createDragEvent(type: string, target: Element, relatedTarget: Element | null = null) {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true }) as Event & {
      dataTransfer: {
        effectAllowed: string
        dropEffect: string
        store: Map<string, string>
        setData: (key: string, value: string) => void
        getData: (key: string) => string
      }
      relatedTarget: Element | null
    }
    const store = new Map<string, string>()
    event.dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      store,
      setData: (key, value) => {
        store.set(key, value)
      },
      getData: key => store.get(key) || '',
    }
    Object.defineProperty(event, 'target', { value: target, configurable: true })
    event.relatedTarget = relatedTarget
    return event
  }

  function Harness() {
    const {
      dragOverSourceFileId,
      draggingSourceFileId,
      clearDragState,
      handleDragLeave,
      handleDragOver,
      handleDragStart,
      handleDrop,
    } = useMarkdownSourceFileDnD({
      onReorderSourceFiles: (fromId, toId) => {
        reorderCalls.push({ fromId, toId })
      },
      onAfterReorderSourceFiles: () => {
        afterReorderCalls += 1
      },
    })

    return (
      <section>
        <button
          type="button"
          aria-label="blocked"
          onDragStart={event => {
            handleDragStart(event, 'blocked-file')
          }}
        >
          blocked
        </button>
        <section
          aria-label="file-a"
          draggable
          onDragStart={event => {
            handleDragStart(event, 'file-a')
          }}
          onDragOver={event => {
            handleDragOver(event, 'file-b')
          }}
          onDrop={event => {
            handleDrop(event, 'file-b')
          }}
          onDragLeave={event => {
            handleDragLeave(event, 'file-b')
          }}
          onDragEnd={clearDragState}
        />
        <span data-testid="dragging">{draggingSourceFileId || ''}</span>
        <span data-testid="drag-over">{dragOverSourceFileId || ''}</span>
      </section>
    )
  }

  try {
    await act(async () => {
      root.render(React.createElement(Harness))
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const blockedButton = container.querySelector('button[aria-label="blocked"]')
    if (!(blockedButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected blocked drag source button')
    const blockedDragStart = createDragEvent('dragstart', blockedButton)
    await act(async () => {
      blockedButton.dispatchEvent(blockedDragStart)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const draggingAfterBlocked = container.querySelector('[data-testid="dragging"]')?.textContent || ''
    if (draggingAfterBlocked !== '') throw new Error(`expected blocked interactive drag target to keep drag state empty, got ${draggingAfterBlocked}`)

    const fileRow = container.querySelector('section[aria-label="file-a"]')
    if (!(fileRow instanceof dom.window.HTMLElement)) throw new Error('expected file drag row')
    const dragStart = createDragEvent('dragstart', fileRow)
    await act(async () => {
      fileRow.dispatchEvent(dragStart)
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const draggingAfterStart = container.querySelector('[data-testid="dragging"]')?.textContent || ''
    const dragOverAfterStart = container.querySelector('[data-testid="drag-over"]')?.textContent || ''
    if (draggingAfterStart !== 'file-a' || dragOverAfterStart !== 'file-a') {
      throw new Error(`expected drag start to set file-a/file-a state, got ${draggingAfterStart}/${dragOverAfterStart}`)
    }

    const dragOver = createDragEvent('dragover', fileRow)
    dragOver.dataTransfer = dragStart.dataTransfer
    await act(async () => {
      fileRow.dispatchEvent(dragOver)
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const dragOverState = container.querySelector('[data-testid="drag-over"]')?.textContent || ''
    if (dragOverState !== 'file-b') throw new Error(`expected drag over state to become file-b, got ${dragOverState}`)

    const dragLeave = createDragEvent('dragleave', fileRow, null)
    await act(async () => {
      fileRow.dispatchEvent(dragLeave)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const dragOverAfterLeave = container.querySelector('[data-testid="drag-over"]')?.textContent || ''
    if (dragOverAfterLeave !== '') throw new Error(`expected drag leave to clear drag-over state, got ${dragOverAfterLeave}`)

    const dragOverAgain = createDragEvent('dragover', fileRow)
    dragOverAgain.dataTransfer = dragStart.dataTransfer
    await act(async () => {
      fileRow.dispatchEvent(dragOverAgain)
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const drop = createDragEvent('drop', fileRow)
    drop.dataTransfer = dragStart.dataTransfer
    await act(async () => {
      fileRow.dispatchEvent(drop)
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const firstReorder = reorderCalls[0] || null
    if (!firstReorder || firstReorder.fromId !== 'file-a' || firstReorder.toId !== 'file-b') {
      throw new Error(`expected shared source dnd hook to emit file-a -> file-b reorder, got ${JSON.stringify(reorderCalls)}`)
    }
    if (afterReorderCalls !== 1) throw new Error(`expected shared source dnd hook after-reorder callback once, got ${String(afterReorderCalls)}`)

    const draggingAfterDrop = container.querySelector('[data-testid="dragging"]')?.textContent || ''
    const dragOverAfterDrop = container.querySelector('[data-testid="drag-over"]')?.textContent || ''
    if (draggingAfterDrop !== '' || dragOverAfterDrop !== '') {
      throw new Error(`expected drop to clear drag state, got ${draggingAfterDrop}/${dragOverAfterDrop}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}
