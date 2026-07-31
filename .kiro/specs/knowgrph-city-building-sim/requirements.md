# Requirements Document

## Authority and scope

This file is the normative requirements source of truth for the Knowgrph City
Simulation. The PRD/TAD/ADR explains product intent, architecture, and
decisions, `design.md` maps these requirements to repository owners, `tasks.md`
sequences delivery, and the workspace seed is a derived activation and proof
projection.

The product contract is
`docs/documents/knowgrph-game-city-building-sim-prd-tad-ard.md`. Generic
surface composition belongs to
`docs/documents/knowgrph-geo-xr-mode-prd-tad-ard.md`; regional values belong
only to the selected ADM0 companion.

The increment is a local-first, single-operator city simulation projected
through the existing Geo+XR surface and FloatingPanel. The real native
MapLibre Geo host is the sole City visual, renderer, camera, and viewport-
gesture owner. A labeled semantic `figure` wraps that MapLibre projection for
selection tooling without adding a City Three.js or React Three Fiber stage,
Canvas, mesh, or camera. It adds one `cityBuilder` view and contextual
projections in the existing `media`, `animation`, `motionControl`, `gameMode`,
`flightSim`, and `camera` views. It does not add a second game world, map,
renderer, Canvas, persistence authority, camera catalog, network service, or
deployment surface. City contributes one owned source/layer family to that
existing map rather than substituting a parallel visual world.

All implementation, prose, schemas, fixtures, and assets for this feature must
be source-authored for Knowgrph. The feature may use only existing
repository-owned runtime dependencies and assets. Copying or deriving code,
prose, schemas, examples, binaries, or assets from another implementation is
forbidden.

This increment carries development authority only. Production, Cloudflare, and
publish-mirror release work requires a separate explicit instruction.

## Glossary

- **City Runtime**: Single in-memory owner of lifecycle, selection, parcel
  state, economy state, and persistence status.
- **City Geo Media Surface**: Labeled semantic `figure` around the native
  MapLibre Geo projection. It exposes the existing media-selection marker only
  while City is active, owns no pointer-capture behavior, and contains no City
  Three.js or React Three Fiber stage.
- **Native Geo Host**: Existing MapLibre map owned by Geo; it owns Geo+XR
  visuals and viewport gestures, and City never creates or replaces it.
- **City Geographic Profile**: Source-authored anchor, parcel dimensions,
  bearing, gap, and aerial-inspection coordinates applied with the City seed.
- **City Parcel Projection**: Live City Runtime parcels projected into the
  existing map through the City-owned `kg-city-sim:geo-overlay` GeoJSON source
  and its fill, extrusion, outline, and selection layers.
- **City Aerial Projection**: Deterministic, read-only, stopped aircraft and
  route snapshot derived from the City Geographic Profile and published
  through the existing Flight MapLibre overlay together with the selected
  shared XR environment, but without Flight gameplay, bootstrap style, camera
  ownership, or readiness.
- **City Builder**: FloatingPanel view id `cityBuilder`; the complete editing
  and lifecycle control surface.
- **Panel Projection**: Compact city context rendered in an existing
  FloatingPanel view. A projection delegates to the City Runtime and owns no
  duplicate city state.
- **Parcel**: Stable grid cell identified by `rNNcNN`.
- **Zone**: One of `unzoned`, `residential`, `commercial`, or `industrial`.
- **Tick**: One atomic, deterministic economy transition.
- **Advisor**: Browser-local, deterministic zoning heuristic implementing the
  bounded `generate -> select -> clarify -> evolve` sequence.
- **City Document**: KGC Markdown frontmatter plus a canonical CSV parcel table
  under schema `knowgrph-city-grid/v1`.
- **City Document Path**: `/game-city-sim/city-grid.md`.
- **Source Activation**: Applying the authored workspace seed from Source
  Files after the Source Files bootstrap is ready.
- **Neutral Browser Start**: Browser state with no city demo selected by an
  environment variable, persisted workspace state, URL parameter, or prior
  open runtime.

## Requirements

### Requirement 1: Local-first ownership and source-authored boundary

**User story:** As a maintainer, I want a repository-native feature with one
owner chain so that its behavior remains auditable and inexpensive.

#### Acceptance criteria

1. The City Runtime shall execute zoning, ticking, advising, rendering
   projection, save, and read-back without a required network request.
2. The feature shall add zero runtime dependencies and shall use the existing
   Knowgrph MapLibre Geo, Flight Geo overlay, FloatingPanel, MCP, and
   WorkspaceFs owners.
3. The feature shall contain only source-authored implementation, prose,
   schemas, fixtures, and assets.
4. The feature shall add no alternate map, renderer, world owner, persistence
   adapter, camera catalog, transport, or infrastructure client. Its one City
   source/layer family shall be owned by the existing native MapLibre host.
5. An attempted unsupported or network-dependent core operation shall fail
   locally and shall preserve the last committed City Runtime state.

### Requirement 2: Source activation and FloatingPanel projections

**User story:** As an operator, I want one source-backed city to be visible
through the tools I already use so that I do not learn a parallel interface.

#### Acceptance criteria

1. Applying the authored workspace seed after Source Files bootstrap shall set
   Surface Mode to `geo-xr`, open `cityBuilder`, retain the native MapLibre Geo
   host, and expose its semantic City media `figure` without obscuring it.
2. The source identity shall be `run_ready_demo.id: city-sim`; a conflicting
   known path or identity shall fail closed instead of selecting a different
   demo.
3. `cityBuilder` shall expose lifecycle, parcel selection, zoning, advising,
   save, and exit controls and shall display tick, treasury, population,
   selected parcel, and persistence status.
4. `media` shall show the active city palette and parcel-appearance projection
   and provide a handoff to `cityBuilder`.
5. `animation` shall show deterministic tick playback state and delegate
   Start/Stop to the City Runtime.
6. `motionControl` shall show the normalized city input and selected parcel
   projection without owning input state.
7. `gameMode` shall show the city interactive-overlay state and provide an
   explicit handoff to `cityBuilder`.
8. `flightSim` shall provide a read-only aerial-inspection handoff; it shall not
   activate Flight gameplay, claim Flight readiness, or create, mutate, or
   retain a second city world.
9. `camera` shall show native MapLibre framing state without capturing,
   replacing, or restoring a Three.js or React Three Fiber camera.
10. All six existing projections shall subscribe to the same City Runtime
    snapshot; switching views shall not duplicate or reset city state.

### Requirement 3: Geo+XR MapLibre ownership, semantic media, and restoration

**User story:** As an operator, I want city controls and aerial context on the
canonical Geo surface without an unregistered local mesh corrupting map, input,
or camera behavior.

#### Acceptance criteria

1. City entry shall activate Surface Mode `geo-xr`; the existing native
   MapLibre Geo host shall be the sole City visual, renderer, camera, and
   viewport-gesture owner.
2. The City Geo media surface shall wrap the native MapLibre projection in one
   labeled semantic `figure`. City shall mount no Three.js scene, React Three
   Fiber Canvas, local mesh, or Three pointer handler.
3. Applying the source shall initialize the City Runtime from the source's
   parcel table and City Geographic Profile. A missing or malformed authored
   grid or geographic profile shall fail closed; no hardcoded runtime fixture
   or legacy identity remap may substitute for it.
4. Every live parcel shall be present in the City-owned
   `kg-city-sim:geo-overlay` GeoJSON source. Zone, economy, and selection
   changes shall update the matching MapLibre fill, extrusion, outline, and
   selection layers from the same City Runtime revision.
5. MapLibre parcel selection and City Builder coordinate controls shall both
   dispatch to the one City Runtime selection owner. Neither may create a
   second parcel state or local Three hit-test surface.
6. City shall publish one optional deterministic route and stopped aircraft
   from the same City Geographic Profile through the existing Flight overlay
   source/layers. Its atomic presentation owner shall be `city`; the selected
   shared XR environment shall use the existing environment source/layers
   below City parcels, while Flight's bootstrap style, camera/padding,
   lifecycle, mission, controls, and readiness paths remain inactive.
7. City entry shall create no additional MapLibre map, Three.js or React Three
   Fiber Canvas, or duplicate source/layer ids. City and Flight sources may
   coexist on the one native map in the order basemap, selected environment,
   City parcels, then independent aircraft/route presentation.
8. Native MapLibre shall remain the sole City camera and responsive viewport
   owner. City framing shall use the source-authored parcel bounds and the
   visible aperture around workspace panels, restore prior map padding on
   handoff, and never capture, install, or restore a Three camera.
9. Opening another exclusive gameplay surface shall exit the city overlay
   through the shared gameplay-surface lifecycle rather than hiding a live
   competing world.
10. If Exit supersedes an in-flight Geo claim and its automatic rollback
    cannot restore the prior Geo owner, City shall return the typed
    `surface-restoration-failed` result instead of reporting a successful Exit.
11. City source admission shall not start or retain the native XR physics
    playground or authored Three graph. City may consume the selected
    environment's read-only MapLibre projection, but shall own no XR scene
    selection, placement, physics, or Three rendering.
12. While City is active, the native MapLibre Geo projection shall have one
    labeled semantic `figure` ancestor using the existing conditional media-
    selection marker. The wrapper shall contain a `figcaption` and shall add no
    generic `div`, `aria-hidden`, or pointer/mouse/click capture handler. It
    shall not intercept MapLibre gestures. When City is inactive, the persistent
    wrapper shall be presentational and shall expose neither the City name nor
    the selection marker.

### Requirement 4: Deterministic parcel grid and economy

**User story:** As a demo operator, I want reproducible city outcomes so that
the same source and commands always tell the same story.

#### Acceptance criteria

1. The source-authored initial grid shall use stable parcel ids in row-major
   order and the zone set `unzoned`, `residential`, `commercial`, and
   `industrial`.
2. Economy state shall use integers: treasury and land value in cents,
   population and pollution in whole units, and tax rate in basis points.
3. One tick shall apply these v1 coefficients in stable parcel-id order:
   residential population `+2` and land value `+200` cents; commercial
   population `+1` and land value `+100` cents; industrial pollution `+1` and
   land value `-50` cents; unzoned values unchanged.
4. After parcel updates, treasury cents shall change by
   `floor(totalPopulation * taxRateBasisPoints / 100) + 300 * commercialCount
   + 500 * industrialCount - 100 * zonedCount`.
5. A tick shall compute a complete candidate snapshot, verify all values are
   safe integers, and commit all changes atomically or none.
6. The fixed step shall be 1000 ms and shall be independent of render frames.
7. Identical seed bytes plus identical accepted operations shall produce
   byte-identical serialized state.
8. The fixed-step tick path shall perform zero model calls and report
   `estimated_cost_usd: 0`.

### Requirement 5: Parcel interaction and lifecycle

**User story:** As an operator, I want a small, clear lifecycle and zoning loop
so that changes and consequences are immediate.

#### Acceptance criteria

1. Supported operations shall be `open`, `start`, `stop`, `restart`, `zone`,
   `advise`, `save`, `reset`, and `exit`.
2. `zone` shall require a known parcel id and a zone in `residential`,
   `commercial`, or `industrial`; rejection shall preserve state.
3. Selecting a parcel shall expose its id, zone, land value, population, and
   pollution without mutating economy state.
4. `stop` shall fence queued ticks; a later `start` shall resume the exact
   committed state.
5. `restart` shall restore the session start snapshot and tick zero.
6. `reset` shall restore the applied source-authored initial grid in memory. It shall not
   overwrite the City Document unless the operator later saves.
7. Pointer, keyboard, and touch shall normalize to one interaction snapshot
   consumed by the next queued runtime action.

### Requirement 6: KGC plus CSV save and read-back

**User story:** As a solo operator, I want one git-diffable city document so
that saves are inspectable and replayable.

#### Acceptance criteria

1. The only persistence target shall be
   `/game-city-sim/city-grid.md` through WorkspaceFs.
2. `save` shall serialize schema `knowgrph-city-grid/v1` as ordered KGC
   frontmatter followed by a CSV table with columns
   `parcel_id,row,column,zone,land_value_cents,population,pollution`.
3. Rows shall be sorted by parcel id, line endings shall be LF, numbers shall
   be base-10 integers, and the document shall end with one newline.
4. Save shall write only on explicit operator action, read the same path back,
   parse it, and report success only when the read-back bytes and parsed state
   match the committed snapshot.
5. On open, a present and valid City Document shall become the session start
   snapshot while the applied source supplies its geographic profile; an
   absent document shall use the applied source-authored initial grid. Without
   an applied source profile, open shall fail closed.
6. Malformed document bytes shall be preserved byte-for-byte, shall block
   Start and Restart, and shall surface a typed local error.
7. `reset` after a malformed read shall clear the in-memory block by selecting
   the applied source-authored initial grid; it shall not repair, discard, or
   overwrite the malformed document.
8. Serialize, parse, and reserialize of any valid City Document shall be
   byte-identical.

### Requirement 7: Deterministic local advisor

**User story:** As a viewer, I want to see a bounded recommendation path so
that agentic decision-making is legible without hidden cost.

#### Acceptance criteria

1. `advise` shall accept scope `parcel` or `district` and reject another scope
   before generating candidates.
2. The Advisor shall execute at most two
   `generate -> select -> clarify -> evolve` rounds.
3. Candidate scores shall be pure functions of the committed city snapshot and
   shall use only a repository-authored local heuristic.
4. A top-two score delta below the configured epsilon shall produce
   `clarify_required: true` and shall not mutate a parcel.
5. At the second-round cap, an unresolved tie shall select the candidate with
   the greater current land value, then the lexicographically smaller parcel
   id, and shall retain a tie flag.
6. Every advisory call shall return typed proposals and exactly one zero-cost
   log. No model call or enrichment path is part of this increment.

### Requirement 8: Strict invocation grammar

**User story:** As an operator or agent, I want one unambiguous grammar so that
malformed commands cannot partly apply.

#### Acceptance criteria

1. Native input shall contain exactly one `/game.city`, one `@canvas`, one
   `#civic`, and one `operation=<supported-operation>`.
2. Accepted keys shall be `operation`, `parcel`, `type`, and `scope`.
3. A duplicate sigil, missing required token, unknown key, duplicate key,
   mixed structured/native payload, unsupported operation, or missing
   operation argument shall produce a typed diagnostic and no state mutation.
4. One accepted invocation shall apply exactly one operation.

### Requirement 9: Browser-local MCP contract

**User story:** As an agent, I want the same safe runtime contract available
through MCP so that automation does not bypass user-facing ownership.

#### Acceptance criteria

1. Schema `knowgrph-city-sim-mcp/v1` shall expose exactly
   `knowgrph.inspect_local_city_sim` and
   `knowgrph.control_local_city_sim`.
2. Inspect shall return a read-only snapshot and shall never mutate city state.
3. Control shall accept only the operations and arguments defined by
   Requirement 8 and shall use the existing approval-gated control owner.
4. MCP control and native invocation shall delegate to the same City Runtime
   operation dispatcher.
5. The tools shall use existing local discovery/control transports and shall
   add no route or deployment authority.

### Requirement 10: Responsive, legible rendering

**User story:** As a mobile operator, I want controls and causality to remain
legible on a small screen.

#### Acceptance criteria

1. The native MapLibre City media surface and City Builder controls shall remain
   usable at 375 by 812 CSS pixels without horizontal page overflow.
2. Treasury, population, tick, run state, selection, and the latest operation
   result shall remain visible or reachable by one vertical panel scroll.
3. Invalid actions shall explain the reason and shall not mutate the committed
   snapshot.
4. Visual animation shall communicate activity only; it shall never own or
   advance simulation state.

### Requirement 11: Source-neutral browser proof

**User story:** As a reviewer, I want proof that source application causes the
runtime state so that preselected demo state cannot masquerade as activation.

#### Acceptance criteria

1. Browser proof shall start from a Neutral Browser Start at the exact
   candidate SHA.
2. Before applying the source, proof shall record that City Builder is closed,
   the city overlay is inactive, and the shared environment selection matches
   its ADM0 companion without any City-owned selector state.
3. Proof shall open the authored seed through Explorer -> Source Files and
   apply it only after Source Files bootstrap reports ready.
4. After application, proof shall assert Surface Mode `geo-xr`, `cityBuilder`,
   one existing native MapLibre map wrapped by the semantic City media
   `figure`, MapLibre viewport gestures, City Builder coordinate parcel input,
   zero City Three.js or React Three Fiber Canvas/stage/mesh/camera,
   deterministic seeded metrics, and no browser console error.
5. Proof shall exercise zone, one tick, stop fencing, save/read-back, all six
   existing Panel Projections, and exit restoration.
6. Proof shall assert sixteen City parcel features in the City source/layers,
   a visible zone/selection mutation, the companion-authored major-POI
   features in the shared environment extrusion layer, one stopped aircraft
   and its route in the independent Flight source/layers, one map, and inactive
   Flight bootstrap, camera, gameplay, and readiness paths.
7. Exit proof shall verify both City and aerial overlay sources clear, prior map
   padding is restored, and the prior FloatingPanel and Canvas surface state
   restores exactly once.
8. Reapplying from the same neutral state shall produce the same initial
   serialized snapshot and aerial projection.

### Requirement 12: Honest evidence and release boundary

**User story:** As a maintainer, I want documents to distinguish intent from
proof so that release claims remain trustworthy.

#### Acceptance criteria

1. The workspace seed shall remain `proof-pending` until focused source tests
   and neutral browser proof pass at the exact candidate SHA.
2. Validation checkboxes shall remain unchecked until the named evidence
   exists; a document declaration is not runtime proof.
3. Protected integration, production publication, and Cloudflare deployment
   are separate gates.
4. Without explicit release authority, the feature shall mutate no production
   mirror or Cloudflare resource.
