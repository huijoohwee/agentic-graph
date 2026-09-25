---
title: "Reference implementation — Workspace Program Pack adapter"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.1.0"
revision: "0.1.0"
date: "2026-09-25"
lang: "en-US"
owner: "Graph conversion owner"
continuity_id: "GRAPH-WORKSPACE-PROGRAM-PACK-001"
prd_revision: "0.1.0"
tad_revision: "0.1.0"
adr_revision: "0.1.0"
mvp_revision: "0.1.0"
gtm_revision: "0.1.0"
projection_revision: "0.1.0"
local_rung: "undocumented"
delivered_rung: "undocumented"
lifecycle_status: "proposed"
lane: "authoring"
universal_scope: false
worktree_id: "device-0232231d4a19--workspace-program-pack"
agent_id: "codex-workspace-program-pack"
source_revision: "e113e0e5fc8ec158ba15fa4dfc3e22b1b1a4d56e"
load_policy: "on-demand"
runtime_readiness_policy: "fail-closed"
agenticOsCanvasRenderMode: "2d"
agenticOsCanvas2dRenderer: "d3"
---

# Reference implementation — Workspace Program Pack adapter

This bounded supplier artifact joins `GRAPH-WORKSPACE-PROGRAM-PACK-001@0.1.0` (J1) across all five roles. It consumes the native [Block Editor specification](prd-tad-adr-mvp-gtm-block-editor.md) at the exact source revision above. Commerce owns the sellable offer and the joined [A2MCP product plan](https://github.com/huijoohwee/agentic-commerce-os/blob/agent/device-0232231d4a19/workspace-program-pack/docs/prd-tad-adr-mvp-gtm-a2mcp-services.md), `PRD-TAD-ADR-COMMERCE-A2MCP-001@0.3.0` (C1). That candidate locator must be replaced by the native release receipt for immutable consumption. Graph owns conversion, existing Editor Workspace and Canvas; this adapter does not make a second marketplace, parser, editor, registry or payment ledger.

Authoring contract: [guideline 3.3.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/ae3e4091d8ebef554e0ed416d7c62a11e7efb0ed/guidelines/prd-tad-adr-mvp-gtm-guidelines.md). C1 carries the business coverage, findings, venture projections and public-effect boundaries; this supplier module carries its implementation/evidence delta. Neither document claims completed whole-guideline evaluation or production readiness.

## PRD — reference implementation

Context: the user selected Python/Block + Canvas as the first service deliverable and requested implementation/live UI. Intent: obtain portable, consistent files from a small supported program. Directive: the Graph conversion owner exposes one bounded deterministic conversion contract, consumed by Commerce. Outcome: V1–V3 local evidence plus explicit delivery gaps; no arbitrary execution. `/change #workspace.program-pack @codex` declares this lane intent, not a runtime invocation route.

User: tutor, learner or occasional script author. Buyer hypothesis: tutor preparing reusable examples; current workaround manually assembles code, structured representations and diagrams. Pain, WTP, savings and market size are unvalidated. Current price is free; a future $1 test belongs to C1. Must: source fidelity, four files, visible rejection and native Canvas compatibility. Won't this increment: general Python/packages, evaluation, workspace writes, remote browser control, customer accounts, automatic publication/payment or new dependencies.

| Criterion / Given → when → then | VCC / constraints | Design / evidence |
|---|---|---|
| R1: Supported source → convert → four representations preserve original bytes | V1: native codec tests prove Python/JSON/Markdown round trips, exact file and artifact digests, repeat determinism | T1/T2, A1, E1/E2 |
| R2: Invalid, stale or excessive source → convert → explicit bounded refusal without execution | V2: unknown fields, digest mismatch, unsupported imports, 32 KiB source, 256-node Canvas and result limits; no output on error | T1/T3, A1/A2, E1 |
| R3: Generated Canvas file → local native import → same program structure | V3: native D3 topology has all 21 expected program nodes and 20 program edges, no unresolved edges for the recorded example | T2/T4, E3 |
| R4: Exact protected candidate → authorized host → deployed identity and recovery proof | V4: native integration/deploy receipts, free quota, pinned bundle and per-effect authority; local/browser proof is insufficient | C1 release boundary, open |

Target TTV: one create action after source entry; conversion ≤5s hard child deadline and no model tokens. Observed native sample is 194 bytes with four files; statistically meaningful p95, phone runtime latency and buyer time savings are unmeasured. Service portability is demonstrated by the local Commerce UI/MCP; offline use requires the local process already running, not a hosted availability promise.

## TAD — reference implementation

Grounding G1: exact base `e113e0e5fc8ec158ba15fa4dfc3e22b1b1a4d56e`; `canvas/src/features/python-learning/pythonParser.ts::parseLearningPython` and native limits; `canvas/src/features/block-editor/{programCodec,blockLibrary}.ts` own reversible encodings and ordered tree. These exports are imported within Graph only. The consumer receives a compiled pinned module and a versioned protocol; it never imports sibling source.

| Component | Reuse / single responsibility | Contract/check |
|---|---|---|
| T1 `canvas/src/features/block-editor/workspaceProgramPack.ts` | Extend native converter with a pure envelope; reuse parser, codecs, tree | `createWorkspaceProgramPack`, strict input and exact source round-trip; V1/V2 |
| T2 native `programCodec.ts`/`blockLibrary.ts` | Direct reuse, unchanged domain semantics | `workspace-program/v1`, `procedural-python/v1`, stable tree → Mermaid projection |
| T3 `mcp/workspace-program-pack.ts` | New contract-only one-request stdin/stdout transport | UTF-8/JSON envelope ≤96 KiB, 4.5s input deadline, typed stderr, result ≤220 KiB; consumer adds 5s kill deadline |
| T4 existing local file import/D3 Canvas | Retain native owner | Generated Markdown frontmatter selects 2D D3; no new rendering library or workspace authority |

Request keys are exactly `schema`, `title`, `source`, `sourceDigest`; schema `agentic-graph.workspace-program-pack/v1`. SHA-256 is over UTF-8 text. Title is ASCII 1–80 characters, beginning alphanumeric and continuing letters/digits/space/dot/underscore/hyphen. Source ≤32,768 bytes; native grammar and tree bounds also apply. Unknown fields, stale digest, unsupported grammar or non-exact native round-trip fail. No request path, URL, shell command or package is accepted.

Response keys, in canonical serialization order: `schema`, `owner`, `languageProfile`, `title`, `sourceDigest`, `execution`, `roundTrip`, `canvas`, `files`, then `artifactDigest`. Owner is `agentic-graph`; execution `not-executed`; roundTrip `exact`; Canvas `{format:mermaid,nodes,edges}`, edges=nodes−1 and ≤256 nodes. Files in order: `program.py`/`text/x-python`, `program.json`/`application/json`, `program.md`/`text/markdown`, `canvas.md`/`text/markdown`. Each file contains name/mediaType/content/UTF-8 bytes/SHA-256 digest. Artifact digest hashes `JSON.stringify(unsignedEnvelope)` in owner order. Consumers verify this exact contract, not generic sorted-key JSON.

Canvas labels encode punctuation/Unicode as Mermaid numeric entities; only owned node/edge syntax is emitted. Its program tree is a structural view, not an execution trace. Native D3 adds document/section/anchor/code metadata, so total native graph node count can exceed the program node count. No source file is persisted by T1/T3; output is stdout. The consumer owns explicit artifact storage/download and cancels/kills children on timeout/disconnect. The parser never invokes the Python evaluator. Heap/process isolation is a consumer bound, not a general OS sandbox guarantee.

| Invocation | Supported / boundary |
|---|---|
| Pure export + stdin/stdout | Implemented; source-bound conversion only |
| Commerce `commerce.workspace.program-pack.create` | Consumer-owned HTTP/MCP and optional WebMCP projection using this protocol; no second Graph MCP registry |
| `/workspace.program-pack #workspace.program-pack @source` | Reserved intent notation; no parser or route implementation claimed |
| Existing Graph browser tools | Native inspect/import/render proof only; retain browser-local permissions and scope |

Five flows: user provides source → reviews four files; consumer validates → child parses/round-trips → result validates; source → disposable AST → encodings/digests; failure/abort → no accepted result → retry explicit; value is a free artifact, with no settlement path. Diagram D1 version1 is the component/data projection of these flows; U is caller, C is consumer, G is the sole conversion owner, F is ephemeral output. Native diagrams require a real projection check; E3 proves generated output, not an independent full projection audit of this document.

```mermaid
flowchart LR
  U["Source and digest"] --> C["Commerce contract adapter"]
  C --> G["Native Graph conversion"]
  G --> F["Four files and digests"]
  F --> U
```

## ADR — reference implementation

A1 accepted: direct native codec reuse plus a versioned adapter is the smallest change. Copying a parser duplicates ownership; browser automation as fulfillment depends on mutable workspace state; hosted general execution expands scope and cost. Preserve native semantics and explicit unsupported-input failure. Revisit on profile changes or demonstrated customer need; rollback the consumer to its previous approved bundle pin without data migration.

A2 accepted: bounded conversion is free and produces no executed result. Keep request and output identities explicit; Commerce pins immutable compiled bytes, caps four active children/60 calls per minute and refuses inherited credentials. No new shared package or persisted representation is warranted. Exit: stop the owned consumer process and remove only the new offer route. Publishing an adapter does not grant remote execution, marketplace listing or financial authority.

## MVP and execution checkpoint — reference implementation

START admitted lane: `agent/device-0232231d4a19/workspace-program-pack` from G1. Four files, two new runtime modules, ≤20 KiB implementation/tests+document target refreshed to 28 KiB after full checkpoint. Portfolio cap: two 45-minute sprints, 14 files/six runtime modules, 64 KiB code/tests and Commerce owner document ≤80 KiB; files <600 lines/chunks <500,000 bytes. No dependencies or paid resources added; serving tokens0. Actual authoring tokens/time/device cost unknown. Current writable sources proceed through native RELEASE; publication, protected merge and deployment are distinct evidence.

| Evidence / surface | Named check / observed result |
|---|---|
| E1 / development | Node test runner with locked tsx + canvas tsconfig: `workspaceProgramPack.test.ts` and `blockEditorNative.test.tsx`, 15/15 pass (2026-09-25). Four new tests cover exact CRLF/fidelity/digests, refusals, markup escape/determinism and bounds/non-execution. |
| E2 / local integration | Locked esbuild bundle: 41.1 KiB, SHA-256 `03804bb127b8f83a87d1eff7472d065c8974d307fcac17f75899bf2c862de890`. Real Commerce MCP client and REST return identical native four-file result; source digest `1a42c0be10fda56d39f670c3dd0d4dad5d68793e45593283a4cc67b301e34da1`, artifact digest `b254cb2427dff5f1ac389f1155cfc16c215e799c59cd2e6049ae9ab27ceb8718`. |
| E3 / existing delivery UI, browser-local document | Import actual `canvas.md` into `https://airvio.co/agentic-graph/`; native WebMCP topology: active D3, 21 MermaidNodes,20 pointsTo edges,27 total nodes/48 total edges,0 unresolved. This proves existing renderer compatibility, not deployment of this new adapter. |
| E4 / local Commerce UI | `npm run dev -- --workspace-pack`, successful create, four previews, invalid Python refusal,390px with no horizontal overflow. Local 16-second screen recording retains actual browser frames slowed for review; Commerce browser WebMCP unavailable and download event unobservable in the tested host. |

Local evidence locator: workspace `.workspace/.artifacts/workspace-program-pack-20260925/` contains `mcp-proof.json`, `graph-canvas-proof.json`, four files, screenshots, frame timestamps and `workspace-program-pack-demo.webm`. No artifact here is a public listing or payment receipt. Whole conformance evaluation and V4 remain open; local/delivered rungs stay undocumented pending those gates. Native publication records exact candidate checks in its receipt, not this pre-publication prose.

Reproduce with the lane's locked native dependencies: `npx --no-install esbuild mcp/workspace-program-pack.ts --bundle --platform=node --format=esm --target=node22 --tsconfig=canvas/tsconfig.json --outfile="$GRAPH_PACK_ADAPTER"`. Set the consumer's `GRAPH_PACK_ADAPTER_SHA256` to the actual verified digest; run the Commerce profile documented in C1. A changed source/toolchain requires a new pin and conformance replay.

Next bounded action: native RELEASE for this exact lane, attach PR and inspect Integration Gate; owner engineering, completion check exact candidate receipt. Protected production remains blocked by the repository's human authorization boundary. Recheck on protected merge, deployment authority or contract drift; no external-wait ETA. Preserve unrelated canonical demo edits and park the lane before lifecycle verification. No source cleanup or production mutation is implied.

## GTM, projections and coverage — reference implementation

Commerce presents the offer; Graph supplies deterministic conversion. Free local fulfillment is mechanism evidence; paid demand and first-dollar collection are unproved. Rank this user-selected near-built pack ahead of speculative execution; observe five consenting buyer tasks and two $1 acceptances before payment scope. Stop/pivot after five failures to identify a useful repeat task. No outreach is authorized by this document.

Pitch projection J1: show source → verified four files → native Canvas, labelled local; no marketplace/revenue slide claim. Business-plan projection J1: supplier role and portable output consume C1's segment, alternatives, two-method market unknowns, retention/support, legal/IP/jurisdiction and capital records. Financial projection J1: revenue/collection0, new spend0, no model serving tokens, labor/account costs unknown; future $1 less actual fees/support must be positive before paid activation. Funding/hiring are deferred; owner product. These projections introduce no independent forecasts.

| Coverage IDs from authoring guideline | Exact source join / accountable owner / disposition |
|---|---|
| C01,C03,C04,C07,C08 | J1 PRD/ADR/MVP, Graph owner; bounded implementation with E1–E4 and explicit V4 gap |
| C05,C06,C10,C14 | J1 TAD/MVP and C1 TAD, engineering; data/effects/limits/recovery/lifecycle covered, external receipts open |
| C02,C09,C11,C12,C13,C15,C16 | C1 GTM/venture/coverage at0.3.0 plus J1 GTM, Commerce product owner; market, obligations, finance, capital and demand remain unvalidated/conditional, next action above |

Tracked finding: whole-service `unproven-claim` risk would be blocker if local conversion were described as deployed/paid acceptance; avoided by retaining separate rungs/evidence and unset public admission. This is a scoped supplier checkpoint, not a claimed zero-finding certification. Source tests establish their named assertions only; broader native Integration Gate and independent artifact evaluation remain separate.
