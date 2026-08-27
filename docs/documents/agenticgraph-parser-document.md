---
title: "AgenticGraph Client-Side Parsers: Universal Format Specification"
doc_type: "Document"
date: "2026-05-27"
lang: "en-US"
frontmatter_contract: "required"
---

# AgenticGraph Client-Side Parsers: Universal Format Specification

## Markdown YAML Frontmatter Enforcement

- Canonical parser docs, format specs, and runtime-ready Markdown artifacts must start with a valid YAML frontmatter block as the first block in the file.
- Frontmatter is the SSOT for parser metadata, format ownership, version intent, and reusable context keys referenced by the body specification.
- Canonical authored parser docs use plain YAML for frontmatter and related schema-bearing blocks; do not replace normal authoring syntax with normalized typed wrappers.
- Normalized `{key, type, value}` wrappers are permitted only in dedicated validation fixtures that explicitly test ingest -> parse -> render, ingest -> parse -> validate, or parser-fidelity behavior.
- Scalars that contain reserved punctuation, including inline `:` content, must be quoted so strict YAML parsers read parser metadata deterministically.
- Parser warning, repair, or fallback behavior is recovery-only; malformed YAML frontmatter remains an upstream authoring defect that must be fixed at source.

## Parser Routing Keys, Diagram Kinds, Surfaces, Edges, And Forks

- Runtime-ready Canvas documents declare `kgParserRoutingContract.version: "agenticgraph-parser-routing/v1"` in opening frontmatter when parser output must route deterministically across Storyboard and Mermaid surfaces.
- The parser treats opening frontmatter and authored source payloads as the SSOT. It reads `kgCanvasSurfaceMode`, `kgCanvasRenderMode`, `kgCanvas2dRenderer`, `kgDocumentSemanticMode`, `kgFrontmatterModeEnabled`, `flow`, `flow.nodes`, `flow.edges`, `flow_diagrams`, `workflow`, `workflow.edges`, and `kgStrybldrStoryboard` without requiring filename heuristics or body-side graph mirrors.
- Diagram kinds remain data-level declarations: `mermaid_flowchart`, `mermaid_gitgraph`, `mermaid_architecture`, `mermaid_eventmodeling`, `mermaid_gantt`, `frontmatter_flow`, and `strybldr_storyboard`.
- Parser output must preserve explicit topology from `graphData.edges`, `flow.edges`, workflow edges, Mermaid edges, and Strybldr payload edges. Renderers may filter what is visible, but parser output must not drop fork, branch, review, or publish relationships because they are not part of a default label allowlist.
- Fork metadata is source-owned. Fields such as fork, branch, candidate, approval, review, and publish describe graph semantics and must surface as node/edge properties without downstream alias remapping or stale compatibility layers.

## Design Mantras

```
- [ ] Extensibility; register new parsers; forbid hardcoded format list
- [ ] Modularity; isolate format logic; forbid parser interdependencies
- [ ] Neutrality; preserve source structure; forbid format assumptions
- [ ] Ordering; match by capability; forbid ambiguous dispatch
- [ ] Provenance; track source locations; forbid lossy line mapping
- [ ] Robustness; handle malformed input; forbid parse crashes
- [ ] Transparency; expose conversion steps; forbid hidden transformations
```

---

## Universal Design Principles

| Context             | Intent                              | Directive                                                                                      |
|---------------------|-------------------------------------|------------------------------------------------------------------------------------------------|
| Capability Matching | Select appropriate parser           | - [ ] Match by format signature; first-match wins; forbid multi-match ambiguity              |
| Format Neutrality   | Support any structure               | - [ ] Parse without domain assumptions; forbid dataset-specific logic                         |
| Layer Metadata      | Provide rendering hints             | - [ ] Emit neutral layer specs; forbid renderer coupling                                      |
| Line Preservation   | Maintain source mapping             | - [ ] Record 1-based line ranges; forbid lossy tokenization                                   |
| Media Detection     | Extract multimedia references       | - [ ] Parse all media types; forbid format-specific extraction                                |
| Parser Registration | Centralize format handling          | - [ ] Register all parsers; dispatch by capability; forbid scattered parser logic             |
| Property Mapping    | Preserve all attributes             | - [ ] Copy fields to properties; forbid selective copying                                     |
| Schema Generation   | Derive from parsed structure        | - [ ] Build schema from graph; forbid hardcoded schemas                                       |
| Token Sharing       | Optimize parsing                    | - [ ] Share tokens across components; forbid redundant tokenization                           |

---

## Parser Architecture

**Parser Stack**: Registry → Capability Matching → Format Dispatch → Structure Parsing / HTML→Markdown Conversion → JSON-LD/Graph Construction → Metadata Enrichment

**Processing Flow**: Format Detection → Parser Selection → Tokenization / HTML→Markdown Conversion → JSON-LD Building → GraphData Conversion → Layer Derivation

**Design Principles**: First-match ordering | Format-agnostic structures | Provenance preservation | Shared tokenization

### Parser Registry

**Registration Order** (first-match precedence): Markdown → GraphRAG Text (heuristic) → Python → Auto (CSV/JSON/JSON-LD + GraphRAG bundle + n8n)

**Selection Algorithm**: Iterate registered parsers → test canParse predicate → return first match → fallback to error

| Parser Type  | Capability Predicate                     | Output Format           | Typical Extensions        |
|--------------|------------------------------------------|-------------------------|---------------------------|
| Markdown     | URL or `.md` / `.markdown`               | JSON-LD → GraphData     | .md, .markdown, URL text  |
| GraphRAG Text| `.txt` or plain-text heuristics          | GraphData               | .txt, plain text          |
| Python       | Parser spec selects Python               | GraphData (code graph)  | .py                       |
| Auto         | Always matches (fallback)                | GraphData               | .csv, .json, .jsonld      |

---

## Video Analyzer: YouTube Import

Canvas supports YouTube import via the `/__youtube_transcript` endpoint. The server returns transcript JSON plus a Markdown representation; the client then loads the result through the standard parser/loader path. It extracts transcripts/subtitles/captions (manual or generated), groups them into paragraphs, and emits:
- Markdown for Markdown Editor/Preview/Slides
- Transcript JSON for JSON-backed markdown workspace and UI Editor flows (`jsonSourceDocumentText`)

Transcript JSON payload (for JSON-backed markdown workspace + UI Editor node properties) includes:
- metadata: `title`, `video_id`, `source_url`, requested/selected language, `is_generated`, `is_translatable`, `translation_languages`, `oembed`, timing metrics (`start_s`/`end_s`/`duration_s`), `segment_count`, `generated_at_ms`
- segments: `{text,start,duration}` entries (`segments`)

Implementation note: `agenticgraph_parser youtube` uses a robust native implementation to fetch transcripts via the YouTube `timedtext` API (parsing XML/JSON) or InnerTube API (Android client emulation), with fallbacks to `yt-dlp` and `whisper`. It avoids external dependency breakage (`youtube-transcript-api`) and handles session cookies/signatures natively.

| Surface | Responsibility (S-V-O) | Implementation |
|---------|-------------------------|----------------|
| Toolbar (Canvas) | User opens YouTube import UI → enters URL/ID → fetches transcript JSON → loads Markdown view | `canvas/src/features/toolbar/ToolbarYouTubeArea.tsx` → `canvas/src/features/toolbar/youtubeImportAction.ts` |

Pipeline map:
- Import `docs/documents/agenticgraph-pipeline-map.graph.json` into Canvas (as JSON) to visualize the runtime + Python pipeline call graph.

## Component Specifications

### Component: Parser Registry

**Responsibility**: Maintains ordered list of parsers and dispatches to first matching parser.

**Selection Strategy**: First-match ordered iteration over registered parsers with capability predicates.

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| Parser Registration  | Build parser list               | - [ ] Register in precedence order; forbid unordered registration                          | default.ts       | ParserRegistry  | registerParsers         | —              | Parser spec list             | Registry instance      | Array push in order              |
| Capability Testing   | Check format match              | - [ ] Test canParse predicate; forbid multi-match                                          | default.ts       | ParserRegistry  | testCapability          | —              | Text, parser spec            | Boolean (can parse)    | Predicate evaluation             |
| Parser Dispatch      | Select and invoke parser        | - [ ] Find first match; call parse method; forbid fallthrough without match               | default.ts       | ParserRegistry  | dispatchParser          | —              | Text, name                   | GraphData or error     | Find + invoke pattern            |
| Fallback Handling    | Handle no match                 | - [ ] Return descriptive error; suggest formats; forbid silent failure                     | default.ts       | ParserRegistry  | handleNoMatch           | —              | Text                         | Error object           | Error construction with hints    |

---

### Component: Markdown Parser

**Responsibility**: Parses Markdown to JSON-LD with structural and semantic layers, then converts to GraphData.

**Layer Emission**: documentStructure (nodes/edges for structure) + Mermaid-derived concept-map edges (optional) + provenance (line ranges)

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency       | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|------------------|------------------------------|------------------------|----------------------------------|
| Block Parsing        | Split Markdown into blocks      | - [ ] Parse headings/paragraphs/code/lists/tables; preserve order; forbid block loss     | lib/markdown     | BlockParser     | parseMarkdownBlocks     | —                | Markdown text                | Block list             | Line-based block parsing         |
| Structure Building   | Create document structure nodes | - [ ] Build Document/Section/Paragraph nodes; link hierarchically; forbid orphaned nodes | markdownJsonLd   | MarkdownGraphBuilder | buildMarkdownJsonLd | —             | Block list                   | JSON-LD @graph         | Hierarchical node creation       |
| Media Extraction     | Parse inline references         | - [ ] Extract links/images; normalize URLs; forbid broken refs                            | markdownJsonLd   | InlineRefExtractor | extractMarkdownInlineRefs | —           | Paragraph text, base URL     | Link/image refs        | Inline marker parsing            |
| Mermaid Processing   | Extract Mermaid nodes/edges     | - [ ] Parse Mermaid blocks/frontmatter; preserve IDs; forbid graph loss                   | markdownJsonLd   | MermaidParser   | parseMermaidFrontmatter | —                | Mermaid code                 | Nodes/edges            | Line-aware Mermaid parsing       |
| Line Mapping         | Preserve source positions       | - [ ] Record lineStart/lineEnd; 1-based; forbid 0-based or missing ranges                | markdownJsonLd   | MetadataBuilder | mkMeta                  | —                | Start/end line numbers       | Node metadata          | Immutable provenance stamping    |
| JSON-LD Conversion   | Build JSON-LD                   | - [ ] Emit @context/@graph; keep properties/metadata opaque; forbid semantic validation  | markdownJsonLd   | Builder         | buildMarkdownJsonLd     | —                | Markdown text                | JSON-LD document       | Schema-aligned assembly          |
| GraphData Conversion | Convert to GraphData            | - [ ] Parse JSON-LD to GraphData; preserve properties; forbid property loss              | parseJsonLd      | Converter       | parseJsonLd             | —                | JSON-LD document             | GraphData              | JSON-LD interpretation rules     |
| Metrics Tracking     | Record parse timing             | - [ ] Measure parse/build stages; store in `graphData.metadata`; keep metrics inspection-only | parsers/default.ts | —            | Parser `parse()` impl   | Date.now()       | Markdown text                | `metadata.ingestionMetrics` | Delta calculation             |

**Verified performance patterns (implementation-aligned)**:
- Parse-result LRU+TTL cache keyed by `(parserId, name, hashText(text), cfgKey)`: `canvas/src/features/parsers/cache.ts`
- Worker parsing (off-main-thread) with bounded timeouts and worker reset on hard error: `canvas/src/lib/graph/parseWorker.ts`
- HTML → Markdown conversion yields to idle time and uses a unified converter with bounded caching: `canvas/src/features/parsers/html-parser.ts`, `canvas/src/lib/markdown/htmlToMarkdownUnified.ts`
- Keyword-mode derivation is debounced and cached by `(algoVersion, docId, hashText(text))` to avoid keystroke churn: `canvas/src/hooks/useActiveGraphData.ts`
- Pipeline metrics payloads are stored in graph metadata for inspection (not required for ingestion): `canvas/src/features/parsers/agenticRag.ts`

**Mermaid Support**:

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency       | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|------------------|------------------------------|------------------------|----------------------------------|
| Node Shape Parsing   | Support Mermaid flowchart shapes | - [ ] Parse `(( ))`, `[ ]`, `{ }`, `{{ }}`, `@{ shape: ... }`; map all Mermaid shapes to Canvas `circle|rect|diamond|hex`; forbid shape parse failures | mermaid_parser   | ShapeParser     | parseNodeShape          | —                | Mermaid node text            | Shape type             | Pattern match + safe fallback mapping |
| Edge Parsing         | Handle complex edges            | - [ ] Parse o--o, x--x, <-->; forbid edge parse errors                                    | mermaid_parser   | EdgeParser      | parseEdge               | —                | Mermaid edge text            | Edge object            | Pattern matching with symbols    |
| Subgraph Handling    | Support nested graphs           | - [ ] Parse subgraph blocks; maintain hierarchy; forbid subgraph loss                     | mermaid_parser   | SubgraphParser  | parseSubgraph           | —                | Mermaid block                | Subgraph structure     | Recursive descent                |
| Class Application    | Apply style definitions         | - [ ] Parse classDef; apply to nodes; forbid class mismatch                               | mermaid_parser   | ClassApplier    | applyClasses            | —                | Class defs, nodes            | Styled nodes           | Class name matching              |

---

### Component: HTML → Markdown Converter

**Responsibility**: Converts HTML documents to Markdown while preserving structure and media.

**Conversion Strategy**: Parse DOM → map tags to Markdown syntax → resolve URLs → emit Markdown

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| DOM Parsing          | Parse HTML structure            | - [ ] Use DOMParser; traverse tree; forbid malformed HTML                                 | html-parser      | DOMParser       | parseHTML               | DOMParser      | HTML text                    | DOM tree               | DOMParser.parseFromString        |
| Tag Mapping          | Convert tags to Markdown        | - [ ] Map h1→#, p→text, ul→bullets; forbid lossy mapping                                 | html-parser      | TagMapper       | mapTagToMarkdown        | —              | DOM node                     | Markdown syntax        | Switch on tag name               |
| Media Extraction     | Extract media elements          | - [ ] Find img/video/iframe; convert to ![](url); forbid media loss                       | html-parser      | MediaMapper     | extractMediaTags        | —              | DOM tree                     | Markdown markers       | Query selector then convert      |
| URL Resolution       | Resolve relative URLs           | - [ ] Resolve src/href against base; forbid broken links                                  | html-parser      | URLResolver     | resolveRelativeURL      | URL parser     | URL, base URL                | Absolute URL           | URL.resolve()                    |
| JSON-LD Extraction   | Extract embedded metadata       | - [ ] Find script[type=ld+json]; parse; forbid malformed JSON                             | html-parser      | JSONLDExtractor | extractJsonLd           | JSON parser    | DOM tree                     | JSON-LD object         | Script tag query + JSON.parse    |
| Safe HTML Rendering  | Render HTML blocks safely       | - [ ] Parse with DOMParser; validate sources; forbid XSS                                  | MarkdownHtmlBlock| SafeRenderer    | renderSafeHtmlBlock     | DOMParser      | HTML block, base URL         | React elements         | DOM traversal with safety checks |

---

### Component: JSON-LD Parser

**Responsibility**: Interprets JSON-LD documents as graph structures with AgenticRAG context support.

**Context Handling**: Detect @context URL → apply AgenticRAG rules if canonical → preserve all properties

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| Context Detection    | Identify JSON-LD                | - [ ] Check @context presence; validate structure; forbid non-JSON-LD                     | parseJsonLd      | ContextDetector | detectContext           | —              | JSON object                  | Boolean (is JSON-LD)   | @context field check             |
| AgenticRAG Handling  | Apply specialized context       | - [ ] Match canonical URL; apply AgenticRAG rules; forbid hardcoded logic                 | parseJsonLd      | AgenticRAGHandler| applyAgenticRAG        | —              | @context value               | Context config         | URL comparison                   |
| Graph Extraction     | Parse @graph array              | - [ ] Extract nodes/edges; validate IDs; forbid orphaned edges                            | parseJsonLd      | GraphExtractor  | extractGraph            | —              | @graph array                 | Nodes/edges lists      | Array iteration with ID validation|
| Property Copying     | Preserve all fields             | - [ ] Copy to GraphNode.properties; forbid selective copying                               | parseJsonLd      | PropertyMapper  | mapAllProperties        | —              | JSON-LD node                 | GraphNode              | Object.assign all fields         |
| Metadata Preservation| Copy graph-level metadata       | - [ ] Transfer metadata object; preserve layers/ontologies; forbid metadata loss          | parseJsonLd      | MetadataCopier  | copyMetadata            | —              | JSON-LD metadata             | GraphData.metadata     | Deep copy                        |

---

### Component: JSON Parser

**Responsibility**: Normalizes arbitrary JSON into GraphData via structure detection and field mapping.

**Normalization Strategy**: Detect nodes/edges → extract if present → otherwise wrap with rawToGraphData

**Geospatial-Aware JSON Shapes (Dataset-Agnostic)**:
- GeoJSON `Feature` / `FeatureCollection` → ingest features as nodes and derive `properties.geo` (Point coordinates; bbox center for non-point geometries).
- Record arrays or record maps (object-of-records) → ingest entries as nodes and derive `properties.geo` from common coordinate fields when present.

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| Structure Detection  | Identify graph shape            | - [ ] Check for nodes/edges/links fields; detect variants; forbid format assumptions      | rawJsonSpec      | StructureDetector| hasGraphStructure      | —              | JSON object                  | Boolean (is graph)     | Field name matching (nodes/edges)|
| Direct Extraction    | Use existing arrays             | - [ ] Copy nodes/edges as-is; validate IDs; forbid malformed entries                      | rawJsonSpec      | DirectExtractor | extractDirectGraph      | —              | JSON object                  | GraphData              | Array presence check then copy   |
| Field Normalization  | Map to standard fields          | - [ ] Extract id/name/label/type; move rest to properties; forbid field loss             | rawToGraphData   | FieldNormalizer | normalizeFields         | —              | JSON entry                   | GraphNode/Edge         | Structural fields + properties   |
| Edge Endpoint Mapping| Support format variants         | - [ ] Accept source/target or from/to; normalize; forbid unmapped endpoints               | rawToGraphData   | EdgeMapper      | mapEdgeEndpoints        | —              | Edge object                  | Normalized edge        | Field aliases (source=from, etc.)|
| Default Assignment   | Provide fallback values         | - [ ] Assign "relatedTo" when no type; forbid empty required fields                       | rawToGraphData   | DefaultAssigner | assignDefaults          | —              | Partial edge                 | Complete edge          | Null check with fallback         |

---

### Component: Markdown Rendering (UI)

**Responsibility**: Renders Markdown in Canvas UI with line-aware preview and media extraction.

**Token Sharing**: Lexer runs once at parent level → tokens shared between Viewer/TOC/Editor → prevents redundant processing

| Context              | Intent                          | Directive                                                                                   | Module                | Class/Object    | Function/Method         | Dependency       | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------|-----------------|-------------------------|------------------|------------------------------|------------------------|----------------------------------|
| Token Generation     | Parse Markdown once             | - [ ] Lex at parent; share tokens; forbid redundant lexing                                 | markdown-it          | Lexer           | lex                     | markdown-it      | Markdown text                | Token AST              | markdown-it.parse()              |
| Line Range Extraction| Map tokens to source            | - [ ] Extract lineStart/lineEnd from tokens; 1-based; forbid 0-based ranges               | MarkdownViewer       | LineMapper      | extractLineRanges       | —                | Token list                   | Line range map         | Token.map property access        |
| Block Rendering      | Render Markdown blocks          | - [ ] Map headings/paragraphs/code/tables to UI; forbid lossy rendering                   | MarkdownViewer       | BlockRenderer   | renderBlocks            | React            | Token AST                    | React elements         | Token type switch                |
| Media Preview        | Extract and display media       | - [ ] Parse ![](url), <img>, <video>; render; forbid broken media                         | MarkdownViewer       | MediaRenderer   | renderMedia             | MarkdownHtmlBlock| Media tokens, base URL       | Media elements         | Tag/marker detection             |
| TOC Building         | Generate table of contents      | - [ ] Build tree from headings; preserve hierarchy; forbid flat TOC                        | MarkdownTOC          | TOCBuilder      | buildTocTree            | —                | Heading tokens               | TOC tree               | Parent-child nesting             |
| Heading Reordering   | Support drag-and-drop           | - [ ] Reorder with sibling constraints; update text; forbid hierarchy violations          | MarkdownEditor       | HeadingReorderer| reorderHeading          | TOC helpers      | Heading, target position     | Updated Markdown       | TOC tree manipulation            |
| Context Menu         | Locate nodes from preview       | - [ ] Right-click selection; find associated node; forbid missing provenance              | MarkdownPreview      | SelectionHandler| handleContextMenu       | —                | Selection, line range        | Selected node          | Line range matching              |

---

## Component Responsibility Matrix

| Subsystem        | Module                    | Component              | Interface/Method                 | Responsibility (S-V-O)                                                          | Dependencies                         | Contracts                                      | LOC    |
|------------------|---------------------------|------------------------|----------------------------------|-------------------------------------------------------------------------------|--------------------------------------|-----------------------------------------------|--------|
| Registry         | default.ts                | ParserRegistry         | `dispatchParser`                 | Registry tests capability → dispatches to first match → returns GraphData     | Parser specs                         | Text, name → GraphData or error               | ~150   |
| Markdown         | graph_builder             | MarkdownParser         | `parseMarkdownToGraphJsonLd`     | Parser tokenizes blocks → builds JSON-LD → converts to GraphData              | markdown-it, semantic_processor      | Markdown text → JSON-LD → GraphData           | ~500   |
| HTML             | html-parser               | HTMLConverter          | `parseHtmlToMarkdown`            | Converter parses DOM → maps tags → resolves URLs → emits Markdown            | DOMParser                            | HTML text → Markdown text                     | ~300   |
| JSON-LD          | parseJsonLd               | JSONLDParser           | `parseJsonLd`                    | Parser interprets @graph → applies AgenticRAG → builds GraphData             | —                                    | JSON-LD object → GraphData                    | ~250   |
| JSON             | rawToGraphData            | JSONNormalizer         | `rawToGraphData`                 | Normalizer detects structure → maps fields → wraps as GraphData              | —                                    | JSON object → GraphData                       | ~200   |
| Mermaid          | mermaid_parser            | MermaidParser          | `parseMermaid`                   | Parser handles node shapes → parses edges → builds graph                     | —                                    | Mermaid text → Graph structure                | ~400   |
| Rendering        | MarkdownViewer            | UIRenderer             | `renderMarkdown`                 | Renderer lexes tokens → maps to UI → shares tokens → displays Markdown       | markdown-it, React                   | Token AST → React elements                    | ~350   |
| Line Mapping     | MarkdownViewer            | LineMapper             | `mapLinesToNodes`                | Mapper reads lineStart/lineEnd → matches to nodes → enables provenance       | —                                    | Line ranges → Node selections                 | ~100   |

---

## Dependency & Integration Standards

**Dependency Declaration**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Parser Registration  | Centralize format handling      | - [ ] Register in default.ts; ordered precedence; forbid scattered parsers                |
| markdown-it          | Standardize Markdown parsing    | - [ ] Use markdown-it for lexing; share tokens; forbid custom tokenizers                  |
| JSON-LD Spec         | Follow W3C standards            | - [ ] Interpret @context/@graph per spec; forbid custom JSON-LD semantics                |

**Integration Contracts**

- **Parser Specs**:
  - Must provide `canParse` predicate and `parse` method.
  - Return `GraphData` or throw descriptive error.
- **Layer Metadata**:
  - JSON-LD emits `metadata.layers` with documentStructure and semantic hints.
  - Canvas reads `schema.layers.mode` to determine active layer.
- **Line Ranges**:
  - Tokens/nodes carry `metadata.lineStart` and `metadata.lineEnd` (1-based).
  - UI components use these for scroll-to-source and provenance selection.

**Coupling Metrics**

- Parsers are decoupled from each other:
  - Each parser in separate module with isolated logic.
  - Registry handles dispatch without parser awareness of peers.
- UI rendering decoupled from parsing:
  - Parsers emit JSON-LD or GraphData.
  - UI consumes via store, no direct parser calls.

---

## Code Organization Framework

**Directory Structure (relevant subset)**:

```text
canvas/
├── src/
│   └── features/
│       ├── parsers/
│       │   ├── default.ts
│       │   ├── loader.ts
│       │   ├── registry.ts
│       │   ├── markdownJsonLd.ts
│       │   └── python/
│       │       └── index.ts
│       └── markdown/
│           └── ui/
│               ├── MarkdownViewer.tsx
│               ├── MarkdownTOC.tsx
│               └── MarkdownHtmlBlock.tsx
agenticgraph_parser/
├── graph_builder.py
├── semantic_processor.py
├── markdown_cmd.py
├── pipeline_cmd.py
└── json_to_markdown_cmd.py
```

**Naming Conventions**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Parser Specs         | Suffix with Spec                | - [ ] Name xxxSpec in registry; document capability; forbid generic names                 |
| Parser Functions     | Verb-oriented                   | - [ ] Use parseXxx, convertXxx; be descriptive; forbid noun-only names                    |
| Source Mapping       | Preserve provenance lines       | - [ ] Use lineStart/lineEnd (1-based); forbid 0-based or missing ranges                  |
| Layer Keys           | Use lowercase                   | - [ ] Name documentStructure, semantic; forbid camelCase in metadata                      |

**File Organization**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Parser Isolation     | One format per module           | - [ ] Separate MD/HTML/JSON parsers; forbid multi-format modules                          |
| Shared Utilities     | Extract common logic            | - [ ] Share URL resolution, line mapping; forbid duplication                              |
| Token Sharing        | Centralize lexing               | - [ ] Lex once, share tokens; forbid per-component lexing                                 |

---

## Testing & Quality Standards

**Test Coverage Metrics**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Parser Specs         | Test all registered parsers     | - [ ] Exercise CSV/JSON-LD/JSON/MD/Python/GraphRAG; verify GraphData; forbid untested parsers|
| Mermaid Support      | Cover all shapes                | - [ ] Test [], (), {}, etc.; verify edges; forbid shape parsing bugs                      |
| Line Mapping         | Validate provenance             | - [ ] Check lineStart/lineEnd accuracy; verify scroll-to-source; forbid off-by-one errors |
| Token Sharing        | Ensure no redundant lexing      | - [ ] Mock lexer; count calls; forbid multiple tokenizations                              |

**Test Categories**

- **Unit**:
  - Parser capability predicates with various inputs.
- **Integration**:
  - Full parse from Markdown/JSON/JSON-LD/CSV to GraphData.
  - Line mapping from selection to source position.
- **E2E**:
  - Mermaid diagram parsing with all shapes.
  - YouTube import + markdown pipeline smoke checks.

**Quality Gates**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| GraphData Validation | Ensure valid output             | - [ ] Validate nodes/edges arrays; check IDs; forbid malformed GraphData                  |
| Layer Metadata       | Verify rendering hints          | - [ ] Check metadata.layers structure; forbid missing layer specs                         |
| Line Range Integrity | Validate 1-based ranges         | - [ ] Ensure lineStart <= lineEnd; forbid 0-based or negative                             |

---

## Operational Configuration: Parser Behavior

**Parser Configuration Variables**:

| Variable                          | Scope            | Default                            | Impact                                              |
|-----------------------------------|------------------|------------------------------------|-----------------------------------------------------|
| `PARSER_ORDER`                    | registry         | CSV, JSON-LD, JSON, n8n, MD, Python, GraphRAG | Controls parser precedence                    |
| `MERMAID_SHAPE_PATTERNS`          | mermaid parser   | All standard shapes                | Controls supported Mermaid shapes                   |
| `JSON_LD_CANONICAL_CONTEXT_URL`   | JSON-LD parser   | AgenticRAG context URL             | Triggers AgenticRAG context handling                |

**Parsing Workflow**:

| Step | Action                                  | Command/Trigger                         | Artifact Consumer                  |
|------|----------------------------------------|------------------------------------------|-------------------------------------|
| 1    | Detect format                          | Registry capability testing              | Parser dispatcher                   |
| 2    | Invoke matched parser                  | Parser.parse(text, name)                 | GraphData builder                   |
| 3    | Build JSON-LD (if applicable)          | Markdown/HTML parsers                    | JSON-LD converter                   |
| 4    | Convert to GraphData                   | parseJsonLd or direct construction       | GraphData object                    |
| 5    | Emit layer metadata                    | Parser metadata builder                  | Canvas layer selector               |

| Context              | Intent                          | Directive                                                                                   | Module/Component  | Class/Object | Function/Method              | Dependency      | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|-------------------|--------------|------------------------------|-----------------|------------------------------|------------------------|----------------------------------|
| Parser Ordering      | Control precedence              | - [ ] Register in fixed order; test top to bottom; forbid random order                    | default.ts        | ParserRegistry| registerInOrder            | —               | Parser spec list             | Registry               | Array index order                |
| Format Dispatch      | Route to handler                | - [ ] Test capability; invoke first match; forbid fallthrough                             | default.ts        | ParserRegistry| parseGraph                 | Parser specs    | Text, name                   | GraphData or error     | Find-first then invoke           |

---

## Data Flow

**Pipeline**: Text Input → Format Detection → Parser Selection → Structure Parsing → JSON-LD Building (optional) → GraphData Conversion → Metadata Enrichment → Store Update

| Stage             | Input                          | Output                         | Responsibility                                              | Performance Consideration                    |
|-------------------|--------------------------------|--------------------------------|-------------------------------------------------------------|----------------------------------------------|
| Format Detection  | Text, filename                 | Parser spec                    | Registry tests capability predicates                        | O(1) per parser                              |
| Parser Selection  | Parser spec                    | Parser instance                | Registry returns first match                                | O(parsers) linear search                     |
| Structure Parsing | Text                           | AST or token list              | Parser tokenizes/parses format-specific structure           | O(n) in text length                          |
| JSON-LD Building  | AST                            | JSON-LD document               | Markdown/HTML parsers build JSON-LD                         | O(nodes + edges)                             |
| GraphData Conversion| JSON-LD or raw nodes/edges  | GraphData                      | parseJsonLd or direct normalization                         | O(nodes + edges)                             |
| Metadata Enrichment| GraphData                     | GraphData + metadata           | Add layers, provenance, metrics                             | O(metadata fields)                           |
| Store Update      | GraphData                      | Updated store state            | Zustand store update                                        | Immutable update                             |

---

## Design Decisions & Trade-offs

| Decision             | Rationale                          | Pros                                                  | Cons                                      | Mitigation                                    |
|----------------------|------------------------------------|-------------------------------------------------------|-------------------------------------------|-----------------------------------------------|
| First-Match Ordering | Clear precedence                   | Unambiguous dispatch, predictable behavior            | Format conflicts possible                 | Document order, test edge cases               |
| markdown-it          | Industry standard                  | Mature, extensible, well-tested                       | Learning curve for custom plugins         | Use default plugins, document extensions      |
| JSON-LD Intermediate | Neutral representation             | Format-agnostic, supports multiple ontologies         | Extra conversion step                     | Cache JSON-LD, optimize parseJsonLd           |
| Token Sharing        | Optimize performance               | Single lexer call, consistent tokens                  | Requires parent-level coordination        | Clear token passing conventions               |
| Line Preservation    | Enable provenance                  | Scroll-to-source, selection mapping                   | 1-based indexing complexity               | Consistent 1-based everywhere, test edge cases|
| Layer Metadata       | Decouple parser from renderer      | Parser-agnostic rendering, flexible layer modes       | Metadata schema coordination              | Document metadata contract, version schemas   |

---

## Parser Directives

### Format Handling Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Capability Testing   | Match format accurately         | - [ ] Test signature before parse; forbid optimistic parsing                               | Predicate evaluation before dispatch         |
| Error Handling       | Surface parse failures          | - [ ] Return descriptive errors; log parse issues; forbid silent failures                  | Try-catch with error construction            |
| Fallback Strategy    | Handle no match gracefully      | - [ ] Suggest formats; provide hints; forbid cryptic errors                                | Error message with format suggestions        |

### Structure Preservation Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Hierarchy Maintenance| Preserve nesting                | - [ ] Maintain parent-child relationships; forbid flattening                               | Recursive structure building                 |
| Property Copying     | Preserve all attributes         | - [ ] Copy all fields to properties; forbid selective copying                              | Object.assign or spread operators            |
| Line Range Accuracy  | Map to source correctly         | - [ ] Use 1-based indexing; validate ranges; forbid off-by-one errors                     | Automated range validation tests             |

---

## Documentation Coverage

**Parser Documents**:

| Document                             | Purpose                                                  | Quality Gates           | Steward              |
|--------------------------------------|----------------------------------------------------------|-------------------------|----------------------|
| `agenticgraph-parser-document.md`        | Parser registry, format specs, line mapping              | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-semantic-document.md`      | Semantic extraction, entity/edge processing              | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-mermaid-frontmatter-document.md` | Mermaid parsing, frontmatter handling          | docs:update, doc:lint, tests | Component Documenter |

---

## Anti-Patterns (Forbidden)

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Optimistic Parsing   | Test capability first           | - [ ] Check canParse before parse; forbid parse-then-validate                             |
| Format Hardcoding    | Support any format              | - [ ] Register via specs; forbid if-else format chains                                    |
| Redundant Lexing     | Share tokens                    | - [ ] Lex once at parent; forbid per-component tokenization                               |
| 0-Based Line Ranges  | Use 1-based consistently        | - [ ] All line numbers 1-based; forbid 0-based indexing                                   |
| Lossy Conversion     | Preserve structure              | - [ ] Maintain hierarchy and properties; forbid dropping nodes/edges                      |
| Silent Failures      | Surface all errors              | - [ ] Return descriptive errors; log failures; forbid swallowing exceptions               |

---

## Repository Health Checklist

**Structural Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Parser Isolation     | ✓      | - [ ] Each parser in separate module; registry dispatch; forbid cross-parser dependencies |
| Token Sharing        | ✓      | - [ ] Lex once, share tokens; forbid redundant tokenization                               |

**Maintainability**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Test Coverage        | ✓      | - [ ] All formats covered; line mapping tested; forbid untested parsers                   |
| Error Messages       | ✓      | - [ ] Descriptive parse errors; format suggestions; forbid cryptic failures               |

**Operations**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Registry Ordering    | ✓      | - [ ] Fixed precedence order; documented; forbid arbitrary reordering                     |
| Layer Metadata       | ✓      | - [ ] Neutral rendering hints; schema versioned; forbid renderer coupling                 |

---

## Version Control Standards

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Parser Order         | Track precedence changes        | - [ ] Document order changes; version registry; forbid undocumented reordering            |
| Metadata Schema      | Maintain compatibility          | - [ ] Version metadata.layers structure; migrate gracefully; forbid breaking schema changes|
| Token Format         | Preserve line mapping           | - [ ] Version lineStart/lineEnd contract; forbid changing to 0-based                      |
