---
title: "Adopt shared clean worktree removal"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.0"
date: "2026-11-09"
owner: "agentic-graph"
continuity_id: "AGENTIC-OS-WORKTREE-CLEANUP-001"
prd_revision: "1.0.0"
tad_revision: "1.0.0"
adr_revision: "1.0.0"
mvp_revision: "1.0.0"
gtm_revision: "1.0.0"
load_policy: "on-demand"
universal_scope: false
---

# Adopt shared clean worktree removal

## PRD

Select Agentic OS's shared `remove-clean` policy for exact clean linked worktrees. The shared owner may use
Git's no-force worktree removal only after its fresh byte and open-reader checks pass; local-only or uncertain
bytes remain recoverable through quarantine. Keep branches, refs, reflogs, and objects. No Graph source,
canvas, Pages, deployment, or rollback behavior changes.

## TAD and ADR

The shared Agentic OS runtime owns cleanup logic and receipts. This repository changes only its profile and
the exact pinned runtime dependency so it can validate the selected policy. Retain every branch and shared
object target; keep Production authority and delivery consumer-owned.

## MVP and GTM

Success is one profile selecting the shared mode with its required runtime revision. Disk savings are limited
to clean checkout bytes that no longer need quarantine; no amount is claimed before measurement.
