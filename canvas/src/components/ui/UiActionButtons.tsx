import React from 'react'
import type { UiAction } from '@/hooks/store/types'
import { runUiAction } from '@/lib/ui/uiActionRuntime'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

const EMPTY_ACTIONS: UiAction[] = []

const getToneClasses = (tone: UiAction['tone'] | undefined): string => {
  if (tone === 'primary') {
    return `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
  }
  if (tone === 'warning') {
    return 'border-amber-500/40 text-amber-200 hover:bg-amber-500/10'
  }
  if (tone === 'danger') {
    return 'border-rose-500/40 text-rose-200 hover:bg-rose-500/10'
  }
  return `${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`
}

export function UiActionButtons({
  actions,
  className,
}: {
  actions?: UiAction[]
  className?: string
}) {
  const [pendingActionId, setPendingActionId] = React.useState<string | null>(null)
  const resolvedActions = Array.isArray(actions) ? actions.filter(action => action && action.id && action.label) : EMPTY_ACTIONS
  if (resolvedActions.length === 0) return null

  return (
    <section className={cn('flex flex-wrap items-center gap-2', className)}>
      {resolvedActions.map(action => {
        const actionId = String(action.id || '').trim()
        const label = String(action.label || '').trim()
        if (!actionId || !label) return null
        const isPending = pendingActionId === actionId
        return (
          <button
            key={actionId}
            type="button"
            className={cn(
              'rounded border px-2 py-1 text-xs leading-4 transition-colors disabled:cursor-wait disabled:opacity-60',
              UI_THEME_TOKENS.panel.border,
              getToneClasses(action.tone),
            )}
            disabled={isPending}
            onClick={async () => {
              setPendingActionId(actionId)
              try {
                await runUiAction(actionId)
              } finally {
                setPendingActionId(current => (current === actionId ? null : current))
              }
            }}
          >
            {isPending ? 'Working...' : label}
          </button>
        )
      })}
    </section>
  )
}

export default UiActionButtons
