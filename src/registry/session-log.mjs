import { sessionLogKey } from "./scope-keys.mjs";

const AGENT_REQUIRED_EVENTS = new Set(["gate-pass", "gate-fail", "human-confirm", "issuance"]);
const SESSION_LOG_EVENTS = new Set([
  "routing",
  "registration-rejected",
  "gate-pass",
  "gate-fail",
  "human-confirm",
  "issuance",
  "fail-closed",
]);

export class SessionLogStore {
  constructor() {
    this.entriesByKey = new Map();
  }

  append(sessionId, entry) {
    const key = sessionLogKey(sessionId);
    const entries = this.entriesByKey.get(key) ?? [];
    assertValidEntry(entry);
    const normalized = { ...entry, sessionId, seq: entries.length + 1 };
    entries.push(normalized);
    this.entriesByKey.set(key, entries);
    return normalized;
  }

  readOrdered(sessionId) {
    const entries = this.entriesByKey.get(sessionLogKey(sessionId)) ?? [];
    return entries.map((entry) => ({ ...entry })).sort((left, right) => left.seq - right.seq);
  }
}

export function createSessionLogStore() {
  return new SessionLogStore();
}

export function paymentOrderingVerdict(entries, offerId) {
  const offerEntries = entries.filter((entry) => entry.offerId === offerId);
  const gatePass = offerEntries.find((entry) => entry.eventType === "gate-pass");
  const humanConfirm = offerEntries.find((entry) => entry.eventType === "human-confirm");
  const issuances = offerEntries.filter((entry) => entry.eventType === "issuance");
  const gatePassBeforeHumanConfirm = Boolean(gatePass && humanConfirm && gatePass.seq < humanConfirm.seq);
  const issuanceAfterHumanConfirm = issuances.every((entry) => humanConfirm && humanConfirm.seq < entry.seq);
  return {
    gatePassBeforeHumanConfirm,
    atMostOneIssuance: issuances.length <= 1,
    issuanceAllowed: gatePassBeforeHumanConfirm && issuanceAfterHumanConfirm && issuances.length <= 1,
  };
}

function assertValidEntry(entry) {
  if (!SESSION_LOG_EVENTS.has(entry.eventType)) {
    throw new TypeError("unsupported session log event type");
  }
  if (AGENT_REQUIRED_EVENTS.has(entry.eventType) && !entry.agentId) {
    throw new TypeError(`${entry.eventType} requires a non-empty agentId`);
  }
}
