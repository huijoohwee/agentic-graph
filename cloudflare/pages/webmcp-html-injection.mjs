export const WEB_MCP_LIFECYCLE_SCRIPT_MARKER = 'data-knowgrph-webmcp-lifecycle="agent-ready-pages-v1"';

export const hasOwnedWebMcpLifecycleScript = (html) => {
  const body = String(html || "");
  return body.includes(WEB_MCP_LIFECYCLE_SCRIPT_MARKER);
};

export const injectWebMcpScript = async (response, webMcpScript) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return response;

  const html = await response.text();
  if (hasOwnedWebMcpLifecycleScript(html)) return new Response(html, response);

  const scriptTag = `<script ${WEB_MCP_LIFECYCLE_SCRIPT_MARKER}>${webMcpScript}</script>`;
  const nextHtml = html.includes("</head>")
    ? html.replace("</head>", `${scriptTag}</head>`)
    : `${html}${scriptTag}`;
  const nextResponse = new Response(nextHtml, response);
  nextResponse.headers.delete("content-length");
  return nextResponse;
};
