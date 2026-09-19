export type KanbanDropPosition = 'before' | 'after' | 'end' | 'left' | 'right'

export const resolveKanbanGroupOrder = (args: {
  configuredGroupOrder?: readonly string[] | null
  encounteredGroupOrder: readonly string[]
}): string[] => {
  const encountered = args.encounteredGroupOrder.filter(Boolean)
  const configured = (args.configuredGroupOrder ?? []).map(value => String(value || '').trim()).filter(Boolean)
  if (configured.length === 0) return [...encountered]
  const encounteredSet = new Set(encountered)
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const groupKey of configured) {
    if (!encounteredSet.has(groupKey)) {
      ordered.push(groupKey)
      seen.add(groupKey)
      continue
    }
    ordered.push(groupKey)
    seen.add(groupKey)
  }
  for (const groupKey of encountered) {
    if (seen.has(groupKey)) continue
    ordered.push(groupKey)
    seen.add(groupKey)
  }
  return ordered
}

const buildUniqueOrderedIds = (orderedRowIds: readonly string[], availableIds: ReadonlySet<string>): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of orderedRowIds) {
    if (!availableIds.has(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export const reorderKanbanRowIds = (args: {
  orderedRowIds: readonly string[]
  availableRowIds: readonly string[]
  rowIdToGroupKey: ReadonlyMap<string, string>
  draggedRowId: string
  targetGroupKey: string
  targetRowId: string | null
  position: KanbanDropPosition
}): string[] => {
  const availableSet = new Set(args.availableRowIds)
  if (!availableSet.has(args.draggedRowId)) return Array.from(args.orderedRowIds)

  const baseIds = buildUniqueOrderedIds(args.orderedRowIds, availableSet).filter(id => id !== args.draggedRowId)
  for (const id of args.availableRowIds) {
    if (!availableSet.has(id)) continue
    if (id === args.draggedRowId) continue
    if (baseIds.includes(id)) continue
    baseIds.push(id)
  }

  if (args.targetRowId && args.targetRowId !== args.draggedRowId) {
    const targetIndex = baseIds.indexOf(args.targetRowId)
    if (targetIndex >= 0) {
      const insertIndex = args.position === 'after' || args.position === 'right' ? targetIndex + 1 : targetIndex
      baseIds.splice(insertIndex, 0, args.draggedRowId)
      return baseIds
    }
  }

  let insertIndex = baseIds.length
  for (let i = baseIds.length - 1; i >= 0; i -= 1) {
    if (args.rowIdToGroupKey.get(baseIds[i]) !== args.targetGroupKey) continue
    insertIndex = i + 1
    break
  }
  baseIds.splice(insertIndex, 0, args.draggedRowId)
  return baseIds
}
