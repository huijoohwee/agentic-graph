---
title: "AgenticGraph — AI Voice Studio PRD/TAD"
id: "md:agenticgraph-ai-voice-studio-prd-tad"
author: "airvio / joohwee"
date: "2026-07-24"
updated: "2026-07-24"
version: "0.1.0"
status: "implemented-runtime-ready-dev"
readiness_scope: "injected-adapter Dev runtime only"
canonical_stdio_provider_status: "unconfigured and fail-closed"
doc_type: "Combined PRD/TAD"
lang: "en-US"
frontmatter_contract: "required"
domain: "agenticgraph"
constraints:
  - "clean-room implementation"
  - "provider-neutral"
  - "consent and disclosure first"
  - "no hardcoded credentials or provider endpoints"
  - "no copied Voicebox source, prose, prompts, schemas, fixtures, tests, assets, or dependency"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
traceability:
  prd: "PRD-AI-VOICE-STUDIO"
  tad: "TAD-AI-VOICE-STUDIO"
  repo: "huijoohwee/agentic-graph"
  feature_surface: "AI Voice Studio"
  doc_path: "docs/documents/agenticgraph-ai-voice-studio-prd-tad.md"
source_references:
  reference_repository: "https://github.com/jamiepine/voicebox/tree/52f8d8dd387e4049c81ee97079d5f54e2e399b94"
  reference_docs: "https://docs.voicebox.sh/"
  cloning_overview: "https://docs.voicebox.sh/overview/voice-cloning"
  dictation_overview: "https://docs.voicebox.sh/overview/dictation"
  captures_overview: "https://docs.voicebox.sh/overview/captures"
  mcp_overview: "https://docs.voicebox.sh/overview/mcp-server"
  stories_overview: "https://docs.voicebox.sh/overview/stories-editor"
  responsible_use: "https://github.com/jamiepine/voicebox/blob/52f8d8dd387e4049c81ee97079d5f54e2e399b94/RESPONSIBLE_USE.md"
  license: "https://github.com/jamiepine/voicebox/blob/52f8d8dd387e4049c81ee97079d5f54e2e399b94/LICENSE"
  reviewed_revision: "52f8d8dd387e4049c81ee97079d5f54e2e399b94"
  manual_clean_room_reviewed_on: "2026-07-24"
---

# AgenticGraph — AI Voice Studio PRD/TAD

## Outcome and claim boundary

AgenticGraph now owns one provider-neutral voice studio across browser UI and local stdio MCP. It supports three exact intent routes:

- `/voice.studio #voice-clone @audio @voice-profile @approval-gate @cost-log @runtime-proof`
- `/voice.studio #speech-to-text @audio @text @approval-gate @cost-log @runtime-proof`
- `/voice.studio #text-to-speech @text @voice-profile @audio @approval-gate @cost-log @runtime-proof`

The current status is **runtime-ready-dev for an injected-adapter Dev host**:

- Browser Clone creates an in-memory, consented, digest-bound profile manifest without retaining sample bytes. The manifest is session-only and does not claim that a voice model exists.
- Browser Dictate starts only after a user gesture and bounded recording-rights checks, keeps Stop visible, and enables browser-managed recognition only after a separate explicit opt-in. The transcript remains editable.
- Browser Create plays only an explicitly requested, disclosed browser system-voice preview with an always-visible Stop control. Selecting a profile manifest does not turn that preview into cloned speech.
- Local MCP registers `agenticgraph.voice.studio`, executes deterministic zero-call plans, fences exact concurrent retries, resolves immutable sources only through a host owner, replays idempotently, and requires separate approval, rights, zero-spend estimate/execution adapter, independent settled-cost verifier, and output read-back owners for live execution.

The canonical stdio server deliberately injects none of those live owners and is
provider-unconfigured, so canonical live requests fail closed before provider
egress. This is not a verified provider-backed cloning release. There is no
provider cloning-quality claim, remote Worker deployment, Prod claim,
Cloudflare change, checked-in credential, paid provider call, or cloned-voice
artifact in this change.

## Clean-room reference ledger

The reference project was inspected only to understand user-level workflow categories and safety concerns. The reviewed repository revision was `52f8d8dd387e4049c81ee97079d5f54e2e399b94` on 2026-07-21; release history and the public documentation were also checked. The implementation in this repository was authored against AgenticGraph's existing contracts, MCP server, media panel, browser APIs, and tests.

Ideas independently carried forward:

- Treat capture, transcription, consented profile registration, takes, and projects as an explicit lifecycle.
- Keep original capture identity distinct from derived transcripts, profiles, and speech artifacts.
- Make record, recognition, synthesis, and external-call state visible and stoppable.
- Route UI and MCP through the same domain vocabulary instead of creating a second product model.
- Make permission, permitted use, expiry, revocation planning, disclosure, and provenance part of the contract rather than optional copy.

### FORBIDDEN reuse

The following are forbidden in this feature:

- Voicebox source code, component hierarchy, user-interface copy, documentation prose, prompts, schemas, MCP names or argument shapes, fixtures, tests, screenshots, sample data, gallery content, styles, assets, and generated outputs.
- A package, Git submodule, workspace, runtime import, request-time service, bundled artifact, or hidden compatibility layer sourced from Voicebox.
- Celebrity or public-figure voice presets, scraped likeness data, or a claim that an open-source software license grants voice or likeness rights.
- Raw audio, base64 media, speaker embeddings, provider credentials, filesystem paths, or arbitrary URLs in the public MCP input/output contract.

The reference license permits software reuse under its terms, but this project intentionally does not exercise that route. Software licensing is also separate from a person's consent, publicity, biometric, privacy, and contractual rights.

### Manual clean-room review

On 2026-07-24, the AgenticGraph-authored Voice Studio contract, runtime, tests,
browser source, UI copy, and this PRD/TAD were manually compared with the
reference materials listed above at repository revision
`52f8d8dd387e4049c81ee97079d5f54e2e399b94`. The review found no identical
contiguous 12-token window in the independently authored feature, excluding the
revision-qualified source URLs and proper project name used only by this
provenance ledger. It also confirmed that no reference package, source file,
prompt, schema, fixture, test, asset, UI layout, tool name, or API shape was
introduced.

This is a recorded manual provenance review, not an automated similarity
detector. `npm run voice-studio:check` verifies the dependency/import boundary
and the presence of this ledger; it does not claim to calculate source
similarity.

## PRD

### Users and jobs

| User | Job | Dev success |
|---|---|---|
| Creator | Register an owned or authorized voice | A session-only rights manifest is created from an audio digest without persisting the bytes |
| Operator | Dictate notes or a script | Rights-gated bounded recording can start and stop; separately opted-in browser recognition can produce an editable transcript |
| Producer | Preview spoken copy | An explicitly requested system-voice preview can play and stop with synthetic disclosure visible |
| Agent host | Invoke voice workflows through MCP | One typed tool handles clone, dictate, and create with deterministic and injected-owner evidence |
| Security reviewer | Verify misuse and spend boundaries | Public figures, expired rights, missing consent, raw payloads, missing adapters, and unapproved live calls fail closed |

### Required behavior

1. One `/voice.studio` command selects one of three `#` semantics and its exact ordered set of `@` bindings.
2. Browser capture starts only from a user gesture and exposes Stop throughout the active lifecycle.
3. Profile registration requires rights basis, attestation, a non-public-figure confirmation, permitted use, locale, expiry, and a full SHA-256 audio digest.
4. Browser profile state is React-session memory only: there is no voice-specific localStorage, sessionStorage, IndexedDB, or durable registry. Audio capture URLs are session-local object URLs and are revoked.
5. Synthetic speech is disclosed. A system-voice preview must not be presented as cloned output.
6. MCP inputs are closed, operation-discriminated, bounded, digest-based, and credential-free.
7. Dry-run performs zero network calls, zero repository writes, zero paid provider calls, and zero spend.
8. Live mode requires separate host-owned approval, rights, immutable-source resolution, zero-spend estimate/execution adapter, independent settled-cost verification, and output read-back owners. Approval binds exact USD and provider/network-call ceilings. The canonical stdio server injects none of them.
9. Adapter results are accepted only after digest-bound read-back and are projected into bounded public receipts; private provider fields are discarded.
10. Idempotency keys bind to exact requests, conflict when reused for a different action, and admit at most one in-flight effect for concurrent identical calls.
11. Cancellation after dispatch requires reconciliation and reports cost as incomplete; it never authorizes an automatic paid retry.
12. A verified estimate over any approved cost or call ceiling blocks before dispatch. A verified settled overage is terminal, preserves complete cost evidence, requires reconciliation, and replays without redispatch.

### Out of scope

- Training or shipping a voice-cloning model in this repository.
- Provider selection, provider credentials, remote MCP parity, Cloudflare routes, or production deployment.
- Persisting raw microphone capture, voice embeddings, or provider responses.
- Public-figure imitation, deceptive attribution, or removal of synthetic disclosure.
- Automatic retention, deletion, or revocation enforcement outside a future host-owned durable store.
- Provider-backed cloning quality, recognition accuracy, synthesis fidelity, Prod,
  or Cloudflare readiness.

## TAD

### Invocation and ownership

| Surface | Owner | Contract |
|---|---|---|
| Token grammar | Agentic Canvas OS dictionaries and `VOICE-STUDIO.md` | One command, three semantics, and exact audio/text/profile/approval/cost/proof bindings |
| AgenticGraph shared schema | `contracts/voice-studio.schema.js` | Closed input/output schemas and pure validation |
| Local MCP descriptor | `mcp/voice-studio-tool-contract.js` | `agenticgraph.voice.studio` |
| Local MCP execution | `mcp/voice-studio-runtime.js` | deterministic dry-run plus host-injected source, authorization, adapter, and read-back owners |
| Chat invocation | `canvas/src/features/voice-studio/voiceStudioInvocation.ts` | parses tokens and opens the owned panel |
| Browser domain | `canvas/src/features/voice-studio/` | profile metadata, capture, recognition, system speech |
| Media projection | `MediaCatalogPanelView.tsx` | third catalog mode, no duplicate floating panel |
| Registry | AgenticGraph vdeoxpln | discoverability and routing metadata |

### MCP operation model

The single MCP tool accepts `operation: clone | dictate | create` using
`agenticgraph-voice-studio-request/v1`; results use
`agenticgraph-voice-studio-result/v1`.

Clone accepts one immutable audio reference, explicit byte/duration bounds,
speaker consent and rights receipt identities, permitted uses, retention,
disclosure policy, and profile intent. Dictate accepts one immutable audio
reference, recording-rights receipt identity, participant notice, and bounded
transcription options. Create accepts one digest-bound text artifact, an exact
profile revision, visible disclosure, and bounded audio options. All operations
carry an exact scoped approval receipt identity and hard limits. No operation
accepts media bytes, paths, endpoints, API keys, or arbitrary adapter
configuration.

Dry-run outputs are deliberately modest:

- Clone returns `manifest-only`; it does not claim model training.
- Dictate returns a plan, never a fabricated transcript.
- Create returns a plan, never a fabricated playable URL.

A live adapter is a private runtime-construction dependency with a
`run(input, context)` boundary. Before dispatch, separate host-owned verifiers
bind the approval receipt, cost policy, and consent/rights state to the exact request digest,
reject expired, revoked, or public-figure use, and confirm permitted use. A
host-owned source resolver verifies the immutable source identity, SHA-256,
media metadata, and admitted bounds without exposing bytes through MCP. The
adapter first returns an exact zero-spend estimate and receives an abort signal
only after that estimate satisfies every approved ceiling. It must implement
its own credential and provider policy and returns one candidate receipt. An
independent cost owner verifies the exact settled provider calls, network calls,
currency, actual cost, and policy before artifact acceptance. A separate
host-owned read-back
verifier binds the returned artifact to the request digest before the runtime
sanitizes the public result. The public MCP caller cannot inject or configure
any of these owners.

The in-memory idempotency owner admits one exact in-flight request per key.
Concurrent identical requests share its single terminal result; a changed
request under the same key conflicts. Cancellation after external dispatch is
terminal and marks reconciliation and cost completeness honestly rather than
starting another adapter attempt.

### Browser runtime

The browser studio reuses the existing Media floating panel. Its state is
session-only React state and is discarded when the surface unmounts or reloads.
The panel provides:

- Clone: profile name, locale, rights basis, permitted use, an audio file, rights attestation, and public-figure exclusion.
- Dictate: rights receipt and participant-notice gates, Start, Stop, five-minute/100 MB capture limits, session-local audio preview, explicit recognition opt-in, live/final transcript, and manual transcript editing.
- Create: active/unexpired local profile-manifest selection, browser system-voice selection, text, an explicit Preview gesture, Stop, and disclosure.

Browser speech recognition is capability-detected and is labelled
browser-managed because implementations may use a browser vendor service. It is
off by default and starts only after the user explicitly opts in. Missing
recognition does not block recording or manual transcription. Missing speech
synthesis blocks preview with a typed visible status. Stop, workflow switches,
and unmount teardown stop media tracks and recognition, cancel speech, clear
timers, and revoke object URLs.

### Safety and privacy

Threat controls include:

| Threat | Control |
|---|---|
| Impersonation | explicit public-figure exclusion; rights basis and attestation; disclosure retained |
| Biometric leakage | no raw sample or embedding in profile storage or MCP projection |
| Path traversal | artifact identities and hashes replace caller filesystem paths |
| Oversized transport | no base64; text and list bounds; closed operation schemas |
| Hidden provider spend | live mode requires a host-verified exact `approvalReceiptId`; dry-run is zero-call |
| Budget drift | approval binds closed USD/call ceilings; zero-spend estimates block overages before dispatch; verified settled overages are terminal and replay-safe |
| Credential leakage | adapters and credentials are host-owned, never MCP arguments or logs |
| Misleading readiness | manifest-only/planned states are distinct from adapter-verified artifacts |
| Stuck capture or playback | visible Stop controls; duration/byte caps; tracks, recognizer, timers, object URLs, and speech synthesis are cleaned up |
| Silent recognition egress | browser recognition is off by default, separately opted in, capability-detected, and labelled browser-managed |
| Expired or revoked use | expiry/revocation blocks profile selection and new Create work; no external deletion is claimed |
| Source substitution | a host-owned resolver binds source identity, full SHA-256 digest, media metadata, and bounds before adapter dispatch |
| Replay ambiguity | one idempotency key binds to one exact request digest and one concurrent in-flight effect |
| Uncertain external settlement | cancellation or failure after dispatch sets reconciliation required and cost incomplete |

### Validation

`npm run voice-studio:check` proves:

- schema acceptance and adversarial rejection;
- exact ordered route equality across the shared and browser contracts, parser rejection of reordered routes, and one closed MCP facade;
- deterministic two-pass dry-run with zero call/cost/write evidence;
- separate approval, rights, source-resolution, cost-evidence, adapter, and output read-back fail-closed behavior;
- zero-spend estimates, exact-cap acceptance, pre-dispatch budget rejection, settled-overage reconciliation, and replay fencing;
- atomic concurrent retry fencing, post-dispatch reconciliation, and incomplete-cost evidence;
- sanitized injected-adapter clone/dictate/create projection with full digest-bound provenance;
- canonical stdio tools/list and tools/call behavior, including provider-unconfigured live failure;
- browser invocation, session-only metadata manifests, consent expiry/revocation, capture limits, recognition opt-in/opt-out teardown, detached-callback fencing, object-URL revocation, stop controls, and disclosure;
- vdeoxpln registration;
- no Voicebox dependency or implementation import;
- presence of the manual clean-room review ledger without claiming automated similarity detection;
- the exact Agentic Canvas OS revision pin and Voice Studio grammar proof;
- source files remain within the 600-line cap.

`runtime-ready-dev` therefore means only that a reviewed Dev embedding host can
inject and test those owners. Provider quality, speaker similarity,
multilingual accuracy, durable deletion/revocation, remote MCP, provider
configuration, production deployment, Cloudflare deployment, and
provider-backed live settlement remain future approval-gated validation lanes.
