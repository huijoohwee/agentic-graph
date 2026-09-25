---
title: Graph to GameXR simulated drone flight path
doc_type: PRD-TAD-ADR-MVP-GTM
version: 1.0.0
date: 2026-09-26
owner: Graph learning and GameXR bench maintainers
continuity_id: DRONE-FLIGHT-PATH-001
status: implementation
frontmatter_contract: required
---

# Graph to GameXR simulated drone flight path

## PRD

DRONE-FLIGHT-PATH-001@1.0.0 binds this user-authorized extension. The user confirmed
the simulated bench, with Graph authoring, GameXR on iPhone/Safari, explicit Run and
local Wi-Fi delivery. The learner programs the existing Python drone API, runs and
inspects its motion, then exports the completed path. GameXR imports a bounded file,
previews it and requires an explicit Run after a receiver connection. Imported source
is never evaluated. No aircraft support or motor output is part of this revision.

Acceptance: export requires a completed collision-free landed trace; GameXR rejects
unknown versions/fields, oversized/non-finite/out-of-bounds/discontinuous samples;
import cannot enable a receiver; Run preserves path order and requires fresh receiver
acknowledgments; stop/focus loss/disconnect invalidate the run and require a new Run;
the mobile browser displays planned and receiver-accepted positions distinctly.

## TAD

Graph owns simulation and this portable data contract. GameXR owns consumer validation,
UI replay and simulated-receiver admission; neither repository imports the other's
unpublished runtime. Existing pinned shared flight packages remain unchanged.

`agentic-drone-flight-path/v1` has exactly schema, model=`kinematic`,
physicalAircraft=false, tickRate=60, coordinateFrame=`local-xz-altitude-m-heading-deg`,
sourceDigest and sceneDigest (lowercase SHA-256 identifiers), and samples. Each sample
is `[tick,x,z,heading,altitude]`, with 0-based contiguous ticks, x/z within ±8 m,
heading in [0,360) degrees, altitude 0–4 m. The first sample is `[0,0,0,0,0]`; the
last is landed. There are 2–7,201 samples, at most 120 seconds and 500,000 UTF-8 bytes.
Coordinates round to six decimals; consecutive translation is at most 0.050002 m.
Heading changes retain educational instantaneous turns; they are not angular dynamics.
Digest identifiers aid comparison and do not authenticate a downloaded file.

## ADR

Use a portable trace, not Python execution or an invented position-to-throttle mapping.
The simulated receiver accepts position setpoints under its existing challenge/session
lease and reports them as simulated observations. No path setpoint enters the RPYT
codec or physical diagnostics channel. The phone uses the existing paired HTTPS gateway
once its owner releases the stopped writer. Overlapping files wait for that handoff.
Recovery stops the session; a reviewed source revert restores prior functionality.

## MVP

Initial budget: 35 active minutes, 12 files, 50 KiB, no paid services or new dependencies;
refresh when gateway integration establishes the actual changed-file count. The exporter
loads only on explicit use. Tests cover the authored route, malformed imports, exact
receiver expiry, ownership loss, mobile WebKit Run/Stop and local transport.
Desktop mobile emulation is not physical iPhone/Wi-Fi acceptance. Source publication,
protected integration and production remain separate receipts.

## GTM

Nearest user value is a reproducible drone-programming demonstration on a phone.
No physical flight, customer demand, price or revenue claim follows from bench evidence.
Observe a learner completing export/import/Run before expanding curriculum or hardware.

## Implementation evidence

Graph export and GameXR simulated execution are implemented in admitted successors.
The component browser exported the actual 541-sample, nine-second route; GameXR's six
mobile WebKit bench tests consumed that file and passed, including final landed receiver
acknowledgment and cancellation. The visible local GameXR page also completed at x=4,
z=0, altitude=0, tick=540. Graph lifecycle tests pass 24/24; native Canvas TypeScript,
three Vite runtime checks, two WebMCP scope checks and rebuilt full-app offline proof
pass. The existing Python pane-availability assertion remains red and belongs to open
XR PR #1285; its correction is not copied into this lane.

GameXR's native selected evaluators, candidate build/release checks and behavior suite
pass; TLS transport and exact receiver expiry are covered. Working-source observations
are retained under `.audit-artifacts/drone-implementation-20260925/path-*` and
`gamexr-path-*` outside both repositories. Publication, protected integration and actual
iPhone/Wi-Fi verification remain separate. No physical aircraft was connected.
