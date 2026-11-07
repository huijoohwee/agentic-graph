---
title: "Agentic Reverse Engineering Demo"
doc_type: "Demo"
version: "0.1.0"
date: "2026-10-09"
lang: "en-US"
frontmatter_contract: "required"
scope: "one explicitly selected application and one explicitly selected repository root"
demo_mode: "static; no provider call"
---

# Agentic Reverse Engineering Demo

This walkthrough demonstrates a portable evidence workflow for understanding an existing
application and its selected codebase. It is a static example: it does not inspect a live target,
fetch a repository, call a model, execute source, or execute a binary.

## Workflow

1. **Declare scope.** Select one application surface and one repository root. Record the route or
   screen, observation time, and whether the local checkout is dirty. Do not infer sibling roots.
2. **Observe behavior.** Use the available browser or accessibility surface read-only. Record the
   visible state and inspection action. A button, declared tool, or source handler does not prove
   that the corresponding action succeeded.
3. **Index source.** Use the available bounded map, literal search, and exact-hash read operations
   within the selected root. Retain Git revision separately from current-byte hashes. Re-read an
   exact hash before relying on a source claim. Lexical imports and exports are navigation hints,
   not a compiler-resolved call graph.
4. **Build a local source graph.** If a registered local graph adapter is available, inspect its
   advertised ingestion and query schemas. Bind every query and edge explanation to the returned
   graph identity and snapshot digest. Preserve parser identity, source digest, completeness, and
   diagnostics. The selected root is the entire acquisition boundary.
5. **Inspect native files as data.** Read the registered parser's actual format support and bounds
   before making claims. Preserve format, architecture, offsets, record kinds, digest, and parser
   diagnostics. Unsupported formats remain unknown. This demo does not execute, load, emulate,
   disassemble, or decompile a target binary.
6. **Write the dossier.** Keep four evidence tiers separate: observed behavior; exact source facts;
   parser-derived metadata; inference and unknowns. Cite each claim to a route or repository-relative
   source and its current digest. State missing evidence instead of treating absence as a negative.

## Static example record

| Layer | Example record | What the record establishes |
|---|---|---|
| Application behavior | `route=/`; `state=visible catalog selection`; `action=read-only page inspection` | Only the displayed state at that observation. It does not establish execution or persistence. |
| Source context | `path=<relative-source-file>`; `revision=<Git revision>`; `sha256=<current bytes>` | The identified bytes were available in the selected checkout. It does not establish deployed behavior. |
| Source graph | `graphId=<opaque id>`; `snapshotDigest=<digest>`; `edgeId=<stored edge>` | One parser-produced relationship for that exact snapshot. It does not establish dynamic reachability. |
| Native metadata | `parser=<registered id@version>`; `format=<recognized format>`; `offset=<byte offset>` | The declared metadata extracted from the identified bytes. It does not establish runtime behavior. |
| Inference | `claim=<bounded interpretation>`; `based_on=[evidence ids]`; `confidence=<reasoned level>` | A reviewer can inspect its inputs and the remaining gap. It is not an observed fact. |

All placeholders remain literal in this example. No hidden corpus, external service, provider, or
credentials are required to open the Demo action.

## Reference implementation evidence

This subsection describes a reference implementation only; the workflow and scope contract above
remain repository-neutral.

| Evidence | Source identity | Result and limit |
|---|---|---|
| Bounded context map on the source-index package | Agentic OS working-tree revision `8dbda651566e5da8e46d497c1105b3a685973c64`; scope `guides`; snapshot digest `d8da963c644bde1f76b6f6ba6f88e65a2dbcf8a124094c5c61e3d526be5879b8` | 50 selected text files and 829,319 source bytes were read; output declared `atomicSnapshot: false`, `remoteFreshness: not-checked`, and `grantsAuthority: false`. |
| Bounded code map on the graph parser source | Graph working-tree base `ca334aabfc85301e0f94b8b65e72273313d04ace`; scope `mcp/agent-graph`; snapshot digest `bd38d3c35cbc6537b08f5d33227710f868b12830d731f273a92e64a6ec3c61c3` | 54 text files were indexed as lexical navigation. The parser addition was untracked at observation time, so the base revision does not contain it. |
| Exact read of the recognized binary metadata adapter | `mcp/agent-graph/native-binary-parser.mjs`; current-byte SHA-256 `d3bf771a07165091c2ab893acb96c7b30917a381dd58f71aac3b3285fd3ef70b`; read snapshot digest `55f77d08dff3d6f2d7615bc1c4373047afa2c07eea35433c9c7e10706b667d27` | The read verified exact bytes in a dirty working tree. It establishes source availability only; parser test results, release integration, deployed behavior, and native target execution are not claimed. |
| Apex catalog screenshot supplied with the task | Browser screenshot for the public product root, source revision not visible | It displays the Physics Playground selection, source-authored description, prompt editor, and a zero-model-call badge. The Demo action itself was not activated in that screenshot. |

In this reference implementation, the source operations are exposed by the `agentic-os context map`,
`agentic-os context search`, and `agentic-os context read` CLI routes. Other implementations may use
different interfaces while preserving the same scope, identity, and evidence boundaries.

These records demonstrate how the evidence format handles a real source checkout. They do not claim
that every app, source language, binary format, runtime, or agent is supported.
