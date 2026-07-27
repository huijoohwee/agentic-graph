import React from 'react'
import { Compass, Hand, ListChecks, Lock, Play, Unlock } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import { isMultiNodeSelectMode } from '@/lib/canvas/nodeSelectionGesture'

type InteractionModeSelectProps = {
  iconSizeClass: string
  iconStrokeWidth: number
  ensureBaselineUnlocked?: () => boolean
}

type InteractionOption = {
  key: 'navigate' | 'lock' | 'multi' | 'canvasInteraction' | 'runMode'
  label: string
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
          label: 'Navigate (clear selection)',
          Icon: Compass,
        },
        {
          key: 'lock' as const,
          label: documentStructureBaselineLock ? 'View Lock: ON' : 'View Lock: OFF',
          Icon: documentStructureBaselineLock ? Lock : Unlock,
        },
        {
          key: 'multi' as const,
          label: UI_LABELS.multiSelectMode,
          Icon: ListChecks,
        },
        {
          key: 'canvasInteraction' as const,
          label:
            infiniteCanvasInteractionMode === 'interactive'
              ? `${UI_LABELS.canvasInteractionMode}: ${UI_COPY.infiniteCanvasInteractionInteractiveLabel}`
              : `${UI_LABELS.canvasInteractionMode}: ${UI_COPY.infiniteCanvasInteractionStaticLabel}`,
          Icon: Hand,
        },
        {
          key: 'runMode' as const,
          label: canvasRunMode === 'auto' ? 'Run Mode: Auto' : 'Run Mode: Manual',
          Icon: Play,
        },
      ] satisfies InteractionOption[],
    [canvasRunMode, documentStructureBaselineLock, infiniteCanvasInteractionMode],
  )

  const selectedOptionKey: InteractionOption['key'] = 'navigate'

  const apply = React.useCallback(
    (key: InteractionOption['key']) => {
      if (key === 'navigate') {
        if (selectMode !== 'single') setSelectMode('single')
        setSelectionSource('toolbar')
        selectNode(null)
        selectEdge(null)
        selectGroup(null)
        return
      }
      if (key === 'lock') {
        const currentLock = useGraphStore.getState().documentStructureBaselineLock === true
        setDocumentStructureBaselineLock(!currentLock)
        return
      }
      if (key === 'canvasInteraction') {
        if (ensureBaselineUnlocked && !ensureBaselineUnlocked()) return
        setInfiniteCanvasInteractionMode(infiniteCanvasInteractionMode === 'interactive' ? 'static' : 'interactive')
        return
      }
      if (key === 'runMode') {
        setCanvasRunMode(canvasRunMode === 'auto' ? 'manual' : 'auto')
        return
      }
      setSelectMode(isMultiNodeSelectMode(selectMode) ? 'single' : 'multi')
    },
    [
      ensureBaselineUnlocked,
      canvasRunMode,
      infiniteCanvasInteractionMode,
      selectEdge,
      selectGroup,
      selectMode,
      selectNode,
      setDocumentStructureBaselineLock,
      setCanvasRunMode,
      setInfiniteCanvasInteractionMode,
      setSelectMode,
      setSelectionSource,
    ],
  )

  return (
    <ToolbarDropdownSelect
      value={selectedOptionKey}
      options={options.map(option => ({
        id: option.key,
        title: option.label,
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
          <span className="truncate">{option.title}</span>
        </>
      )}
    />
  )
}
