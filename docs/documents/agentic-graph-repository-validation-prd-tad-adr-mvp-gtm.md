---
title: "Repository Validation PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.1"
owner: "agentic-graph"
date: "2026-09-17"
lang: "en-US"
frontmatter_contract: "required"
load_policy: "on-demand"
continuity_id: "GRAPH-VALIDATION-ADOPTION-001"
prd_revision: "1.0.1"
tad_revision: "1.0.1"
adr_revision: "1.0.1"
mvp_revision: "1.0.1"
gtm_revision: "1.0.1"
status: "implementation"
---

# Repository validation

PRD `GRAPH-VALIDATION-ADOPTION-001@1.0.1`: a solo maintainer validates the
changed source and its declared contracts without rerunning the full Canvas suite
after every edit. Context: repeated broad tests delay feedback. Intent: retain
required coverage with bounded cost. Directive: consume the pinned Agentic OS
runner and keep the existing collaboration contract as the sole command map.
Role/Subject: maintainer. Action/Verb: validates. Outcome/Object: an exact affected
plan and retained check results. No production or full-suite parity follows.

TAD and ADR `1.0.1` bind that PRD. `npm test` and `ci:affected` use the common
executor; `ci:affected:source` reads the existing scopes, exact-path mappings,
expansions and fallback from [the owner contract](../collaboration-runtime-contract.md).
The adapter policy declares one owner plan and never caches its external/browser
inputs. Local changes include committed branch differences as well as working and
untracked paths. CI resolves exact event bases through Agentic OS; the protected
refresh retains its separately verified base-ref contract. No map is copied.

Acceptance: committed-only edits select checks; deleted/renamed/unknown paths
retain conservative handling; an invalid baseline fails; default tests and
protected integration enter the shared runner; explicit `test:all` preserves the
full suite. Validate with `scripts/__tests__/repository-validation.test.mjs`, the
existing collaboration tests, the selected plan and the protected Integration Gate.
The full-suite baseline's known failures remain failures and are not waived.

MVP `1.0.1`: source adoption only, with zero new runtime dependencies or always-load
modules. The owner plan is bounded to 15 minutes and the existing individual
command limits remain effective. Browser and provider evidence must be fresh.
No release, cleanup, payment or production authority is introduced.

GTM `1.0.1`: use the same source edit to record executed/skipped commands and
elapsed time. The intended buyer is a solo developer seeking quicker reliable
delivery. Savings, willingness to pay and production readiness require measured
evidence; protected source integration is a separate receipt.

## Bounded runtime validation throughput

AC-V02 / T-V02 / ADR-V02, joined at `1.0.1`: `runtime:test:core` uses at most
two isolated Node test-file processes instead of one. The exact test file patterns,
assertions, exit handling, affected-command order and all deadlines remain unchanged.
Node owns scheduling and process isolation; each test retains its existing temporary
fixtures and ephemeral ports. No additional runner, dependency, cache, CI job or
always-loaded module is introduced. Other runtime and browser commands retain their
existing scheduling limits.

Pain evidence: merged-main run `35115615440`, attempts 1 and 2, exceeded the
900-second aggregate limit at source `4f0eb959f09b4378c28fc8382edaa3832be099ef`.
The second attempt completed runtime core in 200.76 seconds after agent mission
validation (554.86 seconds) and typechecking (90.83 seconds). This identifies a
serial workload to measure; it does not establish a browser performance cause.

Acceptance: all existing runtime tests pass with bounded concurrency; the same
affected plan and protected Integration Gate pass on the candidate and merged main.
Compare captured runtime duration and output coverage against the retained serial
observation; report machine differences and unmeasured memory/CPU explicitly.
Do not raise the 15-minute aggregate budget or infer savings from worker count.
Revert this command change if shared-fixture collisions or resource regressions
appear. MVP scope is this scheduling repair; GTM/WTP and production proof remain
unvalidated. CI receipts and diagnostic reports stay outside authored source.
