import { RepositoryPackError } from "./repository-pack-error.js";

const GIT_OUTPUT_LIMIT_BYTES = 32 * 1024 * 1024;
const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";
const SAFE_GIT_ARGUMENTS = Object.freeze([
  "--no-pager",
  "-c", "core.fsmonitor=false",
  "-c", `core.hooksPath=${NULL_DEVICE}`,
  "-c", "protocol.allow=never",
  "-c", "submodule.recurse=false",
  "-c", "fetch.recurseSubmodules=false",
  "-c", "maintenance.auto=false",
]);

const buildEnvironment = (host = {}) => Object.fromEntries([
  ["PATH", host.PATH || host.Path],
  ["SystemRoot", host.SystemRoot || host.SYSTEMROOT],
  ["ComSpec", host.ComSpec || host.COMSPEC],
  ["PATHEXT", host.PATHEXT],
  ["TMPDIR", host.TMPDIR],
  ["TMP", host.TMP],
  ["TEMP", host.TEMP],
  ["GIT_CONFIG_NOSYSTEM", "1"],
  ["GIT_CONFIG_GLOBAL", NULL_DEVICE],
  ["GIT_TERMINAL_PROMPT", "0"],
  ["GIT_OPTIONAL_LOCKS", "0"],
  ["GIT_LFS_SKIP_SMUDGE", "1"],
  ["GCM_INTERACTIVE", "Never"],
  ["LC_ALL", "C"],
  ["LANG", "C"],
].filter(([, value]) => typeof value === "string"));

const records = (stdout) => {
  const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || "");
  if (buffer.length > GIT_OUTPUT_LIMIT_BYTES || (buffer.length && buffer.at(-1) !== 0)) {
    throw new RepositoryPackError("GIT_INVENTORY_FAILED");
  }
  const output = [];
  let offset = 0;
  while (offset < buffer.length) {
    const end = buffer.indexOf(0, offset);
    output.push(buffer.subarray(offset, end));
    offset = end + 1;
  }
  return output;
};

const decodePath = (bytes, canonicalRelativePath) => {
  const decoded = bytes.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(bytes)) {
    throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
  }
  return canonicalRelativePath(decoded);
};

const parsePaths = (stdout, canonicalRelativePath) => {
  const paths = records(stdout).map((entry) => decodePath(entry, canonicalRelativePath));
  return [...new Set(paths)].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
};

const parseIndex = (stdout, canonicalRelativePath) => {
  const index = new Map();
  for (const record of records(stdout)) {
    const tab = record.indexOf(9);
    const match = record.subarray(0, tab).toString("ascii").match(
      /^([0-7]{6}) ([0-9a-f]{40,64}) ([0-3])$/u,
    );
    if (!match || tab < 1) throw new RepositoryPackError("GIT_INVENTORY_FAILED");
    const relativePath = decodePath(record.subarray(tab + 1), canonicalRelativePath);
    const entries = index.get(relativePath) || [];
    entries.push({ mode: match[1], objectId: match[2], stage: Number(match[3]) });
    index.set(relativePath, entries);
  }
  for (const entries of index.values()) {
    entries.sort((left, right) => left.stage - right.stage
      || left.mode.localeCompare(right.mode)
      || left.objectId.localeCompare(right.objectId));
  }
  return index;
};

export const sameRepositoryPackGitIndex = (left, right, paths) => paths.every((relativePath) => (
  JSON.stringify(left.get(relativePath) || []) === JSON.stringify(right.get(relativePath) || [])
));

export const createRepositoryPackGit = ({
  execFileImpl,
  hostEnvironment,
  remainingRuntime,
  assertActive,
  canonicalRelativePath,
}) => {
  const environment = buildEnvironment(hostEnvironment);
  const run = async (root, args, errorCode = "GIT_INVENTORY_FAILED", allowedExitCodes = []) => {
    try {
      return await execFileImpl("git", [...SAFE_GIT_ARGUMENTS, "-C", root, ...args], {
        encoding: "buffer",
        env: environment,
        maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
        timeout: remainingRuntime(),
        windowsHide: true,
      });
    } catch (error) {
      assertActive();
      if (allowedExitCodes.includes(error?.code)) {
        return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }
      throw new RepositoryPackError(errorCode);
    }
  };
  const readRevision = async (root) => {
    const output = await run(
      root,
      ["rev-parse", "--verify", "--quiet", "HEAD"],
      "GIT_INVENTORY_FAILED",
      [1],
    );
    const revision = output.stdout.toString("utf8").trim();
    if (revision === "") return "unavailable";
    if (!/^[0-9a-f]{40,64}$/u.test(revision)) throw new RepositoryPackError("GIT_INVENTORY_FAILED");
    return revision;
  };
  const readInventory = async (root) => ({
    paths: parsePaths((await run(
      root,
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    )).stdout, canonicalRelativePath),
    index: parseIndex((await run(root, ["ls-files", "--stage", "-z"])).stdout, canonicalRelativePath),
  });
  return { readInventory, readRevision, run };
};
