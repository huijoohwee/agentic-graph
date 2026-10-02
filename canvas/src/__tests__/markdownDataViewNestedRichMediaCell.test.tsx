import React from 'react'
import { Simulate } from 'react-dom/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownDataViewTableView } from '@/features/markdown/ui/MarkdownDataViewTableView'
import type { MarkdownDataView } from '@/features/markdown/ui/markdownDataViewModel'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testMarkdownDataViewNestedTableMediaCellsUseSharedInlineChipToggle() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const mediaUrl = 'https://media.example.test/runtime/nested-table-frame.mp4'
    const nestedValue = [
      '| Field | Value |',
      '| --- | --- |',
      `| mediaUrl | ${mediaUrl} |`,
      '| label | Runtime frame |',
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
      throw new Error('expected nested table to render')
    }
    const mediaChip = nestedTable.querySelector('[data-kg-card-inline-media-pill="1"]') as HTMLElement | null
    if (!mediaChip) throw new Error(`expected nested media cell to reuse shared inline media chip, html=${container.innerHTML}`)
    if (String(mediaChip.textContent || '').includes(mediaUrl)) {
      throw new Error('expected nested media chip not to render the raw URL as table text')
    }
    const toggle = mediaChip.querySelector('[data-kg-card-inline-media-toggle="1"]') as HTMLButtonElement | null
    if (!toggle) throw new Error('expected nested media chip to expose shared full-media toggle')

    Simulate.click(toggle)
    await tick()
    await tick()

    const expanded = nestedTable.querySelector('[data-kg-card-inline-media-expanded="1"]') as HTMLElement | null
    if (!expanded) throw new Error(`expected nested media chip to expand inside the table cell, html=${container.innerHTML}`)
    const panel = expanded.querySelector('[data-kg-rich-media-panel="1"]')
    if (!(panel instanceof dom.window.HTMLElement)) {
      throw new Error('expected expanded nested media cell to reuse RichMediaPanel')
    }
    const video = expanded.querySelector('video[data-kg-card-media-kind="video"]') as HTMLVideoElement | null
    if (!video) throw new Error('expected expanded nested media cell to render video through RichMediaPanel')

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownDataViewSourceLineNestedTablesRenderInRowsAndColumns() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const view: MarkdownDataView = {
      columns: [
        { id: 'content', name: 'Content', kind: 'text' },
        { id: 'line', name: 'Line', kind: 'text' },
        { id: 'indent', name: 'Indent', kind: 'text' },
      ],
      rows: [
        { id: 'r1', cells: ['# Demo', '10', '0'] },
        { id: 'r2', cells: ['| Stage | Owner |', '11', '0'] },
        { id: 'r3', cells: ['| --- | --- |', '12', '0'] },
        { id: 'r4', cells: ['| Import | Launch |', '13', '0'] },
        { id: 'r5', cells: ['| Render | Multi-dimensional Table |', '14', '0'] },
      ],
      titleColumnId: 'content',
      groupByColumnId: null,
    }

    const root = createRoot(container)
    root.render(<MarkdownDataViewTableView view={view} canMutate={false} onUpdateCell={() => {}} />)
    await tick()
    await tick()

    const sourceTable = dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')
    if (!(sourceTable instanceof dom.window.HTMLElement)) {
      throw new Error(`expected source-line Markdown table block to render as a nested table, html=${container.innerHTML}`)
    }
    if (!String(sourceTable.textContent || '').includes('Multi-dimensional Table')) {
      throw new Error(`expected nested source table to preserve row/column content, got ${sourceTable.textContent}`)
    }
    if (!String(sourceTable.textContent || '').includes('Markdown table · 2 columns · 2 rows · lines 11-14')) {
      throw new Error(`expected nested source table caption to summarize row/column layout and source lines, got ${sourceTable.textContent}`)
    }
    if (sourceTable.getAttribute('data-kg-markdown-data-view-nested-source-line-range') !== '11-14') {
      throw new Error('expected nested source table to expose the source line range')
    }
    if (String(container.textContent || '').includes('| --- | --- |')) {
      throw new Error('expected source-line nested table separator not to leak as raw body text')
    }
    const continuation = dom.window.document.querySelector('[data-kg-markdown-data-view-nested-table-continuation="1"]')
    if (!continuation) {
      throw new Error('expected continuation source rows to render as nested-table row markers')
    }
    if (!String(continuation.textContent || '').includes('Grouped row 2/4')) {
      throw new Error(`expected continuation marker to stay compact, got ${continuation.textContent}`)
    }

    root.render(<MarkdownDataViewTableView view={view} canMutate={false} onUpdateCell={() => {}} orientation="columns" />)
    await tick()
    await tick()

    const columnSourceTable = dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')
    if (!(columnSourceTable instanceof dom.window.HTMLElement)) {
      throw new Error(`expected column-pivot source-line Markdown table block to render as a nested table, html=${container.innerHTML}`)
    }
    if (!String(columnSourceTable.textContent || '').includes('Launch')) {
      throw new Error(`expected column-pivot nested source table to preserve table rows, got ${columnSourceTable.textContent}`)
    }
    if (!String(columnSourceTable.textContent || '').includes('lines 11-14')) {
      throw new Error(`expected column-pivot nested source table to retain source line range, got ${columnSourceTable.textContent}`)
    }

    const frontmatterView: MarkdownDataView = {
      columns: [
        { id: 'level', name: 'Level', kind: 'text' },
        { id: 'type', name: 'Type', kind: 'text' },
        { id: 'value', name: 'Value', kind: 'text' },
        { id: 'content', name: 'Content', kind: 'text' },
        { id: 'line', name: 'Line', kind: 'text' },
        { id: 'indent', name: 'Indent', kind: 'text' },
      ],
      rows: [
        { id: 'f0', cells: ['L1', 'mermaid_gantt', '|-', 'value: |-', '19', '2'] },
        { id: 'f1', cells: ['L2', 'mermaid_gantt', '| Field | Value |', '| Field | Value |', '20', '4'] },
        { id: 'f2', cells: ['L2', 'mermaid_gantt', '| --- | --- |', '| --- | --- |', '21', '4'] },
        { id: 'f3', cells: ['L2', 'mermaid_gantt', '| output | storyboard |', '| output | storyboard |', '22', '4'] },
        { id: 'f4', cells: ['L1', 'scalar', 'md:demo-root-leaf', 'graphId: "md:demo-root-leaf"', '23', '2'] },
      ],
      titleColumnId: 'content',
      groupByColumnId: null,
    }

    root.render(<MarkdownDataViewTableView view={frontmatterView} canMutate={false} onUpdateCell={() => {}} />)
    await tick()
    await tick()

    const frontmatterSourceTable = dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')
    if (!(frontmatterSourceTable instanceof dom.window.HTMLElement)) {
      throw new Error(`expected frontmatter source-line table block to render as a nested table, html=${container.innerHTML}`)
    }
    if (frontmatterSourceTable.getAttribute('data-kg-markdown-data-view-nested-level-depth') !== '2') {
      throw new Error('expected frontmatter nested source table to expose Level-derived depth')
    }
    if (frontmatterSourceTable.style.marginInlineStart !== '2.5rem') {
      throw new Error(`expected frontmatter nested source table to indent from Level depth, got ${frontmatterSourceTable.style.marginInlineStart}`)
    }
    if (!String(frontmatterSourceTable.textContent || '').includes('lines 20-22')) {
      throw new Error(`expected frontmatter nested source table to retain source line range, got ${frontmatterSourceTable.textContent}`)
    }
    const nestedRows = Array.from(dom.window.document.querySelectorAll('tr[data-kg-markdown-data-view-row-nested-depth="2"]'))
    if (nestedRows.length < 3) {
      throw new Error(`expected rows-as-records pivot to expose Level-derived row nesting, html=${container.innerHTML}`)
    }
    const hierarchyCells = Array.from(dom.window.document.querySelectorAll('tbody tr[data-kg-markdown-data-view-row-nested-depth="2"] td[data-kg-markdown-data-view-row-hierarchy-cell="1"]'))
      .filter((cell): cell is HTMLElement => cell instanceof dom.window.HTMLElement)
    if (hierarchyCells.length < 3 || !hierarchyCells.every(cell => cell.getAttribute('data-kg-markdown-data-view-row-hierarchy-line-depth') === '2' && cell.style.getPropertyValue('--kg-data-view-tree-depth') === '2' && !cell.style.paddingInlineStart)) {
      throw new Error('expected rows-as-records hierarchy cells to expose bounded Level-derived depth metadata without padding into text columns')
    }
    if (!hierarchyCells.every(cell => cell.className.includes('kg-data-view-tree-cell') && cell.getAttribute('data-kg-markdown-data-view-row-hierarchy-branch') === '1' && cell.style.getPropertyValue('--kg-data-view-tree-depth') === '2' && cell.querySelector('.kg-data-view-tree-cell-guide'))) {
      throw new Error('expected rows-as-records hierarchy cells to expose subtle tree guide metadata')
    }
    const rootLeafHierarchyCell = Array.from(dom.window.document.querySelectorAll('tbody td[data-kg-markdown-data-view-row-hierarchy-line-depth="1"][data-kg-markdown-data-view-row-hierarchy-branch="1"]'))
      .filter((cell): cell is HTMLElement => cell instanceof dom.window.HTMLElement)
      .find(cell => String(cell.parentElement?.textContent || '').includes('graphId: "md:demo-root-leaf"')) || null
    const rootLeafGuide = rootLeafHierarchyCell?.querySelector('.kg-data-view-tree-cell-guide') || null
    if (!rootLeafGuide || rootLeafGuide.tagName.toLowerCase() !== 'svg' || String(rootLeafGuide.textContent || '').trim() || !rootLeafGuide.querySelector('.kg-data-view-tree-cell-guide-line')) {
      throw new Error('expected root leaf rows to expose the body tree guide')
    }
    const valueCells = Array.from(dom.window.document.querySelectorAll('tbody tr[data-kg-markdown-data-view-row-nested-depth="2"] td:nth-child(4)'))
      .filter((cell): cell is HTMLElement => cell instanceof dom.window.HTMLElement)
    if (valueCells.length < 3 || valueCells.some(cell => cell.style.paddingInlineStart)) {
      throw new Error('expected rows-as-records Value cells to stay aligned while the hierarchy column owns indentation')
    }
    const nestedToggle = dom.window.document.querySelector('[data-kg-markdown-data-view-row-nested-toggle="1"]') as HTMLButtonElement | null
    if (!nestedToggle || nestedToggle.getAttribute('aria-expanded') !== 'true') {
      throw new Error('expected rows-as-records nested parent row to expose a default-expanded toggle')
    }
    if (nestedToggle.closest('.kg-data-view-tree-cell')?.querySelector('.kg-data-view-tree-cell-guide')) {
      throw new Error('expected rows-as-records parent toggle cell to keep the tree guide off the chevron row')
    }
    const treeGuideCss = readFileSync(resolve(process.cwd(), 'src/styles/markdown-data-view-table.css'), 'utf8')
    if (!treeGuideCss.includes('--kg-data-view-tree-chevron-size: var(--kg-compact-glyph-size, 0.75rem);') || !treeGuideCss.includes('--kg-data-view-tree-stroke-width: var(--kg-surface-border-width, 1px);') || !treeGuideCss.includes('--kg-data-view-tree-chevron-stroke-width: var(--kg-icon-stroke-width, 1.5);') || !treeGuideCss.includes('--kg-data-view-tree-guide-width: var(--kg-data-view-tree-stroke-width);') || !treeGuideCss.includes('--kg-data-view-tree-stroke-color: var(--kg-text-secondary, currentColor);') || !treeGuideCss.includes('--kg-data-view-tree-stroke-opacity: 0.72;') || !treeGuideCss.includes('--kg-data-view-tree-guide-color: var(--kg-data-view-tree-stroke-color);') || !treeGuideCss.includes('--kg-data-view-tree-parent-depth-offset: max(calc((var(--kg-data-view-tree-depth, 0) - 1) * var(--kg-data-view-tree-depth-step)), 0rem);') || !treeGuideCss.includes('--kg-data-view-tree-parent-chevron-center: calc(var(--kg-data-view-tree-cell-padding-inline) + var(--kg-data-view-tree-parent-control-start) + var(--kg-data-view-tree-control-icon-center));') || !treeGuideCss.includes('--kg-data-view-tree-guide-inset: var(--kg-data-view-tree-parent-chevron-center);') || !treeGuideCss.includes('.kg-data-view-tree-cell {\n  --kg-data-view-tree-parent-depth-offset') || !treeGuideCss.includes('color: var(--kg-data-view-tree-stroke-color, currentColor);') || !treeGuideCss.includes('.kg-data-view-tree-control svg {\n  color: var(--kg-data-view-tree-stroke-color, currentColor);\n  stroke: var(--kg-data-view-tree-stroke-color, currentColor);\n  stroke-opacity: var(--kg-data-view-tree-stroke-opacity);\n  stroke-width: var(--kg-data-view-tree-chevron-stroke-width);') || !treeGuideCss.includes('.kg-data-view-tree-control svg :where(path, line, polyline, polygon, circle) {\n  stroke: var(--kg-data-view-tree-stroke-color, currentColor);\n  stroke-opacity: var(--kg-data-view-tree-stroke-opacity);') || !treeGuideCss.includes('.kg-data-view-tree-control:hover') || !treeGuideCss.includes('width: var(--kg-data-view-tree-chevron-size);') || !treeGuideCss.includes('.kg-data-view-tree-cell-guide-line {\n  stroke: var(--kg-data-view-tree-stroke-color, currentColor);\n  stroke-linecap: round;\n  stroke-opacity: var(--kg-data-view-tree-stroke-opacity);\n  stroke-width: var(--kg-data-view-tree-guide-width);') || treeGuideCss.includes('text-stroke-width') || treeGuideCss.includes('vector-effect: non-scaling-stroke') || !treeGuideCss.includes('transform: translate(-50%, -50%);')) {
      throw new Error('expected body tree guide CSS to align with the parent chevron rail inside the hierarchy column')
    }
    Simulate.click(nestedToggle)
    await tick()
    await tick()
    if (nestedToggle.getAttribute('aria-expanded') !== 'false') {
      throw new Error('expected rows-as-records nested toggle to collapse descendant rows')
    }
    if (dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')) {
      throw new Error('expected collapsed rows-as-records parent to hide nested table descendants')
    }
    Simulate.click(nestedToggle)
    await tick()
    await tick()
    if (nestedToggle.getAttribute('aria-expanded') !== 'true' || !dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')) {
      throw new Error('expected rows-as-records nested toggle to restore descendant nested table rows')
    }
    const rowBulkToggle = dom.window.document.querySelector('thead [data-kg-markdown-data-view-row-nested-bulk-toggle="1"]') as HTMLButtonElement | null
    if (!rowBulkToggle || rowBulkToggle.getAttribute('aria-label') !== 'Collapse all nested rows') {
      throw new Error('expected rows-as-records hierarchy header to expose collapse-all control')
    }
    if (rowBulkToggle.querySelector('.kg-data-view-tree-guide')) {
      throw new Error('expected rows-as-records collapse-all control to sit on the rail without rendering a header guide')
    }
    Simulate.click(rowBulkToggle)
    await tick()
    await tick()
    if (rowBulkToggle.getAttribute('aria-label') !== 'Expand all nested rows' || dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')) {
      throw new Error('expected rows-as-records collapse-all control to hide descendant nested tables')
    }
    Simulate.click(rowBulkToggle)
    await tick()
    await tick()
    if (rowBulkToggle.getAttribute('aria-label') !== 'Collapse all nested rows' || !dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')) {
      throw new Error('expected rows-as-records expand-all control to restore descendant nested tables')
    }
    const frontmatterContinuation = dom.window.document.querySelector('[data-kg-markdown-data-view-nested-table-continuation="1"]')
    if (!(frontmatterContinuation instanceof dom.window.HTMLElement)) {
      throw new Error('expected frontmatter grouped source rows to render continuation markers')
    }
    if (frontmatterContinuation.getAttribute('data-kg-markdown-data-view-nested-level-depth') !== '2') {
      throw new Error('expected frontmatter continuation marker to expose Level-derived depth')
    }
    if (frontmatterContinuation.style.marginInlineStart !== '2.5rem') {
      throw new Error(`expected frontmatter continuation marker to indent from Level depth, got ${frontmatterContinuation.style.marginInlineStart}`)
    }

    root.render(<MarkdownDataViewTableView view={frontmatterView} canMutate={false} onUpdateCell={() => {}} orientation="columns" />)
    await tick()
    await tick()

    const columnHierarchyRow = dom.window.document.querySelector('tr[data-kg-markdown-data-view-column-record-hierarchy-row="1"]')
    if (!(columnHierarchyRow instanceof dom.window.HTMLElement)) {
      throw new Error(`expected columns-as-records pivot to expose a dedicated hierarchy row, html=${container.innerHTML}`)
    }
    const columnHierarchyCells = Array.from(columnHierarchyRow.querySelectorAll('td[data-kg-markdown-data-view-column-record-hierarchy-cell="1"]'))
      .filter((cell): cell is HTMLElement => cell instanceof dom.window.HTMLElement)
    if (columnHierarchyCells.length < 4 || !columnHierarchyCells.some(cell => cell.getAttribute('data-kg-markdown-data-view-row-hierarchy-line-depth') === '2' && cell.style.getPropertyValue('--kg-data-view-tree-depth') === '2' && !cell.style.paddingInlineStart)) {
      throw new Error('expected columns-as-records hierarchy cells to expose bounded Level-derived depth metadata without padding into text columns')
    }
    const deepColumnHierarchyCell = columnHierarchyCells.find(cell => cell.getAttribute('data-kg-markdown-data-view-row-hierarchy-line-depth') === '2') || null
    if (!deepColumnHierarchyCell || !deepColumnHierarchyCell.className.includes('kg-data-view-tree-cell') || deepColumnHierarchyCell.getAttribute('data-kg-markdown-data-view-row-hierarchy-branch') !== '1' || deepColumnHierarchyCell.style.getPropertyValue('--kg-data-view-tree-depth') !== '2' || !deepColumnHierarchyCell.querySelector('.kg-data-view-tree-cell-guide')) {
      throw new Error('expected columns-as-records hierarchy cells to expose subtle tree guide metadata')
    }
    const columnValueRow = Array.from(dom.window.document.querySelectorAll('tbody tr'))
      .filter((row): row is HTMLElement => row instanceof dom.window.HTMLElement)
      .find(row => String(row.querySelector('th')?.textContent || '').trim() === 'Value')
    if (!(columnValueRow instanceof dom.window.HTMLElement)) {
      throw new Error('expected columns-as-records Value field row to render')
    }
    const columnValueCells = Array.from(columnValueRow.querySelectorAll('td')).filter((cell): cell is HTMLTableCellElement => cell instanceof dom.window.HTMLTableCellElement)
    if (!columnValueCells.length || columnValueCells.some(cell => cell.style.paddingInlineStart)) {
      throw new Error('expected columns-as-records Value cells to stay aligned while the hierarchy row owns indentation')
    }
    const columnToggle = columnHierarchyRow.querySelector('[data-kg-markdown-data-view-row-nested-toggle="1"]') as HTMLButtonElement | null
    if (!columnToggle || columnToggle.getAttribute('aria-expanded') !== 'true') {
      throw new Error('expected columns-as-records nested group toggle to default expanded')
    }
    Simulate.click(columnToggle)
    await tick()
    await tick()
    if (columnToggle.getAttribute('aria-expanded') !== 'false') {
      throw new Error('expected columns-as-records nested toggle to collapse descendant record columns')
    }
    if (dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')) {
      throw new Error('expected collapsed columns-as-records parent to hide descendant nested tables')
    }
    Simulate.click(columnToggle)
    await tick()
    await tick()
    if (columnToggle.getAttribute('aria-expanded') !== 'true' || !dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')) {
      throw new Error('expected columns-as-records nested toggle to restore descendant nested table columns')
    }
    const columnBulkToggle = columnHierarchyRow.querySelector('[data-kg-markdown-data-view-row-nested-bulk-toggle="1"]') as HTMLButtonElement | null
    if (!columnBulkToggle || columnBulkToggle.getAttribute('aria-label') !== 'Collapse all nested rows') {
      throw new Error('expected columns-as-records hierarchy row to expose collapse-all control')
    }
    if (columnBulkToggle.querySelector('.kg-data-view-tree-guide')) {
      throw new Error('expected columns-as-records collapse-all control to sit on the rail without rendering a header guide')
    }
    Simulate.click(columnBulkToggle)
    await tick()
    await tick()
    if (columnBulkToggle.getAttribute('aria-label') !== 'Expand all nested rows' || dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')) {
      throw new Error('expected columns-as-records collapse-all control to hide descendant nested table columns')
    }
    Simulate.click(columnBulkToggle)
    await tick()
    await tick()
    if (columnBulkToggle.getAttribute('aria-label') !== 'Collapse all nested rows' || !dom.window.document.querySelector('[data-kg-markdown-data-view-nested-source-table="1"]')) {
      throw new Error('expected columns-as-records expand-all control to restore descendant nested table columns')
    }

    root.unmount()
  } finally {
    restore()
  }
}
