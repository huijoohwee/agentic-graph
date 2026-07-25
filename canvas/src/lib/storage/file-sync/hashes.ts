import type {
  FileSyncEntry,
  FileSyncHash,
  FileSyncLedgerSide,
} from "./contract";

export type FileSyncHashComparison =
  | { status: "equal"; hash: FileSyncHash }
  | { status: "different"; algorithm: string }
  | { status: "unknown" };

const HASH_PRIORITY = new Map([
  ["sha512", 0],
  ["sha384", 1],
  ["sha256", 2],
  ["sha1", 3],
  ["quickxor", 4],
  ["md5", 5],
]);

export function normalizeFileSyncHashes(
  hashes: readonly FileSyncHash[],
): FileSyncHash[] {
  const byAlgorithm = new Map<string, FileSyncHash>();
  for (const hash of hashes) {
    const algorithm = hash.algorithm.normalize("NFC").toLowerCase();
    const value = hash.value.normalize("NFC");
    if (
      !/^[a-z][a-z0-9._-]{0,31}$/.test(algorithm) ||
      value.length === 0 ||
      value.length > 512 ||
      /\s/.test(value)
    ) {
      throw new Error("Invalid tagged file-sync hash");
    }
    const existing = byAlgorithm.get(algorithm);
    if (existing && existing.value !== value) {
      throw new Error("Conflicting hashes for one algorithm");
    }
    byAlgorithm.set(algorithm, { algorithm, value });
  }
  return [...byAlgorithm.values()].sort(compareHashStrength);
}

export function compareFileSyncHashes(
  left: readonly FileSyncHash[],
  right: readonly FileSyncHash[],
): FileSyncHashComparison {
  const leftByAlgorithm = new Map(
    normalizeFileSyncHashes(left).map((hash) => [hash.algorithm, hash]),
  );
  const rightByAlgorithm = new Map(
    normalizeFileSyncHashes(right).map((hash) => [hash.algorithm, hash]),
  );
  const commonAlgorithms = [...leftByAlgorithm.keys()]
    .filter((algorithm) => rightByAlgorithm.has(algorithm))
    .sort((leftAlgorithm, rightAlgorithm) =>
      compareHashStrength(
        leftByAlgorithm.get(leftAlgorithm)!,
        leftByAlgorithm.get(rightAlgorithm)!,
      ),
    );
  const algorithm = commonAlgorithms[0];
  if (!algorithm) {
    return { status: "unknown" };
  }
  const leftHash = leftByAlgorithm.get(algorithm)!;
  const rightHash = rightByAlgorithm.get(algorithm)!;
  if (leftHash.value === rightHash.value) {
    return { status: "equal", hash: leftHash };
  }
  return { status: "different", algorithm };
}

export function compareFileSyncContent(
  left: FileSyncEntry | FileSyncLedgerSide | null,
  right: FileSyncEntry | FileSyncLedgerSide | null,
): FileSyncHashComparison {
  if (!left || !right) {
    return left === right
      ? { status: "unknown" }
      : { status: "different", algorithm: "presence" };
  }
  if (left.kind !== right.kind || left.sizeBytes !== right.sizeBytes) {
    return { status: "different", algorithm: "metadata" };
  }
  if (left.kind === "directory") {
    return {
      status: "equal",
      hash: { algorithm: "directory", value: "directory" },
    };
  }
  return compareFileSyncHashes(left.hashes, right.hashes);
}

export function hasFileSyncSideChanged(
  current: FileSyncEntry | null,
  baseline: FileSyncLedgerSide | null,
): boolean {
  if (!baseline) {
    return false;
  }
  if (!current) {
    return true;
  }
  const comparison = compareFileSyncContent(current, baseline);
  if (comparison.status === "equal") {
    return false;
  }
  if (comparison.status === "different") {
    return true;
  }
  return current.revision !== baseline.revision;
}

function compareHashStrength(left: FileSyncHash, right: FileSyncHash): number {
  const leftPriority = HASH_PRIORITY.get(left.algorithm) ?? 100;
  const rightPriority = HASH_PRIORITY.get(right.algorithm) ?? 100;
  return (
    leftPriority - rightPriority ||
    left.algorithm.localeCompare(right.algorithm)
  );
}
