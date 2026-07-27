import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const root = process.cwd();
const documentedBaselineBytes = 6_023_998;
const deterministicBaselineBytes = 6_027_959;
const maximumDeltaBytes = 250 * 1024;
const prohibitedDependencies = [
  "cesium",
  "deck.gl",
  "@deck.gl/core",
  "@deck.gl/mapbox",
  "kepler.gl",
  "mapbox-gl",
  "openlayers",
  "ol",
];
const runtimeFiles = [
  "gympgrph/src/enhancedLayerConfig.ts",
  "gympgrph/src/extrusionHeight.ts",
  "gympgrph/src/enhancedLayerLoad.ts",
  "gympgrph/src/asset3dCustomLayer.ts",
  "gympgrph/src/useEnhancedGeospatialLayers.ts",
  "gympgrph/src/useEnhancedGeospatialHostLayers.ts",
  "gympgrph/src/geospatialFitRuntime.ts",
  "canvas/src/features/geospatial/geoInvocationDispatcher.ts",
  "canvas/src/features/geospatial/geoAuthoringHarness.ts",
];

const failures = [];
for (const manifestPath of ["package.json", "canvas/package.json", "gympgrph/package.json"]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), "utf8"));
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  };
  for (const dependency of prohibitedDependencies) {
    if (Object.hasOwn(dependencies, dependency)) failures.push(`${manifestPath} contains prohibited dependency ${dependency}`);
  }
}

for (const relativePath of runtimeFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  if (/https?:\/\//i.test(source)) failures.push(`${relativePath} contains a compiled dataset or asset URL`);
  const lineCount = source.split(/\r?\n/).length;
  if (lineCount > 600) failures.push(`${relativePath} has ${lineCount} lines; maximum is 600`);
}

const documentText = fs.readFileSync(
  path.join(root, "docs/documents/knowgrph-geospatial-mode-document.md"),
  "utf8",
);
for (const requiredText of [
  "fill-extrusion",
  "knowgrph.geospatial.command",
  "knowgrph-geo-asset-mesh/v1",
  "6,023,998",
]) {
  if (!documentText.includes(requiredText)) failures.push(`geospatial document is missing ${requiredText}`);
}

const assetsRoot = path.join(root, "canvas/dist/assets");
let currentBundleBytes = null;
if (fs.existsSync(assetsRoot)) {
  const javascriptFiles = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.name.endsWith(".js")) javascriptFiles.push(absolutePath);
    }
  };
  visit(assetsRoot);
  currentBundleBytes = javascriptFiles.reduce((total, filePath) => {
    return total + zlib.gzipSync(fs.readFileSync(filePath)).byteLength;
  }, 0);
  if (currentBundleBytes - deterministicBaselineBytes > maximumDeltaBytes) {
    failures.push(`gzip JavaScript delta ${currentBundleBytes - deterministicBaselineBytes} exceeds ${maximumDeltaBytes} bytes`);
  }
}

if (failures.length > 0) {
  console.error(["Geospatial Mode readiness failed:", ...failures.map(failure => `- ${failure}`)].join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  prohibitedDependencyCount: 0,
  hardcodedRuntimeUrlCount: 0,
  documentedBaselineGzipJavaScriptBytes: documentedBaselineBytes,
  deterministicBaselineGzipJavaScriptBytes: deterministicBaselineBytes,
  currentGzipJavaScriptBytes: currentBundleBytes,
  gzipDeltaBytes: currentBundleBytes == null ? null : currentBundleBytes - deterministicBaselineBytes,
  maximumDeltaBytes,
}, null, 2));
