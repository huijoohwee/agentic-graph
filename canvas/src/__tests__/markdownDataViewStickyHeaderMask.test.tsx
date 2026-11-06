import React from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownDataViewTableView } from '@/features/markdown/ui/MarkdownDataViewTableView'
import type { MarkdownDataView } from '@/features/markdown/ui/markdownDataViewModel'
import { MARKDOWN_DATA_VIEW_TABLE_STICKY_HEADER_CLASSNAME } from '@/features/markdown/ui/markdownDataViewTableClasses'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testMarkdownDataViewStickyHeadersUseOpaqueMaskClass() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="rows"></section><section id="columns"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const view: MarkdownDataView = {
      columns: [
        { id: 'key', name: 'Key', kind: 'text' },
        { id: 'type', name: 'Type', kind: 'text' },
        { id: 'value', name: 'Scalar Value', kind: 'text' },
      ],
      rows: Array.from({ length: 12 }, (_, index) => ({
        id: `r${index}`,
        cells: [`schema_${index}`, 'scalar', `value_${index}`],
      })),
      titleColumnId: 'key',
      groupByColumnId: null,
    }
    const rowsContainer = dom.window.document.getElementById('rows')
    const columnsContainer = dom.window.document.getElementById('columns')
    if (!rowsContainer || !columnsContainer) throw new Error('missing test containers')

    const rowsRoot = reactDomClient.createRoot(rowsContainer)
    const columnsRoot = reactDomClient.createRoot(columnsContainer)
    rowsRoot.render(<MarkdownDataViewTableView view={view} canMutate={false} onUpdateCell={() => {}} />)
    columnsRoot.render(<MarkdownDataViewTableView view={view} canMutate={false} onUpdateCell={() => {}} orientation="columns" />)
    await tick()
    await tick()

    const headers = Array.from(dom.window.document.querySelectorAll('thead')) as HTMLElement[]
    if (headers.length !== 2) throw new Error(`expected rows and columns table headers, got ${headers.length}`)
    for (const header of headers) {
      if (!header.className.includes(MARKDOWN_DATA_VIEW_TABLE_STICKY_HEADER_CLASSNAME)) {
        throw new Error(`expected sticky header to use shared opaque mask class, got ${header.className}`)
      }
      if (!header.className.includes('sticky top-0 z-30 isolate')) {
        throw new Error(`expected sticky header positioning contract to remain intact, got ${header.className}`)
      }
    }

    // Embedded Viewer tables scroll with their outer pane, unlike bounded Canvas grids.
    const frame = rowsContainer.querySelector('table')?.parentElement
    const header = rowsContainer.querySelector('thead')
    const table = rowsContainer.querySelector('table')
    if (!frame || !header || !table) throw new Error('missing embedded table')
    const bounds = (top: number, height: number) => ({ top, bottom: top + height, height } as DOMRect)
    rowsContainer.style.overflowY = 'auto'
    rowsContainer.style.scrollPaddingTop = '90px'
    Object.defineProperties(rowsContainer, { clientHeight: { value: 300 }, scrollHeight: { value: 900 } })
    let innerScrollHeight = 600
    Object.defineProperties(frame, { clientHeight: { value: 600 }, scrollHeight: { get: () => innerScrollHeight } })
    rowsContainer.getBoundingClientRect = () => bounds(60, 300)
    let tableBottom = 380
    let tableHeight = 500
    frame.getBoundingClientRect = () => bounds(tableBottom - tableHeight, 600)
    table.getBoundingClientRect = () => bounds(tableBottom - tableHeight, tableHeight)
    header.getBoundingClientRect = () => bounds(tableBottom - tableHeight + (Number.parseFloat(header.style.transform.replace('translateY(', '')) || 0), 40)
    const scrollPane = async () => {
      rowsContainer.dispatchEvent(new dom.window.Event('scroll'))
      await new Promise<void>(resolve => dom.window.requestAnimationFrame(() => resolve()))
    }
    await scrollPane()
    if (header.getBoundingClientRect().top !== 150) throw new Error('Viewer header must respect the pane edge and reserved sticky content')
    rowsContainer.style.scrollPaddingTop = '120px'
    await tick()
    await new Promise<void>(resolve => dom.window.requestAnimationFrame(() => resolve()))
    if (header.getBoundingClientRect().top !== 180) throw new Error('shared header must follow changed reserved space without another scroll')
    innerScrollHeight = tableHeight = 1000
    tableBottom = 880
    await scrollPane()
    if (header.getBoundingClientRect().top !== 180) throw new Error('an overflowing inner frame must also respect the outer scroll boundary')
    tableBottom = 80
    await scrollPane()
    if (header.getBoundingClientRect().bottom !== 80) throw new Error('shared header must release at the table boundary')
    if (rowsContainer.querySelectorAll('thead').length !== 1) throw new Error('sticky headers must never be cloned')
    rowsRoot.unmount()
    if (header.style.transform !== '') throw new Error('unmount must restore the original header transform')
    columnsRoot.unmount()
  } finally {
    restore()
  }
}
