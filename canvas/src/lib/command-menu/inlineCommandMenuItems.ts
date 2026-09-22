import type {
  InlineCommandMenuActionSpec,
  InlineKeywordCommandCandidate,
  InlineMediaCommandCandidate,
} from '@/lib/command-menu/inlineCommandMenuCatalog'
import type { MarkdownInlineCommandMenuItem } from '@/lib/markdown-core/ui/markdownBlockContainerCore.commandMenu'

export type InlineCommandVariableBrowseRow = {
  key: string
  value?: string | null
  source?: string
}

export type InlineCommandMenuItemSpec = {
  id: string
  label: string
  group: string
  description?: string
  title?: string
  keywords?: readonly (string | null | undefined)[]
  thumbnailKind?: MarkdownInlineCommandMenuItem['thumbnailKind']
  thumbnailUrl?: string
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

export function buildInlineCommandMenuItem(spec: InlineCommandMenuItemSpec): MarkdownInlineCommandMenuItem {
  return {
    id: spec.id,
    label: spec.label,
    group: spec.group,
    description: spec.description,
    title: spec.title,
    keywords: (spec.keywords || []).filter(Boolean) as string[],
    thumbnailKind: spec.thumbnailKind,
    thumbnailUrl: spec.thumbnailUrl,
    disabled: spec.disabled,
    danger: spec.danger,
    onSelect: spec.onSelect,
  }
}

export function buildInlineCommandActionMenuItem(args: {
  action: InlineCommandMenuActionSpec
  id?: string
  description?: string
  keywords?: readonly string[]
  disabled?: boolean
  onSelect: () => void
}): MarkdownInlineCommandMenuItem {
  return buildInlineCommandMenuItem({
    id: args.id || args.action.id,
    label: args.action.label,
    group: args.action.group,
    description: args.description || args.action.description,
    keywords: args.keywords || args.action.keywords,
    danger: args.action.danger,
    disabled: args.disabled,
    onSelect: args.onSelect,
  })
}

export function buildInlineMediaCommandMenuItem(args: {
  candidate: InlineMediaCommandCandidate
  group?: string
  idPrefix?: string
  onSelect: () => void
}): MarkdownInlineCommandMenuItem {
  return buildInlineCommandMenuItem({
    id: `${args.idPrefix || ''}${args.candidate.id}`,
    label: args.candidate.label,
    group: args.group || 'Insert media',
    description: args.candidate.description,
    keywords: args.candidate.keywords,
    thumbnailKind: args.candidate.kind,
    thumbnailUrl: args.candidate.thumbnailUrl,
    onSelect: args.onSelect,
  })
}

export function buildInlineVariableBrowseMenuItem(args: {
  row: InlineCommandVariableBrowseRow
  group?: string
  idPrefix?: string
  onSelect: () => void
}): MarkdownInlineCommandMenuItem {
  return buildInlineCommandMenuItem({
    id: `${args.idPrefix || 'variable-'}${args.row.key}`,
    label: args.row.key,
    group: args.group || 'Variables',
    description: `${args.row.value != null ? args.row.value : 'Reference variable'}${args.row.source === 'frontmatter' ? ' from frontmatter' : args.row.source === 'inline' ? ' from inline content' : ''}`,
    keywords: [args.row.value, args.row.source],
    onSelect: args.onSelect,
  })
}

export function buildInlineKeywordCommandMenuItem(args: {
  candidate: InlineKeywordCommandCandidate
  label?: string
  replacement?: string
  onSelect: (replacement: string) => void
}): MarkdownInlineCommandMenuItem {
  const replacement = args.replacement || args.candidate.token
  return buildInlineCommandMenuItem({
    id: args.candidate.id,
    label: args.label || args.candidate.label,
    group: args.candidate.group,
    description: args.candidate.description,
    keywords: args.candidate.keywords,
    onSelect: () => args.onSelect(replacement),
  })
}
