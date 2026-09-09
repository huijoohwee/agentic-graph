---
title: First-party browser storage sessions
doc_type: Runtime Guide
status: active
---

# First-party browser storage sessions

Set `AGENTIC_OS_STORAGE_BROWSER_AUTH_MODE=session-exchange` to use an existing,
operator-issued storage access key for browser sign-in without a separate Access
subscription. An absent mode retains the existing storage-specific Cloudflare
Access JWT flow. Unknown modes fail closed.

The existing `/api/storage/auth/login` entry presents a mobile form. Its POST
requires HTTPS, exact Origin, a bounded form body and one access key. The key is
looked up by its SHA-256 digest in the existing `auth_sessions` authority; the
user and workspace membership must be active. No account, grant, or parent key
is created by this route. The response creates a separate opaque browser session
in the same authority and sets a Secure, HttpOnly, SameSite=Strict host cookie.
Its lifetime cannot exceed either the configured browser TTL or the access key
expiry. Logout revokes that browser session. Workspace authorization, bearer-only
chat/room routes and the same-origin mutation boundary retain their contracts.

Production activation needs an independently authorized, privately delivered
operator access key and a provisioned identity/workspace membership. Empty D1
tables and generated fixture keys do not satisfy that prerequisite. The release
must prove successful sign-in, authorized workspace access, logout and rejection
after revocation; source tests alone are not a deployed authentication receipt.

Validation: `TSX_TSCONFIG_PATH=canvas/tsconfig.json node --import tsx --test
cloudflare/workers/agentic-graph-storage/storageBrowserSession.test.ts
cloudflare/workers/agentic-graph-storage/storageSessionExchange.test.ts` and the
storage Worker typecheck. Tests cover credential lifetime, revocation, inactive
users/memberships, CSRF, body bounds, duplicate credentials and safe redirects.
