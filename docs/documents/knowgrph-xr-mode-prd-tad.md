---
title: "Knowgrph XR Mode PRD & TAD"
doc_type: "PRD+TAD"
doc_id: "KXR-001"
version: "0.5.2"
status: "Accepted; browser-native capability slice added"
date: "2026-08-02"
authors:
  - "airvio"
schema: "kgc-computing-flow/v1"
lang: "en-US"
frontmatter_contract: "required"
governing_lenses:
  - "min-viable-max-value"
  - "TCO-zero"
  - "token economics"
  - "harness-first"
epics:
  - id: "KXR-E1"
    title: "XR Surface Mode"
  - id: "KXR-E2"
    title: "Model Asset Ingest And Render"
  - id: "KXR-E3"
    title: "FOSS PNG To SVG To GLB Pipeline"
  - id: "KXR-E4"
    title: "Cost, Token, And Performance Observability"
  - id: "KXR-E5"
    title: "Blender-Inspired 3D Pipeline"
tags:
  - "xr"
  - "webxr"
  - "threejs"
  - "gltf"
  - "glb"
  - "png-to-svg"
  - "foss"
  - "tco"
  - "token-economics"
  - "harness"
  - "blender-pipeline"
  - "modeling"
  - "rigging"
  - "animation"
  - "rendering"
  - "compositing"
  - "motion-tracking"
  - "sequencer"
---

# Knowgrph XR Mode PRD & TAD

## Overview

Knowgrph XR Mode is a renderer and asset-pipeline extension that lets users inspect graph scenes and model assets spatially without leaving the existing Canvas, Source Files, Markdown Workspace, and Cloudflare delivery chain.

The min-viable-max-value scope is not a new immersive product shell. It is a first-class `xr` 3D mode that reuses the current Three.js / React Three Fiber renderer, GLB/GLTF workspace manifests, rich-media overlay ownership, and Source Files import path. Asset conversion defaults to deterministic FOSS tooling: `png -> svg` through VTracer or Potrace, then `svg -> glb` through the Dev headless GLB compiler, with optional Three.js/Blender exporters and glTF Transform optimization reserved for higher-fidelity follow-up profiles.

**Governing decision**: XR Mode must be useful before a headset session starts. A user should be able to import a `.glb`, `.gltf`, `.svg`, or `.png`, open the XR spatial inspection stage in the browser canvas, and only then enter WebXR when supported by the device and user consent.

The first phone-first capture and viewer fallback slice is specified separately
in `docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md`. That document owns capability
detection, monocular camera fallback, and deterministic viewer handoff so XR
Mode can stay browser-native and device-appropriate before any immersive
session begins.

The current local acceptance path for that slice is documented in
`docs/documents/knowgrph-xr-spatial-capture-fallback-readiness.md` and runs
through `npm run xr:runtime-ready`. The repo-owned source proof owner for that
same slice is `npm run xr:source-runner:test`, and the one-command review path
is `npm run xr:review-ready`.

**Current implementation baseline**:

- `kgCanvasSurfaceMode: "xr"` is already recognized as a Canvas surface preset.
- Local and URL `.glb` / `.gltf` imports already produce model asset Markdown manifests with `kgCanvasSurfaceMode: "xr"`; `.ply` / `.spz` imports produce standalone spatial-capture manifests with source-only cache identities.
- Three.js canvas rendering already parses model asset documents and renders GLB/GLTF assets without requiring an active WebXR session; spatial-capture rendering uses bounded payload caches, range-backed local/URL PLY previews, shared source-buffer reads, preview-first parsing, a preview-first paint gate before transferable full-fidelity promotion, a full-parse floor for validation-size captures, progressive source ordering, first-paint render budgets, progressive GPU attribute upload, and deferred camera-direction Gaussian resorting.
- XR Mode graph scenes already mount a distinct spatial stage instead of plain 3D globe effects.
- A FOSS PNG-to-SVG conversion harness exists in Dev with VTracer/Potrace command adapters, input/path-budget fallback gates, and zero-token cost logging.
- A deterministic SVG-to-GLB compiler exists in Dev with safe-SVG rejection, source provenance, XR manifest metadata, and GLB inspect metrics.

**External reference baseline**:

- WebXR Device API is the browser standard for VR/AR device access, using `navigator.xr.isSessionSupported()` and `navigator.xr.requestSession()` behind user activation and permission boundaries.
- Three.js supports WebXR rendering by enabling `renderer.xr.enabled`, setting an animation loop, and attaching XR session UI / controller inputs.
- glTF/GLB is the preferred runtime model format for Three.js delivery; glTF Transform supports `inspect`, `optimize`, Meshopt/Draco geometry compression, and WebP/KTX2 texture compression; PlayCanvas SuperSplat, PlayCanvas Engine, Spark, and Splat Transform remain reference-only systems for splat editing, rendering, and conversion ergonomics.
- VTracer is MIT-licensed FOSS for colored raster-to-vector conversion; Potrace is a mature FOSS bitmap tracer best suited to black/white or thresholded inputs. Rapier is a principles-only physics reference: Knowgrph copies no source, prose, schema, algorithm, example, fixture, test, constant, API, or serialization format; installs no Rapier package or compatibility layer; and claims no API or numerical compatibility. The supported native scope is authoritative in `knowgrph-native-physics-engines-prd-tad.md`.

---

# Part A - Product Requirements Document

## Phase 0 - Problem Discovery

### Problem Statement

Solo developers using Knowgrph can already generate, import, and render knowledge graphs, rich media, and 3D model assets, but spatial inspection remains fragmented. Graph topology, GLB/GLTF models, SVG diagrams, and raster references live in separate visual affordances, forcing repeated context switching and making it hard to evaluate whether an asset is suitable for immersive explanation, demo capture, or future AR/VR use.

The opportunity is to add a low-TCO XR inspection path that reuses existing Canvas state and FOSS conversion tools instead of buying a proprietary 3D authoring pipeline or building a new renderer.

### Problem Hypothesis

If Knowgrph exposes XR Mode as a first-class Canvas surface and adds a deterministic FOSS PNG-to-SVG-to-GLB conversion harness, then a solo developer can turn existing visual source material into spatially inspectable artifacts with near-zero monthly TCO, zero default token spend, and measurable asset performance gates.

### Personas

**Solo Dev / Founder** - builds investor demos, product walkthroughs, and AI-native knowledge graph prototypes; needs the smallest implementation that creates differentiated spatial value without paid tooling or ops burden.

**AI Orchestrator** - manages model/harness outputs and asset generation pipelines; needs typed validation, cost logs, and bounded orchestration so asset workflows do not become unmeasured token or GPU spend.

**Technical Reviewer** - verifies PRD/TAD compliance and implementation readiness; needs acceptance criteria that map to existing tests, source owners, and `/goal` conditions.

### Journey: Solo Dev - Convert A Visual Asset Into An XR Inspectable Scene

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | Has a PNG logo, diagram, screenshot, or GLB model to use in a spatial demo | Source Files / Import URL | Asset type decides behavior unpredictably | Normalize assets into explicit workspace manifests |
| Discover | Imports the asset into Knowgrph | Markdown Workspace / Source Files | Raster assets are not spatially meaningful by default | Offer deterministic FOSS vectorization for suitable PNGs |
| Engage | Opens Canvas XR Mode | Canvas View / Render Settings | WebXR support varies by browser/device | Render an inline XR inspection stage before session entry |
| Complete | Inspects graph/model in browser and optionally enters XR | Three.js canvas / WebXR entry panel | Headset support cannot be assumed | Use progressive enhancement with graceful fallback |
| Return | Exports or reuses optimized model artifacts | Workspace export / Source Files | Performance problems are discovered late | Gate assets through inspect/optimize metrics |

## Product Scope

### In Scope

- First-class `xr` surface mode in Canvas View and frontmatter.
- Capability-detected XR entry with explicit inline-viewer, immersive-session,
  monocular-capture, and native-handoff outcomes.
- GLB/GLTF model asset manifests that open directly in XR Mode.
- Distinct graph XR spatial stage using the current display graph, not a separate derivation pipeline.
- Deterministic FOSS `png -> svg` vectorization harness with VTracer default and Potrace fallback.
- Deterministic `svg -> glb` compile path for vector assets that warrant 3D placement.
- GLB inspection gates for generated assets, with optional glTF Transform optimization/reporting profiles.
- TCO, token, and performance metrics emitted per conversion or optional AI-assisted step.
- Declarative Blender-inspired 3D pipeline specification and rendering.

### Out Of Scope

- Proprietary image tracing, proprietary 3D SaaS conversion, or paid model hosting.
- Mandatory headset support before browser canvas preview works.
- Dedicated stereo hardware or platform-locked native AR SDK ownership for the
  first shipped capture flow.
- Runtime conversion on every render frame.
- A separate XR graph derivation pipeline.
- Multi-user XR collaboration.
- Photorealistic 3D reconstruction from arbitrary PNGs.
- Deployment to Prod or Cloudflare as part of this document generation task.

---

## Epic KXR-E1 - XR Surface Mode

### User Story

**KXR-E1-S1**: As a Solo Dev, I want `xr` to be a first-class Canvas surface mode, so that I can switch from 2D/3D graph inspection to an XR-ready spatial stage without mutating GraphData.

### Acceptance Criteria

**KXR-E1-S1-AC1** - XR surface selection
* **Given** a workspace document or toolbar action requests `kgCanvasSurfaceMode: "xr"`, **when** Canvas applies the view selection, **then** `canvasRenderMode` becomes `3d` and `canvas3dMode` becomes `xr` before the render surface is activated.
* > **VCC translation**: `Verify canvas mode updates by running tests in src/__tests__/canvas3dMode.test.ts and ensuring no non-XR options are dropped`

**KXR-E1-S1-AC2** - Render Settings preserves XR
* **Given** the Render Settings 3D mode select is open, **when** the user selects `xr`, **then** the setting preserves `xr` instead of coercing it to plain `3d`.
* > **VCC translation**: `Verify render settings preserve value "xr" by running tests in src/__tests__/canvas3dMode.test.ts`

**KXR-E1-S1-AC3** - Distinct graph spatial stage
* **Given** XR Mode renders graph data, **when** the Three.js scene mounts, **then** it mounts the XR spatial stage and excludes plain 3D globe effects.
* > **VCC translation**: `Verify ThreeGraph resolves one explicit XR authority, Scene mounts XrCanonicalPhysicsStage or lazy XrMotionReferenceGraphStage, and GlobeEffects remain unmounted in XR`

**KXR-E1-S1-AC4 — Operator panel continuity.** **Given** Media or Skills & Commands is already open, **when** the user changes Surface Mode to XR Mode, **then** the same panel remains open while XR and Timeline activate; a closed, unrelated, or Game Mode panel enters through Motion Control. **VCC:** `canvas.viewSelection.xrSurfaceMode` and `canvas.viewSelection.shared3dSurfaceModeOwner`.

### Workflow: XR Surface Activation

**Trigger**: User selects `xr` from Canvas View Mode toolbar or opens a document with `kgCanvasSurfaceMode: "xr"` frontmatter. **Actors**: Solo Dev, Canvas View Controller, Zustand Graph Store, Three.js Renderer.

**Happy Path**:
1. Solo Dev selects `xr` from the Canvas toolbar or imports a document with XR frontmatter → Canvas View Controller receives the mode change intent.
2. Canvas View Controller resolves the entry panel, preserving open Media or Skills & Commands ownership and otherwise selecting Motion Control, then normalizes `canvasRenderMode: "3d"` and `canvas3dMode: "xr"` → FloatingPanel remains invocation-ready and Zustand Graph Store updates state.
3. Three.js Renderer reactively mounts the XR spatial stage and excludes plain 3D globe effects → Solo Dev sees the XR inspection surface.

**Alternate Paths**: Already in XR mode, Canvas View Controller detects the mode is unchanged → no store mutation, no re-mount; workflow complete without render churn.

**Error Paths**:
- WebGL context lost: Three.js Renderer emits a context-lost event → Canvas displays a non-blocking recovery message and attempts context restoration on next user interaction.

**Postconditions**: `canvas3dMode === "xr"` in Zustand state; Three.js canvas renders XR spatial stage; no GraphData mutation occurred.

---

## Epic KXR-E2 - Model Asset Ingest And Render

### User Story

**KXR-E2-S1**: As a Solo Dev, I want imported `.glb`, `.gltf`, `.ply`, and `.spz` files to open as XR-ready workspace documents, so that model and spatial-capture inspection uses Source Files and Markdown Workspace rather than a separate asset manager.

### Acceptance Criteria

**KXR-E2-S1-AC1** - GLB manifest render gate
* **Given** a valid `.glb` model asset document, **when** XR Mode renders it, **then** the Three.js canvas remains mounted even if the document has no graph nodes and the shared model component renders the asset.
* > **VCC translation**: `Verify GLB component mounts and parses container validation flags under test:ci:unit`

**KXR-E2-S1-AC2** - GLTF manifest render gate
* **Given** a valid `.gltf` model asset document with source-relative external resources, **when** XR Mode renders it, **then** the GLTF payload preserves the source base path and the loader receives parseable JSON text.
* > **VCC translation**: `Verify source-relative base path resolution in GlbAssetModel.tsx passes validation`

**KXR-E2-S1-AC3** - Session-independent spatial inspection
* **Given** the browser does not support immersive WebXR sessions or a `.ply` / `.spz` source needs inline inspection, **when** the user opens an XR model or spatial-capture document, **then** the canvas renders the spatial stage with bounded caches, range-backed local/URL PLY previews, shared source-buffer reads, preview-first parsing, a preview-first paint gate before transferable full-fidelity promotion, a full-parse floor for validation-size captures, progressive source ordering, adaptive first-paint budgets, progressive GPU attribute upload, deferred splat resorting, and a non-blocking XR entry state.
* > **VCC translation**: `Verify inline XR canvas status plus workspace.import.xrSpatialCapture.* and canvas.xrMode.modelAssetRenderPayloadCache pass without hardcoded runtime validation paths`

### Workflow: Model Asset Import To XR Render

**Trigger**: Solo Dev imports a `.glb`, `.gltf`, `.ply`, or `.spz` file via Source Files, URL import, or drag-and-drop.
**Actors**: Solo Dev, Import Handler, Manifest Builder, Markdown Workspace, XR Renderer.

**Happy Path**:
1. Solo Dev triggers import → Import Handler validates file type and byte length.
2. Import Handler passes raw payload to Manifest Builder → Manifest Builder generates a Markdown model manifest with `kgAssetType: "model"`, `kgCanvasSurfaceMode: "xr"`, and validation metadata.
3. Manifest Builder registers the document in Markdown Workspace → Solo Dev sees the new model document.
4. Solo Dev opens the document → XR Renderer mounts the model in an inline XR spatial stage.

**Alternate Paths**:
- GLTF or spatial-capture source: Manifest Builder preserves the `kgAssetUrl` base path for external GLTF resources, records source identity and render cache keys for capture payloads, stores payload bytes outside Markdown, uses range-aware local/URL preview reads for binary PLY captures, and lets the renderer parse full source up to device caps while progressively raising visible splats and attribute-buffer views.
- Browser lacks WebXR: Renderer displays the inline canvas preview with `data-kg-canvas-xr-status="unsupported"` and disables the session entry button.

**Error Paths**:
- Invalid GLB magic number: Manifest Builder records `kgAssetValidGlbMagic: false` → Payload Helper rejects before loader input → Renderer shows structured error state.
- Invalid GLTF JSON: Manifest Builder records `kgAssetValidGltfJson: false` → Payload Helper emits parse error → Renderer shows structured error state.

**Postconditions**: A valid model manifest exists in Markdown Workspace; XR Renderer displays the asset in an inline spatial stage without requiring a WebXR session; invalid assets are rejected with recorded validation flags.

---

## Epic KXR-E3 - FOSS PNG To SVG To GLB Pipeline

### User Story

**KXR-E3-S1**: As a Solo Dev, I want a FOSS PNG-to-SVG conversion option before GLB compilation, so that logos, diagrams, icons, and UI snapshots can become lightweight vector geometry without paid design tools.

### Acceptance Criteria

**KXR-E3-S1-AC1** - FOSS vectorization harness
* **Given** a PNG input marked for XR conversion, **when** the conversion harness runs, **then** it validates file type and byte limit, chooses VTracer for color inputs or Potrace for black/white thresholded inputs, emits an SVG artifact, and records a zero-token cost log.
* > **VCC translation**: `Verify conversion harness returns correct paths and cost log contains zero token values`

**KXR-E3-S1-AC2** - SVG compile to GLB
* **Given** an SVG artifact from the harness, **when** the compile step runs, **then** it produces a GLB workspace model manifest with source provenance, deterministic dimensions, draw-call metadata, and GLB container inspection metadata.
* > **VCC translation**: `Verify GLB manifest is created with kgAssetFormat="glb", draw-calls, and triangle counts`

**KXR-E3-S1-AC3** - Raster fallback policy
* **Given** a PNG is photographic, noisy, too large, or unsuitable for vector tracing, **when** the conversion harness evaluates it, **then** it stores the PNG as a texture-on-plane GLB candidate or keeps it as rich media instead of pretending the raster image became real geometry.
* > **VCC translation**: `Verify output manifest specifies fallback_reason and sets geometry type to plane_texture`

### Workflow: FOSS PNG To SVG To GLB Conversion

**Trigger**: Solo Dev selects a PNG asset for XR conversion via workspace action or pipeline automation.
**Actors**: Solo Dev, Conversion Harness, VTracer/Potrace CLI, SVG Compiler, GLB Inspector, Manifest Builder.

**Happy Path**:
1. Conversion Harness validates the PNG input schema (file type, byte limit, image dimensions) → input accepted.
2. Harness selects VTracer (color) or Potrace (black/white) → CLI produces SVG artifact.
3. SVG Compiler sanitizes SVG, builds mesh geometry, exports GLB → GLB artifact created.
4. GLB Inspector measures byte length, draw calls, triangle count → inspect report generated.
5. Manifest Builder creates Markdown model manifest with provenance, inspection metadata, and `kgCanvasSurfaceMode: "xr"` → Solo Dev sees XR-ready model.

**Alternate Paths**:
- Path-count budget exceeded: Harness reduces VTracer precision settings and retries once → if still over budget, falls through to fallback path.
- Potrace selected for thresholded color input: Harness preprocesses with ImageMagick threshold before passing to Potrace.

**Error Paths**:
- PNG is photographic/noisy: Harness classifies input as unsuitable → stores original as texture-on-plane GLB candidate with explicit `fallback_reason` → no false vectorization.
- SVG contains unsafe content (scripts, external references): SVG Compiler rejects → structured error with `rejection_reason: "unsafe_svg"`.
- Generated GLB exceeds byte/draw-call budget: Inspector flags over-budget → manifest records budget violation for user review.

**Postconditions**: Either a valid GLB model manifest exists with source provenance and inspect metrics, or the original PNG is preserved with an explicit fallback reason; cost log records zero token spend; no proprietary tool invoked.

---

## Epic KXR-E4 - Cost, Token, And Performance Observability

### User Story

**KXR-E4-S1**: As an AI Orchestrator, I want every XR conversion and optional AI-assisted step to emit cost, token, and performance logs, so that XR Mode remains ROI-positive and does not hide token or GPU spend.

### Acceptance Criteria

**KXR-E4-S1-AC1** - Deterministic default has zero token spend
* **Given** the default PNG/SVG/GLB pipeline uses only local FOSS tools, **when** it completes, **then** token cost is logged as zero and monthly API cost remains zero.
* > **VCC translation**: `Verify cost_log.estimated_cost_usd is exactly 0 and no model calls are made`

**KXR-E4-S1-AC2** - Optional AI steps are harnessed
* **Given** a future AI-assisted asset step is enabled, **when** it calls a model, **then** input/output schemas are validated, token usage is logged, max iteration is one by default, and the circuit breaker rejects calls over budget.
* > **VCC translation**: `Verify schema validator blocks over-budget requests and loops terminate at maxIteration = 1`

**KXR-E4-S1-AC3** - Frame budget and asset budget gates
* **Given** an XR scene is loaded on desktop or mobile, **when** the renderer runs the inline canvas preview, **then** p95 frame work remains within budget and generated GLB assets stay under configured byte/draw-call thresholds.
* > **VCC translation**: `Verify preview remains stable under 16ms per frame and generated GLB file size is logged`

### Workflow: Cost And Token Observability

**Trigger**: Any XR conversion step or optional AI-assisted step completes execution.
**Actors**: Conversion Harness, AI Harness (future), Cost Logger, Budget Gate.

**Happy Path**:
1. Conversion step completes → Cost Logger emits `{ model: "none", prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0 }`.
2. Budget Gate validates output against configured byte/draw-call/frame thresholds → all within budget.
3. Metrics are persisted to cost log → aggregatable for sprint review.

**Alternate Paths**:
- AI-assisted step enabled (future): AI Harness validates input schema → calls model → validates output schema → logs actual token usage and cost → Budget Gate evaluates against token budget ceiling.

**Error Paths**:
- AI call exceeds token budget: Circuit breaker rejects the call before completion → cost log records the rejected attempt with `rejection_reason: "over_budget"`.
- Generated GLB exceeds asset budget: Budget Gate flags the violation → manifest is annotated with budget overrun for user review.

**Postconditions**: Every conversion step has a cost log entry; zero-token deterministic paths record explicit zeros; budget violations are surfaced, not hidden.

---

## Epic KXR-E5 - Blender-Inspired 3D Pipeline

### User Story

**KXR-E5-S1**: As a Solo Dev, I want XR Mode to compose modeling, rigging, animation, native physics projection, rendering, compositing, motion tracking, and video editing without giving presentation metadata ownership of simulation state.

### Acceptance Criteria

**KXR-E5-S1-AC1** - Frontmatter spec rendering
* **Given** a document with `kgAsset3dPipeline` metadata, **when** the canvas mounts in XR mode, **then** the R3F viewport reactively instantiates modeling procedural hulls, armature skinning, timeline animations, and post-rendering effects defined in the spec.
* > **VCC translation**: `Verify ThreeGraph mounts the pipeline coordinator and instantiates custom R3F geometry passes without throwing exceptions`

**KXR-E5-S1-AC2** - Procedural modeling & skinned edge rigging
* **Given** modeling and rigging configurations are declared, **when** nodes and edges are rendered, **then** nodes use parametric SDF hulls and curved edges skin their vertex groups dynamically onto multi-joint bone armatures.
* > **VCC translation**: `Verify bones hierarchies are initialized and vertex shader skins meshes according to joint weights`

**KXR-E5-S1-AC3** - Animation and native physics projection
* **Given** animation actions and a supported native physics world are active, **when** the caller advances a fixed step, **then** the physics owner publishes its dimension-specific body projection while the existing animation owner advances keyframe paths independently.
* > **VCC translation**: `Verify focused native-physics and XR runtime suites preserve fixed-step body projection without transferring Timeline or mixer ownership`

**KXR-E5-S1-AC4** - Compositing & video sequencer
* **Given** rendering effects and sequencer tracks are enabled, **when** playing the timeline, **then** the compositor blends background, graph, and UI render passes, while the sequencer executes rendering, text captions, and trace events in sync.
* > **VCC translation**: `Verify EffectComposer passes resolve to final viewport buffer and sequencer emits aligned timestamp events`

### Workflow: Blender-Inspired 3D Pipeline Activation

**Trigger**: User opens a document with `kgAsset3dPipeline` frontmatter metadata in XR Mode.
**Actors**: Solo Dev, Frontmatter Parser, Pipeline Coordinator, native physics adapter, Modeling/Rigging/Animation/Rendering/Compositing/Tracking/Sequencer modules, R3F Viewport.

**Happy Path**:
1. Frontmatter Parser extracts `kgAsset3dPipeline` object → validated against schema.
2. Pipeline Coordinator receives configuration → instantiates only the declared pipeline stages (e.g., modeling + animation, or rendering + compositing).
3. Active modules register their R3F hooks and shader passes → R3F Viewport renders the configured pipeline.
4. Solo Dev interacts with the spatial scene → pipeline stages respond reactively to state changes.

**Alternate Paths**:
- Partial pipeline: Only some presentation stages are declared (for example, `modeling` and `rendering`) → Coordinator activates only declared modules; native physics remains independently configured and undeclared presentation modules consume no resources.
- Default fallback: No `kgAsset3dPipeline` in frontmatter → Coordinator applies default PBR material and standard layout without custom pipeline stages.

**Error Paths**:
- Shader compilation failure: Rendering module catches WebGL shader error → falls back to default PBR material → logs the error with shader source reference.
- Invalid or non-finite simulation state: Native physics rejects the step before projection → the adapter retains the last accepted body state → the caller surfaces a typed local failure.

**Postconditions**: Presentation modules are instantiated per frontmatter spec; the R3F viewport renders configured stages; physics body state remains dimension-specific; shader or physics-adapter failures degrade gracefully without crashing the canvas.

---

## Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---|---|---|
| XR surface activation | Partial tests present | `canvas.viewSelection.xrSurfaceMode` and `canvas.renderSettings.xrModeSelect` pass | MVP |
| GLB/GLTF model import to XR | Partial tests present | GLB and GLTF render gates pass without WebXR session | MVP |
| PNG->SVG conversion TCO | n/a | $0/month fixed cost using FOSS tooling | MVP |
| Token cost / deterministic conversion | n/a | 0 prompt tokens, 0 completion tokens, $0/request | MVP |
| Generated GLB inspection | n/a | GLB inspect metrics stored per generated model; glTF Transform remains the optional optimizer/reporting CLI | MVP |
| Inline XR preview support | Partial | Nonblank canvas proof on desktop; graceful unsupported state on non-WebXR browser | MVP |
| ROI Score | n/a | >= 20 for Must-tier features | MVP |
| Token cost / month | $0 | $0 (fully FOSS local tracing default) | MVP |
| Monthly TCO | $0 | $0 (local developer environment execution) | MVP |

### ROI Calculation

Formula:
$$ROI Score = \frac{User Impact \times Reach}{Build Hours + Monthly TCO + Token Cost / Month}$$

| Feature | Impact | Reach/mo | Build h | TCO/mo | Token/mo | ROI | Priority |
|---|---:|---:|---:|---:|---:|---:|---|
| XR surface mode reuse | 5 | 80 sessions | 6 | 0 | 0 | 66.7 | Must |
| GLB/GLTF model manifest render | 5 | 60 sessions | 8 | 0 | 0 | 37.5 | Must |
| FOSS PNG->SVG harness | 4 | 40 conversions | 8 | 0 | 0 | 20.0 | Must |
| SVG->GLB compile + inspect | 4 | 40 conversions | 10 | 0 | 0 | 16.0 | Should |
| Blender-inspired 3D pipeline | 5 | 50 sessions | 24 | 0 | 0 | 10.4 | Should |
| Optional AI 3D reconstruction | 3 | 10 conversions | 24 | 30 | 15 | 0.4 | Won't for MVP |

## MoSCoW Priority

| Tier | Feature | ROI | Rationale |
|---|---|---:|---|
| Must | `xr` Canvas surface preset and Render Settings selection | 66.7 | Highest value per hour; already partially implemented |
| Must | GLB/GLTF workspace manifests render in XR Mode | 37.5 | Converts existing model import into immediate value |
| Must | FOSS PNG->SVG vectorization harness | 20.0 | Meets explicit FOSS and TCO requirement |
| Should | SVG->GLB compile with inspect metadata | 16.0 | Converts vectors into XR-ready model manifests with bounded runtime cost |
| Should | WebXR enter/exit panel with VR then AR support check | 12.0 | Progressive enhancement; inline preview remains primary |
| Should | Blender-inspired 3D pipeline spec & coordinator | 10.4 | Standardizes procedurals, rigging, and post-processing natively |
| Could | KTX2 texture compression for heavy models | 7.0 | Valuable when texture-heavy assets appear |
| Could | Optional AI caption/layout suggestions | 1.5 | Only if user value is proven and token budget is capped |
| Won't | Proprietary tracing or 3D SaaS conversion | 0.5 | Violates FOSS/TCO-zero unless future ROI is extraordinary |
| Won't | Photoreal 3D reconstruction from arbitrary PNG | 0.4 | Too high TCO and low determinism for MVP |

## Min-Viable Scope

MVP is complete when:
- `kgCanvasSurfaceMode: "xr"` activates `canvasRenderMode="3d"` and `canvas3dMode="xr"`.
- Imported GLB/GLTF documents render in inline XR mode without requiring a WebXR session.
- PNG conversion has a deterministic FOSS harness path to SVG with zero token spend.
- Generated or imported model assets carry inspectable metadata and a clear fallback reason when conversion is unsuitable.
- Existing renderer derivation remains the SSOT; XR Mode never forks GraphData.
- The declarative `kgAsset3dPipeline` coordinator configures supported presentation stages; physics configuration and stepping remain owned by the separate dimension-specific native physics contract.

## Dependencies

| Dependency | Type | TCO | FOSS / Vendor | Notes |
|---|---|---|---|---|
| Three.js | Runtime library | $0 | FOSS | Existing dependency; WebXR and GLTFLoader path |
| React Three Fiber | Runtime library | $0 | FOSS | Existing dependency; preserve Canvas ownership |
| glTF Transform CLI | Optional build/conversion CLI | $0 | FOSS | Optional inspect/optimize profile for generated GLB artifacts |
| VTracer | Conversion CLI/library | $0 | FOSS MIT | Default color PNG->SVG vectorizer |
| Potrace | Conversion CLI | $0 | FOSS | Black/white or thresholded raster tracing fallback |
| Blender headless | Optional conversion CLI | $0 | FOSS GPL | Only if Three.js exporter cannot satisfy bevel/extrusion quality |
| Cloudflare Pages/R2/D1 | Delivery/storage | $0 target | Platform service | Existing topology; no new deploy in this task |

## Open Questions

| Question | Owner | Decision Needed By |
|---|---|---|
| Which higher-fidelity SVG geometry profile should follow the deterministic plane compiler: Three.js extrusion, Blender bevel/extrusion, or both? | Solo Dev | Before visual-fidelity expansion |
| Should the 8 MB PNG input default be adjusted for mobile-first or bulk-import profiles? | Technical Reviewer | Before export integration |
| Should generated GLB assets be committed, stored in workspace storage, or treated as ephemeral build artifacts? | Solo Dev | Before export integration |
| Which WebXR device/browser pair is the canonical smoke-test target? | Solo Dev | Before live XR validation |
| Should a proven native physics workload move to a Web Worker after profiling shows a main-thread budget breach? Wasm and external compatibility APIs remain out of scope. | Technical Reviewer | Before worker execution |

---

# Part B - Technical Architecture Document

## Architecture Overview

**From source asset or graph to XR preview**: Source Files / Markdown Workspace -> frontmatter preset and model manifest parser -> shared graph/model payload -> Three.js scene -> inline XR spatial stage -> optional WebXR session.

XR Mode is a renderer variant over the existing display graph and model asset contracts. It does not own GraphData derivation, persistence, or deployment. It adds session entry, spatial staging, and asset-pipeline proof metadata around existing owners.

```mermaid
flowchart LR
  Source["Source Files / Import URL"] --> Manifest["Model or Graph Markdown Manifest"]
  Manifest --> Preset["Frontmatter Preset: kgCanvasSurfaceMode=xr"]
  Preset --> Canvas["Canvas Render Mode: 3d + canvas3dMode=xr"]
  Canvas --> Three["Three.js / React Three Fiber Surface"]
  Three --> Pipeline["3D Pipeline Coordinator"]
  Pipeline --> Mod["1. Modeling Engine"]
  Pipeline --> Rig["2. Rigging & Armatures"]
  Pipeline --> Anim["3. Animation Mixer"]
  Pipeline --> Sim["4. Native Physics Adapter"]
  Pipeline --> Rend["5. Post-Renderer"]
  Pipeline --> Comp["6. Compositing Graph"]
  Pipeline --> Track["7. Motion Tracker"]
  Pipeline --> Seq["8. Sequencer Editor"]
  Mod & Rig & Anim & Sim --> Three
  Three --> Inline["Inline XR Spatial Preview"]
  Inline --> Session{"navigator.xr supported?"}
  Session -->|yes + user activation| WebXR["Immersive WebXR Session"]
  Session -->|no| Fallback["Browser Canvas XR Preview"]
  Source --> PngHarness["FOSS PNG->SVG Harness"]
  PngHarness --> Svg["SVG Artifact"]
  Svg --> GlbCompile["SVG->GLB Compile + Optimize"]
  GlbCompile --> Manifest
```

## Journey To System Mapping

| Journey Stage | Workflow | Data Flow | Component |
|---|---|---|---|
| Trigger | Asset import | Raw file/URL -> workspace candidate | `workspaceImport/localImport.ts`, `workspaceImport/urlContent.ts` |
| Discover | Manifest creation | GLB/GLTF bytes/text -> Markdown manifest | `workspaceImport/glbAsset.ts` |
| Engage | XR surface activation | Frontmatter -> store mode update | `canvasViewActions`, `canvas3dMode.ts`, `canvasFrontmatterPreset` |
| Complete | Inline render / optional session | Manifest or GraphData -> Three.js scene -> XR session | `ThreeGraph.impl.tsx`, `GlbAssetModel.tsx`, `ThreeGraphXr.tsx` |
| Complete | 3D Pipeline instantiation | Frontmatter `kgAsset3dPipeline` -> coordinator -> active pipeline steps | `ThreeGraph.impl.tsx`, `XrPipelineCoordinator.ts` |
| Return | Optimized artifact reuse | SVG/GLB + inspect report -> workspace/export | XR asset conversion harness |

## Component Specifications

### Component: XR Mode Resolver
* **Responsibility**: Normalizes and preserves `xr` as a first-class 3D mode.
* **Interfaces**:
  * Input: `raw: unknown`
  * Output: `Canvas3dModeId = "3d" | "xr" | "voxel"`
  * Errors: Unknown values normalize to `"3d"`.
* **Dependencies**: `canvas/src/lib/canvas/canvas3dMode.ts`, config type owners.
* **Configuration**: None.
* **FOSS / Vendor**: Internal code; no vendor dependency.
* **VCC Conditions**:
  * `canvas.viewSelection.xrSurfaceMode` passes.
  * `canvas.renderSettings.xrModeSelect` passes.

### Component: Model Asset Manifest Builder
* **Responsibility**: Converts imported `.glb` and `.gltf` files into Markdown manifests with model metadata and XR surface activation.
* **Interfaces**:
  * Input: `{ name, sourceKind, sourceUrl?, buffer | text }`
  * Output: Markdown with `kgAssetType: "model"`, `kgAssetFormat`, validation metadata, and `kgCanvasSurfaceMode: "xr"`.
  * Errors: Invalid GLB magic or invalid GLTF JSON is recorded in frontmatter and rejected by payload helper before loader input.
* **Dependencies**: `workspaceImport/glbAsset.ts`, `glbAssetDocument.ts`, `gltfFormat.ts`.
* **Configuration**: Model format inferred from filename or caller.
* **FOSS / Vendor**: Internal code plus glTF open format.
* **VCC Conditions**:
  * `canvas.xrMode.glbAssetRenderGate` passes.
  * `canvas.xrMode.gltfAssetRenderGate` passes.
  * `canvas.xrMode.gltfIngestParseRenderPipeline` passes.

### Component: XR Three.js Renderer Surface
* **Responsibility**: Renders graph or model payloads in inline XR Mode and optionally attaches a WebXR session.
* **Interfaces**:
  * Input: `GraphData` or `GlbAssetDocument`, `Canvas3dModeId`, active/paused state.
  * Output: Three.js canvas with spatial stage; optional `XRSession`.
  * Errors: No WebGL or no renderable scene returns an empty bounded surface; no WebXR support returns a disabled entry state.
* **Dependencies**: `ThreeGraph.impl.tsx`, `Scene.impl.tsx`, `XrCanonicalPhysicsStage.tsx`, `XrMotionReferenceGraphStage.tsx`, `GlbAssetModel.tsx`, `ThreeGraphXr.tsx`.
* **Configuration**: Existing schema camera/layout settings; WebXR optional features `local-floor`, `bounded-floor`, and `hand-tracking`.
* **FOSS / Vendor**: Three.js and React Three Fiber, both FOSS.
* **VCC Conditions**:
  * `canvas.xrMode.graphSpatialStage` passes.
  * Browser smoke proves nonblank canvas for graph and model fixtures.

### Component: FOSS PNG To SVG Conversion Harness
* **Responsibility**: Converts suitable PNG assets into vector SVG artifacts using local FOSS tools with typed validation and cost logging.
* **Interfaces**:
  * Input schema:
    ```typescript
    interface InputSchema {
      source_path: string;
      source_mime: "image/png";
      byte_length: number;
      mode: "auto" | "color" | "bw";
      max_paths: number;
      max_output_bytes: number;
    }
    ```
  * Output schema:
    ```typescript
    interface OutputSchema {
      artifact_path: string;
      artifact_mime: "image/svg+xml";
      tool: "vtracer" | "potrace";
      path_count: number;
      fallback_reason?: string;
      cost_log: CostLog;
    }
    ```
  * Errors: Reject malformed input before tool execution; emit structured fallback for noisy, oversized, or photographic input.
* **Dependencies**: VTracer, Potrace, optional ImageMagick/Netpbm preprocessing.
* **Configuration**: Tool path, max input bytes, max output bytes, path-count budget, threshold policy.
* **FOSS / Vendor**: FOSS only. VTracer is the default for color PNGs; Potrace is fallback for black/white or thresholded line art.
* **Harness Contract**:
  * Input schema validated before conversion.
  * Output schema validated before artifact registration.
  * Cost log fields: `{ model: "none", prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0 }`.
  * Fallback path: keep original PNG as rich media or texture-on-plane GLB candidate with explicit `fallback_reason`.
* **Token Budget**: `0 + 0 @ 0 cache hits = $0/request`.
* **Orchestration Topology**: Sequential; max 1 vectorization attempt plus max 1 fallback classification pass; circuit breaker on input bytes, output bytes, and path count.
* **VCC Conditions**:
  * `canvas.xrAsset.pngToSvgHarness.vtracerZeroToken` passes.
  * `canvas.xrAsset.pngToSvgHarness.inputFallbacks` passes.
  * `canvas.xrAsset.pngToSvgHarness.pathBudget` passes.

### Component: SVG To GLB Compile Harness
* **Responsibility**: Compiles vector SVG artifacts into GLB models suitable for XR placement, then inspects them and optionally optimizes them.
* **Interfaces**:
  * Input schema:
    ```typescript
    interface InputSchema {
      svg_path: string;
      extrude_depth: number;
      bevel_size: number;
      target_format: "glb";
      optimization_profile: "web" | "xr-mobile";
    }
    ```
  * Output schema:
    ```typescript
    interface OutputSchema {
      glb_path: string;
      manifest_path: string;
      inspect_report_path: string;
      byte_length: number;
      draw_calls: number;
      triangle_count: number;
      texture_bytes: number;
      cost_log: CostLog;
    }
    ```
  * Errors: Reject unsafe SVG, invalid path geometry, or generated assets over budget.
* **Dependencies**: Deterministic headless GLB compiler in Dev; optional Three.js `SVGLoader` + GLTF exporter or Blender headless for higher-fidelity geometry; optional glTF Transform CLI for optimize/reporting.
* **Configuration**: Geometry precision, extrusion depth, bevel defaults, optimization profile.
* **FOSS / Vendor**: FOSS only.
* **Harness Contract**:
  * Deterministic input/output schemas.
  * No LLM call in MVP.
  * Cost log model is `"none"` unless a future AI assist is explicitly enabled.
* **Token Budget**: `0 + 0 = $0/request` for MVP.
* **Orchestration Topology**: Sequential: sanitize SVG -> build mesh -> export GLB -> inspect -> manifest. Optional optimize profile may run after inspect with max 1 retry; circuit breaker if optimized GLB still exceeds budget.
* **VCC Conditions**:
  * `canvas.xrAsset.svgToGlbCompiler.manifestInspect` passes.

### Component: XR Modeling Engine
* **Responsibility**: Generates procedural SDF and voxel geometries for canvas nodes.
* **Interfaces**: `generateNodeMesh(node: GraphNode, type: string): THREE.Mesh`
* **Dependencies**: Three.js, geometry/SDF generation helpers.
* **Configuration**: `modeling.nodeGeometry`, `modeling.hullResolution`.
* **FOSS / Vendor**: FOSS.
* **VCC Conditions**:
  * `canvas.xrPipeline.modelingRigging` unit tests pass.

### Component: XR Rigging & Skinning Engine
* **Responsibility**: Creates skeletal armatures and skins edge tube vertices onto bone chains.
* **Interfaces**: `createArmature(edges: GraphEdge[]): THREE.Skeleton`, `applySkinning(mesh: THREE.Mesh, skeleton: THREE.Skeleton): void`
* **Dependencies**: Three.js SkinnedMesh API.
* **Configuration**: `rigging.maxBonesPerEdge`, `rigging.vertexWeightMode`.
* **FOSS / Vendor**: FOSS.
* **VCC Conditions**:
  * `canvas.xrPipeline.modelingRigging` skeleton verification passes.

### Component: XR Animation Mixer & Interpolator
* **Responsibility**: Blends keyframe action tracks and applies easing functions reactively.
* **Interfaces**: `updateMixer(delta: number): void`, `playAction(name: string): void`
* **Dependencies**: Three.js AnimationMixer.
* **Configuration**: `animation.defaultTrack`, `animation.curveType`.
* **FOSS / Vendor**: FOSS.
* **VCC Conditions**:
  * `canvas.xrPipeline.animationSimulation` animation frame updates pass.

### Component: XR Native Physics Adapter
* **Responsibility**: Adapts normalized XR cuboid bodies and authored static colliders to the canonical 3D fixed-step owner, then projects accepted linear body state into the retained XR scene.
* **Interfaces**: Existing XR world normalization, explicit fixed-step, body read/capture, impulse, pose, reset, and contact projection contracts.
* **Dependencies**: `canvas/src/features/physics/spatialPhysicsEngine.ts`, `xrPhysicsModel.ts`, and `XrPhysicsStageRuntime.tsx`.
* **Configuration**: The persisted XR world contract owns gravity, fixed-step bound, floor, cuboid bodies, damping, material response, and collision masks.
* **FOSS / Vendor**: Independently authored Knowgrph code; Rapier packages and compatibility layers are forbidden.
* **VCC Conditions**:
  * Focused native 3D and XR runtime tests preserve deterministic stepping, swept cuboid contacts, impulses, pause/resume, and authored-scene retention.
  * The shared engine additionally proves sphere colliders, sensors, ordered events, queries, and versioned snapshots while the XR persisted adapter remains cuboid-based; rotation, torque, capsules, mesh/soft bodies, joints, and motors remain unclaimed.

### Component: XR Post-Rendering Stack
* **Responsibility**: Orchestrates post-processing passes (SSAO, Bloom, Depth of Field).
* **Interfaces**: `renderPasses(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void`
* **Dependencies**: Three.js EffectComposer.
* **Configuration**: `rendering.effects`, `rendering.bloomThreshold`.
* **FOSS / Vendor**: FOSS.
* **VCC Conditions**:
  * `canvas.xrPipeline.renderingCompositing` shader check passes.

### Component: XR Compositing Node Graph
* **Responsibility**: Blends background, graph core, and UI overlay passes.
* **Interfaces**: `compositeLayers(targets: THREE.WebGLRenderTarget[]): void`
* **Dependencies**: Three.js ShaderMaterial, custom compositing shaders.
* **Configuration**: `compositing.passes`, `compositing.colorGrade`.
* **FOSS / Vendor**: FOSS.
* **VCC Conditions**:
  * `canvas.xrPipeline.renderingCompositing` target blend verification passes.

### Component: XR Motion Tracker & Camera Solver
* **Responsibility**: Aligns virtual viewport camera with device orientation or WebXR anchors.
* **Interfaces**: `updateCameraPose(xrFrame: unknown): void`
* **Dependencies**: WebXR Device API.
* **Configuration**: `motionTracking.trackingSource`, `motionTracking.gestureControlsEnabled`.
* **FOSS / Vendor**: FOSS.
* **VCC Conditions**:
  * `canvas.xrPipeline.motionTrackingSequencer` pose solver test passes.

### Component: XR Sequencer Editor
* **Responsibility**: Aligns visual, textual, and trace event updates on a timeline.
* **Interfaces**: `seekSequencer(time: number): void`, `playSequencer(): void`
* **Dependencies**: Timeline track editor.
* **Configuration**: `sequencer.timelineTracks`, `sequencer.autoPlay`.
* **FOSS / Vendor**: FOSS.
* **VCC Conditions**:
  * `canvas.xrPipeline.motionTrackingSequencer` sequencer play runs cleanly.

---

## Data Flow: XR Surface Activation

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Frontmatter reader | Markdown YAML | `kgCanvasSurfaceMode` string | Workspace text | Ignore missing field |
| Transform | Canvas frontmatter preset | `"xr"` | `{ canvasRenderMode: "3d", canvas3dMode: "xr" }` | Store state | Unknown modes normalize |
| Store | Zustand graph store | Mode values | Renderer state | Local/session persistence | Existing store guards |
| Serve | Canvas viewport | Renderer state | Mounted Three.js surface | None | Empty bounded surface on unsupported WebGL |
| Consume | User | Inline canvas / XR entry | Spatial inspection | None | Unsupported WebXR shows non-blocking state |

## Data Flow: Model Asset Ingest

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Local/URL import | `.glb` bytes or `.gltf` text | Raw asset payload | Pending import buffer | Reject invalid fetch/file read |
| Transform | Manifest builder | Raw payload | Markdown manifest | Workspace document | Record validation flags |
| Store | Source Files / Markdown Workspace | Markdown text | Active document | Workspace storage | Pending materialization fallback |
| Serve | Model payload helper | Manifest | Loader input + base path | None | Reject invalid magic/JSON |
| Consume | `GlbAssetModel` | Loader input | Three.js scene object | Runtime only | Structured render fallback |

## Data Flow: FOSS PNG To SVG To GLB

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Conversion harness | PNG file | Validated input schema | Temp workspace | Reject non-PNG/oversized input |
| Transform | VTracer/Potrace | PNG/thresholded bitmap | SVG | Artifact folder | Fallback for noisy/path-heavy output |
| Transform | SVG compiler | SVG | GLB | Artifact folder | Reject unsafe SVG/invalid geometry |
| Transform | GLB inspector / glTF Transform | GLB | Inspect metrics and optional optimized GLB + report | Artifact folder | Fail if over budget |
| Store | Manifest builder | GLB + report | Markdown model manifest | Workspace document | Preserve original PNG/SVG provenance |
| Serve | Three.js renderer | Manifest | XR spatial preview | Runtime only | Inline preview still works without WebXR |

## Data Flow: Blender-Inspired 3D Pipeline

| Stage | Component | Input Format | Output Format | Persistence | Error Handling |
|---|---|---|---|---|---|
| Ingest | Workspace loader | YAML Frontmatter | `kgAsset3dPipeline` object | Workspace text | Ignore missing pipeline block |
| Transform | Pipeline coordinator | `kgAsset3dPipeline` | Configured R3F viewport parameters | Zustand store | Apply default PBR/layout settings on null |
| Store | Three.js Renderer | Configured params | Render pass graphs, Armature skeletons | WebGL context | Render blank stage on shader compiler error |
| Serve | R3F Viewport | Skeleton, mesh, and accepted native body projections | Screen/Headset frames | Runtime frame buffer | Retain the last accepted projection if the physics adapter rejects a step |
| Consume | User | Viewport frames | Interacted / inspected visual scene | None | Fallback to default render on target failure |

---

## Integration Contracts

### Interface: XR Frontmatter Preset

| Field | Type | Required | Meaning |
|---|---|---|---|
| `kgCanvasSurfaceMode` | string | yes | `"xr"` activates XR surface intent |
| `kgCanvasRenderMode` | string | recommended | `"3d"` ensures 3D render surface |
| `kgCanvas3dMode` | string | recommended | `"xr"` preserves XR variant |
| `kgAsset3dPipeline` | object | no | Declarative 3D pipeline specification |

### Interface: Model Asset Manifest

| Field | Type | Required | Meaning |
|---|---|---|---|
| `kgAssetType` | string | yes | Must be `"model"` |
| `kgAssetFormat` | string | yes | `"glb"` or `"gltf"` |
| `kgAssetEncoding` | string | yes for embedded assets | `"base64-body"` or `"json-body"` |
| `kgAssetMimeType` | string | yes | `model/gltf-binary` or `model/gltf+json` |
| `kgAssetBytes` | number | recommended | Raw asset byte length |
| `kgAssetValidGltfJson` | boolean | recommended | JSON parse validation |
| `kgAssetValidGlbMagic` | boolean | GLB only | GLB container validation |
| `kgAssetUrl` | string | URL imports | Source-relative base path for external resources |

### Interface: WebXR Session Entry

| Operation | Protocol | Input | Output | Errors |
|---|---|---|---|---|
| `isSessionSupported` | Browser WebXR API | `"immersive-vr"` then `"immersive-ar"` | boolean | Unsupported -> disabled entry state |
| `requestSession` | Browser WebXR API | session mode + optional features | `XRSession` | Permission/session error -> retry state |
| `setSession` | Three.js renderer XR manager | `XRSession` | active XR renderer | Failure -> structured error state |

### Interface: Conversion Cost Log

| Field | Type | Required | MVP Value |
|---|---|---|---|
| `model` | string | yes | `"none"` |
| `prompt_tokens` | number | yes | `0` |
| `completion_tokens` | number | yes | `0` |
| `cache_hits` | number | yes | `0` |
| `estimated_cost_usd` | number | yes | `0` |

---

## Quality Attributes

| Attribute | Scenario | Pattern | Validation |
|---|---|---|---|
| Performance | Inline XR preview opens on existing docs | Lazy Three.js surface; no runtime conversion | Browser smoke + nonblank canvas proof |
| Performance | GLB asset is large | GLB inspect gate; optional glTF Transform optimize gate | Inspect report under byte/draw-call thresholds |
| Stability | Switch 2D/3D/XR repeatedly | View-only mode changes; no GraphData mutation | Existing canvas mode tests |
| Security | SVG input may contain unsafe content | Sanitize and compile offline; no script execution | Unsafe SVG fixture rejected |
| Privacy | WebXR device tracking requires consent | Request session only from user button | Manual/browser test of user activation |
| Observability | Conversion path hides cost | Harness emits cost log for every run | Cost-log fixture |
| Token Cost | Deterministic conversion | No model call | Token cost fields are zero |
| TCO | Solo-dev MVP | Reuse existing stack; FOSS conversion | ADR cost review |
| Token Cost | Native 3D fixed steps | Bounded CPU step, zero model usage | Focused native physics and XR runtime validation |

---

## Deployment Strategy

This document is a source document only. Implementation should land in `knowgrph` Dev first, then follow the existing Dev -> Prod -> Cloudflare chain only when explicitly requested.

Release sequence:
1. Validate existing XR mode tests.
2. Add deterministic FOSS PNG->SVG harness behind explicit user action.
3. Add SVG->GLB compile and GLB inspect report; add glTF Transform optimize/reporting only when the artifact profile needs it.
4. Add the declarative `kgAsset3dPipeline` parser and R3F coordinator.
5. Add focused browser smoke for inline XR graph/model preview.
6. Publish only after user approval and standard sync checks.

Rollback:
- Disable conversion menu action while preserving existing GLB/GLTF import manifests.
- Keep `xr` frontmatter normalization but fall back to plain 3D rendering if XR stage fails.
- Do not delete source PNG/SVG artifacts on failed conversion.

---

## Component Inventory

| Layer | Component | File / Module | Status |
|---|---|---|---|
| Mode resolution | XR/Voxel/3D mode normalization | `canvas/src/lib/canvas/canvas3dMode.ts` | Present |
| Toolbar | Canvas View XR selection | `canvas/src/components/toolbar/canvasViewActions.ts` | Present |
| Settings | 3D mode select | `canvas/src/lib/panels/views/RenderSettingsSection.impl.tsx` | Present |
| Import | GLB/GLTF manifest builder | `canvas/src/features/markdown-workspace/workspaceImport/glbAsset.ts` | Present |
| Parse | Model asset manifest parser | `canvas/src/lib/assets/glbAssetDocument.ts` | Present |
| Payload | GLB/GLTF loader payload | `canvas/src/lib/assets/modelAssetPayload.ts` | Present |
| Renderer | Three.js Canvas surface | `canvas/src/lib/three/ThreeGraph.impl.tsx` | Present |
| Renderer | Model asset scene | `canvas/src/lib/three/GlbAssetModel.tsx` | Present |
| Renderer | Split XR stage owners | `canvas/src/features/three/{XrCanonicalPhysicsStage.tsx,XrMotionReferenceGraphStage.tsx}` | Native-only canonical owner; lazy authored Motion Reference owner |
| Renderer | WebXR entry panel | `canvas/src/lib/three/ThreeGraphXr.tsx` | Present |
| Harness | PNG->SVG conversion | `canvas/src/lib/xr/xrAssetConversion.ts` | Present |
| Harness | SVG->GLB compile + inspect | `canvas/src/lib/xr/xrAssetConversion.ts`, `canvas/src/features/markdown-workspace/workspaceImport/xrModelAsset.ts` | Present |
| Pipeline | 3D Pipeline coordinator | `canvas/src/features/three/pipeline/XrPipelineCoordinator.ts` | Proposed |
| Pipeline | Modeling & Rigging modules | `canvas/src/features/three/pipeline/modeling.ts`, `canvas/src/features/three/pipeline/rigging.ts` | Proposed |
| Pipeline / Physics | Proposed Animation module plus present native 3D/XR adapter | `canvas/src/features/three/pipeline/animation.ts`; `canvas/src/features/physics/spatialPhysicsEngine.ts`; `canvas/src/features/three/XrPhysicsStageRuntime.tsx` | Mixed: Animation proposed; Physics present |
| Pipeline | Post-rendering & Compositor modules | `canvas/src/features/three/pipeline/rendering.ts`, `canvas/src/features/three/pipeline/compositing.ts` | Proposed |
| Pipeline | Motion Tracking & Sequencer modules | `canvas/src/features/three/pipeline/tracking.ts`, `canvas/src/features/three/pipeline/sequencer.ts` | Proposed |
| Test | XR mode schema tests | `canvas/src/__tests__/canvas3dMode.test.ts` | Present |
| Test | XR asset conversion tests | `canvas/src/__tests__/xrAssetConversionHarness.test.ts` | Present |

---

# Architectural Decisions

## ADR-001: Reuse Existing Three.js WebXR Surface
**Status**: Accepted
**Date**: 2026-06-02

### Context
Knowgrph already ships Three.js and React Three Fiber, has lazy 3D chunk budgets, and has tests for XR mode normalization and model rendering. Adding a separate XR framework would increase bundle size, ownership complexity, and TCO.

### Decision
Reuse the existing Three.js / React Three Fiber surface and enable WebXR as progressive enhancement through `renderer.xr.enabled` and a session entry panel.

### Alternatives Considered
1. **Existing Three.js surface**: Lowest implementation cost; preserves current graph/model contracts; FOSS.
2. **A-Frame or Babylon.js**: FOSS and capable, but adds a parallel scene/rendering stack.
3. **Native OpenXR app**: Strong device support, but outside web deployment chain and high TCO.

### Rationale
The existing surface already renders graph and model data. XR Mode's highest ROI is to add spatial staging and session entry, not replatform rendering.

### TCO Impact

| Dimension | Chosen Option | Best FOSS Alternative | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (existing Three.js) | $0/mo (A-Frame) | $0 |
| Egress cost | Existing site delivery | Existing site delivery | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Vendor risk | Low (FOSS) | Low (FOSS) | — |

---

## ADR-002: GLB/GLTF Markdown Manifests Are The Workspace Contract
**Status**: Accepted
**Date**: 2026-06-02

### Context
Knowgrph Source Files and Markdown Workspace already use Markdown/frontmatter as the activation contract. Raw binary assets need validation, provenance, and renderer presets.

### Decision
Represent imported GLB/GLTF assets as Markdown model manifests containing validation metadata, embedded payload or source URL, and XR frontmatter presets.

### Alternatives Considered
1. **Markdown model manifest**: Reuses existing workspace, parser, Source Files, and renderer contracts.
2. **Raw asset table**: Cleaner binary storage, but creates a second workspace authority.
3. **External asset manager service**: Powerful, but high TCO and vendor/ops burden.

### Rationale
Manifests keep model assets queryable, inspectable, and compatible with existing Markdown/frontmatter workflows.

### TCO Impact

| Dimension | Chosen Option | Best FOSS Alternative | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (Markdown manifests) | $0/mo (raw asset table) | $0 |
| Egress cost | Existing asset delivery | Existing asset delivery | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| Vendor risk | Low (internal) | Low (internal) | — |

---

## ADR-003: FOSS PNG To SVG Uses VTracer Default And Potrace Fallback
**Status**: Accepted
**Date**: 2026-06-02

### Context
The user explicitly requires FOSS `png -> svg`. PNG is raster; SVG is vector. Real conversion requires tracing, and the right tool differs by input type.

### Decision
Use VTracer as the default for color PNGs and Potrace as the fallback for black/white or thresholded line art. Reject proprietary tracing in MVP.

### Alternatives Considered
1. **VTracer default**: FOSS MIT; handles color images and produces compact SVG paths.
2. **Potrace fallback**: FOSS; excellent for black/white bitmap tracing; requires preprocessing for color/greyscale inputs.
3. **Adobe Illustrator Image Trace or online converters**: Can be convenient but violates TCO-zero and vendor-control goals.
4. **Embed PNG inside SVG**: Not acceptable as vectorization; wraps raster data.

### Rationale
VTracer covers the most useful solo-dev asset set: colored logos, diagrams, low-noise illustrations, and pixel art. Potrace remains valuable for monochrome or thresholded technical drawings.

### TCO Impact

| Dimension | Chosen Option | Best FOSS Alternative | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (VTracer local CLI) | $0/mo (Potrace local CLI) | $0 |
| Egress cost | $0 | $0 | $0 |
| Token cost | $0 | $0 | $0 |
| Build/ops cost | Medium (two adapters) | Low (single adapter) | ~2h additional build |
| Vendor risk | Low (FOSS MIT) | Low (FOSS GPL) | — |

---

## ADR-004: Default XR Asset Pipeline Is Deterministic And Zero-Token
**Status**: Accepted
**Date**: 2026-06-02

### Context
AI-native products can accidentally hide recurring token/API cost in asset workflows. XR Mode should support optional AI later, but MVP value does not require model calls.

### Decision
Default XR asset conversion uses deterministic local/FOSS tooling only. Optional AI steps are out of MVP and must use a schema-validated harness with explicit token budgets.

### Alternatives Considered
1. **Deterministic FOSS conversion**: Zero token spend; predictable; lower TCO.
2. **AI-assisted SVG/3D generation**: Potentially higher visual quality; higher cost and variance.
3. **Hosted 3D generation API**: Fast demos; high vendor and token/API TCO risk.

### Rationale
The MVP goal is to make existing assets spatially inspectable. That can be achieved with zero-token deterministic tooling, preserving AI budget for higher-value orchestration.

### TCO Impact

| Dimension | Chosen Option | Best FOSS Alternative | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (local FOSS) | $0/mo (same) | $0 |
| Egress cost | $0 (local conversion) | $0 | $0 |
| Token cost | $0/mo | $0/mo | $0 |
| GPU/API cost | $0/mo | $0/mo | $0 |
| Vendor risk | Low | Low | — |

---

## ADR-005: Frontmatter-Driven Blender-Inspired 3D Pipeline
**Status**: Accepted
**Date**: 2026-06-17

### Context
Implementing a complex, multi-stage 3D pipeline natively in the rendering code can easily lead to hardcoded components and rigid rendering behaviors that drift from document-native representation.

### Decision
Expose presentation configuration for the 8-stage 3D pipeline reactively through `kgAsset3dPipeline` frontmatter. The Three.js/R3F viewport adapts supported modeling, armature, animation, and compositing stages. Physics state does not use that presentation schema: it remains under the independent dimension-specific native physics owners and their existing feature adapters.

### Alternatives Considered
1. **Document-native spec coordinator**: Retains universality and neutrality, mapping spec parameters to dynamic runtime components.
2. **Hardcoded client engine**: Fast to compile initially but results in a brittle codebase and violates "spec-complete -> runtime-ready" design patterns.
3. **External runtime scripts**: Embed custom JavaScript in the document body, but creates significant security and sandbox-escaping risks.

### Rationale
By moving the 3D pipeline settings into the Markdown document's frontmatter, we keep the codebase decoupled and generic, satisfying the TCO-zero, token economics, and agnosticism lenses.

### TCO Impact

| Dimension | Chosen Option | Best FOSS Alternative | Delta / 12 months |
|---|---|---|---|
| Infra cost | $0/mo (client-side only) | $0/mo (same) | $0 |
| Egress cost | $0 | $0 | $0 |
| Token cost | $0/mo (no model calls) | $0/mo | $0 |
| Build/ops cost | Low | Medium (hardcoded engine maintenance) | -4h/mo maintenance |
| Vendor risk | Low (FOSS) | Low (FOSS) | — |

---

# CID Directive Matrix

Each row is a project-scoped instantiation of the universal CID grammar applied to XR Mode concerns. Rows are sorted A→Z and contain no vendor references.

| Context | Intent | Directive |
|---|---|---|
| Acceptance | Define verifiable XR criteria | - [ ] Specify testable criteria expressible as VCCs; enable verification through existing canvas mode and asset conversion tests; forbid ambiguous XR requirements |
| Adaptability | Enable frontmatter-driven pipeline configuration | - [ ] Design pipeline stages configurably through `kgAsset3dPipeline`; enable runtime adaptation; forbid hardcoded pipeline constants |
| Architecture | Design XR component interactions | - [ ] Map XR component relationships through Journey-To-System table; design interactions via integration contracts; forbid undocumented dependencies |
| Boundaries | Define XR Mode scope | - [ ] Establish clear scope in In Scope / Out Of Scope sections; define XR-specific boundaries; forbid scope creep into proprietary tooling |
| Components | Specify modular pipeline units | - [ ] Define presentation boundaries for modeling, rigging, animation, rendering, compositing, tracking, and sequencing; keep native physics state in its dimension-specific owner; forbid monolithic or competing simulation owners |
| Data | Specify XR data flows | - [ ] Map data flows per epic (surface activation, model ingest, PNG->SVG->GLB, pipeline activation); forbid undocumented format transitions |
| Decisions | Document XR architectural rationale | - [ ] Record every ADR with TCO comparison and FOSS-first evaluation; forbid unexplained architectural choices |
| FOSS | Default to open-source XR dependencies | - [ ] Identify FOSS alternative before any proprietary selection (VTracer, Potrace, Three.js, R3F); document TCO comparison in ADR; forbid undocumented vendor lock-in |
| Harness | Wrap conversion calls in typed contracts | - [ ] Define harness input/output schemas for PNG->SVG and SVG->GLB; emit zero-cost log per deterministic call; specify fallback path; forbid raw unvalidated conversion calls |
| Journeys | Map XR user workflows | - [ ] Chart Solo Dev path from asset import through XR inspection; map journeys before writing stories; forbid feature-centric XR views |
| Min-Viable | Maximise XR value per scope unit | - [ ] Define smallest deliverable per Must-tier acceptance criterion; score ROI before expanding scope; forbid feature bloat without user-impact justification |
| Orchestration | Design bounded XR pipelines | - [ ] Specify sequential topology for conversion harnesses; set max-iteration bounds; forbid unbounded conversion loops |
| ROI | Justify XR feature investment | - [ ] Compute ROI score per feature before MoSCoW tier assignment; rank features by ROI; forbid zero-ROI items in Must/Should tiers |
| TCO | Make XR total cost explicit | - [ ] Estimate 12-month TCO for every XR dependency; document in ADR; forbid uncosted architectural decisions |
| Token Economics | Treat token spend as XR metric | - [ ] Estimate tokens per pipeline call (0 for MVP); track cost log; forbid pipelines without token budget estimates |
| Traceability | Link XR requirements to implementation | - [ ] Maintain requirement IDs (KXR-E*-S*-AC*); link to TAD components and VCC conditions; forbid orphaned requirements |
| Workflows | Map XR processes with full paths | - [ ] Define trigger, happy path, alternate paths, error paths, and postconditions per epic; forbid workflow-free XR features |

---

# Traceability And Goal Conditions

| PRD Requirement | TAD Component | Interface | `/goal` / VCC Condition |
|---|---|---|---|
| KXR-E1-S1-AC1 | XR Mode Resolver | Canvas View selection | `canvas.viewSelection.xrSurfaceMode` passes |
| KXR-E1-S1-AC2 | XR Mode Resolver | Render Settings select | `canvas.renderSettings.xrModeSelect` passes |
| KXR-E1-S1-AC3 | XR Three.js Renderer Surface | Scene mode mount | `canvas.xrMode.graphSpatialStage` passes |
| KXR-E2-S1-AC1 | Model Asset Manifest Builder | GLB manifest parser/payload | `canvas.xrMode.glbAssetRenderGate` passes |
| KXR-E2-S1-AC2 | Model Asset Manifest Builder | GLTF parser/payload | `canvas.xrMode.gltfAssetRenderGate` and `canvas.xrMode.gltfIngestParseRenderPipeline` pass |
| KXR-E2-S1-AC3 | XR Three.js Renderer Surface | WebXR entry panel | Browser smoke shows inline preview without session |
| KXR-E3-S1-AC1 | FOSS PNG To SVG Conversion Harness | Conversion schema | `canvas.xrAsset.pngToSvgHarness.vtracerZeroToken` passes |
| KXR-E3-S1-AC2 | SVG To GLB Compile Harness | Compile/inspect schema | `canvas.xrAsset.svgToGlbCompiler.manifestInspect` passes |
| KXR-E3-S1-AC3 | FOSS PNG To SVG Conversion Harness | Fallback schema | `canvas.xrAsset.pngToSvgHarness.inputFallbacks` and `canvas.xrAsset.pngToSvgHarness.pathBudget` pass |
| KXR-E4-S1-AC1 | Conversion Harness | Cost log | Cost log contains zero token and zero estimated cost |
| KXR-E4-S1-AC2 | Optional AI Harness | AI input/output schema | Deferred AI fixture rejects over-budget request before model call |
| KXR-E4-S1-AC3 | XR Renderer + Asset Optimizer | Smoke + inspect proof | Browser and inspect reports stay under budget |
| KXR-E5-S1-AC1 | XR 3D Pipeline Coordinator | Frontmatter loading | `canvas.xrPipeline.modelingRigging` tests pass |
| KXR-E5-S1-AC2 | XR Modeling & Rigging Engines | SDF mesh and armature skeletons | Skinned bone weights are applied and SDF meshes compile |
| KXR-E5-S1-AC3 | XR Native Physics Adapter + Animation owner | Fixed-step body projection and independent animation advancement | Native physics and XR runtime suites preserve owner separation and accepted body state |
| KXR-E5-S1-AC4 | XR Compositor & Sequencer | Composer passes and timeline playback | Compositor blends passes and sequencer emits synchronized updates |

---

# Validation Checklist

**Pre-Implementation (PRD)**:
- [ ] Valid YAML frontmatter present with `frontmatter_contract: "required"`
- [ ] Personas and user journey documented; every story anchored to a journey stage
- [ ] Workflows defined with trigger, happy path, alternate paths, error paths, and postconditions per epic
- [ ] Data flows typed at every stage boundary with persistence and error handling documented
- [ ] User stories follow "As a… I want… So that" format
- [ ] Acceptance criteria use Given-When-Then with observable outcomes
- [ ] Every acceptance criterion translatable to a VCC: one measurable end state + a stated check + scope constraints
- [ ] Features prioritized via MoSCoW with ROI score and rationale per feature
- [ ] Min-viable scope explicitly stated for Must-tier features before implementation begins
- [ ] Token budget estimated for every AI-powered pipeline: 0 for MVP deterministic paths
- [ ] Monthly TCO estimated for every dependency; FOSS-first decision recorded in ADR
- [ ] ROI score computed for every Must/Should feature using `(impact × reach) / (build + TCO + token cost)`

**Pre-Implementation (TAD)**:
- [ ] Components have single responsibility; interfaces specified with explicit contracts
- [ ] AI components have harness contract: typed input schema, typed output schema, cost log fields, fallback path
- [ ] Orchestration topology specified for every pipeline: sequential with max-iteration bound and circuit-breaker condition
- [ ] Architectural decisions documented with ADRs including TCO comparison table and FOSS alternative
- [ ] Architecture diagrams use Mermaid (not ASCII for >5 nodes)
- [ ] Component inventory table accompanies every architecture diagram
- [ ] PRD-to-TAD traceability established via `PRD-[Epic]-[Story] ↔ TAD-[Component]-[Interface]`
- [ ] VCCs recorded in TAD component specs and traced to source criteria
- [ ] No implementation detail in PRD; no business logic in TAD

**Post-Documentation Review**:
- [ ] Stakeholders validate PRD addresses user problems
- [ ] Development confirms TAD provides sufficient guidance
- [ ] QA confirms acceptance criteria are objectively testable
- [ ] Success metrics defined with baseline, target, and timeline
- [ ] Quality attributes specified with measurable scenarios; token cost and TCO attributes present
- [ ] Open questions resolved or formally tracked
- [ ] Token budget actuals vs estimates reviewed each sprint; projections updated on model pricing or traffic changes
- [ ] FOSS alternatives re-evaluated if any dependency TCO crosses the 12-month justification threshold

---

# Role—Action—Outcome

**Solo Dev / Founder** → validates problem, maps user journey, writes stories and acceptance criteria, applies MoSCoW with ROI scoring, defines min-viable scope, selects FOSS tools → produces user-centric PRD and drives high-ROI feature delivery at near-zero TCO.

**AI Orchestrator** → designs harness contracts for conversion pipelines, sets token budgets, validates cost logs, specifies orchestration topology with circuit breakers → ensures XR asset pipelines are observable, bounded, and ROI-positive.

**Technical Reviewer** → reviews TAD for feasibility, validates architectural patterns, confirms ADR TCO comparisons, verifies VCC traceability → ensures XR implementation is technically sound and guideline-compliant.

---

# Mantra Application

**"CID frames PRD/TAD standards · Flow patterns anchor stories to reality · RAO aligns team responsibilities · SVO clarifies requirement semantics · VCC closes the loop from criterion to verified implementation"**

- **CID frames**: establishes XR Mode scope (spatial inspection + asset conversion), purpose (user value through inline XR preview), rules (FOSS-first, zero-token default, frontmatter-driven pipeline)
- **Flow patterns anchor**: user journey (Solo Dev asset-to-XR), workflows (per-epic trigger→happy→alternate→error→postcondition), and data flows (surface activation, model ingest, PNG→SVG→GLB, pipeline activation) connect abstract XR requirements to observable system behavior
- **RAO aligns**: maps Solo Dev/Founder, AI Orchestrator, and Technical Reviewer to their respective documentation deliverables with clear accountability
- **SVO clarifies**: users import assets → harnesses convert deterministically → renderers display spatially → sessions enhance progressively — enabling unambiguous XR implementation
- **VCC closes**: every acceptance criterion (KXR-E*-S*-AC*) maps to a VCC condition in the Traceability table; the chain extends from PRD through TAD to autonomous verification via `/goal` conditions

---

# Reference Sources

- W3C WebXR Device API: `https://www.w3.org/TR/webxr/`
- Three.js WebXR examples and `GLTFLoader`: `https://github.com/mrdoob/three.js`
- glTF Transform CLI documentation: `https://gltf-transform.dev/`
- VTracer raster-to-vector converter: `https://github.com/visioncortex/vtracer`
- Potrace bitmap tracing documentation: `https://potrace.sourceforge.net/`
- PRD/TAD guideline source: `$GITHUB_ROOT/huijoohwee.github.io/guidelines/prd-tad-guidelines.md`
