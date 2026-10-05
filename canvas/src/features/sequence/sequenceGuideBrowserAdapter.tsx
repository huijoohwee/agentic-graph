import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { coercePanelTypography } from 'grph-shared/ui/panelTypography'
import { FloatingPanelShell, FloatingPanelCloseButton } from '../../components/ui/FloatingPanel'
import {
  FLOATING_PANEL_CANVAS_TOP_INSET_CSS,
  FLOATING_PANEL_CANVAS_RIGHT_INSET_CSS,
  FLOATING_PANEL_CANVAS_PANEL_HEIGHT_CSS,
  FLOATING_PANEL_DEFAULT_WIDTH_RATIO,
  resolveFloatingPanelWidthCss,
} from '../../lib/ui/floatingPanelGeometry'
import { SequenceInspectorView } from './SequenceInspectorView'

export const SEQUENCE_GUIDE_BROWSER_LIMITS = Object.freeze({
  items: 32, idChars: 128, labelChars: 256, textChars: 4096, payloadBytes: 65536,
})
export type SequenceGuideBrowserItem = {
  id: string; label: string; detail: string; meta: string; actionLabel: string; actionDisabled: boolean
}
export type SequenceGuideBrowserState = {
  title: string
  summary: string
  status: string
  items: SequenceGuideBrowserItem[]
  selectedId: string
  busy: boolean
  closeLabel?: string
  notice?: string
  onSelect: (id: string) => void
  onAction: (id: string) => void
  onClose: () => void
}
export type SequenceGuideBrowserHandle = { update: (state: SequenceGuideBrowserState) => void; destroy: () => void }
const mountedTargets = new WeakSet<HTMLElement>()

/** Reject malformed/oversized state and detach caller-owned arrays before rendering. */
function snapshot(input: SequenceGuideBrowserState): SequenceGuideBrowserState {
  const limits = SEQUENCE_GUIDE_BROWSER_LIMITS
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Sequence guide state must be an object.')
  const string = (value: unknown, max: number, label: string, required = false): string => {
    if (typeof value !== 'string' || value.length > max || value.includes('\u0000') || (required && !value.trim())) {
      throw new TypeError(`Invalid sequence guide ${label}.`)
    }
    return value
  }
  const bool = (value: unknown, label: string): boolean => {
    if (typeof value !== 'boolean') throw new TypeError(`Invalid sequence guide ${label}.`)
    return value
  }
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > limits.items) throw new RangeError('Sequence guide item limit exceeded.')
  const ids = new Set<string>()
  const items = Array.from(input.items, item => {
    const id = string(item?.id, limits.idChars, 'item ID', true)
    if (ids.has(id)) throw new TypeError('Duplicate sequence guide item ID.')
    ids.add(id)
    return {
      id, label: string(item?.label, limits.labelChars, 'item label', true),
      detail: string(item?.detail, limits.textChars, 'item detail'),
      meta: string(item?.meta, limits.labelChars, 'item metadata'),
      actionLabel: string(item?.actionLabel, limits.labelChars, 'action label', true),
      actionDisabled: bool(item?.actionDisabled, 'action availability'),
    }
  })
  const title = string(input.title, limits.labelChars, 'title', true)
  const selectedId = string(input.selectedId, limits.idChars, 'selected item', true)
  if (!ids.has(selectedId)) throw new TypeError('Sequence guide selected item does not exist.')
  for (const name of ['onSelect', 'onAction', 'onClose'] as const) {
    if (typeof input[name] !== 'function') throw new TypeError(`Invalid sequence guide ${name} callback.`)
  }
  const state = {
    title, items, selectedId, busy: bool(input.busy, 'busy state'),
    summary: string(input.summary, limits.textChars, 'summary'), status: string(input.status, limits.textChars, 'status'),
    closeLabel: string(input.closeLabel ?? `Close ${title}`, limits.labelChars, 'close label', true),
    notice: input.notice === undefined ? undefined : string(input.notice, limits.textChars, 'notice'),
  }
  if (new TextEncoder().encode(JSON.stringify(state)).byteLength > limits.payloadBytes) throw new RangeError('Sequence guide payload limit exceeded.')
  return { ...state, onSelect: input.onSelect, onAction: input.onAction, onClose: input.onClose }
}

/** A plain-data, store-free boundary; the consumer owns effects, persistence and return focus. */
export function mountSequenceGuide(target: HTMLElement, initial: SequenceGuideBrowserState): SequenceGuideBrowserHandle {
  let state = snapshot(initial)
  const ElementClass = target?.ownerDocument?.defaultView?.HTMLElement
  if (!ElementClass || !(target instanceof ElementClass)) throw new TypeError('Sequence guide target must be an HTML element.')
  if (mountedTargets.has(target)) throw new Error('Sequence guide target is already mounted.')
  const root = createRoot(target)
  mountedTargets.add(target)
  let destroyed = false
  const heading = React.createRef<HTMLHeadingElement>()
  const select = (id: string) => { if (!destroyed && !state.busy && state.items.some(item => item.id === id)) state.onSelect(id) }
  const action = () => {
    const item = state.items.find(item => item.id === state.selectedId)
    if (!destroyed && !state.busy && item && !item.actionDisabled) state.onAction(item.id)
  }
  const close = () => { if (!destroyed) state.onClose() }
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
    event.preventDefault(); event.stopPropagation(); close()
  }
  const render = () => {
    const selected = state.items.find(item => item.id === state.selectedId)!
    flushSync(() => root.render(<FloatingPanelShell ariaLabel={state.title}
      rootClassName="fixed inset-0 pointer-events-none" rootStyle={{ zIndex: 1000 }}
      panelStyle={{ position: 'absolute', top: FLOATING_PANEL_CANVAS_TOP_INSET_CSS, right: FLOATING_PANEL_CANVAS_RIGHT_INSET_CSS,
        width: resolveFloatingPanelWidthCss(FLOATING_PANEL_DEFAULT_WIDTH_RATIO), height: FLOATING_PANEL_CANVAS_PANEL_HEIGHT_CSS }}
      header={<><span aria-hidden="true" /><FloatingPanelCloseButton label={state.closeLabel!} onClose={close} /></>}>
      <section className="mt-1 flex-1 min-h-0 overflow-hidden" aria-label="Guide steps">
        <SequenceInspectorView title={state.title} summary={state.summary} status={state.status}
          items={state.items} selectedId={state.selectedId} onSelect={select} disabled={state.busy}
          ariaLabel={`${state.title} steps`} textClassName={coercePanelTypography(null).panelTextClass} headingRef={heading}
          selectedAction={<button type="button" data-sequence-guide-action="true" disabled={state.busy || selected.actionDisabled} onClick={action}>{selected.actionLabel}</button>}
          footer={state.notice ? <p>{state.notice}</p> : undefined} />
      </section>
    </FloatingPanelShell>))
  }
  target.addEventListener('keydown', keydown)
  try { render(); heading.current?.focus({ preventScroll: true }) }
  catch (error) { target.removeEventListener('keydown', keydown); root.unmount(); mountedTargets.delete(target); throw error }
  return {
    update(next) {
      if (destroyed) throw new Error('Sequence guide is destroyed.')
      state = snapshot(next)
      render()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      target.removeEventListener('keydown', keydown)
      flushSync(() => root.unmount())
      mountedTargets.delete(target)
    },
  }
}
