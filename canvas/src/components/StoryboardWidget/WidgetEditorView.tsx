import React from 'react'

import { WidgetEditorActionsToolbar, type WidgetEditorActionsToolbarProps } from '@/components/StoryboardWidget/WidgetEditorActionsToolbar'
import { WidgetEditorPanel } from '@/components/StoryboardWidget/WidgetEditorPanel'
import { FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { lockGlobalUserSelect, unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { subscribeGlobalCancelEvents } from '@/lib/browser/globalCancelEvents'
import { getIconSizeClass } from '@/lib/ui'
import type { UiIconScale } from '@/lib/ui'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { runAgenticGraphMotion } from '@/lib/motion/agentic-graph-motion'

import {
  resolveStoryboardWidgetSurfacePointerPolicy,
  resolveWidgetEditorSurfaceLabel,
  type WidgetEditorSurfaceKind,
  WIDGET_ACTIONS_TOOLBAR_OFFSET_PX,
} from '@/components/StoryboardWidget/flowWidgetOverlayShared'

type RichMediaPanelToolbarProps = Pick<
  WidgetEditorActionsToolbarProps,
  'richMediaViewToggle' | 'actionVisibility'
>

export function WidgetEditorView(args: {
  asideRef: React.RefObject<HTMLElement | null>
  storyboardWidgetSurfaceId?: string
  editorSurfaceKind?: WidgetEditorSurfaceKind
  node: GraphNode
  pinnedInCanvas: boolean
  overlayZIndex: number
  active: boolean
  toolbarVisible: boolean
  toolbarDock: 'above' | 'below'
  toolbarInlineShiftPx: number
  toolbarMaxWidthPx: number
  isRichMediaPanelWidget: boolean
  isVideoTranscriberWidget: boolean
  uiIconScale: UiIconScale | undefined
  uiIconStrokeWidth: number
  enableHandlesDisabled: boolean
  convertToLoopDisabled: boolean
  richMediaPanelToolbarProps: Partial<RichMediaPanelToolbarProps>
  onRun: () => void
  onDuplicate: () => void
  onClearOutput: () => void
  onHelp: () => void
  onRemove: () => void
  onEnableHandlesForAllInputs: () => void
  onConvertToLoopNode: () => void
  onUpdateKvEntry?: () => void
  onPatchProperties: (patch: Record<string, unknown>) => void
  uiPanelOpacity: number
  panelTextClass: string
  microLabelClass: string
  monospaceTextClass: string
  labelInputRef: React.RefObject<HTMLInputElement | null>
  headerDragEnabled: boolean
  onHeaderPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onToggleHideFields: () => void
  onTogglePinned: (event: React.MouseEvent) => void
  onPinnedPointerDown: (event: React.PointerEvent) => void
  onToggleMinimized: () => void
  onSetLabel: (label: string) => void
  onSetType: (type: string) => void
  onSetProperties: (properties: Record<string, unknown>) => void
  onValidate: () => void
  onRegistrySelectionChange: ({ entry }: { entry: WidgetRegistryEntry | null }) => void
  onRenameSchemaFieldId?: (args: { prevId: string; nextId: string }) => void
  richMediaWidgetPreview: unknown
  registryEntry: WidgetRegistryEntry | null
  registryEntries: ReadonlyArray<WidgetRegistryEntry>
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  portHandleEdges?: ReadonlyArray<GraphEdge>
  schema: unknown
  graphMetaKind?: string | null
  minimized: boolean
  hideFields: boolean
  toolMode?: 'select' | 'addEdge'
  pendingEdgeSourceId?: string | null
  onBeginAddEdgeFromNode?: (nodeId: string, portKey?: string | null) => void
  onFinalizeAddEdgeToNode?: (nodeId: string, portKey?: string | null) => void
  setSelectionSource: (source: 'canvas' | 'editor' | 'none') => void
  selectNode: (nodeId: string) => void
  setToolbarVisible: React.Dispatch<React.SetStateAction<boolean>>
  spacePanUserSelectUnlockRef: React.MutableRefObject<null | (() => void)>
}) {
  const {
    asideRef,
    storyboardWidgetSurfaceId,
    editorSurfaceKind,
    node,
    pinnedInCanvas,
    overlayZIndex,
    active,
    toolbarVisible,
    toolbarDock,
    toolbarInlineShiftPx,
    toolbarMaxWidthPx,
    isRichMediaPanelWidget,
    isVideoTranscriberWidget,
    uiIconScale,
    uiIconStrokeWidth,
    enableHandlesDisabled,
    convertToLoopDisabled,
    richMediaPanelToolbarProps,
    onRun,
    onDuplicate,
    onClearOutput,
    onHelp,
    onRemove,
    onEnableHandlesForAllInputs,
    onConvertToLoopNode,
    onUpdateKvEntry,
    onPatchProperties,
    uiPanelOpacity,
    panelTextClass,
    microLabelClass,
    monospaceTextClass,
    labelInputRef,
    headerDragEnabled,
    onHeaderPointerDown,
    onToggleHideFields,
    onTogglePinned,
    onPinnedPointerDown,
    onToggleMinimized,
    onSetLabel,
    onSetType,
    onSetProperties,
    onValidate,
    onRegistrySelectionChange,
    onRenameSchemaFieldId,
    richMediaWidgetPreview,
    registryEntry,
    registryEntries,
    connectedValuesBySchemaPath,
    portHandleEdges,
    schema,
    graphMetaKind,
    minimized,
    hideFields,
    toolMode,
    pendingEdgeSourceId,
    onBeginAddEdgeFromNode,
    onFinalizeAddEdgeToNode,
    setSelectionSource,
    selectNode,
    setToolbarVisible,
    spacePanUserSelectUnlockRef,
  } = args
  const pointerPolicy = resolveStoryboardWidgetSurfacePointerPolicy()
  const safeToolbarInlineShiftPx = Number.isFinite(toolbarInlineShiftPx) ? toolbarInlineShiftPx : 0
  const safeToolbarMaxWidthPx = Number.isFinite(toolbarMaxWidthPx) && toolbarMaxWidthPx > 0 ? toolbarMaxWidthPx : undefined
  const editorSurfaceLabel = resolveWidgetEditorSurfaceLabel(editorSurfaceKind)
  const toolbarMotionRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!active || !toolbarVisible) return
    const controller = new AbortController()
    runAgenticGraphMotion(toolbarMotionRef.current, 'overlay-toolbar-enter', {
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [active, toolbarVisible])

  const handleRootPointerCapture = React.useCallback((ev: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    const t = ev.target
    const el = t instanceof Element ? t : null
    const isInteractiveControl = !!el?.closest('input,textarea,select,button,[contenteditable="true"]')
    if (active && ev.button === 0 && pinnedInCanvas && ev.altKey !== true && isSpacePanHeld() !== true) {
      if (el?.closest('[data-kg-flow-node-drag-handle="true"]')) return
    }
    if (active && ev.button === 0 && isSpacePanHeld()) {
      if (!isInteractiveControl) {
        if (!spacePanUserSelectUnlockRef.current) {
          lockGlobalUserSelect()
          let unsubscribeGlobalUnlock = () => void 0
          const unlock = () => {
            if (!spacePanUserSelectUnlockRef.current) return
            spacePanUserSelectUnlockRef.current = null
            unlockGlobalUserSelect()
            try {
              unsubscribeGlobalUnlock()
            } catch {
              void 0
            }
          }
          try {
            unsubscribeGlobalUnlock = subscribeGlobalCancelEvents({
              listener: unlock,
              capture: true,
              visibilityBehavior: 'any',
            })
            spacePanUserSelectUnlockRef.current = unlock
          } catch {
            unlock()
          }
        }
      }
    }
    if (active && ev.button === 0 && isInteractiveControl) return
    const id = String(node.id || '').trim()
    if (!id) return
    setSelectionSource('editor')
    selectNode(id)
    setToolbarVisible(true)
  }, [active, node.id, pinnedInCanvas, selectNode, setSelectionSource, setToolbarVisible, spacePanUserSelectUnlockRef])

  return (
    <aside
      ref={asideRef}
      aria-label={editorSurfaceLabel}
      data-kg-widget={String(node.id || '')}
      data-kg-storyboard-widget-mode="1"
      data-kg-storyboard-widget-surface={storyboardWidgetSurfaceId || undefined}
      data-kg-widget-pinned={pinnedInCanvas ? '1' : '0'}
      data-kg-widget-header-drag-enabled={headerDragEnabled ? '1' : '0'}
      data-kg-overlay-pan-owner="canvas"
      data-kg-canvas-wheel-ignore={pointerPolicy.canvasWheelIgnore}
      className={`${pointerPolicy.rootClassName} [&_input:disabled]:pointer-events-none [&_select:disabled]:pointer-events-none [&_textarea:disabled]:pointer-events-none`}
      style={{
        zIndex: overlayZIndex,
      }}
      onPointerDownCapture={handleRootPointerCapture}
      onMouseDownCapture={handleRootPointerCapture}
    >
      <section className="relative">
        <section
          ref={toolbarMotionRef}
          className={`absolute left-1/2 z-10 ${pointerPolicy.toolbarPointerEventsClassName}`}
          style={{
            top: toolbarDock === 'above' ? -WIDGET_ACTIONS_TOOLBAR_OFFSET_PX : 8,
            transform: `translateX(calc(-50% + ${safeToolbarInlineShiftPx}px))`,
          }}
        >
          <WidgetEditorActionsToolbar
            visible={toolbarVisible}
            ariaLabel={editorSurfaceLabel}
            maxWidthPx={safeToolbarMaxWidthPx}
            iconSizeClass={getIconSizeClass(uiIconScale)}
            iconStrokeWidth={uiIconStrokeWidth}
            active={active}
            enableHandlesDisabled={enableHandlesDisabled}
            convertToLoopDisabled={convertToLoopDisabled}
            duplicateDisabled={pinnedInCanvas}
            richMediaViewToggle={isRichMediaPanelWidget ? richMediaPanelToolbarProps.richMediaViewToggle : undefined}
            actionVisibility={isRichMediaPanelWidget ? richMediaPanelToolbarProps.actionVisibility : undefined}
            importUrlAction={isVideoTranscriberWidget ? {
              visible: true,
              initialUrl: typeof (node.properties || {}).sourceUrl === 'string' ? String((node.properties || {}).sourceUrl || '').trim() : '',
              onConfirm: (url) => {
                onPatchProperties({ sourceUrl: url })
              },
            } : undefined}
            onRun={onRun}
            onDuplicate={onDuplicate}
            onClearOutput={onClearOutput}
            onHelp={onHelp}
            onRemove={onRemove}
            onEnableHandlesForAllInputs={onEnableHandlesForAllInputs}
            onConvertToLoopNode={onConvertToLoopNode}
            onUpdateKvEntry={onUpdateKvEntry}
          />
        </section>

        <section className={pointerPolicy.panelPointerEventsClassName}>
          <WidgetEditorPanel
            active={active}
            storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}
            editorSurfaceKind={editorSurfaceKind}
            node={node}
            graphMetaKind={graphMetaKind}
            minimized={minimized}
            hideFields={hideFields}
            pinned={pinnedInCanvas}
            uiPanelOpacity={uiPanelOpacity}
            panelTextClass={panelTextClass}
            microLabelClass={microLabelClass}
            monospaceTextClass={monospaceTextClass}
            uiIconScale={uiIconScale}
            uiIconStrokeWidth={uiIconStrokeWidth}
            labelInputRef={labelInputRef}
            headerDragEnabled={headerDragEnabled}
            onHeaderPointerDown={onHeaderPointerDown}
            onToggleHideFields={onToggleHideFields}
            onTogglePinned={onTogglePinned}
            onPinnedPointerDown={onPinnedPointerDown}
            onToggleMinimized={onToggleMinimized}
            onSetLabel={onSetLabel}
            onSetType={onSetType}
            onPatchProperties={onPatchProperties}
            onSetProperties={onSetProperties}
            onValidate={onValidate}
            onRegistrySelectionChange={onRegistrySelectionChange}
            onRenameSchemaFieldId={onRenameSchemaFieldId}
            richMediaWidgetPreview={richMediaWidgetPreview as any}
            {...(richMediaPanelToolbarProps as any)}
            registryEntry={registryEntry}
            registryEntries={registryEntries}
            connectedValuesBySchemaPath={connectedValuesBySchemaPath}
            portHandleEdges={portHandleEdges}
            schema={schema}
            toolMode={toolMode}
            pendingEdgeSourceId={pendingEdgeSourceId}
            onBeginAddEdgeFromNode={onBeginAddEdgeFromNode}
            onFinalizeAddEdgeToNode={onFinalizeAddEdgeToNode}
          />
        </section>
      </section>
    </aside>
  )
}
