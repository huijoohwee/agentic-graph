---
title: "Post-Delivery Verification Checklist"
id: "md:agentic-graph-post-deploy-verification-checklist"
doc_type: "Operator Checklist"
version: "2.1.1"
date: "2026-08-14"
lang: "en-US"
owner: "docs.delivery.verification"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/agentic-graph-post-deploy-verification-checklist.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
---

# Post-Delivery Verification Checklist

## Reference implementation: conditional Pages and Worker verification

This blank checklist is a verification contract, not evidence. Use a section
only after the corresponding publication record identifies an exact revision
and delivery target. Source presence never satisfies a delivery VCC.

Endpoint values, trust, and token costs come only from
[the authoritative Invocation Register](documents/agentic-graph-mcp-install-contract.md).

### Readiness before execution

| Scope | Local rung | Delivered rung | Basis |
|---|---|---|---|
| Blank checklist | `spec-complete` | `undocumented` | Checks are specified; no result, revision, target, or operator instruction is recorded. |

### Evidence header

Complete every applicable field before running checks.

| Field | Recorded value |
|---|---|
| Operator | |
| Verification start/end time with timezone | |
| Authoring revision | |
| Mirror revision | |
| Pages publication record / deployment id | |
| Pages target from the Invocation Register | |
| Previous Pages revision for rollback | |
| Worker publication record / deployment id | |
| Worker target from the Invocation Register | |
| Previous Worker revision/bindings for rollback | |
| Exact promotion instruction | |

If the Worker publication fields are blank, mark the Worker section not
applicable and keep Worker delivered readiness `undocumented`.

### Preconditions

- [ ] The operator instruction explicitly names Pages, Worker, or both.
- [ ] The mirror revision is a faithful copy of the selected authoring revision.
- [ ] Each selected delivery unit has its own publication record.
- [ ] No secret appears in the revision, checklist, terminal capture, or client
      configuration excerpt.
- [ ] Rollback targets are known before runtime checks begin.
- [ ] The verification client can surface response status, headers, tool names,
      and exact check results.

### Pages HTTP MCP — read-only verification

Run only when the Pages publication fields are complete.

- [ ] Select the Pages row from the Invocation Register without copying a
      different endpoint into this checklist.
- [ ] Initialize using JSON content type and an Accept value permitting JSON and
      event-stream responses.
- [ ] Confirm the source contract does not require bearer authorization.
- [ ] Complete the MCP initialized handshake.
- [ ] Request tool discovery and record exactly 7 unique, read-only names:
      `search`, `fetch`, `list_source_files`, `read_source_file`,
      `read_shared_document`, `inspect_shared_document_structure`, and
      `inspect_agent_surface`.
- [ ] Invoke one bounded read and record a typed, non-empty result.
- [ ] Invoke one invalid read and record a typed error with no side effect.
- [ ] Confirm no browser-local guarded control appears.
- [ ] Confirm discovery and reads cause zero model calls.

#### Pages result record

| VCC | Exact invocable check/request | Recorded result | Tested revision and target | Lane | Pass/fail |
|---|---|---|---|---|---|
| `VCC-DELIVERY-PAGES-01` — initialize and discover 7 reads | | | | delivery | |
| `VCC-DELIVERY-PAGES-02` — valid read returns typed content | | | | delivery | |
| `VCC-DELIVERY-PAGES-03` — invalid read fails closed | | | | delivery | |

#### Reference implementation: Pages candidate transport and browser fidelity

The release workflow resolves the exact successful Pages deployment for the protected SHA
through the Cloudflare API. It runs machine-route smoke plus immutable-marker and browser
fidelity checks against that direct origin before publishing the mirror. Responses must
still carry the canonical `airvio.co` URLs and metadata.

The returning-user check derives the stable Pages alias from `CLOUDFLARE_PAGES_PROJECT`,
prewarms and reopens a persistent browser profile, and seeds stale runtime assets plus
in-scope and out-of-scope HTML cache cases. It requires one canonical service-worker
registration, exact-revision imported-worker URLs, matching active/controller revisions,
lifecycle-clean chat attestations, the exact release cache namespace, zero HTML in
agentic-graph-owned or `/agentic-graph` cache entries, network-owned HTML, preserved sibling caches,
no installing or waiting legacy worker, clean transition execution, and preserved
local-first storage. Runtime-cache admission rejects non-200, HTML, and XHTML responses, and
cached-hit validation rejects existing HTML or XHTML entries. These direct-origin checks
exercise the unchanged candidate artifact without weakening any assertion.

| VCC | Exact invocable check/request | Recorded result | Tested revision and target | Lane | Pass/fail |
|---|---|---|---|---|---|
| `VCC-DELIVERY-PAGES-04` — direct-candidate route, marker, browser, and returning-user checks preserve canonical metadata | `.github/workflows/smoke-test.sh`; `npm run production:fidelity:check`; `npm run production:sw-upgrade:verify` | `.github/workflows/release.yml` run `31795886758` `Human-Authorized Deploy, Verify, And Publish Mirror` passed; candidate deployment `https://20a0deac.joohwee.pages.dev` returned matching markers and route-owner metadata for source `0ecd4deb5ee0ad92e561c4143c03995e4d867a8a` with immutable manifest digest `5abe443adec86ed395d0910597928b85371fd7e2d4a68a7a96bd9cb0f79f9ff3` and artifact digest `0f7cce5c2302e96728f1ab7da404c026621cc2083756c31d3758d66094e1edd5`; returning-user service-worker convergence passed as `revision-upgrade` from `114f792d270df13822553e3647ba229b03b05a47` to `0ecd4deb5ee0ad92e561c4143c03995e4d867a8a` with preserved sibling caches and storage. | `0ecd4deb5ee0ad92e561c4143c03995e4d867a8a` on `https://20a0deac.joohwee.pages.dev/agentic-graph/` and `https://joohwee.pages.dev/agentic-graph/` | delivery | pass |
| `VCC-DELIVERY-PAGES-05` — public custom-domain browser fidelity from a non-challenged operator network | `xvfb-run --auto-servernum npm run --silent production:fidelity:check` inside `.github/workflows/release.yml`; public-route marker and transport probes recorded through `npm run --silent release:lifecycle:receipts -- live` | `.github/workflows/release.yml` run `31795886758` passed with public transport evidence `status: passed`; `https://airvio.co/` and `https://airvio.co/agentic-graph/` returned route-owner markers `root-agent-ready-pages` and `agentic-graph-agent-ready-pages`, source revision `0ecd4deb5ee0ad92e561c4143c03995e4d867a8a`, Agentic Canvas OS revision `db8c6bc86ff2261916129c0d9bffe11b3384b715`, artifact digest `0f7cce5c2302e96728f1ab7da404c026621cc2083756c31d3758d66094e1edd5`, and immutable manifest digest `5abe443adec86ed395d0910597928b85371fd7e2d4a68a7a96bd9cb0f79f9ff3`. | `0ecd4deb5ee0ad92e561c4143c03995e4d867a8a` on `https://airvio.co/` and `https://airvio.co/agentic-graph/` | delivery | pass |

The hosted transport does not prove public custom-domain browser acceptance. Repeat the
public-route fidelity check from a non-challenged operator network:

```bash
RELEASE_SHA=<40-character-agentic-graph-sha> \
PRODUCTION_IMMUTABLE_MANIFEST_DIGEST=<64-character-sha256> \
npm run production:fidelity:check
```

### Remote Worker MCP — authenticated session verification

Begin this section only when a separate Worker publication record identifies
the exact Worker revision, bindings, and target. A Pages publication or the
10-tool source registry is not Worker delivery evidence.

- [ ] Retrieve the bearer secret from the approved environment secret channel.
- [ ] Send an initialize request without authorization and record an
      unauthorized result; do not log a secret.
- [ ] Initialize again with `Authorization: Bearer <token>`, JSON content type,
      and an Accept value permitting JSON and event-stream responses.
- [ ] Capture the returned `mcp-session-id` in redacted or hashed form suitable
      for correlation without exposing sensitive state.
- [ ] Complete the initialized handshake with both bearer authorization and the
      returned session id.
- [ ] Request tool discovery with both headers and the same session id.
- [ ] Record exactly 10 unique names:
      `agentic-graph.superagent.run`, `agentic-graph.video_remix.run`,
      `agentic-graph.video_remix.research`,
      `agentic-graph.video_remix.storyboard`,
      `agentic-graph.video_remix.render`, `agentic-graph.video_remix.publish`,
      `agentic-graph.video_remix.checkout`,
      `agentic-graph.run_manifest.note.update`, `agentic-graph.os.status`, and
      `agentic-graph.agentic_canvas_os.docs.invoke`.
- [ ] Omit or alter the session id on a bounded negative request and record a
      session failure, then stop using that invalid session.
- [ ] Attempt a guarded operation without its required approval and record a
      denial with no side effect or model spend.
- [ ] If an approved execution is in scope, record the owner, input/output
      tokens, cost, maximum iterations, circuit-breaker outcome, and resulting
      artifact separately.

#### Worker result record

| VCC | Exact invocable check/request | Recorded result | Tested revision and target | Lane | Pass/fail |
|---|---|---|---|---|---|
| `VCC-DELIVERY-WORKER-01` — missing bearer fails closed | | | | delivery | |
| `VCC-DELIVERY-WORKER-02` — authenticated initialize returns session id | | | | delivery | |
| `VCC-DELIVERY-WORKER-03` — same session discovers 10 tools | | | | delivery | |
| `VCC-DELIVERY-WORKER-04` — invalid session fails closed | | | | delivery | |
| `VCC-DELIVERY-WORKER-05` — unapproved control has no side effect/spend | | | | delivery | |

### Optional browser-local verification

This section checks app WebMCP and does not change Pages or Worker results.

- [ ] Record the exact app revision and runtime target.
- [ ] Discover exactly 42 unique app tools.
- [ ] Classify exactly 30 as read-only and 12 as guarded controls.
- [ ] Confirm a missing runtime owner or approval returns unavailable/denied.
- [ ] Confirm no browser control appears in the Pages seven-tool result.

| VCC | Exact invocable check | Recorded result | Tested revision and target | Lane | Pass/fail |
|---|---|---|---|---|---|
| `VCC-DELIVERY-WEBMCP-01` — 42 tools split 30/12 | | | | delivery | |

### Cross-document consistency

- [ ] The overview, service PRD/TAD, companion, agent-ready pair, install
      contract, and onboarding index use the same 7 / 42 (30 + 12) / 10 counts.
- [ ] Every status value is one Readiness Ladder rung.
- [ ] Local and delivered rungs are recorded separately.
- [ ] No document treats a source file or blank checklist as evidence.
- [ ] No document besides the install contract owns an Invocation Register for
      the two HTTP endpoints.

### Verdict and rung derivation

| Surface | Applicable VCCs all pass? | Evidence References complete? | Derived delivered rung | Finding / next action |
|---|---|---|---|---|
| Pages HTTP MCP | | | | |
| Pages candidate transport and public fidelity | | | | |
| Remote Worker MCP | | | | |
| App WebMCP, if selected | | | | |

Derive, do not choose, the rung:

- `undocumented`: no delivery VCC/evidence.
- `spec-complete`: delivery VCC stated but no satisfying evidence.
- `dev-proven`: reproducible local evidence only.
- `runtime-ready`: every scoped VCC has satisfying runtime evidence.
- `production-verified`: runtime-ready plus delivery Evidence References and the
  exact operator promotion instruction.

### Rollback gate

Rollback the affected delivery unit when authorization can be bypassed, session
correlation is broken, counts drift, a read mutates state, an unapproved control
executes, secrets appear in output, or any blocker VCC fails.

Record:

| Field | Value |
|---|---|
| Trigger | |
| Restored revision/bindings | |
| Exact rollback instruction | |
| Post-rollback check and result | |
| Incident/follow-up owner | |

The Pages and Worker rollback decisions are independent. Never roll a separate
delivery unit merely because the other unit failed unless the operator
instruction explicitly couples them.
