---
title: "agentic-graph MainPanel Readiness Rubric"
doc_type: "Operational Contract"
status: "active"
lang: "en-US"
frontmatter_contract: "required"
---

# agentic-graph MainPanel Readiness Rubric

## Intent

This document keeps `MainPanel Integrations` and `MainPanel MCP` readiness
claims honest, machine-checkable, and low-drama across Dev, Prod, and
Cloudflare.

Use it whenever a doc, checklist, or release note says a MainPanel surface is
"ready".

## Canonical Readiness Labels

Use exactly one label for each claim:

| Label | Meaning | Proof required | What it must not imply |
| --- | --- | --- | --- |
| `documented` | Static setup guidance or operator reference exists | Canonical source doc, row text, or config snippet exists | No browser proof; no runtime registration implied |
| `browser-published` | Browser runtime publishes an inspection or readiness snapshot | Browser-readable inspection artifact or surfaced readiness payload exists | No executable MCP owner implied |
| `runtime-executable` | A runtime owner actually registers and serves the tool, route, or action | Runtime registry or executable owner exists and can answer the claim | Not just docs, placeholders, or planned ids |

Do not collapse these labels into one generic `ready` claim.

## Surface Rules

### MainPanel Integrations

- The canonical provider universe is the full Settings-backed provider set.
- Any narrower projection, demo list, or SuperAgent subset must be labeled
  `scoped subset`.
- A subset must not be presented as the full provider-coverage truth.

### MainPanel MCP

- MainPanel MCP may contain both `documented` setup rows and
  `browser-published` readiness rows.
- A row becomes `runtime-executable` only when a local or remote runtime owner
  actually exposes that capability.
- Static connection templates are useful, but they remain `documented` until a
  runtime owner ships them.

## Current Repo Baseline

As of 2026-07-19, the source-owned repo truth is:

| Claim area | Current state | Notes |
| --- | --- | --- |
| MainPanel Integrations provider universe | `documented` contract with browser-published signals in parts of the shared chat readiness surface | Canonical coverage should follow the Settings-backed provider universe, not only a narrowed demo subset |
| MainPanel MCP agentic-graph-owned rows | Mixed `documented` and `browser-published` | Some rows are browser-readable readiness/setup surfaces rather than executable MCP routes |
| External bridge ids `agentic-graph.tool.catalog`, `agentic-graph.tool.search`, `agentic-graph.tool.describe`, `agentic-graph.tool.call` | `runtime-executable` on local stdio; Dev browser bridge for approved artifact calls | The runtime exposes only opaque host-approved capabilities. External writes additionally require a digest-bound, expiring, single-use approval after a separate browser confirmation. This is not Prod or Cloudflare proof. |

## Release-Gate Checklist

Use this checklist before promoting Dev -> Prod -> Cloudflare:

| Check | Pass condition | Fail condition |
| --- | --- | --- |
| Readiness label accuracy | Every MainPanel claim is tagged `documented`, `browser-published`, or `runtime-executable` | Generic `ready` language hides which proof exists |
| Tool-id truth | Any claimed MCP tool id exists in a real runtime registry when labeled `runtime-executable` | Docs/tests mention a tool id that no runtime owner registers |
| Provider-coverage truth | Claimed provider coverage matches the full Settings-backed provider set, or the subset is explicitly scoped | A narrowed demo subset is described as the global coverage surface |
| Browser-proof truth | Any `browser-published` claim is backed by a browser-inspectable payload or snapshot | The browser claim is prose-only |
| Runtime-proof truth | Any `runtime-executable` claim resolves through the runtime owner without doc-only shims | The capability exists only as guidance text or placeholders |
| Deploy truth | Prod or Cloudflare wording is used only after the promoted surface is actually validated there | Dev-only proof is described as shipped live proof |

## Minimal Promotion Flow

1. Update canonical Dev docs first.
2. Verify readiness labels against source owners.
3. Confirm provider coverage against the Settings-backed universe.
4. Confirm executable tool ids against the runtime registry owner.
5. Promote to Prod mirror only after the Dev contract is accurate.
6. Use Cloudflare/live wording only after live validation exists.

## Recommended Audit Sentence Templates

Use these exact shapes when documenting status:

- `documented`: "This MainPanel surface provides setup guidance only."
- `browser-published`: "This MainPanel surface publishes a browser-readable readiness snapshot."
- `runtime-executable`: "This capability is registered by the runtime owner and can be executed."

Avoid:

- "ready" with no qualifier
- "supported" when only setup prose exists
- "live" when the claim is still Dev-only or unregistered

## Source Owners

- Repo overview: `README.md`
- Local MCP contract: `mcp/README.md`
- MainPanel implementation owners: `canvas/src/features/panels/views/*`
- Browser-published readiness owners: `canvas/src/features/agent-ready/*`
- Planning ledger: `agentic-canvas-os/docs/TODO.md` plus the active `agentic-canvas-os/todo/YYYY-MM.md` shard
