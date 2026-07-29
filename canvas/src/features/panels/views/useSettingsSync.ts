import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { SETTINGS_REGISTRY_BY_KEY } from './settingsView.constants'

type UseSettingsSyncArgs = {
  dirtyRef: React.MutableRefObject<Set<string>>
  setValues: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>
  values: Record<string, string | number | boolean>
}

function syncRegistryKeys({
  dirtyRef,
  keys,
  setValues,
  values,
}: {
  dirtyRef: React.MutableRefObject<Set<string>>
  keys: readonly string[]
  setValues: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>
  values: Record<string, string | number | boolean>
}) {
  const dirtyKeys = keys.filter(key => dirtyRef.current.has(key))
  if (dirtyKeys.length === 0) return

  const patches: Record<string, string | number | boolean> = {}
  dirtyKeys.forEach(key => {
    const meta = SETTINGS_REGISTRY_BY_KEY.get(key)
    if (!meta?.write) return
    meta.write(values[key] as never)
    const next = meta.read()
    if (next !== null) {
      patches[key] = next as never
    }
    dirtyRef.current.delete(key)
  })

  if (Object.keys(patches).length > 0) {
    setValues(prev => ({ ...prev, ...patches }))
  }
}

export function useSettingsSync({ dirtyRef, setValues, values }: UseSettingsSyncArgs) {
  React.useEffect(() => {
    const shouldApplyProvider = dirtyRef.current.has('chatProvider')
    const shouldApplyEndpointUrl = dirtyRef.current.has('chatEndpointUrl')
    const shouldApplyModel = dirtyRef.current.has('chatModel')
    const shouldApplyAuthMode = dirtyRef.current.has('chatAuthMode')
    const shouldApplyApiKey = dirtyRef.current.has('chatApiKey')
    if (!shouldApplyProvider && !shouldApplyEndpointUrl && !shouldApplyModel && !shouldApplyAuthMode && !shouldApplyApiKey) return

    const nextProvider = String(values.chatProvider || '').trim()
    const nextEndpointUrl = String(values.chatEndpointUrl || '').trim()
    const nextModel = String(values.chatModel || '').trim()
    const nextAuthMode = String(values.chatAuthMode || '').trim().toLowerCase() === 'byok' ? 'byok' : 'serverManaged'
    const nextApiKey = typeof values.chatApiKey === 'string' ? values.chatApiKey : ''

    const store = useGraphStore.getState()
    // A model selection resolves its provider and endpoint as one route. Applying the
    // three draft fields separately briefly exposes intermediate routes to the
    // FloatingPanel's controlled model select, which can make its value snap back.
    if (shouldApplyModel) {
      store.setChatModel(nextModel)
    } else {
      if (shouldApplyProvider) store.setChatProvider(nextProvider)
      if (shouldApplyEndpointUrl) store.setChatEndpointUrl(nextEndpointUrl)
    }
    if (shouldApplyAuthMode) store.setChatAuthMode(nextAuthMode)
    if (shouldApplyApiKey && nextAuthMode === 'byok') store.setChatApiKey(nextApiKey)

    const updated = useGraphStore.getState()
    const normalizedValues: Record<string, string> = {
      chatProvider: String(updated.chatProvider || '').trim(),
      chatAuthMode: updated.chatAuthMode === 'byok' ? 'byok' : 'serverManaged',
      chatEndpointUrl: String(updated.chatEndpointUrl || ''),
      chatModel: String(updated.chatModel || ''),
      chatApiKey: String(updated.chatApiKey || ''),
    }

    if (shouldApplyProvider) dirtyRef.current.delete('chatProvider')
    if (shouldApplyEndpointUrl) dirtyRef.current.delete('chatEndpointUrl')
    if (shouldApplyModel) dirtyRef.current.delete('chatModel')
    if (shouldApplyAuthMode) dirtyRef.current.delete('chatAuthMode')
    if (shouldApplyApiKey) dirtyRef.current.delete('chatApiKey')

    setValues(prev => ({ ...prev, ...normalizedValues }))
  }, [dirtyRef, setValues, values.chatApiKey, values.chatAuthMode, values.chatEndpointUrl, values.chatModel, values.chatProvider])

  React.useEffect(() => {
    syncRegistryKeys({
      dirtyRef,
      keys: [
        'byteplusImageModel',
        'byteplusImageSize',
        'byteplusImageOutputFormat',
        'byteplusImageWatermark',
        'byteplusImageSeed',
        'byteplusImageGuidanceScale',
      ],
      setValues,
      values,
    })
  }, [
    dirtyRef,
    setValues,
    values,
    values.byteplusImageGuidanceScale,
    values.byteplusImageModel,
    values.byteplusImageOutputFormat,
    values.byteplusImageSeed,
    values.byteplusImageSize,
    values.byteplusImageWatermark,
  ])

  React.useEffect(() => {
    syncRegistryKeys({
      dirtyRef,
      keys: [
        'byteplusVideoModel',
        'byteplusVideoContentJson',
        'byteplusVideoResolution',
        'byteplusVideoRatio',
        'byteplusVideoDuration',
        'byteplusVideoGenerateAudio',
        'byteplusVideoDraft',
        'byteplusVideoCameraFixed',
        'byteplusVideoImageUrlUrl',
      ],
      setValues,
      values,
    })
  }, [
    dirtyRef,
    setValues,
    values,
    values.byteplusVideoCameraFixed,
    values.byteplusVideoContentJson,
    values.byteplusVideoDraft,
    values.byteplusVideoDuration,
    values.byteplusVideoGenerateAudio,
    values.byteplusVideoImageUrlUrl,
    values.byteplusVideoModel,
    values.byteplusVideoRatio,
    values.byteplusVideoResolution,
  ])
}
