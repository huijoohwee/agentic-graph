---
title: Warehouse concept and programmed inspection cell
doc_type: Technical-Note
version: 1.0.0
date: 2026-09-27
lang: en
owner: Learning runtime maintainer
continuity_id: DRONE-FLIGHT-PATH-001
continuity_revision: 1.6.0
frontmatter_contract: required
---

# Warehouse concept and programmed inspection cell

[Open the top-down blueprint](./warehouse-floor-plan.svg). This drawing projects the
warehouse layout owned by `canvas/src/features/python-learning/warehouseLayout.ts`.
The [joined product record](../documents/prd-tad-adr-mvp-gtm-drone-flight-path.md)
owns requirements and decisions at `DRONE-FLIGHT-PATH-001@1.6.0`.

The supplied images inform the process layout and blue-upright/orange-beam pallet
racking. Dimensions are assumptions: a 60 m east–west by 40 m north–south concept
floor, or 2,400 m². It is neither a measured survey nor an approved building plan.
The blueprint labels inbound and outbound container bays, dock levelers, maneuvering
aprons, driveways and the connection to a vehicular ramp. It does not design a
complete ramp, structure, fire strategy or vehicle swept path.

## Top-down layout and allocations

Coordinates are metres: X increases east, Z increases south; the indoor concept
runs from X −30 to +30 and Z −20 to +20. Rectangles use minimum and maximum coordinates; each row occupies its whole
listed planning cell. The twelve cells partition the concept floor without overlap.

| Zone | X range | Z range | Area | Allocation |
|---|---:|---:|---:|---|
| High-value secured vault | −30 to −20 | −20 to −10 | 100 m² | Core |
| Climate-controlled storage | −20 to −6 | −20 to −10 | 140 m² | Core |
| Kitting and assembly | −6 to +12 | −20 to −10 | 180 m² | Core |
| Packing and staging | +12 to +30 | −20 to −10 | 180 m² | Core |
| Inbound receiving and security checkpoint | −30 to −20 | −10 to 0 | 100 m² | Core |
| Loose/bulk goods | −30 to −20 | 0 to +12 | 120 m² | Core |
| Pallet racks and dedicated logistics aisles | −20 to +12 | −10 to +12 | 704 m² | Core |
| Small-item shelving | +12 to +20 | −10 to +12 | 176 m² | Core |
| Outbound shipping | +20 to +30 | −10 to +12 | 220 m² | Core |
| Support, toilets, M&E and circulation | −30 to −6 | +12 to +20 | 192 m² | Ancillary |
| Staff break space and pantry | −6 to +6 | +12 to +20 | 96 m² | Ancillary |
| Office and front entrance | +6 to +30 | +12 to +20 | 192 m² | Ancillary |
| **Total** | | | **2,400 m²** | **100%** |

Goods enter from the west loading bays, pass receiving/security, and move to secured,
climate, bulk, pallet or small-item storage. Kitting feeds packing/staging before
east-side outbound shipping. The south frontage separates staff entry, office and
break facilities from this goods flow. Security inspection is part of the receiving
operation; the support allocation separately reserves service and circulation space.

**Concept allocation: 1,920 / 2,400 = 80% core; 480 / 2,400 = 20% ancillary.**
This satisfies the requested numerical 60:40 planning target with a 20-percentage-
point margin. It does not establish statutory compliance. The denominator is an
assumed indoor planning area, not certified GFA. Actual wall areas, common areas,
approved uses and development-wide allocations require measured assessment.

## Vehicle access assumptions

Two inbound bays and two outbound bays are each 18 × 4 m, with a dock leveler at
the building interface. The drawing reserves a 12 m maneuvering apron beyond the
bays and an 8 m access/ramp connection. These are conceptual allowances for 20/40-foot
container service, not verified maneuvering or capacity results. Leveler dimensions,
load ratings and dock heights remain equipment/design inputs.

External bays, aprons and the ramp connection are shown separately from the indoor
allocation table. Their exclusion from this illustrative denominator is not a
claim that they are legally exempt from GFA. A complete ramp-up design also needs
its gradient, transitions, clear height, structural loads and turning geometry.

Reference implementation: the currently linked [LTA parking code](https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/vehicle_parking/pdf/cop_on_vehicle_parking_provision_in_development_proposals_2019_edition.pdf)
(version 1.1, content updated January 2024) gives articulated-vehicle benchmarks:
3.3 × 14 m angled lots, 12 m aisles at 90°, 7.4 m straight two-way access, and
9 m curved lanes for 40/45-foot trailers. It specifies maximum ramp gradients of
1:15 straight and 1:20 curved, with 4.75 m headroom at ramps. These benchmarks do
not replace design-vehicle swept-path checks or establish dock suitability.

## Programmed drone inspection

The entire warehouse is context scenery. The lesson operates in a distinct
**16 × 16 m inspection cell**, X/Z ±8 m, altitude 0–4 m. The fixed nine-second
example starts at (0, 0), takes off to 2 m, hovers for 60 ticks, flies along +X
at 1 m/s for 240 ticks, then lands at (4, 0). There are 60 ticks per second.
A 1 m pallet load lies below the route. The 4.5 m racks bound the lateral aisle;
the permitted altitude cannot clear them. This is a pre-programmed kinematic
simulation. It neither drives motors nor proves flight suitability in a warehouse.

Reference implementation: Source Files → `/docs/python-lessons/04-drone-flight-and-landing.py`
is a browser workspace file, seeded by `learningLessonFiles.ts` from the revision-2
example in `learningLessons.ts`. Existing saved source remains owned by the user;
select **Load flight example** explicitly to use the updated program. There is no
second host Python file to reconcile. Python, Block and JSON retain their existing
program owner. Use **Canvas View → Surface Mode → 2D / 3D / XR** for all three
views. Media Assets, Outliner and Inspector share the same warehouse geometry;
changing the surface does not start a flight.

## Planning-rule evidence

Reference implementation: official Singapore sources checked 27 September 2026.
The [URA B2 use-quantum handbook](https://www.ura.gov.sg/guidelines/development-control/development-control-handbooks/non-residential/b2/use-quantum/)
requires at least 60% industrial GFA and at most 40% ancillary. For multi-user
premises, the ratio applies at development and strata-unit levels. Common areas
outside units, including corridors, stairs, lifts, toilets and M&E, contribute to
the development-level ancillary quantum. Dedicated internal logistics aisles in
this concept are included with their storage operation, subject to approved use.

The [URA B2 allowable-uses handbook](https://www.ura.gov.sg/guidelines/development-control/development-control-handbooks/non-residential/b2/allowable-uses/)
lists assembly among predominant examples and offices, meeting rooms, sick rooms,
M&E and industrial canteens among ancillary examples. **Staff break/pantry means
rest during work, not residential accommodation.** Dormitory use has separate
planning and agency-clearance conditions; this concept contains no housing.

The [URA goods-lift/loading-bay table](https://www.ura.gov.sg/guidelines/development-control/development-control-handbooks/non-residential/b2/goods-lift-loading-bays/)
excludes full ramp-up developments. Its ordinary minimum counts do not certify
this concept. [JTC change-of-use guidance](https://www.jtc.gov.sg/get-help/managing-your-tenancy-or-lease/changing-the-use-of-your-industrial-property)
also requires industrial-ratio preservation and evaluation of proposed use changes.
