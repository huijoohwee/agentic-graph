# 81rv10 production entry

`agentic-graph` owns the runtime and publisher for Launch Copilot (`launch-copilot@r3`).
The generated `huijoohwee/81rv10/index.html` is an exact copy of the same built
Graph entry document. Its absolute `/agentic-graph/` asset URLs share the existing
runtime bundle; it does not introduce a separate application or server.
The existing browser router accepts the product basename at `/81rv10` and its
descendants, and the entry CTA stays on `/81rv10/`. Other deployment bases and
similarly prefixed sibling paths retain their original routing.

Pages serves `/81rv10/index.html` at `/81rv10/` using its directory-index routing.
The publisher normalizes `/81rv10` to `/81rv10/` with a 308 response; it never
redirects the product entry to the Graph URL. The publisher owns only the entry file in
`81rv10`; output documents and other files remain outside that reservation.
There is no wildcard fallback for missing product files. Entry responses use
no-store caching and the `X-Agentic-Graph-Product-Entry: 81rv10` header.

The protected release artifact includes that exact entry path in its manifest,
staging and reconciliation. Existing Pages domain routing serves it; it needs
no separate DNS record or Worker route. A Cloudflare Worker route that shadows
`airvio.co/81rv10` must be reviewed before release. Do not point the route at a
GitHub tree URL: that URL is the publication mirror, not a serving origin.

Deployment remains owned by the protected Graph release workflow. The mirror
is published after live verification. Never repair the generated directory by
hand or publish the superseded standalone `81rv10` worktree.

This entry does not establish Launch Copilot feature readiness. Native proposal
capability must first integrate through its separate source change (PR #964).
Existing readiness markers and canonical Graph/PWA identity retain their current
scope; product entry routing is not a new independent PWA or paid-loop proof.

Before closing delivery, verify the bare product URL redirects to its trailing-slash
URL, the latter returns the mirrored HTML, shared assets resolve, query strings survive, and missing
product files return 404. Check Apex, Graph and Commerce after deployment. Bind
the observed Pages deployment and mirror revision to the protected source SHA.
