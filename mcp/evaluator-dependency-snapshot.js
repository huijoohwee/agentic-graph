import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { TextDecoder } from "node:util";

import { readStableBoundedFile } from "./bounded-file-reader.js";
import {
  verifyInstalledPackageIntegrity,
} from "./npm-package-integrity-proof.js";

const AJV_ENTRY = "ajv/dist/2020.js";
const AJV_LOCK_KEY = "node_modules/ajv";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_LOCK_BYTES = 16 * 1024 * 1024;
const MAX_PACKAGE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CLOSURE_BYTES = 64 * 1024 * 1024;
const MAX_CLOSURE_FILES = 4096;
const FILE_READ_CONCURRENCY = 16;
const METADATA_CONCURRENCY = 32;
const INTEGRITY = /^(?:sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}$/;

const fail = (message) =>
  Object.assign(new Error(message), { code: "ACOS_DEPENDENCY_MISMATCH" });
const within = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative === ""
    || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
const sameDirectory = (left, right) =>
  left.dev === right.dev
  && left.ino === right.ino
  && left.size === right.size
  && left.mtimeMs === right.mtimeMs
  && left.ctimeMs === right.ctimeMs;
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((output, key) => {
    output[key] = stableValue(value[key]);
    return output;
  }, {});
};
const stableJson = (value) => JSON.stringify(stableValue(value));
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function mapBounded(items, concurrency, mapper) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({
    length: Math.min(concurrency, items.length),
  }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(items[index], index);
    }
  }));
  return output;
}

const entryIdentity = (entry) =>
  `${entry.isDirectory() ? "directory" : "file"}\0${entry.name}`;

function parseJson(content, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content));
  } catch {
    throw fail(`The Agentic Canvas OS ${label} is not valid UTF-8 JSON.`);
  }
}

async function stableJsonFile(filePath, containingDirectory, maximumBytes, label) {
  const result = await readStableBoundedFile({
    filePath,
    containingDirectory,
    minimumBytes: 2,
    maximumBytes,
  });
  return {
    content: result.content,
    value: parseJson(result.content, label),
  };
}

async function locatePackageRoot({
  evaluatorRoot,
  resolvedEntry,
  expectedName,
}) {
  const evaluatorReal = await fs.realpath(evaluatorRoot);
  let candidate = path.dirname(await fs.realpath(resolvedEntry));
  while (within(evaluatorReal, candidate) && candidate !== evaluatorReal) {
    const manifestPath = path.join(candidate, "package.json");
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      if (manifest?.name === expectedName) return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    candidate = path.dirname(candidate);
  }
  throw fail(`The resolved ${expectedName} dependency is outside the evaluator checkout.`);
}

async function snapshotPackageDirectory({
  packageRoot,
  evaluatorRoot,
  budget,
}) {
  const startingBytes = budget.bytes;
  const startingFiles = budget.files;
  const packageReal = await fs.realpath(packageRoot);
  const evaluatorReal = await fs.realpath(evaluatorRoot);
  if (!within(evaluatorReal, packageReal) || packageReal === evaluatorReal) {
    throw fail("An evaluator dependency package escapes the evaluator checkout.");
  }
  const directories = [];
  const files = [];

  async function enumerate(directory) {
    const before = await fs.lstat(directory);
    const directoryReal = await fs.realpath(directory);
    if (!before.isDirectory() || before.isSymbolicLink()
      || !within(packageReal, directoryReal)) {
      throw fail("An evaluator dependency contains an unsafe directory.");
    }
    const relativeDirectory = path.relative(packageReal, directoryReal)
      .split(path.sep).join("/");
    const entries = (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) =>
        !(directoryReal === packageReal && entry.name === "node_modules"))
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    const node = {
      children: [],
      path: directoryReal,
      relativePath: relativeDirectory,
      snapshot: before,
      entries: Object.freeze(entries.map(entryIdentity)),
    };
    directories.push(node);
    for (const entry of entries) {
      if (entry.isSymbolicLink()
        || (!entry.isDirectory() && !entry.isFile())) {
        throw fail("An evaluator dependency contains an unsafe filesystem entry.");
      }
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        node.children.push({
          name: entry.name,
          node: await enumerate(filePath),
          type: "directory",
        });
        continue;
      }
      budget.files += 1;
      if (budget.files > MAX_CLOSURE_FILES) {
        throw fail("The evaluator dependency closure exceeds its file-count bound.");
      }
      const file = {
        containingDirectory: directory,
        filePath,
        name: entry.name,
      };
      files.push(file);
      node.children.push({ name: entry.name, node: file, type: "file" });
    }
    return node;
  }

  const root = await enumerate(packageRoot);
  await mapBounded(files, FILE_READ_CONCURRENCY, async (file) => {
    const result = await readStableBoundedFile({
      filePath: file.filePath,
      containingDirectory: file.containingDirectory,
      maximumBytes: MAX_PACKAGE_FILE_BYTES,
    });
    file.content = result.content;
    file.path = result.realPath;
    file.relativePath = path.relative(packageReal, result.realPath)
      .split(path.sep).join("/");
  });
  for (const file of files) {
    budget.bytes += file.content.byteLength;
    if (budget.bytes > MAX_CLOSURE_BYTES) {
      throw fail("The evaluator dependency closure exceeds its byte bound.");
    }
  }
  await mapBounded(directories, METADATA_CONCURRENCY, async (directory) => {
    const [after, finalReal, entries] = await Promise.all([
      fs.lstat(directory.path),
      fs.realpath(directory.path),
      fs.readdir(directory.path, { withFileTypes: true }),
    ]);
    const finalEntries = entries
      .filter((entry) =>
        !(directory.relativePath === "" && entry.name === "node_modules"))
      .sort((left, right) => left.name.localeCompare(right.name, "en"))
      .map(entryIdentity);
    if (!sameDirectory(directory.snapshot, after)
      || after.isSymbolicLink()
      || finalReal !== directory.path
      || finalEntries.length !== directory.entries.length
      || finalEntries.some((entry, index) => entry !== directory.entries[index])) {
      throw fail("An evaluator dependency directory changed during inspection.");
    }
    directory.snapshot = after;
  });
  const hash = crypto.createHash("sha256");
  function hashDirectory(directory) {
    hash.update(`directory\0${directory.relativePath}\0`);
    for (const child of directory.children) {
      if (child.type === "directory") hashDirectory(child.node);
      else {
        hash.update(
          `file\0${child.node.relativePath}\0${child.node.content.byteLength}\0`,
        );
        hash.update(child.node.content);
      }
    }
  }
  hashDirectory(root);
  return {
    bytes: budget.bytes - startingBytes,
    digest: hash.digest("hex"),
    files: budget.files - startingFiles,
    realPath: packageReal,
  };
}

function lockKeyFor(evaluatorRoot, packageRoot) {
  const relative = path.relative(evaluatorRoot, packageRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw fail("An evaluator dependency lock identity escapes the checkout.");
  }
  return relative.split(path.sep).join("/");
}

function validateLockEntry(lockKey, lockEntry, installedManifest) {
  if (!lockEntry || typeof lockEntry !== "object"
    || typeof lockEntry.version !== "string"
    || lockEntry.version !== installedManifest.version
    || !INTEGRITY.test(String(lockEntry.integrity || ""))
    || typeof lockEntry.resolved !== "string"
    || !lockEntry.resolved
    || stableJson(lockEntry.dependencies ?? {})
      !== stableJson(installedManifest.dependencies ?? {})
    || stableJson(lockEntry.optionalDependencies ?? {})
      !== stableJson(installedManifest.optionalDependencies ?? {})) {
    throw fail(`The evaluator dependency ${lockKey} does not match a pinned lock entry.`);
  }
}

async function resolveDependencyPackage({
  evaluatorRoot,
  importerRoot,
  dependencyName,
}) {
  const requireFromPackage = createRequire(path.join(importerRoot, "package.json"));
  const resolvedEntry = requireFromPackage.resolve(dependencyName);
  const packageRoot = await locatePackageRoot({
    evaluatorRoot,
    resolvedEntry,
    expectedName: dependencyName,
  });
  return { packageRoot, resolvedEntry };
}

export async function snapshotPinnedEvaluatorDependencies(evaluatorRoot) {
  const packagePath = path.join(evaluatorRoot, "package.json");
  const lockPath = path.join(evaluatorRoot, "package-lock.json");
  const packageBefore = await stableJsonFile(
    packagePath,
    evaluatorRoot,
    MAX_MANIFEST_BYTES,
    "package manifest",
  );
  const lockBefore = await stableJsonFile(
    lockPath,
    evaluatorRoot,
    MAX_LOCK_BYTES,
    "dependency lockfile",
  );
  const packages = lockBefore.value?.packages;
  const declaredAjv = packageBefore.value?.dependencies?.ajv
    ?? packageBefore.value?.devDependencies?.ajv;
  const lockDeclaredAjv = packages?.[""]?.dependencies?.ajv
    ?? packages?.[""]?.devDependencies?.ajv;
  const lockedAjv = packages?.[AJV_LOCK_KEY];
  if (!Number.isSafeInteger(lockBefore.value?.lockfileVersion)
    || lockBefore.value.lockfileVersion < 2
    || !packages || typeof packages !== "object"
    || !lockedAjv
    || declaredAjv !== lockDeclaredAjv
    || declaredAjv !== lockedAjv.version) {
    throw fail("The evaluator Ajv dependency is not exactly pinned by package-lock.json.");
  }

  const requireFromEvaluator = createRequire(packagePath);
  const resolvedAjvEntry = requireFromEvaluator.resolve(AJV_ENTRY);
  const ajvRoot = await locatePackageRoot({
    evaluatorRoot,
    resolvedEntry: resolvedAjvEntry,
    expectedName: "ajv",
  });
  if (lockKeyFor(evaluatorRoot, ajvRoot) !== AJV_LOCK_KEY) {
    throw fail("The evaluator Ajv entry did not resolve to its pinned package location.");
  }

  const budget = { bytes: 0, files: 0 };
  const visited = new Map();
  async function visitPackage({
    packageRoot,
    expectedName,
    resolvedEntry,
  }) {
    const packageReal = await fs.realpath(packageRoot);
    if (visited.has(packageReal)) return;
    const manifestPath = path.join(packageRoot, "package.json");
    const manifestBefore = await stableJsonFile(
      manifestPath,
      packageRoot,
      MAX_MANIFEST_BYTES,
      `${expectedName} package manifest`,
    );
    if (manifestBefore.value?.name !== expectedName
      || typeof manifestBefore.value?.version !== "string") {
      throw fail(`The resolved evaluator dependency ${expectedName} has an invalid manifest.`);
    }
    const lockKey = lockKeyFor(evaluatorRoot, packageRoot);
    const lockEntry = packages[lockKey];
    validateLockEntry(lockKey, lockEntry, manifestBefore.value);
    const directory = await snapshotPackageDirectory({
      packageRoot,
      evaluatorRoot,
      budget,
    });
    const manifestAfter = await stableJsonFile(
      manifestPath,
      packageRoot,
      MAX_MANIFEST_BYTES,
      `${expectedName} package manifest`,
    );
    if (!manifestBefore.content.equals(manifestAfter.content)) {
      throw fail(`The evaluator dependency ${expectedName} changed during inspection.`);
    }
    await verifyInstalledPackageIntegrity({
      name: expectedName,
      version: manifestBefore.value.version,
      integrity: lockEntry.integrity,
      packageDigest: directory.digest,
      packageBytes: directory.bytes,
      packageFiles: directory.files,
    });
    const resolvedEntryReal = await fs.realpath(resolvedEntry);
    const record = {
      name: expectedName,
      version: manifestBefore.value.version,
      lockKey,
      lockEntryDigest: digest(stableJson(lockEntry)),
      packageDigest: directory.digest,
      packageRealPath: directory.realPath,
      resolvedEntry: resolvedEntryReal,
    };
    visited.set(packageReal, record);

    const required = lockEntry.dependencies ?? {};
    const optional = lockEntry.optionalDependencies ?? {};
    for (const dependencyName of [
      ...new Set([...Object.keys(required), ...Object.keys(optional)]),
    ].sort((left, right) => left.localeCompare(right, "en"))) {
      try {
        const dependency = await resolveDependencyPackage({
          evaluatorRoot,
          importerRoot: packageRoot,
          dependencyName,
        });
        await visitPackage({
          ...dependency,
          expectedName: dependencyName,
        });
      } catch (error) {
        if (Object.hasOwn(optional, dependencyName)
          && error?.code === "MODULE_NOT_FOUND") {
          record[`optional:${dependencyName}`] = "absent";
          continue;
        }
        throw error;
      }
    }
  }

  await visitPackage({
    packageRoot: ajvRoot,
    expectedName: "ajv",
    resolvedEntry: resolvedAjvEntry,
  });
  const packageAfter = await stableJsonFile(
    packagePath,
    evaluatorRoot,
    MAX_MANIFEST_BYTES,
    "package manifest",
  );
  const lockAfter = await stableJsonFile(
    lockPath,
    evaluatorRoot,
    MAX_LOCK_BYTES,
    "dependency lockfile",
  );
  if (!packageBefore.content.equals(packageAfter.content)
    || !lockBefore.content.equals(lockAfter.content)) {
    throw fail("The evaluator dependency declaration changed during inspection.");
  }
  const records = [...visited.values()]
    .sort((left, right) => left.lockKey.localeCompare(right.lockKey, "en"));
  const ajvEntryReal = await fs.realpath(resolvedAjvEntry);
  return Object.freeze({
    identity: digest(stableJson({
      manifestDigest: digest(packageBefore.content),
      lockDigest: digest(lockBefore.content),
      ajvEntry: ajvEntryReal,
      records,
    })),
    ajvVersion: lockedAjv.version,
    bytes: budget.bytes,
    files: budget.files,
  });
}
