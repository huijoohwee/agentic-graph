# agentic-graph DeerFlow Integration Contracts and Patterns

**Document Version**: 1.2.0  
**Date**: 2026-05-29  
**Status**: Accepted and implemented baseline  
**Companion To**: `agentic-graph-deerflow-prd-tad.md`

---

## Document Purpose

**Context**: DeerFlow integration spans MainPanel settings, Storyboard Widget templates, rich-media runtime dispatch, gateway artifact handling, and workspace URL import.

**Intent**: Keep all DeerFlow behavior rooted in shared owners and prevent provider-specific UI forks, renderer branches, local path hardcoding, or stale unshipped-mode contract claims.

**Directive**: New DeerFlow capability must extend a listed source owner or introduce a new guarded owner before docs describe it as implemented.

**Inspiration boundary**: Long-horizon SuperAgent concepts inspired by DeerFlow must be implemented through agentic-graph's native `agentic_graph_parser` harness and local MCP contracts. Do not copy DeerFlow code, clone its architecture, or add a DeerFlow-only parser, renderer, memory stack, or graph apply path.

---

## Contract Catalog

| Contract ID | Name | Producer | Consumer | Status |
|---|---|---|---|---|
| DFI-C001 | Settings Row Contract | `deerflowApiDocs.ts` | MainPanel Settings | Shipped |
| DFI-C002 | Anchor Link Contract | `getDeerFlowApiRowAnchorId()` | Storyboard Widget links, MainPanel search | Shipped |
| DFI-C003 | Provider Normalization Contract | `chatEndpoint.ts` | chat, Storyboard Widget, rich-media runtime | Shipped |
| DFI-C004 | Text Widget Registry Contract | `registryTemplates.ts` | Storyboard Widget Manager | Shipped |
| DFI-C005 | Rich-Media Dispatch Contract | `richMediaRun.ts` | image/video generation nodes | Shipped |
| DFI-C006 | Gateway Run Adapter Contract | `deerflowRunGeneration.ts` | DeerFlow `/api/runs/stream` | Shipped |
| DFI-C007 | URL Import Manifest Contract | `deerflowUrlImport.ts` | Source Files workspace | Shipped |
| DFI-C008 | Native SuperAgent Boundary | `docs/documents/agentic-graph-superagent-harness.md` | local long-horizon harness | Source-owned; DeerFlow is conceptual inspiration only |

## DFI-C001: Settings Row Contract

```ts
type DeerFlowSettingsRowKey = `deerflowApi.${string}`;
```

Rules:
- Rows are generated from `OPENAI_RESPONSES_API_DOC_ROWS`.
- Provider defaults to `CHAT_PROVIDER_DEERFLOW`.
- Endpoint defaults to `CHAT_DEERFLOW_ENDPOINT_URL`.
- Row metadata lives in `DEERFLOW_API_REQUEST_DOC_ENTRIES`.
- No second DeerFlow settings registry is allowed.

## DFI-C002: Anchor Link Contract

```ts
type DeerFlowAnchorId = `deerflow-api-row-${string}`;
```

Rules:
- Anchor ids are produced by `getDeerFlowApiRowAnchorId(rowKey)`.
- Storyboard Widget links resolve row keys through `mapOpenAiRowKeyToDeerFlowRowKey()`.
- Links must target MainPanel Integrations, not a DeerFlow-only panel.

## DFI-C003: Provider Normalization Contract

```ts
const provider = normalizeChatProviderId(rawProvider);
```

Rules:
- DeerFlow execution requires normalized `CHAT_PROVIDER_DEERFLOW`.
- Provider labels and defaults come from `chatEndpoint.ts`.
- Proxy headers use `buildChatProxyHeaders()`.
- Binary artifacts use `resolveBinaryDownloadProxyUrl()` when needed.

## DFI-C004: Text Widget Registry Contract

Rules:
- Default registry includes `formId: "textGeneration.deerflow"`.
- DeerFlow text widget labels and field mappings are generated in `registryTemplates.ts`.
- DeerFlow row links reuse the same MainPanel anchor contract.
- Registry normalization sets provider family and endpoint consistently.

## DFI-C005: Rich-Media Dispatch Contract

Rules:
- `runRichMediaWidgetGeneration()` is the only DeerFlow image/video runtime entrypoint.
- Provider selection happens after `normalizeChatProviderId()`.
- Image requests call `generateRunImageWithDeerFlow()`.
- Video requests call `generateRunVideoWithDeerFlow()`.
- Shared artifact persistence runs after the provider returns a `GeneratedBinaryAsset`.

## DFI-C006: Gateway Run Adapter Contract

```ts
type DeerFlowRunGatewayPath = "/api/runs/stream";
```

Rules:
- `/api/runs/stream` is derived from the configured chat endpoint.
- The request body includes `kind`, `mode`, `prompt`, and normalized `options`.
- SSE responses are parsed through `parseSseEvents()`.
- JSON responses and SSE payloads both pass through the same artifact candidate resolver.
- Local relative artifact paths are absolutized against the active proxy prefix.

## DFI-C007: URL Import Manifest Contract

```ts
type DeerFlowImportGatewayPath = "/api/runs/wait";
```

Rules:
- Import uses `resolveDeerFlowRunsWaitEndpoint()`.
- DeerFlow must return a manifest containing file names and text.
- File names are sanitized before writing.
- Source Files remain the persistence boundary.
- Failures return structured `failed` entries.

## DFI-C008: Native SuperAgent Boundary

```ts
type DeerFlowInspirationUse = "conceptual-reference-only";
```

Rules:
- Use DeerFlow only to inform neutral primitives such as message gateway, memory, tools, skills, subagents, sandboxed workspace artifacts, and long-horizon run boundaries.
- Implement agentic-graph harness behavior in `agentic_graph_parser` and local MCP owners before documenting it as shipped.
- Keep Storyboard Widget, Rich Media Panel, AGENTIC_OS apply, Source Files, and chat owners provider-neutral.

---

## Integration Patterns

## Pattern P001: Reuse MainPanel Settings Owners

- Add settings rows to `deerflowApiDocs.ts`.
- Render through `useSettingsView.ts`.
- Link through the shared anchor id helper.

## Pattern P002: Normalize Before Dispatch

- Normalize provider ids in `chatEndpoint.ts`.
- Keep provider branching at runtime owner boundaries.
- Do not branch inside Canvas renderer code.

## Pattern P003: Derive Gateway Paths

- Start from the configured endpoint.
- Derive `/api/runs/stream` or `/api/runs/wait`.
- Preserve query-free path derivation; do not hardcode local absolute origins.

## Pattern P004: Artifact-First Rendering

- Convert DeerFlow responses to `GeneratedBinaryAsset`.
- Persist artifacts through shared rich-media persistence.
- Patch graph node properties through existing output patch helpers.

## Pattern P005: Source Files for Import

- Convert DeerFlow manifests to workspace files.
- Keep import outputs in Source Files.
- Avoid generated prod/downstream path writes.

---

## Anti-Pattern Guards

- Do not add a DeerFlow-only MainPanel tab.
- Do not duplicate `deerflowApi.*` rows outside `deerflowApiDocs.ts`.
- Do not hardcode `/Users/...`, repo-local paths, or Cloudflare URLs in runtime source.
- Do not document a DeerFlow MCP bridge as implemented until source owners exist.
- Do not introduce provider-specific renderer branches.
- Do not copy DeerFlow code or architecture into agentic-graph's native SuperAgent harness.
- Do not silently fallback from DeerFlow to another provider.

---

## Sequence Patterns

### Sequence S001: MainPanel Configuration

```mermaid
sequenceDiagram
    participant User
    participant MainPanel
    participant Rows as deerflowApiDocs.ts
    participant Endpoint as chatEndpoint.ts

    User ->> MainPanel : Search "deerflow"
    MainPanel ->> Rows : Read DEERFLOW_API_REQUEST_DOC_ENTRIES
    Rows ->> Endpoint : Use CHAT_PROVIDER_DEERFLOW and CHAT_DEERFLOW_ENDPOINT_URL
    Rows -->> MainPanel : Render deerflowApi.* rows
```

### Sequence S002: Rich-Media Runtime

```mermaid
sequenceDiagram
    participant Flow as Storyboard Widget
    participant Runtime as richMediaRun.ts
    participant Adapter as deerflowRunGeneration.ts
    participant Gateway as DeerFlow Gateway
    participant Store as Shared artifact persistence

    Flow ->> Runtime : Run image/video node
    Runtime ->> Runtime : normalizeChatProviderId()
    Runtime ->> Adapter : generateRunImageWithDeerFlow or generateRunVideoWithDeerFlow
    Adapter ->> Gateway : POST /api/runs/stream
    Gateway -->> Adapter : SSE or JSON artifact reference
    Adapter -->> Runtime : GeneratedBinaryAsset
    Runtime ->> Store : Persist artifact
```

### Sequence S003: URL Import

```mermaid
sequenceDiagram
    participant User
    participant Importer as deerflowUrlImport.ts
    participant Gateway as DeerFlow Gateway
    participant Workspace as Source Files

    User ->> Importer : Import URL via DeerFlow
    Importer ->> Gateway : POST /api/runs/wait
    Gateway -->> Importer : Manifest files
    Importer ->> Workspace : Write sanitized files under deerflow/
```

---

## Review Checklist

- [x] Contract IDs map to shipped owners.
- [x] Direct/MCP proposed contracts are not described as implemented.
- [x] Renderer depends on shared artifact output.
- [x] Transport details stay in DeerFlow adapter modules.
- [x] MainPanel rows are generated from one source.

---

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0.0 | 2026-05-07 | joohwee | Initial integration contracts and architecture patterns |
| 1.1.0 | 2026-05-07 | joohwee | Added Mermaid sequence diagrams |
| 1.2.0 | 2026-05-29 | joohwee | Replaced unshipped mode contracts with implemented gateway contracts |
