---
title: "Post-Delivery Verification Checklist"
id: "md:knowgrph-post-deploy-verification-checklist"
doc_type: "Operator Checklist"
version: "2.1.0"
date: "2026-07-30"
lang: "en-US"
owner: "docs.delivery.verification"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/knowgrph-post-deploy-verification-checklist.md"
guideline_version: "1.7.0"
reference_implementation_label: "reference implementation"
---

# Post-Delivery Verification Checklist

## Reference implementation: conditional Pages and Worker verification

This blank checklist is a verification contract, not evidence. Use a section
only after the corresponding publication record identifies an exact revision
and delivery target. Source presence never satisfies a delivery VCC.

Endpoint values, trust, and token costs come only from
[the authoritative Invocation Register](documents/knowgrph-mcp-install-contract.md).

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
      `knowgrph.superagent.run`, `knowgrph.video_remix.run`,
      `knowgrph.video_remix.research`,
      `knowgrph.video_remix.storyboard`,
      `knowgrph.video_remix.render`, `knowgrph.video_remix.publish`,
      `knowgrph.video_remix.checkout`,
      `knowgrph.run_manifest.note.update`, `knowgrph.os.status`, and
      `knowgrph.agentic_canvas_os.docs.invoke`.
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
- [ ] Discover exactly 41 unique app tools.
- [ ] Classify exactly 30 as read-only and 11 as guarded controls.
- [ ] Confirm a missing runtime owner or approval returns unavailable/denied.
- [ ] Confirm no browser control appears in the Pages seven-tool result.

| VCC | Exact invocable check | Recorded result | Tested revision and target | Lane | Pass/fail |
|---|---|---|---|---|---|
| `VCC-DELIVERY-WEBMCP-01` — 41 tools split 30/11 | | | | delivery | |

### Cross-document consistency

- [ ] The overview, service PRD/TAD, companion, agent-ready pair, install
      contract, and onboarding index use the same 7 / 41 (30 + 11) / 10 counts.
- [ ] Every status value is one Readiness Ladder rung.
- [ ] Local and delivered rungs are recorded separately.
- [ ] No document treats a source file or blank checklist as evidence.
- [ ] No document besides the install contract owns an Invocation Register for
      the two HTTP endpoints.

### Verdict and rung derivation

| Surface | Applicable VCCs all pass? | Evidence References complete? | Derived delivered rung | Finding / next action |
|---|---|---|---|---|
| Pages HTTP MCP | | | | |
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
