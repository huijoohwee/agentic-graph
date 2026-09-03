---
title: "Reference implementation: agentic-graph City Simulation VCC and delivery register"
id: "md:agentic-graph-game-city-building-sim-vcc-delivery"
doc_type: "VCC/Delivery"
version: "2.0.0"
date: "2026-07-31"
lang: "en-US"
owner: "docs.game.city-simulation"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
frontmatter_contract: "required"
parent_document: "/docs/documents/agentic-graph-game-city-building-sim-prd-tad-ard.md"
---

# Reference implementation: agentic-graph City Simulation VCC and delivery register

This companion owns the evidence, traceability, readiness-gap, and delivery
registers for the [City Simulation PRD/TAD/ADR](./agentic-graph-game-city-building-sim-prd-tad-ard.md).
The parent remains the product and technical architecture document; neither
document may claim proof without candidate-bound evidence.

## 13. VCC and Evidence Reference register

VCCs 01 and 03–06 retain historical authoring results. The v2 documentation
split does not manufacture new runtime evidence. The neutral Geo+XR registry,
current semantic-media composition, and clean-browser VCCs have no result bound
to this documentation revision; VCC-02 and VCC-07 therefore remain unrecorded.
The documents remain `spec-complete` locally and `undocumented` for delivery.
Prior source evidence does not prove universal overlay arbitration, current
browser behavior, production integration, or delivery.

| VCC | Evaluator-checkable end state and constraint | Stated check | Evidence Reference |
|---|---|---|---|
| `VCC-CITY-01` | Two equal applied City sources and input traces yield byte-identical valid city states; the applied source is the only initializer and no clock, random, network, or model participates. | Registered authored-source, city model, economy, input, and lifecycle cases exit 0 with non-zero totals. | 2026-07-30 historical authoring: `npm --prefix canvas run test:ci:unit -- city.sim`; 31/31 passed before the v1.8 authored-source contract |
| `VCC-CITY-02` | Geo+XR retains one native MapLibre visual/renderer/camera/gesture owner inside one semantic `figure`; the live canvas references the caption, exposes the direct accessible name, and owns the sole selection marker. One checked-in regional POI source with exact geographic footprints and real-metre heights renders below one City parcel source and the stopped Flight route/aircraft. Composite framing covers regional and parcel bounds; zero Flight-local XR environment, City Three.js/R3F, or HTML-marker presentation remains. | Registered source/profile/projection/layer-order/framing/ownership/semantic-media cases and exact-candidate browser assertions exit 0. | none recorded for v2; prior runs did not cover the complete current contract |
| `VCC-CITY-03` | Save writes only the canonical path, verifies byte and semantic read-back, preserves malformed prior bytes, and restores the source-authored initial grid when persistence is absent. | Registered authored-source, codec, and persistence cases exit 0. | 2026-07-30 historical codec/persistence cases passed before the v1.8 source fallback contract |
| `VCC-CITY-04` | Advisor returns at most two deterministic rounds and one zero-token cost record without mutating a zone. | Registered Advisor cases exit 0 and surface round/cost assertions. | same authoring run; Advisor case passed |
| `VCC-CITY-05` | Parser accepts only the exact tuple and typed operations; every invalid input leaves the revision unchanged. | Registered invocation cases exit 0 with accepted/rejected counts. | same authoring run; invocation case passed |
| `VCC-CITY-06` | Exactly two catalogued embedded tools inspect/control the same dispatcher; no remote transport or deployment authority is added. | Registered MCP contract and source-ownership cases exit 0. | same authoring run; MCP/source cases passed |
| `VCC-CITY-07` | A clean browser reaches first tick within five actions/two minutes, then proves exact regional-profile identity and visible POIs, source-authored City grid/profile identity, regional → City → Flight layer order, direct live-canvas semantics, composite framing, owner-`city` stopped aerial projection, inactive Flight bootstrap/camera/readiness, save, stop fence, replay, padding restoration, and exit at one exact SHA. | Candidate-bound browser proof surfaces elapsed time, action count, SHA, and assertions. | none recorded |

## 14. PRD ↔ TAD ↔ VCC traceability

| PRD requirement | Product outcome | TAD component / interface | VCC |
|---|---|---|---|
| `PRD-CITY-01` | source ownership and fail-closed activation | `TAD-CITY-SOURCE` + `TAD-CITY-RUNTIME` / parse and dispatch | 01, 03, 07 |
| `PRD-CITY-02` | deterministic lifecycle and replay | `TAD-CITY-RUNTIME` + `TAD-CITY-MODEL` / dispatch and tick | 01, 07 |
| `PRD-CITY-03` | bounded non-mutating advice | `TAD-CITY-MODEL` / advise | 04 |
| `PRD-CITY-04` | canonical save and read-back | `TAD-CITY-PERSIST` / workspace adapter | 03 |
| `PRD-CITY-05` | input parity and typed rejection | `TAD-CITY-RUNTIME` + `TAD-CITY-INVOKE` + `TAD-CITY-PANELS` / normalized operation | 05, 07 |
| `PRD-CITY-06` | one composed semantic presentation | `TAD-CITY-GEOXR` / neutral surface ports | 02, 07 |
| `PRD-CITY-07` | trust-separated local inspect and control | `TAD-CITY-TOOLS` + `TAD-CITY-INVOKE` / shared dispatcher | 06, 07 |
| `PRD-CITY-08` | mobile and offline first value | `TAD-CITY-PANELS` + `TAD-CITY-PERSIST` / responsive projection and local save | 03, 07 |

The parent component inventory provides the reverse component-to-VCC mapping;
no component or requirement is intentionally orphaned.

## 15. Readiness Gap Matrix

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| deterministic runtime and Advisor | spec-complete | undocumented | historical evidence is not bound to v2; clean-browser proof incomplete | major | 01, 04, 07 |
| authored City grid/geographic profile, MapLibre parcel layers, semantic media figure, visible-aperture framing, independent aerial projection, and persistence | spec-complete | undocumented | v2 exact-SHA clean-browser proof absent | major | 01, 02, 03, 07 |
| invocation and embedded tools | spec-complete | undocumented | historical evidence is not bound to v2; no delivery proof | major | 05, 06, 07 |
| clean browser first value | spec-complete | undocumented | exact-SHA proof absent | major | 07 |
| Mirror and Delivery | undocumented | undocumented | targets absent and promotion not requested | none | separate promotion VCC required |

### Agent-platform dimensions and execution order

| Dimension | Tier | Order | Local rung | Delivered rung | VCC / disposition |
|---|---|---:|---|---|---|
| Agentic OS-ready | Won't this increment | — | undocumented | undocumented | no OS Status Surface declared |
| AI Agent-ready | Must | 1 | spec-complete | undocumented | 06, 07; embedded discovery only |
| MCP Gateway-ready | Won't this increment | — | undocumented | undocumented | remote gateway excluded; embedded tool disposition is recorded |

No follow-on work starts before VCC-06 is satisfied. Discovery and reads stay
at zero tokens; no agent-platform path can promote a candidate.

## 16. Lane topology and Deploy Boundary Register

| Lane | Function | Mutation rights | Data residency | Readiness ceiling |
|---|---|---|---|---|
| Authoring | write and prove one candidate | source, tests, browser-local state | maintainer worktree and user device | runtime-ready |
| Mirror | hold one approved non-public package | publish-only; currently absent | none | runtime-ready |
| Delivery | serve one promoted mirror | publish-only; currently absent | none | production-verified |

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement | State |
|---|---|---|---|---|---|---|
| `CITY-AUTHORING-TO-MIRROR` | Authoring | Mirror | none recorded | none; no promotion authorized | retain prior mirror and verify its manifest is unchanged | closed |
| `CITY-MIRROR-TO-DELIVERY` | Mirror | Delivery | none recorded | none; no promotion authorized | retain prior delivery revision and re-run its prior reachability check | closed |
