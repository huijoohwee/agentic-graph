import React from 'react'
import 'agentic-design-system/panel-tab-layout.css'

export type SequenceInspectorItem = {
  id: string
  label: string
  detail: string
  meta: string
  ordinal?: number
}

export type SequenceInspectorViewProps = {
  title: string
  summary: string
  status: string
  items: readonly SequenceInspectorItem[]
  selectedId?: string
  onSelect: (id: string) => void
  disabled?: boolean
  ariaLabel?: string
  headingRef?: React.Ref<HTMLHeadingElement>
  beforeItems?: React.ReactNode
  selectedAction?: React.ReactNode
  footer?: React.ReactNode
}

/** The native sequence inspector presentation, without document or playback ownership. */
export function SequenceInspectorView({
  title, summary, status, items, selectedId, onSelect, disabled = false,
  ariaLabel = 'Sequence inspector', headingRef, beforeItems, selectedAction, footer,
}: SequenceInspectorViewProps) {
  return <section className="agentic-panel-tab-layout sequence-flow sequence-inspector" aria-label={ariaLabel} aria-busy={disabled || undefined}>
    <header className="agentic-panel-tab-header"><h2 className="agentic-panel-section-title" ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{title}</h2></header>
    <section className="agentic-panel-tab-body">
      <p>{summary}</p>
      {beforeItems}
      <ol>{items.map((item, index) => <li key={item.id}>
        <button type="button" data-step-id={item.id} aria-pressed={item.id === selectedId} disabled={disabled} onClick={() => onSelect(item.id)}>
          <strong>{item.ordinal ?? index + 1}. {item.label}</strong><span>{item.detail}</span><small>{item.meta}</small>
        </button>
        {item.id === selectedId ? selectedAction : null}
      </li>)}</ol>
      <p role="status">{status}</p>
      {footer}
    </section>
  </section>
}
