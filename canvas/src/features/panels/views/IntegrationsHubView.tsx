import React from 'react'
import SettingsView from '@/features/panels/views/SettingsView'
import TradingTickerFixture from './TradingTickerFixture'
import TradingCalendarFixture from './TradingCalendarFixture'
import TradingProviderCoverage from './TradingProviderCoverage'

export default function IntegrationsHubView({
  searchQuery = '',
  onOpenWorkspace,
  requestedAnchorId,
  requestedAnchorSeq,
  onRegisterActions,
}: {
  searchQuery?: string
  onOpenWorkspace?: () => void
  requestedAnchorId?: string
  requestedAnchorSeq?: number
  onRegisterActions?: (a: {
    apply: () => void
    reset: () => void
    globalReset?: () => void
    collapseAll?: () => void
    expandAll?: () => void
    allCollapsed?: boolean
  }) => void
}) {
  async function openAudio(operation: 'dictate' | 'create') {
    const [{ requestVoiceStudioLaunch }, { VOICE_STUDIO_ROUTES, VOICE_STUDIO_COMMAND }] = await Promise.all([
      import('@/features/voice-studio/voiceStudioInvocation'), import('@/features/voice-studio/voiceStudioContract'),
    ])
    const { semantic, bindings } = VOICE_STUDIO_ROUTES[operation]
    requestVoiceStudioLaunch({ operation, command: VOICE_STUDIO_COMMAND, semantic, bindings, prompt: '' })
    onOpenWorkspace?.()
  }
  return (
    <>
      {'openai-compatible local audio voice studio transcription speech'.includes(searchQuery.trim().toLowerCase()) && (
        <section aria-label="OpenAI-compatible audio" className="grid gap-2 p-2 text-xs">
          <h3 className="font-semibold">OpenAI-compatible audio</h3>
          <p>Use a local server in Voice Studio to transcribe a file or generate speech.</p>
          <div className="flex gap-2">
            <button type="button" className="rounded border px-2 py-1" onClick={() => void openAudio('dictate')}>Transcribe audio</button>
            <button type="button" className="rounded border px-2 py-1" onClick={() => void openAudio('create')}>Generate speech</button>
          </div>
        </section>
      )}
      {(!searchQuery.trim() || 'trading ticker fixture synthetic quote read.ticker receipt moomoo'.includes(searchQuery.trim().toLowerCase())) && <TradingTickerFixture />}
      {(!searchQuery.trim() || 'trading ticker provider signed quote read.ticker receipt moomoo'.includes(searchQuery.trim().toLowerCase())) && <TradingTickerFixture provider />}
      {(!searchQuery.trim() || 'trading earnings calendar fixture read.calendar rest receipt moomoo'.includes(searchQuery.trim().toLowerCase())) && <TradingCalendarFixture />}
      {(!searchQuery.trim() || 'moomoo openapi coverage feature families earnings calendar rest mcp integration'.includes(searchQuery.trim().toLowerCase())) && <TradingProviderCoverage />}
      <SettingsView
        searchQuery={searchQuery}
        requestedAnchorId={requestedAnchorId}
        requestedAnchorSeq={requestedAnchorSeq}
        mode="integrations"
        onRegisterActions={onRegisterActions}
      />
    </>
  )
}
