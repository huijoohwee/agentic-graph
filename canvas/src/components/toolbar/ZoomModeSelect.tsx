import React from 'react'
import { Focus, Maximize, Pin, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useFitToViewAction } from '@/features/toolbar/hooks/useFitToViewAction'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import { UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import {
  computeToolbarZoomPresetTransform,
  formatToolbarZoomPercent,
  readToolbarZoomScale,
  TOOLBAR_ZOOM_PRESETS,
  type ToolbarZoomPreset,
} from '@/components/toolbar/toolbarZoomMenuModel'

type ZoomModeSelectProps = {
  iconSizeClass: string
  iconStrokeWidth: number
  onZoomSelection?: () => void
}

type ZoomOptionKey =
  | 'action:in'
  | 'action:out'
  | 'mode:pin'
  | 'mode:fitToView'
  | 'mode:fitToScreen'
  | 'mode:zoomToSelection'
  | `preset:${ToolbarZoomPreset}`

type ZoomOption = {
  key: ZoomOptionKey
  label: string
  tooltip: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>
  children?: readonly ZoomOption[]
  dividerBefore?: boolean
  isActive?: boolean
  disabled?: boolean
  disabledReason?: string
  enableHint?: string
}

export function ZoomModeSelect({ iconSizeClass, iconStrokeWidth, onZoomSelection }: ZoomModeSelectProps) {
  const {
    currentZoomScale,
    viewPinned,
    toggleViewPinned,
    fitToScreenMode,
    setFitToScreenMode,
    toggleFitToScreenMode,
    zoomToSelectionMode,
    setZoomToSelectionMode,
    requestZoom,
    requestZoomTransform,
    pushUiToast,
  } = useGraphStore(
    useShallow(s => ({
      currentZoomScale: readToolbarZoomScale(s),
      viewPinned: s.viewPinned === true,
      toggleViewPinned: s.toggleViewPinned,
      fitToScreenMode: s.fitToScreenMode === true,
      setFitToScreenMode: s.setFitToScreenMode,
      toggleFitToScreenMode: s.toggleFitToScreenMode,
      zoomToSelectionMode: s.zoomToSelectionMode === true,
      setZoomToSelectionMode: s.setZoomToSelectionMode,
      requestZoom: s.requestZoom,
      requestZoomTransform: s.requestZoomTransform,
      pushUiToast: s.pushUiToast,
    })),
  )

  const { disabled: fitToViewDisabled, handleFitToView } = useFitToViewAction()
  const currentZoomLabel = formatToolbarZoomPercent(currentZoomScale)
  const currentPresetKey = React.useMemo(() => {
    const exactPreset = TOOLBAR_ZOOM_PRESETS.find(preset => Math.abs(preset - currentZoomScale) < 0.005)
    return exactPreset == null ? null : `preset:${exactPreset}` as const
  }, [currentZoomScale])
  const presetOptions = React.useMemo<ZoomOption[]>(
    () =>
      TOOLBAR_ZOOM_PRESETS.map(preset => ({
        key: `preset:${preset}` as const,
        label: formatToolbarZoomPercent(preset),
        tooltip: `Set zoom to ${formatToolbarZoomPercent(preset)}`,
        Icon: Scan,
        isActive: currentPresetKey === `preset:${preset}`,
      } satisfies ZoomOption)),
    [currentPresetKey],
  )

  const options = React.useMemo<ZoomOption[]>(
    () =>
      [
        {
          key: 'action:out' as const,
          label: UI_LABELS.zoomOut,
          tooltip: UI_LABELS.zoomOut,
          Icon: ZoomOut,
        },
        {
          key: 'action:in' as const,
          label: UI_LABELS.zoomIn,
          tooltip: UI_LABELS.zoomIn,
          Icon: ZoomIn,
        },
        {
          key: 'mode:pin' as const,
          label: UI_LABELS.pinToView,
          tooltip: UI_COPY.pinToViewTooltip,
          Icon: Pin,
          dividerBefore: true,
        },
        {
          key: 'mode:fitToView' as const,
          label: UI_LABELS.fitToView,
          tooltip: UI_COPY.fitToViewTooltip,
          Icon: Scan,
          disabled: fitToViewDisabled,
          disabledReason: fitToViewDisabled ? 'Unavailable in current view mode' : undefined,
          enableHint: fitToViewDisabled ? 'Switch back to graph viewport state, then retry' : undefined,
        },
        {
          key: 'mode:fitToScreen' as const,
          label: UI_LABELS.fitToScreen,
          tooltip: UI_COPY.fitToScreenTooltip,
          Icon: Maximize,
        },
        {
          key: 'mode:zoomToSelection' as const,
          label: UI_LABELS.zoomToSelection,
          tooltip: UI_COPY.zoomToSelectionTooltip,
          Icon: Focus,
          dividerBefore: true,
        },
        {
          key: 'preset:1' as const,
          label: 'Zoom presets',
          tooltip: 'Set zoom to a fixed percentage while preserving the viewport center.',
          Icon: Scan,
          dividerBefore: true,
          children: presetOptions,
        },
      ] satisfies ZoomOption[],
    [fitToViewDisabled, presetOptions],
  )

  const anyActive = viewPinned || fitToScreenMode || zoomToSelectionMode

  const apply = React.useCallback(
    (key: ZoomOptionKey) => {
      if (key === 'action:in') {
        requestZoom('in')
        return
      }
      if (key === 'action:out') {
        requestZoom('out')
        return
      }
      if (key === 'mode:pin') {
        toggleViewPinned()
        return
      }
      if (key === 'mode:fitToView') {
        if (!fitToViewDisabled) handleFitToView()
        return
      }
      if (key === 'mode:fitToScreen') {
        toggleFitToScreenMode()
        return
      }
      if (key.startsWith('preset:')) {
        const presetValue = Number(key.slice('preset:'.length)) as ToolbarZoomPreset
        const state = useGraphStore.getState()
        disableAutoZoomModesForUserGesture({
          viewPinned: state.viewPinned === true,
          fitToScreenMode: state.fitToScreenMode === true,
          zoomToSelectionMode: state.zoomToSelectionMode === true,
          setFitToScreenMode,
          setZoomToSelectionMode,
        })
        requestZoomTransform(
          computeToolbarZoomPresetTransform({ state, preset: presetValue }),
          { intent: 'zoomPreset' },
        )
        return
      }
      const next = !zoomToSelectionMode
      setZoomToSelectionMode(next)
      if (next && onZoomSelection) onZoomSelection()
    },
    [fitToViewDisabled, handleFitToView, onZoomSelection, requestZoom, requestZoomTransform, setFitToScreenMode, setZoomToSelectionMode, toggleFitToScreenMode, toggleViewPinned, zoomToSelectionMode],
  )

  const isOptionActive = React.useCallback(
    (key: ZoomOptionKey) => {
      if (key === 'mode:pin') return viewPinned
      if (key === 'mode:fitToScreen') return fitToScreenMode
      if (key === 'mode:zoomToSelection') return zoomToSelectionMode
      if (key.startsWith('preset:')) return currentPresetKey === key
      return false
    },
    [currentPresetKey, fitToScreenMode, viewPinned, zoomToSelectionMode],
  )

  const isOptionDisabled = React.useCallback(
    (key: ZoomOptionKey) => {
      if (key === 'mode:fitToView') return fitToViewDisabled
      return false
    },
    [fitToViewDisabled],
  )
  const selectedOptionKey: ZoomOptionKey =
    viewPinned ? 'mode:pin' : fitToScreenMode ? 'mode:fitToScreen' : zoomToSelectionMode ? 'mode:zoomToSelection' : 'mode:fitToView'

  const handleSelectComplete = React.useCallback(
    (key: ZoomOptionKey) => {
      const message =
        key === 'action:in'
          ? 'Zoom: Zoom In'
          : key === 'action:out'
          ? 'Zoom: Zoom Out'
          : key === 'mode:pin'
          ? `Zoom: ${viewPinned ? 'Pin to View off' : 'Pin to View on'}`
          : key === 'mode:fitToView'
          ? 'Zoom: Fit to View'
          : key === 'mode:fitToScreen'
          ? `Zoom: ${fitToScreenMode ? 'Fit to Screen off' : 'Fit to Screen on'}`
          : key.startsWith('preset:')
          ? `Zoom: ${formatToolbarZoomPercent(Number(key.slice('preset:'.length)))}`
          : `Zoom: ${zoomToSelectionMode ? 'Zoom to Selection off' : 'Zoom to Selection on'}`
      pushUiToast({ id: 'toolbar-zoom-mode', kind: 'neutral', message, ttlMs: 1400 })
    },
    [fitToScreenMode, pushUiToast, viewPinned, zoomToSelectionMode],
  )

  return (
    <ToolbarDropdownSelect
      value={selectedOptionKey}
      options={options.map(option => ({
        id: option.key,
        title: option.label,
        tooltip: option.tooltip,
        Icon: option.Icon,
        children: option.children?.map(child => ({
          id: child.key,
          title: child.label,
          tooltip: child.tooltip,
          Icon: child.Icon,
          isActive: isOptionActive(child.key),
          disabled: child.disabled || isOptionDisabled(child.key),
          disabledReason: child.disabledReason || (isOptionDisabled(child.key) ? 'Unavailable in current view mode' : undefined),
          enableHint: child.enableHint || (isOptionDisabled(child.key) ? 'Switch back to graph viewport state, then retry' : undefined),
        })),
        dividerBefore: option.dividerBefore,
        isActive: option.isActive || isOptionActive(option.key),
        disabled: isOptionDisabled(option.key),
        disabledReason: option.disabledReason || (isOptionDisabled(option.key) ? 'Unavailable in current view mode' : undefined),
        enableHint: option.enableHint || (isOptionDisabled(option.key) ? 'Switch back to graph viewport state, then retry' : undefined),
      }))}
      title={UI_LABELS.zoomMenu}
      tooltipContent={UI_COPY.zoomMenuTooltip}
      isButtonActive={anyActive}
      onSelect={id => apply(id)}
      onSelectComplete={id => handleSelectComplete(id)}
      renderButtonContent={() => (
        <span className="inline-flex min-w-0 items-center gap-1">
          <Focus className={iconSizeClass} strokeWidth={iconStrokeWidth} />
          <span className="max-w-[3.5rem] truncate text-[10px] leading-none">{currentZoomLabel}</span>
        </span>
      )}
      renderOptionContent={option => (
        <>
          <option.Icon className={iconSizeClass} strokeWidth={iconStrokeWidth} />
          <span className="truncate">{option.title}</span>
          {isOptionActive(option.id) ? <span className="ml-auto text-[10px] opacity-80">On</span> : null}
        </>
      )}
      menuWidthClass={UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME}
    />
  )
}
