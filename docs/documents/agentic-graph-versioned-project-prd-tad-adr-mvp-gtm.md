---
title: "Versioned Project Workspace — Graph Product Owner"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.4.0"
revision: "0.4.0"
date: "2026-10-04"
lang: "en-US"
frontmatter_contract: "required"
owner: "agentic-graph versioned project product owner"
continuity_id: "VERSIONED-WORKSPACE-001"
prd_revision: "0.4.0"
tad_revision: "0.4.0"
adr_revision: "0.4.0"
mvp_revision: "0.4.0"
gtm_revision: "0.4.0"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-0232231d4a19--versioned-project-workspace"
agent_id: "codex-root"
load_policy: "on-demand"
lifecycle_status: "successor-validation"
---
# Versioned Project Workspace

This is the single active five-role owner for VERSIONED-WORKSPACE-001. The user
accepted consolidation in Graph on 2026-10-04. OS owns common lifecycle/contracts;
Graph owns this product, its store, original standalone UI and acceptance evidence.
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

F6 and V9–V12 (private Canvas history, cross-view synchronization and media recovery)
remain KIV in the preserved mixed candidate. They are excluded from this successor's
release diff. Neither moving code nor this document grants a license to private Canvas.

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
| Confined HTTP and optional stdio | mcp/workspace-project-server.js | Built-in HTTP dependencies; SDK loads only for stdio |
| Browser draft/editor/restore/export | mcp/workspace-project-client.js and workspace-project.html | Original standalone UI; one contract import |
| Neutral existing host invocation | agentic-canvas-os dictionaries | Contract routing only; no copied project store/runtime |

The executable closure test rejects imports outside MCP, unexpected transitive owners,
non-approved packages, remote/model networking and extra browser scripts. The OS
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
bytes. Tab writer locks and lifecycle epochs fence stale async effects.

The host requires Node >=18 and native Git. HTTP binds 127.0.0.1. Drafts use this
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

First pass: 30 active minutes, <=20 resulting product/planning/test paths across Graph
and OS, <=100 KiB changed source, zero newly designed runtime modules/dependencies or
always-load bytes. Existing project modules are retained; the 17 private Canvas paths
are restored to canonical baseline only in the successor diff. Refresh caps on drift.
External provider waits are recorded by blocker and recheck, never an invented ETA.

## ADR

### ADR-01 — Keep one Graph product owner

Selected: extend the existing MIT-declared artifact package and original standalone
UI. Graph already owns the versioning runtime and product experience. OS stays
universal and acyclic. A second real consumer with the same stable contract is the
trigger to evaluate extracting a headless capability into OS; do not pre-create one.
Rejected: moving the whole product into OS, adding it to Canvas OS, a new repository,
copying private Canvas/IndexedDB, or maintaining multiple project backends.

### ADR-02 — Split eligible local project work from private Canvas

Selected: native successor of the immutable mixed candidate. Restore Canvas paths to
base in the successor while preserving original commit/branch and a verified recovery
bundle. Production eligibility applies only to the proven licensed closure and exact
release effect, never to the entire mixed history or private application.

### ADR-03 — Remove stale active planning variants

Graph's previous join pointer becomes this authoritative specification. OS retains
one migration/routing reference and removes its reference-implementation and
implementation-handoff companions. Historical versions remain accessible by exact
commit. Forbid reintroducing active OS product specifications, Canvas OS product
copies, new project tool identities, silent store fallbacks, and claims that viewport
proof establishes physical-device or deployment parity.

## MVP

Active scope is F1–F5/V1–V8. F6/V9–V12 stay held. Previous exact headless source passed
44 tests; this successor adds restore and ownership checks and requires fresh proof.
Use `node --test mcp/__tests__/workspace-project-*.test.mjs`, artifact/repository-pack
compatibility suites, the native
affected-check selector, and a real browser readback. A source-only test is not a
browser, physical-device, release or Production receipt.

Development: `node mcp/workspace-project-server.js --root=/absolute/existing/store`.
Use a dedicated store and the reported loopback URL. Stdio adds `--stdio` to the same
server entry point. No Cloudflare deployment, new provider or paid resources apply.
After exact protected Integration Gate, native RELEASE completion and canonical sync
must each retain evidence. Hosted Production still requires its separate protected
candidate authorization; this local product does not reopen private Canvas deployment.

Rollback: stop the local server, preserve project Git repositories and browser drafts,
return to the prior accepted source, then inspect exact OIDs before resuming. Do not
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
`12a8f50232fc367762d763a86e810a3e8f8b11d9`. Retain its branch as KIV recovery.
New lane: agent/device-0232231d4a19/versioned-project-headless in the inherited checkout.

Exact source/test/browser/release receipts and preservation hashes are recorded in
private workspace artifact versioned-project-consolidation-20261004. This specification
replaces the active scattered plan; evidence remains immutable and does not grant
release authority. Source integration, local delivery, hosted Production and cleanup
are separate states. Append the workspace Context/ledger after actual transitions.
