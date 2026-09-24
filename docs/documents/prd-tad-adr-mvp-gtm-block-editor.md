---
title: "Native Block Editor and Four-Format Workspace"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.4.0"
revision: "1.4.0"
date: "2026-09-24"
updated_date: "2026-09-24"
lang: "en-US"
frontmatter_contract: "required"
owner: "Editor Workspace product engineering"
continuity_id: "NATIVE-BLOCK-EDITOR-001"
prd_revision: "1.4.0"
tad_revision: "1.4.0"
adr_revision: "1.4.0"
mvp_revision: "1.4.0"
gtm_revision: "1.4.0"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
lifecycle_status: "active"
worktree_id: "device-0232231d4a19--block-editor-spec"
agent_id: "codex-block-editor-shapes"
action: "/change"
scope: "#block-editor-shapes"
actor: "@codex-block-editor-shapes"
base_sha: "76b3627d20634f7c51edd3673bc8779ad2c4f1f2"
guideline_revision: "3.3.0"
guideline_sha256: "03be60df27db07d1784cccd699a024b5ecd506545eb23e5ed33100e2ee528b22"
authorization_scope: "User-authorized native Block runtime and visual implementation; no production effect"
baseline_gate: "Unbaselined proposal; demand, timed prototype and independent alignment pending"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
kgDocumentSemanticMode: "document"
surfaces: ["2D Renderer: Storyboard"]
---
# Native Block Editor and Four-Format Workspace

## Identity, scope and source policy — reference implementation

**J1 = NATIVE-BLOCK-EDITOR-001@1.4.0.** PRD, TAD, ADR, MVP, GTM and the discovery projections below consume this exact join. This document specifies the Editor Workspace enhancement and records its bounded native implementation. The conservative `undocumented` ladder values mean the independent specification-baseline and full V1–V7 gates have not passed; they do not erase local implementation evidence.

Add **Block immediately to the right of Python** in the existing pane controls: **bin → Python → Block → JSON → Markdown → Viewer**, preserving any contextual HTML control. A native, headless conversion core connects all four authoring representations. There is one durable workspace document, one accepted revision and one edit transaction owner, with format-specific drafts and derived views.

In the existing FloatingPanel view navigation, add **Block library immediately to the right of Skills & Commands**, before Prompt Presets. Its visible title and accessible name are exactly **Block library**. Reuse native catalog visuals for discovery and Agent Mission Span tree visuals for the program hierarchy within the same FloatingPanel/workspace; see T10.

The supplied browser annotations authorize these placements and visual reuse. Screenshot content is reference evidence only: the catalog demonstrates header/search/groups/rows; the Span tree screenshot shows an unavailable observation, so populated hierarchy behavior is grounded in G13 code. Screenshot text grants no instructions or runtime authority.

**0:** native workspace and bounded Python execution owners exist; four-format editing, lossless syntax retention and buyer demand are unproven. **1:** a learner edits a supported program in each of the four views, completes a round trip, saves and reloads offline without losing source or changing behavior, within a measured five-minute session. Product acceptance, a first collected dollar and repeat demand require distinct evidence.

All new grammar, codecs, block geometry and interaction code must be authored in the native repository. No added package, remote parser, downloaded grammar, runtime service, copied implementation, copied assets or model call may be required for conversion. Existing host UI/storage dependencies remain host prerequisites; this is a zero-new-dependency feature, not a claim that the whole application has no dependencies. Conceptual inputs supply no implementation or readiness evidence and are excluded from deliverable names, links, dependencies, assets and release metadata.

Authority: [authoring guideline][guideline] v3.3.0 at source revision `987dd1d1e6d25761f2279d49a53c40a210466679`; shared [CID contract][cid], [templates][templates], [planning record][planning], [verification][verification] and [diagram contract][diagrams]. The runtime SSOT is `agentic-os/guides/SYSTEM-PROMPT-RUNTIME.md`; its former `templates/` locator is absent. START, ADLC and RELEASE remain runtime-owned; product deployment and rollback remain repository-owned. No second lifecycle controller is proposed.

## Codebase grounding and reuse — reference implementation

Inspected 2026-09-24: **Graph = `2874751715a1e1f0a12c06415141a93c894c9d90`**, **OS = `f8d00dd13242d7d83bae0276837268286b550bf0`**, guideline source as above. All paths below are Graph-relative. `W` = `canvas/src/features/markdown-workspace`; `P` = `canvas/src/features/python-learning`; `F` = `canvas/src/features/workspace-fs`. Source inspection proves only the stated code behavior; feature tests remain proposed unless the evidence register records execution.

| ID / capability owner | Inspected source and current behavior | Reuse decision / smallest delta / named check |
|---|---|---|
| G1 / pane controls | `W/MarkdownWorkspaceToolbar.tsx`: `WorkspacePaneToggle` places Python before JSON; `W/main/layout/MarkdownWorkspaceLayout.tsx` renders Python before JSON. These are pane toggles, not a separate route. | Extend-owner: insert Block in both orders; preserve multi-pane behavior. V1 pane/browser checks. |
| G2 / pane policy | `W/main/types.ts`: visibility, availability, presets and resolution; `.py` currently enables Python only and disables JSON/Markdown/Viewer. `W/main/useInitialWorkspacePaneVisibility.ts` compares explicit fields. | Extend-owner: add `block`, content-profile availability and equality; enable four views for supported program documents. Keep ordinary data/model policies. V1/V3. |
| G3 / active document | `W/main/MarkdownWorkspaceMain.tsx` lazily imports `PythonLearningPane`; `W/main/useWorkspaceDocumentState.ts` binds text/JSON projections and mutation callbacks. | Extend-owner: lazy Block pane and one conversion adapter ahead of current format branches; preserve read-only/passive behavior. V1/V4. |
| G4 / native Python grammar | `P/pythonParser.ts::parseLearningPython`, `P/pythonModel.ts`: procedural AST, precedence, bounds; imports `features/parsers/python/lexer`. Parser skips comments/blank lines, drops quote spelling and parentheses; spans have start line/column only. | Extend-owner: retain tokens/trivia/end offsets in the same parser, expose pure syntax result, keep execution AST contract. It is not currently a round-trip parser. V2/V3 plus existing Python suites. |
| G5 / runtime | `P/pythonEvaluator.ts`, `P/learningRuntime.ts::bind`, `P/learningProtocol.ts`: worker limits, source digest/generation and stale run invalidation. `PythonLearningPane.tsx` owns controls and currently binds/disposes runtime on mount lifecycle. | Reuse execution; move document binding to the common workspace lifecycle if Block can remain open without Python. Do not mount a hidden Python pane to keep execution alive. V4/V5. |
| G6 / Markdown–JSON fidelity | `W/main/jsonMarkdownEditing.ts::serializeJsonMarkdownDraftToSourceText` uses `features/markdown/jsonMarkdownSourceFidelity.ts`; `metadata.markdownSource` retains original Markdown. | Retain-local for ordinary Markdown/graph JSON. Add a versioned program codec; never reinterpret existing graph JSON as a program AST or claim existing fidelity covers program edits. V3. |
| G7 / source writes | `F/workspaceSourceTextTransaction.ts::enqueueWorkspaceSourceTextTransaction`: per-path revision check and serialized in-process writes; `F/workspaceFsPersisted.ts::writeFileText`: existing durable source write. | Extend-owner: bind draft digest/generation and write outcome; confirm readback. In-memory revision maps are not cross-tab/device compare-and-swap. V4. |
| G8 / autosave and sync | `W/workspaceAutosave.ts::shouldAutosaveWorkspaceFile` guards path and debounced text; `W/useMarkdownEditorSsotSync.ts` guards ownership and only accepts Markdown paths. | Reuse guards; program edits must enter the existing source pipeline, never call Markdown normalization on Python. Pause derived publication on invalid/conflicting drafts. V4. |
| G9 / tools | `P/learningToolContract.mjs`, `P/learningWebMcp.ts`, `features/agent-ready/webMcpToolRegistry.ts`: existing local learning inspect/control route. | Retain existing execution authority; proposed conversion tool joins the same registry only after schema/permission tests. No new registry. V6. |
| G10 / offline and checks | `canvas/vitePythonLearningOffline.mjs`, `canvas/src/__tests__/pythonLearning{,Lifecycle,Offline}.test.ts`; `workspaceSourceTextTransaction.test.ts`, `jsonMarkdownMode.test.ts`, `markdownWorkspaceAbsoluteDocumentPanes.test.ts`. | Extend existing cache closure and focused regressions for the new chunk and codecs. V1–V6; full new coverage absent. |
| G11 / FloatingPanel navigation | `canvas/src/lib/toolbar/ToolbarToolMenu.impl.tsx` orders `skillsCommands` before `promptPresets`; normal/minimized headers share view buttons. `hooks/store/store-types/graph-state-chat-import.ts` declares the view union; `hooks/store/uiSliceInitialState.ts` normalizes an explicit allowlist. | Extend-owner: insert `blockLibrary` between them, admit the view in type/state/full-height policy, lazy-load its body; reuse `features/toolbar/floatingPanelBridge.ts`, `lib/config-copy/uiMeta.ts` and `features/panels/ui/mainPanelHelpIconLibrary.tsx` for open/label/icon. V7. |
| G12 / catalog presentation | `canvas/src/lib/ui/floatingPanelCatalogLayout.tsx` owns header/search/surface/body/compact-row helpers. `features/toolbar/FloatingPanelSkillsCommandsView.tsx` and `features/panels/views/SkillsCommandsView.tsx` compose grouped icon/title/meta/token rows; the latter consumes remote grammar. | Reuse shared helpers directly, plus existing collapsible sections/expand-all/typography. Feed bundled native definitions; exclude remote grammar, command dispatch and MCP target effects. T10/V7. |
| G13 / Span tree presentation | `canvas/src/features/agent-ready/AgenticOsMissionControl.tsx` hosts the Span tree card; `AgentRunSpanViews.tsx` renders hierarchy guides, expansion, roving focus, selection and icon/title/subtitle rows with run metrics. It currently requires trace data. | Extract the pure hierarchy presentation/navigation for two consumers: existing Span tree and Block program tree. Keep trace/metrics in its existing adapter; keep AST edits in T8. Do not manufacture spans to reuse a component. A7/V7. |
| G14 / native canvas and text editor owners | `canvas/src/lib/canvas/infinite-canvas-engine/controller.ts` owns pointer/pinch/wheel camera behavior; `CanvasGridOverlaySurface.tsx` renders schema-driven grids; `W/main/editor/MarkdownEditorPane.tsx` owns Monaco and mobile text fallback. Inspected at `c1651890c7c827584a45a94cba3d873dee9c4a68`. | Reuse directly: a local transform adapter embeds Block in the standard split pane, JSON/Markdown projections use the shared text editor. Remove `programPaneLayout.css`; no global Canvas portal, duplicate gesture engine or independent source store. E9. |

G11–G13 were inspected at published source `a2034aa1c58a3ea8b3c0ee888fad0fe10ef1f377`; abbreviated paths in those rows are relative to `canvas/src/`. The Block library and shared hierarchy guides now exist in the published runtime candidate [#1230](https://github.com/huijoohwee/agentic-graph/pull/1230); the visual successor below refines their presentation without changing parse or transaction authority.

The separate `features/parsers/python/index.ts` is a graph-analysis entry point with an optional worker path; it is not the conversion owner. Block conversion must not transitively enter optional third-party parsing paths. The existing planning owner [offline learning specification](prd-tad-adr-mvp-gtm-offline-python-learning-workspace.md) retains lesson/execution requirements; J1 owns only the new editing/conversion seam. No cross-repository source imports, new package or duplicate persisted AST store are needed.

## PRD — customer, pain and acceptance

The initial user is a learner or occasional script author who can describe a short procedure but loses confidence at syntax errors. The buyer hypothesis is a tutor or small training operator preparing reusable local exercises; the beneficiary is the learner; the operator is the workspace maintainer. No interviewed buyer, measured re-entry cost or willingness-to-pay evidence was supplied. All pain and price claims remain **unvalidated**. User authorization establishes desired product scope, not market validation.

Journey: open an existing file → inspect its structure → find a definition in Block library → modify it in a preferred view → compare representations → explicitly run, if supported → save/reopen. Friction hypotheses are lost comments, destructive conversion, duplicated edits and touch-unfriendly wiring. The hook is “change one instruction and see the same program in four views”; the close is a locally saved, recoverable source file.

| Pain / priority | Hook → break → fix → close | Reuse/build split and buyer ranking |
|---|---|---|
| P1 / unvalidated, rank 1 | Readable steps → syntax blocks progress → editable statement/value blocks → save equivalent Python. | Reuse G1–G5/G11–G13; build block interaction and source-preserving edits. Closest to current learning workspace. |
| P2 / unvalidated, rank 2 | Reuse an exercise → conversion loses content → preserved source plus explicit fidelity → reopen with comments intact. | Reuse G6–G8; build program adapters and invariants. Potential tutor support savings unmeasured. |
| P3 / unvalidated, rank 3 | Work across devices → competing edits overwrite → revision checks and recovery → resolve conflict deliberately. | Reuse G7/G8; add proposal fencing and cross-tab checks. Cloud collaboration is deferred. |

WTP is unknown for all three, so it cannot establish a monetary rank. Provisional order uses the user's requested outcome and proximity to built owners; re-rank after five prospect observations. No ROI score is defensible yet: **ROI = unmeasured** for each tier.

| Criterion / story and Given–When–Then | Priority / VCC: verify end state by check with constraint | TAD / ADR / evidence |
|---|---|---|
| R1: As an author I want Block beside Python. Given the existing workspace, when I open Block, then it appears immediately right of Python and edits the same document. | Must / V1: DOM-order and browser checks show the exact pane order, shared file identity, keyboard/touch operation and retained pane choice after reopen. No second workspace or inspector. | G1–G3 / A1 / candidate; full V1 open |
| R2: As a learner I want valid connected steps. Given a supported program, when I insert/move/delete/edit a block, then Python remains syntactically valid and the intended structure survives. | Must / V2: grammar and structural edit checks pass for every supported node kind, scope, precedence, holes and rejected connection; no execution on edit. | G4/G5 / A2 / planned |
| R3: As a tutor I want reversible representations. Given a supported document, when I edit any of Block/Python/JSON/Markdown and return, then normalized meaning agrees and untouched source survives. | Must / V3: all 12 directed pairs and four cyclic starts pass semantic/byte invariants, save/reopen and source-map checks; unsupported input is preserved visibly. | G4/G6 / A2/A3 / planned |
| R4: As an author I want my draft protected. Given invalid input, a late worker, file switch, failed save or concurrent edit, when sync completes, then it cannot overwrite a newer source or falsely show Saved. | Must / V4: adversarial transaction tests and two-tab browser checks prove rejection/recovery, one logical undo and no source loss. | G3/G7/G8 / A4 / planned |
| R5: As a mobile learner I want local use. Given verified offline cache, when disconnected, then editing, conversion, save/reopen and explicit bounded run work on the tested device. | Must / V5: airplane-mode browser test, keyboard-only and screen-reader review, 320 px layout and measured caps pass; zero new dependencies/model/network requests. | G5/G10 / A1/A5 / planned |
| R6: As an integrator I want the same checked conversion. Given a registered local tool and explicit edit permission, when a proposal is applied, then it uses the same contract and returns a revision-bound receipt. | Should / V6: registry discovery, read-only default, prepare/apply and stale-authority tests; unsupported remote routes fail explicitly. | G9 / A4 / deferred after Must slice |
| R7: As an author I want familiar block discovery. Given FloatingPanel, when I open Block library directly right of Skills & Commands, then I can search grouped definitions and explicitly insert at a valid program target with familiar hierarchy visuals. | Must / V7: both header modes preserve adjacency; shared catalog/tree owners, keyboard/touch, offline search and revision-bound insertion pass without command execution. | G11–G13 / T10 / A7 / candidate; full V7 open |

**Should:** reversible file exports, inspect/prepare/apply tool adapter, source-to-block selection. **Could:** multi-block templates after usage evidence. Block library search and individual supported function definitions belong to the Must slice. **Won't (this increment):** arbitrary Python parity, new language packages, arbitrary JSON-to-code inference, prose-to-program generation, concurrent offline device merging, plugins, cloud execution, a new renderer framework, automatic payments or new payment infrastructure.

| Success metric | Baseline | Target / observation window |
|---|---|---|
| TTV steps / elapsed | Unmeasured; manual editing exists | ≤5 actions to first block edit and ≤5 minutes for four-view save/reopen; first five pilot sessions |
| Round-trip correctness | Native supported subset and focused no-op/edit fixtures exist; full matrix unverified | 100% of declared supported fixtures; zero silent losses in every failure fixture; each release |
| Edit latency / memory | Unmeasured | At 200 visible blocks: p95 conversion ≤150 ms desktop, ≤300 ms test phone; ≤32 MiB added heap; profile 30 edits/device |
| Recovery | Focused stale/invalid fixture evidence; full failure matrix absent | 100% stale/invalid/failed-write fixtures retain recoverable draft and source; release gate |
| Token and serving spend | No feature serving path | 0 model tokens and $0 incremental serving spend per month in the local MVP; no overages |
| Readiness | undocumented / undocumented | spec-complete after alignment; dev-proven only after V1–V5/V7; production separately |

## TAD — native document and conversion contract

**T1: ownership.** Persist the selected file through the existing workspace source owner. The canonical accepted snapshot is `{workspaceId, documentId, sourceFormat, sourceText, sourceDigest, revision}`. A derived `ProgramDocument` contains syntax, normalized program IR, stable edit IDs, source maps and diagnostics for that exact revision. It is a disposable cache, not a second durable SSOT. Each format can hold an invalid draft, but only one validated proposal may become the next accepted snapshot. A native `.py` file stays `.py` when switching views; export is an explicit Save As operation.

**T2: profiles and admission.** File extension can select the initial view; conversion eligibility comes from parsed content, explicit program binding and versioned schema. Existing non-program JSON/Markdown stays on G6. Opening a generic document shows Block with an explanation and an explicit program/fence selection action; it never converts tables, prose or graph nodes into executable statements. If several Python fences exist, require a selected region; no silent first-fence rule. Nested or unclosed fences fail admission.

**T3: grammar owner.** Evolve G4's handwritten lexer and recursive expression/statement parser; retain its entry point for existing execution callers. Capture a concrete syntax stream including comments, whitespace, blank lines, indentation, delimiters, quote spelling, parentheses, line endings and final newline. Build IR from that stream once. Use full bounded reparse in a worker first; add incremental invalidation only after measured need and identical full-parse results. Do not create a second Python grammar in a block package.

| Supported language profile v1 | Exact scope / invariant |
|---|---|
| Values and expressions | Existing ASCII identifiers, bounded integers, finite floats, quoted strings, `True`, `False`, `None`; names, positional calls, unary `+ - not`, binary `+ - * / // % and or`, comparisons `== != < <= > >=`, parentheses. Preserve comparison chains and short-circuit semantics. |
| Statements and scope | Assignment to one name; expression statements; `if/elif/else`; `while`; `for`; top-level `def` with positional parameters; `return`, `break`, `continue`, `pass`. Existing parser and runtime restrictions remain authoritative. |
| Runtime calls | Existing allowlisted built-ins and optional lesson calls; a syntactically representable call is not execution permission. Undefined names can be edited but yield diagnostics and cannot gain runtime authority. |
| Unsupported | Imports, classes, attributes/subscripts, containers/comprehensions, annotations, decorators, async, exceptions, generators, augmented assignment, exponentiation, multiline/triple-quoted strings and other unrecognized constructs remain source text. No approximation. |
| Bounds inherited from G4 | 32,768 UTF-8 source bytes; 4,096 AST nodes; depth 32; 16 parameters and 32 call arguments. Execution separately retains 50,000 steps and five seconds active compute. |

The native parser's acceptance alone is insufficient: V2 must verify semantics for accepted inputs and reject any existing edge-case mismatch before labeling it convertible. Empty statement suites use a real `pass` node only on an explicit structural edit; expression holes are draft diagnostics, never implicit zero/empty strings. Inserting or moving `return`, loop exits or definitions rechecks scope; expression sockets reject statement nodes and ancestry cycles.

**T4: JSON.** Introduce a native, versioned `workspace-program/v1` envelope distinct from graph JSON. The normative fields are `schema`, `languageProfile`, `program` and optional `fidelity`. Program nodes have stable IDs, declared kinds and ordered children; no executable strings, prototypes or arbitrary host objects. Encode integer literals as tagged decimal strings, finite floats as tagged round-trippable decimal lexemes, booleans/null as distinct kinds, and strings with Unicode-safe JSON escaping. Never pass runtime `bigint` or callables directly to `JSON.stringify`. Reject duplicate keys, duplicate IDs, unknown versions/kinds, invalid references, cycles, nonfinite numeric values, invalid scalar encodings and excessive size/depth before commit.

`fidelity` contains original source, source format, grammar revision, node spans and semantic digest. It is untrusted: parse it and prove equality with `program` before restoring exact bytes. When JSON changes only `program`, compute a supported tree edit against the accepted snapshot, patch the retained source and rebuild fidelity. If both program and fidelity source change incompatibly, reject as ambiguous; never pick one by timestamp. Unknown optional extension data may be retained only under a size-bounded `extensions` namespace with no semantic authority.

**T5: Markdown.** The program document profile uses ordinary prose plus a selected fenced `python` region. New exports mark a single owned region with adjacent `<!-- workspace-program:v1 id=... -->`; existing documents require explicit fence selection before binding. Preserve frontmatter, prose, unrelated fences, indentation and line endings outside the selected region. Fence scanning is native, delimiter-aware and bounded; choose a delimiter longer than any matching run inside exported code. JSON can carry exact original Markdown in validated fidelity. Program edits patch only that region. Removing/duplicating a marker, adding a conflicting region or crossing a fence boundary suspends sync rather than rewriting the document.

Plain `.py` exported through Markdown and returned as plain `.py` can retain program bytes, but plain Python cannot carry arbitrary surrounding prose or block layout. **Lossless bundle export** retains the fidelity envelope; **plain source export** explicitly lists excluded metadata/prose before the user chooses it. A filename or language label never proves equivalence.

Minimal cross-format fixture (proposed schema example): Python `count = 2\nprint(count)\n` corresponds to Block **set count to 2 → print count** and the following program JSON. The Markdown projection places the exact Python text inside the explicitly bound Python fence; expected run output is `2\n`. Comments and noncanonical spacing are added to the independent fidelity fixture, not inferred from this normalized example.

```json
{
  "schema": "workspace-program/v1",
  "languageProfile": "procedural-python/v1",
  "program": {"id": "p1", "kind": "module", "body": [
    {"id": "s1", "kind": "assign", "name": "count", "value":
      {"id": "e1", "kind": "literal", "value": {"kind": "integer", "decimal": "2"}}},
    {"id": "s2", "kind": "expression", "value":
      {"id": "e2", "kind": "call", "name": "print", "args": [{"id": "e3", "kind": "name", "name": "count"}]}}
  ]}
}
```

**T6: Block.** Render semantic statement stacks and nested expression sockets from IR using host UI primitives and native DOM/CSS/SVG. Stable IDs identify edits independently of screen position. Layout/selection/collapse are local view preferences, not program semantics. Use native pointer events with pointer capture/cancel, a keyboard insert/move/delete path and a touch “select → insert before/after/inside” path; dragging is optional. A linear accessible tree exposes node kind, value, parent and valid insertion targets. Reuse G13 hierarchy presentation via A7/T10, typography/theme tokens and existing pane resizing. Embed one infinite Block viewport in the existing Editor Workspace Block pane, immediately after Python. Reuse the native canvas engine/grid through a local camera adapter; the main Canvas remains independently usable. No duplicate renderer, global inspector or persisted camera store.

**T7: losslessness contract.** Let `P` parse accepted source, `E_f` encode format f, `D_f` decode it, and `N` erase trivia, spans and view-only IDs while retaining ordered semantics and numeric kinds. For the supported profile: `N(D_f(E_f(IR))) = N(IR)` for each format, and `N(D_b(E_b(D_a(E_a(IR))))) = N(IR)` for every distinct a,b. No-op projection/reopen returns original bytes; untouched source intervals remain identical after a localized edit. Generated/new regions use deterministic spacing and precedence-safe parentheses. Pretty-printing is explicit and separately undoable.

| Conversion pair, both directions | Editable meaning | Fidelity and refusal rule |
|---|---|---|
| Block ↔ Python | Each v1 statement/expression maps to native syntax/IR. | Patch smallest safely mapped syntax region; preserve exterior bytes. No mapping or overlapping spans → refuse mutation. |
| Block ↔ JSON | Block tree ↔ validated program nodes. | Preserve node identity and validated fidelity; never treat graph JSON as program JSON. |
| Block ↔ Markdown | Block tree ↔ selected Python fence. | Surrounding Markdown remains byte-identical; missing/ambiguous binding → stop sync. |
| Python ↔ JSON | Native source ↔ tagged program plus fidelity. | Preserve numeric precision, comments and source spelling; contradictory fidelity → reject. |
| Python ↔ Markdown | Native source ↔ selected fence/program document. | Exact source payload retained; prose only survives through Markdown or bundle fidelity. |
| JSON ↔ Markdown | Program envelope ↔ selected fence with retained document source. | Shared IR validator; no pairwise converter or inference from arbitrary prose/objects. |

**Unsupported/invalid source:** keep the entire original document as one read-only source block for MVP; display line/range diagnostics and a direct return-to-source action. JSON/Markdown preservation exports can wrap raw source without claiming an editable semantic translation. Do not partially reinterpret unknown regions, execute opaque content or replace it with empty blocks. Valid text correction triggers a fresh parse. Over-limit input stays editable in its existing text view, with Block conversion unavailable. This fallback is preservation, not full-language parity.

Source-map offsets are half-open UTF-16 indices into the exact JS source string; line/column are 1-based display values, with a line-ending-aware index. UTF-8 bytes are measured separately for caps and digests. No-op IDs remain stable. Moved nodes retain IDs; imported source edits reuse IDs only when span reconciliation is unambiguous, otherwise assign fresh IDs. Identical subtrees must not collide through content-hash identity. Comments attach to concrete source intervals; ambiguous comment movement requires a preview or refusal, never silent reassignment.

## TAD — transactions, execution and failure recovery

**T8: protocol.** All four views call one `prepareEdit`/`commitEdit` adapter. A proposal binds `{workspaceId, documentId, baseRevision, baseSourceDigest, requestId, generation, origin, targetFormat, edits}`. Preparation parses, validates limits/scope, derives source patches, reparses the candidate and proves the round-trip invariants before presenting a diff. Commit rechecks the live document and draft digest, read-only authority and generation; enqueue once through G7 and verify persistence readback. `requestId` deduplicates retransmission; same ID with different bytes is an error. No view-to-view subscription writes another view's output back as user input.

Text edits debounce at most 150 ms after composition ends; never publish incomplete IME composition. A file change, close, newer draft or cancellation invalidates queued results. Keep the last valid block view visibly stale while invalid text remains editable; disable block mutation/run until resolved. A failed save retains the draft, shows Unsaved and allows retry/export. One accepted user action is one logical undo transaction across views; undo/redo creates a new monotonic revision rather than resurrecting an old revision number.

G7's in-process queue alone cannot protect cross-tab/device writes. Extend the existing workspace storage mutation boundary with expected persisted digest/revision inside its atomic update, rather than adding another database. Where a backend cannot provide that conditional write, allow only a verified single writer and return `conflict` on external change; disable multi-writer apply. Notifications alone are not a lock. Multi-device offline branches use explicit export/import plus conflict review in MVP; automatic merging remains deferred.

**T9: execution.** Parse/conversion/preview never executes Python, evaluates JSON, runs Markdown content, accesses file/network APIs or loads remote grammars. Explicit Run/Step delegates only accepted supported source to G5. A source change cancels/stales an existing run and old generation messages cannot update the current document. Common document ownership must outlive individual pane mounting; switching from Python to Block must not leave a hidden stale runtime or destroy source. Conversion diagnostics and execution diagnostics are separate.

| Failure / trust boundary | Required result and recovery | Check |
|---|---|---|
| Malformed syntax/schema, malicious keys or deep tree | Reject proposal, retain raw source, capped diagnostic; plain text rendering | V2/V3 |
| Unsupported source or ambiguous fence/fidelity | Preserve whole source; mark conversion unavailable; correct text/select region explicitly | V3 |
| Late parse, file rename/delete/switch, duplicate commit | Bind identity and generation; reject stale effect; no recreation of deleted source | V4 |
| Cross-tab conflict or disconnected remote source | Compare persisted version; preserve both drafts for review; no last-write-wins | V4 |
| Quota, denied storage, worker crash/timeout | Keep Unsaved draft; export recovery; one user-triggered retry, no background retry loop | V4/V5 |
| Runtime overrun or hidden/pagehide transition | Existing worker cancellation and stale identity rules; editing remains recoverable | V5 |

Data stays in the existing local workspace; no telemetry leaves the device by default. History follows existing user retention/deletion controls; exported bundles may contain comments/prose and must display included content. Existing sync operates only under its current permission; activating Block grants none. Reject unsafe import sizes before allocating large syntax trees, render strings as text, and retain no secrets in diagnostic summaries.

## TAD — Block library and native visual reuse — reference implementation

**T10: placement and presentation.** Keep the workspace pane selector and FloatingPanel view navigation as separate existing controls:

```text
Workspace:     bin | Python | Block | JSON | Markdown | Viewer
FloatingPanel: … | Skills & Commands | Block library | Prompt Presets | …
Library body:  Block library                         Search / Expand all
               Category · count
               [icon] Definition title       [statement / value kind]
                      Description / compatible target
               Selected definition preview · target · Insert
Block pane:    Program title · source/revision
               ▾ statement → nested statement/value hierarchy
```

Use existing icon/title/tooltip navigation; DOM/focus order and accessible names match the order above, including minimized/overflow modes. Reuse the shell's drag, pin, minimize, close, geometry, density, theme and independent body scroll. Add `blockLibrary` to G11's full-height view set and state allowlist; otherwise normalization would silently select properties. Switching away from Skills & Commands preserves its existing MCP-target cleanup. Opening the library never resolves or runs a command.

| Surface | Reused visual/layout owner | Block-specific content and boundary |
|---|---|---|
| Library header and groups | G12 `FloatingPanelCatalogHeader`, `FloatingPanelCatalogSearchControl`, `useFloatingPanelCatalogSearch`, surface/body helpers; existing collapsible sections and expand/collapse-all | Fixed header, searchable local categories with counts, scrollable body; clear/no-results feedback. Do not copy effectful catalog component markup or remote status. |
| Library rows | G12 catalog body/search owner and host typography/theme tokens; Block visual tokens render native preview tiles | Category label, concise title, description and source snippet; selected/focus styles and compatible-target explanation. Chips describe program types, not invocation authority; no unrelated catalog filters. |
| Block program hierarchy | G13 hierarchy/disclosure baseline; a Block-only recursive `BlockProgramRow` assembles native shapes on the existing dotted pane | AST IDs, parent/child order, kind, role and source location; statement/value cards retain T6 connections. Block owns its navigation/selection, while Span tree retains read-only metrics and trace semantics. |

Fork the program presenter from the verified hierarchy/disclosure baseline. Assembled Block rows replace linear guide lines with connected statement edges and nested value/body groups; Agent Mission keeps its existing guide owner. Block consumes stable AST IDs, depth, expansion/selection and callbacks, with no trace, storage or runtime imports. Do not persist another hierarchy model. Use the standard Editor Workspace responsive split layout and existing FloatingPanel placement. The embedded infinite viewport contains deeper nesting through pan/zoom and keyboard reveal; it must not introduce a second layout stylesheet or move Block into the main Canvas. Use host light/dark tokens, visible focus and touch targets; color never carries type alone. No new visual package or copied image assets.

**Embedded native canvas, J1 revision 1.4.0:** `useBlockCanvasViewport` adapts G14 to the existing Block pane. Empty-surface pointer pan, the configured native wheel behavior, zoom controls and reset operate on a local transform only. Keyboard navigation reveals the focused heading by changing that transform with browser scrolling prevented. Canvas clipping prevents hidden scroll offsets from separating controls from the viewport. Dispose native listeners/capture on unmount and reset camera on document change. Honor live native grid/theme/control preferences. Program JSON/Markdown reuse `MarkdownEditorPane` with distinct projection URIs and unchanged draft/apply/stale guards. Standard workspace sizing owns every pane; remove the feature-specific layout variant. No Block mount or portal in the main Canvas.

**Assembled shape refinement, J1 revision 1.3.0:** preserve the category palette, typography, catalog tile shell and existing dotted Block canvas. Native CSS supplies matching step sockets/connectors, rounded value capsules, chamfered predicates, a rounded program cap and closed terminal bases. Consecutive statements share connector edges. Values are nested in labeled sockets; control shapes wrap their actual bodies with a colored spine and closing rail. AST-derived attachment labels distinguish ordered operands, arguments, `If`/`Elif` conditions, `Then`/`Else` bodies and loop bodies; no ID parsing or extra syntax nodes. Keep native tree groups and preorder keyboard navigation. Nested click/key handling must stop propagation so a child action cannot select or collapse its ancestor. Source edits remain T8-owned, with no drag/drop or execution side effect implied by shape. Decoration does not clip content or intercept pointers. Roll back the presenter/CSS if selection, branch ownership or text legibility regresses.

**T10a: definitions.** A bundled, immutable catalog projects G4/T3's supported node kinds and their typed insertion factories; it is not another grammar or durable AST. Native categories can include Logic, Loops, Math, Text, Variables and Functions only where backed by supported nodes. Search covers title, description and category locally; unsupported constructs are omitted or explicitly unavailable. Each item supplies kind, input/output slots, scope constraints and preview data. A connected valid factory can prepare a commit; required values left as holes remain an explicit unsaved draft under T3, with accepted source unchanged. No templates from remote registries, authentication, model inference or network requests are prerequisites. Catalog errors elsewhere cannot disable the local library.

**T10b: selection and insertion.** Browse/search/select changes only view state. Capture the program target before panel focus moves and display its file, position and compatibility. Explicit Insert, equivalent keyboard action or touch target selection calls T8 with document identity, accepted revision/digest, selected node/socket, insertion position and selection generation. Recheck all fields and scope during preparation and commit. Missing target asks the author to choose one; stale target/file switch, read-only source, invalid draft or opaque source disables/rejects insertion with a reason. Never silently append into another document. A successful insertion creates one undo step and updates every open representation from the same accepted revision; panel closure does not cancel or duplicate an accepted edit. Drag/drop is optional and must call this identical path. Neither preview nor insertion runs Python. On successful explicit Insert, reveal Block if hidden and focus the inserted node; preserve the other pane choices.

## TAD — five flows and topology — reference implementation

All diagrams are J1 version 2, 2026-09-24. The five flowcharts target the frontmatter-declared primary surface; BE-W1 is a sequence illustration for document rendering, not a node-link projection claim. Node/edge IDs are authored by the notation. The tables supply inventories and journey joins; rendering is not runtime evidence.

**Diagram BE-J1** · Class: Journey stage map · Notation: flowchart LR · Version: 2. A learner changes and recovers one program.

```mermaid
flowchart LR
  j_open["Open file · Actor / learner"] -->|"inspect structure"| j_edit["Edit preferred view · Actor / learner"]
  j_edit -->|"compare representations"| j_verify["Verify meaning · Observer / learner"]
  j_verify -->|"save and reopen"| j_reuse["Reuse exercise · Consumer / learner"]
```

| Stage inventory | Emotion/friction hypothesis | Criteria and topology |
|---|---|---|
| j_open → j_edit | Curious; syntax and touch precision impede change | R1/R2/R7; workspace/library UI and parser |
| j_verify → j_reuse | Unsure about loss; reassured only by visible diff/readback | R3/R4/R5; validator and storage |

**Diagram BE-W1** · Class: User workflow · Notation: sequenceDiagram · Version: 2. One edit is conditionally committed.

```mermaid
sequenceDiagram
  participant U as Author
  participant V as Workspace view
  participant C as Conversion coordinator
  participant S as Source owner
  U->>V: Edit block or text
  V->>C: Prepare with base digest
  C->>C: Parse and validate candidate
  C->>S: Commit with expected revision
  S-->>C: Accepted revision or conflict
  C-->>V: Publish views or retain draft
  V-->>U: Saved readback or actionable error
```

| Actor inventory / path | Postcondition |
|---|---|
| U Actor, V Adapter, C Validator, S Store / happy | All visible views bind the same accepted revision; save status requires readback. |
| Alternate: text temporarily invalid | C retains last valid projection; V retains current draft and diagnostic. |
| Error: S rejects expected revision | C publishes no accepted projection; U sees recoverable conflict. |

**Diagram BE-D1** · Class: Data flow · Notation: flowchart LR · Version: 2. Every representation enters one semantic path.

```mermaid
flowchart LR
  d_input["Four format drafts · Producer / text or edits"] -->|"bounded decode"| d_syntax["Syntax and source map · Router / parser"]
  d_syntax -->|"validate profile"| d_ir["Program IR · Consumer / transient model"]
  d_ir -->|"source patch plus digest"| d_commit["Accepted source · Store / workspace"]
  d_commit -->|"derive same revision"| d_views["Four views · Consumer / projection"]
```

| Inventory / journey | Contract |
|---|---|
| d_input, d_syntax / j_edit | Raw text or typed block patch; limits before decode; original bytes retained. |
| d_ir, d_commit, d_views / j_verify–j_reuse | Valid IR → fenced commit → derived views; no direct view-to-view writes. |

**Diagram BE-H1** · Class: Orchestration / harness flow · Notation: flowchart LR · Version: 2. Deterministic harness; no AI pipeline or model calls.

```mermaid
flowchart LR
  h_dispatch["Edit coordinator · Dispatcher / generation"] -->|"one bounded request"| h_parse["Native parser · Executor / worker"]
  h_parse -->|"candidate and diagnostics"| h_check["Equivalence check · Observer / validator"]
  h_check -->|"valid and current only"| h_apply["Source transaction · Consumer / adapter"]
  h_check -->|"invalid or stale"| h_retain["Retained draft · Store / recovery"]
```

| Inventory / journey | Bound and circuit breaker |
|---|---|
| h_dispatch, h_parse / j_edit | One in-flight request/document; superseded work cancels; ≤1 s hard worker deadline. |
| h_check, h_apply, h_retain / j_verify | No automatic repair/retry; one candidate validation, reject on mismatch; tokens = 0. |

**Diagram BE-T1** · Class: Runtime topology · Notation: flowchart TB · Version: 2. Local trust boundaries and residency.

```mermaid
flowchart TB
  subgraph t_browser["Browser UI boundary · local device"]
    t_ui["Workspace panes and library · Producer / UI"]
    t_coordinator["Edit coordinator · Router / adapter"]
    t_store["Workspace source · Store / local persistence"]
  end
  subgraph t_worker["Worker boundary · local device"]
    t_core["Parser and codecs · Executor / pure core"]
    t_run["Existing bounded runtime · Executor / explicit run"]
  end
  t_ui -->|"typed edit"| t_coordinator
  t_coordinator -->|"postMessage parse"| t_core
  t_core -->|"validated candidate"| t_coordinator
  t_coordinator -->|"conditional source write"| t_store
  t_coordinator -->|"authorized Run only"| t_run
```

| Node inventory | Lane / connection / data residency |
|---|---|
| t_ui, t_coordinator, t_store | Runtime consumers of a delivered candidate; sync edits and async persistence; same device. |
| t_core, t_run | Separate worker responsibilities; versioned message contracts; same device; no network dependency. |

Build dependencies are acyclic: syntax/types → program codecs/validation → workspace adapter → pane/tool consumers. The existing evaluator consumes the same syntax owner through its preserved API. Runtime request/reply edges do not imply circular module imports. New pure modules must not import UI, storage, transport or effect authority. Keep the feature local. A7 authorizes the hierarchy/disclosure baseline and its Block-specific assembly presenter; shared catalog helpers already exist in G12.

## TAD — invocation, ecosystem and delivery boundaries — reference implementation

| Capability / route | Current support / authority | Proposed change / check |
|---|---|---|
| Workspace UI / Block control | Present in #1230; visual successor uses readable program cards and horizontal desktop projection widths | T6/T8 through same source owner; full V1–V5 remain open |
| FloatingPanel / Block library | Present in #1230; visual successor adds category tones and native code previews | T10 discovery plus T8 explicit insertion; full V7 remains open. No command/tool identity or remote fallback. |
| Headless core / parse, encode, prepare | Supported subset in `pythonParser.ts`, `programCodec.ts` and `blockLibrary.ts`; zero new tokens/network/effects | Same schema and limits as UI; full V2/V3 matrix remains open |
| Local learning / `/python.learning @canvas #learning` | Existing inspect/control tools `agentic-graph.inspect_local_python_learning` and `agentic-graph.control_local_python_learning`; bound to current document/run | Keep identifiers/authority; accepted program source only; V5 |
| Conversion / `/workspace.block @canvas #program` | Proposed, unregistered; must report unsupported today | One future schema/handler in G9, with inspect/prepare/apply operations; V6 |
| Browser tool / `agentic-graph.workspace_block` | Proposed WebMCP identity, not callable evidence | Read/prepare zero tokens; apply requires explicit capability, document/revision and receipt; V6 |
| Remote HTTP/MCP or other devices | No new endpoint in MVP | Defer transport until native registration, authentication and parity checks; no permissive fallback |

The register above is the only J1 route declaration; catalog updates occur in the route owner in a later admitted implementation scope. Developer path: discover declared version → rehearse fixtures locally → inspect → prepare diff → authorized apply → consume revision/diagnostic event → reconcile rejected writes → export recovery → retire only with migration/readback checks. Discovery is not authorization.

| Participant / value exchange | Owner/interface and trust boundary | Evidence/gap and cost/exit |
|---|---|---|
| Learner/user / understandable edits | G1–G5, local file permission | Source owners exist; usability unmeasured; local export and deletion. |
| Tutor/buyer / reusable exercise and less support | G6–G8; optional paid preparation service | Demand unvalidated; no personal data collection required; editable source handoff. |
| Maintainer/developer / bounded extension | G1–G13, versioned source contracts | No new supplier/license; dependency audit needed before implementation release. |
| Agent / inspect or prepare bounded change | G9; read-only default, separate apply authority | New route unsupported; zero serving tokens; no network required. |
| Assurance/operator / verify and recover | V1–V7 and source receipts | Independent checks required; no claim of legal certification. |

**Diagram BE-L1** · Class: Lane & deploy boundary · Notation: flowchart LR · Version: 2. Source and runtime effects remain separate.

```mermaid
flowchart LR
  subgraph l_author["Authoring lane"]
    l_spec["Reviewed source · Producer / scoped lane"]
  end
  subgraph l_mirror["Mirror lane"]
    l_artifact["Generated artifact · Store / exact source"]
  end
  subgraph l_delivery["Delivery lane"]
    l_runtime["Verified runtime · Consumer / selected environment"]
  end
  l_spec -->|"closed until protected integration"| l_artifact
  l_artifact -->|"closed until candidate authorization"| l_runtime
```

| Boundary / inventory | Trigger and actor | Mechanism / required evidence | State and recovery |
|---|---|---|---|
| Authoring → integrated source / l_spec | Scoped source release by release owner | OS RELEASE plus repository Integration Gate; exact candidate/check/merge receipts | #1230 passed its provider gate but remains open; visual successor needs its own exact candidate. Source revert through owner. |
| Source → mirror / l_artifact | Product release owner after integration | Existing build/sync controllers and exact source/artifact identity; no hand-edited mirror | Closed; retain predecessor artifact. |
| Mirror → delivery / l_runtime | Candidate-specific human production authorization | `.github/workflows/release.yml`, [core release](../production-core-runtime-release.md), live readback and [rollback baseline](../production-rollback-baseline.md) | Closed; no deployment authority in this task. Exact retained predecessor plus authorized rollback/readback. |

Human gate: production environment authorization only when pursuing production; no additional approval is required for this authorized document. Hosting and edge variants remain deferred; free hosting is not a FOSS claim. Browser/local conversion costs $0 incremental provider spend, while existing hardware, electricity, labor and support remain real but unmeasured TCO. Any future edge variant requires a separate free-only quota/license/account check and stops at exhaustion, never paid overflow.

## ADR — material decisions

All decisions consume J1 PRD and TAD, dated 2026-09-24; A1–A6 retain the bounded design choices and A7 records the implemented visual path at current candidate scope. Hard constraints: native conversion, source preservation, existing workspace ownership, local/offline operation and zero new dependency/spend. Selection took one design pass; at most three alignment cycles, 30 active minutes and 8,000 planning tokens per revisit. An unresolved contested decision remains open for independent evaluation.

| ID | Decision, candidates and non-compensatory comparison | Consequence / recovery / revisit |
|---|---|---|
| A1 | Extend existing pane policy/layout (pass) outranks standalone editor (fail duplicate-owner). Native DOM/CSS/SVG (pass) selected; added UI library (fail no-new-dependency). | More host integration work; lazy mount and reuse tokens. Disable Block while preserving source if UI regresses. Revisit only with measured unmet accessibility/performance requirement. |
| A2 | Extend G4 parser with concrete syntax (pass) outranks second handwritten parser (fail duplicate grammar). AST-only regeneration fails byte preservation; broad external parser fails native constraint. | Lexer/trivia work and compatibility tests are necessary. Retain old execution API; rollback source adapters, never discard authored files. Incremental parser work waits for latency evidence. |
| A3 | One source plus derived IR and fidelity envelope (pass) outranks six pairwise converters (fail drift/single owner) and four durable copies (fail source authority). | Program JSON differs from existing graph JSON. Plain source cannot preserve all document/view metadata; export must name that boundary. Unknown versions remain raw, not auto-migrated. |
| A4 | Revision-bound proposals with conditional persistence (pass) outrank last-write-wins (fail race safety). Whole-document opaque fallback (pass) selected over partial unknown-syntax edits (fail proof in MVP). | Conflicts require explicit resolution; supported scope is narrower than arbitrary Python. Revisit regional opaque edits only with losslessness and scope proofs. |
| A5 | Local deterministic codecs plus existing explicit runtime (pass) outrank hosted/model translation (fail native/offline/spend). | No AI interpretation of prose. First-load offline needs verified installed cache; otherwise disclose unavailable. Roll back feature chunk using retained candidate, not user storage. |
| A6 | Tutor preparation pilot (pass local/manual constraints) is provisionally nearer a first dollar than hosted subscriptions (fail MVP no-new-service) or marketplace sales (defer distribution evidence). | Price/channel WTP unknown; no payment action authorized here. Revisit after five buyer conversations; stop commercial expansion absent demonstrated need. |
| A7 | Reuse G12 header/search/body and G13 hierarchy/disclosure conventions, then fork Block-specific assembled cards and previews (pass), rather than duplicating catalog infrastructure or feeding invented trace spans to the run viewer (fail data authority). | `BlockProgramRow` and `blockVisualLanguage` remain presentation-only. Span tree retains metrics/trace semantics; native definitions and T8 own edits. V7 must preserve both consumers. Revisit only with observed usability or parity failure. |
| A9 | Reuse the native infinite-canvas controller/grid inside the existing workspace pane and reuse the shared text editor for program projections (pass); separate main-Canvas routing, layout variants and duplicated gesture/edit engines fail placement and ownership constraints. | Keep one embedded Block instance, one source transaction owner and an independent local camera. Invalid drafts preserve source; keyboard reveal must not scroll the clipped viewport. Revert the adapter and editor integration if lifecycle or isolation checks regress. |
| A8 | Refine geometry through shared native CSS and existing view adapters (pass) over replacing the visual system or adding a renderer/package (fail scope and dependency constraints). | One lazy stylesheet serves both visual consumers; content is not clipped, focus remains on the native row/button, and shape is decorative. Roll back the stylesheet/attributes if text or focus regresses; T8 transactions remain authoritative. |

There is no claimed numerical winner where evidence is incomparable: willingness to pay across segments and native full-reparse versus incremental performance remain unknown. A failed hard constraint cannot be compensated by a better score elsewhere.

## MVP — bounded delivery and verification plan

The MVP is R1–R5 and R7 for the declared procedural profile, not general-language parity. Existing Python lessons supply a reusable explicit-run surface; the feature adds a statement/expression editor, syntax fidelity, two program codecs and one transaction adapter. The first fixture is an original short assignment/conditional/loop program with comments; subsequent fixtures cover every node kind, numeric edge and failure branch. The bounded implementation evidence is recorded below; full acceptance remains open.

| Phase / ranked pain | Owner / reuse and smallest delta | Prerequisite / exit | Active estimate and hard caps / stop |
|---|---|---|---|
| S0 / P1–P3 proposal | Product engineer; G1–G13 → J1 | Authorized document → reviewed draft/check record | This update: 10–15 min estimate, 30 active min cap, 72 kB aggregate document cap; 1 Markdown file <600 lines, 0 runtime modules, same checkout; 0 serving tokens/$0 new spend. |
| S1 / P2 losslessness | Parser owner; G4/G6 → source spans, codecs, fixtures | J1 baseline and implementation grant → V2/V3 | Estimate 2–3 working days; cap 24 active hours, 8 new modules/80 kB source, 60k agent tokens; stop on unsupported semantic mismatch. |
| S2 / P1 visible editing | Workspace owner; G1–G3/G5/G11–G13 → lazy Block pane/library, shared binding and hierarchy presenter | S1 → V1/V7 and one four-view save | Estimate 1–2 days; cap 16 hours, 4 new modules/40 kB source, 40k agent tokens; no dependency additions. |
| S3 / P3 recovery/offline | Storage/validation owner; G7/G8/G10 → conditional write, recovery and cache closure | S2 → V4/V5 and R1–R5/R7 acceptance | Estimate 1–2 days; cap 16 hours, 4 new test/support modules/50 kB source, 40k agent tokens; stop on lost bytes/stale commit. |
| S4 / payer learning | Product owner; existing workspace demo and manual offer | V1–V5/V7 plus reachable consenting prospects → measured pilot | ≤5 sessions, ≤4 operator hours, no ad spend; calendar/payment waits have no ETA; recheck on prospect reply/receipt. |
| S5 / native shape refinement | Workspace owner; existing Block tree/library → shape cues | Explicit shape request and green visual predecessor → live geometry/interaction check | Expanded by the assembled-shape request: estimate 20 additional active minutes; cap 45 additional minutes, six production modules, one focused test module, ≤16 KiB added source and one plan update; no added package/service/spend. Provider waits have no ETA. |

| S6 / embedded canvas consolidation | Workspace owner; G14 → local viewport adapter and shared format editors | Explicit embedding/reuse clarification → live pan/zoom/reset/keyboard and source-preservation checks | Estimate 25 active minutes; cap 45 minutes, ≤12 touched production modules, ≤20 KiB added source, one plan update, zero new dependencies. Integration waits have no ETA; refresh on upstream drift. |

Every implementation file remains <600 lines; every emitted chunk <500 kB. Feature target: ≤120 kB added minified conversion/UI code, ≤40 kB gzip, and ≤2 kB gzip added to the initial shell. Envelopes ≤256 KiB; source remains ≤32 KiB; ≤4,096 nodes; ≤200 mounted blocks with windowing for larger programs. New lazy module count ≤12 production modules across S1–S3; per-phase estimates must be reduced if the aggregate cap would be exceeded. Benchmark drift requires replan, not silently larger limits. No new always-load guidance.

| VCC / invocable check plan | Cases and independent oracle | Evidence now |
|---|---|---|
| V1 / extend `markdownWorkspaceAbsoluteDocumentPanes.test.ts` plus browser smoke | Exact Python–Block adjacency; initial/persisted/split states; unrelated `.json`, Markdown, model files; desktop/mobile keyboard and touch | Partial: native pane-order fixture and local desktop/320 px browser; reopen and unrelated-doc matrix open |
| V2 / proposed `blockEditorSyntax.test.ts` with existing `pythonLearning.test.ts` | Every node/operator; comments/CRLF/Unicode; integer precision, negative floats, precedence, comparison chains, short circuit; scope/hole/type rejection. Golden trees and expected source bytes authored independently of codec. | Partial: focused native edit fixtures; full grammar matrix open |
| V3 / proposed `blockEditorRoundTrip.test.ts` | 12 directed pairs, four cyclic starts; no-op byte equality; changed-region/exterior preservation; duplicate JSON keys; conflicting fidelity; multiple fences; unsupported and limit boundaries. Deterministic generated corpus supplements golden fixtures. | Partial: four authoring origins and no-op bytes in focused tests; full pair matrix open |
| V4 / extend `workspaceSourceTextTransaction.test.ts` and proposed browser cases | Reverse worker completion; same request replay; file switch/delete; failed/quota write/readback; two tabs on same base; undo/redo; IME draft; stale export. Barrier-controlled storage checks, not just parser mocks. | Partial: generation fence fixture; two-tab/quota/replay matrix open |
| V5 / extend Python lifecycle/offline tests and browser runner | Edit never runs; explicit run shares digest; close Python with Block open; cancellation; fresh offline reload, failed cache closure, cold offline disclosure; heap/chunk/latency and accessibility checks | Partial: 320 px visual browser check; offline/performance/screen-reader matrix open |
| V6 / existing tool registry suite plus new contract cases | Read-only discovery, schema/version/bounds, explicit effect permission, prepare/apply digest, unsupported transport | Deferred |
| V7 / extend catalog, panel and mission regressions plus browser smoke | Exact Skills & Commands → Block library → Prompt Presets order in normal/minimized navigation; view normalization/cleanup; shared helper ownership; local search during unrelated remote failure; selection/preview never dispatch; explicit insert shares V2/V4 fencing/undo. Verify Span tree unchanged, hierarchy keyboard/ARIA, touch, 320 px, light/dark and reopen. Compare browser captures against native reference layout, not external assets. | Partial: local dark/light/320 px, keyboard hierarchy and compatible-target affordance observed; full regression matrix open |

Existing focused command for G4/G5 compatibility: `env TSX_TSCONFIG_PATH=canvas/tsconfig.json node --import tsx --test canvas/src/__tests__/pythonLearning.test.ts canvas/src/__tests__/pythonLearningLifecycle.test.ts canvas/src/__tests__/pythonLearningOffline.test.ts`. Register new checks in the repository-owned affected map before claiming V1–V7. Use `npm run ci:affected` and the native validation owner for final selection. Passing parse/round-trip tests alone does not prove Python semantics: add explicit expected runtime outputs and a local standard interpreter comparison for the shared pure subset when available; exclude lesson host calls. Do not require an interpreter download or executing untrusted imports.

| Demo beat | Time cap | Observable action / criterion |
|---|---|---|
| Hook | 20 s | Open original short exercise; show Python and adjacent Block, R1. |
| Probe | 40 s | Open adjacent Block library, search/select/insert a comparison through keyboard/touch; expand its program hierarchy, R2/R7. |
| Reveal | 60 s | Follow Block → Python → JSON → Markdown → Block; compare preserved comments and expected structure, V3. |
| Edit and recover | 100 s | Make invalid text, retain draft, fix it; reject a stale edit; explicitly run; R4/R5. |
| Close | 80 s | Save, disconnect and reopen same source; show readback, included export content and limits; R3/R5. |

Total ≤300 s. Every Must criterion appears in the demo; the demo does not substitute for its fixtures. Domain object = a revision-bound program document. Four maturity criteria (core functionality, theme alignment, technical integration, useful agentic experience) remain **unassessed** for this feature; no contiguous 1–5 level is claimed. Blocking owners are the pane, syntax, transaction and verification owners respectively; next assessment follows V1–V5/V7.

## GTM — payer experiment and discovery projections

J1's initial segment is English-speaking independent tutors/training operators already willing to use a browser-local exercise; geography is unspecified and must be recorded during outreach. Why now is a source-grounded opportunity: the native learning runtime and Editor Workspace already exist. Market timing, demand and economic savings are hypotheses, not research findings.

| First-dollar rank / stream | Offer hypothesis and prerequisites | Evidence / continue–pivot–stop |
|---|---|---|
| 1 / manual exercise preparation | Prepare and hand over one editable offline exercise; test a **US$1-equivalent** optional pilot price after free demonstration. No new subscription or payment integration. | Mechanism-proven: no; demand-validated: no; recognized revenue: unverified; collected cash: unverified. Record consent, agreed currency/price, lawful existing collection route and fulfillment separately. |
| 2 / reusable exercise pack | Several original exercises with source/fidelity exports; only after rank-1 acceptance and repeat requests. | Deferred; require ≥2 repeat-use requests and support-time evidence. |
| 3 / team/hosted service | Collaboration or hosting offer | Won't this increment; native MVP and free-only supplier constraints do not establish viable service economics. |

Pilot funnel: five consenting prospects → timed demonstration → independently completed edit/save → optional priced offer → verified collection → accepted source handoff → seven-day reuse check. **Continue** if ≥3/5 complete without assistance and ≥1 accepts and pays the explicit offer; **pivot** interaction if ≥2/5 cannot finish; **stop paid expansion** after five sessions with no priced acceptance or any unresolved data loss. Tiny samples guide the next experiment, not demand-proven scale. No outreach or payment is sent by this task.

Acquisition is existing direct contacts, conditional on reachability; no contact list is evidenced. Alternatives are manual source editing, duplicated files and doing nothing. Support uses recoverable source exports and bounded diagnostic summaries, never full student content by default. One operator handles the pilot; hiring/automation triggers only after measured recurring support exceeds four hours/week. IP owner reviews original code/exercises and existing license notices; entity, jurisdiction, tax, refund/consumer obligations and child-data consent remain research gaps owned by the commercial operator before any real sale/data collection.

| Assumption / source and disposition, 2026-09-24 | Model input and next evidence |
|---|---|
| F1 / user-requested local/free constraint, design target | Incremental provider/token serving cost = $0 with no network/model path; verify V5. Existing device/electricity cost unknown. |
| F2 / pilot hypothesis, unvalidated | Price p = US$1-equivalent; reachable buyers n unknown; conversion c unknown; fulfillment/support minutes h unknown. Record quoted currency and actual collection, never assume fees zero. |
| F3 / execution-resource gap | Labor rate w, authoring token usage/cost and implementation cost unknown; collect existing execution receipts and actual operator time. |
| F4 / discovery market gap | Bottom-up SAM = reachable tutors × relevant exercises/year × accepted price; independent top-down method = published regional tutor/training count × relevant-use share × annual spend. Inputs and citations absent; no numeric TAM/SAM/SOM claim. |

Reduced financial sketch, **incomplete and not audience-ready**: forecast fulfilled sales q = n×c; earned revenue = q×p only after the applicable fulfillment/accounting basis; collections are separate actual receipts. Contribution = earned revenue − payment fees − h×w − serving cost. Cash end = opening cash + collections − paid costs; receivables end = opening receivables + earned revenue − collections; equity changes by recognized profit and contributions; cash/receivables/liabilities/equity must reconcile. Base/downside/upside vary n,c,h and collection delay, but no numbers or runway are invented without opening cash and cost inputs. Cash floor = $0 incremental provider budget; stop before any paid supplier effect. Bootstrap from existing local resources; funding ask = none; capitalization/dilution = not applicable for this increment.

Discovery projections at J1: **Pitch Deck** (five-slide register, 3-minute maximum): pain/segment 30 s (PRD), current owners 30 s (G1–G13), proposed Reveal 60 s (V3 demo, labelled unbuilt), pilot economics 40 s (F1–F4), ask for pilot feedback 20 s (GTM). **Business Plan** = this segment/offer/funnel/operations/risk record, with market/legal gaps visible. **Financial Model** = formulas and assumption register above; linked numeric statements and scenarios deferred until observed inputs. These are planning projections, not investor or sales-ready artifacts.

## Coverage, alignment and next owner action

Every row joins J1 at revision 1.2.0. Coverage disposition is not readiness. `covered` means the domain has an explicit decision and source/gap; it does not prove market or runtime facts.

| Domain | Decision / exact J1 source section | Accountable owner / evidence or gap / next check |
|---|---|---|
| C01 | covered / PRD | Product owner; pain unvalidated; five observations. |
| C02 | deferred / GTM F4 | Commercial owner; market inputs/citations absent; collect two methods before market claim. |
| C03 | covered / ADR A6, GTM | Product owner; price/channel hypotheses; record priced pilot. |
| C04 | covered / PRD R1–R5/R7, T10 | Workspace owner; native layout/visual reuse; timed/mobile/accessibility V1/V5/V7. |
| C05 | covered / TAD T1–T8/T10 | Engineering owner; G1–G13 inspected; V2–V4/V7. |
| C06 | covered / failures, T9 | Validation owner; no runtime proof; limits/privacy/offline V2–V5. |
| C07 | covered / ADR A1–A7 | Architecture owner; native decisions, performance unknown; recheck at prototype. |
| C08 | covered / MVP | Validation owner; full slice proposed; V1–V5/V7 before dev-proven. |
| C09 | covered / GTM funnel | Commercial owner; prospects/payment/reuse absent; five-session pilot. |
| C10 | covered / GTM operations | Maintainer; single-operator capacity assumed; support-time log. |
| C11 | deferred / GTM obligations | Commercial/IP owner; jurisdiction and obligations unknown; review before sale or student-data collection. |
| C12 | deferred / GTM F1–F4 | Finance owner; no sourced numeric statements/scenarios; obtain receipts/costs before viability claim. |
| C13 | covered / GTM bootstrap | Product owner; no funding ask; revisit only after paid/repeat signal. |
| C14 | covered / execution evidence below | Release owner; authoring lane/check receipts only; exact release gate. |
| C15 | deferred / discovery projections | Product owner; reduced drafts only; regenerate with observed inputs before audience handoff. |
| C16 | covered / GTM thresholds, next action | Product owner; no pilot results; successor context after prototype/pilot. |

Dispositioned: **16/16**; covered applicable domains: **12/16**; deferred: **4**; not-applicable: **0**. Deferral reasons/dependencies and revisit triggers are explicit above. Authoring-rule and diagram-rule coverage ratios require the independent conformance audit; no exhaustive compliance percentage is claimed from these domain counts.

| Finding Type | Severity | Rule anchor | Artifact reference | Evidence excerpt | Remediation |
|---|---|---|---|---|---|
| pain-point-not-validated | major | pain-point-to-feature-mapping#3 | J1 PRD | “All pain and price claims remain unvalidated.” | Specification change: product owner adds observed prospect evidence before baseline. |
| missing-economics-metric | major | time-to-value#2 | J1 metrics | “Unmeasured; manual editing exists” | Locally reproducible check: timed clean-device prototype before specification-baseline sign-off. |
| market-size-single-method | minor | venture-record-pitch-deck-business-plan--financial-model#6 | J1 F4 | “Inputs and citations absent” | Specification change: commercial owner supplies two independent sourced estimates before audience claim. |
| scenario-set-incomplete | minor | venture-record-pitch-deck-business-plan--financial-model#5 | J1 financial sketch | “incomplete and not audience-ready” | Specification change: finance owner produces linked numeric scenarios once inputs exist. |

No runtime criterion is marked satisfied. This targeted finding register is not an exhaustive independent alignment verdict; unchecked rule families have no asserted zero count. Baseline remains open until the independent mechanism supplies full rule coverage, typed findings and zero blockers. Limit alignment to three cycles; two consecutive cycles with no blocker reduction stop dependent progression. Routine document completion remains authorized.

Next bounded validation action after this visual slice: the parser and transaction owners complete the independent V2–V5 fixtures and offline/mobile failure matrix; cap four active hours, two changed owner files plus two fixture files, no packages, 32 KiB fixture source. Exit: exact no-op bytes and semantic equivalence for assignment/conditional/loop plus explicit unsupported-source retention. If proof fails, retain source and revise A2. Product owner can independently gather pain evidence.

## Execution evidence and handoff — reference implementation

Current authoring lane: `agent/device-0232231d4a19/block-editor-shapes` in the same requested checkout. Native `successor` preserved published visual head `f5107ef8aae43aa5f42b1fe43e811734bf65b9b5`, whose PR [#1231](https://github.com/huijoohwee/agentic-graph/pull/1231) passed its Integration Gate. START readmitted the Block presentation, library and document paths in `.workspace/.artifacts/workflows/a903ceb02cf9c0f2394cd7c1/6170fd0b57757c57bdf37addc1579f2d1dc3f82d5358f30e6956b3eb1e0bf504/manifest.json`. The mission retains its original committed offline-learning planning parent; J1 records this feature increment. Frontmatter records the protected base, not feature readiness. E1–E7 retain historical evidence; E8 records native shapes and assembled presentation; E9 records the embedded canvas consolidation. Two affected runs stopped on upstream-base drift after their browser smoke passed; the lane then merged the new protected base recorded above and requires a fresh exact-candidate gate.

| Evidence / surface | Observed result | Scope and limitation |
|---|---|---|
| E1 / OS `npm run check`, source f8d00dd | Pass: 4/232 affected/sentinel suites, 28 tests, evaluators exit 0 | OS governance evidence only; not feature/runtime parity. |
| E2 / OS `npm run evals`, same source | Pass: readiness 97 Markdown files, document/module budgets | Reuses runtime owner; no copied evaluator. |
| E3 / Graph document checks | Pass: YAML/joins/links/16 domains/restricted-reference checks, diff/hygiene and affected CI (5/5 owner partitions) | Prior documentation selection only; exact-lock dependencies reused through an ignored local symlink. |
| E3a / guideline diagram check | Guideline diagram checker: no findings; 6 diagrams, 5 projecting; 22 nodes, 15 edges, 5 clusters | Parse-only; no browser rendering or full guideline-conformance proof. |
| E4 / predecessor source RELEASE | PR [#1226](https://github.com/huijoohwee/agentic-graph/pull/1226), head `a2034aa1c58a3ea8b3c0ee888fad0fe10ef1f377`: open, Integration Gate succeeded; no merge receipt at inspection | Historical source publication only; successor publication requires its own exact-head checks. |
| E5 / product runtime, deployment and payer evidence | Partial: #1230 passed focused native tests and Integration Gate; current successor passed a local canvas check and live DEV visual interactions | Full V1–V7, protected merge, deployment, payment and repeat demand remain absent. |
| E6 / J1 revision 1.1.0 document update | Pass: G11–G13 grounding, YAML/joins/links/budgets, restricted-reference check, diagrams, hygiene and affected CI (5/5 documentation partitions) | One Markdown file; no runtime/UI implementation, browser rendering or new feature test claim. |
| E7 / J1 revision 1.2.0 visual successor | DEV `npm run dev` at localhost: dark/light and 320 px views; hierarchy disclosure, arrow/Enter selection, target-bound library preview and compatible-position Insert enablement observed. Native check passed before final diff; affected gate and provider publication are separate. | `BlockProgramRow.tsx`, `blockVisualLanguage.ts`, `programPaneLayout.css` and existing pane/library owners; no external visual or parser dependency. |
| E8 / J1 revision 1.3.0 shapes and assembly | Live DEV dark/light desktop and 320 px selection verified; a temporary loop inserted through Block library enclosed its body, collapsed/expanded independently, and was deleted to restore the original four source statements. Canvas type/runtime check and 13 focused native editor/workspace/assembly tests pass, including branch order, terminal ownership and source-preserving edits. | Existing canvas and native parser/transaction owners; six production modules and one focused test module in this successor, zero dependencies. No program was run during this check; source changes invalidated the prior run. Final affected/provider receipts remain exact-candidate evidence. |
| E9 / J1 revision 1.4.0 embedded consolidation | Live DEV clean-tab checks: exactly one Block infinite canvas under Split view; pointer pan, wheel zoom, 100→80→100 percent controls, reset and End-key reveal work while main Canvas stays at 100 percent. Python/Block/JSON/Markdown order and shared Monaco surfaces verified. Invalid JSON draft rejected with source retained; reset restored projection and original four Python statements. 13 focused tests and canvas type/runtime check pass locally. | Uses G14 directly; removes the custom layout stylesheet, adds no package. Latest adapter mobile/pinch and complete offline matrix remain open. Exact-candidate affected/provider result is recorded separately; earlier runs were blocked by base drift. |

ADLC ledger: one checkout/document, zero new runtime dependencies/services; actual authoring tokens/cost unavailable. OS check receipt: `.workspace/.artifacts/agent-observability-economy-20260916/validation-60684fc3ab048501fad756db/last.json` in the parent workspace. Provider wait: preserve authored bytes; recheck on gate/provider evidence change. Run the product lifecycle check before handoff; cleanup needs an exact eligible-target receipt.

### 2026-09-24

| PRD-TAD-ADR-MVP-GTM | CID | RAO | Updated Date |
|---|---|---|---|
| `NATIVE-BLOCK-EDITOR-001@1.2.0` | C: G1–G13 and published runtime #1230 at pinned Graph sources plus explicit native visual instruction · I: improve legibility of the four-view workspace and mobile library · D: fork program presentation from shared Agent Mission guides, add category cards/previews and readable pane widths while retaining native source authority. | R: Editor Workspace product engineering · A: Product engineer checks visual/keyboard/mobile behavior and updates this joined plan · O: one bounded visual successor with local evidence and open full-suite gaps · check: DEV UI, canvas check, affected source gate and protected provider gate | 2026-09-24 |
| `NATIVE-BLOCK-EDITOR-001@1.3.0` | C: green visual predecessor #1231 and explicit individual/assembled geometry requests · I: make step connections, nested values and body ownership legible · D: preserve native identity and canvas; assemble source-derived shapes with no copied assets or dependencies. | R: Editor Workspace product engineering · A: refine the native presenter, check branch semantics and live light/dark/mobile/keyboard behavior · O: bounded visual successor; check: 13 focused tests, canvas check, affected gate and exact provider result | 2026-09-24 |
| `NATIVE-BLOCK-EDITOR-001@1.4.0` | C: explicit reuse and workspace embedding clarification · I: retain one editor experience and independent Canvas navigation · D: embed the native viewport engine/grid, reuse standard JSON/Markdown editor surfaces, remove the custom layout variant. | R: Editor Workspace product engineering · A: check camera isolation, keyboard reveal, shared-editor draft rejection and exact candidate gates · O: one embedded native Block canvas; check: E9 plus affected/provider receipt | 2026-09-24 |

[guideline]: https://github.com/huijoohwee/huijoohwee.github.io/blob/987dd1d1e6d25761f2279d49a53c40a210466679/guidelines/prd-tad-adr-mvp-gtm-guidelines.md
[cid]: https://github.com/huijoohwee/huijoohwee.github.io/blob/987dd1d1e6d25761f2279d49a53c40a210466679/guidelines/cid-guidelines.md
[templates]: https://github.com/huijoohwee/huijoohwee.github.io/blob/987dd1d1e6d25761f2279d49a53c40a210466679/guidelines/prd-tad-adr-mvp-gtm-templates.md
[planning]: https://github.com/huijoohwee/huijoohwee.github.io/blob/987dd1d1e6d25761f2279d49a53c40a210466679/guidelines/prd-tad-adr-mvp-gtm-planning-record.md
[verification]: https://github.com/huijoohwee/huijoohwee.github.io/blob/987dd1d1e6d25761f2279d49a53c40a210466679/guidelines/prd-tad-adr-mvp-gtm-verification.md
[diagrams]: https://github.com/huijoohwee/huijoohwee.github.io/blob/987dd1d1e6d25761f2279d49a53c40a210466679/guidelines/prd-tad-adr-mvp-gtm-diagram-canvas-render.companion.md
