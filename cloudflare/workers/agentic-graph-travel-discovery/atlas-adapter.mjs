const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,256}$/;
const IATA_PATTERN = /^[A-Z]{3}$/;
const AIRLINE_PATTERN = /^[A-Z0-9]{2,3}$/;
const DATE_PATTERN = /^\d{8}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MAX_CATALOGUE_ROUTES = 100;

const isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const readString = (value) => typeof value === "string" ? value.trim() : "";
const isIdentifier = (value) => typeof value === "string" && ID_PATTERN.test(value);
const isCount = (value) => Number.isInteger(value) && value >= 0 && value <= 4;
const isConfiguredCredential = (value) => value.length >= 8 && !/^(?:replace-with|<)/i.test(value);

const parseEndpoint = (baseValue, pathValue) => {
  const base = readString(baseValue);
  const path = readString(pathValue);
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname) return null;
    if (!path.startsWith("/") || path.length > 128 || path.includes("..") || path.includes("?") || path.includes("#")) return null;
    return new URL(path, parsed).toString();
  } catch {
    return null;
  }
};

const parseRoute = (value) => {
  if (!isRecord(value)) return null;
  const allowed = new Set([
    "tripType", "adultNum", "childNum", "infantNum", "fromCity", "toCity",
    "fromDate", "retDate", "airlines", "expectedCurrency", "currencyMinorUnits",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  const passengers = Number(value.adultNum) + Number(value.childNum) + Number(value.infantNum);
  if (
    (value.tripType !== "1" && value.tripType !== "2")
    || !Number.isInteger(value.adultNum) || value.adultNum < 1 || value.adultNum > 4
    || !isCount(value.childNum) || !isCount(value.infantNum)
    || passengers > 4
    || typeof value.fromCity !== "string" || !IATA_PATTERN.test(value.fromCity)
    || typeof value.toCity !== "string" || !IATA_PATTERN.test(value.toCity)
    || value.fromCity === value.toCity
    || typeof value.fromDate !== "string" || !DATE_PATTERN.test(value.fromDate)
    || !Array.isArray(value.airlines) || value.airlines.length > 5
    || value.airlines.some((item) => typeof item !== "string" || !AIRLINE_PATTERN.test(item))
    || typeof value.expectedCurrency !== "string" || !CURRENCY_PATTERN.test(value.expectedCurrency)
    || !Number.isInteger(value.currencyMinorUnits) || value.currencyMinorUnits < 0 || value.currencyMinorUnits > 3
  ) return null;
  if (value.tripType === "2") {
    if (typeof value.retDate !== "string" || !DATE_PATTERN.test(value.retDate) || value.retDate < value.fromDate) return null;
  } else if (value.retDate !== null) return null;
  return Object.freeze({
    tripType: value.tripType,
    adultNum: value.adultNum,
    childNum: value.childNum,
    infantNum: value.infantNum,
    fromCity: value.fromCity,
    toCity: value.toCity,
    fromDate: value.fromDate,
    retDate: value.retDate,
    airlines: Object.freeze([...value.airlines]),
    expectedCurrency: value.expectedCurrency,
    currencyMinorUnits: value.currencyMinorUnits,
  });
};

const parseCatalogue = (value) => {
  let parsed;
  try {
    parsed = JSON.parse(readString(value));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > MAX_CATALOGUE_ROUTES) return null;
  const routes = {};
  for (const [legId, candidate] of entries) {
    const route = parseRoute(candidate);
    if (!isIdentifier(legId) || !route) return null;
    routes[legId] = route;
  }
  return Object.freeze(routes);
};

export const readAtlasConfiguration = (env) => {
  const searchEndpoint = parseEndpoint(env?.ATLAS_API_BASE_URL, env?.ATLAS_SEARCH_PATH);
  const verifyEndpoint = parseEndpoint(env?.ATLAS_API_BASE_URL, env?.ATLAS_VERIFY_PATH);
  const clientId = readString(env?.ATLAS_CLIENT_ID);
  const clientSecret = readString(env?.ATLAS_CLIENT_SECRET);
  const agentId = readString(env?.ATLAS_AGENT_ID);
  const routes = parseCatalogue(env?.ATLAS_ROUTE_CATALOGUE_JSON);
  const timeoutMs = Number(env?.ATLAS_TIMEOUT_MS);
  const readinessProbeTimeoutMs = Number(env?.ATLAS_READINESS_PROBE_TIMEOUT_MS);
  const maxResponseBytes = Number(env?.ATLAS_MAX_RESPONSE_BYTES);
  const fields = [];
  if (!searchEndpoint) fields.push("ATLAS_API_BASE_URL", "ATLAS_SEARCH_PATH");
  if (!verifyEndpoint) fields.push("ATLAS_API_BASE_URL", "ATLAS_VERIFY_PATH");
  if (!isConfiguredCredential(clientId)) fields.push("ATLAS_CLIENT_ID");
  if (!isConfiguredCredential(clientSecret)) fields.push("ATLAS_CLIENT_SECRET");
  if (!isIdentifier(agentId)) fields.push("ATLAS_AGENT_ID");
  if (!routes) fields.push("ATLAS_ROUTE_CATALOGUE_JSON");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) fields.push("ATLAS_TIMEOUT_MS");
  if (!Number.isInteger(readinessProbeTimeoutMs) || readinessProbeTimeoutMs < 100 || readinessProbeTimeoutMs > 6_000) {
    fields.push("ATLAS_READINESS_PROBE_TIMEOUT_MS");
  }
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 4_194_304) {
    fields.push("ATLAS_MAX_RESPONSE_BYTES");
  }
  return fields.length > 0
    ? Object.freeze({ ok: false, fields: Object.freeze([...new Set(fields)]) })
    : Object.freeze({
        ok: true,
        searchEndpoint,
        verifyEndpoint,
        clientId,
        clientSecret,
        agentId,
        routes,
        timeoutMs,
        readinessProbeTimeoutMs,
        maxResponseBytes,
      });
};

export const parseDiscoveryRequest = (value) => {
  if (!isRecord(value)) return null;
  const allowed = new Set(["operation", "contractVersion", "agentId", "legId", "intent"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (
    value.operation !== "discoverOffers"
    || value.contractVersion !== "agentic-graph.travel-discovery/v1"
    || !isIdentifier(value.agentId)
    || !isIdentifier(value.legId)
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
    !isIdentifier(constraints.bundle_id)
    || !isIdentifier(constraints.changed_leg_id)
    || !(constraints.prior_offer_id === null || isIdentifier(constraints.prior_offer_id))
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

const decimalToMinor = (value, exponent) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const text = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > exponent) return null;
  const scaled = BigInt(whole) * (10n ** BigInt(exponent))
    + BigInt((fraction + "0".repeat(exponent)).slice(0, exponent) || "0");
  const numeric = Number(scaled);
  return Number.isSafeInteger(numeric) ? numeric : null;
};

const passengerAmount = (routing, type, count, exponent) => {
  if (count === 0) return 0;
  const price = decimalToMinor(routing[`${type}Price`], exponent);
  const tax = decimalToMinor(routing[`${type}Tax`], exponent);
  if (price === null || tax === null) return null;
  return (price + tax) * count;
};

const transactionFee = (routing, passengerCount, exponent) => {
  const fee = decimalToMinor(routing.transactionFee, exponent);
  if (fee === null) return null;
  const mode = readString(routing.transactionFeeMode);
  if (mode === "PER_BOOKING") return fee;
  if (mode === "PER_PAX") return fee * passengerCount;
  return null;
};

const sha256 = async (value) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const SEGMENT_TIME_PATTERN = /^\d{12}$/;
const MAX_DIRECTION_SEGMENTS = 8;

const readAtlasSegment = (value, route) => {
  if (!isRecord(value)) return null;
  const carrier = readString(value.carrier);
  const flightNumber = readString(value.flightNumber);
  const depAirport = readString(value.depAirport);
  const arrAirport = readString(value.arrAirport);
  const depTime = readString(value.depTime);
  const arrTime = readString(value.arrTime);
  if (
    !AIRLINE_PATTERN.test(carrier)
    || (route.airlines.length > 0 && !route.airlines.includes(carrier))
    || !flightNumber || flightNumber.length > 16 || /[\u0000-\u0020\u007f]/.test(flightNumber)
    || !IATA_PATTERN.test(depAirport) || !IATA_PATTERN.test(arrAirport) || depAirport === arrAirport
    || !SEGMENT_TIME_PATTERN.test(depTime) || !SEGMENT_TIME_PATTERN.test(arrTime)
  ) return null;
  return Object.freeze({ carrier, flightNumber, depAirport, arrAirport, depTime, arrTime });
};

const readAtlasDirection = (value, route, expected) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DIRECTION_SEGMENTS) return null;
  const segments = value.map((segment) => readAtlasSegment(segment, route));
  if (segments.some((segment) => !segment)) return null;
  const locked = segments;
  if (
    locked[0].depAirport !== expected.origin
    || locked.at(-1).arrAirport !== expected.destination
    || !locked[0].depTime.startsWith(expected.date)
  ) return null;
  for (let index = 1; index < locked.length; index += 1) {
    if (locked[index - 1].arrAirport !== locked[index].depAirport) return null;
  }
  return locked;
};

const atlasItineraryIdentity = (routing, route) => {
  if (!isRecord(routing)) return null;
  const outbound = readAtlasDirection(routing.fromSegments, route, {
    origin: route.fromCity,
    destination: route.toCity,
    date: route.fromDate,
  });
  if (!outbound) return null;
  let inbound = [];
  if (route.tripType === "2") {
    inbound = readAtlasDirection(routing.retSegments, route, {
      origin: route.toCity,
      destination: route.fromCity,
      date: route.retDate,
    });
    if (!inbound) return null;
  } else if (!(routing.retSegments == null || (Array.isArray(routing.retSegments) && routing.retSegments.length === 0))) {
    return null;
  }
  return JSON.stringify({ outbound, inbound });
};

export const normalizeAtlasRouting = async (routing, route, request, verification = null) => {
  if (!isRecord(routing)) return null;
  if (!atlasItineraryIdentity(routing, route)) return null;
  const providerReference = readString(routing.routingIdentifier);
  if (!providerReference || providerReference.length > 1_024 || routing.currency !== route.expectedCurrency) return null;
  const passengerCount = route.adultNum + route.childNum + route.infantNum;
  const adults = passengerAmount(routing, "adult", route.adultNum, route.currencyMinorUnits);
  const children = passengerAmount(routing, "child", route.childNum, route.currencyMinorUnits);
  const infants = passengerAmount(routing, "infant", route.infantNum, route.currencyMinorUnits);
  const fee = transactionFee(routing, passengerCount, route.currencyMinorUnits);
  if ([adults, children, infants, fee].some((amount) => amount === null)) return null;
  const amountMinor = adults + children + infants + fee;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return null;
  const digest = await sha256(providerReference);
  return Object.freeze({
    kind: "offer",
    legId: request.legId,
    offerId: `atlas_${digest.slice(0, 32)}`,
    amountMinor,
    currency: route.expectedCurrency,
    priceVerification: verification ? "verified" : "search-only",
    agentId: request.agentId,
    promptTokens: 0,
    completionTokens: 0,
    dollarCost: 0,
    provenance: Object.freeze({
      provider: "atlas-atriptech",
      providerReference,
      providerReferenceDigest: digest,
      currency: route.expectedCurrency,
      priceVerification: verification ? "verified" : "search-only",
      verificationSessionDigest: verification?.sessionDigest ?? "none",
      // Atlas verification sessions expire after 30 minutes. The longer
      // routing-identifier window must not be presented as verified-session TTL.
      verificationValidForSeconds: verification ? "1800" : "0",
      inventoryState: "not-held-until-order",
      bookability: verification ? "verified-not-ordered" : "verify-required",
      contractVersion: "agentic-graph.travel-discovery/v1",
    }),
  });
};

const readBoundedJson = async (response, maxBytes) => {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    if (response.body) await response.body.cancel().catch(() => undefined);
    return null;
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declared) || declared > maxBytes) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      return null;
    }
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
};

const atlasBody = (route) => Object.freeze({
  tripType: route.tripType,
  adultNum: route.adultNum,
  childNum: route.childNum,
  infantNum: route.infantNum,
  fromCity: route.fromCity,
  fromAirport: "",
  toCity: route.toCity,
  toAirport: "",
  fromDate: route.fromDate,
  retDate: route.retDate ?? "",
  airlines: route.airlines,
  fromFlightNumbers: Object.freeze([]),
  retFlightNumbers: Object.freeze([]),
  includeMultipleFareFamily: false,
  currency: null,
  displayCurrency: "",
  requestSource: null,
});

export const probeAtlasCapability = async ({ config, fetchFn }) => {
  const legId = Object.keys(config.routes).sort()[0];
  if (!config.routes[legId]) {
    return Object.freeze({ ok: false, status: null, code: "provider-uat-route-unavailable", attempted: 0 });
  }
  const result = await searchAtlasQuote({
    request: Object.freeze({
      operation: "discoverOffers",
      contractVersion: "agentic-graph.travel-discovery/v1",
      agentId: config.agentId,
      legId,
      intent: Object.freeze({
        intentId: `readiness:${legId}`,
        category: "flight",
        constraints: Object.freeze({
          bundle_id: "readiness-probe",
          changed_leg_id: legId,
          prior_offer_id: null,
          prior_amount_minor: null,
        }),
      }),
    }),
    config: Object.freeze({ ...config, timeoutMs: config.readinessProbeTimeoutMs }),
    fetchFn,
  });
  return result.ok
    ? Object.freeze({ ok: true, status: 200, code: null, attempted: result.attempted })
    : Object.freeze({
        ok: false,
        status: result.status,
        code: `provider-uat-probe-${result.code}`,
        attempted: result.attempted,
      });
};

const mappedHttpError = (status) => {
  if (status === 409) return "duplicate-booking";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "provider-unavailable";
  return "provider-error-unmapped";
};

const mappedProviderError = (value) => {
  const code = readString(value?.errorCode ?? value?.code).toLocaleLowerCase();
  if (code.includes("duplicate")) return "duplicate-booking";
  if (code.includes("rate") || code.includes("limit")) return "rate-limited";
  if (code.includes("unavailable") || code.includes("timeout")) return "provider-unavailable";
  return "provider-error-unmapped";
};

export const searchAtlasQuote = async ({ request, config, fetchFn }) => {
  const route = config.routes[request.legId];
  if (!route) return Object.freeze({ ok: false, status: 503, code: "provider-unconfigured", fields: [`ATLAS_ROUTE_CATALOGUE_JSON.${request.legId}`], attempted: 0 });
  // Search and verify share one wall-clock budget so a slow search cannot leave
  // the verification request running beyond the MCP caller's deadline.
  const deadlineAt = Date.now() + config.timeoutMs;
  const remainingMs = () => Math.max(0, deadlineAt - Date.now());
  const searchBudgetMs = remainingMs();
  if (searchBudgetMs < 1) {
    return Object.freeze({ ok: false, status: 503, code: "provider-unavailable", attempted: 0 });
  }
  let response;
  try {
    response = await fetchFn(new Request(config.searchEndpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip",
        "content-type": "application/json",
        "x-atlas-client-id": config.clientId,
        "x-atlas-client-secret": config.clientSecret,
      },
      body: JSON.stringify(atlasBody(route)),
      signal: AbortSignal.timeout(searchBudgetMs),
    }));
  } catch {
    return Object.freeze({ ok: false, status: 503, code: "provider-unavailable", attempted: 1 });
  }
  if (!response.ok) {
    return Object.freeze({ ok: false, status: response.status === 429 ? 429 : 502, code: mappedHttpError(response.status), attempted: 1 });
  }
  const value = await readBoundedJson(response, config.maxResponseBytes);
  if (!isRecord(value)) return Object.freeze({ ok: false, status: 502, code: "provider-contract-violation", attempted: 1 });
  if (value.status !== 0) {
    return Object.freeze({ ok: false, status: 502, code: mappedProviderError(value), attempted: 1 });
  }
  if (!Array.isArray(value.routings)) {
    return Object.freeze({ ok: false, status: 502, code: "provider-contract-violation", attempted: 1 });
  }
  const candidates = await Promise.all(value.routings.slice(0, 50).map(async (routing) => {
    const itineraryIdentity = atlasItineraryIdentity(routing, route);
    if (!itineraryIdentity) return null;
    const quote = await normalizeAtlasRouting(routing, route, request);
    return quote ? Object.freeze({ quote, itineraryIdentity }) : null;
  }));
  const quotes = candidates.filter(Boolean).sort((left, right) => (
    left.quote.amountMinor - right.quote.amountMinor || left.quote.offerId.localeCompare(right.quote.offerId)
  ));
  if (quotes.length === 0) {
    return Object.freeze({
      ok: false,
      status: 404,
      code: value.routings.length === 0 ? "no-fares-found" : "provider-contract-violation",
      attempted: 1,
      rejectedFares: value.routings.length,
    });
  }
  const selected = quotes[0];
  const verificationBudgetMs = remainingMs();
  if (verificationBudgetMs < 1) {
    return Object.freeze({
      ok: false,
      status: 503,
      code: "provider-unavailable",
      attempted: 1,
      normalizedFares: quotes.length,
    });
  }
  let verificationResponse;
  try {
    verificationResponse = await fetchFn(new Request(config.verifyEndpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip",
        "content-type": "application/json",
        "x-atlas-client-id": config.clientId,
        "x-atlas-client-secret": config.clientSecret,
      },
      body: JSON.stringify({
        routingIdentifier: selected.quote.provenance.providerReference,
        maxResponseTime: verificationBudgetMs,
        requestSource: null,
      }),
      signal: AbortSignal.timeout(verificationBudgetMs),
    }));
  } catch {
    return Object.freeze({ ok: false, status: 503, code: "provider-unavailable", attempted: 2, normalizedFares: quotes.length });
  }
  if (!verificationResponse.ok) {
    return Object.freeze({
      ok: false,
      status: verificationResponse.status === 429 ? 429 : 502,
      code: mappedHttpError(verificationResponse.status),
      attempted: 2,
      normalizedFares: quotes.length,
    });
  }
  const verified = await readBoundedJson(verificationResponse, config.maxResponseBytes);
  const passengerCount = route.adultNum + route.childNum + route.infantNum;
  if (!isRecord(verified) || verified.status !== 0 || !isRecord(verified.routing)
    || typeof verified.sessionId !== "string" || verified.sessionId.length === 0 || verified.sessionId.length > 1_024
    || !Number.isInteger(verified.maxSeats) || verified.maxSeats < passengerCount
    || readString(verified.routing.routingIdentifier) !== selected.quote.provenance.providerReference
    || atlasItineraryIdentity(verified.routing, route) !== selected.itineraryIdentity) {
    return Object.freeze({
      ok: false,
      status: 502,
      code: isRecord(verified) && verified.status !== 0
        ? mappedProviderError(verified)
        : "provider-contract-violation",
      attempted: 2,
      normalizedFares: quotes.length,
    });
  }
  const sessionDigest = await sha256(verified.sessionId);
  const quote = await normalizeAtlasRouting(verified.routing, route, request, { sessionDigest });
  if (!quote) {
    return Object.freeze({
      ok: false,
      status: 502,
      code: "provider-contract-violation",
      attempted: 2,
      normalizedFares: quotes.length,
    });
  }
  return Object.freeze({ ok: true, quote, attempted: 2, normalizedFares: quotes.length });
};
