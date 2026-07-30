---
title: "Reference implementation: Knowgrph City Simulation PRD/TAD"
id: "md:knowgrph-game-city-building-sim-prd-tad"
doc_type: "PRD/TAD"
version: "1.3.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.game.city-simulation"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
frontmatter_contract: "required"
requirements_authority: "/.kiro/specs/knowgrph-city-building-sim/requirements.md"
---

# Reference implementation: Knowgrph City Simulation PRD/TAD

## 1. Product decision

Knowgrph will add a small, deterministic city simulation to the existing
shared Canvas. The feature turns a parcel zoning decision into an immediately
visible economy change and a bounded, explainable local recommendation. It is
an extension of current Canvas, FloatingPanel, camera, WorkspaceFs, MCP, and
gameplay-overlay owners rather than a standalone game or application.

The normative contract is
`.kiro/specs/knowgrph-city-building-sim/requirements.md`. This PRD/TAD explains
why the feature exists and how its ownership fits the product. The workspace
seed is a derived activation/proof projection and must never make a runtime
claim without exact-SHA evidence.

Every feature artifact is source-authored for Knowgrph. Only existing
repository-owned dependencies and assets may be used. No other
implementation's code, prose, schema, example, binary, or asset may be copied
or derived.

## 2. Problem and outcome

Probe-tree decisions are architecturally useful but difficult to understand in
an abstract graph. A compact city grid makes the loop legible:

1. select a parcel;
2. assign a zone or request a recommendation;
3. advance one deterministic tick;
4. observe population, land value, and treasury change;
5. save the exact state to a readable workspace document.

The intended outcome is a repeatable, two-minute local demo whose state can be
inspected through the same UI, Source Files, and agent interfaces already used
by Knowgrph.

## 3. Personas and journey

### Primary persona

A solo builder or presenter who needs a predictable local demonstration with
no account, hosted service, new asset pipeline, or model cost.

### Secondary persona

A reviewer who needs to verify that one source document caused the runtime
state and that a recommendation is bounded and non-mutating until approved.

### Happy path

1. Start Knowgrph from the exact candidate.
2. Open the city workspace seed in Explorer -> Source Files and apply it.
3. City Builder opens and the authored 4 by 4 grid appears on the shared
   Canvas.
4. Select `r00c02`, zone it residential, and Start.
5. One tick commits; Stop fences later ticks.
6. Request Advice and inspect the ranked, zero-cost proposals.
7. Save and confirm read-back from `/game-city-sim/city-grid.md`.
8. Visit the six existing FloatingPanel views and see one shared city revision.
9. Exit and recover the prior surface and camera.

## 4. Scope

### Must ship

- one typed 4 by 4 authored seed and a grid model that supports up to 64 by 64
  parcels without changing the document schema;
- residential, commercial, and industrial zoning;
- exact integer v1 economy coefficients and a fixed 1000 ms tick;
- Open, Start, Stop, Restart, Zone, Advise, Save, Reset, and Exit;
- a deterministic two-round local Advisor with a clarify gate;
- strict `/game.city @canvas #civic` native invocation;
- exactly two browser-local MCP tools;
- KGC plus CSV save/read-back at `/game-city-sim/city-grid.md`;
- one additive city stage in the existing shared Canvas;
- `cityBuilder` plus city projections in Media, Animation, Motion Control,
  Game Mode, Flight Sim, and Camera;
- source-neutral exact-SHA browser proof.

### Deferred

- traffic and pedestrian simulation;
- multiplayer, sync, shared cities, and server persistence;
- procedural asset downloads;
- model-backed narration or Advisor enrichment;
- production publication or Cloudflare deployment.

### Success criteria

| Measure | Target |
|---|---:|
| First visible value from source application | within 2 minutes |
| First-value manual actions | at most 5 |
| Required model calls | 0 |
| Required network calls for core loop | 0 |
| Added runtime dependencies | 0 |
| Canvas elements during session | exactly 1 |
| Deterministic replay | byte-identical |
| Save targets | exactly 1 |
| Advisor rounds | at most 2 |

### ROI, MoSCoW, and time-to-value

The scoring threshold for Must scope is `1.0`, using
`(impact × monthly sessions) / (build hours + monthly TCO + monthly token
cost)`. Estimates are planning inputs, not delivery evidence.

| Feature | Tier | Impact | Sessions/month | Build hours | Monthly cash/token TCO | ROI score | Rationale |
|---|---|---:|---:|---:|---:|---:|---|
| Deterministic grid, lifecycle, and save | Must | 4 | 12 | 40 | $0 | 1.20 | Smallest complete observable loop |
| Local Advisor and shared projections | Must | 3 | 12 | 30 | $0 | 1.20 | Explains the state without a model |
| Model narration | Won't | 2 | 4 | 24 | $5 | 0.28 | Lower value and breaks the zero-token loop |
| Multiplayer persistence | Won't | 2 | 2 | 160 | $25 | 0.02 | Outside the local demonstration problem |

The primary journey has five manual actions before the first committed tick
and a two-minute elapsed ceiling. A clean-environment timed walk-through is
still unrecorded, so the target does not raise readiness.

| Time-to-value dimension | Estimate | Ceiling | Validation |
|---|---:|---:|---|
| Manual actions | 5 | 5 | clean-workspace browser walk-through |
| Elapsed time | 2 minutes | 2 minutes | timed first-tick proof |
| First-value action | one committed deterministic tick | — | visible revision and metric delta |
| Persona | solo builder/presenter | — | primary journey |

### Twelve-month deployment-model TCO

All values are estimates at the bounded demo load and exclude feature build
hours. None authorizes a promotion.

| Deployment model | Infra | API, egress, tokens | Ops | 12-month cash TCO | Disposition |
|---|---:|---:|---:|---:|---|
| Browser-local, existing FOSS application | $0 | $0 | 6 h/year | $0 | Chosen |
| Managed/serverless static delivery | $0 estimated within existing allowance | $0 | 4 h/year | $0 estimated | Not authorized |
| Provisioned/self-managed FOSS web server | $72/year | $0 | 18 h/year | $72 | Rejected for idle capacity |
| Hybrid/consolidated existing host | $0 incremental | $0 | 8 h/year | $0 incremental | Deferred; no delivery need |

## 5. Product surfaces

### City Builder

`cityBuilder` is the only complete editing surface. It displays lifecycle,
metrics, current selection, zone controls, Advisor results, save/read-back
status, and typed errors.

### Existing FloatingPanel views

| View | City contribution | Ownership rule |
|---|---|---|
| Media | palette and parcel-appearance context | read-only projection |
| Animation | fixed-step playback and tick revision | delegates Start/Stop |
| Motion Control | normalized input and current selection | no input copy |
| Game Mode | exclusive city-overlay state | explicit enter/exit handoff |
| Flight Sim | read-only aerial-inspection handoff | no second city world |
| Camera | orthographic framing and restore target | shared camera owner |

All seven views read one immutable City Runtime snapshot. Switching views must
not recreate, fork, or reset the city.

## 6. Interaction contract

### Native invocation

```text
/game.city @canvas #civic operation=<operation>
```

Operation arguments:

```text
operation=zone parcel=<rNNcNN> type=<residential|commercial|industrial>
operation=advise scope=<parcel|district>
```

Only `operation`, `parcel`, `type`, and `scope` are accepted keys. Missing
tokens, repeated sigils, repeated or unknown keys, mixed payload forms,
unsupported operations, and missing arguments fail without mutation.

### Input parity

Pointer, keyboard, and touch actions normalize to the same selected-parcel and
requested-zone actions. Input is copied into a queued runtime snapshot so a
later event cannot change an already scheduled tick or operation.

### Direct manipulation

Parcel interaction follows:

`select -> inspect -> choose zone -> validate -> commit -> observe next tick`.

An invalid parcel, zone, or lifecycle action explains why it was rejected and
leaves the committed revision unchanged.

## 7. Economy contract

The v1 model uses safe integers:

- treasury and land value: cents;
- tax rate: basis points;
- population and pollution: whole units.

Each tick applies parcel deltas in stable parcel-id order:

| Zone | Population | Land value | Pollution |
|---|---:|---:|---:|
| unzoned | 0 | 0 | 0 |
| residential | +2 | +200 cents | 0 |
| commercial | +1 | +100 cents | 0 |
| industrial | 0 | -50 cents | +1 |

Then:

```text
tax revenue cents = floor(total population * tax rate basis points / 100)

treasury delta cents =
  tax revenue cents
  + 300 * commercial parcel count
  + 500 * industrial parcel count
  - 100 * zoned parcel count
```

A complete candidate is validated before publication. One invalid or unsafe
integer aborts the whole tick. Time, frame cadence, locale, random values, and
object iteration order are not inputs to the economy.

## 8. Advisor contract

The Advisor is a deterministic browser-local harness:

`generate -> select -> clarify -> evolve`.

It validates scope first, runs no more than two rounds, and scores proposals
from the committed parcel/economy snapshot. A top-two delta below epsilon
returns `clarify_required: true` and changes no zone. A tie still present at
the cap prefers greater current land value, then the lexicographically smaller
parcel id, while retaining a tie flag.

Advice remains a proposal. An explicit Zone operation is the only way to
commit it. Every call emits one honest cost record with model `none` and all
token/cost fields zero.

## 9. Persistence contract

The only path is `/game-city-sim/city-grid.md`, owned through WorkspaceFs.
The document uses schema `knowgrph-city-grid/v1`:

1. ordered KGC frontmatter for city name, tick, treasury cents, and tax basis
   points;
2. one CSV table for parcel id, row, column, zone, land-value cents,
   population, and pollution;
3. stable parcel-id ordering, LF line endings, and one final newline.

Save is explicit. It writes, reads the same path back, compares bytes, parses
the read-back, and compares semantic state before reporting success. Open uses
a valid existing document or the authored default when the path is absent.
Malformed bytes remain untouched and block Start/Restart. Reset selects the
authored default in memory without overwriting those bytes.

## 10. Technical architecture

### Topology: city simulation v1.3 — conformance baseline

**Boundaries:** trusted browser runtime and device-local storage in Authoring;
an unmaterialized non-public Mirror; and an unprovisioned public Delivery
surface. Mirror and Delivery nodes below describe closed promotion targets,
not deployed components.

| Node | Role | Type | Lane | Connects to | Connection type | Data residency |
|---|---|---|---|---|---|---|
| City controls | Producer/router | Browser UI + invocation parser | Authoring | City Runtime | synchronous function call | volatile user-device memory |
| Embedded tools | Gateway | Browser-local WebMCP | Authoring | City Runtime | asynchronous typed function call | volatile user-device memory |
| City Runtime | Router | Browser function/state owner | Authoring | economy, Advisor, Workspace adapter, stage | synchronous function calls; async save | volatile user-device memory |
| Economy + Advisor | Producer | Pure browser functions | Authoring | City Runtime | synchronous return | volatile user-device memory |
| Workspace adapter | Store adapter | Browser function | Authoring | city-grid document | asynchronous WorkspaceFs read/write | user device |
| City-grid document | Store | KGC + CSV document | Authoring | Workspace adapter | device-local persistence | user device |
| City stage | Consumer | React Three Fiber group | Authoring | shared Canvas and camera owner | synchronous render projection | volatile user-device memory |
| Approved mirror package | Consumer | immutable publish artifact, absent | Mirror | public delivery surface | batch publish, boundary closed | none; not materialized |
| Public delivery surface | Consumer | static browser application, absent | Delivery | end-user browser | HTTPS fetch, boundary closed | none; not provisioned |

```mermaid
flowchart TB
  subgraph A["Authoring boundary — trusted browser and device-local data"]
    Controls["City controls · producer/router"] -->|sync function| Runtime["City Runtime · router"]
    Tools["Embedded tools · gateway"] -->|async typed call| Runtime
    Runtime -->|sync function| Logic["Economy + Advisor · producers"]
    Runtime -->|async WorkspaceFs| Store["City-grid document · device-local store"]
    Runtime -->|sync immutable projection| Stage["City stage · consumer"]
  end
  subgraph M["Mirror boundary — absent"]
    Mirror["Approved mirror package · not materialized"]
  end
  subgraph D["Delivery boundary — absent"]
    Delivery["Public delivery surface · not provisioned"]
  end
  A -. "closed batch promotion" .-> Mirror
  Mirror -. "closed batch promotion" .-> Delivery
```

**Version note:** v1.3 adds explicit roles, types, connections, residency, and
closed Mirror/Delivery targets; it does not change runtime placement or claim
promotion.

### Component inventory and VCC ownership

| Component ID | Component / interface | Responsibility | Local rung | Delivered rung | VCCs |
|---|---|---|---|---|---|
| `TAD-CITY-RUNTIME` | City Runtime / `dispatchCityOperation` | Runtime commits one valid operation atomically. | dev-proven | undocumented | 01, 02, 07 |
| `TAD-CITY-MODEL` | economy + Advisor / `advanceCityTick`, `adviseCityZoning` | Pure functions derive bounded deterministic results. | dev-proven | undocumented | 01, 04, 07 |
| `TAD-CITY-PERSIST` | codec + WorkspaceFs / `saveCityGridToWorkspace` | Adapter verifies one canonical document by read-back. | dev-proven | undocumented | 03, 07 |
| `TAD-CITY-STAGE` | stage + camera / immutable projection | Consumer renders one snapshot in the shared Canvas. | dev-proven | undocumented | 02, 07 |
| `TAD-CITY-INVOKE` | parser / `executeCitySimInvocation` | Parser validates the exact native grammar before dispatch. | dev-proven | undocumented | 05, 07 |
| `TAD-CITY-MCP` | embedded tools / inspect + control | Gateway exposes the same dispatcher at browser-local trust. | dev-proven | undocumented | 06, 07 |
| `TAD-CITY-MIRROR` | approved package / batch publish | Absent target receives only an approved whole candidate. | undocumented | undocumented | — |
| `TAD-CITY-DELIVERY` | public surface / HTTPS | Absent target serves a promoted mirror. | undocumented | undocumented | — |

For each component, dependencies are exactly the topology `Connects to`
edges; configuration is the typed grid/economy/invocation schema; the runtime
uses the existing FOSS application stack and no paid dependency. Evidence and
rungs are owned by the VCC register, not inferred from source paths.

| Quality attribute | Bound | Architectural pattern | VCC |
|---|---|---|---|
| Determinism/performance | fixed 1000 ms tick; grid at most 64 by 64 | safe integers, stable ordering, atomic candidate | 01 |
| Security | no remote route; mutation through explicit control | strict parser and existing approval owner | 05, 06 |
| Offline behavior | 0 required network/model calls | local pure functions + WorkspaceFs | 01, 03, 04 |
| Observability | typed result for every operation; one zero Cost_Log/advice | shared immutable snapshot | 04 |
| Device reach | pointer, keyboard, touch parity | copied normalized input snapshot | 01, 07 |

### Single-world rule

The City Stage is a React Three Fiber group with instanced parcel/building
meshes and selection hit testing. It is inserted by the existing gameplay
overlay owner and never creates a Canvas or alternate renderer. Opening another
exclusive gameplay surface exits the city through the common lifecycle first.

### Camera rule

City entry installs a mode-scoped orthographic `isometric-topdown` framing
through the existing camera owner. Responsive bounds update the projection
matrix. Exit reinstalls the captured camera reference exactly once.

### Persistence rule

The codec knows bytes but not WorkspaceFs. The WorkspaceFs adapter knows one
path but not formatting. The Runtime coordinates Save/read-back and publishes
the result. This separation keeps each failure observable and testable.

### MCP rule

Schema `knowgrph-city-sim-mcp/v1` registers exactly:

- `knowgrph.inspect_local_city_sim`;
- `knowgrph.control_local_city_sim`.

Inspect is read-only. Control uses the existing approval owner. Both delegate
to the same runtime dispatcher as City Builder and native invocation; no route
or deployment authority is added.

### Invocation Register: city simulation

This is the sole declaration site for these invocation identities.

| Route | Kind | Owner | Typed arguments | Trust boundary | Token cost |
|---|---|---|---|---|---:|
| `/game.city` | Command | `city-sim-invocation-owner` | `operation` enum; `parcel` `rNNcNN`; `type` enum; `scope` enum | browser-local; mutations explicit | 0 |
| `@canvas` | Binding | `city-sim-invocation-owner` | — | read-only surface selection | 0 |
| `#civic` | Tag | `city-sim-invocation-owner` | — | read-only context selection | 0 |
| `knowgrph.inspect_local_city_sim` | Tool identity | `city-sim-agent-ready-owner` | empty object | browser-local read | 0 |
| `knowgrph.control_local_city_sim` | Tool identity | `city-sim-agent-ready-owner` | native invocation or one structured operation | browser-local approval-gated mutation | 0 |

### Gateway federation and capability catalog disposition

The federation has one embedded browser surface. No remote gateway, proxy,
stdio, or HTTP transport is implied.

| Tool identity | Contributing catalog | Federated surface | Capability status | Federation disposition |
|---|---|---|---|---|
| `knowgrph.inspect_local_city_sim` | canonical agent-ready tool contract | embedded browser WebMCP | registered local read tool | catalogued in embedded federation; remote unregistered |
| `knowgrph.control_local_city_sim` | canonical agent-ready tool contract | embedded browser WebMCP | registered local mutation tool | catalogued in embedded federation; remote unregistered |

The catalog union deduplicates by full tool identity. Unavailable remote
catalogs are not synthesized; `sourceCatalogs[]` contains only the embedded
catalog for this feature.

**Routing rule:** browser-local read/control routes to the embedded surface;
all remote trust needs are excluded. **Catalog union source:** the canonical
agent-ready contract. **Excluded:** a monolithic proxy and transport parity.

## 11. Architecture decisions

### ADR-1: Additive stage, not a second world

**Decision:** Mount instanced city meshes inside the existing shared Canvas.

**Reason:** One scene and camera lifecycle keeps overlays composable and avoids
the synchronization and accessibility cost of a parallel renderer.

### ADR-2: Integer economy

**Decision:** Store all money in cents and tax in basis points.

**Reason:** Integer arithmetic plus stable ordering makes replay and serialized
proof straightforward.

### ADR-3: One document, explicit read-back

**Decision:** Use one KGC plus CSV document and make Save verify its own
WorkspaceFs read-back.

**Reason:** The artifact remains human-readable and git-diffable while the UI
can distinguish an in-memory commit from a durable save.

### ADR-4: Local Advisor only

**Decision:** Ship a bounded deterministic heuristic and no enrichment branch.

**Reason:** The demo remains offline, zero-cost, replayable, and honest.

### ADR-5: Shared projection component

**Decision:** Compose one city projection wrapper around the six existing
FloatingPanel routes.

**Reason:** Existing panels retain ownership, city state stays centralized, and
the change avoids six copies and dependency cycles.

### ADR alternatives and twelve-month TCO

Cash estimates assume the bounded local workload; maintainer hours expose the
otherwise hidden operations cost. Each rejected option is FOSS-capable and
would add no license fee, but duplicates an existing owner.

| ADR | Chosen option | FOSS alternative considered | Chosen 12-month TCO | Alternative 12-month TCO | Decision |
|---|---|---|---|---|---|
| 1 | stage in shared renderer | standalone FOSS scene/renderer | $0 + 4 h | $0 + 24 h | Reject duplicated world and camera owner |
| 2 | native safe integers | FOSS arbitrary-precision numeric library | $0 + 2 h | $0 + 6 h | Reject unnecessary dependency |
| 3 | KGC + CSV through WorkspaceFs | FOSS embedded browser database | $0 + 6 h | $0 + 16 h | Prefer readable, diffable state |
| 4 | deterministic local heuristic | FOSS local model runtime | $0 + 4 h; 0 tokens | about $120 power + 24 h; unbounded inference risk | Preserve offline deterministic zero cost |
| 5 | one projection wrapper | separate FOSS React composition per panel | $0 + 10 h | $0 + 30 h | Avoid duplicated adapters |

## 12. Error policy

Every rejected operation returns a typed local result containing a code and
specific offending value. Entry failure restores the prior surface/camera.
Tick failure preserves the prior revision. Save mismatch preserves in-memory
state and reports unsaved. Malformed file handling never repairs or overwrites
bytes. Advisor ambiguity never auto-zones.

## 13. VCC and Evidence Reference register

VCCs 01–06 have one reproducible authoring result; VCC-07 has no
candidate-bound browser result. That derives local `dev-proven`, not
`runtime-ready`, and proves nothing about delivery.

| VCC | Evaluator-checkable end state and constraint | Stated check | Evidence Reference |
|---|---|---|---|
| `VCC-CITY-01` | Two equal seeds and input traces yield byte-identical valid city states; no clock, random, network, or model input. | Registered city model, economy, input, and lifecycle cases exit 0 with non-zero totals. | 2026-07-30 authoring: `npm --prefix canvas run test:ci:unit -- city.sim`; 31/31 passed |
| `VCC-CITY-02` | All seven views project one revision in one Canvas and exit restores the captured surface/camera exactly once. | Registered shared-surface, camera, and projection cases exit 0. | same authoring run; relevant camera/source/runtime cases passed |
| `VCC-CITY-03` | Save writes only the canonical path, verifies byte and semantic read-back, and preserves malformed prior bytes. | Registered codec and persistence cases exit 0. | same authoring run; codec/persistence cases passed |
| `VCC-CITY-04` | Advisor returns at most two deterministic rounds and one zero-token cost record without mutating a zone. | Registered Advisor cases exit 0 and surface round/cost assertions. | same authoring run; Advisor case passed |
| `VCC-CITY-05` | Parser accepts only the exact tuple and typed operations; every invalid input leaves the revision unchanged. | Registered invocation cases exit 0 with accepted/rejected counts. | same authoring run; invocation case passed |
| `VCC-CITY-06` | Exactly two catalogued embedded tools inspect/control the same dispatcher; no remote transport or deployment authority is added. | Registered MCP contract and source-ownership cases exit 0. | same authoring run; MCP/source cases passed |
| `VCC-CITY-07` | A clean browser reaches first tick within five actions/two minutes, then proves save, projections, stop fence, replay, and exit at one exact SHA. | Candidate-bound browser proof surfaces elapsed time, action count, SHA, and assertions. | none recorded |

## 14. PRD ↔ TAD ↔ VCC traceability

| PRD requirement | Product outcome | TAD component / interface | VCC |
|---|---|---|---|
| `PRD-CITY-R1/R12` | source ownership and honest evidence | `TAD-CITY-RUNTIME` / evidence boundary | 01, 07 |
| `PRD-CITY-R2/R11` | activation and seven-view proof | `TAD-CITY-STAGE` / immutable projection | 02, 07 |
| `PRD-CITY-R3/R10` | shared scene, camera, responsive rendering | `TAD-CITY-STAGE` / stage + camera framing | 02 |
| `PRD-CITY-R4/R5` | deterministic economy and lifecycle | `TAD-CITY-RUNTIME` / dispatch; `TAD-CITY-MODEL` / tick | 01 |
| `PRD-CITY-R6` | canonical save and read-back | `TAD-CITY-PERSIST` / WorkspaceFs adapter | 03 |
| `PRD-CITY-R7` | bounded local advice | `TAD-CITY-MODEL` / advise | 04 |
| `PRD-CITY-R8` | strict native invocation | `TAD-CITY-INVOKE` / parse + execute | 05 |
| `PRD-CITY-R9` | two browser-local tools | `TAD-CITY-MCP` / inspect + control | 06 |

The component inventory provides the reverse component-to-VCC mapping; no
component or requirement is intentionally orphaned.

## 15. Readiness Gap Matrix

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| deterministic runtime and Advisor | dev-proven | undocumented | clean-browser proof incomplete | major | 01, 04, 07 |
| shared stage and persistence | dev-proven | undocumented | clean-browser proof incomplete | major | 02, 03, 07 |
| invocation and embedded tools | dev-proven | undocumented | no delivery proof | major | 05, 06, 07 |
| clean browser first value | spec-complete | undocumented | exact-SHA proof absent | major | 07 |
| Mirror and Delivery | undocumented | undocumented | targets absent and promotion not requested | none | separate promotion VCC required |

### Agent-platform dimensions and execution order

| Dimension | Tier | Order | Local rung | Delivered rung | VCC / disposition |
|---|---|---:|---|---|---|
| Agentic OS-ready | Won't this increment | — | undocumented | undocumented | no OS Status Surface declared |
| AI Agent-ready | Must | 1 | dev-proven | undocumented | 06, 07; embedded discovery only |
| MCP Gateway-ready | Won't this increment | — | undocumented | undocumented | remote gateway excluded; embedded tool disposition is recorded |

No Follow-on work starts before VCC-06 is satisfied. Discovery and reads stay
at zero tokens; no agent-platform path can promote a candidate.

## 16. Lane topology and Deploy Boundary Register

| Lane | Function | Mutation rights | Data residency | Readiness ceiling |
|---|---|---|---|---|
| Authoring | write and prove one candidate | source, tests, browser-local state | maintainer worktree and user device | runtime-ready |
| Mirror | hold one approved non-public package | publish-only; currently absent | none | runtime-ready |
| Delivery | serve one promoted mirror | publish-only; currently absent | none | production-verified |

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement | State |
|---|---|---|---|---|---|---|
| `CITY-AUTHORING-TO-MIRROR` | Authoring | Mirror | none recorded | none; no promotion authorized | retain prior mirror and verify its manifest is unchanged | closed |
| `CITY-MIRROR-TO-DELIVERY` | Mirror | Delivery | none recorded | none; no promotion authorized | retain prior delivery revision and re-run its prior reachability check | closed |
