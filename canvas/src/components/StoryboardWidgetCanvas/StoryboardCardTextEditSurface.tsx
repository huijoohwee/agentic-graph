import React from 'react'

import type { StoryboardCardModel } from '@/components/StoryboardCanvas/storyboardModel'
import type { StoryboardCardSourceReference } from '@/components/StoryboardCanvas/storyboardCardConnectedSources'
import { StoryboardCardMetaScrollRail } from '@/components/StoryboardWidgetCanvas/StoryboardCardMetaScrollRail'
import { shouldStoryboardCardTextColumnOwnSummaryEditTarget } from '@/components/StoryboardWidgetCanvas/storyboardCardSummaryEditTarget'
import type { StoryboardCardTextModel } from '@/components/StoryboardWidgetCanvas/storyboardCardTextModel'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import {
  CARD_TEXT_SURFACE_COLUMN_CLASS_NAME,
  CARD_TEXT_SURFACE_EDIT_CLASS_NAME,
  CARD_TEXT_SURFACE_SCROLL_CLASS_NAME,
  CARD_TEXT_SURFACE_TEXT_CLASS_NAME,
  CARD_TEXT_SURFACE_VIEW_CLASS_NAME,
} from '@/lib/cards/cardTextSurfaceFrame'
import type { GraphNodeCardTextFieldSpec } from '@/lib/cards/graphNodeCardFields'
import type { InlineMediaCommandCandidate } from '@/lib/command-menu/inlineCommandMenuCatalog'
import type { TextareaInvocationMediaAttachment } from '@/lib/ui/textareaInvocationProjection'
import { cn } from '@/lib/utils'

type ProbeTreeMultiSelectState = {
  selectedOptionIds: Set<string>
  otherSelected: boolean
  otherText: string
}

const readProbeTreeMultiSelectState = (
  output: string,
  options: readonly { id: string; label: string }[],
): ProbeTreeMultiSelectState => {
  const selectedOptionIds = new Set<string>()
  let otherSelected = false
  let otherText = ''
  for (const line of String(output || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    const numbered = line.match(/^(\d+)\.\s*(.*)$/)
    if (numbered) {
      const option = options[Number(numbered[1]) - 1]
      if (option && (!numbered[2] || numbered[2] === option.label)) selectedOptionIds.add(option.id)
      continue
    }
    const other = line.match(/^Other(?:\s*:\s*(.*))?$/i)
    if (other) {
      otherSelected = true
      otherText = String(other[1] || '').trim()
    }
  }
  if (selectedOptionIds.size === 0 && !otherSelected && String(output || '').trim()) {
    otherSelected = true
    otherText = String(output || '').trim()
  }
  return { selectedOptionIds, otherSelected, otherText }
}

const formatProbeTreeMultiSelectOutput = (
  state: ProbeTreeMultiSelectState,
  options: readonly { id: string; label: string }[],
): string => [
  ...options.flatMap((option, index) => state.selectedOptionIds.has(option.id) ? [`${index + 1}. ${option.label}`] : []),
  ...(state.otherSelected ? [state.otherText ? `Other: ${state.otherText}` : 'Other'] : []),
].join('\n')

function StoryboardProbeTreeMultiSelectSummary(props: {
  card: StoryboardCardModel
  textModel: StoryboardCardTextModel
  editRequestKey: number | null
  onCommitText: (card: StoryboardCardModel, field: GraphNodeCardTextFieldSpec, nextValue: string) => void
  onActivate: () => void
}) {
  const selection = props.card.probeTreeMultiSelect
  const outputField = props.textModel.secondaryField?.id === 'output' ? props.textModel.secondaryField : null
  const selectionOptions = selection?.options || []
  const selectionOptionsKey = selectionOptions.map(option => `${option.id}\u0000${option.label}`).join('\u0001')
  const [state, setState] = React.useState<ProbeTreeMultiSelectState>(() => (
    readProbeTreeMultiSelectState(props.textModel.secondaryRaw, selectionOptions)
  ))
  const stateRef = React.useRef(state)
  React.useEffect(() => {
    const next = readProbeTreeMultiSelectState(props.textModel.secondaryRaw, selectionOptions)
    stateRef.current = next
    setState(next)
  }, [props.card.id, props.textModel.secondaryRaw, selectionOptionsKey])
  if (!selection || !outputField) return null

  const commitState = (next: ProbeTreeMultiSelectState) => {
    stateRef.current = next
    setState(next)
    props.onCommitText(props.card, outputField, formatProbeTreeMultiSelectOutput(next, selection.options))
  }
  return (
    <section
      id={`storyboard-card-shared-text-${props.card.id}`}
      aria-label={`Summary for ${props.card.id}`}
      className="grid gap-2"
      data-kg-probe-tree-type="2"
    >
      <CardInlineTextEditor
        id={`storyboard-card-shared-text-question-${props.card.id}`}
        value={props.textModel.primaryRaw || props.card.slugline || ''}
        displayValue={props.textModel.primaryDisplay || props.card.slugline || ''}
        ariaLabel={`Question for ${props.card.id}`}
        placeholder={props.textModel.primaryField.placeholder}
        canEdit
        editActivation="click"
        editRequestKey={props.editRequestKey}
        multiline
        displayLineClamp="none"
        markdownPreview="auto"
        markdownCommandMenus={false}
        editorSurface="viewer"
        inlineChipDensity="compact"
        openOnPointerDown
        rows={2}
        showCommandLaunchers={false}
        onCommit={nextValue => props.onCommitText(props.card, props.textModel.primaryField, nextValue)}
        onEditingChange={editing => { if (editing) props.onActivate() }}
        displayClassName={cn(CARD_TEXT_SURFACE_VIEW_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME)}
        editorClassName={cn(CARD_TEXT_SURFACE_EDIT_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME)}
      />
      <fieldset className="grid gap-1.5 text-[length:var(--kg-panel-text-size,12px)]" data-kg-probe-tree-multi-select-control="1">
        <legend className="sr-only">Select one or more answers</legend>
        {selection.options.map((option, index) => (
          <label key={option.id} className="flex cursor-pointer items-start gap-1.5 leading-tight">
            <input
              type="checkbox"
              checked={state.selectedOptionIds.has(option.id)}
              aria-label={`Select option ${index + 1} for ${props.card.id}`}
              onChange={() => {
                const current = stateRef.current
                const selectedOptionIds = new Set(current.selectedOptionIds)
                if (selectedOptionIds.has(option.id)) selectedOptionIds.delete(option.id)
                else selectedOptionIds.add(option.id)
                commitState({ ...current, selectedOptionIds })
              }}
            />
            <span>{index + 1}. {option.label}</span>
          </label>
        ))}
        <label className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-1.5 leading-tight">
          <input
            type="checkbox"
            checked={state.otherSelected}
            aria-label={`Select Other for ${props.card.id}`}
            onChange={() => commitState({ ...stateRef.current, otherSelected: !stateRef.current.otherSelected })}
          />
          <span>Other</span>
          <input
            type="text"
            value={state.otherText}
            aria-label={`Other response for ${props.card.id}`}
            className="min-w-0 rounded border border-[color:var(--kg-border)] bg-transparent px-1.5 py-1 outline-none focus:border-sky-400"
            placeholder="Add another answer"
            onChange={event => {
              const next = { ...stateRef.current, otherSelected: true, otherText: event.target.value }
              stateRef.current = next
              setState(next)
            }}
            onBlur={() => commitState({ ...stateRef.current, otherSelected: true })}
            onKeyDown={event => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              commitState({ ...stateRef.current, otherSelected: true })
            }}
          />
        </label>
      </fieldset>
    </section>
  )
}

export function StoryboardCardTextEditSurface(props: {
  card: StoryboardCardModel
  textModel: StoryboardCardTextModel
  projectedMediaAttachments: readonly TextareaInvocationMediaAttachment[] | null
  storyboardCommandContextText: string
  onCommitLane: (card: StoryboardCardModel, nextValue: string) => void
  onCommitText: (card: StoryboardCardModel, field: GraphNodeCardTextFieldSpec, nextValue: string) => void
  onCommitType: (card: StoryboardCardModel, nextValue: string) => void
  onMediaCommandSelect: (candidate: InlineMediaCommandCandidate) => void
  onActivate: () => void
  onSourceReferenceActivate?: (reference: StoryboardCardSourceReference) => void
}) {
  const {
    card,
    onCommitLane,
    onCommitText,
    onCommitType,
    onMediaCommandSelect,
    onActivate,
    onSourceReferenceActivate,
    projectedMediaAttachments,
    storyboardCommandContextText,
    textModel,
  } = props
  const [editRequestKey, setEditRequestKey] = React.useState<number | null>(null)
  const requestPrimaryEdit = React.useCallback((event: React.SyntheticEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('[data-kg-probe-tree-multi-select-control="1"]')) return
    if (!shouldStoryboardCardTextColumnOwnSummaryEditTarget(event.target, event.currentTarget)) return
    event.preventDefault()
    event.stopPropagation()
    setEditRequestKey(key => (key || 0) + 1)
  }, [])

  return (
    <section
      className={CARD_TEXT_SURFACE_COLUMN_CLASS_NAME}
      data-kg-storyboard-card-text-column="1"
      onPointerDownCapture={requestPrimaryEdit}
      onMouseDownCapture={requestPrimaryEdit}
      style={{ borderColor: 'var(--kg-border)' }}
    >
      <StoryboardCardMetaScrollRail card={card} onCommitLane={onCommitLane} onCommitType={onCommitType} onSourceReferenceActivate={onSourceReferenceActivate} />
      <section
        className={CARD_TEXT_SURFACE_SCROLL_CLASS_NAME}
        data-kg-canvas-pointer-ignore="true"
        data-kg-canvas-wheel-ignore="true"
        data-kg-media-scroll-surface="1"
        data-kg-storyboard-card-active-text-field={textModel.primaryField.id}
        data-kg-storyboard-card-brief="1"
        data-kg-storyboard-card-summary-scroll="1"
        onWheelCapture={event => event.stopPropagation()}
      >
        {card.probeTreeMultiSelect ? (
          <StoryboardProbeTreeMultiSelectSummary
            card={card}
            textModel={textModel}
            editRequestKey={editRequestKey}
            onCommitText={onCommitText}
            onActivate={onActivate}
          />
        ) : <CardInlineTextEditor
          id={`storyboard-card-shared-text-${card.id}`}
          value={textModel.primaryRaw || card.slugline || ''}
          displayValue={textModel.primaryDisplay || card.slugline || ''}
          ariaLabel={`${textModel.primaryField.label} for ${card.id}`}
          placeholder={textModel.primaryField.placeholder}
          canEdit
          editActivation="click"
          editRequestKey={editRequestKey}
          multiline
          displayLineClamp="none"
          markdownPreview="auto"
          markdownCommandContextText={storyboardCommandContextText}
          mediaCommandMode="external"
          editorSurface="viewer"
          inlineChipDensity="compact"
          openOnPointerDown
          rows={2}
          projectedMediaAttachments={projectedMediaAttachments}
          showCommandLaunchers={false}
          onCommit={nextValue => onCommitText(card, textModel.primaryField, nextValue)}
          onEditingChange={editing => { if (editing) onActivate() }}
          onMediaCommandSelect={onMediaCommandSelect}
          displayClassName={cn(CARD_TEXT_SURFACE_VIEW_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME)}
          editorClassName={cn(CARD_TEXT_SURFACE_EDIT_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME)}
        />}
      </section>
    </section>
  )
}

export function StoryboardCardOutputEditSurface(props: {
  card: StoryboardCardModel
  textModel: StoryboardCardTextModel
  onCommitText: (card: StoryboardCardModel, field: GraphNodeCardTextFieldSpec, nextValue: string) => void
  onActivate: () => void
}) {
  const { card, onActivate, onCommitText, textModel } = props
  const outputField = textModel.secondaryEditable ? textModel.secondaryField : null
  const [editRequestKey, setEditRequestKey] = React.useState<number | null>(null)
  const requestOutputEdit = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.querySelector('[data-kg-card-inline-viewer-edit-surface="1"][contenteditable="true"]')) return
    setEditRequestKey(key => (key || 0) + 1)
  }, [])
  if (!outputField) return null
  return (
    <section
      aria-label={`Output input for ${card.id}`}
      className={CARD_TEXT_SURFACE_COLUMN_CLASS_NAME}
      data-kg-canvas-pointer-ignore="true"
      data-kg-storyboard-card-output-pane="1"
      onPointerDownCapture={requestOutputEdit}
      style={{ borderColor: 'var(--kg-border)' }}
    >
      <section
        className={CARD_TEXT_SURFACE_SCROLL_CLASS_NAME}
        data-kg-canvas-wheel-ignore="true"
        data-kg-media-scroll-surface="1"
        data-kg-storyboard-card-active-text-field={outputField.id}
        onWheelCapture={event => event.stopPropagation()}
      >
        <CardInlineTextEditor
          id={`storyboard-card-output-${card.id}`}
          value={textModel.secondaryRaw}
          displayValue={textModel.secondaryDisplay || textModel.secondaryRaw}
          ariaLabel={`${outputField.label} for ${card.id}`}
          placeholder={outputField.placeholder}
          canEdit
          editActivation="click"
          editRequestKey={editRequestKey}
          multiline
          displayLineClamp="none"
          markdownPreview="auto"
          markdownCommandMenus={false}
          editorSurface="viewer"
          inlineChipDensity="compact"
          openOnPointerDown
          rows={4}
          showCommandLaunchers={false}
          onCommit={nextValue => onCommitText(card, outputField, nextValue)}
          onEditingChange={editing => { if (editing) onActivate() }}
          displayClassName={cn(CARD_TEXT_SURFACE_VIEW_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME)}
          editorClassName={cn(CARD_TEXT_SURFACE_EDIT_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME)}
        />
      </section>
    </section>
  )
}
