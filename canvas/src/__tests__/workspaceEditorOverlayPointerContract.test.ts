import { resolveRepoSourcePath } from '@/tests/lib/repoTestData'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveStoryboardWidgetVisibleViewport } from '@/components/FlowCanvas/applyZoomRequestNative'
import { resolveWorkspacePreviewWidthFromPointerDrag } from '@/features/canvas/useCanvasWorkspacePaneRuntime'
import { shouldUseStoryboardWidgetScreenAuthorityCollectivePan } from '@/lib/storyboardWidget/screenAuthorityCollectivePan'
import {
  WORKSPACE_EDITOR_CANVAS_GUTTER_CSS,
  WORKSPACE_EDITOR_CANVAS_GUTTER_PX,
  WORKSPACE_EDITOR_PANE_DEFAULT_VIEWPORT_RATIO,
  resolveWorkspaceCanvasMinVisibleStripPx,
  resolveWorkspaceEditorPaneDefaultWidthPx,
  resolveWorkspaceEditorPaneMinWidthPx,
  resolveWorkspaceExplorerDefaultWidthPx,
  resolveWorkspacePaneMaxWidthPx,
} from '@/features/workspace-table/workspaceViewCanvasDefaults'
import { STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const setFixedElementRect = (
  el: HTMLElement,
  rect: { left: number; top: number; right: number; bottom: number },
) => {
  const width = Math.max(0, rect.right - rect.left)
  const height = Math.max(0, rect.bottom - rect.top)
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width,
      height,
      toJSON: () => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width, height }),
    } as DOMRect),
  })
}

function readMarkdownDesignOverlaySourceText(): string {
  return readFileSync(resolveRepoSourcePath('canvas/src/lib/markdown-edgeless/MarkdownDesignOverlay.impl.tsx'), 'utf8')
}

export function testWorkspaceEditorOverlayDoesNotInstallBlockingScrim() {
  const text = readMarkdownDesignOverlaySourceText()
  if (!text.includes('pointer-events-none')) {
    throw new Error('expected MarkdownDesignOverlay root to be pointer-events-none by default')
  }
  if (!text.includes("pointerEvents: 'none'")) {
    throw new Error('expected MarkdownDesignOverlay drag mask to be pointerEvents none')
  }
}

export function testGraphDataTableOverlayDoesNotUseFullscreenScrim() {
  const p = resolve(process.cwd(), 'src', 'features', 'graph-data-table', 'ui', 'GraphDataTablePanelOverlay.tsx')
  const text = readFileSync(p, 'utf8')
  if (text.includes('inset: 0') || text.includes('inset-0') || text.includes('fixed inset-0')) {
    throw new Error('expected GraphDataTablePanelOverlay not to render a fullscreen scrim')
  }
}

export function testWorkspaceEditorOverlayDoesNotMutateDesignCanvasLayout() {
  const p = resolve(process.cwd(), 'src', 'components', 'DesignCanvas.tsx')
  const text = readFileSync(p, 'utf8')
  const cleanupPath = resolve(process.cwd(), 'src', 'components', 'DesignCanvas', 'useGlobalInteractionCleanup.ts')
  const cleanupText = readFileSync(cleanupPath, 'utf8')
  if (!text.includes('const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({ workspaceViewMode: snapshot.workspaceViewMode, workspaceCanvasPaneOpen: snapshot.workspaceCanvasPaneOpen })')) {
    throw new Error('expected DesignCanvas to derive explicit workspace editor overlay-open state from the canonical SSOT')
  }
  if (!text.includes('const interactionActive = active && !workspaceEditorOverlayOpen')) {
    throw new Error('expected DesignCanvas interactions to be gated only by actual workspace editor overlay-open state')
  }
  if (!text.includes('const workspaceEditorOverlayEnabled = workspaceEditorOverlayOpen && active && !!String(snapshot.markdownDocumentText || \'\').trim()')) {
    throw new Error('expected DesignCanvas markdown workspace overlay to enable only while the workspace editor overlay is open')
  }
  if (!text.includes('event.stopPropagation()')) {
    throw new Error('expected DesignCanvas workspace overlay events to stop propagation before reaching the canvas underneath')
  }
  if (!text.includes('const arrangeActionsActive = active && !workspaceEditorOverlayOpen')) {
    throw new Error('expected arrange actions to disable only while workspace editor overlay is actually open')
  }
  if (!text.includes('arrangeActionsActive={arrangeActionsActive}')) {
    throw new Error('expected DesignCanvas to forward overlay-gated arrange action state')
  }
  if (!text.includes('if (!interactionActive) return')) {
    throw new Error('expected DesignCanvas layout writes to short-circuit while workspace editor overlay is enabled')
  }
  const renderShellPath = resolve(process.cwd(), 'src', 'components', 'DesignCanvas', 'DesignCanvasRenderShell.tsx')
  const renderShellText = readFileSync(renderShellPath, 'utf8')
  if (!renderShellText.includes('if (!interactionActive) return\n                        if (isSpacePanHeld()) return')) {
    throw new Error('expected group selection pointerdown to stop reacting while workspace editor overlay is enabled')
  }
  if (!text.includes('useGlobalInteractionCleanup({\n    interactionActive,')) {
    throw new Error('expected DesignCanvas to forward interactionActive into shared global interaction cleanup')
  }
  if (!cleanupText.includes('if (interactionActive) return')) {
    throw new Error('expected global interaction cleanup to react when canvas interactivity is disabled')
  }
  if (!cleanupText.includes('cancelAll()')) {
    throw new Error('expected global interaction cleanup to cancel active interactions when editor overlay mode turns on')
  }
}

export function testWorkspaceEditorOverlayDoesNotShrinkCanvasViewport() {
  const p = resolve(process.cwd(), 'src', 'pages', 'Canvas.tsx')
  const text = readFileSync(p, 'utf8')
  const separatorPath = resolve(process.cwd(), 'src', 'components', 'ui', 'VerticalResizeSeparatorHr.tsx')
  const separatorText = readFileSync(separatorPath, 'utf8')
  const viewportPath = resolve(process.cwd(), 'src', 'components', 'CanvasViewport.tsx')
  const viewportText = readFileSync(viewportPath, 'utf8')
  const workspaceSelectPath = resolve(process.cwd(), 'src', 'components', 'toolbar', 'EditorWorkspaceSelect.tsx')
  const workspaceSelectText = readFileSync(workspaceSelectPath, 'utf8')
  const workspaceSsotPath = resolve(process.cwd(), 'src', 'features', 'workspace-table', 'workspaceTableSsot.ts')
  const workspaceSsotText = readFileSync(workspaceSsotPath, 'utf8')
  const workspaceEditorPanePath = resolve(process.cwd(), 'src', 'features', 'workspace-table', 'workspaceEditorPane.ts')
  const workspaceEditorPaneText = readFileSync(workspaceEditorPanePath, 'utf8')
  const uiInitialStatePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'uiSliceInitialState.ts')
  const uiInitialStateText = readFileSync(uiInitialStatePath, 'utf8')
  const workspaceToolbarPath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'MarkdownWorkspaceToolbar.tsx')
  const workspaceToolbarText = readFileSync(workspaceToolbarPath, 'utf8')
  const toolbarToolMenuPath = resolve(process.cwd(), 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const toolbarToolMenuText = readFileSync(toolbarToolMenuPath, 'utf8')
  if (!text.includes('const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({ workspaceViewMode, workspaceCanvasPaneOpen })')) {
    throw new Error('expected Canvas page to derive overlay-open state from canonical store state only')
  }
  if (
    !text.includes('!workspaceEditorOverlayOpen') ||
    !text.includes('aria-label="Canvas Toolbar"')
  ) {
    throw new Error('expected Canvas toolbar visibility to depend on overlay-open state, not workspace editor mode alone')
  }
  if (text.includes('effectiveWorkspaceViewMode')) {
    throw new Error('expected Canvas page not to keep stale effective workspace mode aliases after query bootstrap')
  }
  if (!text.includes('{workspaceCanvasPaneVisible ? (')) {
    throw new Error('expected Canvas page to mount the canvas-side toolbar only while the Canvas pane is checked')
  }
  if (
    !text.includes('workspaceEditorOverlayOpen') ||
    !text.includes('aria-label="Workspace editor overlay shell"')
  ) {
    throw new Error('expected Canvas page to keep the workspace editor overlay mounted throughout editor mode')
  }
  if (!text.includes('aria-label="Workspace editor overlay shell"')) {
    throw new Error('expected Canvas page to render workspace editor in an absolute overlay shell')
  }
  if (!text.includes('layout="full"')) {
    throw new Error('expected Canvas viewport to remain in full layout while workspace editor overlay is active')
  }
  if (!viewportText.includes('data-kg-canvas-viewport-root="1"')) {
    throw new Error('expected Canvas viewport root to expose an explicit canonical viewport marker for downstream measurement')
  }
  if (!viewportText.includes("${workspaceEditorOverlayOpen ? 'z-[420]' : 'z-[201]'}")) {
    throw new Error('expected Canvas viewport minimap overlay to elevate above the workspace editor overlay shell so live Reset/Zoom controls remain reachable while Workspace is open')
  }
  if (text.includes("layout={effectiveWorkspaceViewMode === 'editor' ? 'pane' : 'full'}")) {
    throw new Error('expected Canvas page to avoid pane-layout shrinkage when workspace editor is enabled')
  }
  if (text.includes("style={effectiveWorkspaceViewMode === 'editor' ? (workspaceCanvasPaneOpen ? { width: `${workspacePreviewWidthPx}px` } : undefined) : undefined}")) {
    throw new Error('expected Canvas pane width not to be reduced by workspace editor mode')
  }
  if (!text.includes('visualStyle="centerGrip"')) {
    throw new Error('expected Workspace Editor overlay to use centered resize grip styling instead of a full-height line')
  }
  if (!separatorText.includes("visualStyle?: 'line' | 'centerGrip'")) {
    throw new Error('expected VerticalResizeSeparatorHr to expose a dedicated centered grip variant')
  }
  if (!separatorText.includes("backgroundSize: '1px 3.5rem'")) {
    throw new Error('expected centered grip variant to render a short centered separator instead of a full-height stroke')
  }
  if (text.includes("${workspaceEditorOverlayOpen ? '' : 'hidden'}")) {
    throw new Error('expected Canvas page not to keep a hidden workspace editor separator mounted while the pane is off')
  }
  if (!workspaceSsotText.includes('openWorkspaceEditorPane')) {
    throw new Error('expected workspace editor open flow to stay centralized in a shared helper')
  }
  if (!workspaceEditorPaneText.includes("args.setWorkspaceViewState({ mode: 'editor', paneOpen: true })")) {
    throw new Error('expected shared workspace open helper to reopen the canvas pane atomically and clear stale OFF residue')
  }
  if (!uiInitialStateText.includes('const initialWorkspaceCanvasPaneOpen = lsBool(LS_KEYS.workspaceCanvasPaneOpen, true)')) {
    throw new Error('expected UI initial state to preserve the explicit Canvas pane checkbox state')
  }
  if (!text.includes("style={{ width: workspaceCanvasPaneVisible ? workspacePaneBoundaryCss : '100%' }}")) {
    throw new Error('expected unchecked Canvas pane to let Editor Workspace fully cover the canvas')
  }
  if (!workspaceEditorPaneText.includes("args.setWorkspaceViewState({ mode: 'editor', paneOpen: true })")) {
    throw new Error('expected shared workspace open helper to prefer atomic editor/pane-open transition')
  }
  if (!workspaceSsotText.includes('export function closeWorkspaceView')) {
    throw new Error('expected workspace editor close flow to stay centralized in a shared helper')
  }
  if (!workspaceSelectText.includes('openWorkspaceEditorPane({')) {
    throw new Error('expected toolbar Workspace View editor selection to reuse the shared workspace open helper')
  }
  if (!workspaceSelectText.includes('const state = useGraphStore.getState()')) {
    throw new Error('expected toolbar Workspace View selection to read live store state at click time')
  }
  if (!workspaceSelectText.includes('liveWorkspaceCanvasPaneOpen')) {
    throw new Error('expected toolbar Workspace View selection to route live pane-open state through the shared helper')
  }
  if (!workspaceSelectText.includes('onTriggerClick={handleTriggerClick}')) {
    throw new Error('expected selected Workspace View trigger click to repair stale closed editor pane state directly')
  }
  if (!workspaceSelectText.includes("if (liveWorkspaceViewMode !== 'editor' || liveWorkspaceCanvasPaneOpen === true) return false")) {
    throw new Error('expected Workspace View trigger repair to run only for active editor mode with a closed pane')
  }
  if (workspaceSelectText.includes('closeWorkspaceView({')) {
    throw new Error('expected toolbar Workspace View selection to avoid redundant close-then-open churn when the shared open helper can normalize state directly')
  }
  if (!workspaceSsotText.includes("args.setWorkspaceViewState({ mode: 'canvas', paneOpen: false })")) {
    throw new Error('expected shared workspace close helper to clear mode and pane-open state atomically')
  }
  if (!workspaceToolbarText.includes('setWorkspaceViewState,')) {
    throw new Error('expected workspace close action to pass atomic workspace view transition setter')
  }
  if (!workspaceToolbarText.includes('closeWorkspaceView({')) {
    throw new Error('expected workspace close action to reuse the shared close helper for residue cleanup')
  }
  if (workspaceToolbarText.includes("setWorkspaceViewMode('canvas')")) {
    throw new Error('expected workspace close action to avoid manual canvas-mode fallback bypassing the shared close helper')
  }
  if (!toolbarToolMenuText.includes('const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({ workspaceViewMode, workspaceCanvasPaneOpen })')) {
    throw new Error('expected floating panel runtime to derive workspace editor overlay-open state from SSOT when deciding interactive layering')
  }
  if (!toolbarToolMenuText.includes("return { zIndex: Math.max(safeZ, workspaceEditorOverlayOpen ? 420 : 90) }")) {
    throw new Error('expected floating panel runtime to elevate panel z-index above workspace editor overlay shell so widget controls remain interactive')
  }
}

export function testWorkspaceEditorOverlayResizeHandleDragDirection() {
  const widened = resolveWorkspacePreviewWidthFromPointerDrag({
    startWidthPx: 400,
    startClientX: 100,
    currentClientX: 160,
  })
  if (widened !== 460) {
    throw new Error(`expected rightward drag to widen overlay from 400 to 460, got ${widened}`)
  }

  const narrowed = resolveWorkspacePreviewWidthFromPointerDrag({
    startWidthPx: 400,
    startClientX: 100,
    currentClientX: 40,
  })
  if (narrowed !== 340) {
    throw new Error(`expected leftward drag to narrow overlay from 400 to 340, got ${narrowed}`)
  }

  const minClamped = resolveWorkspacePreviewWidthFromPointerDrag({
    startWidthPx: 330,
    startClientX: 100,
    currentClientX: -200,
  })
  if (minClamped !== 320) {
    throw new Error(`expected overlay width to clamp at 320, got ${minClamped}`)
  }
}

export function testWorkspaceEditorOverlayMaxWidthPreservesUsableCanvasStrip() {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const hadWindow = typeof window !== 'undefined'
  const originalInnerWidth = hadWindow ? window.innerWidth : undefined
  try {
    if (!hadWindow) {
      Object.defineProperty(globalThis, 'window', {
        value: { innerWidth: 1510 },
        configurable: true,
      })
    } else {
      ;(window as unknown as { innerWidth: number }).innerWidth = 1510
    }
    const maxWidth = resolveWorkspacePaneMaxWidthPx({ minPx: 320, rightGutterPx: WORKSPACE_EDITOR_CANVAS_GUTTER_PX })
    const minCanvasStrip = resolveWorkspaceCanvasMinVisibleStripPx()
    const clamped = resolveWorkspacePreviewWidthFromPointerDrag({
      startWidthPx: 982,
      startClientX: 100,
      currentClientX: 1200,
    })
    if (clamped !== maxWidth) {
      throw new Error(`expected resize drag to clamp at workspace max width ${maxWidth}, got ${clamped}`)
    }
    const remainingCanvasStrip = window.innerWidth - clamped
    if (remainingCanvasStrip < minCanvasStrip) {
      throw new Error(`expected workspace max width to preserve at least ${minCanvasStrip}px of canvas, got ${remainingCanvasStrip}px`)
    }
    if (remainingCanvasStrip < 420) {
      throw new Error(`expected workspace max width to preserve a readable canvas strip, got ${remainingCanvasStrip}px`)
    }
  } finally {
    if (hadWindow) {
      ;(window as unknown as { innerWidth: number }).innerWidth = originalInnerWidth as number
    } else if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }
}

export function testStoryboardWidgetVisibleViewportIgnoresEditorWorkspaceOverlayPane() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const surface = dom.window.document.createElement('section')
    surface.setAttribute(STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR, 'surface-a')
    setFixedElementRect(surface, { left: 0, top: 0, right: 1000, bottom: 800 })

    const workspacePane = dom.window.document.createElement('aside')
    workspacePane.setAttribute('data-kg-workspace-left-pane', '1')
    setFixedElementRect(workspacePane, { left: 0, top: 0, right: 920, bottom: 800 })

    dom.window.document.body.append(surface, workspacePane)

    const visibleViewport = resolveStoryboardWidgetVisibleViewport({
      storyboardWidgetSurfaceId: 'surface-a',
      viewportW: 1000,
      viewportH: 800,
    })

    if (visibleViewport.left !== 0 || visibleViewport.width !== 1000 || visibleViewport.centerX !== 500) {
      throw new Error(`expected Storyboard Widget visible viewport to keep the full canvas surface when Editor Workspace overlays it, got ${JSON.stringify(visibleViewport)}`)
    }
  } finally {
    restoreDom()
  }
}

export function testStoryboardScreenAuthorityCollectivePanIncludesCanonicalRenderer() {
  if (!shouldUseStoryboardWidgetScreenAuthorityCollectivePan({
    canvas2dRenderer: 'storyboard',
    frontmatterModeEnabled: false,
    documentSemanticMode: 'keyword',
  })) {
    throw new Error('expected standalone 2D Renderer: Storyboard to use collective screen-authority pan')
  }
  if (shouldUseStoryboardWidgetScreenAuthorityCollectivePan({
    canvas2dRenderer: 'd3',
    frontmatterModeEnabled: false,
    documentSemanticMode: 'keyword',
  })) {
    throw new Error('expected non-Storyboard 2D renderers to avoid Storyboard Widget collective screen-authority pan')
  }
}

export function testWorkspaceEditorOverlayDefaultSplitInitializesAtHalfViewport() {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const hadWindow = typeof window !== 'undefined'
  const originalInnerWidth = hadWindow ? window.innerWidth : undefined
  try {
    if (!hadWindow) {
      Object.defineProperty(globalThis, 'window', {
        value: { innerWidth: 1510 },
        configurable: true,
      })
    }

    for (const viewportWidth of [1510, 1066]) {
      ;(window as unknown as { innerWidth: number }).innerWidth = viewportWidth
      const minWidth = resolveWorkspaceEditorPaneMinWidthPx()
      const maxWidth = resolveWorkspacePaneMaxWidthPx({ minPx: minWidth, rightGutterPx: WORKSPACE_EDITOR_CANVAS_GUTTER_PX })
      const defaultWidth = resolveWorkspaceEditorPaneDefaultWidthPx({ minPx: minWidth, maxPx: maxWidth })
      const explorerWidth = resolveWorkspaceExplorerDefaultWidthPx({ minPx: 160, maxPx: 560 })
      const expectedDefaultWidth = Math.max(
        minWidth,
        Math.min(maxWidth, Math.round(viewportWidth * WORKSPACE_EDITOR_PANE_DEFAULT_VIEWPORT_RATIO)),
      )
      const canvasWidth = window.innerWidth - defaultWidth
      if (defaultWidth !== expectedDefaultWidth) {
        throw new Error(`expected workspace editor default width to initialize at 50% of ${viewportWidth}px, got ${defaultWidth} expected ${expectedDefaultWidth}`)
      }
      if (Math.abs(canvasWidth - defaultWidth) > 1) {
        throw new Error(`expected workspace editor/canvas default split to initialize evenly at ${viewportWidth}px, got editor=${defaultWidth} canvas=${canvasWidth}`)
      }
      if (explorerWidth < 160) {
        throw new Error(`expected workspace explorer default split to keep Source Files readable at ${viewportWidth}px, got ${explorerWidth}`)
      }
    }
  } finally {
    if (hadWindow) {
      ;(window as unknown as { innerWidth: number }).innerWidth = originalInnerWidth as number
    } else if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }
}

export function testWorkspaceEditorOverlayMobileWidthBoundsStayResizable() {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const hadWindow = typeof window !== 'undefined'
  const originalInnerWidth = hadWindow ? window.innerWidth : undefined
  try {
    if (!hadWindow) {
      Object.defineProperty(globalThis, 'window', {
        value: { innerWidth: 320 },
        configurable: true,
      })
    } else {
      ;(window as unknown as { innerWidth: number }).innerWidth = 320
    }

    const minWidth = resolveWorkspaceEditorPaneMinWidthPx()
    const maxWidth = resolveWorkspacePaneMaxWidthPx({ minPx: minWidth, rightGutterPx: WORKSPACE_EDITOR_CANVAS_GUTTER_PX })
    const minCanvasStrip = resolveWorkspaceCanvasMinVisibleStripPx()
    const defaultWidth = resolveWorkspaceEditorPaneDefaultWidthPx({ minPx: minWidth, maxPx: maxWidth })
    if (minWidth >= maxWidth) {
      throw new Error(`expected mobile workspace editor pane to keep a resizable range, got min=${minWidth} max=${maxWidth}`)
    }
    if (minWidth < 240) {
      throw new Error(`expected mobile workspace editor pane minimum to prioritize editability at 240px or wider, got ${minWidth}`)
    }
    if (minCanvasStrip !== WORKSPACE_EDITOR_CANVAS_GUTTER_PX) {
      throw new Error(`expected mobile workspace editor pane to reserve only the canonical canvas gutter, got ${minCanvasStrip}px`)
    }
    if (320 - maxWidth < minCanvasStrip) {
      throw new Error(`expected mobile max width to preserve ${minCanvasStrip}px of canvas, got ${320 - maxWidth}px`)
    }
    if (defaultWidth !== maxWidth) {
      throw new Error(`expected mobile workspace editor pane to open at editable max width ${maxWidth}, got ${defaultWidth}`)
    }
    if (WORKSPACE_EDITOR_CANVAS_GUTTER_CSS !== `${WORKSPACE_EDITOR_CANVAS_GUTTER_PX / 16}rem`) {
      throw new Error(`expected workspace canvas gutter CSS to derive from the canonical pixel gutter, got ${WORKSPACE_EDITOR_CANVAS_GUTTER_CSS}`)
    }

    const narrowed = resolveWorkspacePreviewWidthFromPointerDrag({
      startWidthPx: maxWidth,
      startClientX: 200,
      currentClientX: -200,
    })
    if (narrowed !== minWidth) {
      throw new Error(`expected mobile leftward drag to clamp at ${minWidth}, got ${narrowed}`)
    }

    const widened = resolveWorkspacePreviewWidthFromPointerDrag({
      startWidthPx: minWidth,
      startClientX: 0,
      currentClientX: 400,
    })
    if (widened !== maxWidth) {
      throw new Error(`expected mobile rightward drag to clamp at ${maxWidth}, got ${widened}`)
    }
  } finally {
    if (hadWindow) {
      ;(window as unknown as { innerWidth: number }).innerWidth = originalInnerWidth as number
    } else if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }
}

export function testStoryboardWidgetUsesCanonicalCanvasViewportForMeasurement() {
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  if (!runtimeText.includes('self.closest(\'[data-kg-canvas-viewport-root="1"]\')')) {
    throw new Error('expected Storyboard Widget runtime to resolve viewport dims from the canonical canvas viewport root')
  }
  if (!runtimeText.includes('useContainerDims(rootRef, {')) {
    throw new Error('expected Storyboard Widget runtime to route viewport measurement through the shared container-dims hook')
  }
}

export function testWorkspaceEditorOverlayGatesD3SceneLayoutWrites() {
  const scenePath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useD3GraphScene2d.ts')
  const sceneText = readFileSync(scenePath, 'utf8')
  const presentationPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useD3PresentationUpdates2d.ts')
  const presentationText = readFileSync(presentationPath, 'utf8')
  const actionsPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'utils', 'graphStoreActionAdapters.ts')
  const actionsText = readFileSync(actionsPath, 'utf8')
  if (!sceneText.includes("import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected D3 scene hook to reuse workspace overlay-open SSOT')
  }
  if (!sceneText.includes('const workspaceOverlayOpenRef = useRef(false)')) {
    throw new Error('expected D3 scene hook to keep workspace overlay-open state behind a non-reactive ref')
  }
  if (!sceneText.includes('workspaceOverlayOpenRef.current = isWorkspaceEditorOverlayOpen({')) {
    throw new Error('expected D3 scene hook to update workspace overlay-open state through SSOT helper in the store subscription')
  }
  if (!actionsText.includes('if (args.workspaceOverlayOpenRef?.current) return')) {
    throw new Error('expected shared GraphCanvasRoot store action adapter to block guarded writes while workspace overlay is open')
  }
  if (!sceneText.includes("import { buildGraphCanvasStoreActionAdapters } from '@/components/GraphCanvasRoot/utils/graphStoreActionAdapters'")) {
    throw new Error('expected D3 scene hook to reuse the shared GraphCanvasRoot store action adapter helper')
  }
  if (!sceneText.includes('addNode: graphStoreActions.addNode') || !sceneText.includes('updateEdge: graphStoreActions.updateEdge')) {
    throw new Error('expected D3 scene hook to route guarded canvas writes through the shared store action adapter')
  }
  if (!sceneText.includes("import { persistPrevLayoutSnapshot } from '@/components/GraphCanvasRoot/utils/persistPrevLayoutSnapshot'")) {
    throw new Error('expected D3 scene hook to reuse the shared previous-layout snapshot persistence helper')
  }
  const sceneSnapshotGuardIndex = sceneText.indexOf('Object.keys(prevPositions).length > 0 && !workspaceOverlayOpenRef.current')
  const sceneSnapshotWriteIndex = sceneText.indexOf('persistPrevLayoutSnapshot({')
  if (sceneSnapshotGuardIndex < 0 || sceneSnapshotWriteIndex < 0 || sceneSnapshotGuardIndex > sceneSnapshotWriteIndex) {
    throw new Error('expected D3 scene hook to block teardown layout snapshots while workspace overlay is open')
  }
  if (sceneText.includes('    workspaceOverlayOpen,\n    zoomToSelectionMode,')) {
    throw new Error('expected D3 scene hook not to rebuild from workspace overlay-open dependency churn')
  }
  if (!presentationText.includes("import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'")) {
    throw new Error('expected D3 presentation hook to reuse workspace overlay-open SSOT')
  }
  if (!presentationText.includes('const workspaceOverlayOpenRef = useRef(false)')) {
    throw new Error('expected D3 presentation hook to keep workspace overlay-open state behind a non-reactive ref')
  }
  if (!presentationText.includes('workspaceOverlayOpenRef.current = isWorkspaceEditorOverlayOpen({')) {
    throw new Error('expected D3 presentation hook to update workspace overlay-open state through SSOT helper in the store subscription')
  }
  if (!presentationText.includes("import { buildGraphCanvasStoreActionAdapters } from '@/components/GraphCanvasRoot/utils/graphStoreActionAdapters'")) {
    throw new Error('expected D3 presentation hook to reuse the shared GraphCanvasRoot store action adapter helper')
  }
  if (!presentationText.includes('addEdge: graphStoreActions.addEdge') || !presentationText.includes('toggleGroupCollapsed: graphStoreActions.toggleGroupCollapsed')) {
    throw new Error('expected D3 presentation hook to route guarded writes and shared selection actions through the shared store action adapter')
  }
  if (presentationText.includes('    workspaceOverlayOpen,\n    workspaceViewMode,')) {
    throw new Error('expected D3 presentation hook not to rerun from workspace overlay-open dependency churn')
  }
}
