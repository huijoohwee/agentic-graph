---
title: "AgenticGraph Deterministic Knowledge-Graph Runtime"
doc_type: "Runtime Contract"
id: "agenticgraph-deterministic-knowledge-graph-runtime"
version: "1.1.1"
status: "active"
created: "2026-07-22"
updated: "2026-07-31"
author: "airvio / joohwee"
domain: "agenticgraph"
lang: "en-US"
frontmatter_contract: "required"
runtime_surface: "local-stdio-mcp"
implementation_policy: "Independently authored in-repository contracts and runtime; no copied parser generator, graph runtime, remote parsing service, or external conformance oracle."
constraints:
  - "deterministic"
  - "local-first"
  - "no-vector-store"
  - "no-model-call"
  - "network-only-for-explicit-repository-acquisition"
  - "every-edge-explained"
  - "honest-unsupported-diagnostics"
tags:
  - "knowledge-graph"
  - "mcp"
  - "ast"
  - "lexical-traversal"
  - "provenance"
  - "runtime-contract"
related:
  - "docs/documents/agenticgraph-query-prd-tad.md"
  - "mcp/README.md"
  - "README.md"
---

# AgenticGraph Deterministic Knowledge-Graph Runtime

## Authority and Scope

This document is the focused contract for AgenticGraph's deterministic local knowledge-graph runtime. The earlier [Queryable Corpus Graph PRD/TAD](agenticgraph-query-prd-tad.md) remains authoritative for the 2026-05-29 browser, Source Files, Canvas, and FloatingPanel Chat implementation history.

The 2026-07-22 runtime extension narrowly supersedes that PRD's Phase 1 no-CLI/MCP non-goal. The 2026-07-31 extension adds independently invocable parser generation and provider-neutral repository acquisition to the same local owner. It does not authorize a remote service, hosted graph API, second graph store, MCP-only materialization pipeline, model-backed retrieval path, or deployment.

## Independent Implementation Boundary

AgenticGraph's contracts, tool names, evidence model, parser registry, implementation, tests, fixtures, and documentation are independently authored in this repository. The runtime does not copy or use another parser-generator or knowledge-graph project as an implementation source or conformance oracle. Registered local adapters may reuse the repository's pinned TypeScript compiler and the host Python standard-library AST; neither creates a remote parsing or graph service.

## Local Invocation Surface

The capability has exactly four local stdio MCP tool identities:

| Tool | Purpose |
|---|---|
| `agenticgraph.knowledge_graph.parser_generate` | Return the `default-source` built-in local registry or compile bounded inert custom matchers and an optional declarative grammar into one canonical digest-bound parser registry. |
| `agenticgraph.knowledge_graph.ingest` | Build or refresh deterministic graph evidence for a supported local corpus. |
| `agenticgraph.knowledge_graph.query` | Retrieve graph evidence using lexical matching and graph traversal. |
| `agenticgraph.knowledge_graph.explain_edge` | Explain one stored edge from its source evidence and extraction basis. |

The matching Agentic Canvas OS aliases are:

| MCP tool | Exact Agentic Canvas OS invocation |
|---|---|
| `agenticgraph.knowledge_graph.parser_generate` | `/agentic.graph.parser.generate #agentic-graph #parser-generation #mcp @parser-specification @runtime-proof` |
| `agenticgraph.knowledge_graph.ingest` | `/agentic.graph.ingest #agentic-graph #mcp #runtime-ready @working-directory @agentic-graph @operator @runtime-proof` |
| `agenticgraph.knowledge_graph.query` | `/agentic.graph.query #agentic-graph #mcp #vcc @agentic-graph @runtime-proof` |
| `agenticgraph.knowledge_graph.explain_edge` | `/agentic.graph.explain #agentic-graph #mcp #vcc @agentic-graph @runtime-proof` |

A stdio MCP client calls the tool identity directly. `parser_generate` accepts exactly one selection: `profile: "default-source"` returns the existing built-in digest-pinned registry, while custom descriptors support bounded declared coverage. An ACOS-capable host resolves and validates the matching exact tuple above, then explicitly calls that tool; dictionary lookup alone never executes it. Callers use the input schema advertised by the running local server; authored docs do not duplicate that schema.

## Architecture and Ownership

The runtime follows one AgenticGraph-owned path:

```text
local corpus or acquired immutable repository -> verified parser-registry v2 -> deterministic AST/structural/inventory adapters -> sharded explained-edge snapshot -> lexical graph traversal -> MCP evidence
```

- Existing corpus, GraphData, evidence, and local MCP owners remain authoritative.
- The MCP surface is an adapter over shared graph contracts, not a new graph owner.
- The deterministic runtime does not require Neo4j, a vector database, an embedding index, or an external parsing service.
- Optional FloatingPanel Chat answer synthesis remains a separate downstream harness concern and is not part of these four tools.

Repository URLs are input data, not routing identities. Acquisition is selected
from the source-backed command and capability contract, while host admission is
an injected policy over canonical HTTPS repository identities. No repository,
organization, forge brand, or submitted URL receives a private invocation path.

## Deterministic Coverage Contract

Coverage is capability-driven. A filename or extension never implies a successful parse by itself.

| Corpus family | Required local behavior |
|---|---|
| Supported code | Use a registered deterministic AST adapter for structural symbols and relationships. |
| Supported documentation | Extract only locally observable document structure, bounded non-code text units, and source references. |
| Supported SQL schemas | Extract only locally observable schema structure and relationships. |
| Supported configuration | Extract structural keys, sections, and non-secret references without executing the configuration. |
| Supported PDFs | Extract locally available text and document structure without remote OCR or model fallback. |
| Generated language grammar | Compile bounded inert tokens and production rules, then emit a deterministic AST whose edges retain exact source spans and grammar identity. |
| Unknown or binary input | Preserve a deterministic inventory node so the source remains discoverable without inventing unsupported structural facts. |

Unknown formats remain visible through inventory evidence. Unavailable parsers, malformed or unreadable files, encrypted or image-only PDFs, unsupported syntax, and unresolved references must stay visible as limited, unsupported, or unresolved diagnostics. The runtime must not silently substitute a model, remote parser, embedding model, or guessed relationship. An explicit `repositoryUrl` ingest may use the network only to resolve and acquire one canonical credential-free HTTPS repository revision; parsing, storage, query, and explanation remain local and network-free.

## Every-Edge Explanation Contract

Every stored edge must be auditable from source-backed evidence:

- the edge identifies its relationship and direction
- its evidence identifies the source location and deterministic extraction basis
- its explanation states why that relationship exists without model-generated prose
- inferred or ambiguous resolution remains distinguishable from directly extracted structure
- supporting premises remain inspectable when an edge depends on other graph evidence
- missing or invalid evidence prevents the edge from being presented as authoritative

`agenticgraph.knowledge_graph.explain_edge` reads this stored evidence. It does not recreate an explanation through a model or vector lookup.

## Query Contract

`agenticgraph.knowledge_graph.query` uses lexical matching to select graph evidence and bounded graph traversal to expand it. Results retain edge direction, relationship labels, and source provenance.

The query path must:

- be deterministic for the same snapshot and request
- honor runtime depth, result, and output bounds
- distinguish an empty match from an incomplete or unsupported result
- return evidence rather than an uncited synthesized answer
- make zero embedding, vector-store, model, and network calls

Read-only graph projections remain transport-bounded rather than snapshot-bounded. The runtime fits
projection nodes and edges deterministically inside one shared byte ceiling, retains endpoint
closure for surviving edges, and reports `projection_byte_limit` when byte trimming rather than
result-count trimming makes the projection incomplete.

## Security Bounds

- Canonicalized source paths and resolved symlink targets remain inside the host-owned allowed root.
- Indexed content is parsed as data and is never executed as code, script, SQL, configuration, document action, or PDF behavior.
- Output remains inside the host-owned store boundary and must not present a partial or invalid run as complete.
- Content-addressed source, deterministically chunked repository-resolution, index, and manifest shards are individually bounded and committed behind one atomic current-snapshot pointer. In non-strict mode, an oversized source artifact becomes explicit `limited` source evidence with `source_artifact_limit_exceeded`; strict mode and an oversized single resolution record fail before pointer replacement.
- A cross-process, dead-owner-recoverable per-graph lease serializes ingest publication and rollback. Ingest writes immutable source shards as each source completes, retains only cross-source resolution records, and applies aggregate record and serialized-byte ceilings to both resolution inputs and derived edges. Ambiguous edges retain the exact candidate count plus a deterministic bounded candidate set that includes their target. A failed unpublished ingest rolls back objects it created and leaves the current pointer unchanged.
- File, corpus, traversal, and output limits fail closed with explicit diagnostics.
- Configuration structure may be indexed, but secret values must not be returned as graph evidence.
- Source-controlled labels and evidence are sanitized before MCP output.
- Local-directory ingest, parsing, storage, query, and explanation make no model call, network request, embedding request, or vector-store write. Explicit repository acquisition is the only network-capable phase.

When the installed local Python runtime predates a known grammar feature at the exact syntax-error
line, the parser may lower only a conservative validated subset of newer syntax and retain
deterministic lexical declarations/imports with explicit recovery diagnostics. Unvalidated or
unrelated malformed syntax still fails honestly and cannot be upgraded into a successful parse.

## Honest Diagnostic Contract

| Condition | Required outcome |
|---|---|
| Root or symlink escape | Reject the request without reading the escaped target. |
| Unsupported parser or syntax | Identify the unsupported source or capability; do not guess. |
| Malformed, unreadable, encrypted, or image-only input | Return an explicit bounded diagnostic. |
| Unresolved relationship | Preserve the unresolved state or omit the edge; do not fabricate a target. |
| Missing graph snapshot, node, or edge | Return a not-found diagnostic distinct from an empty successful query. |
| Runtime limit reached | Mark the result incomplete or rejected; do not imply full coverage. |
| Invalid edge evidence | Reject the authoritative edge explanation. |

## Acceptance and Validation

The runtime is ready only when all of the following hold:

- the local stdio inventory exposes the four declared knowledge-graph tool identities
- the `/`, `#`, and `@` mappings exactly match this contract
- parser generation emits only a canonical v2 registry; declarative grammars are finite JSON data with hard token, rule, repetition, byte, recursion, and operation bounds
- supported code uses deterministic AST parsing and supported non-code inputs use deterministic structural extraction
- every returned edge has a source-backed deterministic explanation
- query uses lexical graph traversal with no vector store
- ingest, query, and explain make zero model calls; only explicit repository acquisition may use the network
- path, symlink, secret, execution, size, traversal, and output bounds fail closed
- unsupported inputs and unresolved evidence return honest diagnostics
- no copied or separately hosted parser-generator or graph runtime appears in manifests, imports, subprocesses, runtime calls, vendored content, fixtures, tests, or generated assets

Documentation validation requires valid YAML frontmatter, `git diff --check`, and an authored-file length below 600 lines. Runtime implementation and tests remain owned by their existing code contracts; this document does not duplicate request schemas or test fixtures.

## Readiness Boundary

This contract proves only the local stdio knowledge-graph lane. It does not claim a Pages, Worker, Cloudflare, public HTTP, hosted MCP, browser WebMCP, vector, model, or cross-project graph service. Any future expansion requires a separate owner, threat model, acceptance gate, and explicit authorization.
