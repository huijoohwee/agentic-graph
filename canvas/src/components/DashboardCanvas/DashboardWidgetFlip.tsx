import React from 'react'
import DashboardWidgetConfiguration from './DashboardWidgetBack'
import type { DashboardWidgetSettings } from './dashboardWidgetConfiguration'
import type { DashboardCardKind } from './dashboardModel'
import './dashboardWidgetFlip.css'

export type DashboardTemplate = DashboardCardKind | 'metric' | 'tree'
export type DashboardWidgetEditorProps = {
  widgetId?: string
  template: DashboardTemplate
  title: string
  defaults?: DashboardWidgetSettings
}
const interactive = 'button, input, textarea, select, a, summary, [contenteditable="true"], [role="button"], [role="textbox"], [data-kg-dashboard-table-row]'

/** The same front/back interaction owns template creation and placed-widget editing. */
export default function DashboardWidgetFlip(props: DashboardWidgetEditorProps & { children: React.ReactNode }) {
  const [flipped, setFlipped] = React.useState(false)
  const [turned, setTurned] = React.useState(false)
  const frame = React.useRef<HTMLDivElement>(null)
  const dragged = React.useRef(false)
  const close = () => { setFlipped(false); requestAnimationFrame(() => frame.current?.focus()) }
  const open = () => { setTurned(true); setFlipped(true) }
  return <div ref={frame} className="min-w-0 h-full" tabIndex={flipped ? -1 : 0} role="group"
    aria-label={`Configure ${props.title}`} aria-expanded={flipped} data-dashboard-widget={props.widgetId ?? `template:${props.template}`}
    onPointerDownCapture={() => { dragged.current = false }} onDragStartCapture={() => { dragged.current = true }}
    onClickCapture={event => {
      if (!flipped && !props.widgetId && !dragged.current) { event.preventDefault(); event.stopPropagation(); open() }
    }} onClick={event => {
      if (!flipped && !dragged.current && !(event.target as Element).closest(interactive)) open()
    }} onKeyDown={event => {
      if (flipped || (props.widgetId && (event.target as Element).closest(interactive))) return
      if ((event.key === 'Enter' || event.key === ' ') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); open() }
    }}>
    <div key={flipped ? 'back' : 'front'} className={`h-full ${turned ? 'dashboard-widget-turn' : ''}`}>
      {flipped ? <DashboardWidgetConfiguration {...props} onClose={close} /> : props.children}
    </div>
  </div>
}
