# Requirements Document

## Introduction

This feature defines the requirements for optimizing the knowgrph tech stack with a clear,
enforceable separation of ownership across seven technologies: JavaScript, TypeScript, Rust,
WASM, WebGL, WebCPU, and WebGPU. knowgrph is a browser-first, local-first, offline-first,
mobile-first npm monorepo built by a solo-dev, AI-native startup with a strong focus on total
cost of ownership (TCO), zero-infra deployment, token economics, and time-to-value.

Today, rendering, compute, orchestration, and tooling responsibilities overlap across multiple
languages and runtimes (2D canvas, 3D WebGL, XR physics, voxel, native-physics, game modes,
Node scripts, TypeScript app code, and Python parser pipelines). The goal of this spec is to
assign each technology a single, well-bounded responsibility so that overlap is removed, the
right layer owns each concern, runtime and token performance improve, and the browser-first,
local-first, offline-first, mobile-first constraints are preserved. This spec also defines a
migration and coexistence strategy and measurable performance/TCO targets.

This document defines **what** ownership boundaries and targets must hold. It does not prescribe
**how** individual modules are refactored; that belongs to the design and task phases.

**Scope note — WebCPU:** "WebCPU" is not a standardized browser API. In this document it denotes
the **CPU-compute execution tier**: deterministic compute that runs on the CPU (Web Workers
executing WASM or JavaScript kernels on the main thread only when unavoidable), used as the
compute path when GPU compute is unavailable or unsuitable. This interpretation is called out in
the Glossary and flagged for confirmation during review.

**Deployment guardrail:** All work targets the Dev repository at `$GITHUB_ROOT/knowgrph`.
Deployment to the Prod mirror or Cloudflare (airvio.co, airvio.co/knowgrph) is forbidden until
the user explicitly instructs it.

## Glossary

- **Stack_Governance**: The overall policy layer of knowgrph that assigns and enforces a single
  responsibility to each stack technology.
- **Ownership_Registry**: The single-source-of-truth artifact that records which technology owns
  which concern, including the concern name, owning technology, and permitted collaborators.
- **Concern**: A distinct category of work in the codebase (for example: application orchestration,
  type contracts, build tooling, compute kernels, cross-boundary marshalling, rendering, GPU
  compute, CPU compute, capability detection).
- **TypeScript_Layer**: The source tier written in TypeScript that owns application and UI
  orchestration, state management (Zustand store), MCP contracts, and business logic.
- **JavaScript_Layer**: The source tier written in plain JavaScript (including `.mjs` scripts and
  generated output) constrained to build tooling, repository scripts, Node test harness glue,
  Cloudflare Worker entry surfaces where required, and generated interop artifacts.
- **Rust_Layer**: The source tier written in Rust that owns compute-heavy, deterministic kernels
  (for example simulation, physics, graph algorithms, and hot-path parsing) compiled to WASM.
- **WASM_Module**: A compiled WebAssembly artifact produced from the Rust_Layer.
- **WASM_Bridge**: The owner of the JavaScript/TypeScript ↔ WASM boundary, responsible for module
  loading lifecycle, memory management, and data marshalling across the boundary.
- **Rendering_Tier**: A rendering execution backend. The defined tiers are WebGL and WebGPU.
- **WebGL_Renderer**: The baseline rendering backend that renders 2D, 3D, XR, and voxel surfaces
  with the broadest device and mobile support.
- **WebGPU_Renderer**: The advanced rendering and GPU-compute backend used as a progressive
  enhancement over the WebGL_Renderer where supported.
- **Compute_Tier**: A compute execution backend. The defined tiers are WebGPU compute (GPU) and
  WebCPU compute (CPU).
- **WebCPU_Compute**: The CPU-compute execution tier that runs WASM or JavaScript kernels on the
  CPU (preferring Web Workers) as the compute path when GPU compute is unavailable or unsuitable.
- **Capability_Resolver**: The owner that detects available browser capabilities and selects the
  active Rendering_Tier and Compute_Tier.
- **Boundary_Gate**: The automated repository check that verifies actual source ownership matches
  the Ownership_Registry and reports violations.
- **Build_System**: The owner of compilation, bundling, and WASM packaging (Vite plus the WASM
  toolchain).
- **Bundle_Budget**: The maximum allowed size for a built production JavaScript, CSS, or WASM
  chunk (500 KiB / 512000 bytes, uncompressed on-disk).
- **Dev_Repository**: The development source-of-truth repository rooted at `$GITHUB_ROOT/knowgrph`.

## Requirements

### Requirement 1: Single-source-of-truth ownership registry

**User Story:** As a solo developer, I want one authoritative record of which technology owns which
concern, so that responsibilities are unambiguous and overlap can be detected.

#### Acceptance Criteria

1. THE Ownership_Registry SHALL record each Concern exactly once and SHALL assign that Concern
   exactly one owning technology drawn from the set {JavaScript, TypeScript, Rust, WASM, WebGL,
   WebCPU, WebGPU}.
2. THE Ownership_Registry SHALL record, for each Concern, a possibly-empty set of permitted
   collaborating technologies, where each collaborator is drawn from the set {JavaScript,
   TypeScript, Rust, WASM, WebGL, WebCPU, WebGPU} and is not the owning technology of that Concern.
3. WHERE a Concern is recorded in the Ownership_Registry, THE Ownership_Registry SHALL define the
   Concern using only terms defined in the Glossary.
4. IF a Concern is assigned more than one owning technology, THEN THE Boundary_Gate SHALL report a
   violation identifying the Concern and the conflicting owners.
5. IF a Concern in the codebase has no owning technology recorded, THEN THE Boundary_Gate SHALL
   report a violation identifying the unassigned Concern.
6. IF a Concern is recorded more than once in the Ownership_Registry, THEN THE Boundary_Gate SHALL
   report a violation identifying the duplicated Concern.
7. IF a recorded permitted collaborator is not among the set {JavaScript, TypeScript, Rust, WASM,
   WebGL, WebCPU, WebGPU} or is identical to the owning technology, THEN THE Boundary_Gate SHALL
   report a violation identifying the Concern and the invalid collaborator.

### Requirement 2: TypeScript owns application and UI orchestration

**User Story:** As a developer, I want TypeScript to own application logic and UI orchestration, so
that the interactive, type-checked layer stays cohesive and maintainable.

#### Acceptance Criteria

1. THE TypeScript_Layer SHALL own application orchestration, UI composition, state management
   through the Zustand store, MCP contract definitions, and business logic.
2. WHEN application state held in the Zustand store changes, THE TypeScript_Layer SHALL be the
   origin that initiates that state change.
3. IF a module in the WASM_Bridge, Rendering_Tier, or JavaScript_Layer attempts to mutate the
   Zustand store directly rather than through a TypeScript_Layer action, THEN THE Boundary_Gate
   SHALL report a violation identifying the module and the attempted mutation.
4. THE TypeScript_Layer SHALL invoke compute kernels only through the WASM_Bridge.
5. IF a TypeScript_Layer module invokes a compute kernel by any path other than the WASM_Bridge,
   THEN THE Boundary_Gate SHALL report a violation identifying the module and the bypassed boundary.
6. THE TypeScript_Layer SHALL invoke rendering only through the active Rendering_Tier interface
   exposed by the Capability_Resolver.
7. IF a TypeScript_Layer module invokes rendering by any path other than the active Rendering_Tier
   interface exposed by the Capability_Resolver, THEN THE Boundary_Gate SHALL report a violation
   identifying the module and the bypassed boundary.
8. WHERE a module performs application orchestration, THE Boundary_Gate SHALL verify that the
   module is authored in TypeScript and SHALL report a violation identifying any such module not
   authored in TypeScript.

### Requirement 3: JavaScript ownership is constrained to tooling and interop

**User Story:** As a developer, I want plain JavaScript limited to tooling, scripts, and generated
interop, so that application logic is not fragmented across untyped source.

#### Acceptance Criteria

1. THE JavaScript_Layer SHALL own only the following Concerns and no others: repository scripts,
   Node test harness glue, build configuration, Cloudflare Worker entry surfaces designated in the
   Ownership_Registry as having no required TypeScript entry, and generated interop artifacts.
2. WHEN classifying a JavaScript file, THE Boundary_Gate SHALL distinguish a developer-authored
   file from a generated file by the presence of a generated-artifact marker recorded in the
   Ownership_Registry, treating a file with such a marker as generated and a file without one as
   developer-authored.
3. IF a JavaScript source file authored by a developer contains application orchestration or UI
   logic, THEN THE Boundary_Gate SHALL report a violation identifying that file, leaving the file
   unmodified.
4. IF a developer-authored JavaScript file contains a Concern that the Ownership_Registry assigns
   to the TypeScript_Layer, THEN THE Boundary_Gate SHALL report a violation identifying the file
   path and the misplaced Concern, leaving the file unmodified.
5. WHERE a JavaScript artifact is generated from a TypeScript_Layer or Rust_Layer source, THE
   Ownership_Registry SHALL record the generating source as the owner and mark the artifact as
   generated.
6. IF a JavaScript file is neither classified as developer tooling owned by the JavaScript_Layer
   nor marked as generated in the Ownership_Registry, THEN THE Boundary_Gate SHALL report a
   violation identifying that file as unclassified.

### Requirement 4: Rust owns compute-heavy deterministic kernels

**User Story:** As a developer, I want Rust to own compute-heavy deterministic work, so that hot
paths are fast, deterministic, and testable independent of the browser.

#### Acceptance Criteria

1. THE Rust_Layer SHALL own every compute kernel that is recorded in the Ownership_Registry as
   Rust-owned, including the designated simulation, physics, graph-algorithm, and hot-path parsing
   kernels.
2. WHEN a designated compute kernel is executed twice on the same Compute_Tier with identical
   inputs, THE Rust_Layer SHALL produce two outputs that are bitwise-identical.
3. THE Rust_Layer SHALL expose designated kernels to the application only as compiled WASM_Module
   exports consumed through the WASM_Bridge.
4. WHEN a designated kernel receives inputs whose numeric values are all finite, THE Rust_Layer
   SHALL produce numeric outputs whose values are all finite.
5. IF a designated kernel receives a numeric input that is not finite (NaN or infinite) or is
   outside the input domain recorded for that kernel in the Ownership_Registry, THEN THE Rust_Layer
   SHALL return a structured error identifying the rejecting kernel and SHALL produce no partial
   numeric output.
6. WHERE a compute kernel is designated Rust-owned in the Ownership_Registry, THE Boundary_Gate
   SHALL verify that no equivalent implementation of that kernel exists in the TypeScript_Layer or
   JavaScript_Layer.

### Requirement 5: WASM bridge owns the cross-boundary contract

**User Story:** As a developer, I want one owner of the JavaScript/TypeScript ↔ WASM boundary, so
that module loading, memory, and data marshalling are consistent and leak-free.

#### Acceptance Criteria

1. THE WASM_Bridge SHALL own WASM_Module load lifecycle, memory allocation and release, and data
   marshalling across the boundary.
2. WHEN a value of a boundary type registered as supported in the Ownership_Registry is marshalled
   from the TypeScript_Layer into a WASM_Module and marshalled back, THE WASM_Bridge SHALL produce
   a value equal to the original value (round-trip property).
3. IF a value whose boundary type is not registered as supported in the Ownership_Registry is
   submitted for marshalling, THEN THE WASM_Bridge SHALL reject the request, return a structured
   error identifying the unsupported boundary type, and retain no memory allocation for the
   rejected request.
4. WHEN the TypeScript_Layer issues an explicit release request for a WASM_Module, THE WASM_Bridge
   SHALL release the memory and handles associated with that module such that the process memory in
   use returns to the pre-load memory baseline recorded before that module was loaded.
5. IF an explicit release request targets a WASM_Module that has already been released, THEN THE
   WASM_Bridge SHALL treat the request as a no-op, return success, and make no change to allocated
   memory (idempotent release).
6. IF a WASM_Module does not complete loading within 10 seconds, THEN THE WASM_Bridge SHALL abort
   the load attempt, release all memory and handles allocated during that attempt, return a
   structured error identifying the failed module, and leave the application in a usable state.
7. WHILE a WebAssembly runtime is unavailable in the browser environment, THE WASM_Bridge SHALL
   route affected compute to the WebCPU_Compute JavaScript fallback path designated in the
   Ownership_Registry.

### Requirement 6: WebGL owns baseline rendering

**User Story:** As a mobile-first user, I want a baseline renderer that works on the broadest set of
devices, so that the canvas is usable on narrow and low-capability devices.

#### Acceptance Criteria

1. THE WebGL_Renderer SHALL own baseline rendering for 2D, 3D, XR, and voxel canvas surfaces.
2. IF the Capability_Resolver reports that WebGPU is unavailable, THEN THE WebGL_Renderer SHALL be
   the active Rendering_Tier.
3. THE WebGL_Renderer SHALL render the same canvas graph, widgets, edges, and provenance metadata
   supplied by the TypeScript_Layer without requiring source specific to a single canvas surface
   mode.
4. WHEN a supported canvas surface renders through the WebGL_Renderer on a 320-pixel-wide viewport,
   THE WebGL_Renderer SHALL present the primary canvas interaction path, defined as pan, zoom, and
   widget selection interactions being operable within 2 seconds after the canvas surface reports
   ready.
5. IF WebGL context initialization fails, THEN THE WebGL_Renderer SHALL return a structured error
   indicating the initialization failure, keep the application in a usable non-canvas state, and
   preserve the canvas graph, widget, edge, and provenance data supplied by the TypeScript_Layer
   without loss.

### Requirement 7: WebGPU owns advanced rendering and GPU compute

**User Story:** As a user on a capable device, I want advanced rendering and GPU compute when
available, so that heavy scenes and compute run faster without breaking other devices.

#### Acceptance Criteria

1. THE WebGPU_Renderer SHALL own advanced rendering and GPU-compute execution as the WebGPU
   Compute_Tier.
2. WHERE the Capability_Resolver reports that WebGPU is available, THE WebGPU_Renderer SHALL be
   selectable as the active Rendering_Tier.
3. WHEN the active Rendering_Tier changes between the WebGL_Renderer and the WebGPU_Renderer, THE
   TypeScript_Layer SHALL supply the same canvas graph, widget, edge, and provenance data to both
   renderers.
4. WHEN the active Rendering_Tier finishes changing between the WebGL_Renderer and the
   WebGPU_Renderer, THE TypeScript_Layer SHALL preserve the pre-switch canvas graph, widget, edge,
   and provenance data such that the post-switch rendered scene contains the identical set of graph
   nodes, widgets, edges, and provenance records with zero records added or dropped.
5. WHEN WebGPU initialization is started after selection, IF initialization does not complete within
   5 seconds, THEN THE Capability_Resolver SHALL treat the elapsed timeout as a discrete
   initialization failure event.
6. IF WebGPU initialization fails after selection, THEN THE Capability_Resolver SHALL fall back to
   the WebGL_Renderer, SHALL provide the retained canvas graph, widget, edge, and provenance data
   to the WebGL_Renderer for re-render with zero records lost, and SHALL record the fallback reason
   as inspectable status metadata that is readable through the Capability_Resolver interface.

### Requirement 8: WebCPU owns CPU-compute fallback

**User Story:** As an offline-first user, I want compute to run on the CPU when GPU compute is
unavailable, so that features keep working without a GPU and without network access.

#### Acceptance Criteria

1. WHERE a WebAssembly runtime is available in the execution environment, THE WebCPU_Compute tier
   SHALL execute each designated compute kernel using its WASM implementation, and WHERE a
   WebAssembly runtime is unavailable, THE WebCPU_Compute tier SHALL execute each designated compute
   kernel using its JavaScript implementation.
2. WHEN the Capability_Resolver reports that WebGPU compute is unavailable, THE Capability_Resolver
   SHALL select the WebCPU_Compute tier as the active Compute_Tier within 500 milliseconds of
   receiving that report.
3. WHILE the Web Worker API is available and a designated compute kernel is executing on the
   WebCPU_Compute tier, THE WebCPU_Compute tier SHALL run that kernel off the main thread through a
   Web Worker.
4. IF the Web Worker API is unavailable when a designated compute kernel is scheduled on the
   WebCPU_Compute tier, THEN THE WebCPU_Compute tier SHALL execute that kernel on the main thread
   and SHALL expose an inspectable execution-mode status indicating main-thread execution.
5. IF execution of a designated compute kernel fails on the WebCPU_Compute tier, THEN THE
   WebCPU_Compute tier SHALL return a structured error that identifies the failed kernel, SHALL keep
   the application usable, and SHALL NOT terminate the WebCPU_Compute tier.
6. WHEN the same designated kernel is executed on the WebGPU Compute_Tier and on the WebCPU_Compute
   tier with identical inputs, THE Stack_Governance SHALL verify that the two results are equal
   within the numeric tolerance recorded for that kernel in the Ownership_Registry and SHALL record
   the comparison outcome in the Ownership_Registry.

### Requirement 9: Capability detection and deterministic fallback ordering

**User Story:** As a user across many devices, I want the system to detect capabilities and pick the
right rendering and compute tiers, so that I always get a working experience with the best available
performance.

#### Acceptance Criteria

1. WHEN the application initializes, THE Capability_Resolver SHALL complete detection of WebGPU
   availability, WebGL availability, WebAssembly availability, and Web Worker availability within 3
   seconds (3000 milliseconds) before selecting the active Rendering_Tier and Compute_Tier.
2. WHEN detection completes with WebGPU reported available, THE Capability_Resolver SHALL select the
   WebGPU_Renderer as the active Rendering_Tier; otherwise when WebGL is reported available, THE
   Capability_Resolver SHALL select the WebGL_Renderer as the active Rendering_Tier.
3. WHEN detection completes with WebGPU compute reported available, THE Capability_Resolver SHALL
   select the WebGPU Compute_Tier; otherwise THE Capability_Resolver SHALL select the WebCPU_Compute
   tier as the terminal Compute_Tier fallback.
4. IF neither the WebGPU_Renderer nor the WebGL_Renderer is available after detection, THEN THE
   Capability_Resolver SHALL set the active Rendering_Tier to none, SHALL expose status metadata
   indicating that no Rendering_Tier is available together with the reason, and SHALL keep
   non-canvas application functions operable.
5. WHEN tier selection completes, THE Capability_Resolver SHALL expose the selected Rendering_Tier,
   the selected Compute_Tier, and the selection reason as inspectable status metadata.
6. IF a capability probe does not complete within the 3-second (3000-millisecond) detection window
   or raises an error, THEN THE Capability_Resolver SHALL treat that capability as unavailable and
   SHALL continue tier selection with the remaining detected capabilities.
7. WHEN detection produces a given set of capability results, THE Capability_Resolver SHALL select
   the same active Rendering_Tier and the same active Compute_Tier on every initialization that
   observes that identical set of capability results.

### Requirement 10: Boundary enforcement and overlap elimination

**User Story:** As a solo developer, I want automated enforcement of ownership boundaries, so that
overlap and drift are caught before merge instead of accumulating.

#### Acceptance Criteria

1. WHEN the Boundary_Gate runs, THE Boundary_Gate SHALL compare each scanned source artifact's
   detected owner against its registered owner in the Ownership_Registry, and for every mismatch
   THE Boundary_Gate SHALL write a record to an inspectable output that identifies the source
   artifact, the detected owner, and the registered owner.
2. IF two or more technologies implement the same Concern, THEN THE Boundary_Gate SHALL report a
   violation that identifies the Concern and every implementing artifact.
3. WHEN the Boundary_Gate completes with zero violations, THE Boundary_Gate SHALL exit with a
   success status usable as a merge gate.
4. IF one or more violations are detected, THEN THE Boundary_Gate SHALL exit with a non-success
   status that blocks the merge gate and SHALL emit the complete, non-truncated list of detected
   violations while leaving source artifacts and the Ownership_Registry unmodified.
5. THE Boundary_Gate SHALL restrict its scan to artifacts and Concerns recorded in the
   Ownership_Registry, SHALL terminate deterministically, and SHALL complete within 120 seconds of
   wall-clock time.

### Requirement 11: Migration and coexistence strategy

**User Story:** As a developer maintaining a large live monorepo, I want ownership changes to land
incrementally without regressions, so that the running application keeps working during the
transition.

#### Acceptance Criteria

1. WHEN a Concern is reassigned to a new owning technology in the Ownership_Registry, THE
   Stack_Governance SHALL require the previous implementation to be removed within the same
   migration slice after the new owner's focused tests complete with a success status, and SHALL
   require the Ownership_Registry to record only the new owning technology once the slice completes.
2. WHILE a Concern is mid-migration, defined as a Concern whose Ownership_Registry owning
   technology differs from at least one implementation still present in source, THE Stack_Governance
   SHALL require exactly one implementation of that Concern to be active at runtime and SHALL
   require every inactive implementation to be gated behind an explicit configuration flag that
   defaults to inactive.
3. WHEN a migration slice completes, THE Stack_Governance SHALL require the focused tests, the build
   check, and the hygiene gate covering the changed ownership cluster to each complete with a
   success status within a bounded, terminating scope.
4. IF a migration slice regresses a previously passing focused test, THEN THE Stack_Governance SHALL
   require the slice to be reverted or corrected to restore that test to passing before the next
   slice begins.
5. THE Stack_Governance SHALL require each migration slice to leave the affected surface with its
   primary interaction path available on a 320-pixel-wide viewport, its offline-first designated
   features functional using locally cached WASM_Module artifacts and local storage, and no new
   runtime dependency on a developer machine or paid backend.
6. IF a Concern that is mid-migration has more than one implementation active at runtime, THEN THE
   Boundary_Gate SHALL report a violation identifying the Concern and the active implementations.

### Requirement 12: Performance and TCO targets

**User Story:** As a TCO-conscious founder, I want measurable performance and cost targets on the
stack, so that optimization work is verifiable and infrastructure cost stays at zero.

#### Acceptance Criteria

1. THE Build_System SHALL produce built production JavaScript, CSS, and WASM chunks whose
   uncompressed on-disk size is each less than the Bundle_Budget of 500 KiB (512000 bytes).
2. IF a built production chunk's uncompressed on-disk size reaches or exceeds the Bundle_Budget of
   500 KiB (512000 bytes), THEN THE Build_System SHALL fail the build check, identifying the
   offending chunk and reporting its measured uncompressed on-disk size in bytes.
3. THE Stack_Governance SHALL require designated Rust-owned compute kernels to execute the
   Ownership_Registry fixed input dataset benchmark workload with a median duration over at least 10
   runs that is at or below the recorded pre-migration baseline median duration.
4. THE Stack_Governance SHALL require the running application to operate at zero recurring
   infrastructure cost, incurring no recurring monetary charge for backend or hosting services, for
   all offline-first designated features.
5. WHERE a kernel is moved from the TypeScript_Layer to the Rust_Layer, THE Stack_Governance SHALL
   record the before-migration and after-migration benchmark median durations, each measured over
   at least 10 runs, for that kernel.
6. IF a kernel's after-migration benchmark median duration over at least 10 runs exceeds its
   recorded pre-migration baseline median duration, THEN THE Stack_Governance SHALL block the
   migration slice and surface both the before-migration and after-migration median durations.

### Requirement 13: Browser-first, local-first, offline-first, mobile-first constraints

**User Story:** As a browser-based user, I want the optimized stack to keep working in the browser,
locally, offline, and on mobile, so that the core product promise is preserved.

#### Acceptance Criteria

1. THE Stack_Governance SHALL require every stack technology to execute within the browser runtime
   or the Build_System, and SHALL require offline-first designated features to issue zero network
   requests to a developer machine or paid backend at runtime.
2. WHILE the browser is offline, THE Stack_Governance SHALL require every designated offline-first
   feature to complete its primary interaction path using only locally cached WASM_Module artifacts
   and local storage, with zero network requests.
3. WHEN a designated offline-first feature loads and a required WASM_Module artifact is absent from
   the local cache while the browser is offline, THEN THE Stack_Governance SHALL require the feature
   to return a structured error identifying the unavailable artifact and to leave the application in
   a usable state.
4. WHEN a feature loads on a 320-pixel-wide viewport, THE Stack_Governance SHALL require the primary
   interaction path to accept user input and produce its first result within 3 seconds, before any
   wider-viewport enhancement loads.
5. WHEN an offline-first designated feature completes its first successful load, THE Stack_Governance
   SHALL require every WASM_Module artifact used by that feature to be written to the local cache and
   retained for use in subsequent offline sessions.
6. IF an offline-first designated feature declares a runtime dependency on a developer machine or
   paid backend, THEN THE Stack_Governance SHALL block that feature and report the offending
   dependency.

### Requirement 14: Layered testing ownership

**User Story:** As a developer, I want each layer tested with the right method, so that logic is
verified by property-based tests and infrastructure is verified by focused examples.

#### Acceptance Criteria

1. THE Stack_Governance SHALL require designated Rust-owned Compute_Tier kernels to be verified with
   property-based tests covering deterministic and round-trip properties, executing a minimum of 100
   generated cases per property.
2. THE Stack_Governance SHALL require WASM_Bridge marshalling to be verified with a property-based
   round-trip test across every supported boundary type, executing a minimum of 100 generated cases
   per property.
3. THE Stack_Governance SHALL require TypeScript_Layer business-logic functions whose output varies
   with input to be verified with property-based tests using fast-check, executing a minimum of 100
   generated cases per property.
4. THE Stack_Governance SHALL require Rendering_Tier and Capability_Resolver behavior to be verified
   with focused integration examples, tied to the defined Rendering_Tier and Compute_Tier boundaries
   and to fallback paths recorded in the Ownership_Registry, rather than with property-based tests.
5. WHEN layered tests run, THE Stack_Governance SHALL require them to execute through the existing
   `node --test` harness and to complete within a 120-second wall-clock bound.
6. IF a property-based test discovers a counterexample, THEN THE Stack_Governance SHALL fail the
   merge gate and report the minimal counterexample.

### Requirement 15: Deployment guardrail

**User Story:** As the repository owner, I want deployment to production strictly gated, so that no
optimization work reaches Prod or Cloudflare without my explicit instruction.

#### Acceptance Criteria

1. THE Stack_Governance SHALL confine all tech-stack optimization changes to the Dev_Repository
   rooted at `$GITHUB_ROOT/knowgrph`.
2. IF a change would deploy to or modify the Prod mirror (airvio.co, airvio.co/knowgrph) or
   Cloudflare without a recorded explicit authorization from the repository owner that references
   that change, THEN THE Stack_Governance SHALL reject the change, SHALL leave the Prod mirror and
   Cloudflare unmodified, and SHALL surface an inspectable status indicating the deployment was
   blocked and the reason.
3. WHILE no recorded explicit authorization from the repository owner is present for a given
   deployment action, THE Stack_Governance SHALL treat deployment to the Prod mirror or Cloudflare
   as blocked by default.
4. WHERE a recorded explicit authorization from the repository owner is present, THE Stack_Governance
   SHALL apply that authorization only to the specific deployment action it references and SHALL
   require a separate authorization for any subsequent deployment action.
5. WHEN optimization work is validated, THE Stack_Governance SHALL require validation to run against
   the Dev_Repository development runtime only and SHALL exclude the Prod mirror and Cloudflare from
   validation execution.
