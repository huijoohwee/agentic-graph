---
title: "agentic-graph Queryable Corpus Graph - PRD and TAD"
doc_type: "Combined PRD/TAD"
id: "agentic-graph-query-prd-tad"
version: "0.3.0"
status: "implemented-finetune-contract"
created: "2026-05-29"
updated: "2026-07-22"
author: "airvio / joohwee"
domain: "agentic-graph"
lang: "en-US"
frontmatter_contract: "required"
deployment_topology: "Dev -> Prod -> Cloudflare"
dev_root: "$GITHUB_ROOT/agentic-graph"
prod_mirror: "$GITHUB_ROOT/huijoohwee/content/agentic-graph"
cloudflare_route: "https://airvio.co/agentic-graph"
implementation_policy: "Independent native implementation with no copied parser generator or separate graph runtime."
constraints:
  - "universal"
  - "neutral"
  - "project-agnostic"
  - "file-agnostic"
  - "native in-repo"
  - "foss-first"
  - "tco-zero"
  - "token-economical"
  - "harness-first"
tags:
  - "queryable-graph"
  - "source-files"
  - "import-folder"
  - "import-file"
  - "floating-panel-chat"
  - "editor-workspace"
  - "canvas"
  - "rendering-pipeline"
  - "corpus-index"
  - "graphrag"
  - "prd"
  - "tad"
related:
  - "huijoohwee.github.io/guidelines/prd-tad-guidelines.md"
  - "docs/documents/agentic-graph-source-files-import-document.md"
  - "docs/documents/agentic-graph-chat-ai-markdown-pipeline-document.md"
  - "docs/documents/agentic-graph-agent-ready-prd-tad.md"
  - "docs/documents/agentic-graph-deterministic-agent-graph-runtime.md"
---

# agentic-graph Queryable Corpus Graph - PRD and TAD

## Executive Summary

agentic-graph should turn an imported folder or file set into a queryable knowledge graph that can answer questions about app code, database schema, infrastructure, scripts, documentation, papers, images, and videos through the existing Toolbar -> Launch -> Import folder, Toolbar -> Launch -> Import file, Editor Workspace, Source Files, Canvas, Rendering Pipeline, and FloatingPanel Chat surfaces.

This is a native in-repo enhancement. agentic-graph defines its own contracts from existing Source Files, GraphData, Canvas, chat, and MCP owners and adds no copied parser generator or separate graph runtime.

The original min-viable-max-value version finetuned the existing E2E pipeline without a parallel CLI or external service. The user imports a folder or file, Editor Workspace persists and previews source artifacts, Source Files parses and composes graph fragments, Canvas renders the active queryable graph, and FloatingPanel Chat queries that graph with bounded context, citations, and token-cost logs.

**Implementation note (2026-05-29)**: The Phase 1 through Phase 3 native slice is implemented through `canvas/src/features/queryable-corpus/`, existing workspace import owners, Source Files composition, and FloatingPanel Chat request construction. The implementation does not add a copied parser generator, a separate graph runtime or database, a duplicate import bridge, or a standalone chat pipeline.

**Long-horizon harness note (2026-06-04)**: The queryable corpus graph is a research/scout input for agentic-graph's native SuperAgent harness, not a separate harness memory store. SuperAgent runs must reuse the same source-unit, GraphData, citation, and chat-pack owners; DeerFlow-style long-horizon concepts are inspiration only and must not introduce copied graph extraction, parser, or query execution paths.

**Deterministic local runtime extension (2026-07-22)**: The earlier Phase 1 no-CLI/MCP non-goal is superseded only for the bounded local stdio tools and ACOS aliases defined in the [focused deterministic agent-graph runtime contract](agentic-graph-deterministic-agent-graph-runtime.md); the original browser/chat implementation history remains unchanged.

## Directive Commitments

| Directive | Product rule | Technical rule |
|---|---|---|
| Universal | The feature works for any corpus shape, not one app or repo. | Source unit metadata is typed by evidence, not by project name. |
| Neutral | No default stack, framework, provider, or vendor assumption. | Parser adapters emit generic graph nodes and edges with optional domain facets. |
| Project-agnostic | Imported paths remain user data, never hardcoded product fixtures. | Tests use synthetic local fixtures and forbid absolute user-path expectations. |
| File-agnostic | Code, schemas, scripts, docs, papers, images, and videos enter one graph contract. | Import adapters normalize into `SourceUnit -> ExtractionArtifact -> GraphFragment`. |
| Native in-repo | Existing Toolbar, Workspace, Source Files, parser, and chat owners are enhanced. | No copied parser generator, copied skill, copied CLI, or duplicate graph runtime. |
| FOSS-first | Local parsers and browser/runtime APIs are preferred before paid model calls. | AI harnesses run only after local extraction cannot satisfy the query. |
| Token-economical | Queries use graph packs and citations instead of rereading the whole corpus. | Every AI call logs tokens, cache hits, and estimated cost. |

## Independent Implementation Boundary

The implementation is independently authored and uses no copied parser generator or separate graph runtime as a dependency, service, implementation source, or conformance oracle. Registered local adapters may reuse dependencies already pinned by the repository.

agentic-graph's implementation remains grounded in its existing browser workspace, Source Files, GraphData, AGENTIC_OS markdown, and Cloudflare deployment topology.

## Current Implementation Baseline

| Concern | Current owner | Existing behavior | Enhancement target |
|---|---|---|---|
| Launch menu | `canvas/src/lib/toolbar/LaunchDropdown.impl.tsx` | Provides `Import local files`, `Import folder`, `Import URL`, Workflow Manager, and export actions. | Keep the same entry points and add corpus graph intent/state. |
| Workspace action bridge | `canvas/src/features/markdown-explorer/workspaceActionBridge.ts` | Bridges Launch actions into Markdown Workspace import handlers. | Route file/folder imports through a corpus-aware import result without adding a second bridge. |
| Local file/folder import | `canvas/src/features/markdown-workspace/workspaceImport/localImport.ts` | Imports supported text, PDF, GLTF/GLB, JSON, CSV, HTML, SVG, YAML, Markdown, and folder-relative files. | Add code, SQL, R, shell, image, and video source-unit adapters behind the same import path. |
| Import finalize | `canvas/src/features/markdown-workspace/useWorkspaceFileActions/importActions.ts` | Commits created workspace paths, resolves graph application, focuses imported files, and reports status. | Emit corpus manifest, skipped/failed evidence, parse cache stats, and first query-ready graph state. |
| Editor Workspace | `canvas/src/features/markdown-workspace/*` | Persists imported files, previews documents, and owns workspace actions. | Show source-unit status, metadata sidecars, and first query-ready artifact without a new workspace. |
| Source Files compose | `canvas/src/features/source-files/applyComposedGraphFromSourceFiles.ts` | Composes enabled Source Files into active graph data with guards and signatures. | Compose per-source graph fragments into a corpus-level graph with provenance. |
| Parser registry | `canvas/src/features/parsers/default.ts` | Handles Markdown/frontmatter, GraphRAG text, Python, JSON, CSV, JSON-LD, and auto parsing. | Add neutral parser adapters for code, schema, scripts, media metadata, and multimodal summaries. |
| Canvas/rendering | `canvas/src/components/*`, `canvas/src/features/*render*` | Renders graph/table/workspace views from GraphData and mode state. | Render imported corpus graph as ordinary graph state with no renderer-specific fork. |
| GraphRAG text | `canvas/src/lib/graph/graphragTextPipeline.ts` | Builds entity/triple/analytics graph data for text. | Reuse as the FOSS-first fallback for docs and extracted text from papers/media. |
| FloatingPanel Chat | `canvas/src/features/chat/FloatingPanelChat.tsx` | Packs graph and markdown context, streams provider output, and publishes readiness snapshots. | Add query mode that retrieves graph evidence before token spend. |
| Chat coordinator | `canvas/src/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator.ts` | Owns request build, transport, streaming, AGENTIC_OS retry, validation, and finalize sequencing. | Reuse the coordinator for query answers; do not create a separate chat pipeline. |
| Chat contract | `canvas/src/features/chat/chatResponseBaseContract.ts` | Enforces universal AGENTIC_OS markdown and frontmatter-first output behavior. | Add query-answer contract with citations, graph refs, evidence confidence, and cost log. |

## Product Requirements

### Problem Statement

Solo builders and AI-native teams often need to understand a whole working system, not an isolated file. App code, database schema, infrastructure config, shell scripts, R scripts, documentation, papers, screenshots, and videos describe one operating reality, but they are usually searched and reasoned about separately. Reading every raw file into an LLM is slow, expensive, brittle, and loses provenance.

agentic-graph can solve this by turning imported corpus material into one queryable graph. The graph becomes the compact retrieval surface for follow-up questions, path finding, impact analysis, onboarding, architecture review, schema inspection, and agent handoff.

### Personas

| Persona | Job to be done | Constraint |
|---|---|---|
| Solo founder | Understand and evolve a mixed product stack quickly. | Minimize build hours, token spend, and recurring services. |
| AI-native developer | Give agents a compact, current graph instead of raw folders. | Must keep evidence, confidence, and source links inspectable. |
| Data/research operator | Query papers, docs, tables, scripts, and media together. | Needs file-agnostic ingest and neutral graph semantics. |
| Infrastructure maintainer | See app, database, and deployment dependencies in one view. | Needs schema/config/script relationships without framework hardcoding. |

### User Journey

| Stage | Action | Touchpoint | Pain Point | Opportunity |
|---|---|---|---|---|
| Trigger | User needs to understand a folder or file set. | Toolbar -> Launch | Raw files exceed practical chat context. | Import once, query many times. |
| Ingest | User selects Import folder or Import file. | Existing Launch picker | Mixed file types parse unevenly. | Normalize every input into source units with provenance. |
| Inspect | User sees graph, table, Editor Workspace, and Source Files. | Canvas, Editor Workspace, Graph Data Table | Graph may lack evidence or confidence. | Attach extracted/inferred/ambiguous edge status and source spans. |
| Query | User asks in FloatingPanel Chat. | FloatingPanel Chat | LLM rereads too much or guesses. | Retrieve graph evidence first, then answer with citations. |
| Iterate | User edits files or re-imports changed corpus. | Workspace / Source Files | Full reprocessing wastes time and tokens. | Hash-based cache reuses unchanged source units. |
| Share | User deploys or publishes queryable graph outputs. | Dev -> Prod -> Cloudflare | Local-only graphs are hard for agents to read. | Publish graph summaries through existing agentic-graph artifact routes. |

### Epics and User Stories

#### PRD-E01: Universal Corpus Import

**PRD-E01-S01: Import a folder into source units**

As a solo developer, I want Import folder to preserve nested paths and supported mixed files so that the corpus can be queried as one graph without losing provenance.

Acceptance criteria:

- Given a folder containing supported and unsupported files, when the user selects Toolbar -> Launch -> Import folder, then agentic-graph creates source units for supported files, records skipped files with reasons, preserves relative paths, and focuses the first query-ready artifact.
- `/goal` translation: Import folder produces source units, skipped/failed evidence, and a focused workspace artifact verified by a focused import test and no new parallel Launch entry point.

**PRD-E01-S02: Import file or file set into the same graph path**

As a developer, I want Import file to use the same corpus pipeline as Import folder so that single-file and multi-file workflows share graph semantics.

Acceptance criteria:

- Given one or more selected files, when the user selects Toolbar -> Launch -> Import file, then the same source-unit, parse-cache, graph-fragment, and Source Files compose path is used.
- `/goal` translation: Import file and Import folder share source-unit owners verified by tests that assert shared bridge/runtime usage and no duplicate parser stack.

#### PRD-E02: File-Agnostic Extraction

**PRD-E02-S01: Code and script graph extraction**

As an AI-native developer, I want app code, R scripts, and shell scripts represented as modules, commands, functions, imports, calls, inputs, and outputs so that I can ask about execution paths and dependencies.

Acceptance criteria:

- Given code or scripts in an imported corpus, when extraction runs, then graph fragments include file nodes, symbol nodes, dependency edges, and line/file provenance where available.
- `/goal` translation: code/script fixture imports produce typed nodes and provenance verified by parser tests with no project-specific names.

**PRD-E02-S02: Database and infrastructure graph extraction**

As an infrastructure maintainer, I want SQL schemas and config files represented as tables, columns, migrations, services, routes, bindings, and dependencies so that app, database, and infrastructure can be queried together.

Acceptance criteria:

- Given SQL and infrastructure files, when extraction runs, then agentic-graph emits neutral schema/config graph nodes with relationships to app code and scripts when references are observable.
- `/goal` translation: SQL/config fixtures produce schema/config graph fragments and cross-source references verified by tests that do not assume a specific framework.

**PRD-E02-S03: Docs, papers, images, and videos enter the same graph**

As a research operator, I want documentation, PDFs, images, and videos represented through extracted text, media metadata, captions/transcripts when available, and linked source artifacts so that multimodal evidence can be queried without a separate tool.

Acceptance criteria:

- Given docs, papers, images, or videos, when import completes, then agentic-graph stores a source artifact and emits graph fragments from local text/metadata first, with AI extraction only behind an explicit harness when needed.
- `/goal` translation: media/doc fixtures produce source artifacts and graph fragments or structured unsupported states verified by import and parser tests.

#### PRD-E03: Queryable Graph Chat

**PRD-E03-S01: Ask graph-backed questions**

As a user, I want FloatingPanel Chat to answer questions from the imported corpus graph so that answers cite files, graph nodes, and relationships instead of guessing.

Acceptance criteria:

- Given an imported corpus graph, when the user asks a question, then chat retrieves a bounded evidence pack, answers with graph refs and source citations, and logs token/cost metrics for any model call.
- `/goal` translation: graph-backed chat emits cited answers and cost logs verified by a chat submit test with bounded context.

**PRD-E03-S02: Path and explain workflows**

As a developer, I want to ask "what connects X to Y" or "explain this node" so that I can understand dependencies, impact, and rationale through graph traversal.

Acceptance criteria:

- Given two known entities or one selected graph node, when the user asks for path or explanation, then the query planner uses graph traversal before LLM summarization and returns evidence confidence.
- `/goal` translation: path/explain queries use traversal output before LLM text verified by unit tests for query planner ordering.

#### PRD-E04: Cache, Update, and Provenance

**PRD-E04-S01: Reuse unchanged extraction**

As a solo founder, I want re-imports to process only changed files so that repeated graph updates stay cheap.

Acceptance criteria:

- Given a previously imported corpus, when the same folder is imported with only one changed file, then unchanged source units reuse cached extraction and changed units are reprocessed.
- `/goal` translation: update import reuses unchanged cache entries verified by hash-based tests and parse count assertions.

**PRD-E04-S02: Separate extracted, inferred, and ambiguous edges**

As a reviewer, I want every edge to state whether it came directly from source text, inference, or ambiguous evidence so that I can trust or reject graph answers.

Acceptance criteria:

- Given a graph fragment from any adapter, when edges are composed, then each edge has `evidence.kind`, source refs, and confidence status.
- `/goal` translation: every composed edge has evidence fields verified by schema tests and no silent inferred edges.

#### PRD-E05: E2E Rendering and Query Readiness

**PRD-E05-S01: Imported corpus renders and queries through existing surfaces**

As a user, I want Import folder and Import file to flow through Editor Workspace, Source Files, Canvas, and FloatingPanel Chat so that the same corpus is inspectable, renderable, and queryable without switching tools.

Acceptance criteria:

- Given a mixed corpus import, when import finalization completes, then Editor Workspace lists the created artifacts, Source Files owns enabled parsed graph state, Canvas renders the active composed graph, and FloatingPanel Chat builds its evidence pack from that same graph state.
- `/goal` translation: E2E import -> parse -> render -> chat readiness is verified by focused tests and browser smoke with no duplicate import bridge, parser stack, renderer fork, or copied external artifact.

### Success Metrics

| Metric | Baseline | Target | Timeline |
|---|---:|---:|---|
| Folder import to query-ready graph for 100 text/code/schema files | Not available as one workflow | Under 30 seconds local parse, excluding optional AI extraction | Phase 1 |
| Re-import unchanged 100-file corpus | Full reparse risk | 90 percent or more source units reused from hash cache | Phase 1 |
| Query evidence pack size | Raw folder context | Under 8k prompt tokens for p90 query | Phase 2 |
| Answer provenance | Manual inspection | 100 percent answers include source refs or state no evidence | Phase 2 |
| Token cost per graph-backed query | Raw-file reread | 70 percent lower than raw-file prompt baseline on internal fixture | Phase 2 |
| Monthly TCO | Undefined | 0 USD fixed cost; optional BYOK model spend only | Phase 1 |
| ROI score | Not measured | 40 or higher for solo-dev workflow | Phase 0 gate |

### MoSCoW Priority

| Priority | Feature | ROI/TCO rationale |
|---|---|---|
| Must | Shared Import folder/file -> Editor Workspace -> Source Files -> Canvas -> Chat pipeline | Highest leverage; no new surface; zero fixed TCO. |
| Must | Hash cache and provenance fields | Prevents token and parse waste; enables trust. |
| Must | Query evidence pack for FloatingPanel Chat | Converts imported graph into user value. |
| Should | Code, SQL, R, shell, docs, PDFs, image/video metadata adapters | Expands file-agnostic value while remaining local-first. |
| Should | Query/path/explain commands inside chat | High ROI for debugging and onboarding. |
| Could | Optional AI multimodal extraction for images/video | Useful but token-cost sensitive; must be BYOK/harnessed. |
| Could | Published static graph wiki or GraphML exports | Helpful for agents, but export paths already exist for JSON/JSON-LD/GraphML. |
| Won't | Copy or call another parser-generator or graph project's package, service, fixture, schema, command, or runtime | Violates the independent native implementation rule. |
| Won't | Require Neo4j or a paid graph database | Violates TCO-zero for min-viable scope. |

### Min-Viable Scope

Phase 1 ships only:

- existing Launch Import folder and Import file paths
- Editor Workspace artifact listing, preview, and focus behavior
- source-unit manifest with path, media kind, hash, size, parser status, and skipped/failed state
- local parser adapters for already supported types plus initial code/schema/script extensions
- graph fragment composition with evidence fields rendered by Canvas as ordinary GraphData
- FloatingPanel Chat query context pack over active graph and source refs
- tests for shared import owners, cache reuse, provenance, Canvas/render readiness, and query evidence pack bounds

Out of scope for Phase 1:

- remote crawler of arbitrary repos
- background watch mode
- mandatory paid multimodal model calls
- remote MCP or hosted agent-graph service
- any MCP-only graph store, vector index, or duplicate materialization pipeline
- separate graph database

## Technical Architecture

### Overview

From imported corpus to query answer:

```
Toolbar Launch Import folder/file -> Workspace Import -> Editor Workspace artifacts -> Source Units -> Parser Adapters -> Source Files Compose -> Canvas Rendering Pipeline -> Query Evidence Pack -> FloatingPanel Chat -> Cited Answer
```

The architecture reuses the existing Editor Workspace, Source Files graph path, Canvas rendering stack, and FloatingPanel Chat coordinator. A new corpus layer should be a thin normalization and retrieval layer, not a second graph runtime.

### Source Unit Contract

```ts
type CorpusSourceUnit = {
  id: string
  workspacePath: string
  relativePath: string
  originalName: string
  mediaKind: 'code' | 'sql' | 'script' | 'doc' | 'paper' | 'image' | 'video' | 'data' | 'model' | 'unknown'
  mimeHint: string | null
  byteSize: number
  textHash: string
  status: 'pending' | 'parsed' | 'cached' | 'unsupported' | 'error'
  provenance: {
    importMode: 'file' | 'folder' | 'url' | 'workspace'
    importedAtMs: number
    parentFolderId?: string
  }
}
```

### Graph Fragment Contract

```ts
type CorpusGraphFragment = {
  sourceUnitId: string
  parserId: string
  graphData: GraphData
  evidence: Array<{
    edgeId?: string
    nodeId?: string
    kind: 'extracted' | 'inferred' | 'ambiguous'
    sourcePath: string
    lineStart?: number
    lineEnd?: number
    byteStart?: number
    byteEnd?: number
    confidence: 'low' | 'medium' | 'high'
  }>
  metrics: {
    parseMs: number
    inputBytes: number
    outputNodes: number
    outputEdges: number
    cacheHit: boolean
  }
}
```

### Query Evidence Pack Contract

```ts
type CorpusQueryEvidencePack = {
  query: string
  intent: 'ask' | 'path' | 'explain' | 'impact' | 'compare' | 'summarize'
  selectedNodeId?: string
  graphRefs: string[]
  sourceRefs: Array<{
    sourcePath: string
    lineStart?: number
    lineEnd?: number
    evidenceKind: 'extracted' | 'inferred' | 'ambiguous'
    confidence: 'low' | 'medium' | 'high'
    excerpt: string
  }>
  traversal: {
    nodeIds: string[]
    edgeIds: string[]
    maxDepth: number
  }
  budget: {
    maxPromptTokens: number
    estimatedPromptTokens: number
    cacheHits: number
  }
}
```

### Component Specifications

| Component | Responsibility | Interfaces | FOSS/vendor | Status |
|---|---|---|---|---|
| Launch import entry | Keep file/folder import discoverable in existing Launch menu. | File inputs, `getMarkdownWorkspaceActionBridge()` | Browser-native | Implemented through existing Launch bridge |
| Workspace import normalizer | Convert FileList and folder-relative paths into workspace entries and source units. | `importWorkspaceLocalFiles`, `importWorkspaceLocalFolder` | Browser-native | Implemented with corpus manifest output |
| Editor Workspace surface | Persist, list, preview, and focus imported corpus artifacts. | `WorkspaceImportResult`, workspace entries, source index | Browser-native | Implemented with import summary and focus flow |
| Corpus source manifest | Record source-unit metadata, hashes, status, and skipped/failed evidence. | `sourceFilesCorpusManifest.ts`, `WorkspaceImportResult.corpusManifest` | In-repo | Implemented |
| Parse cache | Reuse unchanged import artifacts by source text hash and report cache metrics. | `sourceFilesCorpusManifest.ts`, workspace import cache-hit status | In-repo | Implemented for unchanged file/folder imports |
| Parser adapters | Emit neutral graph fragments for file classes. | `parserSpecs.ts`, `corpusGraph.ts`, `corpusConfigGraph.ts`, `ParserSpec`, `GraphData` | In-repo / FOSS local parsers | Implemented for code, SQL, scripts, config, source-unit metadata |
| Graph fragment composer | Merge fragments and preserve evidence. | `composeGraphFromSourceLayers`, `applyComposedGraphFromSourceFiles` | In-repo | Implemented with evidence-kind preservation and cross-source inferred refs |
| Canvas/rendering pipeline | Render active corpus graph through existing GraphData display modes. | `GraphData`, renderer mode state, Graph Data Table | In-repo | Implemented via ordinary composed GraphData |
| Query planner | Classify ask/path/explain/impact/compare/summarize and select graph traversal. | `queryEvidencePack.ts` | In-repo | Implemented inside evidence-pack owner |
| Evidence pack builder | Build bounded citation packs for chat. | `queryEvidencePack.ts` | In-repo | Implemented |
| Chat harness | Generate answer only after evidence pack validation. | `floatingPanelChatSubmitRequest.ts`, existing FloatingPanel Chat submit coordinator | BYOK or server-managed provider | Implemented as evidence-pack system prompt injection |
| Cost logger | Emit token, cache, and cost metrics. | `queryEvidencePack.ts` preflight `costLog`, existing provider usage stream | In-repo | Implemented preflight; provider final usage remains in existing chat stream |

### Current Implementation Evidence

| Requirement slice | Evidence owner | Verification |
|---|---|---|
| Import file/folder creates source units | `workspaceImport/localImport.ts`, `sourceFilesCorpusManifest.ts` | `queryableCorpus.importManifest.cacheReuse` |
| Code, SQL, script, config parsing stays local and neutral | `parserSpecs.ts`, `corpusGraph.ts`, `corpusConfigGraph.ts` | `queryableCorpus.parsers.emitEvidence` |
| Media imports become explicit metadata source units | `buildCorpusMediaMetadataMarkdown` | `queryableCorpus.mediaImport.metadataSourceUnit` |
| Cross-source references keep auditability | `composeGraphFromSourceLayers` | `queryableCorpus.compose.crossSourceEvidence` |
| Chat receives bounded graph evidence before answer synthesis | `queryEvidencePack.ts`, `floatingPanelChatSubmitRequest.ts` | `queryableCorpus.chat.evidencePackContext` |
| Import -> Source Files -> Canvas -> Chat readiness uses existing owners | `applyWorkspaceImportToCanvas`, Source Files, chat request context | `queryableCorpus.e2e.importSourceFilesCanvasChatReadiness` |

### AI Harness Contract

Only the answer synthesis step requires an LLM. Import, local parsing, hashing, graph traversal, cache lookup, and evidence pack construction must run without model calls.

Harness:

```
Caller -> [Query Evidence Harness: schema-validated evidence pack] -> [LLM provider] -> [Validated cited answer + cost log] -> FloatingPanel Chat
```

Input schema:

- `query: string`
- `intent: enum`
- `graphRefs: string[]`
- `sourceRefs: cited excerpts with evidence kind`
- `budget.maxPromptTokens: number`

Output schema:

- `answerMarkdown: string`
- `claims: [{ text, sourceRefs, graphRefs, confidence }]`
- `missingEvidence: string[]`
- `costLog: { model, prompt_tokens, completion_tokens, cache_hits, estimated_cost_usd }`

Fallback path:

- If evidence pack is empty, return "No graph evidence found" with suggested import/index actions.
- If model call fails, return traversal/evidence summary without synthetic claims.
- If output citations do not map to input evidence, reject and retry once with correction.

Token budget:

| Pipeline | Prompt tokens | Completion tokens | Cache hit target | Budget |
|---|---:|---:|---:|---:|
| Ask query | 4000-8000 | 800-1600 | 60 percent | Under 10k total p90 |
| Path query | 2000-5000 | 600-1200 | 75 percent | Under 7k total p90 |
| Explain selected node | 1500-4000 | 500-1000 | 80 percent | Under 5k total p90 |
| Import extraction | 0 by default | 0 by default | 90 percent on re-import | AI disabled unless explicit |

Orchestration topology:

- Query path: sequential.
- Optional multimodal extraction: fan-out/fan-in by source unit, max 1 pass per changed file, circuit breaker on token budget or unsupported media.
- Chat retry: existing AGENTIC_OS-style validation loop, max 1 retry for citation failures in query-answer mode.

### Import Adapter Matrix

| File family | Examples | Phase 1 extraction | Phase 2 extraction |
|---|---|---|---|
| App code | `.ts`, `.tsx`, `.js`, `.py`, `.go`, `.rs` | File, module, import, exported symbol, function/class where local parser exists | AST-backed call graph per language |
| SQL schema | `.sql` | Tables, columns, indexes, foreign key text patterns | Dialect-aware parser adapter |
| R scripts | `.r`, `.R` | Functions, library calls, data inputs/outputs | Dataframe and package dependency inference |
| Shell scripts | `.sh`, `.bash`, `.zsh` | Commands, env vars, file paths, service calls | Command pipeline and side-effect classification |
| Docs | `.md`, `.txt`, `.html`, `.yaml` | Existing Markdown/GraphRAG/text/JSON graph paths | Cross-doc semantic communities |
| Papers | `.pdf` | Existing PDF-to-Markdown path then text graph | Citation graph and section-aware extraction |
| Images | `.png`, `.jpg`, `.webp`, `.svg` | Metadata/source artifact node; SVG text when safe | Optional BYOK vision harness |
| Videos | `.mp4`, `.mov`, remote video URLs | Metadata/source artifact and available transcript path | Optional transcript/shot summary harness |
| Data/model assets | `.csv`, `.json`, `.jsonld`, `.geojson`, `.gltf`, `.glb` | Existing graph/data/model import paths | Cross-source reference linking |

### Query Modes

| Mode | Trigger | Retrieval behavior | Answer behavior |
|---|---|---|---|
| Ask | Natural question | Keyword and graph-neighborhood retrieval | Concise answer with citations |
| Path | "connects X to Y", "path from X to Y" | Shortest path plus labeled edge evidence | Path explanation and missing links |
| Explain | "explain this", selected node | Selected node neighborhood and source spans | Node-centric explanation |
| Impact | "what depends on X" | Reverse dependency traversal | Impact list grouped by confidence |
| Compare | "compare X and Y" | Two neighborhoods plus shared edges | Similarities, differences, source evidence |
| Summarize | "summarize corpus/folder" | Top communities and high-degree nodes | Graph summary with uncertainty |

### Integration Contracts

| Interface | Protocol | Format | Errors |
|---|---|---|---|
| Launch import bridge | React/browser events | FileList | No files -> no-op; unsupported -> skipped record |
| Workspace import result | In-memory async call | `WorkspaceImportResult` plus source manifest | Failed files recorded, import continues |
| Editor Workspace focus | Store/action state | created workspace paths and active document | Missing artifact -> focus first valid file |
| Parser adapter | TypeScript function | `ParserSpec -> GraphData` | Adapter returns warnings, not thrown raw failures |
| Canvas render handoff | Store graph state | composed `GraphData` | Empty/invalid graph -> structured no-evidence state |
| Import cache | Existing workspace text/hash comparison plus corpus manifest metrics | `CorpusImportManifest.metrics.cacheHits` | Changed text -> reparse; unchanged text -> cached source unit |
| Query evidence pack | TypeScript function | query + graph snapshot -> evidence pack | Empty graph -> no-evidence response |
| Chat harness | Existing chat transport | messages + schema prompt | Provider error -> traversal-only fallback |
| Publish/sync | Existing Pages build/sync path | static assets and route files | Deploy failure does not alter local source truth |

### Architectural Decisions

## ADR-001: Enhance Existing E2E Import, Rendering, and Chat Owners

**Status**: Accepted and implemented  
**Date**: 2026-05-29

### Context

The existing app already has Launch file/folder import, Editor Workspace, Source Files composition, parser registry, Canvas rendering, and FloatingPanel Chat. Creating a copied CLI, separate graph service, or renderer-specific corpus path would add maintenance cost and violate native in-repo constraints.

### Decision

Implement queryable corpus graph behavior as an enhancement to existing owners. Add only thin corpus-manifest, parser-adapter, and evidence-pack modules where the current owners need a new responsibility boundary; keep rendering on ordinary GraphData.

### Alternatives Considered

1. Copy or vendor another parser-generator or graph runtime: rejected because it violates implementation policy and creates a parallel runtime.
2. Add a new external graph database: rejected for Phase 1 because TCO and deploy complexity exceed min-viable scope.
3. Native in-repo extension: accepted because it reuses the current import, workspace, graph, rendering, chat, and deployment topology.

## ADR-002: Graph Traversal Before LLM Answering

**Status**: Accepted and implemented  
**Date**: 2026-05-29

### Context

Raw-folder prompting wastes tokens and encourages unsupported claims. agentic-graph already has graph data, selected node state, and chat context packing.

### Decision

Every query answer first builds a bounded evidence pack from graph traversal, source refs, and selected context. LLM calls are allowed only after the evidence pack validates.

### Alternatives Considered

1. Send raw imported files to chat: rejected due to token cost and provenance loss.
2. Always require embeddings/vector search: deferred because local graph traversal is sufficient for Phase 1 and avoids extra TCO.
3. Evidence pack first: accepted as the most economical and auditable path.

## ADR-003: Evidence Kind Is Required on Edges

**Status**: Accepted and implemented  
**Date**: 2026-05-29

### Context

Queryable graphs are only useful when users can distinguish direct source facts from inferred relationships.

### Decision

Every composed edge emitted by corpus adapters carries evidence kind: `extracted`, `inferred`, or `ambiguous`, plus source references when available. The composer rejects silent inference.

### Alternatives Considered

1. Confidence-free graph edges: rejected because users cannot audit answers.
2. Single numeric confidence only: rejected because it hides source versus inference semantics.
3. Evidence kind plus confidence: accepted for clarity and neutral graph behavior.

### Deployment Strategy

The implementation must preserve the existing topology:

Dev `$GITHUB_ROOT/agentic-graph` owns source edits, tests, docs, and Pages build; prod mirror `$GITHUB_ROOT/huijoohwee/content/agentic-graph` receives generated app payload only; Cloudflare `https://airvio.co/agentic-graph` requires live smoke after sync/deploy when claiming production completion.

### Validation Plan

| Validation | Command or check | Scope |
|---|---|---|
| Frontmatter validity | Markdown begins with YAML frontmatter and quoted scalars where needed | This document and future generated docs |
| Import bridge regression | Focused tests for Launch file/folder shared bridge | Toolbar and workspace bridge |
| Source-unit manifest | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.importManifest"` | Workspace import |
| Parser neutrality | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.parsers"` | Parser adapters |
| Provenance completeness | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.compose"` | Graph fragment composer |
| Chat evidence bounds | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.chat"` | Query evidence pack/chat context |
| E2E render readiness | `npm --prefix canvas run test:ci:unit -- "queryableCorpus.e2e"` | Editor Workspace, Canvas, Chat |
| Hygiene gate | `npm run hygiene:check` | Repo regression bar |
| Typecheck | `npm --prefix canvas exec tsc -- -p canvas/tsconfig.json --noEmit --pretty false` | Canvas type safety |
| Build sync | `npm run pages:build-sync` | Dev -> prod mirror |
| Live smoke | `curl -I https://airvio.co/agentic-graph/` plus browser check | Cloudflare route |

### Traceability Matrix

| PRD requirement | TAD component | `/goal` condition |
|---|---|---|
| PRD-E01-S01 Import folder | Launch import, Workspace import, Source manifest | Import folder creates source units and evidence records without a new Launch path. |
| PRD-E01-S02 Import file | Launch import, Workspace action bridge | Import file and folder share bridge/runtime owners. |
| PRD-E02-S01 Code/script extraction | Parser adapters, Graph fragments | Code/script fixtures emit typed graph nodes and provenance. |
| PRD-E02-S02 SQL/config extraction | Parser adapters, Graph fragments | Schema/config fixtures emit neutral nodes and cross-source refs. |
| PRD-E02-S03 Docs/media extraction | Existing doc/PDF/data import plus media adapters | Docs/media fixtures produce artifacts or structured unsupported states. |
| PRD-E03-S01 Ask questions | Query evidence pack, Chat harness | Chat answers cite graph/source refs and log cost. |
| PRD-E03-S02 Path/explain | Query evidence pack, Graph traversal | Path/explain queries use traversal before LLM summarization. |
| PRD-E04-S01 Cache updates | Parse cache, source hashes | Re-import reuses unchanged cache entries. |
| PRD-E04-S02 Evidence kind | Graph fragment composer | Every composed edge has evidence kind and confidence. |
| PRD-E05-S01 E2E readiness | Editor Workspace, Source Files, Canvas, Chat | Imported corpus is listed, parsed, rendered, and query-ready through existing owners. |

### Implementation Phases

| Phase | Deliverable | Exit check | Status |
|---|---|---|---|
| 0 | Source audit and final implementation PRD review | Owners confirmed; no duplicate architecture. | Complete |
| 1 | Source unit manifest, cache, import file/folder shared pipeline | Focused import/cache tests pass. | Implemented |
| 2 | Parser adapter extensions and evidence-kind graph fragments | Parser/provenance tests pass. | Implemented for code, SQL, scripts, config, media metadata, and cross-source refs |
| 3 | Query evidence pack and FloatingPanel Chat context injection | Chat query tests pass with token bounds. | Implemented |
| 4 | Dev -> Prod -> Cloudflare build/smoke | Build sync and live smoke pass when publishing source changes. | Deployment gate; rerun for production claim |

## Acceptance Gate

This implemented PRD/TAD remains accepted when it keeps valid YAML frontmatter, measurable Must criteria, AI harness/fallback/token budgets, FOSS/TCO reasoning, native owner reuse, and explicit Dev -> Prod -> Cloudflare validation for production claims.
