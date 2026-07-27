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
