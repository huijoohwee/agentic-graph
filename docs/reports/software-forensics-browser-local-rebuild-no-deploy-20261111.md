# Software forensics browser local rebuild delivery disposition

## Owner decision

Disposition: **no deployment** for lane `agent/device-0232231d4a19/software-forensics-browser-local-rebuild`.

PR [#1960](https://github.com/huijoohwee/agentic-graph/pull/1960) merged the exact lane head `c757992a5c4db735e99490de6d999c5a2d08ac1d` into candidate revision `1253e0036c23ff4adaba670da2228c33435030cd`. The lane changes only `canvas/package.json`, replacing Node 22 `tsx` runner entrypoints from `../node_modules/tsx/dist/cli.cjs` to the real ESM entrypoint `../node_modules/tsx/dist/cli.mjs` for source-test and export commands.

The exact changed path `canvas/package.json` is excluded from the product artifact for this delivery decision. `npm run pages:build-sync` publishes generated Pages assets from `canvas/dist` and named generated outputs; it does not deploy the source workspace manifest at `canvas/package.json`. This change repairs local source execution paths only. It does not change Canvas runtime source, deployed route bindings, build controller selection, production configuration, or a previously promoted product candidate. This record grants no deployment, mirror publication, promotion, rollback, or runtime verification authority.

For END ADLC, the requester explicitly asked to close this lane. This report records the missing owner-bound no-deploy decision for the exact source lane only.

## Exact source binding

- Repository: `github.com/huijoohwee/agentic-graph`
- Lane: `agent/device-0232231d4a19/software-forensics-browser-local-rebuild`
- Lane head: `c757992a5c4db735e99490de6d999c5a2d08ac1d`
- Pull request: [#1960](https://github.com/huijoohwee/agentic-graph/pull/1960)
- Candidate revision: `1253e0036c23ff4adaba670da2228c33435030cd`
- Changed path: `canvas/package.json`
- Supporting release boundary: [`scripts/production-mirror-artifact-entries.mjs`](../../scripts/production-mirror-artifact-entries.mjs)

The evidence file itself is under `docs/reports/` and is excluded by the explicit production mirror artifact-entry list. It records a source-only decision and makes no deployment or runtime claim.
