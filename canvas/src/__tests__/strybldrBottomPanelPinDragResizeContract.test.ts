import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

export function testStrybldrBottomPanelUnpinDragReusesResizeRuntime() {
  const text = readSource('src/features/strybldr/StrybldrTimelineBottomPanel.tsx')
  const mainPanelText = readSource('src/features/toolbar/hooks/useMainPanelDrag.ts')
  const floatingPanelText = readSource('src/features/toolbar/useToolMenuState.ts')
  const sharedDragText = readSource('src/lib/ui/overlayPanelDrag.ts')
  const required = [
    'beginRichMediaPanelResizeDrag',
    'RichMediaPanelResizeHandle',
    'beginOverlayPanelPositionDrag',
    'bottomSurfaceHeightRatio',
    'setBottomSurfaceHeightRatio',
    'clampTimelineBottomPanelHeightRatio',
    'clampOverlayTopLeftToViewport',
    'data-kg-strybldr-bottom-timeline-pinned',
    'data-kg-strybldr-bottom-timeline-drag-enabled',
    'data-kg-floating-panel-root="true"',
    "data-kg-canvas-overlay-drag-handle={!pinned && !minimized ? 'true' : undefined}",
    '<RichMediaPanelResizeHandle placement="panel"',
    "pinned && 'kg-canvas-bottom-panel--pinned'",
    "!pinned && 'agentic-base-floating-panel-draggable'",
    'setPanelSizePx(clampPanelSize({ width: rect.width, height: rect.height }))',
  ]
  const missing = required.filter(token => !text.includes(token))
  if (missing.length > 0) {
    throw new Error(`expected Strybldr bottom panel unpin/drag/resize shared contract, missing: ${missing.join(', ')}`)
  }
  if (text.includes('HorizontalResizeSeparatorHr') || text.includes('bindResizeSeparatorDragRuntime') || text.includes('data-kg-strybldr-bottom-timeline-resize-handle="top"')) {
    throw new Error('expected BottomPanel to avoid the top resize separator and use the Rich Media Panel corner resize affordance')
  }
  if (text.includes("bottom: 'calc(var(--kg-safe-bottom)") || text.includes("width: 'min(calc(100% - 1.5rem")) {
    throw new Error('expected bottom panel safe-area geometry to remain in shared responsive CSS')
  }
  if (text.indexOf('setPanelSizePx(clampPanelSize({ width: rect.width, height: rect.height }))') > text.indexOf('setPinned(false)')) {
    throw new Error('expected unpin to preserve the rendered pinned panel size before switching to floating geometry')
  }
  if (
    !sharedDragText.includes('export function beginOverlayPanelPositionDrag') ||
    !sharedDragText.includes('startPointerDrag') ||
    !mainPanelText.includes('beginOverlayPanelPositionDrag') ||
    !floatingPanelText.includes('beginOverlayPanelPositionDrag') ||
    mainPanelText.includes('startPointerDrag') ||
    floatingPanelText.includes('startPointerDrag')
  ) {
    throw new Error('expected MainPanel, FloatingPanel, and BottomPanel pin/unpin drag to reuse the shared overlay panel drag helper')
  }
}
