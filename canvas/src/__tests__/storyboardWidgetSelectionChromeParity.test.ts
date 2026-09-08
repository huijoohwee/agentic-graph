import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  getStoryboardWidgetPanelChromeClassName,
  getStoryboardWidgetPanelSelectionChromeClassName,
  getStoryboardWidgetPanelSurfaceChromeClassName,
} from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import { applyVectorPaintedOverlayBox, applyVectorPaintedOverlayPosition } from '@/lib/canvas/vectorPaintedOverlayProjection'

import { applyPanelBox } from '@/lib/render/mediaPanelLayout'

const readSource = (...parts: string[]): string => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')

export function testStoryboardWidgetSelectionChromeParity() {
  const rejectWrite = {
    set() { throw new Error('parent-owned overlay must reject imperative writes') },
    defineProperty() { throw new Error('parent-owned overlay must reject imperative definitions') },
    deleteProperty() { throw new Error('parent-owned overlay must reject imperative deletions') },
  }
  const parentOwnedPanel = {
    dataset: new Proxy({ kgOverlayPlacementOwner: 'parent' }, rejectWrite),
    style: new Proxy({ left: '0px', top: '0px', width: '', transform: '', zoom: '' }, rejectWrite),
  } as unknown as HTMLElement
  applyVectorPaintedOverlayBox(parentOwnedPanel, { left: 480, top: 640, width: 360, height: 203, display: 'flex', scale: 0.31 })
  applyVectorPaintedOverlayPosition(parentOwnedPanel, { left: 480, top: 640 })
  for (const display of ['block', 'flex', 'none'] as const) {
    for (const positionMode of ['matrix', 'vectorPainted'] as const) {
      applyPanelBox(parentOwnedPanel, { left: 480, top: 640, w: 360, h: 203, display, positionMode, scale: 0.31 })
    }
  }
  const panelChrome = getStoryboardWidgetPanelChromeClassName()
  const selectedChrome = getStoryboardWidgetPanelSelectionChromeClassName(true)
  if (panelChrome.includes('shadow')) {
    throw new Error('expected shared Card, Widget, and Rich Media chrome to remain shadowless')
  }
  if (!panelChrome.includes('bg-[var(--kg-media-panel-bg)]') || panelChrome.includes('bg-[var(--kg-panel-bg)]')) {
    throw new Error('expected shared Card, Widget, and Rich Media chrome to consume the opaque media surface token')
  }
  if (!selectedChrome || getStoryboardWidgetPanelSelectionChromeClassName(false)) {
    throw new Error('expected shared Storyboard panel selection chrome to be active only for selected surfaces')
  }
  if (!selectedChrome.includes('outline') || selectedChrome.includes('ring')) {
    throw new Error('expected selected Storyboard panel chrome to use a true outline without box-shadow rings')
  }
  const selectedSurfaceChrome = getStoryboardWidgetPanelSurfaceChromeClassName({
    className: 'pointer-events-auto absolute',
    selected: true,
  })
  if (!selectedSurfaceChrome.includes(selectedChrome) || !selectedSurfaceChrome.includes('absolute')) {
    throw new Error(`expected shared surface composition to preserve the complete selected outline after layout class merging, got ${selectedSurfaceChrome}`)
  }
  const unselectedSurfaceChrome = getStoryboardWidgetPanelSurfaceChromeClassName({
    className: 'pointer-events-auto absolute',
    selected: false,
  })
  if (unselectedSurfaceChrome.includes('outline')) {
    throw new Error(`expected unselected shared surface composition to omit outline chrome, got ${unselectedSurfaceChrome}`)
  }

  const cardOverlay = readSource('components', 'StoryboardWidgetCanvas', 'StoryboardCardOverlayLayer2d.tsx')
  const richMediaSurface = readSource('components', 'useRichMediaPanelSurfaceState.ts')
  const richMediaTypes = readSource('components', 'RichMediaPanel.types.ts')
  const flowMediaOverlay = readSource('components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const storyboardCanvas = readSource('components', 'StoryboardCanvas.tsx')
  const graphMediaOverlay = readSource('components', 'GraphCanvasRoot', 'components', 'RichMediaOverlayLayer2d.tsx')

  if (!cardOverlay.includes('getStoryboardWidgetPanelSurfaceChromeClassName({')
    || !cardOverlay.includes('selected,')
    || !cardOverlay.includes("data-kg-storyboard-widget-selected={selected ? '1' : undefined}")) {
    throw new Error('expected Card and Widget selection to consume the shared panel selection chrome owner')
  }
  if (!richMediaTypes.includes('selected?: boolean')
    || !richMediaTypes.includes("placementOwner?: 'self' | 'parent'")
    || !richMediaSurface.includes('getStoryboardWidgetPanelSurfaceChromeClassName({')
    || !richMediaSurface.includes('selected: props.selected === true')
    || !richMediaSurface.includes("props.placementOwner === 'parent'")
    || !richMediaSurface.includes("'data-kg-overlay-placement-owner': props.placementOwner === 'parent' ? 'parent' : undefined")
    || !richMediaSurface.includes("element.style.width = '100%'")
    || !richMediaSurface.includes("'data-kg-storyboard-widget-selected': showStoryboardWidgetChrome && props.selected === true ? '1' : undefined")) {
    throw new Error('expected Rich Media Panel to consume shared selection chrome and reset nested parent-owned placement')
  }
  if (!flowMediaOverlay.includes('data-kg-rich-media-overlay="1"')
    || !flowMediaOverlay.includes('data-kg-storyboard-widget-mode="1"')
    || !richMediaSurface.includes("storyboardWidgetRichMediaOverlayRoot && props.placementOwner !== 'parent'")) {
    throw new Error('expected the outer Rich Media shell to be the sole canonical overlay proxy root')
  }
  for (const [owner, source, contract] of [
    ['Flow Canvas', flowMediaOverlay, 'placementOwner="parent"'],
    ['Storyboard Canvas', storyboardCanvas, 'selected={props.selected}'],
    ['Graph Canvas', graphMediaOverlay, 'placementOwner="parent"'],
  ] as const) {
    if (!source.includes(contract)) throw new Error(`expected ${owner} Rich Media selection to reach shared panel chrome`)
  }
}
