# AgenticGraph Source File Ingestor: Universal Import Specification

## Design Mantras

```
- [ ] Consistency; unify import paths; forbid format-specific UIs
- [ ] Extensibility; support new formats; forbid hardcoded parsers
- [ ] Neutrality; preserve source structure; forbid format assumptions
- [ ] Normalization; canonicalize URLs; forbid broken references
- [ ] Preservation; maintain media properties; forbid data loss
- [ ] Transparency; expose conversion modes; forbid hidden transformations
- [ ] Validation; verify all inputs; forbid silent parse failures
```

---

## Universal Design Principles

| Context             | Intent                              | Directive                                                                                      |
|---------------------|-------------------------------------|------------------------------------------------------------------------------------------------|
| Content Fetching    | Retrieve remote sources             | - [ ] Use proxy for CORS; normalize URLs; forbid direct fetch without fallback               |
| Format Detection    | Route to correct parser             | - [ ] Detect by extension/MIME; dispatch appropriately; forbid ambiguous routing             |
| Media Extraction    | Preserve multimedia references      | - [ ] Extract URLs; resolve relative paths; forbid broken media links                        |
| Mode Selection      | Enable user control                 | - [ ] Expose conversion modes; persist preferences; forbid forced transformations             |
| Parser Routing      | Dispatch to specialized handlers    | - [ ] Match by capability; fallback gracefully; forbid parser crashes                        |
| Property Preservation| Maintain source metadata           | - [ ] Copy all properties; normalize keys; forbid metadata loss                              |
| Source Tracking     | Record document origins             | - [ ] Store document paths; track lineage; forbid orphaned content                           |
| URL Resolution      | Handle relative references          | - [ ] Resolve against base URL; normalize protocols; forbid malformed URLs                   |
| Validation          | Verify structure early              | - [ ] Parse before store; validate schema; forbid late-stage errors                          |

---

## Ingestor Architecture

**Import Flow**: Source Selection → Format Detection → Content Fetch → Parser Dispatch → Graph Construction → Store Update → UI Refresh

**Processing Pipeline**: URL Normalization → Content Retrieval → Format Conversion → Media Extraction → Property Mapping → Graph Integration

**Design Principles**: Format-agnostic routing | Media-aware parsing | URL-safe resolution | Mode-driven conversion

### Supported Source Formats

| Format      | Extensions          | Entry Point Mechanism              | Intermediate Representation    | Media Handling                        |
|-------------|---------------------|------------------------------------|---------------------------------|---------------------------------------|
| Markdown    | .md, .markdown      | Toolbar Source Files menu          | Direct Markdown                 | Inline refs, HTML tags                |
| HTML        | .html, .htm         | Toolbar Source Files menu          | Converted to Markdown           | Tag extraction, URL resolution        |
| PDF         | .pdf                | Toolbar Source Files menu          | Server-converted to Markdown    | Embedded image URLs                   |
| JSON-LD     | .jsonld             | Toolbar Source Files menu          | Direct JSON-LD                  | Property preservation                 |
| JSON        | .json               | Toolbar Source Files menu          | Normalized to GraphData         | Property preservation                 |
| CSV         | .csv                | Toolbar Source Files menu          | Tabular to GraphData            | N/A                                   |

### Integration Bridge: Source Formats → Graph Construction

| Source Format       | Conversion Stage                     | Parser Component                             | Graph Output                    |
|---------------------|--------------------------------------|----------------------------------------------|---------------------------------|
| Markdown            | Block parsing → JSON-LD              | Markdown Parser                              | Structural + Semantic nodes     |
| HTML                | HTML → Markdown → JSON-LD            | HTML Parser → Markdown Parser                | Structural nodes with media     |
| PDF                 | PDF → Markdown → JSON-LD             | Server PDF converter (provider-based) → Markdown Parser          | Extracted text + images (data URIs or same-origin cached assets)         |
| JSON-LD             | Direct interpretation                | JSON-LD Parser                               | Nodes/edges from @graph         |
| JSON                | Normalization → GraphData            | JSON Parser (rawToGraphData)                 | Nodes/edges from arrays         |
| CSV                 | Tabular mapping → GraphData          | CSV Parser                                   | Row-based nodes/edges           |

---

## Component Specifications

### Component: Source File Import Orchestration

**Responsibility**: Routes import actions to format-specific handlers based on user selection.

**Configuration**: Toolbar menu actions with format parameter (markdown, html, pdf, jsonld, json, csv).

**Interface Pattern**: `perform{Format}Import(type, providedUrl?)` → validates source → fetches/converts content → dispatches to parser → updates store using a canonical document name + optional `markdownDocumentSourceUrl`.

| Context              | Intent                          | Directive                                                                                   | Module                | Class/Object       | Function/Method         | Dependency        | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------|--------------------|-------------------------|-------------------|------------------------------|------------------------|----------------------------------|
| Action Dispatch      | Route toolbar actions           | - [ ] Match action to format; call handler; forbid unmapped actions                        | toolbarMenuAction    | ActionDispatcher   | handleImportAction      | —                 | Action type, format          | Handler function       | Switch on format string          |
| Format Validation    | Verify supported format         | - [ ] Check format enum; reject invalid; forbid silent failures                            | importValidator      | FormatValidator    | validateFormat          | —                 | Format string                | Boolean (valid)        | Set membership check             |
| Source Selection     | Choose local or remote          | - [ ] Prompt for URL or open picker; validate source; forbid ambiguous sources            | sourceSelector       | SourceSelector     | selectSource            | UI prompts        | Import mode                  | Source (URL or File)   | Conditional on import mode       |

---

### Component: URL Fetching and Normalization

**Responsibility**: Retrieves remote content with CORS proxy support and normalizes Git hosting URLs.

**Algorithm**: Detect origin mismatch → route to proxy endpoint → normalize blob URLs to raw → fetch with error handling

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| URL Normalization    | Convert to canonical form       | - [ ] Detect Git hosting; transform blob to raw; forbid malformed URLs                    | ingestUtils      | URLNormalizer   | normalizeGitUrl         | URL parser     | Source URL                   | Normalized URL         | Regex match and replace          |
| CORS Handling        | Route through proxy             | - [ ] Check same-origin; use proxy if needed; forbid CORS errors                          | ingestUtils      | FetchManager    | fetchRemoteContent      | fetch          | URL, proxy endpoint          | Content text           | Origin comparison                |
| Protocol Validation  | Ensure HTTPS                    | - [ ] Coerce http to https; validate protocol; forbid insecure URLs                       | ingestUtils      | URLValidator    | coerceHttpUrl           | —              | URL string                   | HTTPS URL              | Protocol replacement             |
| Fallback Strategy    | Handle proxy failures           | - [ ] Try proxy first; fallback to direct; forbid giving up early                         | ingestUtils      | FetchManager    | fetchWithFallback       | fetch          | URL, options                 | Content or error       | Try-catch with fallback          |

---

### Component: Markdown Ingestion

**Responsibility**: Imports Markdown from local files or URLs, resolves media references, and parses to graph.

**Media Handling**: Extracts inline image/video/iframe markers → resolves URLs → creates media-capable nodes → preserves properties

| Context              | Intent                          | Directive                                                                                   | Module                | Class/Object      | Function/Method         | Dependency        | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------|-------------------|-------------------------|-------------------|------------------------------|------------------------|----------------------------------|
| Local File Selection | Open file picker                | - [ ] Filter by .md/.markdown; read content; forbid other extensions                      | markdownImport       | FilePicker        | pickMarkdownFile        | file API          | —                            | File object            | Extension filter                 |
| URL Fetch            | Retrieve remote Markdown        | - [ ] Normalize URL; fetch via proxy; detect HTML wrapper; forbid raw HTML as Markdown    | markdownImport       | ContentFetcher    | fetchRemoteMarkdown     | ingestUtils       | URL                          | Markdown text          | Content-type detection           |
| HTML Detection       | Convert wrapped content         | - [ ] Check for HTML tags; convert to Markdown; forbid malformed HTML                     | markdownImport       | HTMLDetector      | detectAndConvert        | html-parser       | Content text                 | Markdown text          | Regex HTML tag detection         |
| Media Extraction     | Parse inline references         | - [ ] Extract ![](url), <img>, <video>, <iframe>; resolve relative; forbid broken refs   | markdownParser       | MediaExtractor    | extractMediaRefs        | URL resolver      | Markdown text, base URL      | Media node list        | Regex extraction and resolution  |
| Parser Dispatch      | Convert to graph                | - [ ] Parse blocks; build JSON-LD; convert to GraphData; forbid parse failures            | parserRegistry       | MarkdownParser    | parseMarkdown           | graph_builder     | Markdown text                | GraphData              | Block tokenization → JSON-LD     |
| Metrics Tracking     | Record ingestion timing         | - [ ] Measure parse duration; store in metadata; forbid unmeasured operations             | markdownParser       | MetricsTracker    | trackIngestionMetrics   | performance       | Start/end timestamps         | Metrics object         | Delta calculation                |

---

### Component: HTML Ingestion

**Responsibility**: Imports HTML from local files or URLs and converts to Markdown for parsing.

**Conversion Strategy**: Extract structure → preserve media tags → resolve relative URLs → emit Markdown

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| Dev HTML Detection   | Reject dev server pages         | - [ ] Check for Vite dev markers; reject if found; forbid importing app shell             | htmlImport       | HTMLValidator   | rejectDevHTML           | —              | HTML text                    | Boolean (valid)        | String match for Vite markers    |
| Structure Extraction | Convert HTML to Markdown        | - [ ] Parse DOM; map tags to Markdown; preserve hierarchy; forbid lossy conversion        | html-parser      | HTMLConverter   | parseHtmlToMarkdown     | DOMParser      | HTML text                    | Markdown text          | DOM traversal with tag mapping   |
| Media Tag Mapping    | Transform media elements        | - [ ] Convert <img> to ![](url); <video> to ![Video](url); forbid unsafe sources         | html-parser      | MediaMapper     | mapMediaTags            | URL resolver   | DOM nodes, base URL          | Markdown markers       | Tag type switch with URL resolution|
| JSON-LD Extraction   | Extract embedded metadata       | - [ ] Find script[type=application/ld+json]; parse JSON; forbid malformed JSON            | html-parser      | JSONLDExtractor | extractJsonLd           | JSON parser    | HTML document                | JSON-LD object         | Script tag query and parse       |

---

### Component: PDF Ingestion

**Responsibility**: Imports PDF from local files or URLs via server-side conversion to Markdown.

**Processing Flow**: Upload to server → native Node PDF extraction (Docling-inspired reading order + heuristics) → optional image extraction → Markdown normalization → Markdown response → parse as Markdown

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| Local Upload         | Send PDF to server              | - [ ] Read file as bytes; POST to endpoint; forbid oversized files                        | pdfImport        | PDFUploader     | uploadLocalPDF          | fetch          | File object                  | Markdown text          | File size check then POST        |
| URL Conversion       | Request server conversion       | - [ ] Encode URL; POST to endpoint; forbid malformed URLs                                 | pdfImport        | PDFConverter    | convertRemotePDF        | fetch          | PDF URL                      | Markdown text          | URL validation then POST         |
| Server Response      | Parse conversion result         | - [ ] Check ok flag; extract markdown/name; forbid ignoring errors                        | pdfImport        | ResponseParser  | parseConversionResult   | —              | Server JSON response         | {markdown, name}       | ok check then field extraction   |
| Extraction Engine    | Extract text in reading order   | - [ ] Use layout-informed heuristics; preserve semantics; forbid dataset assumptions       | server (vite)    | NativePdfReader | convertPdfFileToMarkdown| node           | PDF bytes                    | Markdown text          | Sort by y/x, stitch fragments    |
| Image Extraction     | Preserve embedded images        | - [ ] Extract safe embedded images; serve via asset handler; forbid path traversal         | server (vite)    | PdfAssetBridge  | writePdfAssets          | fs             | PDF objects                  | Asset files            | DCTDecode only, sanitized names  |
| Text Normalization   | Improve extracted readability   | - [ ] Normalize spaced-letter runs; preserve semantics; forbid unreadable extraction      | pdfImport        | MarkdownNormalizer | normalizePdfMarkdown  | —              | Markdown text                | Markdown text          | Heuristic spaced-letter detection |

---

### Component: JSON-LD Ingestion

**Responsibility**: Imports JSON-LD documents and interprets @graph as nodes/edges with AgenticRAG context handling.

**Schema Interpretation**: Detect @context → apply AgenticRAG rules if canonical → preserve all properties

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| Context Detection    | Identify JSON-LD format         | - [ ] Check for @context field; validate structure; forbid ambiguous formats              | jsonImport       | FormatDetector  | isJsonLd                | —              | Parsed JSON                  | Boolean (is JSON-LD)   | @context field existence         |
| AgenticRAG Context   | Apply specialized rules         | - [ ] Match context URL; apply AgenticRAG handling; forbid hardcoded context logic        | parseJsonLd      | ContextHandler  | applyAgenticRAG         | —              | @context value               | Context config         | URL string comparison            |
| Graph Extraction     | Parse @graph array              | - [ ] Extract nodes/edges from @graph; validate IDs; forbid malformed entries             | parseJsonLd      | GraphExtractor  | extractGraph            | —              | @graph array                 | Nodes/edges lists      | Array iteration with validation  |
| Edge Inference Gating| Avoid surprise implicit edges   | - [ ] Only infer edges from allow-listed relation keys; forbid guessing edges from any array | parseJsonLd    | RelationMapper  | inferEdgesFromContext   | metadata/context | Node object properties     | Derived edges          | allow if @context @type=@id OR metadata.jsonLdMapping.contextEdgeProperties |
| Property Preservation| Copy all node properties        | - [ ] Transfer all fields to properties; preserve media; forbid property loss             | parseJsonLd      | PropertyMapper  | mapProperties           | —              | JSON-LD node                 | GraphNode              | Field-by-field copy              |

---

### Component: JSON Ingestion

**Responsibility**: Imports generic JSON and normalizes to GraphData via structure detection.

**Normalization Strategy**: Detect nodes/edges arrays → extract if present → otherwise wrap with rawToGraphData

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| Structure Detection  | Identify graph shape            | - [ ] Check for nodes/edges fields; detect variants; forbid format assumptions            | rawJsonSpec      | StructureDetector| detectGraphShape       | —              | Parsed JSON                  | Boolean (is graph)     | Field name matching              |
| Direct Extraction    | Use existing nodes/edges        | - [ ] Copy arrays as-is; validate entries; forbid malformed data                          | rawJsonSpec      | DirectExtractor | extractDirectGraph      | —              | JSON object                  | GraphData              | Array existence check            |
| Normalization        | Wrap arbitrary JSON             | - [ ] Merge non-structural to properties; assign defaults; forbid data loss               | rawToGraphData   | JSONNormalizer  | normalizeToGraph        | —              | JSON object                  | GraphData              | Field mapping with defaults      |
| Edge Endpoint Mapping| Support multiple formats        | - [ ] Accept source/target or from/to; normalize; forbid unmapped endpoints               | rawToGraphData   | EdgeMapper      | mapEdgeEndpoints        | —              | Edge object                  | Normalized edge        | Field name aliases               |
| Default Label        | Assign neutral edge types       | - [ ] Use "relatedTo" when no type; document default; forbid empty labels                 | rawToGraphData   | LabelAssigner   | assignDefaultLabel      | —              | Edge without type            | Edge with label        | Fallback to constant             |

---

### Component: JSON → Markdown Conversion

**Responsibility**: Converts JSON/JSON-LD to human-readable Markdown with configurable modes.

**Mode Strategy**: Auto-detect structure → choose table/keyvalue/hierarchical → allow user override

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| Mode Detection       | Choose conversion strategy      | - [ ] Analyze structure; select mode; forbid arbitrary choice                              | jsonToMarkdown   | ModeDetector    | detectMode              | —              | JSON object                  | Mode string            | Structure heuristics             |
| Table Conversion     | Render as Markdown table        | - [ ] Generate headers; emit rows; forbid non-uniform arrays                               | jsonToMarkdown   | TableRenderer   | renderTable             | —              | JSON array                   | Markdown table         | Header extraction, row iteration |
| Keyvalue Conversion  | Render as bullet list           | - [ ] Emit key: value pairs; bold keys; forbid nested objects                              | jsonToMarkdown   | KeyValueRenderer| renderKeyValue          | —              | JSON object                  | Markdown bullets       | Object.entries iteration         |
| Hierarchical Conversion| Render nested structure       | - [ ] Indent by depth; preserve nesting; forbid flattening                                 | jsonToMarkdown   | TreeRenderer    | renderHierarchical      | —              | JSON object                  | Indented Markdown      | Recursive descent with indentation|
| Mode Persistence     | Remember user preference        | - [ ] Save mode to localStorage; restore on load; forbid session-only settings            | jsonMarkdownMode | PreferenceManager| persistMode            | localStorage   | Mode string                  | Stored preference      | LS_KEYS.jsonMarkdownMode         |
| Suggested Mode       | Hint best mode                  | - [ ] Analyze content; suggest mode; forbid forcing mode                                   | jsonToMarkdown   | SuggestionEngine| suggestMode             | —              | JSON, current Markdown       | Suggested mode         | Structure match heuristic        |

---

### Component: Media Property Handling

**Responsibility**: Normalizes media URLs and properties for consistent rendering across formats.

**Canonical Properties**: media_url, media_kind, image, video, iframe_url, media, media_interactive

| Context              | Intent                          | Directive                                                                                   | Module           | Class/Object    | Function/Method         | Dependency     | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|------------------|-----------------|-------------------------|----------------|------------------------------|------------------------|----------------------------------|
| Media Spec Extraction| Identify media properties       | - [ ] Check media fields; infer kind; forbid ambiguous media                               | GraphCanvas      | MediaSpecGetter | getNodeMediaSpec        | —              | Node properties              | MediaSpec object       | Field priority: iframe_url > media_url > image > video|
| URL Priority         | Select canonical URL            | - [ ] Apply field priority; normalize; forbid multiple URLs                                | GraphCanvas      | URLSelector     | selectCanonicalURL      | —              | Media properties             | Single URL             | Ordered field check              |
| Kind Inference       | Determine media type            | - [ ] Infer from URL or field; validate; forbid unknown kinds                              | GraphCanvas      | KindInferrer    | inferMediaKind          | —              | URL, properties              | Media kind             | Extension/field-based inference  |
| GitHub URL Transform | Normalize blob URLs             | - [ ] Transform blob to raw; preserve query; forbid broken GitHub links                   | GraphCanvas      | GitHubTransform | normalizeGitHubURL      | —              | GitHub URL                   | Raw content URL        | Regex replace blob with raw      |
| Iframe Validation    | Check allowed domains           | - [ ] Match against allowlist; reject unsafe; forbid arbitrary iframes                    | GraphCanvas      | IframeValidator | validateIframeURL       | —              | Iframe URL                   | Boolean (safe)         | Domain allowlist check           |
| Interactivity Default| Set default interaction         | - [ ] Video/iframe interactive; image/svg not; forbid forcing interactivity               | GraphCanvas      | InteractionMgr  | defaultInteractive      | —              | Media kind                   | Boolean                | Switch on kind                   |

---

## Component Responsibility Matrix

| Subsystem        | Module                    | Component              | Interface/Method                 | Responsibility (S-V-O)                                                          | Dependencies                         | Contracts                                      | LOC    |
|------------------|---------------------------|------------------------|----------------------------------|-------------------------------------------------------------------------------|--------------------------------------|-----------------------------------------------|--------|
| Import           | toolbarMenuAction         | ActionDispatcher       | `handleImportAction`             | Dispatcher routes toolbar import actions → calls format handlers               | Toolbar UI, Parser Registry          | Format string, source specification           | ~100   |
| Fetching         | ingestUtils               | FetchManager           | `fetchRemoteContent`             | Manager retrieves remote content → handles CORS via proxy                     | fetch, URL parser                    | URL string, proxy endpoint                    | ~150   |
| Markdown         | markdownImport            | MarkdownImporter       | `performMarkdownImport`          | Importer fetches/parses Markdown → extracts media → stores graph              | Parser Registry, ingestUtils         | Markdown text, GraphData                      | ~200   |
| HTML             | htmlImport                | HTMLImporter           | `performHtmlImport`              | Importer fetches HTML → converts to Markdown → parses to graph                | html-parser, Parser Registry         | HTML text, Markdown, GraphData                | ~150   |
| PDF              | pdfImport                 | PDFImporter            | `performPdfImport`               | Importer uploads PDF → receives Markdown → parses to graph                    | Server endpoint, Parser Registry     | PDF bytes/URL, Markdown, GraphData            | ~100   |
| JSON-LD          | jsonImport                | JSONLDImporter         | `parseJsonLd`                    | Importer interprets @graph → applies AgenticRAG → builds GraphData            | —                                    | JSON-LD object, GraphData                     | ~250   |
| JSON             | jsonImport                | JSONImporter           | `rawToGraphData`                 | Importer normalizes JSON → extracts nodes/edges → wraps as GraphData          | —                                    | JSON object, GraphData                        | ~200   |
| Conversion       | jsonToMarkdown            | JSONMarkdownConverter  | `convertToMarkdown`              | Converter analyzes JSON → selects mode → renders Markdown                     | —                                    | JSON object, mode string, Markdown text       | ~300   |
| Media            | GraphCanvas/helpers       | MediaSpecExtractor     | `getNodeMediaSpec`               | Extractor reads node properties → infers kind → normalizes URL                | —                                    | Node properties, MediaSpec                    | ~150   |

---

## Dependency & Integration Standards

**Dependency Declaration**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Parser Registry      | Centralize format handling      | - [ ] Register all parsers; dispatch by capability; forbid scattered parser logic         |
| Proxy Endpoint       | Enable CORS-free fetching       | - [ ] Use /__fetch_remote for cross-origin; forbid direct fetch failures                 |
| Server Conversion    | Delegate PDF processing         | - [ ] POST to /__convert_pdf; apply MainPanel Settings query overrides (including conversionMode preset); forbid client-side PDF parsing |

**Integration Contracts**

- **Import Actions**:
  - Must specify format parameter (markdown, html, pdf, jsonld, json, csv).
  - Return GraphData or error with descriptive message.
- **PDF Conversion Overrides**:
  - Client appends query params built from MainPanel → Settings (Import: PDF).
  - Server applies explicit overrides first; `conversionMode` is a preset fallback.
- **Media Properties**:
  - Canonical fields: `media_url`, `media_kind`, `image`, `video`, `iframe_url`, `media`.
  - Renderer inspects these fields in priority order.
- **JSON → Markdown Modes**:
  - Modes: auto, table, keyvalue, hierarchical.
  - User preference persisted in localStorage.

**Coupling Metrics**

- Ingestor is decoupled from specific parsers:
  - Parser selection via registry, not hardcoded imports.
  - Format-specific logic isolated in dedicated modules.
- Media rendering decoupled from ingestion:
  - Ingestion always creates media-capable nodes.
  - Rendering controlled by view-only toggle.

---

## Code Organization Framework

**Directory Structure (relevant subset)**:

```text
canvas/
├── src/
│   ├── features/
│   │   ├── toolbar/
│   │   │   ├── markdownImportAction.ts
│   │   │   ├── htmlImportAction.ts
│   │   │   ├── pdfImportAction.ts
│   │   │   ├── jsonImportAction.ts
│   │   │   └── toolMenu.ts
│   │   ├── parsers/
│   │   │   ├── default.ts
│   │   │   ├── html-parser.ts
│   │   │   └── jsonToMarkdown.ts
│   │   └── markdown/
│   │       └── ui/
│   │           └── MarkdownHtmlBlock.tsx
│   └── lib/
│       └── graph/
│           └── io/
│               ├── ingestUtils.ts
│               └── adapter.ts
agenticgraph_parser/
└── json_to_markdown_cmd.py
```

**Naming Conventions**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Import Actions       | Verb-noun pattern               | - [ ] Use performXImport; be descriptive; forbid generic names                            |
| Parser Specs         | Suffix with Spec                | - [ ] Name xxxSpec for registry; document capability; forbid ambiguous specs              |
| Conversion Functions | Verb-oriented names             | - [ ] Use convertTo, parseTo patterns; forbid noun-only names                             |
| Media Properties     | Snake_case for graph fields     | - [ ] Use media_url, media_kind; forbid camelCase in properties                           |

**File Organization**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Module Size          | Keep focused                    | - [ ] Limit to single format or concern; split >400 LOC; forbid multi-format modules     |
| Import Grouping      | Organize by source              | - [ ] Group stdlib, external, local; sort; forbid mixed imports                           |
| Function Extraction  | Share common logic              | - [ ] Extract URL normalization, fetching; forbid duplication                             |

---

## Testing & Quality Standards

**Test Coverage Metrics**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Format Ingestion     | Validate each format            | - [ ] Test MD/HTML/PDF/JSON/JSONLD/CSV; verify GraphData; forbid untested formats        |
| URL Normalization    | Test Git hosting URLs           | - [ ] Verify blob→raw transform; check relative resolution; forbid broken links          |
| Media Extraction     | Cover all media types           | - [ ] Test image/video/iframe; verify properties; forbid missing media                   |
| Mode Conversion      | Test JSON→MD modes              | - [ ] Exercise auto/table/keyvalue/hierarchical; forbid mode-specific bugs               |

**Test Categories**

- **Unit**:
  - URL normalization functions with various Git hosting patterns.
  - JSON structure detection for graph shape.
- **Integration**:
  - End-to-end import from local files and URLs.
  - Media toggle behavior (view-only, no re-parse).
- **E2E**:
  - Markdown media toggle test (markdownMediaToggleE2e.test.ts).
  - Smoke test with markdown-html-img-smoke.md.

**Quality Gates**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Import Validation    | Ensure valid GraphData          | - [ ] Validate nodes/edges arrays; check referential integrity; forbid malformed graphs   |
| URL Safety           | Prevent unsafe URLs             | - [ ] Validate protocols; check allowlists; forbid XSS vectors                            |
| Parser Errors        | Surface failures clearly        | - [ ] Return descriptive errors; log parse failures; forbid silent drops                  |

---

## Operational Configuration: Environment Wiring

**Import Endpoint Variables**:

| Variable                          | Scope            | Default                            | Impact                                              |
|-----------------------------------|------------------|------------------------------------|-----------------------------------------------------|
| `PROXY_FETCH_ENDPOINT`            | client           | `/__fetch_remote`                  | Controls CORS proxy route for remote content        |
| `PDF_CONVERT_ENDPOINT`            | client           | `/__convert_pdf`                   | Controls server-side PDF conversion route           |
| `VITE_DEV_SERVER_PORT`            | dev              | `5173`                             | Controls dev server port for proxy detection        |

**Import Workflow**:

| Step | Action                                  | Command/Trigger                         | Artifact Consumer                  |
|------|----------------------------------------|------------------------------------------|-------------------------------------|
| 1    | Select format and source               | Toolbar Source Files menu                | Import action dispatcher            |
| 2    | Fetch/upload content                   | FetchManager or file picker              | Content bytes/text                  |
| 3    | Convert format                         | Parser registry or server endpoint       | Markdown or GraphData               |
| 4    | Parse to graph                         | Parser dispatch                          | GraphData object                    |
| 5    | Update store and UI                    | loadGraphDataFromTextViaParser           | Canvas, Multi-dimensional Table, Markdown Section |

| Context              | Intent                          | Directive                                                                                   | Module/Component  | Class/Object | Function/Method              | Dependency      | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|-------------------|--------------|------------------------------|-----------------|------------------------------|------------------------|----------------------------------|
| Endpoint Resolution  | Build fetch URLs                | - [ ] Construct endpoint from config; validate; forbid hardcoded URLs                      | ingestUtils       | EndpointBuilder| buildFetchURL              | —               | Base URL, endpoint config    | Full URL               | Template substitution            |
| Import Orchestration | Coordinate workflow             | - [ ] Chain fetch→convert→parse→store; handle errors; forbid incomplete imports           | toolbarMenuAction | ImportCoordinator| orchestrateImport       | All import modules| Format, source             | GraphData or error     | Sequential async calls           |

---

## Data Flow

**Pipeline**: Source Selection → Content Retrieval → Format Detection → Conversion (JSON↔Markdown) → Parsing → Media Extraction → Graph Construction → Store Update → UI Rendering

| Stage             | Input                          | Output                         | Responsibility                                              | Performance Consideration                    |
|-------------------|--------------------------------|--------------------------------|-------------------------------------------------------------|----------------------------------------------|
| Source Selection  | User action, format            | Source (URL or File)           | Toolbar menu determines import mode and format              | Immediate UI response                        |
| Content Retrieval | URL or File                    | Raw bytes/text                 | FetchManager retrieves content with proxy fallback          | Network latency for remote sources           |
| Format Detection  | File extension, MIME type      | Format identifier              | Parser registry identifies appropriate parser               | O(1) lookup                                  |
| Conversion        | Raw content                    | Normalized format              | HTML→Markdown, PDF→Markdown, and HTML/DOM→Markdown SSOT conversions; JSON inputs may also pass through unchanged when already graph-shaped | Server-side for PDF, browser-native for HTML/DOM; idle-yield and bounded DOM export |
| Parsing           | Normalized content (Markdown or JSON/JSON-LD) | JSON-LD or GraphData           | Parsers build structured graph representation (Markdown→JSON-LD→GraphData; JSON/JSON-LD→GraphData) | Debounced for large inputs; optional worker offload |
| Media Extraction  | Parsed content                 | Media node properties          | Extract URLs, resolve relative paths                        | Regex/DOM-based, O(n) in content length      |
| Graph Construction| JSON-LD or raw nodes/edges     | GraphData                      | Normalize to canonical GraphData structure                  | Structural sharing for efficiency            |
| Store Update      | GraphData                      | Updated store state            | Zustand store sets graphData and derived state (including Multi-dimensional Table materialization via GraphRecordDb) | Immutable updates                            |
| UI Rendering      | Store state                    | Visual display                 | Canvas, Multi-dimensional Table, singabldr tables, panels react to store changes | Memoized selectors, virtualization           |

---

## Design Decisions & Trade-offs

| Decision             | Rationale                          | Pros                                                  | Cons                                      | Mitigation                                    |
|----------------------|------------------------------------|-------------------------------------------------------|-------------------------------------------|-----------------------------------------------|
| Markdown as Intermediate| Unify text-based formats        | Consistent parsing, media extraction                  | Lossy for complex HTML                    | Preserve JSON-LD blocks, safe HTML rendering  |
| CORS Proxy           | Enable remote content              | Bypass same-origin policy, support any URL            | Dev server dependency                     | Fallback to direct fetch                      |
| Server PDF Conversion| Native Node extraction (Docling-inspired) | Local execution, no external PDF dependencies   | Heuristics may miss complex layouts       | Normalize output, iterate heuristics + tests  |
| JSON → MD Modes      | User control over presentation     | Flexible inspection, persistent preference            | Mode selection burden                     | Auto mode, suggested mode hints               |
| Media View Toggle    | Decouple rendering from ingestion  | No re-parse, instant toggle                           | User confusion about data vs. view        | Clear UI labeling, tooltips                   |
| Property Preservation| Support arbitrary workflows        | Any JSON field becomes node property                  | Potential namespace collisions            | Document canonical fields, prefix conventions |

---

## Import Directives

### Content Fetching Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| URL Normalization    | Ensure valid URLs               | - [ ] Coerce protocols; normalize paths; forbid malformed URLs                             | Validation before fetch                      |
| Proxy Usage          | Handle CORS consistently        | - [ ] Route through proxy when needed; forbid direct cross-origin                          | Origin comparison in fetchRemoteContent      |
| Error Handling       | Surface fetch failures          | - [ ] Log errors; show user message; forbid silent failures                                | Try-catch with error display                 |

### Format Conversion Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Structure Preservation| Maintain document hierarchy    | - [ ] Map headings, lists, tables; forbid flattening                                       | Parser structure mapping                     |
| Media Conversion     | Preserve multimedia             | - [ ] Extract and resolve all media; forbid media loss                                     | Comprehensive tag extraction                 |
| Lossy Warning        | Inform of conversions           | - [ ] Show conversion mode; log transformations; forbid hidden changes                     | UI badges, status messages                   |

---

## Documentation Coverage

**Source File Ingestion Documents**:

| Document                             | Purpose                                                  | Quality Gates           | Steward              |
|--------------------------------------|----------------------------------------------------------|-------------------------|----------------------|
| `agenticgraph-ingestor-document.md`      | Import flows, media handling, format conversion          | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-parser-document.md`        | Parser registry, format specifications, line mapping     | docs:update, doc:lint, tests | Component Documenter |
| `agenticgraph-pdf-ocr-document.md`      | PDF conversion + optional OCR enhancement                | docs:update, doc:lint, tests | Component Documenter |
| `markdown-html-img-smoke.md`         | Smoke test for HTML image ingestion                      | manual testing          | QA Engineer          |

---

## Anti-Patterns (Forbidden)

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Hardcoded Endpoints  | Support any environment         | - [ ] Use config for endpoints; forbid hardcoded URLs                                     |
| Format Assumptions   | Preserve flexibility            | - [ ] Detect format dynamically; forbid assuming format from source                       |
| Direct Fetch Only    | Handle CORS                     | - [ ] Always use proxy fallback; forbid CORS failures                                     |
| Silent Conversions   | Inform users                    | - [ ] Show conversion mode/status; forbid hidden transformations                          |
| Media Loss           | Preserve all references         | - [ ] Extract all media types; forbid dropping video/iframe                               |
| Re-ingestion         | Avoid redundant parsing         | - [ ] Store parsed graph; toggle view only; forbid re-parse on view change                |

---

## Repository Health Checklist

**Structural Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Parser Isolation     | ✓      | - [ ] Each format in separate module; registry dispatch; forbid mixed format logic        |
| Media Abstraction    | ✓      | - [ ] Canonical properties defined; renderer agnostic; forbid format-specific rendering   |

**Maintainability**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Test Coverage        | ✓      | - [ ] All formats covered; E2E smoke tests; forbid untested imports                        |
| Error Messages       | ✓      | - [ ] Descriptive parse errors; user-facing messages; forbid cryptic failures             |

**Operations**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Proxy Fallback       | ✓      | - [ ] CORS proxy with direct fallback; forbid single-path fetching                        |
| Server Dependency    | ✓      | - [ ] PDF conversion via server; graceful degradation; forbid client-side PDF parsing     |

---

## Version Control Standards

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Format Support       | Track new formats               | - [ ] Document format additions; version parser specs; forbid undocumented formats        |
| Media Property Schema| Maintain compatibility          | - [ ] Version canonical properties; migrate gracefully; forbid breaking property changes  |
| Conversion Modes     | Track mode behavior             | - [ ] Document mode semantics; version mode strings; forbid silent mode changes           |
