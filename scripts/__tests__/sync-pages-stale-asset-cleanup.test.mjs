import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildAgenticGraphRedirects } from "../production-pages-routing.mjs";
import {
  XR_V2_LEGACY_MIRROR_RELATIVE_PATHS,
  XR_V2_MIRRORED_IGNORE_RELATIVE_PATH,
  XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS,
} from "../xr-v2/production-publish-contract.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const syncScriptPath = path.resolve(repoRoot, "scripts", "sync-pages-agentic-graph.mjs");
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
    "expected generated mirror cleanup to remove stale assets from content/agentic-graph",
  );
  assert.match(
    syncScript,
    /if \(await existsDir\(publicRouteDir\)\) \{\s+const publicFiles = await listAllFiles\(publicRouteDir\)\s+for \(const rel of publicFiles\) \{\s+if \(!isPublicManagedRelativePath\(rel\)\) continue\s+if \(sourceSet\.has\(rel\)\) continue\s+publicFilesToRemove\.push\(rel\)\s+\}\s+\}/m,
    "expected generated mirror cleanup to remove stale assets from /agentic-graph public routes",
  );
});

test("publish sync includes the published agent-ready dependency closure", () => {
  assert.match(syncScript, /const agentReadyBrowserRuntimeFilenames = \[/);
  assert.match(syncScript, /'browserFunctionSource\.mjs'/);
  assert.match(syncScript, /'publishedToolExecutors\.mjs'/);
  assert.match(syncScript, /'webMcpLifecycle\.mjs'/);
  assert.match(syncScript, /'webMcpLifecycleBrowserSource\.mjs'/);
  assert.match(syncScript, /\.\.\.agentReadyBrowserRuntimeFilenames\.map\(filename => \[agentReadyFeatureSource\(filename\), agentReadyFeatureTarget\(filename\)\]\)/);
  assert.match(syncScript, /'agentic-graph-agent-ready-output-schemas\.mjs'/);
  assert.match(syncScript, /'mcpAppsContractText\.mjs'/);
  assert.match(syncScript, /'mcpAppsOnboarding\.mjs'/);
  assert.match(syncScript, /'motionControlAgentReadyContract\.mjs'/);
  assert.match(syncScript, /'flightSimAgentReadyContract\.mjs'/);
  assert.match(syncScript, /'storageSyncAgentReadyContract\.mjs'/);
  assert.match(syncScript, /storageEngineMcpContractSource/);
  assert.match(syncScript, /\[storageEngineMcpContractSource, storageEngineMcpContractTarget\]/);
  assert.match(syncScript, /'probeTreeUserInputRelevance\.mjs'/);
  assert.match(syncScript, /'agentic-graph-vdeoxpln-registry-data\.mjs'/);
  assert.match(syncScript, /'agentic-graph-application-composition-vdeoxpln\.mjs'/);
  assert.match(syncScript, /cameraMcpContract\.mjs/);
  assert.match(syncScript, /richMediaTextMarkdownContractSource/);
  assert.match(syncScript, /\[richMediaTextMarkdownContractSource, richMediaTextMarkdownContractTarget\]/);
  assert.match(syncScript, /groupPanelContractSource/);
  assert.match(syncScript, /\[groupPanelContractSource, groupPanelContractTarget\]/);
  assert.match(syncScript, /\.map\(filename => \[agentReadyFeatureSource\(filename\), agentReadyFeatureTarget\(filename\)\]\)/);
});

test("publish sync includes the Group Panel tool contract dependency", () => {
  assert.match(syncScript, /groupPanelContractSource = path\.resolve\(agenticGraphRoot, 'canvas', 'src', 'features', 'group-panel', 'groupPanelContract\.mjs'\)/);
  assert.match(syncScript, /groupPanelContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'group-panel', 'groupPanelContract\.mjs'\)/);
  assert.match(syncScript, /\[groupPanelContractSource, groupPanelContractTarget\]/);
});

test("publish sync includes the cross-root semantic-key dependency", () => {
  assert.match(syncScript, /semanticKeyContractSource = path\.resolve\(agenticGraphRoot, 'contracts', 'semantic-key\.js'\)/);
  assert.match(syncScript, /semanticKeyContractTarget = path\.resolve\(mirrorRoot, 'contracts', 'semantic-key\.js'\)/);
  assert.match(syncScript, /\[semanticKeyContractSource, semanticKeyContractTarget\]/);
});

test("publish sync includes the XR scene tool contract dependency", () => {
  assert.match(syncScript, /xrSceneMcpContractSource = path\.resolve\(agenticGraphRoot, 'canvas', 'src', 'features', 'three', 'xrSceneMcpContract\.mjs'\)/);
  assert.match(syncScript, /xrSceneMcpContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'three', 'xrSceneMcpContract\.mjs'\)/);
  assert.match(syncScript, /\[xrSceneMcpContractSource, xrSceneMcpContractTarget\]/);
});

test("publish sync includes the XR animation tool contract dependency", () => {
  assert.match(syncScript, /xrAnimationMcpContractSource = path\.resolve\(agenticGraphRoot, 'canvas', 'src', 'features', 'three', 'xrAnimationMcpContract\.mjs'\)/);
  assert.match(syncScript, /xrAnimationMcpContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'three', 'xrAnimationMcpContract\.mjs'\)/);
  assert.match(syncScript, /\[xrAnimationMcpContractSource, xrAnimationMcpContractTarget\]/);
});

test("publish sync includes the motion-control tool contract dependency", () => {
  assert.match(syncScript, /motionControlMcpContractSource = path\.resolve\(agenticGraphRoot, 'canvas', 'src', 'features', 'three', 'motionControlMcpContract\.mjs'\)/);
  assert.match(syncScript, /motionControlMcpContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'three', 'motionControlMcpContract\.mjs'\)/);
  assert.match(syncScript, /\[motionControlMcpContractSource, motionControlMcpContractTarget\]/);
});

test("publish sync includes the Flight Sim tool contract dependency", () => {
  assert.match(syncScript, /flightSimMcpContractSource = path\.resolve\(agenticGraphRoot, 'canvas', 'src', 'features', 'game-flight-sim', 'flightSimMcpContract\.mjs'\)/);
  assert.match(syncScript, /flightSimMcpContractTarget = path\.resolve\(mirrorRoot, 'canvas', 'src', 'features', 'game-flight-sim', 'flightSimMcpContract\.mjs'\)/);
  assert.match(syncScript, /\[flightSimMcpContractSource, flightSimMcpContractTarget\]/);
});

test("publish sync keeps the live canvas hero markdown route in the root-managed file set", () => {
  assert.match(syncScript, /'agentic-graph-live-canvas-hero\.md'/);
});

test("publish sync replaces the implicit Pages SPA fallback with one managed 404 boundary", () => {
  assert.match(
    syncScript,
    /const publishRootManagedSourceFiles = \[\{\s+rel: '404\.html',\s+src: path\.resolve\(agenticGraphRoot, 'cloudflare', 'pages', '404\.html'\),\s+\}\]/m,
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
    "/ /content/agentic-graph/index.html 200",
    "/index.html /content/agentic-graph/index.html 200",
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
    "/content/agentic-graph/sw.js",
    "/agentic-graph/sw.js",
  ]) {
    assert.match(
      syncScript,
      new RegExp(`'${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}',\\s+'  Cache-Control: no-store`),
      `expected ${route} to bypass the HTTP cache during service-worker revision checks`,
    );
  }
  for (const route of [
    "/content/agentic-graph/agentic-graph-chat-stream-sw.js",
    "/agentic-graph/agentic-graph-chat-stream-sw.js",
    "/content/agentic-graph/agentic-graph-service-worker-revision.js",
    "/agentic-graph/agentic-graph-service-worker-revision.js",
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
    /const importedServiceWorkerRootFiles = new Set\(\['agentic-graph-chat-stream-sw\.js', 'agentic-graph-service-worker-revision\.js'\]\)/,
  );
  assert.match(
    syncScript,
    /const isBrowserRuntimeArtifactRelativePath = rel => isPublicManagedRelativePath\(rel\) \|\| importedServiceWorkerRootFiles\.has\(rel\) \|\| xrV2PublishRuntimeRelativePathSet\.has\(rel\) \|\| \/\^workbox-/,
  );
  assert.match(
    syncScript,
    /sourceFiles\s+\.filter\(isBrowserRuntimeArtifactRelativePath\)\s+\.map\(relativePath => \(\{ relativePath, absolutePath: path\.resolve\(distDir, relativePath\) \}\)\)/m,
  );
});

test("XR v2 publish sync is exact, readiness-bound, and omits the mirrored ignore file", () => {
  const expectedRuntimePaths = [
    "xr-v2/models/depth-anything-v2-small/config.json",
    "xr-v2/models/depth-anything-v2-small/preprocessor_config.json",
    "xr-v2/models/depth-anything-v2-small/onnx/model_q4f16.onnx",
    "xr-v2/wasm/ort-wasm-simd-threaded.mjs",
    "xr-v2/wasm/ort-wasm-simd-threaded.wasm",
  ];
  assert.deepEqual(XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS, expectedRuntimePaths);
  assert.deepEqual(
    XR_V2_LEGACY_MIRROR_RELATIVE_PATHS,
    expectedRuntimePaths.map(relativePath => `content/knowgrph/${relativePath}`),
  );
  assert.equal(XR_V2_MIRRORED_IGNORE_RELATIVE_PATH, "xr-v2/.gitignore");
  assert.match(syncScript, /XR_V2_MIRRORED_IGNORE_RELATIVE_PATH/);
  assert.match(syncScript, /rel === XR_V2_MIRRORED_IGNORE_RELATIVE_PATH/);
  assert.match(syncScript, /xrV2PublishRuntimeRelativePathSet\.has\(rel\)/);
  assert.match(syncScript, /\.\.\.XR_V2_LEGACY_MIRROR_RELATIVE_PATHS/);
  assert.doesNotMatch(syncScript, /content\/knowgrph\/xr-v2\/\.gitignore/);
});

test("XR v2 root and canonical routes precede the agentic-graph SPA fallback", () => {
  const rootRoute = "/xr-v2/* /content/agentic-graph/xr-v2/:splat 200";
  const canonicalRoute = "/agentic-graph/xr-v2/* /content/agentic-graph/xr-v2/:splat 200";
  const fallback = "/agentic-graph/* /content/agentic-graph/index.html 200";
  const redirects = buildAgenticGraphRedirects({
    existing: [
      "/agentic-graph/imports/* /content/agentic-graph/imports/:splat 200",
      fallback,
      "",
    ].join("\n"),
    rootFiles: [],
    redirectsPath: "/tmp/_redirects",
  });
  assert.ok(redirects.includes(rootRoute));
  assert.ok(redirects.includes(canonicalRoute));
  assert.ok(redirects.indexOf(rootRoute) < redirects.indexOf(fallback));
  assert.ok(redirects.indexOf(canonicalRoute) < redirects.indexOf(fallback));
});
