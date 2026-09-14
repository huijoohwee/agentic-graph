# Launch Copilot operations

The canonical [product plan](documents/launch-copilot-prd-tad-adr-mvp-gtm.md) owns
`launch-copilot@0.3.3`; this runbook consumes its criteria and retains operational evidence.

Launch Copilot is a lazy feature of Graph's native workspace. Canvas OS owns the
five-role proposal contract introduced in PR #922, consumed through the current
accepted Canvas revision in `docs/runtime-readiness-contract.md`. There is no separate LC
server, provider proxy, importer, parser, graph store, renderer or runtime package.

## Codebase Demo

At `/81rv10/`, **Demo** reads the repository URL from
[`demo.md`](workspace-seeds/demo.md) and invokes the native Import URL pipeline.
For `anthropics/commerce-agents`, it parses the acquired codebase and opens
**2D Renderer: D3** with original source nodes and explained edges. Source-directory
clusters use the existing canvas group selection. The full parsed snapshot stays
queryable; the bounded D3 projection reports its own node and edge counts.

The local `notes/demos/launch-copilot/<session>/demo.md` records the acquired commit,
parser identity, snapshot, prompt and import conversation. Its native projection
reference restores the same graph on reopening without another import. Chat uses
that document's own history. The PRD–TAD–ADR–MVP–GTM planning examples remain
hypotheses until the user selects real evidence and submits the outline prompt.
No model call or proposal publication occurs on Demo.

## Use

1. Keep the canonical Graph host running with its existing server-managed OpenAI
   connection. For public use, pair it as described below, then work at
   **https://airvio.co/81rv10/**. Use **Launch → Import URL** with a permitted
   GitHub repository. Bare `https://github.com/owner/repo` URLs select the native
   repository importer. Folder grants remain available only in local Graph.
2. Select native nodes, edges or a saved cluster. In **Chat**, enter
   `/launch-copilot outline owned <business requirement>` for a local editable
   outline, or `/launch-copilot draft owned <business requirement>` to use the
   current authorized OpenAI Chat connection. Use `reference` for an inspection-only
   repository; it cannot substantiate an existing implementation claim.
3. Review the five native RichMediaPanels. The canvas focuses the bounded evidence
   slice while the full source graph stays read-only in its existing store. Solid
   evidence edges contrast with the separate `lc:` NEW nodes and dashed relations.
4. Edit panel text. Use `/launch-copilot reopen <CID>` to reopen native workspace
   files and `/launch-copilot export <CID>` to download the exact five-file ZIP.
   Markdown lives in the existing authored workspace under `/notes/proposals/<CID>/`;
   exported paths are `docs/proposals/<CID>/{prd,tad,adr,mvp,gtm}.md`.
   On phones, open **Workspace View → Editor Workspace → Source Files → notes →
   proposals → CID** for a full-width editor/viewer. Hide Explorer and Canvas
   using the native pane controls while reviewing a document.
   Use `/launch-copilot probe <CID>` to generate native clarification cards bound
   to the original requirement, source snapshot and selected evidence. Answer on
   a card, select it and invoke `probe` again to continue that branch. Questions
   and answers stay in the separate proposal overlay; they never become code
   evidence. `/launch-copilot refine <CID>` applies the retained answers to the
   five documents after fresh source validation. A failed refinement preserves
   the reviewed text. Probe and refinement reuse the selected OpenAI connection.
5. On the enrolled canonical Graph host, enter `/launch-copilot review <CID>`.
   Read the five panels and the returned hashes, source identity and output base.
   Submit the prepared `/launch-copilot approve <CID> <signature>` command only
   after reviewing those exact bytes. The target is the already-enrolled
   `github.com/huijoohwee/agentic-graph` repository. Approval opens one protected
   proposal PR through Agentic OS; it does not merge the PR.
6. Use `/launch-copilot status <CID>` to observe the provider and compare the five
   files against their committed hashes. `integrated` additionally requires the
   existing OS integration proof and matching content at the provider's merge SHA.

## Pair the existing host

The operator starts the enrolled canonical Graph runtime normally. It needs the
existing control-plane `AGENTIC_OS_AGENT_RUNTIME_BEARER_TOKEN` in server
configuration; never place that token or an OpenAI key in browser settings.
From that machine, POST JSON `{"action":"connect-host"}` to the canonical
loopback runtime's `/__agentic_graph_agent_graph/proposal` route, with a matching
loopback Origin and JSON content type. The response returns a short-lived code.
In public Chat submit `/launch-copilot connect <code>`. That command clears the
code before chat persistence. `/launch-copilot disconnect` closes the browser
connection; the corresponding host action `disconnect-host` closes the host.

Pairing is an operator setup step. Import, source inspection, composition,
questions, editing, export, exact approval and status use the single public page.
The shared MCP Worker brokers the explicitly paired connection; it does not run
a second importer, parser, model proxy or Git runtime. Isolated objects named
`graph-host-relay/<session UUID>` reuse its existing `RUN_MANIFEST_STORE`
namespace. Existing manifest and run-note routes delegate to their original
owner. No new Worker, Durable Object migration, secret or package is required.

Sessions expire after 30 minutes and allow one active operation and 128 admitted
request IDs. SHA-256 key hashes, operation identity and expiry survive broker
hibernation. Credentials are role-specific, carried in WebSocket protocols and
held in memory, with exact public Origin checks and no credentials in URLs.
Only the native repository, proposal, docs/Probe MCP and OpenAI paths are allowed.
The broker cannot forward arbitrary URLs, headers, folder grants or pairing
actions. Frames are bounded to 96 kB, chunks to 24 kB, requests to 64 kB and
responses to 8 MB, with consumer backpressure and cancellation. Public repository
imports use the native bounded final projection, avoiding repeated intermediate
previews. Reconnect explicitly after expiry or reload; inspect publication status
before recovering an interrupted approved operation.

Native workspace persistence also retains one proposal sidecar for evidence and
layout. It is not a sixth exported document. Graph's workspace artifact owner
retains the existing bounded source projection under `/notes/codebase-graph/` so
reopening needs no fresh import. The native document version control preserves
the prior text and edited draft; export uses the selected document version.
Editing invalidates the prior review digest. Fresh composition rechecks source
identity through Graph's native host. Offline review does not establish source
freshness or grant publication authority. Authored notes use existing IndexedDB
persistence; host-mirrored `/docs` and `/docs_` are intentionally not used for these
local drafts because the default workspace policy excludes them from snapshots.

## Boundaries

- The Canvas validating client checks query/explain results; source membership
  does not prove semantic entailment. Read excerpts and review each claim.
- At most 12 evidence nodes and 20 explained edges; depth is one. Search starts
  with six hits and a bounded neighborhood. Truncation is visible.
- One Chat transport attempt, no automatic model fallback or repair. The prompt
  is conservatively capped at 8,000 UTF-8 bytes; output at 6,000 tokens and 24,000
  structured bytes. Failed drafting retains a labelled outline. No live OpenAI
  verification has been performed; the operator explicitly deferred it.
  A local stub exercises the existing OpenAI Responses streaming transport,
  usage receipt, exact selected model, one-call limit and invalid-output fallback.
- New repository-URL imports retain the resolved acquisition commit, repository
  URL and subpath in the content-addressed snapshot, browser projection, Source
  Files receipt and proposal documents. Cache-hit counters do not change that
  identity. A different commit invalidates the snapshot even when file bytes are
  equal. Local-folder and older imports still report the commit as unavailable;
  re-import a repository URL to obtain a commit-bound receipt.
- Publication requires complete commit-bound acquisition, unchanged source/revision
  headers, a clean canonical Graph output checkout, fresh source/contract/base
  identity and five unused output paths. The review token expires after 15 minutes
  and is consumed before lane creation. File bytes, the full evidence digest,
  target and base are bound to approval. Edited prose still needs human review.
- Publication reuses OS admission, guarded generation, the existing locked npm
  toolchain and protected `land`; it never writes proposal files to canonical.
  The whole request must fit the existing 64,000-byte host limit, with at most
  24,000 UTF-8 bytes per document. An interrupted operation retains its lane.
  Repeated requests inspect that lane; they never retry a partial publication or
  create a second PR. Another proposal waits until the existing lane is completed
  through its responsible OS lifecycle owner. Recovery does not infer approval.
- Cancelling before approval writes no proposal files. After approval, a browser
  timeout or disconnect stops waiting while the bounded host operation continues;
  use `status` before any recovery. Host restart invalidates outstanding review
  tokens. Retained Git content and provider observations remain the readback source.
- The public host transport and source-bound Probe-Tree are implemented in the
  existing owners. Deployment remains subject to protected candidate approval;
  source implementation does not establish live public readiness. Live OpenAI
  verification is explicitly deferred. Real proposal publication requires a
  separate human review of the exact five documents.
- Probe-Tree is bounded to 20 retained questions and depth five. Native provider
  validation rejects generic or malformed questions; there is no canned question
  fallback. Selected continuation question, answer and lineage use the native
  context builder. Refinement admits at most 6,000 characters of source-bound
  decisions. Native workspace snapshots retain their 160,000-byte limit.
- Dev integration does not prove deployment, live payment, demand or production
  readiness. The former standalone `81rv10` implementation is superseded.

## Verification and budget

Run `npm run check`, `npm run ci:integration`, `npm run agent-graph:check`, and:

```sh
TSX_TSCONFIG_PATH=canvas/tsconfig.json node --import tsx --test canvas/src/__tests__/launchCopilot.test.ts
npm -C canvas run test:ci:unit -- workspace.import.agentGraph workspace.importUrl.native workspace.importUrl.agentGraph agentReady.webMcpRuntime.importUrl
```

The dedicated test uses an actual temporary source corpus, Graph runtime, Canvas
client and native workspace filesystem; it checks source immutability, exact
roles, panel recognition, retained edits/positions/versions, default persistence
admission, duplicate CID refusal, forged claims, stale snapshots and cancellation.
It is an explicit Node test command,
not registered in the older Canvas UI test-case catalog.

The Dev browser walkthrough imported the owned Commerce repository through
Import URL, queried seven real nodes and one explained checkout edge, displayed
five native panels, edited PRD, then reloaded and reopened the same graph and
proposal without another import. At 390 × 844, the native workspace editor/viewer
read and edited the retained Markdown offline; native Chat exported the five-file
ZIP offline. The test unpacks the ZIP and compares every path, text and digest.
The native import-command resolver intermittently exceeded its existing eight-
second deadline during cold loading; retry after the workspace settled succeeded.
Canvas cards retain desktop positions across viewport changes: use the native
workspace editor/viewer for phone document review.

The retention follow-up also ingested the real `huijoohwee/81rv10` repository URL:
commit `2edb9b2aa1db1a355bd0bad0539485688b03da8e` survived the snapshot round trip.
A warm cache import retained snapshot digest
`05859ea4b3c5c93cca0425a6749c040cf19321ed11b52b91be536ad7929709ca`.
The eight acquisition checks and the extended native proposal test passed.

The handoff test extends the same native suite with exact-file submission from
the workspace, explicit review before approval, path/header/byte rejection,
content/source/contract/base drift, token expiry/replay and stale/cancelled host
requests. The provider response in the browser handoff test is a stub; it is not
evidence of a real proposal PR or merged content. The existing OS remains the
owner of publication and integration checks.

A read-only host smoke imported the actual `huijoohwee/81rv10` repository at
`2edb9b2aa1db1a355bd0bad0539485688b03da8e`, grounded its README and obtained
`review-required` for five files targeting the enrolled Graph profile. Changing
PRD after review rejected the approval; subsequent status remained `not-started`.
No proposal lane, provider publication or live model call was attempted. This
proves native review admission and refusal, not successful publication.

The prototype, acquisition retention and protected handoff used 899 added
implementation/test lines and five new product modules across Graph and Canvas
OS. The user subsequently selected full public completion in place of the
900-line experiment limit. The shared host transport is the sixth product module;
all other changes extend existing owners. No new dependencies were added.
Every changed code file remains under 600 lines.
Full LC browser modules load only on invocation or retained-proposal reopening.
Existing browser entry/state/render changes add 1,485 minified bytes (513-byte
concatenated gzip estimate, measured with installed esbuild against the Graph
base). This is a loader/integration delta, not a production bundle measurement
or a claim of zero total always-loaded bytes.

The public-flow tests exercise the actual broker under local workerd, role and
Origin refusal, streamed UTF-8 bytes, cancellation, replay refusal, hibernation
and expiry, plus existing manifest-owner delegation. The extended native proposal
test exercises two source-bound question levels, answer editing, retained versions,
reopen/export, one-pass refinement and failure preservation using provider fixtures.
Those fixtures are explicitly not live OpenAI evidence.

The r3.2 source increment adds 749 implementation/test lines (1,648 including
the prior 899), with six product modules overall. Its production build emits
6,104-byte transport, 18,204-byte workspace and 23,844-byte invocation chunks.
Per-module minification of the changed integration modules adds 1,894 bytes
against the handoff baseline; some are themselves lazy. This is separate from
the historical 1,485-byte entry/state/render delta and is not a production entry
closure measurement. The original zero always-loaded-byte criterion is still
not established.

The r3.2 static-build browser rehearsal ran at `/81rv10/` behind the actual local
workerd broker, with native host routes absent from the static server. Pairing
and the native Chat Import URL command imported `anthropics/commerce-agents` at
`fd4d59224ab96b43c6dc6888207c67b3bd5a24cf`: 571 sources, 39,235 nodes and
38,921 edges, with the 1,000-node display limit explicitly reported. The
reference-role outline selected seven real nodes and one explained structural
edge; this lexical result does not establish checkout semantics. Five native
panels reopened after page reload. A PRD edit made through the actual canvas
editor persisted on reopen, and offline export returned exact-files digest
`d3f44fc72d0debfdf7e1d0035ed867956c49191ca245170d323f91fefffef59a`.
The shared canvas click handler now lets document editing receive the event
before stopping its propagation; the dedicated native test mounts this parent
component and verifies that the edit reaches workspace Markdown. This is local
production-build evidence, not evidence of a deployed public host connection.

Historical release-prep observations from the private owner archive remain
relevant to the public-flow status. Graph `d003fc2663a5d842c9865a1e6fdceb5063e2368c`
passed the main Integration Gate in run
[`34733324598`](https://github.com/huijoohwee/agentic-graph/actions/runs/34733324598).
Production candidate run
[`34734306773`](https://github.com/huijoohwee/agentic-graph/actions/runs/34734306773)
then stopped at schema-map parity with 49 missing document nodes, so no
production approval or deployment occurred from that candidate. The schema owner
repair landed in `huijoohwee.github.io` PR
[`#227`](https://github.com/huijoohwee/huijoohwee.github.io/pull/227) as
`204afd42933899a9e3676f459abc8359ae948531`; the generator then reported 289
nodes and zero differences. A fresh release run
[`34735549245`](https://github.com/huijoohwee/agentic-graph/actions/runs/34735549245)
subsequently passed integration, build, schema parity and the isolated browser
gate for the same Graph revision with that repaired dependency. That run still
awaited explicit human production authorization and is not deployment proof.
