# Rich Media Deliverables Widget Contract

## Outcome

The Deliverables Widget Card is a layout preset of the canonical `TextGeneration/default/textGeneration` Widget Card. It does not introduce another node type or make Rich Media panels executable.

The authored flow is:

```text
Generated Result.output
  -> Deliverables Widget Card.prompt_in
  -> Run
  -> Slide Deck.output
  -> Financial Model.output + Financial Model.xlsx
  -> optional approved Slides/Sheets MCP artifacts
```

The source edge must persist `flow:sourcePortKey: output` and `flow:targetPortKey: prompt_in`. Workflow-created output edges persist `text_out -> output`. The shared dataflow reader unwraps persisted object/property cells before the connected source becomes the Widget Card runtime prompt.

## Palette and Run ownership

- Palette layout id: `rich-media-deliverables`.
- Registry identity: canonical Widget Card (`TextGeneration/default/textGeneration`).
- Run owner: the downstream Deliverables Widget Card.
- Rich Media source and output panels remain read/render/edit surfaces; they do not gain a Run action.
- The shared Rich Media rail unwraps typed property containers and active-tab cells, then exposes supported text/image/video/audio semantic ports at the panel midpoint; text panels therefore expose `output`, not an unrelated media URL port. Auto/model/POI and missing-tab surfaces retain the established center-rail fallback.
- The card retains its authored instructions while the connected `prompt_in` value is the source material supplied to generation.
- A newly dropped card adopts the committed composed source graph before it becomes runnable. Consecutive append transactions use a live-first canonical union plus bounded pending-append authority so draft-only cards and authored edges survive while source reparse catches up; the guard clears when the source base contains the full draft. Ordinary debounced history snapshots must not reset that draft; only explicit Restore, Undo, or Redo may force history authority. Canonical `workspace::node` and source-local `node` identities reconcile only when the inner identity is unique across source layers.

## Bounded MCP invocation

The preset instruction contains existing source-backed `/`, `@`, and `#` tokens. On explicit Run, the browser posts only normalized invocation tokens to same-origin Dev/Preview `POST /__agentic_graph_mcp_agentic_os_docs_invoke`.

The bridge:

- accepts JSON only and rejects cross-site requests;
- bounds the body to 32 KiB and tokens to 12;
- invokes only `agentic-graph.agentic_canvas_os.docs.invoke` through the local stdio MCP server;
- exposes no caller-selected tool, filesystem path, endpoint, mutation, deployment, Prod, or Cloudflare action;
- resolves every normalized requested token under one eight-second request deadline and rejects incomplete or duplicate response coverage;
- returns literal invocation success/error evidence, which is passed to the configured chat provider.

If any requested token fails to resolve, Run fails closed before provider generation or output publication. A card with no invocation tokens may still use the configured provider without claiming MCP invocation.

External artifact creation is a separate capability-scoped gateway. The local stdio MCP server registers `agentic-graph.tool.catalog`, `agentic-graph.tool.search`, `agentic-graph.tool.describe`, and `agentic-graph.tool.call`. Profiles load only from `AGENTIC_OS_EXTERNAL_MCP_PROFILES_JSON`; each profile fixes one stdio or Streamable HTTP transport, exact upstream tool, live input-schema digest, canonical artifact argument mapping, host-owned constants, idempotency field, result pointers, and allowed HTTPS receipt origins. The browser can select only an opaque capability id; it cannot submit or override commands, endpoints, headers, environment variables, secrets, tool names, mappings, or raw upstream arguments.

When a matching Slides or spreadsheet capability exists, Run prepares a digest-bound action and pauses on an explicit confirmation that names the selected capability. Approval creates one expiring, single-use `external-file-write` token. Cancel skips `/call`; schema drift, changed artifact content, revision mismatch, expired/consumed approval, unsafe receipt origin, or upstream errors fail closed without exposing raw provider output. Local Markdown/XLSX artifacts remain authoritative even when optional external publication is unavailable or cancelled. A card may set `externalMcpRequired: true` to require both approved external artifacts before either panel is published.

## Structured provider response

Generation must return JSON whose `structuredContent` contains:

- one `panels[]` item marked `richMediaDeliverableKind: slide-deck`, with at least two non-empty Markdown slides separated by a line containing only `---`;
- one `tables[]` item marked `richMediaDeliverableKind: financial-model`, with columns and rows that normalize to a Markdown pipe table.

Both deliverables are parsed through the existing MCP-shaped structured-content owner. Invalid, partial, single-slide, or non-table output fails before panel publication.

## Reusable Rich Media outputs

The two outputs use distinct workflow-owned identities:

| Output | `workflowOutputKey` | Render contract |
| --- | --- | --- |
| Slide Deck | `markdown-slide-deck` | `text/markdown`, `markdownPresentationMode: true`, existing Markdown presentation renderer; generated iframe `srcDoc` stays disabled |
| Financial Model | `financial-model-spreadsheet` | authoritative `text/markdown` pipe table in the existing DataView/table renderer, plus a deterministic `.xlsx` companion workbook |

Publication uses the owned-output policy, so an existing authored downstream panel is not overwritten. Repeated Run upserts the same two panels and typed edges by anchor plus output key. Both panels freeze their generated local Markdown for display, so the lineage edge cannot replace the deck or table with the card's status summary. Financial-model persistence removes HTML/`srcDoc`; Markdown remains the source of truth.

The bounded Markdown table parser ignores fenced examples, preserves escaped cells, and rejects oversized or malformed tables. The browser-compatible workbook writer produces deterministic OOXML with inline strings, typed numeric/currency/percentage cells, a styled and frozen header, autofilter, bounded widths, and an exact XLSX MIME type. Provider-controlled strings never become formulas. The run writes an idempotent sibling workbook, SHA-256 metadata, and Markdown manifest; configured object storage may supply the durable download URL, while Dev/Preview serves an allowed local `.xlsx` path through `/__kg_fs_artifact`. The financial panel keeps workbook path, manifest, URL, MIME, hash, byte size, sheet, row, and column metadata. Workbook conversion and required durable persistence complete before either panel is staged.

The terminal order is: docs MCP evidence -> live text provider -> structured response validation -> Markdown table parse -> XLSX build/hash/persistence -> optional explicitly approved external MCP calls -> two panel staging -> one final graph persistence. A required-stage failure publishes neither panel. A sanitized external web URL may become the panel Open target; the full receipt remains separate structured metadata.

Source-layer composition recursively canonicalizes repeated `workspace::` aliases before persistence. Distinct edges that arrive with the same leaf id are collision-safely rekeyed, and interactive edge authoring reserves both canonical and qualified ids. This removes the repeated-card/edge clutter cause without treating rendered duplicates as independent nodes.

## Verification

Focused contracts cover:

- typed persisted Rich Media output crossing `output -> prompt_in` as a string;
- active text Rich Media panels exposing the authorable midpoint `output` rail, image panels exposing `imageUrl`, typed video cells exposing `videoUrl`, and auto mode retaining its center fallback;
- connected source precedence with authored instruction retention;
- bounded same-origin MCP invocation with exact all-token response coverage;
- structured deck/table parsing and fail-closed partial output;
- two distinct idempotent output panels without authored-target overwrite;
- native presentation-mode rendering without the generic iframe fallback, plus Markdown-only financial-table rendering;
- deterministic formula-safe XLSX OOXML, strict MIME/base64 local persistence, manifest/hash metadata, and a reload-safe download path;
- host-profile validation, live schema pinning, digest-bound single-use approval, explicit cancellation, idempotency, and sanitized external receipts;
- local-artifact display precedence across connected output edges and one final durable graph write;
- palette-drop persistence across composed-store commit, source reparse, and ordinary history append, with no canonical duplicate or double-prefixed node identity;
- recursive source-layer identity repair plus collision-safe edge preservation;
- Run lookup from a composed overlay id to its unique source-local draft node.

This contract is Dev/runtime work only. It grants no Prod mirror, Cloudflare, or release mutation.
