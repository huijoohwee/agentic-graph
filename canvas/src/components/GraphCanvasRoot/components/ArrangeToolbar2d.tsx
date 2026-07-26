import { CanvasArrangeActionBar } from '@/components/canvas/CanvasArrangeActionBar'
import { useSelectionGrouping } from '@/components/canvas/useSelectionGrouping'
import type { ArrangeAction2d } from '@/lib/canvas/arrange2d'

export function ArrangeToolbar2d(props: {
  active: boolean
  selectedCount: number
  onArrange: (action: ArrangeAction2d) => void
}) {
  const { active, selectedCount, onArrange } = props
  const grouping = useSelectionGrouping({ active })
  return (
    <CanvasArrangeActionBar
      active={active}
      selectedCount={selectedCount}
      onArrange={onArrange}
      canGroupNodes={grouping.canGroupNodes}
      canUngroup={grouping.canUngroup}
      onGroupNodes={grouping.groupNodes}
      onUngroup={grouping.ungroup}
      ariaLabel="Selected graph node actions"
    />
  )
}
