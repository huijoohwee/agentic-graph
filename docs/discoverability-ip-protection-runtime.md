---
title: "Discoverability and IP Protection Runtime"
doc_type: "Runtime Contract"
status: "active"
surface_registry: "../config/surface-registry.json"
license_registry: "../config/license-registry.json"
---

# Discoverability and IP Protection Runtime

This runtime turns one reviewed surface declaration into deterministic public
discovery candidates while defaulting unknown material to `private`. It performs
no network requests, model calls, deployment, or writes to the public-origin
repository.

## Authority and decisions

- `config/surface-registry.json` is the only classification and discovery
  source. Generated files must not infer new public entries from the current
  public tree.
- `config/license-registry.json` is the class-to-terms authority. It validates
  registry mappings and renders the root reuse declaration; it does not decide
  discoverability.
- All five fetch-on-behalf proxies are gated at 20 requests per 60 seconds.
- Bundled browser output and allowlisted distribution modules use
  `LicenseRef-airvio-no-reuse-1.0`.
- The published content signal is
  `ai-train=no, search=yes, ai-input=yes`.
- Discovery metadata is permitted to describe an invocation token, but the only
  inbound agent protocol is MCP. Approval-gated or spend-bearing work targets
  the control-plane MCP through the app-owned invocation forwarder.

## Local workflow

Run from the agentic-graph repository:

```sh
npm run surface:validate
npm run surface:generate
npm run surface:diff
npm run surface:gate
npm run surface:audit
npm run surface:verify
npm run surface:check
```

Generation writes only beneath `.tmp/surface-staging/`. The publication gate
evaluates registry validity, route coverage, secret findings, generated-file
round trips, discovery drift, license mappings, invocation metadata, and
operator approval. It reports every discovered block rather than stopping at
the first failure.

`surface:verify` is the protected source-validation command: it runs the
focused tests, validates only source-owned registry, catalog, and declared-route
authority, and materializes the disposable candidate. It does not read or attest
the public-origin repository. `surface:check` additionally audits the tracked
public estate and generated-versus-live drift. It exits non-zero while public
source, unclassified paths, missing governed files, or discovery drift remain;
a green source gate is not a green public-estate claim.

The generated surface contains:

- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `openapi.json`
- `.well-known/api-catalog`
- `.well-known/agent-card.json`
- `.well-known/mcp.json`
- per-document `.well-known/structured-data/*.jsonld`
- `REUSE.md`

Gated routes appear only as `Disallow` directives in `robots.txt`; they are
never public discovery entries. Secret reports contain only path, category, and
1-based line number, never a matched value. The API catalog and MCP manifest
consume the policy-filtered catalog assembled by the local authority loader;
the API catalog projects every approved entry and the MCP manifest projects
only its public, read-only MCP tools. Source documents and implementation
metadata are never serialized. The baseline materializes the seven
registry-owned read-only MCP tool identifiers and their exact digest;
unapproved dev-only `/`, `@`, and `#` dictionaries stay excluded. Approval
booleans embedded in a dictionary or catalog descriptor are not operator
records and cannot widen that catalog. An optional
`catalogSources[].approvalInstructionId` becomes effective only when it resolves
to an earlier append-only `Operator_Instruction` for destination `prod` that
authorizes `invocation.catalog.<catalogId>`; a missing, future, or mismatched
record blocks generation.

## Promotion boundary

`surface:instruct-fixture <request.json>` appends an exact instruction beneath a
real operating-system temporary fixture root. `surface:promote-fixture
<request.json>` then reads that recorded instruction, recomputes the publication
gate from trusted authorities and staged bytes, and performs an atomic fixture
promotion. Caller-supplied inline approvals and precomputed permit results are
rejected. Every generated discovery or reuse candidate must also be
byte-identical to the output regenerated from the trusted registries; matching
entry identifiers alone are insufficient. Both commands reject the resolved
sibling public-origin repository and any non-fixture target. The implementation
cannot deploy, write Cloudflare, or mutate the public-origin repository.

Production serving latency, live zero-cost delivery, and public deployment
checks remain separate post-merge release evidence. Local readiness must not
claim those deployed verification criteria.

## Evidence and records

Audit output is deterministic JSON and reports observed execution evidence,
per-file before/after digests, full tracked-path classification, and a read-only
generated-versus-live diff. One 60-second budget covers authority loading,
classification, diffing, audit, and post-audit digest verification. The before
snapshot binds the exact registry, schema, route manifest, catalog, approval,
and tracked-path set consumed while authority is loaded; the after snapshot
reads them again. Mutation, creation, deletion, or a tracked-path-set change
during the decision path therefore blocks readiness. Fixture promotion
regenerates the same policy-filtered catalog and appends content-addressed
records only within its temporary fixture ledger; failed or unapproved runs
roll back the fixture destination and append no records.

The repository collaboration contract owns affected-path selection and runs
`npm run surface:verify` whenever registry, schema, surface runtime, ledger, or
this contract changes. The operator-facing `surface:check` remains the stricter
full-estate gate.
