# Launch Copilot 0.3.0 (r3)

Launch Copilot is a lazy feature of Graph's native workspace. Canvas OS owns the
five-role proposal contract introduced in PR #922, consumed through the current
accepted Canvas revision in `docs/runtime-readiness-contract.md`. There is no separate LC
server, provider proxy, importer, parser, graph store, renderer or runtime package.

## Use

1. Run the usual Graph Dev workspace. Use **Launch → Import URL → Codebase graph**
   with an owned GitHub repository, or the existing folder import.
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
5. On the enrolled canonical Graph host, enter `/launch-copilot review <CID>`.
   Read the five panels and the returned hashes, source identity and output base.
   Submit the prepared `/launch-copilot approve <CID> <signature>` command only
   after reviewing those exact bytes. The target is the already-enrolled
   `github.com/huijoohwee/agentic-graph` repository. Approval opens one protected
   proposal PR through Agentic OS; it does not merge the PR.
6. Use `/launch-copilot status <CID>` to observe the provider and compare the five
   files against their committed hashes. `integrated` additionally requires the
   existing OS integration proof and matching content at the provider's merge SHA.

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
- The shared `/81rv10/` route is published, but the public-to-local authenticated
  host connection and source-bound Probe-Tree overlay remain unimplemented.
  These local native commands do not establish the full single-surface product
  acceptance criterion. Live model, real proposal publication/integration and the
  public browser walkthrough still require separate execution evidence.
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

The prototype used four new product modules and 693 added implementation/test
lines across Graph and Canvas OS. Acquisition retention adds 54 lines. This
handoff increment adds 152 implementation/test lines and one lazy host module:
899 of the original 900-line cap, five new product modules overall, zero new
dependencies. The public host transport and grounded Probe-Tree cannot be claimed
complete within the one remaining line; neither is replaced by a local demo.
Every changed code file remains under 600 lines.
Full LC browser modules load only on invocation or retained-proposal reopening.
Existing browser entry/state/render changes add 1,485 minified bytes (513-byte
concatenated gzip estimate, measured with installed esbuild against the Graph
base). This is a loader/integration delta, not a production bundle measurement
or a claim of zero total always-loaded bytes.
