import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'

export const SHOWRUNNER_BRIEF_SCHEMA = 'agentic-graph-showrunner-brief/v1' as const
export const SHOWRUNNER_SCRIPT_SCHEMA = 'agentic-graph-script/v1' as const
export const SHOWRUNNER_SCOPE = 'showrunner' as const
export const SHOWRUNNER_DEFAULT_MAX_RETRIES = 3
export const SHOWRUNNER_DEFAULT_MAX_REVISION_CYCLES = 2
export const SHOWRUNNER_DEFAULT_MAX_MEMORY_TOKENS = 500

export type ShowrunnerRunType = 'podcast' | 'narrative_game' | 'writers_room'

export type AgentRoleEntry = {
  role: string
  model_hint?: string
  max_retries?: number
  system_prompt_path?: string
}

export type NarratorVoiceMapEntry = {
  speaker: string
  voice_endpoint_env_key: string
}

export type ShowrunnerBriefSpec = {
  schema: typeof SHOWRUNNER_BRIEF_SCHEMA
  run_type: ShowrunnerRunType
  title: string
  run_id: string
  token_budget: number
  max_retries: number
  max_revision_cycles?: number
  max_context_tokens?: number
  max_memory_tokens?: number
  agent_pipeline: string[]
  agent_roles: AgentRoleEntry[]
  narrator_voice_map?: NarratorVoiceMapEntry[]
  acceptance_criteria?: string[]
  notes?: string
  dry_run?: boolean
}

export type CreativeStateEntryType =
  | 'research_pack'
  | 'script_draft'
  | 'idea_set'
  | 'draft'
  | 'critique'
  | 'revision'
  | 'world_state'
  | 'narration_segment'
  | 'artifact_manifest'
  | 'message'
  | 'error_record'

export type CreativeStateEntry = {
  run_id: string
  agent_role: string
  turn_index: number
  content_hash: string
  entry_type: CreativeStateEntryType
  content: string
  timestamp_iso: string
  token_estimate?: number
}

export type MessageBusMessageType =
  | 'draft'
  | 'critique'
  | 'revision_request'
  | 'approval'
  | 'choice_signal'
  | 'narration_segment'

export type MessageBusMessage = {
  run_id: string
  source_role: string
  target_role: string
  message_type: MessageBusMessageType
  payload: string
  turn_index: number
  delivered: boolean
  timestamp_iso: string
}

export type PipelineRunStatus = 'queued' | 'running' | 'awaiting_review' | 'complete' | 'failed' | 'archived'

export type PipelineRunState = {
  run_id: string
  run_key: string
  run_type: ShowrunnerRunType
  status: PipelineRunStatus
  brief_path: string
  current_stage_id: string
  current_turn_index: number
  run_token_total: number
  token_budget: number
  token_budget_remaining: number
  paid_call_count: number
  retry_counts: Record<string, number>
  created_at_iso: string
  updated_at_iso: string
  dry_run: boolean
  source_file_paths: string[]
}

export type CostLogEntry = {
  run_id: string
  agent_role: string
  model_id: string
  input_tokens: number
  output_tokens: number
  turn_index: number
  stage_id: string
  estimated: boolean
  timestamp_iso: string
}

export type ScriptSegment = {
  speaker: string
  text: string
  stage_direction?: string
  duration_estimate_s?: number
}

export type Script = {
  schema: typeof SHOWRUNNER_SCRIPT_SCHEMA
  title: string
  run_id: string
  segments: ScriptSegment[]
}

export type ShowrunnerErrorCode =
  | 'BRIEF_VALIDATION_ERROR'
  | 'SCRIPT_VALIDATION_ERROR'
  | 'DUPLICATE_CONTENT_HASH'
  | 'INVALID_TOKEN_BUDGET'
  | 'UNREGISTERED_ROLE'
  | 'INVALID_RUN_STATE'
  | 'BUDGET_GATE'
  | 'AGENT_TURN_FAILED'
  | 'VOICE_MAP_GAP'
  | 'BRANCH_GENERATION_FAILED'
  | 'CONVERGENCE_TIMEOUT'
  | 'MEMORY_RECALL_EMPTY'

export type ShowrunnerError = {
  code: ShowrunnerErrorCode
  message: string
  field?: string
}

export type LifecycleEvent =
  | { type: 'PICK_UP' }
  | { type: 'BUDGET_GATE'; stageId: string }
  | { type: 'APPROVE'; stageId: string }
  | { type: 'ARTIFACT_WRITTEN' }
  | { type: 'UNRECOVERABLE_ERROR'; report: FailureReport }
  | { type: 'ARCHIVE' }

export type FailureReport = {
  failing_role: string
  turn_index: number
  error_code: ShowrunnerErrorCode
  error_message: string
}

export type RunListFilter = {
  status?: PipelineRunStatus
  run_type?: ShowrunnerRunType
  created_after_iso?: string
  created_before_iso?: string
}

export type SourceFileRecord = {
  path: string
  content: string
  content_hash: string
  updated_at_iso: string
}

export type ShowrunnerSourceFileStore = {
  writeSourceFile: (path: string, content: string) => Promise<SourceFileRecord>
  readSourceFile: (path: string) => Promise<string | null>
  listSourceFiles: (prefix: string) => Promise<SourceFileRecord[]>
}

export interface IBriefParser {
  parse(markdownText: string): { ok: true; spec: ShowrunnerBriefSpec } | { ok: false; errors: ShowrunnerError[] }
  print(spec: ShowrunnerBriefSpec): string
}

export interface IScriptSchema {
  parse(markdownText: string): { ok: true; script: Script } | { ok: false; errors: ShowrunnerError[] }
  print(script: Script): string
}

export interface ICreativeStateStore {
  append(entry: CreativeStateEntry): Promise<{ ok: true; record: SourceFileRecord } | { ok: false; error: ShowrunnerError }>
  readContext(runId: string, tokenBudget: number): Promise<{
    entries: CreativeStateEntry[]
    estimatedTokens: number
    error?: ShowrunnerError
  }>
  list(runId: string): Promise<CreativeStateEntry[]>
}

export interface IMessageBus {
  publish(msg: MessageBusMessage): Promise<{ ok: true } | { ok: false; error: ShowrunnerError }>
  drainInbox(runId: string, role: string): Promise<MessageBusMessage[]>
  flush(runId: string): Promise<void>
}

export interface ITokenAttribution {
  record(entry: CostLogEntry): Promise<void>
  checkBudget(runId: string, estimatedTokens: number): Promise<boolean>
  estimate(text: string): number
  getRunTotal(runId: string): number
}

export interface IPipelineRunLifecycle {
  create(state: PipelineRunState): Promise<PipelineRunState>
  transition(runId: string, event: LifecycleEvent): Promise<{ ok: true; state: PipelineRunState } | { ok: false; error: ShowrunnerError }>
  read(runId: string): Promise<PipelineRunState | null>
  write(state: PipelineRunState): Promise<PipelineRunState>
  writeFailureReport(runId: string, report: FailureReport): Promise<void>
  writeArtifactManifest(runId: string): Promise<SourceFileRecord>
  listRuns(filter?: RunListFilter): Promise<PipelineRunState[]>
}

export type AgentTurnRequest = {
  brief: ShowrunnerBriefSpec
  runState: PipelineRunState
  role: AgentRoleEntry
  turn_index: number
  context: CreativeStateEntry[]
  inbox: MessageBusMessage[]
}

export type AgentTurnResult =
  | { ok: true; content: string; entry_type: CreativeStateEntryType; input_tokens?: number; output_tokens?: number; model_id?: string }
  | { ok: false; error: ShowrunnerError }

export type AgentTurnDispatcher = (request: AgentTurnRequest) => Promise<AgentTurnResult>

export interface IShowrunnerOrchestrator {
  startRun(briefOrPath: ShowrunnerBriefSpec | string): Promise<{ runId: string; status: PipelineRunStatus }>
  resumeRun(runId: string): Promise<void>
  approveStage(runId: string, stageId: string): Promise<void>
  runStatus(runId: string): Promise<PipelineRunState>
  listRuns(filter?: RunListFilter): Promise<PipelineRunState[]>
  archiveRun(runId: string): Promise<void>
}

export type ShowrunnerRuntime = {
  briefParser: IBriefParser
  scriptSchema: IScriptSchema
  sourceFileStore: ShowrunnerSourceFileStore
  creativeStateStore: ICreativeStateStore
  messageBus: IMessageBus
  tokenAttribution: ITokenAttribution
  lifecycle: IPipelineRunLifecycle
  dispatcher: AgentTurnDispatcher
}

export type ShowrunnerWidgetEntry = WidgetRegistryEntry
