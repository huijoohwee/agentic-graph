---
title: "Stream to Markdown Dashboard — reference implementation"
doc_type: "PRD-TAD-ADR-MVP-GTM"
continuity_id: "GRAPH-STREAM-DASHBOARD-001"
version: "2.0.0"
prd_revision: "2.0.0"
tad_revision: "2.0.0"
adr_revision: "2.0.0"
mvp_revision: "2.0.0"
gtm_revision: "2.0.0"
owner: "agentic-graph"
frontmatter_contract: "required"
local_rung: "implemented-local"
delivered_rung: "undocumented"
lane: "authoring"
load_policy: "on-demand"
reviewed_source_revision: "2fd02312fd9caf145184f9e5d9fc8b28b612917d"
---

# Stream to Markdown Dashboard — reference implementation

All five roles consume GRAPH-STREAM-DASHBOARD-001@2.0.0. The user's explicit instruction
“UPDATE agentic-os, prd-tad-adr-mvp-gtm md, then IMPLEMENT” authorizes this implementation.
The [Agentic OS contract](https://github.com/huijoohwee/agentic-os/blob/main/guides/STREAM-DASHBOARDS.md)
owns the observation/presentation boundary. This document owns product behavior, not a new lifecycle.

## PRD

The operator currently receives run JSON but must reconstruct a dashboard to share or reopen it.
The operator applies a reusable Markdown template to a complete observation and saves one readable,
portable dashboard with its complete retained Mission evidence, codebase projection, metric values, span hierarchy, aspect ratios and rows/columns intact. The input JSON, shared template Markdown and output Markdown each have a visible path and Open action in one Source Files box.

| Acceptance | Given / when / then | Owner and check |
|---|---|---|
| SD-01 | Given finite JSON or SSE snapshots, when input is decoded, then only complete, ordered, source-consistent events are accepted; identical replay is ignored and failure preserves the prior result. | Shared SSE framing + dashboard adapter; split-frame, UTF-8, replay, bounds, abort and malformed-input tests. |
| SD-02 | Given a versioned Markdown template and validated data, when projected, then only declared fields bind, repeated rows use the shared table serializer, zero remains zero and missing values remain Unknown. | Template projection tests, literal markup/sigil payloads, no execution callback. |
| SD-03 | Given a saved dashboard Markdown document, when reopened offline, then the same values and widget layout render through existing cards and Viewer. | Parser round-trip and shared-card browser check. |
| SD-04 | Given a dashboard in Props, when moved, resized, folded or configured, then the selected Markdown document is updated through the existing settings owner; global settings and authored text outside generated blocks survive. | Configuration and persistence conflict checks. |
| SD-06 | Given the native Mission reference, when saved and reopened, then its full observation, manifest, codebase projection, economics, Structure and Signals reuse the same components; source IDs, hierarchy, zero/unknown and reused measurements survive. | Full-evidence round-trip, linked JSON selection and browser comparison. |
| SD-07 | Given Source Files, when Templates is opened, then the pinned shared Markdown appears under `huijoohwee.github.io/template`; saved input JSON and output Markdown appear under `docs/dashboards`. | Registered source root, local input ownership and browser file selection. |
| SD-05 | Given current Mission evidence, when explicitly saved, then a historical Markdown copy appears in Source Files without renewing authority, changing the native manifest or uploading to cloud. | Mission export/save/reopen tests and browser flow. |

## TAD

Flow: framed JSON → bounded snapshot validation → declared template bindings → dashboard Markdown
→ shared Editor/Viewer and Dashboard. Template identity/version, observed time, source identity,
revision and completeness accompany the resolved output. The existing Mission SSE reader and
observation owner remain unchanged; a Mission adapter supplies the same template projection input.

The source selector reuses the native `.workspace` observation reader; a workspace-backed Mission
defaults to that source. Its manifest opens in the existing Editor. Saving retains a separate full JSON checkpoint without changing that native source. Upload is a separate explicit
source choice, with the same bounded JSON/SSE decoder.

The template is authored only in `huijoohwee.github.io/template/`, consumed at an exact commit and
SHA-256 digest, and cached in the existing browser workspace after first online use. A user-edited
cache is never overwritten; local variations use an explicit alternate path. Frontmatter stores the existing
widget configuration shape plus explicit value/table bindings. The v2 Mission template additionally declares `mission_snapshot: mission`. This retains the validated RunTrace, native manifest bytes, matching codebase index and bounded projection, and presentation schema. The shared Mission renderer consumes that historical evidence with network polling and runtime actions disabled. A saved document stores this evidence, resolved data
and the validated configuration; its readable generated block uses ordinary headings and tables.
The settings owner selects either that document or its existing JSON sidecar, never both. An input checkpoint links to its output through `dashboard_output`; the output confirms its input path before selection. File associations survive configuration edits. All three paths appear together, and Source Files exposes the shared template root even before the first save through an explicit Open action. Saves read
the latest source and compare before writing. Rendering and shared drag/resize remain presentation.

MVP limits: 32 snapshot events / 1 MiB per imported stream; 128 widgets; 2,048 table rows; 1 MiB resolved values; 2 MiB output.
Initial events are full snapshots, not patches. No network endpoint discovery, reconnect loop, automatic
cloud transfer or new model invocation. The existing authenticated Source Files Markdown transfer can
sync an explicitly saved document. Native archive portability remains a separate producer capability.

## ADR

- SD-ADR-01: Reuse existing frontmatter/variable/SSE/table parsers and Widget Cards; no second renderer,
  registry, generic template language, accounting store or dependency.
- SD-ADR-02: Persist layout with its Markdown snapshot. Retain the existing global JSON path for ordinary
  dashboards. Refuse invalid metadata instead of applying a partial configuration.
- SD-ADR-03: Explicit export changes private live evidence into a historical document. Record coverage
  and source identity; no saved document reconnects or authorizes actions.
- SD-ADR-04: Keep template authorship, generated blocks and user notes distinct. Escape bound strings
  before Markdown rendering. Fail on stale writes; never replace the template with stream output.

## MVP

The implementer owns SD-01–07 and the evaluator records exact checks. Demo: select Mission or import
JSON/SSE → choose the Mission template → save dashboard Markdown → open it from Source Files → move
and resize a card → reopen and verify values/layout/notes. Shared Props and Editor supply controls.
Budget: 60–90 active minutes initially; 20–30 additional minutes for shared template ownership, 24 changed files across three repositories / 120 KB source, zero new dependencies or
model calls. The full-reference and three-file refinement adds approximately 35–50 active minutes and 20 Graph files, with no new dependencies. Refresh estimates on drift. Target first local value is one save/reopen within a minute
after a complete observation is available; measured UX time and deployment remain unverified.
Rollback reverts this source change while retaining saved documents and native run archives.

## GTM

Start with a solo operator sharing a reproducible run report. Reuse local/free document authoring and
existing authenticated sync; no new hosted service. Measure successful reopens, time to first report,
manual formatting avoided and support minutes. Willingness to pay, revenue and savings are unvalidated.
Local behavior tests do not establish public availability or cloud deployment readiness.

## Validation record

SD-01/02: `agentReady.missionControl.projection.dashboardMarkdown` passed split UTF-8/SSE framing, replay,
ordering, input bounds, abort, malformed templates, zero/unknown values and literal-data checks.
SD-03/04: `agentReady.missionControl.projection.dashboardMarkdownPersistence` passed workspace save/reopen,
shared widget commands, layout/aspect/fold persistence, notes preservation, unchanged global settings
and a concurrent-write conflict. The existing `pipeline.2dRenderer.dashboardWidgets.sourceCrud`
regression passed, including shared WYSIWYG controls. Both new cases use the existing Mission CI filter.
SD-05: local browser testing at port 4188 saved the current Mission, reopened its four cards, edited a
title and portrait aspect through shared Props, then reloaded the page with both changes retained.
A direct `.workspace` save also passed after adding the explicit workspace source selector.
This is local browser evidence, not protected candidate, offline-network or cloud-transfer proof.

Agentic OS `npm run check` and Graph `npm run check` passed. Fleet ownership passed across eight
repositories with no findings. The upstream contract is OS `da0f7ce70ab5a4390009e6e8c179130d6f5bfa23`;
the template ownership guide is OS `32b1ccbba6fb1dfa8c4978d1664a694a8113edea` (PR #212);
the guideline baseline is OS `5a91c7356b3d0372675d4126fee623cf081d1177`. No OS runtime pin change is
required for this contract-only addition. The existing Mission browser integration check passed at local `abdfe59e`; subsequent projection
bounds and CI-selection changes require their own focused checks. Graph's successor publication remains blocked by its
pre-existing merge history (`blocked-successor-merge`); preserve the local implementation and original
published ref until that owning lifecycle issue is resolved. Deployment and continuous reconnect are
not delivered. Exact commit-bound integration results belong to the native check/review receipts.

Template ownership update: the operator explicitly selected `huijoohwee.github.io/template/`.
The template is website commit `3bc612b4e421484a6bf99883a0368073e369f5e4` (PR #234).
Graph removes its authored seed copy; Agentic OS defines the ownership boundary in its on-demand guide.
The cached template retains URL provenance and passes a digest check before use. Tests cover first
fetch, offline cache reuse, changed bytes, size bounds and preservation of edited local copies.
Browser saving through the pinned public GitHub source succeeded. OS PR #212 and website PR #234
passed their required CI; the source guide and template remain review candidates. Saved dashboards
remain self-contained and do not need a template download to reopen.

## Full-reference template and file ownership (2.0.0)

The authored template is website commit `722e2858b9db27011538f1bb863dc16c1079d2e4` (PR #235),
SHA-256 `7a0f3eeb0f6a5849acc07d06010f84046aba07985e390a123aa0a7084cbe5bca`.
Known unedited v1 cache bytes can upgrade; authored variations remain untouched. The template is
a cached source from its website owner, not an upload target in the workspace document repository.
Input JSON and output Markdown are explicitly owned local files under `/docs/dashboards/`.
A saved report reopens without fetching its template or native archive. Complete retained evidence
means everything in the captured reference, including its recorded partial coverage; it does not
claim observations beyond that reference. Old four-card reports remain valid and are not rewritten.

Current local evidence: focused projection, persistence and Source Files ownership tests pass (3/3); `npm run check` passes. Browser validation saved `/docs/dashboards/dashboard-1789786616449-01b8aed9.input.json` and its sibling `.md`, opened the shared template through Source Files, and confirmed the saved 159-span tree, 8,121 sources, economics, Structure and Signals. Input and output selection both retain the historical Mission. Website PR #235 passes both required checks; fleet ownership reports eight repositories and no findings. The broader Mission archive and projection checks pass; its browser runner requires a clean committed source and is recorded separately in the handoff receipt.
