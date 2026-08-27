import React from 'react'

import type { StoryboardCardSourceReference } from '@/components/StoryboardCanvas/storyboardCardConnectedSources'
import { ProvenanceDirectionIcon } from '@/lib/storyboardWidget/ProvenanceDirectionIcon'
import {
  UI_INLINE_CHIP_LABEL_15CH_CLASSNAME,
  UI_INLINE_CHIP_SHELL_15CH_CLASSNAME,
  UI_TEXT_TRUNCATE_CHIP,
} from '@/lib/ui/textLayout'

const buildSelectionRangeLabel = (reference: StoryboardCardSourceReference): string => {
  const first = reference.selectionProvenance?.[0]
  if (!first) return ''
  return first.startLine === first.endLine
    ? `L${first.startLine}`
    : `L${first.startLine}–${first.endLine}`
}

const buildSourceReferenceTitle = (reference: StoryboardCardSourceReference): string => {
  const first = reference.selectionProvenance?.[0]
  if (!first) return `Connected source: ${reference.label}`
  const location = [
    first.documentPath,
    buildSelectionRangeLabel(reference),
  ].filter(Boolean).join(' · ')
  const selectedText = first.selectedText.replace(/\s+/g, ' ').trim()
  const excerpt = selectedText.length > 120 ? `${selectedText.slice(0, 117)}…` : selectedText
  return [
    `Provenance source: ${reference.label}`,
    location,
    excerpt ? `“${excerpt}”` : '',
  ].filter(Boolean).join(' · ')
}

export function StoryboardCardSourceReferenceChips(props: {
  references: readonly StoryboardCardSourceReference[]
  onActivate?: (reference: StoryboardCardSourceReference) => void
}) {
  if (props.references.length === 0) return null
  return (
    <ul
      aria-label="Connected source cards"
      className="m-0 flex shrink-0 list-none items-center gap-1 p-0"
      data-kg-storyboard-card-source-references="1"
    >
      {props.references.map(reference => {
        const selectionRangeLabel = buildSelectionRangeLabel(reference)
        return (
          <li key={reference.nodeId} className="shrink-0 list-none">
            <button
              type="button"
              aria-label={`Source ${reference.label}`}
              className={`inline-flex max-w-[8.75rem] cursor-pointer items-center gap-0.5 rounded-full border border-[color:var(--kg-border)] bg-[color:var(--kg-input-bg)] px-1.5 py-0.5 font-semibold text-[8px] text-[color:var(--kg-text-secondary)] hover:text-[color:var(--kg-text-primary)] ${UI_INLINE_CHIP_SHELL_15CH_CLASSNAME}`}
              data-kg-storyboard-card-source-reference-chip="1"
              data-kg-storyboard-card-source-node-id={reference.nodeId}
              data-kg-storyboard-card-source-target-fields={reference.targetFieldIds.join(',')}
              data-kg-storyboard-card-source-edge-ids={reference.edgeIds.join(',')}
              data-kg-storyboard-card-source-provenance-schema={
                reference.selectionProvenance?.length ? 'agenticgraph-text-selection-widget-link/v1' : undefined
              }
              title={buildSourceReferenceTitle(reference)}
              onPointerDown={event => event.stopPropagation()}
              onMouseDown={event => event.stopPropagation()}
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                props.onActivate?.(reference)
              }}
            >
              <ProvenanceDirectionIcon direction="source" />
              <span className={`${UI_TEXT_TRUNCATE_CHIP} ${UI_INLINE_CHIP_LABEL_15CH_CLASSNAME}`}>
                {reference.label}
              </span>
              {selectionRangeLabel ? (
                <span
                  aria-label={`Selected source ${selectionRangeLabel}`}
                  className="shrink-0 font-mono font-medium opacity-70"
                  data-kg-storyboard-card-source-selection-range={selectionRangeLabel}
                >
                  {selectionRangeLabel}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
