import type React from 'react'
import type { BlockTreeNode } from './blockLibrary'
import { BLOCK_VISUAL_TONES, blockKindBadge, blockRoleLabel, blockVisualCategory, blockVisualShape } from './blockVisualLanguage'
import './blockShapes.css'

type Props = {
  row: BlockTreeNode; childrenByParent: ReadonlyMap<string, readonly BlockTreeNode[]>
  selectedId?: string; focusedId?: string; collapsed: ReadonlySet<string>
  onSelect: (id: string) => void; onToggle: (id: string) => void
  onNavigate: (event: React.KeyboardEvent, row: BlockTreeNode, hasChildren: boolean, expanded: boolean) => void
}

/** Program-specific fork of the Agent Mission hierarchy: native tree semantics, assembled geometry. */
export function BlockProgramRow(props: Props) {
  const { row } = props
  const category = blockVisualCategory(row), tone = BLOCK_VISUAL_TONES[category]
  const role = blockRoleLabel(row), selected = props.selectedId === row.id
  const children = props.childrenByParent.get(row.id) || []
  const expanded = !props.collapsed.has(row.id), compact = !row.statement && row.kind !== 'module'
  const groups: { label: string; body: boolean; rows: BlockTreeNode[] }[] = []
  for (const child of children) {
    const label = child.attachment || (child.statement ? 'Steps' : 'Value'), previous = groups.at(-1)
    if (previous?.label === label && previous.body === child.statement) previous.rows.push(child)
    else groups.push({ label, body: child.statement, rows: [child] })
  }
  const renderGroups = () => expanded && groups.map((group, index) => <ul key={index} role="group" aria-label={group.label}
    className={group.body ? 'kg-block-suite' : 'kg-block-socket'} data-program={row.kind === 'module'}>
    {row.kind !== 'module' && <li role="none" className="kg-block-slot-label" aria-hidden="true">{group.label}</li>}
    {group.rows.map(child => <li key={child.id} role="none" className="kg-block-attachment" data-terminal={['return', 'break', 'continue'].includes(child.kind)}>
      <BlockProgramRow {...props} row={child} />
    </li>)}
  </ul>)
  return <div role="treeitem" tabIndex={props.focusedId === row.id ? 0 : -1}
    aria-label={`${row.title} · ${category} ${role}${row.line ? ` · line ${row.line}` : ''}`}
    aria-description={row.detail} aria-selected={selected} aria-level={row.depth + 1}
    aria-expanded={children.length ? expanded : undefined}
    onClick={event => { event.stopPropagation(); props.onSelect(row.id) }}
    onKeyDown={event => props.onNavigate(event, row, !!children.length, expanded)}
    data-block-node-kind={row.kind} data-block-category={category}
    className="kg-block-assembly relative min-w-0 cursor-pointer text-left" data-compact={compact}
    style={{ '--block-tone': tone, '--block-fill': `color-mix(in srgb, ${tone} 13%, var(--kg-panel-bg, white))`,
      '--block-edge': selected ? '#3b82f6' : `color-mix(in srgb, ${tone} 55%, transparent)` } as React.CSSProperties}>
    <div className="kg-block-card" data-shape={blockVisualShape(row)} data-selected={selected}>
      <div className="kg-block-heading flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 px-2.5 py-2">
        {!!children.length && <button type="button" tabIndex={-1}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.title}`}
          onClick={event => { event.stopPropagation(); props.onToggle(row.id) }}
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded border text-sm hover:bg-black/5 dark:hover:bg-white/10">
          {expanded ? '−' : '+'}
        </button>}
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ background: tone }}>{blockKindBadge(row.kind)}</span>
        <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-5" title={row.title}>{row.title}</span>
        {row.line > 0 && !compact && <span className="shrink-0 text-[10px] opacity-70">L{row.line}</span>}
        {!expanded && !!children.length && <span className="text-[10px] opacity-70">Collapsed</span>}
      </div>
      {!compact && <div className="kg-block-card-meta px-2.5 pb-1 text-[10px] opacity-80">{category} · {role}</div>}
      {row.kind !== 'module' && renderGroups()}
    </div>
    {row.kind === 'module' && renderGroups()}
  </div>
}
