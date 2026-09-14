---
title: "Repository Validation PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.0"
owner: "agentic-graph"
date: "2026-09-14"
lang: "en-US"
frontmatter_contract: "required"
load_policy: "on-demand"
continuity_id: "GRAPH-VALIDATION-ADOPTION-001"
prd_revision: "1.0.0"
tad_revision: "1.0.0"
adr_revision: "1.0.0"
mvp_revision: "1.0.0"
gtm_revision: "1.0.0"
status: "implementation"
---

# Repository validation

PRD `GRAPH-VALIDATION-ADOPTION-001@1.0.0`: a solo maintainer validates the
changed source and its declared contracts without rerunning the full Canvas suite
after every edit. Context: repeated broad tests delay feedback. Intent: retain
required coverage with bounded cost. Directive: consume the pinned Agentic OS
runner and keep the existing collaboration contract as the sole command map.
Role/Subject: maintainer. Action/Verb: validates. Outcome/Object: an exact affected
plan and retained check results. No production or full-suite parity follows.

TAD and ADR `1.0.0` bind that PRD. `npm test` and `ci:affected` use the common
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

MVP `1.0.0`: source adoption only, with zero new runtime dependencies or always-load
modules. The owner plan is bounded to 15 minutes and the existing individual
command limits remain effective. Browser and provider evidence must be fresh.
No release, cleanup, payment or production authority is introduced.

GTM `1.0.0`: use the same source edit to record executed/skipped commands and
elapsed time. The intended buyer is a solo developer seeking quicker reliable
delivery. Savings, willingness to pay and production readiness require measured
evidence; protected source integration is a separate receipt.
