# Graph token rights delivery disposition

## Owner decision

Disposition: **no deployment** for the documentation-only `graph-token-rights` lane.

The authorized outcome was to record public reuse rights for the exact Graph UI token data in source control. The lane adds only `grph-shared/src/ui/TOKEN-LICENSES.md`; it does not change runtime code, generated styles, package metadata, or the Canvas application. The exact source addition is integrated through [Graph PR #1867](https://github.com/huijoohwee/agentic-graph/pull/1867), merged at `300815a55d79cdd07dfa4ba2d2a887e810cfa6de`. No Dev or Production deployment, mirror publication, or runtime verification is claimed for this lane.

The Markdown file is not compiled into `grph-shared/dist`: the committed package is private, and `grph-shared/tsconfig.json` compiles TypeScript/TSX plus the explicitly named `fontStacks.js` input. The production mirror allowlist includes the `grph-shared` subtree, so this record does not claim the Markdown is absent from a future mirror artifact. This task authorizes source integration only; any separate mirror publication requires its own release decision.

The delivery rationale is limited to the exact documentation-only lane and candidate below. The requester explicitly asked for END ADLC and authorized autonomous resolution of its missing owner-bound no-deploy evidence. This record does not grant production, mirror-publication, or rollback authority.

## Exact source binding

- Repository: `github.com/huijoohwee/agentic-graph`
- Lane: `agent/device-0232231d4a19/graph-token-rights`
- Lane head: `84e656bbccb5ab5c5bf4a2150696a939ae9d4af3`
- Changed path: `grph-shared/src/ui/TOKEN-LICENSES.md`
- Candidate revision: `300815a55d79cdd07dfa4ba2d2a887e810cfa6de`
- Candidate path SHA-256: `541a080e7309c668568861de2ae1ded77a0e7ee7e751683da657c18f13bb8117`
- Supporting release boundary: [`scripts/production-mirror-artifact-entries.mjs`](../../scripts/production-mirror-artifact-entries.mjs)

The evidence file itself is under `docs/reports/` and is excluded by the explicit production mirror artifact-entry list. It records the source-only decision and makes no deployment or runtime claim.
