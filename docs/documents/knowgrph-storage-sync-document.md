---
title: "Reference implementation: Superseded Knowgrph Storage and Synchronization v4.1"
id: "md:knowgrph-storage-sync-document"
doc_type: "Combined PRD/TAD Archive"
version: "4.2.0"
archived_contract_version: "4.1.0"
date: "2026-08-06"
lang: "en-US"
guideline_version: "1.7.0"
owner: "architecture.history.storage.sync"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-storage-sync-document.md"
document_lifecycle: "superseded"
superseded_by: "docs/documents/knowgrph-storage-sync-prd-tad-adr.md@5.0.0"
decision_archive: "docs/documents/knowgrph-storage-sync-adrs-document.md"
binary_contract: "docs/documents/knowgrph-artifact-media-storage-architecture.md"
invocation_authority: "Runtime route identities are owned by the typed route-path source module; this archive declares no invocation route."
---

# Reference implementation: Superseded Knowgrph Storage and Synchronization v4.1

**Document lifecycle**: Superseded

**Archived contract version**: 4.1.0

**Superseding contract**: `docs/documents/knowgrph-storage-sync-prd-tad-adr.md@5.0.0`

## Purpose

This file preserves the stable document identity and version transition for the former combined
storage PRD/TAD. It is a history pointer, not a second product contract, architecture owner,
readiness ladder, invocation dictionary, or delivery authorization.

## Archived scope

Version 4.1 described local working persistence, typed outbox/cursor/conflict synchronization,
non-authoritative shared projections, and closed Source → Mirror → Delivery boundaries. Version 5.0
superseded that contract when it added complete component and integration specifications, explicit
quality/deployment contracts, a readiness gap matrix, Yjs room-collaboration requirements, and
embedded ADR ownership.

Historical detail remains available in Git history. Do not infer current implementation, runtime,
provider, public-delivery, or rollback readiness from the archived v4.1 body.

The superseding contract preserves these invariants: Authored Markdown remains canonical. Browser,
shared, and generated projections are supporting stores with explicit roles. The Route identity source
is the typed route-path module, and the protected Pages release does not deploy storage Worker code.

## Preserved active-contract assertions

This redirect summary is intentionally non-authoritative; each assertion below points to the active
v5 contract or its binary-security owner and exists so registered policy checks follow the lifecycle
transition without treating this archive as an implementation owner.

Browser records, shared D1 rows, R2
objects, collaboration rooms, and generated mirrors are supporting stores with explicit roles.
For collaboration, exactly one room provider owns updates and recovery, with no dual-write between room providers.

| Component | Role | Preserved active-contract role |
|---|---|---|
| Working store | Store | IndexedDB/Dexie or explicit memory adapter; memory fallback is not called durable. |

The Route identity source remains the typed route-path module. The protected Pages release does not deploy storage Worker code.
The generic blob handler currently has no auth and permits overwrite at a workspace/path key.
The run-media token checks expiry and run id but is not signed.
Binary persistence keeps its security/overwrite gaps documented separately in the dedicated binary contract.

## Current owners

| Concern | Current owner |
|---|---|
| Active product, architecture, VCC, readiness, and ADR contract | `docs/documents/knowgrph-storage-sync-prd-tad-adr.md` |
| File-level implementation ownership and evidence gaps | `docs/documents/knowgrph-storage-sync-document.companion.md` |
| Superseded storage decisions | `docs/documents/knowgrph-storage-sync-adrs-document.md` |
| Blob/media authorization and overwrite semantics | `docs/documents/knowgrph-artifact-media-storage-architecture.md` |
| Runtime route identities | typed route-path source module |

## Consequences

- `owner: architecture.history.storage.sync` owns only this historical pointer.
- The active contract alone owns storage/sync requirements and readiness derivation.
- No archived statement grants source mutation, provider access, Worker deployment, mirror
  publication, or public-delivery authority.
- New evidence belongs in the active contract and its owner appendix, never in this archive.
