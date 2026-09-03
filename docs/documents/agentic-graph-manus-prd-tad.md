# Manus Integration Reference PRD/TAD

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
