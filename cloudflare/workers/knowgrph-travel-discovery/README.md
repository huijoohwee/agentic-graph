# Knowgrph travel discovery provider

This service-binding-only Worker adapts the Atlas/aTriptech Search and Verify
APIs to `knowgrph.travel-discovery/v1`. It never returns synthetic inventory or
a search-only fare. The selected search result is sent to `verify.do`; only a
successful, currency-consistent verification becomes a `verified` quote.
Verification does not claim that an order exists or that inventory is held.

Required runtime values are intentionally absent from repository configuration:

- `ATLAS_API_BASE_URL`
- `ATLAS_SEARCH_PATH`
- `ATLAS_VERIFY_PATH`
- `ATLAS_ROUTE_CATALOGUE_JSON`
- `ATLAS_CLIENT_ID`
- `ATLAS_CLIENT_SECRET`

`ATLAS_READINESS_PROBE_TIMEOUT_MS` is a bounded non-secret runtime variable.
`/readyz` performs a bounded, non-booking Atlas Search→Verify capability and
authentication probe against the first sorted operator route, preserving the
same itinerary identity across both calls. Configuration alone never yields a
ready response; successful Search and Verify contract responses are required.
The production search-plus-verify phase shares a 5.5-second wall-clock budget;
that is a configured safety boundary, not a live provider latency claim.

The route catalogue is a JSON object keyed by Knowgrph leg ID. Each value must
provide `tripType`, passenger counts, `fromCity`, `toCity`, `fromDate`,
`retDate`, up to five `airlines`, `expectedCurrency`, and
`currencyMinorUnits`. `/readyz` returns `503 provider-unconfigured` and names
missing keys until all values validate. `/livez` never reports configuration.
Search and Verify routings must both match the configured direction, departure
date, and carrier allowlist; their complete carrier/flight/airport/time segment
identity must also match exactly before a fare is labelled verified.

Atlas documents authenticated JSON `POST` calls using the
`x-atlas-client-id` and `x-atlas-client-secret` headers, and identifies
`routingIdentifier` as the search result token passed to `verify.do`:
<https://resources.atriptech.com/api-document/api-reference/booking-apis/verify>.
