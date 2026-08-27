# AgenticGraph — Telegram “Import URL” (FOSS + TCO) Recommendation + Implementation Plan

## Goal (as stated)

Telegram → user sends a URL → AgenticGraph imports/parses it (reuse/expose existing **Import URL** pipeline) → return a shareable **airvio.co** (AgenticGraph) link that opens the content in the Markdown editor.

Constraints: **self-hostable**, **min ops cost**, **good extraction quality**, **privacy/security**, and **stay within Cloudflare free-tier budget**.

---

## Existing AgenticGraph capability (reuse points)

AgenticGraph already has:

- Client-side **Import URL** routing (webpage / YouTube / PDF / raw text) in the Canvas app.
- A “webpage view modes” contract (`kgWebpageUrl`, `kgWebpageView`, etc.) to keep Markdown SSOT + HTML/JSON view-only surfaces.
- Dev/preview “API” middleware endpoints pattern (Vite middleware) and an existing concept of artifact persistence for website imports (e.g., `.__agenticgraph-workspace/.../website-imports/...`).

Implication: you do **not** need to invent a new parsing model; you should **expose a stable server-side AIP** that mirrors the existing Import URL behavior and returns a link that opens the editor.

---

## Recommendation (lowest TCO that still satisfies “return a link”)

### Recommended architecture: **Self-hosted Ingest API + Telegram webhook**, fronted by **Cloudflare Tunnel**

**Why this fits constraints**

- **Self-hostable**: single VM/container runs everything (AgenticGraph static + ingest API + Telegram handler).
- **Low ops**: no managed queues; SQLite + filesystem artifacts.
- **Extraction quality**: use a Python extractor (best-effort) with strict bounds; optionally upgrade quality later.
- **Security**: server can enforce allowlists, size/time limits, and private-network blocks.
- **Cloudflare free-tier**: Tunnel + DNS + (optional) caching; no Worker/D1/KV required.

### Minimal alternative (even lower TCO): “deep link only”

Telegram replies with a URL like:

`https://airvio.co/?openEditorWorkspace=1&importUrl=<encoded>`

…and the Canvas app auto-runs Import URL on page load.

This avoids server parsing/storage entirely (best privacy), but:

- The import happens only when the user opens the link (not pre-parsed).
- Share links are less stable because content lives in local IndexedDB unless you add persistence.

If your requirement is truly “parse then return a link to already-available content”, use the recommended ingest API.

---

## Proposed components (recommended path)

### 1) Telegram intake (FOSS)

- **Webhook** endpoint: `POST /api/telegram/webhook`
- Handler: validate Telegram secret token header (or HMAC), parse message text, extract first URL.
- Response: send a Telegram message containing the “Open in AgenticGraph” link.

FOSS libs:
- Python: `python-telegram-bot` (or plain webhook parsing + `requests` to Telegram API).
- Node: `telegraf`.

### 2) Import URL AIP (server-side)

Endpoint (AIP):

- `POST /api/import-url`
  - Input: `{ url: string, source?: "telegram" | "web" | "cli", options?: { includeImages?: boolean, view?: "markdown"|"html"|"json" } }`
  - Output: `{ ok: true, docId: string, editorUrl: string, title?: string, warnings?: string[] }` (or `{ ok:false, error }`)

Behavior:
- Fetch URL with **timeout** and **max-bytes** guard.
- Convert HTML → Markdown (best-effort).
- Persist:
  - `.agenticgraph-workspace/telegram-imports/<docId>/page.md`
  - `.../raw.html` (optional; enables HTML view)
  - `.../conversion.json` (optional; diagnostics)
- Return `editorUrl` that opens the Canvas editor on that doc.

### 3) “Open in editor” link (airvio.co)

Two workable patterns:

1) **Redirect shortlink**
   - `GET /r/<docId>` → `302` to `/?openEditorWorkspace=1&kgDocId=<docId>`
2) Direct deep link
   - `https://airvio.co/?openEditorWorkspace=1&kgDocId=<docId>`

### 4) Canvas support for server-backed doc IDs

On load:
- If `kgDocId` exists, Canvas fetches `/api/docs/<docId>` (Markdown) and imports it into the local workspace (or opens it as an ephemeral doc).
- If `importUrl` exists, Canvas calls the existing Import URL flow (deep link fallback path).

This keeps the editor UI unchanged: it still operates on Markdown SSOT, and webpage HTML/JSON views remain “view-only”.

---

## FOSS extraction strategy (quality vs complexity)

Baseline (already in repo):
- Existing `agenticgraph_parser.webpage_cmd.py` (simple HTML → Markdown) can serve as a no-dependency fallback.

Recommended upgrade for quality (still FOSS):
- Add `trafilatura` as primary extractor (high-quality main-content extraction).
- Fallback to “readability-like” extraction (optional) then to the existing simple parser.

Rule: always store provenance in frontmatter:

```yaml
kgWebpageUrl: "https://..."
kgWebpageView: "markdown"
kgImportSource: "telegram"
kgImportedAt: "2026-04-06T..."
kgImportExtractor: "trafilatura|simple"
```

---

## Security / privacy controls (must-have)

- **SSRF protection**: block private IP ranges, localhost, link-local, and metadata IPs; resolve DNS and re-check.
- **Allowlist (optional)**: allow only certain domains for Telegram imports.
- **Strict bounds**: timeouts, max-bytes, max-redirects; fail closed.
- **Sanitize HTML**: if you persist `raw.html`, strip scripts/handlers by default; HTML view is sandboxed iframe-only.
- **Signed doc IDs**: use non-guessable IDs (UUIDv4) and optionally HMAC-sign the redirect token.
- **Audit log**: store `{docId, url, chatId, messageId, createdAt}` in SQLite.

---

## TCO notes (qualitative)

Main cost drivers:

1) **Compute**: conversion can be CPU-heavy for long pages; cap bytes and prefer extracted main content.
2) **Ops**: secrets rotation (Telegram token), backups (SQLite + artifacts), updates.
3) **Storage growth**: HTML artifacts can be large; store Markdown always, HTML optionally + capped.

Typical minimal footprint:
- Single small VM (1 vCPU / 1–2 GB RAM) is usually enough if you cap imports.
- Cloudflare Tunnel keeps inbound HTTPS + Telegram webhook exposure simple (no firewall/port juggling).

---

## Implementation plan (repo-oriented)

### Phase 0 — Deep link support (quick win)

1) Add query param handling in Canvas:
   - `importUrl=<encoded>` → auto-run existing workspace Import URL and open editor workspace.
2) Add “import completed” toast that includes a stable “copy link” (optional).

### Phase 1 — Server-side AIP + storage

1) Add a small server (Python FastAPI recommended) under `agenticgraph/server/`:
   - `POST /api/import-url`
   - `GET /api/docs/<docId>`
   - `GET /r/<docId>`
2) Implement storage layout under `.agenticgraph-workspace/telegram-imports/`.
3) Add bounded fetch + SSRF guard + logging.

### Phase 2 — Telegram bot integration

1) Add webhook handler endpoint and minimal bot logic:
   - Extract URL; call internal `POST /api/import-url`
   - Reply with `editorUrl` (and title)
2) Add Cloudflare Tunnel config + webhook registration steps.

### Phase 3 — Quality + UX hardening

1) Upgrade extractor stack (trafilatura → fallback).
2) Add per-chat allowlist / per-user rate limits.
3) Add “HTML/JSON view” integration using existing `kgWebpageView` contract (optional).
