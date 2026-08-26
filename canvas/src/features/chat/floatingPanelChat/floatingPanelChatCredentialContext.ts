import { FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config'
import {
  getChatProviderCredentialLabel,
  getChatProviderLabel,
  normalizeChatProviderId,
} from '@/lib/chatEndpoint'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphNode } from '@/lib/graph/types'
import { inferTextGenerationProviderFamily } from '@/features/storyboard-widget-manager/textGenerationProviderFamily'
import { resolveEffectiveTextGenerationWidgetProperties } from '@/features/storyboard-widget-manager/textGenerationProviderProperties'
import { resolveSharedChatModelSelect } from '@/features/chat/chatModelCredentialResolver'
import { shouldRenderFloatingChatApiKeyPrompt } from '@/features/chat/floatingPanelChat/floatingPanelChatApiKeyPrompt'

export type FloatingPanelChatCredentialContext = {
  provider: string
  authMode: 'byok' | 'serverManaged'
  endpointUrl: string
  model: string
  source: 'global' | 'selection'
}

const readString = (value: unknown): string => String(unwrapGraphCellValue(value) || '').trim()

export function resolveFloatingPanelChatCredentialContext(args: {
  currentNode?: GraphNode | null
  globalProvider: unknown
  globalAuthMode: unknown
  globalEndpointUrl: unknown
  globalModel: unknown
}): FloatingPanelChatCredentialContext {
  const globalContext: FloatingPanelChatCredentialContext = {
    provider: normalizeChatProviderId(args.globalProvider),
    authMode: args.globalAuthMode === 'byok' ? 'byok' : 'serverManaged',
    endpointUrl: readString(args.globalEndpointUrl),
    model: readString(args.globalModel),
    source: 'global',
  }
  if (readString(args.currentNode?.type) !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) return globalContext

  const localProperties = readGraphNodeProperties(args.currentNode)
  const providerFamily = inferTextGenerationProviderFamily({
    provider: localProperties.chatProvider || globalContext.provider,
    endpointUrl: localProperties.chatEndpointUrl || globalContext.endpointUrl,
    model: localProperties.chatModel || globalContext.model,
    widgetTypeId: localProperties.widgetTypeId,
    formId: localProperties.formId,
  })
  const effectiveProperties = resolveEffectiveTextGenerationWidgetProperties({
    providerFamily,
    localProperties,
    globalProperties: {
      chatProvider: globalContext.provider,
      chatAuthMode: globalContext.authMode,
      chatEndpointUrl: globalContext.endpointUrl,
      chatModel: globalContext.model,
    },
  })

  return {
    provider: normalizeChatProviderId(effectiveProperties.chatProvider),
    authMode: effectiveProperties.chatAuthMode === 'byok' ? 'byok' : 'serverManaged',
    endpointUrl: readString(effectiveProperties.chatEndpointUrl),
    model: readString(effectiveProperties.chatModel),
    source: 'selection',
  }
}

export function resolveChatModelCredentialProjection(args: {
  currentNode?: GraphNode | null
  globalProvider: unknown
  globalAuthMode: unknown
  globalEndpointUrl: unknown
  globalModel: unknown
  apiKey: string
  onApiKeyChange: (value: string) => void
}) {
  const context = resolveFloatingPanelChatCredentialContext(args)
  return {
    context,
    modelSelect: resolveSharedChatModelSelect({
      chatProvider: context.provider,
      chatModel: context.model,
    }),
    apiKeyPrompt: shouldRenderFloatingChatApiKeyPrompt({
      chatAuthMode: context.authMode,
      chatProvider: context.provider,
    }) ? {
      providerLabel: getChatProviderLabel(context.provider),
      credentialLabel: getChatProviderCredentialLabel(context.provider),
      value: args.apiKey,
      onChange: args.onApiKeyChange,
    } : null,
  }
}
