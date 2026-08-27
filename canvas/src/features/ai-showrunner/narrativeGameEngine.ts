import type { ICreativeStateStore, IMessageBus, MessageBusMessage, ShowrunnerBriefSpec, ShowrunnerError } from './showrunnerTypes'
import { deriveShowrunnerContentHash, showrunnerRunRootPath } from './showrunnerShared'

export type ChoiceSignal = {
  active_branch_id: string
  choice_text: string
  narrative_context_summary?: string
}

export class NarrativeGameEngine {
  constructor(
    private readonly brief: ShowrunnerBriefSpec,
    private readonly stateStore: ICreativeStateStore,
    private readonly messageBus: IMessageBus,
    private readonly writeChoiceGraph: (path: string, content: string) => Promise<unknown>,
  ) {}

  async postChoice(signal: ChoiceSignal) {
    const message: MessageBusMessage = {
      run_id: this.brief.run_id,
      source_role: 'player',
      target_role: 'story_agent',
      message_type: 'choice_signal',
      payload: JSON.stringify(signal),
      turn_index: 0,
      delivered: false,
      timestamp_iso: new Date().toISOString(),
    }
    return this.messageBus.publish(message)
  }

  async resolveChoice(signal: ChoiceSignal, turnIndex: number) {
    const content = JSON.stringify({
      active_branch_id: signal.active_branch_id,
      narrative_context_summary: signal.narrative_context_summary || signal.choice_text,
      turn_index: turnIndex,
    }, null, 2)
    const appended = await this.stateStore.append({
      run_id: this.brief.run_id,
      agent_role: 'story_agent',
      turn_index: turnIndex,
      content_hash: deriveShowrunnerContentHash(content),
      entry_type: 'world_state',
      content,
      timestamp_iso: new Date().toISOString(),
    })
    await this.writeChoiceGraph(`${showrunnerRunRootPath(this.brief.run_id)}/choice-graph.md`, this.buildChoiceGraphMarkdown(signal, turnIndex))
    return appended
  }

  buildBranchFailure(lastPartialBranch: string, turnIndex: number): ShowrunnerError {
    return {
      code: 'BRANCH_GENERATION_FAILED',
      message: `Branch generation failed at turn ${turnIndex}: ${lastPartialBranch}`,
      field: 'choice_graph',
    }
  }

  private buildChoiceGraphMarkdown(signal: ChoiceSignal, turnIndex: number): string {
    return [
      '---',
      'schema: "agenticgraph-showrunner-choice-graph/v1"',
      `run_id: ${JSON.stringify(this.brief.run_id)}`,
      `turn_index: ${turnIndex}`,
      '---',
      '',
      'graph TD',
      `  ${JSON.stringify(signal.active_branch_id)} --> ${JSON.stringify(signal.choice_text)}`,
      '',
    ].join('\n')
  }
}
