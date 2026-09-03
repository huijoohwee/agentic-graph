import type {
  AgentRoleEntry,
  AgentTurnDispatcher,
  IShowrunnerOrchestrator,
  PipelineRunState,
  ShowrunnerBriefSpec,
  ShowrunnerRuntime,
} from './showrunnerTypes'
import { showrunnerBriefParser } from './briefParser'
import { showrunnerScriptSchema } from './scriptSchema'
import { CreativeStateStore } from './creativeStateStore'
import { ShowrunnerMessageBus } from './messageBus'
import { ShowrunnerTokenAttribution } from './tokenAttribution'
import { PipelineRunLifecycle } from './pipelineRunLifecycle'
import { buildDeterministicMockProvider } from './showrunnerDryRun'
import {
  createInMemoryShowrunnerSourceFileStore,
  deriveShowrunnerContentHash,
  deriveShowrunnerRunKey,
  showrunnerBriefPath,
  showrunnerRunRootPath,
} from './showrunnerShared'
import { buildNarrationManifest, findLatestScriptEntry, writeNarrationManifest } from './podcastPipeline'

const defaultDispatcher = buildDeterministicMockProvider()

export const createShowrunnerRuntime = (dispatcher: AgentTurnDispatcher = defaultDispatcher): ShowrunnerRuntime => {
  const sourceFileStore = createInMemoryShowrunnerSourceFileStore()
  const creativeStateStore = new CreativeStateStore(sourceFileStore)
  const messageBus = new ShowrunnerMessageBus(creativeStateStore)
  const tokenAttribution = new ShowrunnerTokenAttribution(sourceFileStore)
  const lifecycle = new PipelineRunLifecycle(sourceFileStore)
  return {
    briefParser: showrunnerBriefParser,
    scriptSchema: showrunnerScriptSchema,
    sourceFileStore,
    creativeStateStore,
    messageBus,
    tokenAttribution,
    lifecycle,
    dispatcher,
  }
}

export class ShowrunnerOrchestrator implements IShowrunnerOrchestrator {
  constructor(private readonly runtime: ShowrunnerRuntime = createShowrunnerRuntime()) {}

  async startRun(briefOrPath: ShowrunnerBriefSpec | string) {
    const brief = await this.resolveBrief(briefOrPath)
    const runId = deriveShowrunnerRunKey(brief.run_id)
    const normalizedBrief: ShowrunnerBriefSpec = { ...brief, run_id: runId }
    const now = new Date().toISOString()
    const briefPath = showrunnerBriefPath(runId)
    await this.runtime.sourceFileStore.writeSourceFile(briefPath, this.runtime.briefParser.print(normalizedBrief))
    if (typeof (this.runtime.messageBus as unknown as { registerBrief?: unknown }).registerBrief === 'function') {
      ;(this.runtime.messageBus as unknown as { registerBrief: (brief: ShowrunnerBriefSpec) => void }).registerBrief(normalizedBrief)
    }
    if (typeof (this.runtime.tokenAttribution as unknown as { registerBudget?: unknown }).registerBudget === 'function') {
      ;(this.runtime.tokenAttribution as unknown as { registerBudget: (runId: string, tokenBudget: number) => void }).registerBudget(runId, normalizedBrief.token_budget)
    }
    await this.runtime.lifecycle.create({
      run_id: runId,
      run_key: runId,
      run_type: normalizedBrief.run_type,
      status: 'queued',
      brief_path: briefPath,
      current_stage_id: 'intake',
      current_turn_index: -1,
      run_token_total: 0,
      token_budget: normalizedBrief.token_budget,
      token_budget_remaining: normalizedBrief.token_budget,
      paid_call_count: 0,
      retry_counts: {},
      created_at_iso: now,
      updated_at_iso: now,
      dry_run: normalizedBrief.dry_run !== false,
      source_file_paths: [briefPath],
    })
    await this.runtime.lifecycle.transition(runId, { type: 'PICK_UP' })
    await this.executePipeline(normalizedBrief)
    const state = await this.runStatus(runId)
    return { runId, status: state.status }
  }

  async resumeRun(runId: string): Promise<void> {
    const state = await this.runtime.lifecycle.read(runId)
    if (!state || state.status === 'awaiting_review') return
    const briefText = await this.runtime.sourceFileStore.readSourceFile(state.brief_path)
    if (!briefText) return
    const parsed = this.runtime.briefParser.parse(briefText)
    if (!parsed.ok) return
    await this.executePipeline(parsed.spec, state.current_turn_index + 1)
  }

  async approveStage(runId: string, stageId: string): Promise<void> {
    await this.runtime.lifecycle.transition(runId, { type: 'APPROVE', stageId })
  }

  async runStatus(runId: string): Promise<PipelineRunState> {
    const state = await this.runtime.lifecycle.read(runId)
    if (!state) throw new Error(`Pipeline_Run not found: ${runId}`)
    return { ...state }
  }

  async listRuns(filter = {}) {
    return this.runtime.lifecycle.listRuns(filter)
  }

  async archiveRun(runId: string): Promise<void> {
    await this.runtime.messageBus.flush(runId)
    await this.runtime.lifecycle.transition(runId, { type: 'ARCHIVE' })
  }

  private async resolveBrief(briefOrPath: ShowrunnerBriefSpec | string): Promise<ShowrunnerBriefSpec> {
    if (typeof briefOrPath !== 'string') return briefOrPath
    const text = briefOrPath.trim().startsWith('---')
      ? briefOrPath
      : await this.runtime.sourceFileStore.readSourceFile(briefOrPath)
    const parsed = this.runtime.briefParser.parse(text || '')
    if (parsed.ok === false) {
      const message = parsed.errors.map(error => error.message).join('; ')
      throw new Error(`BRIEF_VALIDATION_ERROR: ${message}`)
    }
    return parsed.spec
  }

  private async executePipeline(brief: ShowrunnerBriefSpec, startIndex = 0): Promise<void> {
    for (let i = startIndex; i < brief.agent_pipeline.length; i += 1) {
      const role = this.resolveRole(brief, brief.agent_pipeline[i])
      if (!role) continue
      const state = await this.runtime.lifecycle.read(brief.run_id)
      if (!state || state.status !== 'running') return
      const context = await this.runtime.creativeStateStore.readContext(brief.run_id, brief.max_memory_tokens || 500)
      const inbox = await this.runtime.messageBus.drainInbox(brief.run_id, role.role)
      const estimatedTokens = this.runtime.tokenAttribution.estimate(`${role.role}\n${context.entries.map(entry => entry.content).join('\n')}`)
      if (!(await this.runtime.tokenAttribution.checkBudget(brief.run_id, estimatedTokens))) {
        await this.runtime.lifecycle.transition(brief.run_id, { type: 'BUDGET_GATE', stageId: role.role })
        return
      }
      const result = await this.runtime.dispatcher({ brief, runState: state, role, turn_index: i, context: context.entries, inbox })
      if (result.ok === false) {
        await this.runtime.lifecycle.transition(brief.run_id, {
          type: 'UNRECOVERABLE_ERROR',
          report: {
            failing_role: role.role,
            turn_index: i,
            error_code: result.error.code,
            error_message: result.error.message,
          },
        })
        return
      }
      await this.runtime.creativeStateStore.append({
        run_id: brief.run_id,
        agent_role: role.role,
        turn_index: i,
        content_hash: deriveShowrunnerContentHash(result.content),
        entry_type: result.entry_type,
        content: result.content,
        timestamp_iso: new Date().toISOString(),
        token_estimate: result.output_tokens,
      })
      await this.runtime.tokenAttribution.record({
        run_id: brief.run_id,
        agent_role: role.role,
        model_id: result.model_id || 'runtime-resolved',
        input_tokens: result.input_tokens ?? estimatedTokens,
        output_tokens: result.output_tokens ?? this.runtime.tokenAttribution.estimate(result.content),
        turn_index: i,
        stage_id: role.role,
        estimated: typeof result.input_tokens !== 'number' || typeof result.output_tokens !== 'number',
        timestamp_iso: new Date().toISOString(),
      })
      const nextState = await this.runtime.lifecycle.read(brief.run_id)
      if (nextState) {
        const runTokenTotal = this.runtime.tokenAttribution.getRunTotal(brief.run_id)
        await this.runtime.lifecycle.write({
          ...nextState,
          current_turn_index: i,
          current_stage_id: role.role,
          run_token_total: runTokenTotal,
          paid_call_count: brief.dry_run === false ? nextState.paid_call_count + 1 : 0,
          source_file_paths: (await this.runtime.sourceFileStore.listSourceFiles(showrunnerRunRootPath(brief.run_id))).map(file => file.path),
        })
      }
    }
    await this.writePipelineArtifacts(brief)
    await this.runtime.lifecycle.transition(brief.run_id, { type: 'ARTIFACT_WRITTEN' })
  }

  private resolveRole(brief: ShowrunnerBriefSpec, roleName: string): AgentRoleEntry | null {
    return brief.agent_roles.find(role => role.role === roleName) || null
  }

  private async writePipelineArtifacts(brief: ShowrunnerBriefSpec): Promise<void> {
    const entries = await this.runtime.creativeStateStore.list(brief.run_id)
    if (brief.run_type === 'podcast') {
      const latestScript = findLatestScriptEntry(entries)
      if (latestScript) {
        const parsed = this.runtime.scriptSchema.parse(latestScript.content)
        if (parsed.ok) await writeNarrationManifest(this.runtime.sourceFileStore, buildNarrationManifest(parsed.script, brief.narrator_voice_map || []))
      }
    }
    if (brief.run_type === 'writers_room') {
      await this.runtime.sourceFileStore.writeSourceFile(
        `${showrunnerRunRootPath(brief.run_id)}/revision-history.md`,
        ['---', 'schema: "agentic-graph-showrunner-revision-history/v1"', `run_id: ${JSON.stringify(brief.run_id)}`, '---', '', ...entries.map(entry => `- ${entry.turn_index}: ${entry.entry_type}`), ''].join('\n'),
      )
    }
  }
}

export const createShowrunnerOrchestrator = (runtime?: ShowrunnerRuntime): ShowrunnerOrchestrator =>
  new ShowrunnerOrchestrator(runtime)
