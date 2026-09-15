import React from 'react'
import { createPortal } from 'react-dom'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_PREVIEW_OVERLAY_PANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type PreviewOverlayProps = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  overlayClassName?: string
  panelClassName?: string
  scope?: 'viewport' | 'container'
  portalTarget?: HTMLElement | null
  modalLabel?: string
}

const focusableIn = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(
  'a[href],button,input,select,textarea,summary,[tabindex]',
)].filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length > 0)

export default function PreviewOverlay({
  open,
  onClose,
  children,
  overlayClassName,
  panelClassName,
  scope = 'viewport',
  portalTarget,
  modalLabel,
}: PreviewOverlayProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const lastFocusRef = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!open || !modalLabel) return
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const overflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [open, modalLabel])
  React.useEffect(() => {
    if (!open || modalLabel) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open, modalLabel])

  if (!open) return null

  const node = (
    <section
      className={[
        scope === 'container' ? 'absolute inset-0 z-[99999]' : 'fixed inset-0 z-[99999]',
        'bg-black/60 flex items-center justify-center p-4',
        overlayClassName || '',
      ].filter(Boolean).join(' ')}
      onMouseDown={onClose}
    >
      <section
        className={[
          `${UI_RESPONSIVE_PREVIEW_OVERLAY_PANEL_CLASSNAME} ${UI_THEME_TOKENS.panel.bg} rounded border ${UI_THEME_TOKENS.panel.border} shadow-lg`,
          panelClassName || '',
        ].filter(Boolean).join(' ')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </section>
    </section>
  )

  if (typeof document === 'undefined') return node
  const target = portalTarget ?? document.body
  if (scope === 'container' && !portalTarget) return node
  return createPortal(modalLabel ? (
    <dialog
      ref={dialogRef}
      aria-label={modalLabel}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 backdrop:bg-transparent"
      onCancel={event => { event.preventDefault(); onClose() }}
      onFocusCapture={event => {
        if (event.target !== event.currentTarget) {
          if (event.target instanceof HTMLElement) lastFocusRef.current = event.target
          return
        }
        // Keep card-chrome clicks on a control; canvas shortcuts must not acquire dialog focus.
        const controls = focusableIn(event.currentTarget)
        const target = controls.includes(lastFocusRef.current!) ? lastFocusRef.current : controls[0]
        target?.focus({ preventScroll: true })
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') event.stopPropagation()
        if (event.key !== 'Tab') return
        event.stopPropagation()
        const focusable = focusableIn(event.currentTarget)
        const target = event.shiftKey ? focusable.at(-1) : focusable[0]
        const boundary = event.shiftKey ? focusable[0] : focusable.at(-1)
        if (!focusable.includes(document.activeElement as HTMLElement) || document.activeElement === boundary) {
          event.preventDefault(); target?.focus()
        }
      }}
    >{node}</dialog>
  ) : node, target)
}
