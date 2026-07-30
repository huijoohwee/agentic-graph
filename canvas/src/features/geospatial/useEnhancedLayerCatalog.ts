import React from 'react'
import { GEOSPATIAL_LS_KEYS } from 'grph-shared/geospatial/constants'
import { onGeospatialEnhancedLayersChanged } from 'grph-shared/geospatial/events'
import type { NormalizedEnhancedConfig } from 'grph-shared/geospatial/enhancedLayerContract'
import {
  clearEnhancedGeospatialConfigOverride,
  readEnhancedGeospatialEditorState,
  setEnhancedGeospatialLayerVisibility,
  writeEnhancedGeospatialConfig,
} from './gympgrphBridge'
import {
  draftToEditorLayer,
  normalizedConfigToEditorLayers,
  removeEditorLayer,
  serializeEditorLayers,
  upsertEditorLayer,
  validateEnhancedLayerDraft,
  type EnhancedLayerDraft,
  type EnhancedLayerDraftErrors,
  type EnhancedLayerEditorLayer,
} from './enhancedLayerEditorModel'

export type EnhancedLayerCatalogSource = 'local-storage' | 'environment' | 'default'

export type EnhancedLayerCatalogActionResult = {
  ok: boolean
  errors?: EnhancedLayerDraftErrors
  message?: string
}

export type EnhancedLayerCatalogController = {
  status: 'loading' | 'ready' | 'error'
  source: EnhancedLayerCatalogSource
  layers: readonly EnhancedLayerEditorLayer[]
  invalidEnvironmentValue?: string
  message: string | null
  busyAction: string | null
  refresh: () => Promise<void>
  saveDraft: (draft: EnhancedLayerDraft, editingId?: string) => Promise<EnhancedLayerCatalogActionResult>
  removeLayer: (id: string) => Promise<EnhancedLayerCatalogActionResult>
  toggleLayer: (layer: EnhancedLayerEditorLayer, visible: boolean) => Promise<EnhancedLayerCatalogActionResult>
  resetToEnvironment: () => Promise<EnhancedLayerCatalogActionResult>
}

type RuntimeEditorState = {
  source: EnhancedLayerCatalogSource
  normalized: NormalizedEnhancedConfig
  invalidEnvironmentValue?: string
}

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Enhanced layer configuration is unavailable.'
}

export function useEnhancedLayerCatalog(): EnhancedLayerCatalogController {
  const [status, setStatus] = React.useState<EnhancedLayerCatalogController['status']>('loading')
  const [source, setSource] = React.useState<EnhancedLayerCatalogSource>('default')
  const [layers, setLayers] = React.useState<readonly EnhancedLayerEditorLayer[]>([])
  const [invalidEnvironmentValue, setInvalidEnvironmentValue] = React.useState<string | undefined>()
  const [message, setMessage] = React.useState<string | null>(null)
  const [busyAction, setBusyAction] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const snapshot = await readEnhancedGeospatialEditorState() as RuntimeEditorState
      setSource(snapshot.source)
      setLayers(normalizedConfigToEditorLayers(snapshot.normalized))
      setInvalidEnvironmentValue(snapshot.invalidEnvironmentValue)
      setStatus('ready')
    } catch (error) {
      setMessage(errorMessage(error))
      setStatus('error')
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    const unsubscribe = onGeospatialEnhancedLayersChanged(() => {
      void refresh()
    })
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === GEOSPATIAL_LS_KEYS.geospatialEnhancedLayers
        || event.key === GEOSPATIAL_LS_KEYS.geospatialEnhancedLayerVisibility
      ) {
        void refresh()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  const saveDraft = React.useCallback(async (
    draft: EnhancedLayerDraft,
    editingId?: string,
  ): Promise<EnhancedLayerCatalogActionResult> => {
    const errors = validateEnhancedLayerDraft(draft, layers, editingId)
    if (Object.keys(errors).length > 0) return { ok: false, errors }
    const nextLayers = upsertEditorLayer(layers, draftToEditorLayer(draft), editingId)
    setBusyAction(editingId ? `edit:${editingId}` : 'add')
    setMessage(null)
    try {
      if (!await writeEnhancedGeospatialConfig(serializeEditorLayers(nextLayers))) {
        const rejectedMessage = 'The catalog was rejected; the previous configuration remains active.'
        setMessage(rejectedMessage)
        return { ok: false, message: rejectedMessage }
      }
      await refresh()
      setMessage(editingId ? `Updated ${draft.id.trim()}.` : `Added ${draft.id.trim()}.`)
      return { ok: true }
    } catch (error) {
      const resolvedMessage = errorMessage(error)
      setMessage(resolvedMessage)
      return { ok: false, message: resolvedMessage }
    } finally {
      setBusyAction(null)
    }
  }, [layers, refresh])

  const removeLayer = React.useCallback(async (id: string): Promise<EnhancedLayerCatalogActionResult> => {
    setBusyAction(`remove:${id}`)
    setMessage(null)
    try {
      const nextLayers = removeEditorLayer(layers, id)
      if (nextLayers.length === layers.length) {
        const missingMessage = `Layer ${id} no longer exists.`
        setMessage(missingMessage)
        return { ok: false, message: missingMessage }
      }
      if (!await writeEnhancedGeospatialConfig(serializeEditorLayers(nextLayers))) {
        const rejectedMessage = 'The layer was not removed; the previous catalog remains active.'
        setMessage(rejectedMessage)
        return { ok: false, message: rejectedMessage }
      }
      await refresh()
      setMessage(`Removed ${id}.`)
      return { ok: true }
    } catch (error) {
      const resolvedMessage = errorMessage(error)
      setMessage(resolvedMessage)
      return { ok: false, message: resolvedMessage }
    } finally {
      setBusyAction(null)
    }
  }, [layers, refresh])

  const toggleLayer = React.useCallback(async (
    layer: EnhancedLayerEditorLayer,
    visible: boolean,
  ): Promise<EnhancedLayerCatalogActionResult> => {
    setBusyAction(`toggle:${layer.id}`)
    setMessage(null)
    try {
      const kind = layer.kind === 'asset3d' ? 'asset' : 'extrusion'
      if (!await setEnhancedGeospatialLayerVisibility(kind, layer.id, visible)) {
        const rejectedMessage = `Could not ${visible ? 'show' : 'hide'} ${layer.id}.`
        setMessage(rejectedMessage)
        return { ok: false, message: rejectedMessage }
      }
      await refresh()
      setMessage(`${visible ? 'Showing' : 'Hidden'} ${layer.id}.`)
      return { ok: true }
    } catch (error) {
      const resolvedMessage = errorMessage(error)
      setMessage(resolvedMessage)
      return { ok: false, message: resolvedMessage }
    } finally {
      setBusyAction(null)
    }
  }, [refresh])

  const resetToEnvironment = React.useCallback(async (): Promise<EnhancedLayerCatalogActionResult> => {
    setBusyAction('reset')
    setMessage(null)
    try {
      if (!await clearEnhancedGeospatialConfigOverride()) {
        const rejectedMessage = 'Could not reset the local catalog.'
        setMessage(rejectedMessage)
        return { ok: false, message: rejectedMessage }
      }
      await refresh()
      setMessage('Reset to environment defaults.')
      return { ok: true }
    } catch (error) {
      const resolvedMessage = errorMessage(error)
      setMessage(resolvedMessage)
      return { ok: false, message: resolvedMessage }
    } finally {
      setBusyAction(null)
    }
  }, [refresh])

  return {
    status,
    source,
    layers,
    invalidEnvironmentValue,
    message,
    busyAction,
    refresh,
    saveDraft,
    removeLayer,
    toggleLayer,
    resetToEnvironment,
  }
}
