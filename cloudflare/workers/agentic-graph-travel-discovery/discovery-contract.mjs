const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,256}$/;

const isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);

export const isDiscoveryIdentifier = (value) => typeof value === "string" && ID_PATTERN.test(value);

export const parseDiscoveryRequest = (value) => {
  if (!isRecord(value)) return null;
  const allowed = new Set(["operation", "contractVersion", "agentId", "legId", "intent"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (
    value.operation !== "discoverOffers"
    || value.contractVersion !== "agentic-graph.travel-discovery/v1"
    || !isDiscoveryIdentifier(value.agentId)
    || !isDiscoveryIdentifier(value.legId)
    || !isRecord(value.intent)
  ) return null;
  const intent = value.intent;
  if (Object.keys(intent).some((key) => !["intentId", "category", "constraints"].includes(key))) return null;
  if (typeof intent.intentId !== "string" || !INTENT_ID_PATTERN.test(intent.intentId) || intent.category !== "flight" || !isRecord(intent.constraints)) return null;
  const constraints = intent.constraints;
  if (Object.keys(constraints).some((key) => ![
    "bundle_id", "changed_leg_id", "prior_offer_id", "prior_amount_minor",
  ].includes(key))) return null;
  if (
    !isDiscoveryIdentifier(constraints.bundle_id)
    || !isDiscoveryIdentifier(constraints.changed_leg_id)
    || !(constraints.prior_offer_id === null || isDiscoveryIdentifier(constraints.prior_offer_id))
    || !(constraints.prior_amount_minor === null || (
      typeof constraints.prior_amount_minor === "number"
      && Number.isSafeInteger(constraints.prior_amount_minor)
      && constraints.prior_amount_minor >= 0
    ))
  ) return null;
  return Object.freeze({
    operation: value.operation,
    contractVersion: value.contractVersion,
    agentId: value.agentId,
    legId: value.legId,
    intent: Object.freeze({
      intentId: intent.intentId,
      category: intent.category,
      constraints: Object.freeze({ ...constraints }),
    }),
  });
};

const QUOTE_KEYS = new Set([
  "kind", "legId", "offerId", "amountMinor", "currency", "priceVerification",
  "agentId", "promptTokens", "completionTokens", "dollarCost", "provenance",
]);
const PROVENANCE_KEYS = new Set([
  "provider", "providerReference", "providerReferenceDigest", "currency",
  "priceVerification", "verificationSessionDigest", "verificationValidForSeconds",
  "inventoryState", "bookability", "contractVersion",
]);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export const parseVerifiedDiscoveryQuote = (value, request) => {
  if (!isRecord(value) || !isRecord(request) || !isRecord(value.provenance)) return null;
  if (Object.keys(value).some((key) => !QUOTE_KEYS.has(key))) return null;
  const provenance = value.provenance;
  if (Object.keys(provenance).some((key) => !PROVENANCE_KEYS.has(key))) return null;
  if (
    value.kind !== "offer"
    || value.legId !== request.legId
    || value.agentId !== request.agentId
    || !isDiscoveryIdentifier(value.offerId)
    || !Number.isSafeInteger(value.amountMinor)
    || value.amountMinor < 0
    || typeof value.currency !== "string"
    || !CURRENCY_PATTERN.test(value.currency)
    || value.priceVerification !== "verified"
    || value.promptTokens !== 0
    || value.completionTokens !== 0
    || value.dollarCost !== 0
    || !isDiscoveryIdentifier(provenance.provider)
    || typeof provenance.providerReference !== "string"
    || !provenance.providerReference
    || provenance.providerReference.length > 1_024
    || typeof provenance.providerReferenceDigest !== "string"
    || !DIGEST_PATTERN.test(provenance.providerReferenceDigest)
    || provenance.currency !== value.currency
    || provenance.priceVerification !== "verified"
    || typeof provenance.verificationSessionDigest !== "string"
    || !DIGEST_PATTERN.test(provenance.verificationSessionDigest)
    || provenance.verificationValidForSeconds !== "1800"
    || provenance.inventoryState !== "not-held-until-order"
    || provenance.bookability !== "verified-not-ordered"
    || provenance.contractVersion !== "agentic-graph.travel-discovery/v1"
  ) return null;
  return Object.freeze({ ...value, provenance: Object.freeze({ ...provenance }) });
};
