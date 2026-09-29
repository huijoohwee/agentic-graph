---
title: "agentic-graph DeerFlow Retirement - PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "2.0.0"
date: "2026-09-29"
lang: "en-US"
owner: "Documentation maintainers"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-0232231d4a19--website-import-bounded-writes"
agent_id: "codex-01a0eaf6"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-DEERFLOW-PRD-TAD-ADR-MVP-GTM"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "6d532fec2db865d296c2cd6387d8a02b810d6821"
previous_document_version: "1.2.1"
prd_revision: "2.0.0"
tad_revision: "2.0.0"
adr_revision: "2.0.0"
mvp_revision: "2.0.0"
gtm_revision: "2.0.0"
status: "retired"
---

# DeerFlow retirement

## PRD

The URL import toolbar must not expose a retired provider. The audit found that
native Chat URL import had replaced its old provider bypass, while Launch,
settings, rich-media generation, widget presets and local gateway startup still
retained an independent DeerFlow integration. The earlier icon-row change preserved
that stale control; this change retires its complete executable path.

Acceptance: no DeerFlow provider option, alias, dedicated endpoint, import action,
media adapter, health check, settings row, widget family or startup command remains.
Native URL import, repository import, headless crawl and supported provider routes
must retain their existing behavior. Existing user workspace artifacts are untouched.

## TAD

Delete the three dedicated gateway/import runtime modules and the gateway settings
module. Remove their dispatchers, exports, registry forms, API-index generator entry
and test registrations. Remove the gateway-only dev:all launcher; npm run dev is the
existing development entry point. Keep shared transport and media owners intact.
The local text demo uses the existing local provider and model selection.
Remove the development proxy's hidden LangGraph thread/run translation, legacy
upstream environment alias and catch-all gateway-mode alias. Local models and chat
completions now pass through their configured OpenAI-compatible endpoints unchanged.

## ADR

Remove the implementation instead of renaming its transport or introducing an alias
or compatibility shim. Do not change generic provider normalization or rewrite user
configuration. Previously configured gateway users must select a supported provider
before a new run. Historical conceptual citations remain references only; this record
retains the same continuity ID and explicitly supersedes the former shipped claims.
Obsolete setup, delivery instructions and generated gateway API reference are removed.

## MVP and verification

Source lane: /fix #remove-deerflow @codex-01a0eaf6, native successor of
6d532fec2db865d296c2cd6387d8a02b810d6821. Budget: 45 minutes, at most 75 changed files,
300 KiB patch and no new runtime modules or dependencies. Repository-wide traversal
covers tracked source, scripts, tests, seed inputs, API generation and documentation.
The 99 focused provider, settings, registry, import, media and design checks pass.
TypeScript/local Vite checks, core runtime, relay storage, repository packaging,
runtime readiness and storage parent-child browser checks pass. A loopback-only
mock against the live development proxy verifies unchanged model discovery and chat
completion paths, payloads and responses with no thread/run requests. Browser checks
requiring a clean commit run after candidate creation. Protected integration and
production evidence remain separate.

An optional broader storyboard-output check found an inherited durable-artifact
source assertion failure in unchanged workflow files. The prior candidate also has
a protected mobile spatial-review failure; the coordinating owner will repair these
on a successor after this exact source handoff. Neither is retirement acceptance proof.

## GTM and rollback

Remove a misleading option from the import journey and stop presenting an obsolete
gateway as shipped. No paid resource, new service, external-provider request or
commercial uptake is introduced or claimed. Value and willingness to pay remain
unmeasured. Rollback is an explicit revert of this retirement revision after review;
never silently route a failed native import through the deleted gateway. Production
promotion and rollback require their own exact-candidate authorization and receipt.
