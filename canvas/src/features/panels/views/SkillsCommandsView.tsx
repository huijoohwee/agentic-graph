/* eslint-disable react-refresh/only-export-components */
import React from 'react'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import {
  resolveInlineInvocationChipClassName,
} from '@/features/markdown/ui/dataViewChipStyles'
import {
  resolveChatInvocationCatalogEntries,
  resolveChatInvocationCatalogEntryInsertionText,
  type ChatInvocationCatalogEntry,
  type ChatInvocationCatalogPrefixFilter,
} from '@/features/chat/chatInvocationRegistry'
import { useGraphStore } from '@/hooks/useGraphStore'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { MainPanelTypeIcon, resolveMainPanelInvocationSubjectIconKey } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { getIconSizeClass } from '@/lib/ui'
import { insertTextIntoActiveCardInlineTextEditor } from '@/lib/cards/cardInlineTextExternalCommands'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT,
  floatingPanelCatalogCompactRowClassName,
  floatingPanelCatalogCompactRowMetaClassName,
  floatingPanelCatalogCompactRowTitleClassName,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { UI_TEXT_TRUNCATE_CHIP } from '@/lib/ui/textLayout'
import { cn } from '@/lib/utils'
import {
  resolveSkillsCommandsGrammarProjection,
  type SkillsCommandsGrammarGroupBy,
  type SkillsCommandsGrammarProjection,
} from './skillsCommandsGrammar'
type SkillsCommandsViewProps = {
  collapsedGroupKeys?: ReadonlySet<string>
  grammarGroupBy?: SkillsCommandsGrammarGroupBy
  onCollapsedGroupKeysChange?: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>
  onCommandActivate?: (entry: ChatInvocationCatalogEntry) => void | Promise<void>
  prefixFilter?: SkillsCommandsPrefixFilter
  searchQuery?: string
  highlightedTokens?: readonly string[]
  tokenFilter?: readonly string[]
}

export type SkillsCommandsPrefixFilter = ChatInvocationCatalogPrefixFilter
type SkillsCommandsCatalogEntry = ChatInvocationCatalogEntry
const SKILLS_COMMANDS_ICON_SLOT_CLASSNAME = 'kg-skill-command-icon inline-flex h-7 w-7 shrink-0 items-center justify-center'
const SKILLS_COMMANDS_ICON_GLYPH_CLASSNAME = 'kg-skill-command-icon-glyph'

type SkillsCommandsRenderEntry = {
  grammar: SkillsCommandsGrammarProjection
  option: SkillsCommandsCatalogEntry
}

type SkillsCommandsRenderGroup = {
  entries: readonly SkillsCommandsRenderEntry[]
  key: string
  label: string
}

export type SkillsCommandsGroupKeyModel = {
  count: number
  key: string
  label: string
}

const tokenPrefixDataAttribute = (entry: SkillsCommandsCatalogEntry): Record<string, string> => {
  if (entry.token.startsWith('/')) return { 'data-kg-skill-command-slash': entry.id }
  if (entry.token.startsWith('#')) return { 'data-kg-skill-command-hash': entry.id }
  if (entry.token.startsWith('@')) return { 'data-kg-skill-command-at': entry.id }
  return {}
}

const buildSkillsCommandsTokenChipClassName = (token: string): string => resolveInlineInvocationChipClassName({
  value: token,
  extraClassName: 'max-w-[9.5rem]',
})

function renderSkillsCommandsTokenChip(entry: SkillsCommandsCatalogEntry): React.ReactNode {
  const attrs = {
    ...tokenPrefixDataAttribute(entry),
    'data-kg-skill-command-token-chip': '1',
  }
  const className = buildSkillsCommandsTokenChipClassName(entry.token)
  const invocationChip = renderAgenticOsInvocationKeywordChip({ value: entry.token, className })
  if (React.isValidElement<{ className?: string }>(invocationChip)) {
    const chip = invocationChip as React.ReactElement<{ className?: string }>
    return React.cloneElement(chip, {
      ...attrs,
      className: cn(chip.props.className, 'shrink-0'),
    })
  }
  return (
    <span
      className={cn(className, 'shrink-0')}
      title={entry.token}
      data-kg-card-inline-keyword-pill="1"
      {...attrs}
    >
      <span className={UI_TEXT_TRUNCATE_CHIP}>{entry.token}</span>
    </span>
  )
}

function resolveSkillsCommandsRenderEntries(
  prefixFilter: SkillsCommandsPrefixFilter,
  queryRaw: string,
  tokenFilter?: readonly string[],
): readonly SkillsCommandsRenderEntry[] {
  const allowedTokens = new Set((tokenFilter || []).map(token => token.toLowerCase()))
  return resolveChatInvocationCatalogEntries(prefixFilter, queryRaw)
    .filter(option => tokenFilter === undefined || allowedTokens.has(option.token.toLowerCase()))
    .map(option => ({
      grammar: resolveSkillsCommandsGrammarProjection(option),
      option,
    }))
}

function groupSkillsCommandsRenderEntries(entries: readonly SkillsCommandsRenderEntry[], grammarGroupBy: SkillsCommandsGrammarGroupBy): readonly SkillsCommandsRenderGroup[] {
  const groups = new Map<string, SkillsCommandsRenderGroup>()
  for (const entry of entries) {
    const facet = entry.grammar[grammarGroupBy]
    const key = `${grammarGroupBy}:${facet.key}`
    const current = groups.get(key)
    if (current) {
      groups.set(key, { ...current, entries: [...current.entries, entry] })
      continue
    }
    groups.set(key, { key, label: facet.label, entries: [entry] })
  }
  return Array.from(groups.values())
}

export function resolveSkillsCommandsGroupKeys({
  grammarGroupBy = 'subject',
  prefixFilter = 'all',
  searchQuery = '',
  tokenFilter,
}: {
  grammarGroupBy?: SkillsCommandsGrammarGroupBy
  prefixFilter?: SkillsCommandsPrefixFilter
  searchQuery?: string
  tokenFilter?: readonly string[]
}): readonly SkillsCommandsGroupKeyModel[] {
  return groupSkillsCommandsRenderEntries(
    resolveSkillsCommandsRenderEntries(prefixFilter, searchQuery, tokenFilter),
    grammarGroupBy,
  ).map(group => ({
    count: group.entries.length,
    key: group.key,
    label: group.label,
  }))
}

const buildSkillsCommandsGroupContentId = (groupKey: string): string => `skills-commands-group-${groupKey.replace(/[^a-z0-9_-]+/gi, '-')}`

export default function SkillsCommandsView({
  collapsedGroupKeys: controlledCollapsedGroupKeys,
  grammarGroupBy = 'subject',
  onCollapsedGroupKeysChange,
  onCommandActivate,
  prefixFilter = 'all',
  searchQuery = '',
  highlightedTokens,
  tokenFilter,
}: SkillsCommandsViewProps) {
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: ['/', '#', '@'] })
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const uiIconColorClass = useGraphStore(s => s.uiIconColorClass)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const iconColorClass = uiIconColorClass && uiIconColorClass.trim().length > 0 ? uiIconColorClass : UI_THEME_TOKENS.icon.color
  const renderEntries = React.useMemo<readonly SkillsCommandsRenderEntry[]>(
    () => {
      void grammarCatalog.version
      return resolveSkillsCommandsRenderEntries(prefixFilter, searchQuery, tokenFilter)
    },
    [grammarCatalog.version, prefixFilter, searchQuery, tokenFilter],
  )
  const entryGroups = React.useMemo(() => groupSkillsCommandsRenderEntries(renderEntries, grammarGroupBy), [grammarGroupBy, renderEntries])
  const highlightedTokenSet = React.useMemo(
    () => new Set((highlightedTokens || []).map(token => token.toLowerCase())),
    [highlightedTokens],
  )
  const [uncontrolledCollapsedGroupKeys, setUncontrolledCollapsedGroupKeys] = React.useState<ReadonlySet<string>>(() => new Set())
  const collapsedGroupKeys = controlledCollapsedGroupKeys ?? uncontrolledCollapsedGroupKeys
  const setCollapsedGroupKeys = onCollapsedGroupKeysChange ?? setUncontrolledCollapsedGroupKeys
  const handleToggleGroup = React.useCallback((groupKey: string, nextCollapsed: boolean) => {
    setCollapsedGroupKeys(prev => {
      if (prev.has(groupKey) === nextCollapsed) return prev
      const next = new Set(prev)
      if (nextCollapsed) {
        next.add(groupKey)
      } else {
        next.delete(groupKey)
      }
      return next
    })
  }, [setCollapsedGroupKeys])
  const insertCatalogToken = React.useCallback((entry: SkillsCommandsCatalogEntry): boolean => {
    const insertionText = resolveChatInvocationCatalogEntryInsertionText(entry)
    if (!insertionText) return false
    return insertTextIntoActiveCardInlineTextEditor(insertionText)
  }, [])
  const activateCatalogEntry = React.useCallback((entry: SkillsCommandsCatalogEntry): boolean => {
    if (entry.kind === 'command' && onCommandActivate) {
      void onCommandActivate(entry)
      return true
    }
    return insertCatalogToken(entry)
  }, [insertCatalogToken, onCommandActivate])
  const catalogVerified = grammarCatalog.hydration.status === 'fresh'
    && grammarCatalog.routingVerified
    && /^[0-9a-f]{40}$/.test(grammarCatalog.sourceRevision)
    && /^[0-9a-f]{64}$/.test(grammarCatalog.catalogDigest)
  const catalogStatusText = catalogVerified
    ? `Verified source catalog · /${grammarCatalog.counts.slash} #${grammarCatalog.counts.hash} @${grammarCatalog.counts.at} · ${grammarCatalog.sourceRevision.slice(0, 12)}`
    : grammarCatalog.hydration.status === 'loading' || grammarCatalog.hydration.status === 'idle'
      ? 'Verifying the source-backed invocation catalog…'
      : grammarCatalog.hydration.error || 'Source-backed invocation catalog verification is blocked.'

  return (
    <section
      className="min-h-0 pr-1"
      data-kg-floating-panel-skills-commands="true"
      data-kg-floating-panel-catalog-list="skills-commands"
      data-kg-floating-panel-skills-commands-prefix-filter={prefixFilter}
      data-kg-floating-panel-skills-commands-grammar-group-by={grammarGroupBy}
      data-kg-floating-panel-skills-commands-metadata-status={grammarCatalog.hydration.status}
      data-kg-floating-panel-skills-commands-metadata-version={String(grammarCatalog.version)}
      data-kg-floating-panel-skills-commands-source-revision={grammarCatalog.sourceRevision}
      data-kg-floating-panel-skills-commands-catalog-digest={grammarCatalog.catalogDigest}
      data-kg-floating-panel-skills-commands-catalog-counts={`${grammarCatalog.counts.slash}/${grammarCatalog.counts.hash}/${grammarCatalog.counts.at}`}
      aria-label="Skills & Commands"
    >
      <p
        className={cn('mb-1 text-[10px]', catalogVerified ? UI_THEME_TOKENS.text.tertiary : UI_THEME_TOKENS.text.secondary)}
        role={catalogVerified || grammarCatalog.hydration.status === 'loading' || grammarCatalog.hydration.status === 'idle' ? 'status' : 'alert'}
        data-kg-floating-panel-skills-commands-catalog-proof={catalogVerified ? 'verified' : grammarCatalog.hydration.status}
      >
        {catalogStatusText}
      </p>
      <section className="grid min-w-0 gap-1" data-kg-floating-panel-catalog-list-rows={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}>
        {entryGroups.map((group, index) => {
          const groupCollapsed = collapsedGroupKeys.has(group.key)
          return (
            <section
              key={group.key}
              className="min-w-0"
              data-kg-skills-commands-grammar-group={group.key}
              data-kg-skills-commands-grammar-group-by={grammarGroupBy}
              data-kg-skills-commands-grammar-group-collapsed={groupCollapsed ? 'true' : 'false'}
            >
              <CollapsibleSection
                title={(
                  <span className="flex min-w-0 items-center justify-between gap-2" aria-label={`Skills & Commands ${grammarGroupBy} group`}>
                    <span className={cn('m-0 truncate text-[10px] font-semibold uppercase tracking-wide', UI_THEME_TOKENS.text.tertiary)}>{group.label}</span>
                    <span className={cn('shrink-0 text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{group.entries.length}</span>
                  </span>
                )}
                collapsed={groupCollapsed}
                onToggle={nextCollapsed => handleToggleGroup(group.key, nextCollapsed)}
                defaultCollapsed={false}
                flushTop={index === 0}
                id={buildSkillsCommandsGroupContentId(group.key)}
                className="mt-1 border-t pt-1"
                headerClassName="px-0"
              >
                <section className="grid min-w-0 gap-1" data-kg-skills-commands-grammar-group-rows={group.key}>
                  {group.entries.map(({ grammar, option }) => {
                    const iconKey = resolveMainPanelInvocationSubjectIconKey(option)
                    const metaLabel = [option.group, option.summary, option.sourcePath].filter(Boolean).join(' | ')
                    const highlighted = highlightedTokenSet.has(option.token.toLowerCase())
                    return (
                      <article
                        key={option.id}
                        className={cn(
                          floatingPanelCatalogCompactRowClassName(),
                          highlighted && 'ring-1 ring-sky-400/70 dark:ring-sky-300/70',
                        )}
                        data-kg-floating-panel-catalog-row="skills-commands"
                        data-kg-floating-panel-catalog-row-layout={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}
                        data-kg-skill-command-row={option.id}
                        data-kg-skill-command-kind={option.kind}
                        data-kg-skill-command-token={option.token}
                        data-kg-skill-command-targeted={highlighted ? 'true' : 'false'}
                        data-kg-skill-command-icon-key={iconKey}
                        data-kg-skill-command-grammar-subject={grammar.subject.key}
                        data-kg-skill-command-grammar-verb={grammar.verb.key}
                        data-kg-skill-command-grammar-object={grammar.object.key}
                        data-kg-skill-command-insert={option.kind === 'command' && onCommandActivate ? undefined : 'card-inline-text'}
                        data-agenticgraph-skill-command-action={option.kind === 'command' && onCommandActivate ? 'select-execution' : 'insert-modifier'}
                        data-kg-skill-command-prompt-preset={option.promptPresetId || undefined}
                        role="button"
                        tabIndex={0}
                        aria-label={`${option.kind === 'command' && onCommandActivate ? 'Select' : 'Insert'} ${option.token}`}
                        title={option.promptPresetId
                          ? `Load ${option.promptPresetId} prompt preset`
                          : `${option.kind === 'command' && onCommandActivate ? 'Select' : 'Insert'} ${option.token}`}
                        onMouseDown={event => {
                          event.preventDefault()
                        }}
                        onClick={event => {
                          event.preventDefault()
                          event.stopPropagation()
                          activateCatalogEntry(option)
                        }}
                        onKeyDown={event => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          event.stopPropagation()
                          activateCatalogEntry(option)
                        }}
                      >
                        <span
                          className={SKILLS_COMMANDS_ICON_SLOT_CLASSNAME}
                          data-kg-skill-command-icon="1"
                          data-kg-skill-command-icon-key={iconKey}
                          data-kg-skill-command-icon-row={option.id}
                          data-kg-skill-command-icon-token={option.token}
                          data-kg-skill-command-icon-fidelity="toolbar"
                          role="img"
                          aria-label={`${option.label} icon`}
                        >
                          <MainPanelTypeIcon
                            iconKey={iconKey}
                            className={cn(SKILLS_COMMANDS_ICON_GLYPH_CLASSNAME, iconSizeClass, iconColorClass)}
                            strokeWidth={uiIconStrokeWidth}
                          />
                        </span>
                        <section className="min-w-0" aria-label={`${option.label} invocation summary`}>
                          <h3 className={floatingPanelCatalogCompactRowTitleClassName()} title={option.label}>
                            {option.label}
                          </h3>
                          <p className={floatingPanelCatalogCompactRowMetaClassName()} title={metaLabel}>
                            {option.group}
                          </p>
                        </section>
                        {renderSkillsCommandsTokenChip(option)}
                      </article>
                    )
                  })}
                </section>
              </CollapsibleSection>
            </section>
          )
        })}
      </section>
    </section>
  )
}
