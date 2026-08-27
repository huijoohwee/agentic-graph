---
title: "AgenticGraph Visual Annotation Engine — Requirements"
id: "spec:agenticgraph-visual-annotation-engine"
author: "airvio / joohwee"
date: "2026-06-25"
version: "0.1.0"
status: "draft"
doc_type: "requirements"
lang: "en-US"
domain: "agenticgraph"
spec_type: "feature"
workflow_type: "requirements-first"
orientation:
  - "solo-dev"
  - "AI-native"
  - "min-viable-max-value"
  - "TCO-zero"
  - "FOSS-first"
  - "token-economical"
  - "harness-first"
constraints:
  - "universal"
  - "neutral"
  - "agnostic"
  - "modular"
  - "hackathon-180min"
  - "spec-complete to runtime-ready"
  - "FORBID edit codebase / deploy to Prod / Cloudflare until user instructs"
  - "no hardcoded model names, IDs, routes, or API keys in repo"
  - "no downstream local patch stacks"
  - "no backfill, churn, conflict, duplicate, freeze, or stale"
  - "in-browser ML inference preferred; zero-cost inference path required"
  - "reuse shared heuristics / semantic-key helpers / rich-media pipeline / MCP surface"
  - "FOSS-first: Transformers.js + Florence-2-base or equivalent zero-TCO model"
traceability:
  repo_dev: "$GITHUB_ROOT/agenticgraph"
  spec_path: ".kiro/specs/agenticgraph-visual-annotation-engine/requirements.md"
  feature_surface: "Visual Annotation Engine — image/video annotation with semantic labels and LLM-ready structured output"
  model_reference: "https://huggingface.co/microsoft/Florence-2-base"
  runtime_reference: "https://github.com/huggingface/transformers.js/"
---

# Requirements Document

## Introduction

`agenticgraph-visual-annotation-engine` embeds image and video annotation directly into the
agenticgraph canvas. Users drop an image or video asset onto the canvas (or select an existing
node); the engine runs in-browser ML inference using Transformers.js with the
`microsoft/Florence-2-base` vision model (or an equivalent zero-TCO FOSS model) to produce
semantic labels, region bounding boxes, captions, and dense captions — all serialised as
LLM-ready structured JSON and materialised on the canvas graph.

The feature runs entirely in the browser (zero server-side inference cost, zero egress, zero
API key required for core annotation). It surfaces as an MCP tool
(`agenticgraph.annotate.image` and `agenticgraph.annotate.video_frame`) so agents can invoke it
programmatically, and as a Storyboard Widget node type
(`FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID`) so users can wire it into compute pipelines.

All outputs are embeddings-friendly: the structured JSON schema is designed to be passed
directly to an LLM context window or chunked into a vector store without transformation.

**Hackathon scope (180 min, solo dev):** the MVP focuses on image annotation with
Florence-2-base via Transformers.js running in a Web Worker, producing structured JSON output,
and materialising the result as a canvas node. Video frame annotation is specified but
deferred to a post-hackathon phase.

**Design principles:**
- Zero-TCO inference — Transformers.js WASM/WebGPU, model cached in browser IndexedDB
- Fail-fast structured errors — every failure returns `{ ok: false, errorCode, ... }`
- Reuse over rebuild — rich-media artifact pipeline, semantic key helper, MCP surface, Flow
  Editor node pattern all reuse existing owners unchanged
- LLM-ready output first — annotation JSON schema is the primary deliverable; rendering is
  secondary
- FOSS-first — Florence-2-base (MIT), Transformers.js (Apache 2.0); no paid inference API


## Glossary

- **Visual_Annotation_Engine**: The agenticgraph feature that accepts an image or video-frame
  asset, runs in-browser ML inference, and produces a structured Annotation_Result for
  materialisation on the canvas graph.
- **Annotation_Spec**: A typed, serialisable value object containing `assetUrl` (string,
  non-empty), `assetType` (`"image"` or `"video_frame"`), `tasks` (array of
  Annotation_Task values), and optional `modelHint` (string, max 255 chars) and
  `frameTimestampMs` (integer ≥ 0, required when `assetType` is `"video_frame"`).
- **Annotation_Task**: A named inference task supported by the active vision model. Valid
  values for Florence-2-base: `"caption"`, `"detailed_caption"`, `"more_detailed_caption"`,
  `"object_detection"`, `"dense_region_caption"`, `"ocr"`. Extensible via
  `ANNOTATION_TASK_IDS` frozen object.
- **Annotation_Result**: The structured JSON object produced by the Visual_Annotation_Engine
  for a single Annotation_Spec. Contains `ok: true`, `annotationId` (semantic key),
  `assetUrl`, `assetType`, `modelId`, `tasks` (object mapping task name → task output),
  `processedAt` (ISO-8601), `durationMs` (integer), and `schemaVersion`
  (`"agenticgraph-annotation/v1"`).
- **Annotation_Task_Output**: The per-task result within an Annotation_Result. Shape varies
  by task: caption tasks produce `{ text: string }`; object detection produces
  `{ objects: Array<{ label: string, bbox: [x, y, w, h], confidence?: number }> }`; dense
  caption produces `{ regions: Array<{ label: string, bbox: [x, y, w, h] }> }`; OCR produces
  `{ text: string, blocks?: Array<{ text: string, bbox: [x, y, w, h] }> }`.
- **Annotation_Worker**: The browser Web Worker that loads the Transformers.js pipeline and
  runs inference off the main thread. Communicates via `postMessage` with typed request/
  response envelopes. One worker instance is reused per session.
- **Model_Registry**: The runtime-configurable map of `modelId → model configuration`.
  Populated from `ANNOTATION_MODEL_IDS` frozen object. No model is hard-registered by
  URL in the orchestrator; URLs live in the model configuration object.
- **Annotation_Canvas_Node**: The canvas graph node created or updated when an
  Annotation_Result is written. Contains `kind: "annotation"`, the full Annotation_Result
  JSON, and a `semanticKey` derived from the asset URL and task set.
- **LLM_Ready_Payload**: The flattened JSON representation of an Annotation_Result suitable
  for direct injection into an LLM prompt or vector-store chunk. Contains only the `tasks`
  map, `assetUrl`, `modelId`, and `schemaVersion`.
- **Annotation_Flow_Node**: The Storyboard Widget node type registered under
  `FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID`. Follows the same pattern as
  `FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID`.
- **MCP_Annotate_Image_Tool**: The local MCP tool registered as `agenticgraph.annotate.image`.
- **MCP_Annotate_Video_Frame_Tool**: The local MCP tool registered as
  `agenticgraph.annotate.video_frame`.
- **KGC**: AgenticGraph Canvas — the canvas graph apply path (`chatKgcCanvasApply.ts`).
- **MCP**: Model Context Protocol.
- **Semantic_Key**: A scoped, deterministic identifier built with
  `buildScopedGraphSemanticKey()`; never a hardcoded literal.


## Requirements

---

### Requirement 1: Annotation Spec Contract

**User Story:** As a coding agent or canvas user, I want a typed, self-contained
Annotation_Spec contract so that I can describe an annotation job without embedding model
assumptions or hardcoded values.

#### Acceptance Criteria

1. THE Visual_Annotation_Engine SHALL define an Annotation_Spec schema with required fields
   `assetUrl` (non-empty string, max 2048 chars), `assetType` (one of `"image"` or
   `"video_frame"`), and `tasks` (non-empty array of Annotation_Task strings, max 6
   entries); and optional fields `modelHint` (string, max 255 chars) and
   `frameTimestampMs` (integer ≥ 0).
2. WHEN `assetType` is `"video_frame"`, THE Visual_Annotation_Engine SHALL require
   `frameTimestampMs` to be present and ≥ 0; IF `frameTimestampMs` is absent or negative,
   THEN THE Visual_Annotation_Engine SHALL reject the spec with a structured error naming
   the field and reason without initiating inference.
3. IF an Annotation_Spec has multiple simultaneously invalid fields, THEN THE
   Visual_Annotation_Engine SHALL return `{ ok: false, errorCode: "invalid_spec",
   field: <first-invalid-field-name>, reason: <description> }` reporting the first
   validation failure encountered in field order (`assetUrl`, `assetType`, `tasks`,
   `modelHint`, `frameTimestampMs`) without invoking the Annotation_Worker.
4. THE Annotation_Spec schema SHALL NOT include hardcoded model names, URLs, IDs, routes,
   or API keys.
5. WHEN a valid Annotation_Spec is passed to the Annotation_Worker, THE
   Visual_Annotation_Engine SHALL deliver the spec fields unchanged — `assetUrl`,
   `assetType`, and `tasks` SHALL equal the input values without transformation.
6. THE `tasks` field SHALL accept only values present as values in the `ANNOTATION_TASK_IDS`
   frozen object; IF any task string is not in `ANNOTATION_TASK_IDS`, THEN THE
   Visual_Annotation_Engine SHALL reject the spec with a structured error naming the
   unrecognised task value.


---

### Requirement 2: Pluggable Vision Model Registry

**User Story:** As an operator, I want to select the vision model at runtime via config or
`modelHint`, so that the model is never hardcoded and can be swapped without touching source
code.

#### Acceptance Criteria

1. THE Model_Registry SHALL be populated exclusively from `ANNOTATION_MODEL_IDS` frozen
   object entries; no model URL or identifier is hard-registered inside the orchestrator or
   worker dispatch logic. A model identifier is "registered" if and only if it equals a
   value in `ANNOTATION_MODEL_IDS`.
2. THE Visual_Annotation_Engine SHALL resolve the active model identifier from the
   `AGENTICGRAPH_ANNOTATION_MODEL` environment variable at invocation time; it SHALL NOT cache
   the resolved value across invocations.
3. WHEN a `modelHint` that is present and contains at least one non-whitespace character is
   provided in the Annotation_Spec, THE Visual_Annotation_Engine SHALL use that hint as the
   model identifier, overriding `AGENTICGRAPH_ANNOTATION_MODEL`; IF the hint value does not
   equal any value in `ANNOTATION_MODEL_IDS`, THEN THE Visual_Annotation_Engine SHALL
   return `{ ok: false, errorCode: "model_not_configured", modelId: <hint value> }`.
4. IF `AGENTICGRAPH_ANNOTATION_MODEL` is absent, empty, or its value does not equal any value
   in `ANNOTATION_MODEL_IDS`, AND no valid `modelHint` is provided, THEN THE
   Visual_Annotation_Engine SHALL fall back to `ANNOTATION_MODEL_IDS.florence2Base` as the
   resolved model identifier and SHALL include that resolved identifier in the
   Annotation_Result `modelId` field so callers can observe the fallback.
5. THE `ANNOTATION_MODEL_IDS` frozen object SHALL include at minimum one entry:
   `florence2Base` with value `"microsoft/Florence-2-base"`.
6. THE Visual_Annotation_Engine SHALL support adding new model entries solely by adding a
   key–value pair to `ANNOTATION_MODEL_IDS`; no other source file SHALL need modification
   to enumerate model names.
7. WHERE the WebGPU API is present in the browser environment AND adapter acquisition via
   `navigator.gpu.requestAdapter()` succeeds, THE Annotation_Worker SHALL use WebGPU as the
   inference backend; IF the WebGPU API is absent or adapter acquisition fails, THE
   Annotation_Worker SHALL fall back to WASM without surfacing the backend selection to the
   caller.
8. IF `modelHint` is present but consists entirely of whitespace characters, THE
   Visual_Annotation_Engine SHALL treat it as absent and proceed with
   `AGENTICGRAPH_ANNOTATION_MODEL` resolution as per criterion 4.


---

### Requirement 3: In-Browser Inference and Annotation Result

**User Story:** As a canvas user or coding agent, I want the annotation engine to run
in-browser and return a structured Annotation_Result so that inference is zero-cost and
the output is immediately usable by LLMs and vector stores.

#### Acceptance Criteria

1. THE Visual_Annotation_Engine SHALL execute all inference inside an Annotation_Worker
   (browser Web Worker) so that the main thread remains unblocked during model loading and
   inference.
2. WHEN model weights for the resolved modelId are not present in browser cache, THE
   Annotation_Worker SHALL download them from the Hugging Face Hub (or configured CDN),
   cache them in browser storage (IndexedDB / Cache API), and emit a
   `{ type: "progress", loaded: number, total: number }` message to the caller for each
   progress update.
3. WHEN model weights are already cached, THE Annotation_Worker SHALL load the model
   directly from cache without a network request; the caller SHALL receive no progress
   messages and inference SHALL begin immediately.
4. WHEN a valid Annotation_Spec is received by the Annotation_Worker and inference
   completes, THE Visual_Annotation_Engine SHALL return an Annotation_Result with:
   `ok: true`, `annotationId` (non-empty semantic key string), `assetUrl` matching the
   input, `assetType` matching the input, `modelId` (the resolved model identifier),
   `tasks` (object with one key per requested task, each containing an
   Annotation_Task_Output), `processedAt` (ISO-8601 timestamp), `durationMs`
   (positive integer), and `schemaVersion: "agenticgraph-annotation/v1"`.
5. IF inference fails for any reason (model load error, out-of-memory, inference timeout
   after 120 seconds, invalid asset), THEN THE Visual_Annotation_Engine SHALL return
   `{ ok: false, errorCode: "inference_failed", modelId, reason: <message> }` without
   propagating an uncaught exception. An inference timeout SHALL use `reason:
   "inference_timeout"`.
6. WHEN one or more tasks in the Annotation_Spec complete successfully but one or more
   tasks fail individually, THE Visual_Annotation_Engine SHALL return `ok: true` with the
   `tasks` object containing both successful Annotation_Task_Output entries and
   `{ error: <string> }` entries for failed tasks; `ok: false` SHALL only be returned
   when inference cannot produce any task output at all.
7. WHEN a caption task (`"caption"`, `"detailed_caption"`, or `"more_detailed_caption"`)
   is requested, THE Annotation_Result SHALL include a non-empty `text` string under that
   task key.
8. WHEN `"object_detection"` is requested, THE Annotation_Result SHALL include an `objects`
   array where each entry has `label` (non-empty string) and `bbox` ([x, y, w, h] integers ≥ 0).
9. THE `annotationId` SHALL be built with `buildScopedGraphSemanticKey("annotation",
   { assetUrl, tasks: sortedTaskList, modelId })` ensuring determinism and idempotence.
10. WHEN the Annotation_Worker already has an inference request in progress and a new
    Annotation_Spec is submitted, THE Visual_Annotation_Engine SHALL queue the new request
    and process it after the in-progress request completes; it SHALL NOT reject or drop the
    new request solely because the worker is busy.


---

### Requirement 4: LLM-Ready Structured Output

**User Story:** As a developer integrating annotations with LLM pipelines or vector stores,
I want a canonical LLM_Ready_Payload serialiser so that annotation results can be injected
into a context window or chunked without additional transformation.

#### Acceptance Criteria

1. THE Visual_Annotation_Engine SHALL provide a pure `toLlmReadyPayload(result:
   Annotation_Result): LLM_Ready_Payload` function that extracts `tasks`, `assetUrl`,
   `modelId`, and `schemaVersion` from a valid Annotation_Result where `ok: true`.
2. THE LLM_Ready_Payload SHALL be a valid JSON object serialisable by `JSON.stringify`
   without loss of data (no circular references, no undefined values, no functions).
3. FOR ALL valid Annotation_Results, `JSON.parse(JSON.stringify(toLlmReadyPayload(result)))`
   SHALL produce an object with equal `JSON.stringify` output to `toLlmReadyPayload(result)`
   (round-trip property: serialise → parse → serialise produces equivalent payload).
4. THE LLM_Ready_Payload SHALL NOT include internal fields: `ok`, `annotationId`,
   `processedAt`, or `durationMs`; these are operational metadata, not LLM context.
5. WHEN an Annotation_Result contains bbox arrays, THE LLM_Ready_Payload SHALL preserve
   them as arrays of numbers; no stringification of numeric arrays is permitted.
6. THE Visual_Annotation_Engine SHALL provide a pure `toMarkdownSummary(result:
   Annotation_Result): string` function. WHEN the result contains a caption task, the
   output SHALL begin with a `## Caption` section containing the caption text. WHEN the
   result contains an `object_detection` task with one or more detected objects, the output
   SHALL include a `## Detected Objects` section listing each object label on its own line
   prefixed with `- `. WHEN a task entry contains `{ error }` rather than a valid output,
   the output SHALL include the task name and a `(failed)` indicator. IF the result has
   no caption tasks and no object detection results, `toMarkdownSummary` SHALL return a
   non-empty string indicating no annotation data is available.
7. FOR ALL valid Annotation_Results, `toLlmReadyPayload` SHALL be idempotent: calling it
   twice on the same result SHALL produce equal outputs
   (`JSON.stringify(a) === JSON.stringify(b)`).
8. IF `toLlmReadyPayload` is called with an Annotation_Result where `ok: false`, THEN it
   SHALL throw a `TypeError` with message `"toLlmReadyPayload requires ok:true result"`
   rather than returning a partial payload.


---

### Requirement 5: Canvas Node Materialisation

**User Story:** As a canvas user, I want annotation results to appear as a structured node
on the agenticgraph canvas so that I can see labels, bounding boxes, and captions alongside
related knowledge graph nodes.

#### Acceptance Criteria

1. WHEN an Annotation_Result with `ok: true` is received, THE Visual_Annotation_Engine SHALL
   call `writeRichMediaWidgetRunOutputArtifact` exactly once per annotation run with the
   Annotation_Result JSON serialised as the artifact content, following the existing
   rich-media artifact pipeline without creating a parallel write path.
2. THE Annotation_Canvas_Node SHALL be created or updated at the semantic key derived from
   `buildScopedGraphSemanticKey("annotation", ...)` — the same key used as `annotationId` —
   so that re-annotating the same asset with the same tasks updates the existing node rather
   than creating a duplicate.
3. THE Annotation_Canvas_Node SHALL carry a `kind: "annotation"` property compatible with
   the existing `resolveRichMediaWidgetKind` resolver; no new widget kind shall be
   registered without updating that resolver.
4. WHEN the Annotation_Canvas_Node is written to the canvas, THE
   Visual_Annotation_Engine SHALL NOT perform a separate storage upload, manifest write, or
   canvas-apply step; those operations SHALL be performed exactly once by the existing
   `writeRichMediaWidgetRunOutputArtifact` owner.
5. IF `writeRichMediaWidgetRunOutputArtifact` throws or returns `outputPath: null`, THEN
   THE Visual_Annotation_Engine SHALL return a structured error
   `{ ok: false, errorCode: "artifact_write_failed", reason }` or a degraded-success result
   with `outputPath: null` respectively, without retrying or silently swallowing the outcome.


---

### Requirement 6: MCP Tool Surface

**User Story:** As a coding agent using MCP, I want `agenticgraph.annotate.image` and
`agenticgraph.annotate.video_frame` tools so that I can trigger annotation jobs programmatically
from outside the browser canvas.

#### Acceptance Criteria

1. THE MCP_Annotate_Image_Tool SHALL be registered in `buildAgenticGraphLocalMcpToolDefinitions()`
   in `mcp/local-tool-contract.js` under the name `agenticgraph.annotate.image`, following the
   same registration pattern as `agenticgraph.html_video.render`.
2. THE MCP_Annotate_Image_Tool input schema SHALL require `asset_url` (non-empty string,
   max 2048 chars) and `tasks` (array of strings, min length 1, max 6 entries, each value
   must be a value in `ANNOTATION_TASK_IDS`); and accept optional `model_hint` (string,
   max 255 chars).
3. THE MCP_Annotate_Video_Frame_Tool SHALL be registered under the name
   `agenticgraph.annotate.video_frame` with the same required fields as the image tool plus
   `frame_timestamp_ms` (integer ≥ 0, required).
4. THE MCP tool output schema for both tools SHALL be a JSON object with required fields
   `ok` (boolean), `annotation_id` (non-empty string on success, empty string on failure),
   `asset_url` (string), `model_id` (string), `schema_version` (string equal to
   `"agenticgraph-annotation/v1"` on success), and `tasks` (object); plus optional `error`
   (object with required string fields `code` and `message`).
5. IF the Annotation_Spec derived from the MCP input fails validation, THEN the MCP tool
   SHALL return `{ ok: false, annotation_id: "", asset_url: <input asset_url>,
   model_id: "", schema_version: "", tasks: {}, error: { code: "invalid_spec",
   message: "<field>: <reason>" } }` without invoking the Annotation_Worker.
6. IF the Model_Registry does not contain the resolved model, THEN the MCP tool SHALL
   return `{ ok: false, annotation_id: "", asset_url: <input asset_url>,
   model_id: <resolved model identifier>, schema_version: "", tasks: {},
   error: { code: "model_not_configured", message: <modelId> } }`.
7. THE tool names `agenticgraph.annotate.image` and `agenticgraph.annotate.video_frame` SHALL be
   added to `AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES` in `agenticgraphVdeoxplnContract.mjs` so that
   the vdeoxpln validator can resolve them.
8. IF inference fails during MCP tool execution, THEN the MCP tool SHALL return
   `{ ok: false, annotation_id: "", asset_url: <input asset_url>,
   model_id: <resolved model identifier>, schema_version: "", tasks: {},
   error: { code: "inference_failed", message: <reason> } }` without propagating an
   uncaught exception.


---

### Requirement 7: Storyboard Widget Node Registration

**User Story:** As a Storyboard Widget user, I want a Visual Annotation Engine node type so that
I can wire image assets into annotation jobs directly on the canvas.

#### Acceptance Criteria

1. THE Annotation_Flow_Node SHALL be registered under a constant
   `FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID` with value `'AnnotationEngine'` exported from
   `canvas/src/lib/config.storyboard-widget.ts`, following the PascalCase node-type pattern of
   `FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID`.
2. THE registration SHALL export `FLOW_ANNOTATION_ENGINE_FORM_ID` with value
   `'annotationEngine'` (camelCase), `FLOW_ANNOTATION_ENGINE_WIDGET_TYPE_ID` with value
   `'default'`, and `FLOW_ANNOTATION_ENGINE_NODE_LABEL` with value `"Annotation Engine"`.
3. IF a node's `type` property equals `FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID`, THEN the
   Storyboard Widget widget-kind resolver SHALL return `"annotation"`.
4. THE Annotation_Flow_Node schema SHALL expose properties readable by `readNodeProperty`:
   `asset_url` (string), `asset_type` (string), `tasks` (string — canonical format is
   comma-separated task names; a JSON array string is also accepted and parsed at runtime),
   `model_hint` (string), and `frame_timestamp_ms` (integer ≥ 0); all optional in the
   node schema with defaults resolved at runtime from operator config.
5. THE Annotation_Flow_Node SHALL NOT declare a property key already present on
   `StoryboardWidgetSmartNodeProperties` in `config.storyboard-widget.ts`; violations SHALL be caught
   as TypeScript compile-time errors via type intersection or discriminated union checks.


---

### Requirement 8: Annotation Engine SSOT Module

**User Story:** As a developer, I want a single SSOT module that exports all annotation
contracts, task IDs, and model IDs so that no annotation-specific knowledge leaks into
other modules.

#### Acceptance Criteria

1. THE Visual_Annotation_Engine SHALL define an `annotationEngineSsot` module that exports:
   the `ANNOTATION_TASK_IDS` frozen object (mapping task keys to canonical task-name strings),
   the `ANNOTATION_MODEL_IDS` frozen object (mapping model keys to HuggingFace model IDs),
   the `AGENTICGRAPH_ANNOTATION_MODEL` string constant with value `"AGENTICGRAPH_ANNOTATION_MODEL"`
   (the env-var name), the `Annotation_Spec` TypeScript type, the `Annotation_Result`
   TypeScript type, and the `Annotation_Task_Output` TypeScript type.
2. THE `annotationEngineSsot` module SHALL NOT import from the Annotation_Worker, any
   Transformers.js module, or any model-adapter module; a static analysis tool listing its
   direct imports SHALL find zero ML-library references.
3. THE `ANNOTATION_TASK_IDS` frozen object SHALL include at minimum:
   `caption` (`"caption"`), `detailedCaption` (`"detailed_caption"`),
   `moreDetailedCaption` (`"more_detailed_caption"`),
   `objectDetection` (`"object_detection"`),
   `denseRegionCaption` (`"dense_region_caption"`), and `ocr` (`"ocr"`).
4. THE `ANNOTATION_TASK_IDS` and `ANNOTATION_MODEL_IDS` objects SHALL be passed through
   `Object.freeze()` at module initialization time so that any runtime property assignment
   has no effect.
5. WHEN a new task type is introduced, it SHALL be enumerable solely by adding a key–value
   pair to `ANNOTATION_TASK_IDS`; the complete set of task names SHALL be observable via
   `Object.keys(ANNOTATION_TASK_IDS)` without reading any other source file.


---

### Requirement 9: Semantic Key and Idempotence

**User Story:** As a developer, I want every annotation job to carry a deterministic semantic
key built from the asset URL, task set, and model ID so that duplicate submissions are
detectable without external state.

#### Acceptance Criteria

1. THE Visual_Annotation_Engine SHALL build each `annotationId` by calling
   `buildScopedGraphSemanticKey("annotation", { assetUrl, tasks: sortedTasks, modelId })`
   where `sortedTasks` is the `tasks` array sorted lexicographically before the key is
   computed.
2. WHEN `buildScopedGraphSemanticKey` receives a non-empty scope and at least one non-empty
   input field, THE resulting `annotationId` SHALL be a non-empty string. IF all input
   fields are empty strings, THE Visual_Annotation_Engine SHALL return
   `{ ok: false, errorCode: "invalid_spec", field: "assetUrl", reason: "required" }`
   rather than producing an empty `annotationId`.
3. FOR ALL pairs of Annotation_Specs that have identical `assetUrl`, identical sorted
   `tasks`, and resolve to the same `modelId`, THE Visual_Annotation_Engine SHALL produce
   the same `annotationId` on every invocation (determinism / idempotence property).
4. FOR ANY two Annotation_Specs that differ in `assetUrl`, in sorted `tasks` (compared
   element-by-element after lexicographic sort), or in the resolved `modelId`, THE
   Visual_Annotation_Engine SHALL produce distinct `annotationId` values
   (collision-resistance property).
5. THE `annotationId` SHALL NOT be constructed from `Date.now()`, `Math.random()`,
   `crypto.randomUUID()`, or any non-deterministic source.


---

### Requirement 10: Vdeoxpln Skill Registry Entry

**User Story:** As an AI agent using vdeoxpln routing, I want a
`agenticgraph-visual-annotation-engine` entry in the skill registry so that the router can
dispatch annotation requests without hardcoded logic.

#### Acceptance Criteria

1. THE Visual_Annotation_Engine SHALL have an entry in `RAW_VDEOXPLN` in
   `canvas/src/features/agent-ready/agenticgraphVdeoxplnContract.mjs` with the required keys:
   `id` (`"agenticgraph-visual-annotation-engine"`), `title`, `purpose`, `scope`, `mutation`,
   `triggers`, `inputs`, `outputs`, `owners`, `tools`, `workflow`, `aiPolicy`,
   `artifactPolicy`, and `validation` — matching the structure of existing entries.
2. THE vdeoxpln entry SHALL declare `scope: "browser-local"`,
   `mutation: "local-approval-gated"`, include `agenticgraph.annotate.image` and
   `agenticgraph.annotate.video_frame` in its `tools.local` array, and set
   `aiPolicy.mode: "none"` with `aiPolicy.maxAttempts: 0` and `aiPolicy.tokenBudget: 0`
   (inference is local; no LLM tokens are spent for annotation).
3. THE vdeoxpln entry `triggers` SHALL include at minimum: `"annotate image"`,
   `"annotate video"`, `"visual annotation"`, `"object detection"`, `"image caption"`,
   `"florence2"`, `"semantic labels"`, `"llm-ready annotation"`.
4. THE vdeoxpln entry `owners` SHALL list only canonical repo-relative paths that do not
   start with `/` and contain no `..` segments; each path SHALL identify a file introduced
   or reused by this feature.
5. WHEN `validateAgenticGraphVdeoxplnRegistry()` is executed with the updated registry, THE
   validator SHALL return `{ ok: true, errors: [] }`.
6. THE vdeoxpln `artifactPolicy` SHALL include `persistence: "browser-local"`,
   `graphMaterialization: "annotation-canvas-node"`, and `semanticKeyInputs` as an ordered
   array containing `"annotationId"`, `"assetUrl"`, `"modelId"`, and `"sortedTasks"` (in
   that order).


---

### Requirement 11: Video Frame Annotation

**User Story:** As a developer, I want to annotate individual frames extracted from a
video asset so that video content can be semantically indexed without a server-side
pipeline.

#### Acceptance Criteria

1. WHEN `assetType` is `"video_frame"`, THE Visual_Annotation_Engine SHALL extract the
   frame at `frameTimestampMs` from the video asset by seeking an HTML `<video>` element
   and capturing the frame to an `OffscreenCanvas` (or `HTMLCanvasElement` fallback);
   no server-side frame extraction shall be performed. IF the seek operation does not
   complete within 5 seconds, THE Visual_Annotation_Engine SHALL abort and return
   `{ ok: false, errorCode: "frame_extraction_failed", reason: "seek_timeout" }`.
   IF `frameTimestampMs` exceeds the video duration, THE Visual_Annotation_Engine SHALL
   return `{ ok: false, errorCode: "frame_extraction_failed",
   reason: "timestamp_exceeds_duration" }`.
2. THE extracted frame SHALL be passed to the Annotation_Worker as an `ImageBitmap`
   transferred via the structured-clone algorithm's transferable path; the full video
   binary SHALL NOT be transferred to the worker.
3. WHEN frame extraction fails (unsupported codec, CORS restriction, seek error, seek
   timeout, or timestamp exceeds duration), THE Visual_Annotation_Engine SHALL return
   `{ ok: false, errorCode: "frame_extraction_failed", reason: <message> }` without
   initiating inference.
4. THE Annotation_Result for a `video_frame` spec SHALL include `frameTimestampMs` as a
   top-level field alongside the standard Annotation_Result fields.
5. THE video frame annotation path SHALL reuse the same Annotation_Worker, Model_Registry,
   semantic key builder, and canvas materialisation path as image annotation; no parallel
   video-specific worker or artifact writer shall be introduced.


---

### Requirement 12: Configuration Constraints and TCO Guardrails

**User Story:** As a solo dev operating under FOSS-first and TCO-zero constraints, I want
all configuration to be runtime-injected, all dependencies OSI-licensed, and inference
permanently zero-cost by default, so that the feature ships within the 180-minute timebox
with no recurring cost.

#### Acceptance Criteria

1. THE Visual_Annotation_Engine SHALL read all configurable values from environment
   variables or caller-supplied runtime config: model identifier from
   `AGENTICGRAPH_ANNOTATION_MODEL`, inference backend preference from
   `AGENTICGRAPH_ANNOTATION_BACKEND` (accepted values: `"webgpu"`, `"wasm"`), and
   cache-storage key prefix from `AGENTICGRAPH_ANNOTATION_CACHE_PREFIX`; no configurable
   value shall be hardcoded in source.
2. THE Visual_Annotation_Engine SHALL NOT introduce any dependency not distributed under
   an OSI-approved open-source license; `transformers.js` (Apache 2.0) and
   `microsoft/Florence-2-base` (MIT) satisfy this constraint.
3. THE Visual_Annotation_Engine SHALL NOT require a paid inference API, a server-side
   GPU, or any cloud-hosted ML endpoint for core annotation functionality; the zero-cost
   in-browser inference path SHALL be the default and SHALL work offline after initial
   model download.
4. THE Visual_Annotation_Engine SHALL NOT add a Cloudflare Worker, Pages function, or
   Prod deployment artifact until the user explicitly instructs a deployment phase.
5. THE Visual_Annotation_Engine SHALL NOT re-export or duplicate any symbol already
   exported from `canvas/src/features/chat/richMediaRun.ts`,
   `canvas/src/lib/graph/semanticKey.ts`, or `mcp/local-tool-contract.js`; it SHALL
   import from those modules.
6. THE Visual_Annotation_Engine SHALL NOT introduce a new storage upload path, manifest
   writer, or canvas-apply step; it SHALL delegate those operations to the existing owners.
7. WHERE the browser does not support Web Workers (e.g. certain SSR render contexts), THE
   Visual_Annotation_Engine SHALL return
   `{ ok: false, errorCode: "worker_not_supported", reason: "Web Workers unavailable" }`
   rather than blocking the main thread with synchronous inference.


---

### Requirement 13: Property-Based Correctness Properties

**User Story:** As a developer, I want formal correctness properties for the annotation
pipeline so that property-based tests can drive confidence without relying on live model
inference.

#### Acceptance Criteria

1. THE Visual_Annotation_Engine test harness SHALL define a round-trip property: for any
   valid Annotation_Spec with 1–6 tasks and `assetUrl` of 1–2048 chars (generated by the
   test harness), the sequence Annotation_Spec → mock Annotation_Worker (returns
   deterministic task outputs derived from the spec fields without network calls) →
   `toLlmReadyPayload` → `JSON.stringify` → `JSON.parse` SHALL produce an object whose
   `JSON.stringify` output equals that of the original `toLlmReadyPayload` call
   (serialisation round-trip property).
2. WHEN the same valid Annotation_Spec is submitted twice with the same resolved `modelId`,
   THE Visual_Annotation_Engine SHALL produce the same `annotationId` on both invocations
   (idempotence property).
3. FOR ANY valid Annotation_Result returned by a mock Annotation_Worker, THE result SHALL
   satisfy: `result.assetUrl === spec.assetUrl`, `result.assetType === spec.assetType`,
   and `Object.keys(result.tasks)` SHALL contain every string in `spec.tasks` (invariant
   property).
4. FOR ANY Annotation_Spec missing a required field, carrying a task string not in
   `ANNOTATION_TASK_IDS`, or having `assetType: "video_frame"` with missing
   `frameTimestampMs`, THE Visual_Annotation_Engine SHALL return `{ ok: false }` with the
   appropriate `errorCode` without throwing an unhandled exception (error condition
   property).
5. FOR ANY valid Annotation_Result `r`, THE expression
   `JSON.stringify(toLlmReadyPayload(r)) === JSON.stringify(toLlmReadyPayload(r))` SHALL
   evaluate to `true` (`toLlmReadyPayload` idempotence property).
6. THE property tests SHALL NOT invoke Transformers.js, load model weights, or make network
   requests; they SHALL use in-process mock workers where each task output is a
   deterministic object derived from the task name and `assetUrl` (e.g., caption text is
   `"mock-caption:" + assetUrl.slice(0, 20)`, objects array contains one entry with
   `label: "mock-" + taskName`).

