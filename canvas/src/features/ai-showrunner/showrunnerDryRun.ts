import type { AgentTurnDispatcher, AgentTurnRequest, AgentTurnResult, Script } from './showrunnerTypes'
import { showrunnerScriptSchema } from './scriptSchema'

const buildPodcastScript = (request: AgentTurnRequest): Script => ({
  schema: 'agenticgraph-script/v1',
  title: request.brief.title,
  run_id: request.brief.run_id,
  segments: [
    {
      speaker: request.brief.narrator_voice_map?.[0]?.speaker || 'host',
      text: `Dry-run opening for ${request.brief.title}.`,
      stage_direction: 'measured',
      duration_estimate_s: 18,
    },
  ],
})

export const buildDeterministicMockProvider = (): AgentTurnDispatcher => async (request): Promise<AgentTurnResult> => {
  const role = request.role.role
  if (role === 'scriptwriter') {
    return {
      ok: true,
      entry_type: 'script_draft',
      content: showrunnerScriptSchema.print(buildPodcastScript(request)),
      input_tokens: 24,
      output_tokens: 72,
      model_id: 'dry-run-mock',
    }
  }
  if (role === 'critic') {
    return {
      ok: true,
      entry_type: 'critique',
      content: `Dry-run critique for ${request.brief.title}: tighten the audience promise.`,
      input_tokens: 20,
      output_tokens: 28,
      model_id: 'dry-run-mock',
    }
  }
  if (role === 'revisor') {
    return {
      ok: true,
      entry_type: 'revision',
      content: `Dry-run revision for ${request.brief.title} at turn ${request.turn_index}.`,
      input_tokens: 22,
      output_tokens: 36,
      model_id: 'dry-run-mock',
    }
  }
  if (role === 'story_agent') {
    return {
      ok: true,
      entry_type: 'world_state',
      content: JSON.stringify({
        active_branch_id: `branch-${request.turn_index}`,
        narrative_context_summary: `Dry-run branch for ${request.brief.title}.`,
        turn_index: request.turn_index,
      }, null, 2),
      input_tokens: 24,
      output_tokens: 44,
      model_id: 'dry-run-mock',
    }
  }
  const entryType = role === 'researcher'
    ? 'research_pack'
    : role === 'brainstormer'
      ? 'idea_set'
      : role === 'drafter'
        ? 'draft'
        : role === 'narrator_router'
          ? 'narration_segment'
          : 'artifact_manifest'
  return {
    ok: true,
    entry_type: entryType,
    content: `Dry-run ${role} output for ${request.brief.title}.`,
    input_tokens: 18,
    output_tokens: 30,
    model_id: 'dry-run-mock',
  }
}
