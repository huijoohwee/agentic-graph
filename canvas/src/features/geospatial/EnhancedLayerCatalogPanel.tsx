import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  createEnhancedLayerDraft,
  editorLayerToDraft,
  type EnhancedLayerDraft,
  type EnhancedLayerEditorLayer,
} from './enhancedLayerEditorModel'
import { EnhancedLayerEditorForm } from './EnhancedLayerEditorForm'
import {
  useEnhancedLayerCatalog,
  type EnhancedLayerCatalogController,
  type EnhancedLayerCatalogSource,
} from './useEnhancedLayerCatalog'

type EditorSession = {
  draft: EnhancedLayerDraft
  editingId?: string
}

const SOURCE_LABELS: Record<EnhancedLayerCatalogSource, string> = {
  'local-storage': 'Local',
  environment: 'Environment',
  default: 'Empty',
}

const BUTTON_CLASSNAME = [
  'App-toolbar__btn min-h-7 rounded px-2 py-1 text-[11px]',
  'text-[color:var(--kg-text-secondary)]',
  'hover:bg-[var(--kg-panel-action-bg-hover)]',
].join(' ')

const kindLabel = (layer: EnhancedLayerEditorLayer): string => {
  if (layer.kind === 'asset3d') return '3D asset'
  return layer.kind === 'road' ? 'Road extrusion' : 'Building extrusion'
}

function EnhancedLayerCatalogRow(props: {
  layer: EnhancedLayerEditorLayer
  busy: boolean
  confirmingRemove: boolean
  onEdit: () => void
  onRequestRemove: () => void
  onCancelRemove: () => void
  onConfirmRemove: () => void
  onToggle: (visible: boolean) => void
}) {
  const { layer } = props
  return (
    <article
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border)}
      data-kg-enhanced-layer-id={layer.id}
      data-kg-enhanced-layer-kind={layer.kind}
    >
      <header className="flex min-w-0 items-start justify-between gap-2">
        <span className="grid min-w-0 gap-0.5">
          <strong className="truncate text-xs" title={layer.id}>{layer.id}</strong>
          <span className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
            {kindLabel(layer)} · {layer.visible ? 'Visible' : 'Hidden'}
          </span>
        </span>
        <label className="inline-flex shrink-0 items-center gap-1 text-[10px]">
          <input
            type="checkbox"
            role="switch"
            aria-label={`Toggle enhanced layer ${layer.id}`}
            checked={layer.visible}
            disabled={props.busy}
            onChange={event => props.onToggle(event.currentTarget.checked)}
          />
          <span>{layer.visible ? 'On' : 'Off'}</span>
        </label>
      </header>
      <span className={cn('truncate text-[10px]', UI_THEME_TOKENS.text.tertiary)} title={layer.url}>
        {layer.url}
      </span>
      <span className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
        {layer.timeoutMs} ms · {layer.maxBytes.toLocaleString()} bytes
        {layer.tags.length > 0 ? ` · ${layer.tags.join(' ')}` : ''}
      </span>
      {props.confirmingRemove ? (
        <footer className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label={`Confirm removal of ${layer.id}`}>
          <span className="mr-auto text-[10px] text-red-600">Remove this layer?</span>
          <button type="button" className={BUTTON_CLASSNAME} onClick={props.onCancelRemove} disabled={props.busy}>
            Cancel
          </button>
          <button
            type="button"
            className={cn(BUTTON_CLASSNAME, 'text-red-600')}
            aria-label={`Confirm remove enhanced layer ${layer.id}`}
            onClick={props.onConfirmRemove}
            disabled={props.busy}
          >
            Confirm remove
          </button>
        </footer>
      ) : (
        <footer className="flex justify-end gap-1">
          <button
            type="button"
            className={BUTTON_CLASSNAME}
            aria-label={`Edit enhanced layer ${layer.id}`}
            onClick={props.onEdit}
            disabled={props.busy}
          >
            Edit
          </button>
          <button
            type="button"
            className={BUTTON_CLASSNAME}
            aria-label={`Remove enhanced layer ${layer.id}`}
            onClick={props.onRequestRemove}
            disabled={props.busy}
          >
            Remove
          </button>
        </footer>
      )}
    </article>
  )
}

export function EnhancedLayerCatalogView(props: {
  controller: EnhancedLayerCatalogController
}) {
  const { controller } = props
  const [editor, setEditor] = React.useState<EditorSession | null>(null)
  const [removeId, setRemoveId] = React.useState<string | null>(null)
  const [confirmReset, setConfirmReset] = React.useState(false)
  const busy = controller.busyAction != null

  const startAdd = React.useCallback(() => {
    setRemoveId(null)
    setEditor({ draft: createEnhancedLayerDraft() })
  }, [])

  const startEdit = React.useCallback((layer: EnhancedLayerEditorLayer) => {
    setRemoveId(null)
    setEditor({ draft: editorLayerToDraft(layer), editingId: layer.id })
  }, [])

  const saveEditor = React.useCallback(async (draft: EnhancedLayerDraft, editingId?: string) => {
    const result = await controller.saveDraft(draft, editingId)
    if (result.ok) setEditor(null)
    return result
  }, [controller])

  const confirmRemove = React.useCallback(async (id: string) => {
    const result = await controller.removeLayer(id)
    if (result.ok) {
      setRemoveId(null)
      if (editor?.editingId === id) setEditor(null)
    }
  }, [controller, editor?.editingId])

  const reset = React.useCallback(async () => {
    const result = await controller.resetToEnvironment()
    if (result.ok) {
      setConfirmReset(false)
      setRemoveId(null)
      setEditor(null)
    }
  }, [controller])

  return (
    <section
      className={cn('grid gap-3 border-b p-3', UI_THEME_TOKENS.panel.border)}
      aria-label="Enhanced layer catalog"
      data-kg-geo-enhanced-config-source={controller.source}
    >
      <header className="flex items-start justify-between gap-2">
        <span className="grid gap-0.5">
          <strong className="text-xs">Enhanced layers</strong>
          <span className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)}>
            Source: {SOURCE_LABELS[controller.source]} · local browser configuration
          </span>
        </span>
        <button
          type="button"
          className={BUTTON_CLASSNAME}
          aria-label="Add enhanced layer"
          onClick={startAdd}
          disabled={busy || controller.status === 'loading'}
        >
          Add layer
        </button>
      </header>

      {controller.invalidEnvironmentValue ? (
        <p className="text-xs text-red-600" role="alert">
          The environment catalog is invalid. Fix it or save a valid local catalog.
        </p>
      ) : null}

      {controller.status === 'loading' ? (
        <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)} role="status">
          Loading enhanced layers…
        </p>
      ) : controller.status === 'error' ? (
        <button type="button" className={BUTTON_CLASSNAME} onClick={() => void controller.refresh()}>
          Retry catalog
        </button>
      ) : controller.layers.length === 0 ? (
        <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>
          No enhanced layers. Add an extrusion or 3D asset without editing environment files.
        </p>
      ) : (
        <div className="grid gap-2" role="list" aria-label="Configured enhanced layers">
          {controller.layers.map(layer => (
            <div role="listitem" key={layer.id}>
              <EnhancedLayerCatalogRow
                layer={layer}
                busy={busy}
                confirmingRemove={removeId === layer.id}
                onEdit={() => startEdit(layer)}
                onRequestRemove={() => {
                  setEditor(null)
                  setRemoveId(layer.id)
                }}
                onCancelRemove={() => setRemoveId(null)}
                onConfirmRemove={() => void confirmRemove(layer.id)}
                onToggle={visible => void controller.toggleLayer(layer, visible)}
              />
            </div>
          ))}
        </div>
      )}

      {editor ? (
        <EnhancedLayerEditorForm
          key={editor.editingId || 'new'}
          draft={editor.draft}
          editingId={editor.editingId}
          existingLayers={controller.layers}
          busy={busy}
          onCancel={() => setEditor(null)}
          onSave={saveEditor}
        />
      ) : null}

      <footer className="grid gap-2">
        {confirmReset ? (
          <div className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label="Confirm reset to environment defaults">
            <span className={cn('mr-auto text-[10px]', UI_THEME_TOKENS.text.secondary)}>
              Remove the local catalog and visibility overrides?
            </span>
            <button type="button" className={BUTTON_CLASSNAME} onClick={() => setConfirmReset(false)} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className={BUTTON_CLASSNAME}
              aria-label="Confirm reset to environment defaults"
              onClick={() => void reset()}
              disabled={busy}
            >
              Confirm reset
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={cn(BUTTON_CLASSNAME, 'justify-self-start')}
            onClick={() => setConfirmReset(true)}
            disabled={busy}
          >
            Reset to environment defaults
          </button>
        )}
        {controller.message ? (
          <p className={cn('text-[10px]', UI_THEME_TOKENS.text.secondary)} role="status">
            {controller.message}
          </p>
        ) : null}
      </footer>
    </section>
  )
}

export function EnhancedLayerCatalogPanel() {
  return <EnhancedLayerCatalogView controller={useEnhancedLayerCatalog()} />
}
