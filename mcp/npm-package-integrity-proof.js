import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";
import { gunzipSync } from "node:zlib";

import { readStableBoundedFile } from "./bounded-file-reader.js";

const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 4096;
const MAX_CACHE_ENTRIES = 256;
const PACKAGE_NAME =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const verifiedArchives = new Map();

const fail = (message) =>
  Object.assign(new Error(message), { code: "ACOS_DEPENDENCY_MISMATCH" });
const within = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative !== ""
    && !relative.startsWith("..")
    && !path.isAbsolute(relative);
};

function decodeTarString(bytes, label) {
  const nul = bytes.indexOf(0);
  const content = nul === -1 ? bytes : bytes.subarray(0, nul);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw fail(`The cached npm package archive has an invalid ${label}.`);
  }
}

function parseTarOctal(bytes, label) {
  if (bytes[0] & 0x80) {
    throw fail(`The cached npm package archive uses unsupported ${label} encoding.`);
  }
  const value = decodeTarString(bytes, label).trim();
  if (!/^[0-7]+$/.test(value || "0")) {
    throw fail(`The cached npm package archive has an invalid ${label}.`);
  }
  const parsed = Number.parseInt(value || "0", 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw fail(`The cached npm package archive has an unsafe ${label}.`);
  }
  return parsed;
}

function assertTarChecksum(header) {
  const expected = parseTarOctal(header.subarray(148, 156), "checksum");
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) {
    throw fail("The cached npm package archive checksum is invalid.");
  }
}

function safeArchiveRelativePath(header) {
  const name = decodeTarString(header.subarray(0, 100), "entry name");
  const prefix = decodeTarString(header.subarray(345, 500), "entry prefix");
  const archivePath = `${prefix ? `${prefix}/` : ""}${name}`
    .replace(/\/+$/, "");
  if (!archivePath || archivePath.includes("\\")
    || archivePath.startsWith("/")) {
    throw fail("The cached npm package archive contains an unsafe path.");
  }
  const segments = archivePath.split("/");
  if (segments[0] !== "package" || segments.length < 2
    || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw fail("The cached npm package archive escapes its package root.");
  }
  return segments.slice(1);
}

function zeroBlock(bytes) {
  for (const value of bytes) {
    if (value !== 0) return false;
  }
  return true;
}

export function snapshotStrictNpmPackageArchive(archive) {
  let expanded;
  try {
    expanded = gunzipSync(archive, { maxOutputLength: MAX_EXPANDED_BYTES });
  } catch {
    throw fail("The cached npm package archive cannot be safely decompressed.");
  }
  const root = { children: new Map(), explicit: true, type: "directory" };
  let entries = 0;
  let offset = 0;
  let terminated = false;
  while (offset + 512 <= expanded.byteLength) {
    const header = expanded.subarray(offset, offset + 512);
    if (zeroBlock(header)) {
      const second = expanded.subarray(offset + 512, offset + 1024);
      if (second.byteLength !== 512 || !zeroBlock(second)
        || !zeroBlock(expanded.subarray(offset + 1024))) {
        throw fail("The cached npm package archive has an invalid terminator.");
      }
      terminated = true;
      break;
    }
    assertTarChecksum(header);
    if (!decodeTarString(header.subarray(257, 263), "format").startsWith("ustar")) {
      throw fail("The cached npm package archive format is unsupported.");
    }
    const type = header[156];
    if (![0, 0x30, 0x35].includes(type)) {
      throw fail("The cached npm package archive contains a link or special entry.");
    }
    const size = parseTarOctal(header.subarray(124, 136), "entry size");
    if (size > MAX_FILE_BYTES || (type === 0x35 && size !== 0)) {
      throw fail("The cached npm package archive entry exceeds its safe bound.");
    }
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const nextOffset = dataStart + Math.ceil(size / 512) * 512;
    if (dataEnd > expanded.byteLength || nextOffset > expanded.byteLength) {
      throw fail("The cached npm package archive is truncated.");
    }
    if (!zeroBlock(expanded.subarray(dataEnd, nextOffset))) {
      throw fail("The cached npm package archive has non-zero entry padding.");
    }
    const segments = safeArchiveRelativePath(header);
    entries += 1;
    if (entries > MAX_ARCHIVE_ENTRIES) {
      throw fail("The cached npm package archive exceeds its entry-count bound.");
    }
    let parent = root;
    for (const segment of segments.slice(0, -1)) {
      const existing = parent.children.get(segment);
      if (existing?.type === "file") {
        throw fail("The cached npm package archive has a file-directory collision.");
      }
      if (!existing) {
        parent.children.set(segment, {
          children: new Map(),
          explicit: false,
          type: "directory",
        });
      }
      parent = parent.children.get(segment);
    }
    const leaf = segments.at(-1);
    const existing = parent.children.get(leaf);
    if (type === 0x35) {
      if (existing?.type === "file" || existing?.explicit) {
        throw fail("The cached npm package archive contains a duplicate or colliding path.");
      }
      if (existing) existing.explicit = true;
      else {
        parent.children.set(leaf, {
          children: new Map(),
          explicit: true,
          type: "directory",
        });
      }
    } else {
      if (existing) {
        throw fail("The cached npm package archive contains a duplicate or colliding path.");
      }
      parent.children.set(leaf, {
        content: expanded.subarray(dataStart, dataEnd),
        type: "file",
      });
    }
    offset = nextOffset;
  }
  if (!terminated || entries === 0) {
    throw fail("The cached npm package archive has no valid terminator or entries.");
  }
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  let files = 0;
  function visitDirectory(directory, relativeDirectory) {
    hash.update(`directory\0${relativeDirectory}\0`);
    const children = [...directory.children.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"));
    for (const [name, child] of children) {
      const relative = relativeDirectory
        ? `${relativeDirectory}/${name}`
        : name;
      if (child.type === "directory") {
        visitDirectory(child, relative);
        continue;
      }
      files += 1;
      bytes += child.content.byteLength;
      if (bytes > MAX_EXPANDED_BYTES) {
        throw fail("The cached npm package archive exceeds its expanded byte bound.");
      }
      hash.update(`file\0${relative}\0${child.content.byteLength}\0`);
      hash.update(child.content);
    }
  }
  visitDirectory(root, "");
  return Object.freeze({
    bytes,
    digest: hash.digest("hex"),
    files,
  });
}

function integrityDescriptor(integrity) {
  const separator = String(integrity).indexOf("-");
  const algorithm = String(integrity).slice(0, separator);
  const encoded = String(integrity).slice(separator + 1);
  if (!["sha256", "sha384", "sha512"].includes(algorithm)
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw fail("The pinned npm package integrity is unsupported.");
  }
  const digest = Buffer.from(encoded, "base64");
  const expectedBytes = { sha256: 32, sha384: 48, sha512: 64 }[algorithm];
  if (digest.byteLength !== expectedBytes
    || digest.toString("base64") !== encoded) {
    throw fail("The pinned npm package integrity is malformed.");
  }
  return { algorithm, digest, encoded, hex: digest.toString("hex") };
}

async function assertSafeDirectory(directory, trustedRoot) {
  const stat = await fs.lstat(directory);
  const real = await fs.realpath(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || (directory !== trustedRoot && !within(trustedRoot, real))) {
    throw fail("The local npm content cache contains an unsafe directory.");
  }
  return real;
}

async function readCachedArchive(integrity) {
  const descriptor = integrityDescriptor(integrity);
  const home = os.userInfo().homedir;
  const homeReal = await fs.realpath(home);
  const cache = process.platform === "win32"
    ? path.join(home, "AppData", "Local", "npm-cache")
    : path.join(home, ".npm");
  const cacheStat = await fs.lstat(cache);
  const cacheReal = await fs.realpath(cache);
  if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink()
    || !within(homeReal, cacheReal)) {
    throw fail("The local npm content cache is unavailable or unsafe.");
  }
  const contentRoot = path.join(cacheReal, "_cacache", "content-v2");
  const algorithmRoot = path.join(contentRoot, descriptor.algorithm);
  const firstRoot = path.join(algorithmRoot, descriptor.hex.slice(0, 2));
  const secondRoot = path.join(firstRoot, descriptor.hex.slice(2, 4));
  for (const directory of [
    contentRoot,
    algorithmRoot,
    firstRoot,
    secondRoot,
  ]) {
    await assertSafeDirectory(directory, cacheReal);
  }
  const archivePath = path.join(secondRoot, descriptor.hex.slice(4));
  let archive;
  try {
    ({ content: archive } = await readStableBoundedFile({
      filePath: archivePath,
      containingDirectory: secondRoot,
      minimumBytes: 1,
      maximumBytes: MAX_ARCHIVE_BYTES,
    }));
  } catch {
    throw fail("The exact pinned npm package archive is absent from the local cache.");
  }
  const computed =
    `${descriptor.algorithm}-${crypto.createHash(descriptor.algorithm)
      .update(archive).digest("base64")}`;
  if (computed !== integrity) {
    throw fail("The cached npm package archive does not match its pinned integrity.");
  }
  return archive;
}

function rememberVerified(key) {
  if (verifiedArchives.size >= MAX_CACHE_ENTRIES) {
    verifiedArchives.delete(verifiedArchives.keys().next().value);
  }
  verifiedArchives.set(key, true);
}

export async function verifyInstalledPackageIntegrity({
  name,
  version,
  integrity,
  packageDigest,
  packageBytes,
  packageFiles,
}) {
  if (!PACKAGE_NAME.test(String(name)) || !EXACT_VERSION.test(String(version))
    || typeof packageDigest !== "string"
    || !/^[0-9a-f]{64}$/.test(packageDigest)
    || !Number.isSafeInteger(packageBytes) || packageBytes < 1
    || !Number.isSafeInteger(packageFiles) || packageFiles < 1) {
    throw fail("The installed npm package proof request is invalid.");
  }
  const cacheKey = `${integrity}\0${packageDigest}`;
  if (verifiedArchives.has(cacheKey)) return;
  const archive = await readCachedArchive(integrity);
  const archived = snapshotStrictNpmPackageArchive(archive);
  if (archived.digest !== packageDigest
    || archived.bytes !== packageBytes
    || archived.files !== packageFiles) {
    throw fail(
      `The installed evaluator dependency ${name} differs from its pinned archive.`,
    );
  }
  rememberVerified(cacheKey);
}
