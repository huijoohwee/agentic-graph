import IconButton from '@/components/IconButton'
import { FloatingPanelCloseButton } from '@/components/ui/FloatingPanel'
import Tooltip from './Tooltip'
import { UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import { PinToggleIconButton } from '@/components/PinToggleIconButton'
import { Search as SearchIcon, Save as SaveIcon, RotateCcw as ResetIcon, Minimize2, Maximize2 } from 'lucide-react'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { uiToolbarRowScrollJustifyEndClassName } from '@/features/toolbar/ui/toolbarStyles'

interface HeaderActionsProps {
  onSearchToggle?: () => void
  onApply?: () => void
  onReset?: () => void
  onMinimize?: () => void
  onRestore?: () => void
  onPinToggle?: () => void
  pinned?: boolean
  onClose?: () => void
  applyDisabled?: boolean
  resetDisabled?: boolean
}

export default function HeaderActions({
  onSearchToggle,
  onApply,
  onReset,
  onMinimize,
  onRestore,
  onPinToggle,
  pinned,
  onClose,
  applyDisabled,
  resetDisabled,
}: HeaderActionsProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const closeColor = useGraphStore(s => s.uiIconColorClass)
  const closeHover = useGraphStore(s => s.uiIconHoverBgClass)
  const closePadding = useGraphStore(s => s.uiIconButtonPaddingClass)
  const closeMinimal = useGraphStore(s => s.uiIconFormat === 'minimal')

  const minimizeOrRestoreAction = onRestore ?? onMinimize
  const minimizeOrRestoreTitle = onRestore
    ? UI_COPY.floatingPanelRestore
    : onMinimize
      ? UI_COPY.floatingPanelMinimize
      : undefined
  const showSearchButton = typeof onSearchToggle === 'function'
  const showApplyButton = typeof onApply === 'function' && !applyDisabled
  const showResetButton = typeof onReset === 'function' && !resetDisabled
  const showCloseButton = typeof onClose === 'function'

  return (
    <section className={`${uiToolbarRowScrollJustifyEndClassName} gap-1`}>
      {showSearchButton ? (
        <IconButton
          className="App-toolbar__btn"
          title={UI_LABELS.search}
          onClick={onSearchToggle}
          showTooltip
        >
          <SearchIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </IconButton>
      ) : null}
      {onPinToggle && (
        <PinToggleIconButton
          title={pinned ? UI_COPY.floatingPanelUnpin : UI_COPY.floatingPanelPin}
          pinned={pinned === true}
          onClick={onPinToggle}
          showTooltip
          ariaPressed={!!pinned}
          iconClassName={iconSizeClass}
          strokeWidth={uiIconStrokeWidth}
        />
      )}
      {showApplyButton ? (
        <IconButton
          className="App-toolbar__btn"
          title={UI_LABELS.apply}
          onClick={onApply}
          showTooltip
        >
          <SaveIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </IconButton>
      ) : null}
      {showResetButton ? (
        <IconButton
          className="App-toolbar__btn"
          title={UI_LABELS.reset}
          onClick={onReset}
          showTooltip
        >
          <ResetIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
        </IconButton>
      ) : null}
      {minimizeOrRestoreAction && minimizeOrRestoreTitle && (
        <IconButton
          className="App-toolbar__btn"
          title={minimizeOrRestoreTitle}
          onClick={minimizeOrRestoreAction}
          showTooltip
        >
          {onRestore ? (
            <Maximize2 className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          ) : (
            <Minimize2 className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          )}
        </IconButton>
      )}

      {showCloseButton ? (
        <Tooltip content={UI_LABELS.close} contentClassName={`${UI_THEME_TOKENS.tooltip.bg} pointer-events-none`}>
          <FloatingPanelCloseButton label={UI_LABELS.close} onClose={onClose!} suppressTitle
            iconClassName={iconSizeClass} strokeWidth={uiIconStrokeWidth}
            colorClassName={closeColor} hoverClassName={closeHover} paddingClassName={closePadding} minimal={closeMinimal} />
        </Tooltip>
      ) : null}
    </section>
  )
}
