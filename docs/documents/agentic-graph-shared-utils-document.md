# agentic-graph Shared Utilities (grph-shared)

## Design Mantras

```
- [ ] Boundaries; keep runtime contracts explicit; forbid importing `grph-shared/src/*` directly
- [ ] Neutrality; share domain-agnostic helpers; forbid project-specific assumptions
- [ ] Compatibility; run in Node+browser; forbid shipping TS-only exports to Node consumers
- [ ] Reusability; centralize shared logic; forbid copy-paste duplication across repos
```

---

## Architecture

**Package**: `agentic-graph/grph-shared` exposes a small, stable surface used by sibling repos.

**Exports (public subpaths)**:
- `grph-shared/array/reorderList`
- `grph-shared/graph/types`
- `grph-shared/markdown/formatting`
- `grph-shared/markdown/backlinks`
- `grph-shared/markdown/slugify`
- `grph-shared/markdown/toc`
- `grph-shared/markdown/wikiLinks`
- `grph-shared/zoom/presets`
- `grph-shared/url`
- `grph-shared/hash/stringHash`
- `grph-shared/net/fetchRemoteText`
- `grph-shared/cache/LRUCache`

**Build contract**:
- Runtime imports resolve to `dist/*.js` (ESM).
- Type imports resolve to `dist/*.d.ts`.

This ensures Node-side entrypoints (notably Vite config) never attempt to execute `.ts` files from `node_modules`.

---

## Integration Points

**agentic-graph Canvas**
- Host wrappers live under `agentic-graph/canvas/src/lib/*` and re-export from `grph-shared/*`.
- `agentic-graph/canvas/vite.config.ts` may import small helpers (e.g. text sanitizers) but relies on the JS `dist/` export contract.
- Canvas scripts compile `grph-shared` as part of `predev`, `prebuild`, and `pretest:ci`.
- Repo-local shared utilities that stay renderer- or workspace-owned but neutral across surfaces should live under canonical Canvas owners such as `components/StoryboardCanvas/storyboard*`, `lib/kanban/*`, `lib/graph-data-table/*`, or `features/markdown-workspace/data-view/*`; do not force those helpers into `grph-shared` unless they are package-stable and cross-repo reusable.

**Markdown SSOT consumers**
- Viewer/Presentation share wikilinks/backlinks/slugify via `grph-shared/markdown/*` to prevent UI↔parser drift.

**Gympgrph**
- Depends on `grph-shared` via file dependency pointing at `agentic-graph/grph-shared`.
- Uses the same wrapper pattern (`gympgrph/src/lib/*`) to keep downstream imports stable.

---

## Forbidden Patterns

| Context | Intent | Directive |
|---|---|---|
| Imports | Preserve boundaries | - [ ] Use `grph-shared/*` exports only; forbid `grph-shared/src/*` imports |
| Packaging | Preserve Node compatibility | - [ ] Export `dist/*.js` for runtime; forbid exporting TS source paths |
| Ownership | Keep SSOT | - [ ] Keep shared code under `agentic-graph/grph-shared`; forbid a second sibling `../grph-shared` repo |
| Surface helpers | Preserve neutral utility ownership | - [ ] Keep Storyboard / Editor Workspace / Kanban shared helpers under one canonical Canvas owner; forbid duplicating toolbar/data-view/list utilities across renderer-specific folders |

---

## Verification (Bounded)

- `npm --prefix agentic-graph/canvas run build:grph-shared`
- `npm --prefix agentic-graph/canvas run dev` (must reach Vite “ready”)
- `node --preserve-symlinks --preserve-symlinks-main ./node_modules/tsx/dist/cli.cjs src/tests/focusedSharedUtils.ts` (Canvas)
