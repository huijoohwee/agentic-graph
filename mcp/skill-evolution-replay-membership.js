import { createHash } from "node:crypto";

const MEMBERSHIP_BYTES = 16 * 1024;
const MEMBERSHIP_BITS = MEMBERSHIP_BYTES * 8;
const MEMBERSHIP_PROBES = 4;
const EMPTY_MEMBERSHIP = Buffer.alloc(MEMBERSHIP_BYTES).toString("base64");

function decodeMembership(value) {
  if (typeof value !== "string") return null;
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== MEMBERSHIP_BYTES || decoded.toString("base64") !== value) return null;
  return decoded;
}

function offsets(key) {
  const digest = createHash("sha256").update(key, "utf8").digest();
  return Array.from(
    { length: MEMBERSHIP_PROBES },
    (_, index) => digest.readUInt32BE(index * 4) % MEMBERSHIP_BITS,
  );
}

export function createEmptyReplayMembership() {
  return EMPTY_MEMBERSHIP;
}

export function isValidReplayMembership(value) {
  return decodeMembership(value) !== null;
}

export function addReplayMembershipKeys(value, keys) {
  const membership = decodeMembership(value);
  if (!membership) throw new TypeError("Replay membership summary is invalid");
  for (const key of keys) {
    for (const offset of offsets(key)) {
      membership[offset >> 3] |= 1 << (offset & 7);
    }
  }
  return membership.toString("base64");
}

export function replayMembershipMayContain(value, key) {
  const membership = decodeMembership(value);
  if (!membership) throw new TypeError("Replay membership summary is invalid");
  return offsets(key).every((offset) => (
    membership[offset >> 3] & (1 << (offset & 7))
  ) !== 0);
}
