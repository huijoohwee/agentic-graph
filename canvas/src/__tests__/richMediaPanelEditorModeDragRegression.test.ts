import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  installWheelForwardingAndBrowserZoomGuards,
  shouldKeepWheelOnScrollableTarget,
} from 'grph-shared/dom/wheelGuards'
import {
  readOverlayPointerTargetState,
  shouldBlockOverlayPanTarget,
} from '../../../grph-shared/src/dom/overlayPointerGuards'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

function readRichMediaPanelSourceBundle(): string {
  const root = resolve(process.cwd(), 'src', 'components')
  const files = [
    'RichMediaPanel.tsx',
    'RichMediaPanel.types.ts',
    'RichMediaPanelSurface.tsx',
    'RichMediaPanelShell.tsx',
    'RichMediaPanelContentSurface.tsx', 'richMediaPanelSurfaceVariant.ts',
    'RichMediaPanelTextSurface.tsx',
    'RichMediaPanelIframeSurface.tsx',
    'RichMediaPanelDirectMediaSurface.tsx',
    'RichMediaPanelResizeHandle.tsx',
    'RichMediaPanelOpenOverlay.tsx',
    'useRichMediaPanelMediaState.ts',
    'useRichMediaPanelSurfaceState.ts',
  ]
  return files.map(file => readFileSync(resolve(root, file), 'utf8')).join('\n')
}

export function testRichMediaPanelEditorModeDisablesInteractiveContentForDragging() {
  const surfaceStatePath = resolve(process.cwd(), 'src', 'components', 'useRichMediaPanelSurfaceState.ts')
  const surfaceStateText = readFileSync(surfaceStatePath, 'utf8')
  if (!surfaceStateText.includes('const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({')) {
    throw new Error('expected RichMediaPanel to read canonical workspace overlay-open state for drag behavior')
  }
  if (!surfaceStateText.includes('const allowClickToOpenOverlay = canClickToOpen && !workspaceEditorOverlayOpen')) {
    throw new Error('expected RichMediaPanel to gate click-to-open overlay only while the workspace overlay is actually open')
  }
  if (
    !surfaceStateText.includes('pointerEvents: shouldHideSurfaceUntilReady')
    || !surfaceStateText.includes(': workspaceEditorOverlayOpen || canvasOverlayProxyEnabled')
    || !surfaceStateText.includes(": (contentInteractive || canClickToOpen ? 'auto' : 'none'),")
  ) {
    throw new Error('expected RichMediaPanel pointer-events behavior to depend on workspace overlay-open and shared overlay proxy state, not editor mode alone')
  }
}

export async function testRichMediaPanelStoryboardWidgetModifierWheelZoomKeepsInteractiveScroll() {
  const surfaceStatePath = resolve(process.cwd(), 'src', 'components', 'useRichMediaPanelSurfaceState.ts')
  const surfaceStateText = readFileSync(surfaceStatePath, 'utf8')
  if (!surfaceStateText.includes('const forwardModifierWheelZoomOnly = installWheelForwarding && storyboardWidgetFrontmatterDocumentMode === true')) {
    throw new Error('expected RichMediaPanel to isolate explicit modifier-wheel zoom forwarding in Storyboard Widget frontmatter document mode')
  }
  if (!surfaceStateText.includes('shouldForwardWheel: forwardModifierWheelZoomOnly ? event => event.ctrlKey === true || event.metaKey === true : undefined')) {
    throw new Error('expected RichMediaPanel to forward only explicit ctrl/cmd wheel zoom while preserving normal panel scroll')
  }

  const wheelGuardsPath = resolve(process.cwd(), '..', 'grph-shared', 'src', 'dom', 'wheelGuards.ts')
  const wheelGuardsText = readFileSync(wheelGuardsPath, 'utf8')
  if (!wheelGuardsText.includes('shouldForwardWheel?: (e: WheelEvent) => boolean')) {
    throw new Error('expected shared wheel guards to accept a wheel-forwarding predicate')
  }
  if (!wheelGuardsText.includes('const tryForwardWheel = (e: WheelEvent): boolean => {')
    || !wheelGuardsText.includes('if (!forwardTo || !forwardAllowed) return false')) {
    throw new Error('expected shared wheel guards to gate forwarding through the shared predicate result')
  }
  if (!wheelGuardsText.includes('export function shouldKeepWheelOnScrollableTarget(') || !wheelGuardsText.includes('opts?: WheelScrollableTargetOptions')) {
    throw new Error('expected shared wheel guards to expose a reusable scrollable-target wheel predicate')
  }
  if (!wheelGuardsText.includes('if (shouldKeepWheelOnScrollableTarget(e, el)) return')) {
    throw new Error('expected shared wheel forwarding to preserve wheel events that start inside scrollable embedded media surfaces')
  }
  if (!wheelGuardsText.includes('export function consumeScrollablePanelWheelEvent')) {
    throw new Error('expected shared wheel guards to expose a reusable widget inner-panel wheel consumer')
  }

  const { dom, restore: restoreDom } = initJsdomHarness()
  const g = globalThis as typeof globalThis & {
    getComputedStyle?: typeof getComputedStyle
    WheelEvent?: typeof WheelEvent
  }
  const originalGetComputedStyle = g.getComputedStyle
  const originalWheelEvent = g.WheelEvent
  let cleanup: (() => void) | null = null
  try {
    g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window) as typeof getComputedStyle
    g.WheelEvent = dom.window.WheelEvent as unknown as typeof WheelEvent

    const doc = dom.window.document
    const root = doc.createElement('section')
    const scrollSurface = doc.createElement('section')
    const child = doc.createElement('p')
    const forwardedTarget = doc.createElement('section')
    const forwarded: WheelEvent[] = []
    const readForwardedCount = () => forwarded.length
    scrollSurface.style.overflowY = 'auto'
    scrollSurface.style.overflowX = 'hidden'
    Object.defineProperty(scrollSurface, 'scrollHeight', { configurable: true, value: 420 })
    Object.defineProperty(scrollSurface, 'clientHeight', { configurable: true, value: 120 })
    child.textContent = 'Scrollable rich media text'
    scrollSurface.appendChild(child)
    root.appendChild(scrollSurface)
    doc.body.appendChild(root)
    doc.body.appendChild(forwardedTarget)
    forwardedTarget.addEventListener('wheel', event => forwarded.push(event as WheelEvent))

    cleanup = installWheelForwardingAndBrowserZoomGuards(root, {
      forwardWheelTo: () => forwardedTarget,
      stopPropagationOnForward: true,
      stopPropagationOnPreventZoom: false,
      forwardedFlagKey: '__kgForwarded',
    })

    const scrollWheel = new dom.window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 48,
    }) as unknown as WheelEvent
    child.dispatchEvent(scrollWheel)

    if (!shouldKeepWheelOnScrollableTarget(scrollWheel, root)) {
      throw new Error('expected shared wheel guard to classify scrollable rich-media descendants as local scroll targets')
    }
    if (scrollWheel.defaultPrevented) {
      throw new Error('expected non-modifier wheel inside a scrollable media surface to remain available for native scrolling')
    }
    const forwardedBeforeZoom = readForwardedCount()
    if (forwardedBeforeZoom !== 0) {
      throw new Error(`expected scrollable media wheel to avoid canvas forwarding, forwarded=${forwardedBeforeZoom}`)
    }

    const zoomWheel = new dom.window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 48,
    }) as unknown as WheelEvent
    child.dispatchEvent(zoomWheel)

    if (!shouldKeepWheelOnScrollableTarget(zoomWheel, root, { allowModifierZoom: false })) {
      throw new Error('expected shared wheel guard to let widget inner panel scrolling win over modifier-wheel canvas zoom when requested')
    }
    if (!zoomWheel.defaultPrevented) {
      throw new Error('expected modifier-wheel zoom to keep using the shared forwarding/browser zoom guard')
    }
    const forwardedAfterZoom = readForwardedCount()
    if (forwardedAfterZoom !== 1) {
      throw new Error(`expected only explicit modifier wheel to forward from the scrollable surface, forwarded=${forwardedAfterZoom}`)
    }

    cleanup?.()
    cleanup = installWheelForwardingAndBrowserZoomGuards(root, {
      forwardWheelTo: () => forwardedTarget,
      forwardWheelBeforeScrollableTarget: true,
      stopPropagationOnForward: true,
      stopPropagationOnPreventZoom: false,
      forwardedFlagKey: '__kgForwarded',
    })

    const forwardedBeforeD3PanelWheel = readForwardedCount()
    const d3PanelWheel = new dom.window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 48,
    }) as unknown as WheelEvent
    child.dispatchEvent(d3PanelWheel)

    const forwardedAfterD3PanelWheel = readForwardedCount()
    if (!d3PanelWheel.defaultPrevented) {
      throw new Error('expected D3 rich-media panel wheel to be captured for canvas forwarding before local scroll')
    }
    if (forwardedAfterD3PanelWheel !== forwardedBeforeD3PanelWheel + 1) {
      throw new Error(`expected D3 rich-media panel wheel to forward before scrollable-target guard, before=${forwardedBeforeD3PanelWheel} after=${forwardedAfterD3PanelWheel}`)
    }

  } finally {
    try {
      cleanup?.()
    } catch {
      void 0
    }
    g.getComputedStyle = originalGetComputedStyle
    g.WheelEvent = originalWheelEvent
    restoreDom()
  }
}

export function testRichMediaPanelInlineEditSurfaceOwnsPointerBeforeContenteditable() {
  const { dom, restore } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const editableSurface = doc.createElement('section')
    editableSurface.setAttribute('data-kg-rich-media-inline-edit', '1')
    editableSurface.setAttribute('data-kg-media-scroll-surface', '1')
    const heading = doc.createElement('h1')
    editableSurface.appendChild(heading)
    doc.body.appendChild(editableSurface)

    const editableTargetState = readOverlayPointerTargetState(heading)
    if (!editableTargetState.isInteractiveControl) {
      throw new Error('expected the marked Rich Media Viewer surface to own pointer input before contenteditable mounts')
    }
    if (!shouldBlockOverlayPanTarget(editableTargetState, { scrollSurfaceCanForwardPointer: true })) {
      throw new Error('expected Canvas overlay pan capture to yield to the marked Rich Media Viewer edit surface')
    }

    const canvasPanSurface = doc.createElement('section')
    canvasPanSurface.setAttribute('data-kg-media-scroll-surface', '1')
    const canvasPanChild = doc.createElement('p')
    canvasPanSurface.appendChild(canvasPanChild)
    doc.body.appendChild(canvasPanSurface)
    const canvasPanTargetState = readOverlayPointerTargetState(canvasPanChild)
    if (canvasPanTargetState.isInteractiveControl) {
      throw new Error('did not expect an ordinary Rich Media scroll surface to claim editor pointer ownership')
    }
    if (shouldBlockOverlayPanTarget(canvasPanTargetState, { scrollSurfaceCanForwardPointer: true })) {
      throw new Error('expected ordinary forwarded Rich Media scroll surfaces to retain Canvas pan ownership')
    }
  } finally {
    restore()
  }
}

export function testD3RichMediaOverlayForwardsWheelBeforeScrollableBody() {
  const overlayPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'components', 'RichMediaOverlayLayer2d.tsx')
  const overlayText = readFileSync(overlayPath, 'utf8')
  if (!overlayText.includes('forwardWheelBeforeScrollableTarget={!allowEmbeddedMediaInteraction}')
    || !overlayText.includes('forwardPointerTo={() => svgRef.current}')
    || !overlayText.includes('shouldForwardPointerDown={() => !allowEmbeddedMediaInteraction}')) {
    throw new Error('expected D3 rich-media overlays to route non-interactive table/code body gestures through shared canvas pan/zoom owners')
  }
  if (overlayText.includes('onWheelCapture={stopEvent}')) {
    throw new Error('expected D3 rich-media overlays to let shared native wheel forwarding receive panel-origin wheel events')
  }

  const designOverlayPath = resolve(process.cwd(), 'src', 'lib', 'markdown-edgeless', 'MarkdownDesignOverlay.impl.tsx')
  const designOverlayText = readFileSync(designOverlayPath, 'utf8')
  if (!designOverlayText.includes('forwardWheelBeforeScrollableTarget={true}')
    || !designOverlayText.includes('shouldForwardPointerDown={() => true}')) {
    throw new Error('expected Markdown design rich-media panels to opt into canvas-first wheel and body-pan forwarding')
  }
  if (designOverlayText.includes("from 'grph-shared/dom/wheelGuards'")
    || designOverlayText.includes('installWheelForwardingAndBrowserZoomGuards')) {
    throw new Error('expected Markdown design overlay wrapper to avoid duplicate wheel forwarding; RichMediaPanel owns forwarding')
  }
  if (!designOverlayText.includes('collectiveFitToViewport: false,')
    || !designOverlayText.includes('clampToViewport: null,')) {
    throw new Error('expected Markdown design overlay to stay node-aligned by avoiding viewport fit/clamp')
  }
  if (designOverlayText.includes('isViewportClampEnabled')
    || designOverlayText.includes('viewportClampSuspended')
    || designOverlayText.includes('suspendViewportClamp')) {
    throw new Error('expected Markdown design overlay to avoid stale clamp-suspension paths')
  }
  if (designOverlayText.includes('onWheelCapture={props.stopEvent}')) {
    throw new Error('expected Markdown design overlay wrappers to let shared native wheel forwarding receive panel-origin wheel events')
  }

  const panelText = readFileSync(resolve(process.cwd(), 'src', 'components', 'useRichMediaPanelSurfaceState.ts'), 'utf8')
  if (!panelText.includes("from 'grph-shared/dom/overlayPointerGuards'")
    || !panelText.includes('readOverlayPointerTargetState')
    || !panelText.includes('shouldBlockOverlayPanTarget(pointerTarget, { scrollSurfaceCanForwardPointer })')) {
    throw new Error('expected RichMediaPanel to reuse shared overlay pointer target/button guards')
  }
  if (!panelText.includes('pointerTarget.isSelectableSurface && !installOverlayPan')) {
    throw new Error('expected selectable Rich Media surfaces to keep drag ownership when overlay pan handlers are installed')
  }
  if (!panelText.includes('const directMediaPreviewUsesCollectivePan =')
    || !panelText.includes('storyboardWidgetInteractionMode && props.headerPinned === true && !installHeaderDrag')
    || !panelText.includes('const directMediaPreviewClaimsPointerDown = !installOverlayPan && !directMediaPreviewUsesCollectivePan')
    || !panelText.includes('const directMediaPreviewMarksSelectableSurface = !directMediaPreviewUsesCollectivePan')
    || !panelText.includes('claimPointerDown: directMediaPreviewClaimsPointerDown')) {
    throw new Error('expected direct Rich Media surfaces to fall through to collective pinned pan when local overlay drag is disabled')
  }
  if (!panelText.includes('handleRichMediaPanelOverlayNativeDragStartCapture')
    || !panelText.includes("root.addEventListener('pointerdown', handleNativeStart, { capture: true })")
    || !panelText.includes("root.addEventListener('mousedown', handleNativeStart, { capture: true })")) {
    throw new Error('expected RichMediaPanel surface state to install native capture drag ownership for Storyboard/Flow 2D panels')
  }
  const overlayDragPath = resolve(process.cwd(), 'src', 'components', 'RichMediaPanelOverlayDrag.ts')
  const overlayDragText = readFileSync(overlayDragPath, 'utf8')
  if (!overlayDragText.includes("from 'grph-shared/dom/overlayPointerGuards'")
    || !overlayDragText.includes('readOverlayPointerTargetState')
    || !overlayDragText.includes('isOverlayPanStartButtonEvent(native)')
    || !overlayDragText.includes('shouldBlockOverlayPanTarget(pointerTarget, { scrollSurfaceCanForwardPointer })')
    || !overlayDragText.includes('startRichMediaPanelOverlayPan(native, args.handlers, dragTarget)')
    || !overlayDragText.includes('export const handleRichMediaPanelOverlayNativeDragStartCapture')) {
    throw new Error('expected RichMediaPanel overlay drag owner to reuse shared overlay pointer target/button guards')
  }

  const pointerGuardPath = resolve(process.cwd(), '..', 'grph-shared', 'src', 'dom', 'overlayPointerGuards.ts')
  const pointerGuardText = readFileSync(pointerGuardPath, 'utf8')
  const overlayProxyPath = resolve(process.cwd(), 'src', 'lib', 'canvas', 'storyboard-widget-overlay-proxy.ts')
  const overlayProxyText = readFileSync(overlayProxyPath, 'utf8')
  if (!pointerGuardText.includes('export function readOverlayPointerTargetState')
    || !pointerGuardText.includes('export function shouldBlockOverlayPanTarget')
    || !pointerGuardText.includes('export function isOverlayPanStartButtonEvent')
    || !pointerGuardText.includes('selectableSurface: \'[data-kg-rich-media-selectable-surface="1"]\'')) {
    throw new Error('expected shared overlay pointer guard to own target classification, pan blocking, and button interpretation')
  }
  if (!overlayProxyText.includes("import { MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR, MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE } from '@/lib/cards/mediaPreviewSurfaceSelection'")
    || !overlayProxyText.includes('[${MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR}="${MEDIA_PREVIEW_SELECTABLE_SURFACE_VALUE}"]')
    || !overlayProxyText.includes('STORYBOARD_WIDGET_OVERLAY_INTERACTIVE_SELECTOR')) {
    throw new Error('expected Storyboard Widget overlay proxy to classify shared media preview selectable surfaces as protected overlay interaction targets')
  }

  const overlayInteractionsPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useOverlayInteractions2d.ts')
  const overlayInteractionsText = readFileSync(overlayInteractionsPath, 'utf8')
  const panTransformIndex = overlayInteractionsText.indexOf('zoom.transform as unknown as')
  const requestScheduleIndex = overlayInteractionsText.indexOf('requestOverlaySchedule?.()', panTransformIndex)
  if (panTransformIndex < 0 || requestScheduleIndex < 0) {
    throw new Error('expected 2D overlay pan moves to request the shared overlay layout schedule after viewport transforms')
  }
}

export function testRichMediaPanelStoryboardWidgetReusesSharedFloatingToolbarVariant() {
  const toolbarPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorActionsToolbar.tsx')
  const overlayEditorPanelPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorPanel.tsx')
  const overlayEditorFormPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorForm.tsx')
  const overlayEditorPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorView.tsx')
  const toolbarHookPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetRichMediaToolbar.ts')
  const sharedToolbarPropsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'richMediaOverlayToolbarProps.ts')
  const sharedBubbleToolbarPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'widgetBubbleToolbarPresentation.ts')
  const panelChromePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'StoryboardWidgetPanelChrome.tsx')
  const flowCanvasOverlayPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const flowCanvasHeaderToolbarPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'flowCanvasRichMediaPanelHeaderToolbar.ts')
  const flowCanvasMediaOverlayWorldPointPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'flowCanvasMediaOverlayWorldPoint.ts')
  const flowCanvasToolbarPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasRichMediaOverlayToolbar.tsx')
  const graphCanvasToolbarPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'components', 'RichMediaOverlayLayer2d.tsx')
  const richMediaShellPath = resolve(process.cwd(), 'src', 'components', 'RichMediaPanelShell.tsx')
  const storyboardToolbarPropsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardCanvas', 'storyboardToolbarProps.ts')
  const panelText = readRichMediaPanelSourceBundle()
  const toolbarText = readFileSync(toolbarPath, 'utf8')
  const overlayEditorPanelText = readFileSync(overlayEditorPanelPath, 'utf8')
  const overlayEditorFormText = [overlayEditorFormPath, resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorFormContent.tsx')].map(path => readFileSync(path, 'utf8')).join('\n')
  const overlayEditorText = readFileSync(overlayEditorPath, 'utf8')
  const toolbarHookText = readFileSync(toolbarHookPath, 'utf8')
  const sharedToolbarPropsText = readFileSync(sharedToolbarPropsPath, 'utf8')
  const sharedBubbleToolbarText = readFileSync(sharedBubbleToolbarPath, 'utf8')
  const panelChromeText = readFileSync(panelChromePath, 'utf8')
  const flowCanvasOverlayText = readFileSync(flowCanvasOverlayPath, 'utf8')
  const flowCanvasHeaderToolbarText = readFileSync(flowCanvasHeaderToolbarPath, 'utf8')
  const flowCanvasMediaOverlayWorldPointText = readFileSync(flowCanvasMediaOverlayWorldPointPath, 'utf8')
  const flowCanvasToolbarText = readFileSync(flowCanvasToolbarPath, 'utf8')
  const graphCanvasToolbarText = readFileSync(graphCanvasToolbarPath, 'utf8')
  const richMediaShellText = readFileSync(richMediaShellPath, 'utf8')
  const storyboardToolbarPropsText = readFileSync(storyboardToolbarPropsPath, 'utf8')

  if (panelText.includes('WidgetEditorActionsToolbar')) throw new Error('expected RichMediaPanel to stop mounting its own widget-like floating toolbar and defer toolbar ownership upstream')
  if (!sharedToolbarPropsText.includes('buildWidgetBubbleToolbarPresentation({') || !sharedToolbarPropsText.includes("placement: 'flow-widget-above-center'")) throw new Error('expected shared 2D Rich Media toolbar placement to reuse the Storyboard Widget above-center bubble-toolbar presentation helper')
  for (const stale of ['flow-rich-media-right-middle', 'FLOW_RICH_MEDIA_BUBBLE_TOOLBAR_NAV_STYLE', "'right-middle'", 'absolute left-full top-1/2', "left: '100%'", "transform: 'translateY(-50%)'"]) {
    if (sharedBubbleToolbarText.includes(stale)) throw new Error(`expected the shared bubble-toolbar presentation helper to remove stale generic Rich Media side placement: ${stale}`)
  }
  for (const snippet of ['RICH_MEDIA_OVERLAY_ACTION_VISIBILITY', 'run: false', 'updateKvEntry: false', 'clearOutput: false', 'help: false', 'openInSidepane: true', 'duplicate: true', 'remove: true']) {
    if (!sharedToolbarPropsText.includes(snippet)) {
      throw new Error(`expected shared Rich Media overlay toolbar props to suppress stale click-open actions through the view-switch mask: ${snippet}`)
    }
  }
  if (!storyboardToolbarPropsText.includes('buildWidgetBubbleToolbarPresentation({') || !storyboardToolbarPropsText.includes("placement: 'flow-widget-above-center'")) {
    throw new Error('expected Storyboard card/widget toolbar placement to reuse the Storyboard Widget bubble-toolbar presentation helper')
  }
  for (const snippet of ["export type WidgetBubbleToolbarPlacement = 'flow-widget-above-center'", "const WIDGET_BUBBLE_TOOLBAR_NAV_CLASS_NAME = 'absolute inset-x-0 mx-auto z-10'", 'top: -WIDGET_ACTIONS_TOOLBAR_OFFSET_PX']) {
    if (!sharedBubbleToolbarText.includes(snippet)) throw new Error(`expected the shared bubble-toolbar presentation helper to own the canonical above-center placement: ${snippet}`)
  }
  if (sharedBubbleToolbarText.includes("transform: 'translateX(-50%)'")) throw new Error('expected CSS-zoomed bubble toolbars not to retain transform-based centering during drag')
  if (sharedBubbleToolbarText.includes('absolute bottom-full left-1/2')) throw new Error('expected the shared bubble-toolbar presentation helper to remove stale Storyboard-only bottom-full placement')
  if (flowCanvasOverlayText.includes('onPointerDownCapture={richMediaPanelHeaderToolbar.activate}')) {
    throw new Error('expected Rich Media overlay shell not to preempt shared panel header drag with a parent capture-phase activation')
  }
  if (!flowCanvasOverlayText.includes('scheduleLayout: flushMediaOverlayLayout')) {
    throw new Error('expected Rich Media pin transitions to flush shared geometry before overlay-edge recomputation')
  }
  if (!panelText.includes('props.onPointerDownCapture?.(event)')
    || !panelText.includes('const handled = handleRootDragStartCapture(event)')
    || panelText.indexOf('props.onPointerDownCapture?.(event)') > panelText.indexOf('const handled = handleRootDragStartCapture(event)')) {
    throw new Error('expected RichMediaPanel root capture to delegate upstream activation before local drag routing can early-return')
  }
  if (panelText.includes('shouldShowRichMediaFloatingToolbar({')) {
    throw new Error('expected RichMediaPanel to stop deriving floating-toolbar visibility locally after upstream toolbar consolidation')
  }
  if (panelText.includes('data-kg-rich-media-floating-toolbar="1"')) {
    throw new Error('expected RichMediaPanel render surface to stop exposing a duplicate floating-toolbar shell marker')
  }
  if (panelText.includes('data-kg-panel-action="1"')) {
    throw new Error('expected RichMediaPanel to remove the legacy inline header action variant after consolidation')
  }
  for (const snippet of [
    "const hasValidateAction = showValidate && typeof onValidate === 'function'",
    "const hasHeaderActions = hasValidateAction || hasFieldToggleAction || hasMinimizeAction || hasPinAction",
    '{hasHeaderActions ? (',
  ]) {
    if (!panelChromeText.includes(snippet)) {
      throw new Error(`expected StoryboardWidgetPanelChrome to suppress inert Rich Media header action variants: ${snippet}`)
    }
  }
  for (const snippet of [
    "showPinToggle={typeof props.onHeaderTogglePinned === 'function'}",
    "showMinimizeToggle={typeof props.onHeaderToggleMinimized === 'function'}",
    'onHeaderPointerDown={model.handleRootPointerDownCapture}',
    'onHeaderMouseDown={model.handleRootMouseDownCapture}',
  ]) {
    if (!richMediaShellText.includes(snippet)) {
      throw new Error(`expected RichMediaPanelShell not to force stale header controls without callbacks: ${snippet}`)
    }
  }
  for (const snippet of ['onHeaderMouseDown?: (event: React.MouseEvent<HTMLElement>) => void', 'const handleHeaderMouseDown = React.useCallback((event: React.MouseEvent<HTMLElement>) => {', 'if (shouldStoryboardWidgetHeaderYieldToInteractiveTarget(event.target)) return', 'onMouseDown={handleHeaderMouseDown}']) {
    if (!panelChromeText.includes(snippet)) throw new Error(`expected shared Storyboard Widget panel chrome header to expose guarded mouse fallback drag ownership: ${snippet}`)
  }
  if (richMediaShellText.includes('showPinToggle={true}')) {
    throw new Error('expected RichMediaPanelShell not to force stale Rich Media header pin controls without callbacks')
  }
  if (!overlayEditorPanelText.includes("from '@/components/RichMediaPanel'")
    || !overlayEditorPanelText.includes('<RichMediaPanel')) {
    throw new Error('expected WidgetEditorPanel to reuse the shared RichMediaPanel render shell instead of a bespoke preview surface')
  }
  if (overlayEditorPanelText.includes('showFloatingToolbar={false}')) {
    throw new Error('expected WidgetEditorPanel to stop suppressing the shared RichMediaPanel floating toolbar after consolidation')
  }
  if (!overlayEditorPanelText.includes('panel={richMediaPanelState || undefined}')) {
    throw new Error('expected WidgetEditorPanel to pass canonical rich-media panel state into the shared RichMediaPanel shell')
  }
  if (!overlayEditorPanelText.includes('widgetToolbarActive={false}')) {
    throw new Error('expected WidgetEditorPanel to disable duplicate in-body RichMediaPanel toolbar ownership')
  }
  if (!overlayEditorPanelText.includes('storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}')
    || !overlayEditorPanelText.includes('headerPinned={pinned}')
    || !overlayEditorPanelText.includes('pinnedInCanvas={pinned}')
    || !overlayEditorText.includes('storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}')
    || !overlayEditorFormText.includes('storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}')
    || !overlayEditorFormText.includes('headerPinned={pinnedInCanvas === true}')) {
    throw new Error('expected Storyboard Widget RichMediaPanel widget preview to propagate surface id into the shared Rich Media root')
  }
  if (overlayEditorPanelText.includes("richMediaPreview?.kind === 'image' && richMediaPreview.url ? (")) {
    throw new Error('expected WidgetEditorPanel to remove the legacy bespoke image/video/iframe preview branches after consolidation')
  }
  if (!overlayEditorText.includes('richMediaViewToggle={isRichMediaPanelWidget ? richMediaPanelToolbarProps.richMediaViewToggle : undefined}')) {
    throw new Error('expected WidgetEditor to own the Rich Media view toggle through the real outer widget floating toolbar')
  }
  if (!overlayEditorText.includes('actionVisibility={isRichMediaPanelWidget ? richMediaPanelToolbarProps.actionVisibility : undefined}')) {
    throw new Error('expected WidgetEditor to suppress duplicate Rich Media Panel click-open toolbar actions through the shared view-switch mask')
  }
  for (const stale of [
    'richMediaMediaSelector={isRichMediaPanelWidget ? richMediaPanelToolbarProps.richMediaMediaSelector : undefined}',
    'richMediaAspectToggle={isRichMediaPanelWidget ? richMediaPanelToolbarProps.richMediaAspectToggle : undefined}',
    'richMediaTextModeToggle={isRichMediaPanelWidget ? richMediaPanelToolbarProps.richMediaTextModeToggle : undefined}',
    'openExternalAction={isRichMediaPanelWidget ? richMediaPanelToolbarProps.openExternalAction : undefined}',
  ]) {
    if (overlayEditorText.includes(stale)) {
      throw new Error(`expected WidgetEditor to remove stale Rich Media toolbar control: ${stale}`)
    }
  }
  for (const snippet of [
    "from '@/components/FlowCanvas/FlowCanvasRichMediaOverlayToolbar'",
    '<FlowCanvasRichMediaOverlayToolbar',
    'data-kg-rich-media-storyboard-widget-overlay-shell="1"',
    'resolveFlowWidgetStateGraphKey',
    'resolveScopedFlowWidgetNodeMap',
    'const useStoryboardWidgetRichMediaPanelHeaderToolbar = storyboardSharedSurfaceRendererMode',
    'const flowWidgetPinnedByNodeIdByGraphMetaKey = useGraphStore(s => s.flowWidgetPinnedByNodeIdByGraphMetaKey)',
    '() => flowWidgetStateGraphKeyOverride ?? resolveFlowWidgetStateGraphKey({ graphData: sceneGraphData })',
    'const effectiveFlowWidgetPinnedByNodeId = React.useMemo(() => flowWidgetPinnedByNodeIdOverride || resolveScopedFlowWidgetNodeMap({',
    'graphMetaKey: flowWidgetStateGraphKey',
    'keyedByGraphMetaKey: flowWidgetPinnedByNodeIdByGraphMetaKey',
    'resolveFlowCanvasMediaOverlayPinnedInCanvas',
    'isFlowWidgetHeaderDragAllowedByPin',
    'nodeProperties={sceneNodePropsByIdRef.current.get(node.id) || {}}',
    'panel={node.panel}',
	    'openUrl={node.openUrl}',
	    'sceneGraphData={sceneGraphData}',
	    'workspaceMutationBlockedRef={workspaceMutationBlockedRef}',
	    'onRemoveNode={onNodeRemove}',
	    'buildFlowCanvasRichMediaPanelHeaderToolbar({',
	    'onPointerDownCapture={event => {',
	    'richMediaPanelHeaderToolbar.activate()',
	    'flowWidgetPinnedByNodeId: effectiveFlowWidgetPinnedByNodeId',
    '{...richMediaPanelHeaderToolbar.panelProps}',
    'mediaOverlayWorldPositionOverrideRef.current.set(id, next)',
    'const preserveMediaOverlayScreenPlacementForPinTransition = React.useCallback((id: string) => {',
    'const point = readElementWorldTopLeft2d(',
    'if (point) persistResolvedMediaOverlayWorldPosition(id, point)',
    'onBeforePinnedChange: () => preserveMediaOverlayScreenPlacementForPinTransition(node.id)',
    'mediaOverlayWorldPositionOverrideRef.current.get(id)',
    'const start = readNodeWorldTopLeft2d(node) || mediaOverlayWorldPositionOverrideRef.current.get(id)',
    'readElementWorldTopLeft2d(mediaOverlayElsRef.current.get(id), runtime?.transform)',
    'if (!start) return',
    'const richMediaPanelPinned = resolveFlowCanvasMediaOverlayPinnedInCanvas({',
    'const richMediaPanelPinAllowsMovement = isFlowWidgetHeaderDragAllowedByPin({',
    'pinnedInCanvas: richMediaPanelPinned',
    'const richMediaPanelMoveEnabled = headerDragInteractionActive && (containedByGroupPanel || richMediaPanelPinAllowsMovement)',
    'const richMediaPanelOverlayPanEnabled = overlayInteractionEnabled && (containedByGroupPanel || richMediaPanelPinAllowsMovement) && !richMediaBodyPanOwnedByCollective',
    'const bodyDragMovesRichMediaPanel = richMediaPanelMoveEnabled',
    "data-kg-rich-media-storyboard-widget-pinned={richMediaPanelPinned ? '1' : '0'}",
    'if (bodyDragMovesRichMediaPanel) { beginMediaOverlayHeaderDrag(node.id, payload.pointerId); return }',
    'if (bodyDragMovesRichMediaPanel) { finishMediaOverlayHeaderDrag(node.id, payload.pointerId); return }',
    'if (onNodeChange) onNodeChange(id, patch, mutationSourceGraphData)',
    'useGraphStore.getState().updateNode(id, patch as Partial<GraphNode>)',
    'fx: finalPoint.x,',
    'fy: finalPoint.y,',
    'x: finalPoint.x,',
    'y: finalPoint.y,',
    'getNodeWorldTopLeftForId: storyboardRichMediaWorldTransformProjectionMode ? id => {',
    "const [activeRichMediaPanelId, setActiveRichMediaPanelId] = React.useState('')",
    'isCanonicalNodeIdEqual(selectedNodeId, node.id)',
    'isCanonicalNodeIdEqual(activeRichMediaPanelId, node.id)',
    'visible={isSelected}',
  ]) {
    if (!flowCanvasOverlayText.includes(snippet)) {
      throw new Error(`expected Storyboard Widget Rich Media overlay owner to mount the shared floating toolbar shell: ${snippet}`)
    }
  }
  for (const snippet of [
    'workspaceMutationBlockedRef.current && !props.onRemoveNode',
    'if (props.onRemoveNode) props.onRemoveNode(nodeId)',
  ]) {
    if (!flowCanvasToolbarText.includes(snippet)) throw new Error(`expected source-backed Rich Media removal to bypass the mutable-store guard through the shared remover: ${snippet}`)
  }
  const pinTransitionStart = flowCanvasOverlayText.indexOf('const preserveMediaOverlayScreenPlacementForPinTransition')
  const pinTransitionEnd = flowCanvasOverlayText.indexOf('const strybldrStoryboardCardAspectMode', pinTransitionStart)
  const pinTransitionBlock = pinTransitionStart >= 0 && pinTransitionEnd > pinTransitionStart
    ? flowCanvasOverlayText.slice(pinTransitionStart, pinTransitionEnd)
    : ''
  if (!pinTransitionBlock || pinTransitionBlock.includes('nextPinned')) {
    throw new Error('expected Rich Media pin and unpin transitions to preserve painted screen position symmetrically')
  }
  if (
    flowCanvasOverlayText.includes('const bodyDragMovesRichMediaPanel = headerDragInteractionActive && (flowWidgetPinnedByNodeId || {})[node.id] === false')
    || flowCanvasOverlayText.includes('const bodyDragMovesRichMediaPanel = headerDragInteractionActive && effectiveFlowWidgetPinnedByNodeId[node.id] === false')
  ) {
    throw new Error('expected Storyboard Rich Media body drag to use graph-scoped widget pin state instead of the raw global map')
  }
  for (const snippet of [
    'onHeaderDragStart={richMediaPanelMoveEnabled ?',
    'onHeaderDrag={richMediaPanelMoveEnabled ?',
    'onHeaderDragEnd={richMediaPanelMoveEnabled ?',
    'onOverlayPanStart={richMediaPanelOverlayPanEnabled ?',
    'onOverlayPan={richMediaPanelOverlayPanEnabled ?',
    'onOverlayPanEnd={richMediaPanelOverlayPanEnabled ?',
  ]) {
    if (!flowCanvasOverlayText.includes(snippet)) {
      throw new Error(`expected pinned Storyboard Rich Media panels to disable header movement: ${snippet}`)
    }
  }
  if (flowCanvasOverlayText.includes('{useStoryboardWidgetRichMediaPanelHeaderToolbar ? null')) {
    throw new Error('expected Storyboard Rich Media panels to reuse the Storyboard Widget Rich Media bubble toolbar instead of suppressing it')
  }
  if (flowCanvasOverlayText.includes('const start = node ? { x: node.x, y: node.y }')) {
    throw new Error('expected Storyboard Rich Media drag to reject scene nodes without finite top-left geometry before DOM fallback')
  }
  if (flowCanvasOverlayText.includes('mediaOverlayWorldPositionOverrideRef.current.delete(id)')) {
    throw new Error('expected Storyboard Rich Media drag end to retain the visible world-position override until graph state catches up')
  }
  if (
    flowCanvasOverlayText.includes('if (!active || !mediaOverlayDragInteractionMode) return')
    || flowCanvasOverlayText.includes('}, [active, mediaOverlayDragInteractionMode, runtimeRef])')
    || flowCanvasOverlayText.includes('}, [active, mediaNodes, mediaOverlayDragInteractionMode, runtimeRef')
  ) {
    throw new Error('expected rendered Storyboard Rich Media overlay pan/header drag to avoid stale active-prop gating')
  }
  for (const snippet of [
    'return resolveEffectiveFlowWidgetPinnedInCanvas(args)',
    'const parentRect = el.offsetParent instanceof Element ? el.offsetParent.getBoundingClientRect() : null',
    'if (!transform) return { x: localX, y: localY }',
    'return { x: transform.invertX(localX), y: transform.invertY(localY) }',
  ]) {
    if (!flowCanvasMediaOverlayWorldPointText.includes(snippet)) {
      throw new Error(`expected shared media overlay world-point helper to own DOM fallback geometry: ${snippet}`)
    }
  }
  for (const snippet of [
    'export function buildFlowCanvasRichMediaPanelHeaderToolbar',
    'args.setActiveRichMediaPanelId(nodeId)',
    "from '@/lib/storyboardWidget/flowWidgetPinnedState'",
    "from '@/lib/storyboardWidget/widgetStateScope'",
    'const commitTogglePinned = () => {',
    'resolveScopedFlowWidgetNodeMap({',
    'markFlowWidgetPinPointerActivation(nodeId)',
    'if (shouldSkipFlowWidgetPinClickAfterPointerActivation(nodeId)) return',
    'commitTogglePinned()',
    'toggleFlowWidgetPinnedById(pinnedByIdWithDefault, nodeId)',
    'st.setFlowWidgetPinnedByNodeIdForGraph(args.flowWidgetStateGraphKey, nextPinnedById)',
    'args.onBeforePinnedChange?.(nextPinned)',
    'onBeforePinnedChange: args.onBeforePinnedChange',
    'args.onPinnedChange?.(nextPinned)',
    'onPinnedChange: () => {',
    'args.scheduleLayout()',
    'args.requestCommit()',
	    'widgetToolbarActive: args.isSelected',
    'onHeaderTogglePinned: togglePinned',
  ]) {
    if (!flowCanvasHeaderToolbarText.includes(snippet)) {
      throw new Error(`expected Storyboard Rich Media panels to reuse Storyboard Widget header-toolbar controls through the shared helper: ${snippet}`)
    }
  }
  if (flowCanvasHeaderToolbarText.includes('toggleSize') || flowCanvasHeaderToolbarText.includes('onHeaderToggleMinimized')) throw new Error('expected Storyboard Rich Media headers to remove the stale compact-size variant and reuse the shared Card frame size')
  if (flowCanvasHeaderToolbarText.includes('st.setFlowWidgetPinnedByNodeId({ ...pinnedById, [nodeId]: !pinned })')) {
    throw new Error('expected Storyboard Rich Media pin toggles to write through explicit graph-scoped widget state')
  }
  if (!panelText.includes("'data-kg-rich-media-header-pinned': typeof props.headerPinned === 'boolean' ? (props.headerPinned ? '1' : '0') : undefined")) {
    throw new Error('expected Rich Media root state to expose effective header pin state for runtime verification')
  }
  for (const snippet of [
    'buildSharedRichMediaOverlayControlProps',
    'richMediaViewToggle',
    'RICH_MEDIA_OVERLAY_ACTION_VISIBILITY',
    'onSwitchToKtvRows',
  ]) {
    if (!sharedToolbarPropsText.includes(snippet)) throw new Error(`expected shared Rich Media toolbar controls to retain only the view-switch contract: ${snippet}`)
  }
  for (const stale of ['richMediaMediaSelector', 'richMediaAspectToggle', 'richMediaTextModeToggle', 'openExternalAction: buildWidgetOpenExternalAction']) {
    if (sharedToolbarPropsText.includes(stale)) throw new Error(`expected shared Rich Media overlay toolbar helper to remove stale control: ${stale}`)
  }
  for (const snippet of ['buildSharedRichMediaOverlayControlProps({', '{...toolbarControlProps}']) {
    if (!graphCanvasToolbarText.includes(snippet)) throw new Error(`expected Storyboard Rich Media overlay to reuse shared toolbar controls: ${snippet}`)
  }
  for (const snippet of [
    "import { buildFlowCanvasHeaderPinProps } from '@/components/FlowCanvas/flowCanvasRichMediaPanelHeaderToolbar'",
    'resolveFlowWidgetStateGraphKey',
    'resolveScopedFlowWidgetNodeMap',
    'const flowWidgetPinnedByNodeId = useGraphStore(s => s.flowWidgetPinnedByNodeId)',
    'const flowWidgetPinnedByNodeIdByGraphMetaKey = useGraphStore(s => s.flowWidgetPinnedByNodeIdByGraphMetaKey)',
    'const effectiveFlowWidgetPinnedByNodeId = React.useMemo(() => resolveScopedFlowWidgetNodeMap({',
    'const richMediaPanelPinned = readFlowWidgetPinnedInCanvas(effectiveFlowWidgetPinnedByNodeId, n.id)',
    'isFlowWidgetHeaderDragAllowedByPin',
    'const richMediaPanelPinAllowsMovement = isFlowWidgetHeaderDragAllowedByPin({',
    'pinnedInCanvas: richMediaPanelPinned',
    'const richMediaPanelMoveEnabled = richMediaPanelPinAllowsMovement',
    'const richMediaPanelOverlayPanEnabled = richMediaPanelPinAllowsMovement',
    'const headerPinProps = buildFlowCanvasHeaderPinProps({',
    'flowWidgetPinnedByNodeId: effectiveFlowWidgetPinnedByNodeId',
    'flowWidgetStateGraphKey',
    'onPinnedChange: () => requestMediaOverlaySchedule?.()',
    'data-kg-rich-media-overlay-pinned={richMediaPanelPinned ? \'1\' : \'0\'}',
    'return richMediaPanelMoveEnabled',
    'onHeaderDragStart={richMediaPanelMoveEnabled ?',
    'onHeaderDrag={richMediaPanelMoveEnabled ?',
    'onHeaderDragEnd={richMediaPanelMoveEnabled ?',
    'onOverlayPanStart={richMediaPanelOverlayPanEnabled ?',
    'onOverlayPan={richMediaPanelOverlayPanEnabled ?',
    'onOverlayPanEnd={richMediaPanelOverlayPanEnabled ?',
    '{...headerPinProps}',
  ]) {
    if (!graphCanvasToolbarText.includes(snippet)) {
      throw new Error(`expected D3 Rich Media panel pin controls to reuse graph-scoped Card pin utilities: ${snippet}`)
    }
  }
  for (const snippet of ['setActivePanelId(prev => (prev === key ? \'\' : prev))', 'updateOpenWidgetNodeIds(prev => prev.filter(nodeId => String(nodeId || \'\').trim() !== key))', 'requestMediaOverlaySchedule?.()']) {
    if (!graphCanvasToolbarText.includes(snippet)) throw new Error(`expected D3 Rich Media Remove to clear local toolbar state and schedule overlay removal: ${snippet}`)
  }
  for (const snippet of [
    "from '@/components/StoryboardWidget/WidgetEditorActionsToolbar'",
    "from '@/components/StoryboardWidget/richMediaOverlayToolbarProps'",
    'buildSharedRichMediaOverlayControlProps',
    'const toolbarControlProps = React.useMemo(() => buildSharedRichMediaOverlayControlProps({',
    'onSwitchToKtvRows: () => {',
    'lsSetBool(LS_KEYS.flowWidgetRichMediaKtvRows, true)',
    '<WidgetEditorActionsToolbar',
    '{...buildSharedRichMediaOverlayToolbarProps()}',
    '{...toolbarControlProps}',
    'onOpenInSidepane={openInSidepane}',
    'onDuplicate={duplicate}',
    'onRemove={remove}',
  ]) {
    if (!flowCanvasToolbarText.includes(snippet)) {
      throw new Error(`expected Storyboard Widget Rich Media overlay owner to reuse the shared floating toolbar variant: ${snippet}`)
    }
  }
  for (const stale of [
    'richMediaTextModeToggle?: {',
    'data-kg-rich-media-text-mode-toggle="1"',
    'data-kg-rich-media-open-source="1"',
    'data-kg-rich-media-media-selector="1"',
    'data-kg-rich-media-aspect-toggle="1"',
    'openExternalAction: buildWidgetOpenExternalAction({',
  ]) {
    if (toolbarText.includes(stale) || toolbarHookText.includes(stale) || flowCanvasToolbarText.includes(stale)) {
      throw new Error(`expected consolidated Rich Media bubble toolbar to remove stale variant control: ${stale}`)
    }
  }
}
