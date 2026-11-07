import React from 'react'
import { AtSign, Hash, Slash, type LucideIcon } from 'lucide-react'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import {
  KeyTypeValueHeader,
  KeyTypeValueSectionStack,
} from 'grph-shared/react/keyTypeValueLayout'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
import {
  INLINE_KEYWORD_COMMAND_ACTIONS,
  INLINE_SLASH_COMMAND_ACTIONS,
  INLINE_VARIABLE_COMMAND_ACTIONS,
  type InlineCommandMenuActionSpec,
} from '@/lib/command-menu/inlineCommandMenuCatalog'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { cn } from '@/lib/utils'

export { MediaCatalogPanel } from './MediaCatalogPanel'
export { default } from './MediaCatalogPanel'

const commandMenuCatalogGroups = [
  { key: 'slash', label: '/', title: 'Slash commands', Icon: Slash, actions: INLINE_SLASH_COMMAND_ACTIONS },
  { key: 'variable', label: '@', title: 'Variable commands', Icon: AtSign, actions: INLINE_VARIABLE_COMMAND_ACTIONS },
  { key: 'keyword', label: '#', title: 'Keyword commands', Icon: Hash, actions: INLINE_KEYWORD_COMMAND_ACTIONS },
] as const

function CommandPrefixType({
  Icon,
  label,
  title,
}: {
  Icon: LucideIcon
  label: string
  title: string
}) {
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center justify-start gap-1 overflow-hidden sm:justify-end"
      title={title}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', UI_THEME_TOKENS.text.secondary)} aria-hidden />
      <span className="shrink-0 font-mono text-xs">{label}</span>
      <span className={cn('min-w-0 truncate text-xs', UI_THEME_TOKENS.text.tertiary)}>{title}</span>
    </span>
  )
}

function CommandCatalogRow({
  action,
  Icon,
  prefix,
  title,
  compactStaticRowProps,
}: {
  action: InlineCommandMenuActionSpec
  Icon: LucideIcon
  prefix: string
  title: string
  compactStaticRowProps: Pick<
    React.ComponentProps<typeof KeyTypeValueStaticRow>,
    'textSizeClassName' | 'fontClassName' | 'densityClassName' | 'activeClassName'
  >
}) {
  return (
    <section
      data-kg-command-menu-action={action.id}
      data-kg-command-menu-prefix={prefix}
    >
      <KeyTypeValueStaticRow
        {...compactStaticRowProps}
        align="start"
        keyNode={(
          <span className="flex min-w-0 flex-col leading-4">
            <span className={cn('truncate font-semibold', action.danger ? 'text-red-600 dark:text-red-300' : UI_THEME_TOKENS.text.primary)}>
              {action.label}
            </span>
            <span className={cn('truncate font-mono text-xs font-normal', UI_THEME_TOKENS.text.tertiary)}>{action.id}</span>
          </span>
        )}
        typeNode={<CommandPrefixType Icon={Icon} label={prefix} title={title} />}
        valueNode={(
          <span className="flex min-w-0 flex-col leading-4">
            <span className={cn('truncate text-xs', UI_THEME_TOKENS.text.secondary)}>{action.group}</span>
            <span className={cn('truncate text-xs', UI_THEME_TOKENS.text.tertiary)} title={action.description}>
              {action.description}
            </span>
          </span>
        )}
      />
    </section>
  )
}

export function CommandMenuReferenceCatalog({
  className,
  title = 'Command Menu',
  subtitle = '/, @, and # actions',
  compactHeader = false,
}: {
  className?: string
  title?: string
  subtitle?: string
  compactHeader?: boolean
}) {
  const panelTypography = usePanelTypography()
  const compactStaticRowProps = useCanvasKeyTypeValueStaticRowProps('compact')
  return (
    <section className={cn('min-h-0 overflow-auto px-1 pb-2', panelTypography.panelTextClass, className)} aria-label="Command Menu" data-kg-command-menu-ktv-layout="1" data-kg-command-menu-reference-catalog="1">
      <header className={cn('mb-1 flex items-center justify-between gap-2 px-1 py-1', compactHeader ? '' : UI_THEME_TOKENS.panel.bg)}>
        <section className="min-w-0">
          <h2 className={cn('truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>{title}</h2>
          <p className={cn('truncate text-xs', UI_THEME_TOKENS.text.tertiary)}>{subtitle}</p>
        </section>
        <section className="flex shrink-0 items-center gap-1" aria-label="Command prefixes">
          {commandMenuCatalogGroups.map(group => (
            <span
              key={group.key}
              className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 text-xs font-semibold', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
              title={group.title}
            >
              {group.label}
            </span>
          ))}
        </section>
      </header>
      <section data-kg-command-menu-catalog="1">
        <KeyTypeValueHeader keyLabel="Command" typeLabel="Prefix" valueLabel="Group / description" stickyOffsetClassName="top-0" />
        <KeyTypeValueSectionStack>
        {commandMenuCatalogGroups.map(group => (
          group.actions.map(action => (
            <CommandCatalogRow
              key={action.id}
              action={action}
              Icon={group.Icon}
              prefix={group.label}
              title={group.title}
              compactStaticRowProps={compactStaticRowProps}
            />
          ))
        ))}
        </KeyTypeValueSectionStack>
      </section>
    </section>
  )
}
