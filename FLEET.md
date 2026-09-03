---
title: "agentic-graph External Export Fleet Ledger"
schema: "agentic-graph-export-fleet/v1"
---

# agentic-graph External Export Fleet Ledger

This append-only ledger records provider artifact identities for stable in-place
`export.publish` updates. Each machine entry hashes its canonical payload and
the prior entry hash. Do not edit entries by hand.

<!-- agentic-graph-export-ledger:start -->
