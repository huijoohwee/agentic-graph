import { useGraphStore } from '@/hooks/useGraphStore'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import { resolveChatSubmitRequestUrlOrSetError } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitPreflight'
import { createChatSubmitRequestSender } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest'
import { readAssistantResponseText } from '@/features/chat/floatingPanelChat/floatingPanelChatStreaming'
import { launchSourceIdentity, publishLaunchWorkspace, reopenLaunchWorkspace, exportLaunchWorkspace, type LaunchRecord } from './launchCopilotWorkspace'
import { AGENT_GRAPH_HOST_ROUTE } from './agentGraphHostAdapter'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'

const selectionKey = () => { const state = useGraphStore.getState(); return JSON.stringify([state.selectedNodeIds, state.selectedEdgeIds, state.selectedGroupIds]) }
export async function invokeLaunchCopilot(args: FloatingPanelChatSubmitArgs) {
  const input = args.input.trim()
  const action = input.match(/^\/launch-copilot\s+(outline|draft)\s+(owned|reference)\s+([\s\S]+)$/)
  const existing = input.match(/^\/launch-copilot\s+(reopen|export)\s+([a-z0-9-]+)$/)
  args.setErrorText(null)
  args.setIsLoading(true)
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180_000)
  args.abortRef.current = controller
  const initialGraph = useGraphStore.getState().graphData, selectedKey = selectionKey()
  const unsubscribe = useGraphStore.subscribe(state => {
    if (state.graphData !== initialGraph || selectionKey() !== selectedKey) controller.abort()
  })
  const report = (text: string) => args.setMessages(messages => [...messages, { id: crypto.randomUUID(), role: 'assistant', content: text } as any])
  try {
    if (existing) {
      if (existing[1] === 'export') report(`Exact five-file ZIP exported. SHA-256: ${await exportLaunchWorkspace(existing[2])}. Publication and integration are not admitted; export does not open a PR.`)
      else { await reopenLaunchWorkspace(existing[2]); report(`Reopened ${existing[2]}. Retained evidence may be stale until the native host rechecks it.`) }
      return
    }
    if (!action) throw new Error('Use /launch-copilot outline owned <business requirement> (or draft/reference). Select an imported source cluster first. Reopen/export uses the returned CID.')
    const source = launchSourceIdentity(initialGraph)
    if (source?.readOnly !== true || !source.snapshotDigest || source.complete !== true) throw new Error('Import a complete Codebase graph via Launch → Import URL or Import folder, then select its nodes or edges.')
    if (!navigator.onLine) throw new Error('Offline: use /launch-copilot reopen <CID> to review a retained proposal. Fresh grounding and model drafting require the native host.')
    const state = useGraphStore.getState()
    const groupNodes = deriveGraphGroups(initialGraph!).filter(group => state.selectedGroupIds.includes(group.id)).flatMap(group => group.memberNodeIds)
    const request = {
      action: 'ground', cid: `launch-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`, requirement: action[3], sourceRole: action[2],
      graphId: source.graphId, snapshotDigest: source.snapshotDigest,
      nodeIds: [...new Set([...state.selectedNodeIds, ...groupNodes])].filter(id => id.startsWith('kg:')), edgeIds: state.selectedEdgeIds.filter(id => id.startsWith('kg:')), groupIds: state.selectedGroupIds,
    }
    const host = async (body: Record<string, unknown>): Promise<LaunchRecord> => {
      const response = await fetch(`${AGENT_GRAPH_HOST_ROUTE}/proposal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error?.message || `Native graph host unavailable (${response.status})`)
      if (value.evidence?.graphId !== source.graphId || value.evidence?.snapshotDigest !== source.snapshotDigest || value.files?.length !== 5) throw new Error('Invalid proposal source join')
      return { ...value, request }
    }
    let record = await host(request), drafting = 'Editable outline; no model call.'
    if (action[1] === 'draft') {
      try {
        if (!args.chatModel || args.chatProvider !== 'openai') throw new Error('Select the existing authorized OpenAI connection in Chat settings')
        const requestUrl = resolveChatSubmitRequestUrlOrSetError({ ...args })
        if (!requestUrl) throw new Error('Current Chat connection is unavailable')
        const send = createChatSubmitRequestSender({ requestUrl, controller, submitArgs: {
          ...args, chatMaxCompletionTokens: 6000, chatStream: false, chatMessagesJson: null,
          chatToolsJson: null, chatToolChoiceJson: null, chatResponseFormatJson: null,
        } })
        // One owner transport attempt; no automatic provider/model fallback or hidden repair.
        const response = await send(args.chatModel, [{ role: 'user', content: record.prompt }])
        if (!response.ok) throw new Error(`Current Chat provider returned ${response.status}`)
        const result = await readAssistantResponseText({ response, isEventStream: /text\/event-stream/i.test(response.headers.get('content-type') || ''), flushDraft: () => undefined })
        if (result.modelId && result.modelId !== args.chatModel && !result.modelId.startsWith(`${args.chatModel}-20`)) throw new Error('Provider returned a different model identity')
        const json = result.assistantText.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
        record = await host({ ...request, action: 'validate', proposal: JSON.parse(json) })
        record.proposal.modelReceipt = { requested: args.chatModel, observed: result.modelId, usage: result.usageSummary, calls: 1, repairCalls: 0, price: 'unknown' }
        drafting = `Drafted with the current Chat connection (${args.chatProvider}/${args.chatModel}); human semantic review required.`
      } catch (error) {
        controller.signal.throwIfAborted()
        drafting = `AI drafting unverified: ${String(error)}. Retained the labelled editable outline.`
      }
    }
    controller.signal.throwIfAborted()
    await publishLaunchWorkspace(record)
    report(`${drafting}\n\n${record.evidence.nodes.length} real nodes; ${record.evidence.edges.length} explained edges; truncated: ${record.evidence.truncated}. Five native document panels and a separate NEW overlay are on the source canvas.\n\nCID: ${record.evidence.cid}\nClick a document's text to edit, then /launch-copilot export ${record.evidence.cid} for the exact five files. Reopen with /launch-copilot reopen ${record.evidence.cid}.\n\n${record.publication.reason}`)
    args.setInput(`/launch-copilot reopen ${record.evidence.cid}`)
  } catch (error) {
    args.setErrorText(controller.signal.aborted ? 'Launch Copilot cancelled; previous canvas retained.' : String(error))
  } finally {
    unsubscribe(); clearTimeout(timer); args.abortRef.current = null; args.setIsLoading(false)
  }
}
