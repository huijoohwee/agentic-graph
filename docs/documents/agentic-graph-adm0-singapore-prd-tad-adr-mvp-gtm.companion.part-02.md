---
title: "Reference implementation: agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.5.1"
date: "2026-09-12"
lang: "en-US"
owner: "geospatial-environment-data-steward"
continuity_id: "PLAN-AGENTIC-GRAPH-ADM0-SINGAPORE-PRD-TAD-ADR-MVP-GTM-COMPANION"
prd_revision: "1.5.1"
tad_revision: "1.5.1"
adr_revision: "1.5.1"
mvp_revision: "1.5.1"
gtm_revision: "1.5.1"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.md"
guideline_revision: "2.7.0"
source_section_lines: "471-609"
---

[Combined planning owner](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.md) · `PLAN-AGENTIC-GRAPH-ADM0-SINGAPORE-PRD-TAD-ADR-MVP-GTM-COMPANION@1.5.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### ADR-SG-5: Prefer the zero-dependency FOSS-compatible data path

**Status:** Accepted
**Date:** 2026-07-31

**Context:** Locale presentation can be delivered as checked-in typed data, an
open-data ingestion pipeline, or a proprietary hosted environment service.

**Decision:** Use one checked-in dated OpenStreetMap-derived geographic
snapshot with ODbL attribution, derived local presentation data, official
height context, and existing shared open presentation capabilities. Add no
locale-specific runtime package, service, credential, token, model, asset
fetch, or runtime geodata request.

**FOSS and TCO comparison:**

| Variant | License/portability | 12-month cash TCO | Ops burden | Decision |
|---|---|---:|---:|---|
| Checked-in dated ODbL geographic snapshot plus local derivation | repository-auditable with attribution | $0 | low | selected |
| Runtime FOSS open-data request | portable when policy permits | $0 | medium | rejected for nondeterminism and offline failure |
| Proprietary hosted locale or building service | provider-coupled | at least $1,200 plus egress | medium | rejected |

**Consequences:** The current package is inspectable and offline. A refresh,
official boundary, or high-detail dataset requires a new version, source,
license, accuracy statement, and VCC rather than a hidden dependency.

## 7. VCC and Evidence Reference register

| VCC | Evaluator-checkable end state | Stated check | Constraint | Evidence Reference |
|---|---|---|---|---|
| `VCC-SG-01` | Exactly one `SGP` identity, one anchor, one center, and one presentation extent exist; framing and stage are never classified as an ADM0 polygon. | Focused locale-contract test plus terminology scan exits 0 and surfaces values. | No inferred filename identity or unsourced boundary. | none recorded |
| `VCC-SG-02` | Planar policy is north-up; volumetric policy uses the declared oblique values; both share center and extent. | Focused camera-policy test surfaces the four view-class results. | Locale owns values, not camera lifecycle. | none recorded |
| `VCC-SG-03` | Equal finite local inputs project equally with `+X east`, `-Z north`, `+Y up`; invalid inputs fail. | Focused projection test surfaces equal coordinate digests and rejection cases. | No second anchor or unit scale. | none recorded |
| `VCC-SG-04` | The exact six POIs retain twelve immutable regional-geographic surfaces, twelve source-derived XR presentation surfaces, and six topology-aware representative-point locators; every identity, complete Polygon ring set, base/top height, accuracy value, and provenance reference matches this companion. | Focused profile/source tests surface the unchanged geographic digest, valid topology and invalid-ring rejection, derived XR ring and identity equality, source-to-render completeness, locator invariance across concave, holed, disjoint, reordered, and antimeridian cases, and Geo rejection of local values. | No second POI geometry fixture, remote asset, or opaque POI geometry. | none recorded |
| `VCC-SG-05` | The regional profile projects through source `kg-geo-xr:regional-poi` and layers `kg-geo-xr:regional-poi:fill`, `kg-geo-xr:regional-poi:extrusion`, `kg-geo-xr:regional-poi:outline`, `kg-geo-xr:regional-poi:locator`, and `kg-geo-xr:regional-poi:label`; City state attaches one-to-one through the six exact `RegionalPoiIdentity.id` values, an independent Flight route or aircraft overlay remains separately owned, and MapLibre frames all six POIs while its live canvas remains the sole semantic selection owner. | Focused MapLibre and neutral browser checks compare twelve exact surfaces, complete ring/source-fact pass-through, six locators, five-layer order, direct canonical City identity joins, source-authoritative framing, direct canvas semantics, and a regional-feature union spanning at least 45% of one unobscured aperture axis. | City owns no geometry, dimensions, gaps, bearings, anchor, route, aircraft, derived XR presentation, active or visible Three.js/R3F presentation, HTML marker, generic selectable wrapper, or `aria-hidden`. | none recorded |
| `VCC-SG-06` | Locale selection and projection perform zero model, token, account, remote-locale, remote-asset, runtime-geodata, persistence, or new-dependency operations while retaining ODbL attribution. | Focused offline boundary and exact-property tests surface forbidden-call counts of zero. | Provider transport remains separately owned. | none recorded |
| `VCC-SG-07` | Generic Geo+XR and City documents contain no copied Singapore facts and reference this companion for locale data. | Document contract scan exits 0 and surfaces allowed references. | No compatibility alias or duplicate locale authority. | none recorded |
| `VCC-SG-08` | Mirror and delivery targets are absent and no source check is interpreted as delivery proof. | Lane contract check surfaces zero targets and `delivered_rung=undocumented`. | Promotion requires a separate authorized contract. | none recorded |

PRD-to-TAD-to-ADR traceability covers 8 of 8 in-scope PRD requirements
(`100%`).

> **Reference implementation: conformance profile.** The
> [selected split structural profile](./agentic-graph-prd-tad-adr-mvp-gtm-conformance-report.md#reference-implementation-2026-07-31-split-conformance)
> links 19 of 19 selected artifact-bearing rules (`100%`) and counts zero
> advisories. It is not a full guideline-set alignment claim and does not
> satisfy a VCC.

## 8. Readiness gap matrix

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criterion |
|---|---|---|---|---|---|
| ADM0 identity and semantic boundary | `spec-complete` | `undocumented` | no attached evaluator result | major | satisfying Evidence Reference for `VCC-SG-01` |
| Camera and local projection | `spec-complete` | `undocumented` | no attached evaluator result | major | satisfying Evidence References for `VCC-SG-02` and `VCC-SG-03` |
| Shared geographic POI profile, derived XR, and direct Geo locators | `spec-complete` | `undocumented` | no attached evaluator or browser result | major | satisfying Evidence References for `VCC-SG-04` and `VCC-SG-05` |
| Offline and ownership boundary | `spec-complete` | `undocumented` | no attached evaluator result | major | satisfying Evidence References for `VCC-SG-06` and `VCC-SG-07` |
| Mirror and delivery | `undocumented` | `undocumented` | lanes deliberately closed | none | separate owner, target, authorization, and VCC |

## 9. PRD to TAD to ADR traceability

| PRD requirement | TAD components | ADR | VCC |
|---|---|---|---|
| `PRD-SG-01` | `TAD-SG-IDENTITY`, `TAD-SG-GATE` | `ADR-SG-1` | `VCC-SG-01`, `VCC-SG-07` |
| `PRD-SG-02` | `TAD-SG-IDENTITY` | `ADR-SG-2` | `VCC-SG-01` |
| `PRD-SG-03` | `TAD-SG-CAMERA` | `ADR-SG-2` | `VCC-SG-02` |
| `PRD-SG-04` | `TAD-SG-PROJECT`, `TAD-SG-XR-PROJECTION` | `ADR-SG-2`, `ADR-SG-3` | `VCC-SG-03` |
| `PRD-SG-05` | `TAD-SG-POI`, `TAD-SG-STAGE`, `TAD-SG-REGIONAL` | `ADR-SG-3`, `ADR-SG-4` | `VCC-SG-04` |
| `PRD-SG-06` | `TAD-SG-POI`, `TAD-SG-REGIONAL`, `TAD-SG-XR-PROJECTION`, `TAD-SG-LOCATOR`, `TAD-SG-GATE` | `ADR-SG-3`, `ADR-SG-4` | `VCC-SG-04`, `VCC-SG-05` |
| `PRD-SG-07` | `TAD-SG-REGIONAL`, `TAD-SG-GATE` | `ADR-SG-5` | `VCC-SG-06` |
| `PRD-SG-08` | closed mirror and delivery boundaries | `ADR-SG-1` | `VCC-SG-08` |

## 10. Reference implementation: current source projection

This section names the current repository projection only. The contracts above
remain neutral and are not inferred from these paths.

| Contract concern | Current source module or document | Current symbol or role |
|---|---|---|
| ADM0 and address-derived Singapore metadata | `grph-shared/src/geospatial/sgpAdministrativeAreas.ts` | `deriveSgAdministrativeAreasFromAddress` preserves `SGP`; postal and planning-area derivation is below ADM0 and is not a boundary source |
| Anchor, center, presentation extent, and local projection | `grph-shared/src/geospatial/singaporeFlightGeo.ts` | `SINGAPORE_FLIGHT_GEO_REFERENCE`, `projectSingaporeLocalMeters` |
| MapLibre initial presentation policy | `gympgrph/src/features/geospatial/singaporeMapPolicy.ts` | north-up and oblique policies for the four current view modes |
| Singapore stage catalog | `canvas/src/features/three/xrSceneLibrary.ts` | stage ID `singapore`, 32 by 24 metre terrain, and the shared regional-profile identity |
| Shared Singapore POI identity roster | `grph-shared/src/geospatial/singaporeMajorPoiIdentity.ts` | `SINGAPORE_MAJOR_POI_IDENTITIES`, `SingaporeMajorPoiId` |
| Neutral regional POI contract and locators | `grph-shared/src/geospatial/regionalPoiGeo.ts` | `RegionalPoiProfile`, `RegionalPoiSurface`, `createRegionalPoiProfile`, `deriveRegionalPoiLocators` |
| Neutral Polygon topology, longitude span, and representative point | `grph-shared/src/geospatial/regionalPoiGeometry.ts` | ring admission, per-polygon continuity-safe longitude frames, circular area weighting, latitude-aware net-area centroids, and deterministic point-on-surface fallback shared by locators, XR, City, and Flight framing |
| Singapore regional geographic POI source | `grph-shared/src/geospatial/singaporeMajorPoiGeo.ts` | `SINGAPORE_MAJOR_POI_GEO_PROFILE` with this companion's exact rings, heights, accuracy, provenance, policy, and attribution |
| Derived local XR adapter | `canvas/src/features/three/regionalPoiXrPresentation.ts`, `canvas/src/features/three/xrSingaporeEnvironmentSource.ts` | uniformly fitted `XR_SINGAPORE_MAJOR_POIS` and `XR_SINGAPORE_MAJOR_POI_SURFACES`; no independent geometry values |
| React Three Fiber terrain presentation | `canvas/src/features/three/XrSingaporeTerrainGeometry.tsx` | consumes only the derived XR presentation |
| Exact Flight Geo environment projection | `canvas/src/features/game-flight-sim/flightSimGeoEnvironmentProjection.ts` | `projectXrEnvironmentToFlightGeo`; regional POIs bypass local-stage projection and retain exact rings/metres |
| Flight MapLibre environment projection | `gympgrph/src/flightGeoEnvironmentMapLibreProjection.ts`, `gympgrph/src/flightGeoEnvironmentMapLibre.ts` | exact full Polygon rings and typed accuracy/provenance plus independently typed local stage/subject features for Flight only |
| Regional profile admission | `canvas/src/features/geospatial/regionalPoiProfileCatalog.ts` | exact profile-id resolution; unknown identity fails |
| Regional MapLibre source projection | `gympgrph/src/regionalPoiMapLibreProjection.ts` | twelve exact Polygon features plus six derived Point locators |
| Regional MapLibre presentation | `gympgrph/src/regionalPoiMapLibre.ts` | source `kg-geo-xr:regional-poi`; surface fill, extrusion, outline, fixed-pixel locator, and collision-aware variable-anchor label layers |
| City state projection and framing | `canvas/src/features/game-city-sim/citySimGeospatialProjection.ts`, `gympgrph/src/cityGeoOverlayMapLibreController.ts` | exact canonical POI identity joins on the shared regional source; source-authoritative profile framing without City geometry or camera ownership |
| Existing focused POI proof source | `grph-shared/__tests__/regional-poi-geo.test.mjs`, `canvas/src/__tests__/flightSimSingaporePoiExtrusion.test.ts`, `canvas/src/__tests__/regionalPoiMapLibre.test.ts` | unchanged source digest, locator invariance, derived-XR identity, exact Flight Geo rings/heights, five-layer repair, and stale-property rejection |
| Generic mode authority | `docs/documents/agentic-graph-geo-xr-mode-prd-tad-adr-mvp-gtm.md` | shared surface, semantic wrapper, lifecycle, input, camera, and overlay ownership |
| City product authority | `docs/documents/agentic-graph-game-city-building-sim-prd-tad-adr-mvp-gtm.md` | POI-keyed zoning state, economy, advice, persistence, and City actions |

The current renderer libraries are implementation choices inside the generic
surface owner. This companion has no direct dependency on MapLibre, React,
React Three Fiber, Three.js, a provider SDK, or a hosted locale service.

## 11. Change policy

Any change to ADM0 identity, anchor, center, extent, camera values, stage size,
axis mapping, POI roster, XR derivation policy, geographic ring, locator policy,
base/top height, accuracy, provenance, attribution, snapshot, or data policy
increments this document's semantic version and reruns the mapped VCCs. A new
official boundary, data source, remote dependency, or opened mirror/delivery
lane requires its own ADR and evidence contract. Stale Singapore facts in
generic or application documents are removed at their source; they are never
retained through aliases, remapping, or compatibility prose.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-ADM0-SINGAPORE-PRD-TAD-ADR-MVP-GTM-COMPANION@1.5.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [3. PRD](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#3-prd) |
| TAD | [5. TAD](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#5-tad) |
| ADR | [6. Architecture decisions](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-01.md#6-architecture-decisions) |
| MVP | [MVP — reference implementation](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-adm0-singapore-prd-tad-adr-mvp-gtm.companion.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`grph-shared/src/geospatial/sgpAdministrativeAreas.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/grph-shared/src/geospatial/sgpAdministrativeAreas.ts), [`grph-shared/src/geospatial/singaporeFlightGeo.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/grph-shared/src/geospatial/singaporeFlightGeo.ts), [`gympgrph/src/features/geospatial/singaporeMapPolicy.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/gympgrph/src/features/geospatial/singaporeMapPolicy.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
