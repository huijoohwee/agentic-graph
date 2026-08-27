import type { UiLogEntryInput } from '@/hooks/store/types'
import type { AgenticGraphStorageChatRelayDecision } from '@/lib/storage/agenticgraphStorageChatClient'
import type { AgenticGraphStorageChatPolicyRecord } from '@/lib/storage/agenticgraphStorageSyncContract'

type RelayLogDescriptor = {
  signature: string
  entry: UiLogEntryInput
}

const normalizeString = (value: unknown): string => String(value || '').trim()

export const buildStorageChatRelayLogDescriptor = (args: {
  relayDecision: AgenticGraphStorageChatRelayDecision
  workspaceId?: string | null
  providerLabel: string
  authMode: 'byok' | 'serverManaged'
  policy?: AgenticGraphStorageChatPolicyRecord | null
}): RelayLogDescriptor | null => {
  if (args.relayDecision.kind === 'disabled' || args.relayDecision.kind === 'loading') return null
  const workspaceId = normalizeString(args.workspaceId)
  const providerLabel = normalizeString(args.providerLabel) || 'Chat provider'
  const summaryParts: string[] = []
  if (workspaceId) summaryParts.push(`workspace=${workspaceId}`)
  if (args.relayDecision.kind === 'ready') {
    summaryParts.push(`role=${args.relayDecision.membership.role}`)
  }
  summaryParts.push(`auth=${args.authMode === 'byok' ? 'byok' : 'server-managed'}`)
  if (args.policy?.defaultModel) {
    summaryParts.push(`defaultModel=${args.policy.defaultModel}`)
  }
  const message = [
    providerLabel,
    args.relayDecision.detail,
    summaryParts.length > 0 ? `(${summaryParts.join(', ')})` : '',
  ].filter(Boolean).join(' ')
  return {
    signature: [
      args.relayDecision.kind,
      args.relayDecision.detail,
      workspaceId,
      args.authMode,
      providerLabel,
      args.policy?.defaultModel || '',
      args.relayDecision.kind === 'ready' ? args.relayDecision.membership.role : '',
    ].join('|'),
    entry: {
      kind: args.relayDecision.kind === 'blocked' ? 'warning' : 'neutral',
      source: 'chat:relay',
      message,
    },
  }
}
