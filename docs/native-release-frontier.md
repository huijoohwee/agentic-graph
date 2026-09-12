# Native release frontier

Production preparation must retain every registered task worktree. The former
current-frontier command depends on Canvas OS's removed scoped-lane collector and
legacy leases. Agentic OS lane metadata describes current tasks without those
leases. Use this source-owned command after protected integration and canonical
convergence when task worktrees remain registered:

```sh
npm run release:lifecycle:receipts -- materialize-native-frontier-evidence \
  --repository-root /absolute/canonical/agentic-graph \
  --source-sha EXACT_MAIN_SHA --source-tree EXACT_MAIN_TREE \
  --rollback-recapture /absolute/observed-rollback.json \
  --output /absolute/release-evidence.json
```

The command emits the existing release-evidence envelope and a sibling
`release-evidence.json.frontier.json` containing its retained observation. Optional
`--source-evidence-ref KIND=/absolute/evidence.json` arguments bind additional provider evidence;
the rollback input must describe the actual current Pages, mirror, and D1 state.
Preserve Cloudflare MCP provenance when it supplied the observations. These files
do not reconstruct a missing previous lifecycle carrier or approve a deployment.

The collector requires the primary canonical checkout on clean, remote-exact
`main`. It double-reads the registered worktrees, source revisions, index records,
HEAD/index-tracked and visible untracked file bytes, symlink text, and descriptive
Agentic OS metadata through its exported observation API. Ignored runtime files
outside HEAD and the index, including installed dependencies, are excluded.
Detached worktrees remain retained and require metadata bound to their exact
head. Missing, ambiguous, stale, hidden, unmerged, unsupported, or moving source
state stops preparation. Symlink targets are never followed. Source parents and
opened files are checked for replacement during reading. Capture is bounded to
64 worktrees, 50,000 paths per worktree, 64 MiB per file and 512 MiB per round.

Native preservation identities explicitly carry `authorizesEffects: false` and
contain no actor, session, lease epoch, or fence claims. Their alternative shape
is accepted only in preservation and disposition entries. Integration,
authorization, and deployment retain their existing exact identity contracts.
All peers are conservatively marked overlapping and retained; this command
neither unregisters worktrees nor authorizes writes to them.

Validation covers real Git worktrees, detached retention, dirty and untracked
bytes, staged deletion of ignored HEAD files, symlink text and parent races,
metadata drift, primary-checkout substitution, and rejection of preservation
identities as integration or deployment authority.
