import React from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT,
  MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT,
  MARKDOWN_DATA_VIEW_TABLE_CELL_PREVIEW_CHAR_LIMIT,
  MarkdownDataViewTableView,
} from '@/features/markdown/ui/MarkdownDataViewTableView'
import type { MarkdownDataView } from '@/features/markdown/ui/markdownDataViewModel'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testMarkdownDataViewInlineEditLargeTablesRenderProgressiveRowWindow() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const totalRows = MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT + MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT + 3
    const view: MarkdownDataView = {
      columns: [
        { id: 'c1', name: 'Name', kind: 'text' },
        { id: 'c2', name: 'Description', kind: 'text' },
      ],
      rows: Array.from({ length: totalRows }, (_, index) => ({
        id: `r${index + 1}`,
        cells: [`Row ${index + 1}`, `Description ${index + 1}`],
      })),
      titleColumnId: 'c1',
      groupByColumnId: null,
    }

    const root = createRoot(container)
    root.render(
      <MarkdownDataViewTableView
        view={view}
        canMutate
        onUpdateCell={() => {}}
      />,
    )
    await tick()
    await tick()

    let renderedRows = Array.from(dom.window.document.querySelectorAll('tbody tr')) as HTMLElement[]
    const initialDataRows = renderedRows.filter(row => String(row.textContent || '').includes('Row ')).length
    if (initialDataRows !== MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT) {
      throw new Error(`expected initial progressive row window ${MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT}, got ${initialDataRows}`)
    }
    if (String(container.textContent || '').includes(`Row ${totalRows}`)) {
      throw new Error('expected rows beyond the initial window not to be mounted')
    }

    const showMoreButton = (Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[])
      .find(button => String(button.textContent || '').includes('more rows')) as HTMLButtonElement | null
    if (!showMoreButton) throw new Error('expected show-more rows control for large data view')
    showMoreButton.click()
    await tick()
    await tick()

    renderedRows = Array.from(dom.window.document.querySelectorAll('tbody tr')) as HTMLElement[]
    const nextDataRows = renderedRows.filter(row => String(row.textContent || '').includes('Row ')).length
    const expectedNextRows = MARKDOWN_DATA_VIEW_TABLE_INITIAL_RENDER_ROW_LIMIT + MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT
    if (nextDataRows !== expectedNextRows) {
      throw new Error(`expected progressive row window ${expectedNextRows}, got ${nextDataRows}`)
    }
    if (!String(container.textContent || '').includes(`Row ${expectedNextRows}`)) {
      throw new Error('expected show-more control to mount the next row window')
    }
    if (String(container.textContent || '').includes(`Row ${totalRows}`)) {
      throw new Error('expected final rows to remain unmounted until requested')
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownDataViewTableRendersMarkdownImageCellsAsThumbnails() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const view: MarkdownDataView = {
      columns: [
        { id: 'c1', name: 'Time', kind: 'text' },
        { id: 'c2', name: 'Frame (Thumbnail)', kind: 'text' },
      ],
      rows: [
        { id: 'r1', cells: ['0:00', '![Frame 0 thumbnail](/__video_frame?url=https%3A%2F%2Fexample.test%2Fwatch%3Fv%3Dabc&time=0&format=png)'] },
      ],
      titleColumnId: 'c1',
      groupByColumnId: null,
    }

    const root = createRoot(container)
    root.render(
      <MarkdownDataViewTableView
        view={view}
        canMutate={false}
        onUpdateCell={() => {}}
      />,
    )
    await tick()
    await tick()

    const thumbnail = dom.window.document.querySelector('tbody img[alt="Frame 0 thumbnail"]') as HTMLImageElement | null
    if (!thumbnail) throw new Error('expected Markdown image table cell to render an img thumbnail')
    if (!String(thumbnail.getAttribute('src') || '').startsWith('/__video_frame?')) {
      throw new Error(`expected thumbnail src to keep frame route, got ${thumbnail.getAttribute('src')}`)
    }
    if (String(container.textContent || '').includes('![Frame 0 thumbnail]')) {
      throw new Error('expected rendered data-view thumbnail cell not to expose Markdown image source text')
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownDataViewColumnsOrientationRendersMarkdownImageCellsAsThumbnails() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const view: MarkdownDataView = {
      columns: [
        { id: 'c1', name: 'Time', kind: 'text' },
        { id: 'c2', name: 'Frame (Thumbnail)', kind: 'text' },
      ],
      rows: [
        { id: 'r1', cells: ['0:00', '![Frame 0 thumbnail](/__video_frame?url=https%3A%2F%2Fexample.test%2Fwatch%3Fv%3Dabc&time=0&format=png)'] },
      ],
      titleColumnId: 'c1',
      groupByColumnId: null,
    }

    const root = createRoot(container)
    root.render(
      <MarkdownDataViewTableView
        view={view}
        canMutate={false}
        onUpdateCell={() => {}}
        orientation="columns"
      />,
    )
    await tick()
    await tick()

    const thumbnail = dom.window.document.querySelector('tbody img[alt="Frame 0 thumbnail"]') as HTMLImageElement | null
    if (!thumbnail) throw new Error('expected columns-oriented data view to render Markdown image thumbnail')

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownDataViewTableRendersNestedMarkdownTablesInsideCells() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const nestedValue = [
      '| Shot | Media |',
      '| --- | --- |',
      '| Source | imageUrl |',
      '| Runtime | videoUrl |',
    ].join('\n')
    const view: MarkdownDataView = {
      columns: [
        { id: 'c1', name: 'Name', kind: 'text' },
        { id: 'c2', name: 'Nested', kind: 'text' },
      ],
      rows: [
        { id: 'r1', cells: ['Alpha', nestedValue] },
      ],
      titleColumnId: 'c1',
      groupByColumnId: null,
    }

    const root = createRoot(container)
    root.render(
      <MarkdownDataViewTableView
        view={view}
        canMutate={false}
        onUpdateCell={() => {}}
      />,
    )
    await tick()
    await tick()

    const nestedTable = dom.window.document.querySelector('table[aria-label="Nested table cell"]')
    if (!(nestedTable instanceof dom.window.HTMLTableElement)) {
      throw new Error('expected nested Markdown table cell to render a semantic nested table')
    }
    if (!String(nestedTable.textContent || '').includes('Runtime') || !String(nestedTable.textContent || '').includes('videoUrl')) {
      throw new Error(`expected nested table content to render inside the cell, got ${nestedTable.textContent}`)
    }
    if (String(container.textContent || '').includes('| --- | --- |')) {
      throw new Error('expected nested table delimiter source not to leak into the rendered cell')
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownDataViewTableRendersInlineMediaCellsWithSharedChipToggle() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const mediaUrl = 'https://media.example.test/runtime/table-frame.mp4'
    const view: MarkdownDataView = {
      columns: [
        { id: 'c1', name: 'Name', kind: 'text' },
        { id: 'c2', name: 'mediaUrl', kind: 'text' },
      ],
      rows: [
        { id: 'r1', cells: ['Alpha', `mediaUrl: ${mediaUrl}`] },
      ],
      titleColumnId: 'c1',
      groupByColumnId: null,
    }

    const root = createRoot(container)
    root.render(
      <MarkdownDataViewTableView
        view={view}
        canMutate={false}
        onUpdateCell={() => {}}
      />,
    )
    await tick()
    await tick()

    const mediaCell = dom.window.document.querySelector('[data-kg-markdown-data-view-rich-media-cell="1"]')
    if (!(mediaCell instanceof dom.window.HTMLElement)) {
      throw new Error('expected media table cell to render the shared inline media wrapper')
    }
    if (mediaCell.getAttribute('data-kg-markdown-data-view-rich-media-mode') !== 'chip') {
      throw new Error('expected media table cell to default to the shared inline media chip')
    }
    const chip = mediaCell.querySelector('[data-kg-card-inline-media-pill="1"]') as HTMLElement | null
    if (!chip) throw new Error('expected media table cell to reuse the shared Card inline media chip')
    const toggle = mediaCell.querySelector('[data-kg-card-inline-media-toggle="1"]') as HTMLButtonElement | null
    if (!toggle) throw new Error('expected media table cell to expose the shared full-media toggle')

    toggle.click()
    await tick()
    await tick()

    const panel = mediaCell.querySelector('[data-kg-rich-media-panel="1"]')
    if (!(panel instanceof dom.window.HTMLElement)) {
      throw new Error('expected expanded media table chip to mount RichMediaPanel')
    }
    const video = mediaCell.querySelector('video[data-kg-card-media-kind="video"]') as HTMLVideoElement | null
    if (!video) throw new Error('expected RichMediaPanel table cell to render a video media surface')
    const videoSrc = String(video.getAttribute('src') || '')
    const proxiedUrl = new dom.window.URL(videoSrc, 'http://localhost')
    const resolvedMediaUrl = proxiedUrl.pathname === '/__fetch_remote'
      ? String(proxiedUrl.searchParams.get('url') || '')
      : videoSrc
    if (resolvedMediaUrl !== mediaUrl) {
      throw new Error(`expected video cell to preserve media URL through RichMediaPanel, got ${videoSrc}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownDataViewInlineEditLongTextCellsRenderBoundedPreviewAndEditFullValue() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const longValue = `Long cell ${'description '.repeat(80)}end`
    const view: MarkdownDataView = {
      columns: [
        { id: 'c1', name: 'Name', kind: 'text' },
        { id: 'c2', name: 'Description', kind: 'text' },
      ],
      rows: [
        { id: 'r1', cells: ['Alpha', longValue] },
      ],
      titleColumnId: 'c1',
      groupByColumnId: null,
    }
    const updates: Array<{ rowId: string; columnId: string; nextValue: string }> = []
    const root = createRoot(container)
    root.render(
      <MarkdownDataViewTableView
        view={view}
        canMutate
        onUpdateCell={(args) => {
          updates.push(args)
        }}
      />,
    )
    await tick()
    await tick()

    const cells = Array.from(dom.window.document.querySelectorAll('tbody td')) as HTMLTableCellElement[]
    const longCell = cells.find(td => String(td.textContent || '').includes('Long cell')) || null
    if (!longCell) throw new Error('expected long text cell')
    const renderedText = String(longCell.textContent || '')
    if (renderedText.length > MARKDOWN_DATA_VIEW_TABLE_CELL_PREVIEW_CHAR_LIMIT + 3) {
      throw new Error(`expected bounded read-cell preview text, got length ${renderedText.length}`)
    }
    if (renderedText === longValue) {
      throw new Error('expected read-cell preview not to mount the full long value')
    }

    longCell.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    await tick()

    const editor = longCell.querySelector('textarea[aria-label="Edit Description"]') as HTMLTextAreaElement | null
    if (!editor) throw new Error('expected shared textarea editor for long text cell')
    if (String(editor.value || '') !== longValue) {
      throw new Error('expected long text cell editor to receive the full underlying value')
    }

    editor.value = `${longValue} updated`
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' updated' }))
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', ctrlKey: true }))
    await tick()
    await tick()

    const last = updates[updates.length - 1] || null
    if (!last || last.rowId !== 'r1' || last.columnId !== 'c2' || last.nextValue !== `${longValue} updated`) {
      throw new Error(`unexpected long text commit payload: ${JSON.stringify(last)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownDataViewInlineEditAppliesDensityClassesFromViewControls() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const view: MarkdownDataView = {
      columns: [
        { id: 'c1', name: 'Name', kind: 'text' },
        { id: 'c2', name: 'Notes', kind: 'text' },
      ],
      rows: [
        { id: 'r1', cells: ['Alpha', 'This is a longer note that should stay readable across two preview lines.'] },
      ],
      titleColumnId: 'c1',
      groupByColumnId: null,
    }

    const root = createRoot(container)
    root.render(
      <MarkdownDataViewTableView
        view={view}
        canMutate
        onUpdateCell={() => {}}
        rowHeightPreset="compact"
        fieldLineMode="double"
      />,
    )
    await tick()
    await tick()

    const noteCell = (Array.from(dom.window.document.querySelectorAll('tbody td')) as HTMLTableCellElement[]).find(td =>
      String(td.textContent || '').includes('longer note'),
    ) || null
    if (!noteCell) throw new Error('expected note cell')
    if (!noteCell.className.includes('agentic-base-data-density-compact')) {
      throw new Error(`expected shared Base row-height class, got ${noteCell.className}`)
    }

    const noteValue = noteCell.querySelector('span')
    if (!noteValue) throw new Error('expected note preview span')
    if (!noteValue.className.includes('line-clamp-2')) {
      throw new Error(`expected field-line clamp class, got ${noteValue.className}`)
    }
    if (noteValue.className.includes('truncate')) {
      throw new Error('expected double-line field mode not to use single-line truncation')
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownDataViewInlineEditTextCellPreservesTdSurfaceAndCommits() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const view: MarkdownDataView = {
      columns: [
        { id: 'c1', name: 'Name', kind: 'text' },
        { id: 'c2', name: 'Notes', kind: 'text' },
      ],
      rows: [
        { id: 'r1', cells: ['Alpha', 'One'] },
        { id: 'r2', cells: ['Beta', 'Two'] },
      ],
      titleColumnId: 'c1',
      groupByColumnId: null,
    }

    const updates: Array<{ rowId: string; columnId: string; nextValue: string }> = []

    const root = createRoot(container)
    root.render(
      <MarkdownDataViewTableView
        view={view}
        canMutate
        onUpdateCell={(args) => {
          updates.push(args)
        }}
      />,
    )
    await tick()
    await tick()

    const cells = Array.from(dom.window.document.querySelectorAll('tbody td')) as HTMLTableCellElement[]
    const targetTd = cells.find(td => String(td.textContent || '').includes('Alpha')) || null
    if (!targetTd) throw new Error('expected Alpha cell')

    const classBefore = targetTd.className
    targetTd.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    await tick()

    if (targetTd.className !== classBefore) {
      throw new Error('expected td surface classes to remain stable when entering edit')
    }

    const editor = targetTd.querySelector('textarea[aria-label="Edit Name"]') as HTMLTextAreaElement | null
    if (!editor) throw new Error('expected shared textarea inline editor')

    editor.value = 'Alpha updated'
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' updated' }))
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', ctrlKey: true }))
    await tick()
    await tick()

    const last = updates[updates.length - 1] || null
    if (!last) throw new Error('expected an update commit')
    if (last.rowId !== 'r1' || last.columnId !== 'c1' || last.nextValue !== 'Alpha updated') {
      throw new Error(`unexpected commit payload: ${JSON.stringify(last)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownDataViewTableInlineEditorReusesSharedAtMediaCommands() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const view: MarkdownDataView = {
      columns: [
        { id: 'c1', name: 'Name', kind: 'text' },
        { id: 'c2', name: 'Media', kind: 'text' },
      ],
      rows: [
        { id: 'r1', cells: ['Alpha', 'videoUrl: https://media.example.test/runtime/table-frame.mp4'] },
      ],
      titleColumnId: 'c1',
      groupByColumnId: null,
    }

    const root = createRoot(container)
    root.render(
      <MarkdownDataViewTableView
        view={view}
        canMutate
        onUpdateCell={() => {}}
      />,
    )
    await tick()
    await tick()

    const alphaCell = (Array.from(dom.window.document.querySelectorAll('tbody td')) as HTMLTableCellElement[])
      .find(td => String(td.textContent || '').includes('Alpha')) || null
    if (!alphaCell) throw new Error('expected editable Alpha cell')
    alphaCell.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    await tick()

    const editor = alphaCell.querySelector('textarea[aria-label="Edit Name"]') as HTMLTextAreaElement | null
    if (!editor) throw new Error('expected shared textarea editor for data-view table cell')
    editor.focus()
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Digit2',
      key: '2',
      shiftKey: true,
    }))
    await tick()
    await tick()

    const menu = dom.window.document.querySelector('section[aria-label="Card variable commands"]')
    if (!(menu instanceof dom.window.HTMLElement)) {
      throw new Error('expected Workspace data-view table cell to open shared @ variable commands')
    }
    const mediaCommand = (Array.from(menu.querySelectorAll('button')) as HTMLButtonElement[]).find(button => {
      const text = String(button.textContent || '')
      return text.includes('Video: table-frame.mp4') && text.includes('https://media.example.test/runtime/table-frame.mp4')
    })
    if (!(mediaCommand instanceof dom.window.HTMLButtonElement)) {
      throw new Error(`expected row media URL to appear in shared @ media commands, got ${menu.textContent}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}
