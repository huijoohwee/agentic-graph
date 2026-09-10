# Release job linked-package dependencies

Production run [34416448086](https://github.com/huijoohwee/agentic-graph/actions/runs/34416448086)
accepted the exact human authorization, then failed the non-mutating storage
Worker preflight. Wrangler could not resolve `grph-shared/hash/stringHash`
because its package export points to generated `dist/hash/stringHash.js`.
The deploy job had installed dependencies into a fresh checkout without
building that workspace. The earlier verification job had built the workspace
as part of Canvas verification; those generated files were not transferred to
the separate deploy job.

The shared release dependency installer now calls the existing `smoke:prepare`
owner after a successful locked install. That owner builds `grph-shared` and
`gympgrph` from the current checkout. Both release jobs use the installer, and
preparation failure stops the job before Worker preflight. The collaboration
CI scope also explicitly owns changes to this installer.

Verification used a fresh registered worktree with no generated shared-package
exports. After `npm ci --ignore-scripts`, this non-mutating command reproduced
the same missing-module error:

```sh
npx --no-install wrangler versions upload \
  --config cloudflare/workers/agentic-graph-storage/wrangler.toml \
  --dry-run --outdir /tmp/agentic-graph-storage-dry
```

Running `bash scripts/install-production-release-dependencies.sh` then made the
same dry-run succeed. All 31 existing production-release contract tests also
passed. No package export alias or generated source file was added.

The failed run skipped Pages deployment, Worker deployment, D1 reconciliation,
and mirror publication. Its raw failure and authorization receipts are retained.
These local checks establish clean-checkout build behavior; the repaired source
still requires protected integration, a fresh reviewed release candidate, and
authorization of that exact candidate before production activation.
