---
title: "Versioned Project Workspace — Graph Product Owner"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.5.0"
revision: "0.5.0"
date: "2026-10-04"
lang: "en-US"
frontmatter_contract: "required"
owner: "agentic-graph versioned project product owner"
continuity_id: "VERSIONED-WORKSPACE-001"
prd_revision: "0.5.0"
tad_revision: "0.5.0"
adr_revision: "0.5.0"
mvp_revision: "0.5.0"
gtm_revision: "0.5.0"
local_rung: "connected-browser-verified"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-0232231d4a19--versioned-project-canvas"
agent_id: "codex-root"
load_policy: "on-demand"
lifecycle_status: "source-release-candidate"
---
# Versioned Project Workspace

This is the single active five-role owner for VERSIONED-WORKSPACE-001. The user
accepted consolidation in Graph on 2026-10-04. OS owns common lifecycle/contracts;
Graph owns this product, its store, native Canvas History → Projects UI and acceptance evidence.
Canvas OS remains an existing development adapter and gains no project implementation.
There is no new repository, framework, datastore, tool namespace or runtime dependency.

## PRD

### Buyer pain and smallest useful outcome

An individual already using a local computer needs to retain small text projects,
recover an earlier milestone and deliberately transfer work between devices without
an account, model call or paid service. Prioritize lost work, stale overwrites and
portable handoff. Demand and willingness to pay remain unvalidated.

| Priority / feature | User outcome | Acceptance |
|---|---|---|
| P1 / F1 | Edit files and recover an unsaved browser draft | V1 |
| P2 / F2 | Save, inspect and restore an immutable project milestone | V2 |
| P3 / F3 | A competing save cannot silently replace current work | V3, V8 |
| P4 / F4 | Browser or agent discovers the actual store and supported operations | V5, V6 |
| P5 / F5 | Export/import paths, exact UTF-8 bytes and content digests | V4, V7 |
| P6 / F6 | Keep history, GitGraph/Gantt and Source Files synchronized without media freezes | V9–V12 |
| P7 / F7 | Use Projects from Canvas History, exchange explicit document copies and close/reopen safely | V13–V15 |

The 2026-10-04 user instruction “complete” reopens F6/V9–V12 locally and adds F7:
use Projects inside the main Canvas UI. The retained mixed candidate supplies the
existing history, selection and media-recovery repairs. No private application or
third-party license changes. Source integration and hosted Production require their
own exact evidence; completion of local implementation does not imply either.

### Verifiable acceptance criteria

| ID | Given / action / expected result | Evidence owner |
|---|---|---|
| V1 | Given a draft, reload the admitted tab; exact text returns or failed persistence is reported without claiming durable success | Browser recovery/readback |
| V2 | Given two checkpoints, inspect and restore the first; a third checkpoint contains its exact files, both prior versions survive, stale expected heads fail | Project runtime suite and browser |
| V3 | Given competing requests with one base, save both; one wins and the loser receives conflict/busy while retaining draft bytes | CAS/race cases |
| V4 | Given an export, import to a new project/store; paths, bytes and SHA-256 digests match | Export/import runtime cases |
| V5 | Given discover/plan/apply via HTTP or stdio, read actual native store/version/capabilities; WebMCP feature-detects the same two identities | Server/stdio suite and browser |
| V6 | Given unsafe paths, stale plans, denied token/origin or unsupported operations, refuse effects and remote/model calls | Negative/security cases |
| V7 | Given a narrow viewport and keyboard, edit → checkpoint → inspect/restore → export within five minutes | Timed local browser; physical mobile remains separate |
| V8 | Given competing or oversized imports, admit only bounded capacity without deleting history | Quota reservation suite |
| V9 | Filter history to the active document, then restore; retain the original global history index | React/store tests |
| V10 | Edit GitGraph and restore; source text and Gantt read the same document; an empty source cannot borrow another diagram | Cross-view tests |
| V11 | Restore while a source selection is pending; the stale async selection cannot overtake restored identity | Selection boundary tests |
| V12 | Media geometry feedback coalesces into bounded RAF work and stops at its frame budget | Real-hook media tests |
| V13 | Open History → Projects; checkpoint, inspect, restore, export and exchange Canvas copies through the existing Git owner | Native browser journey plus panel/API tests |
| V14 | Close/reopen the panel or exceed browser quota; retain a bounded draft, release writer locks, reject stale continuations and warn before browser exit | Panel lifecycle tests |
| V15 | Request the former standalone routes; refuse them; MCP stays headless and Canvas owns the sole UI | Closure/retirement guard |

Restore refuses to replace a retained unsaved draft: return to Current draft and save
it first. Restoration appends a normal CAS-fenced checkpoint; it never rewinds a ref,
purges objects or introduces another project operation.

## TAD

### Ownership and dependency direction

| Concern | Sole owner | Boundary |
|---|---|---|
| Reusable lifecycle/admission/release semantics | agentic-os | No Graph UI or product implementation in OS |
| Project schema and plan/apply routing | mcp/workspace-artifact-contract.js and workspace-artifact-runtime.js | Existing identities, lazy project dispatch |
| Native Git project state | mcp/workspace-project-runtime.js | Reuses hardened repository-pack-git.js/error.js |
| Confined HTTP handler and optional stdio | mcp/workspace-project-server.js | API only; SDK loads only for stdio |
| Local Canvas binding | canvas/viteWorkspaceProject.ts via existing artifact bridge | Same loopback listener, configured store, scoped cookie; no second server |
| Draft/editor/restore/export | canvas/src/features/workspace-project | Moved original MIT client, mounted lazily in History → Projects; no iframe or standalone page |
| Canvas history and source selection | Existing historySlice, GitGraph/Gantt and workspace selection owners | Canvas snapshots remain distinct from Git checkpoint OIDs |
| Neutral existing host invocation | agentic-canvas-os dictionaries | Contract routing only; no copied project store/runtime |

The executable closure test rejects imports outside MCP, unexpected transitive owners,
non-approved packages and remote/model networking. It also forbids retired standalone UI paths. The OS
composition test forbids resurrection of removed product planning companions and a
workspace-project runtime owner. Existing artifact operations remain compatibility
contracts for actual consumers; no parallel project backend or hidden fallback is added.

### Contract, flow and limits

`/operation #project @local-git` prepares owner-schema input. Supported operations are
`project-discover`, `project-list`, `project-inspect`, `project-checkpoint`,
`project-import`, `project-export`. Existing tool identities are
`agentic-graph.workspace_artifact.plan` and `agentic-graph.workspace_artifact.apply`.
Plan is read-only; apply binds the exact digest, operator authority and expected head.

Edit → bounded browser draft → exact plan → native blobs/tree/commit → ref CAS →
readback. Inspect uses immutable OIDs. Restore reuses checkpoint with historical files
and the current expected head. Export → manual transfer → import verifies content
digests in a distinct project. Browser, HTTP, stdio and WebMCP use the same owner.

Limits: 100 files, 256 KiB/file, 2 MiB/project, 10 MiB aggregate Git store, independently
10 MiB browser draft cache, 100 displayed history entries. Paths reject traversal,
symlinks and .git. Git disables remote protocols, user hooks/config and interactive
prompts. Quota admission does not wait or retry blindly; failed writes retain recovery
bytes. Tab writer locks and lifecycle epochs fence stale async effects. Panel unmount
persists the draft, aborts requests, releases its lock and unregisters its WebMCP tools.
WebMCP registration carries that same abort signal so native browsers without an
unregister method release both identities before remount. Registration failure is
reported separately from store availability. Canvas copy import uses the existing
workspace import owner to materialize and select the file without a selection race.
A failed browser write retains one bounded current draft in app memory and explicitly
requires export before browser exit; it is never described as durable storage.

The headless host requires Node >=18 and native Git; the Canvas binding uses the
repository's Node 22 toolchain. Its lazy handler uses Node's loader because Vite's
configuration runner closes before requests arrive. HTTP binds 127.0.0.1. Drafts use this
browser's localStorage; authoritative checkpoints use the configured host store.
It works offline with that local host running. Narrow responsive layout is not proof
of phone-only execution, remote-device reach, browser-native Git, edge deployment,
BFCache execution or complete OS-agent parity. Transfer between devices is manual.

### License and resource boundary

MCP's existing package manifest declares MIT; mcp/LICENSE makes that declaration
explicit for this package. The dependency closure uses existing owned MCP files,
Node built-ins and the existing optional SDK. Third-party software keeps its own
license. Root Graph and private Canvas are not relicensed. No package registry or
hosted deployment is selected; package privacy remains unchanged.

Canvas integration sprint: implementation and connected-browser repairs completed;
source-release continuation budget 30 active minutes, <=34 paths and <=180 KiB changed source,
two new binding modules (native panel and local middleware), zero new dependencies.
Existing client/markup move into the lazy Canvas panel. Reuse retained Canvas owners;
no always-load product implementation. Refresh caps on drift.
External provider waits are recorded by blocker and recheck, never an invented ETA.

## ADR

### ADR-01 — Keep one Graph product owner

Selected: retain the existing MIT-declared artifact package and move its UI into Canvas History. Graph already owns the versioning runtime and product experience. OS stays
universal and acyclic. A second real consumer with the same stable contract is the
trigger to evaluate extracting a headless capability into OS; do not pre-create one.
Rejected: moving the whole product into OS, adding it to Canvas OS, a new repository,
copying private Canvas/IndexedDB, embedding a second app, or maintaining multiple project backends.

### ADR-02 — Complete native Canvas integration without another project store

The user reopens the held local Canvas work. History owns the only project UI;
Source Files receives explicit imported copies. Canvas history and Git checkpoints
keep their own identities. The original standalone HTML/client paths are retired.
The HTTP and stdio adapters remain headless compatibility contracts. Canvas's
existing artifact bridge mounts the shared handler at `/__workspace_project` only
on a loopback-bound local server with an explicit `AGENTIC_GRAPH_PROJECT_STORE`.
No hosted filesystem fallback, new listener, license grant or Production activation.

### ADR-03 — Remove stale active planning variants

Graph's previous join pointer becomes this authoritative specification. OS retains
one migration/routing reference and removes its reference-implementation and
implementation-handoff companions. Historical versions remain accessible by exact
commit. Forbid reintroducing active OS product specifications, Canvas OS product
copies, new project tool identities, silent store fallbacks, and claims that viewport
proof establishes physical-device or deployment parity.

## MVP

Active implementation scope is F1–F7/V1–V15. The original mixed candidate remains
immutable recovery evidence. Re-run the project/API suite, native panel/bridge tests,
existing history/media tests, prescribed Canvas check, native affected gates and
connected browser journey. Bound unit or viewport proof does not establish full parity.

Development uses the existing `npm run dev` with an explicit dedicated project store
and loopback binding. Projects is in History. The headless command
`node mcp/workspace-project-server.js --root=/absolute/existing/store [--stdio]`
serves API/MCP only and no longer launches another product page. Existing project
repositories and browser draft keys are preserved; old-origin drafts require an
explicit export/migration at that origin before claiming migration complete.

Admission uses the committed 0.4.0 plan as the bootstrap plus this user-authorized
0.5.0 successor; this document does not retroactively alter its manifest. The prior
source-annotation owner released the two shared files after PR1537 merged at
`8abef0ce2b2e690e144fe685dd177df7dd423b28`. Native readmission binds that exact base,
the existing artifact bridge mount and the CI mapping; no parallel entrypoint exists.

Local verification: 36 project/server/panel/bridge tests, Canvas type checking and
its three local Vite smoke-contract cases pass. The real Canvas journey verifies
Unicode checkpoints, immutable inspection, append-only restoration, selected Canvas
copy import/capture, export/import, reload and panel-remount recovery. A 390 px
keyboard edit/checkpoint/inspect/restore/export journey also passes. Physical-device
proof and old-origin draft migration remain separate. Native affected gates and
protected integration receipts must still bind the eventual published candidate.

After exact protected Integration Gate, native RELEASE completion and canonical sync
must retain separate receipts. Hosted Production still needs FOSS eligibility and its
separate protected candidate authorization; local Canvas reuse is not that grant.

Rollback: stop the local server, preserve project Git repositories and browser drafts,
return to the prior accepted source, then inspect exact OIDs before resuming. Preserve app-session recovery before closing the browser. Do not
force-reset project heads, delete objects/drafts or remove the held worktree as a
side effect of source consolidation. Recovery data is not a stale runtime variant.

## GTM

Smallest proposed paid outcome: help one operator recover and hand off one small
project, then ask whether that saved enough effort to justify $1. Start with up to
three existing-device pilots; do not create a paid plan, checkout integration,
subscription or hosting spend. Revenue, conversion and buyer demand remain unknown.
Record elapsed time, failures, support effort, repeat usage and actual payment receipt
if one occurs. Stop on lost bytes; simplify on confusing handoff; expand only after
repeat need. Business plan, pitch deck, financial model and hosted distribution remain
deferred until sourced demand/economics and suitable license evidence exist.

## Provenance and handoff

Historical five-role source: agentic-os commit
`a5bf2ecbce6e4e866d5f6109eae34c3f84dc4abd`, guides/artifacts-prd-tad-adr-mvp-gtm.md
and its two companions. Historical mixed Graph candidate: PR1535,
`bd1ae77044faddfb1a89e5219cfa6037586f47fd`; base
`12a8f50232fc367762d763a86e810a3e8f8b11d9`. Retain its branch as historical recovery.
New lane: agent/device-0232231d4a19/versioned-project-canvas in its admitted checkout.

Exact source/test/browser/release receipts and preservation hashes are recorded in
private workspace artifacts versioned-project-consolidation-20261004 and versioned-project-canvas-integration-20261004. This specification
replaces the active scattered plan; evidence remains immutable and does not grant
release authority. Source integration, local delivery, hosted Production and cleanup
are separate states. Append the workspace Context/ledger after actual transitions.
