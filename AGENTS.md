# Knowgrph Codex Routing

Before changing this repository, read and follow `docs/collaboration-runtime-contract.md` and `docs/conflict-resolution.md`.

- Keep one clean registered `main` worktree as the runtime owner; isolate each task in its own registered worktree, branch, semantic scope, and writer lease.
- When another task owns that checkout, an already-created stopped-writer commit may be delivered only through `npm run release:publish:immutable -- ...`; the object lane must not switch or edit the checkout and must emit exact paired-SHA evidence.
- Fetch `origin` before starting and create `agent/<device>/<semantic-scope>` from `origin/main`.
- Never write the same branch from two devices; stop the sender before a commit-SHA handoff.
- Declare `/`, `#`, and `@` intent before editing.
- Stop when another active pull request owns the same semantic scope.
- Never push directly to `main`; integrate only through the required `Integration Gate`.
- Never use manual `git push --no-verify` or a raw object refspec; the repository-owned immutable publisher performs the bounded object gate and records its hook mode before remote CI.
- Work only in this Dev repository unless the user explicitly expands scope.
- Never deploy or modify a Prod mirror from a developer checkout. A protected green merge to `main` proves Dev integration only. `.github/workflows/release.yml` may prepare the exact `turn:end`-reviewed candidate, but forward Production remains blocked until the protected `production` environment records explicit human authorization for that candidate; every other Cloudflare or production mutation remains forbidden.
- Resolve conflicts in the upstream source owner; regenerate derived artifacts and remove stale duplicate paths.
- Preserve unrelated worktree changes and run the affected checks selected by the canonical collaboration contract before handoff.
- At chat, session, or thread end, complete or park the current lane before running the repository-owned worktree lifecycle check. Cleanup may remove only a clean detached exact-main lane recorded as completed; it preserves branches and never uses force.
