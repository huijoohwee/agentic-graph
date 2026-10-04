import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MermaidDiagramPanelView } from './MermaidDiagramPanelView'
import { useStoryboardWidgetDiagramSelectionBridge } from './useStoryboardWidgetDiagramSelectionBridge'
import { useMermaidGitGraphDocument } from './useMermaidGitGraphDocument'
import { parseMermaidDiagramCodeModel } from '@/lib/mermaid/mermaidDiagramCode'
import { parseMermaidGitGraphModel } from '@/lib/mermaid/mermaidGitGraphEdit'
import {
  findGitGraphCommandForRowKey,
  resolveGitGraphCommandRowKey,
  resolveGitGraphSelectedCommand,
} from '@/lib/mermaid/mermaidGitGraphSelection'
import { useGraphStore } from '@/hooks/useGraphStore'
import { HistoryUndoRedoControls } from '@/features/history/HistoryUndoRedoControls'
import { getIconSizeClass } from '@/lib/ui'
import { buildVersionHistoryGitGraphCode, readVersionHistoryIndexFromCommitId } from './versionHistoryGitGraph'

export function GitGraphBottomPanelView({
  compact = false,
}: {
  compact?: boolean
}) {
  const { code, graphData, themeMode, gitGraphModel: gitGraphCommandModel } = useMermaidGitGraphDocument()
  const model = React.useMemo(() => parseMermaidDiagramCodeModel(code, 'gitgraph'), [code])
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
  const displayCode = React.useMemo(() => code || buildVersionHistoryGitGraphCode(history), [code, history])
  const displayModel = React.useMemo(() => parseMermaidDiagramCodeModel(displayCode, 'gitgraph'), [displayCode])
  const displayGitGraphCommandModel = React.useMemo(() => parseMermaidGitGraphModel(displayCode), [displayCode])
  const usesRuntimeHistory = !code && history.length > 0
  const runtimeHistorySelectedRowKey = React.useMemo(() => {
    if (!usesRuntimeHistory || historyIndex < 0) return ''
    const command = displayGitGraphCommandModel.commands[historyIndex]
    return command ? resolveGitGraphCommandRowKey(command, historyIndex, displayModel) : ''
  }, [displayGitGraphCommandModel.commands, displayModel, historyIndex, usesRuntimeHistory])
  const { handleDiagramSelectedRowKeyChange } = useStoryboardWidgetDiagramSelectionBridge({
    graphData,
    diagramModel: model,
    kind: 'gitgraph',
  })
  const handleSelectedRowKeyChange = React.useCallback((rowKey: string | null) => {
    const command = findGitGraphCommandForRowKey(
      usesRuntimeHistory ? displayGitGraphCommandModel.commands : gitGraphCommandModel.commands,
      rowKey,
      usesRuntimeHistory ? displayModel : model,
    )
    if (usesRuntimeHistory) {
      const versionIndex = readVersionHistoryIndexFromCommitId(command?.commitId)
      if (versionIndex >= 0 && versionIndex < history.length) restoreHistory(versionIndex)
      return
    }
    setGitGraphSelectedCommandLineIndex(command?.lineIndex ?? null)
    handleDiagramSelectedRowKeyChange(rowKey)
  }, [displayGitGraphCommandModel.commands, displayModel, gitGraphCommandModel.commands, handleDiagramSelectedRowKeyChange, history.length, model, restoreHistory, setGitGraphSelectedCommandLineIndex, usesRuntimeHistory])

  React.useEffect(() => {
    if (usesRuntimeHistory) return
    const selectedCommand = resolveGitGraphSelectedCommand({
      commands: gitGraphCommandModel.commands,
      diagramModel: model,
      selectedRowKey: mermaidDiagramSelectedRowKey,
      selectedLineIndex: gitGraphSelectedCommandLineIndex,
    })
    if (!selectedCommand) return
    const selectedCommandIndex = gitGraphCommandModel.commands.indexOf(selectedCommand)
    const rowKey = resolveGitGraphCommandRowKey(selectedCommand, selectedCommandIndex, model)
    if (selectedCommand.lineIndex !== gitGraphSelectedCommandLineIndex) {
      setGitGraphSelectedCommandLineIndex(selectedCommand.lineIndex)
    }
    if (rowKey && rowKey !== mermaidDiagramSelectedRowKey) {
      setMermaidDiagramSelectedRowKey('gitgraph', rowKey)
      handleDiagramSelectedRowKeyChange(rowKey)
    }
  }, [
    gitGraphCommandModel.commands,
    gitGraphSelectedCommandLineIndex,
    handleDiagramSelectedRowKeyChange,
    mermaidDiagramSelectedRowKey,
    model,
    setGitGraphSelectedCommandLineIndex,
    setMermaidDiagramSelectedRowKey,
    usesRuntimeHistory,
  ])

  return (
    <MermaidDiagramPanelView
      code={displayCode}
      model={displayModel}
      kind="gitgraph"
      title="GitGraph"
      emptyLabel="No version history yet."
      rootThemeMode={themeMode}
      compact={compact}
      surface="bottomPanel"
      renderMode="diagram"
      headerActions={<HistoryUndoRedoControls iconSizeClass={iconSizeClass} iconStrokeWidth={uiIconStrokeWidth} />}
      controlledSelectedRowKey={usesRuntimeHistory ? runtimeHistorySelectedRowKey : undefined}
      shareSelection={!usesRuntimeHistory}
      onSelectedRowKeyChange={handleSelectedRowKeyChange}
    />
  )
}
