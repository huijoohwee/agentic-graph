import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { readVectorPaintedOverlayPosition, readVectorPaintedOverlayScale } from '@/lib/canvas/vectorPaintedOverlayProjection'
import { startMarkdownPanelOverlayLoop2d, type MarkdownOverlayPanelLoop } from '@/features/markdown-edgeless/markdownPanelOverlayLoop2d'

export async function testMarkdownPanelOverlayUsesWorldSizeAndScaleForCardLayout() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let loop: MarkdownOverlayPanelLoop | undefined
  try {
    const root = dom.window.document.getElementById('root')
    if (!root) throw new Error('expected root container')
    const el = dom.window.document.createElement('section')
    root.appendChild(el)
    let itemReads = 0
    let items = [{ id: 'table-1', cx: 260, cy: 210, w: 520, h: 420 }]

    loop = startMarkdownPanelOverlayLoop2d({
      enabled: true,
      loop: 'onDemand',
      getItems: () => { itemReads += 1; return items },
      getViewport: () => ({ w: 960, h: 540 }),
      readTransform: () => ({
        k: 0.4,
        x: 0,
        y: 0,
        applyX: (v: number) => v * 0.4,
        applyY: (v: number) => v * 0.4,
      }) as any,
      getElementForId: id => (id === 'table-1' ? el : null),
      getDensity: () => 'default',
      getSizingConfig: () => ({ widthRatio: 0.2, widthMinPx: 210, widthMaxPx: 360 }),
      clampToViewport: null,
    })

    loop.schedule()
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    if (el.style.width !== '520px' || el.style.height !== '420px') {
      throw new Error(`expected markdown overlay panel to preserve world card size before zoom scaling, got ${el.style.width}x${el.style.height}`)
    }
    if (readVectorPaintedOverlayScale(el) !== 0.4) {
      throw new Error('expected markdown overlay panel to scale with renderer zoom')
    }
    const initialPosition = readVectorPaintedOverlayPosition(el)
    if (initialPosition?.left !== 0 || initialPosition.top !== 0) throw new Error('expected scaled panel at its projected center')
    if (itemReads !== 1) throw new Error('expected one item snapshot for sizing and placement per frame')
    if (el.style.getPropertyValue('--kg-media-panel-header-h') !== '28px') {
      throw new Error(`expected zoom-scaled world panel to avoid double-scaling shared chrome vars, got ${el.style.getPropertyValue('--kg-media-panel-header-h')}`)
    }
    if ((el as unknown as { dataset?: Record<string, string> }).dataset?.kgOverlayHasPos !== '1') {
      throw new Error('expected markdown overlay panel to remain positioned through the shared overlay loop')
    }

    items = [{ ...items[0], cx: 360 }]
    loop.schedule()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    if (Number(itemReads) !== 2 || readVectorPaintedOverlayPosition(el)?.left !== 40) {
      throw new Error('expected the next frame to observe fresh item data exactly once')
    }
    items = []
    loop.schedule()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    if (Number(itemReads) !== 3) throw new Error('expected one item read on an empty frame')
  } finally {
    loop?.stop()
    restore()
  }
}

export async function testMarkdownPanelOverlayClampUsesViewportOrigin() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let loop: MarkdownOverlayPanelLoop | undefined
  try {
    const root = dom.window.document.getElementById('root')
    if (!root) throw new Error('expected root container')
    const el = dom.window.document.createElement('section')
    root.appendChild(el)

    loop = startMarkdownPanelOverlayLoop2d({
      enabled: true,
      loop: 'onDemand',
      getItems: () => [{ id: 'panel-1', cx: 2000, cy: 220, w: 240, h: 120 }],
      getViewport: () => ({ left: 568, top: 0, w: 567, h: 962 }),
      readTransform: () => ({
        k: 1,
        x: 0,
        y: 0,
        applyX: (v: number) => v,
        applyY: (v: number) => v,
      }) as any,
      getElementForId: id => (id === 'panel-1' ? el : null),
      getDensity: () => 'default',
      getSizingConfig: () => ({ widthRatio: 0.2, widthMinPx: 210, widthMaxPx: 360 }),
      clampToViewport: { margin: 16 },
    })

    loop.schedule()
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const position = readVectorPaintedOverlayPosition(el)
    if (!position) throw new Error('expected projected panel position')
    const { left, top } = position
    if (left !== 879 || top !== 160) {
      throw new Error(`expected panel clamp to respect visible viewport origin, got left=${left} top=${top}`)
    }

  } finally {
    loop?.stop()
    restore()
  }
}

export async function testMarkdownPanelOverlayCollectiveFitSpreadsPanelsInVisibleViewport() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let loop: MarkdownOverlayPanelLoop | undefined
  try {
    const root = dom.window.document.getElementById('root')
    if (!root) throw new Error('expected root container')
    const first = dom.window.document.createElement('section')
    const second = dom.window.document.createElement('section')
    root.appendChild(first)
    root.appendChild(second)

    loop = startMarkdownPanelOverlayLoop2d({
      enabled: true,
      loop: 'onDemand',
      getItems: () => [
        { id: 'panel-a', cx: 2000, cy: 220, w: 240, h: 120 },
        { id: 'panel-b', cx: 3200, cy: 220, w: 240, h: 120 },
      ],
      getViewport: () => ({ left: 568, top: 0, w: 567, h: 962 }),
      readTransform: () => ({
        k: 1,
        x: 0,
        y: 0,
        applyX: (v: number) => v,
        applyY: (v: number) => v,
      }) as any,
      getElementForId: id => (id === 'panel-a' ? first : id === 'panel-b' ? second : null),
      getDensity: () => 'default',
      getSizingConfig: () => ({ widthRatio: 0.2, widthMinPx: 210, widthMaxPx: 360 }),
      collectiveFitToViewport: true,
      clampToViewport: { margin: 16 },
    })

    loop.schedule()
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const readLeft = (el: HTMLElement) => {
      const position = readVectorPaintedOverlayPosition(el)
      if (!position) throw new Error('expected projected panel position')
      return position.left
    }
    const leftA = readLeft(first)
    const leftB = readLeft(second)
    if (leftA < 584 || leftB > 879 || leftB - leftA < 250) {
      throw new Error(`expected collective fit to spread markdown panels inside visible viewport, got leftA=${leftA} leftB=${leftB}`)
    }

  } finally {
    loop?.stop()
    restore()
  }
}

export function testMarkdownCardPreviewTablesUseCardWidthContract() {
  const tablePath = resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'MarkdownTableBlock.tsx')
  const text = readFileSync(tablePath, 'utf8')

  for (const snippet of [
    'const cardPreviewMode = opts.markdownCardPreviewMode === true',
    "const figureClassName = cardPreviewMode ? CARD_MARKDOWN_PREVIEW_FRAME_CLASS_NAME : documentTableFrameClassName",
    "const blockSpacingClassName = cardPreviewMode ? CARD_MARKDOWN_PREVIEW_BLOCK_SPACING_CLASS_NAME : 'mt-4 mb-4'",
    "cardPreviewMode ? 'w-full table-fixed' : 'min-w-full table-auto'",
    "cardPreviewMode ? 'px-2 py-1.5 break-words whitespace-normal'",
  ]) {
    if (!text.includes(snippet)) {
      throw new Error(`expected markdown card preview tables to use Storyboard-card-width table layout: ${snippet}`)
    }
  }

  if (text.includes('cardPreviewMode\n    ? `overflow-auto max-h-full rounded-lg border')) {
    throw new Error('expected markdown card preview tables to avoid nested rounded border frames inside shared card panels')
  }
}
