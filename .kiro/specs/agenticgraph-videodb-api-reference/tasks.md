# Implementation Plan: agenticgraph VideoDB API Reference

## Overview

The reference document has already been written to `docs/documents/agenticgraph-api-reference/agenticgraph-videodb-api-reference.md`. This plan validates that document against all 20 requirements, validates the runnable Dev demo, registers the VideoDB pipeline in the SSOT sync directives file, wires the runtime TypeScript SSOT into MainPanel Integrations, and leaves only the CLI generator as planned work.

---

## Tasks

### Phase 0 — Runnable Dev Demo

- [ ] 0. Create and validate runnable Dev demo
  - [ ] 0.1 Consolidate the VideoDB renderer-neutral markdown workspace into `$GITHUB_ROOT/huijoohwee/docs/agenticgraph-strybldr-demo.md` for agenticgraph brief -> VideoDB generation -> async poll -> spoken-word index -> review search -> stream -> local publish packet
    - Keep `demo_status` scoped to Dev/runtime-slot behavior
    - Set `deployed_api_claim: false`
    - Reference the API table keys for every flow node
    - Declare compatibility with `2D Renderer: Storyboard` and `2D Renderer: Strybldr`
    - _Requirements: 20.1, 20.2, 20.3, 20.9_

  - [ ] 0.2 Validate the demo runtime-value contract
    - Assert endpoint templates use `{id}` placeholders: `POST /video/{id}/generate/video`, `POST /video/{id}/index/`, `POST /video/{id}/search/`, and `POST /video/{id}/stream/`
    - Assert `api_key`, `collection_id`, `generation_job_id`, `video_id`, `index_job_id`, `stream_url`, `download_url`, and `publish_packet_path` are blank by default
    - Assert the file contains no fabricated runtime values such as generated job prefixes, generated video IDs, hardcoded stream hosts, default collection identifiers, Prod route claims, or Cloudflare deploy claims
    - Assert the async circuit-breaker is documented as 36 iterations at 10-second intervals with failure on exhaustion
    - Assert Storyboard aliases exist on `flow.nodes[*]`, the `json strybldr-storyboard` payload parses, and external workflow-platform / notes-database terms from the inspiration document are absent
    - _Requirements: 20.4, 20.5, 20.6, 20.7, 20.8, 20.10, 20.11_

### Phase 1 — Document Validation (already-written reference file)

- [ ] 1. Validate YAML frontmatter (Req 1)
  - [ ] 1.1 Write a frontmatter parser script (`scripts/validate-videodb-frontmatter.ts`) that parses the YAML block at byte offset 0, verifies it contains all 15 required fields (`title`, `doc_type`, `version`, `status`, `created`, `updated`, `author`, `domain`, `lang`, `frontmatter_contract`, `ssot_upstream`, `planned_ssot_entrypoint`, `planned_cli_generator`, `related`, `tags`), and asserts each scalar is non-empty
    - Verify `status` equals `"runtime-ready"` (Req 1.5)
    - Verify `ssot_upstream` equals `"https://docs.videodb.io/api-reference/introduction.md"` (Req 1.6)
    - Verify `planned_ssot_entrypoint` equals `"canvas/src/features/integrations/videodbSsot.ts"` (Req 1.7)
    - Verify `planned_cli_generator` equals `"canvas/src/cli/generate-videodb-reference.ts"` (Req 1.8)
    - Verify `related` sequence includes both `"agenticgraph-byteplus-openark-video-generation-api-reference.md"` and `"agenticgraph-integrations-ssot-sync-directives.md"` (Req 1.9)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [ ] 1.2 Run the frontmatter validator against the reference file and assert exit code 0
    - Acceptance criterion: verify all 15 fields present, `status: "runtime-ready"`, correct `ssot_upstream`, `planned_ssot_entrypoint`, `planned_cli_generator`, and both `related` cross-references by running `npx ts-node scripts/validate-videodb-frontmatter.ts`
    - _Requirements: 1.1–1.9_

- [ ] 2. Validate document header and overlay section (Req 2)
  - [ ] 2.1 Write a header validator (`scripts/validate-videodb-header.ts`) that reads the markdown file and asserts: H1 contains exact text `agenticgraph — VideoDB API Reference (SSOT + Codebase Map)`, SSOT line contains `https://docs.videodb.io/api-reference/introduction.md`, scope section mentions `MainPanel Integrations`, `StoryboardWidget Manager`, `NodeOverlayEditor`, table columns legend lists all nine column names, and the `## agenticgraph VideoDB Integration Overlay` table has ≥ 5 rows
    - Verify auth/no-hardcode assertion present in overlay section (Req 2.7)
    - Verify `## Async vs Synchronous Operation Notes` section exists with at least one sync and one async endpoint named, and `GET /async-response/{id}` is named as the shared polling endpoint (Req 2.8)
    - Verify `## Pipeline Correctness Properties` section exists with at least three properties: upload → index → search, stream URL validity, transcription round-trip, and async polling termination (Req 2.9)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [ ] 2.2 Run the header validator and assert exit code 0
    - Acceptance criterion: verify H1 text, SSOT line, scope, legend, ≥5 overlay rows, auth/no-hardcode text, async notes section, and correctness properties section all present
    - _Requirements: 2.1–2.9_

- [ ] 3. Validate table format contract (Req 3)
  - [ ] 3.1 Write a table format validator (`scripts/validate-videodb-table-format.ts`) that parses the reference table and checks: exactly 9 columns in declared order, every `key` starts with `videodb.`, every `type` cell is one of the allowed values, every `value` cell is ≤ 80 characters, every `key-description` cell follows `[Role] -> [action] -> [effect]` format, every `value-description` cell is non-empty, every `ssot` cell contains ` :: ` with a non-empty section label, every `module` cell contains backtick-wrapped paths, every `class` cell is a `Videodb*Row` name or `-`, every `function` cell is camelCase or `-`, rows are sorted a-z by `key`, and no cell contains a bare unescaped `|`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

  - [ ] 3.2 Run the table format validator and assert exit code 0
    - Acceptance criterion: all format contract checks pass; pipe escaping verified across all 48+ rows
    - _Requirements: 3.1–3.12_

- [ ] 4. Validate auth and config rows (Req 4)
  - [ ] 4.1 Write a targeted row validator (`scripts/validate-videodb-auth-rows.ts`) that locates and asserts: `videodb.api_key` type is `string`, value contains exact text `"Required. Operator-supplied. Never hardcode."`, key-description names `x-access-token`; `videodb.base_url` type is `url`, value is exactly `https://api.videodb.io`; `videodb.docs_url` type is `url`, value is exactly `https://docs.videodb.io/api-reference/introduction.md`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 4.2 Run the auth row validator and assert exit code 0
    - Acceptance criterion: all three auth/config rows present with exact required values
    - _Requirements: 4.1–4.5_

- [ ] 5. Validate collections rows (Req 5)
  - [ ] 5.1 Write a collections row validator (`scripts/validate-videodb-collections-rows.ts`) that asserts all six collection rows exist with exact keys and HTTP method+path values; verifies `videodb.collection.upload` key-description contains "asynchronous" (or "async"), mentions polling, and names `GET /async-response/{id}`
    - Keys: `videodb.collection.create`, `videodb.collection.delete`, `videodb.collection.get`, `videodb.collection.list`, `videodb.collection.search`, `videodb.collection.upload`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ] 5.2 Run the collections validator and assert exit code 0
    - _Requirements: 5.1–5.7_

- [ ] 6. Validate videos rows (Req 6)
  - [ ] 6.1 Write a videos row validator (`scripts/validate-videodb-videos-rows.ts`) that asserts all seven video rows exist; verifies `videodb.video.stream` key-description states the response is a stream URL and that the URL must be a non-empty string
    - Keys: `videodb.video.delete`, `videodb.video.get`, `videodb.video.list`, `videodb.video.update`, `videodb.video.stream`, `videodb.video.stream.format`, `videodb.video.stream.quality`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ] 6.2 Run the videos validator and assert exit code 0
    - _Requirements: 6.1–6.8_

- [ ] 7. Validate transcription rows (Req 7)
  - [ ] 7.1 Write a transcription row validator (`scripts/validate-videodb-transcription-rows.ts`) that asserts both transcription rows exist and that `videodb.transcription.create` key-description contains "async" or "asynchronous" and names `GET /async-response/{id}` as the polling endpoint
    - Keys: `videodb.transcription.create`, `videodb.transcription.get`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 7.2 Run the transcription validator and assert exit code 0
    - _Requirements: 7.1–7.3_

- [ ] 8. Validate indexing rows (Req 8)
  - [ ] 8.1 Write an indexing row validator (`scripts/validate-videodb-indexing-rows.ts`) that asserts all three indexing rows exist; verifies `videodb.index.spoken_word` key-description contains "async" and states spoken-word search requires this index; verifies `videodb.index.scene` key-description contains "async" and states scene search requires this index
    - Keys: `videodb.index.spoken_word`, `videodb.index.scene`, `videodb.index.scene.scene_type`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 8.2 Run the indexing validator and assert exit code 0
    - _Requirements: 8.1–8.5_

- [ ] 9. Validate search rows (Req 9)
  - [ ] 9.1 Write a search row validator (`scripts/validate-videodb-search-rows.ts`) that asserts all seven search rows exist; verifies `videodb.video.search.query` value-description states 500-character cap; `videodb.video.search.result_threshold` documents range 1–100; `videodb.video.search.score_threshold` documents range 0.0–1.0; `videodb.video.search.stitch` documents default `false`
    - Keys: `videodb.video.search`, `videodb.video.search.index_type`, `videodb.video.search.query`, `videodb.video.search.result_threshold`, `videodb.video.search.score_threshold`, `videodb.video.search.search_type`, `videodb.video.search.stitch`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ] 9.2 Run the search validator and assert exit code 0
    - _Requirements: 9.1–9.7_

- [ ] 10. Validate AI generation rows (Req 10)
  - [ ] 10.1 Write an AI generation row validator (`scripts/validate-videodb-ai-rows.ts`) that asserts all six AI rows exist and that every AI row key-description contains "async" or "asynchronous"
    - Keys: `videodb.ai.dub_video`, `videodb.ai.generate_audio`, `videodb.ai.generate_image`, `videodb.ai.generate_text`, `videodb.ai.generate_video`, `videodb.ai.translate_video`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ] 10.2 Run the AI generation validator and assert exit code 0
    - _Requirements: 10.1–10.7_

- [ ] 11. Validate timeline rows (Req 11)
  - [ ] 11.1 Write a timeline row validator (`scripts/validate-videodb-timeline-rows.ts`) that asserts both timeline rows exist and that `videodb.timeline.compile` key-description states the endpoint assembles clips into a compiled stream and that the stream URL is only available after success
    - Keys: `videodb.timeline.compile`, `videodb.timeline.create`
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ] 11.2 Run the timeline validator and assert exit code 0
    - _Requirements: 11.1–11.3_

- [ ] 12. Validate async polling row (Req 12)
  - [ ] 12.1 Write an async polling row validator (`scripts/validate-videodb-async-row.ts`) that asserts `videodb.async_response.get` exists with type `endpoint` and value `GET /async-response/{id}`; key-description names upload, transcription creation, index creation, and AI generation as covered operations; value-description states terminal states `completed` / `failed`, a maximum bound of 60 poll iterations, and a minimum interval of 2 seconds
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ] 12.2 Run the async polling validator and assert exit code 0
    - _Requirements: 12.1–12.3_

- [ ] 13. Validate RTStream rows (Req 13)
  - [ ] 13.1 Write an RTStream row validator (`scripts/validate-videodb-rtstream-rows.ts`) that asserts all four RTStream rows exist with non-empty key-descriptions describing their live-streaming pipeline role
    - Keys: `videodb.rtstream.create`, `videodb.rtstream.export`, `videodb.rtstream.start`, `videodb.rtstream.stop`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ] 13.2 Run the RTStream validator and assert exit code 0
    - _Requirements: 13.1–13.5_

- [ ] 14. Validate downloads rows (Req 14)
  - [ ] 14.1 Write a downloads row validator (`scripts/validate-videodb-downloads-rows.ts`) that asserts both download rows exist and that `videodb.download.create` key-description states the operation is asynchronous and names `GET /async-response/{id}` as the polling endpoint
    - Keys: `videodb.download.create`, `videodb.download.get`
    - _Requirements: 14.1, 14.2, 14.3_

  - [ ] 14.2 Run the downloads validator and assert exit code 0
    - _Requirements: 14.1–14.3_

- [ ] 15. Validate utility rows (Req 15)
  - [ ] 15.1 Write a utility row validator (`scripts/validate-videodb-utility-rows.ts`) that asserts both utility rows exist and that `videodb.health` key-description contains text referencing `MainPanel Integrations` readiness
    - Keys: `videodb.health`, `videodb.chat`
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ] 15.2 Run the utility validator and assert exit code 0
    - _Requirements: 15.1–15.3_

- [ ] 16. Validate no-hardcodes directive (Req 16)
  - [ ] 16.1 Write a no-hardcodes validator (`scripts/validate-videodb-no-hardcodes.ts`) that scans the entire reference file and asserts: overlay section contains the no-hardcode assertion; `videodb.api_key` value cell contains exactly `"Required. Operator-supplied. Never hardcode."`; no value cell in the table contains a string that looks like a concrete API key, UUID, numeric collection ID, or video ID (i.e., no 32+ character hex strings, no pure digit strings > 6 chars that are not a URL fragment)
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [ ] 16.2 Run the no-hardcodes validator and assert exit code 0
    - _Requirements: 16.1–16.4_

- [ ] 17. Validate async vs sync section (Req 17)
  - [ ] 17.1 Write an async notes validator (`scripts/validate-videodb-async-notes.ts`) that asserts the `## Async vs Synchronous Operation Notes` section exists; the synchronous list includes all 13 declared sync endpoints; the async list includes `POST /collection/{id}/upload`, `POST /video/{id}/transcription`, `POST /video/{id}/index/`, `POST /video/{id}/index/scene/`, six AI generation endpoints, `POST /timeline/compile`, download create, RTStream start, and RTStream stop; `GET /async-response/{id}` is named as the shared polling endpoint; the section states the firm 36-iteration bound and that polling must stop and return failure at that bound
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [ ] 17.2 Run the async notes validator and assert exit code 0
    - _Requirements: 17.1–17.5_

- [ ] 18. Validate pipeline correctness properties section (Req 18)
  - [ ] 18.1 Write a correctness properties validator (`scripts/validate-videodb-properties-section.ts`) that asserts the `## Pipeline Correctness Properties` section exists; contains Property 1 (upload → index → search completeness); contains Property 2 (stream URL validity); contains Property 3 (transcription round-trip); contains Property 4 (async polling termination); each property is classified as "suitable for property-based testing" or "requires live VideoDB API"; each PBT-suitable property notes the HTTP layer must be mocked
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

  - [ ] 18.2 Run the properties section validator and assert exit code 0
    - _Requirements: 18.1–18.7_

- [ ] 19. Validate row coverage completeness (Req 19)
  - [ ] 19.1 Write a coverage validator (`scripts/validate-videodb-coverage.ts`) that counts total rows (assert ≥ 45), verifies rows are sorted a-z by `key`, verifies every `ssot` cell contains ` :: ` with a non-empty label, verifies every `module` cell references `canvas/src/features/integrations/videodbSsot.ts`, verifies every `class` cell is either a `Videodb*Row` name or `-`, verifies every `function` cell is either camelCase or `-`
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

  - [ ] 19.2 Run the coverage validator and assert exit code 0
    - _Requirements: 19.1–19.6_

- [ ] 20. Phase 1 Checkpoint — all document validation scripts pass
  - Run all Phase 1 validators in sequence; ensure every script exits with code 0. Ask the user if any validation fails unexpectedly.

---

### Phase 2 — Property-Based Tests (PBT with `fast-check`)

- [ ] 21. Write PBT for Property 1 — Upload → Index → Search Pipeline Completeness
  - [ ] 21.1 Create `canvas/src/__tests__/videodb/pbt-property1-upload-index-search.test.ts`
    - Import `fast-check`; mock the VideoDB HTTP layer (fetch or axios adapter) for `POST /collection/{id}/upload`, `GET /async-response/{id}`, `POST /video/{id}/index/`, and `POST /video/{id}/search/`
    - Generate random video IDs and transcript word lists using `fc.array(fc.string({ minLength: 3, maxLength: 12 }))`; pick a random word as the query
    - Mock upload returns a job id; polling returns `status: "completed"` with the mocked video id; index returns a job id that resolves to `completed`; search returns a result list containing the query word
    - **Property 1: For any uploaded video whose transcript contains at least one word matching the query, the search result set SHALL be non-empty**
    - **Validates: Requirements 18.2**
    - Run at minimum 100 iterations (`fc.assert(fc.property(...), { numRuns: 100 })`)
    - _Requirements: 18.2_

  - [ ]* 21.2 Run Property 1 PBT suite and verify all 100 iterations pass
    - _Requirements: 18.2_

- [ ] 22. Write PBT for Property 2 — Stream URL Validity
  - [ ] 22.1 Create `canvas/src/__tests__/videodb/pbt-property2-stream-url.test.ts`
    - Import `fast-check`; mock `POST /video/{id}/stream/` to return various URL-shaped strings (including `https://`, `http://`, and invalid shapes like empty string or bare paths)
    - Generate random video IDs using `fc.uuidV(4)` or `fc.string()`
    - Assert the agenticgraph response parser only accepts and forwards URLs that begin with `https://` or `http://` and are non-empty strings; assert invalid shapes cause a rejection / error result
    - **Property 2: For any valid video ID, after a successful stream call, the URL SHALL begin with `https://` or `http://` and be non-empty**
    - **Validates: Requirements 18.3**
    - Run at minimum 100 iterations
    - _Requirements: 18.3_

  - [ ]* 22.2 Run Property 2 PBT suite and verify all 100 iterations pass
    - _Requirements: 18.3_

- [ ] 23. Write PBT for Property 3 — Transcription Round-Trip
  - [ ] 23.1 Create `canvas/src/__tests__/videodb/pbt-property3-transcription-roundtrip.test.ts`
    - Import `fast-check`; mock `POST /video/{id}/transcription` (returns job id), `GET /async-response/{id}` polling loop (returns `status: "completed"` after 1–3 iterations), and `GET /video/{id}/transcription` (returns transcript object)
    - Generate random video IDs and non-empty transcript text strings using `fc.string({ minLength: 1, maxLength: 200 })`
    - Assert that after the mock polling loop reaches `completed`, the `GET` retrieval returns a transcription object whose `text` field is non-empty
    - **Property 3: For any video with audible speech, after async transcription reaches `completed`, GET transcription SHALL return non-empty text**
    - **Validates: Requirements 18.4**
    - Run at minimum 100 iterations
    - _Requirements: 18.4_

  - [ ]* 23.2 Run Property 3 PBT suite and verify all 100 iterations pass
    - _Requirements: 18.4_

- [ ] 24. Write PBT for Property 4 — Async Polling Termination
  - [ ] 24.1 Create `canvas/src/__tests__/videodb/pbt-property4-polling-termination.test.ts`
    - Import `fast-check`; mock `GET /async-response/{id}` to always return a non-terminal state (e.g. `{ status: "processing" }`) regardless of how many times it is called
    - Generate random job IDs using `fc.string()`
    - Implement (or import) the `pollAsyncResponse` circuit-breaker function; wire the mock HTTP handler into it
    - Assert the function calls the endpoint ≤ 36 times and returns a failure result rather than looping indefinitely
    - Use `vi.fn()` (or equivalent) to count actual HTTP calls; assert `callCount <= 36`
    - **Property 4: For any job ID whose endpoint never returns a terminal state, the polling harness SHALL stop at or before 36 iterations and return a failure result**
    - **Validates: Requirements 18.5**
    - Run at minimum 100 iterations
    - _Requirements: 18.5_

  - [ ]* 24.2 Run Property 4 PBT suite and verify all 100 iterations pass
    - _Requirements: 18.5_

- [ ] 25. Phase 2 Checkpoint — all PBT suites pass
  - Run `vitest --run canvas/src/__tests__/videodb/` (or equivalent); confirm all four property test files pass with ≥ 100 iterations each. Ask the user if any property fails.

---

### Phase 3 — SSOT Sync Directive Update

- [ ] 26. Add VideoDB pipeline row to SSOT sync directives
  - [ ] 26.1 Modify `docs/documents/agenticgraph-integrations-ssot-sync-directives.md` to append a new row to the sync directives table for the VideoDB pipeline, following the exact five-column format of existing rows (`Surface | Directive | SSOT Source | Runtime Consumer | Doc Emitter`)
    - Surface: `VideoDB pipeline`
    - Directive: Keep VideoDB integration rows, Workflow Manager schema fields, and Props Panel Video widget fields generated from one VideoDB TS SSOT. Forbid duplicate local row maps and manual row edits.
    - SSOT Source: `canvas/src/features/integrations/videodbSsot.ts`
    - Runtime Consumer: `MainPanel Integrations`, `StoryboardWidget Manager`, `NodeOverlayEditor`
    - Doc Emitter: `canvas/src/cli/generate-videodb-reference.ts` (planned)
    - Ensure the row text is ≤ 50 words for the Directive cell, matching the canonical directive constraint
    - _Requirements: 2.6 (overlay SSOT sync directive row), 19.4_

  - [ ] 26.2 Verify the sync directives table still parses correctly (no broken pipe characters, correct column count) after the new row is added
    - _Requirements: 3.12_

---

### Phase 4 — Runtime SSOT Wiring

- [ ] 27. Create `videodbSsot.ts` runtime SSOT entrypoint
  - [ ] 27.1 Create `canvas/src/features/integrations/videodbSsot.ts` with `VIDEODB_DOC_ROWS`, `VIDEODB_API_DOC_ENTRIES`, `VIDEODB_API_DOC_AREA = 'VideoDB API'`, `VIDEODB_BASE_URL = 'https://api.videodb.io'`, and `getVideodbApiRowAnchorId`
    - Populate rows from the API reference table rather than an empty stub
    - Keep `videodb.api_key` empty by default and operator-supplied at runtime
    - Wire `VIDEODB_API_DOC_ENTRIES` into MainPanel Integrations through `useSettingsView`
    - _Requirements: 1.7, 19.4_

  - [ ]* 27.2 Write a TypeScript compilation check confirming `videodbSsot.ts` compiles without errors (`tsc --noEmit`)
    - _Requirements: 1.7_

- [ ] 28. Create `generate-videodb-reference.ts` CLI generator (planned CLI generator)
  - [ ] 28.1 Create `canvas/src/cli/generate-videodb-reference.ts` with a stub generator function that reads `VIDEODB_DOC_ROWS` from `videodbSsot.ts` and writes the markdown output to `docs/documents/agenticgraph-api-reference/agenticgraph-videodb-api-reference.md`, following the BytePlus generator pattern
    - The generator must not overwrite the existing reference unless emitted rows validate against the table contract
    - Wire the generator into the `docs:update` npm script in `canvas/package.json` following the same pattern as `generate-byteplus-video-reference.ts`
    - _Requirements: 1.8_

  - [ ]* 28.2 Write a TypeScript compilation check confirming `generate-videodb-reference.ts` compiles without errors
    - _Requirements: 1.8_

- [ ] 29. Final Checkpoint — all phases complete
  - Ensure all Phase 1 validators exit 0, all Phase 2 PBT suites pass, Phase 3 sync directive row is present, and Phase 4 runtime SSOT files compile. Ask the user if any item requires attention.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster validation pass; core script and test creation tasks must be completed
- Phase 4 task 27 is active runtime wiring; task 28 remains planned generator work and MUST NOT overwrite the existing validated reference document unless emitted rows validate
- All Phase 1 validator scripts target the file at `docs/documents/agenticgraph-api-reference/agenticgraph-videodb-api-reference.md`; use `path.resolve(__dirname, '../../docs/documents/agenticgraph-api-reference/agenticgraph-videodb-api-reference.md')` from the scripts directory
- PBT tests in Phase 2 use `fast-check` with a mocked HTTP layer; they must never make live API calls to `api.videodb.io`
- The `fast-check` minimum of 100 iterations per property is non-negotiable per the design testing strategy
- Each task references specific requirements for traceability; the requirement numbers map directly to `requirements.md` section headers

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1"] },
    { "id": 1, "tasks": ["0.2", "1.1", "2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1", "9.1", "10.1", "11.1", "12.1", "13.1", "14.1", "15.1", "16.1", "17.1", "18.1", "19.1"] },
    { "id": 2, "tasks": ["1.2", "2.2", "3.2", "4.2", "5.2", "6.2", "7.2", "8.2", "9.2", "10.2", "11.2", "12.2", "13.2", "14.2", "15.2", "16.2", "17.2", "18.2", "19.2"] },
    { "id": 3, "tasks": ["21.1", "22.1", "23.1", "24.1"] },
    { "id": 4, "tasks": ["21.2", "22.2", "23.2", "24.2"] },
    { "id": 5, "tasks": ["26.1"] },
    { "id": 6, "tasks": ["26.2"] },
    { "id": 7, "tasks": ["27.1", "28.1"] },
    { "id": 8, "tasks": ["27.2", "28.2"] }
  ]
}
```
