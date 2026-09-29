---
title: "MainPanel shared presentation — PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
doc_id: "AG-MAINPANEL-PRESENTATION-001"
version: "1.2.0"
status: "Accepted and implemented"
date: "2026-09-29"
authors: ["airvio"]
owner: "Product maintainers"
schema: "agentic-os-computing-flow/v1"
lang: "en-US"
frontmatter_contract: "required"
tags: ["mainpanel", "accessibility", "typography"]
---

# MainPanel shared presentation

## PRD

Operators need consistent, inspectable controls when moving between MainPanel tabs.
All 13 active tabs inherit the same configurable panel typography. Configuration
and status fields reuse Collaboration's Key / Type / Value rows and section layout.
Tables, file trees and media keep their content semantics. Repeated actions use
named icon buttons, with the catalog exposed in MainPanel Help. Explicit simulation
confirmation retains its wording so users can identify the effect before activation.

Keys explain the responsible role, action and observable outcome. Value help uses
source-owned defaults and bounds, with expansion/contraction notes for numeric
controls. Runtime observations use an explicit non-default marker rather than
presenting the current value as a factory default. No new service or paid dependency.

## TAD

- `MainPanel` and `MainPanelBody` inherit `usePanelTypography` for every active tab.
- `CollapsibleSection` combines the shared section token with configured typography.
- `MainPanelField` uses `CanvasEditableKeyTypeValueRow`, the existing responsive grid,
  configured density, right-aligned value cell and central type-icon resolver.
- Both static and editable Canvas row adapters support `MainPanelFieldHelp`.
- `mainPanelRowHelp` reuses `buildRoleActionOutcomeTooltip` and
  `buildSettingsValueTooltip`; hover and keyboard focus use the existing Tooltip.
- `mainPanelHelpActionIconLibrary` contributes action metadata to the existing Help
  registry; `MainPanelIconButton` reuses IconButton and semantic SVG names.
- Collaboration, Research and Commerce provide field metadata. Settings retains its
  existing metadata owner and shares the same key-help wrapper.
- Import URL keeps shared directory controls and checkbox alignment. History and
  Preview inherit panel text styling; action icons retain existing handlers.

## ADR

Reuse the existing Collaboration row and Help registry owners. Add optional help
metadata at the shared Canvas row seam; do not introduce another settings store,
renderer, dialog or site-specific presentation. Preserve lazy tab loading. Shared
icons expose an image role and accessible label by default; buttons expose their
own action names and keep hidden text for assistive tooling.

The reference is `schema/AgenticRAG/roles-actions-outcomes-schema.jsonld` in the
huijoohwee.github.io repository (schemaVersion 3.1.0). Its serialization is reference
material; field owners remain the authority for actual values and side effects.

## MVP and verification

Budget: 24 source modules, 100 KB changed, no dependency additions. Initial 30-minute
implementation target extended for live tab and affected-suite verification.

Focused checks cover accessible icon actions, disabled behavior, keyboard help,
RAO text, numeric default/min/max/interval text, configured typography and density,
Collaboration owner-only removal, Research and Commerce integration, and import
selection controls. Live checks cover tab switching, shared row geometry, help
visibility and panel containment. The native affected receipt binds the final
commit; focused checks are not full-suite parity or production deployment proof.

Observed checks: 14 focused cases and 3 import-selection component cases pass.
Desktop navigation covers all 13 tabs: 12 content tabs inherit 14 px panel text;
Dashboard retains its existing canvas redirect. Collaboration and Research remain
within a 390 × 844 viewport with no horizontal panel overflow. Numeric help shows
the configured bounds, including an explicit absent upper limit for Research tokens.
Help lists every registered icon. Shared Tooltip positions before paint so its
viewport clamp survives the open effect. The component test checks settled
bounds; live browser measurement changed from −11 px to the 8 px viewport inset.
The native affected gate passed with the app-pinned TypeScript 5.8.3 compiler. A
separate invocation of the parent TypeScript 5.9.3 reported 33 errors in unchanged
files; that alternate compiler run was not the native release gate.

## Spacing and typography follow-up

PRD: Remove excess whitespace between MainPanel sections and align workspace
settings with the existing Collaboration rows, including editable control text.

TAD/ADR: Shared KTV tokens own section spacing. Header and row density settings
remain the sole vertical padding owners; section margins, top padding and content
gaps no longer accumulate. Existing 36 px header targets remain available. Settings
workspace controls reuse MainPanelField, panel typography, named central icons and
source-owned preference handlers. The workspace-open action shares the selector
row. Selects grow within the shared value cell so their left edges align even when
an adjacent action is present. Numeric help reads conversion limits from its owner.
Code identifiers retain semantic monospace rendering.

MVP budget: at most 8 source modules / 30 KB changed; 20-minute implementation
window plus required validation. Actual change: 5 source modules plus this document,
no new packages or always-loaded feature entry points.

Verification: three focused cases pass, including preference changes, configured
font/size, keyboard collapse/expand and lazy-load ownership. Live Settings controls
and labels use 14 px panel text with identical grid columns. Collaboration headers
have zero extra section margin/padding/content gap while keeping their 36 px target.
At 390 × 844, Settings and its six workspace rows have matching client/scroll widths
(356 px) and stay within the viewport. Native affected validation binds the final
commit separately; local UI proof is not deployment proof.

GTM: Improve density and consistency within the existing product; no new tier,
telemetry collection or measured usability claim. Rollback is the presentation
commit revert; stored preferences require no migration.

## GTM

This improves the existing operator workflow without a new product or pricing tier.
Measure successful control discovery and fewer tab-specific explanations; no revenue
or usability lift is claimed without observation.

## Release and rollback

Publish the admitted candidate only after its required affected checks pass. The
review lane is a successor of the existing native-import mission. Revert this
presentation commit to restore prior layouts. Field values, imported files,
collaboration transport and storage are not migrated by this change.


## Cross-panel field alignment

PRD: MainPanel, FloatingPanel and BottomPanel configuration fields use the same
key/type/value columns, configured font and row density. A field does not change
presentation when its surface or an older caller API changes.

TAD: `KTV_FIELD_GRID_CLASS_NAME` owns the three responsive columns and 8 px column
gap. Shared rows, headers and labeled form fields consume it. The two-column,
icon-column and four-column grids are removed; existing layout inputs are
contract-only adapters. Slider/number pairs stay together in the value column.
The spacious value-row name also delegates to the single 4 px control gap.
`panelFieldDecorationClassName` prevents caller typography, spacing or grid
utilities from overriding field presentation while retaining color, borders,
visibility and placement. Panel text/select/textarea controls resolve font from
`usePanelTypography`; data-view line modes still own multiline behavior.

Range card and inline range APIs delegate to `PanelLabeledRangeField`, with native
label/input/output associations. `CollapsibleSubsection` delegates to the shared
section owner. Record inspector properties use the same rows and central icons.
BottomPanel and its shared transport controls now subscribe to panel typography;
legacy playback time/rate font sizes are removed at their CSS owner. Media rulers,
code editors, data tables and diagram geometry keep their content semantics.
The unused inspector-specific grid token, stylesheet and import are removed.

ADR: Consolidate existing owners without a new settings store, stylesheet overlay,
network dependency or renderer. Compatibility names contain no alternate layouts.
Enforce the contract with a source guard plus mounted interaction tests. Field
labels, input handlers, numeric limits, collapse behavior and lazy panel loading
remain governed by their existing feature owners.

MVP: 30 source modules / 80 KB change cap, no dependencies; implementation window
extended for source-contract migrations and live checks across three surfaces.
Regression checks cover every old row signature, all range aliases, conflicting
caller classes, live typography changes, accessible range labels, synchronized
value updates, header reuse, inspector fields and BottomPanel transport fonts.
The native affected receipt binds validation to the final commit. This is local
and pull-request verification; no production release is authorized.

Local verification: nine focused cases pass. Live MainPanel Settings and
Collaboration share the same desktop columns, 14 px field text and 8 px gaps;
FloatingPanel Renderer uses the same responsive contract. At 390 × 844, both
MainPanel and FloatingPanel rows measure 356 px client/scroll width without
overflow. BottomPanel playback time, rate and rate value inherit 14 px text.
The desktop viewport and Dashboard view were restored after verification.

GTM and rollback: Consistent controls reduce re-learning between panel surfaces.
Keep the free/offline local workflow. Revert this successor commit to restore the
previous presentation; workspace data and saved document content are unchanged.
