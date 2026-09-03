---
title: "Goal: 100% agentic-graph Mobile-First Refactoring For E2E Rich Media Generation"
doc_type: "Goal Contract"
status: "active"
lang: "en-US"
frontmatter_contract: "required"
---

# Goal: 100% agentic-graph Mobile-First Refactoring For E2E Rich Media Generation

## Authoring Contract

- The opening YAML frontmatter block remains the first-block machine SSOT for this goal document's metadata, status, and scope.
- This document is a canonical authored goal contract, not a generated registry surface or typed validation fixture.
- Frontmatter stays in plain YAML so the file demonstrates the default authoring path for goals, acceptance criteria, and refactoring directives.
- If typed `{key, type, value}` envelopes are needed for ingest -> parse -> render validation, that coverage should live in a dedicated fixture doc rather than replacing canonical goal prose.
- Execution guidance, source-of-truth boundaries, and acceptance criteria must be derived from parsed frontmatter and document content only, never from file path assumptions or downstream mirrors.

Enhance agentic-graph into a Codex-compatible, mobile-first, end-to-end rich media generation system that can turn a user-provided brief into traceable text, image, video, and canvas artifacts while completing a full-codebase refactor. The work must improve the repo itself: runtime harness, provider abstraction, responsive canvas graph output, validation, recovery, documentation, runnable examples, source boundaries, semantic-cache ownership, chunk budgets, and stale-code removal.

The deliverable is not a single demo asset, a desktop-only canvas, or a cosmetic cleanup. The deliverable is a durable rich-media generation pipeline inside a fully refactored, measurable, and guard-railed agentic-graph codebase that can be run, resumed, judged, inspected, extended, built, audited, and used from narrow mobile screens through desktop and Cloudflare production without source-of-truth drift.

## 100% Refactoring Scope

The refactor covers the full upstream repository rooted at:

```text
$GITHUB_ROOT/agentic-graph
```

Execution topology is fixed for this goal:

```text
Dev SSOT: $GITHUB_ROOT/agentic-graph
Prod artifact mirror: $GITHUB_ROOT/huijoohwee/content/agentic-graph
Cloudflare route: airvio.co/agentic-graph
```

All source, config, tests, and docs must be corrected in Dev first. The Prod mirror and Cloudflare route receive only generated, synced, or explicitly documented artifacts after the upstream owner is correct.

Completion requires every active source, test, script, config, parser, shared package, documentation, and generated-source owner in the upstream repo to satisfy the same rules. Downstream mirrors, publish directories, and schema mirrors may be updated only after the upstream owner is correct.

The refactor is complete only when:

- Active source files are under 600 lines each.
- Active text/code chunks are under 500 KiB each.
- Built production JavaScript and CSS chunks are under 500 KiB each.
- Existing over-budget files are split at stable ownership boundaries instead of exempted permanently.
- New files and changed files cannot regress the budget gates.
- Duplicate implementations, stale aliases, compatibility shims, legacy remaps, hardcoded fixtures, and conflicting branches are removed rather than preserved.
- Graph, workspace, geospatial, storyboard-widget, markdown, parser, provider, storage, and canvas cache keys reuse the shared semantic-key helper where semantic equivalence is the authority.
- Expensive work is batched, cached, lazy-loaded, virtualized, deferred, or sharded at the source owner instead of patched downstream.
- Re-render, re-calculation, stale replay, infinite-loop, and freeze risks are neutralized where state originates.
- User-facing surfaces are mobile-first: narrow viewports must get the primary interaction path first, then progressively expand into tablet, desktop, and wide-canvas layouts.
- Responsive layout behavior is driven by shared viewport, density, panel, and widget placement policy, not by component-local breakpoints, duplicated CSS constants, or route-specific overrides.
- Focused tests, build checks, hygiene gates, and docs prove each completed slice.

Until the full `hygiene:audit` is green, `hygiene:check` and `hygiene:chunks` are the anti-regression gates, and `hygiene:audit` is the backlog authority.

## Non-Negotiables

- Do not copy implementation, wording, names, architecture files, or project structure from any external repository. External projects may inspire broad orchestration ideas only.
- Keep the system universal, neutral, and project-agnostic. It must operate on user-provided briefs, canvas graphs, tool schemas, and media providers without assuming any particular campaign, product, document, filename, fixture, repository path, brand, geography, language, model vendor, or demo story.
- Tests must not pass because of hardcoded in-repo demo content or absolute local paths. Neutral fixtures are allowed; specific demo documents are allowed only as manually supplied runtime inputs.
- Codex must be a first-class execution surface. A reviewer must be able to run the E2E pipeline from Codex using the goal, CLI, MCP, or documented commands.
- Baseline validation must work offline with deterministic mock providers. Real provider execution may require credentials, but the repo must remain testable without network or paid services.
- Generated media and canvas artifacts must be provenance-linked to the goal, source brief, plan, tool calls, and verification checks.
- Refactor fixes must land at the root/source/upstream owner. Do not layer local patches, downstream remaps, alias stacks, or backward-compatibility shims over stale behavior.
- Every cleanup must remove the stale/conflicting path completely when the canonical replacement exists.
- Files that remain above 600 lines after a slice must have an explicit next split target, not an implicit exemption.

## Operating Hygiene Contract

Every slice must stay lean, MVP-shaped, single-source-of-truth, mutually exclusive, collectively exhaustive, and single-responsibility.

Code rules:

- Keep active source files under 600 lines and active text/code chunks under 500 KiB.
- Use meaningful names; abbreviations are allowed only for conventional loop indexes such as `i`, `j`, and `k`.
- Comments explain why a decision exists, not what the next line already says.
- Prefer early returns, shallow control flow, and explicit failure handling over deep nesting or silent fallback.
- Centralize config, constants, storage keys, renderer ids, provider ids, path policy, and route policy.
- Reuse shared utilities and declared package entrypoints before adding local helpers.
- Choose data structures and abstractions that fit the real ownership boundary; do not introduce generic layers without repeated pressure.
- Remove duplication, circular dependencies, hardcoded fixtures, hidden absolute paths, local alias remaps, and compatibility shims.

Pipeline rules:

- Batch, cache, chunk, virtualize, shard, lazy-load, or defer expensive work at the root owner.
- Parallelize independent work where it is bounded and observable.
- Release timers, listeners, object URLs, workers, database handles, and subscriptions promptly.
- Treat async state as a race boundary: guard stale writes, latest-result ownership, duplicate in-flight work, resume replay, and cross-tab or multi-worker effects.
- Treat resize, orientation change, drawer transitions, virtual keyboard resize, safe-area insets, and panel open/close transitions as first-class race boundaries.

Validation rules:

- Test focused diffs only unless a broader run is required by the touched ownership cluster.
- Avoid indefinite full-codebase runs; every validation command must have a bounded scope or known termination.
- Resolve discovered issues in the upstream owner, then rerun the focused proof that catches the bug class.
- Verify no regression through the closest hygiene, unit, integration, build, or docs-sync gate that covers the change.

## Refactoring Workstreams

The 100% refactor proceeds by ownership cluster, not by random line-count shaving:

1. Storyboard Widget and FlowCanvas runtime: split layout, collision, edge routing, media overlay, zoom, and scene state into single-responsibility modules with bounded recalculation.
2. GraphCanvas and 3D runtime: split scene, simulation, positioning, group geometry, minimap, and render-order logic around shared semantic keys and lazy-loaded runtime chunks.
3. Markdown workspace and source-files pipeline: isolate automated default bootstrap, manual source-file actions, indexing, source-file ingest, composed graph replay, storage sync, and stale-guard logic so one source controls active content.
4. Rich media, provider, and parser pipeline: keep text/image/video contracts provider-agnostic, remove hardcoded demo assumptions, and split oversized parser/provider files by schema and execution concern.
5. Geospatial and cross-package integration: use declared package entrypoints and shared utilities only; remove arbitrary subpath imports, duplicated constants, and downstream bridge drift.
6. Tests and fixtures: split large tests by behavior, replace hardcoded path/story fixtures with neutral builders, and delete stale regression cases once the upstream bug class is impossible.
7. Mobile-first responsive app shell: make MainPanel, FloatingPanel, Editor Workspace, Canvas, Rich Media Panel, toolbars, status surfaces, and generated widgets usable from a 320px-wide viewport before expanding to desktop.
8. Docs, goals, and publish/schema mirrors: update canonical upstream docs first, then regenerate or sync downstream copies from source.

## Refactoring Acceptance Criteria

The codebase refactor is complete only when:

- `npm run hygiene:check` passes.
- `npm run hygiene:chunks` passes after a production build.
- `npm run hygiene:audit` passes for the full upstream repo.
- Focused tests for each touched ownership cluster pass.
- `npm run pages:build` passes without production assets over 500 KiB.
- TypeScript and Python validation pass for touched TypeScript and parser surfaces.
- No active implementation or test depends on legacy aliases, local compatibility remaps, stale fixtures, hidden absolute paths, or duplicated source-of-truth copies.
- Mobile, tablet, desktop, and wide-canvas behavior is controlled by one responsive policy layer with focused regression proof for narrow viewport interaction, canvas fit, widget visibility, edge readability, panel stacking, and Cloudflare route parity.
- Cross-repo docs and API/schema mirrors are updated from the canonical upstream source after the upstream refactor is green.

Post-task documentation must update the canonical upstream docs first, then the active `agentic-canvas-os/todo/YYYY-MM.md` planning shard, any matching API reference, responsive contract note, or cross-repo schema mirror. The expected handoff surfaces are `agentic-canvas-os/docs/TODO.md`, `agentic-canvas-os/todo/`, `agentic-graph/docs/`, and `huijoohwee.github.io/schema/AgenticRAG`.

## Source File Management Contract

Source Files are the Editor Workspace's active content boundary. Automated default management and manual management must share one SourceFile record contract, one canonical path policy, one storage sync contract, and one recomposition path. They must differ only in how intent is initiated and confirmed.

Default automated management is the baseline path:

- Empty or freshly seeded workspaces must hydrate Source Files automatically from the canonical upstream source chain without asking the user to import local files.
- In single-user canonical-docs mode, `huijoohwee/docs/**` is the filesystem authoring SSOT, Cloudflare D1 workspace `kgws:canonical-docs` is the shared remote store, and the app hydrates through the storage export/doc-view/persisted-cache path.
- Dev changes originate in `$GITHUB_ROOT/agentic-graph`; publish output syncs to `$GITHUB_ROOT/huijoohwee/content/agentic-graph`; Cloudflare production at `airvio.co/agentic-graph` consumes the generated Prod artifact and D1-backed storage routes.
- Default Source Files must be deduped by canonical source path and semantic content hash, not by display name, import order, local absolute path, or stale alias.
- Automated sync owns bootstrap, D1 pull/push, persisted-cache hydration, docs mirror hydration, source-file indexing, composed graph replay, and stale-guard recovery as one observable pipeline.
- Automated updates must not overwrite a locally edited manual Source File silently. They must preserve the manual edit, surface a conflict, or require an explicit user action to replace, merge, or discard.
- D1 seeding and verification must use the storage API or remote D1 tooling, never the app's Import local files UI as a hidden default path.

Manual management is explicit user intent:

- Manual actions include New Source File, Import URL, Import local files, paste/edit/save, rename, delete, enable/disable, geo-layer toggle, parse/reparse, folder selection, Source Files context-menu Share URL, and explicit conflict resolution.
- Manual actions must be visible in the UI, recorded through the same store/update path as automated changes, and reflected in composed graph state without duplicate replay logic.
- Import local files is allowed only as an explicit manual action. It must never be used to mask missing automated D1/docs bootstrap behavior.
- Manual imports must retain provenance, original source kind, source URL or user-visible local path label, content hash, parse status, and error state without introducing hidden absolute-path dependencies into tests or persisted cross-device records.
- Manual deletion or disabling must be respected by automated refresh unless the user explicitly resets the workspace, re-enables the default seed set, or accepts a remote replacement.
- Manual and automated records must converge through the same conflict UX, toast/log reporting, storage outbox handling, and stale-write guards.

Crawler access is read-only storage exposure:

- AI crawler and non-JavaScript clients must be able to discover Editor Workspace Source Files through storage-owned crawler entrypoints, including `/api/storage/llms.txt` and `/api/storage/source-files`, without running the SPA or using Import local files.
- Crawler entrypoints must derive document links, canonical source paths, content hashes, revisions, and updated timestamps from the same D1 document rows and doc-view route used by storage export/doc hydration. They must not depend on display name, local absolute path, demo filename, downstream host patch, stale alias, or generated fixture content.
- Cloudflare AI Crawl Control Pay Per Crawl compatibility must be described as a zone-owned policy boundary: unpaid AI crawler access can be negotiated by Cloudflare through HTTP 402 and `crawler-price`, while successful paid access can return HTTP 200 with `crawler-charged`.
- The agentic-graph storage Worker must not emulate payment headers, prices, crawler identity, or paywall decisions in app code.
- Opening crawler entrypoints must be read-only and must not upload, recompute, reparse, rehydrate, or rerender Source Files.

Source-file sharing is explicit publish intent:

- Toolbar -> Launch -> Editor Workspace -> Source Files -> right-click "Share URL" must generate or copy a shareable URL for the selected SourceFile through the same canonical SourceFile record, storage sync contract, provenance metadata, and conflict/stale-write guards used by automated and manual source-file updates.
- Share URL identity must be derived from the canonical workspace/source path, semantic content hash, storage workspace id, and shared semantic-key helper. It must not be derived from display name, context-menu order, import order, local absolute path, demo filename, route-specific host, stale alias, or legacy remap.
- Opening the context menu must not upload, recompute, reparse, rehydrate, or rerender the SourceFile. Share work starts only from the Share URL command, dedupes in-flight requests by semantic share key, reuses already-synced content when the hash matches, and bounds network/storage retries.
- Share URL state must be observable and race-safe: pending, copied, unavailable/offline, conflict, stale-local-edit, and failed states surface through the shared toast/log/status path without silently overwriting local edits or publishing stale remote content.
- Dev owns the implementation and tests. Prod mirror and Cloudflare behavior must come from the upstream storage/share owner after build/sync/publish, not from route-specific downstream patches.

The implementation boundary is source-owned:

- Keep config keys, storage route paths, canonical docs workspace ids, docs-only policies, debounce intervals, and copy strings centralized in their current SSOT modules.
- Remove legacy source-file aliases, downstream path remaps, duplicate import buttons, stale bundled seed fallbacks, and compatibility shims once the canonical automated/manual path covers the behavior.
- Do not add route-specific fixes in the Prod mirror or Cloudflare artifact. Fix stale source-file behavior in Dev owners, then build/sync/publish.
- Treat source-file hydration, parsing, composed graph replay, D1 sync, cross-tab updates, and workspace reset as race boundaries with latest-result guards and bounded retries.
- Keep source-file tests neutral: no hardcoded external absolute paths, no dependence on one local docs folder being manually imported, and no assertions that pass only because a demo document is already present.

Required source-file acceptance criteria:

- A clean Editor Workspace opens with the default automated Source Files present from the D1/docs storage path, including the full Markdown content and matching content hashes.
- Manual creation, import, edit, delete, enable/disable, parse, and conflict-resolution paths continue to work after automated hydration is enabled by default.
- Automated default sync and manual source-file actions share the same SourceFile normalization, storage sync, recomposition, provenance, and stale-guard utilities.
- Focused tests prove crawler Source Files discovery and `llms.txt` access are served from D1-backed storage/doc-view metadata, hide deleted records, and link to the latest canonical markdown content without local imports or route-specific patches.
- Source Files context-menu Share URL is available from Toolbar -> Launch -> Editor Workspace -> Source Files, reuses the canonical SourceFile storage/share owner, dedupes by semantic share key, copies a URL only for the latest non-conflicting content, and never depends on a local absolute path, demo fixture, stale alias, or downstream host patch.
- Focused tests prove default D1/docs hydration, manual import isolation, duplicate canonical-path suppression, local-edit conflict protection, source-file recomposition, and stale remote-pull rejection.
- Focused tests prove Share URL generation/copy behavior, offline/unavailable reporting, in-flight dedupe, stale-edit conflict protection, and absence of upload/reparse/rerender work when merely opening the Source Files context menu.
- Cross-repo docs and API/schema notes describe the automated default path, the manual-only Import local files boundary, and the Dev -> Prod -> Cloudflare ownership chain.

## App Surface Contract

The E2E rich media generation pipeline must be usable and inspectable through the full agentic-graph app surface:

```text
MainPanel Integrations -> FloatingPanel Chat UI -> Editor Workspace -> Canvas -> Balanced 16:9 (1920x1080) Layout for Widgets (Text, Image, Video) AND Rich Media Panel AND Edges
```

This means the pipeline must not stop at backend artifact creation. It must produce artifacts and metadata that can move from integration configuration, through FloatingPanel chat-driven orchestration, into the editor workspace, onto the canvas, into flow widgets, through readable edges, and finally into the Rich Media Panel render surface.

The visual canvas contract is mobile-first and responsive:

- Treat 320x640, 390x844, 768x1024, 1366x768, and 1920x1080 as required responsive proof classes for generated rich media frontmatter-flow artifacts.
- Treat 1920x1080 as the canonical logical presentation frame, then derive mobile/tablet/desktop fits from the same layout metadata instead of maintaining separate hardcoded scenes.
- On mobile, prioritize one primary task at a time: integration setup, chat orchestration, editor review, canvas inspection, widget detail, and Rich Media Panel playback must stack or sheet predictably without hidden controls.
- Keep Text, Image, Video, and Rich Media Panel widgets visible, proportionally sized, non-overlapping, x/y/z-indexed, and centroid-centered inside the active viewport or reachable through explicit fit/overview controls.
- Keep data-flow edges readable and routed between the widgets and Rich Media Panel ports without crossing directly through the center of widget content when a better route is available.
- Preserve responsive layout metadata so it can be inspected, replayed, and adapted across viewport sizes without hardcoding a demo document or absolute path.
- Use these layouts as validation targets, not as one-off fixed scenes. Other briefs must be able to reuse the same mobile-first balanced layout rules.
- When Canvas View Mode changes the active surface, the same graph, widget, edge, provenance, and responsive metadata must travel across 2D, 3D, XR, voxel, and geospatial surfaces without introducing route-specific branches.

## Mobile-First Responsive Design Contract

Mobile-first means the narrowest useful viewport owns the baseline interaction contract. Wider layouts may reveal more simultaneous surfaces, but they must not be the only place where core work is possible.

Required behavior:

- MainPanel Integrations must collapse to a narrow, touch-safe setup flow with reachable provider fields, validation states, and action buttons.
- FloatingPanel Chat UI must remain usable above mobile keyboards, preserve conversation context, and avoid scroll traps when streamed output or tool traces update.
- Editor Workspace must provide readable Markdown, source-file, and generated workspace review without overlapping the toolbar, bottom surface, or canvas.
- Canvas must preserve pan, zoom, fit-to-content, selection, widget, and inspect actions through touch and pointer input without mounting duplicate preview surfaces.
- Rich Media Panel must support mobile playback and inspection with declared aspect ratio, visible fallback states, and no offscreen-only controls.
- Generated Text, Image, Video, and Rich Media Panel widgets must expose responsive bounds, min sizes, fit strategy, edge anchor policy, and overflow behavior in metadata.
- Toolbar, status, toast, modal, menu, drawer, and panel shells must share responsive tokens for safe areas, hit targets, z-index, density, and motion.
- Cloudflare production at `airvio.co/agentic-graph` must use the same responsive source behavior as Dev and Prod mirror artifacts; no route-specific mobile fixes are allowed downstream.

Forbidden behavior:

- Desktop-only acceptance, hidden mobile controls, viewport-specific hardcoded coordinates, route-specific CSS overrides, duplicate mobile component trees, downstream publish patches, and legacy aliases that keep stale layout behavior alive.
- Silent clipping, inaccessible fixed-position controls, unbounded resize observers, per-frame React state churn, layout jumps during panel transitions, or canvas redraw loops triggered by mobile keyboard/orientation changes.

## External Validation Inputs

User-provided validation briefs may live outside this repository and may be passed to CLI, MCP, Codex, or app entrypoints at runtime.

Use external validation documents only when explicitly supplied for a run. Do not hardcode their absolute paths, repository locations, filenames, narrative details, brands, geography, or story content into source code, tests, fixtures, package scripts, MCP defaults, generated templates, or documentation. The repo must pass neutral in-repo validation without any external brief, then also accept a supplied path as runtime input.

## Canvas XR Mode Contract

XR Mode is a first-class Canvas surface selected through:

```text
Toolbar -> Canvas View Mode -> Surface Mode -> XR Mode
```

Required behavior:

- XR Mode is represented by shared renderer mode state and schema-compatible configuration, not by a document-specific route, fixture, local file path, or demo story switch.
- Toolbar -> Launch model-asset actions must support both `.gltf` and `.glb` through the same neutral Source Files path: Import local files, Import URL, and Export must preserve the selected format instead of converting through Markdown suffixes, demo filenames, or absolute-path assumptions.
- Local `.gltf` and `.glb` imports must avoid editor freezes by keeping large model payloads out of eager Source Files hydration while retaining enough pending metadata for Canvas XR/3D render activation.
- URL `.gltf` and `.glb` imports must ingest into renderable model-asset manifests with provenance and validation metadata; remote or local URL handling must not hardcode a host, path, repository, or demo asset.
- Export from the active 3D/XR canvas must expose both embedded-JSON GLTF (`.gltf`) and binary GLB (`.glb`) outputs from the same scene snapshot owner.
- The model-asset E2E path must be traversable as one neutral contract: import or URL ingest produces a manifest, the shared payload helper resolves JSON/binary bytes and resource base paths, `GLTFLoader` parses the payload, and XR Mode renders the loaded scene plus any embedded animation clips without requiring a WebXR session gate.
- The active canvas graph, widget handles, edge routing, provenance metadata, selection state, and responsive layout metadata remain inspectable when XR Mode is selected.
- XR Mode may be inspired by broad external XR and animation concepts only: renderer-owned XR readiness/session state, presentation status, camera/controller/hand input handles, and animation-loop lifecycle; timeline-style transition orchestration with seekable/pauseable stages; and declarative scene metadata with composable entity behavior. Do not copy external implementation code, markup, API naming as internal architecture, component names, examples, file structure, copy, or project architecture from Three.js/WebXRManager, Anime.js, A-Frame, or any other source.
- XR entry is capability-gated and user-gesture driven. Available, unavailable, blocked, entering, presenting, exited, and failed states must be represented through neutral Canvas/XR status metadata. Unsupported browsers, blocked permissions, unavailable devices, and non-secure contexts must fall back to an inspectable 3D canvas surface with explicit status rather than a blank canvas or crash.
- Pointer, mouse, keyboard, touch, and XR-controller selection must share neutral input semantics where feasible, with no browser-specific fork unless a tested platform bug requires a bounded guard.
- Baseline tests must prove the toolbar path can select XR Mode and that external XR demo briefs are runtime inputs only, never hardcoded repo dependencies.

## Target E2E Capability

Given a neutral brief and optional existing canvas graph, agentic-graph should:

1. Ingest the goal, source brief, constraints, media requirements, and available provider configuration.
2. Plan a text → image → video → canvas workflow with explicit dependencies, budgets, retries, and termination criteria.
3. Generate or mock text artifacts: scene plan, captions, narration, prompts, metadata, and final copy.
4. Generate or mock image artifacts: reference frames, prompt metadata, dimensions, media type, and provenance.
5. Generate or mock video artifacts: storyboard or rendered video output, reference media links, duration, aspect ratio, and provenance.
6. Compose a canvas graph containing typed text, image, video, Rich Media Panel, verification, and report nodes with data-flow/provenance edges.
7. Emit a agentic-graph frontmatter-flow workspace artifact that can travel the app route: MainPanel Integrations -> FloatingPanel Chat UI -> Editor Workspace -> Canvas -> Mobile-first responsive layout for Widgets (Text, Image, Video) AND Rich Media Panel AND Edges, including the balanced 16:9 (1920x1080) proof class and the optional Surface Mode -> XR Mode proof path.
8. Persist state, trace, observations, artifacts, recovery events, and a final report.
9. Verify media references, canvas topology, Rich Media Panel wiring, trace completeness, restartability, and neutrality.
10. Stop deterministically when acceptance criteria pass, a recorded blocker is reached, or configured budgets are exhausted.

## Required Runtime Concepts

Implement or maintain the following as first-class, inspectable concepts:

- `Goal`: user intent, constraints, output contract, quality bar, budget, and stop rules.
- `Run`: unique run id, status, timestamps, active plan version, budget use, current phase, and final result.
- `Step`: atomic planner, agent, tool, verification, recovery, or synthesis action.
- `Tool`: typed input/output schema, timeout, retry policy, error taxonomy, and structured observation.
- `Agent`: role, task contract, allowed tools, memory scope, artifact responsibility, and completion signal.
- `Provider`: mock and real implementations behind the same text/image/video contracts.
- `Memory`: durable run memory plus optional long-term summaries, dedupe, and provenance.
- `Artifact`: text, image, video, canvas graph, preview, report, or trace file with source step metadata.
- `Judge`: deterministic validation checks plus optional model-assisted critique that cannot override hard failures.
- `Recovery`: retry, degrade, skip-with-evidence, ask-for-human-only-when-blocked, and resume behavior.

Prefer simple, inspectable modules over hidden behavior. A reviewer should be able to follow the pipeline from goal intake to final artifact without guessing.

## Agent Loop

The core loop must be explicit:

1. Normalize goal, source brief, constraints, and output contract.
2. Inspect workspace, provider configuration, and available tools.
3. Create or update the plan.
4. Select ready tasks based on dependencies.
5. Dispatch tasks to workers or tools with typed contracts.
6. Record observations, costs when available, and artifacts.
7. Verify completed work.
8. Decide whether to continue, retry, recover, replan, resume, or terminate.
9. Produce a final answer/report with artifact links and trace summary.

The loop must be bounded by configurable limits such as maximum wall time, maximum steps, maximum retries per task, maximum concurrent workers, and provider-specific cost or token budgets.

## Rich Media Generation Requirements

Text generation must support:

- Scene planning from arbitrary briefs.
- Captions, narration, prompts, and metadata.
- Provider-agnostic output records.
- Deterministic mock output for tests.

Image generation must support:

- Prompt input, dimensions/aspect ratio, optional reference context, and output path or URL.
- Deterministic mock image output for tests.
- Real provider adapter hooks when configured.
- Media validation and provenance.

Video generation must support:

- Prompt input, optional reference image/video, duration, aspect ratio, and output path or URL.
- Deterministic mock video/storyboard output for tests.
- Real provider adapter hooks when configured.
- Media validation and provenance.

All providers must expose typed errors: retryable, recoverable-by-replan, blocked-by-configuration, and fatal.

## Canvas Requirements

The canvas must be treated as a graph of typed nodes and edges, not as one fixed demo:

- Text nodes may hold briefs, scene scripts, captions, narration, prompts, metadata, or evaluation notes.
- Image nodes may hold prompts, reference images, generated image URLs or files, dimensions, and provenance.
- Video nodes may hold prompts, reference media, generated video URLs or files, duration, aspect ratio, and provenance.
- Composition nodes may group scenes, variants, timelines, panels, or export bundles.
- Rich Media Panel nodes must receive text, image, and video output through explicit widget ports (`output`, `imageUrl`, `videoUrl`) rather than hidden side effects.
- Verification/report nodes must show validation status and final output links.
- Edges must express data flow, dependency, provenance, verification, or recovery relationships.
- Frontmatter-flow widget layout must use mobile-first responsive metadata plus a balanced 16:9 logical frame (`1920x1080`) with Text, Image, Video, and Rich Media Panel widgets x/y/z-indexed and positioned as a readable centroid-centered composition, not an unreachable stacked or offscreen cluster.
- Edges connecting Text, Image, and Video widgets to the Rich Media Panel must be inspectable, connected to explicit handles, and retained in the generated graph and workspace markdown.
- Missing, failed, degraded, or pending media must be represented explicitly rather than hidden.
- XR Mode must reuse the same graph artifact and explicit widget/edge/provenance data rather than generating a separate XR-only demo scene.
- XR controls must expose status for available, unavailable, blocked, entering, entered, and exited states without requiring external hardware for baseline repo tests.

The generated canvas artifact should be loadable or inspectable by existing agentic-graph surfaces where feasible, and must always be available as a standalone graph artifact.
When agentic-graph frontmatter-flow is available, also emit a workspace markdown artifact that declares `kgCanvas2dRenderer: "storyboard"`, canonical widget form ids, widget handles, responsive breakpoint/fallback metadata, the balanced 16:9 widget layout metadata, and the Rich Media Panel node needed by the Editor Workspace Canvas Widgets, Edges, and Rich Media Panel surface.

## Tooling And Entry Points

Provide or maintain:

- A CLI entrypoint for running the E2E rich media pipeline.
- A Codex-friendly `/goal` workflow and documented command.
- An MCP tool or equivalent API wrapper for external clients.
- A deterministic neutral example that runs without credentials.
- Optional real-provider configuration through environment variables or config files.
- Trace query or replay support sufficient for judging.

Every tool call must produce a structured observation. Every final artifact must link back to run, step, tool, and input provenance.

## Verification Requirements

Validation must be layered:

- Unit tests for planning, run state transitions, tool schema validation, provider contracts, retry behavior, and termination.
- Integration tests for a neutral brief flowing through text, image, video, and canvas artifact creation using mock providers.
- Resume tests proving a run can continue from a saved checkpoint.
- Failure tests proving retry and recovery paths are observable and bounded.
- Neutrality tests proving the system does not depend on specific demo filenames, absolute local paths, branded fixture strings, or one campaign narrative.
- Trace tests proving every final artifact links back to run, step, tool, and input provenance.
- Canvas tests proving text, image, video, verification, and report nodes exist with valid data-flow/provenance edges.
- Workspace/widget tests proving the generated frontmatter-flow artifact contains canonical TextGeneration, ImageGeneration, VideoGeneration, and RichMediaPanel widgets connected to the Rich Media Panel ports.
- Layout tests proving generated frontmatter-flow positions fit a balanced 16:9 (`1920x1080`) logical frame with centroid-centered Text, Image, Video, and Rich Media Panel widgets, explicit x/y/z-index metadata, and readable connecting edges.
- Responsive tests proving mobile, tablet, desktop, and wide-canvas proof classes preserve reachable controls, visible widgets, readable edges, stable fit behavior, and non-overlapping panel surfaces.
- Touch and resize tests proving pan/zoom, selection, drawer/panel transitions, keyboard resize, safe-area insets, and orientation changes do not trigger stale writes, duplicate canvas mounts, or unbounded recalculation.
- Source-file management tests proving automated default D1/docs hydration and manual source-file actions share one SourceFile pipeline while preserving local edits, provenance, dedupe, and conflict behavior.
- XR surface tests proving Canvas View Mode can select XR Mode through shared renderer state, persists neutral mode metadata where expected, and falls back cleanly when WebXR capability is unavailable.
- Hardcode-guard tests proving externally supplied XR validation documents are not referenced by filename or absolute local path anywhere in the repo under test.
- Media tests proving generated or mocked image/video artifacts exist, have declared media types, and are referenced by the canvas graph.

If visual or browser validation is available, include a smoke test that loads a generated canvas or preview and confirms that text, image, and video nodes are represented without missing references. Do not require external network access for baseline tests.

## Acceptance Criteria

The goal is complete only when:

- A reviewer can identify the E2E rich media entrypoint and run a minimal neutral example.
- The run produces persisted state, trace, report, text artifact, image artifact, video artifact, canvas graph, and canvas preview or equivalent inspectable surface.
- The trace includes plan, task dispatch, tool calls, observations, verification, recovery handling, and final synthesis.
- Text, image, and video generation paths exist behind provider-agnostic contracts.
- Deterministic mock providers are covered by tests.
- Real provider hooks are documented and do not break offline tests when credentials are absent.
- The canvas graph captures generated media and provenance through typed nodes and edges.
- The generated workspace artifact exposes the same media through the MainPanel Integrations -> FloatingPanel Chat UI -> Editor Workspace -> Canvas -> Balanced 16:9 (1920x1080) Layout for Widgets (Text, Image, Video) AND Rich Media Panel AND Edges path, with Surface Mode -> XR Mode available as a first-class canvas mode.
- The generated workspace artifact exposes mobile-first responsive metadata for widget bounds, fit strategy, edge anchors, panel behavior, safe-area offsets, and overflow handling.
- Live UI or browser verification confirms the route can open MainPanel Integrations, FloatingPanel Chat UI, Editor Workspace, Canvas, visible widgets, Rich Media Panel, and their edges on mobile, tablet, desktop, and wide-canvas proof classes without relying on the validation document being hardcoded in the repo.
- Cloudflare production verification confirms `airvio.co/agentic-graph` preserves the same mobile-first responsive behavior after the Dev source and Prod mirror are synced.
- Editor Workspace verification confirms automated default Source Files hydrate from the D1/docs storage path without Import local files, while manual source-file management remains explicit, observable, conflict-safe, and provenance-preserving.
- Test validation can run with a user-supplied external validation path as a runtime input, while the repo remains free of hardcoded dependencies on that absolute path, filename, or demo content.
- Failure and resume behavior are tested.
- Termination is deterministic and recorded.
- No test or implementation relies on hardcoded absolute local paths or a specific pre-existing demo document.
- Codex usage is documented or implemented so evaluation can be anchored on Codex.

## Suggested Implementation Order

1. Preserve or add neutral run schemas and trace persistence.
2. Preserve or add typed tool/provider registry for text, image, and video.
3. Add or refine planner/executor loop with explicit termination.
4. Add worker role contracts for text, image, video, canvas, verifier, and synthesizer tasks.
5. Add checkpoint/resume and bounded recovery.
6. Add canvas graph and preview artifacts for generated media.
7. Add mobile-first responsive layout metadata, panel stacking policy, touch-safe controls, and viewport proof tests.
8. Add XR Mode as a shared canvas surface option with capability-gated WebXR entry and non-XR fallback status.
9. Add neutral integration example and tests.
10. Add optional real-provider adapter hooks.
11. Add Codex-facing instructions, MCP or API entrypoint, and reviewer documentation.
12. Run the neutral E2E example and, when supplied by the user, run external/demo briefs only as runtime inputs.

## Final Output Contract

At the end of a successful run, produce:

- A final report summarizing the goal, plan, completed steps, generated artifacts, verification results, recovery events, provider mode, and termination reason.
- A text artifact containing scene plan/captions/narration/prompts.
- An image artifact or deterministic mock image artifact.
- A video artifact or deterministic mock video/storyboard artifact.
- A canvas graph artifact containing text, image, video, verification, and report nodes with provenance.
- A agentic-graph frontmatter-flow workspace artifact containing text/image/video widgets wired into a Rich Media Panel with mobile-first responsive metadata, a balanced 16:9 (`1920x1080`) proof layout, and inspectable edges.
- A responsive verification artifact covering mobile, tablet, desktop, and wide-canvas proof classes.
- An XR surface verification artifact when XR Mode is selected, proving capability status, fallback behavior, and graph/widget/edge continuity.
- A run trace artifact that can be inspected independently.
- Clear commands or Codex instructions for rerunning the neutral example and for running user-supplied briefs.

agentic-graph should make rich media autonomy legible. Its value is not that it generated one impressive asset; its value is that it can be trusted to pursue a media goal, coordinate text/image/video work, recover when reality pushes back, and explain every step it took.
