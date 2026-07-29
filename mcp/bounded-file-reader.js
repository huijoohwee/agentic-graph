import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const fail = (code, message) => Object.assign(new Error(message), { code });
const sameFile = (left, right) =>
  left.dev === right.dev && left.ino === right.ino;
const sameSnapshot = (left, right) =>
  sameFile(left, right)
  && left.size === right.size
  && left.mtimeMs === right.mtimeMs
  && left.ctimeMs === right.ctimeMs;
const within = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

async function readAtMost(handle, maximumBytes) {
  const output = Buffer.allocUnsafe(maximumBytes + 1);
  let offset = 0;
  while (offset <= maximumBytes) {
    const { bytesRead } = await handle.read(
      output,
      offset,
      maximumBytes + 1 - offset,
      null,
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > maximumBytes) {
    throw fail("BOUNDED_FILE_TOO_LARGE", "File exceeds its bounded read limit.");
  }
  return output.subarray(0, offset);
}

export async function readStableBoundedFile({
  filePath,
  containingDirectory,
  minimumBytes = 0,
  maximumBytes,
  afterOpen,
}) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1
    || !Number.isSafeInteger(minimumBytes) || minimumBytes < 0
    || minimumBytes > maximumBytes) {
    throw new TypeError("Stable file bounds are invalid.");
  }
  const directoryStat = await fs.lstat(containingDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw fail("BOUNDED_FILE_UNSAFE", "Containing directory is unsafe.");
  }
  const directoryReal = await fs.realpath(containingDirectory);
  const pathStat = await fs.lstat(filePath);
  const fileReal = await fs.realpath(filePath);
  if (!pathStat.isFile() || pathStat.isSymbolicLink()
    || !within(directoryReal, fileReal)) {
    throw fail("BOUNDED_FILE_UNSAFE", "File is not a contained non-symlink regular file.");
  }
  if (pathStat.size > maximumBytes) {
    throw fail("BOUNDED_FILE_TOO_LARGE", "File exceeds its bounded read limit.");
  }
  if (pathStat.size < minimumBytes) {
    throw fail("BOUNDED_FILE_TOO_SMALL", "File is below its bounded read minimum.");
  }

  let handle;
  try {
    handle = await fs.open(
      filePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = await handle.stat();
    if (!opened.isFile() || !sameFile(pathStat, opened)) {
      throw fail("BOUNDED_FILE_CHANGED", "File identity changed before the bounded read.");
    }
    if (afterOpen) await afterOpen();
    const content = await readAtMost(handle, maximumBytes);
    const closedSnapshot = await handle.stat();
    const [
      finalPathStat,
      finalReal,
      finalDirectoryStat,
      finalDirectoryReal,
    ] = await Promise.all([
      fs.lstat(filePath),
      fs.realpath(filePath),
      fs.lstat(containingDirectory),
      fs.realpath(containingDirectory),
    ]);
    if (!sameSnapshot(opened, closedSnapshot)
      || !sameFile(closedSnapshot, finalPathStat)
      || finalPathStat.isSymbolicLink()
      || !sameFile(directoryStat, finalDirectoryStat)
      || finalDirectoryStat.isSymbolicLink()
      || finalReal !== fileReal
      || finalDirectoryReal !== directoryReal
      || content.byteLength !== closedSnapshot.size) {
      throw fail("BOUNDED_FILE_CHANGED", "File identity changed during the bounded read.");
    }
    if (content.byteLength < minimumBytes) {
      throw fail("BOUNDED_FILE_TOO_SMALL", "File is below its bounded read minimum.");
    }
    return Object.freeze({ content, realPath: finalReal });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
