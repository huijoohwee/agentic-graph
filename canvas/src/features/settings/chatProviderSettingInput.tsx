import React from 'react'
import { CHAT_CONTEXT_SCOPE_OPTIONS, normalizeChatContextScopeOption } from '@/features/settings/chatContextScopeOptions'
import { getChatProviderLabel, normalizeChatProviderId, resolveChatModelIdForProvider } from '@/lib/chatEndpoint'
import { inferChatProviderFromModelId } from '@/lib/chatEndpointProviderInference'
import { resolveChatModelSelectionValues } from '@/lib/chatProviderSelection'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'

type SettingsValues = Record<string, string | number | boolean>

export const renderChatProviderSettingInput = (args: {
  className: string
  dirtyRef: React.MutableRefObject<Set<string>>
  keyName: string
  options?: string[]
  setValues: React.Dispatch<React.SetStateAction<SettingsValues>>
  value: unknown
  values: SettingsValues
}) => {
  if (args.keyName !== 'chatProvider') {
    return null
  }

  const currentProvider = normalizeChatProviderId(args.values.chatProvider ?? args.value)
  const derivedProvider = inferChatProviderFromModelId(args.values.chatModel || args.value, currentProvider)

  return (
    <PanelTextInput
      value={derivedProvider || currentProvider}
      readOnly
      aria-readonly="true"
      className={args.className}
      title={`${getChatProviderLabel(derivedProvider)}; derived from chatModel`}
    />
  )
}

export const renderChatModelSettingInput = (args: {
  className: string
  dirtyRef: React.MutableRefObject<Set<string>>
  keyName: string
  options?: string[]
  setValues: React.Dispatch<React.SetStateAction<SettingsValues>>
  value: unknown
  values: SettingsValues
}) => {
  if (args.keyName !== 'chatModel' || !Array.isArray(args.options) || args.options.length === 0) {
    return null
  }
  const selected = String(args.value ?? '').trim()
  const provider = inferChatProviderFromModelId(selected, args.values.chatProvider)
  const resolved = resolveChatModelIdForProvider(selected, provider, { preserveUnknownCustomModel: true })
  const normalized = args.options.includes(resolved) ? resolved : args.options[0] || ''
  const modelOptions = Array.from(new Set(
    resolved && !args.options.includes(resolved)
      ? [resolved].concat(args.options)
      : args.options,
  ))
  return (
    <PanelSelect
      value={resolved || normalized}
      onValueChange={selectedValueInput => {
        const next = String(selectedValueInput || '').trim()
        args.dirtyRef.current.add('chatProvider')
        args.dirtyRef.current.add('chatEndpointUrl')
        args.dirtyRef.current.add('chatModel')
        args.setValues(prev => ({
          ...prev,
          ...resolveChatModelSelectionValues({
            currentEndpointUrl: prev.chatEndpointUrl,
            currentProvider: prev.chatProvider,
            model: next,
          }),
        }))
      }}
      className={args.className}
    >
      {modelOptions.map(option => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </PanelSelect>
  )
}

export const renderChatContextScopeSettingInput = (args: {
  className: string
  dirtyRef: React.MutableRefObject<Set<string>>
  keyName: string
  setValues: React.Dispatch<React.SetStateAction<SettingsValues>>
  value: unknown
}) => {
  if (args.keyName !== 'chatContextScope') return null
  const normalized = normalizeChatContextScopeOption(args.value)
  return (
    <PanelSelect
      value={normalized}
      onValueChange={selectedValueInput => {
        const value = selectedValueInput
        const selected = value === 'selection' || value === 'workspace' ? value : 'hybrid'
        args.dirtyRef.current.add('chatContextScope')
        args.setValues(prev => ({ ...prev, chatContextScope: selected }))
      }}
      className={args.className}
    >
      {CHAT_CONTEXT_SCOPE_OPTIONS.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </PanelSelect>
  )
}
