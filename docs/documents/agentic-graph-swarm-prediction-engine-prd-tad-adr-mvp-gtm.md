---
title: "agentic-graph Swarm Prediction Engine PRD-TAD-ADR-MVP-GTM"
schema: agentic-os-computing-flow/v1
doc_id: agentic-graph-swarm-prediction-engine-
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.1.1"
status: dev-source-implemented-no-deploy
updated: 2026-06-04
tags: [swarm-intelligence, prediction-engine, storyboard-widget, computing-flow, rich-media, prd, tad]
date: "2026-09-12"
lang: "en-US"
owner: "Product maintainers"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-SWARM-PREDICTION-ENGINE-PRD-TAD-ADR-MVP-GTM"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.1.0"
prd_revision: "0.1.1"
tad_revision: "0.1.1"
adr_revision: "0.1.1"
mvp_revision: "0.1.1"
gtm_revision: "0.1.1"
---

# agentic-graph Swarm Prediction Engine PRD-TAD-ADR-MVP-GTM

## Purpose

This document is the Dev-source contract for agentic-graph's deterministic swarm
prediction baseline. The feature converts seed signals, optional agent
population records, optional interventions, and a bounded tick count into:

- a versioned scenario/run result
- agent state with persona-like cohort, policy weights, confidence, and memory
- append-only replayable events
- per-tick world state and metrics
- a text report, chart image, and HTML `outputSrcDoc` suitable for Rich Media
  Panel rendering

The external [666ghj/MiroFish](https://github.com/666ghj/MiroFish) repository is
allowed only as high-level conceptual inspiration for swarm simulation and
prediction-report framing. agentic-graph must not copy MiroFish code, structure,
phrasing, assets, prompts, fixtures, or repository-specific naming into the app.

## Implemented Owners

| Capability | Owner | Proof |
|---|---|---|
| Deterministic simulation engine | `canvas/src/features/swarm-prediction/swarmPredictionEngine.ts` | `swarmPredictionEngine.test.ts` proves stable replay from the same seed, bounded ticks/agents/signals/interventions, unique event ids, world states, metrics, and rich-media outputs. |
| Rich media report rendering | `canvas/src/features/swarm-prediction/swarmPredictionRender.ts` | The same focused test verifies text output, inline SVG chart HTML, and `data:image/svg+xml` chart output. |
| Storyboard Widget contract | `canvas/src/features/swarm-prediction/swarmPredictionWidget.ts` plus `canvas/src/features/storyboard-widget-manager/registryTemplates.ts` | Canonical registry draft exposes schema paths for seed JSON, agent JSON, interventions JSON, output text, `outputSrcDoc`, image chart, event log, and metrics. |
| Storyboard Widget run action | `canvas/src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetWorkflowActions.ts` | `SwarmPrediction` run action reads shared connected values, calls the offline widget runner, and writes output fields back through the central workflow output owner. |
| Shared identity | `canvas/src/lib/graph/semanticKey.ts` | Engine ids are derived through `buildScopedGraphSemanticKey()` instead of feature-local hash literals. |
| Storyboard Widget constants | `canvas/src/lib/config.storyboard-widget.ts` | `SwarmPrediction` has one canonical node type, label, form id, and widget type id. |

## Product Contract

### User Flow

1. User creates or imports a Storyboard Widget computing-flow document.
2. User adds a `SwarmPrediction` node from the widget registry.
3. User supplies seed signals as JSON, and optionally supplies agent population
   and intervention JSON.
4. User runs the node or a headless harness using the same properties.
5. Storyboard Widget shows text output, a chart image, and an HTML chart/report panel
   through ordinary Rich Media Panel schema paths.

### Data Flow

```text
scenarioTitle + seedSignalsJson + agentPopulationJson + interventionsJson
  -> runSwarmPredictionEngine()
  -> schema_version: agentic-graph-swarm-prediction/v1
  -> agents[] + world_states[] + events[] + metrics
  -> properties.output + properties.outputSrcDoc + properties.imageUrl
  -> Rich Media Panel / Storyboard Widget connected-value rendering
```

The engine is offline and deterministic. It does not call a provider, mutate the
active graph, write Source Files, or depend on deployment state. Downstream graph
mutation remains a separate review/apply concern.

### Markdown Artifact Boundary

SwarmPrediction demos and templates are frontmatter-first Storyboard Widget documents. Renderer presets, `socket_types`, workflow sections, node fields, output fields, and edges belong in the opening YAML frontmatter block. Body Markdown can explain the scenario, metrics, validation, and inspection steps, but it must not define a second simulator graph, body `flow:` mirror, `## AGENTIC_OS Reading Layer`, or line-start `@node:` / `@edge:` layer.

When a normalized fixture needs concise machine-readable node summaries, store them on the owning frontmatter node as `agentic-os:readingSummary`. Keep event logs, metrics, text, image, and chart outputs as normal node properties.

### Work Flow

- Input normalization clamps the configured caps before simulation starts.
- Agent state includes cohort, belief, confidence, influence, risk tolerance,
  and bounded memory.
- Each tick applies active interventions, updates agent beliefs using seed
  signal pressure, peer delta, policy weights, and controlled seeded noise, then
  appends event records.
- World state records mean belief, consensus, confidence, volatility, prediction
  score, and active interventions.
- The loop stops at convergence or the configured tick cap.

## Technical Guardrails

- No code, prompt text, asset, fixture, or structural copy from MiroFish.
- No provider-specific renderer branch.
- No file-name, repo-name, URL, or published-domain hardcoding.
- No downstream alias/remap stack for Storyboard Widget schema paths.
- No renderer-local recomputation; outputs are normal node properties and the
  existing connected-value/Rich Media Panel owners consume them.
- No infinite loops; max ticks, agents, signals, interventions, memory, and
  convergence are bounded before execution.
- No graph mutation during prediction; event logs and reports are outputs only.

## Storyboard Widget Template Shape

```yaml
flow:
  nodes:
    - id: swarm_prediction
      type: SwarmPrediction
      label: Swarm Prediction Engine
      properties:
        scenarioTitle: "Regional demand shock response"
        seedSignalsJson: |
          [
            {"label":"Supply recovery is improving","valence":0.42,"weight":0.7},
            {"label":"Demand remains uncertain","valence":-0.28,"weight":0.9}
          ]
        ticks: 6
        randomSeed: "demo-seed"
```

The corresponding widget registry entry must expose plain schema paths:

- `properties.seedSignalsJson`
- `properties.agentPopulationJson`
- `properties.interventionsJson`
- `properties.output`
- `properties.outputSrcDoc`
- `properties.imageUrl`
- `properties.eventLogJson`
- `properties.metricsJson`

## Validation

Focused Dev validation:

```bash
cd canvas
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs src/tests/runExport.ts src/__tests__/swarmPredictionEngine.test.ts testSwarmPredictionEngineProducesDeterministicReplayableReport
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs src/tests/runExport.ts src/__tests__/swarmPredictionEngine.test.ts testSwarmPredictionEngineBoundsPreventUnboundedRuns
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs src/tests/runExport.ts src/__tests__/swarmPredictionEngine.test.ts testSwarmPredictionWidgetRegistryExposesRichMediaOutputs
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs src/tests/runExport.ts src/__tests__/swarmPredictionEngine.test.ts testSwarmPredictionEngineUsesSharedSemanticKeyAndNoCopiedMirofishSurface
node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs src/tests/runExport.ts src/__tests__/swarmPredictionEngine.test.ts testSwarmPredictionWorkflowRunnerUsesSharedConnectedValues
```

Pass criteria:

- same seed and scenario replay the same event log and metrics
- caps prevent unbounded runs
- widget registry exposes rich-media-compatible output ports
- Storyboard Widget run action uses shared connected values and the offline widget
  runner
- source code reuses shared semantic-key helper and contains no copied MiroFish
  surface tokens

## ADR: retain the offline engine and frontmatter graph authority

Keep prediction deterministic and offline, route widget results through the central workflow output owner, and derive identity with the shared semantic-key helper. A copied external simulator or second body-defined graph would duplicate runtime and document authority. Frontmatter owns graph structure; body Markdown explains and validates it. Provider execution and independent predictive accuracy remain outside this implementation evidence.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-SWARM-PREDICTION-ENGINE-PRD-TAD-ADR-MVP-GTM@0.1.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Product Contract](agentic-graph-swarm-prediction-engine-prd-tad-adr-mvp-gtm.md#product-contract) |
| TAD | [Technical Guardrails](agentic-graph-swarm-prediction-engine-prd-tad-adr-mvp-gtm.md#technical-guardrails) |
| ADR | [ADR: retain the offline engine and frontmatter graph authority](agentic-graph-swarm-prediction-engine-prd-tad-adr-mvp-gtm.md#adr-retain-the-offline-engine-and-frontmatter-graph-authority) |
| MVP | [MVP — reference implementation](agentic-graph-swarm-prediction-engine-prd-tad-adr-mvp-gtm.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-swarm-prediction-engine-prd-tad-adr-mvp-gtm.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/features/swarm-prediction/swarmPredictionEngine.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/swarm-prediction/swarmPredictionEngine.ts), [`canvas/src/features/swarm-prediction/swarmPredictionRender.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/swarm-prediction/swarmPredictionRender.ts), [`canvas/src/features/swarm-prediction/swarmPredictionWidget.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/swarm-prediction/swarmPredictionWidget.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
