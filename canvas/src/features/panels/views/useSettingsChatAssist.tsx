import React from 'react'
import { loadAvailableModelIds } from '@/features/chat/floatingPanelChat/floatingPanelChatHttp'
import {
  CHAT_DEFAULT_ENDPOINT_URL,
  CHAT_DEFAULT_PROVIDER,
  buildChatProxyHeaders,
  getSharedChatModelSuggestionOptions,
  resolveChatEndpointForModels,
} from '@/lib/chatEndpoint'
import { getUiSectionActionClassName, getUiSectionChipClassName } from '@/lib/ui/sectionChipChrome'
import { uiToolbarToggleActiveClassName } from '@/features/toolbar/ui/toolbarStyles'
import { parseIntegrationConfigsJson, stringifyIntegrationConfigs, DEFAULT_INTEGRATION_CONFIGS } from '@/features/integrations/config'
import {
  clearLocalSettingsChatReadinessSurfaceSnapshot,
  publishLocalSettingsChatReadinessSurfaceSnapshot,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import {
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS,
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_LABELS,
} from '@/features/agent-ready/mainPanelSuperAgentIntegrationContract'
import { CHAT_KTV_ROW_KEYS } from './settingsView.constants'

type UseSettingsChatAssistArgs = {
  dirtyRef: React.MutableRefObject<Set<string>>
  openLocalChatApiKeyEntry: () => void
  setValues: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>
  values: Record<string, string | number | boolean>
}

export function useSettingsChatAssist({
  dirtyRef,
  openLocalChatApiKeyEntry,
  setValues,
  values,
}: UseSettingsChatAssistArgs) {
  const [chatModelsStatus, setChatModelsStatus] = React.useState<string | null>(null)
  const [isRefreshingChatModels, setIsRefreshingChatModels] = React.useState(false)
  const [discoveredChatModels, setDiscoveredChatModels] = React.useState<string[]>([])

  const normalizedChatProvider = React.useMemo(
    () => String(values.chatProvider || '').trim() || CHAT_DEFAULT_PROVIDER,
    [values.chatProvider],
  )

  const patchIntegrationJson = React.useCallback((updater: (current: ReturnType<typeof parseIntegrationConfigsJson>) => ReturnType<typeof parseIntegrationConfigsJson>) => {
    const current = parseIntegrationConfigsJson(
      typeof values.integrationConfigsJson === 'string' ? values.integrationConfigsJson : null,
    )
    const next = stringifyIntegrationConfigs(updater(current))
    dirtyRef.current.add('integrationConfigsJson')
    setValues(prev => ({ ...prev, integrationConfigsJson: next }))
  }, [dirtyRef, setValues, values.integrationConfigsJson])

  const setChatIntegrationEnabled = React.useCallback((enabled: boolean) => {
    patchIntegrationJson(current => ({
      ...current,
      aiChat: {
        ...current.aiChat,
        enabled,
        openTab: DEFAULT_INTEGRATION_CONFIGS.aiChat.openTab,
      },
    }))
  }, [patchIntegrationJson])

  const resetChatIntegrationRouting = React.useCallback(() => {
    patchIntegrationJson(current => ({
      ...current,
      aiChat: { ...DEFAULT_INTEGRATION_CONFIGS.aiChat },
    }))
  }, [patchIntegrationJson])

  const formatIntegrationJson = React.useCallback(() => {
    const formatted = stringifyIntegrationConfigs(
      parseIntegrationConfigsJson(
        typeof values.integrationConfigsJson === 'string' ? values.integrationConfigsJson : null,
      ),
    )
    dirtyRef.current.add('integrationConfigsJson')
    setValues(prev => ({ ...prev, integrationConfigsJson: formatted }))
  }, [dirtyRef, setValues, values.integrationConfigsJson])

  const refreshChatModels = React.useCallback(async () => {
    const endpoint = resolveChatEndpointForModels(values.chatEndpointUrl || CHAT_DEFAULT_ENDPOINT_URL)
    if (!endpoint) {
      setChatModelsStatus('Model catalog unavailable: configure a valid chat endpoint first.')
      setDiscoveredChatModels([])
      return
    }
    setIsRefreshingChatModels(true)
    setChatModelsStatus('Refreshing models...')
    try {
      const authMode = String(values.chatAuthMode || '').trim() === 'byok' ? 'byok' : 'serverManaged'
      const ids = await loadAvailableModelIds(endpoint, buildChatProxyHeaders({
        provider: values.chatProvider,
        apiKey: authMode === 'byok' ? values.chatApiKey : null,
        endpointUrl: values.chatEndpointUrl || CHAT_DEFAULT_ENDPOINT_URL,
        clientRequestId: `kg-chat-models-${Date.now().toString(36)}`,
      }))
      setDiscoveredChatModels(ids)
      setChatModelsStatus(ids.length > 0 ? `Discovered ${ids.length} model${ids.length === 1 ? '' : 's'}.` : 'No models discovered from endpoint.')
    } catch (error: unknown) {
      setDiscoveredChatModels([])
      setChatModelsStatus(`Model discovery failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsRefreshingChatModels(false)
    }
  }, [values.chatAuthMode, values.chatApiKey, values.chatEndpointUrl, values.chatProvider])

  const chatIntegration = React.useMemo(
    () => parseIntegrationConfigsJson(typeof values.integrationConfigsJson === 'string' ? values.integrationConfigsJson : null).aiChat,
    [values.integrationConfigsJson],
  )
  const chatModelSuggestions = React.useMemo(() => {
    return getSharedChatModelSuggestionOptions({
      provider: values.chatProvider,
      discoveredModels: discoveredChatModels,
      currentModel: values.chatModel,
    })
  }, [discoveredChatModels, values.chatModel, values.chatProvider])

  React.useLayoutEffect(() => {
    publishLocalSettingsChatReadinessSurfaceSnapshot({
      normalizedChatProvider,
      chatEndpointUrl: String(values.chatEndpointUrl || '').trim(),
      chatModel: String(values.chatModel || '').trim(),
      chatAuthMode: String(values.chatAuthMode || '').trim() === 'byok' ? 'byok' : 'serverManaged',
      chatContextScope: String(values.chatContextScope || '').trim() || 'hybrid',
      integrationProviderIds: [...AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS],
      integrationProviderLabels: [...AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_LABELS],
      integrationEnabled: chatIntegration.enabled === true,
      integrationOpenTab: String(chatIntegration.openTab || '').trim(),
      isRefreshingChatModels,
      chatModelsStatus,
      discoveredChatModelCount: discoveredChatModels.length,
      suggestedChatModelCount: chatModelSuggestions.length,
    })
  }, [
    chatIntegration.enabled,
    chatIntegration.openTab,
    chatModelSuggestions.length,
    chatModelsStatus,
    discoveredChatModels.length,
    isRefreshingChatModels,
    normalizedChatProvider,
    values.chatAuthMode,
    values.chatContextScope,
    values.chatEndpointUrl,
    values.chatModel,
  ])

  React.useEffect(() => {
    return () => {
      clearLocalSettingsChatReadinessSurfaceSnapshot()
    }
  }, [])

  const buildChatAssistNodes = React.useCallback((rowKey: string): React.ReactNode[] => {
    const sectionActionClassName = getUiSectionActionClassName('primary')
    const activeSectionActionClassName = `App-toolbar__btn text-xs ${uiToolbarToggleActiveClassName}`

    if (rowKey === CHAT_KTV_ROW_KEYS.apiKey) {
      return [
        <span
          key="chat-api-key-session"
          className={getUiSectionChipClassName('secondary')}
        >
          Session-only; never localStorage
        </span>,
        <button
          key="chat-api-key-open"
          type="button"
          className={activeSectionActionClassName}
          onClick={e => {
            e.stopPropagation()
            openLocalChatApiKeyEntry()
          }}
        >
          Open Local API Key
        </button>,
      ]
    }
    if (rowKey === CHAT_KTV_ROW_KEYS.provider) {
      return []
    }
    if (rowKey === CHAT_KTV_ROW_KEYS.contextScope) {
      return []
    }
    if (rowKey === CHAT_KTV_ROW_KEYS.routing) {
      return [
        <span
          key="chat-ai-routing-status"
          className={getUiSectionChipClassName('secondary')}
        >
          {chatIntegration.enabled ? 'Enabled' : 'Disabled'}
        </span>,
        <button
          key="chat-ai-routing-enable"
          type="button"
          className={sectionActionClassName}
          onClick={e => {
            e.stopPropagation()
            setChatIntegrationEnabled(true)
          }}
        >
          Enable AI Chat
        </button>,
        <button
          key="chat-ai-routing-disable"
          type="button"
          className={sectionActionClassName}
          onClick={e => {
            e.stopPropagation()
            setChatIntegrationEnabled(false)
          }}
        >
          Disable AI Chat
        </button>,
        <button
          key="chat-ai-routing-reset"
          type="button"
          className={activeSectionActionClassName}
          onClick={e => {
            e.stopPropagation()
            resetChatIntegrationRouting()
          }}
        >
          Reset Routing
        </button>,
        <button
          key="chat-ai-routing-format"
          type="button"
          className={activeSectionActionClassName}
          onClick={e => {
            e.stopPropagation()
            formatIntegrationJson()
          }}
        >
          Format JSON
        </button>,
      ]
    }
    if (rowKey === CHAT_KTV_ROW_KEYS.model) {
      const nodes: React.ReactNode[] = [
        <button
          key="chat-model-refresh"
          type="button"
          className={activeSectionActionClassName}
          onClick={e => {
            e.stopPropagation()
            void refreshChatModels()
          }}
          disabled={isRefreshingChatModels}
        >
          {isRefreshingChatModels ? 'Refreshing...' : 'Refresh Models'}
        </button>,
      ]
      if (chatModelsStatus) {
        nodes.push(
          <span
            key="chat-model-status"
            className={getUiSectionChipClassName('secondary')}
          >
            {chatModelsStatus}
          </span>,
        )
      }
      return nodes
    }
    return []
  }, [
    chatIntegration.enabled,
    chatModelSuggestions,
    chatModelsStatus,
    formatIntegrationJson,
    isRefreshingChatModels,
    normalizedChatProvider,
    openLocalChatApiKeyEntry,
    refreshChatModels,
    resetChatIntegrationRouting,
    setChatIntegrationEnabled,
    values.chatEndpointUrl,
  ])

  return {
    buildChatAssistNodes,
    chatModelSuggestions,
  }
}
