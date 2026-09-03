import type { ICreativeStateStore, IMessageBus, MessageBusMessage, ShowrunnerBriefSpec, ShowrunnerSourceFileStore } from './showrunnerTypes'
import { deriveShowrunnerContentHash, showrunnerRunRootPath } from './showrunnerShared'

export type DraftVersionRecord = {
  draft_version: number
  content: string
  critic_score?: number
  change_summary?: string
}

export class WritersRoomSession {
  private draftVersion = 0
  private readonly drafts: DraftVersionRecord[] = []

  constructor(
    private readonly brief: ShowrunnerBriefSpec,
    private readonly stateStore: ICreativeStateStore,
    private readonly messageBus: IMessageBus,
    private readonly sourceFileStore: ShowrunnerSourceFileStore,
  ) {}

  async persistDraft(content: string, turnIndex: number, changeSummary?: string): Promise<DraftVersionRecord> {
    this.draftVersion += 1
    const record: DraftVersionRecord = { draft_version: this.draftVersion, content, ...(changeSummary ? { change_summary: changeSummary } : {}) }
    this.drafts.push(record)
    await this.sourceFileStore.writeSourceFile(`${showrunnerRunRootPath(this.brief.run_id)}/drafts/v${record.draft_version}.md`, content)
    await this.stateStore.append({
      run_id: this.brief.run_id,
      agent_role: 'drafter',
      turn_index: turnIndex,
      content_hash: deriveShowrunnerContentHash(content),
      entry_type: record.draft_version === 1 ? 'draft' : 'revision',
      content,
      timestamp_iso: new Date().toISOString(),
    })
    return record
  }

  async routeCritique(critiqueText: string, draftVersion: number, turnIndex: number) {
    const message: MessageBusMessage = {
      run_id: this.brief.run_id,
      source_role: 'critic',
      target_role: 'revisor',
      message_type: 'critique',
      payload: JSON.stringify({ draft_version: draftVersion, critique_text: critiqueText }),
      turn_index: turnIndex,
      delivered: false,
      timestamp_iso: new Date().toISOString(),
    }
    return this.messageBus.publish(message)
  }

  async writeRevisionHistory() {
    return this.sourceFileStore.writeSourceFile(
      `${showrunnerRunRootPath(this.brief.run_id)}/revision-history.md`,
      [
        '---',
        'schema: "agentic-graph-showrunner-revision-history/v1"',
        `run_id: ${JSON.stringify(this.brief.run_id)}`,
        '---',
        '',
        '# Revision History',
        '',
        ...this.drafts.map(draft => `- v${draft.draft_version}: ${deriveShowrunnerContentHash(draft.content)}`),
        '',
      ].join('\n'),
    )
  }
}
