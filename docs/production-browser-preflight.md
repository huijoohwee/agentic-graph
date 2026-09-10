---
title: "Production browser preflight"
doc_type: "PRD-TAD-ADR"
status: "active"
continuity_id: "GRAPH-BROWSER-PREFLIGHT-001"
revision: 1
owner: "agentic-graph"
frontmatter_contract: "required"
---

# Production browser preflight

The release must reject a broken browser candidate before production authorization or activation.
The existing fidelity validator owns browser acceptance: Home prompt catalog and Physics, canonical
source authority, persisted-selection recovery, workspace seed inventory, and exact asset namespaces.
An isolated pass is preparation evidence; the deployed browser and service-worker checks remain required.

The protected release workflow consumes Agentic OS `flight gate` from its exact package pin. Its v3
manifest enrolls `production-activation`. Preparation hashes the actual transferred artifact bytes and
the preserved sibling files exercised by the fidelity check. It joins source and docs revisions to the
readiness marker and hashes the configuration. Candidate changes fail before and after execution.

The isolated runner executes the compiled candidate Pages bundle and the existing storage Worker
against the existing native SQLite harness. It verifies pinned docs bytes, publishes them only in the
disposable database, and denies external network access. The asset adapter applies the generated
redirect rules. This is bounded application behavior coverage, not Cloudflare routing or provider proof.
Production still verifies the actual public document hash, transport, browser, and service-worker state.

Before expensive verification or build, the workflow checks protected attempt history. Before browser
execution, GitHub retains an attempt artifact. A failed, interrupted, active, or expired prior
release with the same source/docs/runtime identity blocks another attempt. An explicit rerun cannot
overwrite its own history. Successful prior ledgers are restored into the fresh clone and revalidated
by Agentic OS. No success cache, force option, or automatic browser retry is provided. Observation is
limited to 100 matching artifacts; incomplete or oversized history fails closed. GitHub concurrency
serializes the production owner; local clone locking stays with Agentic OS.

The gate allows eight minutes and inherits Agentic OS's private 64 KiB-per-stream diagnostic bound.
Attempt and ledger artifacts remain for 90 days. Expired evidence requires reconciliation rather than
silently resetting the budget. The live browser check executes once and retains its original stderr.
The workflow cannot bind a production authorization candidate unless the isolated gate passes.

Validation: the focused preflight tests cover failed/interrupted history, source/configuration keys,
artifact byte changes, symlink rejection, and malformed inputs. The full isolated browser validator
exercises the candidate. Required protected Integration and XR checks still govern source integration.
This change adds two on-demand release modules, no dependency package, no service, and no always-load
prompt text. The Agentic OS dependency revision changes to adopt its existing gate implementation.
