---
title: "AgenticGraph Agent Application Composition"
doc_type: "Runtime Contract"
status: "dev-runtime-ready"
schema: "application-composition-plan/v1"
invocation: "/application.compose #application-composition @application-manifest @component-catalog @integration-profile @runtime-proof"
canonical_source_contract: "docs/runtime-readiness-contract.md#docs_dependency"
external_runtime_dependency: "none"
external_framework_dependency: "forbidden"
---

# AgenticGraph Agent Application Composition

AgenticGraph turns one source-backed manifest into an exact, typed, provider-neutral application plan and executes that plan as a bounded dependency sequence. Versioned ports and capabilities allow independently owned components to cooperate while agents, integrations, approvals, transports, and receipts remain with their existing owners.

The work is an independent implementation of the pinned Agentic Canvas OS composition contract. The [LangChain repository](https://github.com/langchain-ai/langchain) influenced only the high-level goal of replaceable application building blocks. No LangChain code, prose, prompt, API, schema, fixture, test, package, service, or runtime dependency is copied or required. The composition independence guard checks its owned text/import graph, repository package manifests, lock package keys and dependency sections, requirements, VCS/version locators, and installed package names; separately owned legacy LangGraph or DeerFlow lanes are neither imported nor modified by this subsystem.

## Invocation and MCP surface

The host-side invocation is exactly:

```text
/application.compose #application-composition @application-manifest @component-catalog @integration-profile @runtime-proof
```

The aliases select these local stdio MCP tools; they are not MCP wire methods:

- `agenticgraph.application.catalog` returns component authoring schemas, exact interface/capability/owner/adapter evidence, and opaque integration records. It is read-only, zero-spend, and makes no external connection.
- `agenticgraph.application.plan` accepts a manifest and `dry-run` or `live` mode. It verifies the manifest source digest, exact catalog and adapter-policy digests, typed DAG, reachability, bounds, owner evidence, and mode-compatible adapter before producing `application-composition-plan/v1`.
- `agenticgraph.application.execute` accepts the same manifest and mode, expected plan digest, and idempotency key. It replans, rejects drift, and sequences only ready steps. It stops on the first failure, approval boundary, deadline uncertainty, or bound without automatic retry.

`@operator` is conditional runtime authority for paid, mutating, authenticated, or external work. It is deliberately absent from the canonical read-only tuple and from MCP arguments. External authorization is injected by the host owner and stays bound to the existing gateway action digest.

## Manifest invariants

`agenticgraph.application-manifest/v1` requires:

- application id and exact semantic revision;
- a `workspace:/`, `kgdoc:`, or `urn:agenticgraph:` source URI and SHA-256 of the canonical manifest projection excluding only `source.sha256`;
- the exact invocation tuple and current catalog/adapter policy digests;
- exact component id/revision slots with closed component configuration;
- typed edges, explicit entrypoint/output ports, and step/runtime/output bounds.

Nodes, edges, entrypoints, and outputs are canonicalized as unordered identity collections. Every required input has exactly one producer, output kinds are assignable to input kinds, the graph is acyclic, and every node must lie on a declared entrypoint-to-output path. The manifest envelope and built-in component schemas reject control fields for hidden code, packages, callbacks, commands, transports, providers, endpoints, headers, environment maps, credentials, approvals, raw MCP objects, and caller-supplied adapters. An admitted extension's `node.config` is instead governed by its exact closed pack schema and the embedding host's private adapter review; URL-like strings inside typed values remain inert to the composition runtime itself.

Use `source.sha256 = digestApplicationManifestSource(manifest)` after assembling the manifest with a placeholder SHA. Fetch the active `catalogDigest`, `adapterPolicyDigest`, component revisions, and component configuration schemas from `agenticgraph.application.catalog`.

## Runtime ownership

The v1 catalog provides local input, literal prompt template, registered-agent zero-call planning, approved external artifact, and output components. Adapters pin the exact component revisions and supported execution modes. The registered-agent adapter delegates to the existing `compileAgentRun(..., mode: "dry-run")` owner and cannot make a provider call. External artifact execution delegates once to the existing shared MCP gateway, uses its opaque profile/capability/schema evidence and idempotency fence, and cannot self-authorize.

Plans contain digests and public metadata, never node configuration, component source bodies, instruction text, transport configuration, secrets, or provider payloads. Live execution cancellation is propagated to the owner. Once the gateway marks actual external dispatch, every terminal application-ledger result remains protected and a later failure or cancellation carries reconciliation-required evidence; validation, approval, schema-drift, and cancellation failures before that marker remain safely TTL-evictable.

The bundled execution ledger and the gateway approval-token, idempotency, and receipt ledgers are bounded or owner-managed but process-local by default. This Dev surface does not claim cross-process replay safety or restart-safe exactly-once delivery. Embedding hosts that require those properties must inject durable bounded owners and reconcile uncertain external outcomes before retrying.

## Host component packs

Embedding hosts may admit separately authored component packs through `createApplicationComponentPackRegistry`. This is a host API, not a fourth MCP tool: `catalog`, `plan`, and `execute` retain their exact closed arguments, and callers cannot register a pack, adapter, callback, owner resolver, URL, package, module path, environment entry, command, or transport through MCP.

A pack is pure JSON with exactly `schemaVersion`, `id`, one exact selected `revision`, `source`, and `components`. Define `SEG = [a-z0-9]+(?:[._-][a-z0-9]+)*`; `source.uri` is an inert local identity in exactly `workspace:/SEG(/SEG)*`, `kgdoc:SEG(/SEG)*`, or `urn:agenticgraph:SEG(:SEG)*`. The first URN segment cannot be `http`, `https`, `file`, `ftp`, `ws`, or `wss`. Dot segments, consecutive or trailing punctuation, tilde, uppercase, nested schemes, and network-shaped variants such as `workspace://host`, `kgdoc:https://...`, and `urn:agenticgraph:http:evil` are invalid. Admission permits at most 16 packs, 16 components per pack, 100 total base-plus-pack components, and 256 KiB of canonical JSON per pack. Exactly one revision may be selected for each pack id.

`source.sha256` is exactly 64 lowercase hexadecimal characters. Its SHA-256 input is the UTF-8 encoding of `stableApplicationJson` over the pack after removing only `source.sha256` and sorting the top-level `components` array by exact id/revision. That canonicalizer sorts object keys by JavaScript code-unit order; retains all other array order and string code points without Unicode normalization; emits JSON's finite-number representation; and rejects non-finite numbers, non-JSON values, cycles, custom prototypes, symbols, accessors, hidden properties, and sparse or decorated arrays. Therefore byte equality, not visual string equivalence, defines a pack source revision.

Pack data never carries executable behavior. The host separately supplies exact adapter descriptors with private `execute` functions and one private owner resolver per extension component. Startup rejects duplicate component or adapter claims, missing or ambiguous adapters/resolvers, and interface, capability, side-effect, replay, or owner mismatch. An adapter's declared `dry-run` and/or `live` modes remain exact; planning rejects a requested mode it does not declare. There is no filesystem scan, discovery, download, install, upgrade, migration, latest/range selection, or fallback.

Pack configuration schemas use an explicit closed v1 keyword set before Ajv compilation; unknown or future-dialect keywords are rejected rather than inheriting new semantics after a validator upgrade. The dialect permits bounded type, scalar constraint, object, array, conditional/composition, and annotation keywords, with at most 32 levels, 2,048 schema nodes, 128 declared properties per object, and 1,024 items per declared array. Every object subschema sets `additionalProperties: false`; property names use normalized ASCII identifiers; and schema references, definitions, patterns, pattern properties, all format keywords, object-valued enum/const entries, and an explicit set of known high-risk command, endpoint, credential, environment, transport, package, path, secret, and token names or common aliases are rejected. These are structural defense-in-depth checks, not an attestation of private adapter semantics or every possible synonym. The embedding host must review each adapter as the semantic authority and admit only adapters that treat manifest configuration as bounded data under their declared side-effect and replay contract.

The composite `catalogDigest` binds the full selected pack set, every pack source digest, and every normalized component definition; the composite adapter-policy digest additionally binds that catalog, adapter descriptors, and owner selections. Per-component source and definition digests depend only on that raw component definition, so adding, changing, or reordering an unrelated sibling does not invent component-level drift. The global catalog digest still changes when pack membership or another member definition changes, and the caller must explicitly accept that new digest and replan. Plans bind both global digests plus the selected per-component digests. “Drift” means a conflict detected during the current admission or a mismatch against the caller-supplied `runtimeProof`; this Dev runtime does not claim a persisted baseline across processes. Owner evidence is re-resolved before execution, and any changed plan or owner evidence blocks the affected adapter before invocation.

## Evolution

Pack, component, interface, capability, schema, owner, adapter, integration profile, and application revisions are exact. A newer revision is never selected implicitly. Missing or changed evidence returns migration/drift diagnostics and leaves the existing plan unchanged. Future providers and component kinds extend the source-bound catalog and injected owner registry instead of adding provider-specific manifest fields.

## Local verification

```bash
npm run application-composition:check
```

The check covers clean-room dependency independence, canonical hashing and immutability, total fail-closed catalog and component-pack validation, exact revision and mode fences, type/reachability failures, catalog/plan privacy, order-stable composite digests, offline extension execution, hostile pack/host-binding rejection, idempotency, ledger bounds, owner stop behavior, strict MCP contracts, stdio discovery/calls, and canonical VDEOXPLN routing. It performs no paid model call, external write, deployment, or production mutation.
