import { requireXrV2RuntimeIdentity as requireRuntimeIdentity } from './xr-v2/workspace-seed-runtime-contract.mjs'
import { parseYamlFrontmatter } from './workspace-seed-frontmatter.mjs'

/** Preserve the inventory API while sharing the runtime's pinned seed contract. */
export function requireXrV2RuntimeIdentity({ source, seedBasename, seedRelativePath }) {
  requireRuntimeIdentity({ source, basename: seedBasename, relativePath: seedRelativePath })
  const frontmatter = parseYamlFrontmatter(seedBasename, source)
  const claimScope = 'AC-1 through AC-12 exact-candidate browser proof only; AC-14 remains source-only'
  if (frontmatter.runtime_claim_scope !== claimScope) {
    throw new Error(`XR v2 workspace document ${seedBasename} has invalid authority; runtime_claim_scope must be ${claimScope}`)
  }
}
