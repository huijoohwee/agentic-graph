import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'

import {
  CANVAS_OVERLAY_PAN_OWNER_ATTR,
  CANVAS_OVERLAY_PAN_OWNER_CANVAS,
  isStoryboardWidgetOverlayControlTarget,
  resolveStoryboardWidgetOverlayProxyTarget,
  shouldUseCanvasOverlayBodyPan,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { shouldActivateFlowCanvasRichMediaPanelFromPointer } from '@/components/FlowCanvas/flowCanvasRichMediaPanelHeaderToolbar'

export function testFlowCanvasSpacePanCanStartFromOverlay() {
  const p = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'listeners.ts')
  const text = readFileSync(p, 'utf8')
  const proxyPath = resolve(process.cwd(), 'src', 'lib', 'canvas', 'storyboard-widget-overlay-proxy.ts')
  const proxyText = readFileSync(proxyPath, 'utf8')
  if (!text.includes('onWindowPointerDownCapture')) {
    throw new Error('expected FlowCanvas to install a window pointerdown capture handler for overlay space-pan')
  }
  if (!text.includes('[data-kg-widget]') && !text.includes('storyboard-widget-overlay-proxy')) {
    throw new Error('expected FlowCanvas overlay space-pan proxy to target widget and Rich Media Panel overlays (direct selector or shared proxy helper)')
  }
  if (!proxyText.includes('[data-kg-canvas-overlay-drag-handle="true"]')) {
    throw new Error('expected shared overlay drag-handle selector to include Rich Media Panel headers')
  }
  if (!text.includes('shouldAllowPanDragForPointerEvent')) {
    throw new Error('expected FlowCanvas overlay pan proxy to reuse viewport pan gating SSOT')
  }
  if (!text.includes('readCanvasOverlayPinnedState')) {
    throw new Error('expected FlowCanvas overlay space-pan proxy to reuse shared pinned-state resolution')
  }
  if (!text.includes('CANVAS_OVERLAY_RESIZE_HANDLE_SELECTOR')) {
    throw new Error('expected FlowCanvas overlay space-pan proxy to import shared overlay resize-handle selector')
  }
  if (!text.includes('if (overlayResizeHandle) return')) {
    throw new Error('expected FlowCanvas overlay space-pan proxy to never hijack resize-handle pointerdown events')
  }
  if (!text.includes('__flowCanvasDebug.lastOverlayProxyPointerDown')) {
    throw new Error('expected FlowCanvas overlay proxy pointerdown path to expose live trace details in flowCanvasDebug')
  }
  const screenAuthorityPath = resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'screenAuthorityCollectivePan.ts')
  const screenAuthorityText = readFileSync(screenAuthorityPath, 'utf8')
  if (!text.includes('shouldUseStoryboardWidgetScreenAuthorityCollectivePan(st)') || !screenAuthorityText.includes('isStoryboardWidgetFrontmatterDocumentModeRequested')) {
    throw new Error('expected FlowCanvas overlay space-pan proxy to reuse the shared Storyboard Widget screen-authority gate SSOT')
  }
  if (!text.includes('const storyboardWidgetOverlayInteractionMode =')
    || !text.includes('isStoryboardWidgetSurfaceRenderer(st.canvas2dRenderer)')) {
    throw new Error('expected FlowCanvas overlay pan proxy to activate for shared Storyboard Widget surface renderers, not frontmatter-only documents')
  }
  if (!text.includes('storyboardWidgetSurfaceId: ctx.args.storyboardWidgetSurfaceId')) {
    throw new Error('expected FlowCanvas overlay space-pan proxy to forward the active Storyboard Widget surface identity into shared overlay proxy resolution')
  }
  if (!text.includes('capture: true')) {
    throw new Error('expected FlowCanvas overlay space-pan proxy listeners to use capture')
  }
}

export function testFlowCanvasOverlayBodyPanUsesViewportPanIntent() {
  const p = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'listeners.ts')
  const text = readFileSync(p, 'utf8')
  const proxyPath = resolve(process.cwd(), 'src', 'lib', 'canvas', 'storyboard-widget-overlay-proxy.ts')
  const proxyText = readFileSync(proxyPath, 'utf8')
  if (!text.includes("const pointerMode2d = String(storeStateAtDown.canvasPointerMode2d || '')")) {
    throw new Error('expected FlowCanvas overlay pan proxy to capture the active 2D pointer mode at pointerdown')
  }
  if (!text.includes('pointerMode2d,')) {
    throw new Error('expected FlowCanvas overlay pan proxy to pass pointer mode through the shared pan-intent helper')
  }
  if (!text.includes('const selectionDrag = pointerModePan ? false : shouldStartSelectionDragForPreset')) {
    throw new Error('expected FlowCanvas overlay pan proxy to suppress selection drag while the pan tool owns the gesture')
  }
  if (!text.includes('const overlayBodyViewportPan =')) {
    throw new Error('expected FlowCanvas overlay pan proxy to classify non-interactive overlay bodies as viewport pan intent')
  }
  if (!text.includes('const overlayViewportPanIntent = allowPan || overlayBodyViewportPan')) {
    throw new Error('expected FlowCanvas overlay body pan to bypass canvas selection-drag gating through a named viewport-pan intent')
  }
  if (!text.includes('const overlaySelectionDrag = overlayBodyViewportPan ? false : selectionDrag')) {
    throw new Error('expected FlowCanvas overlay body pan to suppress canvas selection drag because overlays have no lasso owner')
  }
  if (!text.includes("resolved.kind === 'overlay' && !overlayPinnedToNode && overlayDragHandle && button === 0 && spacePanHeld !== true")) {
    throw new Error('expected unpinned Storyboard Widget overlay drag handles to remain local owner interactions without Space-pan')
  }
  if (text.includes("resolved.kind === 'overlay' && !overlayPinnedToNode && button === 0 && spacePanHeld !== true) return")) {
    throw new Error('expected unpinned Storyboard Widget overlay body pan to use viewport pan intent instead of an unconditional return')
  }
  if (text.includes("resolved.kind === 'overlay' && !overlayPinnedToNode && button === 0 && spacePanHeld !== true && (allowPan !== true || selectionDrag === true)")) {
    throw new Error('expected unpinned Storyboard Widget overlay body pan to avoid stale allowPan/selectionDrag-only gating')
  }
  if (!text.includes('const overlayPanOwnerCanvas =')
    || !text.includes('isCanvasOverlayPanOwnedByCanvas(resolved.overlayRoot)')
    || !text.includes('if (overlayBodyViewportPan && storyboardWidgetOverlayInteractionMode && !overlayPanOwnerCanvas) return')) {
    throw new Error('expected FlowCanvas overlay body pan to yield only when the overlay has no shared canvas-pan owner')
  }
  if (!text.includes('shouldUseCanvasOverlayBodyPan({ target: resolved.targetEl, overlayRoot: resolved.overlayRoot })')) {
    throw new Error('expected FlowCanvas overlay body pan to reuse the shared body-pan target helper')
  }
  if (!proxyText.includes('export const STORYBOARD_WIDGET_OVERLAY_CONTROL_SELECTOR')
    || !proxyText.includes('export function shouldUseCanvasOverlayBodyPan')
    || !proxyText.includes('isCanvasOverlayPanOwnedByCanvas(args.overlayRoot)')
    || !proxyText.includes('isCanvasOverlayBodyPanBlockingTarget(args.target, args.overlayRoot)')) {
    throw new Error('expected shared overlay proxy to separate real controls from broad inline/media wrappers for canvas-owned body pan')
  }
  if (!text.includes("resolved.kind === 'overlay' && !overlayPinnedToNode && button === 0 && spacePanHeld !== true && (overlayViewportPanIntent !== true || overlaySelectionDrag === true)")) {
    throw new Error('expected unpinned Storyboard Widget overlay body pan to proceed when overlay body viewport-pan intent is active')
  }
}

export function testFlowCanvasOverlayPointerIgnoreScrollSurfaceStaysInteractive() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <article ${CANVAS_OVERLAY_PAN_OWNER_ATTR}="${CANVAS_OVERLAY_PAN_OWNER_CANVAS}">
        <section data-kg-overlay-body="1"></section>
        <footer data-kg-canvas-pointer-ignore="true" data-kg-media-scroll-surface="1"></footer>
      </article>
    </body></html>`,
    { url: 'http://localhost' },
  )
  const overlayRoot = dom.window.document.querySelector('article') as HTMLElement | null
  const body = dom.window.document.querySelector('[data-kg-overlay-body="1"]') as HTMLElement | null
  const footer = dom.window.document.querySelector('footer') as HTMLElement | null
  if (!overlayRoot || !body || !footer) throw new Error('expected proxy test DOM to contain overlay body and footer surfaces')
  if (!isStoryboardWidgetOverlayControlTarget(footer)) {
    throw new Error('expected pointer-ignore media scroll surfaces to classify as overlay-local interactive controls')
  }
  if (shouldUseCanvasOverlayBodyPan({ target: footer, overlayRoot })) {
    throw new Error('expected pointer-ignore footer scroll surfaces not to start canvas-owned overlay body pan')
  }
  if (!shouldUseCanvasOverlayBodyPan({ target: body, overlayRoot })) {
    throw new Error('expected non-interactive canvas-owned overlay body surfaces to retain viewport pan intent')
  }
}

export function testFlowCanvasRichMediaScrollBodyUsesCanvasOwnedPan() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <main data-canvas-root="1" data-kg-storyboard-widget-surface-root="storyboard"></main>
      <section
        data-node-id="rich-media-node"
        data-kg-rich-media-overlay="1"
        data-kg-storyboard-widget-mode="1"
        data-kg-storyboard-widget-surface="storyboard"
        data-kg-overlay-pan-owner="canvas"
        data-kg-canvas-overlay-pinned="0"
      >
        <section data-kg-media-scroll-surface="1">
          <p id="body">Generated output body</p>
          <button id="button">Run</button>
          <section id="editor" data-kg-rich-media-inline-edit="1">Edit</section>
        </section>
      </section>
    </body></html>`,
    { url: 'http://localhost' },
  )
  const document = dom.window.document
  const canvasEl = document.querySelector('[data-canvas-root="1"]') as HTMLElement | null
  const overlayRoot = document.querySelector('[data-kg-rich-media-overlay="1"]') as HTMLElement | null
  const body = document.querySelector('#body') as HTMLElement | null
  const button = document.querySelector('#button') as HTMLElement | null
  const editor = document.querySelector('#editor') as HTMLElement | null
  if (!canvasEl || !overlayRoot || !body || !button || !editor) throw new Error('expected Rich Media proxy test DOM to contain canvas, overlay, body, and controls')

  if (!isStoryboardWidgetOverlayControlTarget(body)) {
    throw new Error('expected generic Storyboard overlay controls to keep media scroll surfaces local for widget cards')
  }
  if (!shouldUseCanvasOverlayBodyPan({ target: body, overlayRoot })) {
    throw new Error('expected canvas-owned Rich Media scroll bodies to retain shared body-drag ownership')
  }
  if (shouldUseCanvasOverlayBodyPan({ target: button, overlayRoot })) {
    throw new Error('expected Rich Media buttons to stay local controls')
  }
  if (shouldUseCanvasOverlayBodyPan({ target: editor, overlayRoot })) {
    throw new Error('expected Rich Media inline editors to stay local controls')
  }
  if (shouldActivateFlowCanvasRichMediaPanelFromPointer({ isSelected: true, target: editor })) {
    throw new Error('expected the selected Rich Media inline edit surface to retain edit state without redundant Canvas node activation')
  }
  if (!shouldActivateFlowCanvasRichMediaPanelFromPointer({ isSelected: false, target: editor })) {
    throw new Error('expected an unselected Rich Media inline edit surface to activate its Canvas node on the first pointer interaction')
  }
  if (!shouldActivateFlowCanvasRichMediaPanelFromPointer({ isSelected: true, target: body })) {
    throw new Error('expected selected Rich Media non-editor content to preserve normal Canvas activation behavior')
  }

  const globalDom = globalThis as typeof globalThis & { Element?: typeof Element; HTMLElement?: typeof HTMLElement }
  const previousElement = globalDom.Element
  const previousHTMLElement = globalDom.HTMLElement
  globalDom.Element = dom.window.Element
  globalDom.HTMLElement = dom.window.HTMLElement
  const resolved = (() => {
    try {
      return resolveStoryboardWidgetOverlayProxyTarget({
        target: body,
        canvasEl,
        storyboardWidgetSurfaceId: 'storyboard',
      })
    } finally {
      if (previousElement) globalDom.Element = previousElement
      else delete globalDom.Element
      if (previousHTMLElement) globalDom.HTMLElement = previousHTMLElement
      else delete globalDom.HTMLElement
    }
  })()
  if (resolved.kind !== 'overlay') throw new Error('expected Rich Media body target to resolve to overlay proxy')
  if (resolved.isInteractive) throw new Error('expected Rich Media body pan target not to resolve as a local interactive control')
}

export function testFlowCanvasStoryboardWidgetCanvasPanMovesNativeAndOverlaySurfaces() {
  const pointerMovePath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'pointerMove.ts')
  const pointerMoveText = readFileSync(pointerMovePath, 'utf8')
  const screenAuthorityPath = resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'screenAuthorityCollectivePan.ts')
  const screenAuthorityText = readFileSync(screenAuthorityPath, 'utf8')
  if (!pointerMoveText.includes('const nextTransform = d3.zoomIdentity.translate(drag.startTx + dx, drag.startTy + dy).scale(runtime.transform.k)')) {
    throw new Error('expected Storyboard Widget collective pan to compute one shared native transform for canvas-pane pan')
  }
  if (!pointerMoveText.includes('setFlowNativeTransform(runtime, nextTransform)')
    || !pointerMoveText.includes('requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())')
    || !pointerMoveText.includes('canvasTransformShifted: true')) {
    throw new Error('expected canvas-pane pan to move FlowCanvas and Storyboard Widget overlays in the same interaction frame')
  }
  if (!screenAuthorityText.includes('canvasTransformShifted?: boolean')
    || !screenAuthorityText.includes('const canvasTransformShifted = args.canvasTransformShifted === true')
    || !screenAuthorityText.includes('if (canvasTransformShifted) {')) {
    throw new Error('expected shared screen-authority helper to distinguish native-transform pan from overlay-only pan')
  }
  if (!screenAuthorityText.includes('const changedVisual = Object.keys(shiftedScreenByNodeId).length > 0')
    || !screenAuthorityText.includes('if (!changedScreen && !changedWorld && !changedVisual) return false')) {
    throw new Error('expected shared screen-authority helper to apply DOM overlay positions even when persisted world coordinates do not change')
  }
}

export function testStoryboardWidgetSharedPanDoesNotConsumeClickActivation() {
  const sharedPanPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardSharedSurfacePan.ts')
  const sharedPanText = readFileSync(sharedPanPath, 'utf8')
  const pointerDownStart = sharedPanText.indexOf('const onPointerDown = (event: PointerEvent | MouseEvent) => {')
  const pointerMoveStart = sharedPanText.indexOf('const onPointerMove = (event: PointerEvent | MouseEvent) => {')
  if (pointerDownStart < 0 || pointerMoveStart < 0 || pointerMoveStart <= pointerDownStart) {
    throw new Error('expected shared Storyboard Widget pan listener to keep explicit pointerdown and pointermove phases')
  }
  const pointerDownText = sharedPanText.slice(pointerDownStart, pointerMoveStart)
  if (pointerDownText.includes('event.preventDefault()') || pointerDownText.includes('event.stopPropagation()')) {
    throw new Error('expected shared Storyboard Widget pan listener to arm collective drag without consuming Rich Media click activation')
  }
  if (!sharedPanText.includes('if (!pending.started && dx * dx + dy * dy < 9) return')
    || !sharedPanText.includes('pending.started = true')) {
    throw new Error('expected shared Storyboard Widget pan listener to consume events only after drag threshold')
  }
  if (!sharedPanText.includes('if (!pending.started) return')) {
    throw new Error('expected shared Storyboard Widget pan listener to let non-drag pointerup/click activation finish')
  }
}
