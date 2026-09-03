# Webpage Markdown Artifact (ASCII Layout + Signals)

## Goal

Generate a deterministic, editable Markdown artifact that represents a webpage as a structured ASCII layout, without site-specific branching.

Implementation note: the artifact generator is split into small modules under `canvas/src/lib/websites/` and the legacy `kg-wireframe` fence alias is removed (use `kg-webpage-layout`).

## Inputs

- Converted webpage markdown (from URL import / website import).
- Optional appended extracted blocks (preferred when present):
  - `## Extracted Navigation Menus`
  - `## Pricing Comparison (Extracted)`
  - `## Company License Options (Extracted)`
  - `## Pricing Details (Extracted)`
  - `## Rendering Options (Extracted)`

## Output

- A Markdown document containing:
  - a summary overview
  - page statistics tables
  - sectioned layout blocks using box-drawing frames (`┌─/│/└─`)
  - detailed breakdown sections (header navigation, hero breakdown, template showcase grid, per-feature section stats, pricing comparison, etc.) when signal sets indicate them

## Frontmatter Contract

- `kgWebpageUrl`: source URL
- `kgWebpageView`: `markdown | json | html`

The webpage markdown artifact is stored in the markdown file itself (editable), and Viewer/Presentation render the same markdown (view-only switching).

## Signal Sources (Domain-Neutral)

- Headings (H1/H2) and section bodies
- Link classification tokens: `[NAV]`, `[CTA]`, `[LINK]`
- Media tokens: `[MEDIA]`, `[IMG]`
- Pricing/timecode tokens: `[PRICE]`, `[TIME]`
- Optional extracted blocks appended by the converter

## Layout Structure Merge Policy

The `## 📐 Layout Structure` section contains a single ` ```ascii` block.

- Keep only box-drawing frames (`┌─/│/└─`).
- Merge top-level `[NAV]/[CTA]/[LINK]/[IMG]` items from the extracted Document Structure tail into the **GLOBAL NAVIGATION** box content.
- Forbid emitting `+---` style tree frames in the output.

## DOM Layout Snapshot → Wireframe Graph (Design 2D)

- The Design 2D renderer uses a browser-native `webpageLayout` snapshot (DOM elements + bounding boxes + neutral CSS signals) as its SSOT for webpage wireframes. Snapshots are captured via the `kg-export-dom` layout mode and cached by `(url, viewport, fidelity, elementCount)` (no host/URL-specific branching).
- A deterministic DOM→graph converter builds a `webpageLayout` graph:
  - Captures title, viewport, scroll metrics, and a bounded list of elements with `rect`, text, attributes, and safe `style` fields. The exporter and converter are URL-agnostic and treat all pages uniformly.
  - Enforces geometric nesting (parent/child containment) using rect containment heuristics and bounds-aware clamping; re-parents elements when DOM containment and geometry disagree (within tolerance).
  - Drops small noisy leaves and overlapping glue boxes that are visually negligible or purely structural; preserves interactive/media elements and large semantic containers (headers, mains, cards) even when textless.
  - Treats utility-heavy, textless wrappers (`container`, `grid`, utility-class stacks) as layout glue when they fully match their children’s bounding box; re-parents children to the next semantic parent while preserving geometry.
  - Preserves major page sections as containers when they occupy a substantial viewport area, span most of the viewport width, and contain headings/interactive content; aria landmark roles (banner/navigation/main/contentinfo/region/search) are always preserved.
  - Synthesizes neutral `SECTION` containers for repeated grid/list regions (e.g., feature/pricing card grids) by detecting viewport-aware clusters of similar-sized siblings; optional H2/H3 headings immediately above the cluster become section labels via `ariaLabel`. Synthetic sections are internal layout aids and may be hidden in the Design wireframe view while still influencing grouping.
  - Never branches on `kgWebpageUrl` or host; all decisions are purely geometric/structural and bounded (no per-site rules).
  - Regression fixtures live under `canvas/src/__tests__/fixtures/` and drive DOM→graph parity expectations without hardcoding external domains.

## Design 2D Wireframe Presentation (Labels, Text, Media, Viewport)

- Design 2D renders DOM-derived frames as wireframe cards with:
  - bounded label/meta chips (SSOT ellipsis helpers, depth-aware opacity) placed using a collision-avoidance relax pass so labels do not overlap each other or frames; and
  - optional light-weight edges between frames derived from DOM parent links, gated by graph size and depth to stay bounded.
- Text and rich-media previews (headings/CTAs vs deep body copy, media placeholders for IMG/VIDEO/IFRAME/SVG/…) are driven by DOM signals but controlled by schema metadata, not by URL or site.
- Presentation knobs are exposed as schema-only settings under `renderer:designWireframe` and surfaced via the Floating Panel "Design wireframe" section; the UI does not introduce new behavior beyond these metadata fields.
- Webpage wireframe mode reuses the infinite canvas 2D viewport model (D3/Flow/Design/Storyboard Widget):
  - Collective fit/center is derived from the `webpageLayout` graph bounds (including frame dimensions) and cached by a shared schema-layout fingerprint.
  - Zoom view keys are per-renderer but share the same schema/layout fingerprint helper so switching D3↔Flow↔Design keeps layout SSOT while maintaining per-renderer zoom.
  - Design never falls back to the legacy non-webpage “frame grid” layout when a `webpageLayout` snapshot exists; when no snapshot is ready yet, Design shows a single placeholder frame (loading/error/idle) instead of a grid or empty canvas.

## Fixture-Driven Parity (Without Hardcoded Domains)

Fixture-like blocks (template showcase grid, pricing tables, etc.) are emitted only when corresponding generic signals and/or extracted blocks are present.

- Never branch on the host name or on `kgWebpageUrl`.
- Regression fixture input lives under `canvas/src/__tests__/fixtures/` and is used only by tests.
