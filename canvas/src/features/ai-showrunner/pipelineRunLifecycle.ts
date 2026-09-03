import type {
  FailureReport,
  IPipelineRunLifecycle,
  LifecycleEvent,
  PipelineRunState,
  PipelineRunStatus,
  RunListFilter,
  ShowrunnerError,
  ShowrunnerSourceFileStore,
} from './showrunnerTypes'
import {
  deriveShowrunnerContentHash,
  normalizeShowrunnerString,
  showrunnerRunRootPath,
  showrunnerRunStatePath,
} from './showrunnerShared'

const invalidStateError = (status: PipelineRunStatus, event: LifecycleEvent): ShowrunnerError => ({
  code: 'INVALID_RUN_STATE',
  message: `Cannot apply ${event.type} to Pipeline_Run in ${status} state.`,
  field: 'status',
})

const nextStatus = (status: PipelineRunStatus, event: LifecycleEvent): PipelineRunStatus | null => {
  if (status === 'queued' && event.type === 'PICK_UP') return 'running'
  if (status === 'running' && event.type === 'BUDGET_GATE') return 'awaiting_review'
  if (status === 'awaiting_review' && event.type === 'APPROVE') return 'running'
  if (status === 'running' && event.type === 'ARTIFACT_WRITTEN') return 'complete'
  if (status === 'running' && event.type === 'UNRECOVERABLE_ERROR') return 'failed'
  if ((status === 'complete' || status === 'failed') && event.type === 'ARCHIVE') return 'archived'
  return null
}

export class PipelineRunLifecycle implements IPipelineRunLifecycle {
  private readonly states = new Map<string, PipelineRunState>()

  constructor(private readonly sourceFileStore: ShowrunnerSourceFileStore) {}

  async create(state: PipelineRunState): Promise<PipelineRunState> {
    return this.write(state)
  }

  async transition(runId: string, event: LifecycleEvent) {
    const state = await this.read(runId)
    if (!state) return { ok: false as const, error: invalidStateError('failed', event) }
    const status = nextStatus(state.status, event)
    if (!status) return { ok: false as const, error: invalidStateError(state.status, event) }
    if (event.type === 'UNRECOVERABLE_ERROR') await this.writeFailureReport(runId, event.report)
    if (event.type === 'ARTIFACT_WRITTEN' || event.type === 'ARCHIVE') await this.writeArtifactManifest(runId)
    const sourceFilePaths = (await this.sourceFileStore.listSourceFiles(showrunnerRunRootPath(runId))).map(file => file.path)
    const next = await this.write({
      ...state,
      status,
      current_stage_id: event.type === 'BUDGET_GATE' || event.type === 'APPROVE' ? event.stageId : state.current_stage_id,
      source_file_paths: sourceFilePaths,
      updated_at_iso: new Date().toISOString(),
    })
    return { ok: true as const, state: next }
  }

  async read(runId: string): Promise<PipelineRunState | null> {
    return this.states.get(normalizeShowrunnerString(runId)) || null
  }

  async write(state: PipelineRunState): Promise<PipelineRunState> {
    const next = {
      ...state,
      token_budget_remaining: Math.max(0, state.token_budget - state.run_token_total),
      updated_at_iso: state.updated_at_iso || new Date().toISOString(),
    }
    this.states.set(normalizeShowrunnerString(next.run_id), next)
    await this.sourceFileStore.writeSourceFile(showrunnerRunStatePath(next.run_id), `${JSON.stringify(next, null, 2)}\n`)
    return next
  }

  async writeFailureReport(runId: string, report: FailureReport): Promise<void> {
    await this.sourceFileStore.writeSourceFile(
      `${showrunnerRunRootPath(runId)}/failure_report.md`,
      [
        '---',
        'schema: "agentic-graph-showrunner-failure/v1"',
        `run_id: ${JSON.stringify(runId)}`,
        `failing_role: ${JSON.stringify(report.failing_role)}`,
        `turn_index: ${report.turn_index}`,
        `error_code: ${JSON.stringify(report.error_code)}`,
        '---',
        '',
        report.error_message,
        '',
      ].join('\n'),
    )
  }

  async writeArtifactManifest(runId: string) {
    const files = await this.sourceFileStore.listSourceFiles(showrunnerRunRootPath(runId))
    const rows = files.map(file => `- ${file.path} ${file.content_hash}`)
    return this.sourceFileStore.writeSourceFile(
      `${showrunnerRunRootPath(runId)}/manifest.md`,
      [
        '---',
        'schema: "agentic-graph-showrunner-artifact-package/v1"',
        `run_id: ${JSON.stringify(runId)}`,
        `content_hash: ${JSON.stringify(deriveShowrunnerContentHash(rows.join('\n')))}`,
        '---',
        '',
        '# Artifact Package',
        '',
        ...rows,
        '',
      ].join('\n'),
    )
  }

  async listRuns(filter: RunListFilter = {}): Promise<PipelineRunState[]> {
    return Array.from(this.states.values())
      .filter(state => !filter.status || state.status === filter.status)
      .filter(state => !filter.run_type || state.run_type === filter.run_type)
      .filter(state => !filter.created_after_iso || state.created_at_iso >= filter.created_after_iso)
      .filter(state => !filter.created_before_iso || state.created_at_iso <= filter.created_before_iso)
      .sort((left, right) => right.created_at_iso.localeCompare(left.created_at_iso))
  }
}
