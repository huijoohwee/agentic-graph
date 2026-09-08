import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testToolMenuDragUsesSharedPointerDrag() {
  const p = resolve(process.cwd(), 'src', 'features', 'toolbar', 'useToolMenuState.ts')
  const text = readFileSync(p, 'utf8')
  const owner = readFileSync(resolve(process.cwd(), 'src/lib/ui/overlayPanelDrag.ts'), 'utf8')
  if (!text.includes('beginOverlayPanelPositionDrag({') || !owner.includes("from 'grph-shared/dom/pointerDrag'") || !owner.includes('startPointerDrag({')) throw new Error('expected tool menu drag to delegate through the shared overlay owner to startPointerDrag')
  if (text.includes("window.addEventListener('pointermove'")) throw new Error('expected tool menu drag to avoid manual window pointermove listeners')
  if (text.includes("window.addEventListener('pointerup'")) throw new Error('expected tool menu drag to avoid manual window pointerup listeners')
}

export function testSpotlightCardDragUsesSharedPointerDrag() {
  const p = resolve(process.cwd(), 'src', 'features', 'spotlight', 'useSpotlightAnchor.ts')
  const text = readFileSync(p, 'utf8')
  if (!text.includes('startPointerDrag')) throw new Error('expected spotlight card drag to use shared startPointerDrag')
  if (text.includes("window.addEventListener('pointermove'")) throw new Error('expected spotlight drag to avoid manual window pointermove listeners')
  if (text.includes("window.addEventListener('pointerup'")) throw new Error('expected spotlight drag to avoid manual window pointerup listeners')
}

export function testFloatingPanelDefaultGeometryMatchesCanvasCommandPanel() {
  const root = resolve(process.cwd(), 'src')
  const geometryText = readFileSync(resolve(root, 'lib', 'ui', 'floatingPanelGeometry.ts'), 'utf8')
  const toolMenuStateText = readFileSync(resolve(root, 'features', 'toolbar', 'useToolMenuState.ts'), 'utf8')
  const toolbarToolMenuText = readFileSync(resolve(root, 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx'), 'utf8')
  const gitGraphCanvasText = readFileSync(resolve(root, 'components', 'MermaidGitGraphCanvas.tsx'), 'utf8')
  const gitGraphFloatingPanelText = readFileSync(resolve(root, 'features', 'gitgraph', 'GitGraphFloatingPanelView.tsx'), 'utf8')

  if (!geometryText.includes('FLOATING_PANEL_CANVAS_INSET_PX = 8')) {
    throw new Error('expected shared floating panel inset to match the toolbar canvas edge gap')
  }
  if (
    !geometryText.includes('FLOATING_PANEL_DEFAULT_WIDTH_RATIO = 0.3') ||
    !geometryText.includes("FLOATING_PANEL_DEFAULT_MIN_WIDTH_CSS = '21.6rem'") ||
    !geometryText.includes('FLOATING_PANEL_DEFAULT_WIDTH_FALLBACK_PX = 384')
  ) {
    throw new Error('expected FloatingPanel default width to be 20 percent wider than the prior 25vw/18rem/320px sizing')
  }
  if (
    !geometryText.includes("FLOATING_PANEL_CANVAS_TOP_INSET_CSS = 'calc(var(--kg-safe-top) + var(--kg-canvas-viewport-edge-gap))'") ||
    !geometryText.includes("FLOATING_PANEL_CANVAS_RIGHT_INSET_CSS = 'calc(var(--kg-safe-right) + var(--kg-canvas-viewport-edge-gap))'")
  ) {
    throw new Error('expected FloatingPanel inset CSS to reuse the toolbar canvas edge-gap token')
  }
  if (!toolMenuStateText.includes('right: FLOATING_PANEL_CANVAS_RIGHT_INSET_CSS') || toolMenuStateText.includes('getToolbarBottomPx')) {
    throw new Error('expected FloatingPanel default position to use the shared right-edge canvas geometry, not toolbar-bottom or width-estimated placement')
  }
  if (!toolbarToolMenuText.includes('height: FLOATING_PANEL_CANVAS_PANEL_HEIGHT_CSS') || !toolbarToolMenuText.includes('maxHeight: FLOATING_PANEL_CANVAS_PANEL_HEIGHT_CSS')) {
    throw new Error('expected FloatingPanel shell height to use the shared canvas panel height')
  }
  if (toolbarToolMenuText.includes('bottomSurfaceHeightRatio') || toolbarToolMenuText.includes('safeBottomRatio')) {
    throw new Error('expected FloatingPanel shell height not to shrink against stale bottom-surface ratio state')
  }
  if (!toolbarToolMenuText.includes('width: resolveFloatingPanelWidthCss(floatingPanelWidthRatio)') || !geometryText.includes('Number.isFinite(widthRatio) ? widthRatio : FLOATING_PANEL_DEFAULT_WIDTH_RATIO') || !geometryText.includes('max(${FLOATING_PANEL_DEFAULT_MIN_WIDTH_CSS}, ${Math.round(safeRatio * 100)}vw)')) {
    throw new Error('expected FloatingPanel shell width to use shared 20 percent wider geometry constants')
  }
  if (gitGraphCanvasText.includes('data-kg-gitgraph-crud-panel') || gitGraphCanvasText.includes('CardInlineTextEditor')) {
    throw new Error('expected GitGraph canvas to avoid a duplicate canvas-local command panel')
  }
  if (!toolbarToolMenuText.includes("floatingPanelView === 'gitGraph'") || !gitGraphFloatingPanelText.includes('data-kg-gitgraph-floating-panel="1"')) {
    throw new Error('expected GitGraph command CRUD to mount inside the shared FloatingPanel shell')
  }
}
