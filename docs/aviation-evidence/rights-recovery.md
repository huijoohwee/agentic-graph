---
title: "Aviation Evidence — rights, operations and recovery"
doc_type: "Handbook"
version: "0.4.2"
continuity_id: "aviation-evidence-layer"
source_revision: "aviation-evidence-layer@0.4.2"
date: "2026-10-04"
owner: "Operator and release owner"
---
# Rights, operations and recovery

This [joined-plan](prd-tad-adr-mvp-gtm.md) record prepares local operation; it is not a completed permission review or legal certification. Graph is the sole implementation owner. Hashes bind bytes, not authenticity, permission or independently verified accuracy.

## Source and data admission

| Source | Evidence and permitted scope | Retained qualification |
|---|---|---|
| Inherited core code | MIT lineage at438038865fd25c9d2a07ff50fcb75e2666e08b7c; terms in `canvas/src/features/evidence-analysis/LICENSE.txt` | Preserve notices; does not authorize a competing host or relicense data/assets |
| Authored synthetic control | Practice Flight and volume/arrival/route/notice exercises explicitly synthetic | Fixture/profile/author identities retained; never label simulation as observation |
| ADSB.lol observations | Retained original bytes, source pointers and ODbL-1.0 database terms | Historical crowdsourced positions; no independent touchdown, schedule, airport assignment, restriction or clearance truth |
| OurAirports WSSS context | Pinned Public Domain CSV subset in `airport-wsss-source-v1.json` | Community records; endpoint/width-derived display, not surveyed geometry or verified current operational status |
| Actual controlled airspace | Reference metadata only; CAAS redistribution permission/current qualification unresolved | No official polygon, FIR, notice or operational volume adopted; study bounds are not airspace |
| Operator-supplied input | Admission checks format and provenance declarations | Separate source authority, purpose, confidentiality, retention/offline/export and redistribution permission required |
| Host/dependencies/tiles | Existing Graph MapLibre/Flight owner and repository pins | Code, dataset, tiles and other assets retain separate rights; free access does not establish FOSS/no-overage eligibility |

ADSB.lol database rights are **ODbL-1.0**, not CC0 merely because contributors release their contributions. Retain “ADSB.lol contributors — https://www.adsb.lol — ODbL-1.0”; distribute adapted databases under applicable ODbL terms. The full terms ship as `canvas/public/evidence-analysis/fixtures/ADSBLOL-LICENSE-ODbL.txt`, SHA-256 `d93f996262c15e7cf9d6b54f9f48e3f9d8b9c3a47fa2308dc8ef1f0f5cb88611`. Admission `operator-attested` is a recorded decision, not certification.

The earlier Singapore–Riau sample retains [trace76b452](https://adsb.lol/globe_history/2026/10/03/traces/52/trace_full_76b452.json), retrieved2026-10-04T00:58:26.294Z:56 selected positions,117 facts and5 unknowns. Its [history terms](https://github.com/adsblol/globe_history_2026/blob/fa2cfaa721eb8360f481bbf1f1f0a7c63a605131/README.md) pin `fa2cfaa…`; mapping follows [readsb trace schema](https://github.com/wiedehopf/readsb/blob/094720939c01943de82b14df6f42f67fff1cd514/README-json.md#trace-jsons). The authored Singapore/Johor/Riau window does not prove observations cover every named area.

The new `aviation-singapore-multitrack-v1.json` retains three actual sources/entities and185 facts,213,122B, SHA-256 `f8e3e92881fde1d7bfa36423ee1e031e71019697993153fd1829cd440a1f0082`. Its preparation receipt records original source URLs, retrieval times, hashes and selections. The common observed span is2026-10-04T02:24:46.425Z–02:26:26.565Z. [ADSB.lol open-data terms](https://www.adsb.lol/docs/open-data/api/) apply; no interpolation, touchdown inference or operational airport assignment is supplied. Pressure altitude stays labelled metadata, not geometric 3D height.

OurAirports [Public Domain release](https://ourairports.com/data/) supports the pinned [runways CSV](https://raw.githubusercontent.com/davidmegginson/ourairports-data/07f86e80d3f15296c3ff971f49c33ddb331c8d8a/runways.csv). The local source retains exact header/three rows, elevations, displaced-threshold facts and closure flags. Source SHA `0587077382f81e85b89143e9c1de110a0e91a525ee76c956e7c947d7cf9afe36` identifies the local wrapper; original CSV subset SHA is `a1747c5790f9ce98923f725c5a4401f960093ae8a0ce2881891451343362e416`. Footprints offset the stated widths around source endpoint bearings on a fixed sphere. The horizontal datum is not explicit in the selected dictionary; coordinate interpretation, geometry and current status remain qualified. In particular, source `closed=1` on02R/20L is preserved, not silently corrected or treated as current official truth.

The authored `scene-wsss-v1.json` declares actual controlled airspace unavailable. [CAAS AIP](https://aim-sg.caas.gov.sg/aim-content/uploads/aip/17-SEP-2026/AIP/2026-09-03-000000/html/eAIP/SG-AD-2-WSSS-en-GB.html) provides dated reference context, but [reuse terms](https://www.caas.gov.sg/terms-of-use/) do not establish an admitted redistribution grant. No official geometry is copied. OneMap also has no admitted token/layer/geometry in this increment. The separate synthetic volume's AMSL statement is a test condition, not measured regional terrain or airspace.

### Required per-source record

Before admission retain source/version/URL, rights holder/operator, access basis and effective/expiry dates; allowed purpose/derivation/redistribution/offline/export; attribution/confidentiality/personal-data obligations; geography/time/datum/gaps; quotas/fees/overage controls; retention/purge/export handling; reviewer/decision/recheck trigger. Unknown authority or cost blocks that source. Disable it on material drift.

No access tokens, restricted contracts or passenger/crew data in fixtures/screenshots/logs/PRs. A digest is not anonymization. Keep pseudonymous research notes separate from consent records.

## Operation and recovery

One operator supports one pilot during agreed hours. Verify exact software/profile/input identities, permission, browser/storage and saved originals;30min onboarding/60min recovery remain unmeasured targets. On failure retain permitted evidence, stop using the affected result, reproduce minimally and disable only that source/feature. Do not repair originals silently or upload restricted files. Log ID/UTC, runtime/profile/source, impact, containment, owner, resolution, support minutes and next check. No24/7 or safety-response promise.

| Failure | Recovery / evidence |
|---|---|
| Malformed/oversized input | Typed rejection before replacing acceptance; sequential2MB tool cap and streaming499,999B scene-asset/2MB scene limits; cancel redirects/invalid UTF-8/overflow |
| Late read/caller mutation/source change | Snapshot inputs before awaits; generation and exact SourceFile fences reject stale completion; passive map layers clear independently of panel mount |
| Unsupported datum/geometry | Retain accepted analytical result with reason; generic map rejects invalid source snapshots; no pressure/geometric/AGL conversion or hidden geometry repair |
| Algorithm-v2 pack | Reimport matching unchanged profile/algorithm; original and derived identities must match |
| Prior algorithm-v1 pack | Retain old pack; extract `original.text` as UTF-8 and verify `original.sha256`; explicitly admit raw originals into v2 with a new derived identity |
| Tab crash/session reset | Reopen and reimport saved originals; unsaved in-memory work may be lost |
| Uncertain export | Keep session and inspectable fallback; prepared link/export text is not completed primary save; verify actual saved bytes |
| Offline/cache/storage failure | Export before leaving; use native Graph recovery. Prior4222 verified959files/~28.8MiB; offline reload/manual source reapply/replay/prepared export retained identity. Current13-asset build membership verified; fresh scene offline proof remains open |
| Native feature regression | Preserve originals/unrelated work, disable affected entry and recover through the native owner; do not restore the retired competing aviation host |
| Published/deployed regression | Source successor/revert needs checks/protected integration; deployed rollback separately needs authorized controller, retained source/config/schema/cache predecessor and live readback |
| Rights expiry/withdrawal | Disable source and purge covered copies under the agreement; document scope/completion. Exports cannot be assumed recalled |

The prior offline network capture truncated at250 events; zero external requests is unproven. Primary save remains open and iPhone Safari SKIP/KIV. Pre-Timeline WSSS native typecheck/build and bounded UTC readback pass;81 feature/31 UI-source-offline,7 controller/26 map regression,22 Flight/4 seed checks pass. Historical affected CI stopped at stage8/15 with161 pass/1 fail; both discovery partition checks now pass. BottomPanel Timeline routing/control has local verification. Native alignment overlaps and exact reconciled-candidate aggregate CI still block publication. Keep checkpoint receipts in [validation](validation-runbook.md), including preceding parity and repaired input-allocation evidence. No blanket cache/process/worktree deletion; cleanup requires exact eligible-target receipts.

## Delivery boundaries

B1 publication needs admitted scope, exact commit and native checks; protected integration separately needs the exact provider receipt. B2 delivery needs integrated source, selected environment/controller, baseline, retained predecessor, free/FOSS eligibility and authorized effect. B3 customer delivery also needs consent/agreement/data/security and real operator acceptance. Current work establishes local preparation, not a published Graph release, production deployment or customer instance.

Before offering, resolve jurisdiction, price/currency/tax, acceptance/refunds, confidentiality/export/retention and support terms with qualified review where needed. Covered engineering continues. The [offer](discovery-pilot.md) remains unsent until its fields and specific external-action authority are established.
