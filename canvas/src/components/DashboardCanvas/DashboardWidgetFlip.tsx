import React from 'react'
import { WidgetEditorActionsToolbar } from '@/components/StoryboardWidget/WidgetEditorActionsToolbar'
import { buildWidgetBubbleToolbarPresentation } from '@/components/StoryboardWidget/widgetBubbleToolbarPresentation'
import { useOutsideClose } from '@/hooks/useOutsideClose'
import DashboardWidgetConfiguration from './DashboardWidgetBack'
import { useDashboardWidgetToolbarDock } from './useDashboardWidgetToolbarDock'
import type { DashboardWidgetSettings } from './dashboardWidgetConfiguration'
import type { DashboardCardKind } from './dashboardModel'
import { getStoryboardWidgetPanelSelectionChromeClassName, WIDGET_SELECTION_SURFACE_CLASS_NAME } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import { useDashboardWidgetExpansion } from './DashboardWidgetDisclosure'
import { useDashboardWidgetSize } from './useDashboardWidgetSize'
import './dashboardWidgetFlip.css'

export type DashboardTemplate = DashboardCardKind | 'metric' | 'tree' | 'codebase' | 'heading' | 'text' | 'divider' | 'container' | 'disclosure'
export type DashboardWidgetEditorProps = {
  widgetId?: string
  template: DashboardTemplate
  title: string
  defaults?: DashboardWidgetSettings
  configuration?: React.ReactNode
}
const interactive = 'label, [role="treeitem"], [role="row"], [role="tab"], [role="option"], button, input, textarea, select, a, summary, [contenteditable="true"], [role="button"], [role="textbox"], [data-kg-dashboard-table-row]'
const noop = () => void 0
const toolbarPresentation = buildWidgetBubbleToolbarPresentation({
  ariaLabel: 'Widget card actions', placement: 'flow-widget-above-center', active: true,
  convertToLoopDisabled: true, duplicateDisabled: true,
  actionVisibility: { run: false, clearOutput: false, updateKvEntry: false, openInSidepane: false,
    enableHandles: false, probeTree: false, convertToLoop: false, duplicate: false, help: false, remove: false },
})

/** Selection reveals the shared Widget Card toolbar; only its Flip action opens settings. */
export default function DashboardWidgetFlip(props: DashboardWidgetEditorProps & { children: React.ReactNode }) {
  const [flipped, setFlipped] = React.useState(false)
  const [turned, setTurned] = React.useState(false)
  const [toolbarVisible, setToolbarVisible] = React.useState(false)
  const [frontSize, setFrontSize] = React.useState<{ width: number; height: number } | null>(null)
  const frame = React.useRef<HTMLElement>(null)
  const expansion = useDashboardWidgetExpansion(props.widgetId)
  const sizing = useDashboardWidgetSize(props.widgetId, frame, !flipped && expansion.expanded)
  const dragged = React.useRef(false)
  const keyboardSelection = React.useRef(false)
  const toolbarTop = useDashboardWidgetToolbarDock(frame, toolbarVisible)
  useOutsideClose(toolbarVisible, setToolbarVisible, frame)
  React.useEffect(() => {
    if (toolbarVisible && keyboardSelection.current) {
      frame.current?.querySelector<HTMLButtonElement>('[data-kg-toolbar-action="flip"]')?.focus({ preventScroll: true })
      keyboardSelection.current = false
    }
  }, [toolbarVisible])
  const close = () => { setFlipped(false); frame.current?.focus({ preventScroll: true }) }
  const flip = () => {
    if (flipped) { close(); return }
    const rect = frame.current?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) setFrontSize({ width: rect.width, height: rect.height })
    setTurned(true); setFlipped(true)
  }
  const select = () => setToolbarVisible(true)
  return <article ref={frame} className={`kg-dashboard-widget relative min-w-0 ${props.widgetId ? 'kg-dashboard-widget-sized' : 'h-full'} ${WIDGET_SELECTION_SURFACE_CLASS_NAME} ${getStoryboardWidgetPanelSelectionChromeClassName(toolbarVisible)}`} tabIndex={flipped ? -1 : 0} role="group"
    style={flipped && frontSize ? { width: frontSize.width, height: frontSize.height, maxWidth: '100%' } : expansion.expanded ? sizing.style : { width: sizing.style?.width, maxWidth: '100%' }}
    data-widget-aspect={props.widgetId ? sizing.aspect : undefined}
    aria-label={`Configure ${props.title}`} aria-expanded={flipped}
    data-dashboard-widget={props.widgetId ?? `template:${props.template}`} data-kg-widget-selected={toolbarVisible ? 'true' : 'false'}
    onPointerDownCapture={() => { dragged.current = false }} onDragStartCapture={() => { dragged.current = true; setToolbarVisible(false) }}
    onClickCapture={event => {
      if (!flipped && !props.widgetId && !dragged.current && !(event.target as Element).closest('[data-kg-bubble-toolbar]')) {
        event.preventDefault(); event.stopPropagation(); select()
      }
    }} onClick={event => {
      if (!event.defaultPrevented && !flipped && !dragged.current && !(event.target as Element).closest(interactive)) select()
    }} onKeyDown={event => {
      if (event.defaultPrevented || flipped) return
      if (event.key === 'Escape' && toolbarVisible) { event.preventDefault(); setToolbarVisible(false); frame.current?.focus({ preventScroll: true }); return }
      if ((event.target as Element).closest(interactive)) return
      if ((event.key === 'Enter' || event.key === ' ') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); keyboardSelection.current = true; select()
        if (toolbarVisible) frame.current?.querySelector<HTMLButtonElement>('[data-kg-toolbar-action="flip"]')?.focus({ preventScroll: true })
      }
    }}>
    <WidgetEditorActionsToolbar {...toolbarPresentation} visible={toolbarVisible} ariaLabel={`${props.title} widget actions`}
      navClassName={`kg-dashboard-widget-toolbar ${toolbarPresentation.navClassName}`}
      navStyle={{ ...toolbarPresentation.navStyle, top: toolbarTop }}
      flipAction={{ flipped, onFlip: flip }} onRun={noop} onDuplicate={noop} onClearOutput={noop}
      onHelp={noop} onRemove={noop} onConvertToLoopNode={noop} />
    {!flipped && !expansion.expanded && props.template !== 'disclosure' && <button type="button" className="w-full rounded border p-3 text-left text-sm" aria-expanded={false} onClick={() => expansion.setExpanded(true)}>▸ {props.title}</button>}
    <section hidden={!flipped && !expansion.expanded && props.template !== 'disclosure'} key={flipped ? 'back' : 'front'} data-kg-widget-face={flipped ? 'back' : 'front'}
      className={`kg-dashboard-widget-face h-full ${turned ? 'dashboard-widget-turn' : ''}`}>
      {flipped ? <DashboardWidgetConfiguration {...props} onClose={close} /> : props.children}
    </section>
    {sizing.handle}
  </article>
}
