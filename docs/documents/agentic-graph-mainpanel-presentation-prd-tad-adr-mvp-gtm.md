---
title: "MainPanel shared presentation — PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
doc_id: "AG-MAINPANEL-PRESENTATION-001"
version: "1.3.2"
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
Headless inspector validation passes all 11 tests after four panel modules import
icon helpers directly instead of loading the full UI/media export. Range fields
also use the shared row primitive directly, without a rich Markdown dependency.

GTM and rollback: Consistent controls reduce re-learning between panel surfaces.
Keep the free/offline local workflow. Revert this successor commit to restore the
previous presentation; workspace data and saved document content are unchanged.


## Application typography — dashboard reference

PRD: All application chrome uses the Markdown dashboard reference: system sans,
12/16 px supporting text, 14/20 px controls, 14/21 px prose, 16/24 px section
headings and 30/36 px dashboard titles. Keep semantic heading levels and code
monospace. Operators must not encounter another tiny-label or font-stack variant
when switching MainPanel, FloatingPanel, BottomPanel, Explorer or editor surfaces.

TAD/ADR: `grph-shared/src/ui/typography.ts` owns the text scale and reexports font
stacks from `fontStacks.js`, a build-independent ESM owner shared with headless tools.
The existing token generator emits CSS variables; Tailwind theme utilities,
`application-typography.css`, panel preferences, canvas measurement and exported
viewers consume them. Base typography and glyph alignment leave the global
stylesheet; touched pre-existing oversized modules retain or reduce their line
counts. The source hygiene gate runs before publication. Plain ESM `.js` matches the
shared package build contract; headless imports use a relative source path so
page-export dependency traversal retains the same font owner without a build.
Markdown heading pixel measurements derive from the same utility scale. Persisted
8–12 px arbitrary micro classes migrate idempotently to `text-xs`. Explicit other
user typography preferences remain supported. No new dependency, network font,
runtime stylesheet overlay, site-specific rule or eager feature loading is added.
Imported document CSS and world-space/media geometry remain source data; application
font defaults in those renderers still use the shared font owner.

The source guard traverses Canvas, grph-shared and gympgrph production TS/TSX/JS/MJS/CSS
and rejects arbitrary numeric text utilities, custom letter spacing, duplicated
font stacks and text sizes outside the shared scale, including inline CSS, SVG,
canvas labels and generated viewers. Export letter spacing uses the same rule. Generated typography is
checked against its source. Tests also parse exported SVG and check DOM/canvas
heading parity and migration of saved preferences. Existing typography integration
checks retain configurable fonts and nonlegacy sizes.

MVP: 300-module ceiling; the initial 200 KB edit estimate expanded to a 650 KB patch
budget after the traversal found long generated-viewer literals and 269 affected
consumers. New shared owner is under 100 lines and needs no separate loaded chunk.
Implementation and review are followed by live desktop/mobile measurements and the
native affected checks. Focused evidence is not a claim of every possible UI state.

GTM/rollback: This is a free, local/offline usability improvement. Publish the native
review candidate, retaining the running checkout for live review. Deployment and
protected integration need their own native authority. Revert the typography
revision as one unit so the shared owner, generated CSS and consumers stay paired.

Observed follow-up evidence: 11 focused cases cover source-only font imports without
a compiled package, actual SVG XML
parsing and the existing MainPanel/inspector/table/widget preference integrations.
Live dashboard retains 12/16, 14/21, 16/24 and 30/36 px reference roles. Twelve
MainPanel tabs inherit the system sans / 14 px baseline; populated tabs expose
12/14 px text with zero horizontal overflow. Mobile Settings at 390 × 844 stays
within x=17..373 and has zero horizontal content overflow. The offline lesson regression uses semantic folder disclosure buttons after the
Explorer selection/expansion split. The native affected
receipt remains the authority for the final committed source revision.

## Panel text role correction

PRD: Help, Settings and Workflow Manager must apply the reference roles to nested
content, including code examples, diagnostic identifiers, field names and hints.
Sharing a root font alone does not establish the intended text hierarchy.

TAD/ADR: Semantic `PanelCode` and `PanelCaption` reuse `usePanelTypography` and
override conflicting caller size classes. Help rows use the shared Canvas row
adapter; code forwards semantic attributes and no longer inherits field size.
Settings diagnostics and embed transport code use the same code owner. Graph
field names use the primary panel role; supporting IDs and field hints use the
caption role. Schema-editor typography resolves through the existing panel hook.
Remove direct fallback variants and Help's alternate line-height utility. Keep
explicit user typography preferences, field handlers and lazy loading.

MVP: 12-module / 60 KB cap; the 20-minute implementation window extended for live
verification and the native release checks. No new dependencies or network fonts.
Mounted regression checks cover semantic code/caption elements, rejected caller
overrides, live preference changes and Help attribute forwarding. Source guards
reject raw code in migrated consumers and direct schema-editor typography reads.

Observed local evidence: both focused panel cases, Canvas typecheck/runtime tests,
and source hygiene pass. Live Help code/captions and Settings diagnostic code use
12/16 px; field labels and controls use 14/20 px. Workflow Manager names use 14/20
px while their IDs and hints use 12/16 px. All three tab panels measure 864 px
client and scroll width. Keyboard tab activation and section expansion work.
This evidence covers the reported desktop states; native affected validation and
provider checks bind the committed candidate separately.

Affected validation also exposed an earlier stale token-export assertion that
rebuilt only the theme blocks. Its exact stylesheet comparison now includes the
typography generator, matching the production CLI composition without dropping
the theme, determinism, size-limit or byte-parity assertions.

GTM/rollback: Improve consistency in the existing free local workflow. No measured
usability or revenue claim. Revert this correction to restore the preceding role
assignments; no data or preference migration is introduced.

## Reference control height and overflow

PRD: Dashboard actions, the run inspection selector, metric group, search field,
and Geo actions share the reference control height. Long labels stay on one line
and use ellipsis inside their available width; semantic names remain complete.

TAD/ADR: The existing `--kg-control-height` token (28 px) owns height. Shared theme
control classes supply the single-line box, zero vertical padding, width bounds
and ellipsis. Mission overview, run inspection and Geo consume that owner instead
of separate `h-9`, padding-derived heights or wrapping minimum heights. Metric
segments shrink with their group and truncate their labels with full accessible
names and hover text. Inputs and native selects retain their existing handlers.

MVP/evidence: Seven modules, below the 10-module / 40 KB cap. GitHub's reference
button measures 28 px. Live dashboard actions, selector, search and metric group
also measure 28 px. At 390 px viewport width the metric group has equal client and
scroll widths (314 px). At 1113 px the Geo location button remains 28 px high,
ellipsizes its full label, and its value cell has equal client and scroll widths
(135 px). View switching, metric toggling, search and whole-run selection work.
Canvas checks, both shared package builds and the Geo composition check pass.
The native affected receipt binds broader validation to the committed candidate.

GTM/rollback: This improves the existing free local interface without adding a
package or network request. Revert the revision as a unit to restore the previous
control geometry; workspace data and preferences need no migration.


## Shared form height follow-up (2026-09-29)

PRD: Match the reference 28 px height for dashboard source selection, source path
fields, Save, Open actions, and settings text/number/drop-down controls. Inline
labels align with the same height; long values remain bounded with ellipsis.

TAD/ADR: `UI_THEME_TOKENS.control.singleLine` remains the geometry owner.
`normalizeSingleLineControlClassName` rejects conflicting height, padding,
line-height, box-sizing, overflow and wrapping utilities, including responsive
variants. Panel primitives and settings rendering use it. Persisted panel input
preferences migrate on read and write. Row density remains independent of control
height. Multiline settings editors reuse decoration without fixed height or nowrap.
Dashboard Open actions reuse `MainPanelIconButton` and Help's `action.open` icon;
accessible labels, disabled behavior and existing file handlers remain intact.

MVP/GTM: Local/offline presentation change, no service, dependency or pricing
change. Budget: 14 modules, under 50 KB patch (including one browser-test readiness fix). Focused typography migration tests
cover canonical sizing, idempotence, both density options, multiline preservation
and source-owner guards. Live desktop measurements: all eight dashboard controls
and Integrations' context dropdown are 28 px; JSON editor remains 130 px/pre-wrap.
At 390 px, Integrations content/scroll widths are 356/356 px; dashboard form widths
are 348/348 px. Native affected validation is recorded with release proof. Full-app boot readiness
accepts multiple source roots; all subsequent named-control and storage assertions remain.
Rollback: revert this follow-up; no content or storage-format migration is needed.
