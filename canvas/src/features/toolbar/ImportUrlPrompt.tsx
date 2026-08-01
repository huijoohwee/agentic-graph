import React from 'react'

import { WORKSPACE_IMPORT_IMAGE_URL_TEST, WORKSPACE_IMPORT_URL_TEST } from '@/lib/config'
import { SOURCE_FILES_COPY } from '@/lib/config-copy/importExportCopy'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
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
  autoFocus?: boolean
  disabled?: boolean
  rightAddon?: React.ReactNode
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const urlDraft = props.urlDraft
  const onChange = props.onChange
  const onConfirm = props.onConfirm
  const onCancel = props.onCancel
  const confirmLabel = String(props.confirmLabel || '').trim() || 'Run'
  const autoFocus = props.autoFocus === true
  const disabled = props.disabled === true

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

  const normalizedDraft = String(urlDraft || '')

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
            const next = String(normalizedDraft || '').trim()
            if (!next) return
            onConfirm(next)
          }}
        />
        <button
          type="button"
          className={cn(
            UI_RESPONSIVE_IMPORT_URL_CONFIRM_ACTION_CLASSNAME,
            'rounded border text-xs',
            UI_THEME_TOKENS.input.border,
            UI_THEME_TOKENS.button.text,
            UI_THEME_TOKENS.button.hoverBg,
          )}
          onClick={() => {
            const next = String(normalizedDraft || '').trim()
            if (!next) return
            onConfirm(next)
          }}
          disabled={disabled || !String(normalizedDraft || '').trim()}
        >
          {confirmLabel}
        </button>
      </section>
      {props.rightAddon ? (
        <section className="kg-import-url-addon mt-1 flex min-w-0 items-stretch gap-1">
          {props.rightAddon}
        </section>
      ) : null}
    </section>
  )
}
