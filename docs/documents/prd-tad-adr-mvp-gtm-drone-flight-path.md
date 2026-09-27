---
title: Graph to GameXR simulated drone flight path
doc_type: PRD-TAD-ADR-MVP-GTM
version: 1.7.0
lang: en
date: 2026-09-27
owner: Learning runtime maintainer
continuity_id: DRONE-FLIGHT-PATH-001
local_rung: dev-proven
delivered_rung: undocumented
lane: authoring
universal_scope: false
worktree_id: device-0232231d4a19--drone-scene-fidelity
agent_id: codex-root
frontmatter_contract: required
---

# Graph to GameXR simulated drone flight path

## PRD

DRONE-FLIGHT-PATH-001@1.7.0 binds this user-authorized extension. The warehouse
iteration below updates all five roles; historical evidence retains its own revision. The user confirmed
the simulated bench, with Graph authoring, GameXR on iPhone/Safari, explicit Run and
local Wi-Fi delivery. The learner programs the existing Python drone API, runs and
inspects its motion, then sends or exports the completed path. GameXR admits the bounded snapshot,
previews it and requires an explicit Run after a receiver connection. Imported source
is never evaluated. No aircraft support or motor output is part of this revision.

Acceptance: export requires a completed collision-free landed trace; GameXR rejects
unknown versions/fields, oversized/non-finite/out-of-bounds/discontinuous samples;
import cannot enable a receiver; Run preserves path order and requires fresh receiver
acknowledgments; stop/focus loss/disconnect invalidate the run and require a new Run;
the mobile browser displays planned and receiver-accepted positions distinctly.
## TAD

Graph owns simulation and this portable data contract. GameXR owns consumer validation,
UI review and simulated-receiver admission. Graph also builds the read-only Canvas
artifact served by the local GameXR gateway; no Graph source is copied into GameXR.
Existing pinned shared flight packages remain unchanged.

`agentic-drone-flight-path/v1` has exactly schema, model=`kinematic`,
physicalAircraft=false, tickRate=60, coordinateFrame=`local-xz-altitude-m-heading-deg`,
sourceDigest and sceneDigest (lowercase SHA-256 identifiers), and samples. Each sample
is `[tick,x,z,heading,altitude]`, with 0-based contiguous ticks, x/z within ±8 m,
heading in [0,360) degrees, altitude 0–4 m. The first sample is `[0,0,0,0,0]`; the
last is landed. There are 2–7,201 samples, at most 120 seconds and 500,000 UTF-8 bytes.
Coordinates round to six decimals; consecutive translation is at most 0.050002 m.
Heading changes retain educational instantaneous turns; they are not angular dynamics.
Digest identifiers aid comparison and do not authenticate a downloaded file.
## ADR

Use a portable trace, not Python execution or an invented position-to-throttle mapping.
The simulated receiver accepts position setpoints under its existing challenge/session
lease and reports them as simulated observations. No path setpoint enters the RPYT
codec or physical diagnostics channel. The phone uses the existing paired HTTPS gateway
once its owner releases the stopped writer. Overlapping files wait for that handoff.
Recovery stops the session; a reviewed source revert restores prior functionality.
## MVP

Initial budget: 35 active minutes, 12 files, 50 KiB, no paid services or new dependencies;
refresh when gateway integration establishes the actual changed-file count. The exporter
loads only on explicit use. Tests cover the authored route, malformed imports, exact
receiver expiry, ownership loss, mobile WebKit Run/Stop and local transport.
Desktop mobile emulation is not physical iPhone/Wi-Fi acceptance. Source publication,
protected integration and production remain separate receipts.

## GTM

Nearest user value is a reproducible drone-programming demonstration on a phone.
No physical flight, customer demand, price or revenue claim follows from bench evidence.
Observe a learner completing export/import/Run before expanding curriculum or hardware.

## Implementation evidence

This section records the initial implementation; it does not establish acceptance
of the current warehouse candidate. The current evidence checkpoint is below.

Initial Graph/GameXR proof exported a 541-sample nine-second route and completed
simulated receiver acknowledgment on mobile WebKit. Focus-loss, disconnect and
receiver expiry checks passed. These historical receipts do not establish current
hardware or production readiness. Retained implementation evidence is under
`.audit-artifacts/drone-implementation-20260925/` outside both repositories.

## Canvas reuse and source navigation — 1.1.0

PRD: the user requests one Graph Canvas scene in both applications and a clickable
return to the original file. `LearningSceneGeometry` is the single owner of the drone,
crate, goal and grid; the existing Graph `LearningSceneStage` preserves workspace theme
selection. The embed uses the same geometry and `applyLearningCameraPose`, with demand
rendering and touch OrbitControls. GameXR removes its alternate SVG renderer.

TAD: `node canvas/scripts/build_learning_canvas_embed.mjs` creates
`canvas/dist/learning-canvas` (override GRAPH_CANVAS_OUTPUT). This dedicated entry imports
no workspace store, Python worker or execution API. Its manifest records the source
revision and dirty state. GameXR mounts this explicit local artifact at
`/gamexr/graph-canvas/`; same-origin iframe messages require parent identity, origin,
32-hex channel nonce, exact protocol/keys and bounded pose tuples. Initial origin is a
preview only; motion follows accepted receiver reports. No render message carries
execution, navigation or control authority. A missing build is shown explicitly.

ADR: isolate the render-only Graph entry instead of embedding the entire workspace.
This retains a single scene implementation and avoids unrelated editor modules on the
phone. No source vendoring, unprotected package pin update or new dependency is needed.
Build-time chunk checks reject any asset at or above 500,000 bytes; module groups are
acyclic. The generated artifact is local integration evidence until protected release.

`agentic-drone-flight-path/v2` adds exactly `sourceUrl` to v1. Exports made by the Graph
UI use the native `kgDoc` route for the bound file, clearing existing queries/fragments.
Only HTTP(S), credential-free URLs with one kgDoc query are accepted. GameXR displays
the link for an explicit click; import does not fetch it. v1 remains accepted but has
no invented source link. A file route identifies the browser workspace's current file,
not the exported immutable source snapshot; it may have changed or be absent on another
device. The existing sourceDigest remains available for comparison.

MVP budget refresh: 20 files, 80 KiB source changes, zero new dependencies, <600 lines
per file and <500 kB per emitted chunk. Validate actual Graph rendering in mobile WebKit,
source href, exact final pose, rejected message nonce, explicit missing-artifact state,
file mount containment and unchanged independent bench expiry. Move the CI screenshot
after completion so screenshot capture cannot itself stall an active WebKit control run.

GTM: simpler transfer candidates, in priority order: explicit Send to GameXR for the
same browser; a paired local share link/QR for iPhone; copy/paste for offline use.
These are recommendations, not delivered transports. File import remains the current
portable method; each future transfer must preserve review and explicit Run.
Rollback restores the previous scene wrapper/export contract and GameXR candidate,
then stops/restarts the local gateway. No deployment or hardware authority is inferred.

1.1.0 working-source proof: 26/26 lifecycle tests and Canvas TypeScript pass; broader
Python selection is 40/41 with the same pre-existing pane-availability assertion. GameXR
passes all six mobile WebKit tests both with the real Graph artifact and with it absent.
New source-link and local artifact containment checks pass. The Graph embed builds five
acyclic JavaScript chunks, largest 495,333 bytes; zero new dependencies. Evidence is under
`.audit-artifacts/drone-implementation-20260925/canvas-reuse-*`.
Graph's component browser passes with the actual v2 541-sample export, paced flight,
landing and shared scene mounted. The rebuilt full-app offline reload/cache-recovery
proof also passes. WebMCP scope and Vite runtime checks pass. These remain working-source
observations; no clean-candidate CI, protected integration or phone session is inferred.


## Direct transfer and phone links — 1.2.0

PRD: remove the compulsory download/file-picker step. Results now offers Send to GameXR
and Copy flight path. GameXR admits direct handoff, pasted JSON, compressed phone links
and existing files through one validation/review owner. Import never connects or runs.
The shared Canvas and source-file link remain the same across these entry points.

TAD: `agentic-drone-flight-handoff/v1` messages have protocol, kind, channel; path messages
add text. The sender opens the explicitly entered HTTP(S) destination on the user click,
strips query/hash credentials, and appends drone=1 plus flightChannel (32 random hex)
and flightOrigin (exact origin) in the fragment. Ready/accepted/rejected replies require
that exact opened Window, origin, channel and key set. The one-shot receiver validates
text through its flight-file reader before acknowledgment. Both sides expire at 20 seconds;
source/lesson/run changes abort the sender. Neither endpoint exposes receiver commands.

ADR: phone sharing uses the browser's gzip Compression Streams API and base64url in a
fragment named flight, with at most 16,000 encoded characters and 500,000 decoded bytes.
GameXR owns link generation/decoding. No sharing server, dependency or cloud account is
introduced. Oversized links fail visibly with file/paste recovery. A user-supplied trusted
HTTPS gateway address may include the existing one-use pair token; only pair is preserved.
Transfer fields are removed from history after capture; pair remains for explicit Connect.
This does not mint, renew, store or broaden a pairing grant. Generated links contain the
path and any supplied token and must be shared privately. Safari support begins at 16.4:
https://developer.apple.com/documentation/safari-release-notes/safari-16_4-release-notes

MVP: bound this increment to 16 files / 80 KiB added source / no new dependencies.
Browser tests cover cross-origin opener admission, forged sender rejection, replay,
invalid replacement, phone-link compression/review and mobile width. Unit tests cover
bounded decompression, exact bytes, pairing-field preservation and cancellation. The
Canvas change listener wraps invalidate() so OrbitControls events are not passed as a
frame count. TypeScript and the focused native learning/browser checks are required.
Full-source offline recovery and the exact native publication gates retain their owners.
Physical iPhone/Wi-Fi and clipboard permission behavior require a real-device session.

GTM: demonstrate run → send → review → Run, with phone link and offline copy/paste as
alternatives. Measure completed transfers and setup friction before adding synchronization.
The phone link is a flight-data snapshot; sourceUrl still points to the original browser's
workspace route and does not synchronize source files across devices.

Release/rollback: publish reviewed source successors; protected merge and production remain
separate authority. Revert this increment to restore file-only transfer, preserving the
prior shared Canvas. Working-source evidence uses flight-transfer-* under the existing
external audit directory. No firmware, gateway authorization or physical control changes.


## In-app handoff correction — 1.2.1

PRD: Send to GameXR must reach review when an embedded browser suppresses scripted
popups or has no usable window.opener. Preserve the Graph source tab and explicit Run.

TAD/ADR: replace Graph's popup/message producer with a native noopener/noreferrer link.
Prepare the existing bounded gzip/base64url #flight snapshot locally after a completed
run and valid destination. The link is enabled only for the current snapshot and address;
source/run/address changes remove stale hrefs in that render and abort pending preparation.
Use GameXR's existing phone-link decoder/admission unchanged. This small producer is a
wire-contract adapter; it contains no receiver code, physics, grant or alternate validator.
No window.open, opener handshake or acknowledgment timer remains in the Graph sender.
The receiver still admits old message transfers from retained published producers.
Preparation does not fetch or navigate; only a user click opens the named destination.
Link readiness is not a delivery acknowledgment. Review/Connect/Run stay in GameXR.

MVP: cap decoded exports at 500,000 bytes and compressed data at 12,000 bytes (16,000
base64url characters). Strip destination query/hash secrets as before. Unsupported or
oversized links fail visibly with the existing copy/file fallback. No dependencies added;
this correction is five owner files, below the eight-file / 40 KiB / 20-minute sprint cap.
Regression proof disables scripted window.open, opens the native link with no opener,
and verifies exact decompressed export bytes. Unit proof covers cancellation and bounds.
Actual Codex in-app browser → GameXR review → explicit Run must be observed separately.

GTM: keep the existing Send label and remove the failed-popup timeout from the learner's
path. No setup step or alternate import is needed for a normal bounded flight snapshot.

Release/rollback: publish an immutable successor to the prior transfer candidate. Revert
this correction to recover the predecessor implementation; retain its ref and evidence.
Run native affected checks and refresh the explicit Graph Canvas artifact after publication.
Source publication, protected integration, production and physical-phone acceptance remain
separate. Working-source evidence uses the external popup-fix-* audit prefix.


Observed correction: Codex's in-app browser opened the native Send link into a separate
GameXR review tab with all 541 samples and the source link intact. Run stayed disabled
until explicit Connect. Explicit Run then ended at x=4, z=0, altitude=0, tick=540 with
receiver acknowledgment. The original Graph source tab remained open. The scripted-popup
disabled browser regression and link/cancellation/bounds unit tests pass. The broader
Python selection initially retained a pre-existing pane-availability assertion failure;
protected main subsequently corrected that assertion in #1296. Refresh the unpublished
candidate from protected main before publication and repeat the affected selection.


## Reusable sharing and catalog entry — 1.3.0

PRD: Programmatic Drone Flight is discoverable through the shared Home Catalog and
Chat Prompt Presets. Selection loads `/python.learning @canvas #learning operation=inspect
lesson=drone` without opening a file or starting a run. Home Demo creates a uniquely
named local Python example and selects the drone lesson from its inert first-line marker.
It never overwrites an existing source. Chat Send delegates inspection to the existing
learning tool executor; missing or different active lessons fail visibly without a provider
request. Run remains the learner's explicit execution boundary.

TAD: `agentic-canvas-os/docs/PROMPT-PRESETS.md` owns the catalog entry. Graph validates
its native grammar and reuses its workspace file/import owners and existing drone solution.
No second catalog, lesson engine or receiver API is introduced. The consumer remains
compatible with the previous catalog; integrate Graph support before the catalog candidate.
Production publication remains a separately authorized exact effect.

Share canvas embed is now available for the completed drone source in Source Files and
Results. Both use the existing iframe markup and code-panel owners. The URL contains a
bounded compressed recording in its fragment and `kgLearningCanvas=drone`; no source code,
workspace storage, model request or receiver grant is included. A recipient loads the same
`LearningCanvasEmbed` renderer used by GameXR and explicitly chooses Replay, Pause or Reset.
Replay pauses when hidden. This is a recorded simulation; GameXR alone supplies accepted
receiver observations through the unchanged nonce-bound parent message mode.

ADR: share immutable observations in a self-contained link, retaining the existing general
Canvas share action instead of another upload service or custom preview renderer. Replay
input is size-limited before and during decompression and validates contiguous ticks, bounds,
origin, per-tick translation and final landing. Invalid or oversized snapshots fail visibly.
Use a reachable Graph deployment URL for another device; a localhost URL stays on its host.
The receiving site still controls whether its own CSP permits the iframe.

Validation: 54 native Python/transfer/inspection/menu tests pass. ACOS preset contract and
full docs contract pass. Browser proof covers different-origin copied iframe markup, explicit
replay/final pose/reset, catalog selection without execution, fresh-file Demo and successful
flight. A real second-origin HTTP fixture is required: intercepted synthetic hosts lose their
resolved address under Chromium Local Network Access. This is not bypassed with browser flags.
Actual in-app Source Files sharing produced the iframe code panel, copied a replay URL and
finished at [540,4,0,0,0]. Canvas compilation and full-app offline/cache-corruption proof pass.
The standalone renderer still builds five chunks, largest 495,333 bytes. Native candidate gates
remain required before publication. The application replay route omits workspace WebMCP, media
adapter and PWA installation.

Budget refresh: at most 24 Graph owner files and five ACOS owner files for this increment,
90 KiB source delta, zero dependencies or paid services; lazy load execution and sharing owners.
A 20-minute verification/publication sprint follows implementation; external CI waits have no ETA.
GTM: discover → edit → Run → replay/share → optional simulated bench review. Measure completed
learner sessions before expanding hardware scope. Rollback removes the catalog row first,
then reverts the Graph adapter and replay route; retain prior immutable refs and local data.

## Lessons in Source Files — 1.4.0

PRD: expose all four Python lessons as ordinary editable files under
`docs/python-lessons` in Source Files. Reuse the existing expandable folder,
file actions, search, selection, local save, authenticated cloud snapshot and
Canvas sharing controls. Opening never executes code or uploads a file.

TAD: bootstrap four small worked examples through WorkspaceFs and the existing
workspace import owner without applying a graph. The native explorer renders
the saved entries; its existing source index records local ownership so docs
reconciliation preserves the files and even an emptied lesson folder. There is
no separate lesson list or storage service. Existing
root-level lesson code is copied verbatim when its folder counterpart is absent,
and the original is retained. An existing lesson folder is user-owned: edits,
empty files, renames and individual deletions survive reload. Known file paths
select the lesson while source loads; markers support renamed files. Explicit
lesson selection is scoped to the current document.

The normal active-file reader gives registered local files their saved WorkspaceFs
bytes before consulting stale docs display copies, including empty or deleted
files. Canonical mirror repair remains available for mirror-owned documents.
Indexing uses graph-authored Markdown text only for Markdown documents; restored
display text cannot replace saved Python, JSON or other source formats.

ADR: browser Web Locks serialize cooperating tabs; same-runtime requests are
coalesced. WorkspaceFs conditional creation preserves concurrent writes. Folder
collisions and partial saves report errors with an explicit retry. No host mirror
writes, external upload, sign-in or code execution occurs during initialization.
Each Python file uses the existing authenticated workspace snapshot upload and
verified readback; this does not grant GitHub repository-save authority.

MVP: verify all four native paths, matching lessons, explicit Run, edit/reopen
preservation, interim-source preservation, deletion persistence, collision and
partial-save recovery, and cloud target resolution. Run affected Python, cloud
sync, browser and offline checks. Refreshed cap: ten files and 32 KiB, including
the active-file reader and indexing fixes; no dependencies or new execution engines.
Use a 15-minute final validation/publication sprint before reassessment.
Provider waits remain separate. Existing oversized unrelated bundles are unchanged.

GTM: expand docs → python-lessons, open a file, edit and Run. Use its existing
cloud indicator after sign-in to sync across devices; offline edits remain local
until explicitly synced. Learning gains remain unmeasured. Rollback restores the
prior launcher without deleting saved files. Evidence: external lesson-files-* logs.

## Retained source and release decisions — 1.4.2 through 1.4.7

These historical repairs remain owned by their existing components. A past local
pass does not establish the current candidate, deployment or physical-device proof.

| Revision | Decision / retained evidence | Remaining boundary |
|---|---|---|
| 1.4.2 | Replay ticks clamp to zero when the first animation timestamp precedes the effect clock; resume and final bounds remain. Local WorkspaceFs bytes outrank stale inline/display copies, including empty/deleted files. Hydrated Python selection bypasses the Markdown graph loader. | Exact protected source checks remain required. |
| 1.4.3 | One native catalog owns the preset. Native promotion joined package/lock/runtime docs at OS `e0ef770860905830157e64c455f0a342084b6d25`; exact OS test/budget run `36252295278` passed. The full production-build local proof covered four files, Unicode Save/reload, offline outcomes, editor round trips and missing-asset rejection. | Candidate-bound production authorization and live receipt are separate. |
| 1.4.4 | PR1315 run `36252038106` exposed a five-second panel-action timeout. The shared Close helper uses its existing 30-second detachment budget; no forced click or skipped assertion. Fresh local offline proof passed; redundant PR1316 gate was canceled with diagnostics retained. | Local readiness does not prove protected integration. |
| 1.4.5 | PR1317 run `36253126975` passed standard checks but exposed Explorer mutation after startup. The awaited source bootstrap now installs lessons before its snapshot; the duplicate Explorer installer is removed. Existing edits, empty files, deletions and collisions retain learner ownership. | No initialization executes a flight. |
| 1.4.6 | The unchanged 44-assertion mission smoke passed. Save proof now checks exact IndexedDB bytes after the real Save action instead of a shared transient toast. Complete durable/offline proof passed using runtime `ea93888c30aa6dc1b4790aa2870b9e8358ba301e`; only its verifier and plan then changed. | Final protected head requires independent evidence. |
| 1.4.7 | PR1318 integrated at `e71e96d1d916eeda98e78e083df814a6d1593dd8`; exact head/main checks and native lifecycle passed with the OS pin above. Production run `36267574685` stopped before authorization/mutation because its captured map had 309 nodes for 310 docs. Preparation now runs the existing schema generator against explicit clean exact-source paths before unchanged parity validation. | Ephemeral captured-schema repair grants no provider or production mutation. |

Historical bounds were refreshed per repair: seven files/25 KiB (1.4.2), four
files/12 KiB (1.4.3), two files/4 KiB (1.4.4), five files/8 KiB (1.4.5), six
files/10 KiB (1.4.6), and three files/6 KiB (1.4.7); all added zero dependencies.
The prior native records and immutable refs preserve detailed failure/recovery
history. Protected merge, canonical review, release preparation, production
authorization, activation and live readback remain distinct lifecycle effects.


## Native drone scene fidelity — 1.4.8

PRD: the native drone lesson and phone/replay projection gained an architectural
cutaway, tiled floor, directional shadows, marked pads, detailed shipping crate
and guarded quadcopter. This was an educational volume, not a surveyed facility;
learner source and the programmed motion remained unchanged.

TAD/ADR: `LearningSceneGeometry` remained the composition owner; `LearningDroneRoom`
owned render-only architecture/obstacles and `LearningDroneModel` owned the aircraft.
Existing geometry/material dependencies and one bounded 1024-square shadow map
served the native scene and shared demand-rendered embed. No model, font, texture,
image, post-processing or network asset was added. Rotor phase came solely from
simulation ticks/altitude, preserving Pause and replay without another clock.
The original ±8 m floor, one-metre obstacle envelope, pose/heading, collision
engine, scene digest and transfer contracts were unchanged by that increment.

MVP/GTM: initial six-module/100 kB/30-minute bounds, four runtime modules in the
result, zero dependencies or paid services. Working-source affected checks covered
learning/lifecycle, scope, nine-second flight/export, offline and Canvas behavior.
In-app review observed XR motion, fixed paused pose, orbit controls and shadows;
wall-panel depth offsets corrected shallow-angle flicker. Subsequent exact local
proof is recorded at 1.5.0 below. Canonical runtime, protected integration,
production, physical hardware and headset acceptance remained distinct receipts.
Rollback preserved learner files and portable paths through a reviewed source revert.


## Measured lesson workspace — 1.5.0 evidence checkpoint

PRD/TAD/ADR: the native lesson gained a measured SVG plan, asset picking and shared
Media Assets/Outliner/Inspector, using existing Canvas View, runtime, theme tokens
and FloatingPanel owners. Selection is scoped to workspace/document/lesson;
stale results are excluded. Presentation bounds have no colliders. Phone replay
uses pure scene geometry without the editor selection store. No dependency,
remote asset or new execution service was added; the three ground lessons remain.

Browser findings were repaired in their owners: paired selected-tab color tokens,
workspace/floating-panel occlusion, measured mobile header/footer insets and the
metre-based lesson camera profile in XR. Native Close resolves retained panels;
no pointer interception bypass, forced click or test removal was introduced.

MVP evidence: PR1321 source `58ccff7bdec25da644bebb3b50eac48c2b093ad8` passed
all 17 selected native local checks across five owner partitions. This includes
53 learning tests, the completed nine-second flight/export, rebuilt offline mobile
2D/3D/XR run preservation and layout, Canvas types, Mission browser and XR browser
checks. Protected CI was pending at the preceding handoff. PR1320's retained
protected failure was not reclassified as passing from local evidence.

Reference implementation evidence: [PR1321](https://github.com/huijoohwee/agentic-graph/pull/1321),
`outputs/drone-space-validation.json`, `outputs/drone-space-validation.zip` and
`outputs/drone-space-receipt.json` relative to the retained task artifact root.
GTM: this improves the same simulated demonstration; no demand, revenue, headset,
physical aircraft or production claim follows. The eleven-module/100 kB runtime
budget and zero new dependencies were retained. New scope uses the successor below.

## Warehouse lesson — reference implementation · DRONE-FLIGHT-PATH-001@1.6.0

### PRD

The user requests a warehouse setting, complete process-zone allocation and one
native surface selector. The observed pain is duplicate 2D/3D/XR controls and a
training scene lacking the supplied warehouse context; commercial WTP remains
unvalidated. Must: inspect the top-down warehouse, understand core/ancillary
allocation, see detailed racks in 3D/XR, and run the fixed aisle lesson through the
existing Python/Block/JSON workspace. Keep native keyboard, mobile and offline reach.
The [warehouse concept](../warehouse/warehouse-concept.md) and its linked SVG are
projections of this record, with model coordinates owned by `warehouseLayout.ts`.

Acceptance: twelve non-overlapping zones cover the assumed 60 × 40 m floor;
1,920 m² core plus 480 m² ancillary total 2,400 m² (80:20). Show west inbound/east
outbound 20/40-foot container bays, dock levelers, 12 m maneuvering aprons and an
8 m access/ramp connection. All dimensions are conceptual. The ratio meets the
requested numerical target; it is not statutory GFA certification or a complete
ramp/building design. Staff break space contains no residential accommodation.

The flight remains a distinct 16 × 16 m inspection cell: X/Z ±8 m, altitude 0–4 m.
The example takes off to 2 m, hovers, passes over a 1 m low pallet and lands at
(4, 0) after nine seconds. The 4.5 m racks block lateral travel; the wider facility
is context, not a newly validated flight envelope. No motor output, autonomous
navigation, manual piloting, real-warehouse inspection or pest detection is added.

### TAD

`learningLessons.ts` owns drone lesson revision 2, its fixed program, obstacles
and scene identity. `/docs/python-lessons/04-drone-flight-and-landing.py` is a
virtual WorkspaceFs source seeded through `learningLessonFiles.ts`; it is not a
new host Python file. Existing saved learner bytes remain untouched. **Load flight
example** is the explicit way to replace current editor content with the new seed.
The revision changes the scene digest; portable v1/v2 bounds and sample schema stay.

| Capability | Existing owner / smallest delta | Verification |
|---|---|---|
| Lesson and collision rules | `learningLessons.ts`; revise warehouse objective, seed and rack obstacles | Deterministic route, collision and scene-identity checks |
| Zone allocation | `warehouseLayout.ts`; one pure twelve-zone model consumed by plan and procedural scenery | Bounds, sum, non-overlap and 80:20 checks |
| Plan and shared scene | `LearningPlanView`, `LearningSceneGeometry`, `LearningDroneRoom`; extend local procedural geometry | Desktop/mobile plan, 3D/XR and shared embed review |
| Surface switching | Native Canvas View/Surface Mode; remove lesson's duplicate 2D/3D/XR buttons | Native menu switches without replacing run/selection |
| Assets and inspection | Existing `LearningAssetsPanel` and spatial selection; warehouse assets from native owners | Search, selection, dimensions and stale-state checks |
| Appearance | Existing Settings, `--kg-*` colors, native text/code typography, icons and focus styles | Theme contrast and responsive review; no font/model network load |
| Blueprint projection | `docs/warehouse/warehouse-floor-plan.svg` generated from layout coordinates | SVG labels and geometry/allocation agreement |

Invocation Register remains one capability: `/canvas.view.set #canvas-view
@canvas-view`, with existing MCP/WebMCP `surface:2d`, `surface:3d`, `surface:xr`
options. This is a view mutation, not flight authority. `/python.learning @canvas
#learning` retains the existing lesson executor and explicit Run boundary. There
is no new `/`, `@`, `#` registry, remote service or firmware adapter.

Five flows: information goes from lesson/layout to views; interaction selects
source/assets and native surface controls; structure keeps pure models before
adapters/views; navigation uses Source Files, Editor Workspace and Canvas View;
data flows from saved source through runtime snapshots to validated exports.
No view infers real receiver position from planned movement. Resource bounds,
source-digest validation, cancellation and local source recovery retain their owners.

### ADR

Extend the existing scene with local procedural rack geometry and one pure layout
model. Direct reuse preserves native controls, assets, theme and replay. A new
warehouse editor, cloned catalog, remote model pack or expanded portable physics
would add unrequested authority/dependencies and invalidate existing bounded
consumers. A contract-only adapter remains appropriate for projections; no second
simulation or store is justified. Consolidate presentation switches into native
Surface Mode and remove their superseded lesson buttons rather than retain a shim.

The 60 × 40 m context and 16 × 16 m flight cell are deliberately distinct and must
be labeled together. The nine-second route stays portable while rack obstacles
make lateral limits meaningful. Revisit the cell only when a separately specified
route requires wider geometry, corresponding collision/export contracts and
receiver compatibility tests. Rollback is a reviewed source revert preserving
saved Python, completed traces and immutable predecessor refs; the changed scene
revision prevents a prior debrief from silently representing the new geometry.

### MVP

VCC-W1: zone geometry/allocations and blueprint agree; VCC-W2: the revision-2 route
lands collision-free at (4, 0) while lateral rack attempts collide; VCC-W3: native
Surface Mode switches plan/3D/XR with run and selection preserved; VCC-W4: saved
source, flight/export/replay and rebuilt mobile offline behavior retain acceptance.
VCC-W5: labels distinguish simulated cell, context dimensions and planning ratio.

Demo bound: Hook 10 s (warehouse plan), Probe 10 s (zone and asset inspection),
Reveal 10 s (VCC-W1 and cell bounds), programmed Run 9 s (VCC-W2), Close 10 s
(native surface changes and Results). Total ≤49 s after initial module load;
actual first-load/setup time remains unmeasured. All Must features reuse native
owners; hardware deployment and complete architectural design are Won't this increment.

Initial active ETA/cap: 45 minutes, at most 12 runtime modules and 150 kB added
source; <600 lines/file and <500 kB/chunk; zero paid services or new dependencies.
Reuse the active native successor checkout. Scene, plan, catalog and status stay
lazy-loaded; the small warehouse layout model adds no always-load entry. Final
runtime refresh: at most 15 modules, 200 kB touched runtime source, no dependencies.
Execution tokens and actual active/CI time are unknown until receipts are recorded;
no token-spend or production-cost claim is inferred from a zero-provider-spend cap.
Refinement is capped at three cycles, with scope/resource refresh on new drift.

### GTM

Ranked value hypothesis: reduce setup friction for an existing learner/operator
reviewing a programmed warehouse-aisle route, using the near-built lesson and
shared spatial tools. First-dollar candidate is a scoped demonstration/setup
service; demand, price, payment mechanism, collected revenue and repeat use remain
unvalidated. Architectural certification, fleet management and physical scouting
are explicitly outside the offer. Observe a user completing source → Run →
inspection → export and record setup time/errors before adding infrastructure.
No new channel, supplier, capital commitment or paid dependency is authorized.

## Coverage and current handoff — DRONE-FLIGHT-PATH-001@1.7.0

Disposition: **16/16 domains recorded; 11/16 covered applicable; 5 deferred;
0 not applicable.** Coverage records decisions and gaps, not acceptance or revenue.
The source joins below refer to the corresponding role in the warehouse section.

| ID | Decision / source join | Accountable function / evidence or gap / next check |
|---|---|---|
| C01 | Covered; PRD | Product: user-supplied layout and duplicate-control report; WTP unvalidated; observe lesson completion |
| C02 | Deferred; GTM | Product: no two-method market sizing; outside local enhancement; revisit before a commercial pitch |
| C03 | Covered; GTM/ADR | Product: demonstration-service hypothesis versus manual explanation; no price evidence; interview an operator |
| C04 | Covered; PRD/MVP | Learning maintainer: VCC-W1–W5 defined; published warehouse source passed rebuilt offline/surface assertions; see revision-bound evidence below |
| C05 | Covered; TAD | Architecture: native owners, five flows and invocation routes named; inspect final source diff |
| C06 | Covered; TAD/ADR | Runtime maintainer: bounded simulation, offline/local data, no external models or new AI loop; execute failure/recovery checks |
| C07 | Covered; ADR | Architecture: reuse versus new editor/physics, rollback and revisit trigger recorded; verify removed duplicate controls |
| C08 | Covered; MVP | Evaluator: 17 native checks pass on warehouse source; test/documentation successor awaits its own receipt |
| C09 | Deferred; GTM | Product: acquisition/retention experiment requires a consenting trial user; revisit after a completed demonstration |
| C10 | Covered; TAD/MVP | Maintainer: local delivery, native release/rollback and one active checkout; no new suppliers; verify lifecycle receipts |
| C11 | Covered; PRD/ADR | Maintainer: no copied external assets, accommodation or legal approval claim; measured site/legal review remains external scope |
| C12 | Deferred; GTM/MVP | Finance: zero new provider spend, but labor/token cost and three-statement scenarios unmeasured; revisit before quoting paid work |
| C13 | Deferred; GTM | Product: no funding/capital action requested; local prototype only; revisit on validated paid-delivery need |
| C14 | Covered; MVP/handoff | Release maintainer: admitted successor and prior exact evidence recorded; warehouse source published; portability and test-race corrections await final checks |
| C15 | Deferred; GTM | Product: deck/business/financial projections not prepared for audience use; depend on validated offer and sourced economics |
| C16 | Covered; MVP/GTM | Maintainer: next bounded proof below; stop expansion if route or source preservation fails |

## Mobile warehouse inspection — 1.7.0 baseline

PRD: the operator needs a repeatable view of modeled aisles and high rack faces,
complementing fixed CCTV. This is a user-requested demonstration, not validated
buyer demand. Preserve drone-001 and add the photo-informed drone-002 plus a
black tracked mobile charging-station concept with twin roof leaves.
User clarification: 220 × 160 × 90 mm specifies the shell; report the assembled
extent separately. A 3 mm shell leaves a 214 × 154 × 84 mm cavity. Drone-002's
140 × 140 × 52 mm envelope is assumed pending measurement. Printed fit, magnet/
hinge tolerances, electrical charging and flightworthiness are not established.
Closed assembly is 240 × 204 × 132 mm; open lids reach 170 mm. Units stay metres.

| VCC | Measurable condition / check |
|---|---|
| M1 | Shared dimensions match shell/cavity specification; closed/open lids and separate drone IDs appear in 2D/3D/XR; inspect geometry and browser screenshots |
| M2 | Existing BottomPanel Timeline alone owns play/pause/seek/rate; actor poses, lids, frame IDs and visit counts derive from its cursor; check seek/pause/replay |
| M3 | Enumerate every rendered rack face/bay/tier and named aisle sample; validate paths against shared obstacles and retain unreachable targets in denominators |
| M4 | Simulated Wi-Fi/cloud/YOLO feed complements CCTV; existing Motion Control Bounding Box setting owns overlay visibility; no network inference or camera permission |
| M5 | Existing Python source, bounded flight/export and native surface selection remain functional; run affected unit/browser/offline/type checks |

TAD: warehouseLayout owns rack/fixture/partition geometry; pure facility route
sampling owns the scheduled choreography and coverage calculation. Native Timeline
transport remains the only clock. Existing document-bound lesson view state enables
the rehearsal; it is not another playback store. LearningSceneGeometry, the SVG
plan and FloatingPanel asset inventory project the same positions in metres.
The camera inspection action reuses registered Three camera pose restoration;
small assets are framed closely, never enlarged in the warehouse. Timeline feed
frames and detections are deterministic synthetic fixtures, labelled simulated.
Motion Control's existing boundingBoxEnabled owner and `/motion.control @canvas
#pose operation=open boundingBox=true` route control display; its real pose ROI
is untouched. No new command registry, paid service, model weights or dependency.

ADR: reuse native transport, catalog, camera and bounding-box setting instead of
adding a parallel dashboard/player. Keep the facility rehearsal separate from
LearningSimulation's ±8 m / 0–4 m portable receiver contract; facility tracks cannot
be sent to aircraft or misrepresented as Python execution. Access to vault, climate
and ancillary rooms is unverified: exclude these 720 m² explicitly, retain all
modeled rack/aisle targets in visit counts, and distinguish geometric visits from
photographic visibility, actual detection or optimal/full warehouse coverage.
Timing assumes truck 1 m/s, drone 1.4 m/s horizontal / 0.7 m/s vertical; no battery model.
The 0.25 m centerline obstacle padding is not a body-clearance safety certificate.
The supplied schematic shows ESP-WROOM-32, MPU6500 and four brushed-motor channels;
it does not establish camera hardware or a charge controller. No circuitry is added.
MVP: 45 active-minute estimate plus validation; cap 24 touched runtime modules,
220 kB touched runtime source, 80 kB new source, <600 lines/file, <500 kB/chunk,
no new dependencies or provider spend. Observed 23 runtime modules, ~152 kB touched,
~60 kB new; lazy Timeline, lightweight shared selection. Validate docking/door order,
coverage denominators and native cursor/overlay behavior before source publication.
Stop expansion on a collision, competing clock or source-preservation regression.
Rollback restores the preceding source revision; no stored program migration.
GTM: hypothesis is less manual explanation of repeatable warehouse inspection.
Observe a user completing play → seek to rack → inspect frame/box → return to dock;
record completion time, confusion and coverage gaps. WTP, model accuracy, Wi-Fi
capacity, battery endurance and charging economics remain unvalidated. No cloud
service or hardware procurement is authorized by this simulation increment.
Development baseline: PR1330 source `6a85e8295be10ec3225b6f0691130901ee3c5dc7`
passed all 17 required local checks (58 learning cases, flight/replay, rebuilt
offline, types, Mission and XR browsers); exact receipts accompany that handoff.
Its Integration Gate and docs-contract now pass. Prior failed receipts
remain revision-bound; none substitutes for this increment's checks.
Current admitted successor: `agent/device-0232231d4a19/warehouse-mobile-proof`.
Focused geometry, route, frame and ownership checks pass; Canvas TypeScript passes.
Production Release remains closed pending protected integration and candidate-bound
authorization; no deployment or physical aircraft operation is claimed.
PR1331 validation was blocked by configuration drift; rerun serial builds and native surface navigation.
Observed: 104 rack stations / 47 aisle stations; 751.04 s fixed rehearsal, 489 keyframes.
