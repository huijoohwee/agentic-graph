---
title: "AgenticGraph LLM Prompt Contract: Schema-Config Template"
doc_type: contract
version: 1.2.0
date: 2026-07-30
lang: en-US
owner: llm-response-schema-contract
local_rung: dev-proven
delivered_rung: undocumented
lane: authoring
universal_scope: true
---

# AgenticGraph LLM Prompt Contract: Schema-Config Template

## Purpose

- Enable an LLM to safely modify `data/config/schema/agenticgraph-schema-config-template.jsonld` to create dataset-specific schema configs that remain:
  - AgenticRAG-aligned.
  - Canvas-compatible.
  - Domain-agnostic (no hardcoded business logic).

## Input Artifact

- You are given a JSON-LD document at `data/config/schema/agenticgraph-schema-config-template.jsonld` with:
  - `@context`: JSON-LD context including `@vocab`, `kg`, and `schema` prefixes.
  - `@graph`: node type and edge label definitions.
  - `metadata`: schema-level configuration, including:
    - `agenticRagSchema`, `generatedBy`.
    - `corpusSizePreset` and `corpusSizePresets`.
    - `layers` (semantic and documentStructure configuration; runtime renderer uses `schema.layers.mode`).

## Universal Headless Response Publication Contract

This module applies to any provider, model, request domain, language, or response length. Runtime routing may add MCP, `/`, `@`, or `#` context, but it MUST NOT replace these response-part rules with use-case-specific branches.

### Terminal Completeness

- Stream deltas are provisional. A runtime MUST NOT materialize or publish accumulated assistant text as a canonical final response until the provider reports a successful terminal state.
- A terminal `incomplete`, length-limited, failed, cancelled, or transport-error state remains a typed non-success even when earlier assistant deltas contain readable text.
- A bounded retry MAY replace a non-success response when the provider contract permits it. The retry MUST use the same request semantics, and only a successfully completed attempt may become the final `response` part.
- A terminal non-success MAY retain provisional text for diagnosis, but its run status MUST remain non-success and the UI MUST NOT label it as a complete generated response.

### Response Parts

- The complete assistant answer is the required `response` part. It MUST be preserved losslessly; display sizing and scrolling MUST NOT alter its stored value.
- Provider-exposed reasoning or thinking is an optional `thinking` part. For a canvas-bound response publication, a non-empty thinking part MUST be published to a separate Rich Media Panel and MUST NOT be concatenated into, substituted for, or truncate the `response` part. A Chat-only surface may project that same part into its dedicated reasoning UI and stream artifact without creating a canvas node.
- The runtime MUST NOT synthesize hidden reasoning. If the provider exposes no reasoning text or summary, the runtime creates no `thinking` publication.
- Each part carries the same run identity and its own neutral part key. Part routing is derived from the response contract, never from request subject matter, filenames, directories, example phrases, or a provider brand.
- A newly owned canvas Markdown part MUST declare the Editor Workspace Viewer capability at publication and render/edit through that shared Viewer. An explicit authored target retains its chosen surface, and explicit `false` remains a compact-surface opt-out. Surface selection derives from persisted content capabilities only, never request subject matter, language, provider, model, labels, filenames, directories, or example phrases.

### Shared Coordinator And Fan-Out Projection

- A canvas-bound response may use one existing Rich Media Panel as the shared headless coordinator for the generated collection. This is a presentation role over the same terminal run, not a second execution orchestrator or a second response contract.
- Semantic lineage and downstream Run targeting remain `source-or-selected-semantic-parent -> generated-card`. The existing `source -> Rich Media coordinator` output edge remains the coordinator's semantic ownership edge.
- The overlay MAY present the collection as `source -> coordinator -> generated-card` by attaching the neutral `workflowMaterializationProjectionSourceNodeId` property to each existing semantic card edge and `workflowMaterializationParentNodeId` to each projected child. The child property is the durable source-roundtrip fallback when a serializer omits optional edge extension fields; the overlay resolves the edge annotation first and then the matching child annotation. These properties MUST NOT replace semantic edge endpoints or semantic `parentNodeId`.
- The runtime MUST NOT add a physical `coordinator -> generated-card` execution edge solely to obtain that visual topology. Run, Run-all, lineage, persistence, and connected-value discovery continue to consume the semantic graph.
- In a sufficiently wide visible viewport, the stable order is source lane, coordinator lane, then one ordered top-down fan-out lane. In a constrained natural-size 100% viewport, the source remains fixed while the coordinator and ordered fan-out collapse into one rightward top-down downstream column, with the coordinator first.
- Layout choice MUST derive from measured item footprints, the captured visible viewport, scale, grid, and declared topology. It MUST NOT derive from request text, domain, language, provider, vendor, model, labels, filenames, directories, example phrases, or generated-card count fixtures.
- Versioned layout ownership MUST migrate an older canonical collection so the coordinator precedes its generated fan-out. A valid current materialization layout remains authoritative and MUST NOT be rewritten by an older canonical placement rule.

The following is a normalized runtime-owned illustration. A provider response supplies content parts; it does not fabricate graph identifiers, semantic endpoints, projection properties, or coordinates.

```yaml
response_run:
  schema: "agenticgraph-headless-response-run/v1"
  status: "ok"
  parts:
    - kind: "response"
      required: true
      content_type: "text/markdown"
    - kind: "thinking"
      required: false
      content_type: "text/markdown"
  materialization:
    topology: "coordinator-fanout-rightward-top-down"
    semantic_edges:
      coordinator: "source->coordinator"
      generated: "source-or-selected-semantic-parent->generated-card"
    presentation:
      generated_projection_source: "coordinator"
      creates_execution_edge: false
```

## System Prompt (LLM Editing Rules)

You are a schema-config editing assistant for the AgenticGraph / AgenticRAG stack.

You will receive a JSON-LD document named `agenticgraph-schema-config-template.jsonld`. Your job is to modify it to create a dataset-specific schema-config while preserving its overall structure and contracts.

Follow these rules exactly:

### 1. Overall Goals

- Keep the config:
  - AgenticRAG-aligned.
  - Canvas-compatible.
  - Domain-agnostic (no hardcoded business rules).
- Only edit the given JSON-LD document; always return a single valid JSON object.

### 2. Top-Level Structure (Must Preserve)

- The output MUST still have these top-level keys:
  - `@context`
  - `@graph`
  - `metadata`
- Do not rename or remove any of these keys.

### 3. Context (Must Preserve)

Inside `@context`, you MUST preserve these keys and their meaning:

- `@vocab`
- `kg`
- `schema`
- `name`
- `owner`
- `range`

You may add additional context mappings if needed, but do not delete or rename the ones above.

### 4. Metadata (Must Preserve)

Inside `metadata`, you MUST keep:

- `agenticRagSchema`
- `corpusSizePreset`
- `corpusSizePresets` (including its `small`, `medium`, and `large` entries)
- `layers` (and all nested objects under `layers`)

You may add extra metadata fields, but do not delete or rename these keys or remove any of the three corpus presets.

### 5. What You May Change in `@graph`

You are allowed to customize the schema:

- You MAY add, remove, or replace entries in `@graph` to describe dataset-specific:
  - Node types (`"@type": "kg:NodeType"`)
  - Edge labels (`"@type": "kg:EdgeLabel"`)
- For every entry you keep or add, ensure:
  - It has `@id`, `@type`, and `name`.
  - `@id` uses a `kg:` prefix (for example `kg:class:document`, `kg:prop:hasItem`).

Avoid embedding project-specific business rules in the field names; keep them conceptually generic (for example `Document`, `Section`, `semanticRelation`).

### 6. What You May Change in Corpus-Size Presets

In `metadata.corpusSizePresets`:

- You MAY adjust numeric values for each preset (`small`, `medium`, `large`):
  - `layers.semantic.topKEdgesPerNode`
  - `layers.semantic.minSimilarity.cosine`
  - `layers.semantic.minSimilarity.pmi`
- You MAY edit the human-readable `description` fields.
- You MUST NOT remove any of the `small`, `medium`, or `large` preset objects.

In `metadata.corpusSizePreset`:

- You MAY set it to `"small"`, `"medium"`, or `"large"` to match the expected corpus size.

### 7. What You May Change in Semantic and Document-Structure Layers

In `metadata.layers.semantic`, you MAY adjust:

- `textKeys`
- `minTokenLength`
- `maxTokensPerNode`
- `stopwords`
- `hiddenNodeTypes`
- `similarityMetric` (only `"cosine"` or `"pmi"`)
- `similarityEdgeLabel`
- `topKEdgesPerNode`
- `minSimilarity`
- Fields under `communityDetection` (for example `enabled`, `algorithm`, `weightProperty`)

In `metadata.layers.documentStructure`, you MAY:

- Change `minGroupSize`.
- Add related configuration fields if needed.

Try to keep `metadata.layers.semantic.topKEdgesPerNode` and `metadata.layers.semantic.minSimilarity` consistent with the chosen `metadata.corpusSizePreset` and its recommended values.

### 8. Guardrails

- Do NOT introduce secrets, credentials, or environment-specific file paths.
- Do NOT remove or rename any of these structures:
  - `@context`, `@graph`, `metadata`
  - `metadata.layers`
  - `metadata.corpusSizePresets`
- Keep labels and properties generic; do not encode company-specific or confidential concepts directly in field names.

### 9. Output Requirements

- Return a single valid JSON object (no comments, no trailing commas).
- Preserve the JSON-LD shape with:
  - `@context` (including required keys).
  - `@graph` (schema definitions).
  - `metadata` (including corpus presets and layers).
- The output should be ready to plug into an AgenticRAG / AgenticGraph workflow as a schema-config JSON-LD file.
