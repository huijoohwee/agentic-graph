---
title: "Production browser preflight"
doc_type: "PRD-TAD-ADR-MVP-GTM"
status: "active"
continuity_id: "GRAPH-BROWSER-PREFLIGHT-001"
revision: 6
owner: "agentic-graph"
frontmatter_contract: "required"
version: "0.1.1"
date: "2026-09-12"
lang: "en-US"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.1.0"
prd_revision: "0.1.1"
tad_revision: "0.1.1"
adr_revision: "0.1.1"
mvp_revision: "0.1.1"
gtm_revision: "0.1.1"
---

# Production browser preflight

## Revision 6: Source Files disclosure proof

Release36616395606 passed Home, catalog, Physics and persisted-source recovery, then timed out
opening `docs`. The verifier still clicked folder selection and expected a sibling `ul`; the
shared DirectoryTree controls now expose a separate Expand/Collapse button and a labeled contents
section. The source inventory requirement remains exact and unchanged.

PRD/MVP: prove the complete visible canonical seed inventory through the user-facing tree.
TAD/ADR: the fidelity owner imports one directory inventory helper, clicks only a collapsed
disclosure, waits for its expanded state and labeled contents, and reads direct visible file rows.
Nested and hidden files cannot satisfy the inventory; duplicates remain in the comparison.
GTM: this is release-verifier compatibility, with no new product feature, dependency or spend.

The release preflight regression bundles the real DirectoryTree controls, reproduces the old
sibling-list timeout, and verifies disclosure idempotence, unchanged selection, nested-row
exclusion, hidden-row rejection and duplicate preservation. The same owner remains required in
the isolated artifact and live production gates. Budget: four files, 12 KiB authored delta,
20 active implementation/proof minutes; provider CI and human decisions are external dependencies.
This revision completes only implementation and focused proof; protected source integration,
canonical Dev certification, exact production authorization and live release receipts remain required.

## PRD: browser acceptance

The release must reject a broken browser candidate before production authorization or activation.
The existing fidelity validator owns browser acceptance: Home prompt catalog and Physics, canonical
source authority, persisted-selection recovery, workspace seed inventory, and exact asset namespaces.
An isolated pass is preparation evidence; the deployed browser and service-worker checks remain required.

## TAD: source-bound preflight

The protected release workflow consumes Agentic OS `flight gate` from its exact package pin. Its v3
manifest enrolls `production-activation`. Preparation hashes the actual transferred artifact bytes and
the preserved sibling files exercised by the fidelity check. It joins source and docs revisions to the
readiness marker and hashes the configuration. Candidate changes fail before and after execution.

## ADR: reuse the isolated fidelity owner

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

## Implemented catalog verification repair — 2026-09-30

PRD: release run 36601533634 rejected source `2699bbb06228caa504cd64c53adf6026bb338e9d`
before authorization because the catalog verifier queried native `option` descendants of the shared
semantic menu button. The UI had no page errors; the published catalog byte check passed. Acceptance
still requires a complete canonical catalog and preserves the existing minimum inventory guard.

TAD: `scripts/production-prompt-catalog.mjs` opens the actual `Prompt preset` menu, binds its ID to
the trigger's `aria-controls`, and compares each visible enabled radio item's ID, label and checked
state to the independently byte-verified pinned catalog. Escape closes the portal without selecting
or invoking a preset. Both isolated and live fidelity checks call this same owner.

ADR: replace the obsolete native-select assertion; retain source hash verification, catalog alerts,
all scene/source/asset assertions, failed-attempt history and exact production authorization. No UI,
provider configuration, runtime dependency or always-load module changes are introduced. The helper
loads only for release validation. The original failed run and bounded diagnostics stay retained.

MVP: the release's existing `production-browser-preflight.test.mjs` entry also executes a real-browser
regression against the actual `SemanticSelect` component. It proves that the native-option count is
zero while the full visible menu passes, then rejects missing, duplicate, mislabeled, disabled,
hidden or incorrectly selected choices and source-authority alerts. A disposable catalog keeps this
test independent of the later docs checkout; production expectations come from pinned source bytes.
Source tests alone do not establish protected integration or deployed browser readiness.
Local result: 56 tests passed across the preflight, Pages boundary and production release contract
entries, including the shared-menu browser regression. Syntax and whitespace checks passed.

GTM: restore the existing zero-spend Home entry and release path. This increment adds no new feature,
paid service, demand claim or physical-device acceptance. Full delivery remains conditional on the
successor's protected source proof, canonical runtime certification, isolated browser pass, exact
human authorization and live production receipts. Repair budget: five files, 18 KiB authored delta,
20 active implementation/proof minutes; CI and human decisions are external dependencies.

## Planning revision — reference implementation

All five roles below consume `GRAPH-BROWSER-PREFLIGHT-001@0.1.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [PRD: browser acceptance](production-browser-preflight.md#prd-browser-acceptance) |
| TAD | [TAD: source-bound preflight](production-browser-preflight.md#tad-source-bound-preflight) |
| ADR | [ADR: reuse the isolated fidelity owner](production-browser-preflight.md#adr-reuse-the-isolated-fidelity-owner) |
| MVP | [MVP — reference implementation](production-browser-preflight.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](production-browser-preflight.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. No feature implementation artifact was independently bound by this document review; implementation disposition remains **unverified** pending the document owner’s source-to-VCC check.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
