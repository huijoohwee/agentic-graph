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
import { ExaSearchSkillsCommandsProjection } from '@/features/integrations/ExaSearchSkillsCommandsProjection'
import {
  executeSkillsCommandsMcpTarget,
  targetSkillsCommandsCommandInvocation,
  useSkillsCommandsMcpTarget,
} from '@/features/agentic-os/skillsCommandsMcpTarget'

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

type InvocationExecutionStatus =
  | 'idle'
  | 'executing'
  | 'completed'
  | 'queued'
  | 'partial'
  | 'requested-user-input'
  | 'offline-unavailable'
  | 'blocked'

type InvocationExecutionFeedback = Readonly<{
  status: InvocationExecutionStatus
  message: string
  receipt: string
}>

const EMPTY_EXECUTION_FEEDBACK: InvocationExecutionFeedback = Object.freeze({
  status: 'idle',
  message: '',
  receipt: '',
})
const SENSITIVE_RECEIPT_KEY = /(authorization|cookie|credential|password|secret|token)/i

const projectExecutionReceipt = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (typeof value === 'string') return value.slice(0, 512)
  if (value === null || ['boolean', 'number'].includes(typeof value)) return value
  if (typeof value === 'bigint') return value.toString()
  if (!value || typeof value !== 'object') return String(value || '')
  if (seen.has(value)) return '[circular]'
  if (depth >= 4) return '[depth-limited]'
  seen.add(value)
  if (Array.isArray(value)) {
    const projected = value.slice(0, 20).map(entry => projectExecutionReceipt(entry, depth + 1, seen))
    if (value.length > projected.length) projected.push(`[${value.length - projected.length} more items]`)
    return projected
  }
  const entries = Object.entries(value as Record<string, unknown>)
  const projected = Object.fromEntries(entries.slice(0, 30).map(([key, entry]) => [
    key,
    SENSITIVE_RECEIPT_KEY.test(key) ? '[redacted]' : projectExecutionReceipt(entry, depth + 1, seen),
  ]))
  if (entries.length > 30) projected._truncated = `${entries.length - 30} more fields`
  return projected
}

const formatExecutionReceipt = (value: unknown): string => {
  if (value === null || typeof value === 'undefined') return ''
  return JSON.stringify(projectExecutionReceipt(value), null, 2).slice(0, 4096)
}

type FloatingPanelSkillsCommandsViewProps = Readonly<{
  executeTarget?: typeof executeSkillsCommandsMcpTarget
}>

export function FloatingPanelSkillsCommandsView({
  executeTarget = executeSkillsCommandsMcpTarget,
}: FloatingPanelSkillsCommandsViewProps = {}) {
  const panelTypography = usePanelTypography()
  const search = useFloatingPanelCatalogSearch()
  const mcpTarget = useSkillsCommandsMcpTarget()
  const [executionFeedback, setExecutionFeedback] = React.useState<InvocationExecutionFeedback>(EMPTY_EXECUTION_FEEDBACK)
  const [structuredInputText, setStructuredInputText] = React.useState('{}')
  const executionEpoch = React.useRef(0)
  const targetingMcpInvocation = mcpTarget.status !== 'idle'
  const targetTokens = React.useMemo(
    () => targetingMcpInvocation
      ? mcpTarget.resolution?.entries.map(entry => entry.token) || []
      : undefined,
    [mcpTarget.resolution, targetingMcpInvocation],
  )
  React.useEffect(() => {
    executionEpoch.current += 1
    setExecutionFeedback(EMPTY_EXECUTION_FEEDBACK)
    setStructuredInputText('{}')
  }, [mcpTarget.resolution])
  const selectCommand = React.useCallback((entry: { token: string }) => {
    executionEpoch.current += 1
    setExecutionFeedback(EMPTY_EXECUTION_FEEDBACK)
    return targetSkillsCommandsCommandInvocation(entry.token).catch(() => undefined)
  }, [])
  const executeSelectedCommand = React.useCallback(async () => {
    if (mcpTarget.status !== 'ready' || !mcpTarget.resolution) return
    let input: Record<string, unknown>
    try {
      const parsed = JSON.parse(structuredInputText) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Input must be a JSON object.')
      input = parsed as Record<string, unknown>
    } catch (error) {
      setExecutionFeedback({
        status: 'requested-user-input',
        message: error instanceof Error ? error.message : 'Structured input must be valid JSON.',
        receipt: '',
      })
      return
    }
    const epoch = ++executionEpoch.current
    setExecutionFeedback({ status: 'executing', message: 'Executing the exact source-backed command…', receipt: '' })
    const outcome = await executeTarget({
      input,
      online: typeof navigator === 'undefined' ? undefined : navigator.onLine !== false,
    })
    if (epoch !== executionEpoch.current) return
    const messages = {
      completed: `Completed ${outcome.toolName || 'the selected command'}.`,
      queued: `Queued ${outcome.toolName || 'the selected command'} in its canonical persistent outbox.`,
      partial: `The command returned partial mutation evidence; review it before retrying.`,
      'requested-user-input': outcome.error || 'Provide the required structured input before execution.',
      'offline-unavailable': outcome.error || 'This command is unavailable offline.',
      blocked: outcome.error || 'The command was blocked before execution.',
    } as const
    setExecutionFeedback({
      status: outcome.status,
      message: messages[outcome.status],
      receipt: formatExecutionReceipt(outcome.result),
    })
  }, [executeTarget, mcpTarget.resolution, mcpTarget.status, structuredInputText])
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
      data-kg-floating-panel-skills-commands-mcp-target={mcpTarget.mcpTool || undefined}
      data-kg-floating-panel-skills-commands-invocation-target={mcpTarget.target || undefined}
      data-kg-floating-panel-skills-commands-invocation-target-kind={mcpTarget.targetKind}
      data-kg-floating-panel-skills-commands-mcp-target-status={mcpTarget.status}
      data-kg-floating-panel-skills-commands-mcp-target-action={mcpTarget.resolution?.invocation.action || undefined}
      data-kg-floating-panel-skills-commands-mcp-target-tokens={targetTokens?.join(' ') || undefined}
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
        {mcpTarget.status === 'loading' ? (
          <p role="status" data-kg-floating-panel-skills-commands-mcp-feedback="loading">
            Resolving source-backed invocation…
          </p>
        ) : null}
        {mcpTarget.status === 'blocked' ? (
          <p role="alert" data-kg-floating-panel-skills-commands-mcp-feedback="blocked">
            {mcpTarget.error || 'Source-backed invocation resolution failed.'}
          </p>
        ) : null}
        {mcpTarget.status === 'ready' && targetTokens?.length ? (
          <section
            className="grid gap-1"
            data-kg-floating-panel-skills-commands-mcp-feedback="ready"
            data-agenticgraph-invocation-selection="ready"
          >
            <p role="status">Source-backed invocation selected: {targetTokens.join(' ')}</p>
            <label className="grid gap-1 text-xs" htmlFor="agenticgraph-invocation-structured-input">
              Structured input (JSON)
              <textarea
                id="agenticgraph-invocation-structured-input"
                className={cn('min-h-24 rounded border p-2 font-mono text-xs', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg)}
                value={structuredInputText}
                disabled={executionFeedback.status === 'executing'}
                onChange={event => setStructuredInputText(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-agenticgraph-invocation-input="json"
              />
            </label>
            <button
              type="button"
              className={cn(
                'min-h-11 rounded border px-2 py-1 text-left text-xs',
                UI_THEME_TOKENS.input.border,
                UI_THEME_TOKENS.button.text,
                UI_THEME_TOKENS.button.hoverBg,
              )}
              disabled={executionFeedback.status === 'executing'}
              onClick={() => { void executeSelectedCommand() }}
              data-agenticgraph-invocation-execute="selected"
            >
              {executionFeedback.status === 'executing' ? 'Executing…' : 'Execute selected command'}
            </button>
            {executionFeedback.status !== 'idle' ? (
              <section data-agenticgraph-invocation-execution-status={executionFeedback.status}>
                <p role={['blocked', 'offline-unavailable', 'partial', 'requested-user-input'].includes(executionFeedback.status) ? 'alert' : 'status'}>
                  {executionFeedback.message}
                </p>
                {executionFeedback.receipt ? (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs" data-agenticgraph-invocation-receipt="sanitized">
                    {executionFeedback.receipt}
                  </pre>
                ) : null}
              </section>
            ) : null}
          </section>
        ) : null}
        {targetingMcpInvocation ? null : (
          <>
            <ExaSearchSkillsCommandsProjection />
            <MotionCapturePlatformProjection variant="skills" />
          </>
        )}
        <SkillsCommandsView
          collapsedGroupKeys={collapsedGroupKeys}
          grammarGroupBy={grammarGroupBy}
          onCollapsedGroupKeysChange={setCollapsedGroupKeys}
          onCommandActivate={selectCommand}
          prefixFilter={prefixFilter}
          searchQuery={search.searchQuery}
          highlightedTokens={targetTokens}
        />
      </section>
    </section>
  )
}
