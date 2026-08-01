import React from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, CheckCircle, Copy, Info, LoaderCircle, X, AlertTriangle, Pin, PinOff } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UiActionButtons } from '@/components/ui/UiActionButtons'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { copyTextToClipboard, sanitizeMessageText, UI_FOCUS_RING } from '@/lib/ui'
import { cn } from '@/lib/utils'
import type { UiToast, UiToastKind } from '@/hooks/store/types'
import { Z_INDEX_TOAST } from '@/lib/ui/zIndex'

const TOAST_TOP_PX = 56
const EMPTY_TOASTS: UiToast[] = []
export const TOAST_ROW_GRID_CLASS_NAME = 'kg-toast-row-grid'

const getKindClasses = (kind: UiToastKind): string => {
  if (kind === 'success') return UI_THEME_TOKENS.status.success
  if (kind === 'warning') return UI_THEME_TOKENS.status.warning
  if (kind === 'error') return UI_THEME_TOKENS.status.error
  return UI_THEME_TOKENS.status.neutral
}

const getKindIcon = (kind: UiToastKind) => {
  if (kind === 'success') return CheckCircle
  if (kind === 'warning') return AlertTriangle
  if (kind === 'error') return AlertCircle
  return Info
}

type ToastCopyState = 'idle' | 'copied' | 'unavailable'

function ToastCopyButton({ message, toastId, iconStrokeWidth }: { message: string; toastId: string; iconStrokeWidth: number }) {
  const [copyState, setCopyState] = React.useState<ToastCopyState>('idle')
  const Icon = copyState === 'copied' ? Check : Copy
  const label = copyState === 'copied' ? 'Notification text copied' : copyState === 'unavailable' ? 'Copy notification text unavailable' : 'Copy notification text'

  React.useEffect(() => {
    setCopyState('idle')
  }, [message])

  const handleCopy = React.useCallback(async () => {
    setCopyState((await copyTextToClipboard(message)) ? 'copied' : 'unavailable')
  }, [message])

  return (
    <button
      type="button"
      className={cn(
        'h-5 w-5 rounded inline-flex items-center justify-center relative z-[1] pointer-events-auto',
        UI_THEME_TOKENS.button.hoverBg,
        UI_THEME_TOKENS.button.text,
        UI_FOCUS_RING,
      )}
      data-kg-selection-surface="toast-copy"
      data-kg-toast-copy={toastId}
      aria-label={label}
      title={label}
      onClick={() => void handleCopy()}
    >
      <Icon
        className="w-3.5 h-3.5"
        strokeWidth={iconStrokeWidth}
        role="img"
        aria-label={`${label} icon`}
        aria-hidden={false}
        focusable={false}
        data-kg-selection-surface="toast-copy-icon"
      />
    </button>
  )
}

function ToastCard({
  toast,
  onDismiss,
  onTogglePinned,
}: {
  toast: UiToast
  onDismiss: (id: string) => void
  onTogglePinned: (toast: UiToast) => void
}) {
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const Icon = toast.busy ? LoaderCircle : getKindIcon(toast.kind)
  const message = sanitizeMessageText(toast.message, { maxLines: 4 })
  const pinned = toast.expiresAtMs == null
  const PinIcon = pinned ? PinOff : Pin
  if (!message) return null
  return (
    <article
      className={cn(
        'kg-toast-card pointer-events-auto flex-none',
        'rounded border shadow-sm',
        'bg-[rgba(var(--panel-bg-rgb),var(--panel-opacity))]',
        UI_THEME_TOKENS.panel.border,
        getKindClasses(toast.kind),
      )}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      aria-label={`${toast.kind} notification`}
      data-kg-selection-surface="toast"
      data-kg-toast-id={toast.id}
    >
      <section className={TOAST_ROW_GRID_CLASS_NAME}>
        <Icon
          className={cn('w-4 h-4 mt-0.5', toast.busy ? 'animate-spin' : '')}
          strokeWidth={uiIconStrokeWidth}
          role="img"
          aria-label={toast.busy ? 'Notification in progress' : `${toast.kind} notification`}
          aria-hidden={false}
          focusable={false}
          data-kg-selection-surface="toast-status-icon"
        />
        <section className="min-w-0">
          <p
            className="kg-toast-message pointer-events-auto select-text cursor-text whitespace-pre-wrap break-words text-xs leading-5"
            data-kg-selection-surface="toast-message"
            data-kg-toast-message={toast.id}
          >
            {message}
          </p>
          <UiActionButtons actions={toast.actions} className="pointer-events-auto mt-2" />
        </section>
        <nav className="mt-0.5 flex items-center gap-1 pointer-events-auto" aria-label="Notification controls">
          <ToastCopyButton message={message} toastId={toast.id} iconStrokeWidth={uiIconStrokeWidth} />
          <button
            type="button"
            className={cn(
              'h-5 w-5 rounded inline-flex items-center justify-center relative z-[1] pointer-events-auto',
              UI_THEME_TOKENS.button.hoverBg,
              UI_THEME_TOKENS.button.text,
              UI_FOCUS_RING,
            )}
            onClick={() => onTogglePinned(toast)}
            aria-label={pinned ? 'Unpin' : 'Pin'}
            title={pinned ? 'Unpin toast' : 'Pin toast'}
            data-kg-selection-surface="toast-pin"
            data-kg-toast-pin={toast.id}
          >
            <PinIcon
              className="w-3.5 h-3.5"
              strokeWidth={uiIconStrokeWidth}
              role="img"
              aria-label={`${pinned ? 'Unpin' : 'Pin'} notification icon`}
              aria-hidden={false}
              focusable={false}
              data-kg-selection-surface="toast-pin-icon"
            />
          </button>
          {toast.dismissible ? (
            <button
              type="button"
              className={cn(
                'h-5 w-5 rounded inline-flex items-center justify-center relative z-[1] pointer-events-auto',
                UI_THEME_TOKENS.button.hoverBg,
                UI_THEME_TOKENS.button.text,
                UI_FOCUS_RING,
              )}
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
              title="Dismiss toast"
              data-kg-selection-surface="toast-dismiss"
              data-kg-toast-dismiss={toast.id}
            >
              <X
                className="w-4 h-4"
                strokeWidth={uiIconStrokeWidth}
                role="img"
                aria-label="Dismiss notification icon"
                aria-hidden={false}
                focusable={false}
                data-kg-selection-surface="toast-dismiss-icon"
              />
            </button>
          ) : null}
        </nav>
      </section>
    </article>
  )
}

export function ToastHost() {
  const { toasts, dismissUiToast, pruneUiToasts, pushUiToast } = useGraphStore(
    useShallow(s => ({
      toasts: s.uiToasts,
      dismissUiToast: s.dismissUiToast,
      pruneUiToasts: s.pruneUiToasts,
      pushUiToast: s.pushUiToast,
    })),
  )

  const orderedToasts = Array.isArray(toasts) ? toasts : EMPTY_TOASTS
  const nextExpiryAtMs = React.useMemo(() => {
    let next: number | null = null
    for (let i = 0; i < orderedToasts.length; i += 1) {
      const expiresAtMs = orderedToasts[i]?.expiresAtMs
      if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) continue
      next = next == null ? expiresAtMs : Math.min(next, expiresAtMs)
    }
    return next
  }, [orderedToasts])

  const togglePinned = React.useCallback(
    (toast: UiToast) => {
      const pinned = toast.expiresAtMs == null
      pushUiToast({
        id: toast.id,
        kind: toast.kind,
        message: toast.message,
        ttlMs: pinned ? 10_000 : null,
        dismissible: toast.dismissible,
        busy: toast.busy,
        log: false,
        actions: toast.actions,
      })
    },
    [pushUiToast],
  )

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (nextExpiryAtMs == null) return
    const delayMs = Math.max(0, Math.floor(nextExpiryAtMs - Date.now()))
    const id = window.setTimeout(() => {
      pruneUiToasts(Date.now())
    }, delayMs + 1)
    return () => {
      try {
        window.clearTimeout(id)
      } catch {
        void 0
      }
    }
  }, [nextExpiryAtMs, pruneUiToasts])

  if (typeof document === 'undefined') return null
  if (!orderedToasts || orderedToasts.length === 0) return null

  return createPortal(
    <section
      className="fixed pointer-events-none"
      style={{
        top: TOAST_TOP_PX,
        right: 12,
        zIndex: Z_INDEX_TOAST,
      }}
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      <ol className="kg-toast-list flex flex-col gap-2 items-end" aria-label="Toast list">
        {orderedToasts.map(t => (
          <li key={t.id} className="list-none">
            <ToastCard toast={t} onDismiss={dismissUiToast} onTogglePinned={togglePinned} />
          </li>
        ))}
      </ol>
    </section>,
    document.body,
  )
}

export default ToastHost
