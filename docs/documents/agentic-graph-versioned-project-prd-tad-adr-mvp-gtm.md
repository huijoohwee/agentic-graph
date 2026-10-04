---
title: "Versioned Project Workspace — Native Implementation Join"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.3.1"
revision: "0.3.1"
date: "2026-10-03"
lang: "en-US"
frontmatter_contract: "required"
owner: "Versioned workspace product owner"
continuity_id: "VERSIONED-WORKSPACE-001"
prd_revision: "0.3.1"
tad_revision: "0.3.1"
adr_revision: "0.3.1"
mvp_revision: "0.3.1"
gtm_revision: "0.3.1"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-0232231d4a19--versioned-project-workspace"
agent_id: "codex-root"
load_policy: "on-demand"
lifecycle_status: "local-dev-proven"
---
# Versioned Project Workspace — Native Implementation Join

This is a small implementation pointer, not a second five-role owner. Actual requirements and
decisions are `VERSIONED-WORKSPACE-001@0.3.1` in the admitted OS planning lane:

- [PRD/TAD/ADR/MVP/GTM](https://github.com/huijoohwee/agentic-os/blob/a5bf2ecbce6e4e866d5f6109eae34c3f84dc4abd/guides/artifacts-prd-tad-adr-mvp-gtm.md)
- [Source bindings](https://github.com/huijoohwee/agentic-os/blob/a5bf2ecbce6e4e866d5f6109eae34c3f84dc4abd/guides/artifacts-reference-implementation.md)
- [Evidence and next action](https://github.com/huijoohwee/agentic-os/blob/a5bf2ecbce6e4e866d5f6109eae34c3f84dc4abd/guides/artifacts-implementation-handoff.md)

The 0.3.1 planning candidate is published in OS PR329 at the exact revision above.
Protected integration, product delivery and cleanup remain separate pending receipts.

Selected delta extends MIT `mcp/workspace-artifact-contract.js` and
`mcp/workspace-artifact-runtime.js` with native Git project version operations; new local owners
are `workspace-project-runtime.js`, `workspace-project-server.js`, `workspace-project-client.js`
and `workspace-project.html`, with script-only `mcp/package.json` changes and runtime/server tests.
The same two plan/apply identities own HTTP, optional existing SDK stdio and available WebMCP
`document.modelContext` registrations. Browser `/operation #project @local-git` only prepares
owner-schema input. No provider, paid/new dependency, remote protocol, Canvas/IndexedDB code copy,
full OS-agent parity or concurrent remote hosting is selected. Existing private Canvas view reuse is separately authorized locally; its distribution license remains NONE/private, with no FOSS claim.

Graph lane: `agent/device-0232231d4a19/versioned-project-workspace`, base
`12a8f50232fc367762d763a86e810a3e8f8b11d9`. START's committed bootstrap plan is the existing
[storage-sync plan](agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md); manifest digest is
`76664a6f0798ada221260b884b6a07402d23866bec79115cc36177313d62c4de`. That is distinct from the
actual user requirements in currently untracked OS planning documents. Neither this pointer nor
the native manifest retroactively asserts committed-plan baseline admission or release authority.

Check: `npm run test:project` in `mcp`, existing artifact compatibility suites, affected native
checks and actual local browser readback. Final source/check/browser receipts belong to the OS
handoff; none is invented here. Local Development preview is distinct from source release,
delivery, physical mobile, manual second-device proof and buyer demand.

2026-10-03 Development checkpoint: native-Git owner, confined browser/HTTP/stdio adapters and
the six-operation contract are implemented. Runtime suite passed 10/10; HTTP/stdio suite passed
11/11; affected artifact/repository-pack compatibility suites passed 23/23. Browser 360×800
readback observed two immutable versions and a second-tab winner; the losing tab reloaded its
own exact unsaved draft and received `VERSION_CONFLICT`. Native WebMCP registered both existing
identities. Final file digests, repeated check receipts, timed journey and broad-gate disposition
are recorded by the linked OS handoff; this pointer does not assert integration or deployment.

Implementation cap: 30 active minutes, 100 KiB source, six owner modules, one script configuration,
two tests, zero paid/new dependencies and zero serving tokens. Product limits: 100 files,
256 KiB/file, 2 MiB/project, 10 MiB aggregate Git store, independently 10 MiB draft store,
100 displayed history entries. Preserve objects/drafts on scoped rollback; publication,
deployment, cleanup and data deletion each require their own exact authority and green receipt.

0.3.1 joins the existing Source Files/FloatingPanel GitGraph/Gantt-Timeline successor: eight owner modules normalize active document identity, preserve original shared-history indexes, restore source/path snapshots, derive current-document diagrams and fence async file selection across history restore. Five real React/store/hook cases pass; Canvas snapshots remain distinct from native Git project OIDs, with no checkpoint adapter between stores. Same-file edits retain selections; switches/restores clear scoped selection/transport and preserve other files.

Current headless receipt remains 44/44; prior Canvas sync/type checks remain bounded proof. The 5191 freeze recovered through a fresh README tab. Media import/frame preview was the reported trigger; a real-hook drifting-geometry test proved synchronous observer feedback can starve frames. The repair bounds recovery through one RAF loop and splits the existing owner into four modules below 600 lines. Current checks/readback are pending; the original imported bytes are unavailable. Readmission digest is `d7ab84bfaa196f3874dbddb42d8a4f4326524e8a237eb24767713689105d89b5`, 26 paths/one checkout. The separate 5190 lane is preserved. Exact receipts belong to the linked handoff; native pin drift still blocks publication.

2026-10-04 release checkpoint: all nine headless receipt hashes still match (44/44). Before this
documentation update, the repaired media suite's 27 hashes matched (18/18 and typecheck pass). The full standard
partition passes all 13 selected stages using the supported docs-root binding to the existing
clean `e0ef770860905830157e64c455f0a342084b6d25` checkout. The consumer pin is unchanged.
The extended XR browser gate requires a clean frozen commit and refused the uncommitted source;
freeze this candidate, then resume that exact owner gate before claiming complete validation.
Current-source localhost review saved and read back native Git checkpoint
`3b25c21f31f799e7aab9ca855ffbf80f472ec7bd` in a dedicated verification store. Native WebMCP
`project-inspect` returned the same version, bytes and digest; registration alone is no longer
the only evidence for that read operation. Physical-device, full Canvas journey, source
integration and Production receipts remain unproved. Current logs and retained blockers are
in workspace artifact `end-adlc-four-worktrees-20261004`; V1–V11 and the local scope are unchanged.
