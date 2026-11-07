import React from 'react'

import { WORKSPACE_IMPORT_IMAGE_URL_TEST, WORKSPACE_IMPORT_URL_TEST } from '@/lib/config'
import { SOURCE_FILES_COPY } from '@/lib/config-copy/importExportCopy'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME,
  UI_RESPONSIVE_IMPORT_URL_CONFIRM_ACTION_CLASSNAME,
  UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME,
  UI_RESPONSIVE_IMPORT_URL_PRESET_ACTION_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'

export function ImportUrlPrompt(props: {
  urlDraft: string
  onChange: (next: string) => void
  onConfirm: (url: string) => void
  onCancel?: () => void
  confirmLabel?: string
  confirmIcon?: React.ReactNode
  autoFocus?: boolean
  disabled?: boolean
  rightAddon?: React.ReactNode
  enablePageCapture?: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const urlDraft = props.urlDraft
  const normalizedDraft = String(urlDraft || '')
  const onChange = props.onChange
  const onConfirm = props.onConfirm
  const onCancel = props.onCancel
  const confirmLabel = String(props.confirmLabel || '').trim() || 'Run'
  const autoFocus = props.autoFocus === true
  const disabled = props.disabled === true
  const [isCapturingPage, setIsCapturingPage] = React.useState(false)
  const [pageCaptureStatus, setPageCaptureStatus] = React.useState<{ kind: 'ready' | 'error'; message: string } | null>(null)
  const pageCaptureRef = React.useRef<{ requestUrl: string; sourceUrl: string } | null>(null)
  const lastDraftRef = React.useRef(normalizedDraft)

  React.useEffect(() => {
    if (lastDraftRef.current === normalizedDraft) return
    lastDraftRef.current = normalizedDraft
    if (pageCaptureRef.current && normalizedDraft.trim() !== pageCaptureRef.current.sourceUrl) {
      pageCaptureRef.current = null
      setPageCaptureStatus(null)
    }
  }, [normalizedDraft])

  React.useEffect(() => {
    if (!autoFocus) return
    const id = requestAnimationFrame(() => {
      try {
        inputRef.current?.focus()
      } catch {
        void 0
      }
    })
    return () => cancelAnimationFrame(id)
  }, [autoFocus])

  const confirmDraft = () => {
    const next = String(normalizedDraft || '').trim()
    if (!next) return
    const capture = pageCaptureRef.current
    onConfirm(capture?.requestUrl || next)
    pageCaptureRef.current = null
    setPageCaptureStatus(null)
  }

  const captureCopiedPage = async () => {
    setIsCapturingPage(true)
    setPageCaptureStatus(null)
    try {
      const { captureWorkspacePageFromClipboard } = await import('@/features/markdown-workspace/workspaceImport/urlContentHtml')
      const capture = await captureWorkspacePageFromClipboard(normalizedDraft)
      acceptPageCapture(capture)
    } catch (error) {
      pageCaptureRef.current = null
      setPageCaptureStatus({
        kind: 'error',
        message: String((error as { message?: unknown })?.message || 'Could not read copied page content.'),
      })
    } finally {
      setIsCapturingPage(false)
    }
  }

  const acceptPageCapture = (capture: { requestUrl: string; sourceUrl: string; byteSize: number }) => {
    pageCaptureRef.current = { requestUrl: capture.requestUrl, sourceUrl: capture.sourceUrl }
    if (!normalizedDraft.trim()) {
      lastDraftRef.current = capture.sourceUrl
      onChange(capture.sourceUrl)
    }
    const size = Math.max(1, Math.round(capture.byteSize / 1024))
    setPageCaptureStatus({ kind: 'ready', message: 'Copied page ready (' + size + ' KB). Import URL will use it locally.' })
  }

  const capturePastedPage = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault()
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    setPageCaptureStatus(null)
    try {
      const { captureWorkspacePageFromContent } = await import('@/features/markdown-workspace/workspaceImport/urlContentHtml')
      const capture = captureWorkspacePageFromContent(
        normalizedDraft,
        html,
        text,
      )
      acceptPageCapture(capture)
    } catch (error) {
      pageCaptureRef.current = null
      setPageCaptureStatus({
        kind: 'error',
        message: String((error as { message?: unknown })?.message || 'Could not capture pasted page content.'),
      })
    }
  }

  const confirmButton = (
    <button
      type="button"
      className={cn(
        UI_RESPONSIVE_IMPORT_URL_CONFIRM_ACTION_CLASSNAME,
        props.confirmIcon && UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME,
        'rounded border text-xs',
        UI_THEME_TOKENS.input.border,
        UI_THEME_TOKENS.button.text,
        UI_THEME_TOKENS.button.hoverBg,
      )}
      aria-label={confirmLabel}
      title={confirmLabel}
      style={props.confirmIcon ? { inlineSize: 'var(--kg-import-url-addon-action-size, var(--kg-control-height, 28px))' } : undefined}
      onClick={confirmDraft}
      disabled={disabled || !String(normalizedDraft || '').trim()}
    >
      {props.confirmIcon || confirmLabel}
    </button>
  )

  return (
    <section className="kg-import-url-prompt min-w-0" aria-label="URL import controls">
      {(WORKSPACE_IMPORT_URL_TEST || WORKSPACE_IMPORT_IMAGE_URL_TEST) ? (
        <section className="kg-import-url-presets mb-1 flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain">
          {WORKSPACE_IMPORT_URL_TEST ? (
            <button
              type="button"
              className={cn(
                UI_RESPONSIVE_IMPORT_URL_PRESET_ACTION_CLASSNAME,
                'rounded border text-xs',
                UI_THEME_TOKENS.input.border,
                UI_THEME_TOKENS.button.text,
                UI_THEME_TOKENS.button.hoverBg,
              )}
              onClick={() => onChange(WORKSPACE_IMPORT_URL_TEST)}
            >
              Test URL
            </button>
          ) : null}
          {WORKSPACE_IMPORT_IMAGE_URL_TEST ? (
            <button
              type="button"
              className={cn(
                UI_RESPONSIVE_IMPORT_URL_PRESET_ACTION_CLASSNAME,
                'rounded border text-xs',
                UI_THEME_TOKENS.input.border,
                UI_THEME_TOKENS.button.text,
                UI_THEME_TOKENS.button.hoverBg,
              )}
              onClick={() => onChange(WORKSPACE_IMPORT_IMAGE_URL_TEST)}
            >
              Test image
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="kg-import-url-actions flex min-w-0 items-stretch gap-1">
        <input
          ref={inputRef}
          className={cn(
            UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME,
            'kg-import-url-input flex-1 rounded border text-xs',
            UI_THEME_TOKENS.input.border,
            UI_THEME_TOKENS.input.bg,
            UI_THEME_TOKENS.input.text,
          )}
          placeholder={SOURCE_FILES_COPY.urlPlaceholder}
          value={normalizedDraft}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel?.()
              return
            }
            if (e.key !== 'Enter') return
            e.preventDefault()
            confirmDraft()
          }}
        />
        {props.confirmIcon ? null : confirmButton}
      </section>
      {props.enablePageCapture ? (
        <section className="kg-import-url-page-capture mt-1 flex min-w-0 flex-wrap items-center gap-1" aria-label="Rendered page capture">
          <button
            type="button"
            className={cn(
              'rounded border px-2 py-1 text-xs',
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.button.text,
              UI_THEME_TOKENS.button.hoverBg,
            )}
            onClick={() => void captureCopiedPage()}
            disabled={disabled || isCapturingPage}
            aria-busy={isCapturingPage}
          >
            {isCapturingPage ? 'Reading copied page…' : 'Use copied page'}
          </button>
          <p className={cn('min-w-0 text-xs', UI_THEME_TOKENS.text.secondary)}>
            Copy the rendered page in its tab, then use this action or paste it below.
          </p>
          <label className="basis-full text-xs" htmlFor="kg-import-url-page-content">Paste rendered page</label>
          <textarea
            id="kg-import-url-page-content"
            className={cn(
              'basis-full min-h-12 resize-y rounded border px-2 py-1 text-xs',
              UI_THEME_TOKENS.input.border,
              UI_THEME_TOKENS.input.bg,
              UI_THEME_TOKENS.input.text,
            )}
            aria-label="Paste rendered page content"
            placeholder="Paste the copied webpage here"
            disabled={disabled}
            onPaste={event => void capturePastedPage(event)}
          />
          {pageCaptureStatus ? (
            <p
              className={cn('basis-full text-xs', pageCaptureStatus.kind === 'error' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.status.success)}
              role={pageCaptureStatus.kind === 'error' ? 'alert' : 'status'}
            >
              {pageCaptureStatus.message}
            </p>
          ) : null}
        </section>
      ) : null}
      {props.confirmIcon || props.rightAddon ? (
        <section className="kg-import-url-addon mt-1 flex min-w-0 items-stretch gap-1">
          {props.confirmIcon ? (
            <section className="flex min-w-0 flex-1 flex-wrap items-stretch gap-1" aria-label="URL import actions">
              {confirmButton}
              {props.rightAddon}
            </section>
          ) : props.rightAddon}
        </section>
      ) : null}
    </section>
  )
}
