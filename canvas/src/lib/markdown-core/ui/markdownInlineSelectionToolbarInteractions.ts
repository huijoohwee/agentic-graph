export const preventDefaultPointerDown = (event: { preventDefault: () => void }) => {
  event.preventDefault()
}

export const preventDefaultMouseDown = (event: { preventDefault: () => void }) => {
  event.preventDefault()
}

export const toggleParentDetailsOpenFromSummaryClick = (event: {
  preventDefault: () => void
  currentTarget: { parentElement: Element | null }
}) => {
  event.preventDefault()
  const details = event.currentTarget.parentElement as HTMLDetailsElement | null
  if (details) details.open = !details.open
}

export const captureInlineSelectionForToolbarAction = (args: {
  getSelectionOffsets: () => { startOffset: number; endOffset: number } | null
  lastSelectionOffsetsRef?: { current: { startOffset: number; endOffset: number } | null }
  lastNonCollapsedSelectionOffsetsRef: { current: { startOffset: number; endOffset: number } | null }
  lastNonCollapsedDomRangeRef: { current: Range | null }
}) => {
  const selection = args.getSelectionOffsets()
  if (selection) {
    args.lastSelectionOffsetsRef && (args.lastSelectionOffsetsRef.current = selection)
  }
  if (selection && selection.startOffset !== selection.endOffset) {
    args.lastNonCollapsedSelectionOffsetsRef.current = selection
  }
  try {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0)
      if (!r.collapsed) args.lastNonCollapsedDomRangeRef.current = r.cloneRange()
    }
  } catch {
    void 0
  }
}
