import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import {
  checkKnowledgeGraphBudget,
  compareStableStrings,
  KnowledgeGraphError,
  sha256,
} from "./contract.mjs";

const pathIsInside = (candidatePath, rootPath) => {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const sameFileIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino;

export async function readStableSourceFile(
  absolutePath,
  rootPath,
  maxFileBytes,
  relativePath,
  options = {},
) {
  const checkBudget = () => checkKnowledgeGraphBudget({
    abortSignal: options.abortSignal,
    deadline: options.deadline,
    stage: options.stage || "source-read",
    details: { sourcePath: relativePath },
  });
  let handle;
  try {
    checkBudget();
    const noFollow = Number(fsConstants.O_NOFOLLOW || 0);
    handle = await fs.open(absolutePath, fsConstants.O_RDONLY | noFollow);
    checkBudget();
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) {
      throw new KnowledgeGraphError("source_not_regular_file", `Source is not a regular file: ${relativePath}`);
    }
    const realPath = await fs.realpath(absolutePath);
    const pathStat = await fs.stat(realPath);
    checkBudget();
    if (!pathIsInside(realPath, rootPath) || !sameFileIdentity(openedStat, pathStat)) {
      throw new KnowledgeGraphError(
        "source_path_unstable",
        `Source path changed or escaped during discovery: ${relativePath}`,
      );
    }
    if (openedStat.size > maxFileBytes) return { stat: openedStat, bytes: null };
    const bytes = Buffer.alloc(openedStat.size);
    let offset = 0;
    while (offset < bytes.length) {
      checkBudget();
      const chunk = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!chunk.bytesRead) break;
      offset += chunk.bytesRead;
    }
    const extra = Buffer.alloc(1);
    const extraRead = await handle.read(extra, 0, 1, openedStat.size);
    const closedStat = await handle.stat();
    checkBudget();
    if (offset !== bytes.length || extraRead.bytesRead || !sameFileIdentity(openedStat, closedStat)
      || openedStat.size !== closedStat.size || openedStat.mtimeMs !== closedStat.mtimeMs) {
      throw new KnowledgeGraphError(
        "source_changed_during_read",
        `Source changed while it was being read: ${relativePath}`,
      );
    }
    return { stat: openedStat, bytes };
  } catch (error) {
    if (error instanceof KnowledgeGraphError) throw error;
    throw new KnowledgeGraphError("source_read_failed", `Could not safely read source: ${relativePath}`, {
      sourcePath: relativePath,
      causeCode: String(error?.code || "read_failed"),
    });
  } finally {
    await handle?.close().catch(() => {});
  }
}

const directoryEntryKind = (entry) => (
  entry.isDirectory() ? "d"
    : entry.isFile() ? "f"
      : entry.isSymbolicLink() ? "l"
        : "o"
);

export async function readStableSourceDirectory(
  directoryPath,
  rootPath,
  relativePath,
  options = {},
) {
  const displayPath = relativePath || ".";
  const checkBudget = () => checkKnowledgeGraphBudget({
    abortSignal: options.abortSignal,
    deadline: options.deadline,
    stage: "source-discovery-directory",
    details: { sourcePath: displayPath },
  });
  try {
    checkBudget();
    const opened = await fs.lstat(directoryPath);
    if (opened.isSymbolicLink() || !opened.isDirectory()) {
      throw new KnowledgeGraphError(
        "source_directory_unstable",
        `Source directory is not a stable directory: ${displayPath}.`,
        { complete: false, sourcePath: displayPath },
      );
    }
    const realPath = await fs.realpath(directoryPath);
    const resolved = await fs.stat(realPath);
    if (!pathIsInside(realPath, rootPath) || !sameFileIdentity(opened, resolved)) {
      throw new KnowledgeGraphError(
        "source_directory_unstable",
        `Source directory changed or escaped containment: ${displayPath}.`,
        { complete: false, sourcePath: displayPath },
      );
    }
    checkBudget();
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => compareStableStrings(left.name, right.name));
    const closed = await fs.lstat(directoryPath);
    if (!closed.isDirectory() || closed.isSymbolicLink() || !sameFileIdentity(opened, closed)) {
      throw new KnowledgeGraphError(
        "source_directory_unstable",
        `Source directory changed during discovery: ${displayPath}.`,
        { complete: false, sourcePath: displayPath },
      );
    }
    checkBudget();
    return {
      entries,
      identity: `${opened.dev}:${opened.ino}`,
      listingDigest: sha256(JSON.stringify(entries.map((entry) => (
        [directoryEntryKind(entry), entry.name]
      )))),
    };
  } catch (error) {
    if (error instanceof KnowledgeGraphError) throw error;
    throw new KnowledgeGraphError(
      "source_directory_unstable",
      `Could not safely read source directory: ${displayPath}.`,
      {
        causeCode: String(error?.code || "read_failed"),
        complete: false,
        sourcePath: displayPath,
      },
    );
  }
}
