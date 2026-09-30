import React from 'react'
import { ChevronDown, ChevronRight, FileCode2, FileImage, FileJson2, FileText, Hash } from 'lucide-react'
import { UI_THEME_TOKENS } from './theme-tokens'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME } from './responsiveElementClasses'

const iconActionClass = `${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} ml-1 p-0 shrink-0 inline-flex items-center justify-center rounded ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.focus.primaryRing}`
const indentAt = (depth: number) => depth * 20

const fileGlyph = (name: string) => {
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'json' || extension === 'jsonld') return { Icon: FileJson2, color: 'text-amber-700 dark:text-amber-300' }
  if (extension && ['js', 'jsx', 'ts', 'tsx', 'py', 'html', 'xml', 'sh'].includes(extension)) return { Icon: FileCode2, color: 'text-cyan-700 dark:text-cyan-300' }
  if (extension && ['css', 'scss', 'sass'].includes(extension)) return { Icon: Hash, color: 'text-purple-700 dark:text-purple-300' }
  if (extension && ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'].includes(extension)) return { Icon: FileImage, color: 'text-rose-700 dark:text-rose-300' }
  return { Icon: FileText, color: extension === 'md' || extension === 'mdx' ? 'text-blue-700 dark:text-blue-300' : '' }
}

export function DirectoryTreeBranch({ children }: { children: React.ReactNode }) {
  return <li className="group/source-branch list-none">{children}</li>
}

export function DirectoryTreeRow(props: { depth: number; label: string; children: React.ReactNode }) {
  return <section className="group flex min-w-0 items-center" style={{ paddingLeft: indentAt(props.depth) }} aria-label={props.label}>{props.children}</section>
}

export function DirectoryTreeDisclosure(props: { name: string; path: string; expanded: boolean; onToggle: () => void }) {
  const action = props.expanded ? 'Collapse' : 'Expand'
  const Icon = props.expanded ? ChevronDown : ChevronRight
  return <button type="button" aria-label={`${action} folder ${props.name}`} aria-expanded={props.expanded}
    title={`${action} ${props.path}`} className={iconActionClass} onClick={props.onToggle}>
    <Icon role="img" aria-label={`${action} folder`} className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />
  </button>
}

export function DirectoryTreeFileButton(props: {
  name: string; path: string; selected: boolean; onSelect: () => void;
  label?: string; onContextMenu?: React.MouseEventHandler<HTMLButtonElement>
}) {
  const { Icon, color } = fileGlyph(props.name)
  const label = props.label || `Select file ${props.name}`
  return <button type="button" aria-label={label} aria-pressed={props.selected} title={props.path}
    className={iconActionClass} onClick={props.onSelect} onContextMenu={props.onContextMenu}>
    <Icon role="img" aria-label={label} className={`${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} ${color}`} />
  </button>
}

export function DirectoryTreeChildren(props: {
  name: string; path: string; depth: number; guideCenter?: string; onSelect: () => void; children: React.ReactNode
}) {
  return <section className="relative" aria-label={`Contents of folder ${props.name}`}>
    <button type="button" aria-label={`Select folder ${props.name} from hierarchy guide`} title={`Select ${props.path}`}
      className={`absolute inset-y-0 w-3 p-0 rounded opacity-0 group-hover/source-branch:opacity-30 group-focus-within/source-branch:opacity-30 hover:!opacity-50 focus-visible:!opacity-50 ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.focus.primaryRing}`}
      style={{ left: `calc(${indentAt(props.depth)}px + ${props.guideCenter || '0.25rem + var(--kg-data-view-icon-action-sm-size, 1.75rem) / 2'} - 0.375rem)` }}
      onClick={props.onSelect}>
      <svg role="img" aria-label={`Hierarchy guide for ${props.name}`} className="block h-full w-full" viewBox="0 0 12 100" preserveAspectRatio="none">
        <line x1="6" y1="0" x2="6" y2="100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </button>
    {props.children}
  </section>
}
