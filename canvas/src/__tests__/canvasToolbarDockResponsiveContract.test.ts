import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

/** Follow the shared style on its actual dock; unrelated mentions cannot prove ownership. */
export function assertWorkspaceToolbarBoundaryStyle(text: string) {
  const source = ts.createSourceFile('Canvas.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hasIdentifier = (node: ts.Node, name: string): boolean =>
    ts.isIdentifier(node) && node.text === name || Boolean(ts.forEachChild(node, child => hasIdentifier(child, name)))
  const docks: ts.JsxOpeningLikeElement[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'nav') {
      const classes = node.attributes.properties.filter((attribute): attribute is ts.JsxAttribute =>
        ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'className')
      if (classes.some(attribute => attribute.initializer && ts.isJsxExpression(attribute.initializer)
        && attribute.initializer.expression && hasIdentifier(attribute.initializer.expression, 'UI_RESPONSIVE_CANVAS_WORKSPACE_TOOLBAR_DOCK_CLASSNAME'))) docks.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(docks.length, 1, 'expected exactly one workspace toolbar nav using its shared responsive class owner')
  const attributes = docks[0].attributes.properties
  assert.equal(attributes.some(ts.isJsxSpreadAttribute), false, 'workspace toolbar attributes must not override the shared dock or style')
  const styles = attributes.filter((attribute): attribute is ts.JsxAttribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'style')
  assert.equal(styles.length, 1, 'expected the workspace toolbar nav to apply its shared boundary style')
  const initializer = styles[0].initializer
  const expression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : undefined
  const isOwner = (node: ts.Node | undefined) => !!node && ts.isIdentifier(node) && node.text === 'workspaceToolbarBoundaryStyle'
  const ownsBoundary = isOwner(expression) || !!expression && ts.isObjectLiteralExpression(expression)
    && expression.properties.filter(ts.isSpreadAssignment).length === 1
    && expression.properties.every(property => ts.isSpreadAssignment(property) ? isOwner(property.expression)
      : ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === 'display')
  assert.ok(ownsBoundary, 'expected the workspace toolbar nav to preserve its shared boundary style with only an optional display gate')
}

export function testCanvasToolbarDockResponsiveContract() {
  const dock = (style: string) => `<nav className={UI_RESPONSIVE_CANVAS_WORKSPACE_TOOLBAR_DOCK_CLASSNAME} style={${style}} />`
  for (const style of ['workspaceToolbarBoundaryStyle', "{ ...workspaceToolbarBoundaryStyle, display: paneVisible ? undefined : 'none' }"]) {
    assertWorkspaceToolbarBoundaryStyle(dock(style))
  }
  for (const text of [
    dock("{ display: 'none' }") + '<aside style={workspaceToolbarBoundaryStyle} />',
    dock('{ ...workspaceToolbarBoundaryStyle, left: 0 }'),
    dock('{ insetInlineStart: 0, ...workspaceToolbarBoundaryStyle }'),
    dock('{ ...workspaceToolbarBoundaryStyle, ...otherStyle }'),
    dock('workspaceToolbarBoundaryStyle').replace(' />', ' {...otherProps} />'),
    dock('workspaceToolbarBoundaryStyle').replace('className={UI_RESPONSIVE_CANVAS_WORKSPACE_TOOLBAR_DOCK_CLASSNAME}', 'className="UI_RESPONSIVE_CANVAS_WORKSPACE_TOOLBAR_DOCK_CLASSNAME"'),
    dock('workspaceToolbarBoundaryStyle') + dock('workspaceToolbarBoundaryStyle'),
  ]) assert.throws(() => assertWorkspaceToolbarBoundaryStyle(text), 'boundary ownership must reject geometry overrides and decoy references')
  const canvasText = readUtf8('src/pages/Canvas.tsx')
  const canvasViewportText = readUtf8('src/components/CanvasViewport.tsx')
  const toolbarText = readUtf8('src/components/Toolbar.tsx')
  const classText = readUtf8('src/lib/ui/responsiveElementClasses.ts')
  const indexCssText = readUtf8('src/index.css')
  const responsiveToolbarText = readUtf8('src/styles/responsive-toolbar.css')
  const dockCssText = readUtf8('src/styles/responsive-canvas-toolbar.css')
  const timelineBottomPanelText = readUtf8('src/features/strybldr/StrybldrTimelineBottomPanel.tsx')

  const expectedClassOwners = [
    'UI_RESPONSIVE_CANVAS_PAGE_SURFACE_CLASSNAME',
    'UI_RESPONSIVE_CANVAS_TOOLBAR_DOCK_CLASSNAME',
    'UI_RESPONSIVE_CANVAS_WORKSPACE_TOOLBAR_DOCK_CLASSNAME',
    'UI_RESPONSIVE_CANVAS_TOOLBAR_DOCK_CONTENT_CLASSNAME',
    'UI_RESPONSIVE_CANVAS_DOCUMENT_SWITCH_NOTICE_CLASSNAME',
  ]
  const missingClassOwner = expectedClassOwners.find(owner => !classText.includes(owner) || !canvasText.includes(owner))
  if (missingClassOwner) throw new Error(`expected Canvas toolbar dock to use ${missingClassOwner}`)

  if (!indexCssText.includes("@import './styles/responsive-canvas-toolbar.css';")) {
    throw new Error('expected index.css to load the focused responsive canvas toolbar stylesheet')
  }
  assertWorkspaceToolbarBoundaryStyle(canvasText)
  if (
    !canvasText.includes("useMediaQuery('(max-width: 768px), (pointer: coarse)')") ||
    !canvasText.includes('canvasToolbarDockSpansViewport ? undefined : { left: workspacePaneBoundaryCss }')
  ) {
    throw new Error('expected editor-workspace canvas toolbar to keep desktop pane boundary and span the mobile viewport')
  }
  if (
    !canvasText.includes("const toolbarHeaderLayerClassName = toolbarHeaderElevated ? 'z-[420]' : 'z-[290]'") ||
    !canvasText.includes('data-kg-workspace-toolbar-layer={toolbarHeaderElevated ?') ||
    !canvasText.includes('setToolbarHeaderElevated(canvasToolbarDockSpansViewport)') ||
    !canvasText.includes("'[&_button]:min-h-11 [&_button]:!min-w-11'") ||
    !canvasText.includes('onPointerDown={() => setToolbarHeaderElevated(false)}') ||
    !canvasText.includes('className={`absolute inset-0 pointer-events-none ${toolbarHeaderLayerClassName}`}') ||
    !canvasText.includes('onPointerDownCapture={() => setToolbarHeaderElevated(true)}') ||
    canvasText.includes("toolbarHeaderElevated ? 'z-[420]' : 'z-[400]'")
  ) {
    throw new Error('expected editor-workspace toolbar to remain tappable above the mobile editor and retain desktop layer switching')
  }
  if (
    !toolbarText.includes('const shouldUseToolbarRowScroll = isNarrowViewport || isWorkspaceOverlayMode') ||
    !toolbarText.includes('shouldUseToolbarRowScroll ? uiToolbarTouchRowScrollClassName :')
  ) {
    throw new Error('expected constrained editor-workspace canvas toolbar rows to reuse the shared horizontal scroll utility')
  }
  if (
    responsiveToolbarText.includes('.kg-canvas-toolbar-dock') ||
    responsiveToolbarText.includes('.kg-workspace-overlay-canvas-toolbar') ||
    !dockCssText.includes('.kg-canvas-toolbar-dock-content > .App-toolbar--touch-scroll') ||
    !dockCssText.includes('width: fit-content') ||
    !dockCssText.includes('inline-size: fit-content') ||
    !dockCssText.includes('max-inline-size: calc(100vw - var(--kg-safe-left) - var(--kg-safe-right) - 1rem)') ||
    !dockCssText.includes('inset-block-end: calc(var(--kg-safe-bottom) + var(--kg-canvas-viewport-edge-gap))')
  ) {
    throw new Error('expected focused canvas toolbar CSS to own intrinsic dock width, viewport clamping, and mobile bottom placement')
  }
  if (
    !classText.includes('UI_RESPONSIVE_MAIN_PANEL_MOBILE_SHEET_CLASSNAME') ||
    !toolbarText.includes('UI_RESPONSIVE_MAIN_PANEL_MOBILE_SHEET_CLASSNAME') ||
    toolbarText.includes('left-2 right-2 top-[calc(var(--kg-safe-top)+var(--kg-canvas-viewport-edge-gap))]') ||
    toolbarText.includes('bottom-[calc(var(--kg-safe-bottom)+var(--kg-canvas-viewport-edge-gap))]') ||
    toolbarText.includes("width: 'calc(100vw - var(--kg-safe-left) - var(--kg-safe-right) - 1rem)'") ||
    toolbarText.includes("touchAction: 'pan-x manipulation'") ||
    !responsiveToolbarText.includes('.kg-main-panel-mobile-sheet') ||
    !responsiveToolbarText.includes('touch-action: pan-x') ||
    responsiveToolbarText.includes('touch-action: pan-x manipulation') ||
    !responsiveToolbarText.includes('inset-inline-start: calc(var(--kg-safe-left) + var(--kg-canvas-viewport-edge-gap))') ||
    !responsiveToolbarText.includes('inset-block-end: calc(var(--kg-safe-bottom) + var(--kg-canvas-viewport-edge-gap))')
  ) {
    throw new Error('expected narrow Toolbar and MainPanel sheet bounds to live in shared responsive CSS instead of Toolbar-local safe-area geometry')
  }
  if (
    canvasText.includes('absolute top-0 inset-x-0 z-[200]') ||
    canvasText.includes('absolute top-[calc(var(--kg-safe-top)+var(--kg-canvas-viewport-edge-gap))]') ||
    canvasText.includes('pointer-events-auto min-w-0 max-w-full') ||
    canvasText.includes('rounded border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] px-3 py-2 text-sm text-[var(--kg-text-secondary)] shadow-sm')
  ) {
    throw new Error('expected Canvas to avoid stale page-local toolbar dock geometry and switch notice literals')
  }
  if (!classText.includes('UI_RESPONSIVE_CANVAS_BOTTOM_PANEL_CLASSNAME') || !timelineBottomPanelText.includes('UI_RESPONSIVE_CANVAS_BOTTOM_PANEL_CLASSNAME') || !dockCssText.includes('.kg-canvas-bottom-panel') || !dockCssText.includes('.kg-canvas-bottom-panel--pinned') || timelineBottomPanelText.includes("bottom: 'calc(var(--kg-safe-bottom)") || timelineBottomPanelText.includes("width: 'min(calc(100% - 1.5rem")) {
    throw new Error('expected shared canvas bottom-panel geometry to live in focused responsive CSS instead of Timeline-local safe-area sizing')
  }
  if (!classText.includes('UI_RESPONSIVE_CANVAS_MINIMAP_OVERLAY_CLASSNAME') || !canvasViewportText.includes('UI_RESPONSIVE_CANVAS_MINIMAP_OVERLAY_CLASSNAME') || !dockCssText.includes('.kg-canvas-minimap-overlay') || !dockCssText.includes('.kg-canvas-minimap-overlay--pane') || canvasViewportText.includes("bottom: 'calc(var(--kg-safe-bottom)") || canvasViewportText.includes("bottom: 'calc(40px + 12px)") || canvasViewportText.includes('left-3')) {
    throw new Error('expected CanvasViewport minimap overlay geometry to live in focused responsive CSS instead of viewport-local safe-area placement')
  }
}
