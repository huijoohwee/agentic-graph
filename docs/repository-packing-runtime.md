---
schema: agentic-graph-runtime-readiness/v1
feature: repository-packing
invocation: /repository.pack #repository-packing @repository-root @runtime-proof
mcp_tool: agentic-graph.repository.pack
transport: local-stdio
artifact_format: agentic-graph-repository-pack/v1
---

# Repository packing runtime

`agentic-graph.repository.pack` creates one deterministic Markdown artifact from an exact Git worktree beneath the MCP host's `AGENTIC_OS_ROOT`. Its closed request has exactly `repositoryPath`, `outputDirectory`, `includePaths`, `excludePaths`, `maxFiles`, `maxFileBytes`, and `maxTotalBytes`. The first four values remain repository-relative; callers can lower the three content bounds but cannot configure the host-only output, response, path, policy, or runtime ceilings. `maxFiles` applies to the selected candidates after include/exclude policy.

Git is the inventory authority. The runtime admits tracked files and untracked files that are not ignored, applies normalized include/exclude prefixes, sorts raw UTF-8 paths bytewise, and always removes its output directory from the source set. Policy-excluded paths are aggregate-counted but their names and policy values never enter the artifact or MCP result. Git runs with inherited Git variables removed, system/global configuration disabled, repository fsmonitor and hooks disabled, optional protocols forbidden, and prompts disabled; repository configuration and executable files remain inert. Every selected path is checked for canonical repository containment. Index mode `160000` is a typed submodule omission even when its worktree path is absent. Safe internal symbolic links and non-regular entries receive typed omissions; an escaping link blocks. Binary bytes are not embedded. Sensitive paths, high-confidence credentials, and any file, aggregate, artifact, or time overflow block the whole operation.

The runtime reads regular files through no-follow handles, binds device and inode identity, applies bounded reads, and revalidates root identity, exact Git revision, index metadata, inventory, and source identities before staging. The original Markdown grammar contains `Repository Pack Manifest`, `Path Index`, and `Source Records` sections. Each source record carries an exact byte length and SHA-256, so its UTF-8 source bytes are recoverable whether or not the source ended with a newline. The manifest records policy counts, never policy values. A private exclusive staging file is synced and atomically hard-linked without replacement as `<outputDirectory>/<artifactSha256>.md`; the successful no-replace link is the publication commit point. A matching destination is reused; a mismatching destination blocks the run.

The closed `agentic-graph-repository-pack-result/v1` response returns only repository-relative artifact metadata, both SHA-256 digests, Git revision state, counts, bounds, omissions, reuse state, and `networkCalls: 0`, `modelCalls: 0`, `inputTokens: 0`, `outputTokens: 0`, and `costUsd: 0`. It returns no source content over MCP and performs no model, provider, paid, service, or network call.

## Independent implementation boundary

The format, contract, runtime, tests, and defaults in this repository are authored for agentic-graph. [yamadashy/repomix](https://github.com/yamadashy/repomix) is acknowledged only as conceptual inspiration for the broad idea of making a repository easier to present to an AI. agentic-graph does not copy or depend on its code, prose, schemas, prompts, assets, defaults, fixtures, tests, package, binary, service, or network behavior.

Run `npm run repository-pack:check` for the focused contract, runtime, stdio, and independence gates.
