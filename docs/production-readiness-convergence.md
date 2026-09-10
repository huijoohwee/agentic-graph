---
title: "Production readiness convergence"
doc_type: "Process Guide"
status: "active"
lang: "en-US"
frontmatter_contract: "required"
---

# Production readiness convergence

The core release requires a successful public readiness response after exact Worker
activation. The probe observes at most six responses, ten seconds apart, with the
existing five-second request timeout and bounded response reader.

Only request failures, rate limiting, gateway errors, the prior storage route's
404 response, and temporary authentication-schema unavailability are retryable.
Wrong runtime or service identity, missing configuration, and other malformed
readiness responses stop immediately. Exhaustion triggers the existing restoration
flow. Every original readiness dependency and subsequent authentication check remains
required; retrying a probe does not authorize another upload or activation.

Failure diagnostics retain attempt numbers, HTTP statuses, fixed reason labels and
response digests. Arbitrary provider response text and exception messages are omitted.
The bound allows at most five waits; it cannot be raised by an environment variable.

Release run `34468065747` activated Worker version
`213b0ba9-288c-4332-bd10-4587e34ddc02` and proved existing-domain ownership, then failed
its single readiness observation. The previous Worker version was restored. Provider
metadata shows identical Worker code and bindings to version
`d51f76d9-64d8-441a-b7e4-025c4c60005e`, whose readiness and browser-session checks had
passed in run `34448248298`; the configuration digests also match. The discarded
response prevents identifying the exact transient cause. This bounded behavior is
validated against stale-route, schema-unavailable, request-failure and gateway fixtures;
only a subsequent protected release can establish production success.
