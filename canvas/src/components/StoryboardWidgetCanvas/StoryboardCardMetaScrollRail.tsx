import React from 'react'

import type { StoryboardCardModel } from '@/components/StoryboardCanvas/storyboardModel'
import type { StoryboardCardSourceReference } from '@/components/StoryboardCanvas/storyboardCardConnectedSources'
import { StoryboardCardInvocationChips } from '@/components/StoryboardWidgetCanvas/StoryboardCardInvocationChips'
import { StoryboardCardSourceReferenceChips } from '@/components/StoryboardWidgetCanvas/StoryboardCardSourceReferenceChips'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'

const stopCardMetaPointerEvent = (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>): void => {
  try {
    event.stopPropagation()
  } catch {
    void 0
  }
}

const stopWheelEvent = (event: WheelEvent | React.WheelEvent<HTMLElement>): void => {
  try {
    event.preventDefault()
  } catch {
    void 0
  }
  try {
    event.stopPropagation()
  } catch {
    void 0
  }
  try {
    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event
    ;(nativeEvent as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
  } catch {
    void 0
  }
}

export function handleStoryboardCardMetaWheelEvent(event: WheelEvent | React.WheelEvent<HTMLElement>, rail: HTMLElement): void {
  stopWheelEvent(event)
  const maxScrollLeft = Math.max(0, Number(rail.scrollWidth || 0) - Number(rail.clientWidth || 0))
  if (maxScrollLeft <= 0) return
  const deltaX = typeof event.deltaX === 'number' && Number.isFinite(event.deltaX) ? event.deltaX : 0
  const deltaY = typeof event.deltaY === 'number' && Number.isFinite(event.deltaY) ? event.deltaY : 0
  const delta = Math.abs(deltaX) > 0 ? deltaX : deltaY
  if (!Number.isFinite(delta) || Math.abs(delta) <= 0) return
  rail.scrollLeft = Math.max(0, Math.min(maxScrollLeft, rail.scrollLeft + delta))
}

const normalizeCardMetadataLabel = (value: unknown): string => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase()

export function isRedundantWidgetCardMetadata(card: Pick<StoryboardCardModel, 'lane' | 'typeLabel'>): boolean {
  return normalizeCardMetadataLabel(card.lane) === 'widgetcard'
    && normalizeCardMetadataLabel(card.typeLabel) === 'widgetcard'
}

export function StoryboardCardMetaScrollRail(props: {
  card: StoryboardCardModel
  onCommitLane?: (card: StoryboardCardModel, nextValue: string) => void
  onCommitType?: (card: StoryboardCardModel, nextValue: string) => void
  onSourceReferenceActivate?: (reference: StoryboardCardSourceReference) => void
}) {
  const { card, onCommitLane, onCommitType, onSourceReferenceActivate } = props
  const hasInvocationTokens = card.invocationTokens.some(token => token.startsWith('/') || token.startsWith('@') || token.startsWith('#'))
  const sourceReferences = card.sourceReferences || []
  const hasSourceReferences = sourceReferences.length > 0
  const hidesRedundantWidgetCardMetadata = isRedundantWidgetCardMetadata(card)
  const metaRef = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    const rail = metaRef.current
    if (!rail) return
    const handleWheel = (event: WheelEvent) => handleStoryboardCardMetaWheelEvent(event, rail)
    rail.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => rail.removeEventListener('wheel', handleWheel, { capture: true } as EventListenerOptions)
  }, [])
  const handleMetaWheelCapture = React.useCallback((event: React.WheelEvent<HTMLElement>) => {
    handleStoryboardCardMetaWheelEvent(event, event.currentTarget)
  }, [])
  if (hidesRedundantWidgetCardMetadata && !hasInvocationTokens && !hasSourceReferences) return null
  return (
    <header
      ref={metaRef}
      className="flex min-w-0 max-w-full shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-contain border-b pb-1 text-[8px] leading-3 text-[color:var(--kg-text-tertiary)] [scrollbar-gutter:stable]"
      data-kg-canvas-pointer-ignore="true"
      data-kg-canvas-wheel-ignore="true"
      data-kg-media-scroll-surface="1"
      data-kg-storyboard-card-meta-scroll="1"
      data-kg-storyboard-card-meta-row="1"
      onMouseDownCapture={stopCardMetaPointerEvent}
      onPointerDownCapture={stopCardMetaPointerEvent}
      onWheelCapture={handleMetaWheelCapture}
      style={{ borderColor: 'var(--kg-border)', touchAction: 'pan-x' }}
    >
      {!hidesRedundantWidgetCardMetadata ? <>
        {card.indexLabel ? <span className="shrink-0">{card.indexLabel}</span> : null}
        <CardInlineTextEditor
          value={card.lane || 'Storyboard'}
          ariaLabel={`Storyboard lane for ${card.id}`}
          placeholder="Add lane"
          canEdit={typeof onCommitLane === 'function'}
          editActivation="click"
          onCommit={nextValue => onCommitLane?.(card, nextValue)}
          displayClassName="max-w-[5.75rem] shrink-0 truncate rounded border px-1 py-0.5 text-[8px] font-semibold uppercase tracking-normal text-[color:var(--kg-text-secondary)]"
          editorClassName="min-w-[4.5rem] rounded border bg-[color:var(--kg-input-bg)] px-1 py-0.5 text-[8px] font-semibold text-[color:var(--kg-text-primary)]"
        />
        <CardInlineTextEditor
          value={card.typeLabel}
          ariaLabel={`Storyboard type for ${card.id}`}
          placeholder="Add type"
          canEdit={typeof onCommitType === 'function'}
          editActivation="click"
          onCommit={nextValue => onCommitType?.(card, nextValue)}
          displayClassName="max-w-[8.75rem] shrink-0 truncate rounded border px-1 py-0.5 text-[8px] font-semibold tracking-normal text-[color:var(--kg-text-secondary)]"
          editorClassName="min-w-[4.5rem] rounded border bg-[color:var(--kg-input-bg)] px-1 py-0.5 text-[8px] font-semibold text-[color:var(--kg-text-primary)]"
        />
      </> : null}
      <StoryboardCardSourceReferenceChips references={sourceReferences} onActivate={onSourceReferenceActivate} />
      <StoryboardCardInvocationChips tokens={card.invocationTokens} />
    </header>
  )
}
