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
  "gympgrph/src/enhancedLayerConfigSource.ts",
  "gympgrph/src/extrusionHeight.ts",
  "gympgrph/src/enhancedLayerLoad.ts",
  "gympgrph/src/enhancedResourceCache.ts",
  "gympgrph/src/asset3dCustomLayer.ts",
  "gympgrph/src/asset3dProjection.ts",
  "gympgrph/src/useEnhancedGeospatialLayers.ts",
  "gympgrph/src/useEnhancedGeospatialHostLayers.ts",
  "gympgrph/src/geospatialFitRuntime.ts",
  "canvas/src/features/geospatial/geoInvocationDispatcher.ts",
  "canvas/src/features/geospatial/geoInvocationRuntime.ts",
  "canvas/src/features/geospatial/geoCommandDeepLink.ts",
  "canvas/src/features/geospatial/geoNodeBounds.ts",
  "canvas/src/features/geospatial/geoAuthoringHarness.ts",
  "canvas/src/features/geospatial/geoAuthoringFallback.ts",
  "canvas/src/features/chat/floatingPanelChat/geospatialInvocationSubmit.ts",
  "canvas/src/features/canvas/useCanvasGeospatialRuntime.ts",
];
const focusedTestFiles = [
  "scripts/__tests__/geospatial-mode-enhancement.test.ts",
  "scripts/__tests__/geospatial-asset3d-projection.test.ts",
  "scripts/__tests__/geospatial-bounded-loading-readiness.test.ts",
  "scripts/__tests__/geospatial-config-source.test.ts",
  "scripts/__tests__/geo-authoring-fallback-readiness.test.ts",
  "canvas/src/__tests__/geospatialInvocationRuntime.test.ts",
  "mcp/__tests__/geospatial-layer-runtime.test.mjs",
];
const readinessManifestPath = "scripts/geospatial-readiness-properties.json";

const failures = [];
for (const manifestPath of [
  "package.json",
  "canvas/package.json",
  "gympgrph/package.json",
  "grph-shared/package.json",
]) {
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
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`missing geospatial runtime owner ${relativePath}`);
    continue;
  }
  const source = fs.readFileSync(absolutePath, "utf8");
  if (/https?:\/\//i.test(source)) failures.push(`${relativePath} contains a compiled dataset or asset URL`);
  const lineCount = source.split(/\r?\n/).length;
  if (lineCount > 600) failures.push(`${relativePath} has ${lineCount} lines; maximum is 600`);
}

for (const relativePath of focusedTestFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`missing focused readiness test ${relativePath}`);
}

let readinessPropertyCount = 0;
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, readinessManifestPath), "utf8"));
  const properties = Array.isArray(manifest.properties) ? manifest.properties : [];
  readinessPropertyCount = properties.length;
  if (manifest.schemaId !== "knowgrph-geospatial-readiness-properties/v1") {
    failures.push("geospatial readiness property manifest has an unknown schema");
  }
  const expectedIds = Array.from({ length: 38 }, (_value, index) => index + 1);
  const propertyIds = properties.map(property => property.id);
  if (JSON.stringify(propertyIds) !== JSON.stringify(expectedIds)) {
    failures.push("geospatial readiness property manifest must contain ordered properties 1-38");
  }
  for (const property of properties) {
    const evidence = Array.isArray(property.evidence) ? property.evidence : [];
    if (evidence.length === 0) {
      failures.push(`readiness property ${property.id} has no evidence`);
      continue;
    }
    for (const item of evidence) {
      const relativePath = String(item?.file || "");
      const contains = String(item?.contains || "");
      if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(path.sep).includes("..")) {
        failures.push(`readiness property ${property.id} has an unsafe evidence path`);
        continue;
      }
      const evidencePath = path.join(root, relativePath);
      if (!fs.existsSync(evidencePath)) {
        failures.push(`readiness property ${property.id} evidence is missing ${relativePath}`);
        continue;
      }
      if (!contains || !fs.readFileSync(evidencePath, "utf8").includes(contains)) {
        failures.push(`readiness property ${property.id} evidence marker is missing from ${relativePath}`);
      }
    }
  }
} catch (error) {
  failures.push(`cannot read ${readinessManifestPath}: ${error instanceof Error ? error.message : String(error)}`);
}

const documentText = fs.readFileSync(
  path.join(root, "docs/documents/knowgrph-geospatial-mode-document.md"),
  "utf8",
);
for (const requiredText of [
  "fill-extrusion",
  "knowgrph.geospatial.command",
  "knowgrph-geo-asset-mesh/v1",
  "VITE_GEOSPATIAL_DATASETS_JSON",
  "getMatrixForModel",
  "network-unavailable",
  "38 correctness properties",
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
  focusedTestFileCount: focusedTestFiles.length,
  readinessPropertyCount,
  documentedBaselineGzipJavaScriptBytes: documentedBaselineBytes,
  deterministicBaselineGzipJavaScriptBytes: deterministicBaselineBytes,
  currentGzipJavaScriptBytes: currentBundleBytes,
  gzipDeltaBytes: currentBundleBytes == null ? null : currentBundleBytes - deterministicBaselineBytes,
  maximumDeltaBytes,
}, null, 2));
