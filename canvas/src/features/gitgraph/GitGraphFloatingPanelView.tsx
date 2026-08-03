import React from 'react'
import { GitBranch, GitCommitHorizontal, GitMerge, PencilLine, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { useGraphStore } from '@/hooks/useGraphStore'
import { parseMermaidDiagramCodeModel } from '@/lib/mermaid/mermaidDiagramCode'
import {
  appendMermaidGitGraphCommand,
  deleteMermaidGitGraphCommandLine,
  updateMermaidGitGraphCommandLine,
  type MermaidGitGraphAddKind,
  type MermaidGitGraphCommand,
} from '@/lib/mermaid/mermaidGitGraphEdit'
import {
  findGitGraphCommandForRowKey,
  resolveGitGraphCommandRowKey,
} from '@/lib/mermaid/mermaidGitGraphSelection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { useStoryboardWidgetDiagramSelectionBridge } from './useStoryboardWidgetDiagramSelectionBridge'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'
import { useMermaidGitGraphDocument } from './useMermaidGitGraphDocument'
import { HistoryUndoRedoControls } from '@/features/history/HistoryUndoRedoControls'
import { getIconSizeClass } from '@/lib/ui'

const GITGRAPH_COMMAND_LABELS: Record<MermaidGitGraphAddKind, string> = {
  commit: 'Commit',
  branch: 'Branch',
  merge: 'Merge',
  'cherry-pick': 'Cherry-pick',
}
export const GITGRAPH_CREATE_ACTION_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-2 gap-1 px-1 sm:grid-cols-4'

const buildCommandDescription = (command: MermaidGitGraphCommand | null): string => {
  if (!command) return 'No command selected'
  const subject = command.commitId || command.target || command.label
  return `${command.kind}${subject ? `: ${subject}` : ''}`
}

export function GitGraphFloatingPanelView() {
  const [editRequestKey, setEditRequestKey] = React.useState(0)
  const [editStatus, setEditStatus] = React.useState('')
  const commandListRef = React.useRef<HTMLElement | null>(null)
  const {
    gitGraphSelectedCommandLineIndex,
    mermaidDiagramSelectedRowKey,
    setGitGraphSelectedCommandLineIndex,
    setMermaidDiagramSelectedRowKey,
    uiIconScale,
    uiIconStrokeWidth,
    history,
    historyIndex,
    restoreHistory,
  } = useGraphStore(
    useShallow(state => ({
      gitGraphSelectedCommandLineIndex: state.gitGraphSelectedCommandLineIndex,
      mermaidDiagramSelectedRowKey: state.mermaidDiagramSelectedRowKeyByKind.gitgraph || '',
      setGitGraphSelectedCommandLineIndex: state.setGitGraphSelectedCommandLineIndex,
      setMermaidDiagramSelectedRowKey: state.setMermaidDiagramSelectedRowKey,
      uiIconScale: state.uiIconScale,
      uiIconStrokeWidth: state.uiIconStrokeWidth,
      history: state.history,
      historyIndex: state.historyIndex,
      restoreHistory: state.restoreHistory,
    })),
  )
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const { code, commitGitGraphCode, gitGraphModel, graphData } = useMermaidGitGraphDocument()
  const usesRuntimeHistory = !code && history.length > 0
  const gitGraphDiagramModel = React.useMemo(() => parseMermaidDiagramCodeModel(code, 'gitgraph'), [code])
  const { handleDiagramSelectedRowKeyChange } = useStoryboardWidgetDiagramSelectionBridge({
    graphData,
    diagramModel: gitGraphDiagramModel,
    kind: 'gitgraph',
  })
  const resolveCommandSelectionKey = React.useCallback((command: MermaidGitGraphCommand | null | undefined, index = -1): string => {
    return resolveGitGraphCommandRowKey(command, index, gitGraphDiagramModel)
  }, [gitGraphDiagramModel])
  const sharedSelectedCommand = React.useMemo(() => {
    return findGitGraphCommandForRowKey(gitGraphModel.commands, mermaidDiagramSelectedRowKey, gitGraphDiagramModel)
  }, [gitGraphDiagramModel, gitGraphModel.commands, mermaidDiagramSelectedRowKey])
  const selectedCommand = React.useMemo(() => {
    if (sharedSelectedCommand) return sharedSelectedCommand
    if (gitGraphSelectedCommandLineIndex != null) {
      const manual = gitGraphModel.commands.find(command => command.lineIndex === gitGraphSelectedCommandLineIndex)
      if (manual) return manual
    }
    return null
  }, [gitGraphModel.commands, gitGraphSelectedCommandLineIndex, sharedSelectedCommand])
  const selectedCommandKey = React.useMemo(() => resolveCommandSelectionKey(selectedCommand), [resolveCommandSelectionKey, selectedCommand])
  const selectCommand = React.useCallback((command: MermaidGitGraphCommand | null) => {
    if (!command) {
      setGitGraphSelectedCommandLineIndex(null)
      setMermaidDiagramSelectedRowKey('gitgraph', null)
      handleDiagramSelectedRowKeyChange(null)
      return
    }
    const rowKey = resolveCommandSelectionKey(command)
    setGitGraphSelectedCommandLineIndex(command.lineIndex)
    setMermaidDiagramSelectedRowKey('gitgraph', rowKey)
    handleDiagramSelectedRowKeyChange(rowKey)
  }, [handleDiagramSelectedRowKeyChange, resolveCommandSelectionKey, setGitGraphSelectedCommandLineIndex, setMermaidDiagramSelectedRowKey])

  React.useEffect(() => {
    if (usesRuntimeHistory) return
    if (gitGraphSelectedCommandLineIndex == null) return
    if (gitGraphModel.commands.some(command => command.lineIndex === gitGraphSelectedCommandLineIndex)) return
    setGitGraphSelectedCommandLineIndex(null)
  }, [gitGraphModel.commands, gitGraphSelectedCommandLineIndex, setGitGraphSelectedCommandLineIndex, usesRuntimeHistory])

  React.useEffect(() => {
    if (usesRuntimeHistory) return
    if (!mermaidDiagramSelectedRowKey) return
    if (findGitGraphCommandForRowKey(gitGraphModel.commands, mermaidDiagramSelectedRowKey, gitGraphDiagramModel)) return
    setMermaidDiagramSelectedRowKey('gitgraph', null)
  }, [gitGraphDiagramModel, gitGraphModel.commands, mermaidDiagramSelectedRowKey, setMermaidDiagramSelectedRowKey, usesRuntimeHistory])

  React.useEffect(() => {
    if (!sharedSelectedCommand) return
    if (gitGraphSelectedCommandLineIndex === sharedSelectedCommand.lineIndex) return
    setGitGraphSelectedCommandLineIndex(sharedSelectedCommand.lineIndex)
  }, [gitGraphSelectedCommandLineIndex, setGitGraphSelectedCommandLineIndex, sharedSelectedCommand])

  React.useLayoutEffect(() => {
    if (usesRuntimeHistory) return
    if (gitGraphSelectedCommandLineIndex == null) return
    const frame = window.requestAnimationFrame(() => {
      const row = commandListRef.current?.querySelector(
        `[data-kg-gitgraph-command-line="${gitGraphSelectedCommandLineIndex}"]`,
      )
      if (!(row instanceof HTMLElement)) return
      row.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [gitGraphModel.commands.length, gitGraphSelectedCommandLineIndex, usesRuntimeHistory])

  const addCommand = React.useCallback((kind: MermaidGitGraphAddKind) => {
    if (!code) return
    const nextCode = appendMermaidGitGraphCommand(code, kind)
    const actionLabel = `Add ${GITGRAPH_COMMAND_LABELS[kind]}`
    if (commitGitGraphCode(nextCode, actionLabel)) {
      setEditStatus(actionLabel)
      return
    }
    setEditStatus(`${GITGRAPH_COMMAND_LABELS[kind]} unavailable`)
  }, [code, commitGitGraphCode])

  const updateSelectedCommand = React.useCallback((nextLine: string) => {
    if (!selectedCommand) return
    const actionLabel = `Update ${selectedCommand.kind}`
    if (commitGitGraphCode(updateMermaidGitGraphCommandLine(code, selectedCommand.lineIndex, nextLine), actionLabel)) {
      setEditStatus(actionLabel)
    } else {
      setEditStatus('No source change')
    }
  }, [code, commitGitGraphCode, selectedCommand])

  const deleteSelectedCommand = React.useCallback(() => {
    if (!selectedCommand) return
    const actionLabel = `Delete ${selectedCommand.kind}`
    if (commitGitGraphCode(deleteMermaidGitGraphCommandLine(code, selectedCommand.lineIndex), actionLabel)) {
      setGitGraphSelectedCommandLineIndex(null)
      setMermaidDiagramSelectedRowKey('gitgraph', null)
      handleDiagramSelectedRowKeyChange(null)
      setEditStatus(actionLabel)
    }
  }, [code, commitGitGraphCode, handleDiagramSelectedRowKeyChange, selectedCommand, setGitGraphSelectedCommandLineIndex, setMermaidDiagramSelectedRowKey])

  if (!code) {
    return (
      <section className="flex h-full flex-col" aria-label="GitGraph command editor" data-kg-gitgraph-floating-panel="1">
        <header className="flex items-center justify-between gap-2 px-1 py-1">
          <span className={cn('truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>GitGraph</span>
          <HistoryUndoRedoControls iconSizeClass={iconSizeClass} iconStrokeWidth={uiIconStrokeWidth} />
        </header>
        {history.length ? (
          <ol className="min-h-0 flex-1 overflow-auto rounded-md border border-[var(--kg-border)]" aria-label="Version history list">
            {history.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-2 border-b border-[var(--kg-border)] px-2 py-1.5 text-left text-xs last:border-b-0',
                    index === historyIndex ? uiSelectedRowStateClassName(true) : UI_THEME_TOKENS.button.hoverBg,
                  )}
                  aria-current={index === historyIndex ? 'step' : undefined}
                  onClick={() => restoreHistory(index)}
                  data-kg-version-history-index={index}
                >
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  <span className={UI_THEME_TOKENS.text.tertiary}>v{index + 1}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <section className={cn('px-1 text-xs', UI_THEME_TOKENS.text.secondary)}>No version history yet.</section>
        )}
      </section>
    )
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-2"
      aria-label="GitGraph command editor"
      data-kg-gitgraph-floating-panel="1"
      data-kg-mermaid-diagram-render-mode="list"
      data-kg-gitgraph-selected-row-key={selectedCommandKey || undefined}
      data-kg-gitgraph-selected-command={selectedCommand?.kind || undefined}
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <section className="min-w-0">
          <section className={cn('truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>GitGraph</section>
          <section className={cn('truncate text-[11px]', UI_THEME_TOKENS.text.secondary)} data-kg-gitgraph-selected-command-label="1">
            {buildCommandDescription(selectedCommand)}
          </section>
        </section>
        <nav className="flex items-center gap-1" aria-label="GitGraph version and edit controls">
          <HistoryUndoRedoControls iconSizeClass={iconSizeClass} iconStrokeWidth={uiIconStrokeWidth} />
          <button
            type="button"
            className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
            aria-label="Edit selected GitGraph command"
            title="Edit selected GitGraph command"
            disabled={!selectedCommand}
            onClick={() => setEditRequestKey(value => value + 1)}
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </nav>
      </header>
      <section className={GITGRAPH_CREATE_ACTION_GRID_CLASS_NAME} data-kg-gitgraph-create-actions="1">
        <button
          type="button"
          className={cn('App-toolbar__btn justify-center', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          aria-label="Add GitGraph commit"
          title="Add GitGraph commit"
          onClick={() => addCommand('commit')}
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn('App-toolbar__btn justify-center', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          aria-label="Add GitGraph branch"
          title="Add GitGraph branch"
          onClick={() => addCommand('branch')}
        >
          <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn('App-toolbar__btn justify-center', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          aria-label="Add GitGraph merge"
          title="Add GitGraph merge"
          onClick={() => addCommand('merge')}
        >
          <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="App-toolbar__btn justify-center border-red-300/70 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-700/70 dark:bg-red-950/30 dark:text-red-300"
          aria-label="Delete selected GitGraph command"
          title="Delete selected GitGraph command"
          disabled={!selectedCommand}
          onClick={deleteSelectedCommand}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </section>
      <section className="px-1">
        <CardInlineTextEditor
          id="kg-gitgraph-command-inline-editor"
          value={selectedCommand?.raw || ''}
          ariaLabel="Edit GitGraph command"
          placeholder="Select a GitGraph command"
          canEdit={!!selectedCommand}
          editActivation="click"
          editRequestKey={editRequestKey}
          displayClassName="min-h-8 rounded-md border border-[var(--kg-border)] bg-[var(--kg-panel-bg-hover)] px-2 py-1.5 font-mono text-[11px] leading-5 text-[var(--kg-text-primary)]"
          editorClassName="min-h-8 rounded-md border border-[var(--kg-canvas-accent)] bg-[var(--kg-panel-bg)] px-2 py-1.5 font-mono text-[11px] leading-5 text-[var(--kg-text-primary)]"
          emptyClassName="text-[var(--kg-text-secondary)]"
          onCommit={updateSelectedCommand}
        />
      </section>
      <section
        ref={commandListRef}
        className="min-h-0 flex-1 overflow-auto rounded-md border border-[var(--kg-border)]"
        data-kg-gitgraph-command-list="1"
      >
        {gitGraphModel.commands.map((command, index) => {
          const selected = selectedCommand?.lineIndex === command.lineIndex
          const rowKey = resolveCommandSelectionKey(command, index)
          return (
            <button
              key={command.key}
              type="button"
              className={[
                'flex w-full items-center gap-2 border-b border-[var(--kg-border)] px-2 py-1.5 text-left last:border-b-0',
                selected
                  ? 'text-[var(--kg-text-primary)] shadow-[inset_3px_0_0_var(--kg-canvas-accent)] ring-2 ring-inset ring-[var(--kg-canvas-accent)]'
                  : selectedCommand
                    ? 'text-[var(--kg-text-tertiary)] opacity-45 hover:bg-[var(--kg-panel-bg-hover)] hover:opacity-90'
                    : 'text-[var(--kg-text-secondary)] hover:bg-[var(--kg-panel-bg-hover)]',
              ].join(' ')}
              style={selected ? {
                backgroundColor: 'color-mix(in srgb, var(--kg-canvas-accent) 16%, var(--kg-panel-bg))',
              } : undefined}
              data-kg-gitgraph-command-row="1"
              data-kg-gitgraph-command-kind={command.kind}
              data-kg-gitgraph-command-line={command.lineIndex}
              data-kg-gitgraph-command-row-key={rowKey || undefined}
              data-kg-gitgraph-command-selected={selected ? '1' : undefined}
              data-kg-gitgraph-command-dimmed={selectedCommand && !selected ? '1' : undefined}
              onClick={() => selectCommand(command)}
            >
              <span className="w-16 shrink-0 text-[10px] uppercase tracking-normal">{command.kind}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{command.label}</span>
              <span className="shrink-0 text-[10px] text-[var(--kg-text-tertiary)]">L{command.lineNumber}</span>
            </button>
          )
        })}
      </section>
      <section className="truncate px-1 text-[11px] text-[var(--kg-text-tertiary)]" data-kg-gitgraph-edit-status="1">
        {editStatus || `${gitGraphModel.commands.length} commands`}
      </section>
    </section>
  )
}
