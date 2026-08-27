import { estimateMemoryTokens } from '@/features/memory/aiAgentsMemoryLayerContract.mjs'
import type { CreativeStateEntry, ICreativeStateStore, ShowrunnerError, ShowrunnerSourceFileStore } from './showrunnerTypes'
import { normalizeShowrunnerString, showrunnerStateEntryPath } from './showrunnerShared'

const duplicateHashError = (runId: string): ShowrunnerError => ({
  code: 'DUPLICATE_CONTENT_HASH',
  message: `Creative_State already contains this content_hash for run ${runId}.`,
  field: 'content_hash',
})

const invalidBudgetError = (): ShowrunnerError => ({
  code: 'INVALID_TOKEN_BUDGET',
  message: 'read_context token_budget must be greater than zero.',
  field: 'token_budget',
})

export class CreativeStateStore implements ICreativeStateStore {
  private readonly entriesByRun = new Map<string, CreativeStateEntry[]>()
  private readonly hashesByRun = new Map<string, Set<string>>()

  constructor(private readonly sourceFileStore: ShowrunnerSourceFileStore) {}

  async append(entry: CreativeStateEntry) {
    const runId = normalizeShowrunnerString(entry.run_id)
    const contentHash = normalizeShowrunnerString(entry.content_hash)
    const hashes = this.hashesByRun.get(runId) || new Set<string>()
    if (hashes.has(contentHash)) return { ok: false as const, error: duplicateHashError(runId) }

    const normalizedEntry: CreativeStateEntry = {
      ...entry,
      run_id: runId,
      content_hash: contentHash,
      token_estimate: typeof entry.token_estimate === 'number' ? entry.token_estimate : estimateMemoryTokens(entry.content),
    }
    hashes.add(contentHash)
    this.hashesByRun.set(runId, hashes)
    const entries = this.entriesByRun.get(runId) || []
    entries.push(normalizedEntry)
    entries.sort((left, right) => left.turn_index - right.turn_index)
    this.entriesByRun.set(runId, entries)
    const record = await this.sourceFileStore.writeSourceFile(
      showrunnerStateEntryPath(runId, normalizedEntry.turn_index, normalizedEntry.agent_role),
      this.formatEntry(normalizedEntry),
    )
    return { ok: true as const, record }
  }

  async readContext(runId: string, tokenBudget: number) {
    const budget = Math.floor(Number(tokenBudget) || 0)
    if (budget <= 0) return { entries: [], estimatedTokens: 0, error: invalidBudgetError() }
    const entries = [...(this.entriesByRun.get(normalizeShowrunnerString(runId)) || [])].reverse()
    const selected: CreativeStateEntry[] = []
    let estimatedTokens = 0
    for (const entry of entries) {
      const entryTokens = typeof entry.token_estimate === 'number' ? entry.token_estimate : estimateMemoryTokens(entry.content)
      if (estimatedTokens + entryTokens > budget) continue
      selected.push(entry)
      estimatedTokens += entryTokens
    }
    return { entries: selected.reverse(), estimatedTokens }
  }

  async list(runId: string): Promise<CreativeStateEntry[]> {
    return [...(this.entriesByRun.get(normalizeShowrunnerString(runId)) || [])]
  }

  private formatEntry(entry: CreativeStateEntry): string {
    return [
      '---',
      'schema: "agenticgraph-showrunner-state-entry/v1"',
      `run_id: ${JSON.stringify(entry.run_id)}`,
      `agent_role: ${JSON.stringify(entry.agent_role)}`,
      `turn_index: ${entry.turn_index}`,
      `content_hash: ${JSON.stringify(entry.content_hash)}`,
      `entry_type: ${JSON.stringify(entry.entry_type)}`,
      `timestamp_iso: ${JSON.stringify(entry.timestamp_iso)}`,
      `token_estimate: ${Number(entry.token_estimate || 0)}`,
      '---',
      '',
      entry.content,
      '',
    ].join('\n')
  }
}
