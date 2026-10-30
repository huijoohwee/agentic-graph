---
title: "agentic-graph Local POI Directory — PRD-TAD-ADR-MVP-GTM"
id: "md:agentic-graph-local-poi-directory-prd-tad"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.0.8"
date: "2026-10-30"
lang: "en-US"
owner: "docs.geospatial.local-poi-directory"
status: "active"
universal_scope: false
frontmatter_contract: "required"
continuity_id: "AGENTIC-GRAPH-LOCAL-POI-DIRECTORY-001"
parent_plan: "docs/documents/agentic-graph-mapping-stack-prd-tad-adr-mvp-gtm.md@1.0.3"
scope: "Prepare and browse an explicitly approved, bounded local GeoJSON POI directory through the existing geospatial map and selection owners"
deploy_boundary: "Production application-code activation through the existing protected core release; keep POI inputs and outputs local and create no hosted POI service"
worktree_id: "device-0232231d4a19--geostack-scratch-disposition"
agent_id: "codex-geostack-scratch-disposition"
action: "/change"
lane_scope: "#geostack-scratch-disposition"
actor: "@huijoohwee"
base_sha: "300815a55d79cdd07dfa4ba2d2a887e810cfa6de"
prd_revision: "1.0.8"
tad_revision: "1.0.1"
adr_revision: "1.0.2"
mvp_revision: "1.0.1"
gtm_revision: "1.0.0"
local_rung: "dev-proven"
delivered_rung: "production-verified"
lane: "authoring"
---
# Local POI Directory

This child plan narrows the [Mapping Stack plan](agentic-graph-mapping-stack-prd-tad-adr-mvp-gtm.md) to local preparation and browsing of points of interest. The parent owns mapping composition and broad spatial capabilities. The [Geospatial Mode document](agentic-graph-geospatial-mode-document.md) owns the runtime map, dataset, and selection contract. This plan adds no replacement map, spatial engine, or source-of-truth for those contracts.

The separately named `agentic-graph-geostack-scratch` checkout was unaccepted discovery evidence and was not used as the source for an admitted merge. Its preserved AOS quarantine projection at coordinate `0f86b539dc79fd8423469388ddb0ab4a9805107233486a13b7c8d8ecb709caad` records operation digest `b928fce98d6d01bf645257966d2929d6f58a6c4f6fab69ca52ab37689b7ee77b` and retained branch `agent/device-0232231d4a19/geostack-poi-directory-mvp-ci-repair` at `77fc84f0721d3594ef6a7d2fc4e88c0e48adecad`. Its projection manifest digest is `18fd7905c26085f28621bd615c924a83ab178782120700ec318c02477ace87b9` (12,084 entries; 546,001,993 bytes); the registration manifest digest is `13096e8748bf541bb333ad6d651cc7f818757828ebc0f7fa3b3c6d5f93e85591` (19 entries; 1,114,894 bytes).

A byte-for-byte comparison with retained head `77fc84f0721d3594ef6a7d2fc4e88c0e48adecad` found all 8,942 tracked entries identical. This comparison proves the projection matches its retained Git tree. Current native AOS completion status at protected `main` `300815a55d79cdd07dfa4ba2d2a887e810cfa6de` (AOS source `d1d8daf9407f747432ed39b65313f33105dcd170`) for the exact retained lane `agent/device-0232231d4a19/geostack-poi-directory-mvp-ci-repair` reports `sourceIntegrated:true` by `exact-tree-projection` across 71 paths, `cleanupVerified:true`, `retentionState: quarantined`, `deliveryState: deployed`, `adlcState: complete`, and no findings. The checkout is unmounted; the AOS quarantine keeps its projection and registration. AOS still reports `dirtyState: unobserved`, `sourceSuperseded:false`, and `preservationSatisfied:false`; completion does not prove the original checkout was clean or authorize discarding recovered bytes. The projection contains 2,538 extra regular files, all ignored by the snapshot's `.gitignore` files and confined to `canvas/dist`, `canvas/node_modules`, `grph-shared/dist`, `gympgrph/dist`, `data/outputs`, `canvas/public`, and `canvas/tsconfig.tsbuildinfo`, plus four dependency symlinks. These inventory classifications do not establish authorship or disposition of the ignored files or symlink targets. The original checkout path is absent, while the quarantined projection and registration remain. This proves checkout quarantine, not storage reclamation or Git-ref retirement. The separately named `agent/device-0232231d4a19/geostack-poi-directory-mvp` lane is distinct and remains continuable; do not conflate its open closeout with this quarantined lane. The accepted implementation was developed in the admitted `agent/device-0232231d4a19/local-poi-directory-budget` lane and integrated into `main` through [PR #1843](https://github.com/huijoohwee/agentic-graph/pull/1843), merge commit `dd842651c4f1888d2d4b161b389635b6be3162a1`. [PR #1844](https://github.com/huijoohwee/agentic-graph/pull/1844), merge commit `768e794bcb7f61dfaeb7169a598cab82c9e67dce`, added a synthetic-preview provenance regression guard.

## Identity and directive

`AGENTIC-GRAPH-LOCAL-POI-DIRECTORY-001` joins PRD revision `1.0.8`, ADR revision `1.0.2`, TAD revision `1.0.1`, MVP revision `1.0.1`, and GTM revision `1.0.0`, as a child of `PLAN-AGENTIC-GRAPH-MAPPING-STACK-PRD-TAD-ADR-MVP-GTM@1.0.3`.

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
| AC-POI-09 | Given the existing core release uses the D1-backed Free R2 quota ledger, when its storage Worker candidate is activated, then the exact core migration set includes and applies `0022_agentic_graph_r2_free_quota.sql` first, and readiness proves every required ledger column. If the ledger is unavailable, activation stops; no new or paid resource is introduced. | Keep the migration additive and forward-compatible; assert it is selected rather than deferred, and retain the existing readiness checks for missing and complete ledger schemas. | TAD-03 / ADR-08 |

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

Keep the directory panel and validator lazy-loaded behind the existing map entry point. The POI MVP adds no dependency, paid API, remote service, POI-owned persistent schema, or new always-loaded prompt text. Import and validation work offline. Basemap and tile availability follow the existing map-provider contract; this feature does not promise cached or fully offline basemaps. The existing core storage release has a separate D1-backed Free R2 quota ledger contract; its existing additive migration must be selected before activating a Worker version whose readiness requires that ledger.

### Runtime and failure behavior

Keep parsing bounded to a 500,000-byte input and output, show a visible error on unsupported container structure or failed hashing, and bound visible results to 50. Never silently truncate accepted input or labels. Invalid individual features may be withheld only when the UI reports their count; invalid collection structure blocks the import. Local data remains in memory until the user chooses an export or the existing workspace explicitly saves it.

No remote reads are required for import, validation, preview, or export. Existing map-style/tile requests are separate runtime behavior and must not carry the source dataset to a provider. A request failure in map rendering must leave the original file and normalized local output available.

### Core release readiness

The deployed core storage Worker uses the existing D1-backed quota ledger when no provider cost verifier is bound. Its readiness path checks the ledger table and required columns. The core release migration allowlist must therefore include `cloudflare/d1/migrations/0022_agentic_graph_r2_free_quota.sql` and apply it before Worker activation. This is a storage-runtime prerequisite, not a server-side POI dataset. The schema is additive and remains in place if Worker activation rolls back; missing or incomplete schema blocks activation and leaves POI delivery pending.

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

### ADR-08 — Include the Free R2 quota ledger prerequisite

The core Worker wraps the existing R2 binding with the shared Free quota gate. In the production core configuration, D1 supplies the quota verifier; `storageCoreReadiness` requires the quota ledger table and its complete column set before it reports the core runtime ready. Select the existing additive `0022_agentic_graph_r2_free_quota.sql` migration in the core release profile and apply it before activating a Worker that depends on it. Retain the table on Worker rollback; do not add a resource, paid feature, or POI data upload. A missing ledger or failed runtime readiness is a rolled-back, not delivered, outcome.

## MVP and verification

This closeout is one existing planning file, under 20 active minutes, below 600 lines and below 500 KiB. The local POI workflow is integrated through PR #1843 (implementation), PR #1844 (synthetic-preview provenance), and PR #1852 (complete local GeoJSON workflows), with no new paid resource or POI service. PR #1855 updated the core migration selection; the production preflight for run #41021713269 selected `0022_agentic_graph_r2_free_quota.sql`, found it already applied, and reported no pending migrations. No further migration-code change is required for this release.

Map each acceptance row to a focused synthetic fixture: collection and byte limits (AC-POI-01); missing metadata and declined attestations (AC-POI-02); precision, geometry, and coordinate boundaries (AC-POI-03); allowlist, stable IDs, date and privacy rejection (AC-POI-04); deterministic manifest digests, bounds, and counts (AC-POI-05); synchronized selection and 50-result cap (AC-POI-06); synthetic-only labeling (AC-POI-07); and no-network, explicit export, and no-overwrite behavior (AC-POI-08). Use a network guard to prove import/validation/export do not fetch or upload data. These checks prove only local source behavior; protected integration and any deployment or runtime result need their own exact evidence.

The protected source now includes PR #1843 (`dd842651c4f1888d2d4b161b389635b6be3162a1`), PR #1844 (`768e794bcb7f61dfaeb7169a598cab82c9e67dce`), the complete local workflows in PR #1852 (`513883f62a7b69669642fb77a1a3321e466c3424`), and subsequent release and delivery records through protected `main` `300815a55d79cdd07dfa4ba2d2a887e810cfa6de`. PR #1852's focused POI/geospatial suites passed 7/7, browser runtime smoke passed 3/3, and its required `docs-contract` and `Integration Gate` checks passed; its recorded Canvas build and `gympgrph` build also passed. PR #1855 and PR #1858 are included in the same protected source. These records support `local_rung: dev-proven`. Production release, runtime readback and mirror publication are proven by run #41021713269 below. The user-device acceptance receipt below closes the remaining delivery condition for the deployed local GeoJSON POI workflow. `delivered_rung: production-verified` is scoped to that workflow and evidence; it does not claim a multi-device certification or validate third-party dataset rights.

### User-device acceptance (2026-10-30)

The deployed workflow at [airvio.co/agentic-graph](https://airvio.co/agentic-graph/) accepted `/tmp/local-poi-acceptance-synthetic.geojson` (772 bytes; SHA-256 `f0519ff14d693187df8eeed77191805039258c3b70a51cf24b911a019561dd3e`). The review used source `Synthetic local acceptance fixture`, license `generated-demo-data`, and attribution `Synthetic demonstration data; no real businesses or sites.`; rights, public-fields, exact-point, and coarse-region attestations were recorded. The UI reported 1 point, 1 region, category `shop: 1`, and 0 withheld. The selected directory row was pressed and announced `Selected on the shared map`; the matching accessible map-feature control was also pressed, and activating it kept the same row selected. This confirms both surfaces exposed the same selected feature in this session; an independent map-originated transition from a cleared selection was not established. Explicit export produced a 1,136-byte GeoJSON (SHA-256 `7e5e3891a77fe2090095f1de1e5568170b5e73f0e1d4186e736ec7266e31739b`) and a 737-byte manifest (SHA-256 `0747f847fcc46d25cfbbcc0e31717b11d6719f731ce64cadcd7373fa61f7345a`) binding the input/output digests, counts, and attestations. Active browser acceptance took about 2 minutes. The receipt covers this synthetic local workflow in one browser session; it does not validate third-party rights or establish a broader device matrix. The session logged 31 console errors and 17 warnings, primarily unrelated canonical-document/GitHub 401/403 reads and one basemap-font 404; POI import, selection, and export completed despite those unrelated page requests.

## GTM

Rank the initial pain hypothesis as: (1) reviewing and browsing an already permitted local places file with attribution and precision safeguards; (2) repeating that workflow across a small set of files; (3) acquiring or continuously updating datasets. The near-built solution reuses existing GeoJSON and map selection support and adds a small local validator. Pilot at $0 with synthetic and user-provided data; measure task completion, time, withheld-feature comprehension, and repeat use. The first-dollar value is unvalidated; do not add pricing, accounts, or paid data acquisition until a buyer and payment test establish demand.

## Release, deployment, and rollback boundary

The selected delivery boundary is the existing protected core release: exact protected `main` source to Cloudflare Pages project `joohwee` at `https://airvio.co`, the existing `agentic-storage` Worker core profile, and the workflow's canonical-document D1 reconciliation and verified mirror publication. The release profile is `existing-free-resources-only`; no paid plan, overage, Access subscription, new resource, or POI data upload is authorized by this plan. The full runtime's travel and MCP providers remain separate owners.

Before activation, the release must bind a fresh local review, immutable artifact, current rollback identity, and exact human authorization. The current rollback identity records the exact Pages deployment and D1/mirror state; the core Worker preflight records its exact active version, bindings, secret-name inventory, routing, and migration state. On failure, the protected controller restores the prior Pages deployment and core Worker version/routing, restores the canonical-document D1 state within the documented migration contract, and verifies baseline liveness. Forward-compatible core migrations or owner enrollment are retained; this is not a general rollback of arbitrary D1, R2, external providers, or unrelated Workers. If a failure occurs after mirror publication, manual mirror reconciliation may be required.

An earlier protected attempt, [run #40995990581](https://github.com/huijoohwee/agentic-graph/actions/runs/40995990581), was authorized for candidate `39a96872e717e6dbfb9d55754a89bdc247a0628291a819b9ec9a7f58791e68eb` from source `73233cd96b6c678c64094bd1970c8c091c2d4302`. Candidate Pages deployment and the exact Base route check passed; candidate Worker version `2b2afe15-b024-4b52-a60b-ef17a14fb0b4` then returned 503 on `/api/storage/readyz/core`. The release receipt records `rolled-back`, a proved restoration to prior Worker version `189e03d3-c738-43fd-b17b-501efda945d7`, the existing route retained, no D1 migration applied, and no compensation failure. Pages was restored to deployment `d39a76e1-7e9a-4f88-add5-6990cc7ab32f`; the D1 state readback digest matched the captured baseline, and mirror publication was skipped. The core migration receipt lists `0022_agentic_graph_r2_free_quota.sql` as deferred, while the exact candidate readiness code requires its D1 ledger columns when the Free quota ledger is selected. The retained failure receipt stores only the response body digest, not the raw reason; the missing migration is therefore a source-backed diagnosis that the next lane must confirm with a focused regression check.

That earlier rollback run also reported six of 59 smoke checks failing against the restored Pages baseline: MCP source-file resource read, list, search, content-aware search, fetch, and read. Each returned HTTP 200 JSON while its semantic check failed. The later release run #41021713269 passed its exact candidate verification and live verification gates; use its retained live-verification receipt for the current runtime claim. The older failure receipt remains historical evidence. This MVP adds no POI data migration or hosted POI state.

Later, [run #41021713269](https://github.com/huijoohwee/agentic-graph/actions/runs/41021713269) completed successfully for protected source `f3c7816b2788d006dbf076009560eba18c2aa609` and approved candidate `2729de17d1e80b6d2c2676e0a86f3368bdbd97f0f6f2e7c67e896f1b9e82c317`. It reused protected CI source evidence, deployed Pages `d4bf1bde-c77b-4495-8085-0874d43450ca`, activated the existing `agentic-storage` Worker, confirmed migration 0022 was already applied, reconciled D1 with content/path parity, passed live verification, public smoke (65/65) and stable Pages smoke (59/59), and published the mirror. Receipts: deployment `85db7c1c138d3efdbfb1c30087e874147e598724e8da7ecbd161e17078955612`; D1 reconciliation `cb2e152f8572a525c2b0ca8990b56f8d19ee7aefd8ab90658df0657af98a6469`; live verification `28e88a4d6efec6f4948e777f386a6b30f4b865fc32f7310939cf42681bf7e838`; publication `e2eba14895b83945e3d2bcd4a410b21442ab452ce350ef69a13d6b5607111b8f`. The post-success rollback baseline is Pages `d4bf1bde-c77b-4495-8085-0874d43450ca`, mirror `7ac091ffbab60eece371a2d09cfb53d29c208244`, and D1 contract `8b7ec9f3a37727785a7b9b9e42a196d4bf27a77b918fc2a7f5add490374b585c` with readback `a669fb19a6bfac145906c8a49cdd9fce0473c27960b924a08de9118d3da3ccb1`.

## Source bindings and handover

- Parent scope and broad mapping decisions: [Mapping Stack PRD/TAD/ADR/MVP/GTM 1.0.3](agentic-graph-mapping-stack-prd-tad-adr-mvp-gtm.md).
- Runtime map, dataset and POI selection owner: [Geospatial Mode](agentic-graph-geospatial-mode-document.md).
- Integrated implementation: `canvas/src/features/maps/LocalPoiDirectory.tsx`, `canvas/src/features/geospatial/localPoiDirectoryModel.ts`, and `scripts/geostack-local-geojson-build.mjs` at merge commit `dd842651c4f1888d2d4b161b389635b6be3162a1`; synthetic-only preview guard at `768e794bcb7f61dfaeb7169a598cab82c9e67dce`.
- For the exact quarantined `geostack-poi-directory-mvp-ci-repair` lane, current AOS reports source integrated by the 71-path exact-tree projection, delivery deployed by run #41021713269, cleanup verified, and ADLC complete. The original checkout path is absent; the 12,084-entry projection and 19-entry registration remain in the quarantine. Its old dirty state is unobserved; 2,538 ignored files and four symlinks remain preserved without an authorship or discard disposition. The similarly named `geostack-poi-directory-mvp` lane is separate and still continuable.

Next action: retain the quarantine projection, registration, and refs. The exact `geostack-poi-directory-mvp-ci-repair` lane has AOS closeout complete; this does not authorize deleting recovered bytes or retiring refs. Resolve the separate `geostack-poi-directory-mvp` lane under its own current evidence before any cleanup or retirement effect.
