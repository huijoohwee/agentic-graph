import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readWidgetEditorImplementationText(): string {
  return [
    resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorInner.tsx'),
    resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorView.tsx'),
    resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetRichMediaToolbar.ts'),
    resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetEditorOverlayUiState.ts'),
  ].map(path => readFileSync(path, 'utf8')).join('\n')
}

export function testFlowWidgetToolbarAutoShowsOnFirstSelectionTransition() {
  const text = readWidgetEditorImplementationText()

  const requiredSnippets = [
    'const wasSelectedRef = React.useRef(false)',
    'const selected = !!id && isCanonicalNodeIdEqual(selectedNodeId, id)',
    'wasSelectedRef.current = selected',
  ]
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) {
      throw new Error(`expected WidgetEditor to auto-show floating toolbar when widget selection transitions to active: ${snippet}`)
    }
  }
  if (!text.includes('if (selected && !wasSelectedRef.current) setToolbarVisible(true)')) {
    throw new Error('expected WidgetEditor to auto-show floating toolbar when widget selection transitions to active')
  }
}

export function testFlowWidgetToolbarVisibleWhenViewLockOn() {
  const toolbarPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorActionsToolbar.tsx')
  const overlayText = readWidgetEditorImplementationText()
  const toolbarText = readFileSync(toolbarPath, 'utf8')

  const capture = overlayText.match(/const handleRootPointerCapture = React.useCallback\(([\s\S]*?)\}, \[/)?.[1] || ''
  if (!overlayText.includes('onPointerDownCapture={handleRootPointerCapture}')
    || !overlayText.includes('onMouseDownCapture={handleRootPointerCapture}')
    || !capture.includes("setSelectionSource('editor')") || !capture.includes('selectNode(id)')
    || !capture.includes('setToolbarVisible(true)')) {
    throw new Error('expected pointer and mouse widget clicks to select and show the shared floating toolbar')
  }
  if (/if\s*\(\s*!active\s*\)\s*return/.test(capture)) {
    throw new Error('expected View Lock ON to preserve pointer selection and toolbar visibility')
  }
  if (toolbarText.includes('if (!visible || !active) return null')) {
    throw new Error('expected floating-toolbar to remain visible in View Lock ON')
  }
  if (toolbarText.includes('const disabledByViewLock = !active')) {
    throw new Error('expected floating-toolbar actions to remain clickable in View Lock ON')
  }
}

export function testRichMediaPanelActionsLiveInSharedFloatingToolbar() {
  const toolbarPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorActionsToolbar.tsx')
  const panelPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorPanel.tsx')
  const innerPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorInner.tsx')
  const flowCanvasToolbarPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasRichMediaOverlayToolbar.tsx')
  const graphCanvasLayerPath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'components', 'RichMediaOverlayLayer2d.tsx')
  const lsKeysPath = resolve(process.cwd(), 'src', 'lib', 'config.ls.keys.ts')
  const overlayText = readWidgetEditorImplementationText()
  const toolbarText = readFileSync(toolbarPath, 'utf8')
  const panelText = readFileSync(panelPath, 'utf8')
  const innerText = readFileSync(innerPath, 'utf8')
  const flowCanvasToolbarText = readFileSync(flowCanvasToolbarPath, 'utf8')
  const graphCanvasLayerText = readFileSync(graphCanvasLayerPath, 'utf8')
  const lsKeysText = readFileSync(lsKeysPath, 'utf8')
  const uiCopyText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'config-copy', 'uiCopy.ts'), 'utf8')

  if (overlayText.includes('richMediaViewToggle={isRichMediaPanelWidget ? {')) {
    throw new Error('expected WidgetEditor to remove legacy Rich Media view-toggle wiring from the outer generic toolbar')
  }
  if (overlayText.includes('richMediaMediaSelector={isRichMediaPanelWidget ? {')) {
    throw new Error('expected WidgetEditor to remove legacy Rich Media media-selector wiring from the outer generic toolbar')
  }
  if (!overlayText.includes('richMediaViewToggle={isRichMediaPanelWidget ? richMediaPanelToolbarProps.richMediaViewToggle : undefined}')) {
    throw new Error('expected WidgetEditor to wire the Rich Media Panel view toggle through the real outer widget floating toolbar')
  }
  if (!overlayText.includes('actionVisibility={isRichMediaPanelWidget ? richMediaPanelToolbarProps.actionVisibility : undefined}')) {
    throw new Error('expected WidgetEditor to route Rich Media Panel bubble-toolbar actions through the shared action mask')
  }
  for (const stale of [
    'richMediaMediaSelector={isRichMediaPanelWidget ? richMediaPanelToolbarProps.richMediaMediaSelector : undefined}',
    'richMediaAspectToggle={isRichMediaPanelWidget ? richMediaPanelToolbarProps.richMediaAspectToggle : undefined}',
    'richMediaTextModeToggle={isRichMediaPanelWidget ? richMediaPanelToolbarProps.richMediaTextModeToggle : undefined}',
    'openExternalAction={isRichMediaPanelWidget ? richMediaPanelToolbarProps.openExternalAction : undefined}',
    'openExternalAction: buildWidgetOpenExternalAction({',
  ]) {
    if (overlayText.includes(stale)) {
      throw new Error(`expected Rich Media Panel bubble toolbar to remove stale click-open action wiring: ${stale}`)
    }
  }
  if (overlayText.includes("window.open(richMediaOpenUrl, '_blank', 'noopener,noreferrer')")) {
    throw new Error('expected Rich Media floating toolbar wiring to avoid inline window.open choreography')
  }
  if (!panelText.includes('widgetToolbarActive={false}')) {
    throw new Error('expected WidgetEditorPanel to keep the RichMediaPanel body free of duplicate in-body widget toolbar ownership')
  }
  if (!overlayText.includes('actionVisibility: RICH_MEDIA_OVERLAY_ACTION_VISIBILITY')) {
    throw new Error('expected Rich Media Panel widget toolbar props to consolidate onto the shared action mask')
  }
  if (!toolbarText.includes('richMediaViewToggle?.visible')) {
    throw new Error('expected WidgetEditorActionsToolbar to render a Rich Media Panel view toggle')
  }
  for (const stale of [
    'richMediaMediaSelector?.visible',
    'richMediaAspectToggle?.visible',
    'richMediaTextModeToggle?.visible',
    'data-kg-rich-media-media-selector',
    'data-kg-rich-media-aspect-toggle',
    'data-kg-rich-media-text-mode-toggle',
    'data-kg-rich-media-open-source',
    'RICH_MEDIA_PANEL_MEDIA_SELECTOR_LABEL',
    'getRichMediaPanelMediaSelectorOptions',
  ]) {
    if (toolbarText.includes(stale)) {
      throw new Error(`expected Rich Media Panel bubble toolbar to omit removed legacy control: ${stale}`)
    }
  }
  if (!toolbarText.includes('SplitSquareVertical')) {
    throw new Error('expected floating toolbar Rich Media toggle to use the dedicated tiny split-view button')
  }
  if (!toolbarText.includes('getRichMediaPanelViewTitle(richMediaViewToggle.isKtvRows)')) {
    throw new Error('expected Rich Media floating toolbar toggle to reuse the shared Rich Media Panel title helper')
  }
  if (!uiCopyText.includes("flowWidgetRichMediaPanelView: 'Switch to Rich Media Panel (Connect media to render) in the shared widget shell.'")
    || !uiCopyText.includes("flowWidgetRichMediaKtvRows: 'Switch to Rich Media Panel KTV Rows; the outer surface keeps the centered port pair.'")) {
    throw new Error('expected the shared widget-shell Rich Media toolbar to keep the approved Rich Media Panel switch tooltips')
  }
  if (!toolbarText.includes('onEnableHandlesForAllInputs?: () => void')) {
    throw new Error('expected WidgetEditorActionsToolbar to make the enable-handles callback optional when the action is hidden')
  }
  if (!toolbarText.includes('showEnableHandlesAction && !enableHandlesDisabled && onEnableHandlesForAllInputs')) {
    throw new Error('expected WidgetEditorActionsToolbar to only render the enable-handles action when a real callback is provided')
  }
  if (toolbarText.includes('UI_LABELS.panelView') || toolbarText.includes('UI_LABELS.ktvRows')) {
    throw new Error('expected Rich Media floating toolbar toggle to avoid generic Panel View/KTV Rows labels')
  }
  if (panelText.includes('flowWidgetRichMediaPanelView') || panelText.includes('flowWidgetRichMediaKtvRows')) {
    throw new Error('expected WidgetEditorPanel header to avoid duplicating the Rich Media Panel view toggle')
  }
  if (!lsKeysText.includes("flowWidgetRichMediaKtvRows: 'kg:ui:storyboardWidget:richMedia:ktvRows'")) {
    throw new Error('expected Rich Media Panel KTV-row mode to use a dedicated central local-storage key')
  }
  if (!overlayText.includes('const [richMediaKtvRows, setRichMediaKtvRows] = React.useState<boolean>(() => lsBool(LS_KEYS.flowWidgetRichMediaKtvRows, false))')
    || !innerText.includes('const effectiveHideFields = isRichMediaPanelNode ? uiState.richMediaKtvRows : uiState.hideFields')
    || !innerText.includes('hideFields: effectiveHideFields')
    || !innerText.includes('hideFields={effectiveHideFields}')) {
    throw new Error('expected Rich Media Panel widget view mode to be isolated from generic widget hide-fields state')
  }
  if (!flowCanvasToolbarText.includes('lsSetBool(LS_KEYS.flowWidgetRichMediaKtvRows, true)')
    || !graphCanvasLayerText.includes('lsSetBool(LS_KEYS.flowWidgetRichMediaKtvRows, true)')) {
    throw new Error('expected Rich Media overlay view-switch actions to open KTV rows through the Rich Media-specific view key')
  }
  if (flowCanvasToolbarText.includes('lsSetBool(LS_KEYS.flowWidgetHideFields, true)')
    || graphCanvasLayerText.includes('lsSetBool(LS_KEYS.flowWidgetHideFields, true)')) {
    throw new Error('expected Rich Media overlay view-switch actions not to mutate generic widget hide-fields state')
  }
}
