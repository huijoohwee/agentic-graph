import { PanelControlGroup } from '@agentic-base/views-react/controls'

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
  return (
    <PanelControlGroup
      actions={{ search: onSearchToggle, pin: onPinToggle, apply: onApply, reset: onReset,
        minimize: onMinimize, restore: onRestore, close: onClose }}
      disabled={{ apply: applyDisabled, reset: resetDisabled }}
      minimized={onRestore !== undefined}
      pinned={pinned === true}
    />
  )
}
