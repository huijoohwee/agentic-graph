---
schema: kgc-computing-flow/v1
doc_id: agenticgraph-swarm-prediction-engine-prd-tad
doc_type: prd-tad
version: 0.1.0
status: dev-source-implemented-no-deploy
updated: 2026-06-04
tags: [swarm-intelligence, prediction-engine, storyboard-widget, computing-flow, rich-media, prd, tad]
---

# AgenticGraph Swarm Prediction Engine PRD/TAD

## Purpose

This document is the Dev-source contract for AgenticGraph's deterministic swarm
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
prediction-report framing. AgenticGraph must not copy MiroFish code, structure,
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
  -> schema_version: agenticgraph-swarm-prediction/v1
  -> agents[] + world_states[] + events[] + metrics
  -> properties.output + properties.outputSrcDoc + properties.imageUrl
  -> Rich Media Panel / Storyboard Widget connected-value rendering
```

The engine is offline and deterministic. It does not call a provider, mutate the
active graph, write Source Files, or depend on deployment state. Downstream graph
mutation remains a separate review/apply concern.

### Markdown Artifact Boundary

SwarmPrediction demos and templates are frontmatter-first Storyboard Widget documents. Renderer presets, `socket_types`, workflow sections, node fields, output fields, and edges belong in the opening YAML frontmatter block. Body Markdown can explain the scenario, metrics, validation, and inspection steps, but it must not define a second simulator graph, body `flow:` mirror, `## KGC Reading Layer`, or line-start `@node:` / `@edge:` layer.

When a normalized fixture needs concise machine-readable node summaries, store them on the owning frontmatter node as `kgc:readingSummary`. Keep event logs, metrics, text, image, and chart outputs as normal node properties.

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
