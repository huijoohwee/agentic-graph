---
title: "Knowgrph Cloud GitHub Collaboration Runtime Proof"
doc_type: "Runtime Proof"
version: "1.0.0"
date: "2026-07-30"
status: "runtime-ready with explicit boundaries"
scope: "protected remote-ledger authority, browser-originated public claim, concurrent disjoint claims, private sibling-repository lifecycle, and AgenticRAG projection"
lang: "en-US"
source_root: "$GITHUB_ROOT/knowgrph"
canonical_authority: "$GITHUB_ROOT/agentic-canvas-os/docs/CLOUD-COLLABORATION.md"
deployment_boundary: "Dev collaboration only; no Prod mirror, Cloudflare, or public runtime release"
---

# Knowgrph Cloud GitHub Collaboration Runtime Proof

## Verdict

Knowgrph now projects the protected Agentic Canvas OS remote ledger as shared
writer authority. Pull requests and local leases remain review and checkout
projections. Concurrent implementation is admitted when normalized declared
write sets are disjoint; a stale fence, branch drift, or overlap fails closed.

The recorded evidence proves one browser-originated public claim, concurrent
public and private repository claims, one complete private API lifecycle, and
deterministic downstream AgenticRAG parity. It does not prove a physical second
device, native GitHub Mobile dispatch, private GitHub Actions credentials,
private branch protection, merge-group admission, Production, or Cloudflare.

## Evidence Matrix

| Surface | Exact evidence | Result | Boundary |
|---|---|---|---|
| Browser-originated public claim | Agentic Canvas OS workflow run [30518175215](https://github.com/huijoohwee/agentic-canvas-os/actions/runs/30518175215), protected source `aeb28f0ae85ddb8747712289bfd145821ed2063c`, claim `98921958bec39a281f4e84d7ac29e6d558e4ffcbbd693d20f76533f1bb268a4c`, initial ledger `1d7058110fd0d26bea029a0fb9bc0f74e80d068a` | Passed from GitHub's browser workflow form at a 390x844 responsive viewport | Viewport emulation is not physical-mobile or second-device proof |
| Node 24 action runtime candidate | Agentic Canvas OS [PR #185](https://github.com/huijoohwee/agentic-canvas-os/pull/185), exact head `7924456c39c14f5ab56bb9cf3fd77dfa5c3c01f4` | Checkout v7, setup-node v7, Dependency Review v5, and CodeQL v4 are immutable-SHA policy inputs | Protected merge and post-merge exact-main proof remain separate |
| Concurrent cloud authority | Active claims `98921958…`, `b4d4cbcc…`, `12b20e2a…`, and `74bbe17c…` targeted disjoint public/private repositories and paths through one compare-and-swap ledger | No overlap collision; transitions serialized without local coordination authority | Concurrency evidence concerns GitHub writer authority, not live canvas-room document collaboration |
| AgenticRAG projection | Website [PR #69](https://github.com/huijoohwee/huijoohwee.github.io/pull/69), head `34e4a32074ff2a0905194b8570eca6355dab031a`, run [30518583134](https://github.com/huijoohwee/huijoohwee.github.io/actions/runs/30518583134) | Required jobs passed; deterministic map parity reported 62 guideline files | Draft review candidate; Knowgrph document-map projection follows protected source integration |

## Private Sibling-Repository Lifecycle

The disposable private target was
`huijoohwee/codex-mcp-smoke-20260529103436`. Its protected source remained
`7c0d3b980b3db8977a31fe286567a0e2637ab111`. The proof used one isolated
branch, one path, and never merged [PR #4](https://github.com/huijoohwee/codex-mcp-smoke-20260529103436/pull/4).

| Transition | Ledger revision | Claim digest |
|---|---|---|
| Claim | `fa920c8c08a6db8cb5085befb37a2008ffb03f99` | `774cd235fe5df78dd84ec1c9e4f870370cada91459e5ba1c37e78deea5c69b8a` |
| Bind | `cbd40c3b2512a6ecc4478622665e751addff193a` | `ccd5d3cbd6cfb57c0e3219bb4fb8f6af46f9aca8162b48ea0f65e6283f34ec27` |
| Heartbeat | `be2c917861e54f1d0b0e4f457693447407e90a40` | `ec651343412bb63f4c82ae7c2bd950311c76549e28b62e79908691222a596ab9` |
| Review-ready | `82b960a00ce3e81fc6312518174c2934793462d6` | `9b978a6dca78fbe06def3c931024cf49564b1d54ce9c2d6366770cd0d0e21633` |
| Abandoned release | `92f0a16d76006f021dc4f3627c5116c519cd75dc` | `502413d82ac6ac5bffdb5af9f87a43614586533f185b9ba4f0677510520352cd` |

The claim ID was
`12b20e2ac0603388581a1d8828b107911f0f39d4f2547c7d971491b3d7d0e3b5`;
its write-set digest was
`88dce06e33b2186b759aa3a43abdf46b255a02ddde359825069f59c6fd5464e7`.
Review-ready verification returned zero findings with receipt
`eabfee3156aa4c3f8aad3ec48567d7614affd4ecbbac25c374e78669156d7aea`.
After abandoned release, the identical request failed with
`stale-collaboration-fence`, receipt
`95cc8bffd539b962be5909295bd61d84843f922661e14896bff6e946db31bcef`.

Cleanup then proved the PR closed unmerged, its branch returned 404, its proof
path was absent from private `main`, no private target claim remained, and no
credential or repository checkout was persisted.

## Executable Knowgrph Gate

For each non-draft pull request, `Integration Gate` checks out the exact
Agentic Canvas OS dependency already pinned by Knowgrph. The collaboration
checker invokes that source-owned `cloud-collaboration.mjs verify` adapter
against the exact repository, PR, branch, protected base SHA, and head SHA. It
requires `review-ready` state and emits the claim ID, claim digest, ledger
revision, write-set digest, and verification receipt digest into the
schema-validated collaboration report.

Draft pull requests may remain active while evidence is assembled. A ready pull
request with missing cloud context, stale authority, wrong base/head, expired
claim, overlap, or missing receipt fails before the canonical Integration Gate.
The old open-PR semantic-label collision query and its client are removed.

## Economics And Security

- No new service, database, scheduler, package cache, repository secret, model
  call, or paid provider adapter was introduced.
- The private proof used GitHub REST and consumed no hosted Actions run.
- Public workflow execution used existing GitHub-hosted Actions. This proof
  does not infer a monetary charge from runner minutes because billing export
  was not queried.
- GitHub credentials stayed in their existing operator or workflow boundary;
  none entered ledger state, source files, logs, or downstream schema.
- A future private browser/Actions proof requires an operator-reviewed GitHub
  App or fine-grained credential. This implementation does not create one or
  reuse an operator token as an Actions secret.

## Sources

- [GitHub Actions token scope](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub App authentication in Actions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
- [Node 20 action runtime deprecation](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- [CodeQL Action v3 deprecation](https://github.blog/changelog/2025-10-28-upcoming-deprecation-of-codeql-action-v3/)
