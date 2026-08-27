import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const syncScriptPath = path.resolve(repoRoot, "scripts", "sync-pages-agenticgraph.mjs");
const syncScript = fs.readFileSync(syncScriptPath, "utf8");
const routingSource = fs.readFileSync(
  path.resolve(repoRoot, "scripts", "production-pages-routing.mjs"),
  "utf8",
);

test("publish sync removes stale generated assets from both mirror trees", () => {
  assert.equal(
    syncScript.includes("const isRetainedAssetRelativePath"),
    false,
    "expected publish sync to avoid retaining stale assets by helper guard",
  );
  assert.match(
    syncScript,
    /const isPublicManagedRelativePath = rel => Boolean\(rel\) && \(rel\.startsWith\('assets\/'\) \|\| publicManagedRootFiles\.has\(rel\)\)/,
    "expected public-managed publish paths to include hashed asset bundles",
  );
  assert.match(
    syncScript,
    /if \(await existsDir\(targetDir\)\) \{\s+const targetFiles = await listAllFiles\(targetDir\)\s+for \(const rel of targetFiles\) \{\s+if \(isPreservedRelativePath\(rel\)\) continue\s+if \(sourceSet\.has\(rel\)\) continue\s+filesToRemove\.push\(rel\)\s+\}\s+\}/m,
    "expected generated mirror cleanup to remove stale assets from content/agenticgraph",
  );
  assert.match(
    syncScript,
    /if \(await existsDir\(publicRouteDir\)\) \{\s+const publicFiles = await listAllFiles\(publicRouteDir\)\s+for \(const rel of publicFiles\) \{\s+if \(!isPublicManagedRelativePath\(rel\)\) continue\s+if \(sourceSet\.has\(rel\)\) continue\s+publicFilesToRemove\.push\(rel\)\s+\}\s+\}/m,
    "expected generated mirror cleanup to remove stale assets from /agenticgraph public routes",
  );
});

test("publish sync includes the published agent-ready dependency closure", () => {
  assert.match(syncScript, /const agentReadyBrowserRuntimeFilenames = \[/);
  assert.match(syncScript, /'browserFunctionSource\.mjs'/);
  assert.match(syncScript, /'publishedToolExecutors\.mjs'/);
  assert.match(syncScript, /'webMcpLifecycle\.mjs'/);
  assert.match(syncScript, /'webMcpLifecycleBrowserSource\.mjs'/);
  assert.match(syncScript, /\.\.\.agentReadyBrowserRuntimeFilenames\.map\(filename => \[agentReadyFeatureSource\(filename\), agentReadyFeatureTarget\(filename\)\]\)/);
  assert.match(syncScript, /'agenticgraphAgentReadyOutputSchemas\.mjs'/);
  assert.match(syncScript, /'mcpAppsContractText\.mjs'/);
  assert.match(syncScript, /'mcpAppsOnboarding\.mjs'/);
  assert.match(syncScript, /'motionControlAgentReadyContract\.mjs'/);
  assert.match(syncScript, /'flightSimAgentReadyContract\.mjs'/);
  assert.match(syncScript, /'storageSyncAgentReadyContract\.mjs'/);
  assert.match(syncScript, /storageEngineMcpContractSource/);
  assert.match(syncScript, /\[storageEngineMcpContractSource, storageEngineMcpContractTarget\]/);
  assert.match(syncScript, /'probeTreeUserInputRelevance\.mjs'/);
  assert.match(syncScript, /'agenticgraphVdeoxplnRegistryData\.mjs'/);
  assert.match(syncScript, /'agenticgraphApplicationCompositionVdeoxpln\.mjs'/);
  assert.match(syncScript, /cameraMcpContract\.mjs/);
  assert.match(syncScript, /richMediaTextMarkdownContractSource/);
  assert.match(syncScript, /\[richMediaTextMarkdownContractSource, richMediaTextMarkdownContractTarget\]/);
  assert.match(syncScript, /groupPanelContractSource/);
  assert.match(syncScript, /\[groupPanelContractSource, groupPanelContractTarget\]/);
  assert.match(syncScript, /\.map\(filename => \[agentReadyFeatureSource\(filename\), agentReadyFeatureTarget\(filename\)\]\)/);
});

test("publish sync includes the Group Panel tool contract dependency", () => {
  assert.match(syncScript, /groupPanelContractSource = path\.resolve\(agenticgraphRoot, 'canvas', 'src', 'features', 'group-panel', 'groupPanelContract\.mjs'\)/);
  assert.match(syncScript, /groupPanelContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'group-panel', 'groupPanelContract\.mjs'\)/);
  assert.match(syncScript, /\[groupPanelContractSource, groupPanelContractTarget\]/);
});

test("publish sync includes the cross-root semantic-key dependency", () => {
  assert.match(syncScript, /semanticKeyContractSource = path\.resolve\(agenticgraphRoot, 'contracts', 'semantic-key\.js'\)/);
  assert.match(syncScript, /semanticKeyContractTarget = path\.resolve\(mirrorRoot, 'contracts', 'semantic-key\.js'\)/);
  assert.match(syncScript, /\[semanticKeyContractSource, semanticKeyContractTarget\]/);
});

test("publish sync includes the XR scene tool contract dependency", () => {
  assert.match(syncScript, /xrSceneMcpContractSource = path\.resolve\(agenticgraphRoot, 'canvas', 'src', 'features', 'three', 'xrSceneMcpContract\.mjs'\)/);
  assert.match(syncScript, /xrSceneMcpContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'three', 'xrSceneMcpContract\.mjs'\)/);
  assert.match(syncScript, /\[xrSceneMcpContractSource, xrSceneMcpContractTarget\]/);
});

test("publish sync includes the XR animation tool contract dependency", () => {
  assert.match(syncScript, /xrAnimationMcpContractSource = path\.resolve\(agenticgraphRoot, 'canvas', 'src', 'features', 'three', 'xrAnimationMcpContract\.mjs'\)/);
  assert.match(syncScript, /xrAnimationMcpContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'three', 'xrAnimationMcpContract\.mjs'\)/);
  assert.match(syncScript, /\[xrAnimationMcpContractSource, xrAnimationMcpContractTarget\]/);
});

test("publish sync includes the motion-control tool contract dependency", () => {
  assert.match(syncScript, /motionControlMcpContractSource = path\.resolve\(agenticgraphRoot, 'canvas', 'src', 'features', 'three', 'motionControlMcpContract\.mjs'\)/);
  assert.match(syncScript, /motionControlMcpContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'three', 'motionControlMcpContract\.mjs'\)/);
  assert.match(syncScript, /\[motionControlMcpContractSource, motionControlMcpContractTarget\]/);
});

test("publish sync includes the Flight Sim tool contract dependency", () => {
  assert.match(syncScript, /flightSimMcpContractSource = path\.resolve\(agenticgraphRoot, 'canvas', 'src', 'features', 'game-flight-sim', 'flightSimMcpContract\.mjs'\)/);
  assert.match(syncScript, /flightSimMcpContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'game-flight-sim', 'flightSimMcpContract\.mjs'\)/);
  assert.match(syncScript, /\[flightSimMcpContractSource, flightSimMcpContractTarget\]/);
});

test("publish sync keeps the live canvas hero markdown route in the root-managed file set", () => {
  assert.match(syncScript, /'agenticgraph-live-canvas-hero\.md'/);
});

test("publish sync replaces the implicit Pages SPA fallback with one managed 404 boundary", () => {
  assert.match(
    syncScript,
    /const publishRootManagedSourceFiles = \[\{\s+rel: '404\.html',\s+src: path\.resolve\(agenticgraphRoot, 'cloudflare', 'pages', '404\.html'\),\s+\}\]/m,
  );
  assert.match(syncScript, /publishRootManagedFilesToCopy/);
  assert.match(
    syncScript,
    /copyPlainFile\(entry\.src, path\.resolve\(mirrorRoot, entry\.rel\)\)/,
  );
  assert.match(
    syncScript,
    /const obsoleteGeneratedMirrorFiles = new Set\(\[\s+'index\.html',/m,
    "expected publish sync to remove the superseded static root shell",
  );
  for (const staleRedirect of [
    "/ /content/agenticgraph/index.html 200",
    "/index.html /content/agenticgraph/index.html 200",
    "/hackamap /hackamap/ 301",
    "/hackamap/ /content/hackamap/index.html 200",
    "/hackamap/* /content/hackamap/:splat 200",
    "/user-secrets*.json /404 404",
    "/content/singabldr/user-secrets*.json /404 404",
  ]) {
    assert.match(routingSource, new RegExp(staleRedirect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(routingSource, /\.filter\(line => !obsoleteRedirectLines\.has\(line\.trim\(\)\)\)/);
});

test("publish sync prevents HTTP caching of every mutable service-worker script", () => {
  for (const route of [
    "/content/agenticgraph/sw.js",
    "/agenticgraph/sw.js",
  ]) {
    assert.match(
      syncScript,
      new RegExp(`'${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}',\\s+'  Cache-Control: no-store`),
      `expected ${route} to bypass the HTTP cache during service-worker revision checks`,
    );
  }
  for (const route of [
    "/content/agenticgraph/agenticgraph-chat-stream-sw.js",
    "/agenticgraph/agenticgraph-chat-stream-sw.js",
    "/content/agenticgraph/agenticgraph-service-worker-revision.js",
    "/agenticgraph/agenticgraph-service-worker-revision.js",
  ]) {
    assert.match(syncScript, new RegExp(`'${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
  }
  assert.match(
    syncScript,
    /flatMap\(route => \[route, '  Cache-Control: no-store, no-cache, must-revalidate, max-age=0'\]\)/,
    "expected every imported service-worker script route to share the cache-bypass policy",
  );
});

test("runtime readiness digest includes every generated service-worker executable", () => {
  assert.match(
    syncScript,
    /const importedServiceWorkerRootFiles = new Set\(\['agenticgraph-chat-stream-sw\.js', 'agenticgraph-service-worker-revision\.js'\]\)/,
  );
  assert.match(
    syncScript,
    /const isBrowserRuntimeArtifactRelativePath = rel => isPublicManagedRelativePath\(rel\) \|\| importedServiceWorkerRootFiles\.has\(rel\) \|\| \/\^workbox-/,
  );
  assert.match(
    syncScript,
    /sourceFiles\s+\.filter\(isBrowserRuntimeArtifactRelativePath\)\s+\.map\(relativePath => \(\{ relativePath, absolutePath: path\.resolve\(distDir, relativePath\) \}\)\)/m,
  );
});
