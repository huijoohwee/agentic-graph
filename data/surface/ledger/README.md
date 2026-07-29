# Surface promotion ledger

This directory is the reviewed location for append-only operator records, but
the local runtime never writes here automatically. A catalog source may name an
existing `instruction-<id>.json`; the instruction must authorize
`invocation.catalog.<catalogId>` for `prod` before the catalog is assembled.
No catalog approval records are present in the current baseline.

Fixture instructions and promotion records are written only beneath the
explicitly supplied operating-system temporary fixture root. Records never
contain secrets, source content, or failed attempts.

The local discoverability/IP-protection implementation cannot write a production
promotion record or mutate the public-origin repository.
