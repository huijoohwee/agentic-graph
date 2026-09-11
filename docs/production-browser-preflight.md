---
title: "Production browser preflight"
doc_type: "PRD-TAD-ADR-MVP-GTM"
status: "active"
continuity_id: "GRAPH-BROWSER-PREFLIGHT-001"
revision: 4
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

The asset adapter supplies content-bound ETags. Before browser execution, the gate loads the Graph
entry script through the compiled Pages handler and checks conditional GET and HEAD responses.
Both must preserve the asset's 304 response and validator. This explicit check is necessary because
Playwright request interception disables the browser HTTP cache; a cold-load pass cannot prove
that Home and its iframe can revalidate shared bundles. HTML fallbacks and missing assets still fail.

After dependency installation, the fresh runner fetches and verifies the protected revision, selects
that exact canonical branch, and runs native Agentic OS setup to authenticate its committed profile.
This establishes clone-local trust before any gate or retained history is consumed. A disposable-clone
test must exercise the actual setup and gate entry point; a previously initialized developer clone
cannot establish fresh-runner compatibility.

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

The generated mirror's own runtime seal check also runs before activation. It verifies the full
source-owned artifact, including XR model bytes and migrated images. Pages and storage compensation
share the same rollback-eligibility decision, so preserving Pages also preserves its storage version.

For a retained release whose live checks passed, mirror publication is now verified, and storage
alone was restored, `release.yml` accepts `recovery_run_id`. The normal build/deploy job is skipped.
The required review/evidence inputs identify the retained original release; they do not authorize
another activation. The recovery controller validates them against the original run and sealed
evidence, unchanged runtime inputs,
published mirror checks, public markers, storage/D1 state, and the exact retained Worker version.
Its credentialless plan names the only permitted activation and expires after one hour. The protected
production approval must carry `authorize recovery <planDigest>` from the configured storage owner.
The controller activates that existing version once, verifies core authentication/browser-session
behavior, and retains a joined completion receipt plus two authoritative rollback-target readbacks.
It never uploads a Worker, deploys Pages, edits routes/secrets, or applies migrations. An ambiguous
activation or failed verification preserves evidence and cannot automatically retry the mutation.

Validation: the focused preflight tests cover failed/interrupted history, source/configuration keys,
artifact byte changes, symlink rejection, and malformed inputs. The full isolated browser validator
exercises the candidate. Required protected Integration and XR checks still govern source integration.
The recovery extension adds two on-demand release modules, no dependency package, no service, and
no always-load prompt text. It retains the existing Agentic OS dependency revision. Recovery guards
also run in the credentialless preparation job before production approval.
