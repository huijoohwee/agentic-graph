# Requirements Document

## Introduction

Natural-language chat is already the default FloatingPanel Chat path in agentic-graph. A user enters
ordinary text in `FloatingPanelChatComposer`; `buildChatSubmitRequestContext` sends a no-slash
request through `CHAT_BASE_RESPONSE_CONTRACT_PROMPT` and the configured LLM provider. Explicit
leading `/`, `#`, and `@` invocations remain routing metadata resolved by
`resolveChatRuntimeInvocationQuery`.

This feature does not add a lexical resolver, confidence threshold, auto-apply path, or invocation
suggestion UI. It enhances the existing LLM response contract so a
`response.structuredContent.widgets` record can select one of the four canonical Widget Card layouts
by `layoutVariantId` and reuse the same descriptor, Widget identity, and property seed as
FloatingPanel **Props Panel → Widgets**.

The current shared owner chain is:

1. `widgetCardLayoutVariants.ts` owns the four canonical layout IDs and property seeds.
2. `widgetPaletteLayoutVariants.ts` maps those canonical descriptors into Props Panel palette rows.
3. `WidgetPalette` renders the rows with `WidgetPaletteCardLayoutPreview`.
4. Widget drag/drop applies `buildWidgetCardLayoutSeed(layoutVariantId)`.
5. FloatingPanel Chat parses `response.structuredContent` through
   `extractChatResponseStructuredSurface`.
6. `projectChatResponseStructuredSurfaceIntoKgcFrontmatter` projects normalized nodes through
   `buildCanonicalWidgetRegistryDraft`.

FloatingPanel Chat SHALL reuse those owners. It SHALL NOT rebuild a second descriptor list, seed
table, registry, palette, preview renderer, or workspace projector.

### Guardrails

- This is a Dev-only specification. It authorizes no Prod, release, Cloudflare, or remote migration
  action.
- Natural-language input uses the already-configured LLM submit path and can incur normal provider
  network/token usage after the user presses Send. The specification SHALL NOT claim offline or
  zero-token LLM execution.
- No input classification, automatic invocation insertion, automatic submit, or pre-submit graph
  mutation is introduced.
- Existing explicit-token routing and byte-clean no-slash provider text remain authoritative.
- Canonical layout selection is exact-ID only; unknown IDs are never fuzzy-matched or aliased.

## Glossary

- **No-slash request:** Ordinary user text for which
  `resolveChatRuntimeInvocationQuery(...).leadingRoute` is `null`.
- **Explicit invocation:** A recognized leading `/`, `#`, or `@` token resolved as routing metadata.
- **Plain response contract:** `CHAT_BASE_RESPONSE_CONTRACT_PROMPT`, selected for no-slash Chat and
  other plain-response cases by `resolveChatSubmitResponseContract`.
- **Structured response:** The existing `response.structuredContent` or literal MCP
  `result.structuredContent` envelope accepted by `extractChatResponseStructuredSurface`.
- **Canonical Widget Card layout:** One entry in `WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS`:
  `widget-card-type-0`, `probe-tree-type-1`, `probe-tree-type-2`, or
  `rich-media-deliverables`.
- **Widget identity:** The descriptor-owned `(nodeTypeId, widgetTypeId, formId)` tuple. The four
  canonical layouts use `TextGeneration/default/textGeneration`.
- **`layoutVariantId`:** The canonical structured-response key that selects one exact Widget Card
  descriptor.
- **Layout seed:** The canonical label/properties returned by
  `buildWidgetCardLayoutSeed(layoutVariantId)`.
- **Rich Media record:** An existing `panels` or `media` structured-content record projected through
  `RichMediaPanel`; it is not a Widget Card `layoutVariantId`.

---

## Requirements

### Requirement 1: Reuse the existing no-slash natural-language submit path

**User Story:** As a chat user, I want ordinary language to continue reaching the configured LLM
without learning invocation tokens or passing through a second detector.

#### Acceptance Criteria

1. WHEN the submitted request has no recognized leading route THEN
   `resolveChatSubmitResponseContract` SHALL select the existing plain response contract.
2. WHEN a no-slash request is packed for the provider THEN the first response-contract system
   message SHALL remain `CHAT_BASE_RESPONSE_CONTRACT_PROMPT`.
3. WHEN no leading route is present THEN the provider-facing user message SHALL equal the existing
   submit-time-trimmed user text, with no inferred token, layout metadata, score, or hidden routing
   prose inserted into it.
4. WHEN the user has not pressed Send THEN this feature SHALL NOT call a model, mutate the composer,
   or materialize graph state.
5. The implementation SHALL NOT add a local natural-language invocation resolver, suggestion
   surface, confidence thresholds, ranked invocation candidates, or detection-input truncation.

### Requirement 2: Preserve explicit invocation routing

**User Story:** As a power user, I want `/`, `#`, and `@` invocations to keep their existing routing
semantics while structured Widget responses gain layout reuse.

#### Acceptance Criteria

1. WHEN `resolveChatRuntimeInvocationQuery` resolves a leading route THEN the route token SHALL
   remain metadata and SHALL NOT be interpreted as a `layoutVariantId`.
2. WHEN an explicit invocation has a remaining query THEN
   `resolveChatRuntimeInvocationProviderMessageText` SHALL preserve the existing provider-facing
   remaining-query behavior.
3. WHEN the recognized route selects the KGC response contract THEN
   `CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT` SHALL remain authoritative.
4. WHEN the request is no-slash THEN no explicit-invocation system prompts SHALL be injected.
5. Existing composer menus and `resolveChatComposerTrigger` / `replaceChatComposerTrigger` behavior
   SHALL remain unchanged.

### Requirement 3: Single-source the canonical Widget Card descriptor contract

**User Story:** As a maintainer, I want the LLM contract and Props Panel palette to list the same
Widget Card layouts in the same order so they cannot drift.

#### Acceptance Criteria

1. `widgetCardLayoutVariants.ts` SHALL own `WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS`.
2. The descriptor list SHALL contain, in palette order:
   `widget-card-type-0`, `probe-tree-type-1`, `probe-tree-type-2`, and
   `rich-media-deliverables`.
3. Each descriptor SHALL own its label, layout kind, `nodeTypeId`, `widgetTypeId`, and `formId`.
4. `widgetPaletteLayoutVariants.ts` SHALL map the descriptor list for the canonical Widget Card
   registry entry instead of repeating four local records.
5. The FloatingPanel Chat response-contract fragment SHALL be generated from the same descriptor
   list and SHALL NOT repeat the layout IDs or labels in a second hardcoded array.
6. Both `CHAT_BASE_RESPONSE_CONTRACT_PROMPT` and `CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT` SHALL
   include the same shared response-contract fragment exactly once.

### Requirement 4: Select a canonical Widget Card with `layoutVariantId`

**User Story:** As a chat user, I want an LLM-generated Widget Card to use a real Props Panel layout
instead of inventing a parallel card shape.

#### Acceptance Criteria

1. WHEN the LLM returns a palette-backed Widget Card THEN its record under
   `response.structuredContent.widgets` SHALL include canonical `layoutVariantId`.
2. WHEN `layoutVariantId` resolves exactly to a shared descriptor THEN structural Widget identity
   SHALL come from that descriptor, not provider-authored `nodeTypeId`, `widgetTypeId`, or `formId`.
3. WHEN the provider selects a canonical layout THEN the runtime SHALL apply
   `buildWidgetCardLayoutSeed(layoutVariantId)` before request-specific semantic fields.
4. Provider-authored semantic fields MAY override seed defaults such as `label`, `prompt`,
   `summary`, `output`, and valid selection content.
5. Provider-authored content SHALL NOT override descriptor identity, registry fields, ports, schema
   mappings, timestamps, credentials, provider configuration, or renderer geometry.
6. WHEN `layoutVariantId` is unknown THEN it SHALL NOT select a canonical palette descriptor or
   seed, and the runtime SHALL NOT fuzzy-match by ID or label.
7. Rich Media output SHALL continue to use existing `panels` or `media` records and
   `RichMediaPanel`; the contract SHALL NOT invent Image Widget or Video Widget palette duplicates.
8. A canonical layout ID outside `widgets` SHALL NOT change the record's role, except that an exact
   Probe-Tree Type 2 `cards` record MAY enter the existing specialized Probe-Tree validator.

### Requirement 5: Reuse the shared Chat Widget adapter

**User Story:** As a maintainer, I want Widget layout resolution, node-type inference, form identity,
and handle defaults to have one Chat-side owner.

#### Acceptance Criteria

1. The Chat structured-response path SHALL delegate canonical layout selection and seed application
   to `chatResponseWidgetPaletteContract.ts`.
2. The adapter SHALL derive its canonical layout vocabulary from
   `WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS`.
3. The adapter SHALL resolve a canonical layout before generic node-type/form/handle inference.
4. Generic Widget/Rich Media inference and default handles SHALL live in the adapter instead of a
   duplicate block inside `chatResponseStructuredContent.ts`.
5. Reapplying the same layout seed and provider record SHALL yield the same normalized record and
   structural projection.
6. The adapter SHALL expose a shared prompt fragment; the base prompt modules SHALL import it rather
   than copy its prose or canonical IDs.

### Requirement 6: Reuse the existing extractor and projector

**User Story:** As a maintainer, I want layout-backed LLM output to use the established response
pipeline so KGC, literal MCP results, and saved workspace documents stay consistent.

#### Acceptance Criteria

1. WHEN assistant output contains supported `response.structuredContent` or literal MCP structured
   content THEN `extractChatResponseStructuredSurface` SHALL remain the parser/normalizer owner.
2. WHEN a structured surface is stored as a workspace document THEN
   `projectChatResponseStructuredSurfaceIntoKgcFrontmatter` SHALL remain the projection owner.
3. WHEN projection needs a registry entry THEN it SHALL reuse
   `buildCanonicalWidgetRegistryDraft`; it SHALL NOT serialize a provider-authored registry draft.
4. `buildChatResponseSurfaceFlowPatch` SHALL remain the flow node/edge projection owner.
5. Re-projecting the same normalized structured surface SHALL not duplicate Widget registry entries,
   nodes, edges, subgraphs, phases, or Widget bundle references.
6. A literal MCP result and an LLM-authored `response.structuredContent` record with the same
   canonical `layoutVariantId` and semantic content SHALL use the same adapter and seed.

### Requirement 7: Reuse the canonical Probe-Tree Type 2 seed

**User Story:** As a Probe-Tree user, I want LLM-created branch cards and Props Panel Probe-Tree Type
2 cards to share structural defaults while keeping provider questions request-specific.

#### Acceptance Criteria

1. `probeTreeStructuredResponseContract.ts` SHALL reuse
   `buildWidgetCardLayoutSeed(PROBE_TREE_TYPE_TWO_LAYOUT_ID)`.
2. The specialized Probe-Tree validator SHALL remain authoritative for question, rationale,
   evidence, options, lineage, depth, action, and runtime-owned output state.
3. Canonical Type 2 fields such as card type, Probe-Tree label, variant ID, selection mode,
   `allowOther`, and empty output SHALL come from the shared seed rather than a second hardcoded
   object.
4. Provider-authored questions and options SHALL remain dynamic semantic content and SHALL not be
   replaced by seed placeholders.
5. Ordinary LLM output SHALL NOT retain provider-authored lineage, depth, action, or context-anchor
   authority; only an exact literal MCP result marked trusted by its internal call site MAY retain
   those inputs after specialized validation, and embedded or recursively nested text SHALL not.

### Requirement 8: Preserve Props Panel → Widgets as the visible palette owner

**User Story:** As a user, I want Chat-created Widgets and manually dragged Widgets to look and
behave like the same Widget family.

#### Acceptance Criteria

1. `FloatingPropsPanel` SHALL continue to consume store-owned `effectiveWidgetRegistry` and SHALL NOT
   build a merged registry locally.
2. `FloatingPropsPanel` SHALL continue to filter through
   `isPropsPanelWidgetPaletteEntry` and render the shared `WidgetPalette`.
3. `WidgetPalette` SHALL remain the visible layout-list owner and
   `WidgetPaletteCardLayoutPreview` SHALL remain its preview renderer.
4. FloatingPanel Chat SHALL NOT render a second `WidgetPalette`,
   `WidgetPaletteCardLayoutPreview`, registry editor, or local layout label table.
5. Chat SHALL NOT call the imperative drag/drop or add-node bridge; structured responses SHALL use
   the existing extractor/projector/workspace-apply path.
6. Chat-created and drag-created nodes for the same canonical `layoutVariantId` SHALL share the
   canonical layout seed before request-specific content is applied.

### Requirement 9: Fail safely without hiding the assistant answer

**User Story:** As a chat user, I want malformed Widget metadata to avoid corrupting the canvas while
the useful prose answer remains readable.

#### Acceptance Criteria

1. WHEN `layoutVariantId` is blank or unknown THEN no canonical Widget Card seed SHALL be applied.
2. Unknown layout metadata SHALL NOT trigger label matching, alias remapping, automatic retry, or
   fallback card generation.
3. A record that is independently valid under the existing neutral structured-content contract MAY
   continue through that path without claiming a canonical Widget Card layout.
4. WHEN structured parsing fails THEN the assistant's Markdown/prose SHALL remain available in Chat.
5. Errors SHALL be bounded diagnostics and SHALL NOT trigger additional provider calls solely to
   repair layout metadata.

### Requirement 10: Dev-only scope and regression protection

**User Story:** As a repository owner, I want the enhancement proven locally without widening into a
release or unrelated UI rewrite.

#### Acceptance Criteria

1. The implementation SHALL remain in the agentic-graph Dev repository and SHALL NOT deploy or modify
   Prod/Cloudflare surfaces.
2. Focused validation SHALL cover no-slash request bytes, explicit routing, descriptor/prompt parity,
   seed reuse, extractor/projector idempotence, and Props Panel shared ownership.
3. `floatingPanelChatNoSlashInvocationContract.test.ts` SHALL continue to prove the plain no-slash
   contract and provider-facing query.
4. Existing palette, structured response, projection, and Probe-Tree regression families SHALL
   remain green after focused updates.
5. No requirement in this specification authorizes changes to composer suggestion UI, production
   release workflows, or Cloudflare configuration.
