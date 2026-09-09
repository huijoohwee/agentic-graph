---
title: "Production core runtime release"
doc_type: "Runtime Contract"
status: "active"
frontmatter_contract: "required"
---

# Production core runtime release

The universal Graph and Commerce entry surfaces share the Graph canvas. The
reviewed `config/production-release-profile.json` selects `core`: Pages plus the
existing `agentic-storage` Worker. Travel providers remain a separate optional
release. This completes the release-scope separation established in PR #908.
Changing the profile requires a protected source change and a new immutable
candidate. Environment variables cannot skip deployment prerequisites.

The core profile reuses the existing version upload, exact binding preservation,
activation, migration and compensation controller. It neither creates resources
nor activates subscriptions. The account must remain on the existing Free plan;
paid upgrades and overage authorizations are outside this release's authority.
The authenticated device executor remains available only while its Mac session
and tunnel are running. Always-on hosting is deferred.

## Required evidence

The core profile requires the existing account, zone, D1 and R2 identities,
storage signing secret, privately held operator access key, explicit key expiry,
owner identity/email and existing workspace ID. The owner identity must match
the exact protected human authorizer. Preflight verifies the account/zone owner,
storage route, identity/workspace inventory, disabled public Worker subdomains,
active version and preserved bindings. A configured key is never treated as a
workspace grant. Missing inputs fail before any upload or Pages deployment.

`/api/storage/readyz/core` checks the storage authentication schema, D1 and Canvas
room bindings, blob binding, signing secret and browser configuration. Its
`scope: core` response identifies local versus production runtime. The existing
`/api/storage/readyz` retains its full travel dependency requirements.
Neither endpoint proves a user login, merchant demand, payment, or evaluator
trust. Those claims require their own real operation receipts.

After deployment, the core probe requires production readiness, anonymous
snapshot rejection, successful native login, an authorized workspace session,
logout and rejection of the revoked cookie. Pages still undergoes its immutable, stable,
public-route and returning-service-worker checks. The core receipt cannot be
substituted for a full travel receipt.

Rollback restores exact prior Worker versions and rechecks the baseline liveness
and anonymous-denial response digests captured before deployment. The prior
version need not implement the new core endpoint. Drift, unknown upload effects,
or unproved compensation retain the existing preserve-required outcome.

## Authentication and release handoff

Cloudflare's Access checkout currently asks for consent to bill overages even
for the Free selection. Do not activate it under the free-only constraint. A
first-party session exchange reuses the existing bearer-session authority. It
requires no Access subscription. After authorized migrations and before activation,
a parameterized D1 batch may enroll the first owner into empty identity tables,
or issue a key to the same already-active owner. It never replaces an existing
identity, grant, key expiry or revocation. The access key must be stored privately
and in the protected release secret; no fixture or public artifact can provide it.

Enrollment is forward-compatible data and is retained during Worker rollback.
Success and failure receipts record this separately from version restoration;
rollback does not require an unexpired operator key. Existing identities without
the exact active owner grant fail closed and require their own authorized recovery.

Validation covers core-only activation, exact baseline restoration, failed
readiness compensation, source profile selection, cross-profile receipt
rejection, missing authentication, wrong resource ownership, local-only
readiness and anonymous-denial enforcement. The full travel transaction tests
remain required. Protected merge, fresh local review, fresh candidate evidence,
explicit candidate authorization, deployment and public readback are distinct
release steps.
