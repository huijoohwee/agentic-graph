---
title: "Reference implementation: Knowgrph and MiroMind API PRD/TAD"
schema: kgc-computing-flow/v1
id: "md:knowgrph-miromind-api-prd-tad"
doc_type: "Product and Technical Specification"
version: "0.3.0"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.api-reference.miromind"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/knowgrph-api-reference/knowgrph-miromind-api-prd-tad.md"
reference_repository: "https://github.com/huijoohwee/knowgrph"
reference_surface: "MainPanel > Integrations"
reference_lane_topology:
  authoring: "$GITHUB_ROOT/knowgrph"
  mirror: "protected candidate; no Evidence Reference attached"
  delivery: "configured published surface; no Evidence Reference attached"
tags: [prd, tad, miromind, integrations, mcp, chat, markdown, frontmatter, canvas]
---

# Reference implementation: Knowgrph and MiroMind API PRD/TAD

> **Scope**: Maintain `MiroMind API` in MainPanel `Integrations`, align MainPanel `MCP` guidance, and keep the existing browser-local chat -> workspace markdown -> canvas pipeline as the only downstream graph-application route.
> **Lens**: universal, neutral, upstream-first, no duplicate pipelines, no renderer forks, no legacy shims.
> **Repo truth**: shared `SettingsView` remains the owner for MainPanel `integrations` and `mcp`; frontmatter-first markdown remains the only canonical payload that applies to canvas.

---

## Document Map

| Section | Purpose |
|---|---|
| Part A | Product scope, user stories, acceptance criteria, guardrails |
| Part B | Owner map, runtime contracts, data flow, validation, deployment |
| Traceability | Story -> owner -> interface -> `/goal` |
| Checklist | Implementation and documentation guardrails |

---

## Reference implementation: Part A - PRD

### 1. Current Repo Truth

Knowgrph contains the source-owned core path that a MiroMind adapter must reuse:

- MainPanel `integrations` and MainPanel `mcp` are thin shells over the shared `SettingsView` owner.
- Shared settings/chat readiness already route provider, model, auth, and integration state through `useSettingsChatAssist` and normalized `integrationConfigsJson`.
- FloatingPanel Chat already owns the runtime chat surface and submit lifecycle.
- The prompt stack already layers a strict base KGC contract, packed graph/workspace context, optional selection/workspace prompts, and conversation history.
- `chatKnowgrph` already requires one frontmatter-first KGC markdown document as output.
- Validation, retry, recovery, finalize, workspace follow, and canvas apply already run on the saved markdown document.
- YAML frontmatter remains the single source of truth for canvas presets and downstream renderer/view state.
- Canvas view modes and 2D renderers already project from shared frontmatter and graph state; they must not become MiroMind-specific.

### 2. Problem Statement

Knowgrph has a repository-accurate MiroMind source baseline; no delivery result is attached.

Current source baseline:

1. MainPanel `Integrations` documents and exposes `MiroMind API` through the same shared settings owner used by other providers.
2. MainPanel `MCP` explains how MiroMind's optional `mcp_servers` capability relates to the existing Knowgrph MCP/readiness surfaces.
3. The runtime path is the existing `SettingsView` -> FloatingPanel Chat -> Workspace markdown -> Canvas path.
4. MiroMind reasoning-step streaming is additive transport/parser capability inside the existing chat request pipeline, not a second graph materialization path.

### 3. Product Goal

Maintain MiroMind in a way that preserves one upstream-to-downstream contract:

- Upstream provider readiness and configuration live in shared MainPanel settings owners.
- Chat orchestration stays inside FloatingPanel Chat and the existing submit coordinator stack.
- Output stays one canonical KGC markdown document when `chatStorageTarget=chatKnowgrph`.
- Workspace editor remains the canonical persistence/follow surface.
- Canvas applies only from the saved markdown document and its frontmatter.
- Renderer/view mode switches remain provider-neutral projections over shared graph state.

### 4. Non-Goals

- No new standalone MiroMind panel shell.
- No direct LLM-output -> graph mutation bypass.
- No MiroMind-specific renderer, widget, rich-media, subgraph, or edge schema.
- No backward-compat alias layer for legacy grouping keys or alternate graph payloads.
- No browser-persisted MiroMind secrets.
- No prod-only doc edits outside the `knowgrph` source tree.

### 5. Personas

#### Persona A - Workspace Operator

Needs to configure MiroMind from MainPanel, run chat from the existing FloatingPanel surface, and land usable markdown/frontmatter into canvas without learning a second workflow.

#### Persona B - Pipeline Maintainer

Needs MiroMind to stay additive at shared owners and transport/parser seams, with no downstream patches, no renderer churn, and no duplicate contracts.

#### Persona C - Agent / MCP Operator

Needs clear guidance on the difference between MainPanel `Integrations` provider readiness and MainPanel `MCP` documentation for optional remote `mcp_servers` capability.

### 6. User Journey

| Stage | User action | Surface | Required behavior |
|---|---|---|---|
| Discover | Opens MainPanel `integrations` | `SettingsView` | Sees `MiroMind API` through shared section metadata; no new shell |
| Configure | Sets provider, endpoint, auth, model, context scope | shared chat/settings rows | Reuses normalized settings/chat owner and shared readiness snapshots |
| Understand | Opens MainPanel `mcp` | shared settings docs | Sees that MiroMind `mcp_servers` is optional/provider-side and must not fork runtime ownership |
| Run | Opens FloatingPanel Chat and submits request | `FloatingPanelChat` | Existing submit coordinator composes prompts, transport, streaming, validation, finalize |
| Persist | Receives `chatKnowgrph` output | Workspace Editor | One canonical `kgc_*.md` document is written/followed |
| Apply | Applies saved markdown/frontmatter | Canvas | Shared `setActiveMarkdownDocument()` path applies frontmatter and graph |
| Explore | Switches canvas view mode / 2D renderer | Toolbar / Canvas | D3 Graph, Flowchart, Flow Canvas, Animatic, Storyboard, and Design all remain projections of the same graph |

### 7. Epics, Stories, Acceptance Criteria

#### Epic MM-E1 - Keep MiroMind In MainPanel Integrations

**Story MM-E1-S1 - Shared settings owner exposes MiroMind API**

> As a workspace operator, I want `MiroMind API` to appear in MainPanel `Integrations`, so that I configure it through the same shared settings surface as other providers.

Acceptance criteria:

- Given MainPanel opens on `integrations`, when integration sections render, then `MiroMind API` appears through shared `SettingsView` metadata and not through a new custom panel shell.
- Given MiroMind rows render, when values change, then provider/model/auth/routing state flows through existing shared settings/chat owners and normalized config surfaces rather than provider-specific ad hoc state.
- Given local settings readiness is inspected, when MiroMind is selected, then readiness snapshots and documentation continue to flow from existing browser-local snapshot owners.

`/goal MainPanel Integrations adds MiroMind through shared settings metadata, shared chat assist owners, and normalized config/state surfaces only`

#### Epic MM-E2 - Align MainPanel MCP Without Forking Runtime

**Story MM-E2-S1 - MainPanel MCP explains MiroMind MCP capability neutrally**

> As an agent operator, I want MainPanel `MCP` to document MiroMind's optional `mcp_servers` capability, so that I understand the capability without assuming a second runtime path.

Acceptance criteria:

- Given MainPanel opens on `mcp`, when MiroMind is documented, then the text states that `mcp_servers` is an optional provider capability and remains distinct from Knowgrph's own MCP runtime/readiness surfaces.
- Given the user reads MainPanel `mcp`, when runtime ownership is described, then the doc points back to the same FloatingPanel Chat -> Workspace markdown -> Canvas pipeline and forbids an MCP-only graph materialization path.
- Given `mcp_servers` is private beta or unsupported for a plan tier, when the user reads the docs, then the integration remains usable through the base chat-completions path without runtime ambiguity.

`/goal MainPanel MCP adds MiroMind guidance as documentation/readiness context only and does not introduce a second E2E contract`

#### Epic MM-E3 - Preserve One Chat-to-Canvas Contract

**Story MM-E3-S1 - MiroMind reuses the existing chat pipeline**

> As a pipeline maintainer, I want MiroMind to reuse the existing FloatingPanel Chat pipeline, so that chat output keeps landing in workspace markdown before any canvas apply occurs.

Acceptance criteria:

- Given a MiroMind-backed request is submitted, when prompts are assembled, then the base KGC contract, packed context, optional selection/workspace prompts, and conversation history remain the canonical prompt layers.
- Given `chatStorageTarget=chatKnowgrph`, when the model answers, then the answer is still exactly one frontmatter-first KGC markdown document and not prose plus sidecar graph JSON.
- Given finalize succeeds, when graph state changes, then the active workspace markdown document remains the only graph-application payload; direct raw-stream or UI-local graph mutation is forbidden.

`/goal MiroMind stays inside the existing FloatingPanelChat submit/request/validation/finalize chain and preserves markdown-first graph application`

#### Epic MM-E4 - Additive Reasoning Stream Support

**Story MM-E4-S1 - MiroMind reasoning steps surface without replacing the transport shell**

> As a workspace operator, I want MiroMind reasoning steps to be observable, so that I can inspect deep-research progress without giving up the existing chat runtime.

Acceptance criteria:

- Given MiroMind streams SSE chunks, when `delta.reasoning_steps` arrives, then parsing/rendering is implemented as an additive raw-HTTP/SSE capability in the existing request/streaming stack.
- Given streaming completes, when finish/usage metadata arrives, then usage, reasoning-token, and search-query fields remain provider metadata attached to the same chat run rather than a separate session system.
- Given providers that do not expose `reasoning_steps`, when the shared chat pipeline runs, then the shared transport still works without branching the markdown/output contract.

`/goal MiroMind streaming extensions remain additive transport/parser support under the shared chat shell and never fork the output contract`

#### Epic MM-E5 - Preserve Frontmatter and Renderer Neutrality

**Story MM-E5-S1 - Canvas and renderer contracts remain provider-neutral**

> As a renderer maintainer, I want MiroMind provenance to stay upstream in prompts/metadata, so that Storyboard, Animatic, Design, Flow Canvas, Flowchart, and D3 Graph stay neutral projections of shared graph state.

Acceptance criteria:

- Given a MiroMind-generated markdown file is applied, when frontmatter presets are parsed, then shared canvas/frontmatter owners remain authoritative for surface mode, render mode, and 2D renderer mode.
- Given nodes, widgets, rich media panels, subgraphs/groups/clusters, and edges are rendered, when provider provenance exists, then it is carried as metadata within the shared document/graph contract and not as renderer-specific branch logic.
- Given grouping is authored, when the markdown is validated, then canonical grouping ownership remains unchanged and no duplicate grouping channels or legacy aliases are introduced.

`/goal MiroMind affects upstream provider metadata only; renderer/view-layer ownership remains unchanged and provider-neutral`

### 8. MoSCoW

| Priority | Item | Why |
|---|---|---|
| Must | Add `MiroMind API` to MainPanel `Integrations` via shared owners | Core discoverability with minimal churn |
| Must | Align MainPanel `MCP` docs to optional `mcp_servers` capability | Prevent runtime confusion and duplicate pipeline assumptions |
| Must | Keep chat -> markdown -> workspace -> canvas as the only E2E graph path | Preserves SSOT and avoids downstream patches |
| Must | Keep renderer/view mode contracts provider-neutral | Prevents churn across canvas surfaces |
| Should | Surface reasoning-step and usage metadata through shared streaming stack | Adds MiroMind-specific value without architectural drift |
| Should | Add source-to-publish deployment guidance for docs | Prevents dev/prod/cloudflare divergence |
| Could | Add provider-specific prompt helper fragment for MiroMind capability hints | Useful, but only if it stays subordinate to base KGC contract |
| Won't | Add a standalone MiroMind graph ingestion runtime | Explicitly forbidden |

### 9. Success Metrics

| Metric | Baseline | Target |
|---|---|---|
| MainPanel Integrations provider discoverability | source-present MiroMind row | one shared-owner MiroMind area |
| Duplicate chat/graph pipeline count | 0 | exactly 0 |
| Direct LLM-output -> graph bypasses | possible by ambiguity | exactly 0 |
| Renderer-specific provider branches | at risk by poor design | exactly 0 |
| Publish-surface doc divergence | possible | source-owned only in `knowgrph` |

### 10. Scope Boundaries

In scope now:

- Repo-accurate PRD/TAD for MiroMind integration.
- MainPanel `Integrations` owner alignment.
- MainPanel `MCP` guidance alignment.
- Prompt/output/frontmatter/canvas contract alignment.
- Dev -> prod -> Cloudflare doc-publish topology notes.

Explicitly excluded now:

- Implementing a second runtime surface for MiroMind.
- Inventing a provider-specific markdown schema.
- Writing prod-only docs directly under published output without syncing from source.
- Adding stale compatibility code for legacy group aliases, duplicate payloads, or parallel transport contracts.

---

## Reference implementation: Part B - TAD

### 11. Architecture Principles

1. Shared owners first: `MainPanel` tabs stay thin; `SettingsView` remains the owner for `integrations` and `mcp`.
2. One canonical artifact: the saved workspace markdown document is the only payload that may apply to graph/canvas.
3. Provider-neutral renderers: all canvas views consume shared graph/frontmatter state and never branch by provider.
4. Additive provider capability: MiroMind-specific behavior belongs in settings metadata, prompt assembly extensions, and streaming/parser support only.
5. Upstream neutralization: prevent duplicate state, duplicate schemas, legacy aliases, and local downstream patches instead of compensating for them later.

### 12. Canonical E2E Path

| Phase | Canonical owner | Output |
|---|---|---|
| MainPanel route | `MainPanel` -> `IntegrationsHubView` / `McpHubView` -> `SettingsView` | shared provider/readiness surface |
| Provider config | `useSettingsChatAssist` + normalized settings values | provider/model/auth/context selection |
| Floating chat | `FloatingPanelChat` | chat UI + request lifecycle |
| Prompt assembly | `floatingPanelChatSubmitRequest.ts` + `chatContextPack.ts` + base contract prompts | ordered system/user/assistant messages |
| Transport | shared chat request sender | streaming HTTP response |
| Validation / recovery | `chatMarkdownValidation.ts` + KGC retry helpers | canonical KGC markdown candidate |
| Finalize / persist | `useFinalizeAssistantSuccess.ts` | saved `kgc_*.md` workspace document |
| Canvas apply | `chatKgcCanvasApply.ts` -> `applyWorkspaceImportToCanvas()` -> `setActiveMarkdownDocument()` | Source Files materialization + frontmatter preset apply + markdown-to-graph apply |
| Storyboard Widget text/transcript run | `useStoryboardWidgetWorkflowActions.ts` -> `writeTextWidgetRunOutputArtifact()` -> `applyWorkspaceImportToCanvas({ applyToGraph: false })` | passive sibling workspace Markdown artifact plus shared widget/Rich Media Panel `outputPath` |
| Storyboard Widget image/video run | `useStoryboardWidgetWorkflowActions.ts` -> `writeRichMediaWidgetRunOutputArtifact()` -> `applyWorkspaceImportToCanvas({ applyToGraph: false })` | generated binary sibling artifact, R2-backed storage route when runtime sync is enabled, passive editable Markdown manifest, and shared widget/Rich Media Panel `outputPath` / `outputManifestPath` |
| View/render | toolbar view state + renderer/frontmatter owners | provider-neutral canvas projections |

### 13. Owner Map

| Surface | Owner | MiroMind rule |
|---|---|---|
| MainPanel `integrations` | shared `SettingsView` metadata and rows | add MiroMind here; do not add a new shell |
| MainPanel `mcp` | shared settings docs/readiness rows | document optional `mcp_servers`; do not fork runtime |
| Integration config | normalized `integrationConfigsJson` and shared chat values | extend existing normalized config; no ad hoc per-provider state |
| Chat contract | `chatResponseBaseContract.ts` | base KGC contract remains authoritative |
| Context pack | `chatContextPack.ts` | selected node, edges, frontmatter, graph summary, guideline digest stay unchanged |
| Submit coordinator | `floatingPanelChatSubmitCoordinator.ts` stack | MiroMind rides the existing lifecycle |
| Validation | `chatMarkdownValidation.ts` | same markdown/frontmatter rules apply |
| Workspace persistence | workspace markdown runtime | saved document stays canonical |
| Canvas/frontmatter | `frontmatter.ts`, `canvasFrontmatterPreset.ts`, graph-data actions | same preset and graph-apply rules apply |

### 14. MiroMind Provider Contract

#### 14.1 Runtime positioning

MiroMind is an additive chat provider capability on the existing shared chat request path. It must not become a parallel assistant runtime.

#### 14.2 Endpoint contract

| Field | Value |
|---|---|
| Base URL | `https://api.miromind.ai/v1` |
| Primary endpoint | `POST /chat/completions` |
| Models | `mirothinker-1-7-deepresearch-mini`, `mirothinker-1-7-deepresearch` |
| Auth | Server-managed key from the proxy runtime (`KNOWGRPH_CHAT_PROXY_MIROMIND_API_KEY`, with `MIROMIND_API_KEY` retained as the current compatibility alias), or memory-only BYOK on explicit fallback |
| Stream mode | SSE, `stream: true` |
| Optional capability | `mcp_servers` request field, provider-side, private beta / plan-dependent |

#### 14.3 Shared request envelope

The request must continue to use the existing chat submit shell:

```json
{
  "model": "mirothinker-1-7-deepresearch-mini",
  "messages": [
    { "role": "system", "content": "<base KGC or generic contract>" },
    { "role": "system", "content": "<packed context>" },
    { "role": "system", "content": "<optional selection/workspace prompts>" },
    { "role": "user", "content": "<conversation turn>" }
  ],
  "stream": true,
  "max_tokens": 4000
}
```

Rules:

- The MiroMind integration may add provider-specific headers/options upstream, but must not replace the shared message assembly order.
- If `mcp_servers` is later enabled, it remains optional provider metadata on the same request envelope.
- MiroMind-specific prompt additions must remain subordinate to the base KGC contract and must never redefine the output schema.

### 15. Prompt Contract Layering

Prompt layering remains canonical and ordered:

1. Base contract prompt from `chatResponseBaseContract.ts`
2. Packed context prompt from `chatContextPack.ts`
3. Optional bounded graph selection prompt
4. Optional workspace-wide context prompt
5. Optional user-supplied system prompt
6. Conversation history

MiroMind-specific guidance may be inserted only as an additive provider hint between steps 2-5 if needed, and only when it does all of the following:

- preserves the base frontmatter-first KGC output contract,
- does not duplicate context already emitted by shared owners,
- does not hardcode project-specific schema forks,
- does not instruct direct graph mutation or renderer-specific behavior.

### 16. Streaming Contract

#### 16.1 Why raw SSE matters

MiroMind exposes reasoning-step extensions such as `delta.reasoning_steps` and final usage metadata including reasoning tokens and search query counts. OpenAI-compatible SDK wrappers may hide or drop extension fields, so reasoning visibility requires raw HTTP/SSE parsing inside the shared streaming shell.

#### 16.2 Allowed additive behavior

- Parse `delta.reasoning_steps` when present.
- Parse `delta.content` for final answer tokens, including provider-compatible structured text parts.
- Keep reasoning-only streams visible as reasoning metadata without promoting them to final assistant content.
- Parse terminal `finish_reason` and `usage`.
- Ignore MiroMind-specific fields gracefully when not present.

#### 16.3 Forbidden behavior

- No second streaming client stack that bypasses shared chat lifecycle owners.
- No provider-specific finalize path that skips markdown validation/persistence.
- No direct reasoning-step -> graph mutation logic.

### 17. Output Contract

#### 17.1 Canonical `chatKnowgrph` output

When the storage target is `chatKnowgrph`, the assistant output must still be exactly one standalone frontmatter-first KGC markdown document.

Required invariants:

- First chunk begins with `---`.
- No wrapper prose before or after the document.
- One saved canonical `kgc_*.md` document remains the artifact that Workspace and Canvas follow.
- Graph-application payload equals the saved markdown document, not a derived provider payload.
- The saved document lands in Source Files before active-document apply so Storyboard Card/Widget, Rich Media Panels, and Edges read the same renderer-neutral data.
- Storyboard Widget text/transcript widget runs that have an active workspace document persist one sibling Markdown artifact and register it in Source Files passively. Storyboard Widget image/video widget runs persist the binary artifact, store bytes through the R2-backed storage route when runtime sync is enabled, create one editable Markdown manifest, and register that manifest in Source Files passively; provider output must not bypass the shared widget or Rich Media Panel patch owners.

#### 17.2 Provenance handling

MiroMind provenance may appear only as upstream metadata within the shared document/graph contract, for example:

- source/provider identifiers,
- cited URLs or source notes,
- usage or reasoning summaries,
- session IDs tied to saved markdown history.

It must not introduce:

- provider-specific node types,
- provider-specific edge schemas,
- alternate grouping registries,
- renderer-only metadata that changes graph semantics.

### 18. Workspace and Frontmatter Contract

| Contract point | Required rule |
|---|---|
| Workspace artifact | canonical `kgc_*.md` file is the saved truth |
| Validation gate | same KGC structural rules apply regardless of provider |
| Frontmatter parsing | same shared YAML/frontmatter parser remains authoritative |
| Canvas preset apply | same preset fields drive surface mode, render mode, and 2D renderer |
| Graph apply | same workspace import and markdown-to-graph path runs through Source Files and active markdown document actions |
| Widget run artifacts | same workspace artifact writers and passive Source Files registration path persist completed text/transcript outputs plus image/video manifests |
| Renderer behavior | D3 Graph, Flowchart, Flow Canvas, Animatic, Storyboard, and Design remain view projections only |

### 19. MainPanel MCP Alignment

MainPanel `MCP` must explain MiroMind neutrally:

- MiroMind `mcp_servers` is a provider-side request capability, not a replacement for Knowgrph MCP.
- Knowgrph's browser/local MCP readiness surfaces remain separate shared owners.
- MiroMind MCP capability, when available, still feeds the same chat -> markdown -> workspace -> canvas chain.
- If unavailable, the base MiroMind chat-completions path still works and remains the default contract.

### 20. Lane Topology and Deploy Boundaries

Source presence and configured destinations do not prove publication. This document has no attached
integration, mirror, or live delivery result and no referenced operator promotion instruction.

| Lane | Function and owner | Mutation rights | Residency | Current evidence | Local rung | Delivered rung |
|---|---|---|---|---|---|---|
| Authoring | source, tests, and this specification in `$GITHUB_ROOT/knowgrph` | scoped source/test/doc edits | developer checkout and local test process | VCCs stated; results not attached | `spec-complete` | `undocumented` |
| Mirror | immutable candidate produced by the protected integration/release controller | publish only from an approved Authoring state | protected candidate artifact store | no MiroMind-specific candidate result attached | `spec-complete` | `undocumented` |
| Delivery | optional client and server-side proxy publication | publish only from an approved Mirror state | configured delivery region | configured paths/URLs only; no live result attached | `spec-complete` | `undocumented` |

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement and check | State |
|---|---|---|---|---|---|---|
| `MIROMIND-SOURCE-TO-MIRROR` | Authoring | Mirror | exact candidate qualification; result `not recorded` | `none` | discard the candidate and rerun the source and integration checks | `closed` |
| `MIROMIND-MIRROR-TO-DELIVERY` | Mirror | Delivery | live provider/proxy check; result `not recorded` | `none` | restore the prior approved whole state and rerun the live check | `closed` |

Reference paths are ownership hints only:

- Source owner: `$GITHUB_ROOT/knowgrph/docs/documents/...`.
- Possible generated mirror owner: `$GITHUB_ROOT/huijoohwee/content/knowgrph`.
- Configured public route: `https://airvio.co/knowgrph`.
- MainPanel docs, generated references, and published docs must describe one runtime contract, but
  agreement is not a delivery claim without the boundary evidence above.

### 21. ADRs

#### ADR-01 - One markdown artifact over direct graph mutation

**Decision**: keep the saved workspace markdown document as the sole graph-application payload.

**Rationale**:

- preserves SSOT,
- keeps Workspace follow/debugging intact,
- prevents transport/UI-local graph drift,
- avoids provider-specific canvas mutation code.

#### ADR-02 - Raw SSE parsing over SDK-only streaming for MiroMind reasoning visibility

**Decision**: use raw HTTP/SSE parsing inside the shared transport shell when MiroMind reasoning extensions are needed.

**Rationale**:

- preserves access to `reasoning_steps` and extended usage fields,
- keeps one transport lifecycle,
- avoids a parallel provider-specific runtime.

#### ADR-03 - MainPanel MCP documents optional provider capability, not a second pipeline

**Decision**: document `mcp_servers` as optional provider capability in MainPanel `MCP`, but keep runtime ownership with the shared chat pipeline.

**Rationale**:

- prevents operator confusion,
- keeps Knowgrph MCP and provider-side MCP concerns separated,
- avoids duplicate E2E claims.

### 22. Quality Attributes

| Attribute | Requirement | Validation |
|---|---|---|
| Neutrality | no renderer/provider forks | code and docs show one shared downstream path |
| SSOT | one saved markdown artifact owns apply | inspect finalize/apply path and docs |
| Observability | reasoning/usage can surface without contract drift | shared stream parser captures additive fields |
| Stability | provider differences do not alter markdown schema | same validation rules pass/fail regardless of provider |
| Deployability | source-owned docs publish cleanly to prod/cloudflare | source and published docs stay in sync |

---

## Reference implementation: Traceability

| Story | Owner | Interface | `/goal` |
|---|---|---|---|
| MM-E1-S1 | shared `SettingsView` and settings chat assist owners | MainPanel `integrations` -> normalized config/readiness | MiroMind appears only through shared settings owners |
| MM-E2-S1 | shared MainPanel `mcp` docs/readiness surface | MainPanel `mcp` -> MiroMind MCP guidance | no second E2E runtime contract appears |
| MM-E3-S1 | submit/request/validation/finalize chain | chat messages -> markdown -> workspace -> canvas | saved markdown remains sole apply payload |
| MM-E4-S1 | shared raw HTTP/SSE parser path | streaming delta/usage parsing | reasoning visibility stays additive and transport-local |
| MM-E5-S1 | frontmatter and renderer owners | markdown/frontmatter -> graph -> renderers | canvas views remain provider-neutral |

## Reference implementation: VCC and Evidence Reference Register

No satisfying result is attached to this revision. Named commands are VCC hosts, not Evidence
References until their exit result and lane are recorded.

| VCC | End state | Named check | Constraint | Recorded result | Local rung | Delivered rung |
|---|---|---|---|---|---|---|
| `VCC-MM-1` | shared MainPanel owners expose the configured provider rows and server-managed-key posture | `npm --prefix canvas run test:smoke:miromind:source` exits 0 | no new panel shell or browser-persisted secret | not recorded | `spec-complete` | `undocumented` |
| `VCC-MM-2` | optional provider-side MCP guidance remains distinct from local/runtime ownership | `npm --prefix canvas run test:ci:unit -- provider.docs.implementedOrReferenceOwners` exits 0 | no second graph materialization path | not recorded | `spec-complete` | `undocumented` |
| `VCC-MM-3` | shared request options retain the chat-completions envelope | `npm --prefix canvas run test:ci:unit -- chat.providers.miromindRequestOptions.chatCompletions` exits 0 | prompt/output schema remains shared | not recorded | `spec-complete` | `undocumented` |
| `VCC-MM-4` | stream parsing surfaces reasoning and usage metadata | `npm --prefix canvas run test:ci:unit -- chat.floatingPanel.streaming.miromindDelta.readsReasoningAndUsage` exits 0 | metadata never directly mutates graph state | not recorded | `spec-complete` | `undocumented` |
| `VCC-MM-5` | exact approved delivery surface passes the provider/proxy check | `npm run miromind:readiness:check` exits 0 with surfaced live result | source checks alone cannot satisfy delivery | not recorded | `spec-complete` | `undocumented` |

## Reference implementation: Readiness Gap Matrix

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| MainPanel configuration and source contract | `spec-complete` | `undocumented` | local source result is not attached | none | `VCC-MM-1` and `VCC-MM-3` gain satisfying local Evidence References |
| Provider-side MCP guidance | `spec-complete` | `undocumented` | source result is not attached; capability remains plan-dependent | none | `VCC-MM-2` gains a satisfying local Evidence Reference |
| Reasoning/usage stream metadata | `spec-complete` | `undocumented` | focused parser result is not attached | none | `VCC-MM-4` gains a satisfying local Evidence Reference |
| Protected publication | `spec-complete` | `undocumented` | candidate/live results and operator instruction are absent | none | `VCC-MM-5` plus both boundary records satisfy Mirror and Delivery evidence rules |

## Reference implementation: Validation Checklist

- Add `MiroMind API` only through shared MainPanel settings metadata and shared config/readiness owners.
- Keep `miromindApi.api_key` defaulted to `Server-managed Key`; the local proxy prefers `KNOWGRPH_CHAT_PROXY_MIROMIND_API_KEY`, while the current Pages readiness host checks the `MIROMIND_API_KEY` compatibility name. Neither source declaration proves that a deployed runtime sees a value.
- Keep MainPanel `MCP` documentation descriptive and neutral; do not imply a new runtime.
- Keep prompt layering canonical; do not replace the base KGC contract.
- Keep `chatKnowgrph` output as one frontmatter-first KGC markdown document.
- Keep the saved workspace markdown document as the only graph-application payload.
- Keep frontmatter/canvas preset parsing unchanged and provider-neutral.
- Keep renderer/view-mode behavior unchanged across D3 Graph, Flowchart, Flow Canvas, Animatic, Storyboard, and Design.
- Run `npm --prefix canvas run test:smoke:miromind:source` for the focused source-owned gate covering the rendered MainPanel path and server-managed key contract without live Pages dependencies.
- Run `npm run miromind:readiness:check` for the non-deploy gate covering that source smoke, Pages secret listing, and live no-BYOK proxy smoke.
- Forbid direct LLM-output -> graph mutation bypasses.
- Forbid duplicate grouping registries, legacy aliases, and provider-specific schema forks.
- Forbid browser-persisted secrets and prod-only doc divergence.

## Reference implementation: Explicit Forbiddens

- No MiroMind-only panel shell.
- No MiroMind-only markdown schema.
- No provider-local graph patch layer.
- No duplicate prompt contract that shadows `chatResponseBaseContract.ts`.
- No separate MCP-only canvas materialization path.
- No stale compatibility branch for legacy grouping or alternate graph payloads.
- No direct edits in published prod copies without source sync.

---

*v0.3.0 · 2026-07-30 · source baseline; delivery remains undocumented*
