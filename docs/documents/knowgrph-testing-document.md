# Knowgrph Testing Architecture

## Design Mantras

```
- [ ] Modularity; isolate test concerns; forbid monolithic test files
- [ ] Neutrality; use generic fixtures; forbid dataset-specific test logic
- [ ] Maintainability; keep files under 600 lines; forbid sprawling test suites
- [ ] Reusability; extract common helpers; forbid copy-paste test patterns
- [ ] Clarity; document test intent; forbid cryptic assertions
```

---

## Testing Architecture

**Test Stack**: Test Fixtures → Reusable Helpers → Modular Test Runners → Central Entry Point → Coverage Reports

**Test Flow**: Fixture Loading → Parser Invocation → Assertion Execution → Result Aggregation → Report Generation

**Design Principles**: Modular Runners | Fixture-Based Testing | Configuration-Driven Helpers | Domain-Agnostic Assertions

---

## Bounded Execution (FORBID Indefinite Runs)

**Global timeout** (whole suite):
- `KG_TEST_TIMEOUT_MS` (default: 10 minutes)
- Implemented in `canvas/src/tests/ci.ts` via a hard `Promise.race` timeout gate.

**Per-test timeout** (single test case):
- `KG_TEST_CASE_TIMEOUT_MS` (default: 120 seconds; clamped to 5s..10m)
- Implemented in `canvas/src/tests/run.ts` inside the `exec()` wrapper.

**Targeted execution** (bounded by scope, not just time):
- `tsx src/tests/ci.ts <filter>` runs only tests whose name contains `<filter>` (case-insensitive).
- Prefer targeted filters (e.g. `parser`, `jsonld`, `settings`) in CI and local iteration to avoid long-running suites.

**Animatic targeted filters**:
- Run `tsx src/tests/ci.ts animatic.serializerUtilities` for low-level serializer utility coverage that rewrites authored `timeline:` frontmatter text without exercising the live store/runtime owner path.
- Run `tsx src/tests/ci.ts animatic.timelineBeatMetadata.graphWritebackSyncsMarkdownDocument` and `tsx src/tests/ci.ts animatic.itemBeatRef.nodeWritebackSyncsMarkdownDocument` for graph-owned Animatic runtime regressions that validate `updateGraphMetadata` / `updateNode` writeback into canonical `markdownDocumentText`.
- Use the serializer prefix for focused utility/debug work inside `animaticTimeline.ts`; use the graph-writeback labels for end-to-end Animatic runtime ownership and Editor Workspace sync checks.

**Rich-media targeted smoke**:
- Run `npm run test:smoke:rich-media` for the repo-native focused bundle that exercises shared `RichMediaPanel` regressions without a browser.
- Run `npm run test:smoke:rich-media:browser` for the Dev-only live-route smoke that mounts `canvas/src/features/testing/RichMediaBrowserSmokePage.tsx`, drives `canvas/scripts/verify_rich_media_browser_smoke.py`, and writes `data/outputs/rich-media-browser-smoke.png`.
- Rich Media preview timing owners are registered as one affected-CI scope: changes to the v1 timing schema, validator, fixture manifest, smoke page/runner/verifier, or browser-contract test automatically run `test:smoke:rich-media:timing-schema` and the focused `richMedia.browserSmokeContract` unit gate.
- Browser smoke scope is deterministic runtime coverage only: markdown preview/edit, inline `srcDoc`, snapshot iframe, click-to-open overlay, image zoom wheel, video HTML fallback, audio, and storyboard-widget chrome visibility.
- Run `npm run test:smoke:storyboard-rich-media-drop:source` for the repo-native focused storyboard source bundle that guards exact pointer-centering and the browser-smoke route/runner/verifier seam without launching a browser.
- Run `npm run test:smoke:storyboard-rich-media-drop:browser` for the Dev-only storyboard drag smoke that mounts `canvas/src/features/testing/StoryboardRichMediaDropSmokePage.tsx`, drives `canvas/scripts/verify_storyboard_rich_media_drop_browser_smoke.py`, and writes `data/outputs/storyboard-rich-media-drop-browser-smoke.png`.
- Storyboard browser smoke scope is the real `2D Renderer: Storyboard` drop bridge only: one image and one video payload must create `Rich Media Panel` nodes without shifting existing storyboard cards or panels. `npm run storyboard:readiness:check` now bundles source smoke, storyboard browser smoke, mobile keyboard browser smoke, and `pages:check-sync`. Generic storyboard-widget drag/resize callbacks stay in focused component regressions.
- Run `npm run test:smoke:mobile-keyboard:browser` for the Dev-only mobile viewport-shrink smoke that mounts `canvas/src/features/testing/MobileKeyboardBrowserSmokePage.tsx`, drives `canvas/scripts/verify_mobile_keyboard_browser_smoke.py`, and writes `data/outputs/mobile-keyboard-browser-smoke.png`. Scope is chat plus markdown inline-edit quick-bar reachability under a mobile viewport shrink from `390x844` to `390x520`, including one streamed chat update and shared slash/semantic/variable menu checks.
- Run `npm run test:smoke:xr-spatial-capture-fallback:source` for the repo-native XR fallback source bundle. It delegates to `scripts/run-xr-spatial-capture-fallback-source-smoke.mjs`, which chains the focused `canvas.xrMode.nativeSessionPolicy` source contract, the focused `xr.spatialCaptureFallback.browserSmokeContract` seam check, and the XR readiness contracts without launching a browser.
- Run `npm run xr:source-runner:test` to verify the repo-owned XR source-runner contract itself before or alongside the XR acceptance path.
- Run `npm run xr:review-ready` for the one-command review path that chains the source-runner contract and the local runtime/browser acceptance proof.
- Run `npm run test:smoke:xr-spatial-capture-fallback:browser` for the Dev-only XR fallback smoke that mounts `canvas/src/features/testing/XrSpatialCaptureFallbackSmokePage.tsx`, drives `canvas/scripts/verify_xr_spatial_capture_fallback_browser_smoke.mjs`, and writes `data/outputs/xr-spatial-capture-fallback-browser-smoke.json`.
- Run `npm run xr:runtime-ready` for the repo-owned XR fallback acceptance path. It chains `test:smoke:xr-spatial-capture-fallback:source` and `test:smoke:xr-spatial-capture-fallback:browser`; the canonical proof boundary is documented in `docs/documents/knowgrph-xr-spatial-capture-fallback-readiness.md`.
- XR fallback scope is the browser-native capability slice only: the shared XR session policy must publish `knowgrph-xr-capability-snapshot/v1`, the rendered spatial-capture entry owner must expose the exact DOM capability markers, and a non-immersive browser with camera capture available must settle to `monocular-capture` without reverse-engineering UI text.
- Run `npm run test:live:storyboard-media-panel-retention:browser` for the normal Canvas-route cleanup proof: inject the starter markdown through `applyMarkdownDocument(...)`, create image/video panels, verify edge-retention stability, reapply the markdown SSOT, and return to the clean baseline. Same-path same-text reapply is a fresh reset event, and live-route verifiers must resolve source/target ports by exact id or workspace-prefixed `::*suffix`.

---

## Component Responsibility Matrix

| Layer/Subsystem       | Path/Module                                   | Component                   | Interface/Method            | Responsibility (S-V-O)                                                                        | Dependencies                          | Contracts                                         | LOC    |
|-----------------------|-----------------------------------------------|-----------------------------|-----------------------------|-----------------------------------------------------------------------------------------------|---------------------------------------|---------------------------------------------------|--------|
| Test Entry Point      | `canvas/src/tests/run.ts`                     | Test Runner                 | `runAllTests`               | Runner → aggregates modular runners → executes remaining tests → reports results               | Modular test runners                  | Orchestrates full test suite                     | ~150   |
| Markdown Test Runner  | `canvas/src/tests/runMarkdownTests.ts`        | Markdown Test Runner        | `runMarkdownTests`          | Runner → executes markdown rendering tests → validates layout → checks scroll sync             | Canvas test helpers                   | Returns test results for aggregation              | ~500   |
| Schema Test Runner    | `canvas/src/tests/runSchemaTests.ts`          | Schema Test Runner          | `runSchemaTests`            | Runner → validates schema defaults → tests CRUD operations → checks consistency                | Schema fixtures                       | Returns test results for aggregation              | ~400   |
| JSON-LD Test Runner   | `canvas/src/tests/runJsonLdTests.ts`          | JSON-LD Test Runner         | `runJsonLdTests`            | Runner → tests JSON-LD roundtrip → validates inferred edges → checks workflow persistence      | JSON-LD fixtures, parser              | Returns test results for aggregation              | ~450   |
| Parser Test Runner    | `canvas/src/tests/runParserTests.ts`          | Parser Test Runner          | `runParserTests`            | Runner → validates parser registry → tests custom parsers → checks wildcard aggregations       | Parser fixtures, transforms           | Returns test results for aggregation              | ~500   |
| Interview Helper      | `canvas/src/__tests__/exampleWorkflowMarkdownIngestion.test.ts` | Interview Test Helper | `testEdaMlpInterviewSessionMarkdown...` | Helper → validates EDA→MLP→Deployment graphs → checks Mermaid anchors → verifies internal links | Markdown parser, environment config   | Reusable interview markdown test assertion        | ~200   |

---

## Test Runner Architecture

### Modular Test Organization

**Central Entry Point**: `canvas/src/tests/run.ts`

**Purpose**: Aggregate modular test runners and execute remaining individual tests while maintaining <600 lines/file guideline.

**Modular Runners**:

| Runner Module             | Test Scope                                        | Target LOC | Covered Areas                                      |
|---------------------------|---------------------------------------------------|------------|----------------------------------------------------|
| `runMarkdownTests.ts`     | Markdown rendering, layout, scroll sync           | ~500       | Markdown → GraphData, layout modes, sync behavior  |
| `runSchemaTests.ts`       | Schema validation, defaults, CRUD operations      | ~400       | Schema-config loading, field validation, updates   |
| `runJsonLdTests.ts`       | JSON-LD roundtrip, edge inference, persistence    | ~450       | JSON-LD parsing, edge derivation, export           |
| `runParserTests.ts`       | Parser registry, custom parsers, wildcards        | ~500       | Parser loading, transform chaining, aggregation    |

**Test Registration**:
- New test files must be explicitly registered in `canvas/src/tests/run.ts` to be executed by the CI runner.
- Individual tests can be imported and registered via `exec('name', testFunction)`.
- Large groups of related tests should be organized into a dedicated runner module (e.g., `runCollisionTests.ts`) and called from `runAllTests`.

**Aggregation Pattern**:

```typescript
// canvas/src/tests/run.ts
import { runMarkdownTests } from './runMarkdownTests';
import { runSchemaTests } from './runSchemaTests';
import { runJsonLdTests } from './runJsonLdTests';
import { runParserTests } from './runParserTests';

async function runAllTests() {
  const results = {
    markdown: await runMarkdownTests(),
    schema: await runSchemaTests(),
    jsonld: await runJsonLdTests(),
    parser: await runParserTests(),
    individual: await runRemainingIndividualTests()
  };
  
  return aggregateResults(results);
}
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Runner Aggregation    | Combine test results          | - [ ] Execute all modular runners; collect results; forbid missing runner execution        | `run.ts`                  | `runAllTests`        | void                      | aggregated results    | async/await runner invocation + merge   |
| File Size Enforcement | Maintain readability          | - [ ] Keep runner files under 600 lines; split larger suites; forbid monolithic files      | All test runners          | N/A (organizational)  | N/A                       | N/A                   | Manual code review + LOC tracking       |
| Result Reporting      | Aggregate pass/fail counts    | - [ ] Collect test counts; compute totals; forbid partial reporting                        | `run.ts`                  | `aggregateResults`   | runner results            | summary report        | reduce operation over result objects    |

---

## Markdown Ingestion Fixtures

### Core Markdown Test Coverage

**Test Locations**: `canvas/src/__tests__/`

**Test Categories**:

| Test File                                    | Coverage Area                                   | Assertions                                              |
|----------------------------------------------|-------------------------------------------------|---------------------------------------------------------|
| `exampleWorkflowMarkdownIngestion.test.ts`   | Example workflow markdown ingestion             | Non-empty nodes/edges, layer metadata, structural types |
| `markdownGithubIngestion.test.ts`            | GitHub-style markdown parsing                   | Heading hierarchy, code blocks, lists, tables           |
| `markdownMediaSmoke.test.ts`                 | Media ingestion (images, HTML)                  | Image nodes, HTML block parsing                         |
| `markdownMediaToggleE2e.test.ts`             | Mermaid frontmatter, ontology-aware ingestion   | Mermaid nodes, anchor extraction, frontmatter metadata  |

**Configuration Schema**:

```yaml
testFixtures.markdownPath:
  scope: test_global
  type: string (file path)
  mutability: deployment_configurable
  validation: must be valid markdown file path
  impact: source markdown fixture for ingestion tests

testFixtures.expectedNodeCount:
  scope: test_specific
  type: number
  mutability: immutable
  validation: must be positive integer
  impact: minimum expected node count for fixture validation
```

---

### Interview Markdown Fixture (EDA → MLP → Deployment)

**Test Helper**: `testEdaMlpInterviewSessionMarkdownProducesMermaidAnchorsAndInternalLinks(markdown: string)`

**Location**: `canvas/src/__tests__/exampleWorkflowMarkdownIngestion.test.ts`

**Purpose**: Validate interview-style markdown graphs with EDA → MLP → Deployment workflow structure.

**Assertion Coverage**:

| Assertion Category        | Validation Logic                                                        |
|---------------------------|-------------------------------------------------------------------------|
| Non-empty Graph           | Assert `nodes.length > 0` and `edges.length > 0`                        |
| Mermaid Nodes             | Assert presence of `MermaidNode` type nodes                             |
| Mermaid Edges             | Assert presence of `pointsTo` edges for Mermaid topology                |
| Anchor Nodes              | Assert presence of `Anchor` type nodes                                  |
| Internal Link Nodes       | Assert presence of `InternalLink` type nodes                            |
| Anchor Edges              | Assert `InternalLink` → `Anchor` connections via `pointsTo` edges       |
| Subgraph Membership       | Validate Mermaid subgraph layers (L0, L1, ..., L6) contain expected nodes|

**Subgraph Membership Helper**: `assertMermaidSubgraphMembership(nodes, expectedMembership)`

**Purpose**: Verify neutral Mermaid subgraph layers contain expected `MermaidNode` members without hardcoding file paths.

**Expected Membership Structure**:

```typescript
{
  L0: ['node-id-1', 'node-id-2'],
  L1: ['node-id-3', 'node-id-4'],
  // ... L2-L6
}
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Markdown Parsing      | Parse interview document      | - [ ] Parse markdown with frontmatter; extract Mermaid; build graph; forbid parse errors   | Test helper               | `testEdaMlp...`      | markdown string           | void (assertions)     | parse + assert node/edge existence      |
| Subgraph Validation   | Check layer membership        | - [ ] Verify nodes in correct subgraph layers; forbid missing or misplaced nodes           | Subgraph helper           | `assertMermaidSubgraph...` | nodes, expected map | void (assertions)     | layer lookup + membership check         |

---

### Disk-Based Interview Fixture Helper

**Test Helper**: `testEdaMlpInterviewSessionMarkdownFixtureFromDisk()`

**Purpose**: Load interview markdown from disk using environment-configured path; validate structure.

**Environment Configuration**:

```yaml
KNOWGRPH_EDA_MLP_INTERVIEW_MD_PATH:
  scope: test_global
  type: string (file path)
  mutability: runtime_configurable (environment variable)
  validation: relative path from process.cwd()
  impact: location of interview markdown fixture for disk-based test

recommendedDefault:
  value: ../data/test-data/eda-mlp-interview-session.fixture.md
  resolvedFrom: canvas working directory
  absolutePath: ${repoRoot}/data/test-data/eda-mlp-interview-session.fixture.md
```

**Behavior**:

| Condition                              | Action                                                  |
|----------------------------------------|---------------------------------------------------------|
| Environment variable not set or empty  | Return early without running assertions (skip test)     |
| Environment variable set               | Read file via `readFileSync`, parse, run assertions     |
| File not found                         | Test fails with descriptive error                       |

**Path Resolution**:

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const relativePath = process.env.KNOWGRPH_EDA_MLP_INTERVIEW_MD_PATH;
if (!relativePath) return; // Skip test

const absolutePath = resolve(process.cwd(), relativePath);
const markdown = readFileSync(absolutePath, 'utf-8');
testEdaMlpInterviewSessionMarkdownProducesMermaidAnchorsAndInternalLinks(markdown);
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Path Resolution       | Resolve relative to cwd       | - [ ] Use `path.resolve(process.cwd(), relativePath)`; forbid hardcoded absolute paths     | Disk helper               | `resolveFixturePath` | relative path             | absolute path         | path.resolve with cwd base              |
| File Reading          | Load markdown from disk       | - [ ] Read via `fs.readFileSync`; handle errors; forbid silent failures                    | Disk helper               | `loadMarkdown`       | file path                 | markdown text         | fs.readFileSync + error handling        |
| Conditional Execution | Skip when path not set        | - [ ] Check environment variable; return early if empty; forbid failing on missing path    | Disk helper               | `testEdaMlp...FromDisk` | void                   | void (conditional)    | early return on !process.env.VAR        |

---

## Neutrality and Configuration

### Fixture Neutrality Principles

**No Hardcoded Paths**:

| Anti-Pattern                          | Correct Pattern                                      |
|---------------------------------------|------------------------------------------------------|
| `readFileSync('/abs/path/to/fixture.md')` | `readFileSync(resolve(process.cwd(), process.env.FIXTURE_PATH))` |
| `assert(content.includes('ProjectX'))` | `assert(content.includes(process.env.PROJECT_NAME))` |
| `expect(nodes[0].id).toBe('proj-123')` | `expect(nodes.length).toBeGreaterThan(0)` (structural assertion) |

**Configuration-Driven Test Paths**:

| Environment Variable               | Purpose                                      | Example Value                                    |
|------------------------------------|----------------------------------------------|--------------------------------------------------|
| `KNOWGRPH_EDA_MLP_INTERVIEW_MD_PATH` | Interview markdown fixture path            | `../data/test-data/eda-mlp-interview-session.fixture.md` |
| `KNOWGRPH_TEST_DATA_DIR`           | Root directory for test fixtures             | `../data/test-data`                              |

**Structural vs Content Assertions**:

| Assertion Type      | Example                                          | Rationale                                        |
|---------------------|--------------------------------------------------|--------------------------------------------------|
| Structural          | `expect(nodes.length).toBeGreaterThan(0)`        | Validates graph structure without content coupling|
| Structural          | `expect(nodes.some(n => n.type === 'MermaidNode'))` | Checks for expected node types generically     |
| Content (Avoid)     | `expect(nodes[0].label).toBe('EDA Phase')`       | Couples test to specific content in fixture      |
| Content (Avoid)     | `expect(edges[0].source).toBe('eda-start')`      | Assumes specific node IDs from fixture           |

### Fixture-Driven Webpage Markdown Artifact Regression

For webpage markdown artifact structure matching, prefer an *offline* upstream-markdown fixture (converted markdown + appended `(Extracted)` blocks) and assert section-level structure.

- Fixture input: `canvas/src/__tests__/fixtures/remotion-dev.upstream-fixture.md`
- Test entrypoint: `webpageMarkdownArtifact.remotionFixture.sections`

**Policy**:

- Forbid hardcoding domains in generator logic or tests; use a placeholder URL like `https://example.com/` for deterministic generation.
- Avoid asserting on live website HTML; the fixture captures the intended extracted signals (templates/pricing/nav).

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Fixture Path Config   | Externalize test paths        | - [ ] Use environment variables for paths; forbid hardcoded fixture locations               | Test setup                | `loadFixture`        | env var name              | fixture content       | process.env lookup + fs read            |
| Structural Assertions | Validate structure, not content| - [ ] Assert node counts, types, edge existence; forbid content-specific checks            | Test helpers              | `assertGraphStructure` | graph data              | void (assertions)     | type checking + count validation        |
| Generic Node/Edge Checks | Avoid ID assumptions        | - [ ] Check for node type presence; forbid ID-based assertions                             | Test helpers              | `assertNodeType`     | nodes, type               | void (assertion)      | nodes.some(n => n.type === type)        |

---

## Test Helper Reusability

### Common Test Helpers

**Location**: `canvas/src/__tests__/helpers/`

**Helper Categories**:

| Helper Module          | Purpose                                          | Reusable Functions                                   |
|------------------------|--------------------------------------------------|------------------------------------------------------|
| `graphAssertions.ts`   | Common graph structure assertions                | `assertNonEmptyGraph`, `assertNodeTypes`, `assertEdgeLabels` |
| `fixtureLoaders.ts`    | Load test fixtures from disk                     | `loadMarkdownFixture`, `loadJsonLdFixture`, `loadCsvFixture` |
| `parserHelpers.ts`     | Parser invocation and validation                 | `parseAndAssert`, `validateParserOutput`             |
| `schemaHelpers.ts`     | Schema-config testing utilities                  | `assertSchemaDefaults`, `validateLayerConfig`        |

**Example Reusable Helper**:

```typescript
// canvas/src/__tests__/helpers/graphAssertions.ts
export function assertNonEmptyGraph(graphData: GraphData, minNodes = 1, minEdges = 0) {
  expect(graphData.nodes.length).toBeGreaterThanOrEqual(minNodes);
  expect(graphData.edges.length).toBeGreaterThanOrEqual(minEdges);
}

export function assertNodeTypes(graphData: GraphData, expectedTypes: string[]) {
  const actualTypes = new Set(graphData.nodes.map(n => n.type));
  expectedTypes.forEach(type => {
    expect(actualTypes.has(type)).toBe(true);
  });
}
```

**Design Compliance**:

| Context               | Intent                        | Directive                                                                                   | Module/Component          | Function/Method      | Input                     | Output                | Decision Logic                          |
|-----------------------|-------------------------------|---------------------------------------------------------------------------------------------|---------------------------|----------------------|---------------------------|-----------------------|-----------------------------------------|
| Helper Extraction     | Avoid copy-paste patterns     | - [ ] Extract common assertions to helpers; forbid duplicated assertion logic               | Test helpers              | N/A (organizational)  | N/A                       | N/A                   | Manual refactoring to shared helpers    |
| Parameter Flexibility | Support multiple scenarios    | - [ ] Provide optional parameters; set sensible defaults; forbid rigid helper signatures    | Helper functions          | Various               | flexible params           | void (assertions)     | optional params with default values     |
| Error Messages        | Provide clear failure context | - [ ] Include descriptive error messages; reference helper name; forbid generic failures    | Helper functions          | Various               | graph data                | void (assertions)     | expect(...).toBe(...) with custom messages|

---

## Testing Standards and Quality Gates

### Test Coverage Metrics

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Parser Coverage      | Validate all parsers tested     | - [ ] Test JSON-LD, Markdown, CSV, HTML parsers; forbid untested parsers                   |
| Schema Coverage      | Ensure schema-config tested     | - [ ] Test defaults, overrides, validation; forbid incomplete schema coverage              |
| Fixture Variety      | Use diverse test inputs         | - [ ] Include small/medium/large fixtures; forbid single-fixture testing                   |

**Test Categories**:

- **Unit Tests**: Individual parser functions, schema validators, field extractors.
- **Integration Tests**: Full ingestion pipelines (markdown → graph, JSON → schema).
- **E2E Tests**: User workflows (load → edit → export → reload).

**Quality Gates**:

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Assertion Specificity| Validate expected behavior      | - [ ] Assert specific node/edge counts or types; forbid vague "graph exists" checks        |
| Error Handling       | Test failure paths              | - [ ] Test invalid inputs; verify error messages; forbid only happy-path testing           |
| Performance Bounds   | Ensure fast test execution      | - [ ] Target <10s for full suite; forbid slow fixtures or inefficient assertions           |

---

## Repository Health Checklist

**Test Suite Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Modular Runners      | ☐      | - [ ] All runners under 600 lines; forbid monolithic test files                            |
| Helper Reuse         | ☐      | - [ ] Common assertions extracted to helpers; forbid duplicated test logic                 |
| Fixture Organization | ☐      | - [ ] Fixtures in dedicated directory; forbid scattered fixture files                      |

**Coverage Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Parser Coverage      | ☐      | - [ ] All parsers have test coverage; forbid untested ingestion paths                      |
| Schema Coverage      | ☐      | - [ ] Schema-config loading, defaults, validation tested; forbid unchecked schema behavior |
| Edge Case Coverage   | ☐      | - [ ] Invalid inputs, empty graphs, malformed JSON tested; forbid only happy-path tests    |

**Neutrality Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| No Hardcoded Paths   | ☐      | - [ ] All fixture paths from environment variables; forbid hardcoded file paths            |
| Structural Assertions| ☐      | - [ ] Tests validate structure, not content; forbid dataset-specific assertions            |
| Reusable Fixtures    | ☐      | - [ ] Generic fixtures usable across repos; forbid project-specific test data              |

---

## Anti-Patterns (Forbidden)

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Monolithic Test Files| Maintain readability            | - [ ] Split tests into modular runners; forbid >600 line test files                        |
| Hardcoded Test Paths | Enable configuration            | - [ ] Use environment variables for fixture paths; forbid absolute path assertions         |
| Content-Specific Assertions | Enable fixture reuse      | - [ ] Assert structure (counts, types); forbid checking specific labels/IDs                |
| Copy-Paste Test Logic| Extract common helpers          | - [ ] Reuse assertion helpers; forbid duplicated test patterns                              |
| Untested Edge Cases  | Ensure robustness               | - [ ] Test invalid inputs and error paths; forbid only happy-path coverage                 |
