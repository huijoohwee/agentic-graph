# Design: agenticgraph VideoDB API Reference

## Overview

This spec produces two Dev artifacts:

`docs/documents/agenticgraph-api-reference/agenticgraph-videodb-api-reference.md`

`$GITHUB_ROOT/huijoohwee/docs/agenticgraph-strybldr-demo.md`

The reference document is the codebase map and runtime-ready reference for the VideoDB integration in agenticgraph's `MainPanel Integrations` surface. The TypeScript SSOT lives at `canvas/src/features/integrations/videodbSsot.ts`; the CLI generator remains planned at `canvas/src/cli/generate-videodb-reference.ts`. The demo document is a runnable local renderer-neutral workspace that exercises the agenticgraph brief -> generated video -> indexed review -> publish packet path without storing credentials, IDs, job IDs, stream URLs, download URLs, or publish URLs.

## Architecture

The document follows the established agenticgraph API reference architecture:

```
YAML 1.2 Frontmatter
  └── 15 required fields (title, doc_type, version, status, created, updated,
       author, domain, lang, frontmatter_contract, ssot_upstream,
       planned_ssot_entrypoint, planned_cli_generator, related, tags)

H1 Header Block
  ├── SSOT upstream link
  ├── App SSOT entrypoint
  ├── CLI generator (planned)
  ├── Scope declaration (MainPanel Integrations, StoryboardWidget Manager, NodeOverlayEditor)
  └── Table columns legend

Integration Overlay Section
  └── 5-row table: area | source | acceptance boundary
      ├── Auth credential handling
      ├── Runtime SSOT entrypoint
      ├── Planned CLI generator
      ├── SSOT sync directive
      └── Operator-supplied runtime values policy (no-hardcode enforcement)

Async vs Synchronous Operation Notes Section
  ├── Synchronous operations list (13 endpoints)
  ├── Async operations list (14 operations)
  ├── Shared polling endpoint declaration
  └── Circuit-breaker bound: 36 iterations × 10s (~6 min)

Pipeline Correctness Properties Section
  ├── Property 1: Upload → Index → Search completeness (PBT-suitable, mock HTTP)
  ├── Property 2: Stream URL validity (PBT-suitable, mock HTTP)
  ├── Property 3: Transcription round-trip (PBT-suitable, mock HTTP)
  └── Property 4: Async polling termination (PBT-suitable, pure function)

VideoDB Configuration Reference Table
  └── 46 rows, a-z sorted, 9 columns
      key | type | value | key-description | value-description | ssot | module | class | function

Runnable Dev Demo
  └── $GITHUB_ROOT/huijoohwee/docs/agenticgraph-strybldr-demo.md
      ├── demo_status marks Dev/runtime-slot scope
      ├── deployed_api_claim: false
      ├── flow nodes reference the API table keys and local agenticgraph handoff keys
      ├── kgRendererCompatibility declares Storyboard and Strybldr
      ├── flow.nodes carry neutral Storyboard aliases
      ├── fenced json strybldr-storyboard payload validates Strybldr direct-open projection
      ├── runtime values blank by default
      └── no fabricated IDs, job IDs, stream URLs, download URLs, publish URLs, Prod copy, or Cloudflare deploy claim
```

## Components and Interfaces

### Row taxonomy

Three row types are used, all sharing the 9-column format:

**Config/auth rows** — represent settings that operators supply at runtime, not API calls. Types: `string`, `url`. Keys: `videodb.api_key`, `videodb.base_url`, `videodb.docs_url`. Value cell: `"Required. Operator-supplied. Never hardcode."` for credentials; literal URL for URL rows. Class: `VideodbAuthRow`.

**Param rows** — represent parameters that modify an API call. Types: `enum`, `boolean`, `integer`, `number`. Keys follow the pattern `videodb.[group].[endpoint].[param]` (e.g. `videodb.video.search.query`). Value cell: concise default with escape `\|` for enum option lists. Class: `VideodbEndpointRow`.

**Endpoint rows** — represent actual HTTP operations. Type: `endpoint`. Value cell: `METHOD /path` (e.g. `POST /collection/{id}/upload`). Class: `VideodbEndpointRow`.

### Key namespacing convention

All keys use the `videodb.` prefix, followed by dot-separated group and operation identifiers:

- `videodb.api_key` — flat credential row
- `videodb.base_url`, `videodb.docs_url` — flat config rows
- `videodb.collection.upload` — group `collection`, operation `upload`
- `videodb.video.search.score_threshold` — group `video`, operation `search`, param `score_threshold`
- `videodb.ai.generate_video` — group `ai`, operation `generate_video`
- `videodb.async_response.get` — group `async_response`, operation `get`

Rows are sorted globally a-z across the entire table, not grouped by API section.

### Module/class/function naming conventions

For the runtime SSOT, all rows use:

- **module**: `canvas/src/features/integrations/videodbSsot.ts` (primary); `canvas/src/features/panels/views/SettingsView.tsx` (secondary)
- **class**: `VideodbAuthRow` for credential/config rows; `VideodbEndpointRow` for endpoint and param rows
- **function**: verb-noun camelCase matching the row role:
  - Auth/config: `getApiKey`, `-`
  - Collections: `createCollection`, `deleteCollection`, `getCollection`, `listCollections`, `searchCollection`, `uploadVideo`
  - Videos: `deleteVideo`, `getVideo`, `listVideos`, `updateVideo`, `getStreamUrl`
  - Transcription: `createTranscription`, `getTranscription`
  - Indexing: `indexSpokenWord`, `indexScene`
  - Search: `searchVideo`
  - AI generation: `dubVideo`, `generateAudio`, `generateImage`, `generateText`, `generateVideo`, `translateVideo`
  - Timeline: `compileTimeline`, `createTimeline`, `compileEditorTimeline`
  - Async polling: `pollAsyncResponse`
  - RTStream: `createRtstream`, `exportRtstream`, `startRtstream`, `stopRtstream`
  - Downloads: `createDownload`, `getDownload`
  - Utility: `checkHealth`, `chatCompletion`, `transcodeVideo`, `listAssets`

## Data Models

### YAML frontmatter fields

| field | value |
| --- | --- |
| `title` | `"agenticgraph — VideoDB API Reference (SSOT + Codebase Map)"` |
| `doc_type` | `"api-reference"` |
| `version` | `"0.1.0"` |
| `status` | `"runtime-ready"` |
| `created` | ISO 8601 date |
| `updated` | ISO 8601 date |
| `author` | `"agenticgraph"` |
| `domain` | `"integrations"` |
| `lang` | `"en"` |
| `frontmatter_contract` | `"agenticgraph-api-reference-v1"` |
| `ssot_upstream` | `"https://docs.videodb.io/api-reference/introduction.md"` |
| `planned_ssot_entrypoint` | `"canvas/src/features/integrations/videodbSsot.ts"` |
| `planned_cli_generator` | `"canvas/src/cli/generate-videodb-reference.ts"` |
| `related` | sequence: `agenticgraph-byteplus-openark-video-generation-api-reference.md`, `agenticgraph-integrations-ssot-sync-directives.md` |
| `tags` | sequence: `videodb`, `integrations`, `api-reference`, `runtime-ready` |

### Row count and group distribution

| group | count | keys |
| --- | --- | --- |
| auth + config | 3 | `videodb.api_key`, `videodb.base_url`, `videodb.docs_url` |
| collections | 6 | `videodb.collection.{create,delete,get,list,search,upload}` |
| videos | 7 | `videodb.video.{delete,get,list,update,stream}` + `videodb.video.stream.{format,quality}` |
| transcription | 2 | `videodb.transcription.{create,get}` |
| indexing | 3 | `videodb.index.{scene,spoken_word}` + `videodb.index.scene.scene_type` |
| search | 7 | `videodb.video.search` + 6 param rows |
| AI generation | 6 | `videodb.ai.{dub_video,generate_audio,generate_image,generate_text,generate_video,translate_video}` |
| timeline | 2 | `videodb.timeline.{compile,create}` |
| async polling | 1 | `videodb.async_response.get` |
| RTStream | 4 | `videodb.rtstream.{create,export,start,stop}` |
| downloads | 2 | `videodb.download.{create,get}` |
| utility | 2 | `videodb.health`, `videodb.chat` |
| additional | 2 | `videodb.asset.list`, `videodb.editor.compile` (+ `videodb.transcode` = 3 total) |
| **total** | **≥ 46** | exceeds the ≥45 row requirement |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Upload → Index → Search Pipeline Completeness

*For any* uploaded video whose transcript contains at least one word matching a given query, calling `POST /video/{id}/index/` (spoken-word index) followed by `POST /video/{id}/search/` with `index_type: spoken_word` and that query SHALL return a result set containing at least one item.

**Validates: Requirements 18.2**

### Property 2: Stream URL Validity

*For any* valid video ID, after a successful `POST /video/{id}/stream/` call, the returned stream URL SHALL be a non-empty string beginning with `https://` or `http://`.

**Validates: Requirements 18.3**

### Property 3: Transcription Round-Trip

*For any* video with audible speech, after `POST /video/{id}/transcription` completes polling and reaches terminal state `completed`, calling `GET /video/{id}/transcription` SHALL return a transcription object whose text content is non-empty.

**Validates: Requirements 18.4**

### Property 4: Async Polling Termination

*For any* async job ID polled via `GET /async-response/{id}`, the polling harness SHALL call the endpoint at most 36 times and SHALL return a failure result when the bound is reached, regardless of whether the job has reached a terminal state.

**Validates: Requirements 18.5**

## Error Handling

**No-hardcode enforcement**: The `videodb.api_key` row value is `"Required. Operator-supplied. Never hardcode."` — a pattern repeated in the overlay table and documented in the async notes. Path parameters `{id}` are always path templates, never concrete identifiers.

**Missing credential**: If `videodb.api_key` is absent or empty at request time, the integration returns a readiness failure before making any API call. This is surfaced in `MainPanel Integrations` via the existing readiness check pattern.

**Async polling circuit-breaker**: All async operations use `pollAsyncResponse` with a 36-iteration limit at 10-second intervals. On bound exhaustion the function returns a failure result rather than throwing. This matches the `geminiRunGeneration.ts` pattern documented in the SSOT sync directives table.

**Pipe escaping**: All `enum` value cells containing `|` use `\|` to prevent markdown table parser misreads (e.g. `mp4 \| webm \| hls`).

## Testing Strategy

### Document validation (example-based tests)

These are structural checks against the generated document file:

- Parse the YAML frontmatter with a strict parser — must succeed with no warnings
- Verify all 15 required frontmatter fields are present and non-empty
- Verify `status` field equals `"runtime-ready"`
- Count the table header columns — must equal 9 in the exact declared order
- Count total rows — must be ≥ 45
- Verify rows are sorted a-z by `key`
- Verify no cell contains a bare `|` (all pipes are escaped as `\|` or inside backticks)
- Verify `videodb.api_key` value cell contains the exact text `"Required. Operator-supplied. Never hardcode."`
- Verify no cell contains a literal UUID, API key string, or numeric collection/video id

### Pipeline correctness properties (PBT with mocked HTTP layer)

All four properties identified in the prework are suitable for property-based testing. The VideoDB HTTP layer must be mocked to keep tests cost-free and deterministic.

**Recommended PBT library**: `fast-check` (TypeScript), matching the project ecosystem.

**Minimum iterations**: 100 per property.

**Tag format**: `Feature: agenticgraph-videodb-api-reference, Property {N}: {property_text}`

| Property | PBT approach |
| --- | --- |
| 1 — Upload → Index → Search | Generate random video IDs and query words. Mock upload/index/search endpoints. Assert result set is non-empty when query word appears in mocked transcript. |
| 2 — Stream URL validity | Generate random video IDs. Mock stream endpoint returning various URL shapes. Assert extracted URL starts with `https://` or `http://` and is non-empty. |
| 3 — Transcription round-trip | Generate random video IDs and non-empty transcript strings. Mock async transcription create, polling loop, and GET retrieval. Assert returned text is non-empty. |
| 4 — Async polling termination | Generate random job IDs. Mock polling endpoint to always return non-terminal state. Assert harness calls endpoint ≤ 36 times and returns failure result. |

### Integration tests (live API, 1–3 examples)

These require a live `x-access-token` and are run manually or in a dedicated integration test environment:

- `GET /health` — verify the API is reachable and returns a healthy status
- `POST /collection` then `GET /collection/{id}` — verify collection create/read round-trip
- `POST /collection/{id}/upload` with a short test video → poll to completion → `GET /video/{id}` — verify ingest pipeline

### Demo validation

The runnable demo is validated as a Dev-only artifact:

- YAML frontmatter begins at byte offset 0 and parses cleanly
- `demo_status` states Dev/runtime-slot scope and `deployed_api_claim` is `false`
- Required nodes and API reference keys are present
- Endpoint templates include `{id}` placeholders rather than concrete IDs
- `api_key`, `collection_id`, `generation_job_id`, `video_id`, `index_job_id`, `stream_url`, `download_url`, and `publish_packet_path` are blank by default
- No generated prefixes such as `job-upload-`, `job-index-`, `job-generation-`, hardcoded stream hosts, or default collection IDs are present
- Renderer compatibility includes `2D Renderer: Storyboard` and `2D Renderer: Strybldr`
- The `json strybldr-storyboard` payload parses and contains the same agenticgraph-native workflow beats
