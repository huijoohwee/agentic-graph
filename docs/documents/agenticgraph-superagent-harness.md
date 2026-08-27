# AgenticGraph Super-Agent Harness

## Document Purpose

This is the source-side SSOT for AgenticGraph's local long-horizon SuperAgent harness.
It records the runnable `agenticgraph_parser` harness, its local MCP entrypoint, and
the guardrails for using external SuperAgent references without copying them.

AgenticGraph may use [bytedance/deer-flow](https://github.com/bytedance/deer-flow)
as a conceptual reference for long-horizon harness primitives: message gateway,
tools, skills, memory, subagents, sandboxed workspaces, and minutes-to-hours
runs. That reference is inspiration only. AgenticGraph must not copy Deer Flow code,
clone its architecture, add provider-specific renderer branches, or introduce
downstream alias stacks that bypass the existing Source Files, Storyboard Widget, MCP,
chat, rich-media, and KGC owners.

This document describes the Codex-compatible harness implemented by:

```bash
python3 -m agenticgraph_parser superagent --input docs/documents/my-input.md --output-dir data/outputs/superagent-neutral-example --run-id superagent-neutral-example
```

## Fastest Evaluation Use

When the goal is the shortest proof path with low TCO and zero provider setup, this harness is the
recommended local evaluation route.

Use it before hosted MCP wiring when you need:

- deterministic offline proof
- bounded research/code/create execution
- source-owned artifacts and trace outputs
- a quick demo of AgenticGraph as a runnable document system

The harness is intentionally project-agnostic. It accepts a user-provided brief, extracts source evidence from neutral frontmatter or markdown body text, selects registry-backed capability lanes and frontmatter skill hints through `skill.select`, writes a research pack, creates and executes deterministic code inside a bounded local sandbox artifact directory, generates deterministic text/image/video artifacts, composes a canvas graph, verifies the run, and writes a final report. The default media provider mode is a bare-minimum BytePlus ModelArk placeholder that records the Codex-facing remote MCP server key without performing a live provider call; deterministic `mock` remains available for local tests.

For research-code-create work, this harness is the local artifact loop and Codex
goal bridge, not a deployed public mutation API. Research and review-heavy
graph work stays with `canvas/src/features/research-agent/researchThesisContract.ts`;
code-oriented work stays with Codex and repo-local validation; created media
artifacts stay with the typed tool registry, Source Files workspace artifacts,
and shared Rich Media Panel owners.

## Native Long-Horizon Contract

| Primitive | AgenticGraph owner | Boundary |
|---|---|---|
| Message gateway | `/goal`, `npm run goal:run`, local MCP `agenticgraph.superagent.run`, MainPanel/FloatingPanel handoff docs | Local/dev only unless a separate deploy proof exists. |
| Memory | `state.json`, `trace.jsonl`, `goal.json`, recovery events, observations, source hashes, review audits | Persist run memory as artifacts; do not create unowned global memory files. |
| Tools | `superagent_tools.py`, local MCP tool contract, Source Files, rich-media runtime, BytePlus ModelArk MCP setup docs | Register typed tools once; do not fork renderer/provider-specific tool stacks. |
| Skills | `skill.select`, current tool registry, optional frontmatter skill hints | Select progressively by task need; do not bulk-copy external skill packs or pin repo-path catalogs. |
| Subagents | Role-scoped `AgentContract` entries for planner, research, code, text, image, video, canvas, verifier, and synthesizer workers | Keep scoped context, tools, completion signal, and artifact responsibility explicit. |
| Sandbox/workspace | Per-run output directory under `data/outputs/*` or caller-provided output path; generated code executes with `python` argv, bounded timeout, and no shell invocation | Keep uploads/workspace/outputs separated; do not hardcode absolute repo paths. |
| Review gate | verifier, proof manifest, final report, research-agent review audit, KGC apply owner | Accepted artifacts and graph candidates only; no unreviewed active-graph mutation. |
| Agentic OS handoff | MCP Agentic OS PRD/TAD, Source Files, run manifests, Canvas dashboard | Planned cross-repo build/control dashboard only; profile and plan consumer repos through allowlisted roots, dry-run first, and require approval before writes, deploys, paid calls, or financial actions. |

## Research-Code-Create Scope

- Research: `research.scout` compiles source refs, source hashes, frontmatter
  evidence, body evidence, and a research-pack markdown/json artifact before
  media or canvas creation.
- Skills: `skill.select` chooses registry-backed capability lanes and optional
  frontmatter skill hints before research/code/create execution and records
  selected-skill markdown/json
  artifacts.
- Code: `code.write_and_run` writes deterministic code into the run artifact
  tree and executes it inside a bounded local sandbox directory, recording the
  code file, stdout/stderr, return code, and sandbox result artifact.
- Create: generate Text, Image, Video, Chart, and Rich Media Panel artifacts
  through the typed local harness and shared media owners. The default
  BytePlus ModelArk mode is a placeholder contract for the operator-selected
  remote MCP server, not a live provider implementation.
- Long horizon: keep every run bounded by explicit step, retry, wall-clock,
  tool, and review limits; resumability is checkpointed through state and trace
  artifacts.
- Task levels: the local harness declares `quick_triage`, `bounded_compile`,
  `deep_research`, and `parallel_build` levels in the proof manifest and
  generated workspace metadata. Those levels describe bounded run depth and
  coordination style; the capabilities remain `research`, `code`, and
  `create`.

## Module Ownership

- `superagent_harness.py`: run loop, state transitions, CLI facade, and public imports.
- `superagent_contracts.py`: dataclasses, error taxonomy, layout constants, registry, and trace writer.
- `superagent_plan.py`: agent contracts, task plan, and goal parsing; current task order is `inspect_goal -> select_skills -> research_goal -> code_sandbox -> generate_text -> generate_image -> generate_video -> compose_canvas -> verify_outputs -> synthesize_report`.
- `superagent_tools.py`: workspace, skill, research, code/sandbox, text, image, video, canvas, and report tools.
- `canvas/src/features/panels/views/byteplusModelArkMcpApiDocs.ts`: BytePlus ModelArk remote MCP setup rows for MainPanel MCP and Integrations, including Codex `mcp add` placeholder command, media profile, `ARK_API_KEY` env naming, and image/audio-for-video/video documentation links.
- `superagent_verifier.py`: deterministic artifact, graph, layout, trace, and provenance checks.
- `superagent_renderers.py`: markdown, SVG, HTML, canvas graph, workspace, and report rendering helpers.
- `superagent_utils.py`: trace reading, payload summaries, run ids, and goal-file loading.

The canvas worker now emits both a standalone graph artifact and a AgenticGraph workspace markdown artifact for the app route:

```text
MainPanel Integrations -> FloatingPanel Chat UI -> Editor Workspace -> Canvas -> Balanced 16:9 (1920x1080) Layout for Widgets (Text, Image, Video) AND Rich Media Panel AND Edges
```

That workspace document uses frontmatter-flow metadata with harness capabilities plus `TextGeneration`, `ImageGeneration`, `VideoGeneration`, and `RichMediaPanel` nodes, while the proof graph records `SkillSelector`, `ResearchAgent`, and `CodeWorker` lanes. The workspace artifact keeps canonical widget form ids, port handles, mobile-first responsive proof metadata, balanced 16:9 layout metadata, and edge route hints required by the editor widget surface and the Rich Media Panel render surface.

## Runtime Concepts

- `Goal`: parsed from the `/goal` file into intent, constraints, output contract, quality bar, and stop rules.
- `Run`: persisted in `state.json` with status, timestamps, budget, active plan, completed tasks, verification, and artifacts.
- `Step`: every task attempt is recorded with input summary, output summary, status, and error metadata.
- `Tool`: registered with required inputs, timeout metadata, retryability, and structured observations.
- `Agent`: each task is assigned to a role such as planner, research worker, code worker, text worker, image worker, video worker, canvas worker, verifier, or synthesizer.
- `Artifact`: brief, skill, research, code, sandbox, text, image, video, canvas, workspace, trace, proof, and report files are recorded with source step provenance.
- `Judge`: deterministic validation checks artifact existence, graph topology, trace completeness, and provenance.
- `Recovery`: retryable errors are bounded, logged as `recovery.retry`, and checkpointed.

## Outputs

A completed run writes:

- `state.json`
- `trace.jsonl`
- `goal.json`
- `final-report.md`
- `harness-proof.json`
- `artifacts/input/brief.md`
- `artifacts/skills/selected-skills.json`
- `artifacts/skills/selected-skills.md`
- `artifacts/research/research-pack.json`
- `artifacts/research/research-pack.md`
- `artifacts/code/generated_summary.py`
- `artifacts/sandbox/sandbox-result.json`
- `artifacts/text/scene-plan.md`
- `artifacts/image/reference-frame.svg`
- `artifacts/video/storyboard-video.html`
- `artifacts/canvas/canvas.graph.json`
- `artifacts/canvas/canvas-preview.html`
- `artifacts/responsive/responsive-proof.json`
- `artifacts/workspace/rich-media-flow.md`

## Resume And Recovery

Checkpoint a run:

```bash
python3 -m agenticgraph_parser superagent --input docs/documents/my-input.md --output-dir data/outputs/superagent-checkpoint --run-id superagent-checkpoint --stop-after-step 2
```

Resume it:

```bash
python3 -m agenticgraph_parser superagent --resume --output-dir data/outputs/superagent-checkpoint
```

Exercise bounded recovery:

```bash
python3 -m agenticgraph_parser superagent --input docs/documents/my-input.md --output-dir data/outputs/superagent-retry --run-id superagent-retry --fail-once video.generate.byteplus_modelark_placeholder
```

## Codex And MCP

Codex can run the harness directly from `/goal` using `superagent` or the equivalent `run-goal` CLI alias. The local setup guide is [agenticgraph-codex-goal-setup.md](agenticgraph-codex-goal-setup.md), and the repo-owned goal loop is also available as `npm run goal:run`.

For BytePlus media generation, Codex should use the MainPanel MCP or Integrations row `byteplusModelArkMcp.remote_config.codex`. The row emits `codex mcp add byteplus-modelark-media --url '<REMOTE_MCP_STREAMABLE_HTTP_URL>'`; the URL comes from the operator-selected BytePlus cloud-deployed MCP or remote MCP details page, while `ARK_API_KEY` stays in the MCP host environment. The harness default records that placeholder server key in generated video metadata and keeps the provider call unexecuted until an operator supplies the remote MCP endpoint.

MCP clients can call `agenticgraph.superagent.run`, which wraps the same command and returns the trace, state, report, canvas artifact paths, and workspace frontmatter-flow artifact. The local stdio MCP tool contract is owned upstream by [local-tool-contract.js](../../mcp/local-tool-contract.js); usage and surface boundaries live in [README.md](../../mcp/README.md), [agenticgraph-mcp-service-prd-tad.companion.md](agenticgraph-mcp/agenticgraph-mcp-service-prd-tad.companion.md), and the planned Agentic OS dashboard contract in [agenticgraph-mcp-agentic-os-prd-tad.md](agenticgraph-mcp/agenticgraph-mcp-agentic-os-prd-tad.md).

Baseline validation remains offline and deterministic for `byteplus-modelark` placeholder and `mock` runs. The static responsive proof still covers `320x640`, `390x844`, `768x1024`, `1366x768`, and `1920x1080` classes before browser-specific smoke checks are layered on top.
