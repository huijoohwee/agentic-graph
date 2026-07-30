import React from 'react'
import SkillsCommandsView from '@/features/panels/views/SkillsCommandsView'
import {
  resolveSkillsCommandsGroupKeys,
  type SkillsCommandsPrefixFilter,
} from '@/features/panels/views/SkillsCommandsView'
import type { SkillsCommandsGrammarGroupBy } from '@/features/panels/views/skillsCommandsGrammar'
import { AtSign, Hash, Slash } from 'lucide-react'
import ExpandCollapseAllButton from '@/features/panels/ui/ExpandCollapseAllButton'
import { useCollapsibleSectionGroup } from '@/features/panels/ui/useCollapsibleSectionGroup'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import {
  FloatingPanelCatalogHeader,
  FloatingPanelCatalogSearchControl,
  floatingPanelCatalogBodyClassName,
  floatingPanelCatalogSurfaceClassName,
  useFloatingPanelCatalogSearch,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { MotionCapturePlatformProjection } from '@/features/three/MotionCapturePlatformProjection'

const SKILLS_COMMANDS_PREFIX_FILTERS: Array<{ filter: SkillsCommandsPrefixFilter; label: string; Icon: typeof Slash }> = [
  { filter: 'slash', label: 'Slash commands', Icon: Slash },
  { filter: 'hash', label: 'Hash semantics', Icon: Hash },
  { filter: 'at', label: 'At bindings', Icon: AtSign },
]

const SKILLS_COMMANDS_GRAMMAR_GROUPS: Array<{ groupBy: SkillsCommandsGrammarGroupBy; label: string; shortLabel: string }> = [
  { groupBy: 'subject', label: 'Subject', shortLabel: 'S' },
  { groupBy: 'verb', label: 'Verb', shortLabel: 'V' },
  { groupBy: 'object', label: 'Object', shortLabel: 'O' },
]

export function FloatingPanelSkillsCommandsView() {
  const panelTypography = usePanelTypography()
  const search = useFloatingPanelCatalogSearch()
  const [prefixFilter, setPrefixFilter] = React.useState<SkillsCommandsPrefixFilter>('all')
  const [grammarGroupBy, setGrammarGroupBy] = React.useState<SkillsCommandsGrammarGroupBy>('subject')
  const visibleGroupKeys = React.useMemo(() => resolveSkillsCommandsGroupKeys({
    grammarGroupBy,
    prefixFilter,
    searchQuery: search.searchQuery,
  }), [grammarGroupBy, prefixFilter, search.searchQuery])
  const visibleGroupKeyValues = React.useMemo(() => visibleGroupKeys.map(group => group.key), [visibleGroupKeys])
  const {
    allCollapsed: allGroupsCollapsed,
    collapseAll: collapseAllGroups,
    collapsedKeys: collapsedGroupKeys,
    expandAll: expandAllGroups,
    setCollapsedKeys: setCollapsedGroupKeys,
  } = useCollapsibleSectionGroup(visibleGroupKeyValues)

  return (
    <section
      className={floatingPanelCatalogSurfaceClassName(panelTypography.panelTextClass)}
      data-kg-floating-panel-skills-commands-view="true"
      data-kg-floating-panel-catalog-layout="media-reuse"
      data-kg-floating-panel-skills-commands-media-layout="reuse"
      aria-label="Skills & Commands"
    >
      <FloatingPanelCatalogHeader
        title="Skills & Commands"
        subtitle="/ # @ invocation catalog"
        actionsLabel="Skills & Commands actions"
        dataAttributes={{ 'data-kg-floating-panel-skills-commands-header': '1' }}
        actions={(
          <>
            <section
              className={cn('inline-flex h-6 items-center overflow-hidden rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
              role="group"
              aria-label="Skills & Commands prefix"
              data-kg-floating-panel-skills-commands-prefix-filter="1"
            >
              {SKILLS_COMMANDS_PREFIX_FILTERS.map(option => {
                const Icon = option.Icon
                const active = prefixFilter === 'all' || prefixFilter === option.filter
                return (
                  <button
                    key={option.filter}
                    type="button"
                    className={cn(
                      'inline-flex h-full w-6 items-center justify-center border-0 px-0',
                      active ? 'bg-black/10 dark:bg-white/15' : UI_THEME_TOKENS.button.hoverBg,
                      UI_THEME_TOKENS.text.secondary,
                    )}
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={active}
                    data-kg-skills-commands-prefix-toggle={option.filter}
                    onClick={() => setPrefixFilter(current => current === option.filter ? 'all' : option.filter)}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden />
                  </button>
                )
              })}
            </section>
            <section
              className={cn('inline-flex h-6 items-center overflow-hidden rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
              role="group"
              aria-label="Skills & Commands group by"
              data-kg-floating-panel-skills-commands-grammar-group="1"
            >
              {SKILLS_COMMANDS_GRAMMAR_GROUPS.map(option => {
                const active = grammarGroupBy === option.groupBy
                return (
                  <button
                    key={option.groupBy}
                    type="button"
                    className={cn(
                      'inline-flex h-full w-6 items-center justify-center border-0 px-0 text-[10px] font-semibold',
                      active ? 'bg-black/10 dark:bg-white/15' : UI_THEME_TOKENS.button.hoverBg,
                      UI_THEME_TOKENS.text.secondary,
                    )}
                    title={`Group by ${option.label}`}
                    aria-label={`Group by ${option.label}`}
                    aria-pressed={active}
                    data-kg-skills-commands-grammar-toggle={option.groupBy}
                    onClick={() => setGrammarGroupBy(option.groupBy)}
                  >
                    {option.shortLabel}
                  </button>
                )
              })}
            </section>
          </>
        )}
        searchControl={(
          <FloatingPanelCatalogSearchControl
            state={search}
            id="kg-skills-commands-catalog-search"
            buttonLabel="Search skills and commands"
            panelLabel="Search Skills & Commands catalog"
            placeholder="Search commands"
            panelWidthClassName="w-40 max-w-[12rem]"
            affordanceDataAttributes={{
              'data-kg-floating-panel-skills-commands-search-affordance': '1',
              'data-kg-skills-commands-search-affordance': '1',
            }}
            panelDataAttributes={{
              'data-kg-floating-panel-skills-commands-search-panel': 'overlay',
              'data-kg-skills-commands-search-panel': 'overlay',
            }}
            inputDataAttributes={{
              'data-kg-floating-panel-skills-commands-search-input': '1',
              'data-kg-skills-commands-search-input': '1',
            }}
            clearDataAttributes={{
              'data-kg-floating-panel-skills-commands-search-clear': '1',
              'data-kg-skills-commands-search-clear': '1',
            }}
            toggleDataAttributes={{
              'data-kg-floating-panel-skills-commands-search-toggle': '1',
              'data-kg-skills-commands-search-toggle': '1',
            }}
          />
        )}
        trailingActions={visibleGroupKeyValues.length > 0 ? (
          <section
            className="inline-flex h-6 shrink-0 items-center"
            aria-label="Skills & Commands group disclosure"
            data-kg-skills-commands-disclosure-actions="header"
          >
            <ExpandCollapseAllButton
              allCollapsed={allGroupsCollapsed}
              onExpandAll={expandAllGroups}
              onCollapseAll={collapseAllGroups}
            />
          </section>
        ) : null}
      />
      <section className={floatingPanelCatalogBodyClassName()} tabIndex={-1} data-kg-floating-panel-catalog-body="skills-commands" data-kg-floating-panel-skills-commands-list="1" aria-label="Skills & Commands catalog">
        <MotionCapturePlatformProjection variant="skills" />
        <SkillsCommandsView
          collapsedGroupKeys={collapsedGroupKeys}
          grammarGroupBy={grammarGroupBy}
          onCollapsedGroupKeysChange={setCollapsedGroupKeys}
          prefixFilter={prefixFilter}
          searchQuery={search.searchQuery}
        />
      </section>
    </section>
  )
}
