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

## GTM and rollback

Position this as consistent built-in controls across the local workspace. Do not claim measured
conversion, paid value, exhaustive platform parity or a Production rollout. A useful demonstration
shows the global setting changing mixed controls together without document edits. Roll back via
a reviewed source revert; presentation-only changes require no record/data migration.
