import type React from 'react'
import { HierarchyGuides } from '@/lib/ui/HierarchyTreeRow'
import type { BlockTreeNode } from './blockLibrary'
import { BLOCK_VISUAL_TONES, blockKindBadge, blockRoleLabel, blockVisualCategory } from './blockVisualLanguage'

/** Program-specific branch of the Agent Mission hierarchy presenter. */
export function BlockProgramRow(props: {
  row: BlockTreeNode; index: number; visibleDepths: readonly number[]
  selected: boolean; focused: boolean; hasChildren: boolean; expanded: boolean
  onClick: () => void; onToggle: () => void
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>
}) {
  const { row } = props
  const category = blockVisualCategory(row), tone = BLOCK_VISUAL_TONES[category]
  const indent = Math.min(row.depth, 5) * 18
  const role = blockRoleLabel(row)
  return <div role="treeitem" tabIndex={props.focused ? 0 : -1}
    aria-label={`${row.title} · ${category} ${role}${row.line ? ` · line ${row.line}` : ''}`}
    aria-description={row.detail} aria-selected={props.selected} aria-level={row.depth + 1}
    aria-expanded={props.hasChildren ? props.expanded : undefined}
    onClick={props.onClick} onKeyDown={props.onKeyDown}
    data-block-node-kind={row.kind} data-block-category={category}
    className="relative min-w-0 cursor-pointer px-2 py-1.5 text-left focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
    style={{ background: props.selected ? 'color-mix(in srgb, #3b82f6 10%, transparent)' : undefined }}>
    <HierarchyGuides depth={row.depth} visibleDepths={props.visibleDepths} index={props.index}
      hasChildren={props.hasChildren} expanded={props.expanded} origin={19} step={18} maxDepth={5} />
    <div className="relative flex min-w-0 items-start gap-1" style={{ marginLeft: indent }}>
      <span className="flex h-10 w-6 shrink-0 items-center justify-center">
        {props.hasChildren && <button type="button" tabIndex={-1}
          aria-label={`${props.expanded ? 'Collapse' : 'Expand'} ${row.title}`}
          onClick={event => { event.stopPropagation(); props.onToggle() }}
          className="flex h-7 w-6 items-center justify-center rounded border text-base hover:bg-black/5 dark:hover:bg-white/10">
          {props.expanded ? '−' : '+'}
        </button>}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border-l-[5px] shadow-sm"
        style={{ borderLeftColor: tone, background: `color-mix(in srgb, ${tone} 13%, var(--kg-panel-bg, white))`,
          outline: props.selected ? '2px solid #3b82f6' : `1px solid color-mix(in srgb, ${tone} 55%, transparent)` }}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-2">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ background: tone }}>{blockKindBadge(row.kind)}</span>
          <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-5" title={row.title}>{row.title}</span>
          {row.line > 0 && <span className="shrink-0 text-[10px] opacity-70">L{row.line}</span>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-2.5 py-1 text-[10px]"
          style={{ borderColor: `color-mix(in srgb, ${tone} 24%, transparent)` }}>
          <span className="font-medium">{category} · {role}</span>
          {props.hasChildren && <span className="opacity-70">{props.expanded ? 'Children' : 'Collapsed'}</span>}
        </div>
      </div>
    </div>
  </div>
}
