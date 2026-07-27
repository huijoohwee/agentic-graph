import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  validateEnhancedLayerDraft,
  type EnhancedLayerDraft,
  type EnhancedLayerDraftErrors,
  type EnhancedLayerEditorLayer,
} from './enhancedLayerEditorModel'
import type { EnhancedLayerCatalogActionResult } from './useEnhancedLayerCatalog'

type EnhancedLayerEditorFormProps = {
  draft: EnhancedLayerDraft
  editingId?: string
  existingLayers: readonly EnhancedLayerEditorLayer[]
  busy: boolean
  onCancel: () => void
  onSave: (draft: EnhancedLayerDraft, editingId?: string) => Promise<EnhancedLayerCatalogActionResult>
}

type DraftField = keyof EnhancedLayerDraft

const INPUT_CLASSNAME = [
  'min-h-8 w-full rounded border px-2 py-1 text-xs',
  'border-[var(--kg-border-subtle)] bg-[var(--kg-surface-primary)]',
  'text-[color:var(--kg-text-primary)]',
].join(' ')

function EditorField(props: {
  field: DraftField
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  const errorId = `enhanced-layer-${props.field}-error`
  return (
    <label className="grid gap-1 text-xs">
      <span className={UI_THEME_TOKENS.text.secondary}>{props.label}</span>
      {React.cloneElement(props.children as React.ReactElement, {
        'aria-invalid': Boolean(props.error),
        'aria-describedby': props.error ? errorId : undefined,
      })}
      {props.error ? (
        <span id={errorId} className="text-[11px] text-red-600" role="alert">{props.error}</span>
      ) : props.hint ? (
        <span className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>{props.hint}</span>
      ) : null}
    </label>
  )
}

export function EnhancedLayerEditorForm(props: EnhancedLayerEditorFormProps) {
  const [draft, setDraft] = React.useState(props.draft)
  const [errors, setErrors] = React.useState<EnhancedLayerDraftErrors>({})
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null)
  const formRef = React.useRef<HTMLFormElement | null>(null)

  const update = React.useCallback(<Field extends DraftField>(
    field: Field,
    value: EnhancedLayerDraft[Field],
  ) => {
    setDraft(current => ({ ...current, [field]: value }))
    setErrors(current => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setSubmitMessage(null)
  }, [])

  const focusFirstError = React.useCallback(() => {
    requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      target?.focus()
    })
  }, [])

  const onSubmit = React.useCallback(async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors = validateEnhancedLayerDraft(draft, props.existingLayers, props.editingId)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setSubmitMessage('Fix the highlighted fields. No configuration was changed.')
      focusFirstError()
      return
    }
    const result = await props.onSave(draft, props.editingId)
    if (result.ok) return
    if (result.errors) {
      setErrors(result.errors)
      focusFirstError()
    }
    setSubmitMessage(result.message || 'The previous configuration remains active.')
  }, [draft, focusFirstError, props])

  const isAsset = draft.kind === 'asset3d'
  return (
    <form
      ref={formRef}
      className={cn(
        'grid gap-3 rounded border p-3',
        UI_THEME_TOKENS.panel.border,
        UI_THEME_TOKENS.panel.bg,
      )}
      aria-label="Enhanced layer editor"
      noValidate
      onSubmit={onSubmit}
    >
      <header className="grid gap-0.5">
        <strong className="text-xs">{props.editingId ? `Edit ${props.editingId}` : 'Add enhanced layer'}</strong>
        <span className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
          Configuration stays in this browser and updates the mounted map without reload.
        </span>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <EditorField field="id" label="Layer ID" error={errors.id}>
          <input
            className={INPUT_CLASSNAME}
            name="enhanced-layer-id"
            aria-label="Enhanced layer ID"
            value={draft.id}
            onChange={event => update('id', event.currentTarget.value)}
            autoComplete="off"
          />
        </EditorField>
        <EditorField field="kind" label="Layer kind" error={errors.kind}>
          <select
            className={INPUT_CLASSNAME}
            name="enhanced-layer-kind"
            aria-label="Enhanced layer kind"
            value={draft.kind}
            onChange={event => update('kind', event.currentTarget.value as EnhancedLayerDraft['kind'])}
          >
            <option value="building">Building extrusion</option>
            <option value="road">Road extrusion</option>
            <option value="asset3d">3D asset</option>
          </select>
        </EditorField>
      </div>

      <EditorField
        field="url"
        label={isAsset ? 'Asset URL' : 'GeoJSON URL'}
        error={errors.url}
        hint="Use an absolute /path or an HTTP(S) URL."
      >
        <input
          className={INPUT_CLASSNAME}
          name="enhanced-layer-url"
          aria-label="Enhanced layer URL"
          value={draft.url}
          onChange={event => update('url', event.currentTarget.value)}
          autoComplete="off"
        />
      </EditorField>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <EditorField field="timeoutMs" label="Timeout (ms)" error={errors.timeoutMs}>
          <input
            className={INPUT_CLASSNAME}
            type="number"
            min={1_000}
            max={300_000}
            name="enhanced-layer-timeout"
            aria-label="Enhanced layer timeout"
            value={draft.timeoutMs}
            onChange={event => update('timeoutMs', event.currentTarget.value)}
          />
        </EditorField>
        <EditorField field="maxBytes" label="Max bytes" error={errors.maxBytes}>
          <input
            className={INPUT_CLASSNAME}
            type="number"
            min={1}
            max={100 * 1024 * 1024}
            name="enhanced-layer-max-bytes"
            aria-label="Enhanced layer maximum bytes"
            value={draft.maxBytes}
            onChange={event => update('maxBytes', event.currentTarget.value)}
          />
        </EditorField>
      </div>

      <EditorField field="tags" label="Tags" error={errors.tags} hint="Separate tags with spaces or commas.">
        <input
          className={INPUT_CLASSNAME}
          name="enhanced-layer-tags"
          aria-label="Enhanced layer tags"
          value={draft.tags}
          onChange={event => update('tags', event.currentTarget.value)}
          autoComplete="off"
        />
      </EditorField>

      {isAsset ? (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <EditorField field="lat" label="Latitude" error={errors.lat}>
              <input
                className={INPUT_CLASSNAME}
                type="number"
                step="any"
                name="enhanced-layer-latitude"
                aria-label="Enhanced layer latitude"
                value={draft.lat}
                onChange={event => update('lat', event.currentTarget.value)}
              />
            </EditorField>
            <EditorField field="lng" label="Longitude" error={errors.lng}>
              <input
                className={INPUT_CLASSNAME}
                type="number"
                step="any"
                name="enhanced-layer-longitude"
                aria-label="Enhanced layer longitude"
                value={draft.lng}
                onChange={event => update('lng', event.currentTarget.value)}
              />
            </EditorField>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <EditorField field="altitudeMeters" label="Altitude (m)" error={errors.altitudeMeters}>
              <input
                className={INPUT_CLASSNAME}
                type="number"
                step="any"
                aria-label="Enhanced layer altitude"
                value={draft.altitudeMeters}
                onChange={event => update('altitudeMeters', event.currentTarget.value)}
              />
            </EditorField>
            <EditorField field="scale" label="Scale" error={errors.scale}>
              <input
                className={INPUT_CLASSNAME}
                type="number"
                step="any"
                aria-label="Enhanced layer scale"
                value={draft.scale}
                onChange={event => update('scale', event.currentTarget.value)}
              />
            </EditorField>
            <EditorField field="rotationDegrees" label="Rotation (°)" error={errors.rotationDegrees}>
              <input
                className={INPUT_CLASSNAME}
                type="number"
                step="any"
                aria-label="Enhanced layer rotation"
                value={draft.rotationDegrees}
                onChange={event => update('rotationDegrees', event.currentTarget.value)}
              />
            </EditorField>
          </div>
        </>
      ) : (
        <>
          <EditorField field="heightProperty" label="Height property" error={errors.heightProperty}>
            <input
              className={INPUT_CLASSNAME}
              aria-label="Enhanced layer height property"
              value={draft.heightProperty}
              onChange={event => update('heightProperty', event.currentTarget.value)}
              autoComplete="off"
            />
          </EditorField>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <EditorField field="defaultHeightMeters" label="Fallback height (m)" error={errors.defaultHeightMeters}>
              <input
                className={INPUT_CLASSNAME}
                type="number"
                step="any"
                min={0}
                max={10_000}
                aria-label="Enhanced layer fallback height"
                value={draft.defaultHeightMeters}
                onChange={event => update('defaultHeightMeters', event.currentTarget.value)}
              />
            </EditorField>
            <EditorField field="baseHeightMeters" label="Base height (m)" error={errors.baseHeightMeters}>
              <input
                className={INPUT_CLASSNAME}
                type="number"
                step="any"
                min={0}
                max={10_000}
                aria-label="Enhanced layer base height"
                value={draft.baseHeightMeters}
                onChange={event => update('baseHeightMeters', event.currentTarget.value)}
              />
            </EditorField>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <EditorField field="fillColor" label="Fill color" error={errors.fillColor}>
              <input
                className={INPUT_CLASSNAME}
                aria-label="Enhanced layer fill color"
                value={draft.fillColor}
                onChange={event => update('fillColor', event.currentTarget.value)}
                autoComplete="off"
              />
            </EditorField>
            <EditorField field="fillOpacity" label="Fill opacity" error={errors.fillOpacity}>
              <input
                className={INPUT_CLASSNAME}
                type="number"
                step="0.05"
                min={0}
                max={1}
                aria-label="Enhanced layer fill opacity"
                value={draft.fillOpacity}
                onChange={event => update('fillOpacity', event.currentTarget.value)}
              />
            </EditorField>
          </div>
        </>
      )}

      <label className="inline-flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          aria-label="Enhanced layer initially visible"
          checked={draft.visible}
          onChange={event => update('visible', event.currentTarget.checked)}
        />
        <span>Visible after save</span>
      </label>

      {submitMessage ? <p className="text-xs text-red-600" role="alert">{submitMessage}</p> : null}

      <footer className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className={cn('App-toolbar__btn px-2 py-1 text-xs', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          onClick={props.onCancel}
          disabled={props.busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={cn('App-toolbar__btn px-2 py-1 text-xs', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
          disabled={props.busy}
        >
          {props.busy ? 'Saving…' : 'Save layer'}
        </button>
      </footer>
    </form>
  )
}
