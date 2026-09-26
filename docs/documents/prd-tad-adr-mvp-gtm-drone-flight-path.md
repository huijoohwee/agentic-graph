---
title: Graph to GameXR simulated drone flight path
doc_type: PRD-TAD-ADR-MVP-GTM
version: 1.4.7
date: 2026-09-27
owner: Graph learning and GameXR bench maintainers
continuity_id: DRONE-FLIGHT-PATH-001
status: implementation
frontmatter_contract: required
---

# Graph to GameXR simulated drone flight path

## PRD

DRONE-FLIGHT-PATH-001@1.4.0 binds this user-authorized extension. The user confirmed
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

Graph export and GameXR simulated execution are implemented in admitted successors.
The component browser exported the actual 541-sample, nine-second route; GameXR's six
mobile WebKit bench tests consumed that file and passed, including final landed receiver
acknowledgment and cancellation. The visible local GameXR page also completed at x=4,
z=0, altitude=0, tick=540. Graph lifecycle tests pass 24/24; native Canvas TypeScript,
three Vite runtime checks, two WebMCP scope checks and rebuilt full-app offline proof
pass. The existing Python pane-availability assertion remains red and belongs to open
XR PR #1285; its correction is not copied into this lane.

GameXR's native selected evaluators, candidate build/release checks and behavior suite
pass; TLS transport and exact receiver expiry are covered. Working-source observations
are retained under `.audit-artifacts/drone-implementation-20260925/path-*` and
`gamexr-path-*` outside both repositories. Publication, protected integration and actual
iPhone/Wi-Fi verification remain separate. No physical aircraft was connected.


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

## Canvas replay clock correction — 1.4.2

Protected CI for PR1313 completed the drone's four flight criteria but exposed a
first-frame replay failure: an animation timestamp can precede the effect's
`performance.now()` clock. A negative tick selected an undefined pose and stopped
the shared iframe. The existing replay owner now bounds elapsed ticks at zero,
including after Pause/Resume, while retaining the final-frame bound. A focused
regression exercises the earlier timestamp, resume offset, ordinary advance and
final clamp; the native browser smoke must still replay the copied embed to tick
540 and reset it. Published predecessors remain immutable. Integration,
production activation and ADLC delivery require their separate exact receipts.

### Local source reload correction

The protected gate exposed a saved-source reload race after the replay clock fix.
Local source ownership now applies to every active-file read, including inline
entry snapshots and source fallback calls, so a retained starter cannot outrank
saved WorkspaceFs bytes. Deleted local files return no active entry; empty edits
remain empty. Regression checks exercise stale inline copies across those readers.
Protected integration and delivery remain pending until their exact receipts pass.

The save failure was traced to pending Python selection being retried through the
Markdown Canvas loader. The native switch owner now treats a hydrated Python file
as settled and leaves its Canvas to the learning runtime. Stable Python selections
also avoid Markdown graph application. This preserves a new edit before explicit
Save without changing Markdown switch behavior. The production smoke uses awaited
Boolean storage observations, closes its offline test body correctly and requires
its final evidence file before reporting success. Its acceptance is unchanged:
exact source must survive Save and reload, all lessons must run offline, and missing
verified assets must block navigation. Refresh cap: seven files / 25 KiB, zero new
runtime dependencies; normal production-build proof and protected CI are required.

## Catalog dependency and release handover — 1.4.3

PRD: discover Programmatic Drone Flight from the existing Home Catalog and Prompt
Presets, then open its source file, edit, Run and review a reusable Canvas. The
confirmed simulated bench remains the delivery target. Buyer demand, willingness
to pay and physical iPhone execution are unmeasured.

TAD/ADR: the native OS prompt catalog owns the preset. Graph's existing revision
promotion command verifies protected OS main checks and updates its exact package,
lockfile and runtime docs reference together. There is one catalog entry and no
new catalog service, runtime dependency or automatically executed flight.

MVP evidence: 35 focused Python/file lifecycle checks, the native Markdown switch
regression, 18 source-reader/indexing checks and root type checks passed. The full
normal-production-build browser proof executed its complete body and wrote its
receipt: all four native files, exact Unicode Save/reload, offline light/Monaco
editor round trips, four completed lessons, registered tools and missing-asset
rejection passed with no page errors. Local proof is separate from protected CI.

Development: source review PR1315 requires its exact protected merge receipt.
Native catalog PR314 passed test/budgets and merged at
`e0ef770860905830157e64c455f0a342084b6d25`; Graph's package pin requires successful
checks on that exact OS main revision and its own protected integration.
The exact OS main test/budget checks passed in run `36252295278`. Native promotion
selected that revision for all three Graph dependency files; ten focused docs
source/promotion checks passed and the resolver returned the same exact pin.
Production Release: prepare only from clean exact main, native localhost review
and retained rollback/frontier evidence. The protected owner must record human
authorization for that candidate before activation.
Runtime: the previous verified release remains the deployed baseline; these
source checks do not prove a new production or native-device session.

GTM/next owner action: complete the protected source/pin sequence, prepare the
candidate and review the existing production authorization challenge. Only its
joined production-complete lifecycle carrier and live readback close delivery.
Preserve the existing rollback identity and saved learner files. Scope refresh:
four pin/handover files, at most 12 KiB, zero new dependencies; a 15-minute active
integration/preparation sprint, with CI dependency waits reported separately.

## Native panel readiness — 1.4.4

Protected PR1315 run `36252038106` failed before opening a lesson: the actual
floating-panel Close action did not become actionable within its five-second
click budget during production startup. The shared UI smoke owner now uses the
same 30-second budget as its existing panel-detachment check. It still clicks
the real control and requires the panel to detach before proceeding; no forced
click, assertion skip, source-module hook or alternate close path is added.
The full lesson/offline acceptance remains required on the exact catalog pair.
PR1316's redundant pending gate was canceled; both published heads and the exact
failure diagnostics are retained. Two owner files, at most 4 KiB source growth,
zero runtime dependencies; a five-minute local proof sprint precedes the new
protected review. External CI and candidate approval retain separate evidence.

The fresh normal-production-build local browser proof passed against the promoted
OS docs revision: all four native lesson files retained exact Unicode edits across
Save/reload, all offline lesson outcomes passed, shared tool registration and
light/Monaco round trips passed, and missing assets blocked navigation. The proof
wrote its final evidence receipt with no page errors. Protected CI remains the
independent integration requirement; this does not prove Production activation.

## Source startup ownership — 1.4.5

Protected PR1317 run `36253126975` passed the complete standard plan, including
the native lesson/offline browser acceptance. The extended mission smoke then
failed its unchanged-authored-workspace check: mounting Explorer installed lesson
files after source bootstrap had declared readiness. Installation now runs through
the awaited source startup owner before its entries snapshot. The redundant
Explorer installer is removed; opening Explorer cannot introduce lesson files or
reorder the authored source list. Existing files, edits and deletions remain owned
by the learner, and collisions fail startup without replacing bytes. Lesson source
stays lazily imported; no flight runs during initialization.

The existing bootstrap regression now checks awaited lesson discovery, retained
Unicode edits/deletions, collision rejection and active-source drift. The unchanged
mission inspection assertion and normal production lesson/offline proof must pass
before publication. Scope: five files, at most 8 KiB changed bytes, zero dependencies;
15 active minutes for repair/local proof, with protected CI as a separate dependency.
PR1317 and its exact failure artifacts are retained. Integration, canonical runtime,
private handover and candidate-bound human authorization remain separate receipts.

## Durable Save observation — 1.4.6

The clean startup repair passed the unchanged full mission smoke, including all
44 assertions and authored-state preservation. Its normal production proof then
timed out waiting for a transient `Saved` toast after the Unicode edit; the failure
screenshot showed indexing progress in that shared status display. The native
status owner uses one toast identity for both operations. The proof now awaits its
existing exact IndexedDB-byte assertion immediately after the real Save click and
still requires exact reload, local source ownership and all offline outcomes. It
does not infer persistence from the editor, a toast, or a Promise object. The failed
run and screenshot remain retained; required durable acceptance is unchanged.

Scope refresh: six files, at most 10 KiB changed content, zero dependencies; five
additional active minutes for the existing artifact browser proof and publication.
Runtime source is unchanged by this verifier adjustment; protected CI must bind
the final committed source and catalog pair. Candidate preparation, human approval
and live Production readback retain their separate prerequisites and receipts.

The reused normal production artifact passed the complete durable proof: exact
Unicode Save/reload, native lesson discovery, four offline outcomes, light/Monaco
round trips, tool registration and missing-asset rejection. The artifact's runtime
revision is `ea93888c30aa6dc1b4790aa2870b9e8358ba301e`; only this verifier and planning
document changed during that proof. The final protected head remains independently
required; no deployment, native device session or human authorization is inferred.

## Captured schema reconciliation — 1.4.7

Development: PR1318 integrated as protected main
`e71e96d1d916eeda98e78e083df814a6d1593dd8`; exact head/main Integration checks
passed. Canonical sync, locked install and native turn:end bound that source to OS
`e0ef770860905830157e64c455f0a342084b6d25`. Source completion, recovery retirement
and predecessor dispositions passed with branches and learner bytes preserved.

Production Release36267574685 stopped before authorization or mutation: publish
parity passed, but the captured schema map contained309 document nodes for310
canonical files, missing this drone plan. The release preparation owner now runs
the existing captured schema generator against explicit exact-source docs/map
paths, after checking source HEAD and clean docs, before the unchanged parity gate.
Only the ephemeral captured schema checkout changes; no provider write, new
generator, mirror hotfix or parity exemption is introduced. The protected release
still binds the captured guideline revision and independently authorizes activation.

PRD/MVP acceptance retains all drone, native file, replay and offline outcomes.
TAD/ADR assigns reconciliation to preparation, using the existing schema owner;
the focused workflow regression checks ordering, exact paths and read-only provider
permissions. A local native-generator proof uses the failed run's captured schema
revision and verifies a zero-diff second check. GTM delivery remains pending new
protected integration, canonical review, candidate preparation, human terminal
authorization and joined live receipts. Three files, at most6KiB changed content,
zero dependencies;15 active minutes for repair/proof, external CI waits separate.
