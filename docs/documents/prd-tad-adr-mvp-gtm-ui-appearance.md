---
title: "Global UI appearance alignment"
doc_type: "PRD-TAD-ADR-MVP-GTM"
continuity_id: "ui-appearance"
version: "1.0.0"
prd_revision: "1.0.0"
tad_revision: "1.0.0"
adr_revision: "1.0.0"
mvp_revision: "1.0.0"
gtm_revision: "1.0.0"
date: "2026-10-02"
owner: "Application UI function"
frontmatter_contract: "required"
local_rung: "implemented-local"
delivered_rung: "undocumented"
lane: "verification"
lifecycle_status: "implemented"
runtime_readiness_policy: "fail-closed"
load_policy: "on-demand"
worktree_id: "agent/device-0232231d4a19/global-ui-appearance"
---

# Global UI appearance alignment

`ui-appearance@1.0.0` joins all five roles. The canonical rules live in the
[UI/UX design guide](./agentic-graph-ui-ux-design-document.md#global-appearance-authority).
This increment continues [workspace-data-views@1.3.4](./prd-tad-adr-mvp-gtm-workspace-data-views.md).

## PRD

The operator observed inconsistent line weight, selected backgrounds and elevation between
Workspace View, code actions and data-view controls. Different local stroke values also bypassed
the global Settings value. The acceptance target is one predictable appearance: default 1.5
icon stroke, 1 px neutral borders, flat in-flow cards/actions and blue selected icon backgrounds.
The operator's browser comments establish usability pain; buyer demand and willingness to pay
remain unmeasured. Existing free/local UI owners are the lowest-change solution; no new service,
paid plan, dependency or network call is introduced.

## TAD

`grph-shared/src/ui/themeTokens.ts` owns numeric defaults, normalization, state and elevation
classes. `uiSliceInitialState`, the settings registry and core setter consume that default.
`CanvasRootRuntime` publishes the setting to a CSS variable, so raw Lucide components and
marked custom field icons agree even without a store subscription per glyph. Existing runtime
subscriptions remain valid. Saved preferences survive; invalid values cannot inject NaN into CSS. Stroke persistence uses
the existing float owner; the previous opacity helper incorrectly clamped widths above 1.

The repository traversal removes literal icon stroke attributes from 55 UI source files.
The shadow traversal replaces 123 remaining local recipes across 73 files with flat, raised or
overlay roles; the source guard forbids reintroducing the retired Tailwind sizes. Native SVG chart/diagram strokes are deliberately outside icon policy. Common border/elevation
owners are reused by cards, toolbars, dialogs and menus. Data-view and code actions use shared
icon sizing and the selected blue surface from the reference Workspace View.

## ADR

Keep the existing design document as authority instead of adding another DESIGN.md. Use CSS
inheritance at the glyph boundary plus typed shared defaults, rather than wrapping every icon
or adding more per-component Zustand subscriptions. Preserve centralized user overrides and
accessible focus/record-selection indicators. Role-based elevation distinguishes overlays from
in-flow content; a universal `box-shadow: none !important` would erase focus and selection cues.
No new always-load module is added; CSS and existing token/runtime owners receive the small delta.

## MVP and verification

- Implemented: one default/reset/normalization path; global stroke publication; legacy literal
  UI-icon cleanup; shared selected icon background and size; shared border/elevation owners.
- Enforcement: `ui.appearance.sharedAuthority` traverses TSX sources and checks owner contracts.
- Browser verified: reference, Render, Copy and Layout glyphs share 16 px sizing and 1.5 stroke;
  Settings 2.25 changes all four together, then 1.5 is restored. Light/dark selected fills agree;
  card frames are 1 px with no shadow and a single footer edge.
- Resource cap: no dependencies, under 300 KB Git diff including context, under 160 touched modules; existing
  oversized files receive bounded replacements, and new files stay below 600 lines.
- Release: affected checks and exact protected candidate evidence remain separate from localhost
  visual verification. Production deployment is not part of this source/UI change.

CI acceptance repair (2026-10-02): the hosted Mission proof lost its page execution context while
awaiting the Canvas control module. PRD/MVP retain all entry, authored-state, private-evidence and
lifecycle assertions. TAD uses bounded read-only module readiness, then one synchronous control
dispatch with an applied-result check and handle disposal. ADR forbids retrying an effect after
navigation; dispatch errors still fail loudly. Two negative/positive tests cover that boundary;
the full native browser proof and protected candidate checks remain required. GTM claims no new
runtime feature or Production evidence. Repair cap: three paths, 5 KB, 15 active minutes.

Source inventory acceptance repair: the Mission fixture deliberately provides empty authored roots.
PRD/MVP require unchanged authored state and persistent source inventory when opening session evidence;
they do not require an incidental `docs` folder. TAD waits for the actual virtual manifest and captures
persisted paths before/after inspection. ADR retains the startup deadline, single workspace, native JSON
content and private-evidence non-persistence checks. GTM gains no new feature or Production claim.
The full native browser smoke remains required; this repair is capped at two paths, 3 KB, 10 active minutes.

Active-file acceptance checkpoint: the selected-archive browser run observed the first editor mount
materializing its authored file after base bootstrap reported ready. PRD/MVP keep exact authored-state
equality around inspection. TAD reuses the existing active-file/history readiness predicate before the
first snapshot, within the same startup deadline; bounded read-only browser readiness replaces its
50 ms polling loop. The seed-sync owner must report zero active tasks before the initial snapshots, since
initial Explorer refresh reconciles generated import indexes. Capture persisted paths after this
owner readiness, not before it. ADR adds no delay, dispatch retry, source exclusion or weaker assertion. GTM retains
the separate source/Production evidence boundary. This repair is capped at three paths, 4 KB,
10 active minutes; full native browser acceptance binds the clean published successor.

## GTM and rollback

Autonomous closeout repair (2026-10-02): PRD/MVP retain exact authored-state equality for Apex
inspection, including selected sources and their order. Candidate `bee1cfb28ba6f21dd9a99fdbe7da5983ea185512`
failed the complete native browser run while focused Apex passed. An earlier trace showed valid cold
startup followed by deferred source reconciliation, before activation. TAD corrects the acceptance
owner: the installed Playwright polls Promise objects as truthy, so an async readiness predicate did
not wait for initialization. The native helper now preloads modules once and polls a synchronous
boolean under the existing startup deadline, with no host polling loop. The active source is matched
by path anywhere in the native inventory: its merge owner preserves retained files and does not
guarantee the active source is first. The real wait exposed that invalid first-row assumption.
A positive regression retains another source before the active source. ADR retains exact equality,
all source fields, and all lifecycle assertions; no production source writer is changed for this cause.
The earlier empty-only selection bootstrap guard remains independently regression-covered; it did
not resolve this acceptance failure. A browser regression holds each readiness prerequisite false
before permitting the real predicate to settle. GTM adds no adoption or Production claim.
Cap: eight affected paths, 20 KB added source, 45 active minutes, no dependency or service; provider
waits require changed receipts rather than an ETA. Full native browser acceptance and protected
Integration Gate remain required before source merge. Canonical seed edits remain authored recovery
inputs; shared Context closeout is unresolved because native workspace admission lacks a trust anchor.

Notification acceptance repair: protected run `36974750108` passed the graph and Mission stages,
then failed Python offline acceptance when an empty notification row intercepted the lesson selector.
PRD/MVP require ordinary workspace input through empty toast frames while notification text remains
selectable and Copy, Pin, Dismiss and actions remain interactive. TAD uses the existing explicit child
hit targets; only the noninteractive card frame becomes pointer-transparent. ADR preserves the live
region, TTL, persistent errors and native click assertions; no force-click or notification suppression
is permitted. The existing owner guard and real browser hit tests cover frame, text and controls;
the complete Python offline proof and protected Integration Gate remain required. GTM adds no new
feature or Production claim. Repair cap: four paths, 5 KB added source, 15 active minutes; no new
module, dependency, subscription or polling loop. Canonical authored inputs and Context admission
remain separate unresolved closeout obligations.

Position this as consistent built-in controls across the local workspace. Do not claim measured
conversion, paid value, exhaustive platform parity or a Production rollout. A useful demonstration
shows the global setting changing mixed controls together without document edits. Roll back via
a reviewed source revert; presentation-only changes require no record/data migration.
