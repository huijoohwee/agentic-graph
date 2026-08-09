---
title: "Reference implementation: Knowgrph Agentic Game OS core"
id: "md:knowgrph-game-mmorpg-prd-tad"
author: "airvio / joohwee"
date: "2026-07-30"
updated: "2026-08-08"
version: "1.0.0"
runtime_claim: "focused-tested-shared-core-candidate"
doc_type: "Combined PRD/TAD"
lang: "en-US"
owner: "docs.game.agentic-game-os-reference"
local_rung: "runtime-ready"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
frontmatter_contract: "required"
domain: "knowgrph"
execution_boundary: "dev-only"
publish_scope: "local-only"
source_contract: "huijoohwee.github.io/docs/documents/agentic-game-os-prd-tad-adr.md"
constraints:
  - "native first-party implementation; no copied source, external game runtime, or external play-path dependency"
  - "device-local, local-first, offline-first persistence through the existing Knowgrph storage owner"
  - "deterministic fixed-step play with no model, network, account, or provisioned infrastructure dependency"
  - "one writer lease per world; malformed continuity fails closed and preserves stored bytes"
  - "networked multiplayer, production promotion, Cloudflare deployment, live Apple/XR application integration, and GameXR wiring are outside this candidate"
---

# Reference implementation: Knowgrph Agentic Game OS core

## Outcome and claim boundary

This candidate implements the native shared Agentic Game OS core and a thin
Knowgrph browser-persistence facade. It is a persistent single-player strategy
world with MMO-style continuity across sessions, not a networked multiplayer
service. The play path is deterministic, device-local, model-free,
transport-free, and zero-infrastructure.

The focused shared-core, browser-persistence, existing-mode registry, package-
export, and native Swift parity tests are executable locally. `runtime-ready`
in this document applies only to those tested modules. It does not claim that a
Persistent Strategy panel is installed into the root scene owner, that GameXR
has consumed a reviewed package, that live Xcode/visionOS/browser evidence has
been recorded, or that a public/Cloudflare deployment is ready. Delivered
readiness remains `undocumented`.

## Product contract

### Primary journey

1. A caller opens a declared world with `{ worldId, seed, sessionId }` and,
   only for host-owned authoring, an optional operator-reviewed definition.
2. The lease arbiter admits exactly one live writer for the world.
3. Restore validates the atomic world envelope, selects the newest valid
   retained snapshot, replays the journal tail, and reports the snapshot tick,
   replay span, committed tick, and matched digest.
4. The player submits ordered `move-unit` and `claim-territory` operations.
5. A fixed step advances the world, accrues the single `supply` resource, emits
   exactly one zero-cost record, and atomically appends continuity.
6. Closing releases the surface and write lease. Reopening through the same
   device-local database restores the last committed tick.

### Persistent Strategy World

The min-viable default deliberately keeps its rules small and auditable:

- six deterministically ordered territories in a ring;
- two factions, each with one unit and one seeded home territory;
- one integer economy resource, `supply`;
- adjacent-territory unit movement;
- an occupying unit may claim a territory for two supply;
- every owned territory yields one supply after each fixed step;
- contiguous global order sequence numbers reject gaps and duplicates;
- stable canonical JSON bytes and a source-owned digest identify every state.

Those values are not reducer constants. One deeply frozen, typed default
definition declares the map profile, ring topology and territory count;
faction identities, starting supply and starting units; claim cost and owned-
territory supply accrual; and scenario objectives. A validated definition is
embedded in canonical world state, so it participates in every state and
continuity digest. A newly created or deliberately reset world may receive an
optional definition from the host API. Resume never accepts tool-supplied
definition or authority fields: the stored definition is authoritative, and a
different explicit host definition fails with `input-invalid` while the open
lease acquisition is rolled back to the exact prior bytes.

Definition admission is exact and closed: unknown top-level or nested keys,
coerced scalar types, duplicate identities, and unsupported variants fail.
One source-owned mobile bound caps the logical model at 64 territories, 8
factions, 128 aggregate starting units, 16 objectives, economic values of
1,000,000, and unit strength of 10,000. Each faction's unit length and the
running aggregate are checked before mapping or allocation.

There is no random clock input, frame-rate-derived state, model decision,
network input, remote asset, server authority, or hidden fallback in a step.

### Explicitly deferred

- concurrent players, shared-world networking, chat, guilds, trading, and an
  authoritative server;
- live world generation, generative NPCs, remote asset retrieval, or model
  access from play;
- Persistent Strategy UI/renderer installation beyond the thin facade;
- Apple, iOS, visionOS, RealityKit, Reality Composer, SwiftUI, camera, and
  motion-control application integration beyond the native Swift parity core;
- GameXR consumer wiring, Production mirrors, public delivery, and Cloudflare.

## Technical architecture

### Source ownership

| Owner | Responsibility |
|---|---|
| `grph-shared/src/game-os/types.ts` | Versioned JSON-safe definition, orders, world, journal, lease, cost, and typed errors |
| `grph-shared/src/game-os/canonical.ts` | Stable key ordering, canonical bytes, clone/freeze, and digest using the existing shared hash utility |
| `grph-shared/src/game-os/registry.ts` | World-schema/persistence-obligated mode registry and one-live-overlay surface arbiter; each mode declares either required single-writer continuity or explicitly no continuity/lease |
| `grph-shared/src/game-os/simulation.ts` | Canonical definition validation, one frozen default, seeded world materialization, and deterministic transitions |
| `grph-shared/src/game-os/envelope.ts` | Single per-world CAS envelope binding lease and continuity revisions |
| `grph-shared/src/game-os/indexedDbStore.ts` | Shared native browser IndexedDB owner with atomic CAS and fail-closed upgrade lifecycle |
| `grph-shared/src/game-os/continuity.ts` | Retained snapshots, deep restore validation, fenced commit, and atomic explicit repair reset |
| `grph-shared/src/game-os/lease.ts` | Envelope-bound acquire, verify, renew, expire, replace, and release |
| `grph-shared/src/game-os/invocation.ts` | Strict `/`, `@`, and `#` grammar with one declared operation argument |
| `grph-shared/src/game-os/status.ts` | Read-only normalized status aggregation with zero-cost evidence |
| `grph-shared/src/game-os/runtime.ts` | Store-parameterized sessions, registry, closed asset manifest, invocation, status, projection, and cleanup |
| `grph-shared/src/game-os/control.ts` | Two typed embedded-tool declarations, internal lease authority, dispatcher, pending-order queue, host renewal, and local controller |
| `grph-shared/src/game-os/assets.ts` | Committed-local provenance and redistributable-licence admission gate |
| `grph-shared/src/game-os/assetManifest.ts` | Closed repository-backed asset manifest with exact path, revision, and digest |
| `grph-shared/src/game-os/ASSET-LICENSES.md` | File-specific owner-issued licence and provenance record for the fixture |
| `grph-shared/src/game-os/authoring.ts` | Authoring-only transport, bounded loop, schema circuit, candidate store, cost observer, and gap evidence |
| `grph-shared/package.json` | Portable `./game-os` and Canvas-compatible `./game-os/index` entry points over the single compiled shared owner |
| `canvas/src/features/game-mmorpg/gameMmorpgCore.ts` | Thin existing-storage and visual-declaration adapter over the shared runtime |
| `canvas/src/features/game-mmorpg/gameMmorpgToolSurface.ts` | Thin embedded-tool shape projection over the shared local controller |
| `canvas/src/features/three/xrSceneSurfaceRuntime.ts` plus FPS/Flight/City runtimes | One shared registry/arbiter adapter and three full stateless mode declarations; panel identifiers remain presentation vocabulary |
| `packages/apple-spatial-input-swift/.../GameOsPersistentStrategy.swift` | Native first-party fixed-step parity core consuming the same versioned definition/order/state contract and zero-cost record |

No package, renderer, ECS, persistence owner, workspace seed, global menu,
Apple/XR source, deployment source, or GameXR source is duplicated in these
modules.

### Surface registry and arbiter

A mode declaration supplies its identity, world schema, a closed obligation
pair (`required` continuity with `single-writer` lease, or `none` with `none`),
surface contract, input adapter, overlay constructor, and exit handler.
Registration is data-driven: the shared
registry contains no mode-identity list. Duplicate identity and activation of
an absent identity are typed failures. The registration boundary exports only
`duplicate_identity | invalid_declaration | surface_unavailable`; unregistered
activation is `surface_unavailable`. Activating a successor invokes the
incumbent exit handler exactly once and leaves exactly one live overlay.

The existing first-person, flight, and city-building owners now each contribute
a full, truthful stateless declaration to the same shared registry adapter.
Their panel names remain UI vocabulary only; the former hard-coded gameplay
identifier set, exit-handler map, and generic `gameMode` identity are removed.
Focused tests list the three specific identities, prove one live overlay across
switches, exercise typed unknown-mode refusal, and retain cleanup authority when
an exit callback fails. The Persistent Strategy facade still requires root
installation into that same adapter before cross-mode AC2 can be claimed.

### Continuity and atomicity

The device-local storage owner exposes record compare-and-set. The Game OS maps
that primitive to one `game-os:world-envelope` namespace. Each world envelope
contains both the expiring lease and continuity record under one revision.
The store also exposes `getVersioned`, whose opaque store revision remains
available when the envelope payload is malformed.
Commit reads one envelope, validates that exact lease epoch and continuity
revision, then compares and writes the whole next envelope. A successor that
acquires after expiry changes the same revision, so a previously validated
incumbent cannot commit across the takeover. Renew, release, initialization,
and reset use the same aggregate CAS; reset has no remove-then-create gap.
The continuity boundary exports only `lease_lost | store_unavailable |
record_malformed | digest_mismatch`. Shape/schema failures and revision,
chain, or replay-digest failures remain distinct; status reads convert either
to partial success through `unavailableSources[]`.

Continuity retains the initial snapshot, every periodic snapshot, the complete
fixed-step journal, and an append-only accepted-order journal with a monotonic
committed prefix count. `order` passes the entire pending tail through the
simulator once and CAS-persists only its sequence-canonical `acceptedOrders`
before acknowledgement. Direct commit uses the same canonical output. `commit`
atomically advances that durable tail, the fixed-step journal, and any due
snapshot. Close and resume therefore preserve pending orders without a memory
queue. Restore evaluates snapshots newest-to-oldest, selects the
newest one whose world/seed/state digest and last-order sequence match its
journal anchor, replays to
the committed digest, and reports rejected checkpoint ticks and replay span.
The current source-owned snapshot interval is eight ticks. This bounded
candidate deliberately does not invent a silent eviction policy: the storage
ceiling, retained-snapshot trade-off, and compaction policy remain measured
readiness work before long-lived production worlds are promoted.
A damaged newest snapshot therefore falls back to an older valid checkpoint.
If no valid predecessor remains, or the journal/envelope is malformed, restore
blocks, names `world:<worldId>`, preserves stored bytes, and reports the explicit
`/world operation=reset` action and a read-only inspection action. Digest
failures also report exact expected and actual digests. Every envelope, lease,
continuity, snapshot, journal entry, accepted order, world, and entity record
uses exact-key validation with non-coercing string and safe-integer checks.
Historical orders are globally sequence-validated even before the newest
usable snapshot.

That action uses one explicit repair CAS, not parse-acquire-delete-create. It
can replace a truncated envelope using the opaque store revision, but first
rejects any independently parseable live lease. A concurrent writer changes
the same revision and makes the repair CAS fail. The result contains a fresh
tick-zero continuity record and no lease; reopen then acquires normally. Reset
without a replacement definition first salvages and strictly validates the
stored tick-zero definition, including for a valid closed custom world. Missing
or corrupt evidence reports `fallbackDefinitionRequired`; only an explicit host
definition, or the confirmed tool reset's declared frozen default, may replace it.
World admission also validates unique faction, territory, and unit identities,
integer economy/strength fields, owners, unit references, neighbor references,
and symmetric adjacency before any overlay is created. It additionally validates
the exact faction set, territory IDs/ring topology, and unit identity/faction/
strength set against the embedded definition, then reconstructs tick zero before
admitting any snapshot or journal chain. Reopening without a host definition
uses the stored one; an explicitly mismatched host definition cannot mutate or
replace it. Reset is the only play-side operation that may deliberately install
a newly reviewed host definition.

The Canvas adapter stores each Game OS record as one canonical JSON envelope
plus its top-level CAS revision. This preserves canonical cost-log field names
without changing the existing storage owner's credential-field guard. A
degraded IndexedDB read or write cannot fall through to an empty memory store:
initialization and every Game OS get/CAS/remove path fail `store_unavailable`,
preventing fresh state from covering durable history.

`openGameOsIndexedDbContinuityStore` is the portable browser owner for consumers
that do not already host the Knowgrph persistence adapter. It stores the same
envelope under `worldId`, retains its opaque store revision independently of a
possibly corrupt payload, and runs
read-compare-write inside one IndexedDB `readwrite` transaction across browser
connections. A blocked schema upgrade fails with `store_unavailable` and closes
the request's connection if it later opens. An existing connection closes on
`versionchange`; subsequent access fails `store_unavailable`. Canvas and
GameXR therefore contribute no second world-store implementation.
Normal reads require exact outer and inner envelope identities/revisions.
Recovery reads require the exact outer wrapper but intentionally return the
inner value opaque; CAS compares the independent outer revision, so an explicit
reviewed reset can replace a corrupt inner envelope atomically.

### Offline and cost boundary

The play mutation graph calls no authoring transport. The read-only status path
may consume the data-only authoring cost-evidence contract through an injected
source; it cannot draft, validate, persist, or promote a definition. Every
completed fixed step emits exactly one record:

```json
{
  "model": null,
  "prompt_tokens": 0,
  "completion_tokens": 0,
  "cache_hits": 0,
  "estimated_cost_usd": 0,
  "incomplete": false
}
```

The authoring assist harness is a separate, explicit operator path. Its model
transport is injected, never constructed by the core. A session is limited to
at most three iterations and a caller-provided token budget. Two consecutive
iterations without a reduction in schema issues trip the schema circuit and
reject `authoring-circuit-open` while carrying the last canonical partial draft
marked for operator review. Iteration exhaustion uses the same typed rejection.
Each attempt carries cost evidence. The injected `GameOsAuthoringCostObserver`
receives every normalized cost record. `GameOsWorldDefinitionStore` receives
only output-valid candidates; invalid partials remain quarantined in typed error
details and report `world-definition-validation-failed` without a store write.
Every result reports `persisted`/`observed` or names the unavailable/failed port
as a delivery gap; transport and budget errors carry the same delivery evidence.
A harness retains its latest bounded cost records and observer gaps behind
`readCostStatus()`. Injecting that read-only source into `cost_summary` keeps an
observer failure visible after the immediate authoring call; a malformed source
is reported as unavailable rather than normalized silently.
A transport failure remains a typed authoring error with an incomplete cost
record and cannot prevent play. Persisted authoring output is always marked
`candidate-only` and `requiresOperatorReview: true`: the play runtime
does not import the authoring module, read its candidate store, or auto-promote
a draft. An operator must explicitly pass a reviewed typed definition through
the host-only `controlReviewedWorld` API.

### Invocation register

The native grammar accepts exactly this tuple:

| Kind | Declaration |
|---|---|
| Command route | `/world` |
| Binding | `@game-os` |
| Tag | `#persistent-world` |
| Sole argument key | `operation` |
| Operations | `open`, `resume`, `order`, `commit`, `reset`, `close` |

Example: `/world @game-os #persistent-world operation=resume`.

Duplicate sigils, a missing sigil, unknown route/binding/tag, more than one
argument, an unknown key, and an undeclared operation fail with
`invocation-invalid`; reordered or padded tuples are also rejected so the
catalog and parser share one canonical representation. The shared catalog declares exactly
`knowgrph.inspect_game_os` and `knowgrph.control_local_world`. The latter accepts
exactly one native invocation or `{ operation }`, requires `playerActionConfirmed:
true`, and publishes operation-discriminated `oneOf` leaves with exact
move/claim order records. Runtime admission rejects the same missing,
ambiguous, authority-bearing, or operation-inapplicable keys. It returns
`knowgrph.game-os-operation-result/v1` with a zero-cost record and nullable typed
`projectionGap`. The shared local
controller owns the single session; pending orders remain in the source-owned
continuity record. Canvas only projects the declarations into the existing
embedded-tool shape. Installing that
projection into the root application catalog remains an integration gate.
The composite control declaration is conservatively destructive because it
contains reset: both `destructive: true` and MCP `destructiveHint: true` are
projected, while inspection is read-only and non-destructive.

Embedded callers cannot supply `nowMs`, `sessionId`, or `leaseTtlMs`; those
keys are absent from both schemas and rejected at invocation. The controller
uses an injected internal clock (default `Date.now`), a secure opaque session
identity factory (default browser `crypto`), and an internally configured TTL
bounded to five minutes (60 seconds by default). This prevents future-clock
takeover, stale-clock commits, incumbent-ID echo, and unbounded self-locking.
The host may inject deterministic authority for tests and retains explicit
time parameters on non-tool `commitOrders`/`renewActive` APIs. Reset uses the
active session when one exists; without one it mints internal authority and
calls the atomic repair primitive, so a failed corrupt open does not disable
the advertised recovery action. `controlReviewedWorld` is serialized on the
same mutation tail and accepts only exact `open | resume | reset` requests with
both player and operator confirmation plus a normalized typed definition. It
retains the controller-owned clock, opaque session identity, and TTL; the public
tool schema remains seed-only and cannot promote an authoring candidate.

The portable frontend boundary is two factories. `createGameOsCoreRuntime`
accepts the consumer's local store adapter, mode declaration, optional existing
registry, and `onSessionState` projection hook. Asset injection is deliberately
absent: resolution is limited to the source-owned canonical manifest. The hook receives the
read-only state after open, step, and reset, followed by exactly one terminal
`null` on close/dispose with `{ worldId, digest, tick }`. A failed opening
projection attempts one durable close. Successful or terminal cleanup removes
the overlay; a transient store failure retains one runtime-owned retry handle
and returns typed `cleanupPending`, `durableLeaseReleased`, cleanup code/reason,
and the `runtime.dispose` retry action without hiding the projection failure.
Session mutation and projection share one tail, so concurrent direct callers
cannot finish a stale projection after a newer durable tick. A post-commit
projection failure does not reject the durable
commit: `inspect()` and tool results retain its committed tick/digest in
`projectionGap`. The runtime admits only one scene-bound session at a time,
rejects concurrent opens before a second lease is acquired, and suppresses a
displaced session's stale visual projection. Close keeps the session retryable
until durable lease release succeeds. A matched terminal lease/record/digest
failure clears the controller's stale local owner through a store-free detach
without masking the primary typed error; every store outage retains the same
retry handle, while a
post-release projection cleanup gap cannot leave a closed session attached.
`createGameOsLocalWorldToolController`
owns tool-driven sessions behind one mutation queue, so concurrent order/commit
calls retain call order while acknowledged orders survive close/reopen. Its non-tool `renewActive` host
method renews only the current lease; expiry or successor conflict fails typed
and never reacquires a lost lease. Its host-only
`commitOrders(worldId, orders, nowMs?)` atomically accepts and commits UI orders,
but fails before stepping when externally accepted tool orders are pending; it
never folds one provenance into the other.

### Read-only status surface

`readGameOsStatus` supports:

- `registered_modes`;
- `world_continuity`;
- `lease_state`;
- `determinism_digest`;
- `cost_summary`.

Each response uses `knowgrph.game-os-status/v1`, normalized entries,
`unavailableSources[]`, and a zero-cost record. Status uses store reads only.
Unreadable sources produce partial status rather than a write or silent reset.
An omitted clock uses validated `Date.now()`, so a historical lease is reported
expired instead of being compared against zero. The inspect tool declares five
closed input branches: `registered_modes` forbids `worldId`, while each
world-bound view requires it. Its output branches close and type the view's
entries, unavailable sources, and zero-cost record.

### Asset provenance gate

The runtime gate is constructed only from
`GAME_OS_REPOSITORY_ASSET_MANIFEST`; callers cannot inject another record. It
accepts only relative local paths (including rejection of
leading-slash absolute paths, backslashes, query/fragment suffixes, percent
escapes, and empty or literal dot segments),
an exact 40-character repository revision, an exact lowercase `sha256:` plus
64-hex content digest, a non-empty origin, `committed: true`,
and an allow-listed redistributable licence. It has no fetch, generation, or
model callback.

Repository evidence uses the tracked local file
`canvas/public/fixtures/geospatial/neutral-mesh.json` with provenance owner
`Knowgrph repository-authored neutral mesh fixture`, licence `CC0-1.0`, source
revision `7132c7096539fb1079e00bffc0f2cd024d423d9d`, and SHA-256
`ad90e36f1835a97d9559132d28993ea4b3825f2d621217a4fe54054b8fb076eb`.
The file-specific owner-issued grant is recorded in
`grph-shared/src/game-os/ASSET-LICENSES.md`; no repository-wide licence is
inferred. The test iterates every manifest entry, proves both paths are
Git-tracked, reads the single source file's local bytes, recomputes the digest,
compares the file's source revision, disables transport, and
rejects missing path evidence, missing provenance, a non-redistributable
licence, noncanonical paths/digests, a remote URL, and an absent asset reference.

Actual mode assets must contribute an equivalent source-owned manifest entry;
this fixture does not authorize an unrecorded asset, and no asset bytes are
duplicated into the manifest or runtime source.

## Acceptance coverage

| Source AC | Executable evidence | Candidate result | Residual integration |
|---|---|---|---|
| AC1 registry | shared contract plus the three existing application modes require full declarations, reject duplicate/unknown identity, and list specific first-person, flight-simulator, and city-builder identities without a shared identifier list | pass for the core and migration cohort | install Persistent Strategy through the same root adapter for application delivery |
| AC2 arbitration | registry and Canvas migration tests count one exit and one live overlay, release ownership on ordinary exit/reset, and retain cleanup authority after a failed exit callback | pass for the existing cohort | bind the Persistent Strategy facade to this root adapter before cross-strategy application AC2 |
| AC3 determinism | custom-definition TypeScript runtimes and the native Swift golden runtime produce byte-identical canonical states/digests for the same seed and orders; strict maxima and malformed-state cases fail | pass | live Apple simulator/device recording remains a delivery gate, not a determinism gap |
| AC4 continuity | three commits, retained snapshots, damaged newest checkpoint, older fallback, exact tick/digest/state and replay span | pass | measure the eight-tick interval and define a storage/retention ceiling before full readiness |
| AC5 offline | disabled `fetch` across canonicalized permuted commit/close/reopen; stored custom definition/digest restore; closed explicit reset preserves that definition | pass | visual browser smoke is not part of this source-only lane |
| AC6 corruption | historical order/scalar/unknown-key tampering fails; digest errors expose expected/actual and both recovery actions; opaque-IDB reset CAS-repairs | pass | none for the core |
| AC7 one writer | live/adversarial expiry races fail; IDB CAS admits one winner; tool clock/session/TTL spoofing fails; repair refuses live lease | pass | none for the core |
| AC8 zero cost | exactly one canonical null-model/all-zero record per fixed step | pass | authoring dependency scan proves play-path separation |
| AC9 grammar | exact tuple accepted; invalid grammar rejected; action-gated local dispatcher durably accepts/commits/resets typed operations | pass | root embedded catalog installation remains gated |
| AC10 status | all five views conform without writes; `cost_summary` includes bounded authoring records/gaps through a read-only injected source; Canvas projects the catalogued inspect tool with zero cost | pass | root embedded catalog installation remains gated |
| AC11 assets | tracked local file, exact source revision/digest/licence/origin, disabled fetch, negative cases | pass | each future mode asset needs its own manifest entry |
| Authoring harness | valid retry, typed circuit/exhaustion and budget rejection with quarantined partial, review-required valid candidate, immediately observed cost, explicit gaps, and later status visibility | pass | transport/store/evidence-source selection is an operator integration decision |

## Evidence reference

Run from the Knowgrph repository root:

```bash
npm --prefix grph-shared test
node --test grph-shared/src/game-os/swift-parity.contract.test.mjs
TSX_TSCONFIG_PATH=canvas/tsconfig.json node --import tsx --test canvas/src/__tests__/gameMmorpgCore.test.ts
(cd canvas && TSX_TSCONFIG_PATH=tsconfig.json node --import tsx --test src/__tests__/canvasSurfaceGameDeparture.test.ts src/__tests__/canvasXrSharedSurfaceOwnership.test.ts src/__tests__/flightSimSurfacePreload.test.ts)
swift test --scratch-path /tmp/knowgrph-game-os-swift-golden --filter GameOsPersistentStrategyGoldenTests
swift test --scratch-path /tmp/knowgrph-game-os-swift-full
```

The exact candidate gates pass: the shared suite is 82/82, the direct
TypeScript-to-Swift parity contract is 1/1, the Canvas persistence/facade suite
is 9/9, and the registry plus pending-open regression slice is 25/25 (including
the 12/12 registry-migration subset). The Swift golden suite is 8/8 and the full
Swift package is 26/26.

The shared suite covers focused cases including ordered state projection,
exactly-once terminal close, and failed-open cleanup. The 9/9 Canvas suite uses
`fake-indexeddb` only as the test implementation of browser IndexedDB and proves
two independently opened persistence instances restore the same last commit,
enforce one writer, retain one overlay, parse the invocation, resolve a local
asset, make zero outbound requests, catalogue exactly two embedded tools, reject
unconfirmed/extra-key/caller-authority control, isolate host/tool order provenance,
repair a truncated record, reject live-writer reset and invalid entity graphs,
reject degraded persistence instead of seeding memory, repair an opaque corrupt
inner envelope, admit one cross-connection CAS winner, fail a blocked upgrade, and close a
connection on version change.

### Existing utility reuse and ECS reconciliation

This lane reuses the repository-root owners that are publicly consumable:

- canonical Game OS digests call `grph-shared/src/hash/stringHash.ts` rather
  than introducing a hash dependency;
- Canvas continuity delegates durable reads and CAS writes to
  `knowgrphStorageEnginePersistence`; its adapter contains no IndexedDB schema;
- consumers without that host use the one shared `indexedDbStore.ts` owner;
- visual state leaves through `onSessionState`; neither shared core nor Canvas
  facade creates a scene graph, renderer, or renderer canvas;
- the Canvas no-copy test rejects local renderer, object-store, IndexedDB-open,
  registry-construction, transport, and authoring ownership.

The strategy module is currently a pure domain reducer: it allocates no live ECS
world, scene, renderer, or persistence store. It owns the required
territory/supply/move rules and canonical serializable state. The existing
`@knowgrph/agentic-ecs` package exposes only its five bounded mutation/query
verbs; its `snapshotWorld`/lifecycle seams are deliberately private, it has no
TypeScript contract consumable from `grph-shared`, and it is outside this
lane's authority. Therefore the PRD reference-mapping requirement to execute
the reducer through the existing ECS substrate remains an explicit expansion
gate, not a falsely claimed reuse. The narrow follow-up keeps the existing
five-export ECS API, runs strategy as one atomic ECS system, and returns its
canonical post-tick state through the system decision payload. Packaging must
make that dependency closure portable before `grph-shared` can bundle it; no
second simulator, sixth generic ECS export, or sibling-checkout fallback is
permitted.

## Readiness and dependencies

| Component | Local rung | Delivered rung | Gate still required |
|---|---|---|---|
| Shared schemas, registry, simulation, continuity, lease | focused-tested | undocumented | ECS binding and protected integration review |
| Snapshot retention and storage ceiling | source-default only | undocumented | measure the eight-tick interval and adopt an explicit bounded retention/compaction policy |
| Existing ECS substrate adapter | blocked by current write-scope ownership | undocumented | make the five-export package portable and route strategy through one atomic ECS system |
| Invocation parser, control dispatcher, status, asset gate | focused-tested | undocumented | root embedded route/catalog installation for application delivery |
| Authoring-only harness | focused-tested | undocumented | explicit transport, cost observer, candidate store, and status-source selection |
| Shared core runtime, IndexedDB owner, and local tool controller | focused-tested | undocumented | protected integration review |
| Knowgrph IndexedDB/tool projection facade | focused-tested | undocumented | install Persistent Strategy through the canonical scene adapter and visual UI owner |
| Portable shared package export | focused-tested | undocumented | consume only from an exact reviewed package artifact |
| Existing first-person/flight/city migration | focused-tested | undocumented | protected integration review; no hard-coded identity/exit registry remains |
| GameXR consumer | undocumented | undocumented | consume the pinned shared export; frontend-only integration in its own repository lane |
| Native Swift fixed-step parity | focused-tested | undocumented | protected integration plus live Xcode/visionOS evidence |
| Apple/XR view, motion, and camera integration | undocumented | undocumented | existing native owner handoff and live simulator/device proof |
| Production and Cloudflare | undocumented | undocumented | protected integration, explicit release authority, exact-SHA runtime proof |

## TCO and token economics

| Path | Infrastructure | Runtime token cost | Egress | Time-to-value |
|---|---:|---:|---:|---|
| Play and restore | existing browser + IndexedDB | $0 | $0 | one open call, no account or network |
| Status and invocation parse | in-process | $0 | $0 | immediate typed result |
| Asset resolution | committed bundle | $0 | $0 | local manifest lookup |
| Optional authoring assist | injected operator transport | budget-capped and logged | provider-dependent | ≤3 attempts, never required for play |

This keeps the recurring play-loop TCO at zero while making optional authoring
spend visible, bounded, and removable.

## Deploy Boundary Register

| Boundary | From | To | Authority | State |
|---|---|---|---|---|
| `game-os-core-integrate` | isolated authoring candidate | protected Knowgrph main | protected review and exact candidate evidence required | closed |
| `game-os-package-consume` | protected Knowgrph package | GameXR frontend lane | pinned export plus separate repository claim required | closed |
| `game-os-mirror-promote` | protected source | Production mirror | explicit release authority and mirror proof required | closed |
| `game-os-deliver` | approved mirror | Cloudflare/public delivery | exact-SHA runtime verification and explicit deployment authority required | closed |

No command in this candidate authorizes merge, GameXR mutation, browser UI
activation, Apple simulator work, mirror publication, or deployment.
