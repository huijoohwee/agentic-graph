export type NodeSelectMode = 'single' | 'multi' | 'lasso'

export const isMultiNodeSelectMode = (mode: NodeSelectMode | null | undefined): boolean => {
  return mode === 'multi' || mode === 'lasso'
}

export const resolveNodeSelectionGesture = (args: {
  mode: NodeSelectMode | null | undefined
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
}): 'toggle' | 'replace' => {
  if (args.shiftKey === true) return 'toggle'
  if (isMultiNodeSelectMode(args.mode) && (args.metaKey === true || args.ctrlKey === true)) return 'toggle'
  return 'replace'
}

export const activateMultiNodeSelectModeForShift = (args: {
  mode: NodeSelectMode | null | undefined
  shiftKey?: boolean
  setSelectMode: (mode: NodeSelectMode) => void
}): NodeSelectMode => {
  const mode = args.mode || 'single'
  if (args.shiftKey === true && !isMultiNodeSelectMode(mode)) {
    args.setSelectMode('multi')
    return 'multi'
  }
  return mode
}
