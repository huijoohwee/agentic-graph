---
title: "AgenticGraph HTML Video Renderer — Requirements"
id: "spec:agenticgraph-html-video-renderer"
author: "airvio / joohwee"
date: "2026-06-19"
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
constraints:
  - "universal"
  - "neutral"
  - "agnostic"
  - "modular"
  - "spec-complete to runtime-ready"
  - "FORBID edit codebase / deploy to Prod / Cloudflare until user instructs"
  - "no hardcoded render engine, IDs, routes, API keys in repo"
  - "no downstream local patch stacks"
  - "no backfill, churn, conflict, duplicate, freeze, or stale"
  - "semantic HTML in all template outputs — no generic divs"
  - "reuse shared heuristics / semantic-key helpers / headless / unopinionated"
  - "pluggable render engines: headless-browser, canvas-2d, server-side; engine selected at runtime via env/config"
traceability:
  repo_dev: "$GITHUB_ROOT/agenticgraph"
  spec_path: ".kiro/specs/agenticgraph-html-video-renderer/requirements.md"
  feature_surface: "HTML-to-Video Render Pipeline"
  inspired_by: "https://github.com/nexu-io/html-video, https://github.com/heygen-com/hyperframes, https://github.com/FFmpeg/FFmpeg"
---

# Requirements Document

## Introduction

`agenticgraph-html-video-renderer` adds a pluggable HTML-to-video render pipeline to the agenticgraph
platform. Coding agents, Storyboard Widget nodes, and MCP clients supply HTML + CSS + data as a
self-contained render spec; the pipeline resolves the active render engine at runtime, produces
a real MP4 blob, and routes the artifact through the existing `writeRichMediaWidgetRunOutputArtifact`
→ storage → manifest → canvas-apply path.

No render engine is hardcoded. Operators select the engine at runtime via environment variable or
config. The feature registers as a Storyboard Widget node type
(`FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID`), a vdeoxpln skill entry
(`agenticgraph-html-video-renderer`), and an MCP tool (`agenticgraph.html_video.render`). All owners,
IDs, and semantic keys reuse existing helpers — no duplicate or parallel path is introduced.

Inspiration is taken from the design patterns in `nexu-io/html-video` and
`heygen-com/hyperframes`, especially seekable HTML timelines rendered through a headless browser
and encoded to MP4 with FFmpeg, but no upstream code is copied.
For Dev/Prod smoke rendering without a system FFmpeg install, the native `canvas-2d` adapter uses
html2canvas, browser WebCodecs, and Mediabunny to mux MP4 directly in the browser runtime.


## Glossary

- **Html_Video_Renderer**: The agenticgraph feature that accepts a Render_Spec and produces an MP4
  artifact through a runtime-selected Render_Engine.
- **Render_Spec**: A structured, serialisable value object containing `html` (string),
  `css` (optional string), `data` (optional JSON object), `durationMs` (integer, > 0),
  `fps` (integer, 1–120), `width` (integer, px), `height` (integer, px), and optional
  `engineHint` (string). All field values must be provided at call time; no hardcoded defaults
  are baked into the repo.
- **Render_Engine**: A stateless, pluggable adapter that accepts a Render_Spec and returns a
  Render_Result. Three reference implementations are required: `headless-browser`,
  `canvas-2d`, and `server-side`. The active engine is resolved from
  `AGENTICGRAPH_HTML_VIDEO_ENGINE` at runtime; the resolver never falls through to a hardcoded
  engine name.
- **Headless_Browser_FFmpeg_Adapter**: The native `headless-browser` adapter that renders
  seekable HTML frames through the existing Playwright dependency and encodes MP4 through an
  operator-provided FFmpeg binary. The adapter is loadable independently; it is never imported by
  the SSOT or registry as a fallback engine.
- **Canvas_2D_WebCodecs_Adapter**: The native `canvas-2d` adapter that rasterizes HTML/CSS
  frames through html2canvas and encodes MP4 in-browser through WebCodecs and Mediabunny. It is
  the recommended no-system-FFmpeg path for Dev/Prod smoke renders.
- **Render_Result**: The value returned by a Render_Engine containing `blob` (Blob, `video/mp4`),
  `engineId` (string), `durationMs` (number), `fps` (number), `width` (number), `height`
  (number), and optional `renderLog` (string array).
- **Engine_Registry**: The runtime-configurable map of `engineId → Render_Engine` adapter
  instances. Populated exclusively from env/config; no engine is hard-registered in source code.
- **Engine_Resolver**: The pure function that reads `AGENTICGRAPH_HTML_VIDEO_ENGINE` (or
  `engineHint` when explicitly passed), validates the value against the Engine_Registry, and
  returns the selected Render_Engine. Fails fast with a structured error when the engine is
  absent from the registry.
- **Html_Video_Run_Request**: The typed input to the Storyboard Widget node run path; contains
  `renderSpec` (Render_Spec) and `generationConfig` (operator-supplied, passed through without
  mutation).
- **Html_Video_Run_Result**: The typed output of the Storyboard Widget node run path; contains `kind`
  fixed to `"video"`, `asset` (GeneratedBinaryAsset from the existing richMediaRun types),
  `outputPath`, `outputManifestPath`, and `outputStorageUrl`.
- **Render_Job**: A single bounded execution of the Engine_Resolver + Render_Engine +
  writeRichMediaWidgetRunOutputArtifact pipeline for one Render_Spec. Identified by a
  `renderJobId` built with `buildScopedGraphSemanticKey()`.
- **Render_Manifest**: The markdown artifact written by `writeRichMediaWidgetRunOutputArtifact`
  describing the MP4 artifact, storage URL, canonical path, and render metadata.
- **Html_Video_Flow_Node**: The Storyboard Widget node type registered under
  `FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID`. Follows the same form-id, widget-type-id, and label
  pattern as `FLOW_VIDEO_GENERATION_NODE_TYPE_ID` and `FLOW_SWARM_PREDICTION_NODE_TYPE_ID`.
- **MCP_Html_Video_Tool**: The local MCP tool registered as `agenticgraph.html_video.render` through
  `buildAgenticGraphLocalMcpToolDefinitions()`. Follows the memory-layer and showrunner tool
  registration patterns.
- **Source_Files**: The agenticgraph workspace document store used for Render_Manifest and artifact
  persistence (reuses existing `sourceFilesBinaryStorage` and `sourceFileShareUrl` owners).
- **Semantic_Key**: A scoped, deterministic identifier built with `buildScopedGraphSemanticKey()`
  for Render_Job identity; never a hardcoded literal.
- **KGC**: AgenticGraph Canvas — the canvas graph apply path (`chatKgcCanvasApply.ts`).
- **MCP**: Model Context Protocol — the tool surface through which agents invoke agenticgraph
  capabilities.


## Requirements

---

### Requirement 1: Render Spec Contract

**User Story:** As a coding agent, I want a typed, self-contained Render_Spec contract, so that I
can describe an HTML + CSS + data video job without embedding engine assumptions or hardcoded
values.

#### Acceptance Criteria

1. THE Html_Video_Renderer SHALL define a Render_Spec schema with required fields `html`
   (non-empty string), `durationMs` (integer, 1–3,600,000 ms), `fps` (integer 1–120), `width`
   (integer 1–7680 px), and `height` (integer 1–4320 px); and optional fields `css` (string),
   `data` (JSON object), and `engineHint` (string, max 255 chars).
2. IF a Render_Spec is missing any required field or carries a value outside the specified range,
   THEN THE Html_Video_Renderer SHALL reject the spec with a structured error containing the
   field name and violation reason, without initiating a render.
3. THE Render_Spec schema SHALL NOT include hardcoded engine names, IDs, routes, or API keys.
4. WHEN a valid Render_Spec is passed to the Engine_Resolver, THE Html_Video_Renderer SHALL
   deliver the spec such that (a) `renderSpec.html` equals the input `html` string, (b)
   `renderSpec.durationMs` equals the input `durationMs` integer, and (c) `renderSpec.fps`
   equals the input `fps` integer — all fields are passed as received, without transformation.
5. WHEN the `html` field of a Render_Spec is parsed as markup, THE Html_Video_Renderer SHALL
   accept it only if the parsed document contains at least one non-whitespace text node or
   element node beyond the root; it SHALL reject an `html` value that produces an empty
   document (no parseable content).

---

### Requirement 2: Pluggable Render Engine Registry

**User Story:** As an operator, I want to select the render engine at runtime via environment
variable, so that the engine is never hardcoded and can be swapped without touching source code.

#### Acceptance Criteria

1. THE Engine_Registry SHALL be populated exclusively from runtime env/config; no engine is
   hard-registered by name in source code.
2. THE Engine_Resolver SHALL read the active engine identifier from the
   `AGENTICGRAPH_HTML_VIDEO_ENGINE` environment variable at invocation time; it SHALL NOT cache the
   value across invocations.
3. WHEN `AGENTICGRAPH_HTML_VIDEO_ENGINE` is set to a registered engine identifier, THE
   Engine_Resolver SHALL return an object `{ ok: true, engine: <Render_Engine adapter> }`
   without error.
4. IF `AGENTICGRAPH_HTML_VIDEO_ENGINE` is absent, empty, or resolves to an engine identifier not
   present in the Engine_Registry, THEN THE Engine_Resolver SHALL return a structured error
   `{ ok: false, errorCode: "engine_not_configured", engineId: <resolved value or empty string> }`
   without initiating a render.
5. WHEN a Render_Spec carries a non-empty `engineHint` and the caller explicitly provides it as
   the `engineHint` parameter to the Engine_Resolver function, THE Engine_Resolver SHALL use the
   hint value as the engine identifier and ignore `AGENTICGRAPH_HTML_VIDEO_ENGINE`; IF the hint
   does not resolve to a registered engine, THE Engine_Resolver SHALL return
   `{ ok: false, errorCode: "engine_not_configured", engineId: <hint value> }`.
6. THE Html_Video_Renderer SHALL support at minimum three registered engine identifiers:
   `headless-browser`, `canvas-2d`, and `server-side`; each SHALL be loadable as an independent
   adapter module such that loading any one adapter does not require importing either of the
   other two.
7. THE native `headless-browser` adapter SHALL use a FOSS runtime path: seek each frame in a
   headless browser, capture image frames, and invoke an operator-provided FFmpeg binary to
   encode `video/mp4`; it SHALL expose runtime configuration for the FFmpeg binary path, video
   codec, and max-frame safety bound.
8. THE native `headless-browser` adapter SHALL NOT depend on or copy `heygen-com/hyperframes`
   source code and SHALL NOT force GPL or nonfree FFmpeg codec choices in repo defaults.
9. THE native `canvas-2d` adapter SHALL produce `video/mp4` blobs in browser runtimes without a
   system FFmpeg install by using WebCodecs and a FOSS TypeScript MP4 muxer; it SHALL fail closed
   outside supported browser runtimes instead of falling back to another engine.
10. FOR ANY two registered Render_Engines given the same Render_Spec, THE Html_Video_Renderer
   SHALL produce Render_Results where `result.durationMs === spec.durationMs`,
   `result.fps === spec.fps`, `result.width === spec.width`, and
   `result.height === spec.height` (output metadata consistency property across engines).

---

### Requirement 3: Render Execution and MP4 Output

**User Story:** As a coding agent, I want the renderer to produce a real MP4 blob for a given
Render_Spec, so that downstream artifact owners receive a concrete, playable video file.

#### Acceptance Criteria

1. WHEN a Render_Spec containing all five required metadata fields (`html`, `durationMs`, `fps`,
   `width`, `height`) is provided and the Engine_Resolver returns a non-null Render_Engine, THE
   Html_Video_Renderer SHALL invoke the engine and produce a Render_Result containing a `blob`
   of MIME type `video/mp4`.
2. THE Render_Result `blob` SHALL have a byte length greater than zero.
3. THE Render_Result SHALL carry `engineId`, `durationMs`, `fps`, `width`, and `height` fields
   matching the corresponding values from the input Render_Spec.
4. IF the Engine_Resolver returns `{ ok: false }` (engine not found or not configured), THEN
   THE Html_Video_Renderer SHALL return a structured error
   `{ ok: false, errorCode: "engine_not_configured", engineId }` and SHALL NOT invoke any
   Render_Engine.
5. IF a Render_Engine throws or rejects during execution, THEN THE Html_Video_Renderer SHALL
   return a structured error `{ ok: false, errorCode: "render_failed", engineId, reason }` and
   SHALL NOT pass any partial blob to the artifact pipeline.
6. THE Html_Video_Renderer SHALL assign each Render_Job a deterministic `renderJobId` derived
   from a content hash of the Render_Spec fields and the resolved `engineId`, such that
   identical inputs always produce the same `renderJobId` string.
7. WHEN the same content hash and engineId are submitted twice within a single runtime session,
   THE Html_Video_Renderer SHALL produce a Render_Job with the same `renderJobId` as the first
   submission (semantic key idempotence).

---

### Requirement 4: Artifact Pipeline Integration

**User Story:** As a developer, I want the MP4 blob to flow through the existing
`writeRichMediaWidgetRunOutputArtifact` → storage → manifest → canvas-apply path, so that no
parallel artifact owner is introduced.

#### Acceptance Criteria

1. WHEN a Render_Result containing a `video/mp4` blob with byte length > 0 is available, THE
   Html_Video_Renderer SHALL call `writeRichMediaWidgetRunOutputArtifact` exactly once per
   render run with `kind: "video"` and `extension: "mp4"`, reusing the existing owner without
   modification.
2. WHEN `writeRichMediaWidgetRunOutputArtifact` returns, THE Html_Video_Run_Result SHALL carry
   `outputPath`, `outputManifestPath`, and `outputStorageUrl` populated from that return value.
3. WHEN `writeRichMediaWidgetRunOutputArtifact` writes the artifact, THE Html_Video_Renderer
   SHALL NOT invoke any storage upload, manifest write, or canvas-apply operation separately;
   those steps are performed exactly once by the existing owner per render run.
4. THE Render_Manifest produced by the existing manifest writer SHALL include a non-null
   `engineId` row alongside `kind`, `artifactPath`, `mimeType`, `storageUrl`, and
   `contentHash`.
5. IF `writeRichMediaWidgetRunOutputArtifact` returns `outputPath: null`, THEN THE
   Html_Video_Run_Result SHALL set `outputPath: null`, `outputManifestPath: null`, and
   `outputStorageUrl: null` without retrying or silently swallowing the failure.
6. IF `writeRichMediaWidgetRunOutputArtifact` throws an exception, THEN THE Html_Video_Renderer
   SHALL catch the exception, return a structured error
   `{ ok: false, errorCode: "artifact_write_failed", reason: <exception message> }`, and SHALL
   NOT propagate the uncaught exception to the caller.
7. WHEN a render run completes successfully, the round-trip sequence — Render_Spec →
   Render_Result (video/mp4 blob) → `writeRichMediaWidgetRunOutputArtifact` → Render_Manifest
   — SHALL complete within 30 seconds with `outputPath` non-null and the manifest containing a
   non-empty `artifactPath` that references the written MP4 file.

---

### Requirement 5: Storyboard Widget Node Registration

**User Story:** As a Storyboard Widget user, I want an HTML Video Renderer node type available in the
widget registry, so that I can wire HTML + CSS + data into a render job directly in the canvas.

#### Acceptance Criteria

1. THE Html_Video_Flow_Node SHALL be registered under a constant
   `FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID` with value `'HtmlVideoRenderer'` exported from
   `canvas/src/lib/config.storyboard-widget.ts`, following the PascalCase pattern of
   `FLOW_VIDEO_GENERATION_NODE_TYPE_ID` (`'VideoGeneration'`) and
   `FLOW_SWARM_PREDICTION_NODE_TYPE_ID` (`'SwarmPrediction'`).
2. THE Html_Video_Flow_Node registration SHALL export `FLOW_HTML_VIDEO_RENDERER_FORM_ID` with
   value `'htmlVideoRenderer'` (camelCase), `FLOW_HTML_VIDEO_RENDERER_WIDGET_TYPE_ID` with
   value `'default'` (matching the standard widget-type pattern), and
   `FLOW_HTML_VIDEO_RENDERER_NODE_LABEL` as a human-readable string constant.
3. IF a node's `type` property equals `FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID`, THEN the Flow
   Editor widget-kind resolver SHALL return `"video"`, enabling the existing
   `buildRichMediaWidgetOutputPatch` path.
4. THE Html_Video_Flow_Node schema SHALL expose properties readable by `readNodeProperty`:
   `html` (string), `css` (string), `data_json` (string), `duration_ms` (integer 1–3,600,000),
   `fps` (integer 1–120), `width` (integer 1–7680), `height` (integer 1–4320), and
   `engine_hint` (string); all are optional in the node schema with defaults resolved at
   runtime from operator config, never from hardcoded source values.
5. THE Html_Video_Flow_Node SHALL NOT declare a property key already present on
   `StoryboardWidgetSmartNodeProperties` in `config.storyboard-widget.ts`.

---

### Requirement 6: MCP Tool Surface

**User Story:** As a coding agent using MCP, I want a `agenticgraph.html_video.render` tool, so that
I can trigger an HTML-to-video render job from outside the browser canvas.

#### Acceptance Criteria

1. THE MCP_Html_Video_Tool SHALL be registered in `buildAgenticGraphLocalMcpToolDefinitions()` in
   `mcp/local-tool-contract.js` under the name `agenticgraph.html_video.render`, following the same
   registration pattern as the memory-layer and showrunner tools.
2. THE MCP_Html_Video_Tool input schema SHALL require `html` (string), `duration_ms` (integer,
   1–3,600,000), `fps` (integer 1–120), `width` (integer 1–7680), `height` (integer 1–4320);
   and accept optional `css` (string), `data` (object), and `engine_hint` (string).
3. THE MCP_Html_Video_Tool output schema SHALL be a JSON object with required fields `ok`
   (boolean), `render_job_id` (string), `output_path` (string or null), and
   `output_manifest_path` (string or null); and optional `output_storage_url` (string),
   `engine_id` (string), and `error` (object with required string fields `code` and `message`).
4. WHEN the MCP_Html_Video_Tool is invoked with an input that satisfies the input schema, THE
   Html_Video_Renderer SHALL execute the full render pipeline (Engine_Resolver → Render_Engine
   → artifact pipeline) and return the MCP output schema.
5. IF a Render_Spec derived from the MCP input fails validation, THEN THE MCP_Html_Video_Tool
   SHALL return `{ ok: false, render_job_id: "", output_path: null, output_manifest_path: null,
   error: { code: "invalid_spec", message: <field and violation> } }` without invoking the
   Engine_Resolver.
6. IF the Engine_Resolver returns a structured error, THEN THE MCP_Html_Video_Tool SHALL return
   `{ ok: false, render_job_id: "", output_path: null, output_manifest_path: null,
   error: { code: "engine_not_configured", message: <engineId> } }` without executing any
   Render_Engine.
7. THE MCP_Html_Video_Tool name `agenticgraph.html_video.render` SHALL be added to
   `AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES` in `agenticgraphVdeoxplnContract.mjs` so that the vdeoxpln
   validator can resolve it.

---

### Requirement 7: Vdeoxpln Skill Registry Entry

**User Story:** As an AI agent using vdeoxpln routing, I want a `agenticgraph-html-video-renderer`
entry in the skill registry, so that the router can route HTML-to-video requests without
hardcoded logic.

#### Acceptance Criteria

1. THE Html_Video_Renderer SHALL have an entry in `RAW_VDEOXPLN` in
   `canvas/src/features/agent-ready/agenticgraphVdeoxplnContract.mjs` with the following required
   keys: `id` (`"agenticgraph-html-video-renderer"`), `title`, `purpose`, `scope`, `mutation`,
   `triggers`, `inputs`, `outputs`, `owners`, `tools`, `workflow`, `aiPolicy`, `artifactPolicy`,
   and `validation` — matching the object structure of `agenticgraph-memory-layer` and
   `agenticgraph-ai-showrunner` entries.
2. THE vdeoxpln entry SHALL declare `scope: "local-stdio-and-browser-local"`,
   `mutation: "local-approval-gated"`, include `agenticgraph.html_video.render` in its
   `tools.local` array, and set `aiPolicy.mode: "none"` with `aiPolicy.maxAttempts: 0` and
   `aiPolicy.tokenBudget: 0`.
3. THE vdeoxpln entry `triggers` SHALL include at minimum: `"html video render"`,
   `"html to video"`, `"programmatic video"`, `"render html mp4"`, `"coding agent video"`.
4. THE vdeoxpln entry `owners` SHALL list only canonical repo-relative paths (no absolute paths,
   no `..` segments) of modules introduced or reused by this feature.
5. WHEN `validateAgenticGraphVdeoxplnRegistry()` is executed with the updated registry, THE
   validator SHALL return `{ ok: true, errors: [] }` (no duplicate ids, no unresolved tool
   names, no missing semantic keys, no aliases).
6. THE vdeoxpln `artifactPolicy` SHALL include `persistence: "local-workspace"`,
   `graphMaterialization: "rich-media-panel"`, and `semanticKeyInputs` containing
   `"renderJobId"`, `"engineId"`, `"renderSpecHash"`, and `"outputPath"`.

---

### Requirement 8: Render Engine SSOT Module

**User Story:** As a developer, I want a single SSOT module that exports all render-engine
adapter contracts and environment variable names, so that no engine-specific knowledge leaks
into other modules.

#### Acceptance Criteria

1. THE Html_Video_Renderer SHALL define a `htmlVideoRendererSsot` module (following the
   `videodbSsot.ts` pattern) that exports: the Render_Engine adapter TypeScript interface,
   the string constant `AGENTICGRAPH_HTML_VIDEO_ENGINE` (value `"AGENTICGRAPH_HTML_VIDEO_ENGINE"`),
   and an `HTML_VIDEO_ENGINE_IDS` frozen object with keys `headlessBrowser` (value
   `"headless-browser"`), `canvas2d` (value `"canvas-2d"`), and `serverSide` (value
   `"server-side"`).
2. THE `htmlVideoRendererSsot` module SHALL NOT contain a top-level import from any render
   engine adapter module; a static analysis tool that lists its direct imports SHALL find zero
   references to headless browser, canvas, or server-side library modules.
3. WHEN a new engine adapter is introduced, it SHALL be enumerable solely by adding its
   identifier as a new key–value pair in `HTML_VIDEO_ENGINE_IDS`; no other source file SHALL
   need to be edited to enumerate engine names.
4. THE `HTML_VIDEO_ENGINE_IDS` object SHALL be passed through `Object.freeze()` at module
   initialization time so that any attempt to assign a new property at runtime has no effect.
5. IF an engine identifier is a value in `HTML_VIDEO_ENGINE_IDS` and its corresponding adapter
   is present in the Engine_Registry, THEN the Engine_Resolver SHALL return `{ ok: true,
   engine: <adapter> }` for that identifier (registry membership → resolvable round-trip).

---

### Requirement 9: Semantic Key Integration

**User Story:** As a developer, I want every Render_Job to carry a deterministic semantic key
built from the spec content, so that duplicate submissions are detectable without maintaining
external state.

#### Acceptance Criteria

1. THE Html_Video_Renderer SHALL build each Render_Job's `renderJobId` by calling
   `buildScopedGraphSemanticKey("html-video-render", { ... })` with inputs derived from the
   Render_Spec fields `html`, `css`, `durationMs`, `fps`, `width`, `height`, a
   deterministically serialised form of `data` (keys sorted, no whitespace), and the resolved
   `engineId`.
2. THE `renderJobId` SHALL be a non-empty string whenever `buildScopedGraphSemanticKey`
   receives a non-empty scope string and at least one non-empty input field.
3. FOR ALL pairs of Render_Specs that are field-for-field identical (including deep equality of
   the `data` object) and resolve to the same `engineId`, THE Html_Video_Renderer SHALL produce
   the same `renderJobId` (determinism / idempotence property).
4. FOR ANY two Render_Specs that differ in at least one field (`html`, `css`, `durationMs`,
   `fps`, `width`, `height`, or the serialised `data` string) or differ in resolved `engineId`,
   THE Html_Video_Renderer SHALL produce distinct `renderJobId` values (collision-resistance
   property).
5. THE `renderJobId` SHALL NOT be constructed from hardcoded strings, UUIDs, or any source of
   non-determinism such as `Date.now()` or `Math.random()`.

---

### Requirement 10: Property-Based Correctness Properties

**User Story:** As a developer, I want formal correctness properties defined for the render
pipeline, so that property-based tests can drive confidence in the pipeline without depending
on external services.

#### Acceptance Criteria

1. THE Html_Video_Renderer test harness SHALL define a round-trip property: for any valid
   Render_Spec generated by the test harness, the sequence Render_Spec → Engine_Resolver
   (mock engine returning a deterministic blob) → `buildRichMediaWidgetOutputPatch` →
   Render_Manifest SHALL produce a manifest containing `artifactPath` and `mimeType:
   "video/mp4"` (round-trip: spec-in → manifest-out preserves kind and mimeType).
2. THE Html_Video_Renderer test harness SHALL define a render engine pluggability property
   using at least two distinct mock engine adapters: for any valid Render_Spec, swapping the
   engine identifier between those two adapters SHALL produce Render_Results with identical
   `durationMs`, `fps`, `width`, and `height` metadata while the `engineId` field differs
   (metamorphic: engine swap preserves metadata, changes identity).
3. THE Html_Video_Renderer test harness SHALL define an idempotence property: submitting the
   same valid Render_Spec twice through the Engine_Resolver and semantic-key builder SHALL
   produce the same `renderJobId` on both invocations.
4. THE Html_Video_Renderer test harness SHALL define an error condition property: for any
   Render_Spec missing a required field or carrying an out-of-range value, THE
   Html_Video_Renderer SHALL return a structured error without throwing an unhandled exception.
5. THE Html_Video_Renderer test harness SHALL define an invariant property: for any valid
   Render_Spec, the Render_Result `durationMs`, `fps`, `width`, and `height` SHALL equal the
   corresponding input Render_Spec fields (output metadata equals input spec — invariant across
   renders).
6. THE property tests SHALL NOT make real headless-browser, canvas, or server-side render calls;
   they SHALL use in-process mock engine adapters that return deterministic blobs with byte
   length > 0 derived from the input Render_Spec content hash.

---

### Requirement 11: Configuration Constraints and Anti-Patterns

**User Story:** As a solo developer operating under TCO-zero and FOSS-first constraints, I want
all configuration to be runtime-injected and all stale or conflicting code to be removed, so that
the repo stays clean and deployment-ready without manual cleanup.

#### Acceptance Criteria

1. THE Html_Video_Renderer SHALL read all configurable values — engine identifier, output
   dimensions defaults, fps defaults — from environment variables or caller-supplied runtime
   config; when no caller-supplied value is present, it SHALL fall back to the corresponding
   environment variable, never to a hardcoded literal in source.
2. THE Html_Video_Renderer SHALL NOT introduce any dependency on a headless browser binary,
   canvas library, or server-side renderer that is not distributed under an OSI-approved
   open-source license.
3. THE Html_Video_Renderer SHALL NOT add a Cloudflare Worker, Pages function, or Prod deployment
   artifact until the user explicitly instructs a deployment phase.
4. IF the `AGENTICGRAPH_HTML_VIDEO_ENGINE` environment variable is absent or empty at invocation
   time and no `engineHint` is supplied, THEN THE Engine_Resolver SHALL return
   `{ ok: false, errorCode: "engine_not_configured" }` and SHALL NOT fall back to any
   hardcoded default engine identifier.
5. THE Html_Video_Renderer SHALL NOT declare, import, or re-export the
   `writeRichMediaWidgetRunOutputArtifact` function, the `buildRichMediaWidgetOutputPatch`
   function, or any other symbol already exported from
   `canvas/src/features/chat/richMediaRun.ts`; it SHALL call them by importing from that
   module.
6. THE Html_Video_Renderer SHALL NOT introduce a new storage upload path or manifest markdown
   writer; it SHALL use the existing owners in `canvas/src/features/source-files/` and
   `canvas/src/features/chat/richMediaRun.ts` exclusively.
