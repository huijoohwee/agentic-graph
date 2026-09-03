# agentic-graph DeerFlow Setup Guide — Companion

Continuation of [agentic-graph-deerflow-setup-guide.md](agentic-graph-deerflow-setup-guide.md). Contains Step 7 (Verify and Validate), Troubleshooting, Proxy Architecture Reference, and Revision History.

**Document Version**: 4.0.0
**Date**: 2026-05-09

---

## Step 7: Verify and Validate

### 7.1 Hardcode-Forbid Verification

The canonical fixture `agentic-graph-video-demo.md` must never be referenced by absolute filesystem path in source code. Validation:

```bash
# Must return zero matches in tracked source
git grep -n "/Users/" -- canvas/src/ \
  ':(exclude)canvas/node_modules/**' \
  ':(exclude)canvas/dist/**'
```

The fixture is loaded via the docs-SSOT helper:

```ts
import { readDocsSsotFixtureText } from '@/tests/lib/docsSsotFixture'
const text = readDocsSsotFixtureText('agentic-graph-video-demo.md')
```

### 7.2 Focused Test Suite

Run the DeerFlow-specific validation tests:

```bash
# MainPanel Integrations DeerFlow surface checks
node --import tsx src/__tests__/mainPanelIntegrations.test.ts

# Video demo renderer isolation (fixture-driven)
node --import tsx src/__tests__/workspaceImportVideoDemoRendererIsolation.test.tsx

# Storyboard Widget registry DeerFlow seed
node --import tsx src/__tests__/storyboardWidgetManagerRegistry.test.ts

# Rich media runtime dispatch
node --import tsx src/__tests__/flowWidgetOutputRichMediaReuse.test.ts
```

### 7.3 Contract Verification

| Contract | What to Verify | How |
|----------|---------------|-----|
| DFI-C001 | DeerFlow SSOT rows visible in Integrations | Search "deerflow" in MainPanel |
| DFI-C002 | Anchor deep-links resolve | Click anchor from Flow Manager |
| DFI-C003 | Frontmatter metadata parsed | Open `agentic-graph-video-demo.md` and check graph nodes |
| DFI-C004 | Provider dispatch uses active provider | Run text generation with `chatProvider = 'deerflow'` |
| DFI-C007 | Artifacts render in Rich Media Panel | Run W01/W02/W03 and check panel output |

---

## Troubleshooting

### DeerFlow Gateway Unreachable

**Symptom**: Text generation returns network error
**Check**: `curl http://localhost:8001/api/llm/chat/completions`
**Fix**: Ensure DeerFlow gateway is running on port 8001

### Provider Not Routing to DeerFlow

**Symptom**: Requests go to BytePlus instead of DeerFlow
**Check**: `store.chatProvider` in browser console
**Fix**: Set `chatProvider = 'deerflow'` in Integrations settings

### Image/Video Generation Fails with DeerFlow Provider

**Symptom**: Image or video run returns error when provider is `deerflow`
**Check**: DeerFlow gateway exposes `/api/runs/stream` and returns artifact references resolvable from the active upstream
**Fix**: Validate DeerFlow runtime config for image/video skills and ensure artifact URLs are reachable through the proxy path

### API Key Not Working in Prod

**Symptom**: Requests fail with auth error on `airvio.co` but work locally
**Check**: Cloudflare Pages > Settings > Production > Variables and Secrets
**Fix**: Ensure `AGENTIC_OS_CHAT_PROXY_OPENAI_API_KEY` (or `OPENAI_API_KEY`) and `AGENTIC_OS_CHAT_PROXY_BYTEPLUS_API_KEY` (or `BYTEPLUS_API_KEY`) are set as **Secrets** (not plain Variables)

### Fixture Not Found

**Symptom**: `agentic-graph-video-demo.md` not loaded as workspace seed
**Check**: `VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT` env var points to folder containing the fixture
**Fix**: Set the env var before starting the dev server

---

## Proxy Architecture Reference

### Request Flow: Dev vs Prod

```
DEV MODE (Vite Dev Server):
  Browser -> POST localhost:5173/__chat_proxy/*
          -> vite.config.ts middleware (createChatProxyHandler)
          -> reads process.env for API keys
          -> forwards to localhost:8001 (DeerFlow / BytePlus / OpenAI)

PROD MODE (Cloudflare Pages + Tunnel):
  Browser -> POST airvio.co/__chat_proxy/*
          -> functions/__chat_proxy/[[path]].js (Pages Function)
          -> reads env bindings for API keys
          -> forwards to Cloudflare Tunnel URL
          -> tunnel -> localhost:8001 (DeerFlow gateway on your machine)
          -> DeerFlow gateway -> upstream LLM
```

### Proxy Key Resolution Matrix

| Provider | `requiresOpenAiKey` | `requiresBytePlusKey` | Auth Header | Key Source |
|----------|--------------------|-----------------------|-------------|------------|
| `deerflow` | false | false | **None** | DeerFlow gateway handles own auth |
| `openai` | true | false | `Bearer <openai-key>` | `AGENTIC_OS_CHAT_PROXY_OPENAI_API_KEY` or `OPENAI_API_KEY` |
| `byteplus-modelark` | false | true | `Bearer <byteplus-key>` | `AGENTIC_OS_CHAT_PROXY_BYTEPLUS_API_KEY` or `BYTEPLUS_API_KEY` |
| `lm-studio` | false | false | **None** | Local gateway (same as DeerFlow) |

### Environment Variable Summary

| Variable | Dev Source | Prod Source | Used By |
|----------|-----------|-------------|---------|
| `AGENTIC_OS_CHAT_PROXY_OPENAI_API_KEY` | `process.env` | Cloudflare Secret | OpenAI provider auth |
| `OPENAI_API_KEY` | `process.env` | Cloudflare Secret | Fallback OpenAI key |
| `AGENTIC_OS_CHAT_PROXY_BYTEPLUS_API_KEY` | `process.env` | Cloudflare Secret | BytePlus provider auth |
| `BYTEPLUS_API_KEY` | `process.env` | Cloudflare Secret | Fallback BytePlus key |
| `AGENTIC_OS_CHAT_PROXY_UPSTREAM` | `process.env` | Cloudflare Variable | Default upstream URL |
| `AGENTIC_OS_CHAT_PROXY_TIMEOUT_MS` | `process.env` | Cloudflare Variable | Proxy timeout |
| `AGENTIC_OS_INTEGRATION_ALLOWED_HOSTS` | `process.env` | Cloudflare Variable | Allowed upstream hosts |

---

## Source File Reference

| File | Role |
|------|------|
| `canvas/src/lib/chatEndpoint.ts` | Provider constants, endpoint URLs, normalization, proxy header builder |
| `canvas/src/features/panels/views/deerflowApiDocs.ts` | DeerFlow SSOT integration rows |
| `canvas/src/features/panels/views/useSettingsView.ts` | Integrations tab composition with DeerFlow area |
| `canvas/src/features/storyboard-widget-manager/registryTemplates.ts` | Provider-family inference and widget normalization |
| `canvas/src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetWorkflowActions.ts` | Runtime dispatch for text/image/video generation |
| `canvas/src/features/chat/richMediaRun.ts` | Rich media request builder and BytePlus adapters |
| `canvas/src/features/chat/byteplusRunGeneration.ts` | Provider execution functions |
| `canvas/src/hooks/store/uiSliceChat.ts` | Auth mode state, auto-switching, API key sanitization |
| `canvas/src/tests/lib/docsSsotFixture.ts` | Canonical fixture loading helper |
| `canvas/vite.config.ts` | Dev-mode chat proxy middleware (`createChatProxyHandler`) |
| `huijoohwee/functions/__chat_proxy/[[path]].js` | Prod-mode Cloudflare Pages Function proxy |
| `huijoohwee/functions/api/_integrationHub.js` | Shared proxy utilities (allowed hosts, CORS, upstream resolution) |
| `huijoohwee/functions/api/llm/chat/completions.js` | DeerFlow LLM surface (stricter model allowlist) |

---

## Revision History

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 4.0.0 | 2026-05-09 | joohwee | Added "DeerFlow Is Optional" section with feature matrix, updated prerequisites with Required? column |
| 3.0.0 | 2026-05-09 | joohwee | Added Prod Mode DeerFlow via Cloudflare Tunnel (free, local machine), named tunnel for stable URL, LaunchAgent/systemd persistence, updated data flow diagrams |
| 2.0.0 | 2026-05-09 | joohwee | Added Dev/Prod proxy architecture, API key management, production proxy everywhere strategy, proxy key resolution matrix |
| 1.0.0 | 2026-05-09 | joohwee | Initial from-0-to-1 setup guide with user journey, workflow, and data flow |
