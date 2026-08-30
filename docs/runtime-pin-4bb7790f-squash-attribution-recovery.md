---
title: "Runtime Pin 4bb7790f Squash Attribution Recovery"
doc_type: "Recovery Evidence"
status: "source-backed"
lang: "en-US"
frontmatter_contract: "required"
failed_protected_main_sha: "d8fcd41010f1e700d38d589a63f851d37e59b986"
reviewed_pull_request: "893"
reviewed_source_head: "49c54dd61dedd8eebbf450f61c7523b980c5bc0d"
reviewed_source_tree: "d6bf44c8242e32b1833b07e8a3b903c776bb7906"
reviewed_run_id: "33306620707"
post_merge_run_id: "33307008998"
controller_source: "huijoohwee/agentic-canvas-os"
controller_revision: "4bb7790ff8bbcf5f2786182dbcd02c422994695d"
deployment_authority: "forbidden"
---

# Runtime Pin 4bb7790f Squash Attribution Recovery

Protected `main` revision `d8fcd41010f1e700d38d589a63f851d37e59b986`
integrated the reviewed PR 893 source head
`49c54dd61dedd8eebbf450f61c7523b980c5bc0d`. The reviewed and protected
revisions have the same tree,
`d6bf44c8242e32b1833b07e8a3b903c776bb7906`.

The reviewed-head Integration run
[`33306620707`](https://github.com/huijoohwee/knowgrph/actions/runs/33306620707)
and post-merge run
[`33307008998`](https://github.com/huijoohwee/knowgrph/actions/runs/33307008998)
completed successfully. The repository-owned terminal controller nevertheless
failed closed because the provider retained a null auto-merge body and generated
the squash separator and `Co-authored-by` trailer after the exact
`Agentic-Task`, `Agentic-Scope`, `Agentic-Lease-Epoch`, and
`Agentic-Mechanism` block. That block was therefore not the final trailer block.

This append-only recovery preserves the failed revision, reviewed source bytes,
and attribution checker strength. Its protected integration must produce one
final exact attribution block. It rewrites no history and grants no deployment
or production-release authority.
