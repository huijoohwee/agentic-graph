# AgenticGraph Repo Hygiene (Artifacts + History Purge)

## Goal

Keep the repository fast to clone/pull/push by preventing large local artifacts from being tracked, and by purging previously-committed artifact blobs from git history.

## Artifact Policy (SSOT)

- `.agenticgraph-workspace/` is a local artifact root (PDF workspace, website-import artifacts, per-URL `raw.html`, etc).
- `.agenticgraph-workspace/` must never be committed.
- In this repo, `.agenticgraph-workspace/` is a repo-local ignored runtime root. It is disposable and may be removed between verification runs.
- Workflow preview artifacts are generated under `data/outputs/agenticgraph-workflow-preview/` and must stay ignored; source docs under `docs/documents/` remain canonical.

## Ignore Rules

- `agenticgraph/.gitignore` must include `.agenticgraph-workspace` and `.agenticgraph-workspace/`.
- `agenticgraph/.gitignore` must ignore `data/outputs/` and the removed tracked generated preview root `data/agenticgraph-workflow-preview/`.
- Runtime and sandbox-specific ignore rules must not reintroduce `.agenticgraph-workspace/` or generated preview outputs as tracked source.

## Cross-Repo Policy

Apply the same “no large local artifacts in git history” rule to these repos:

- `/GitHub/agenticgraph`
- `/GitHub/singabldr`
- `/GitHub/chatgrph`

Common paths to exclude from history (when they accidentally get committed):

- `node_modules/**`
- `backups/**`
- `git-error-*`
- `.DS_Store`
- `.agenticgraph-workspace/**`

## When To Purge History

Purge history when any of the following are true:

- `.git` directory becomes unusually large.
- cloning/pulling becomes slow.
- large artifacts were previously committed (PDFs, `raw.html`, website-import blobs, generated preview outputs).

## History Purge Procedure (git-filter-repo)

This rewrites commit history. All collaborators must re-clone after the force-push.

1) Ensure the working tree is clean and all intended changes are committed.

2) Create a local backup tag/branch:

```bash
TS=$(date +%Y%m%d-%H%M%S)
git tag "backup/pre-history-purge-$TS"
git branch "backup/pre-history-purge-$TS"
```

3) Run `git-filter-repo` to drop artifact paths from all commits:

```bash
python3 -m pip install --user git-filter-repo
python3 -m git_filter_repo --force \
  --path .agenticgraph-workspace \
  --path data/agenticgraph-workflow-preview \
  --path-glob 'git-error-*' \
  --invert-paths
```

4) Garbage collect to actually reclaim space:

```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

5) Restore the remote (git-filter-repo may remove `origin`):

```bash
git remote add origin https://github.com/<owner>/agenticgraph.git
```

6) Force-push rewritten history:

```bash
git push --force-with-lease --set-upstream origin main
git push --force-with-lease --tags
```

## Post-Purge Requirements

- Anyone with an existing clone must do a fresh clone.
- Any open PRs based on old commit hashes must be recreated.

## Safety Invariants

- Never commit: `.agenticgraph-workspace/**`.
- Never commit: generated preview outputs under `data/` unless explicitly needed and bounded.
- Never commit: TypeScript incremental build info (`*.tsbuildinfo`).
- Never commit: local Cloudflare/Wrangler state under `.wrangler/**`.
- Never reintroduce root config/script duplicates: `configs/`, `llm-chat-config/`, `orchestrator-config/`, `schema-config/`, `trash_rm_scripts/`, `canvas/trash_rm_scripts/`, or root `organize_todo.py`.
- Keep active config inputs under `data/config/`; keep moved utility scripts under `scripts/`.
- Keep editor workspace notes out of tracked source: `.trae/` and `canvas/.trae/` must stay absent.
- Keep local smoke and shell scratch outputs out of active source, including `canvas/tmp-*`, `canvas/tmp_*`, `canvas/=`, `canvas/B,`, `canvas/{`, and root `{target}`.
- Keep stale archives and dated generated reports out of active source: `docs/documents/deprecated/`, `docs/documents/agenticgraph-api-reference/_archive/`, `docs/documents/api-reference/`, root `test-report/`, root `todo-log_*.md`, and dated `docs/reports/prd-codebase-gap-report_*.md`.
- Never commit: `node_modules/**` or ad-hoc backup bundles under `backups/**`.
- Keep repo-owned test fixtures under `data/test-data/`; optional large external fixtures must be passed explicitly through environment variables and stay outside tracked source.
- Keep Pages deploy content constrained: `content/agenticgraph` must only include built `assets`, entry `index.html`, favicon, settings, and small examples; scripts exclude cesium, vendor/mermaid bundles, demo, examples, and large test JSON from sync/publish.
- Keep Canvas and Toolbar entry chunks lean: prefer lazy-loaded bundles for heavy tool surfaces (MainPanel, Toolbar menus, MarkdownWorkspace, workspace export bridge, Graph Data Table) and dynamic imports for rare exports; forbid deep source-level manualChunks and uncontrolled entry growth that make low-end devices or mobile browsers unresponsive.
- Before optimization or refactor work, clean unrelated pending changes in all repos, preserve only scoped code/test diffs, and treat `content/agenticgraph` artifacts as generated outputs mirrored from `canvas/dist` rather than hand-edited configuration state.
