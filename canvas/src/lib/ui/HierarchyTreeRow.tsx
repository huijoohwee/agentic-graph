import type React from 'react'

/** Shared, data-neutral hierarchy row for run spans and program statements. */
export function HierarchyTreeRow(props: {
  depth: number
  visibleDepths: readonly number[]
  index: number
  selected: boolean
  focused: boolean
  expanded?: boolean
  hasChildren: boolean
  label: string
  description?: string
  gridTemplateColumns?: string
  variant?: 'span' | 'program'
  onClick: () => void
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>
  primary: React.ReactNode
  columns?: React.ReactNode
}) {
  const guides = Math.min(props.depth, 8)
  const span = props.variant !== 'program'
  return <div role="treeitem" tabIndex={props.focused ? 0 : -1}
    aria-label={props.label} aria-description={props.description}
    aria-selected={props.selected} aria-level={props.depth + 1}
    aria-expanded={props.hasChildren ? props.expanded : undefined}
    onClick={props.onClick} onKeyDown={props.onKeyDown}
    className={`relative grid w-full min-w-0 cursor-pointer items-center gap-3 border-l-4 px-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${span ? 'h-[60px] py-3' : 'min-h-14 py-2'}`}
    style={{ gridTemplateColumns: props.gridTemplateColumns || 'minmax(0, 1fr)', borderLeftColor: props.selected ? '#3b82f6' : 'transparent', background: props.selected ? 'color-mix(in srgb, #3b82f6 22%, var(--kg-bg, white))' : undefined }}>
    {Array.from({ length: guides }, (_, level) => {
      const last = props.visibleDepths.slice(props.index + 1).find(depth => depth <= level + 1) !== level + 1
      const branch = level === guides - 1
      return <span key={level} aria-hidden="true" data-hierarchy-guide="" {...(span ? { 'data-span-guide': '' } : {})}
        className="pointer-events-none absolute top-0 border-l"
        style={{ left: 62 + level * 24, height: branch && last ? '50%' : '100%', borderColor: '#a8a29e', opacity: branch || !last ? 1 : 0 }}>
        {branch && <span className="absolute left-0 w-3 border-b" style={{ top: last ? '100%' : '50%', borderColor: '#a8a29e' }} />}
      </span>
    })}
    {props.hasChildren && props.expanded && <span aria-hidden="true" className="pointer-events-none absolute bottom-0 h-1/2 border-l"
      style={{ left: 62 + guides * 24, borderColor: '#a8a29e' }} />}
    <span className="relative flex min-w-0 items-center gap-3" style={{ paddingLeft: guides * 24 }}>{props.primary}</span>
    {props.columns}
  </div>
}
