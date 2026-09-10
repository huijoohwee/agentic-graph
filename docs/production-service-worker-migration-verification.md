# Production service worker scope migration

Release run [34424012589](https://github.com/huijoohwee/agentic-graph/actions/runs/34424012589)
accepted its exact human authorization and passed dependency preparation and
protected Worker preflight. Before deployment, returning-user prewarm failed
because it required the new `/agentic-graph/` readiness marker. Production still
served revision `1f7b529d42b0f0cff2c7cd749842fdfe51755bed` at the retired
`/agenticgraph/` scope. Pages, Worker, state and publication steps were skipped.

The prewarm owner now checks the canonical marker first. Only an HTTP 404
permits discovery among the retired namespaces already declared in the mirror
contract. Exactly one deployed retired marker must return JSON with an exact
source revision, matching the root deployment marker. A bounded same-origin
redirect between known retired markers is an alias, not a second deployment.
Other HTTP failures, malformed content, unknown redirects and ambiguous or
conflicting identities stop preparation. Runtime identity is never inferred
from a missing route.

The Pages routing generator emits permanent redirects from retired root,
deep-link and content paths to the canonical scope, replacing obsolete rewrites
to removed mirror assets. Unrelated sibling routes remain intact. Retired names
are migration inputs and redirect sources only; no retired application is kept.

The existing post-deployment scope-transition verifier is now reachable. Its
checks still require the exact new document and active worker revision,
revision-bound imports, network-only HTML, preserved localStorage and IndexedDB
sentinels, preserved sibling caches, and no browser or HTML-as-JavaScript errors.
The verifier does not unregister workers or clear caches to manufacture proof.
Profile and source helpers are extracted so each edited script remains below
600 lines.

Validation on 2026-09-10:

- 58 focused migration, release-contract and mirror-sync tests passed.
- Contract-selected affected checks passed, including 99 collaboration tests.
- A fresh isolated browser profile against `https://joohwee.pages.dev` completed
  the full prewarm. Its active worker and controller both attested the exact old
  revision, with 618 cached assets and 609 precached assets in that namespace.
  Obsolete-cache and sibling-cache fixtures were seeded without browser errors.
- The local prewarm used expected revision
  `34b86a81a97ce617eadaa552df491f1260a44fd0` to reproduce preparation behavior.
  It is not evidence for a future candidate's post-deployment convergence.

The protected release must repeat prewarm for its exact candidate and complete
post-deployment convergence, live transport checks and the lifecycle carrier
before production success can be claimed. No production runtime was changed by
this source verification.
