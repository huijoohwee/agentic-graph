---
title: "agentic-graph Local POI Directory — PRD-TAD-ADR-MVP-GTM"
id: "md:agentic-graph-local-poi-directory-prd-tad"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.2"
date: "2026-10-29"
lang: "en-US"
owner: "docs.geospatial.local-poi-directory"
status: "active"
universal_scope: false
frontmatter_contract: "required"
continuity_id: "AGENTIC-GRAPH-LOCAL-POI-DIRECTORY-001"
parent_plan: "docs/documents/agentic-graph-mapping-stack-prd-tad-adr-mvp-gtm.md@1.0.3"
scope: "Prepare and browse an explicitly approved, bounded local GeoJSON POI directory through the existing geospatial map and selection owners"
deploy_boundary: "Production application-code activation through the existing protected core release; POI datasets remain local and are never uploaded"
worktree_id: "device-0232231d4a19--local-poi-directory-plan"
agent_id: "codex-local-poi-directory-plan"
prd_revision: "1.0.2"
tad_revision: "1.0.0"
adr_revision: "1.0.1"
mvp_revision: "1.0.0"
gtm_revision: "1.0.0"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
---
# Local POI Directory

This child plan narrows the [Mapping Stack plan](agentic-graph-mapping-stack-prd-tad-adr-mvp-gtm.md) to local preparation and browsing of points of interest. The parent owns mapping composition and broad spatial capabilities. The [Geospatial Mode document](agentic-graph-geospatial-mode-document.md) owns the runtime map, dataset, and selection contract. This plan adds no replacement map, spatial engine, or source-of-truth for those contracts.

The separate `agentic-graph-geostack-scratch` checkout remains unaccepted discovery evidence; its dirty contents are preserved. The accepted implementation was developed in the admitted `agent/device-0232231d4a19/local-poi-directory-budget` lane and integrated into `main` through [PR #1843](https://github.com/huijoohwee/agentic-graph/pull/1843), merge commit `dd842651c4f1888d2d4b161b389635b6be3162a1`. [PR #1844](https://github.com/huijoohwee/agentic-graph/pull/1844), merge commit `768e794bcb7f61dfaeb7169a598cab82c9e67dce`, added a synthetic-preview provenance regression guard.

## Identity and directive

`AGENTIC-GRAPH-LOCAL-POI-DIRECTORY-001` joins PRD revision `1.0.2`, ADR revision `1.0.1`, and TAD, MVP, and GTM revision `1.0.0`, as a child of `PLAN-AGENTIC-GRAPH-MAPPING-STACK-PRD-TAD-ADR-MVP-GTM@1.0.3`.

**DIR-POI-01** — Context: operators need to inspect small, authorized place datasets without sending source files to a service. Intent: make local POI curation and map browsing usable on a device with minimal setup. Directive: reuse the existing GeoJSON and map selection path, expose bounded validation and explicit approval, and keep data export user-controlled. Role/Subject: local dataset curator. Action: validate, review, and browse an approved POI collection. Outcome: a small, attributable directory that can be inspected locally and exported deliberately. Verb/Object: prepare / an approved local POI directory.

## PRD

### Problem, users, and minimum outcome

A researcher, analyst, or small local operator may already have a permitted GeoJSON file but needs a quick way to reject malformed or over-detailed entries, see the remaining places on the existing map, and retain source attribution. The workflow should avoid an account, remote geocoder, upload service, or paid data provider. This is a buyer-pain hypothesis; demand, time saved, and willingness to pay have not been measured.

The curator supplies the file and its source, license, attribution, and approval choices. The analyst browses and filters the accepted places. A reviewer checks the generated provenance summary and confirms that the approved precision matches the intended use. The minimum outcome is a locally validated directory, an understandable count of accepted and withheld features, map/list selection through existing behavior, and an explicit user action to export the normalized data and its manifest.

### Requirements and acceptance

| ID | Given / when / then; constraint | Design and owner check | TAD / ADR |
|---|---|---|---|
| AC-POI-01 | Given a selected file, when the user imports it, then the local parser accepts only a GeoJSON `FeatureCollection` within the 500,000-byte input cap; invalid JSON, unsupported top-level structure, unavailable hashing, or size overflow returns a visible error and creates no output. | One normalization owner; synthetic fixtures at the byte boundary; no network access. | TAD-01 / ADR-01 |
| AC-POI-02 | Given source metadata, when the user reviews the import, then source, license, and attribution are required, rights and public-field review are explicit, and missing approval blocks acceptance. These are operator attestations, not legal verification. | Form and validator share required fields; verify missing-field and declined-attestation cases. | TAD-01 / ADR-02 |
| AC-POI-03 | Given a feature, when geometry and precision are checked, then a point is included only when exact-point approval is explicit; a coarse region polygon is included only when region approval is explicit; unauthorized or unsupported geometry is counted as withheld. Coarse points are withheld; the app does not guess a generalization rule. | Allowlisted geometry and precision rules; synthetic points, polygons, invalid coordinates, and withheld-count checks. | TAD-01 / ADR-03 |
| AC-POI-04 | Given an approved feature, when normalized, then only documented public directory fields are emitted; personal names, contact details, arbitrary source properties, invalid dates, duplicate or missing stable IDs, and out-of-range coordinates are rejected or withheld according to the field contract. | A single field allowlist and stable-ID policy serve UI and any local builder; test redaction, duplicate IDs, and malformed values. | TAD-01 / ADR-04 |
| AC-POI-05 | Given normalized output, when its manifest is created, then it binds input/output byte counts and SHA-256 digests, source metadata, as-of date, approval flags, category counts, and accepted/withheld counts. Generated output is bounded to 500,000 bytes and fails visibly if it exceeds that cap. | Manifest is local, deterministic for identical inputs, and does not claim third-party verification; check digest and count consistency. | TAD-01 / ADR-02 |
| AC-POI-06 | Given accepted features, when the user searches or selects a place, then the existing geospatial map and selection owner show the same selected feature, category filtering works, and at most 50 results are displayed at once. | Reuse Geospatial Mode and shared selection contracts; check list-to-map and map-to-list selection plus the result cap. | TAD-02 / ADR-05 |
| AC-POI-07 | Given no user dataset, when the directory opens, then any built-in preview is unmistakably synthetic and is never represented as a real business, recommendation, or licensed public dataset. | Existing synthetic fixture only; assert provenance label and exclude network-backed demo data. | TAD-02 / ADR-06 |
| AC-POI-08 | Given a validated directory, when the user exports it, then only an explicit download or local build action writes the normalized file and manifest; import and preview never publish, upload, deploy, or overwrite an existing output. | File API/local filesystem boundary and no-overwrite behavior; run the source-owned local checks. | TAD-02 / ADR-01 |

### Priority and open questions

**Must:** bounded local import, explicit provenance and approval, precision gates, allowlisted output, visible withheld counts, existing map selection, and deliberate export. **Should:** category search and a synthetic preview. **Could:** configurable schemas or a larger local builder after measured demand. **Won't in the MVP:** online discovery, scraping, geocoding, automatic distribution, server storage, or legal conclusions about a dataset's license.

The first validation question is whether a target user can take one permitted file to an attributed map view without help. Test with synthetic data first, then user-supplied data only with the user's rights and precision approvals. Record task completion and time; do not infer a paying market from successful implementation.

## TAD

### Components and data flow

1. A local file selection reads bytes in the browser or an explicitly invoked local command. No file content or metadata is sent to a remote service.
2. One validator checks size, structure, metadata, rights/public-field attestations, geometry, stable identity, dates, categories, and precision. UI and any local builder must call the same validation owner rather than carry divergent policy.
3. A normalizer emits only the documented field allowlist and an adjacent manifest. Unsupported or unapproved records are withheld with counts; the source file is not silently rewritten.
4. The directory projects accepted features into the current Geospatial Mode dataset path. Map rendering and selection remain owned by that runtime contract; the directory does not create a competing map or graph database.
5. Export occurs only after user action. Existing output paths are never overwritten without an explicit, separately designed confirmation flow.

Keep the directory panel and validator lazy-loaded behind the existing map entry point. The MVP adds no dependency, paid API, remote service, persistent schema, or new always-loaded prompt text. Import and validation work offline. Basemap and tile availability follow the existing map-provider contract; this feature does not promise cached or fully offline basemaps.

### Runtime and failure behavior

Keep parsing bounded to a 500,000-byte input and output, show a visible error on unsupported container structure or failed hashing, and bound visible results to 50. Never silently truncate accepted input or labels. Invalid individual features may be withheld only when the UI reports their count; invalid collection structure blocks the import. Local data remains in memory until the user chooses an export or the existing workspace explicitly saves it.

No remote reads are required for import, validation, preview, or export. Existing map-style/tile requests are separate runtime behavior and must not carry the source dataset to a provider. A request failure in map rendering must leave the original file and normalized local output available.

## ADR

### ADR-01 — Local processing and explicit export

Choose browser/device-local processing and user-directed export. Reuse the existing GeoJSON dataset and map route. Do not add a hosted directory or upload endpoint. This keeps private source data on-device and supports offline preparation while leaving basemap connectivity to its current owner.

### ADR-02 — Attestations and manifest, not inferred authority

Require the operator to enter source, license, and attribution and affirm rights and public-field review. Record those choices with hashes and counts. The manifest proves what this local tool processed; it does not independently establish rights, license validity, data accuracy, or publisher identity.

### ADR-03 — Fail closed on precision

An exact point requires an explicit approval. A coarse region polygon requires separate approval. A point marked coarse is withheld until a separately reviewed generalization policy exists. Never infer permission from a dataset's public availability or convert a sensitive point to a region automatically.

### ADR-04 — Allowlist normalized fields

Emit only stable ID, public label/name, supported category, region, source reference, update date, license reference, precision, and directory role. Reject or withhold arbitrary properties and any personal name or contact field. Keep the same validator and allowlist as the only policy owner for the UI and any command-line entry point.

### ADR-05 — Reuse geospatial and selection owners

Render through the current GeoJSON overlay and route feature selection through the shared map selection contract. Keep list search and category filters bounded; do not introduce a second map, store, geocoder, or spatial query engine.

### ADR-06 — Synthetic preview only

Use the existing clearly labeled synthetic fixture for empty-state demonstration. Historical map/place seed content is not a current source of production data, verified licensing, or real place recommendations.

### ADR-07 — Activate client code through the existing core release

The product owner selected production activation of the integrated client feature. Deliver the exact protected `main` candidate through `.github/workflows/release.yml` using `config/production-release-profile.json`'s `core` profile and `existing-free-resources-only` cost policy. The target is the existing Cloudflare Pages project `joohwee` at `https://airvio.co` plus the existing `agentic-storage` Worker under its core contract. Do not create resources, enable paid plans or overages, enable Cloudflare Access, add a hosted POI service, or send local POI inputs or outputs to a server. Candidate authorization and all release checks remain bound to the exact source, immutable build, runtime evidence, and rollback identity.

## MVP and verification

The planning lane is one file, no code modules, at most 20 active minutes, below 600 lines, and below 500 KiB. The implementation was delivered in the admitted `local-poi-directory-budget` lane with no new dependency or paid resource. Keep future changes within the existing panel/overlay owners and validator; new work needs its own mission and budget.

Map each acceptance row to a focused synthetic fixture: collection and byte limits (AC-POI-01); missing metadata and declined attestations (AC-POI-02); precision, geometry, and coordinate boundaries (AC-POI-03); allowlist, stable IDs, date and privacy rejection (AC-POI-04); deterministic manifest digests, bounds, and counts (AC-POI-05); synchronized selection and 50-result cap (AC-POI-06); synthetic-only labeling (AC-POI-07); and no-network, explicit export, and no-overwrite behavior (AC-POI-08). Use a network guard to prove import/validation/export do not fetch or upload data. These checks prove only local source behavior; protected integration and any deployment or runtime result need their own exact evidence.

The source implementation is **integrated** at `dd842651c4f1888d2d4b161b389635b6be3162a1`; the current protected `main` also includes the provenance guard at `768e794bcb7f61dfaeb7169a598cab82c9e67dce`. PR #1843's required `docs-contract` and `Integration Gate` checks passed. The exact PR #1843 candidate also passed the focused local POI unit suite (4/4), Canvas checks/build, and geospatial-mode checks; the exact PR #1844 candidate passed the focused POI suite (4/4), and its required `docs-contract` and `Integration Gate` checks passed. These records support `local_rung: dev-proven` for local source behavior and protected integration only. No production deployment, production runtime readback, or physical-device acceptance is recorded; `delivered_rung` remains `undocumented`.

## GTM

Rank the initial pain hypothesis as: (1) reviewing and browsing an already permitted local places file with attribution and precision safeguards; (2) repeating that workflow across a small set of files; (3) acquiring or continuously updating datasets. The near-built solution reuses existing GeoJSON and map selection support and adds a small local validator. Pilot at $0 with synthetic and user-provided data; measure task completion, time, withheld-feature comprehension, and repeat use. The first-dollar value is unvalidated; do not add pricing, accounts, or paid data acquisition until a buyer and payment test establish demand.

## Release, deployment, and rollback boundary

The selected delivery boundary is the existing protected core release: exact protected `main` source to Cloudflare Pages project `joohwee` at `https://airvio.co`, the existing `agentic-storage` Worker core profile, and the workflow's canonical-document D1 reconciliation and verified mirror publication. The release profile is `existing-free-resources-only`; no paid plan, overage, Access subscription, new resource, or POI data upload is authorized by this plan. The full runtime's travel and MCP providers remain separate owners.

Before activation, the release must bind a fresh local review, immutable artifact, current rollback identity, and exact human authorization. The current rollback identity records the exact Pages deployment and D1/mirror state; the core Worker preflight records its exact active version, bindings, secret-name inventory, routing, and migration state. On failure, the protected controller restores the prior Pages deployment and core Worker version/routing, restores the canonical-document D1 state within the documented migration contract, and verifies baseline liveness. Forward-compatible core migrations or owner enrollment are retained; this is not a general rollback of arbitrary D1, R2, external providers, or unrelated Workers. If a failure occurs after mirror publication, manual mirror reconciliation may be required.

The integrated source remains `local_rung: dev-proven`; `delivered_rung` stays `undocumented` until the exact candidate passes the protected release, live route/browser checks, rollback receipt validation, and publication receipts. The latest protected attempt, [run #40272873807](https://github.com/huijoohwee/agentic-graph/actions/runs/40272873807), failed six MCP source-file checks. It restored the prior Pages deployment and D1 state, but post-rollback immutable, stable, and public runtime checks also failed, so the terminal rollback was not green. A fresh candidate must pass that full gate before activation. This MVP adds no server POI data to migrate and no hosted POI state to delete.

## Source bindings and handover

- Parent scope and broad mapping decisions: [Mapping Stack PRD/TAD/ADR/MVP/GTM 1.0.3](agentic-graph-mapping-stack-prd-tad-adr-mvp-gtm.md).
- Runtime map, dataset and POI selection owner: [Geospatial Mode](agentic-graph-geospatial-mode-document.md).
- Integrated implementation: `canvas/src/features/maps/LocalPoiDirectory.tsx`, `canvas/src/features/geospatial/localPoiDirectoryModel.ts`, and `scripts/geostack-local-geojson-build.mjs` at merge commit `dd842651c4f1888d2d4b161b389635b6be3162a1`; synthetic-only preview guard at `768e794bcb7f61dfaeb7169a598cab82c9e67dce`.
- Production deployment, runtime/device verification, rollback, and worktree cleanup remain separate actions with exact authority and receipts. Preserve the dirty scratch checkout until its bytes receive an explicit disposition and native cleanup receipts.

Next action: pass the current protected production smoke gate, generate the exact candidate and rollback evidence from the fresh baseline, then obtain its candidate-bound human authorization. Keep the scratch checkout mounted and preserved while AOS reports dirty bytes and cleanup receipts are absent.
