---
title: "Spatial workspace and GameXR integration — reference implementation"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.1.0"
date: "2026-09-26"
lang: "en-US"
owner: "Spatial integration maintainer"
continuity_id: "SPATIAL-GAMEXR-001"
prd_revision: "0.1.0"
tad_revision: "0.1.0"
adr_revision: "0.1.0"
mvp_revision: "0.1.0"
gtm_revision: "0.1.0"
frontmatter_contract: "required"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
lifecycle_status: "proposed"
universal_scope: false
worktree_id: "device-cba000d3779d--spatial-gamexr-plan"
agent_id: "codex-01a0dba4"
guidelines_ref: "huijoohwee.github.io/guidelines/prd-tad-adr-mvp-gtm-guidelines.md@2.7.0"
reviewed_source_revision: "d91de86b772825aaec70e773f902756b6fd16e25"
load_policy: "on-demand"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
kgDocumentSemanticMode: "document"
surfaces:
  - "2D Renderer: Storyboard"
  - "2D Renderer: D3 Graph"
---

# Spatial workspace and GameXR integration — reference implementation

All five roles join **SPATIAL-GAMEXR-001@0.1.0**. This is the cross-runtime extension plan,
not evidence that either application's scene format can already execute the other's proposals.
The [spatial review owner](agentic-graph-spatial-workspace-prd-tad-adr-mvp-gtm.md),
`SPATIAL-WORKSPACE-001@0.9.0`, retains Graph's transaction and geometry requirements.
Canvas consumes that contract at `CANVAS-CONTROL-SURFACE-001@1.0.6`.
GameXR retains its game manifest, frontend, assets and local storage. Its existing drone plan
`DRONE-FLIGHT-PATH-001@1.2.0` retains bench transport; this plan grants it no new command authority.

Context: related runtimes share some primitives but have different document and approval owners.
Intent: make those capabilities discoverable without confusing a simulation, a proposal or an
observation with an accepted edit. Directive: reuse existing owners, expose unsupported seams,
then implement one reversible game-manifest edit. Role/action/outcome: the spatial integration
maintainer grounds the boundaries and sequences checked source changes. Contributor invocation:
`/change #spatial-gamexr-plan @codex-01a0dba4`; this is not a new product route.

## Codebase grounding — reference implementation

The input is the earlier spatial plan plus the user's requested GameXR expansion. The bounded
inventory below supersedes its package-only GameXR observation. Source locators resolve against
these exact Git objects; source presence is distinct from executed or deployed behavior:

| Key | Repository / exact revision | Observation boundary |
|---|---|---|
| G | `agentic-graph@d91de86b772825aaec70e773f902756b6fd16e25` | Protected PR #1307; current Graph source |
| C | `agentic-canvas-os@e36ff95c210aa3fd11002958fde9bcbd26b336da` | Protected PR #952; current Canvas source |
| X | `GameXR@01b18b515b05e027d966eb157746332d2d830bd0` | Fetched protected main; local canonical checkout is six commits older |
| O | `agentic-os@84a15c89e5a0f8ea6926a0ce4685ce40d9ccf2a6` | Lifecycle/diagnostics owner; each consumer's lockfile still selects its own runtime |
| D | Graph PR #1299, head `e4e7317aa5bceee0432eb4f119e8168c9f27448c` | Open, behind main at review time; no protected integration claim |

| Claim | Disposition | Exact source evidence and consequence |
|---|---|---|
| G owns revision-bound authored edits | confirmed | `canvas/src/features/three/spatialWorkspaceModel.ts`, `spatialWorkspaceRuntime.ts`, `SpatialWorkspaceReview.tsx`; 8 edits, one pending proposal, 32 receipts, 128 KiB review budget; operator apply/undo |
| C can inspect and preview the active G document | confirmed | `web/spatial-workspace-client.mjs`, `__tests__/spatial-workspace-client.test.mjs`; host-injected same-realm registry, no apply/undo or network proxy |
| X has a general graph of editable scene entities | contradicted | `src/config/types.ts`, `src/config/manifest.ts`, `shared/gamexr.scene.schema.json`: closed `gamexr-scene/v1` with one ship, optional planet, procedural world and configuration; not G's subject/cast document |
| X owns persisted manifests and local assets | confirmed | `src/storage/LocalDatabase.ts`: `gamexr-local-v1`, scenes/assets/meta stores; scene and active ID share a transaction, with no expected-revision argument |
| X tools already implement spatial review | absent | `src/mcp/contracts.ts`: `gamexr.inspect_runtime` and `gamexr.control_runtime`; `apply-manifest-patch` validates then immediately calls `applyManifest`; no proposal, expected token, approval receipt or guarded undo |
| X manifest application already persists before activating its prepared projection | confirmed | `src/runtime/GameRuntime.ts#applyManifest` calls `rebuildScene(nextManifest, true)`: prepare assets, await `LocalDatabase.saveScene`, recheck generation, then swap projection. Preserve this ordering; expected-source compare-and-set, review receipt and explicit readback evidence are absent |
| X WebMCP fallback proves a browser-native agent host | contradicted | `src/mcp/WebMcpBridge.ts` creates `fallback-readable` context when no host exists. In-process readable tools do not prove external host availability |
| G shared packages already export spatial review | absent | G `grph-shared/package.json` and `packages/apple-spatial-input/package.json` have no spatial-review export; G model still imports XR authoring and graph types |
| X's flight and sensor primitives are source-owned upstream | confirmed | X `src/runtime/FlightSimulation.ts`, `docs/AGENTIC-GRAPH-HARMONIZATION.md`, `native/Package.swift`; local frontend adapters consume pinned upstream primitives, with explicit roll-sign projection |
| Current shared-package pins are interchangeable | contradicted | X `package.json` uses vendored `@agenticgraph/apple-spatial-input`; G package declares `@agentic-graph/apple-spatial-input`. X harmonization pins upstream `19f9da8bc537b782e23ae7669c4a919d94171529`; neither package identity nor current export compatibility may be assumed |
| X already consumes a bounded Graph path | confirmed | X `src/drone/FlightPath.ts`: v1/v2 kinematic samples, 60 Hz, 2–7201 samples, 500,000 bytes, local X/Z/altitude metres and heading degrees, `physicalAircraft:false`; not a spatial proposal |
| X embeds Graph's own read-only canvas | confirmed, consumer source only | X `src/drone/GraphCanvasPreview.ts`: artifact identity, same-origin frame, source/channel checks and 15 s readiness timeout; unavailable fallback when artifact is absent |
| That provider exists in protected G main | absent | D owns `LearningCanvasEmbed.tsx`, `learningCanvasEmbedProtocol.ts`, `build_learning_canvas_embed.mjs` and drone export changes; they are absent from G. X's merged consumer alone cannot close this dependency |
| X path handoff grants flight or scene-write approval | contradicted | X `FlightPathTransfer.ts`, `FlightPathLink.ts`: one-shot opener/origin/channel, 20 s timeout, bounded compressed fragment, explicit local admission. Connect/Run remain separate; source URL is navigation, not synchronized source or digest proof |
| Cross-runtime physical correspondence is established | unverified | X cross-runtime fixture tests mathematical/frontend projections, not physical calibration, native pixel identity, actual iPhone/headset behavior or measured real-world geometry |

The selected unchanged X manifest/MCP/flight/parity/vendor tests can run from the older local
checkout only after their source and test bytes match X. New drone files are inspected at X via
Git objects; no local execution is attributed to those files. This distinction prevents a clean
old checkout from masquerading as latest-source evidence.

## PRD — reference implementation

Domain object: a **reviewed authored scene change**, qualified by its source owner and schema.
Moving a ship's saved starting position is different from moving its live flight pose or issuing
a bench command. No part of this plan establishes a measured physical twin.

| Pain / provisional priority | Hook → break → fix → close | Evidence |
|---|---|---|
| P1 / Must: unclear scene ownership | Identify the scene → similar 3D views hide different schemas → show owner/capabilities → refuse incompatible proposals | G/C/X source inventory; customer frequency and value unvalidated |
| P2 / Must: game configuration applies before review | Propose a saved ship move → patch applies immediately → detached diff and explicit approval → receipt plus safe undo | X `executeControl` and save boundary; WTP unvalidated |
| P3 / Should: rendering mistaken for measurement | Explain an observed result → flight pixels look physically authoritative → preserve provenance/units → show unknown correspondence | G provenance and X simulation/fixture contracts; WTP unvalidated |

| Criterion / pain | One measurable end state / VCC | Design / decision |
|---|---|---|
| GX1 / P1 | Capability inspection identifies source kind, schema, active document/manifest and supported operations; foreign tokens and a missing host are explicitly unsupported, with zero writes or model calls | T1 / A1 |
| GX2 / P2 | For one supported procedural ship position or scale edit, preview changes no manifest, live flight pose, source text, database, history or asset bytes | T2 / A2 |
| GX3 / P2 | Explicit operator acceptance applies exactly the reviewed candidate once against unchanged manifest identity; concurrent edit, switch, stale approval or running flight produces zero writes | T3 / A3 |
| GX4 / P2 | Scene and bounded receipt persist together; reload preserves them; undo reverses only unchanged affected values and records its inverse | T3 / A3 |
| GX5 / P3 | Review/export distinguishes authored starting transform, simulated pose and imported local assets; unknown scale/correspondence remains unknown and imported URLs are not fetched | T1, T4 / A4 |
| GX6 / P1–P3 | At desktop and 390 px, a new supported scene reaches reviewed acceptance in ≤5 deliberate actions/300 s; installed offline apply/cancel/undo/reload preserves exact bytes without an agent host | T4 / A1–A4 |

GX1–GX6 are **planned**, not satisfied by Graph's passing tests. Measure first value from app
navigation, count chooser selection, and record installation and help separately. No new human
walkthrough outcome has been received; consent alone establishes no completion or target-profile fit.
Failure or five minutes without completion is an incomplete result, never a coached pass.

Won't this increment: bidirectional world synchronization, Graph subject-to-ship coercion, arbitrary
GLB geometry reasoning, drone actuation, remote service proxies, native headset review parity,
calibrated reconstruction, collaborative distributed commits, new paid infrastructure or production.

## TAD — reference implementation

| Element | Existing owner / proposed extension | Input → output / refusal |
|---|---|---|
| T1: source-qualified inspection | G inspection and C's admitted registry remain unchanged; extend X's existing inspect envelope with explicit manifest identity/capabilities | Validated manifest + source kind → digest-bound read; foreign G identity never becomes an X approval |
| T2: detached comparison | First extract reusable pure identity/budget/diff policy from G into an explicit `grph-shared` export; retain G XR and X manifest adapters in their respective owners | One normalized supported edit → immutable candidate/diff; no package copy, renderer import or second physics engine |
| T3: X commit adapter | Extend `GameRuntime` configuration queue and `LocalDatabase`, using existing scenes/meta stores and a validated side record; G document commit stays G-owned | Approved digest + paused runtime + expected persisted identity → scene/receipt transaction, then projection; abort stale transaction; report uncertain projection/readback explicitly |
| T4: review and fallback | X existing `AppController`/shell and WebMCP contract own local controls; C remains a G-only consumer until an explicitly admitted X contract exists | Text diff + provenance → operator apply/cancel/undo, unavailable state, same local fallback without agent host |

T2 is a source move/adaptation with one policy implementation, not a downstream fork. Before
extracting, prove which functions are independent of G's subjects, choreography, asset catalog and
editor fences. Do not import `canvas/src` privately from X or advertise an export before it exists.
Existing catalog-bound geometry is not valid for X's ship or arbitrary GLB. The first X comparison
may report transform differences with geometry unavailable; geometric findings require separately
grounded pure bounds and must reuse G's existing spatial engine rather than the flight integrator.

Proposed mapping is intentionally narrow:

| Source value | Meaning / mapping boundary |
|---|---|
| G `kgXrMotionReference.subjects` and cast marks | G-owned authored objects/choreography; no lossless map to X's single ship is supplied |
| X `manifest.id`, `ship.position`, `ship.scale` | Identity and authored initial transform; first planned review supports procedural ship only, within the existing X validator |
| X runtime `position`/`rotation` | Simulated live state; inspection can label it, but it cannot replace saved initial transform or become a preview mutation |
| X flight adapter rotation | YXZ quaternion projection negates upstream roll; preserve existing adapter and parity vectors; do not silently reinterpret as G yaw-only rotation |
| X local asset ID / hash | Local bytes admitted by existing asset owner; an ID is not a transferable asset or a measured shape |
| G observation identity / pixels | Existing semantic-space package retains pixels/digests; X schema has no equivalent observation field; report unsupported rather than append unknown keys |
| Drone path / source URL | Bounded simulated path or user navigation; neither a scene manifest nor source revision authority |

T3 must cover every X manifest writer, including existing `apply-manifest-patch`, UI imports,
profile switching and configuration edits. Otherwise that direct tool remains a bypass around a
new review view. Transport controls remain their existing separate capability; the scene-change
review cannot issue throttle, Run, pairing or drone commands. No `approved:true` tool argument.
Store at most one pending proposal in memory, 32 receipts and 128 KiB review metadata; expire and
invalidate on source/session change. Reuse the existing meta store with a scene-qualified key and
one transaction with the scene. Keep the closed scene schema and native manifest compatibility.
Define explicit receipt export/import through the existing export owner before claiming portable
undo; plain manifest export alone cannot carry the side record. Partial import stays rejected.

Source mutation and runtime rebuild are not one atomic mechanism. Preserve the existing asset preparation before
persistence; add identity checks inside the serialized operation and persisted transaction; publish the
new runtime projection only from committed source. On post-commit projection failure, retain the
receipt, stop flight, show recovery and rebuild from stored source. Do not promise a rollback that
would erase an intervening edit. Initial scope excludes multi-tab mutation unless the transaction
test proves persisted compare-and-set; otherwise explicitly reject concurrent-writer operation.

### Five flows — reference implementation

Each flow covers GX1–GX6 at inspect → compare → decide → recover. The diagrams describe planned X
behavior, not current implementation. Every node is an existing owner or the bounded T2 extension.

**Diagram GX-J** · Class: Journey stage map · Version: 1 — 2026-09-26.
**Surface:** 2D Renderer: Storyboard; 2D Renderer: D3 Graph.
```mermaid
flowchart TB
  enter["Open supported local scene"] -->|"GX1"| inspect["Identify owner and capabilities"]
  inspect -->|"GX2 GX5"| compare["Review detached diff and provenance"]
  compare -->|"GX3"| decide["Approve or cancel"]
  decide -->|"GX4 GX6"| recover["Read receipt and undo or reload"]
```

**Diagram GX-W** · Class: User workflow · Version: 1 — 2026-09-26.
**Surface:** non-projecting semantic diagram.
```mermaid
sequenceDiagram
  participant U as Operator
  participant R as Local review
  participant S as Existing source owner
  U->>R: Inspect and preview
  R->>S: Read current identity
  R-->>U: Detached diff and provenance
  U->>R: Accept exact candidate
  R->>S: Compare and commit scene plus receipt
  S-->>U: Durable result or explicit refusal
```

**Diagram GX-D** · Class: Data flow · Version: 1 — 2026-09-26.
**Surface:** 2D Renderer: Storyboard; 2D Renderer: D3 Graph.
```mermaid
flowchart TB
  manifest["Validated manifest and identity"] -->|"inspect"| proposal["Detached candidate"]
  proposal -->|"compare"| review["Diff and provenance"]
  review -->|"approved digest"| commit["Existing scene and meta transaction"]
  commit -->|"readback"| projection["Runtime projection and receipt"]
```

**Diagram GX-H** · Class: Orchestration / harness flow · Version: 1 — 2026-09-26.
**Surface:** 2D Renderer: Storyboard; 2D Renderer: D3 Graph.
```mermaid
flowchart TB
  route["Existing tool admission"] -->|"inspect or preview"| pure["Shared pure review policy"]
  pure -->|"bounded result and zero-call cost"| evidence["Review evidence"]
  evidence -->|"human decision"| owner["Source-specific commit owner"]
```

**Diagram GX-T** · Class: Runtime topology · Version: 1 — 2026-09-26.
**Surface:** 2D Renderer: Storyboard; 2D Renderer: D3 Graph.
```mermaid
flowchart TB
  core["Graph-owned pure package"] -->|"typed local call"| graph["Graph document adapter"]
  core -->|"future admitted package"| game["GameXR manifest adapter"]
  canvas["Canvas bound client"] -->|"existing same-realm inspect and preview"| graph
  graph -->|"existing document writes"| graphstore["Graph workspace storage"]
  game -->|"planned scene and receipt transaction"| gamestore["GameXR existing local database"]
```

Diagram register: GX-J 5 nodes/4 edges, GX-D 5/4, GX-H 4/3, GX-T 6/5; no clusters.
GX-W has three participants and six messages and does not project. All runtime calls remain local;
package release is a build-time dependency, not a new hosted data path.

## ADR — reference implementation

| ID | Decision / reuse rationale | Alternatives, consequence and recovery |
|---|---|---|
| A1 | Qualify every source and report capabilities before federation | Reject treating similar tools as the same schema. Keep C's current G binding; unsupported X returns unavailable. No new universal registry |
| A2 | Extract only proven reusable pure policy from G, then consume an immutable package in X | Copying G's model or implementing parallel geometry violates one-owner. Direct canvas imports couple builds. If extraction cannot preserve G's regression suite, keep X read-only and stop that extension |
| A3 | Each persisted document has one local writer; extend X's existing queue/database for its own manifest | A second world database duplicates truth. Updating renderer first can lose durable identity. Preserve source/receipt on projection failure and disable acceptance until recovery |
| A4 | Preserve separate authored, simulated and observed facts; treat drone transfer as an unrelated capability | Reject claiming calibrated twin, native parity or aircraft authority from a scene review. Missing provenance remains unknown; source export stays available |

Hard constraints: no external project dependency, no paid/model service, offline local path, preserved
native manifest, one capability owner, no autonomous apply, no physical control effect. A new hosted
world service and a parallel editor fail those constraints. The existing-owner extension is the sole
admitted design; no fabricated provider ranking is needed. Reopen on failed extraction or persistence
proof, at most three repair cycles and stop after two with no reduction in blocking failures.

## MVP and implementation plan — reference implementation

| Step / criteria | Reuse and genuinely new work | Owner / prerequisite / bound | Evidence required |
|---|---|---|---|
| R0 / GX1 | Current source inventory and protected G/C receipts; new exact seam/gap record | This documentation increment; four documents, no runtime/dependency change, <30 KiB net growth, zero always-load modules | Source locators, revision joins, diagrams, docs/fleet checks |
| R1 / GX1, GX2 | G pure helpers/tests; new explicit shared export and source-qualified capability contract | G maintainer first; two 90-minute slices, ≤6 touched files/2 new modules, each <600 lines/500 kB | Existing 26 G tests unchanged; package builds with no canvas/renderer imports; foreign-source and unknown-capability rejection |
| R2 / GX2–GX5 | X validator, queue, local database, UI and export owner; new detached proposal/receipt adapter | X maintainer after protected R1; three 90-minute slices, ≤8 existing/3 new files, ≤60 KiB source delta | Preview/cancel leave exact bytes unchanged; paused-only acceptance; concurrent/replayed/stale attempts; storage abort, post-commit rebuild failure, receipt roundtrip and guarded undo |
| R3 / GX1, GX6 | C admitted discovery/client, existing X bridge and mobile/offline harness | Consumer maintainers after protected R2; two 60-minute slices, ≤4 touched files | Real host/no-host distinction, replaced registry/session, 390/1024 px, ≤5 actions/300 s, offline cold reload; no test injection creates first value |
| R4 / all | Existing pilot protocol and private record | Product owner after technical acceptance | Consented real outcomes, observed confusion, support minutes and return intent; three profiles, no synthetic substitution |

R1–R3 are estimates, not completed work or labor measurements. Max one active lane per owner and
one writer; no parallel agents required. Source order is G package → X adapter → C optional admission.
An unrelated drone-provider integration is neither a shortcut nor a required dependency for this
game-manifest review. Its own adoption remains gated on D's protected merge and exact artifact check.
GameXR native source publication also needs its existing lifecycle setup repaired: this host's setup
currently refuses a foreign hooks path. Preserve that guard; no raw push or hook replacement is a plan.

| Demo beat | Time ceiling | Observable VCC |
|---|---:|---|
| Hook | 20 s | Open supported scene and state intended saved transform |
| Probe | 40 s | GX1 owner, capabilities and source identity visible |
| Reveal | 60 s | GX2/GX5 exact diff, unchanged source and provenance |
| Approve | 90 s | GX3 one accepted commit or explicit stale refusal |
| Close | 90 s | GX4/GX6 receipt, guarded undo and restored bytes |

Total 300 s. Installation is measured separately. Current G timings cannot satisfy X's demo.

Verification commands are selected from the existing owners: G `npm run spatial-workspace:test`
and full-app smoke; C `npm run spatial-workspace:check` and `npm run docs:check`; X
`node --test tests/manifest.test.ts tests/mcp-contract.test.ts tests/flight-simulation.test.ts tests/cross-runtime-parity.test.ts tests/vendor-archives.test.ts`.
On 2026-09-26 these five X test files passed **27/27 tests** locally at `d3e840bfd45ffb269dba330c369aa8ee94587baa`; their selected source/test bytes were checked against X and were unchanged. This does not execute the newer drone files. These X tests establish existing contracts only; planned R2/R3 behaviors need new tests before
implementation claims. Run `npm run native:check` only if a shared package or native boundary changes.

The current four-document projection check passes 17 diagrams (13 projecting/4 non-projecting), 67 projected nodes, 51 edges and four clusters, with no findings. Canvas documentation contracts pass across 75 artifacts. The candidate fleet check passes eight repositories, 581 artifacts, 18 responsibilities and 109 planning families with zero findings. These are bounded mechanical observations, not a full alignment or runtime verdict.

Selected guideline linkage is 10/10 artifact-bearing rules, advisory count 0 in this scoped set:
continuity#1/#5 → frontmatter/inventory; flow-patterns#1/#2 → five flows; time-to-value#1 → GX6;
autonomous-implementation-verification#1 → GX1–GX6; division-of-work#1/#2 → T1–T4/A1–A4;
monetization#1 → GTM; lane-topology--deploy-boundary#2 → boundary below. Here continuity abbreviates
`artifact-continuity-authoring-seam`. Linkage is not satisfaction or full-guideline conformance.

| Finding Type | Severity | Rule anchor | Artifact reference | Evidence excerpt | Remediation |
|---|---|---|---|---|---|
| unproven-claim | blocker | autonomous-implementation-verification#2 | GX1–GX6 | X review extension has no executable outcome evidence | R1–R3 owners implement and test before any readiness increase |
| pain-point-not-validated | major | pain-point-to-feature-mapping#3 | P1–P3 | No completed human outcome or WTP evidence | Product owner runs R4; retain provisional priority |

This new scope has no prior finding baseline; two open scoped findings, no full alignment verdict.
All four experience rubric dimensions remain unassessed. Authoring → protected source integration
is the current authorized effect; authoring → mirror → delivery stays closed without exact candidate,
named production authorization and existing release evidence. Roll back by protected source revert;
runtime follow-ons retain the prior verified package and preserve local source/receipts.

## GTM — reference implementation

First-dollar ordering: (1) guided reversible-edit review for an existing local scene/game author;
(2) a self-serve report only after repeat-use and support-cost proof; (3) hosted collaboration or
continuous measured twins, Won't this increment. A $1 guided pilot is a research offer hypothesis,
not a published price, buyer commitment or payment. No WTP ordering exists between P1–P3, so
engineering sequence follows reuse and prerequisites rather than invented demand.

For each real session record completion, deliberate actions, elapsed/setup/help minutes, error and
refusal counts, provenance understanding and voluntary return intent. Keep identifying information
outside the repository. Tokens/model/paid calls target zero for the local path; labor, energy and
12-month TCO remain unmeasured. New self-hosted or managed services fail this increment's constraints;
neither is assigned an invented price or savings figure. Mechanism proof, demand validation, offer
acceptance and collected revenue remain separate, all unestablished for this offer.
