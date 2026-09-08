import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testMarkdownPreviewRendersHtmlGridAndPreCodeBlocks() {
  const rendererSource = readFileSync(resolve(process.cwd(), 'src/features/markdown/ui/MarkdownTokenRenderer.tsx'), 'utf8')
  if (!rendererSource.includes("MARKDOWN_IMAGE_GRID_BASE_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-3 items-start'") || !rendererSource.includes('resolveMarkdownImageGridColumnClassName(images.length)') || rendererSource.includes('grid grid-cols-1') || rendererSource.includes("images.length >= 6 ? 'sm:grid-cols-3 lg:grid-cols-4'")) {
    throw new Error('expected Markdown image grids to use the renderer-owned mobile-first responsive helper')
  }
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    const markdownText = [
      '<section style="display:grid;grid-template-columns:1fr 2fr;gap:8px">',
      '  <section>Left</section>',
      '  <section>Right</section>',
      '</section>',
      '',
      '<section class="grid grid-cols-2 gap-4">',
      '  <section>GridCol1</section>',
      '  <section>GridCol2</section>',
      '</section>',
      '',
      '<section class="grid grid-cols-[1fr_2fr] gap-[8px]">',
      '  <section>ArbLeft</section>',
      '  <section>ArbRight</section>',
      '</section>',
      '',
      '<section class="grid grid-cols-4 gap-2">',
      '  <section class="col-span-full">FullRow</section>',
      '  <section class="col-start-2 col-end-4">MiddleSpan</section>',
      '</section>',
      '',
      '<section class="grid-cols-2 gap-4">',
      '  <section>ImplicitGridCol1</section>',
      '  <section>ImplicitGridCol2</section>',
      '</section>',
      '',
      '<ul class="grid grid-cols-2 gap-4">',
      '  <li>ListCol1</li>',
      '  <li>ListCol2</li>',
      '</ul>',
      '',
      '<section class="grid md:grid-cols-2 gap-6">',
      '  <section>RespCol1</section>',
      '  <section>RespCol2</section>',
      '</section>',
      '',
      '<section class="flex">',
      '  <section class="flex-1">FlexGrow</section>',
      '  <section class="flex-none">FlexNone</section>',
      '</section>',
      '',
      '<section class="max-w-2xl">MaxW2xl</section>',
      '',
      '<!--$-->',
      '',
      '![Img1](https://example.com/a.webp)',
      '',
      '<!--/$-->',
      '',
      '<!--$-->',
      '',
      '![Img2](https://example.com/b.webp)',
      '',
      '<!--/$-->',
      '',
      '<section style="column-count:2;column-gap:16px">',
      '  <section>ColumnA</section>',
      '  <section>ColumnB</section>',
      '</section>',
      '',
      '<table style="table-layout:fixed;border-collapse:collapse">',
      '  <colgroup>',
      '    <col style="width:25%" />',
      '    <col style="width:75%" />',
      '  </colgroup>',
      '  <thead><tr><th colspan="2">Head</th></tr></thead>',
      '  <tbody>',
      '    <tr><td rowspan="2" style="width:25%">A</td><td style="width:75%">B1</td></tr>',
      '    <tr><td>B2</td></tr>',
      '  </tbody>',
      '</table>',
      '',
      '<pre><code>line1\\nline2</code></pre>',
      '',
    ].join('\n')

    root.render(
      React.createElement(MarkdownPreview, {
        markdownText,
        activeDocumentPath: '/test.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownViewerMediaMode: 'image',
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        previewOverlayScope: 'container',
        previewOverlayPortalTarget: null,
        previewScrollable: false,
        showSidebar: false,
      }),
    )

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: () => void) => number }
    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (raf) {
          raf(() => resolve())
          return
        }
        setTimeout(() => resolve(), 0)
      })

    for (let i = 0; i < 16; i += 1) await tick()

    const styledSections = Array.from(container.querySelectorAll('section[style]')) as unknown as HTMLElement[]
    const grid = styledSections.find(el => /display:\s*grid/i.test(String(el.getAttribute('style') || '')))
    if (!grid) throw new Error('expected grid container to be rendered with display:grid')
    const styleAttr = String(grid.getAttribute('style') || '')
    if (!/display:\s*grid/i.test(styleAttr)) throw new Error(`expected grid style to be preserved, got: ${styleAttr}`)
    if (!/grid-template-columns/i.test(styleAttr)) throw new Error(`expected grid-template-columns to be preserved, got: ${styleAttr}`)

    const classGrid = styledSections.find(el => /grid-template-columns:\s*repeat\(2/i.test(String(el.getAttribute('style') || '')))
    if (!classGrid) throw new Error('expected grid-cols-2 to be derived into grid-template-columns')
    if (!/display:\s*grid/i.test(String(classGrid.getAttribute('style') || ''))) {
      throw new Error('expected derived grid-cols-* container to also infer display:grid')
    }

    const implicitGrid = styledSections.find(
      el =>
        /grid-template-columns:\s*repeat\(2/i.test(String(el.getAttribute('style') || '')) &&
        String(el.textContent || '').includes('ImplicitGridCol1'),
    )
    if (!implicitGrid) throw new Error('expected grid-cols-2 without grid class to render as a grid')
    if (!/display:\s*grid/i.test(String(implicitGrid.getAttribute('style') || ''))) {
      throw new Error('expected grid-cols-2 without grid class to infer display:grid')
    }
    const listGrid = (Array.from(container.querySelectorAll('ul[style],ol[style]')) as unknown as HTMLElement[])
      .find(el => /grid-template-columns:\s*repeat\(2/i.test(String(el.getAttribute('style') || '')))
    if (!listGrid) throw new Error('expected ul.grid-cols-2 to derive grid-template-columns')

    const pre = container.querySelector('pre')
    if (!pre) throw new Error('expected pre to be rendered')
    const preText = String(pre.textContent || '')
    if (!preText.includes('line1') || !preText.includes('line2')) throw new Error('expected pre text to include code lines')

    const imageGrid = container.querySelector('[data-kg-image-grid="1"]')
    if (!imageGrid) throw new Error('expected consecutive markdown images to be grouped into a grid')
    const gridImgs = imageGrid.querySelectorAll('img')
    if (gridImgs.length !== 2) throw new Error(`expected 2 images in the grid, got ${gridImgs.length}`)

    const styledSections2 = Array.from(container.querySelectorAll('section[style]')) as unknown as HTMLElement[]
    const columns = styledSections2.find(el => /column-count:\s*2/i.test(String(el.getAttribute('style') || '')))
    if (!columns) throw new Error('expected column-count container to be rendered')

    const arbGrid = styledSections.find(
      el =>
        String(el.textContent || '').includes('ArbLeft') &&
        /grid-template-columns/i.test(String(el.getAttribute('style') || '')),
    )
    if (!arbGrid) throw new Error('expected arbitrary grid-cols-[...] to render')
    const arbStyle = String(arbGrid.getAttribute('style') || '')
    if (!/grid-template-columns:\s*1fr 2fr/i.test(arbStyle)) {
      throw new Error(`expected arbitrary grid-template-columns to be applied, got: ${arbStyle}`)
    }
    if (!/gap:\s*8px/i.test(arbStyle)) {
      throw new Error(`expected arbitrary gap to be applied, got: ${arbStyle}`)
    }

    const flexGrow = styledSections.find(
      el =>
        String(el.textContent || '').includes('FlexGrow') &&
        /flex:\s*1 1 0%/i.test(String(el.getAttribute('style') || '')),
    )
    if (!flexGrow) throw new Error('expected flex-1 to be derived into flex style')

    const maxW2xl = styledSections.find(
      el =>
        String(el.textContent || '').includes('MaxW2xl') &&
        /max-width:\s*42rem/i.test(String(el.getAttribute('style') || '')),
    )
    if (!maxW2xl) throw new Error('expected max-w-2xl to be derived into max-width:42rem')

    const spanGrid = styledSections.find(
      el =>
        String(el.textContent || '').includes('FullRow') &&
        /grid-template-columns/i.test(String(el.getAttribute('style') || '')),
    )
    if (!spanGrid) throw new Error('expected col-span-full grid container to render')
    const spanStyle = String(spanGrid.getAttribute('style') || '')
    if (!/grid-template-columns:\s*repeat\(4/i.test(spanStyle)) {
      throw new Error(`expected grid-cols-4 to be applied, got: ${spanStyle}`)
    }

    const table = container.querySelector('table')
    if (!table) throw new Error('expected html table to be rendered')
    const tableStyle = String(table.getAttribute('style') || '')
    if (!/table-layout:\s*fixed/i.test(tableStyle)) throw new Error(`expected table-layout:fixed to be preserved, got: ${tableStyle}`)
    if (!/border-collapse:\s*collapse/i.test(tableStyle)) {
      throw new Error(`expected border-collapse:collapse to be preserved, got: ${tableStyle}`)
    }
    const th = table.querySelector('th')
    if (!th || String(th.getAttribute('colspan') || '') !== '2') throw new Error('expected th colspan=2 to be preserved')
    const tdRowspan = Array.from(table.querySelectorAll('td')).find(el => String((el as HTMLElement).getAttribute('rowspan') || '') === '2')
    if (!tdRowspan) throw new Error('expected td rowspan=2 to be preserved')
    const cols = table.querySelectorAll('col')
    if (cols.length < 2) throw new Error('expected colgroup/col to be preserved')
    const colStyle = String(cols[0]?.getAttribute('style') || '')
    if (!/width:\s*25%/i.test(colStyle)) throw new Error(`expected col width style to be preserved, got: ${colStyle}`)

  } finally {
    try { root?.unmount() } finally { restoreDom() }
  }
}
