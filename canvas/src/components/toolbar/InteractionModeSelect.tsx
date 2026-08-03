import React from 'react'
import { Compass, Hand, ListChecks, Lock, Play, Unlock } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import { isMultiNodeSelectMode } from '@/lib/canvas/nodeSelectionGesture'
import { SelectableRowValue } from '@/components/ui/SelectableRowValue'
import {
  CANVAS_INTERACTION_BINDING_TOKEN,
  CANVAS_INTERACTION_COMMAND_TOKEN,
  CANVAS_INTERACTION_MCP_TOOL_NAME,
  CANVAS_INTERACTION_SEMANTIC_TOKEN,
  buildCanvasInteractionInvocation,
} from '@/lib/canvas/canvasInteractionInvocationContract.mjs'
import {
  registerCanvasInteractionControlHandler,
  type CanvasInteractionControlOptionId,
} from '@/lib/canvas/canvasInteractionControlRuntime'

type InteractionModeSelectProps = {
  iconSizeClass: string
  iconStrokeWidth: number
  ensureBaselineUnlocked?: () => boolean
}

type InteractionOption = {
  key: 'navigate' | 'lock' | 'multi' | 'canvasInteraction' | 'runMode'
  title: string
  rowLabel: string
  valueLabel: string
  invocationOptionId: CanvasInteractionControlOptionId
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>
}

export function InteractionModeSelect({ iconSizeClass, iconStrokeWidth, ensureBaselineUnlocked }: InteractionModeSelectProps) {
  const {
    documentStructureBaselineLock,
    selectMode,
    infiniteCanvasInteractionMode,
    canvasRunMode,
    setDocumentStructureBaselineLock,
    setSelectMode,
    setInfiniteCanvasInteractionMode,
    setCanvasRunMode,
    setSelectionSource,
    selectNode,
    selectEdge,
    selectGroup,
  } = useGraphStore(
    useShallow(s => ({
      documentStructureBaselineLock: s.documentStructureBaselineLock === true,
      selectMode: s.schema?.behavior?.selectMode || 'single',
      infiniteCanvasInteractionMode: s.infiniteCanvasInteractionMode,
      canvasRunMode: s.canvasRunMode,
      setDocumentStructureBaselineLock: s.setDocumentStructureBaselineLock,
      setSelectMode: s.setSelectMode,
      setInfiniteCanvasInteractionMode: s.setInfiniteCanvasInteractionMode,
      setCanvasRunMode: s.setCanvasRunMode,
      setSelectionSource: s.setSelectionSource,
      selectNode: s.selectNode,
      selectEdge: s.selectEdge,
      selectGroup: s.selectGroup,
    })),
  )

  const options = React.useMemo(
    () =>
      [
        {
          key: 'navigate' as const,
          title: 'Navigate (clear selection)',
          rowLabel: 'Navigate',
          valueLabel: 'Clear selection',
          invocationOptionId: 'navigate:clear-selection' as const,
          Icon: Compass,
        },
        {
          key: 'lock' as const,
          title: documentStructureBaselineLock ? 'View Lock: ON' : 'View Lock: OFF',
          rowLabel: 'View Lock',
          valueLabel: documentStructureBaselineLock ? 'ON' : 'OFF',
          invocationOptionId: documentStructureBaselineLock ? 'viewLock:on' as const : 'viewLock:off' as const,
          Icon: documentStructureBaselineLock ? Lock : Unlock,
        },
        {
          key: 'multi' as const,
          title: `${UI_LABELS.multiSelectMode}: ${isMultiNodeSelectMode(selectMode) ? 'ON' : 'OFF'}`,
          rowLabel: UI_LABELS.multiSelectMode,
          valueLabel: isMultiNodeSelectMode(selectMode) ? 'ON' : 'OFF',
          invocationOptionId: isMultiNodeSelectMode(selectMode) ? 'selectMode:multi' as const : 'selectMode:single' as const,
          Icon: ListChecks,
        },
        {
          key: 'canvasInteraction' as const,
          title:
            infiniteCanvasInteractionMode === 'interactive'
              ? `${UI_LABELS.canvasInteractionMode}: ${UI_COPY.infiniteCanvasInteractionInteractiveLabel}`
              : `${UI_LABELS.canvasInteractionMode}: ${UI_COPY.infiniteCanvasInteractionStaticLabel}`,
          rowLabel: UI_LABELS.canvasInteractionMode,
          valueLabel: infiniteCanvasInteractionMode === 'interactive'
            ? UI_COPY.infiniteCanvasInteractionInteractiveLabel
            : UI_COPY.infiniteCanvasInteractionStaticLabel,
          invocationOptionId: infiniteCanvasInteractionMode === 'interactive'
            ? 'canvasInteraction:interactive' as const
            : 'canvasInteraction:static' as const,
          Icon: Hand,
        },
        {
          key: 'runMode' as const,
          title: canvasRunMode === 'auto' ? 'Run Mode: Auto' : 'Run Mode: Manual',
          rowLabel: 'Run Mode',
          valueLabel: canvasRunMode === 'auto' ? 'Auto' : 'Manual',
          invocationOptionId: canvasRunMode === 'auto' ? 'runMode:auto' as const : 'runMode:manual' as const,
          Icon: Play,
        },
      ] satisfies InteractionOption[],
    [canvasRunMode, documentStructureBaselineLock, infiniteCanvasInteractionMode, selectMode],
  )

  const selectedOptionKey: InteractionOption['key'] = 'navigate'

  const applyInteractionOption = React.useCallback(
    (optionId: CanvasInteractionControlOptionId, failClosed = false) => {
      if (optionId === 'navigate:clear-selection') {
        if (useGraphStore.getState().schema?.behavior?.selectMode !== 'single') setSelectMode('single')
        setSelectionSource('toolbar')
        selectNode(null)
        selectEdge(null)
        selectGroup(null)
        return
      }
      if (optionId === 'viewLock:on' || optionId === 'viewLock:off') {
        setDocumentStructureBaselineLock(optionId === 'viewLock:on')
        return
      }
      if (optionId === 'selectMode:multi' || optionId === 'selectMode:single') {
        setSelectMode(optionId === 'selectMode:multi' ? 'multi' : 'single')
        return
      }
      if (optionId === 'canvasInteraction:interactive' || optionId === 'canvasInteraction:static') {
        if (ensureBaselineUnlocked && !ensureBaselineUnlocked()) {
          if (failClosed) throw new Error('Canvas Interaction control is locked by the active baseline.')
          return
        }
        setInfiniteCanvasInteractionMode(optionId === 'canvasInteraction:interactive' ? 'interactive' : 'static')
        return
      }
      setCanvasRunMode(optionId === 'runMode:auto' ? 'auto' : 'manual')
    },
    [
      ensureBaselineUnlocked,
      selectEdge,
      selectGroup,
      selectNode,
      setDocumentStructureBaselineLock,
      setCanvasRunMode,
      setInfiniteCanvasInteractionMode,
      setSelectMode,
      setSelectionSource,
    ],
  )
  const apply = React.useCallback((key: InteractionOption['key']) => {
    const current = useGraphStore.getState()
    const optionId: CanvasInteractionControlOptionId = key === 'navigate'
      ? 'navigate:clear-selection'
      : key === 'lock'
        ? current.documentStructureBaselineLock === true ? 'viewLock:off' : 'viewLock:on'
        : key === 'multi'
          ? isMultiNodeSelectMode(current.schema?.behavior?.selectMode || 'single') ? 'selectMode:single' : 'selectMode:multi'
          : key === 'canvasInteraction'
            ? current.infiniteCanvasInteractionMode === 'interactive' ? 'canvasInteraction:static' : 'canvasInteraction:interactive'
            : current.canvasRunMode === 'auto' ? 'runMode:manual' : 'runMode:auto'
    applyInteractionOption(optionId)
  }, [applyInteractionOption])
  React.useEffect(() => registerCanvasInteractionControlHandler(optionId => {
    applyInteractionOption(optionId, true)
  }), [applyInteractionOption])

  return (
    <ToolbarDropdownSelect
      value={selectedOptionKey}
      options={options.map(option => ({
        id: option.key,
        title: option.title,
        rowLabel: option.rowLabel,
        valueLabel: option.valueLabel,
        invocationOptionId: option.invocationOptionId,
        Icon: option.Icon,
        isActive:
          option.key === 'lock'
            ? documentStructureBaselineLock
            : option.key === 'multi'
              ? isMultiNodeSelectMode(selectMode)
              : option.key === 'canvasInteraction'
                ? infiniteCanvasInteractionMode === 'interactive'
                : option.key === 'runMode'
                  ? canvasRunMode === 'auto'
                : false,
      }))}
      title={UI_LABELS.interactionMode}
      tooltipContent={UI_COPY.interactionModeTooltip}
      isButtonActive={
        documentStructureBaselineLock ||
        isMultiNodeSelectMode(selectMode) ||
        infiniteCanvasInteractionMode === 'interactive' ||
        canvasRunMode === 'auto'
      }
      onSelect={id => apply(id)}
      renderButtonContent={() => <Compass className={iconSizeClass} strokeWidth={iconStrokeWidth} />}
      renderOptionContent={option => (
        <>
          <option.Icon className={iconSizeClass} strokeWidth={iconStrokeWidth} />
          <span className="truncate">{option.rowLabel}</span>
          <SelectableRowValue
            label={option.rowLabel}
            value={option.valueLabel}
            invocation={buildCanvasInteractionInvocation(option.invocationOptionId)}
            mcpTool={CANVAS_INTERACTION_MCP_TOOL_NAME}
            commandToken={CANVAS_INTERACTION_COMMAND_TOKEN}
            semanticToken={CANVAS_INTERACTION_SEMANTIC_TOKEN}
            bindingToken={CANVAS_INTERACTION_BINDING_TOKEN}
          />
        </>
      )}
    />
  )
}
