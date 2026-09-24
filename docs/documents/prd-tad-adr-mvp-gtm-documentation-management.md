---
title: "Reference implementation — Graph Markdown documentation maintenance"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.1.0"
date: "2026-09-24"
lang: "en-US"
owner: "Graph documentation maintainers"
frontmatter_contract: "required"
continuity_id: "DOC-MGMT-GRAPH-001"
prd_revision: "0.1.0"
tad_revision: "0.1.0"
adr_revision: "0.1.0"
mvp_revision: "0.1.0"
gtm_revision: "0.1.0"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
lifecycle_status: "proposed"
load_policy: "on-demand"
worktree_id: "device-0232231d4a19--markdown-doc-maintenance"
agent_id: "codex-documentation-management"
guideline_revision: "3.3.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/fc14505ac603c6e72bd682326d0b4c4d75e1745c/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "76b3627d20634f7c51edd3673bc8779ad2c4f1f2"
source_docs:
  - "https://github.com/huijoohwee/huijoohwee.github.io/blob/fc14505ac603c6e72bd682326d0b4c4d75e1745c/template/document-maintenance-template.md"
---

# Graph Markdown documentation maintenance — reference implementation

## Identity and grounding — reference implementation

The five roles join `DOC-MGMT-GRAPH-001@0.1.0`. This document refines the
[Graph source contract](agentic-graph-prd-tad-adr-mvp-gtm-requirements.md): one
readable source owns content, while Git and existing checks provide reviewable
changes. The [central maintenance plan](https://github.com/huijoohwee/agentic-os/blob/e96dd20f7ae5e12cfd2bda037c6cb1518237d378/guides/prd-tad-adr-mvp-gtm-documentation-management.md)
owns the shared updater and fleet boundaries. Graph owns only its document and
CI handoff. Website-owned authoring rules, schema and template stay upstream.

Observed inputs: Graph `76b3627d20634f7c51edd3673bc8779ad2c4f1f2` has
`canvas/src/cli/doc-sanity-check.ts` and one Integration Gate. Protected OS
`e96dd20f7ae5e12cfd2bda037c6cb1518237d378` provides
`scripts/doc-sync.mjs`; protected website
`fc14505ac603c6e72bd682326d0b4c4d75e1745c` provides the template and
guideline. Source review is not a deployed-runtime claim.

**Directive:** Context: Graph has Markdown authoring checks but no enrolled
template ancestry check in Integration CI. Intent: keep local prose and shared
maintenance rules aligned. Directive: check one exact Markdown document against
the pinned template and block Integration Gate on drift. Role: Graph maintainer.
Action: prepare and verify one scoped document update. Outcome: an inspectable
candidate or an explicit conflict. Subject: Graph documentation. Verb: check.
Object: the enrolled Markdown file.

## PRD — reference implementation

The maintainer's job is to update shared Markdown guidance without losing
Graph-specific notes or creating a second executable updater. The baseline is
manual comparison. Frequency, time saved, defect rate and willingness to pay
have not been measured.

| ID | Given → when → then | Verification |
|---|---|---|
| D1 | Given the enrolled Markdown file and exact website revision, when checked, then YAML provenance and the bounded shared block match the reviewed template. | Central sync `--mode=check` exits zero; malformed or changed source fails. |
| D2 | Given local notes outside the shared block, when a template change is prepared, then local bytes remain untouched and conflicts require review. | Central sync dry run and Graph diff review. |
| D3 | Given a Graph PR, when Integration CI runs, then one docs-contract job checks D1 and Integration Gate depends on it. | Workflow structure and protected CI results. |
| D4 | Given a source-only merge, when completion runs, then source, cleanup and runtime states remain distinct. | Native completion and exact receipts. |

The smallest outcome is one checked Graph Markdown file in an admitted lane.
No browser feature, service deployment, generated mirror or payer result is
claimed by this source change.

## TAD — reference implementation

The website repository owns `template/document-maintenance-template.md` and
its frontmatter profile. OS owns `scripts/doc-sync.mjs`. Graph reuses both at
their exact protected revisions in `.github/workflows/integration.yml`.
Graph's `docs/document-maintenance.md` owns local notes and the `source_docs`
locator. Integration Gate waits for docs-contract, so a failed document check
blocks the existing required merge status. The sync script is fetched once per
job; no script copy, parser, package dependency or runtime worker is added.

| Design | Owner | Acceptance |
|---|---|---|
| T-D1 / D1 | Graph document and website template | Exact source revision and delimited block; strict central check. |
| T-D2 / D2 | OS sync command | Dry run preserves authored notes; apply requires native lane. |
| T-D3 / D3 | Graph Integration workflow | Required gate depends on docs-contract. |
| T-D4 / D4 | Graph release owner | Protected merge and native closeout have separate receipts. |

All three checkouts remain siblings. The CI job uses fixed commits and no
floating branch. Local and provider validation consume the same file and
template bytes; provider checks still require exact candidate identity.

## ADR — reference implementation

**Decision:** Reuse the central updater and existing Graph Integration Gate.
The alternative, a Graph-specific sync script, would duplicate ownership and
increase maintenance cost. Checking every Graph Markdown file now would also
require a separate enrollment review; this first slice enrolls one file.
The job adds one small checkout/check path per CI run. Revisit the scope after
a measured pilot records drift frequency, elapsed time and CI resource use.

## MVP — reference implementation

One document, one joined plan and one CI workflow are the authorized change.
Budget: 20 active minutes, at most three files and 12 KiB authored text;
zero new modules, dependencies, model calls or paid services. Verify the
central check, frontmatter, Graph workflow structure and affected local
checks; protected CI must pass on the exact candidate before merge.

Acceptance evidence attaches to the candidate and merge receipts. A passing
local check establishes source conformance only. Production Release and
Runtime evidence stay with Graph's separately authorized release owner.

## GTM — reference implementation

Maintainers may compare one week of template changes and local review time
before considering broader enrollment. The proposed buyer is a small team
maintaining related Markdown repositories; willingness to pay, activation and
repeat use are unvalidated. The next increment ranks measured drift and review
cost against the manual baseline before changing the enrollment set.
