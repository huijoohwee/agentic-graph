# Agentic Graph storage change no-deploy evidence

## Owner decision

The requester selected no-deploy. Graph PR [#1954](https://github.com/huijoohwee/agentic-graph/pull/1954) integrates lane `agent/device-0232231d4a19/e2e-storage-economy` at `6e85749a04f6228e2b09e0a92b4211922088b7a3` from reviewed head `63b849dbc2b98eb19d3e4d36b0ec7da5bf290ed5`. The Integration Gate passed in run [#42956951825](https://github.com/huijoohwee/agentic-graph/actions/runs/42956951825). This decision records no deployment, promotion, mirror publication, or runtime verification and grants no authority for those effects.

## Exact path and product-artifact boundary

- `docs/TESTING.md` is excluded from the product artifact. The Pages sync builds from generated `canvas/dist` files and named root-managed assets; the fixed production mirror artifact selector does not include this repository documentation path. It was absent from the mirror source tree at `19d6a658ca6691fd7782b02f96953f34dad79883` (tree `2868c4ff44a4e173f163a2d291885e610fc609d6`).
- `canvas/scripts/verify_xr_v2_workspace_seed_browser_smoke.mjs` is excluded from the product artifact. It is a CI browser-smoke verifier, not an application build input. Pages sync consumes `canvas/dist`, and the exact script path was absent from that same mirror source tree at `19d6a658ca6691fd7782b02f96953f34dad79883` (tree `2868c4ff44a4e173f163a2d291885e610fc609d6`).
- `docs/reports/agentic-graph-storage-no-deploy-pr1954.md` is excluded from the product artifact. Pages sync does not consume `docs/reports`; the fixed mirror artifact selector lists its product inputs explicitly and omits this report path.

The boundary is defined by `scripts/pages-mirror-sync.mjs` (SHA-256 `34c5bb1d0886976aca0b84de0a43f33752c9c67949353aa9117d89850da0d9d7`) and `scripts/production-mirror-artifact-entries.mjs` (SHA-256 `c0bf4042287f7a895cf083afc1d7dcee9d1ae3b614154470d906ccaf8d4dd9cf`) at Graph source `6e85749a04f6228e2b09e0a92b4211922088b7a3`. The paths above change no application runtime, route, Worker, schema, or stored product data. No deployment or mirror publication was performed for this lane.
