# Net-settlement property isolation

Protected merged-source run [34409887887](https://github.com/huijoohwee/agentic-graph/actions/runs/34409887887)
failed CP-5 after 376 generated cases, with seed `134344832`, shrink path
`375:0`, and counterexample `[[300]]`. The returned state was `pending`, while
the property required `committed`. The same seeded 400-case property passed
locally, so the hosted failure is not established as an amount-dependent defect.

Each generated case creates independent graph and ledger Durable Objects. The
previous test retained all cases, their storage, and scheduled alarms until the
outer test finished. Its local replay also logged an overdue SQLite alarm.
Cloudflare's current [test API](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)
provides `reset()` for clearing attached storage and runtime state between tests.

CP-5 now explicitly disposes the fixture's RPC replies before resetting local
storage after each generated case, including failure and shrinking. This bounds
retained state to the current example. The seed,
400 cases, amount/chain ranges, settlement-count and committed-state assertions,
runtime deadlines, and outer timeout remain unchanged. Failure diagnostics now
include the generated amounts and complete returned state. This change removes
cross-case state retention without claiming that the precise hosted pending
reason has been independently reproduced.

The revised 400-case local check passes. Workerd still emits incoming-request
drain warnings during reset; explicit fixture disposal does not eliminate that
runner diagnostic. The warning is retained in verification logs rather than
suppressed, and the hosted protected gate remains required.

The check uses local service doubles. Passing it is source/runtime test evidence;
it is not a provider receipt, payment settlement, or production authorization.
