import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

import { ExternalToolProfileConfigError } from "./external-tool-profile-registry.js";

const readRequiredHostEnv = (mapping, env, label) => {
  const resolved = {};
  for (const [targetName, sourceName] of Object.entries(mapping || {})) {
    const value = env[sourceName];
    if (typeof value !== "string" || !value) {
      throw new ExternalToolProfileConfigError(`${label} requires host environment variable ${sourceName}.`, "profile_secret_unavailable");
    }
    if (value.includes("\u0000") || value.length > 16_384) {
      throw new ExternalToolProfileConfigError(`${label} host environment variable ${sourceName} is invalid.`, "profile_secret_invalid");
    }
    resolved[targetName] = value;
  }
  return resolved;
};

const isPrivateIpv4 = (address) => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [first, second, third] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113)
    || first >= 224;
};

const isPrivateIpv6 = (address) => {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") || normalized.startsWith("2001:db8")) return true;
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
};

const isPrivateAddress = (address) => {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
};

const toRequestUrl = (input) => {
  if (input instanceof URL) return new URL(input.href);
  if (typeof input === "string") return new URL(input);
  if (input && typeof input === "object" && typeof input.url === "string") return new URL(input.url);
  throw new Error("External MCP transport attempted an invalid request URL.");
};

const isConfiguredDevelopmentLoopback = (profile, url, env) =>
  profile.transport.developmentLoopback === true
  && String(env.NODE_ENV || "").toLowerCase() !== "production"
  && (["localhost", "::1"].includes(url.hostname.replace(/^\[|\]$/g, "")) || url.hostname.startsWith("127."));

export async function assertExternalHttpRequestTarget(args) {
  const requestUrl = args.url instanceof URL ? args.url : new URL(String(args.url));
  const configuredUrl = new URL(args.profile.transport.url);
  if (requestUrl.origin !== configuredUrl.origin) throw new Error("External MCP transport attempted a cross-origin request.");
  if (requestUrl.username || requestUrl.password || requestUrl.hash) throw new Error("External MCP transport request URL contains forbidden credentials or fragment.");
  if (isConfiguredDevelopmentLoopback(args.profile, requestUrl, args.env || process.env)) return;
  if (requestUrl.protocol !== "https:") throw new Error("External MCP transport requires HTTPS.");
  const lookupImpl = args.lookupImpl || dnsLookup;
  const addresses = net.isIP(requestUrl.hostname)
    ? [{ address: requestUrl.hostname }]
    : await lookupImpl(requestUrl.hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || !addresses.length || addresses.some((entry) => isPrivateAddress(String(entry.address || "")))) {
    throw new Error("External MCP transport resolved to a forbidden private or invalid network address.");
  }
}

export function buildExternalToolTransport(profile, options = {}) {
  const env = options.env || process.env;
  if (profile.transport.type === "stdio") {
    return new StdioClientTransport({
      command: profile.transport.command,
      args: [...profile.transport.args],
      cwd: profile.transport.cwd,
      env: readRequiredHostEnv(profile.transport.envFrom, env, `External MCP profile ${profile.id}`),
      stderr: "ignore",
    });
  }
  const headers = readRequiredHostEnv(profile.transport.headersFromEnv, env, `External MCP profile ${profile.id}`);
  const fetchImpl = options.fetchImpl || fetch;
  const secureFetch = async (input, init = {}) => {
    const requestUrl = toRequestUrl(input);
    await assertExternalHttpRequestTarget({ profile, url: requestUrl, env, lookupImpl: options.lookupImpl });
    return fetchImpl(input, { ...init, redirect: "error" });
  };
  if (profile.transport.type === "sse") {
    return new SSEClientTransport(new URL(profile.transport.url), {
      eventSourceInit: { fetch: secureFetch, headers },
      requestInit: { headers },
      fetch: secureFetch,
    });
  }
  return new StreamableHTTPClientTransport(new URL(profile.transport.url), {
    requestInit: { headers },
    fetch: secureFetch,
    reconnectionOptions: {
      maxReconnectionDelay: 1,
      initialReconnectionDelay: 1,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  });
}

export async function createExternalToolSession(profile, options = {}) {
  const timeoutMs = profile.transport.timeoutMs;
  const requestOptions = {
    timeout: timeoutMs,
    maxTotalTimeout: timeoutMs,
    ...(options.signal ? { signal: options.signal } : {}),
  };
  const client = new Client({ name: "agentic-graph-external-tool-gateway", version: "0.1.0" });
  const transport = buildExternalToolTransport(profile, options);
  try {
    await client.connect(transport, requestOptions);
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
  return Object.freeze({
    listTools: (cursor) => client.listTools(cursor ? { cursor } : undefined, requestOptions),
    callTool: (name, argumentsValue) => client.callTool({ name, arguments: argumentsValue }, undefined, requestOptions),
    close: () => client.close(),
  });
}
