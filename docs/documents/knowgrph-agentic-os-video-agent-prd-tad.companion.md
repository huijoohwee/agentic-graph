---
title: "Knowgrph Agentic Video Workflow — Reference implementation companion"
id: "md:knowgrph-agentic-os-video-agent-prd-tad-companion"
doc_type: "TAD Companion"
version: "0.4.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.agentic-os.video-agent.companion"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-agentic-os-video-agent-prd-tad.companion.md"
parent: "docs/documents/knowgrph-agentic-os-prd-tad.md"
parent_version: "1.0.0"
reference_implementation: true
guideline_title: "PRD, TAD & ADR Guidelines"
guideline_version: "1.7.0"
authority: "target video-remix workflow, checkpoint, revision, render-resume, and cost-control contract"
runtime_scope: "authoring specification; source presence requires independent runtime evidence"
publish_policy: "Prod mirror and Cloudflare remain forbidden until explicit operator approval"
orientation:
  - "solo-dev"
  - "AI-native"
  - "min-viable-max-value"
  - "FOSS-first"
  - "token-economical"
  - "harness-first"
constraints:
  - "native-in-repo"
  - "zero new dependency"
  - "zero new datastore"
  - "provider-neutral workflow state"
  - "bounded retries"
  - "no completed-shot rerender"
  - "no copied external implementation"
source_references:
  agentic_os_harness: "../../../agentic-canvas-os/docs/HARNESS-CONTRACTS.md"
  agentic_os_facts: "../../../agentic-canvas-os/docs/FACTS.md"
  director: "../../mcp/video-remix/run-video-remix.js"
  workflow: "../../mcp/video-remix/workflow-control.js"
  workflow_schema: "../../mcp/video-remix/workflow-contract.js"
  execution: "../../mcp/video-remix/video-agent-execution.js"
  narrative_continuity: "../../mcp/video-remix/narrative-continuity.js"
  agent_collaboration: "../../mcp/video-remix/agent-collaboration.js"
  visual_quality_monitor: "../../mcp/video-remix/visual-quality-monitor.js"
  retry: "../../mcp/video-remix/retry.js"
  public_runtime: "../../mcp/video-remix-runtime.js"
external_pattern_reference: "https://github.com/HKUDS/ViMax"
external_reference_policy: "architecture inspiration only; no code, prompt, fixture, provider config, or runtime dependency copied"
---

# Knowgrph Agentic Video Workflow — Reference implementation companion

This companion is a `spec-complete` authoring artifact with delivered readiness
`undocumented`. It maps a target contract to source owners and VCCs, but it
attaches no recorded test result, live-provider capture, mirror result, delivery
check, or operator promotion instruction. Every capability and state below is a
requirement unless an Evidence Reference is added later; source presence alone
does not raise readiness.

## Reference implementation outcome target

The target keeps one Video Remix Director as the end-to-end video orchestrator.
The contract requires interactive plan, revise, render, and resume actions while
preserving the sequence:

`research -> storyboard -> render -> edit -> publish -> checkout`

The specification covers session reuse, deterministic context compaction,
source-addressable long-script segmentation, audience-conditioned expressive
storyboard design, scene-scoped multi-camera simulation, first-frame reference
selection, spatial image-prompt generation, bounded candidate generation and
consistency selection, dependency-aware shot rendering, hierarchical narrative
planning, temporal state, bounded specialist negotiation, multimodal review,
typed handoffs, asset indexing, and resource accounting. The target introduces
no external runtime dependency, datastore, approval gate, or deploy action.

## Reference implementation product contract

### Operator need

A solo operator must be able to plan and revise before render spend, resume an interrupted script-to-video run without regenerating completed shots, inspect exact per-shot status, and keep context/token growth bounded.

### Specified acceptance targets

| Capability | Observable outcome |
|---|---|
| Interactive planning | `workflow.action: "plan"` returns `state: "awaiting_review"` with zero render dispatches. |
| Revision | `workflow.action: "revise"` applies only named `shotPrompts` and rejects unknown shot ids before spend. |
| Character continuity | `workflow.characters[]` is normalized into the returned `creativePlan`; reference bindings remain explicit. |
| Landscape guard | Any supplied reference image with `width <= height` blocks render before provider dispatch. |
| Resume | `workflow.checkpoint.renderAssets[]` is filtered to current shot ids and reused; only pending shots reach the render harness. |
| Persistent status | The returned checkpoint records every shot as `complete`, `pending`, or `failed`. |
| Context compaction | Recent complete entries are retained within `characterBudget`; dropped entries are counted and never silently summarized. |
| LLM/provider retry | Live render dispatch uses the shared bounded retry policy and returns an attempt trace. |
| Hierarchical narrative | Story -> act -> scene -> shot structure records objectives, dependencies, and retrieved source cards. |
| Intelligent long-script design | Novel-scale input is parsed into exact source-span units and contiguous multi-scene segments; planned shots carry segment, plot-unit, and dialogue-unit bindings. |
| Plot/dialogue retention | Coverage is computed from source unit ids. Any omitted key plot beat or dialogue produces a blocking narrative proposal rather than a silent rewrite. |
| Script RAG | Scene planning combines assigned contiguous segments with query-relevant script units; live model context is compacted only at complete segment boundaries and reports omitted segment ids. |
| Expressive storyboard | Every shot receives typed dramatic purpose, intensity, size, angle, movement, composition, transition, duration, and a render-ready cinematography prompt. |
| Audience conditioning | `storyboardProfile` preserves operator requirements, audience description, viewing context, accessibility needs, sensitivities, tone, style, aspect ratio, pace, and motion intensity without demographic inference. |
| Narrative rhythm | The returned rhythm ledger exposes pace, beat count, total duration, and a per-shot intensity/duration curve used by subsequent generation. |
| Cinematography validation | Camera terms must resolve through the shared grammar; unsupported model output blocks specialist approval before render. |
| Multi-camera simulation | Each scene owns one camera rig and action axis; shots rotate through master, medium, close, reaction, and insert coverage without inventing a second scene model. |
| Spatial blocking | Character coordinates and facing direction are carried across every camera covering the same action beat. Conflicting authored positions block render. |
| Background continuity | One normalized background state is carried across all shots in a scene. Any conflicting background blocks the camera-director proposal. |
| Screen direction | Default rigs remain on the primary side of the action axis and respect the configured minimum cut angle; explicit axis crossing is opt-in. |
| Reference catalog | Operator character, environment, storyboard, object, and style references are normalized with entity, scene, action-beat, environment, and source-shot metadata. |
| Temporal first frame | Completed checkpoint assets become source-addressable storyboard references and the immediately preceding available shot receives the strongest temporal score. |
| Coverage selection | A bounded greedy selector prefers new character/environment coverage, then temporal proximity and scene/action-beat relevance; selection is computed once and checkpointed. |
| Strict reference policy | Existing reference-free runs remain valid. Operators may require character and/or environment coverage, causing named missing coverage to block before render. |
| Automated image prompt | The selected references, current scene blocking, camera direction, environment anchors, pairwise character geometry, and prior-timeline source shot compile into one provider-neutral first-frame prompt. |
| Spatial policy | Operators can bound coordinate precision and interaction distance, disable optional reference/timeline directives, or require spatial blocking before render. |
| Resume reuse | Each prompt records a canonical input key; an unchanged checkpoint prompt is reused byte-for-byte, while changed reference, blocking, camera, character, policy, or authored prompt input invalidates only that shot. |
| Parallel candidates | Each pending shot generates a bounded operator-configured candidate set through one provider-neutral image client with bounded concurrency and retry traces. |
| VLM consistency selection | Candidate frames are evaluated concurrently for identity, environment, spatial, temporal, and technical consistency. Normalized operator-configurable weights produce one score; stable candidate ids break ties. |
| Fail-closed quality | Insufficient successful candidates or no frame meeting the configured threshold blocks the first-frame reviewer before video render. Unconfigured optional clients remain zero-spend and preserve existing reference behavior. |
| Candidate reuse | Accepted candidates carry a semantic input key in the checkpoint. Resume reuses the selected durable asset without candidate regeneration or VLM rescoring when prompt/reference policy is unchanged. |
| Same-camera batches | Contiguous shots with the same assigned camera—and, by default, the same scene—share one bounded render batch. Camera changes, scene changes, authored transitions, opt-outs, and explicit dependencies create ordered boundaries. |
| Budget-safe concurrency | Parallel provider dispatch requires a configured maximum cost per shot or a client-owned maximum. Unknown-cost providers remain serial; each completed call retains its own canonical ledger and provenance record. |
| Deterministic settlement | Batch calls may complete out of order, but assets, ledgers, KGC nodes, and edit input return in storyboard order. A failed batch settles and records every in-flight call, then prevents later batches from starting. |
| Resume projection | The checkpoint stores the semantic schedule once. Resume removes completed shot ids from their existing batches without merging across prior dependency/camera boundaries or rerendering completed work. |
| Temporal continuity | Each shot carries character, environment, reference-image, and prior-shot dependencies; unexplained changes are surfaced. |
| Specialist collaboration | Narrative, continuity, visual-quality, and production roles submit typed proposals to one bounded negotiation owner. |
| Pipeline projection | `workflow.multiAgentPipeline` exposes input, orchestration, script, shot, asset, continuity, synthesis, and output stages as one forward-only DAG with named agents and handoffs. |
| Pipeline economics | The projection counts retained context, script units, planned/reused shots, image and render provider calls, retries, spend, and Cost Logs without recalculating provider accounting. |
| Honest completion | Missing optional visual-review configuration yields `complete_unverified`; a blocked specialist propagates a blocked state through every dependent stage and handoff. |
| VLM quality loop | The existing multimodal AI Gateway client reviews rendered assets against planned narrative and continuity state. Low scores block edit/publish and return targeted prompt revisions. |
| Cost control | Existing approvals, Cost Logs, Credit Ledger events, and Budget Meters remain authoritative. |

## Invocation ownership

This companion declares no command route, semantic tag, binding, or callable
tool identity. Callable identities and their schemas remain owned by the
existing runtime contracts and catalogs. This document owns only the target
workflow payload and its VCCs, so it requires no Invocation Register and cannot
conflict with the canonical Agentic OS register.

## Runtime architecture

| Owner | Single responsibility |
|---|---|
| `workflow-contract.js` | Canonical JSON Schema shared by local and Cloudflare MCP tool definitions. |
| `workflow-control.js` | Validate actions, revisions, characters, image metadata, context, and checkpoints; derive pending work. |
| `run-video-remix.js` | Compose the canonical Run Manifest and enforce workflow state before spend. |
| `video-agent-execution.js` | Render pending shots, merge reused assets in storyboard order, edit once, and surface retry/accounting evidence. |
| `retry.js` | Own iteration bounds, backoff schedule metadata, exhaustion state, and async retry execution. |
| `long-script-engine.js` | Own exact source spans, plot/dialogue classification, contiguous segmentation, script-unit retrieval, shot bindings, coverage, and whole-segment context compaction. |
| `expressive-storyboard.js` | Own the provider-neutral cinematography grammar, storyboard profile, shot-level visual language, rhythm curve, render prompt composition, and validation. |
| `multi-camera-simulation.js` | Own scene rigs, camera coverage roles, action-axis placement, cut-angle bounds, action-beat blocking, background continuity, and multi-camera render direction. |
| `reference-image-selection.js` | Own reference kinds, catalog normalization, temporal scoring, greedy entity/environment coverage, first-frame selection, prompt conditioning, and strict coverage issues. |
| `automated-image-generation.js` | Own image-prompt policy, normalized coordinates, character/environment placement, pairwise interaction geometry, prior-timeline movement directives, and strict spatial issues. |
| `image-consistency-check.js` | Own bounded candidate fan-out, semantic reuse, retry traces, normalized VLM metrics/weights, deterministic ranking, threshold selection, Cost Logs, and selected first-frame projection. |
| `parallel-shot-generation.js` | Own same-camera schedule keys, batch boundaries, resume projection, budget-bounded concurrency, per-shot canonical harness composition, deterministic aggregation, and parallel execution evidence. |
| `multi-agent-pipeline.js` | Project the existing specialists into a forward-only nine-stage DAG with typed handoffs, semantic reuse, artifact indexing, resource accounting, and dependency-aware status. |
| `narrative-continuity.js` | Own local retrieval, story hierarchy, shot dependencies, and temporal character/environment state. |
| `agent-collaboration.js` | Own specialist proposals and bounded production decisions. |
| `visual-quality-monitor.js` | Own provider-neutral post-render quality packets, thresholds, retries, revisions, and Cost Logs. |
| `director-live-run.js` | Inject configured live clients and refresh the workflow checkpoint after live execution. |

No UI-local registry, compatibility alias, provider-specific workflow schema, or second orchestrator is permitted.

## Narrative, continuity, and collaboration flow

1. The long-script engine parses screenplay headings, speaker-prefixed dialogue, quoted prose dialogue, and plot sentences into stable units with exact character ranges in the operator source.
2. Units are packed in source order into configurable multi-scene segments. Every plot and dialogue unit must resolve into a segment; retention coverage below 100% blocks production.
3. The narrative planner groups shots into acts and scenes, attaches temporal dependencies, binds contiguous script segments, retrieves relevant script units, and retrieves only source cards present in the current Evidence Pack.
4. Live storyboard planning receives immutable, whole-segment context within a configurable character budget. Omitted context segment ids are explicit; dialogue wording is not silently summarized or replaced.
5. The storyboard designer combines the operator requirements and target-audience profile with narrative/dialogue bindings, then resolves every shot through the canonical size, angle, movement, composition, transition, duration, dramatic-purpose, and intensity grammar.
6. The same designed shots populate the KGC canvas nodes, checkpoint, and provider-facing `renderPrompt`; the authored narrative `prompt` remains separately editable.
7. The camera Director groups shots by scene, constructs a bounded camera rig around one action axis, assigns coverage roles, and carries one spatial blocking model per action beat plus one background state per scene.
8. Camera changes alter viewpoint only. Conflicting character coordinates, facing direction, background state, or unknown camera ids produce typed blocking issues before render.
9. The reference curator indexes explicit landscape references and completed checkpoint assets, scores them against character ids, environment state, scene, action beat, and timeline distance, then chooses a bounded first-frame set.
10. The selected primary and supporting references are embedded in KGC nodes, `renderPrompt`, provider dispatch, checkpoint state, and VLM expectations. No later stage re-ranks or recalculates them.
11. The image-prompt designer compiles the selected references and normalized spatial state into one first-frame prompt, including pairwise character interaction geometry and move/hold directives from the selected prior-timeline source shot.
12. Before video render, the image generator fans out a bounded candidate set and the first-frame reviewer evaluates identity, environment, spatial, temporal, and technical consistency through the existing multimodal gateway.
13. The highest frame meeting threshold becomes `primaryReference`; its durable URL reaches KGC, checkpoint, video render, and later VLM review. Equal scores resolve by stable candidate id, never completion timing.
14. The render scheduler compiles contiguous same-camera shots into bounded batches once, validates forward dependencies, and assigns batch metadata to every KGC shot.
15. Approved live execution projects pending shot ids onto that schedule. Batches execute in order; eligible shots within one batch call the canonical render harness concurrently with separately derived, verified render tokens.
16. The continuity supervisor carries character and environment state across shot boundaries, resolves reference images, and flags unknown characters or unexplained changes.
17. The production Director receives typed proposals from the narrative planner, storyboard designer, camera Director, reference curator, image-prompt designer, first-frame reviewer, render scheduler, continuity supervisor, visual-quality reviewer, and production role. Negotiation is capped and cannot recursively spawn another Director.
18. After render, the VLM reviewer receives the generated image plan, accepted candidate evidence, planned references, camera assignment, and spatial blocking alongside narrative/visual continuity, using the configured AI Gateway multimodal endpoint.
19. Passing reviews allow edit/publish. Low scores return `awaiting_quality_revision`, block downstream output, and persist `proposedRevisions` in the workflow checkpoint. A later `resume` applies only approved shot revisions and reuses unaffected completed assets.
20. The pipeline projector reads those canonical stage results once, emits named agent assignments and handoffs, indexes references/frames/clips/output by semantic identity, and advances the same projection in the checkpoint after live execution.

This is specified as a dependency-aware feedback loop, not an automatic
unbounded rerender loop. Every model call must remain approval-gated, retried
through the shared bound, and recorded in Budget Meters and Cost Logs.

## Workflow input

```json
{
  "workflow": {
    "sessionId": "operator-owned-stable-id",
    "action": "plan | revise | render | resume | run",
    "script": "optional operator-authored script",
    "characters": [
      {
        "id": "stable-character-id",
        "name": "display name",
        "description": "source-owned continuity note",
        "referenceImageId": "optional-reference-id"
      }
    ],
    "referenceImages": [
      {
        "id": "reference-id",
        "width": 1920,
        "height": 1080,
        "assetUrl": "optional durable reference"
      }
    ],
    "revision": {
      "note": "operator revision note",
      "shotPrompts": {
        "shot-1": "replacement prompt"
      }
    },
    "context": {
      "characterBudget": 12000,
      "entries": [
        { "role": "operator", "content": "bounded context" }
      ]
    },
    "checkpoint": {
      "sessionId": "operator-owned-stable-id",
      "revisionNumber": 1,
      "renderAssets": []
    }
  }
}
```

Values shown above describe field shapes, not provider fixtures or runtime defaults. Live assets and session identifiers remain runtime-owned.

## State transitions

| Current action | Guard | Next state | Spend behavior |
|---|---|---|---|
| `plan` | Input valid | `awaiting_review` | No render dispatch. |
| `revise` | Revision names current shot ids | `awaiting_review` | No render dispatch. |
| `render` | Approvals valid and landscape guard passes | Existing live Director state | Only pending shots dispatch. |
| `resume` | Session ids match and checkpoint is valid | Existing live Director state | Completed assets are reused; only pending shots dispatch. |
| Any render action | Portrait/square reference supplied | `blocked` | Zero render calls. |
| Any live dispatch | Retry succeeds within bound | Continue | Attempt trace records retry metadata. |
| Any live dispatch | Retry bound exhausted | `blocked` | Downstream stages halt; prior assets remain in checkpoint. |

## Checkpoint output

The target Run Manifest schema requires `workflow.checkpoint` with:

| Field | Rule |
|---|---|
| `schema` | `knowgrph.video_workflow/v1`. |
| `sessionId` | Stable workflow scope supplied by the operator or derived from `runId`. |
| `revisionNumber` | Increments only for `revise`. |
| `context` | Bounded retained context plus input/retained/dropped counts. |
| `longScript` | Exact script corpus, source ranges, ordered segments, shot bindings, recommended scene count, and plot/dialogue retention coverage. |
| `storyboardDesign` | Normalized operator/audience profile, canonical grammar, designed shots, rhythm curve, validation issues, and readiness status. |
| `multiCameraDesign` | Normalized camera policy, scene rigs, action axes, camera assignments, spatial blocking, scene backgrounds, coverage counts, issues, and readiness status. |
| `referenceSelection` | Normalized policy, explicit and prior-timeline catalog, ranked per-shot selections, primary references, character/environment coverage, issues, and readiness status. |
| `imageGeneration` | Normalized prompt policy, per-shot image prompts, reference/source-shot ids, spatial placement, pairwise interactions, timeline transitions, issues, coverage, and readiness status. |
| `imageConsistency` | Candidate policy, generated durable assets, dimensional VLM reviews, deterministic ranking, selected candidate, semantic input keys, reuse flags, retry trace, Cost Logs, issues, provider-call counts, and readiness status. |
| `parallelShotPlan` | Normalized policy, semantic input key, ordered camera/scene/dependency batches, per-shot assignments, coverage, issues, reuse flag, and readiness status. |
| `parallelShotExecution` | Pending projected batches, parallel/serial counts, observed maximum concurrency, and the exact batch evidence used by live render. |
| `multiAgentPipeline` | Nine ordered stages, specialist assignments, typed handoffs, semantic input key/reuse state, artifact index, resource ledger, DAG validation, and current pipeline state. |
| `renderStatus[]` | One current status per planned shot. |
| `renderAssets[]` | Latest valid durable asset per current shot, ordered by storyboard. |
| `narrative` | Story/act/scene hierarchy, retrieved evidence coverage, and dependency validation. |
| `continuity` | Per-shot character/environment snapshots, references, and temporal issues. |
| `qualityReview` | VLM scores, findings, retry trace, provider-call count, and valid Cost Logs. |
| `negotiation` | Specialist proposals, bounded round count, final decision, and proposed revisions. |
| `proposedRevisions` | Shot-keyed prompt refinements for the next review/resume cycle. |
| `completeShotCount` | Count of reusable completed shots. |
| `pendingShotCount` | Count of shots still requiring work. |

The checkpoint is a typed transport payload. Persistence stays with the existing Run Manifest/checkpoint owner; this increment adds no datastore.

## Retry and token economics

- `maxIterations` remains normalized by the shared Director policy.
- Live render retries operate on the failing shot client call, not the whole storyboard, so completed shots are not regenerated.
- Retry delay values are surfaced as deterministic schedule metadata; the runtime does not create an unbounded timer loop.
- Context compaction is model-free and zero-cost. It retains recent complete entries within the character budget and reports dropped count.
- Existing `Cost_Log`, Credit Ledger, Budget Meters, and approval gates remain the only spend records.
- A missing approval, invalid checkpoint, invalid revision, or failed landscape guard blocks before render spend.

## Failure handling

| Failure | Typed behavior |
|---|---|
| Invalid action | `VideoWorkflowInputError` naming `workflow.action`. |
| Resume without checkpoint | `VideoWorkflowInputError` naming `workflow.checkpoint`. |
| Session mismatch | `VideoWorkflowInputError` naming `workflow.checkpoint.sessionId`. |
| Unknown revised shot | `VideoWorkflowInputError` naming `workflow.revision.shotPrompts`. |
| Invalid image metadata | `VideoWorkflowInputError` naming the exact reference index. |
| Non-landscape reference | Run Manifest is blocked before provider dispatch and records rejected dimensions. |
| Transient live render failure | Bounded retry trace; success continues without rerendering prior shots. |
| Exhausted render/edit failure | Existing fail-closed Director record; prior artifacts remain checkpointed. |
| Omitted plot or dialogue unit | Narrative specialist blocks before render and names every omitted unit id. |
| Unsupported pace or cinematography term | Storyboard specialist blocks before render and names the shot, field, and rejected value. |
| Unknown scene camera | Camera Director blocks before render and names the shot, scene, and rejected camera id. |
| Blocking or background discontinuity | Camera Director blocks before render and names the scene/action beat containing conflicting spatial state. |
| Required character reference missing | Reference curator blocks and names the shot and uncovered character ids. |
| Required environment reference missing | Reference curator blocks and names the shot lacking matching environment or prior-scene coverage. |
| Required spatial blocking missing | Image-prompt designer blocks and names the shot before provider dispatch. |
| Image generation client unavailable under required policy | First-frame reviewer blocks before video render with zero candidate calls. |
| Too few successful candidates | First-frame reviewer records the successful and required counts and blocks before video render. |
| No candidate meets consistency threshold | First-frame reviewer records the best score and configured threshold and blocks before video render. |
| Forward/self render dependency | Render scheduler blocks before provider dispatch and names the shot and invalid dependency. |
| Unknown per-shot maximum provider cost | Scheduler preserves the planned batches but dispatches them serially to prevent concurrent budget overshoot. |
| Shot failure inside parallel batch | All already-started calls settle and retain ledger/provenance evidence; no later batch starts. |

## Verifiable completion conditions

1. Given `action: "revise"`, when one known shot prompt changes, then the returned storyboard contains the new prompt, state is `awaiting_review`, and provider spend is zero.
2. Given a portrait reference, when render is requested, then provider dispatch count is zero and `landscape_reference_guard_blocks_render` is true.
3. Given a checkpoint containing one completed shot, when resume runs, then only remaining shot ids dispatch and the completed asset remains byte-for-byte referenced in the merged result.
4. Given transient client failures below `maxIterations`, when dispatch eventually succeeds, then the attempt trace records each retry and the run continues.
5. Given context above its character budget, when compaction runs, then retained characters do not exceed the budget and dropped count is explicit.
6. Given the local and Cloudflare Director tools, when schemas are inspected, then both reference the same `VIDEO_WORKFLOW_INPUT_SCHEMA` owner.
7. Given the focused runtime and property suites, when executed, then existing stage order, approval, cost, ledger, edit, and MCP equivalence checks remain green.
8. Given a multi-scene plan, when narrative planning runs, then every implicit and explicit dependency resolves or the specialist decision blocks before render.
9. Given character or environment state changes, when continuity evaluation runs, then carried state is stable and unexplained changes are named.
10. Given a configured VLM reviewer and a score below policy, when post-render review completes, then edit/publish remain blocked and the next prompt revision is checkpointed with its Cost Log.
11. Given novel-like prose and screenplay dialogue, when the corpus is built, then each unit text equals its exact source range and dialogue speaker/text remain typed.
12. Given a long script, when it is segmented, then every plot and dialogue unit appears in the ordered multi-scene structure or production blocks with named omissions.
13. Given live storyboard planning above its context budget, when compaction occurs, then only whole segments are retained and every omitted segment id is reported.
14. Given operator requirements and a target audience, when storyboard design runs, then each shot returns canonical cinematography plus the source profile and audience rationale.
15. Given an accelerating pace, when the rhythm ledger is built, then shot durations form a bounded non-increasing curve and total duration equals its rounded sum.
16. Given a render dispatch, when a designed shot reaches the provider adapter, then the composed cinematography `renderPrompt` is sent while the editable narrative prompt remains unchanged.
17. Given several cameras covering one action beat, when simulation runs, then camera ids vary while character coordinates, facing direction, and background remain identical.
18. Given axis crossing disabled, when a scene rig is built, then every effective camera remains on the primary side and adjacent rig positions meet the minimum cut angle.
19. Given conflicting blocking or background in one scene, when specialists negotiate, then the camera Director blocks before provider dispatch.
20. Given post-render VLM review, when a packet is built, then expected continuity includes the exact camera assignment and spatial blocking used by the provider prompt.
21. Given explicit character and environment references, when selection runs, then the bounded set covers all available required entities and records its scoring reasons.
22. Given a completed previous shot in the checkpoint, when a later shot is planned, then that durable asset is indexed as `timeline:<shotId>` and preferred as the next first-frame reference.
23. Given strict coverage enabled and missing references, when specialists negotiate, then the reference curator blocks before render with named missing coverage.
24. Given provider dispatch and VLM review, when a selected shot is consumed, then both receive the checkpointed primary/supporting references without re-selection.
25. Given multiple characters and environment anchors, when image planning runs, then one prompt records exact placement and pairwise lateral, depth, and proximity relationships.
26. Given a selected prior-timeline storyboard, when the next image prompt is generated, then it names the source shot and emits deterministic move-or-maintain directives for shared characters.
27. Given strict spatial policy and no authored or inherited blocking, when specialists negotiate, then the image-prompt designer blocks before render.
28. Given KGC output, provider dispatch, checkpoint/resume, and VLM review, when a generated image prompt is consumed, then every surface receives the same prompt and spatial plan; unchanged semantic input reuses the checkpoint prompt without recomputation.
29. Given a candidate count and concurrency bound, when first-frame generation runs, then candidates execute concurrently without exceeding either bound and every attempt is traceable.
30. Given candidate frames, when multimodal review completes, then identity, environment, spatial, temporal, and technical metrics use normalized configured weights and select the highest qualifying score.
31. Given equal qualifying scores, when ranking completes, then stable candidate id determines the winner independently of provider completion order.
32. Given insufficient or sub-threshold candidates, when specialists negotiate, then the first-frame reviewer blocks video render with named evidence.
33. Given an unchanged accepted checkpoint selection, when resume runs, then the durable selected frame is reused with zero candidate-generation and candidate-review calls.
34. Given a selected frame, when KGC, checkpoint, video dispatch, accounting, and post-render VLM consume the shot, then each receives the same durable first-frame URL and review evidence.
35. Given contiguous shots assigned to the same camera and scene, when scheduling runs, then they share one bounded parallel batch and retain storyboard positions.
36. Given a camera/scene change, explicit dependency, transition, opt-out, or batch-size limit, when scheduling runs, then an ordered batch boundary is created.
37. Given qualifying same-camera work and a known per-shot cost maximum, when live render runs, then observed concurrency exceeds one without exceeding policy, batch, or budget capacity.
38. Given out-of-order provider completion, when aggregation completes, then assets and ledger events remain in storyboard order with exactly one canonical result per shot.
39. Given one failure within a parallel batch, when in-flight calls settle, then their spend/provenance remains recorded and later batches receive zero dispatches.
40. Given completed checkpoint shots, when resume projects the schedule, then completed ids disappear without merging prior boundaries, recalculating the plan, or rerendering completed work.
41. Given a planned workflow, when pipeline projection runs, then all nine canonical stages appear exactly once and every dependency points strictly forward.
42. Given specialist stage ownership, when the manifest returns, then named agent assignments and eight typed handoffs are inspectable from both `workflow` and `videoAgent`.
43. Given unchanged semantic planning input, when projection resumes from a checkpoint, then the same input key is reused without recomputing a second orchestration plan.
44. Given completed candidate, render, edit, retry, and accounting results, when the checkpoint advances, then selected frames, clips, assembled output, provider calls, spend, retries, and Cost Logs are indexed once.
45. Given unavailable optional VLM review or a blocking specialist decision, when pipeline state resolves, then it returns `complete_unverified` or propagates `blocked` through dependent stages and handoffs without claiming verified completion.

## Candidate runtime evidence checks

The following invocable commands are candidate VCC hosts. This document records
no result or lane for them, so they are not Evidence References and do not raise
either readiness rung.

```bash
node --test mcp/__tests__/video-agent-workflow.test.mjs mcp/__tests__/video-agent-runtime.test.mjs mcp/__pbt__/video-agent.pbt.test.mjs
node --test cloudflare/workers/knowgrph-mcp/__tests__/tool-registry.test.mjs cloudflare/workers/knowgrph-mcp/__tests__/mcp-surface-equivalence.test.mjs
npm run hygiene:check
```

TypeScript and broader Canvas checks remain separate gates. No mirror sync or
Cloudflare deploy is part of this contract.

## External reference boundary

The ViMax project informed the target checklist: interactive planning,
revision, rendering control, session reuse, context compaction, bounded retries,
persistent render status, landscape guards, and script-to-video resume. This
reference implementation specifies those capabilities against its own Director,
schemas, harnesses, gates, ledgers, and candidate tests; it does not infer
runtime or delivery proof. It does not copy ViMax code, prompts, repository
layout, provider configuration, tests, fixtures, or runtime dependencies.
