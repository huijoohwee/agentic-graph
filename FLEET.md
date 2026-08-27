---
title: "AgenticGraph External Export Fleet Ledger"
schema: "agenticgraph-export-fleet/v1"
---

# AgenticGraph External Export Fleet Ledger

This append-only ledger records provider artifact identities for stable in-place
`export.publish` updates. Each machine entry hashes its canonical payload and
the prior entry hash. Do not edit entries by hand.

<!-- agenticgraph-export-ledger:start -->
