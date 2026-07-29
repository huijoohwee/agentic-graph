import { CanvasArrangeActionBar } from '@/components/canvas/CanvasArrangeActionBar'
import { useParentChildRelation } from '@/components/canvas/useParentChildRelation'
import { useSelectionGrouping } from '@/components/canvas/useSelectionGrouping'
import type { ArrangeAction2d } from '@/lib/canvas/arrange2d'

export function ArrangeToolbar2d(props: {
  active: boolean
  selectedCount: number
  onArrange: (action: ArrangeAction2d) => void
}) {
  const { active, selectedCount, onArrange } = props
  const grouping = useSelectionGrouping({ active })
  const parentChild = useParentChildRelation({ active })
  return (
    <CanvasArrangeActionBar
      active={active}
      selectedCount={selectedCount}
      onArrange={onArrange}
      canGroupNodes={grouping.canGroupNodes}
      canUngroup={grouping.canUngroup}
      canDetach={parentChild.canDetach}
      onGroupNodes={grouping.groupNodes}
      onUngroup={grouping.ungroup}
      onDetach={parentChild.detach}
      ariaLabel="Selected graph node actions"
    />
  )
}
