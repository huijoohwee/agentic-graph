# AgenticGraph Token and Budget Management: Universal Performance Specification

## Design Mantras

```
- [ ] Caching; share lexed tokens; forbid redundant tokenization
- [ ] Complexity; guard expensive operations; forbid unbounded computation
- [ ] Configurability; expose budget controls; forbid hardcoded limits
- [ ] Invalidation; clear stale caches; forbid dirty state
- [ ] Optimization; reuse parsed data; forbid wasteful re-parsing
- [ ] Responsiveness; maintain UI fluidity; forbid render blocking
- [ ] Transparency; expose performance metrics; forbid hidden costs
```

---

## Universal Design Principles

| Context             | Intent                              | Directive                                                                                      |
|---------------------|-------------------------------------|------------------------------------------------------------------------------------------------|
| Budget Management   | Prevent performance degradation     | - [ ] Set complexity thresholds; disable features at limit; forbid unbounded work            |
| Cache Invalidation  | Maintain data freshness             | - [ ] Clear cache on content change; validate cache keys; forbid stale data                  |
| Complexity Guarding | Protect against expensive ops       | - [ ] Calculate T × E metric; compare to budget; forbid unchecked computation                |
| Configuration       | Enable user control                 | - [ ] Expose budget settings; persist preferences; forbid fixed limits                       |
| Key Generation      | Ensure cache correctness            | - [ ] Hash content; include length; forbid collision-prone keys                              |
| Metrics Tracking    | Measure performance                 | - [ ] Count tokens; track entities; forbid unmeasured operations                             |
| Shared Computation  | Eliminate redundant work            | - [ ] Lex once; share tokens; forbid per-component parsing                                   |
| Storage Strategy    | Persist user preferences            | - [ ] Save to localStorage; version keys; forbid session-only settings                       |
| Token Reuse         | Optimize rendering pipeline         | - [ ] Check cache validity; reuse when possible; forbid unnecessary re-tokenization          |

---

## Token Management Architecture

**Processing Flow**: Content Change → Token Generation → Cache Storage → Token Distribution → Complexity Check → Conditional Rendering

**Performance Strategy**: Single lexing pass | Token sharing across components | Complexity-based feature gating | Cache invalidation on change

**Design Principles**: Lazy evaluation | Memoized computation | Configurable budgets | User-controlled thresholds

### Integration Bridge: Markdown Content → Token Economy

| Content Stage               | Token Operation                      | Performance Impact                           |
|-----------------------------|--------------------------------------|----------------------------------------------|
| Initial Load                | Lex markdown text                    | One-time parse cost                          |
| Cache Storage               | Store tokens with key                | Memory allocation                            |
| Mode Switch (Viewer→Editor) | Reuse cached tokens                  | Zero re-parse cost                           |
| Slide Transition            | Filter tokens by line range          | O(tokens) scan, no re-lex                    |
| Content Change              | Invalidate cache, re-lex             | One-time parse cost                          |
| Highlight Rendering         | Check T × E vs budget                | Guard prevents O(T × E) work when over budget|

---

## Component Specifications

### Component: Token Sharing System

**Responsibility**: Centralizes markdown tokenization to eliminate redundant parsing across viewer/editor/presentation modes.

**Caching Strategy**: Hash-based cache keys → store in Zustand → validate on access → reuse when key matches

**Configuration Schema**:

```yaml
token_cache:
  scope: ui_performance
  type: object
  mutability: runtime_managed
  validation: cache_key_must_match_content
  impact: controls whether tokens are reused or recomputed

cache_invalidation:
  scope: content_lifecycle
  type: trigger
  mutability: automatic_on_content_change
  validation: clear_all_cache_metadata
  impact: forces re-tokenization on next access
```

**Interface Pattern**: `useMarkdownPreviewTokens(text, documentPath)` → checks cache → generates if missing → returns tokens → O(1) when cached, O(n) when generating

| Context              | Intent                          | Directive                                                                                   | Module                | Class/Object       | Function/Method         | Dependency        | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------|--------------------|-------------------------|-------------------|------------------------------|------------------------|----------------------------------|
| Key Generation       | Create content-bound cache key  | - [ ] Hash text; include length; forbid collision-prone keys                               | tokenCache           | KeyBuilder         | buildMarkdownTokensKey  | hash function     | Markdown text                | Cache key string       | hash(text) + text.length         |
| Cache Lookup         | Check for existing tokens       | - [ ] Compare stored key to current; forbid stale cache hits                               | useMarkdownTokens    | CacheLookup        | lookupCachedTokens      | useGraphStore     | Text, cache key              | Tokens or null         | storedKey === currentKey         |
| Token Generation     | Lex markdown text               | - [ ] Parse with markdown-it; forbid redundant lexing                                      | useMarkdownTokens    | TokenGenerator     | generateTokens          | markdown-it       | Markdown text                | Token AST              | markdown-it.parse(text)          |
| Cache Storage        | Store tokens with metadata      | - [ ] Set tokens, key, path; forbid partial cache updates                                 | graphDataSlice       | CacheWriter        | setMarkdownTokens       | zustand           | Tokens, key, path            | Updated store          | Batch set all cache fields       |
| Cache Invalidation   | Clear stale cache               | - [ ] Reset tokens/key/path; forbid leaving dirty state                                    | graphDataSlice       | CacheInvalidator   | clearMarkdownTokens     | —                 | —                            | Cleared cache state    | Set all to null/undefined        |
| Token Distribution   | Pass tokens to consumers        | - [ ] Share via props; forbid duplicate computation                                        | MarkdownWorkspace    | TokenDistributor   | distributeTokens        | React             | Tokens                       | Props to children      | Prop passing                     |

---

### Component: Complexity Budget Guard

**Responsibility**: Prevents UI freezes by disabling expensive highlight features when token × entity count exceeds threshold.

**Algorithm**: Calculate T (tokens) × E (graph entities with matching document path) → compare to budget → disable highlights if over budget

**Configuration Schema**:

```yaml
highlight_budget:
  scope: ui_performance
  type: number
  mutability: user_configurable
  validation: positive_integer_or_default
  default: 500000
  impact: controls when always-on highlights are disabled

budget_ranges:
  conservative: 100000-300000
  balanced: 500000
  aggressive: 800000-1200000
```

**Interface Pattern**: `checkComplexityBudget(tokenCount, entityCount, budget)` → calculates T × E → returns Boolean (allow highlights) → O(1)

| Context              | Intent                          | Directive                                                                                   | Module                | Class/Object       | Function/Method         | Dependency        | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------|--------------------|-------------------------|-------------------|------------------------------|------------------------|----------------------------------|
| Entity Counting      | Count relevant graph entities   | - [ ] Filter by documentPath; count nodes + edges; forbid counting irrelevant entities     | MarkdownPreview      | EntityCounter      | countEntities           | —                 | Nodes, edges, documentPath   | Entity count           | filter(hasPath).length           |
| Token Counting       | Count lexed tokens              | - [ ] Use token array length; forbid re-counting                                           | MarkdownPreview      | TokenCounter       | countTokens             | —                 | Token array                  | Token count            | tokens.length                    |
| Complexity Calculation| Compute T × E metric           | - [ ] Multiply token count by entity count; forbid overflow                                | MarkdownPreview      | ComplexityCalculator| calculateComplexity    | —                 | Token count, entity count    | Complexity value       | tokenCount * entityCount         |
| Budget Comparison    | Check against threshold         | - [ ] Compare complexity to budget; forbid exceeding budget silently                       | MarkdownPreview      | BudgetGuard        | checkBudget             | —                 | Complexity, budget           | Boolean (allow)        | complexity <= budget             |
| Feature Gating       | Disable highlights conditionally| - [ ] Gate rendering; log decision; forbid blocking render                                 | MarkdownPreview      | FeatureGate        | gateHighlights          | —                 | Allow flag                   | Render decision        | if (allow) renderHighlights()    |
| Budget Retrieval     | Get user preference             | - [ ] Load from settings; apply default; forbid using stale budget                        | useSettings          | SettingsReader     | getBudgetSetting        | settingsRegistry  | Setting key                  | Budget value           | settings.get() ?? DEFAULT_BUDGET |

---

### Component: Budget Configuration

**Responsibility**: Exposes user-configurable budget setting in Main Panel Settings with persistence.

**Storage Strategy**: Setting key in registry → localStorage persistence → fallback to default

| Context              | Intent                          | Directive                                                                                   | Module                | Class/Object       | Function/Method         | Dependency        | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------|--------------------|-------------------------|-------------------|------------------------------|------------------------|----------------------------------|
| Setting Definition   | Define budget setting           | - [ ] Register with type/default/scope; forbid unregistered settings                       | settingsRegistry     | SettingDefinition  | defineSettings          | —                 | Setting spec                 | Registered setting     | Registry.define(key, spec)       |
| Value Validation     | Ensure valid budget             | - [ ] Check positive integer; apply default if invalid; forbid negative budgets            | settingsRegistry     | Validator          | validateBudget          | —                 | Raw value                    | Validated budget       | value > 0 ? value : DEFAULT      |
| Persistence          | Save user preference            | - [ ] Write to localStorage; forbid session-only                                           | settingsRegistry     | Persister          | persistSetting          | localStorage      | Setting key, value           | Persisted value        | LS.set(key, value)               |
| Retrieval            | Load saved preference           | - [ ] Read from localStorage; parse; forbid invalid parse                                  | settingsRegistry     | Retriever          | retrieveSetting         | localStorage      | Setting key                  | Setting value          | JSON.parse(LS.get(key))          |
| UI Presentation      | Show in settings panel          | - [ ] Render input; bind to setting; forbid uncontrolled input                             | SettingsPanel        | SettingUI          | renderBudgetInput       | React             | Setting spec                 | Input element          | Controlled input with onChange   |

---

### Component: Highlight Toggle

**Responsibility**: Controls whether text highlights are enabled in markdown viewer with localStorage persistence.

**Default State**: Off (no extra highlighting, minimal computation)

**Storage Key**: `LS_KEYS.markdownTextHighlight`

| Context              | Intent                          | Directive                                                                                   | Module                | Class/Object       | Function/Method         | Dependency        | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------|--------------------|-------------------------|-------------------|------------------------------|------------------------|----------------------------------|
| Toggle State         | Track highlight preference      | - [ ] Store boolean in localStorage; forbid session-only state                             | highlightToggle      | ToggleState        | getHighlightEnabled     | localStorage      | —                            | Boolean (enabled)      | JSON.parse(LS.get(key)) ?? false |
| State Update         | Save user preference            | - [ ] Write to localStorage; trigger re-render; forbid losing preference                   | highlightToggle      | ToggleUpdater      | setHighlightEnabled     | localStorage      | Boolean value                | Persisted state        | LS.set(key, value)               |
| UI Control           | Render toggle button            | - [ ] Show in the markdown workspace; bind to state; forbid uncontrolled toggle            | MarkdownWorkspace    | ToggleUI           | renderToggle            | React             | Enabled state                | Toggle button          | Controlled checkbox/switch       |
| Conditional Rendering| Apply highlights if enabled     | - [ ] Check toggle AND budget; forbid ignoring toggle                                      | MarkdownPreview      | ConditionalHighlight| shouldHighlight        | —                 | Toggle state, budget check   | Boolean (render)       | toggle && budgetCheck            |

---

## Component Responsibility Matrix

| Subsystem        | Module                    | Component              | Interface/Method                 | Responsibility (S-V-O)                                                          | Dependencies                         | Contracts                                      | LOC    |
|------------------|---------------------------|------------------------|----------------------------------|-------------------------------------------------------------------------------|--------------------------------------|-----------------------------------------------|--------|
| Token Sharing    | useMarkdownTokens         | TokenManager           | `useMarkdownPreviewTokens`       | Manager checks cache → generates if missing → returns shared tokens           | markdown-it, useGraphStore           | Text, path → Token AST                        | ~80    |
| Cache            | graphDataSlice            | CacheStorage           | `setMarkdownTokens`              | Storage writes tokens/key/path → invalidates on content change                | zustand                              | Tokens, key, path → Store update              | ~40    |
| Complexity       | MarkdownPreview           | ComplexityGuard        | `checkComplexityBudget`          | Guard calculates T×E → compares to budget → gates feature                     | —                                    | Token count, entity count, budget → Boolean   | ~30    |
| Budget Settings  | settingsRegistry          | BudgetConfig           | `getBudgetSetting`               | Config retrieves setting → validates → returns budget value                   | localStorage, settingsRegistry       | Setting key → Budget number                   | ~50    |
| Toggle           | highlightToggle           | HighlightToggle        | `setHighlightEnabled`            | Toggle reads/writes localStorage → controls highlight rendering               | localStorage                         | —  → Boolean state                            | ~20    |
| Distribution     | MarkdownWorkspace        | TokenDistributor       | `distributeTokens`               | Distributor passes tokens → Viewer/Editor/Presentation via props              | React                                | Tokens → Props                                | ~30    |

---

## Dependency & Integration Standards

**Dependency Declaration**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Token Generation     | Use markdown-it consistently    | - [ ] Single lexer for all markdown; forbid custom tokenizers                             |
| Cache Storage        | Centralize in Zustand           | - [ ] Store in graphDataSlice; forbid scattered cache state                               |
| Settings Persistence | Use settings registry           | - [ ] Register budget setting; forbid direct localStorage access                          |

**Integration Contracts**

- **Token Cache**:
  - Cache key format: `hash(text) + "-" + text.length`.
  - Store must include: `markdownTokens`, `markdownTokensKey`, `markdownTokensPath`.
  - Invalidation clears all three fields atomically.
- **Complexity Budget**:
  - Metric: `tokenCount × (nodeCount + edgeCount)`.
  - Default budget: 500000.
  - Setting key: `markdownAlwaysOnHighlightComplexityBudget`.
- **Highlight Toggle**:
  - Storage key: `LS_KEYS.markdownTextHighlight`.
  - Default: false (off).
  - Toggle AND budget check must both pass to enable highlights.

**Coupling Metrics**

- Token generation decoupled from consumers:
  - Single hook (`useMarkdownPreviewTokens`) abstracts cache logic.
  - Consumers receive tokens via props, no direct cache access.
- Budget configuration decoupled from enforcement:
  - Settings registry owns persistence.
  - Guard component reads setting but doesn't modify.

---

## Code Organization Framework

**Directory Structure (relevant subset)**:

```text
canvas/
├── src/
│   ├── features/
│   │   ├── markdown/
│   │   │   ├── hooks/
│   │   │   │   └── useMarkdownPreviewTokens.ts
│   │   │   ├── ui/
│   │   │   │   ├── MarkdownPreview.tsx
│   │   │   │   └── MarkdownTokenRenderer.tsx
│   │   │   └── constants/
│   │   │       └── budgetConstants.ts
│   │   └── settings/
│   │       └── settingsRegistry.ts
│   ├── state/
│   │   └── graphDataSlice.ts
│   └── __tests__/
│       └── markdownGuidelinesIngestion.test.ts
└── localStorage/
    └── keys.ts
```

**Naming Conventions**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Constants            | Use UPPER_SNAKE_CASE            | - [ ] Name ALWAYS_ON_HIGHLIGHT_COMPLEXITY_BUDGET; forbid lowercase                        |
| Storage Keys         | Namespace with LS_KEYS          | - [ ] Use LS_KEYS.markdownTextHighlight; forbid raw strings                               |
| Hook Names           | Start with use                  | - [ ] Name useMarkdownPreviewTokens; forbid non-hook function names                       |
| Setting Keys         | Dot notation                    | - [ ] Use ui.markdownViewer.budget; forbid flat keys                                      |

**File Organization**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Hook Isolation       | One hook per file               | - [ ] Extract useMarkdownPreviewTokens; forbid mixing hooks                               |
| Constant Extraction  | Centralize magic numbers        | - [ ] Define DEFAULT_BUDGET in constants; forbid inline numbers                           |
| Test Grouping        | Organize by feature             | - [ ] Group budget tests in markdownGuidelinesIngestion; forbid scattered tests           |

---

## Testing & Quality Standards

**Test Coverage Metrics**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Cache Validation     | Test key generation             | - [ ] Verify hash collision resistance; test length inclusion; forbid weak keys           |
| Budget Guard         | Test threshold behavior         | - [ ] Exercise above/below budget; verify feature gating; forbid untested edge cases      |
| Token Sharing        | Verify no re-lex                | - [ ] Mock markdown-it; count calls; forbid redundant tokenization                        |

**Test Categories**

- **Unit**:
  - `buildMarkdownTokensKey` with various text inputs.
  - `checkComplexityBudget` with different T × E values.
- **Integration**:
  - Token cache hit/miss behavior in `useMarkdownPreviewTokens`.
  - Budget setting retrieval and validation.
- **Regression**:
  - `testGuidelinesMarkdownHighlightGuardWithLargeGraph`: Verifies T × E > budget disables highlights.
  - `testGuidelinesMarkdownHighlightGuardWithSmallGraph`: Verifies T × E < budget enables highlights.

**Quality Gates**

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Cache Correctness    | Validate cache keys             | - [ ] Ensure key changes on content change; forbid stale cache hits                       |
| Budget Enforcement   | Verify guard activates          | - [ ] Test large T × E blocks highlights; forbid bypassing guard                          |
| Performance Impact   | Measure token reuse             | - [ ] Profile mode switches; verify zero re-lex; forbid performance regressions           |

---

## Operational Configuration: Budget Tuning

**Budget Setting Variables**:

| Variable                                          | Scope            | Default                            | Impact                                              |
|---------------------------------------------------|------------------|------------------------------------|-----------------------------------------------------|
| `markdownAlwaysOnHighlightComplexityBudget`       | ui.mainPanel     | 500000                             | Controls when always-on highlights are disabled     |
| `LS_KEYS.markdownTextHighlight`                   | localStorage     | false                              | Controls whether highlight feature is enabled       |
| `ALWAYS_ON_HIGHLIGHT_COMPLEXITY_BUDGET`           | constant         | 500000                             | Fallback when setting is invalid                    |

**Budget Ranges**:

| Range               | Value         | Use Case                                                                     |
|---------------------|---------------|------------------------------------------------------------------------------|
| Conservative        | 100000-300000 | Large graphs, resource-constrained environments                              |
| Balanced (Default)  | 500000        | Typical project-sized notebooks and slide decks                              |
| Aggressive          | 800000-1200000| Powerful machines, moderate graphs, accepting heavier computation            |

**Configuration Workflow**:

| Step | Action                                  | Command/Trigger                         | Effect                                     |
|------|----------------------------------------|------------------------------------------|--------------------------------------------|
| 1    | Open Main Panel Settings                | UI navigation                            | Settings panel displayed                   |
| 2    | Search for budget setting               | Search input                             | Filter to budget setting                   |
| 3    | Enter new budget value                  | Numeric input                            | Staged value                               |
| 4    | Click Apply                             | Button click                             | Persisted to localStorage                  |
| 5    | Reload markdown view                    | Automatic on next render                 | New budget applied to guard                |

| Context              | Intent                          | Directive                                                                                   | Module/Component  | Class/Object | Function/Method              | Dependency      | Input                        | Output                 | Decision Logic                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|-------------------|--------------|------------------------------|-----------------|------------------------------|------------------------|----------------------------------|
| Setting Retrieval    | Load user budget                | - [ ] Read from registry; parse number; forbid invalid values                              | settingsRegistry  | SettingGetter| getSetting                   | localStorage    | Setting key                  | Budget number          | parse(LS.get(key)) ?? DEFAULT    |
| Validation           | Ensure valid budget             | - [ ] Check > 0; apply default if invalid; forbid negative/zero                           | settingsRegistry  | Validator    | validatePositive             | —               | Raw value                    | Valid budget           | value > 0 ? value : DEFAULT      |
| Application          | Use in guard                    | - [ ] Pass to checkComplexityBudget; forbid hardcoded budget                               | MarkdownPreview   | GuardConfig  | applyBudget                  | useSettings     | —                            | Current budget         | getSetting(key) or constant      |

---

## Data Flow

**Pipeline**: Content Change → Cache Invalidation → Token Generation → Cache Storage → Token Distribution → Complexity Check → Conditional Highlight Rendering

| Stage             | Input                          | Output                         | Responsibility                                              | Performance Consideration                    |
|-------------------|--------------------------------|--------------------------------|-------------------------------------------------------------|----------------------------------------------|
| Content Change    | New markdown text              | Content update signal          | User edit or import action                                  | Immediate, no delay                          |
| Cache Invalidation| Update signal                  | Cleared cache state            | graphDataSlice clears tokens/key/path                       | O(1) state update                            |
| Token Generation  | Markdown text                  | Token AST                      | markdown-it lexes text                                      | O(n) in text length, one-time cost           |
| Cache Storage     | Tokens, key, path              | Updated store                  | useMarkdownPreviewTokens stores in Zustand                  | O(1) state update                            |
| Token Distribution| Cached tokens                  | Props to components            | MarkdownWorkspace passes via props                          | O(1) prop passing                            |
| Complexity Check  | Token count, entity count      | Allow/deny flag                | MarkdownPreview calculates T×E vs budget                    | O(1) arithmetic                              |
| Conditional Render| Allow flag, tokens             | Highlighted or plain render    | MarkdownTokenRenderer applies highlights if allowed         | O(T×E) when allowed, O(0) when denied        |

---

## Design Decisions & Trade-offs

| Decision             | Rationale                          | Pros                                                  | Cons                                      | Mitigation                                    |
|----------------------|------------------------------------|-------------------------------------------------------|-------------------------------------------|-----------------------------------------------|
| Hash-Based Cache Keys| Ensure correctness                 | Content-bound, collision-resistant                    | Extra hash computation                    | Use fast hash, include length for quick check |
| Complexity Budget    | Prevent UI freezes                 | Guards against O(T×E) work, maintains responsiveness  | Disables highlights on large graphs       | Configurable budget, user control             |
| Default Budget 500k  | Balanced threshold                 | Works for typical projects                            | May be too low/high for edge cases        | User-configurable, document tuning ranges     |
| Highlight Toggle Off | Minimize default computation       | Safe for large notebooks, minimal overhead            | Less visual feedback by default           | Easy to enable via toggle, persisted preference|
| Token Sharing        | Eliminate redundant work           | Zero re-parse on mode switch, faster transitions      | Requires cache management complexity      | Centralized hook, clear invalidation rules    |
| Zustand Storage      | Centralize cache state             | Single source of truth, reactive updates              | Couples to store structure                | Well-defined slice, versioned schema          |

---

## Performance Directives

### Token Management Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Single Lexing        | Avoid redundant parsing         | - [ ] Lex once; share tokens; forbid per-component tokenization                           | Centralized useMarkdownPreviewTokens hook    |
| Cache Validation     | Prevent stale data              | - [ ] Check key match; forbid using mismatched cache                                       | Key comparison before cache hit              |
| Invalidation         | Clear on content change         | - [ ] Reset all cache fields; forbid partial invalidation                                  | Atomic clear in setMarkdownDocument          |

### Budget Guard Directives

| Context              | Intent                          | Directive                                                                                   | Enforcement Mechanism                        |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|----------------------------------------------|
| Complexity Calculation| Measure accurately             | - [ ] Count tokens and entities precisely; forbid estimates                                | Direct array length access                   |
| Budget Enforcement   | Gate features strictly          | - [ ] Disable highlights when over budget; forbid bypassing guard                          | Conditional rendering based on budget check  |
| Configurable Limits  | Enable user control             | - [ ] Read from settings; apply default; forbid hardcoded budgets                          | Settings registry integration                |

---

## Documentation Coverage

**Token and Budget Documents**:

| Document                             | Purpose                                                  | Quality Gates           | Steward              |
|--------------------------------------|----------------------------------------------------------|-------------------------|----------------------|
| `agenticgraph-token-and-budget-management-document.md` | Token sharing, budget guards, performance tuning | docs:update, doc:lint, tests | Performance Engineer |
| `markdown-slide-styling-guidelines.md`| Regression test fixture for budget guard                | manual testing          | QA Engineer          |

---

## Anti-Patterns (Forbidden)

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Redundant Lexing     | Share tokens                    | - [ ] Lex once, cache, reuse; forbid per-component parsing                                |
| Weak Cache Keys      | Ensure correctness              | - [ ] Hash content with length; forbid naive keys                                          |
| Unbounded Computation| Guard expensive features        | - [ ] Apply complexity budget; forbid unlimited T×E work                                   |
| Hardcoded Budgets    | Enable configurability          | - [ ] Use settings registry; forbid magic numbers in guard                                |
| Partial Invalidation | Maintain cache integrity        | - [ ] Clear all cache fields atomically; forbid leaving stale metadata                    |
| Ignoring Toggle      | Respect user preference         | - [ ] Check toggle state; forbid forcing highlights on                                    |

---

## Repository Health Checklist

**Structural Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Hook Centralization  | ✓      | - [ ] Single token hook; all consumers use it; forbid direct cache access                 |
| Setting Registration | ✓      | - [ ] Budget setting in registry; typed, validated; forbid unregistered settings          |

**Performance Health**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Token Reuse          | ✓      | - [ ] Zero re-lex on mode switch; cache validated; forbid redundant parsing               |
| Budget Guard         | ✓      | - [ ] Complexity guard active; tested; forbid unbounded highlight work                    |

**Maintainability**:

| Context              | Status | Directive                                                                                   |
|----------------------|--------|---------------------------------------------------------------------------------------------|
| Test Coverage        | ✓      | - [ ] Regression tests for large/small graphs; forbid untested budget behavior            |
| Documentation        | ✓      | - [ ] Budget ranges documented; tuning guidance provided; forbid undocumented thresholds  |

---

## Version Control Standards

| Context              | Intent                          | Directive                                                                                   |
|----------------------|---------------------------------|---------------------------------------------------------------------------------------------|
| Budget Changes       | Track threshold updates         | - [ ] Document default budget changes; version constant; forbid silent updates            |
| Cache Schema         | Maintain compatibility          | - [ ] Version cache key format; migrate gracefully; forbid breaking cache structure       |
| Setting Keys         | Preserve backwards compatibility| - [ ] Deprecate old keys gracefully; support migration; forbid abrupt key renames         |
