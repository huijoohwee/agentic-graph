# Requirements Document

## Introduction

This repository-tracked Kiro package at `.kiro/specs/knowgrph-game-flight-sim` is the normative requirements/design source of truth for the Knowgrph Native Flight Simulator, a browser-based, single-player flight simulation game built on the Knowgrph agentic Entity Component System (ECS) and rendered on the shared Knowgrph XR Canvas. `docs/documents/knowgrph-game-flight-sim-prd-tad.md` and `docs/workspace-seeds/knowgrph-game-flight-sim-demo.md` are derived implementation/proof projections. Any workspace-root Kiro copy is a byte-identical local projection only, never a second authority.

The feature delivers bounded, offline, deterministic flight-training missions over procedural authored terrain, with in-repo flight dynamics, scored learning outcomes, a browser-local voice instructor, and axis-aligned bounding-box collision. It is governed by hard platform constraints: total-cost-of-ownership focus, zero-infrastructure operation, browser-based/mobile-first/local-first/offline-first delivery, token economy discipline, free and open-source software only, minimum-viable-maximum-value scope, and agent invocability through Model Context Protocol (MCP) and the `/`, `@`, `#` invocation conventions.

External references inform conceptual principles only. Maintainers attest that the implementation, instructional content, and assets are source-authored. Copying or deriving source, prose, prompts, schemas, algorithms, tests, binaries, or assets is forbidden; external project identity and URL are forbidden in product source and runtime metadata; and there is no external project dependency. The deterministic boundary gate detects external repository locators in Flight-owned paths but cannot prove the absence of arbitrary derived code. The 3D asset pipeline uses `img2threejs` output (small, diffable TypeScript plus a JSON scene spec) as the primary representation. One optional subject may use an opaque-binary GLB produced by the repository-owned deterministic offline generator and admitted only as a committed, hash-pinned, license-gated local fallback; the fallback has no external-generator dependency.

## Glossary

- **Flight_Sim**: The browser-local flight simulator feature surface, mounted as a FloatingPanel mode on the shared Knowgrph XR Canvas.
- **Flight_Runtime**: The lifecycle and orchestration owner of Flight_Sim, managing mission/failure selection, voice coaching, `open`, `start`, `stop`, `restart`, `throttle`, `coach`, `save`, and `exit`.
- **Training_Mission**: A source-authored objective, terrain/light state, target energy envelope, systems checklist, and measurable score contract.
- **Practice_Failure**: A bounded deterministic failure injection active only during its declared tick window.
- **Voice_Instructor**: Browser speech synthesis over the same text coaching cue; text coaching remains available when speech is unavailable.
- **Training_Outcome**: A terminal, validated `dialogue_outcome` Decision containing score, grade, route progress, stability, energy management, failure recovery, and night state.
- **Agentic_ECS**: The native Knowgrph Entity Component System runtime that hydrates an opaque World, advances ordered systems through a transactional `World_Tick`, and validates emitted Decisions.
- **World_Tick**: One deterministic fixed-step advance of the Agentic_ECS World performed by Flight_Runtime.
- **Flight_Model**: The in-repo deterministic flight-dynamics owner computing thrust, pitch, roll, yaw, and bounded lift, drag, and gravity approximations. No external physics engine.
- **Collision_Resolver**: The in-repo owner that sweeps the aircraft bounding cuboid against the authored terrain axis-aligned bounding-box (AABB) slab catalog and returns a non-penetrating position.
- **Asset_Loader**: The owner that reads committed local aircraft and prop asset representations and resolves them to a renderable scene subject.
- **Asset_Spec**: An `img2threejs`-style small, diffable TypeScript module plus a JSON scene specification describing identity, procedural renderer shape, dimensions, collision size, color, and zero-call metadata for an aircraft or prop.
- **GLB_Fallback**: A committed local opaque-binary GLB file produced by the repository-owned deterministic offline generator, flagged as opaque, hash-pinned and license-gated, and used by Asset_Loader only for an explicitly admitted optional subject where an Asset_Spec is unavailable.
- **Invocation_Parser**: The owner that parses and validates the strict `/flight.sim @canvas #flight` native invocation grammar.
- **WebMCP_Registry**: The browser-local Model Context Protocol registration exposing the `knowgrph.inspect_local_flight_sim` and `knowgrph.control_local_flight_sim` tools for Flight_Sim.
- **WorkspaceFs_Adapter**: The browser-local WorkspaceFs owner that persists validated flight Decisions into a KGC Markdown source document.
- **Hydration_Adapter**: The owner that reconstructs mission progress from validated persisted Decisions before the first World_Tick.
- **HUD**: The heads-up display overlay reporting airspeed, altitude, heading, attitude, throttle, waypoint state, save state, and errors.
- **Camera_Source**: The shared camera catalog offering Fixed_Follow and Free_Orbit framing for Flight_Sim.
- **Input_Normalizer**: The owner that converts desktop keyboard, pointer, mobile touch, standard gamepad, and optional Motion_Control input into one normalized flight input frame.
- **Motion_Control**: The existing browser-local pose adapter that may contribute optional normalized player input only, never the flight control policy.
- **WebGL_Probe**: The synchronous check that resolves WebGL availability before mission start.
- **Cost_Log**: The canonical cost-accounting record produced per World_Tick as defined by `contracts/cost-log.schema.js`.
- **Decision**: A validated canonical `EcsDecision` node of type `dialogue_outcome`, `quest_flag`, or `world_tick_result`, the only data Flight_Sim persists.
- **Operator**: A human player or an agent controlling Flight_Sim through input or the WebMCP tools.

## Requirements

### Requirement 1: Zero-infrastructure, local-first, offline-first core gameplay

**User Story:** As a mobile-first player, I want to fly a mission entirely in my browser with no accounts or network, so that I get immediate time-to-value at zero infrastructure cost.

#### Acceptance Criteria

1. WHEN the source-backed flight seed is applied in a clean browser-local workspace, THE Flight_Sim SHALL render a playable airborne-capable first frame within 3 seconds without requiring sign-in, camera permission, passkey access, remote asset fetch, or a Cloudflare service request.
2. THE Flight_Sim SHALL execute all core gameplay using only browser-local runtime resources, issuing zero outbound network requests during core play.
3. IF a gameplay network request is attempted during core play, THEN THE Flight_Sim SHALL fail closed within 1 second with a local error indicating the request was blocked, SHALL retain the current mission state without rollback, and SHALL NOT block the mission on a remote response.
4. THE Flight_Sim SHALL render and control the mission within a viewport of 375 by 812 device-independent pixels without content clipping or scrolling.
5. WHEN a mission Decision is recorded, THE Flight_Sim SHALL persist it exclusively through the WorkspaceFs_Adapter in browser-local storage.
6. THE Flight_Sim SHALL require zero new deployed infrastructure and zero production, D1, R2, KV, Durable Object, Worker, or Pages mutation for core gameplay.
7. WHEN the player supplies control input after the first playable frame, THE Flight_Sim SHALL advance the World_Tick without issuing any network request.

### Requirement 2: Token economy and cost truth

**User Story:** As a solo maintainer, I want the flight loop to make no model calls and report honest zero cost, so that token and inference economics stay at zero on the hot path.

#### Acceptance Criteria

1. WHEN a World_Tick completes without a reasoning request, THE Flight_Runtime SHALL emit exactly one canonical Cost_Log with `model` equal to `none`, every token field equal to 0, `estimated_cost_usd` equal to 0, and `incomplete` equal to false.
2. THE Flight_Runtime SHALL perform zero model inference calls during any World_Tick.
3. THE Flight_Runtime SHALL perform zero runtime image-to-3D asset-generation calls between mission start and mission end.
4. THE Flight_Sim SHALL obtain every aircraft and prop asset from committed local files without any runtime network fetch.
5. IF a model inference call is attempted during a World_Tick, THEN THE Flight_Runtime SHALL block the call without performing the inference and emit exactly one canonical Cost_Log with `incomplete` equal to true and a field indicating a blocked-inference error, while preserving the World_Tick state.
6. IF a required aircraft or prop asset is absent from committed local files, THEN THE Flight_Sim SHALL halt loading of that asset and surface an error indicating the missing asset identity, without performing any runtime network fetch.

### Requirement 3: Free and open-source software only

**User Story:** As a maintainer, I want the feature to depend only on FOSS and existing repository owners, so that licensing and total-cost-of-ownership stay controlled.

#### Acceptance Criteria

1. THE Flight_Sim SHALL use only software dependencies that are distributed under an OSI-approved open-source license and that carry no per-seat, usage-based, subscription, or runtime licensing fee.
2. THE Flight_Sim SHALL add zero new runtime dependencies beyond the existing Knowgrph renderer, Agentic_ECS, WorkspaceFs, and camera owners, where a runtime dependency is any package required for the Flight_Sim to execute outside of build-time and test-only tooling.
3. THE Flight_Model SHALL implement flight dynamics and collision using in-repo code without Rapier, Yuka, a behavior-tree library, a navmesh library, bitECS, an edge machine-learning runtime, or a large language model dependency.
4. WHEN dependency resolution runs, IF the resolved dependency set contains any package that lacks an OSI-approved open-source license or that appears in the prohibited-library list defined in criterion 3, THEN THE Flight_Sim SHALL fail the build and produce an error indicating each offending dependency by name.
5. WHEN dependency resolution runs, IF the resolved runtime dependency set contains any package outside the existing Knowgrph renderer, Agentic_ECS, WorkspaceFs, and camera owners, THEN THE Flight_Sim SHALL fail the build and produce an error identifying each unauthorized runtime dependency by name.

### Requirement 4: External-reference clean-room boundary

**User Story:** As a maintainer, I want external references confined to unnamed conceptual principles, so that no external identity, source, content, asset, or dependency enters the product.

#### Acceptance Criteria

1. THE Flight_Sim SHALL use external references for conceptual principles only and SHALL NOT include copied or derived source, prose, prompts, schemas, algorithms, tests, binaries, or assets.
2. THE Flight_Sim SHALL prohibit external project identity and URL in product source, authored specifications, workspace seeds, runtime metadata, and user-facing copy.
3. THE Flight_Sim SHALL declare zero build-time, external, or runtime dependency on any referenced external project.
4. WHEN a build is initiated, THE build SHALL scan Flight-owned tracked paths for external repository locators, vendored paths, and opaque binary source content.
5. IF the clean-room scan detects a prohibited locator, vendored path, opaque source binary, or missing policy marker, THEN THE build SHALL terminate without producing a build artifact and SHALL identify each detected file.
6. IF the clean-room scan passes, THEN THE build SHALL continue; this deterministic gate SHALL be documented as unable to prove the absence of arbitrary derived code, so the source-authored provenance attestation remains required.

### Requirement 5: Build on the Knowgrph agentic ECS

**User Story:** As a system author, I want the flight mission to run on the native Agentic_ECS, so that simulation state stays deterministic, opaque, and ephemeral.

#### Acceptance Criteria

1. THE Flight_Runtime SHALL advance mission state exclusively through the Agentic_ECS `World_Tick` transactional API and SHALL reject any mission state change performed outside a committed World_Tick.
2. WHILE Flight_Sim is playing, THE Flight_Runtime SHALL keep Agentic_ECS component and World state in memory with zero durable writes of component arrays or World snapshots.
3. WHEN a Flight_Sim session ends, THE Flight_Runtime SHALL discard all in-memory Agentic_ECS component and World state so that it is unrecoverable outside persisted Decisions.
4. WHEN a World_Tick system fails, THE Agentic_ECS SHALL roll back only the failing system, preserve prior committed systems in the same World_Tick, and return a structured failure that names the failing system and its cause.
5. THE Flight_Runtime SHALL persist to durable stores only validated Decision nodes and SHALL NOT persist component arrays, World snapshots, Cost_Log records, credentials, or raw input history.
6. WHEN two Flight_Runtime instances advance the same starting World state through the same ordered inputs, THE Agentic_ECS SHALL produce identical committed World results.
7. IF a mutation of Agentic_ECS World state is attempted outside the `World_Tick` transactional API, THEN THE Flight_Runtime SHALL reject the mutation, leave the World state unchanged, and return a structured error indicating the transactional boundary was violated.

### Requirement 6: Deterministic fixed-step simulation and replay

**User Story:** As a player, I want the same inputs to reproduce the same flight, so that missions are fair and replayable.

#### Acceptance Criteria

1. WHEN two fresh Flight_Runtime instances advance the same mission seed and the same normalized input frames for the same number of ticks, THE Flight_Runtime SHALL produce byte-equivalent aircraft state, flight integration, collision result, waypoint progress, Decisions, and HUD projection after canonical serialization, where byte-equivalent means zero differing bytes across the serialized outputs.
2. THE Flight_Runtime SHALL advance the simulation on an exact fixed timestep of `1 / 60` second (approximately 16.667 milliseconds, 60 ticks per second) derived from normalized input frames rather than from raw document events.
3. THE Flight_Runtime SHALL cap catch-up work with a bounded accumulator that executes no more than 5 catch-up ticks per rendered frame, so that mission results are independent of display refresh rate across the supported range of 24 to 240 frames per second.
4. THE Flight_Runtime SHALL read the rendered scene from an immutable projection produced after a committed World_Tick.
5. IF a replay advances normalized input frames whose count, ordering, or mission seed does not match the recorded run, THEN THE Flight_Runtime SHALL reject the replay without mutating aircraft state and SHALL surface an indication that the replay inputs are invalid.
6. IF a replayed World_Tick produces aircraft state that is not byte-equivalent to the recorded state at the same tick index, THEN THE Flight_Runtime SHALL halt the replay at that tick, preserve the last byte-equivalent committed state, and SHALL surface an indication that a determinism divergence was detected.

### Requirement 7: In-repo flight dynamics

**User Story:** As a player, I want responsive and stable flight controls, so that throttle, pitch, roll, and yaw behave predictably.

#### Acceptance Criteria

1. WHEN control input is applied during a World_Tick, THE Flight_Model SHALL update aircraft attitude and velocity within that same World_Tick, producing only finite values (no NaN or infinite values), with internal attitude expressed in radians and bounded to -π to π per axis and each velocity component bounded to configured min/max limits; the HUD SHALL derive visible angle values in degrees without mutating the stored attitude.
2. THE Flight_Model SHALL compute thrust from the aircraft throttle state in the range 0.0 to 1.0, update that state from a normalized per-tick `throttleDelta` in the range -1.0 to 1.0 or an explicit absolute throttle setpoint in the range 0.0 to 1.0, and compute pitch, roll, and yaw from normalized control inputs in the range -1.0 to 1.0, using deterministic in-repo integration that produces identical outputs for identical inputs and initial state.
3. WHEN a World_Tick occurs, THE Flight_Model SHALL apply deterministic lift, drag, and gravity approximations to update aircraft state.
4. THE Flight_Model SHALL compute flight dynamics without an external physics engine.
5. WHEN a sampled pitch, roll, yaw, or `throttleDelta` value is finite but outside -1.0 to 1.0, THE Input_Normalizer SHALL clamp it to the nearest bound; WHEN it is positive or negative infinity, THE Input_Normalizer SHALL use the corresponding signed bound; WHEN it is NaN, THE Input_Normalizer SHALL reuse that field from the last valid input frame; in every case THE Input_Normalizer SHALL record an internal out-of-range indication and the Flight_Model SHALL continue integration with the normalized frame. IF an explicit absolute throttle setpoint is non-finite or outside 0.0 to 1.0, THEN THE Flight_Runtime SHALL reject it without changing the aircraft throttle state.

6. WHEN true airspeed falls below the configured full-control threshold, THE Flight_Model SHALL reduce pitch, roll, yaw, and bank-turn authority monotonically to a non-zero configured minimum; WHEN true airspeed falls below the configured stall threshold, THE Flight_Model SHALL add a deterministic nose-down recovery tendency with no random, wall-clock, or display-frame input.
7. THE shared training projection SHALL classify unreliable instrumentation, stall risk, attitude limits, and mission-relative low/on-target/high energy in a stable priority order, and SHALL expose the same target-speed band, control-authority percentage, label, and recovery cue to the HUD and all six existing training surfaces.

### Requirement 8: In-repo AABB terrain collision

**User Story:** As a player, I want the aircraft to collide with terrain and boundaries realistically, so that the mission has physical limits.

#### Acceptance Criteria

1. WHEN a World_Tick advances the aircraft, THE Collision_Resolver SHALL sweep the previous-to-proposed aircraft cuboid against the authored AABB slab catalog and against the explicit perimeter and ceiling blockers, parameterizing the sweep by a normalized time t in the range 0.0 to 1.0 (0.0 = previous position, 1.0 = proposed position), and SHALL complete this resolution within the same World_Tick before the next tick begins.
2. WHEN multiple blockers are intersected during the sweep, THE Collision_Resolver SHALL select the hit with the lowest sweep-time t as the earliest hit, and IF two or more hits share the same lowest sweep-time t, THEN THE Collision_Resolver SHALL select the hit with the smallest blocker-identifier under a stable ascending ordering.
3. WHEN a collision is detected, THE Collision_Resolver SHALL return a position that maintains a non-negative separation margin of at least 0.001 world units from the hit blocker surface (no penetration), and SHALL set the aircraft velocity component along the hit normal to 0.0 within a tolerance of 0.0001 world units per second while preserving the velocity components tangential to the hit normal.
4. IF the authored AABB slab catalog contains no slabs and no perimeter or ceiling blockers are defined, THEN THE Collision_Resolver SHALL return the proposed aircraft position unchanged and SHALL preserve the aircraft velocity unmodified.
5. IF the aircraft cuboid already penetrates a blocker at the start of the World_Tick, THEN THE Collision_Resolver SHALL return the nearest non-penetrating position that restores the separation margin of at least 0.001 world units along the axis of shallowest penetration and SHALL set the velocity component directed into that blocker to 0.0.
6. THE Collision_Resolver SHALL resolve collisions without mesh colliders, a navmesh, or generated collision geometry.

### Requirement 9: img2threejs primary asset pipeline

**User Story:** As a maintainer, I want aircraft and props defined as small diffable text specs, so that assets are auditable, editable, and near-zero cost.

#### Acceptance Criteria

1. WHEN both an Asset_Spec and a GLB_Fallback exist for one subject, THE Asset_Loader SHALL load the Asset_Spec and SHALL NOT load the GLB_Fallback for that subject.
2. WHEN an Asset_Spec is admitted, THE Asset_Loader SHALL resolve identity, procedural renderer shape, dimensions, collision size, color, and zero-call metadata to the canonical in-repo renderer entirely from in-repo data with zero network fetches and zero external-binary fetches, and SHALL require each of these fields to be non-empty.
3. IF an Asset_Spec is missing a required field or declares a non-positive dimension or collision size, THEN THE Asset_Loader SHALL fail closed with a local error that names the asset, load no renderer for that subject, and perform no GLB_Fallback fetch.
4. IF an Asset_Spec declares a non-null opaque-binary fallback field, an unknown field, or a mismatched scene-library identity, THEN THE Asset_Loader SHALL fail closed with a local error that names the asset, load no renderer for that subject, and perform no GLB_Fallback fetch.
5. THE Asset_Loader SHALL admit the required flyable aircraft through exactly one committed diffable TypeScript-plus-JSON Asset_Spec, with a minimum of one required flyable aircraft in this increment.
6. WHEN asset loading for the required aircraft completes, THE Flight_Sim SHALL record a GLB_Fallback count of zero for the required aircraft in this increment.

### Requirement 10: Committed-local opaque GLB fallback boundary

**User Story:** As a maintainer, I want the opaque GLB path confined to a committed local fallback, so that the runtime stays diffable and offline.

#### Acceptance Criteria

1. WHEN an Asset_Spec is unavailable for a subject, THE Asset_Loader SHALL load a committed local GLB_Fallback and record it in the load metadata with an opaque flag set to true.
2. THE Asset_Loader SHALL obtain any GLB_Fallback exclusively from a committed local file, performing zero runtime network fetches and zero image-to-3D model calls.
3. WHEN a load run completes, THE Asset_Loader SHALL report the total GLB_Fallback count as a non-negative integer ranging from 0 to the total subject count in the load run.
4. IF a GLB_Fallback is referenced by a remote URL, THEN THE Asset_Loader SHALL reject the reference without attempting any network fetch, return a local error indicating that a remote GLB_Fallback is not permitted, and load no asset for the affected subject.
5. IF a committed local GLB_Fallback file is missing or unreadable, THEN THE Asset_Loader SHALL return a local error indicating that the fallback is unavailable, leave the affected subject unloaded, and exclude that subject from the GLB_Fallback count.
6. THE Flight_Sim SHALL admit a GLB_Fallback only when its committed bytes match the repository-owned deterministic offline generator, declared SHA-256, compatible FOSS license, exact local path, and self-contained GLB structure; any mismatch SHALL fail closed before the subject is counted.

### Requirement 11: Offline asset authoring

**User Story:** As a maintainer, I want asset creation to be an offline step, so that no generation model runs at runtime.

#### Acceptance Criteria

1. THE required aircraft TypeScript-plus-JSON Asset_Spec SHALL be committed as source-authored human-editable text created entirely offline, and THE optional fallback author SHALL generate only the optional beacon GLB plus its generated TypeScript companion entirely offline before commit.
2. THE Flight_Sim SHALL commit every Asset_Spec that exists in-repo as human-editable UTF-8 text with a maximum file size of 1 MB per Asset_Spec, including the required aircraft Asset_Spec; an optional subject without an Asset_Spec MAY use the admitted committed-local GLB_Fallback.
3. WHILE the Flight_Sim is executing at runtime, THE Flight_Sim SHALL invoke zero image-to-3D model calls, zero network fetches, and zero Cloudflare resource requests.
4. IF the optional fallback author attempts an image-to-3D model call, a network fetch, or a Cloudflare resource request, THEN the author SHALL abort before its atomic output commit and SHALL produce an error indication identifying the disallowed operation, leaving the prior optional beacon GLB and generated TypeScript companion unchanged.
5. IF a committed Asset_Spec is not human-editable UTF-8 text or exceeds 1 MB, THEN THE Flight_Sim SHALL reject the Asset_Spec and SHALL produce an error indication identifying the non-conforming Asset_Spec.

### Requirement 12: Strict native invocation grammar

**User Story:** As an operator, I want a single strict invocation to control Flight_Sim, so that agent and manual commands are unambiguous.

#### Acceptance Criteria

1. WHEN an invocation is submitted, THE Invocation_Parser SHALL accept the invocation only if it contains exactly one `/flight.sim` command token, exactly one `@canvas` binding token, and exactly one `#flight` semantic token.
2. IF an invocation is missing any one of the required `/flight.sim`, `@canvas`, or `#flight` tokens, THEN THE Invocation_Parser SHALL reject the invocation, take no control action on Flight_Sim, and return a local error indicating which required token is missing.
3. IF an invocation contains a duplicate sigil, an unknown key, or mixed structured and native input, THEN THE Invocation_Parser SHALL fail closed by rejecting the invocation, taking no control action on Flight_Sim, leaving prior state unchanged, and returning a local error indicating the specific violation.
4. WHEN a valid invocation names a lifecycle operation in the set `open`, `start`, `stop`, `restart`, `throttle`, `save`, or `exit`, THE Flight_Runtime SHALL apply exactly that one operation.
5. IF an invocation names an operation outside the supported lifecycle set, THEN THE Flight_Runtime SHALL reject the invocation, leave Flight_Sim state unchanged, and return a local error indicating that the named operation is unsupported.

### Requirement 13: Browser-local WebMCP tools

**User Story:** As an agent, I want to inspect and control Flight_Sim through MCP, so that automation stays within a defined, safe contract.

#### Acceptance Criteria

1. THE WebMCP_Registry SHALL expose exactly the two tools `knowgrph.inspect_local_flight_sim` and `knowgrph.control_local_flight_sim` for the Flight_Sim surface, and no additional tools for that surface.
2. WHEN `knowgrph.inspect_local_flight_sim` is invoked, THE WebMCP_Registry SHALL return the current read-only Flight_Sim state within 2000 milliseconds and SHALL leave all mission state unchanged.
3. IF `knowgrph.inspect_local_flight_sim` is invoked while Flight_Sim state is unavailable, THEN THE WebMCP_Registry SHALL return an error result indicating the state is unavailable and SHALL leave all mission state unchanged.
4. WHEN `knowgrph.control_local_flight_sim` is invoked with a supported lifecycle operation in the set `open`, `start`, `stop`, `restart`, `throttle`, `save`, or `exit`, THE Flight_Runtime SHALL apply that operation within 2000 milliseconds and SHALL return a result indicating the applied operation.
5. IF `knowgrph.control_local_flight_sim` is invoked with an operation outside the set `open`, `start`, `stop`, `restart`, `throttle`, `save`, or `exit`, THEN THE Flight_Runtime SHALL reject the request, SHALL return an error result indicating the operation is unsupported, and SHALL leave the current Flight_Sim lifecycle state unchanged.
6. THE WebMCP_Registry SHALL add zero stdio tools, zero HTTP mutation routes, zero remote gateways, and zero deployment authority.
7. THE WebMCP_Registry SHALL keep the private Agentic_ECS stdio lane at exactly three tools.

### Requirement 14: Shared Canvas and XR ownership

**User Story:** As a player, I want the flight to appear inside the existing world, so that the scene stays coherent with one renderer.

#### Acceptance Criteria

1. WHEN Flight_Sim is entered from a running XR surface, THE Flight_Runtime SHALL keep the authored atmosphere, terrain, and scene graph mounted inside the single existing React Three Fiber Canvas.
2. THE Flight_Runtime SHALL overlay the aircraft, waypoint actors, objective actors, and HUD on the existing Canvas without introducing a second renderer, a second Canvas, an alternate rendered world, or a Flight-owned camera.
3. WHEN Flight_Sim exits, THE Flight_Runtime SHALL restore the previous surface controller input and simulation state.
4. IF entry into Flight_Sim from a running XR surface fails, THEN THE Flight_Runtime SHALL leave the existing Canvas, scene graph, and prior surface controller unchanged and SHALL surface a local error indicating that entry did not complete.
5. IF restoring the previous surface controller input or simulation state on exit fails, THEN THE Flight_Runtime SHALL retain the existing single Canvas without a second renderer and SHALL surface a local error indicating that restoration did not complete.

### Requirement 15: Camera source selection

**User Story:** As a player, I want to choose how the camera follows the aircraft, so that I can frame the flight my way.

#### Acceptance Criteria

1. THE Camera_Source SHALL offer exactly two framing options: Fixed_Follow and Free_Orbit.
2. WHEN an Operator selects a valid framing option (Fixed_Follow or Free_Orbit) through the Camera catalog or `/camera.select @camera #camera camera=fixed-follow|free-orbit`, THE Camera_Source SHALL apply the selected framing within 1 second of the selection.
3. WHILE a Timeline camera-mark is playing, THE Camera_Source SHALL grant framing ownership to the camera-mark.
4. THE Camera_Source SHALL apply framing independently of aircraft selection.
5. WHERE no Operator has selected a framing option, THE Camera_Source SHALL apply Fixed_Follow as the default framing.
6. IF an Operator submits a `/camera.select` command with a camera value other than fixed-follow or free-orbit, THEN THE Camera_Source SHALL reject the selection, retain the currently active framing, and return an error indication identifying the invalid value.
7. WHEN Timeline camera-mark playback ends, THE Camera_Source SHALL return framing to the most recently Operator-selected option, or to the default framing if no option has been selected.

### Requirement 16: Normalized multi-device input

**User Story:** As a mobile-first player, I want keyboard, touch, and gamepad controls to work identically, so that I can fly on any device.

#### Acceptance Criteria

1. WHEN input is sampled for a World_Tick, THE Input_Normalizer SHALL combine desktop keyboard, pointer, mobile touch, and standard gamepad input into a single normalized flight input frame for that World_Tick.
2. WHEN pitch, roll, yaw, or throttle-change input is received from any supported device, THE Input_Normalizer SHALL map it to the corresponding `pitch`, `roll`, `yaw`, or `throttleDelta` field in the inclusive range -1.0 to 1.0; the aircraft throttle state and explicit absolute throttle lifecycle setpoint SHALL remain in the inclusive range 0.0 to 1.0.
3. IF a sampled field is finite but outside -1.0 to 1.0, THEN THE Input_Normalizer SHALL clamp it to the nearest boundary before the World_Tick; IF it is positive or negative infinity, THEN THE Input_Normalizer SHALL use the corresponding signed boundary; IF it is NaN, THEN THE Input_Normalizer SHALL reuse only that field from the last valid input frame; and in all three cases it SHALL record an internal out-of-range indication while allowing integration to continue.
4. IF no input is received from any supported device for a World_Tick, THEN THE Input_Normalizer SHALL set pitch, roll, yaw, and `throttleDelta` to 0.0 so the aircraft throttle state is held.
5. WHEN input for the same flight control is received from more than one supported device within a single World_Tick, THE Input_Normalizer SHALL resolve it to a single normalized value by selecting the input with the largest absolute magnitude.
6. WHERE Motion_Control is started by explicit Operator action, THE Input_Normalizer SHALL treat Motion_Control output as optional normalized player input only.
7. THE Flight_Runtime SHALL NOT use Motion_Control as the flight control policy.

### Requirement 17: Mission objective

**User Story:** As a player, I want a clear objective, so that the mission has a goal and completion.

#### Acceptance Criteria

1. THE Flight_Sim SHALL present one ordered route of exactly three waypoints and one marked landing pad as the mission objective, with each waypoint and the landing pad assigned a fixed position and a capture radius between 50 and 200 meters.
2. WHEN the aircraft enters the capture radius of each waypoint in the defined order and then enters the capture radius of the marked landing pad, THE Flight_Runtime SHALL record a terminal mission result of success.
3. IF the aircraft enters the capture radius of a waypoint before all preceding waypoints in the ordered route have been captured, THEN THE Flight_Runtime SHALL not advance the route progression and SHALL leave the previously captured waypoint count unchanged.
4. WHILE a terminal mission result is recorded, THE Flight_Runtime SHALL hold the result in a pending state and SHALL not treat the mission as persisted until an explicit Save operation completes successfully.
5. IF an explicit Save operation fails, THEN THE Flight_Runtime SHALL retain the terminal mission result in the pending state and SHALL provide an indication that the Save did not succeed.

### Requirement 18: HUD reporting

**User Story:** As a player, I want live flight instrumentation, so that I can fly and troubleshoot with confidence.

#### Acceptance Criteria

1. WHILE the flight simulation is running, THE HUD SHALL display airspeed, altitude, heading, attitude, throttle, waypoint state, objective state, and save state, refreshing each displayed value within 100 milliseconds of a change to its underlying value.
2. THE HUD SHALL display throttle as a normalized value from 0.0 to 1.0 inclusive.
3. WHEN a runtime error occurs, THE HUD SHALL display an explicit local error indication and, where a local path is associated with the error, the affected local path.
4. WHEN a save operation enters a pending, retryable, or successful state, THE HUD SHALL display the corresponding save state.
5. IF a save operation fails and is not retryable, THEN THE HUD SHALL display a non-retryable save-failure state and indicate that unsaved changes are retained.

### Requirement 19: Decision-only local save

**User Story:** As a player, I want to explicitly save my completed mission, so that only validated results are written locally.

#### Acceptance Criteria

1. WHEN an Operator selects Save and persistence succeeds, THE WorkspaceFs_Adapter SHALL write only canonical `EcsDecision` additions of type `dialogue_outcome`, `quest_flag`, or `world_tick_result`, and SHALL reject any EcsDecision whose type is not one of these three supported types.
2. WHEN Decisions are written, THE WorkspaceFs_Adapter SHALL merge them idempotently by `decisionId` so that a Decision with an existing `decisionId` produces no duplication and leaves the existing persisted bytes unchanged.
3. WHEN a Save writes Decisions, THE WorkspaceFs_Adapter SHALL preserve all existing authored bytes except for the byte ranges added by supported KGC Decision insertion.
4. THE Flight_Runtime SHALL persist Decisions only on an explicit Operator Save action and SHALL NOT auto-save terminal results at any time.
5. IF persistence fails during Save, THEN THE WorkspaceFs_Adapter SHALL leave the existing authored bytes and prior persisted Decisions unchanged and SHALL surface an error indication to the Operator.

### Requirement 20: Fail-closed hydration and retry

**User Story:** As a player, I want a corrupt save to be preserved and surfaced, so that I never lose data silently.

#### Acceptance Criteria

1. WHEN no save document exists, THE Flight_Runtime SHALL create a fresh mission without overwriting any existing local path.
2. IF an existing KGC save fails validation, THEN THE Hydration_Adapter SHALL block World creation, display an error indicating the save is unreadable, name the unreadable local path, preserve the original bytes unchanged, and expose an explicit Reset local save action.
3. WHILE a save document fails validation, THE Flight_Runtime SHALL block the Start and Restart actions until an explicit Reset local save completes successfully.
4. WHEN an explicit Reset local save completes successfully, THE Flight_Runtime SHALL create a fresh mission and re-enable the Start and Restart actions.
5. IF a local write fails, THEN THE WorkspaceFs_Adapter SHALL retain all pending Decisions in memory, preserve the prior bytes unchanged, display an error indicating the save did not persist, and expose a Retry save action.
6. WHEN a player invokes the Retry save action, THE WorkspaceFs_Adapter SHALL re-attempt writing the retained pending Decisions to the local path.
7. WHEN a save document passes validation, THE Hydration_Adapter SHALL reconstruct mission progress, the validated active run identifier, and ordered waypoint history from the validated Decision index before the first World_Tick; Start SHALL continue that hydrated run, and only an explicit Restart SHALL mint a fresh run identifier.

### Requirement 21: Synchronous WebGL admission and resumable lifecycle

**User Story:** As a player, I want the mission to start only when it can run, and to pause and resume cleanly, so that play is reliable.

#### Acceptance Criteria

1. WHEN mission start is requested, THE WebGL_Probe SHALL resolve WebGL availability synchronously and return an available or unavailable result within 100 milliseconds before the mission starts, with no asynchronous callback or deferred resolution.
2. IF WebGL is unavailable or the saved Decisions are unreadable, THEN THE Flight_Runtime SHALL keep the mission in the stopped state, retain any existing in-memory mission data without modification, and display a local on-screen error indicating that the mission cannot start and the reason, without issuing any remote call and without instantiating a second renderer.
3. WHEN Start is applied, THE Flight_Runtime SHALL prepare a ready frame at tick zero within 100 milliseconds and SHALL hold at tick zero without advancing fixed ticks until it receives at least one normalized input event from any of the desktop, pointer, touch, gamepad, Motion_Control, or MCP sources.
4. WHEN the browser tab is blurred or the document is hidden, THE Flight_Runtime SHALL pause the simulation clock within 1 fixed tick while leaving the mission tick, aircraft state, and mission state unchanged.
5. WHILE Fixed_Follow framing is active, IF pointer capture is released, THEN THE Flight_Runtime SHALL pause the simulation clock within 1 fixed tick while leaving the mission tick and aircraft state unchanged.
6. WHILE Free_Orbit framing is active, WHEN pointer lock exits, THE Flight_Runtime SHALL continue advancing the simulation clock without pausing and without changing the mission tick or aircraft state.
7. WHEN Stop is followed by Start, THE Flight_Runtime SHALL resume from the exact in-memory mission tick and aircraft state that were held at the time Stop was applied, with zero deviation in tick value and aircraft state fields.
8. IF a normalized input event is not received within 300 seconds after a ready frame is prepared at tick zero, THEN THE Flight_Runtime SHALL keep the mission held at tick zero and continue waiting without advancing fixed ticks and without changing mission state.

### Requirement 22: Runtime-ready gating

**User Story:** As a maintainer, I want repository-owned proof commands, so that runtime readiness is verifiable and offline.

#### Acceptance Criteria

1. THE Flight_Sim SHALL register a repository-owned runtime-readiness command that verifies source authority, native ECS integration, focused tests, TypeScript checks, and a production build, where a run is deemed successful only when every one of these five verifications passes.
2. IF any verification performed by the runtime-readiness command does not pass, THEN THE Flight_Sim SHALL terminate the command with a non-success result that identifies each failed verification and SHALL make no repository change as a result of the run.
3. THE Flight_Sim SHALL register a repository-owned browser-smoke command that verifies Source Files apply, one retained authored XR Canvas, playable input, strict WebMCP, lifecycle, Timeline camera round-trip, and the mobile HUD, where a run is deemed successful only when every one of these verifications passes.
4. IF any verification performed by the browser-smoke command does not pass, THEN THE Flight_Sim SHALL terminate the command with a non-success result that identifies each failed verification and SHALL make no repository change as a result of the run.
5. THE runtime-readiness and browser-smoke commands SHALL run using only locally available source, dependency, build, and test artifacts, and SHALL invoke zero paid model, image-to-3D, or Cloudflare service and zero other network resource.
6. THE Flight_Sim SHALL NOT perform an automatic Git operation or production deployment from the browser runtime.

### Requirement 23: Source-authored activation identity

**User Story:** As a maintainer, I want activation keyed to the authored source identity, so that identity conflicts fail closed.

#### Acceptance Criteria

1. WHEN activation is requested, THE Flight_Sim SHALL activate through the source-authored `run_ready_demo.id` registered in the known registry, independent of any imported path.
2. IF the imported path identity and the source-authored identity disagree, THEN THE Flight_Sim SHALL fail closed without activating, reject the request with an identity-conflict error indicating the conflicting identities, and leave the prior activation state unchanged.
3. IF the source-authored `run_ready_demo.id` is not registered in the known registry, THEN THE Flight_Sim SHALL fail closed without activating and reject the request with an error indicating the identity is unregistered.

### Requirement 24: Mission-based flight training and measurable outcomes

**User Story:** As a learner, I want structured flight lessons, systems practice, coaching, and measurable debriefs, so that each circuit teaches and verifies a specific skill.

#### Acceptance Criteria

1. THE Flight_Sim SHALL offer `circuit-foundation`, `night-circuit`, and `systems-recovery` Training_Missions, each with an objective, procedural terrain description, day/night state, target speed envelope, default Practice_Failure, and systems checklist.
2. THE Flight_Sim SHALL expose the same Training_Mission state through the Media, Animation, Motion Control, Game Mode, Flight Sim, and Camera FloatingPanel owners without creating a second simulation, terrain, renderer, or persistence owner.
3. WHILE a mission advances, THE training projection SHALL report route progress, stability percentage, energy-envelope percentage, a score from 0 through 100, and a terminal grade derived only from deterministic browser-local state.
4. WHEN the selected Practice_Failure is active from tick 180 inclusive through tick 420 exclusive, THE Flight_Runtime SHALL apply the declared bounded power, instrument, or control effect to captured tick input only; outside that window, it SHALL leave input unchanged.
5. WHEN unreliable-airspeed practice is active, THE Flight Sim telemetry SHALL display `UNRELIABLE` instead of a trusted airspeed value and SHALL retain pitch, power, attitude, and route coaching.
6. WHEN night training is selected, THE shared authored XR atmosphere and light owners SHALL use the source-authored night palette without adding Flight-owned lights or a second world.
7. THE Voice_Instructor SHALL use browser speech synthesis only after explicit enablement, SHALL speak the same visible deterministic coaching cue, and SHALL retain visible text coaching when speech is unavailable.
8. WHEN an Operator explicitly saves a completed or crashed mission, THE Flight_Runtime SHALL persist one idempotent Training_Outcome Decision alongside admitted terminal Decisions; it SHALL never auto-save the debrief.
9. THE WebMCP control tool and `/flight.sim @canvas #flight` grammar SHALL expose mission selection, failure selection, voice enable/disable, current coaching cue, lifecycle control, and Save while inspect reports the complete training snapshot.
10. IF the mission-stage dynamic import fails with a transient fetch or dynamic-module error, THE shared loader SHALL retry at most two times with bounded backoff before reporting the existing fail-closed surface-entry error; non-transient errors SHALL not retry.

### Requirement 25: Authored environment selection and Geo handoff

**User Story:** As a player, I want to choose an authored environment from Media and inspect it through Geo before reopening Flight, so that the mission world is deliberate and visible.

#### Acceptance Criteria

1. WHEN an Operator selects Geo on a Terrain / Environment Kit card, THE Media surface SHALL stage that exact existing XR environment through the canonical XR scene-control owner before requesting FloatingPanel Geo.
2. IF XR environment staging is rejected, THEN the Media surface SHALL keep the current panel and environment unchanged and SHALL NOT request FloatingPanel Geo.
3. WHEN FloatingPanel Geo opens after a successful environment selection, THE Geo surface SHALL visibly project the selected environment identifier, label, kind, and authored dimensions from the shared XR runtime.
4. WHEN Flight_Sim is next opened, THE Flight_Runtime SHALL derive its spatial profile, collision envelope, route, navigation, and visible World label from that selected authored XR environment without adding a renderer, camera, map provider, network request, token, copied asset, or external runtime dependency.
5. WHEN Flight_Sim entry follows Geo inspection or a live Motion_Control handoff, THE mission stage SHALL retry shared viewport input ownership independently, invalidate the shared Canvas demand loop after installing its render observer, and acknowledge the current preparation request from its committed aircraft/runtime render without waiting for desktop input ownership, so a mount-order or camera-owner race cannot reject a playable Motion, touch, gamepad, or later-reclaimed desktop session.
6. WHEN Cockpit view is selected, THE Camera_Source SHALL place the eye beyond the aircraft's forward collision envelope and above its vertical collision envelope while aiming along the aircraft forward vector, so committed aircraft geometry cannot obstruct the playable forward view.
