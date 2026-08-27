import {
  AGENTIC_COMMERCE_ROUTE_PATHS,
  buildAgenticCommerceAcpDiscovery,
  buildAgenticCommerceMppOpenApi,
  buildAgenticCommerceUcpProfile,
  buildAgenticCommerceX402PaymentRequired,
  isAgenticCommerceWeb3Enabled,
  readAgenticCommerceSellerId,
  readAgenticCommerceX402Amount,
  readAgenticCommerceX402Asset,
  readAgenticCommerceX402FacilitatorUrl,
  readAgenticCommerceX402Network,
  readAgenticCommerceX402PayToAddress,
} from "../../grph-shared/dist/payments/agenticCommerceSsot.js";

const jsonBody = (body) => JSON.stringify(body, null, 2);
const trimOrigin = (value) => String(value || "").trim().replace(/\/+$/g, "");
const encodeBase64 = (value) => {
  if (typeof btoa === "function") return btoa(value);
  if (typeof Buffer !== "undefined") return Buffer.from(value).toString("base64");
  return "";
};
const rootOriginFromRequest = (requestUrl, fallbackOrigin) => {
  try {
    return new URL(requestUrl).origin;
  } catch {
    return trimOrigin(fallbackOrigin);
  }
};

export const buildKnowgrphCommerceDiscovery = (args = {}) => {
  const origin = rootOriginFromRequest(args.requestUrl, args.origin);
  const env = args.env || {};
  const sellerId = readAgenticCommerceSellerId(env, `${origin}/`);
  const web3Enabled = isAgenticCommerceWeb3Enabled(env);
  const x402 = buildAgenticCommerceX402PaymentRequired({
    baseUrl: origin,
    payTo: readAgenticCommerceX402PayToAddress(env),
    network: readAgenticCommerceX402Network(env),
    asset: readAgenticCommerceX402Asset(env),
    amount: readAgenticCommerceX402Amount(env),
    facilitatorUrl: readAgenticCommerceX402FacilitatorUrl(env),
  });
  return {
    acpDiscovery: buildAgenticCommerceAcpDiscovery({ sellerId, baseUrl: origin, web3Enabled }),
    ucpProfile: buildAgenticCommerceUcpProfile({ sellerId, baseUrl: origin, web3Enabled }),
    mppOpenApi: buildAgenticCommerceMppOpenApi({ baseUrl: origin }),
    x402PaymentRequired: x402,
  };
};

export const buildKnowgrphCommerceStaticFiles = (args = {}) => {
  const discovery = buildKnowgrphCommerceDiscovery(args);
  return {
    [AGENTIC_COMMERCE_ROUTE_PATHS.acpDiscovery.slice(1)]: {
      contentType: "application/json; charset=utf-8",
      body: jsonBody(discovery.acpDiscovery),
    },
    [AGENTIC_COMMERCE_ROUTE_PATHS.ucpProfile.slice(1)]: {
      contentType: "application/json; charset=utf-8",
      body: jsonBody(discovery.ucpProfile),
    },
    [AGENTIC_COMMERCE_ROUTE_PATHS.mppOpenApi.slice(1)]: {
      contentType: "application/vnd.oai.openapi+json; charset=utf-8",
      body: jsonBody(discovery.mppOpenApi),
    },
  };
};

export const buildKnowgrphX402PaymentRequiredResponse = (request, env = {}) => {
  const paymentRequired = buildKnowgrphCommerceDiscovery({
    requestUrl: request?.url,
    env,
  }).x402PaymentRequired;
  const headerValue = encodeBase64(JSON.stringify(paymentRequired));
  return new Response(jsonBody(paymentRequired), {
    status: 402,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...(headerValue ? { "payment-required": headerValue } : {}),
    },
  });
};
