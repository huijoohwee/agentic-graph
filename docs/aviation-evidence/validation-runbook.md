---
title: "Aviation Evidence — validation and local runbook"
doc_type: "Handbook"
version: "0.4.2"
continuity_id: "aviation-evidence-layer"
source_revision: "aviation-evidence-layer@0.4.2"
date: "2026-10-04"
owner: "Engineering and independent evaluator"
---
# Validation and local runbook

[Joined 0.4.2](prd-tad-adr-mvp-gtm.md) keeps **agentic-graph as sole owner**. Complete inspection/source identity:9 UI checks and native check/build complete.12 lazy chunks123,511B;13 offlineassets634,806B; startup unchanged. Timeline:24 earlier focused checks pass; later activation passed21 focused checks, native check/build and local seek/play/pause/source-switch verification. The historical stage8/15 partition failure is retained; both discovery checks now pass. Exact reconciled-candidate aggregate CI remains unproved. No Graph publication. **iPhone Safari SKIP/KIV**; eleven thresholds unchanged.

## Local operation

1. Start the admitted Graph checkout; open its URL and `docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md`.
2. Open Flight's **Evidence and analysis**; inspect originals, classification, identities, unknowns and UTC replay.
3. Save and reimport actual bytes; preparation/DOM copying does not prove primary save or timing. Export originals before host changes.
4. Independently measure Graph provisioning, blocked-network reload, resources and requests; retired-host cache receipts are inapplicable.
5. Read actual synthetic SVG coordinates against admitted bounds; verify invalid/superseded-input retention and equal-input tool results. The authored `scene-wsss-v1.json` adds permitted community runway context and three observed aircraft through native MapLibre; the bounded WSSS production-preview readback is recorded below.
6. Stop/reset only owned processes/sessions. Preserve originals, reports and unrelated work.

## Analysis examples and invocation

Feature root: `canvas/src/features/evidence-analysis/`; public fixtures: `canvas/public/evidence-analysis/fixtures/`, served at `/evidence-analysis/fixtures/`.

| Owner / authored input | Local exercise / scope |
|---|---|
| `arrival-analysis.mjs`; `arrival-v1.json`, `arrival-policy.json` | `arrival-singapore-exercise-{train,calibration,test}.json`; disjoint chronological synthetic batches, training median residual, separate nominal90% calibration and held-out metrics |
| `route-benchmark.mjs`; `route-v1.json`, `route-policy.json` | `route-singapore-synthetic-v1.json`; matched endpoints/window, cited fixed sphere, declared uncertainty, exclusions/types |
| `notice-triage.mjs`; `notice-policy.json` | `notice-singapore-synthetic-v1.json`; explicit12,000B JSON subset; query2026-10-03T10:45:00.000Z; reuses volume projector/profile |
| `volume-project.mjs`; `volume-v1.json`, `volume-view.json` | `volume-singapore-synthetic-v1.json`; compatible-datum render control |

Exercises are synthetic; qualification declarations are not authentication. Finite nominal90% intervals require≥9 calibrators. No held-out tuning or real-accuracy inference.

`tools/evidenceCatalog.mjs` declares eight operations: `aviation.inspect/replay/source/export`, `volume.project`, `arrival.evaluate`, `route.benchmark`, `notice.triage`. `tools/executeEvidence.mjs` owns shared execution; aliases are `/operation @evidence #evidence`. Native tool names and required fields are available through `node canvas/src/features/evidence-analysis/tools/evidenceCli.mjs --list`. Invoke with stdin JSON and explicit profile/policy/view IDs; never interpolate source text into shell. Eleven adapter checks cover CLI/stdio round trips and WebMCP-builder parity. Browser discovery and unsupported-WebMCP fallback remain open; unknown/extra/conflicting requests fail.

## Complete acceptance register

These are verbatim inherited conditions, including historical NEW/deferred labels. Software implementation does not waive real labels/rights, observable thresholds or device decisions. The six Must criteria are VCC-1/2/5/6/8/11.

| VCC / story → TAD / ADR | Observable condition, stated check and constraint |
|---|---|
| VCC-1 / PRD-E1-S1 → CONTRACT / 002 | `check-aviation-record` (NEW): 100% accepted facts carry explicit source/time/units; null/gaps preserved; malformed/duplicate/oversized/non-finite/conflicting-datum cases fail before replacing accepted state. No external enrichment. |
| VCC-2 / PRD-E1-S2 → REPLAY / 001,003 | `check-aviation-replay` (NEW): two offline runs with equal bundle/algorithm/query inputs give byte-identical canonical output and original positions; shuffled input/tied times resolve by declared ordering. No Date.now/random/interpolation/network. |
| VCC-3 / PRD-E2-S1 → ETA / 001 | `check-eta-backtest` (NEW, deferred): ≥200 arrivals with permitted touchdown truth, UTC seconds; freeze baseline (scheduled arrival and constant-groundspeed track estimate, report each), sample 30 min before truth, chronological train/test separation. Median absolute error improves on each stated applicable baseline; 90% prediction interval has ≥85% empirical coverage. Missing truth excluded with counts; no simulated truth passed as real. |
| VCC-4 / PRD-E2-S1 → ALERT / 005 | `check-alert-lead` (NEW, deferred): on held-out plan-late arrivals >10 min, ≥70% advisory lead ≥20 min; report precision and coverage denominators. Requires permitted plan and actual-arrival data; no operational instructions. |
| VCC-5 / PRD-E1-S1, PRD-E1-S2, PRD-E5-S1 → SHELL/VIEW / 004 | `check-aviation-device-offline` (NEW): clean setup ≤60 min; provisioned shell + fixture record ≤15 min/3 steps; 360–430 px phone and desktop complete keyboard/touch/readable-table replay/export offline. Record device/browser/storage errors and network requests; no external tiles. |
| VCC-6 / PRD-E1-S1, PRD-E1-S2, PRD-E5-S1 → TOOLS/SHELL / 001 | `check-aviation-zero-spend` (NEW): import/read/replay/export tool paths invoke 0 models/0 billed APIs, obey byte/module limits; scan network/config and runtime counters; zero provider effects. Build assistant usage excluded from serving claim. |
| VCC-7 / PRD-E4-S1 → AIRSPACE / 002 | `check-notice-parse` (NEW, deferred): ≥98% geometry/time/altitude agreement on 100 independently labelled structured notices; incompatible/missing datum unresolved; never silently parse free text into operational clearance. |
| VCC-8 / PRD-E5-S1 → CONTRACT/SHELL / 006 | `check-aviation-pack` (NEW): originals match input byte hashes; equal accepted bundle/revision gives equal derived digest; export/reimport equivalent; tampered bytes fail; delayed prior import cannot overwrite newer accepted session. No origin/non-repudiation claim. |
| VCC-9 / PRD-E3-S1 → BENCH / 001 | `check-route-benchmark` (NEW, deferred): same inputs/model/constraints produce identical result with cited counterfactual and error band; record excluded regions and unsupported types. |
| VCC-10 / PRD-E6-S1 → AIRSPACE/VIEW / 004 | `check-volume-render` (NEW, deferred): compatible-datum test volumes rendered within 1 m of admitted floor/ceiling and unit conversion; pressure/geometric/AGL mismatches fail; no map-data rights assumed. |
| VCC-11 / PRD-E1-S1, PRD-E1-S2, PRD-E5-S1 → TOOLS / 005 | `check-aviation-invocation-parity` (NEW): UI/local module/CLI/MCP return same typed inspection/replay result for equal inputs; unsupported WebMCP has visible fallback, unknown/mutation tool rejected, no writes/spawn/network. Protocol compatibility tested for supported revisions only. |

VCC-10 requires actual SVG readback. Synthetic render proof does not close VCC-7; VCC-3/4 need independent real touchdown/plan truth. VCC-9 retains conditional sphere-model uncertainty, without fuel/optimality/geodetic claims.

## Evidence register

| Evidence ID | Required scope | 0.4.2 disposition |
|---|---|---|
| AEL-SOURCE | Exact source/tree/profile/fixture/lock and resources | Current build/assets measured; Timeline routing/live proof held; unpublished |
| AEL-CONTRACT | Determinism, negative inputs, fences and packs |81 historical feature checks pass; current74 core checks and both discovery partition checks pass; aggregate successor CI pending |
| AEL-ARRIVAL | Frozen baselines, fitting/calibration isolation and denominators | Synthetic evaluation passes; qualified0/eligible=false; real VCC-3/4 open |
| AEL-ROUTE | Equal inputs/model, exclusions and conditional uncertainty | Captured UI/headless equality; complete real constraint acceptance open |
| AEL-NOTICE | Original/policy/mapping hashes and unresolved semantics | Synthetic active/inactive/unresolved proof;100-label benchmark unrun |
| AEL-VOLUME | Actual SVG unit/bounds readback and invalid-input retention |10 synthetic SVG points, max1.59e-12m error; real airspace permission absent |
| AEL-PARITY | Supported UI/module/alias/CLI/MCP/WebMCP equivalence | Complete WSSS inspection/replay/export match executor; discovery open |
| AEL-DEVICE | Setup/actions/keyboard/touch/readability | Prior390px body28px failure retained; desktop Save/reimport verified; successor layout/offline Save open; iPhone KIV |
| AEL-OFFLINE | Provision→blocked-network reload→analysis; requests/hashes | Current verified-route reload/inspection/replay/export pass; host refresh error/network truncation retained |
| AEL-EFFECTS |0 serving models/billed APIs; total≤150,000B, added initial≤75,000B | Lazy feature inventory exists; host size/chunk gates fail; complete request/effect count unproven |
| AEL-RECOVERY | Invalid/superseded input retention and reproduction |31 UI/source/offline checks; live notice rejection and prior offline identity retention |
| AEL-RELEASE | Native checks, publication and provider receipts | Historical stage8/15 partition failure repaired by passing targeted checks; native alignment overlaps still block Graph publication/integration/deployment |

### Graph checkpoints — 2026-10-04

Receipts remain in workspace `output/aviation-graph-consolidation-20261004/`. These bind local source/builds, not a published revision. An asset prefix naming base `061df9dc…` does not identify the dirty successor.

| Checkpoint | Observed result / limitation |
|---|---|
| Feature/source checks | `fidelity-all-feature-tests.log`:81/81; `fidelity-ui-source-offline-tests.log`:31/31. JSON loading, sequential2MB encoding, streaming bounds, source fences and offline membership covered |
| Prior live record |117 facts/1 source/5 unknowns; fallback JSON reimport preserves original `e88ad410…` and derived `4913a0c5…`; primary saved download remains unverified |
| Prior volume/notice |10 actual SVG points, max1.5916157281026244e-12m vertical error. Synthetic notice active10:45/inactive10:53 exclusive end; missing datum unresolved; invalid retrieval order retains prior result |
| Prior arrival/route |16 synthetic arrival cases:3 train/9 calibration/3 test/1 excluded; qualified0. Fixed-sphere compared routes77,757.7058/71,188.2309m, conditional±28m band; no real accuracy/optimality claim |
| `independent-evidence-parity-audit.json` | Captured source/export/volume/arrival/route/notice match headless. Inspect identity only; complete inspect/replay and final-source refresh remain open |
| Prior production-preview4222 | Native offline installer verified959 files/~28.8MiB. With network offline, reloaded app, manually reapplied authored source, loaded117 facts through service-worker200 revision-bound URL, stepped UTC and prepared export with unchanged original/derived identities |
| Offline limitation |250-event network capture truncated: no zero-external-request claim. Manual source reapplication is part of the observed workflow. Primary save, measured setup/three-step target and physical phone remain open; this is not current-scene verification |
| Map/Flight checks |7 renderer +26 map regression tests pass; `wsss-flight-source-subset.txt`:22/22; `wsss-seed-authority-fix.txt`:4/4. Generic finite2D source layers preserve disposal/style and controlled-aircraft ownership |
| Native build/check | `fidelity-typecheck.log`: native locked TypeScript5.8.3 check passes; `fidelity-build.log`: build passes. `final-native-summary.json`/`final-ci-affected.log`:7/15 standard stages pass; stage8 fails partition;7 standard/9 extended owner checks remain |
| WSSS production preview | `wsss-production-context.txt`:3 runway surfaces/3 observed positions at02:25:30Z,0 unknowns/gaps. `wsss-live-later-utc.txt`:02:26:26.565Z retains3 positions and shows2 gaps; timestamps, pressure labels and airspace-unavailable qualification remain visible |

The authored scene has3 runway footprints/centrelines and185 facts across3 aircraft. Common span02:24:46.425Z–02:26:26.565Z on2026-10-04; default02:25:30Z. Exact-SourceFile `source_geospatial` clears passive layers on source change. Colours, UTC/age and gap breaks retain identities. Pressure altitude is metadata, never geometric height. Controlled Flight is a separate practice aircraft.

`airport-wsss-source-v1.json` retains pinned OurAirports CSV rows and their original closure flags. Footprints derive from endpoint/width facts, not surveyed polygons; datum/operational status remain qualified. `aviation-singapore-multitrack-v1.json` retains original ADS-B bytes and ODbL attribution. Proximity is not airport assignment or touchdown truth. Actual controlled-airspace geometry is **unavailable** pending redistribution permission/current qualification; no study extent substitutes for it. See [rights](rights-recovery.md).

`fidelity-build-size-receipt.json` retains historical bytes. Six host chunks exceed500,000B; total≤150,000B fails; added-initial≤75,000B unproved. Static bytes are not transfer proof.

**BottomPanel Timeline:** model/panel/native clock bridge pass24 focused checks/typecheck/build (`timeline-final-*`); routing is held, panel unemitted. Floating slider is not Timeline proof. Exact-source rename/hash-collision fencing and full inspection disclosure pass9 UI checks; native check/build completed (`inspect-record-final-*`). Process exit envelopes are unavailable; completion logs/emitted hashes retained. Matched startup unchanged; feature code−93B from source-invalidation checkpoint.

`wsss-inspection-browser-parity.json`: all185 facts/3 aircraft/3 sources equal executor. `wsss-replay-pack-parity.json`: complete replay survives browser fallback reimport;262,899B export matches executor. `wsss-primary-save-parity.json`: visible Save creates a new262,899B Downloads file; native-picker reimport preserves complete inspection/replay and hashes. Tool timeouts did not mean no file. Saved-pack offline import also matches. Offline Save click has no new file readback; phone/timing remain open.

`wsss-offline-browser-parity.json`: installer966 files/29.1MiB; **Open verified offline workspace**, blocked-network reload,185-fact inspection, later UTC replay and export match executor. Fixture returns service-worker200. Direct URL offline reload failed earlier; background import-index refresh fails; initial network log truncates. No zero-request/timing/phone claim. Network emulation restored.

Native readmission now covers discovery/CI ownership; `pending-owner-handoff.patch` and `pending-evidence-ci-scope.patch` are applied. Both discovery partition checks and74 evidence core tests pass. Native alignment refuses six authored/incoming overlaps; exact reconciled-candidate aggregate proof is pending. Predecessor retirement [PR10](https://github.com/huijoohwee/81rv10/pull/10), source `b6d0e6ae01df4f1d6da1478cabcbd21da2c73efd`, merged as `59b3fc81dfb48d422163afca6c604b7f0471a49a` after green [CI37170171690](https://github.com/huijoohwee/81rv10/actions/runs/37170171690). Its native source closeout completed with checkout retention required by policy; no deployment is claimed. Its [PR9 runbook](https://github.com/huijoohwee/81rv10/blob/172a0df03bb69f04f82b49aeaec81e0cdc466317/docs/aviation-evidence/validation-runbook.md) retains historical receipts; they do not prove Graph acceptance.

## 180-second demo

| Beat | Seconds | Action / evidence |
|---|---:|---|
| Hook |20| Name the permitted historical segment and ODbL limits |
| Probe |40| Show real unknowns and original fact/source reference |
| Reveal |40| Repeat equal-input UTC replay and compare canonical output |
| Reproduce |60| Export/reimport; reject corrupt replacement while retaining record |
| Close |20| State uncertainty and next authorized case decision |
| Total |180| Target, not measured completion time |

Time analysis separately; retain setup/action/save/interruptions. Synthetic exercises do not prove buyer value.

## Browser, check and release record

**iPhone Safari: SKIP/KIV by user decision.** Do not re-request access or infer phone acceptance from emulation. If resumed: physical device/iOS/Safari, secure origin, setup, Save-to-Files/reimport, touch/200% zoom/offline receipts remain required.

Retain the prior390px height failure until the admitted native repair has current readback. Browser checks bind source/environment,360–430px and desktop readability, keyboard/focus/44px targets, reduced motion, non-colour status, storage failures and network counts. Offline Save/timing remain open; no accessibility certification.

Run native required checks; retain each checkpoint's exact inputs/counts. Discovery/CI ownership is admitted and repaired; Timeline activation has local proof in `output/aviation-graph-consolidation-20261004/timeline-activation-receipt.json`. Resolve native alignment overlaps, then validate the exact reconciled candidate before publication. Preserve failures and receipts; [recovery](rights-recovery.md) separates publication, integration and deployment.
