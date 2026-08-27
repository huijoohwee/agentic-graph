import type { LocalSettingsChatReadinessSurfaceSnapshot } from './browserLocalSurfaceSnapshots'
import {
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS,
} from './mainPanelSuperAgentIntegrationContract'

const normalizeString = (value: unknown): string => String(value || '').trim()
const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    const normalized = normalizeString(entry)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export const inspectLocalSettingsChatReadiness = (
  snapshot: (LocalSettingsChatReadinessSurfaceSnapshot & { updatedAtMs?: number }) | null,
) => {
  if (!snapshot) {
    return {
      available: false,
      sourceKind: 'browser-local-settings-chat-readiness',
      message: 'SettingsView chat readiness is not currently mounted in the local AgenticGraph browser runtime.',
    }
  }
  const configuredProviderIds = normalizeStringList(snapshot.integrationProviderIds)
  return {
    available: true,
    sourceKind: 'browser-local-settings-chat-readiness',
    provider: {
      id: snapshot.normalizedChatProvider,
      endpointUrl: snapshot.chatEndpointUrl,
      model: snapshot.chatModel,
      authMode: snapshot.chatAuthMode,
    },
    providerCoverage: {
      availableProviderIds: configuredProviderIds.length > 0
        ? configuredProviderIds
        : normalizeStringList([snapshot.normalizedChatProvider]),
      availableProviderLabels: normalizeStringList(snapshot.integrationProviderLabels),
      superAgentProviderIds: [...AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS],
    },
    routing: {
      contextScope: snapshot.chatContextScope,
      integrationEnabled: snapshot.integrationEnabled,
      integrationOpenTab: snapshot.integrationOpenTab,
    },
    modelDiscovery: {
      refreshing: snapshot.isRefreshingChatModels,
      status: snapshot.chatModelsStatus,
      discoveredCount: snapshot.discoveredChatModelCount,
      suggestionCount: snapshot.suggestedChatModelCount,
      ready: normalizeString(snapshot.chatModel).length > 0 && normalizeString(snapshot.chatEndpointUrl).length > 0,
    },
    updatedAtMs: snapshot.updatedAtMs || null,
  }
}
