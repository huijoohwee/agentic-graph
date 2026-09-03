---
title: agentic-graph Chat -> AI Markdown Pipeline (Promotion Retry Contract)
status: canonical-companion
owner: platform-ai
---

# Promotion Retry Contract

## Scope
This companion documents artifact promotion recovery after `chatAgenticGraph` has already persisted the canonical local workspace artifacts.

## Trigger
Promotion retry is relevant only when both conditions are true:

1. the canonical local artifact already exists in Workspace FS
2. GitHub mirroring or agentic-graph storage mirroring failed during finalize

Retry does not regenerate the answer, rerun validation, or replace the saved local artifact. It only retries mirroring for the already-saved paths.

## Exact Operator Command
The canonical retry command is:

```text
#promotion.retry <path...>
```

The command must include one or more normalized saved workspace paths. Typical finalize output includes both the canonical AGENTIC_OS document and its trace companion, for example:

```text
#promotion.retry /workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md /workspace/chat/20260522T195000Z/agentic-os-trace_20260522T195000Z.md
```

## Surfaces
When promotion fails after a local save, the same runnable command must be exposed across all operator-facing recovery surfaces:

- final assistant ledger text
- browser-local finalize inspection snapshot
- warning toast copy
- toast action that inserts the exact retry command into the composer

The browser-local finalize snapshot carries three recovery fields:

- `failureNote`
- `retryHint`
- `retryCommand`

## Recovery Semantics
- GitHub mirroring remains first in the promotion order.
- If GitHub mirroring fails before storage mirroring, storage is skipped for that finalize attempt.
- Retry promotion reuses the saved local workspace artifact text; it must not synthesize a new artifact body.
- A successful retry clears recovery copy and reports the mirrored promotion result instead of returning another retry command.

## Composer Boundary
- Retry insertion must reuse the shared append-focus chat path rather than a direct composer state write.
- Path-bearing retry commands must preserve their raw path arguments exactly.
- Pure invocation-token spacing may be normalized by the shared seed owner, but retry commands with concrete paths are treated as runnable literals.

## Guardrails
- Do not introduce a second promotion-control channel outside the shared chat invocation contract.
- Do not mutate Canvas graph state as part of retry; graph apply belongs to canonical local persistence, not mirror retry.
- Do not hide the exact command behind toast-only UI. The runnable command must stay visible in text surfaces too.

## Source Owners
- Retry command construction: `canvas/src/features/chat/floatingPanelChat/useFinalizeAssistantSuccess.ts`
- Browser-local finalize snapshot: `canvas/src/features/agent-ready/browserLocalSurfaceSnapshots.ts`
- Finalize contract proof: `canvas/src/__tests__/chatResponseContractPrompt.test.ts`
- Retry promotion proof: `canvas/src/__tests__/sourceFilesGitHubWrite.test.ts`
- Shared append-focus behavior: `canvas/src/__tests__/floatingPanelChatOpenSeed.test.ts`
