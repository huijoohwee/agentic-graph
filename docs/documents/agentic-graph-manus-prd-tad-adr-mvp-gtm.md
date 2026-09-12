---
title: "Manus Integration Reference PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.1"
date: "2026-09-12"
lang: "en-US"
owner: "Documentation maintainers"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-MANUS-PRD-TAD-ADR-MVP-GTM"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.2.0"
prd_revision: "0.2.1"
tad_revision: "0.2.1"
adr_revision: "0.2.1"
mvp_revision: "0.2.1"
gtm_revision: "0.2.1"
---

# Manus Integration Reference PRD-TAD-ADR-MVP-GTM

**Version**: 0.2.0  
**Date**: 2026-05-29  
**Status**: Reference-only, not implemented

## Document Purpose

This document preserves the Manus integration concept as a neutral reference. It is not an implementation contract, release note, or source-owner map. The repo currently has no Manus provider, no Manus widget, no Manus runtime adapter, and no Manus authentication path.

The purpose of this update is to prevent a non-shipped integration from competing with implemented providers such as DeerFlow, external video provider, OpenAI-compatible text generation, BytePlus, Gemini, and the Commerce/Stripe surfaces. Manus work can be activated later only by adding source owners, tests, and validation that prove the active runtime path.

## Current Repo State

| Area | Status | Notes |
|------|--------|-------|
| Chat provider registration | Not implemented | No Manus provider constant or normalization path is present. |
| Settings / Integrations UI | Not implemented | No Manus settings rows or API documentation rows are present. |
| Storyboard Widget | Not implemented | No Manus widget registry entry or typed port contract is present. |
| Rich media runtime | Not implemented | No Manus generation adapter is present in the rich-media run path. |
| Proxy authentication | Not implemented | No Manus-specific upstream header mapping is present. |
| Webhook handling | Not implemented | No Manus webhook endpoint is present. |

## Product Concept

If this integration becomes active, Manus would be treated as an agent-task provider rather than a single-shot model-inference provider. The product value would be long-running task execution, structured output extraction, connector-assisted research, and follow-up messages that can feed existing canvas rich-media panels.

Candidate user outcomes:

- A user can start an agent task from a flow node or chat-driven workflow.
- The task can return typed outputs such as text, image URLs, video URLs, or HTML content.
- The rich-media panel can render completed outputs through the existing rendering pipeline.
- Follow-up messages can refine the same task when the upstream task lifecycle supports it.

These outcomes remain inactive until implemented in source.

## Activation Requirements

An active Manus integration must land through canonical owners rather than local patches or downstream aliases.

Required owners before this document can mark Manus implemented:

| Contract | Required proof |
|----------|----------------|
| Provider identity | A shared provider constant, normalization path, and settings registration. |
| Authentication | A source-owned upstream request adapter that keeps provider-specific headers out of UI code. |
| Runtime execution | A dedicated task lifecycle adapter with bounded polling, terminal-state handling, and error projection. |
| Structured output | A typed mapper from upstream task output into existing rich-media and text widget output patches. |
| Storyboard Widget integration | A registry entry with explicit input/output fields and tests for connected-value behavior. |
| UI visibility | MainPanel or Integrations rows that explain the runtime path without duplicating provider metadata. |
| Validation | Focused tests for provider settings, runtime dispatch, output mapping, and docs/source-owner alignment. |

## Technical Direction

The integration should reuse the existing patterns that already own agentic and rich-media provider behavior:

- Provider and endpoint semantics should follow the shared chat endpoint/provider normalization path.
- Settings rows should use the shared settings row contract and API-documentation row helpers.
- Storyboard Widget entries should be added through the existing registry template owner.
- Rich-media output should use existing text/image/video/HTML patch helpers rather than a parallel panel renderer.
- Any derived cache identity must reuse shared semantic-key helpers.
- Polling and retries must be bounded and must surface terminal errors through the existing run state model.

## Non-Goals

- No external agent framework dependency.
- No client-side provider-specific secret header handling.
- No duplicate rich-media renderer.
- No file-path-specific special case for Manus artifacts.
- No compatibility remap from inactive draft field names.

## Acceptance Gate

This document can move from reference-only to implemented only when:

1. Source owners exist for provider registration, settings, runtime execution, output mapping, and UI exposure.
2. Tests cover the active runtime path and docs/source-owner alignment.
3. Validation passes through the repo's focused unit registry, `npm run hygiene:check`, and TypeScript.
4. The document is updated to name the real owners and remove reference-only language in the same change set.

Until then, Manus remains an inactive integration reference and must not be presented as shipped behavior in UI, docs, tests, or deployment notes.

## ADR: defer activation until canonical provider contracts exist

Retain this integration as an inactive reference. A future task adapter must use the existing provider normalization, settings, widget registry and output-patch contracts, with bounded polling and terminal-state handling. A parallel renderer or agent framework would duplicate those owners. No current source owner or live result supports activation; the acceptance gate above must pass before that disposition changes.

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-MANUS-PRD-TAD-ADR-MVP-GTM@0.2.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Product Concept](agentic-graph-manus-prd-tad-adr-mvp-gtm.md#product-concept) |
| TAD | [Technical Direction](agentic-graph-manus-prd-tad-adr-mvp-gtm.md#technical-direction) |
| ADR | [ADR: defer activation until canonical provider contracts exist](agentic-graph-manus-prd-tad-adr-mvp-gtm.md#adr-defer-activation-until-canonical-provider-contracts-exist) |
| MVP | [MVP — reference implementation](agentic-graph-manus-prd-tad-adr-mvp-gtm.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-manus-prd-tad-adr-mvp-gtm.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run hygiene:check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. No feature implementation artifact was independently bound by this document review; implementation disposition remains **unverified** pending the document owner’s source-to-VCC check.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
