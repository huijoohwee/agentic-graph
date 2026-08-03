import React from 'react'
import { registerOpenCardInlineTextEditor } from '@/lib/cards/CardInlineTextEditorSupport'

export function useLiveCardInlineTextDraft(initialValue: string) {
  const [draft, setDraft] = React.useState(initialValue)
  const draftRef = React.useRef(draft)
  const updateDraft = React.useCallback((nextValue: string) => {
    draftRef.current = nextValue
    setDraft(nextValue)
  }, [])
  const readDraft = React.useCallback(() => draftRef.current, [])
  return { draft, readDraft, updateDraft }
}

export function useRegisteredOpenCardInlineTextEditor(args: {
  commit: (forcedValue?: string) => void
  editing: boolean
  getOwnerDocument?: () => Document | null
  isEditingTarget?: (target: EventTarget | null) => boolean
  ownerKey: string
  readValue: () => string | null
}) {
  const commitRef = React.useRef(args.commit)
  React.useLayoutEffect(() => {
    commitRef.current = args.commit
  }, [args.commit])

  const readValueRef = React.useRef(args.readValue)
  React.useLayoutEffect(() => {
    readValueRef.current = args.readValue
  }, [args.readValue])

  const isEditingTargetRef = React.useRef(args.isEditingTarget)
  React.useLayoutEffect(() => {
    isEditingTargetRef.current = args.isEditingTarget
  }, [args.isEditingTarget])

  React.useLayoutEffect(() => {
    if (!args.editing) return
    const unregister = registerOpenCardInlineTextEditor(
      args.ownerKey,
      nextValue => commitRef.current(nextValue),
      () => readValueRef.current(),
    )
    const ownerDocument = args.getOwnerDocument?.() || (typeof document !== 'undefined' ? document : null)
    const eventSource = ownerDocument?.defaultView || ownerDocument
    if (!eventSource) return unregister
    const commitBeforeExternalPointerTransition = (event: Event) => {
      if (isEditingTargetRef.current?.(event.target)) return
      const nextValue = readValueRef.current()
      commitRef.current(typeof nextValue === 'string' ? nextValue : undefined)
    }
    eventSource.addEventListener('pointerdown', commitBeforeExternalPointerTransition, true)
    return () => {
      eventSource.removeEventListener('pointerdown', commitBeforeExternalPointerTransition, true)
      const nextValue = readValueRef.current()
      commitRef.current(typeof nextValue === 'string' ? nextValue : undefined)
      unregister()
    }
  }, [args.editing, args.getOwnerDocument, args.ownerKey])
}
