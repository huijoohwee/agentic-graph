---
title: Markdown Syntax Guidelines (SSOT)
product: agentic-graph Canvas
status: canonical
---

# Markdown Syntax Guidelines

## Purpose
Provide a strict, renderer-safe Markdown contract for {{product}} Chat output that can be ingested and rendered across Infinite Canvas, Workspace Editor, Multi-dimensional Table, and Kanban.

## Core Rules
- Respond with Markdown only. No preamble. No explanation.
- Variables use `{{key}}`, optional `{{key:value}}`, optional `{{key|fallback}}`.
- For chatAgenticGraph AGENTIC_OS output, include YAML frontmatter first, then a non-empty markdown body that references declared frontmatter variables via `{{}}`.
- For multi-part or complex chatAgenticGraph requests, `solution_md` must contain the substantive answer content, not a thin one-line summary.
- Never include fenced code blocks or chat-history trailers inside the canonical `agenticOs` document.
- The markdown body itself must carry the real answer content; do not rely on a `{{solution_md}}` shell as the body.
- Annotation sigils use inline code only: `#HEX:text`, `bg#HEX:text`, or `#HEX|bg#HEX:text` where HEX is exactly 6 uppercase digits.
- Prefer frontmatter `flow:` YAML for flow graphs; keep schema stable and parseable.
- Keep one opening YAML frontmatter block as the machine SSOT. Body Markdown is the human projection and must not contain a second metadata block, body `flow:` mirror, `## AGENTIC_OS Reading Layer`, or line-start `@node:` / `@edge:` declarations for Storyboard Widget topology.
- Canonical authored Markdown and reusable templates must keep `flow:` in plain YAML scalars, arrays, and objects.
- Normalized `{key, type, value}` wrappers are reserved for E2E ingestion/parsing/rendering fixtures after parsing; do not mix them into ordinary authored docs or templates.
- In normalized fixtures, reusable AGENTIC_OS-readable node summaries belong on the owning frontmatter node record, commonly as `agentic-os:readingSummary`.
- Switch-sensitive frontmatter-first docs must declare the full Canvas View preset explicitly so file switching stays deterministic: `kgCanvasSurfaceMode`, `kgCanvasRenderMode` when applicable, target renderer/mode key, `kgDocumentSemanticMode`, `kgFrontmatterModeEnabled`, `kgMultiDimTableModeEnabled`, and `kgDocumentStructureBaselineLock`.
- Persist every generated table or multi-dimensional table in the owning Rich Media Panel `output` property as a YAML block scalar containing a GitHub-flavored Markdown pipe table. Runtime renderers may derive semantic table DOM, but generated artifacts must never persist table HTML, `<br>`, `srcDoc`, or table-shaped `outputSrcDoc`.
- TypeScript generators must reuse `serializeMarkdownPipeTable`; Python generators must reuse `serialize_markdown_pipe_table`. Do not hand-author table header, delimiter, or row strings in generation code.

## Syntax Validation Rules

| Rule id | Check | Pattern | Pass condition |
|---|---|---|---|
| `V-01` | Color sigil HEX format | `` `#HEX:text` `` | HEX is exactly 6 uppercase digits |
| `V-02` | Long quote guard | prose | no quoted span ≥ 15 words |
| `V-03` | Variable references resolvable | `{{key}}` | all keys present in frontmatter or inline `{{key:value}}` |
| `V-04` | Multi-select arrays valid JSON | `` `["A","B"]` `` | `JSON.parse` succeeds after backtick strip |
| `V-05` | `compute:` function is pure | `compute: \|` block | no `fetch`, `document`, `window` in function body |
| `V-06` | No manual truncation ellipsis | `...` in headings | no `...` at end of H1–H4 labels |
| `V-07` | Confidence enum constrained | `confidence:` fields | values are exactly `low`, `medium`, or `high` |
| `V-08` | Single frontmatter authority | `---` blocks | exactly one opening YAML frontmatter block before body |
| `V-09` | No parallel Flow/AGENTIC_OS body layer | body text | no body `flow:`, `## AGENTIC_OS Reading Layer`, or line-start `@node:` / `@edge:` mirrors |
| `V-10` | Generated table source format | authored content outside fenced code | GitHub-flavored Markdown pipe table in a YAML block scalar; no authored `<table>` HTML |

## Retry Contract
On first failure, inject `@flag:correction` with `failed_rule: V-nn` into the next AI call. Max retry: `3`. After 3 failures surface `@flag:validation-failed`.
