# Requirements Document

## Introduction

This spec defines requirements for generating `docs/documents/agentic-graph-api-reference/agentic-graph-videodb-api-reference.md` — a **spec-complete, runtime-ready** static SSOT + codebase map reference for agentic-graph's VideoDB integration slot in the `MainPanel Integrations` surface.

VideoDB (base URL: `https://api.videodb.io`, auth: `x-access-token` header) provides collections, video CRUD, streaming, transcription, semantic/keyword search over spoken-word and scene indexes, AI generation (video, audio, image, text, dub, translate), timeline compilation, async operation polling, RTStream, downloads, and utility endpoints. The TypeScript SSOT file exists at `canvas/src/features/integrations/videodbSsot.ts` for MainPanel Integrations runtime rendering; the CLI generator remains planned.

The spec also covers the runnable Dev demo at `$GITHUB_ROOT/huijoohwee/docs/agentic-graph-strybldr-demo.md`. This consolidated Strybldr demo is the local documentation/demo artifact for VideoDB. It SHALL NOT imply a Prod publish, Cloudflare deploy, or live route claim until the operator explicitly authorizes deployment.

The document must:
- Follow the exact `key | type | value | key-description | value-description | ssot | module | class | function` table format used by `agentic-graph-grabmaps-api-reference.md` and `agentic-graph-byteplus-openark-video-generation-api-reference.md`
- Include a YAML frontmatter block (required per PRD/TAD guidelines) and a agentic-graph VideoDB Integration Overlay section (following the Stripe overlay pattern)
- Be emittable by a planned CLI generator (`canvas/src/cli/generate-videodb-reference.ts`) from the SSOT TS file (`canvas/src/features/integrations/videodbSsot.ts`)
- Cover every VideoDB API surface area relevant to the agentic-graph `MainPanel Integrations` tab
- Forbid hardcoded runtime values (API keys, collection IDs, video IDs); all such values are operator-supplied settings
- Note async vs synchronous operation semantics and pipeline correctness properties

---

## Glossary

- **VideoDB**: The video intelligence cloud provider at `https://api.videodb.io` offering collections, video storage, indexing, semantic search, streaming, and AI generation capabilities.
- **SSOT**: Single Source of Truth. In agentic-graph, a TypeScript file under `canvas/src/features/integrations/` that exports typed `DOC_ROWS` arrays consumed by runtime panels and CLI doc generators.
- **Runtime SSOT**: A TS SSOT file that exists in the codebase and owns the rows consumed by the runtime surface.
- **DOC_ROW**: A typed object in an integration SSOT that maps one `key` to its `type`, `value`, `keyDescription`, `valueDescription`, `ssot`, `module`, `className`, and `functionName`.
- **MainPanel Integrations**: The `integrations` tab (key: `integrations`) in agentic-graph's MainPanel. Description: "Configure model, media, provider, and API readiness rows."
- **SettingsView**: The React component (`canvas/src/features/panels/views/SettingsView.tsx`) that renders integration rows in the MainPanel.
- **useSettingsView**: The hook (`canvas/src/features/panels/views/useSettingsView.ts`) that wires settings rows to the SettingsView renderer.
- **StoryboardWidget_Manager**: The widget registry manager (`canvas/src/features/storyboard-widget-manager/`) that consumes SSOT rows to populate NodeOverlayEditor and Workflow Manager widget fields.
- **VideodbSsot**: The TypeScript SSOT file at `canvas/src/features/integrations/videodbSsot.ts`.
- **CLI_Generator**: The planned generator script at `canvas/src/cli/generate-videodb-reference.ts` that emits the static markdown doc from the SSOT.
- **x-access-token**: The VideoDB authentication header. Operator-supplied value; must never be hardcoded in the repository.
- **Collection**: A VideoDB container grouping videos, audios, and images. Identified by a `collection_id` string.
- **Async_Operation**: A VideoDB operation that returns a job/task id and requires polling `GET /async-response/{id}` until `status` reaches a terminal state (`completed` or `failed`).
- **RTStream**: VideoDB's real-time streaming feature supporting create, start/stop, export, transcription, scene indexing, and event/alert operations.
- **VideoDB Configuration Reference Table**: The primary `key | type | value | ...` markdown table in the generated document.

---

## Requirements

### Requirement 1: Document Identity and Frontmatter Contract

**User Story:** As a agentic-graph developer, I want the VideoDB API reference to carry a complete, parseable YAML frontmatter block, so that doc tooling, renderers, and frontmatter validators can identify the document's type, status, and SSOT provenance without ambiguity.

#### Acceptance Criteria

1. THE Document SHALL begin with a valid YAML 1.2 frontmatter block starting at byte offset 0 (no preceding bytes), parseable by a strict YAML parser without warnings or repairs.
2. THE Frontmatter SHALL include all required fields: `title`, `doc_type`, `version` (semver), `status`, `created` (ISO 8601 date), `updated` (ISO 8601 date), `author`, `domain`, `lang` (BCP 47), `frontmatter_contract`, `ssot_upstream`, `planned_ssot_entrypoint`, `planned_cli_generator`, `related` (YAML sequence), and `tags` (YAML sequence).
3. IF any scalar field contains an inline `:` character, THEN THE Frontmatter SHALL enclose that scalar in quotes so strict YAML parsers read it deterministically.
4. THE Frontmatter `doc_type` field SHALL carry the value `"api-reference"`.
5. THE Frontmatter `status` field SHALL carry the value `"runtime-ready"` to signal that the MainPanel Integrations slot has a live TS SSOT.
6. THE Frontmatter `ssot_upstream` field SHALL carry the value `"https://docs.videodb.io/api-reference/introduction.md"`.
7. THE Frontmatter `planned_ssot_entrypoint` field SHALL carry the value `"canvas/src/features/integrations/videodbSsot.ts"`.
8. THE Frontmatter `planned_cli_generator` field SHALL carry the value `"canvas/src/cli/generate-videodb-reference.ts"`.
9. THE Frontmatter `related` YAML sequence SHALL include at least `"agentic-graph-byteplus-openark-video-generation-api-reference.md"` and `"agentic-graph-integrations-ssot-sync-directives.md"`.

---

### Requirement 2: Document Header and Integration Overlay Section

**User Story:** As a agentic-graph developer, I want the document to declare its upstream SSOT, codebase entrypoint, CLI generator, and how agentic-graph routes VideoDB through its integration surface, so that developers understand provenance, generation path, and acceptance boundaries at a glance.

#### Acceptance Criteria

1. THE Document SHALL open with an H1 heading containing the exact text `agentic-graph — VideoDB API Reference (SSOT + Codebase Map)`.
2. THE Document SHALL include an `SSOT:` line containing the value `https://docs.videodb.io/api-reference/introduction.md`.
3. THE Document SHALL include an `App SSOT entrypoint:` line containing the value `canvas/src/features/integrations/videodbSsot.ts`.
4. THE Document SHALL include a `Scope:` section that mentions `MainPanel Integrations`, `StoryboardWidget Manager`, and `NodeOverlayEditor` as the surfaces this reference covers.
5. THE Document SHALL include a `Table columns:` section that lists each of the nine columns by name (`key`, `type`, `value`, `key-description`, `value-description`, `ssot`, `module`, `class`, `function`) with a purpose description for each.
6. THE Document SHALL include a `## agentic-graph VideoDB Integration Overlay` section containing a table with columns `area | source | acceptance boundary` and at least five rows covering: auth credential handling, runtime SSOT entrypoint, planned CLI generator, SSOT sync directive, and operator-supplied runtime values policy.
7. THE Integration Overlay section SHALL contain text asserting that `x-access-token` is an operator-supplied value and SHALL contain text asserting it must not be hardcoded in the repository.
8. THE Document SHALL include a `## Async vs Synchronous Operation Notes` section that explicitly names at least one synchronous endpoint and at least one async endpoint as illustrative examples, and names `GET /async-response/{id}` as the shared polling endpoint.
9. THE Document SHALL include a `## Pipeline Correctness Properties` section containing at least the following three properties: (a) the upload → index → search pipeline invariant, (b) the stream URL validity property after `POST /video/{id}/stream/`, and (c) the transcription round-trip property and the async polling termination property.

---

### Requirement 3: Table Format Contract

**User Story:** As a agentic-graph developer or tooling author, I want every row in the reference table to follow the exact column format used by existing agentic-graph API reference docs, so that the table is machine-parseable, scannable, and consistent with the shared codebase map contract.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL use exactly nine columns in this order: `key | type | value | key-description | value-description | ssot | module | class | function`.
2. THE `key` column SHALL use lowercase dot-separated namespaced keys with the `videodb.` prefix (e.g. `videodb.api_key`, `videodb.collection.upload`, `videodb.video.search`).
3. THE `type` column SHALL use only values from: `string`, `boolean`, `integer`, `number`, `object`, `object[]`, `enum`, `endpoint`, `url`, `panel`.
4. THE `value` column SHALL carry either a concise default value (≤ 80 characters), `"Required. [description]"` for required operator-supplied fields, or the HTTP method + path for endpoint rows (e.g. `POST /collection`); all three forms are acceptable.
5. THE `key-description` column SHALL follow the format `[Role] -> [action] -> [effect on agentic-graph]` for every non-endpoint row; for endpoint rows it SHALL follow `[Role] -> [action] -> [effect]`.
6. THE `value-description` column SHALL follow the format `Default: [x]; [expansion note]; [contraction note]` for configurable-value rows; for endpoint rows it SHALL contain a description of what calling the endpoint does; for rows that are neither configurable nor endpoints, it SHALL contain a non-empty description of the field's significance.
7. THE `ssot` column SHALL carry a full upstream URL followed by ` :: [section label]` (e.g. `https://docs.videodb.io/api-reference/introduction.md :: Authentication`).
8. THE `module` column SHALL list module paths as semicolon-separated backtick-quoted strings (e.g. `` `canvas/src/features/integrations/videodbSsot.ts` ``).
9. THE `class` column SHALL list TypeScript class or type names; IF no class applies to a row, THEN the cell SHALL contain a single dash (`-`).
10. THE `function` column SHALL list function names; IF no function applies to a row, THEN the cell SHALL contain a single dash (`-`).
11. THE Table rows SHALL be sorted ascending a-z by `key`.
12. IF a `value` cell contains a pipe character `|`, THEN THE Document SHALL escape it as `\|` so markdown table parsers read the cell boundary correctly.

---

### Requirement 4: Auth and Configuration Rows

**User Story:** As a agentic-graph operator, I want the reference to document the VideoDB authentication header and base URL configuration rows, so that I understand how to supply credentials and where they are consumed in the runtime integration.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.api_key` of type `string` whose `key-description` cell and `value` cell both reference the credential.
2. THE `videodb.api_key` row `value` cell SHALL contain the text `"Required. Operator-supplied. Never hardcode."`.
3. THE `videodb.api_key` `key-description` cell SHALL follow the `[Role] -> [action] -> [effect]` format where the Role token, action token, and effect token are each non-empty strings, and the effect token SHALL explicitly name the string `x-access-token`.
4. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.base_url` of type `url` whose `value` cell contains exactly `https://api.videodb.io`.
5. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.docs_url` of type `url` whose `value` cell contains exactly `https://docs.videodb.io/api-reference/introduction.md`.

---

### Requirement 5: Collections API Rows

**User Story:** As a agentic-graph developer, I want the reference to document every Collections endpoint that is relevant to the agentic-graph integration surface, so that the runtime SSOT can be authored against a complete row set.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.collection.create` of type `endpoint` with `value` cell containing `POST /collection`.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.collection.delete` of type `endpoint` with `value` cell containing `DELETE /collection/{id}`.
3. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.collection.get` of type `endpoint` with `value` cell containing `GET /collection/{id}`.
4. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.collection.list` of type `endpoint` with `value` cell containing `GET /collection`.
5. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.collection.search` of type `endpoint` with `value` cell containing `GET /collection/{id}/search`.
6. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.collection.upload` of type `endpoint` with `value` cell containing `POST /collection/{id}/upload`.
7. IF the VideoDB Configuration Reference Table includes a row for `videodb.collection.upload`, THEN THE `key-description` cell for that row SHALL contain text stating that the operation is asynchronous, that the caller must poll to retrieve the result, and that the polling endpoint is `GET /async-response/{id}`.

---

### Requirement 6: Videos API Rows

**User Story:** As a agentic-graph developer, I want the reference to document every Videos endpoint relevant to the integration surface, so that video CRUD and streaming rows are covered in the runtime SSOT.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.delete` of type `endpoint` with `value` cell containing `DELETE /video/{id}`.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.get` of type `endpoint` with `value` cell containing `GET /video/{id}`.
3. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.list` of type `endpoint` with `value` cell containing `GET /collection/{id}/video`.
4. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.update` of type `endpoint` with `value` cell containing `PUT /video/{id}`.
5. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.stream` of type `endpoint` with `value` cell containing `POST /video/{id}/stream/`.
6. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.stream.format` of type `enum` with `value` cell containing `mp4 \| webm \| hls`.
7. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.stream.quality` of type `enum` with `value` cell containing `low \| medium \| high`.
8. IF the VideoDB Configuration Reference Table includes a row for `videodb.video.stream`, THEN THE `key-description` cell for that row SHALL contain text stating that the response is a stream URL, and SHALL contain text stating that after a request made with a valid video ID the returned URL must be a non-empty string.

---

### Requirement 7: Transcription API Rows

**User Story:** As a agentic-graph developer, I want the reference to document the transcription create and get endpoints, so that the runtime SSOT covers the spoken-word pipeline entry point.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.transcription.create` of type `endpoint` with `value` cell containing `POST /video/{id}/transcription`.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.transcription.get` of type `endpoint` with `value` cell containing `GET /video/{id}/transcription`.
3. IF the VideoDB Configuration Reference Table includes a row for `videodb.transcription.create`, THEN THE `key-description` cell for that row SHALL contain text stating that the operation is asynchronous and that the caller must poll `GET /async-response/{id}` to retrieve the result.

---

### Requirement 8: Indexing API Rows

**User Story:** As a agentic-graph developer, I want the reference to document the spoken-word and scene indexing endpoints, so that the runtime SSOT captures the index creation surface used by the search pipeline.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.index.spoken_word` of type `endpoint` with `value` cell containing `POST /video/{id}/index/`.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.index.scene` of type `endpoint` with `value` cell containing `POST /video/{id}/index/scene/`.
3. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.index.scene.scene_type` of type `enum` with `value` cell containing `shot \| time_based`.
4. IF the VideoDB Configuration Reference Table includes a row for `videodb.index.spoken_word`, THEN THE `key-description` cell SHALL contain text stating that the operation is asynchronous and that spoken-word search cannot be executed before this index is created.
5. IF the VideoDB Configuration Reference Table includes a row for `videodb.index.scene`, THEN THE `key-description` cell SHALL contain text stating that the operation is asynchronous and that scene search cannot be executed before this index is created.

---

### Requirement 9: Search API Rows

**User Story:** As a agentic-graph developer, I want the reference to document the video search endpoint and its parameter rows, so that the runtime SSOT covers the full search invocation surface.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.search` of type `endpoint` with `value` cell containing `POST /video/{id}/search/`.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.search.index_type` of type `enum` with `value` cell containing `spoken_word \| scene`.
3. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.search.query` of type `string` whose `value-description` cell states that the field is required and that its value is capped at 500 characters.
4. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.search.result_threshold` of type `integer` whose `value-description` cell documents a valid range of 1–100 inclusive.
5. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.search.score_threshold` of type `number` whose `value-description` cell documents a valid range of 0.0–1.0 inclusive.
6. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.search.search_type` of type `enum` with `value` cell containing `semantic \| keyword`.
7. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.video.search.stitch` of type `boolean` whose `value-description` cell documents a default value of `false`.

---

### Requirement 10: AI Generation Rows

**User Story:** As a agentic-graph developer, I want the reference to document the AI generation endpoints (video, audio, image, text, dub, translate), so that the runtime SSOT covers the generative pipeline surface.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.ai.dub_video` of type `endpoint` with `value` cell containing the HTTP method and path for the dub video endpoint.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.ai.generate_audio` of type `endpoint` with `value` cell containing the HTTP method and path for the generate audio endpoint.
3. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.ai.generate_image` of type `endpoint` with `value` cell containing the HTTP method and path for the generate image endpoint.
4. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.ai.generate_text` of type `endpoint` with `value` cell containing the HTTP method and path for the generate text endpoint.
5. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.ai.generate_video` of type `endpoint` with `value` cell containing the HTTP method and path for the generate video endpoint.
6. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.ai.translate_video` of type `endpoint` with `value` cell containing the HTTP method and path for the translate video endpoint.
7. FOR EACH AI generation endpoint row, THE `key-description` cell SHALL contain either the text "async" or the text "asynchronous" to indicate the operation does not return the generated asset in the response, and SHALL state the effect on the agentic-graph generative pipeline.

---

### Requirement 11: Timeline and Compilation Rows

**User Story:** As a agentic-graph developer, I want the reference to document the timeline compile and create endpoints, so that the runtime SSOT captures the compilation surface for assembling search results into streams.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.timeline.compile` of type `endpoint` with `value` cell containing `POST /timeline/compile`.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.timeline.create` of type `endpoint` with `value` cell containing `POST /timeline`.
3. IF the VideoDB Configuration Reference Table includes a row for `videodb.timeline.compile`, THEN THE `key-description` cell SHALL contain text stating that the endpoint assembles search result clips into a compiled stream, and SHALL contain text stating that a usable stream URL is only available after a response indicating success.

---

### Requirement 12: Async Response Polling Row

**User Story:** As a agentic-graph developer, I want the reference to document the async response polling endpoint, so that the runtime SSOT has an explicit row for the shared async completion pattern used by upload, transcription, indexing, and generation operations.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.async_response.get` of type `endpoint` with `value` cell containing `GET /async-response/{id}`.
2. THE `videodb.async_response.get` `key-description` cell SHALL contain text identifying its role as the shared polling endpoint for operations that return a job id, and SHALL name at least four covered operations: upload, transcription creation, index creation, and AI generation.
3. THE `videodb.async_response.get` `value-description` cell SHALL state that polling continues until `status` reaches one of the terminal states `completed` or `failed`, SHALL state a maximum bound of 60 poll iterations, and SHALL state a minimum polling interval of 2 seconds per iteration.

---

### Requirement 13: RTStream Rows

**User Story:** As a agentic-graph developer, I want the reference to document the core RTStream endpoints (create, start, stop, export), so that the runtime SSOT has a baseline real-time streaming row set.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.rtstream.create` of type `endpoint` with `value` cell containing `POST /rtstream`.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.rtstream.export` of type `endpoint` with `value` cell containing `POST /rtstream/{id}/export`.
3. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.rtstream.start` of type `endpoint` with `value` cell containing `POST /rtstream/{id}/status` (or the documented start path).
4. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.rtstream.stop` of type `endpoint` with `value` cell containing `POST /rtstream/{id}/status` (or the documented stop path).
5. FOR EACH RTStream endpoint row, THE `key-description` cell SHALL contain a non-empty description stating what the endpoint does to the live streaming pipeline.

---

### Requirement 14: Downloads Rows

**User Story:** As a agentic-graph developer, I want the reference to document the download job create and polling endpoints, so that the runtime SSOT covers the asset retrieval pipeline.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.download.create` of type `endpoint` with `value` cell containing `POST /download`.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.download.get` of type `endpoint` with `value` cell containing `GET /download/{id}`.
3. IF the VideoDB Configuration Reference Table includes a row for `videodb.download.create`, THEN THE `key-description` cell SHALL contain text stating that the operation is asynchronous and that the caller must poll `GET /async-response/{id}` to retrieve the download result.

---

### Requirement 15: Utility Rows

**User Story:** As a agentic-graph developer, I want the reference to document utility endpoints (health check and chat), so that the runtime SSOT captures readiness and conversational query entry points.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.health` of type `endpoint` with `value` cell containing `GET /health`.
2. THE VideoDB Configuration Reference Table SHALL include a row with key `videodb.chat` of type `endpoint` with `value` cell containing `POST /chat`.
3. IF the VideoDB Configuration Reference Table includes a row for `videodb.health`, THEN THE `key-description` cell SHALL contain text stating that this endpoint is used for readiness checks in the `MainPanel Integrations` surface.

---

### Requirement 16: No Hardcodes Directive

**User Story:** As a agentic-graph operator, I want the reference to explicitly state that all runtime values are operator-supplied settings, so that contributors do not embed literal API keys, collection IDs, or video IDs anywhere in the document or the runtime SSOT.

#### Acceptance Criteria

1. THE Integration Overlay section SHALL contain text asserting that `x-access-token` values, collection IDs, and video IDs are operator-supplied settings and are never hardcoded in the repository.
2. THE Integration Overlay section SHALL contain text asserting the directive: literal `x-access-token` values, collection IDs, and video IDs must not be embedded in the repository.
3. THE `videodb.api_key` row `value` cell SHALL contain the text `"Required. Operator-supplied. Never hardcode."`.
4. IF a `value` cell in the VideoDB Configuration Reference Table contains a string that is neither a URL, nor a method+path, nor a placeholder containing `{`, nor a default enum value, nor a boolean literal, nor a numeric literal, THEN THE cell SHALL contain the text `"Operator-supplied at runtime."` rather than a concrete identifier.

---

### Requirement 17: Async vs Synchronous Notes Section

**User Story:** As a agentic-graph developer, I want the reference to include a dedicated section distinguishing async from synchronous VideoDB operations, so that the runtime integration harness can be designed with the correct polling and circuit-breaker patterns.

#### Acceptance Criteria

1. THE Document SHALL include a `## Async vs Synchronous Operation Notes` section.
2. THE Section SHALL list the following as synchronous at the HTTP API boundary: `GET /collection`, `POST /collection`, `GET /collection/{id}`, `DELETE /collection/{id}`, `GET /collection/{id}/video`, `GET /video/{id}`, `DELETE /video/{id}`, `PUT /video/{id}`, `POST /video/{id}/stream/`, `GET /video/{id}/transcription`, `GET /health`, `POST /chat`, and `GET /async-response/{id}` itself.
3. THE Section SHALL list the following as async (returns a job id requiring polling): `POST /collection/{id}/upload`, `POST /video/{id}/transcription`, `POST /video/{id}/index/`, `POST /video/{id}/index/scene/`, AI generation endpoints (`generate_video`, `generate_audio`, `generate_image`, `generate_text`, `dub_video`, `translate_video`), `POST /timeline/compile`, download create, and RTStream start and stop.
4. THE Section SHALL name `GET /async-response/{id}` as the shared polling endpoint for all async operations.
5. THE Section SHALL state a firm maximum polling bound of 36 iterations at 10-second intervals (matching the Gemini Veo harness pattern in the codebase) and SHALL state that polling MUST stop and return a failure result when this bound is reached.

---

### Requirement 18: Pipeline Correctness Properties Section

**User Story:** As a agentic-graph developer or QA author, I want the reference to document correctness properties for the key VideoDB pipelines, so that property-based and integration tests can be anchored to verifiable invariants.

#### Acceptance Criteria

1. THE Document SHALL include a `## Pipeline Correctness Properties` section.
2. THE Section SHALL state the upload → index → search pipeline completeness invariant: for any uploaded video, calling `POST /video/{id}/index/` followed by `POST /video/{id}/search/` with `index_type: spoken_word` SHALL return a result set with at least one item when the transcript contains at least one word matching the query.
3. THE Section SHALL state the stream URL validity property: after a successful `POST /video/{id}/stream/` call, the returned stream URL SHALL be a non-empty string beginning with `https://` or `http://`.
4. THE Section SHALL state the transcription round-trip property: `GET /video/{id}/transcription` after the corresponding `POST /video/{id}/transcription` async operation reaches terminal state SHALL return a transcription object whose text content is non-empty for any video with audible speech.
5. THE Section SHALL state the async polling termination property: all async operations polled via `GET /async-response/{id}` SHALL reach `completed` or `failed` status within 36 poll iterations at 10-second intervals; polling SHALL terminate at the bound and return a failure result rather than looping indefinitely.
6. THE Section SHALL classify each property as either "suitable for property-based testing with mocked HTTP layer" or "requires live VideoDB API (integration test)".
7. WHERE a property is classified as suitable for property-based testing, THE Section SHALL note that the VideoDB HTTP layer must be mocked to keep tests cost-free.

---

### Requirement 19: Row Coverage Completeness

**User Story:** As a agentic-graph developer, I want the reference table to be complete enough to author the runtime SSOT without revisiting the upstream docs for the core integration surface, so that the document functions as a self-contained codebase map for the VideoDB integration slot.

#### Acceptance Criteria

1. THE VideoDB Configuration Reference Table SHALL contain at minimum 45 rows covering: auth (2), docs reference (1), collections CRUD + upload + search (6), videos CRUD + stream + stream params (7), transcription (2), indexing (3), search + search params (7), AI generation (6), timeline (2), async polling (1), RTStream (4), downloads (2), utility (2), and at least 2 additional rows for other VideoDB surfaces (e.g. assets, transcode, editor).
2. THE Table rows SHALL be sorted a-z by `key` across the entire table (not grouped by API section).
3. FOR ALL rows, THE `ssot` cell SHALL contain a `::` separator followed by a non-empty section label referencing the relevant section of the VideoDB API docs.
4. FOR ALL rows, THE `module` cell SHALL reference `canvas/src/features/integrations/videodbSsot.ts` as the primary runtime module.
5. FOR ALL rows, THE `class` cell SHALL contain either a TypeScript type name of the form `Videodb[Role]Row` or a single dash (`-`) where no class applies.
6. FOR ALL rows, THE `function` cell SHALL contain either a camelCase function name following the verb-noun convention (e.g. `uploadVideo`, `indexSpokenWord`, `searchVideo`, `getStreamUrl`) or a single dash (`-`) where no function applies.

---

### Requirement 20: Runnable Dev Demo Contract

**User Story:** As a agentic-graph operator, I want a runnable Dev demo markdown file for VideoDB, so that I can import a agentic-graph brief -> generated video -> indexed review -> publish packet flow locally without embedding credentials, IDs, or fake runtime outputs in the repository.

#### Acceptance Criteria

1. THE VideoDB workflow SHALL live inside `$GITHUB_ROOT/huijoohwee/docs/agentic-graph-strybldr-demo.md`, and the legacy standalone `agentic-graph-videodb-demo.md` SHALL NOT exist.
2. THE demo SHALL declare `demo_status` as a Dev/runtime-slot demo and SHALL set `deployed_api_claim` to `false`.
3. THE demo SHALL include flow nodes for `agentic-graph.content_brief`, `videodb.health`, `videodb.collection.list`, `videodb.ai.generate_video`, `videodb.async_response.get`, `videodb.index.spoken_word`, `videodb.video.search`, `videodb.video.stream`, and `agentic-graph.publish_packet`.
4. THE demo SHALL include the exact endpoint templates `POST /video/{id}/generate/video`, `POST /video/{id}/index/`, `POST /video/{id}/search/`, and `POST /video/{id}/stream/`.
5. THE demo SHALL keep `api_key`, `collection_id`, `generation_job_id`, `video_id`, `index_job_id`, `stream_url`, `download_url`, and `publish_packet_path` blank by default and SHALL state that these values are operator-supplied or returned by live VideoDB calls at runtime.
6. THE demo SHALL NOT fabricate collection IDs, job IDs, video IDs, or stream URLs with hardcoded prefixes, default identifiers, or mock URL hosts.
7. THE demo SHALL document the async circuit-breaker as 36 iterations at 10-second intervals and SHALL state that polling returns failure instead of looping indefinitely on exhaustion.
8. THE demo SHALL NOT assert Prod or Cloudflare availability and SHALL NOT require deployment to `airvio.co` or `airvio.co/agentic-graph`.
9. THE demo SHALL declare renderer compatibility for `2D Renderer: Storyboard` and `2D Renderer: Strybldr` without forking source data per renderer.
10. THE demo SHALL include Storyboard-compatible neutral aliases on `flow.nodes[*]` and a parseable `json strybldr-storyboard` fenced payload for Strybldr direct-open validation.
11. THE demo SHALL use a agentic-graph-native workflow and SHALL NOT contain copied external workflow-platform or external notes-database terms from the inspiration document.
