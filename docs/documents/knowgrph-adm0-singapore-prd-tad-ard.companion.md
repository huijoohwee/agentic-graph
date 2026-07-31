---
title: "Singapore ADM0 Environment Companion PRD/TAD/ADR"
id: "md:adm0-singapore-environment-companion"
doc_type: "PRD/TAD/ADR Companion"
version: "1.1.0"
date: "2026-07-31"
lang: "en-US"
owner: "geospatial-environment-data-steward"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
guideline_version: "1.7.0"
frontmatter_contract: "required"
---

# Singapore ADM0 Environment Companion PRD/TAD/ADR

## 1. Authority and boundary

This companion is the sole document authority for the Singapore-specific environment contract consumed by reusable surface modes and compatible applications. It owns:

- ADM0 identity `SGP` and display identity `Singapore`;
- the local-stage geographic anchor and axis convention;
- the presentation center and viewport extent;
- planar and oblique initial camera policies;
- the selected Singapore terrain dimensions;
- the named major-POI roster and its schematic local-metre XR surfaces;
- regional geographic POI profile `adm0:SGP:major-pois/v1`, revision `2026-07-31.1`;
- the exact checked-in geographic rings, real-metre base/top heights, accuracy statements, OpenStreetMap snapshot provenance, official height context, attribution, and no-runtime-network policy for that profile; and
- the distinction among an ADM0 identity, presentation framing, a local stage
  footprint, and authoritative geographic boundaries.

The generic mode document owns surface composition, renderer and input arbitration, semantic media wrappers, overlay slots, lifecycle, and provider adapters. The City document owns parcels, zoning, economy, advice, persistence, and City actions. Flight and other applications own their own simulation state. This companion supplies locale data to those owners and does not redefine, specialize, or alias their contracts.

No polygon in this companion is asserted to be an administrative, legal, surveyed, cadastral, navigational, or emergency-response boundary. The viewport extent frames a presentation. The 32 by 24 metre stage and its nine local-metre POI surfaces are authored schematic XR scene data for Flight-local use only. They are not geographic POI geometry and City never projects them. The separate regional profile uses dated OpenStreetMap source polygons; those geographic rings support MapLibre presentation but are not surveyed building models.

## 2. Readiness and lane statement

| Concern | Local rung | Delivered rung | Statement |
|---|---|---|---|
| Product and architecture contract | `spec-complete` | `undocumented` | Requirements, typed boundaries, decisions, and VCCs are stated. |
| Source implementation | `spec-complete` | `undocumented` | Source owners exist, but no result is attached to this revision. |
| Mirror lane | `undocumented` | `undocumented` | Closed: no mirror target is declared by this companion. |
| Delivery lane | `undocumented` | `undocumented` | Closed: no public environment artifact or release target is declared. |

The document makes no runtime-ready, integration, production, or deployment claim. A named command is a planned evaluator; it is not an Evidence Reference until its immutable result, revision, and environment are recorded.

## 3. PRD

### 3.1 Problem and outcome

Locale facts previously embedded in simulator or mode descriptions can drift, be mistaken for generic architecture, or turn a viewport rectangle into an accidental boundary claim. A single locale companion must make those facts reviewable while allowing the generic surface and each application to remain place-agnostic.

The outcome is one source-authored Singapore package with two non-interchangeable POI representations: a Flight-local schematic XR stage in authored metres and a checked-in regional geographic profile with exact rings, real-metre heights, accuracy, and provenance. A conforming consumer selects the representation its port requires without scaling, aliasing, or layering one as a substitute for the other, and this package gains no renderer, interaction, simulation, persistence, provider, or delivery ownership.

### 3.2 Personas

**Primary persona — environment data steward.** The steward changes a Singapore-specific anchor, camera policy, local XR POI, or geographic POI snapshot once and expects every conforming consumer to receive the correct typed revision.

**Secondary persona — reviewer.** The reviewer needs to prove that the ADM0 identity, viewport extent, stage footprint, and POI geometry are distinct concepts and that no generic mode or application contract is duplicated here.

**Tertiary persona — operator.** The operator selects the Singapore environment and expects a stable initial view with recognizable, aligned POIs in planar and volumetric presentations.

### 3.3 Primary journey

| Stage | Actor action | Locale owner response | Completion signal |
|---|---|---|---|
| Inspect | Review ADM0 identity and scope | Expose `SGP`, Singapore, and boundary disclaimers | No presentation rectangle is labelled as an ADM0 polygon |
| Select | Select Singapore context | Resolve one locale revision with distinct local-XR and regional-geographic profiles | One exact profile identity per consumer port |
| Project | Enter Flight-local XR or geographic MapLibre presentation | Use local authored metres only for XR; use checked-in geographic rings and real-metre heights only for MapLibre | No local-to-geographic POI remap or duplicate world |
| Verify | Inspect the three named major POIs | Surface stable identities, explicit accuracy, provenance, and representation class | Both nine-surface rosters match their own source |
| Exit | Leave or replace the environment | Release only locale data | Consumer lifecycle and prior surface remain consumer-owned |

### 3.4 User stories

- `PRD-SG-01` — As a steward, I can maintain the Singapore ADM0 identity in one locale contract so generic and application documents contain no copied facts.
- `PRD-SG-02` — As a reviewer, I can distinguish the presentation extent from an administrative boundary and the stage footprint from either.
- `PRD-SG-03` — As an operator, I receive a north-up planar initial view and an oblique volumetric initial view from one Singapore camera policy.
- `PRD-SG-04` — As a consumer, I can project local metres through one anchor and axis convention without a second geography or compatibility alias.
- `PRD-SG-05` — As an operator, I can identify Marina Bay Sands, Singapore Flyer, and Gardens by the Bay through stable semantic POI identities.
- `PRD-SG-06` — As a reviewer, I can distinguish the nine local schematic, non-collidable XR surfaces from the nine regional geographic MapLibre surfaces and verify that neither is remapped into the other.
- `PRD-SG-07` — As a maintainer, I can validate exact geographic rings, real-metre heights, dated provenance, and attribution locally without a model, token, account, runtime network call, remote asset, or new runtime dependency.
- `PRD-SG-08` — As a delivery owner, I can see that mirror and delivery lanes are closed until a separate authorized contract opens them.

### 3.5 Must, should, could, will not

| Priority | Scope |
|---|---|
| Must | One ADM0 identity; one anchor; one axis convention; one presentation center and extent; two camera-policy classes; one local XR stage; three POI identities; separate nine-surface local-XR and geographic rosters; exact geographic rings; real-metre heights; dated geometry/height provenance; ODbL attribution; explicit accuracy and non-boundary disclaimers; VCC coverage. |
| Should | Human-readable labels, stable revisions, accessible inspection metadata, exact source-to-presentation equality checks, and failure on unknown POI identity. |
| Could | A future separately sourced official ADM0 polygon or additional Singapore profile variants, each admitted by a new requirement and VCC. |
| Will not | Own a generic mode, map provider, renderer, camera mechanism, application state, City logic, Flight logic, legal boundary, navigation product, hosted API, account, model, release lane, OS Status Surface, Agent Discovery Surface, or Gateway Federation Contract. |

### 3.6 Time to value, measures, and economics

| TTV dimension | Estimate | Ceiling | Validation |
|---|---:|---:|---|
| Manual actions | 1 environment selection | 1 | clean-source walk-through |
| Elapsed time after consumer readiness | 1 committed frame | 1 second | timed projection assertion |
| First value | stable regional context | — | identity, camera, and POI snapshot |

| Measure | Baseline | Target | Timeline |
|---|---:|---:|---|
| Select-to-stable initial environment projection | no candidate-bound observation | at most 1 committed presentation frame after the consumer is ready | first satisfying VCC run |
| Locale choices required after selecting Singapore | no candidate-bound observation | 0 | first satisfying VCC run |
| ADM0 identities in this package | unvalidated | exactly 1 | authoring gate |
| Geographic anchors | unvalidated | exactly 1 | authoring gate |
| Named major POIs | unvalidated | exactly 3 | authoring gate |
| POI presentation surfaces | unvalidated | exactly 9 | authoring gate |
| Regional geographic POI surfaces | unvalidated | exactly 9 | authoring gate |
| Runtime network calls for regional POI data | unvalidated | exactly 0 | every run |
| Required model or token calls | unvalidated | 0 | every run |
| Required remote locale or asset calls | unvalidated | 0 | every run |
| Added runtime dependencies | current repository baseline | 0 | integration gate |
| Locale-owned renderers, cameras, and persistence stores | unvalidated | 0 | every run |

The min-viable-max-value path is checked-in typed locale data plus the existing shared projection and presentation owners. Marginal runtime cost, model cost, token cost, locale storage operations, and locale delivery operations are zero. Provider transport and application costs remain outside this companion and must be attributed to their actual owners.

| Feature | Tier | Impact | Sessions/month | Build hours | Monthly TCO/token cost | ROI score |
|---|---|---:|---:|---:|---:|---:|
| ADM0 identity, framing, and camera policy | Must | 5 | 20 | 20 | $0 | 5.00 |
| Semantic POI roster and projection | Must | 4 | 12 | 24 | $0 | 2.00 |
| Official administrative polygon | Won't | 2 | 2 | 80 | $10 | 0.04 |

The Must threshold is `2.0`, using `(impact × sessions) / (build hours + monthly TCO + monthly token cost)`.

### 3.7 Given/When/Then acceptance criteria

**AC-SG-01 — Identity and boundary honesty.** Given the locale package, when a reviewer inspects its geographic values, then `SGP` is the only ADM0 code, Singapore is the display identity, the viewport rectangle is labelled presentation framing, and no local-stage ring is described as an administrative or legal boundary.

**AC-SG-02 — Deterministic local projection.** Given finite local coordinates, when they are projected, then positive local X moves east, negative local Z moves north, Y remains height in metres, and repeated equal inputs return equal coordinates. Non-finite inputs fail before projection.

**AC-SG-03 — Camera policy.** Given a planar view, when Singapore is framed, then bearing and pitch are zero. Given a volumetric view, when Singapore is framed, then the declared oblique bearing and pitch are used. Both policies use the same center and presentation extent and do not create a camera owner.

**AC-SG-04 — Major POIs.** Given Singapore context, when its profiles resolve, then the roster is exactly Marina Bay Sands, Singapore Flyer, and Gardens by the Bay. The local XR profile retains nine stable schematic, non-collidable surfaces in authored metres. The regional geographic profile independently retains nine stable surfaces with exact closed rings, real-metre base/top heights, accuracy, and provenance.

**AC-SG-05 — Consumer projection.** Given the locale package and a conforming consumer, when Flight-local XR is requested, then only the authored-metre schematic stage is eligible. When regional geographic context is requested, then only the checked-in geographic profile is eligible and its exact rings and real-metre heights remain unchanged. City may frame the regional features with parcels but cannot consume the local XR stage.

**AC-SG-06 — Ownership and offline boundary.** Given environment selection, when the package is read and projected, then it mounts no renderer, owns no input or simulation state, persists nothing, and performs no model, token, account, remote-locale, remote-asset, or runtime geodata call. The checked-in OpenStreetMap snapshot retains attribution and ODbL identity.

## 4. Locale data contract

### 4.1 ADM0 identity and presentation reference

| Field | Normative value | Meaning |
|---|---|---|
| `adm0Code` | `SGP` | Country-level identity |
| `displayName` | `Singapore` | Human-readable locale identity |
| `localAnchor` | `[103.851959, 1.29027]` | Origin for authored local metres |
| `presentationCenter` | `[103.8198, 1.3521]` | Initial viewport center |
| `presentationSouthwest` | `[103.605, 1.158]` | Presentation framing only |
| `presentationNortheast` | `[104.09, 1.48]` | Presentation framing only |
| `stageSizeMeters` | `[32, 24]` | Authored local terrain width and depth |
| `axisConvention` | `+X east; -Z north; +Y up` | Local-to-geographic and height mapping |

Coordinates are ordered `[longitude, latitude]`. Local positions and sizes are metres. The longitude conversion uses latitude-adjusted metres per degree; the latitude conversion uses a fixed metres-per-degree approximation. This is a bounded presentation transform, not a geodetic-survey method.

### 4.2 Camera policies

| Policy | Applicable view classes | Bearing | Pitch | Zoom cap | Maximum pitch | Fit padding |
|---|---|---:|---:|---:|---:|---:|
| North-up | planar classic and planar modern | `0` | `0` | `12` | `60` | `32` |
| Oblique city | volumetric classic and volumetric modern | `-18` | `55` | `12.8` | `85` | `32` |

These values are initial presentation data. The generic surface retains camera mechanism, interaction, lifecycle, resize, and restoration ownership.

### 4.3 Flight-local schematic XR surface roster

This roster belongs only to the 32 by 24 metre local XR stage. Its positions and sizes are authored local metres, not longitude/latitude or real landmark height. Flight may use it as local schematic scene context; City and the regional MapLibre adapter may not consume or remap it.

| POI ID | Surface ID | Presentation | Position `[x,y,z]` m | Size `[w,h,d]` m |
|---|---|---|---|---|
| `marina-bay-sands` | `marina-bay-sands:tower-west` | tower | `[-2.25,1.6,-9.45]` | `[1.42,3.2,1.38]` |
| `marina-bay-sands` | `marina-bay-sands:tower-center` | tower | `[0,1.8,-9.55]` | `[1.42,3.6,1.38]` |
| `marina-bay-sands` | `marina-bay-sands:tower-east` | tower | `[2.25,1.675,-9.4]` | `[1.42,3.35,1.38]` |
| `marina-bay-sands` | `marina-bay-sands:skypark` | skypark | `[0,3.78,-9.46]` | `[7.2,0.42,1.34]` |
| `singapore-flyer` | `singapore-flyer:wheel` | observation wheel | `[-8.5,3.55,-8.75]` | `[5.1,5.1,0.42]` |
| `gardens-by-the-bay` | `gardens-by-the-bay:supertree-west` | supertree | `[6.9,1.734,-7.35]` | `[2.754,3.468,2.754]` |
| `gardens-by-the-bay` | `gardens-by-the-bay:supertree-center` | supertree | `[8.8,1.394,-6.55]` | `[2.214,2.788,2.214]` |
| `gardens-by-the-bay` | `gardens-by-the-bay:supertree-east` | supertree | `[10.2,1.768,-7.75]` | `[2.808,3.536,2.808]` |
| `gardens-by-the-bay` | `gardens-by-the-bay:supertree-north` | supertree | `[10.8,1.156,-5.15]` | `[1.836,2.312,1.836]` |

All nine surfaces are `kind=poi`, `collidable=false`, and source-authored. Colors and visual ornament are presentation hints, not identity or boundary data. Changing a label, ID, position, size, or parent changes the locale revision and requires the relevant VCCs to be rerun.

### 4.4 Regional geographic MapLibre POI profile

| Field | Normative value |
|---|---|
| Schema / profile / revision | `knowgrph.regional-poi-profile/v1` / `adm0:SGP:major-pois/v1` / `2026-07-31.1` |
| Snapshot | `2026-07-31T00:00:00Z` |
| Policy | `storage=checked-in`; `runtimeNetwork=forbidden` |
| Attribution | `© OpenStreetMap contributors`; `https://www.openstreetmap.org/copyright`; `Open Data Commons Open Database License 1.0`; `https://opendatacommons.org/licenses/odbl/1-0/` |
| Presentation | one MapLibre `regional-context` band below City parcels and stopped Flight route/aircraft; no active or visible Three.js/R3F presentation and no HTML marker |

`base` and `top` below are metres above the profile ground plane. For dated OpenStreetMap ways, the snapshot polygon and recorded heights are render authority; official references are accuracy context. The Flyer is the explicit exception only for height: OSM way `230082125` v19 is exact geometry authority, while the official source supplies its 165 metre top height. Its thin MapLibre fill extrusion is geographic massing, not wheel morphology or a podium footprint.

| Surface | Exact geometry authority | Base / top m | Footprint / height accuracy | Official context |
|---|---|---:|---|---|
| `marina-bay-sands:tower-1` | OSM way `116801004` v24 | `0 / 193` | `source-polygon / source-recorded` | Marina Bay Sands architecture: towers about 191 m; OSM remains render authority |
| `marina-bay-sands:tower-2` | OSM way `172307472` v20 | `0 / 193` | `source-polygon / source-recorded` | same |
| `marina-bay-sands:tower-3` | OSM way `172307471` v22 | `0 / 193` | `source-polygon / source-recorded` | same |
| `marina-bay-sands:skypark` | OSM way `116800998` v37 | `193 / 207` | `source-polygon / source-recorded` | Marina Bay Sands architecture: rooftop observation deck 200 m; OSM remains render authority |
| `singapore-flyer:wheel` | OSM way `230082125` v19 | `0 / 165` | `source-polygon / official-published` | Singapore Flyer official Fun Facts |
| `gardens-by-the-bay:supertree-681695804` | OSM way `681695804` v4 | `17 / 33` | `source-polygon / source-recorded` | Gardens by the Bay official 25–50 m range; OSM remains render authority |
| `gardens-by-the-bay:supertree-572839881` | OSM way `572839881` v6 | `0 / 46` | `source-polygon / source-recorded` | same |
| `gardens-by-the-bay:supertree-572839873` | OSM way `572839873` v6 | `33 / 36` | `source-polygon / source-recorded` | same |
| `gardens-by-the-bay:supertree-681695795` | OSM way `681695795` v4 | `27 / 33` | `source-polygon / source-recorded` | same |

Exact closed outer rings are ordered `[longitude,latitude]`:

- `marina-bay-sands:tower-1`: `[[103.8605263,1.2827539],[103.8604802,1.2827859],[103.8601414,1.2830212],[103.8599199,1.2827024],[103.8598409,1.2825888],[103.8602258,1.2823215],[103.8605263,1.2827539]]`
- `marina-bay-sands:tower-2`: `[[103.8606018,1.2839324],[103.860369,1.2834367],[103.8607815,1.2832456],[103.8610143,1.2837414],[103.860892,1.2837988],[103.8606018,1.2839324]]`
- `marina-bay-sands:tower-3`: `[[103.8611752,1.2846907],[103.8611459,1.284699],[103.8610342,1.2847306],[103.8610137,1.2846581],[103.8609398,1.284679],[103.8608858,1.2846942],[103.8607721,1.2842924],[103.8610409,1.2842163],[103.8611752,1.2846907]]`
- `marina-bay-sands:skypark`: `[[103.8609826,1.2848989],[103.8610173,1.285036],[103.8610442,1.2850909],[103.8610808,1.2851351],[103.8611099,1.2851541],[103.8611359,1.2851574],[103.8611632,1.2851505],[103.8611939,1.2851262],[103.8612164,1.2850935],[103.8612318,1.2850442],[103.8612425,1.2849657],[103.8612569,1.2848545],[103.8612302,1.2846658],[103.8611969,1.2844555],[103.8611461,1.284261],[103.8610867,1.2840541],[103.8609999,1.2838001],[103.8608748,1.2835139],[103.8607372,1.2832315],[103.8605401,1.2829092],[103.8604051,1.2826851],[103.8600916,1.2822886],[103.859959,1.2823283],[103.8598747,1.2824039],[103.8598239,1.2825055],[103.8599698,1.282688],[103.8601815,1.2829848],[103.8602257,1.2830433],[103.8603308,1.2832159],[103.860497,1.2835257],[103.8606228,1.2838056],[103.8606844,1.2839598],[103.860746,1.2841248],[103.860846,1.2844417],[103.8609147,1.2847022],[103.8609826,1.2848989]]`
- `singapore-flyer:wheel`: `[[103.8625828,1.2890295],[103.8636235,1.2898476],[103.8636678,1.2897913],[103.8626271,1.2889732],[103.8625828,1.2890295]]`
- `gardens-by-the-bay:supertree-681695804`: `[[103.8634673,1.2819593],[103.8634522,1.2819617],[103.8634391,1.2819696],[103.8634299,1.2819818],[103.8634261,1.2819967],[103.8634281,1.2820119],[103.8634357,1.2820251],[103.863438,1.2820276],[103.8634508,1.2820359],[103.8634659,1.2820388],[103.8634809,1.2820359],[103.8634937,1.2820274],[103.8635023,1.2820147],[103.8635055,1.2819998],[103.8635029,1.2819847],[103.8634947,1.2819718],[103.8634822,1.2819628],[103.8634673,1.2819593]]`
- `gardens-by-the-bay:supertree-572839881`: `[[103.8640295,1.2818615],[103.8640131,1.2818452],[103.8639941,1.2818322],[103.863973,1.2818229],[103.8639505,1.2818176],[103.8639275,1.2818165],[103.8639046,1.2818197],[103.8638827,1.281827],[103.8638625,1.2818383],[103.8638447,1.281853],[103.86383,1.2818708],[103.8638188,1.2818909],[103.8638114,1.2819128],[103.8638083,1.2819357],[103.8638093,1.2819587],[103.8638146,1.2819812],[103.8638239,1.2820023],[103.863837,1.2820214],[103.8638533,1.2820377],[103.8638724,1.2820507],[103.8638935,1.2820601],[103.8639159,1.2820653],[103.863939,1.2820664],[103.8639619,1.2820632],[103.8639838,1.2820559],[103.8640039,1.2820446],[103.8640217,1.2820299],[103.8640365,1.2820121],[103.8640477,1.2819919],[103.864055,1.28197],[103.8640582,1.2819472],[103.8640571,1.2819242],[103.8640519,1.2819017],[103.8640425,1.2818806],[103.8640295,1.2818615]]`
- `gardens-by-the-bay:supertree-572839873`: `[[103.8642248,1.2823002],[103.8642124,1.2822805],[103.8641962,1.2822674],[103.8641768,1.2822599],[103.864156,1.2822587],[103.8641358,1.2822639],[103.8641182,1.282275],[103.8641049,1.282291],[103.8640971,1.2823103],[103.8640956,1.2823311],[103.8641006,1.2823513],[103.8641131,1.2823709],[103.8641316,1.282385],[103.8641537,1.282392],[103.864177,1.282391],[103.8641985,1.2823822],[103.8642157,1.2823665],[103.8642265,1.282346],[103.8642296,1.2823229],[103.8642248,1.2823002]]`
- `gardens-by-the-bay:supertree-681695795`: `[[103.8638425,1.2823918],[103.8638272,1.2823942],[103.8638139,1.2824022],[103.8638046,1.2824146],[103.8638008,1.2824296],[103.8638028,1.2824449],[103.8638106,1.2824583],[103.8638128,1.2824608],[103.8638258,1.2824692],[103.863841,1.2824722],[103.8638562,1.2824692],[103.8638691,1.2824606],[103.8638779,1.2824478],[103.8638811,1.2824327],[103.8638784,1.2824174],[103.8638701,1.2824044],[103.8638576,1.2823954],[103.8638425,1.2823918]]`

Official context references are `https://www.marinabaysands.com/guides/exceptional-experiences/marina-bay-sands-architecture.html`, `https://www.singaporeflyer.com/en/fun-facts`, and `https://www.gardensbythebay.com.sg/en/about-us/media-room/2007.html`, each recorded as accessed at the snapshot timestamp. They contextualize accuracy; only the source identified per surface is render authority.

## 5. TAD

### 5.1 Typed boundaries

| Type | Required fields | Invariants |
|---|---|---|
| `Adm0EnvironmentIdentity` | `adm0Code`, `displayName` | one immutable identity; no inferred filename identity |
| `PresentationReference` | `localAnchor`, `presentationCenter`, `presentationBounds`, `axisConvention` | finite coordinates; ordered longitude/latitude; bounds are not an ADM0 polygon |
| `EnvironmentCameraPolicy` | `viewClass`, `center`, `bounds`, `bearing`, `pitch`, `zoom`, `maxPitch`, `padding` | policy supplies values but owns no camera |
| `EnvironmentStage` | `id`, `label`, `kind`, `sizeMeters`, `structures` | one Flight-local Singapore terrain; positive finite dimensions |
| `LocalXrPoiSurface` | `id`, `poiId`, `label`, `presentation`, `position`, `size`, `color`, `collidable` | stable IDs; positive authored-metre size; non-collidable; never geographic |
| `RegionalPoiSourceReference` | `authority`, `sourceId`, `sourceUrl`, `sourceVersion`, `snapshotAt` | exact HTTPS source and UTC snapshot; no missing provenance |
| `RegionalPoiSurface` | `id`, `poiId`, `label`, `category`, geographic Polygon, base/top metres, accuracy, provenance | closed exact rings; top exceeds base; no local-stage coordinates |
| `RegionalPoiProfile` | schema, identity, region, revision, data policy, attribution, POIs, surfaces | checked-in; runtime network forbidden; exact three identities and nine surfaces |
| `EnvironmentProjection` | `id`, `label`, `anchor`, `presentationBounds`, `stageFootprint`, `surfaces`, `revision` | local XR only; one input revision yields one ordered immutable projection |

Unknown identities, non-finite distances, non-positive dimensions, open or invalid geographic rings, missing POI parents or provenance, duplicate surface IDs, unexpected network policy, or extra legacy properties fail closed. No fallback alias, local-to-geographic POI remap, or remapped legacy locale identifier is admitted.

### 5.2 Workflow and data flow

| Step | Input | Owner action | Output | Failure |
|---|---|---|---|---|
| 1. Resolve | selected profile ID and consumer port | Resolve exact local-XR stage or regional-geographic profile | one immutable typed profile | unknown or cross-class ID fails |
| 2. Validate | identity, local-stage values, geographic values, provenance | Check exact shapes, finiteness, uniqueness, rings, heights, policy, attribution | admitted locale revision | malformed value fails |
| 3a. Project local XR | local X/Y/Z metres | Preserve one anchor and axis convention for the Flight-local stage | local environment snapshot | City or geographic consumer fails |
| 3b. Publish regional context | checked-in geographic surfaces | Preserve exact rings, real-metre heights, accuracy, and provenance | regional-context snapshot | local-stage input fails |
| 4. Present | typed snapshot plus consumer view class | Use the compatible renderer port without rewriting source values | one aligned presentation | no second surface or HTML marker is created |
| 5. Frame City | regional bounds plus parcel bounds | Let native MapLibre frame the union inside the visible aperture | one composite camera request | locale package owns no camera |
| 6. Release | environment replacement or exit | Drop locale snapshot only | consumer-controlled restoration | no locale-owned cleanup side effect |

Data direction is one way:

`Singapore local-XR source -> validation -> immutable local environment snapshot -> Flight-local consumer`.

`Singapore regional source -> validation -> immutable geographic rings/heights/provenance -> regional-context MapLibre consumer`.

Application state never flows back into either locale source. Flight may read
the local XR snapshot. City may reference the regional profile and frame its
bounds with parcels. Neither may mutate anchor, rings, heights, provenance,
camera policy, revision, or stage geometry.

**Alternate path:** a consumer requests planar presentation; geographic height
remains in the snapshot while the MapLibre adapter uses its planar layer.

**Error path:** invalid identity, coordinate, dimension, parent, or revision
rejects the complete candidate and preserves the last admitted snapshot.

**Postconditions:** one exact typed snapshot is accepted by its compatible
port, or no locale state changes.

### 5.3 Deterministic orchestration/harness flow

**Topology pattern:** sequential
**Max iterations:** 1
**Circuit-breaker:** first validation or consumer-admission failure
**Token budget:** 0 prompt + 0 completion at 100% no-call rate = $0 per run

| Role | Component | Input schema | Output schema | Cost log | Fallback |
|---|---|---|---|---|---|
| Dispatcher | locale resolver | exact environment identity | authored candidate | — | typed unknown-identity error |
| Executor | validation and projection adapter | typed locale candidate | immutable environment snapshot | model `none`; all token/cost fields zero | retain last admitted snapshot |
| Observer | revision recorder | candidate and result | bounded diagnostic | — | report telemetry gap |
| Consumer | generic surface port | environment snapshot | accepted or rejected revision | — | unchanged composed surface |

### 5.4 Topology and lane boundaries

**Topology version note:** v1.1 separates the local-XR and
regional-geographic locale sources, their compatible consumer ports, and the
closed promotion boundaries. A later delta must version this topology rather
than overwrite its ownership semantics.

| Boundary | Inputs | Outputs | Prohibited ownership |
|---|---|---|---|
| Local-XR source | authored ADM0, framing, stage, and schematic POI values | immutable typed local metres | geographic POI presentation, rendering, input, application state |
| Regional-geographic source | exact rings, real-metre heights, accuracy, provenance, attribution | immutable regional profile | local XR environment, camera, provider, runtime network |
| Projection adapters | one typed profile plus compatible port | local environment or regional-context snapshot | cross-class remap, second geography, camera, provider |
| Generic surface | compatible snapshot plus view class | visible planar or volumetric presentation | locale mutation |
| Application consumer | read-only environment snapshot | application overlay composed in its own slot | locale or generic-surface ownership |
| Mirror lane | none | none | implicit copy or generated authority |
| Delivery lane | none | none | deployment or public-readiness inference |

```mermaid
flowchart TB
  subgraph A["Authoring boundary"]
    Local["Local-XR source"] -->|local metres| LocalPort["Local environment port"]
    Regional["Regional-geographic source"] -->|rings, heights, provenance| RegionalPort["Regional-context port"]
    LocalPort -->|immutable local snapshot| Consumer["Compatible consumer"]
    RegionalPort -->|immutable geographic snapshot| Consumer
  end
  subgraph M["Mirror boundary — absent"]
    Mirror["Approved mirror"]
  end
  subgraph D["Delivery boundary — absent"]
    Delivery["Delivery surface"]
  end
  A -. "closed batch promotion" .-> Mirror
  Mirror -. "closed batch promotion" .-> Delivery
```

| Boundary | From | To | Evidence Reference | Operator instruction | Rollback statement | State |
|---|---|---|---|---|---|---|
| `SG-AUTHORING-TO-MIRROR` | Authoring | Mirror | none recorded | none | retain prior mirror and verify its manifest | closed |
| `SG-MIRROR-TO-DELIVERY` | Mirror | Delivery | none recorded | none | retain prior delivery and rerun its reachability check | closed |

### 5.5 Component inventory

| Component ID | Interface | Responsibility | Local rung | Delivered rung | VCCs |
|---|---|---|---|---|---|
| `TAD-SG-IDENTITY` | `readEnvironmentIdentity()` | Return the one ADM0 identity and presentation reference | spec-complete | undocumented | `VCC-SG-01` |
| `TAD-SG-CAMERA` | `readInitialCameraPolicy(viewClass)` | Return deterministic initial values for planar or volumetric presentation | spec-complete | undocumented | `VCC-SG-02` |
| `TAD-SG-STAGE` | `resolveEnvironmentStage(id)` | Resolve the 32 by 24 metre Singapore terrain | spec-complete | undocumented | `VCC-SG-03`, `VCC-SG-04` |
| `TAD-SG-POI` | `resolveMajorPoi(id)` | Resolve stable identities plus distinct local-XR and regional-geographic surfaces | spec-complete | undocumented | `VCC-SG-04` |
| `TAD-SG-PROJECT` | `projectLocalMeters(x,z)` | Apply the one anchor and axis mapping | spec-complete | undocumented | `VCC-SG-03` |
| `TAD-SG-REGIONAL` | `readRegionalPoiProfile(id)` | Return exact checked-in rings, heights, accuracy, provenance, attribution, and policy | spec-complete | undocumented | `VCC-SG-04`, `VCC-SG-05`, `VCC-SG-06` |
| `TAD-SG-SNAPSHOT` | `projectEnvironment(stage, subjects)` | Produce the Flight-local environment snapshot without geographic POI authority | spec-complete | undocumented | `VCC-SG-03`, `VCC-SG-06` |
| `TAD-SG-GATE` | `checkSingaporeEnvironment()` | Reject drift, aliases, invalid data, network ownership, or copied locale facts | spec-complete | undocumented | `VCC-SG-01` through `VCC-SG-08` |

### 5.6 Quality attributes

| Attribute | Bound | Design response | VCC |
|---|---|---|---|
| Semantic honesty | zero boundary mislabelling | Separate identity, framing, stage, and official-boundary concepts | `VCC-SG-01` |
| Determinism | equal input gives byte-equal ordered projection | Immutable values and stable ordered revision | `VCC-SG-03`, `VCC-SG-05` |
| Visual alignment | no local/geographic remap; exact geographic rings and real-metre heights | Typed profile class plus MapLibre-owned composite framing | `VCC-SG-05` |
| Portability | consumer- and provider-agnostic data contract | Typed coordinates, rings, heights, accuracy, provenance, labels, and kinds | `VCC-SG-05` |
| Browser reach | compatible browser consumers can inspect the same typed profile | No document-tree, input, or provider assumption in the locale contract | `VCC-SG-05`, `VCC-SG-06` |
| Mobile reach | consumer layout and input remain external at every viewport | Local-metre geometry and semantic labels carry no viewport minimum | `VCC-SG-05`, `VCC-SG-06` |
| Offline behavior | zero required locale/asset/model/geodata calls | Checked-in source values and attribution only | `VCC-SG-06` |
| Performance | one projection per changed revision | Stable revision permits consumer memoization | `VCC-SG-05` |
| Accessibility | every POI surface has a readable label and parent | Semantic labels survive projection | `VCC-SG-04` |
| Maintainability | one Singapore document and one source chain | Generic and application docs link without copying facts | `VCC-SG-07` |
| Delivery safety | no implicit mirror or release | Closed lanes and undocumented delivery rung | `VCC-SG-08` |

### 5.7 Failure and recovery

| Failure | Required behavior |
|---|---|
| Unknown environment or POI ID | Fail with an explicit local error; do not choose a fallback |
| Non-finite coordinate or dimension | Reject before projection; retain the last admitted snapshot |
| Non-positive stage or surface size | Reject; never emit a zero-area or inverted ring |
| Local XR profile supplied to the regional port, or inverse | Reject before presentation; never remap or scale across profile classes |
| Open ring, invalid base/top height, missing provenance, or attribution drift | Reject the complete regional profile; retain the prior map state |
| Duplicate or stale alias property | Reject exact-shape validation; remove the stale source rather than remap it |
| Consumer not ready | Retain the selected source; publish only after the consumer accepts a snapshot |
| Locale projection rejected | Leave generic surface and application state unchanged |
| Official-boundary requirement appears | Stop; create a sourced boundary requirement and provenance VCC before use |
| Mirror or delivery requested | Stop; require a separate owner, target, authorization, and Evidence Reference |

## 6. Architecture decisions

### ADR-SG-1: Keep one locale companion as the Singapore document authority

**Status:** Accepted
**Date:** 2026-07-31

**Context:** Repeating locale coordinates, camera values, or POI rosters in
generic mode and application documents creates drift and accidental coupling.

**Decision:** This companion owns Singapore-specific environment facts. Other
documents reference it and state only their consumer obligations.

**Alternatives:** duplicate values per consumer; derive facts from filenames;
or introduce compatibility aliases. All are rejected because they create
multiple authorities or hide identity drift.

**FOSS and 12-month TCO:**

| Variant | Cash TCO | Ops burden | Decision |
|---|---:|---:|---|
| One authored Markdown companion | $0 | 4 h/year | selected |
| FOSS docs duplicated per consumer | $0 | 20 h/year | rejected |
| Managed knowledge registry | at least $600 | 8 h/year | rejected |

**Consequences:** Locale changes are reviewed once and require downstream VCC
reruns. This companion must not absorb generic or application behavior.

### ADR-SG-2: Separate ADM0 identity, presentation framing, and local stage

**Status:** Accepted
**Date:** 2026-07-31

**Context:** A rectangular viewport and a local terrain ring can visually
resemble boundaries while having different semantics.

**Decision:** `SGP` is the ADM0 identity. The coordinate rectangle is viewport
framing. The local stage is a 32 by 24 metre authored scene. Neither geometry
is an official administrative boundary.

**Alternatives:** treat the rectangle as the boundary or silently import an
unsourced polygon. Both are rejected as inaccurate and unauditable.

**FOSS and 12-month TCO:**

| Variant | Cash TCO | Ops burden | Decision |
|---|---:|---:|---|
| Explicit typed semantic fields | $0 | 2 h/year | selected |
| FOSS unsourced polygon fixture | $0 | 12 h/year | rejected |
| Managed boundary service | at least $240 | 10 h/year | deferred pending provenance need |

**Consequences:** Boundary-dependent features remain blocked until a separately
sourced, licensed, versioned, and validated boundary artifact is admitted.

### ADR-SG-3: Keep local XR and regional geographic POIs separate

**Status:** Accepted
**Date:** 2026-07-31

**Context:** Scaling a small local XR stage onto a basemap produces POIs at the
wrong location and scale. A schematic stage and a geographic footprint answer
different questions even when they share semantic POI identities.

**Decision:** Flight-local XR consumes only the authored-metre schematic
profile. Regional MapLibre presentation consumes only the checked-in
geographic profile. They share stable POI identities but no rings, dimensions,
heights, projection, or compatibility remap.

**Alternatives:** scale the local stage around an anchor or retain both layers
and hide one by stacking order. Both are rejected because the invalid geometry
would still exist and could reappear.

**FOSS and 12-month TCO:**

| Variant | Cash TCO | Ops burden | Decision |
|---|---:|---:|---|
| Two explicit typed source classes and one semantic roster | $0 | 8 h/year | selected |
| Scale one local fixture into geography | $0 | 18 h/year | rejected |
| Managed transformation service | at least $720 | 12 h/year | rejected |

**Consequences:** Local XR keeps authored scene metres, regional context keeps
real geographic rings and heights, and each consumer remains responsible for
its overlay and camera behavior.

### ADR-SG-4: Make POI accuracy and provenance representation-specific

**Status:** Accepted
**Date:** 2026-07-31

**Context:** Recognizable landmarks improve orientation, but one accuracy claim
cannot honestly cover schematic XR shapes, dated OSM polygons, and an
officially dimensioned presentation ring.

**Decision:** Three named POIs keep stable semantic identities. Their nine
local XR surfaces are explicitly schematic and non-collidable. Their nine
regional surfaces carry per-surface footprint and height accuracy plus exact
geometry, height, context, version, and snapshot provenance. Official values
are render authority only when the surface says `official-published`;
otherwise they are context and the dated OSM record remains render authority.

**Alternatives:** anonymous generic masses lose semantic value; remote or
opaque building assets add dependency and licensing risk; using them as
collision authority creates false physical accuracy. All are rejected.

**FOSS and 12-month TCO:**

| Variant | Cash TCO | Ops burden | Decision |
|---|---:|---:|---|
| Checked-in typed local and geographic surfaces | $0 | 12 h/year | selected |
| FOSS procedural anonymous masses | $0 | 12 h/year | rejected |
| Managed high-detail building assets | at least $1,200 plus egress | 16 h/year | rejected |

**Consequences:** A consumer can display useful regional geometry without
claiming survey accuracy, collision authority, or official equivalence.

### ADR-SG-5: Prefer the zero-dependency FOSS-compatible data path

**Status:** Accepted
**Date:** 2026-07-31

**Context:** Locale presentation can be delivered as checked-in typed data, an
open-data ingestion pipeline, or a proprietary hosted environment service.

**Decision:** Use source-authored typed local data, one checked-in dated
OpenStreetMap-derived geographic snapshot with ODbL attribution, official
height context, and existing shared open presentation capabilities. Add no
locale-specific runtime package, service, credential, token, model, asset
fetch, or runtime geodata request.

**FOSS and TCO comparison:**

| Variant | License/portability | 12-month cash TCO | Ops burden | Decision |
|---|---|---:|---:|---|
| Checked-in typed local data plus dated ODbL geographic snapshot | repository-auditable with attribution | $0 | low | selected |
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
| `VCC-SG-04` | The exact three POIs retain nine immutable local-XR surfaces and nine separate regional-geographic surfaces; every identity, ring, base/top height, accuracy value, and provenance reference matches this companion. | Focused profile/source test surfaces both rosters, exact coordinate/height digests, and cross-class rejection. | No local/geographic remap, remote asset, or opaque POI geometry. | none recorded |
| `VCC-SG-05` | The regional profile projects through source `kg-geo-xr:regional-poi` and layers `kg-geo-xr:regional-poi:fill`, `kg-geo-xr:regional-poi:extrusion`, `kg-geo-xr:regional-poi:outline`, and `kg-geo-xr:regional-poi:label` below City parcels and stopped Flight route/aircraft; MapLibre frames the three POIs with parcel bounds while its live canvas remains the sole semantic selection owner. | Focused MapLibre and neutral browser checks compare exact features, layer order, composite bounds, direct canvas semantics, and visibility. | Flight-local XR environment remains absent; no active or visible Three.js/R3F presentation, HTML marker, generic selectable wrapper, or `aria-hidden`. | none recorded |
| `VCC-SG-06` | Locale selection and projection perform zero model, token, account, remote-locale, remote-asset, runtime-geodata, persistence, or new-dependency operations while retaining ODbL attribution. | Focused offline boundary and exact-property tests surface forbidden-call counts of zero. | Provider transport remains separately owned. | none recorded |
| `VCC-SG-07` | Generic Geo+XR and City documents contain no copied Singapore facts and reference this companion for locale data. | Document contract scan exits 0 and surfaces allowed references. | No compatibility alias or duplicate locale authority. | none recorded |
| `VCC-SG-08` | Mirror and delivery targets are absent and no source check is interpreted as delivery proof. | Lane contract check surfaces zero targets and `delivered_rung=undocumented`. | Promotion requires a separate authorized contract. | none recorded |

PRD-to-TAD-to-ADR traceability covers 8 of 8 in-scope PRD requirements
(`100%`).

> **Reference implementation: conformance profile.** The
> [selected split structural profile](./knowgrph-prd-tad-adr-conformance-report.md#reference-implementation-2026-07-31-split-conformance)
> links 19 of 19 selected artifact-bearing rules (`100%`) and counts zero
> advisories. It is not a full guideline-set alignment claim and does not
> satisfy a VCC.

## 8. Readiness gap matrix

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criterion |
|---|---|---|---|---|---|
| ADM0 identity and semantic boundary | `spec-complete` | `undocumented` | no attached evaluator result | major | satisfying Evidence Reference for `VCC-SG-01` |
| Camera and local projection | `spec-complete` | `undocumented` | no attached evaluator result | major | satisfying Evidence References for `VCC-SG-02` and `VCC-SG-03` |
| Local-XR and regional-geographic POI profiles | `spec-complete` | `undocumented` | no attached evaluator or browser result | major | satisfying Evidence References for `VCC-SG-04` and `VCC-SG-05` |
| Offline and ownership boundary | `spec-complete` | `undocumented` | no attached evaluator result | major | satisfying Evidence References for `VCC-SG-06` and `VCC-SG-07` |
| Mirror and delivery | `undocumented` | `undocumented` | lanes deliberately closed | none | separate owner, target, authorization, and VCC |

## 9. PRD to TAD to ADR traceability

| PRD requirement | TAD components | ADR | VCC |
|---|---|---|---|
| `PRD-SG-01` | `TAD-SG-IDENTITY`, `TAD-SG-GATE` | `ADR-SG-1` | `VCC-SG-01`, `VCC-SG-07` |
| `PRD-SG-02` | `TAD-SG-IDENTITY` | `ADR-SG-2` | `VCC-SG-01` |
| `PRD-SG-03` | `TAD-SG-CAMERA` | `ADR-SG-2` | `VCC-SG-02` |
| `PRD-SG-04` | `TAD-SG-PROJECT`, `TAD-SG-SNAPSHOT` | `ADR-SG-2`, `ADR-SG-3` | `VCC-SG-03` |
| `PRD-SG-05` | `TAD-SG-POI`, `TAD-SG-STAGE`, `TAD-SG-REGIONAL` | `ADR-SG-3`, `ADR-SG-4` | `VCC-SG-04` |
| `PRD-SG-06` | `TAD-SG-POI`, `TAD-SG-REGIONAL`, `TAD-SG-GATE` | `ADR-SG-3`, `ADR-SG-4` | `VCC-SG-04`, `VCC-SG-05` |
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
| Singapore stage catalog | `canvas/src/features/three/xrSceneLibrary.ts` | stage ID `singapore`, 32 by 24 metre terrain, major-POI structures |
| Flight-local schematic major-POI source | `canvas/src/features/three/xrSingaporeEnvironmentSource.ts` | `XR_SINGAPORE_MAJOR_POIS`, `XR_SINGAPORE_MAJOR_POI_SURFACES` |
| React Three Fiber schematic terrain presentation | `canvas/src/features/three/XrSingaporeTerrainGeometry.tsx` | consumes the same POI source for the existing XR source view |
| Flight-local environment projection | `canvas/src/features/game-flight-sim/flightSimGeoEnvironmentProjection.ts` | `projectXrEnvironmentToFlightGeo`; never a City regional-POI source |
| Flight-local MapLibre environment projection | `gympgrph/src/flightGeoEnvironmentMapLibre.ts` | local stage feature collection for Flight only |
| Neutral regional POI contract | `grph-shared/src/geospatial/regionalPoiGeo.ts` | `RegionalPoiProfile`, `RegionalPoiSurface`, `createRegionalPoiProfile` |
| Singapore regional geographic POI source | `grph-shared/src/geospatial/singaporeMajorPoiGeo.ts` | `SINGAPORE_MAJOR_POI_GEO_PROFILE` with this companion's exact rings, heights, accuracy, provenance, policy, and attribution |
| Regional profile admission | `canvas/src/features/geospatial/regionalPoiProfileCatalog.ts` | exact profile-id resolution; unknown identity fails |
| Regional MapLibre presentation | `gympgrph/src/regionalPoiMapLibre.ts` | source `kg-geo-xr:regional-poi`; fill, extrusion, outline, and label layers |
| City composite projection and framing | `canvas/src/features/game-city-sim/citySimGeospatialProjection.ts`, `gympgrph/src/cityGeoOverlayMapLibreController.ts` | regional-context below parcels and Flight; bounds union without camera ownership |
| Existing focused POI proof source | `canvas/src/__tests__/flightSimSingaporePoiExtrusion.test.ts` | exact roster, immutable source, projected heights, and stale-property rejection |
| Generic mode authority | `docs/documents/knowgrph-geo-xr-mode-prd-tad-ard.md` | shared surface, semantic wrapper, lifecycle, input, camera, and overlay ownership |
| City product authority | `docs/documents/knowgrph-game-city-building-sim-prd-tad-ard.md` | parcels, zoning, economy, advice, persistence, and City actions |

The current renderer libraries are implementation choices inside the generic
surface owner. This companion has no direct dependency on MapLibre, React,
React Three Fiber, Three.js, a provider SDK, or a hosted locale service.

## 11. Change policy

Any change to ADM0 identity, anchor, center, extent, camera values, stage size,
axis mapping, either POI roster, local position/size, geographic ring,
base/top height, accuracy, provenance, attribution, snapshot, or data policy
increments this document's semantic version and reruns the mapped VCCs. A new
official boundary, data source, remote dependency, or opened mirror/delivery
lane requires its own ADR and evidence contract. Stale Singapore facts in
generic or application documents are removed at their source; they are never
retained through aliases, remapping, or compatibility prose.
