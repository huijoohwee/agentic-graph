import type { ArrangeAction2d } from '@/lib/canvas/arrange2d'
import { UI_RESPONSIVE_CANVAS_FLOATING_ACTION_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { Z_INDEX_GRAPH_OVERLAY_SELECTED } from '@/lib/ui/zIndex'

const CANVAS_ARRANGE_ACTION_BUTTONS: ReadonlyArray<{ action: ArrangeAction2d; label: string }> = [
  { action: 'align-left', label: 'Align L' },
  { action: 'align-center-x', label: 'Align CX' },
  { action: 'align-right', label: 'Align R' },
  { action: 'align-top', label: 'Align T' },
  { action: 'align-center-y', label: 'Align CY' },
  { action: 'align-bottom', label: 'Align B' },
  { action: 'distribute-x', label: 'Dist X' },
  { action: 'distribute-y', label: 'Dist Y' },
]

export function CanvasArrangeActionBar(props: {
  active: boolean
  selectedCount: number
  onArrange: (action: ArrangeAction2d) => void
  canGroupNodes?: boolean
  canUngroup?: boolean
  canDetach?: boolean
  onGroupNodes?: () => void
  onUngroup?: () => void
  onDetach?: () => void
  ariaLabel?: string
  offsetBelowWorkspaceToolbar?: boolean
}) {
  const {
    active,
    selectedCount,
    onArrange,
    canGroupNodes = false,
    canUngroup = false,
    canDetach = false,
    onGroupNodes,
    onUngroup,
    onDetach,
    ariaLabel = 'Selection actions',
    offsetBelowWorkspaceToolbar = false,
  } = props
  const showArrange = !canUngroup && !canDetach && selectedCount >= 2
  const showGroup = !canUngroup && !canDetach && canGroupNodes && !!onGroupNodes
  if (!active || (!showArrange && !showGroup && !canUngroup && !canDetach)) return null

  return (
    <section
      className={[
        `pointer-events-auto absolute right-3 ${offsetBelowWorkspaceToolbar ? 'top-14' : 'top-3'} flex max-w-[calc(100%-1.5rem)] flex-nowrap gap-1 overflow-x-auto rounded-md border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-2 text-xs text-[var(--kg-text)] shadow`,
        UI_RESPONSIVE_CANVAS_FLOATING_ACTION_ROW_CLASSNAME,
      ].join(' ')}
      aria-label={ariaLabel}
      data-kg-selection-action-bar="1"
      style={{ zIndex: Z_INDEX_GRAPH_OVERLAY_SELECTED + 12 }}
    >
      {canUngroup && onUngroup ? (
        <button
          type="button"
          className="shrink-0 rounded border border-violet-500 bg-violet-600 px-2 py-1 font-medium text-white hover:bg-violet-500"
          data-kg-selection-action="ungroup"
          onClick={onUngroup}
        >
          Ungroup
        </button>
      ) : null}
      {canDetach && onDetach ? (
        <button
          type="button"
          className="shrink-0 rounded border border-violet-500 bg-violet-600 px-2 py-1 font-medium text-white hover:bg-violet-500"
          data-kg-selection-action="detach"
          onClick={onDetach}
        >
          Detach
        </button>
      ) : null}
      {showGroup ? (
        <button
          type="button"
          className="shrink-0 rounded border border-violet-500 bg-violet-600 px-2 py-1 font-medium text-white hover:bg-violet-500"
          data-kg-selection-action="group-nodes"
          onClick={onGroupNodes}
        >
          Group Nodes
        </button>
      ) : null}
      {showArrange ? (
        <>
          {CANVAS_ARRANGE_ACTION_BUTTONS.map(button => (
            <button
              key={button.action}
              type="button"
              className="shrink-0 rounded border border-[var(--kg-border)] px-2 py-1 hover:bg-[var(--kg-hover)]"
              onClick={() => onArrange(button.action)}
            >
              {button.label}
            </button>
          ))}
        </>
      ) : null}
    </section>
  )
}
