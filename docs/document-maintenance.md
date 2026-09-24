---
title: "Graph documentation maintenance"
id: "md:agentic-graph-document-maintenance"
doc_type: "Guidelines"
version: "0.1.0"
date: "2026-09-24"
lang: "en-US"
frontmatter_contract: "required"
owner: "Graph documentation maintainers"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
source_docs:
  - "https://github.com/huijoohwee/huijoohwee.github.io/blob/fc14505ac603c6e72bd682326d0b4c4d75e1745c/template/document-maintenance-template.md"
---

# Graph documentation maintenance

<!-- agentic-os:doc-sync:start -->
## Shared maintenance contract

- Check authored YAML with the repository's strict parser and semantic profile.
- Compare template revisions from exact source commits and preserve local edits.
- Review conflicts and the full proposed diff before accepting an update.
- Require the repository's document checks for the exact source candidate.
- Record source, check and publication receipts separately from runtime proof.
<!-- agentic-os:doc-sync:end -->

## Local notes

Graph owns its product documents and their frontmatter conventions. Maintainers
update this file in an admitted lane; the shared sync command proposes only
the delimited Markdown block.
