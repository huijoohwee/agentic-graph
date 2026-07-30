import fs from 'node:fs'
import path from 'node:path'

export function testWorkspaceInitializationDocsAbsRootDefaultStaysOutOfProductionBuilds() {
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts')
  const text = fs.readFileSync(viteConfigPath, 'utf8')
  if (!text.includes("if (command === 'build') return")) {
    throw new Error('expected sibling docs absolute-root defaults to stay out of production builds')
  }
  if (text.includes("if (!String(process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT || '').trim() && existsSync(siblingDocsRoot))")) {
    throw new Error('expected vite config to avoid top-level sibling docs absolute-root defaults')
  }
  if (!text.includes('applyWorkspaceInitializationDocsAbsRootDefault(command)')) {
    throw new Error('expected vite config to apply workspace docs defaults through the command-aware owner')
  }
  if (!text.includes("'import.meta.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT': JSON.stringify(workspaceInitializationDocsAbsRoot)")) {
    throw new Error('expected Dev workspace docs root to be exposed to the browser seed reconciler')
  }
  if (!text.includes("'import.meta.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_READ_ABS_ROOT': JSON.stringify(workspaceInitializationWorkspaceSeedsReadAbsRootForDev)")) {
    throw new Error('expected the active-worktree read root to be exposed to the browser seed reconciler')
  }
  if (!text.includes('resolveWorkspaceInitializationWorkspaceSeedsReadRoot({')) {
    throw new Error('expected Dev workspace seed reads to resolve through the active-worktree owner')
  }
  if (text.includes("path.resolve(configuredDocsRoot, '..', '..', 'knowgrph', 'docs', 'workspace-seeds')")) {
    throw new Error('expected Dev workspace seeds never to drift through another Knowgrph checkout')
  }
  if (!text.includes('workspaceInitializationWorkspaceSeedsReadAbsRootForDev,')) {
    throw new Error('expected the Dev mirror read policy to admit the active-worktree workspace-seeds root')
  }
}

export function testProductionHtmlInlinesGeneratedStylesheetAssets() {
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts')
  const text = fs.readFileSync(viteConfigPath, 'utf8')
  if (!text.includes('inlineHtmlStylesheetAssetsPlugin()')) {
    throw new Error('expected production build to install the shared HTML stylesheet inliner')
  }
  if (!text.includes("name: 'knowgrph-inline-html-stylesheet-assets'")) {
    throw new Error('expected HTML stylesheet inlining to live in a named Vite build plugin')
  }
  if (!text.includes('generateBundle(_options, bundle)')) {
    throw new Error('expected stylesheet inlining to use generated bundle metadata')
  }
  if (!text.includes('findBundleCssFileName') || !text.includes('cssByFileName')) {
    throw new Error('expected stylesheet inlining to resolve emitted CSS assets without hashed filename fixtures')
  }
  if (!text.includes('data-kg-inlined-stylesheet')) {
    throw new Error('expected inlined styles to carry a stable generated-source marker')
  }
  if (!text.includes('filterModulePreloadDependencies') || !text.includes('isInlinedHtmlEntryStylesheetModulePreloadDependency')) {
    throw new Error('expected inlined stylesheet assets to be removed from generated modulepreload dependency lists')
  }
  if (!text.includes('removeInlinedStylesheetDepsFromViteMapDeps') || !text.includes('rewriteViteMapDepsCalls')) {
    throw new Error('expected generated Vite dependency index maps to drop inlined stylesheet assets before deletion')
  }
  if (!text.includes('modulePreload') || !text.includes('resolveDependencies')) {
    throw new Error('expected generated modulepreload dependencies to stay under Vite build ownership')
  }
  if (!text.includes('delete bundle[fileName]')) {
    throw new Error('expected inlined CSS assets to be removed from the emitted bundle')
  }
  if (text.includes('index-DriPJwWn.css') || text.includes('index-C0aM1YPz.css')) {
    throw new Error('expected stylesheet inlining to avoid hardcoded production asset names')
  }
}
