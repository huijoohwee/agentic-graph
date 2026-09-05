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
import {
  buildAgenticCommercePaidResourceDiscoveryProjection,
  readAgenticCommercePaidResourceConfiguration,
} from "../../grph-shared/dist/payments/agenticCommercePaidResourceSsot.js";

const jsonBody = (body) => JSON.stringify(body, null, 2);
const PAID_RESOURCES_EXTENSION = "x-agentic-commerce-paid-resources";
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

export const buildAgenticGraphCommerceDiscovery = (args = {}) => {
  const origin = rootOriginFromRequest(args.requestUrl, args.origin);
  const env = args.env || {};
  const sellerId = readAgenticCommerceSellerId(env, `${origin}/`);
  const web3Enabled = isAgenticCommerceWeb3Enabled(env);
  const payTo = readAgenticCommerceX402PayToAddress(env);
  const x402 = payTo ? buildAgenticCommerceX402PaymentRequired({
    baseUrl: origin,
    payTo,
    network: readAgenticCommerceX402Network(env),
    asset: readAgenticCommerceX402Asset(env),
    amount: readAgenticCommerceX402Amount(env),
    facilitatorUrl: readAgenticCommerceX402FacilitatorUrl(env),
  }) : null;
  const paidResourceConfig = readAgenticCommercePaidResourceConfiguration(env);
  let xrplX402PaidResource = null;
  if (paidResourceConfig.ok && origin) {
    try {
      xrplX402PaidResource = buildAgenticCommercePaidResourceDiscoveryProjection({
        baseUrl: origin,
        config: paidResourceConfig.config,
      });
    } catch {
      xrplX402PaidResource = null;
    }
  }
  const paidResources = xrplX402PaidResource ? [xrplX402PaidResource] : [];
  const paidResourceExtension = paidResources.length > 0
    ? { [PAID_RESOURCES_EXTENSION]: paidResources }
    : {};
  const acpDiscovery = {
    ...buildAgenticCommerceAcpDiscovery({ sellerId, baseUrl: origin, web3Enabled }),
    ...paidResourceExtension,
  };
  const ucpProfile = {
    ...buildAgenticCommerceUcpProfile({ sellerId, baseUrl: origin, web3Enabled }),
    ...paidResourceExtension,
  };
  const baseMppOpenApi = buildAgenticCommerceMppOpenApi({ baseUrl: origin });
  const mppOpenApi = {
    ...baseMppOpenApi,
    ...paidResourceExtension,
    paths: {
      ...baseMppOpenApi.paths,
      ...(xrplX402PaidResource ? {
        [new URL(xrplX402PaidResource.url).pathname]: {
          post: {
            operationId: "purchaseAgenticGraphXrplTravelRequote",
            summary: "Purchase one verified live flight requote with XRPL x402.",
            "x-payment-info": xrplX402PaidResource.payment,
            responses: {
              200: { description: "Paid requote fulfilled" },
              402: { description: "XRPL x402 payment required" },
            },
          },
        },
      } : {}),
    },
  };
  return {
    acpDiscovery,
    ucpProfile,
    mppOpenApi,
    x402PaymentRequired: x402,
    paidResources,
    ...(xrplX402PaidResource ? { xrplX402PaidResource } : {}),
  };
};

export const buildAgenticGraphCommerceStaticFiles = (args = {}) => {
  const discovery = buildAgenticGraphCommerceDiscovery(args);
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

export const buildAgenticGraphCommerceRouteResponse = (request, env = {}) => {
  const pathname = new URL(request.url).pathname.replace(/^\/+/, "");
  const artifact = buildAgenticGraphCommerceStaticFiles({ requestUrl: request.url, env })[pathname];
  if (!artifact) return null;
  return new Response(request.method === "HEAD" ? null : artifact.body, {
    headers: { "content-type": artifact.contentType, "cache-control": "no-store" },
  });
};

export const buildAgenticGraphX402PaymentRequiredResponse = (request, env = {}) => {
  const paymentRequired = buildAgenticGraphCommerceDiscovery({
    requestUrl: request?.url,
    env,
  }).x402PaymentRequired;
  if (!paymentRequired) {
    return new Response(jsonBody({ ok: false, code: "x402_payee_unconfigured" }), {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  }
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
