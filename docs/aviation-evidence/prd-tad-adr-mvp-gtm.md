---
title: "Aviation Evidence Layer — local file MVP"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.4.2"
revision: "0.4.2"
date: "2026-10-04"
lang: "en-US"
continuity_id: "aviation-evidence-layer"
prd_revision: "0.4.2"
tad_revision: "0.4.2"
adr_revision: "0.4.2"
mvp_revision: "0.4.2"
gtm_revision: "0.4.2"
owner: "Aviation Evidence product function"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "agent/device-0232231d4a19/aviation-evidence-consolidation"
agent_id: "codex-root"
load_policy: "on-demand"
guideline_revision: "3.4.0"
---

# Aviation Evidence Layer

The joined package **aviation-evidence-layer@0.4.2** owns this increment and five bounded projections: [validation](validation-runbook.md), [rights/recovery](rights-recovery.md), [discovery/pilot](discovery-pilot.md), [financial model](financial-model.md), and [venture projections](venture-projections.md). They share one product authority.

Historical [PR9](https://github.com/huijoohwee/81rv10/pull/9) supplies immutable 0.3.3 lineage, not current-host proof; exact source/tree/CI and limits are in the [runbook](validation-runbook.md#immutable-predecessor). **0.4.2 has one host: agentic-graph. Feature/typecheck/build and bounded live checks pass; native discovery-partition checks now pass; source reconciliation and complete candidate validation still block publication.**

## Context, scope and authority

The user superseded the earlier shell selection: **consolidate into agentic-graph and remove the competing 81rv10 aviation variant**. Six pure cores migrated byte-identically; current passing and blocked receipts are in the runbook. A prior built Graph checkpoint reopened offline and replayed/exported cached evidence; the WSSS successor passes native build/typecheck and bounded live UTC/map checks. BottomPanel Timeline routing is locally verified; the shared owner handoff has completed. Graph publication remains open. iPhone Safari is **SKIP/KIV by user decision**, not passed; do not re-request access.

The admitted Graph successor owns native Flight evidence and invocation. Retirement removed38 files with16 tests/budgets passing; [PR10](https://github.com/huijoohwee/81rv10/pull/10) merged as 59b3fc81dfb48d422163afca6c604b7f0471a49a after exact green test/budgets CI; its native source ADLC is complete with the checkout retained by policy. No deployment is claimed. Drone Dashboard @0.2.1 and Launch Copilot retain their owners. Runtime is universal; geography, missions, policies and samples are authored. No competing server/iframe dependency is permitted. Separate integration/deployment receipts and real-data acceptance remain required.

## PRD

### Outcome and buyer hypothesis

An analyst imports a permitted case, inspects exact fact sources, reproduces UTC chronology offline and shares unchanged originals with derived records. The buyer hypothesis is an operations, safety or analytics lead; frequency, value and willingness to pay are unvalidated. The Singapore–Riau segment falls within an authored Singapore/Johor/Riau window, without proving Johor coverage or regional demand.

| Pain / priority | Hook → break → fix → close | Scope / evidence |
|---|---|---|
| P2 reconciliation / 1 | Disputed fact → missing/conflicting provenance → inspect exact source record and gaps → distinguish known from unknown | Existing admission/source accessor/UI; EXP-1 validates frequency and cost |
| P3 chronology / 2 | Manual joins lose ordering → explicit UTC replay → reproduce the same evidence | Existing deterministic replay/export; EXP-2/4 test technical/value outcomes |
| P1 prediction / current candidate | Uncertain arrival → truth/model absent → build bounded ETA/advisory evaluator → test held-out errors and lead | Evaluator implemented; VCC-3/4 require qualified real labels |
| P4 restrictions / current candidate | Geometry/time/datum ambiguity → structured admission → preserve unresolved fields | Structured JSON subset implemented; VCC-7 requires 100 independently labelled notices |
| P5 efficiency / current candidate | Alternatives lack a reproducible comparison → model-bound counterfactual/error band | Fixed-sphere comparison implemented; VCC-9 retains model/rights conditions |
| Vertical interpretation / current candidate | Compatible floor/ceiling → inspect bounded volume schematic and original facts | Graph synthetic SVG readback:10 points/max1.59e-12 m error; no real-airspace claim |

J1 permitted file → J2 atomic import → J3 fact/source drilldown → J4 UTC replay → J5 export/reimport verification → J6 pilot decision. No account, mandatory external map or cloud upload. Invalid/superseded work retains the accepted session.

| Story | Observable outcome | Trace / current state |
|---|---|---|
| PRD-E1-S1 Must | Every accepted fact exposes source/time/units; nulls/conflicts remain explicit; drilldown includes unchanged source text and its referenced record | CONTRACT/SHELL/VIEW; ADR-001/002; VCC-1/5/6/11; source accessor tests and live exact-source readback pass within the observed case |
| PRD-E1-S2 Must | Equal bundle/profile/algorithm/UTC gives byte-identical ordered replay with gaps | REPLAY; ADR-001/003; VCC-2/5/6/11; predecessor evidence retained |
| PRD-E5-S1 Must | Export/reimport preserves original-byte hashes and revision-bound derived identity or fails explicitly | CONTRACT/SHELL; ADR-003/006; VCC-8/5/6/11; ownership/pack/adapter tests pass; desktop saved-file reimport retains complete results/hashes; offline Save open |
| PRD-E2-S1 Should | Prediction backtest and advisory lead meet unchanged real-label thresholds | ETA/ALERT; VCC-3/4; implemented candidate, qualified benchmark open |
| PRD-E4-S1 Should | Structured geometry/time/altitude agrees with independent labels | AIRSPACE; VCC-7; explicit JSON subset implemented, independent labels open |
| PRD-E3-S1 Should | Same model/inputs/constraints reproduce a cited counterfactual and error band | BENCH; VCC-9; bounded model implemented, final proof pending |
| PRD-E6-S1 Could | Compatible-datum volumes render within 1 m of admitted bounds | AIRSPACE/VIEW; VCC-10; native synthetic SVG readback passes within the admitted polygon/datum subset |

All eleven original thresholds are retained verbatim in the [acceptance register](validation-runbook.md#complete-acceptance-register). Technical synthetic tests cannot become touchdown truth, independently labelled notices or licensed operational airspace. Operational ATC/dispatch/navigation, aircraft control, clearance interpretation, passenger/crew processing and safety certification are outside scope.

| Metric | Target | Evidence / limit |
|---|---|---|
| Setup / first record | Clean setup ≤60 min; provisioned record ≤15 min / 3 actions | Predecessor bounded timing only; full setup remains open |
| Replay/export | ≤5 min / 3 main actions after accepted import | Desktop primary save verified; timing/offline Save open |
| Serving effects | 0 models, 0 billed APIs, 0 required external requests | Prior Graph cached record replay/export works after network-blocked reload; truncated request capture does not prove zero external effects |
| Data bounds | Original <500,000 B; ≤10 entities, ≤5,000 facts, ≤24 h; profile may tighten limits | Volume profile uses ≤680 facts; shared admission remains owner |
| Code bounds | <600 lines/file; emitted resources <500,000 B; initial added JS ≤75,000 B | Twelve lazy evidence chunks total123,532 B; existing initial host JS6,997,135 B exceeds target. Added-initial metadata delta unmeasured; six host JS chunks≥500,000 B |
| Device | Desktop and 360–430 CSS px; keyboard/touch/readable table/focus/reduced motion/200% zoom | Historical390px host layout failed before the shared viewport repair; later390px HUD bounds and Start/Stop checks pass in the shared Flight plan. Exact reconciled-candidate device proof remains pending. Physical iPhone Safari SKIP/KIV |
| Value/retention | ≥10 min saved and weekly accepted use for 4 weeks | EXP-4 unrun |

## TAD

### Owners and dependency direction

The sole feature owner is `canvas/src/features/evidence-analysis/`. Six `core/` modules own admission/packs/source (`evidence-kernel.mjs`), UTC replay (`evidence-replay.mjs`), volume (`volume-project.mjs`), ETA/advisory (`arrival-analysis.mjs`), routes (`route-benchmark.mjs`) and notices (`notice-triage.mjs`). `contracts.mjs` shares only digest/byte bounds.

`tools/evidenceCatalog.mjs` declares operations; `executeEvidence.mjs` executes them for native CLI/MCP/WebMCP and lazy Flight `EvidencePanel.tsx`. Profiles/policies live in `profiles/`; fixtures/ODbL terms in `canvas/public/evidence-analysis/fixtures/`. Source frontmatter selects finite authored IDs. Admission → analysis → adapters/views is acyclic. No added feed, map, framework or billed API is required by the cores; host effects remain separately measured.

### Original facts and existing views

Admission preserves authoritative originals: strict UTF-8/duplicate-free JSON, bounds/revisions, source/time/units/datum and pointer equality. Canonical ordering, decimal-unit comparison and UTC normalization retain raw values. Authored gaps/staleness use no interpolation, clock, randomness or network. Bytes/config are copied before awaits; latest-intent fences retain accepted state on invalid/superseded work. Aviation profile v1 and evidence-order/v2 are unchanged.

The276,932 B observed sample retains708 raw rows:56 positions+56 altitudes+5 unknowns=117 facts, entity `76b452`. Authored lat0.5–2.6/lon102.7–105.1 is an analyst filter, not FIR/sovereignty/Johor-coverage proof. Pressure/geometric altitude and ground/null do not imply touchdown. [Rights](rights-recovery.md) and the runbook bind data/hashes.

`docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md` owns the Flight scenario and evidence configuration. Its native panel opens the feature in-process; runtime owns no Singapore mission. Large host chunks, narrow layout and full device/offline acceptance remain open.

Volume supports one4–64-vertex closed simple polygon,≤24 h half-open interval and compatible explicit bounds. Unsupported geometry/datums stay unresolved. Native10-point readback has max1.59e-12 m error, below1 m; no notice/terrain/geodetic accuracy follows.

### Source-authored airport and observed trajectories

PRD-E7-S1/ADR-009: the existing MapLibre owner consumes one bounded source snapshot; no second map, aircraft controller or geographic catalog is added. The demo authors WSSS community coordinates, three runway endpoint pairs and width-derived footprints from a pinned Public Domain source. Closure flags and data age remain visible; outlines are not surveyed operational geometry. Three independently observed aircraft share 2026-10-04T02:24:46.425Z–02:26:26.565Z;185 facts/3 sources retain ODbL originals, pressure-altitude labels, UTC selection, observation ages and gap breaks. Explicit unknowns must break trajectories.

`geospatialSource.ts` binds asynchronous loads to the exact active SourceFile; `geospatialProject.mjs` performs deterministic bounded projection. The existing Canvas geospatial snapshot passes it to `useSourceGeospatialLayers.ts`. Source change, style replacement and disposal remove stale layers; no camera or simulation state is mutated. Assets stay<500,000B; scene≤2MB, snapshot≤1,024 features/16,384 coordinates. Only explicitly qualified geometric map-ground intervals permit extrusion with half-open validity; pressure/MSL/SFC/FL are never interchanged.

Additive fidelity gate AEL-GEO: verify authored airport coordinates/provenance, distinct actual track identities and UTC/gaps, source replacement/removal/reload, map/style lifecycle and rendered geometry. Default/later UTC shows3 observed positions and0→2 gaps; removal/reload and rendered-source readback pass. Simulation colliders remain procedural, not surveyed airport surfaces. Official airspace geometry remains unavailable until reusable rights, effective dates and exact boundary/arc/vertical semantics are qualified. A study rectangle or observed corridor cannot satisfy that gate. The eleven inherited VCC thresholds remain unchanged.

### Existing BottomPanel Timeline

PRD-E7-S2/ADR-010 reuses `GanttTimelineTransportPanel`, inserted lanes and its native clock. Source-authored rows cover airport context, unavailable airspace, three runway surfaces and distinct aircraft/source observations. The exact UTC window02:24:42.724–02:26:38.156Z includes every recorded position. Static context has no effective-time bar; missing samples/gaps and qualified volume intervals retain their semantics. One source-bound adapter projects Timeline position into map UTC, fences reload/source changes and stops only its own transport. Source and event hashes remain inspectable.

Core/model, panel and adapter are implemented and checked. Activation is applied and locally verified:21 focused checks, native check/build and actual BottomPanel seek/play/pause/source-switch checks pass in `timeline-activation-receipt.json`. The shared owner handoff/readmission is complete. Native alignment with current main still refuses six authored/incoming overlaps; reconcile them before exact candidate validation and publication. Historical held-routing evidence remains preserved. No substitute Timeline or second clock is introduced.

### ETA and advisory evaluator

`arrival-v1.json` and `arrival-policy.json` author roles, scope and thresholds. Each case supplies one as-of snapshot1,800 s before truth. Frozen scheduled-arrival and constant-groundspeed sphere-distance baselines are reported separately. Training median touchdown-minus-track residual adjusts the candidate; forecast inference receives no truth.

Disjoint chronological calibration uses absolute residual rank `ceil((n+1)×0.9)` and≥9 usable cases for a finite nominal90% interval. Held-out tests never fit correction/interval. Duplicate cases, future features/plans and truth crossing partition boundaries fail. Missing truth, stale/out-of-scope/unsupported cases are excluded with reasons/denominators. Supplied qualification declarations do not authenticate touchdown truth.

Held-out reports retain paired baseline errors, interval coverage and advisory precision/coverage denominators. Advisory means interval lower bound>plan+600 s; a single forecast reports lead, without operational instructions. The unchanged200-arrival, baseline-improvement,≥85% coverage and≥70% lead gates require qualified real data; synthetic arithmetic cannot pass acceptance.

### Route comparison

`route-v1.json` and `route-policy.json` author paired polylines, shared endpoints/window, supported types, excluded regions and a cited fixed-sphere distance model. Comparison returns each length and their signed difference; it does not invent a fastest, feasible, fuel-efficient or optimal route. Excluded-region intersection is conservative and may overexclude.

A declared per-vertex positional bound `u` gives conditional polyline error `2(n−1)u` under the same spherical metric; adding both route bounds gives a difference band. This is neither statistical coverage nor ellipsoidal/geodetic/model error. Missing bounds remain explicit rather than becoming zero uncertainty. Same inputs/model/constraints must reproduce output; VCC-9 final software proof and real usefulness remain separate.

### Structured notice subset

`notice-policy.json` accepts `structured-notice/v1`,≤12,000 original UTF-8 bytes: classification/source envelope, identity/observation time, explicit polygon/validity/vertical bounds and nullable free text. One ring/continuous UTC interval maps to the existing volume projector. Free text, compound geometry, recurring schedules, missing/incompatible datum or unsupported semantics stay unresolved with originals intact; malformed rights/envelope/timestamp order fails. Full NOTAM/AIXM support is not claimed.

Results retain original text/hash, rights/origin/retrieval and JSON-pointer mappings. Valid translations embed originals/policy in a hashed transformed-source wrapper; derived facts are labelled transformations. Active/inactive refers only to the half-open interval. Derived volume bundles reuse pack admission; the100-label/≥98% notice benchmark remains open.

### Analysis interaction

The lazy native panel consumes authored choices, bounded files and explicit queries. It retains immutable accepted results, labels synthetic cases, exposes source/error/exclusion details and prepares export. Failed/superseded work retains prior results. Reports require original inputs for reproduction; save/offline/parity/browser claims need current receipts.

The authoritative external PRD retains all six diagrams. Flow: local files → admission → pure owners → read-only views/tools → report/pack. No payment, write-back or aircraft effect.

## ADR

| ID | Decision / alternative | Consequence / recovery |
|---|---|---|
| ADR-001 | Record/replay is the base; now implement authorized ETA/advisory/benchmark software with explicit evaluation gates | No predictive claim until real thresholds pass; retain reconstruction fallback |
| ADR-002 | Local permitted files, authored profiles and offline readsb mapping; live feeds deferred | Preserve upstream bytes/ODbL; synthetic volumes remain visibly synthetic; missing rights block only dependent data use |
| ADR-003 | Immutable originals and rebuildable memory; database/sync deferred | Snapshot caller bytes/config before awaits; reject old v1 packs with explicit raw-original reimport; no silent migration |
| ADR-004 | Sole Graph feature and native Flight entry; reuse six pure cores, volume projector and shared executor | Remove competing 81rv10 variant; preserve inherited MIT notices; measure native host and lazy feature budgets separately |
| ADR-005 | One read-only tool owner across adapters | Unknown/extra/mutation inputs fail; no independent schemas; remote gateway still deferred |
| ADR-006 | Byte hashes and revision-bound identity; signing/notarization deferred | Source drilldown proves inspectability/integrity, not authenticity or legal custody |

## MVP and verification

Graph owns record/replay/source/export, volume, ETA/advisory, route and notice cores. **WSSS checkpoint:81 feature (63 core),31 UI/source/offline,7 map plus26 regressions,22 Flight and4 seed checks pass. Timeline:24 earlier focused checks/typecheck/build pass; later activation passed21 focused checks and local routing/control verification. Inspection/source identity:9 UI checks and native check/build complete; full browser inspection equals executor. Verified offline-route reload preserves inspection/replay/export; host refresh error and truncated network capture remain. Historical CI stage8/15:161 pass,1 partition failure; both partition checks now pass. Exact reconciled-candidate aggregate CI remains pending.** Desktop Save/reimport verified; host-size/offline Save/release open.

Acceptance remains open: VCC-3/4≥200 permitted independent touchdown labels/performance; VCC-7≥100 independently labelled notices; VCC-5 390px layout failure, phone SKIP/KIV and unverified offline Save/setup; VCC-9 native model/constraint/readback proof. Synthetic tests establish no customer, rights or operational claim.

After current native proof, use the [180-second demo](validation-runbook.md#180-second-demo) for record/replay, adding the explicitly synthetic volume exercise only as a separately timed technical segment. EXP-1/3/4 still require real buyer, payment and usage evidence.

## GTM and venture record

The unsent offer remains one permitted historical reconstruction for a qualified team reviewing Singapore/surrounding airspace. Geography is not demand proof; manual reconciliation, source tools, in-house analytics and no action remain alternatives. New analysis makes no additional pilot promise.

Discovery owns consent/interviews/offers; finance owns A01–A16, DM-A/B/C, statements/scenarios; venture drafts remain unpresented. Price/currency, cash, value, TCO and market size are unknown. Order, fulfilment, revenue, cash, refunds and repeat use are separate. No outreach, funds or audience handoff is implied.

## Coverage and planning


| Domain | Disposition / owner / next evidence |
|---|---|
| C01 Pain | Covered / Product / EXP-1 |
| C02 Market | Deferred / Commercial / reconcile two sourced sizing methods |
| C03 Offer | Covered / Founder / terms and EXP-3 |
| C04 Journeys | Covered / Product / VCC-1/2/5/8 |
| C05 Architecture | Covered / Architecture / source/parity |
| C06 Quality/rights | Covered / Engineering / negative/offline/rights checks |
| C07 Decisions | Covered / Architecture / ADR-001–010 triggers |
| C08 MVP | Covered / Product / six Must receipts |
| C09 Learning | Covered / Product / actual experiments |
| C10 Operations | Covered / Operations / timed recovery/support |
| C11 Obligations | Covered / Operator / data and commercial decisions |
| C12 Finance | Covered / Finance / actuals/reconciled statements |
| C13 Capital | Covered / Founder / cash/capacity |
| C14 ADLC | Covered / Release owner / exact effect receipts |
| C15 Projections | Covered / Product / audience review |
| C16 Successor | Covered / Product / actual versus target |

16/16 dispositioned: 15 covered, one deferred, none inapplicable. Disposition is not acceptance.

| PRD-TAD-ADR-MVP-GTM | CID | RAO | Updated Date |
|---|---|---|---|
| aviation-evidence-layer@0.4.2 | C: user superseded shell selection and required sole Graph ownership. I: consolidate all evidence/analysis capabilities and retire the conflicting variant. D: migrated cores, native Flight panel and one executor with authored scenario data. | R: Engineering. A: preserve owners, identities and original acceptance gates. O: one implementation owner. check: runbook binds feature/live/retirement proof, repaired discovery checks, pending Graph alignment/aggregate CI and open offline/real-data gates. | 2026-10-04 |
| aviation-evidence-layer@0.4.2 | C: no commercial outcomes; iPhone Safari explicitly SKIP/KIV. I: retain honest acceptance and learning records. D: separate software readiness, real-data gates and user-deferred device work. | R: Product. A: synchronize six projections without changing thresholds. O: reviewable scope and evidence gaps. check: eleven VCCs, joins and EXP-1/3/4; no phone pass. | 2026-10-04 |

## ADLC and handover

Graph base `061df9dc9df465f9b54281d576fc9c81f1b092da`; admitted branch `agent/device-0232231d4a19/aviation-evidence-consolidation`. Historical code/data preservation archive: `output/aviation-graph-consolidation-20261004/81-staging-preserved.tar.gz`, SHA-256 `3b0d7e6fa07ad103c84dbc47362fd41b4bdd5a9211a32f59a0801acadcecd6f4`. Preservation permits audit, not revival of a competing runtime. Retain inherited licenses and Drone Dashboard @0.2.1 joins.

Migration cap15 active minutes/6 docs≤75 KiB/<600 lines each. Feature targets: <600 lines/<500,000 B per resource, initial added JS≤75,000 B, total served JS≤150,000 B; Graph size/offline gaps remain. Require final emitted inventory/effects proof. R1≤8 active h/3 iterations; refresh after2 no-progress attempts. Serving models/billed APIs/spend0; authoring cost unknown. External waits carry recheck conditions, not ETA.

Use native START, changed-scope planner/checks and RELEASE under Graph's collaboration/runtime contract. Graph readmission and focused discovery checks pass; source alignment overlaps and exact reconciled-candidate CI remain open. Graph publication/integration/deployment remain absent. Recovery distinguishes session, source and delivery; local preview is not production. Keep removed 81rv10 aviation paths retired when recovering the Graph feature.

## Source closeout recovery — 2026-10-04

The operator requested END ADLC across remaining worktrees. Native readmission now covers the nine locally edited Timeline/toolbar files and the two formerly held discovery/CI owners. Their original bytes were preserved and restored exactly before applying the reviewed discovery and CI patches. Both native discovery partition checks pass. No source candidate has been published from this successor. Native stopped-writer alignment to Graph 8e77ed58 refuses overlapping authored/incoming paths; preserve all working bytes and the pinned OS documentation checkout. Resolve the listed source-owner overlaps through a reviewed reconciliation before exact candidate validation, protected integration and cleanup. The local receipt directory is .workspace/.artifacts/all-worktrees-closeout-20261004 at the GitHub workspace root. Production, real-data VCCs and user-deferred iPhone Safari remain unverified.
