---
title: "MainPanel shared presentation — PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
doc_id: "AG-MAINPANEL-PRESENTATION-001"
version: "1.0.0"
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
Help lists every registered icon. Full canvas TypeScript checking reports 33 errors
in unchanged storage/media/test and Python-learning files; this is not a full green
typecheck claim.

## GTM

This improves the existing operator workflow without a new product or pricing tier.
Measure successful control discovery and fewer tab-specific explanations; no revenue
or usability lift is claimed without observation.

## Release and rollback

Publish the admitted candidate only after its required affected checks pass. The
review lane is a successor of the existing native-import mission. Revert this
presentation commit to restore prior layouts. Field values, imported files,
collaboration transport and storage are not migrated by this change.
