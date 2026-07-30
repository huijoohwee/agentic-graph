---
title: "Reference implementation: Superseded Knowgrph Storage Decision Index"
id: "md:knowgrph-storage-sync-adrs-document"
doc_type: "Architecture Decision Record Archive"
version: "2.0.0"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "architecture.history.storage"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
document_lifecycle: "superseded"
superseded_by:
  - "docs/documents/knowgrph-architecture-decisions.md#adr-004--reference-implementation-use-tiered-persistence-roles"
  - "docs/documents/knowgrph-storage-sync-document.md"
  - "docs/documents/knowgrph-artifact-media-storage-architecture.md"
---

# Reference implementation: Superseded Knowgrph Storage Decision Index

**Decision lifecycle**: Superseded
**Superseded on**: 2026-07-30

## Context

The former index mixed accepted design choices, source-presence notes, planned providers,
production-gated claims, route declarations, and delivery statements across nineteen rows. Several
rows had no complete Context/Decision/Alternatives/TCO record, and the index duplicated decisions
now owned by the core ADR set and storage contracts.

## Archived decision families

| Family | Original direction | Current owner |
|---|---|---|
| Local working persistence | browser records and offline outbox/cursor | core ADR-004 and storage PRD/TAD |
| Shared structured storage | D1-compatible first shared store | core ADR-004 |
| Binary artifacts | R2 objects plus source-visible manifests | binary storage TAD |
| Collaboration | one CRDT/room provider; no raw concurrent JSON writes | storage PRD/TAD |
| Git/file relay | server-side identity and path-scoped authority | storage owner appendix |
| Seed/mirror authority | authored source plus generated read-only projection | core ADR-001/007 |
| Deployment | separate Worker operation and protected lane boundaries | core ADR-006 and storage PRD/TAD |

## Decision

Supersede the incomplete index. Active storage decisions now live in:

1. the core ADR set for source authority, tiered persistence, and protected promotion;
2. the storage PRD/TAD for product/flow/topology requirements;
3. the binary storage TAD for actual blob/media security and overwrite semantics; and
4. the source-owner appendix for file-level mapping.

## Alternatives and TCO

| Alternative | 12-month cash estimate | Ops burden | Disposition |
|---|---:|---|---|
| keep nineteen mixed-status rows active | $0 cash; high recurring review cost | high | superseded |
| consolidated active owners + compact archive | $0 | low | chosen |
| external managed architecture registry | $120–720 | medium plus sync risk | rejected |

## Consequences

- Historical decisions remain visible by family and in Git history.
- No archived row grants implementation, runtime, delivery, or provider mutation authority.
- Exact route identities live in source, not in this archive.
- New storage decisions must use the complete ADR template with FOSS and TCO comparisons.
