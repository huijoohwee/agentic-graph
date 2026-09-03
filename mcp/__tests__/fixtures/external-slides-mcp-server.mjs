import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const FIXTURE_SLIDES_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["title", "markdown", "request_id"],
  properties: {
    title: { type: "string", minLength: 1 },
    markdown: { type: "string", minLength: 1 },
    request_id: { type: "string", minLength: 8 },
  },
});

const FIXTURE_OUTPUT_DIRECTORY = path.join(tmpdir(), "agentic-graph-external-mcp-fixture");
const FIXTURE_TOOLS = Object.freeze({
  create_fixture_deck: { route: "decks", suffix: "slides.md", label: "Fixture deck" },
  create_fixture_sheet: { route: "sheets", suffix: "sheet.md", label: "Fixture sheet" },
});

const server = new Server(
  { name: "external-slides-fixture", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.keys(FIXTURE_TOOLS).map(name => ({
    name,
    description: `Create a deterministic external ${name === "create_fixture_deck" ? "deck" : "sheet"} file.`,
    inputSchema: FIXTURE_SLIDES_INPUT_SCHEMA,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const fixtureTool = FIXTURE_TOOLS[request.params?.name];
  if (!fixtureTool) throw new Error("Unknown fixture tool.");
  const args = request.params.arguments || {};
  const requestId = String(args.request_id || "unknown");
  const fileName = `${encodeURIComponent(requestId)}.${fixtureTool.suffix}`;
  await mkdir(FIXTURE_OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(path.join(FIXTURE_OUTPUT_DIRECTORY, fileName), String(args.markdown || ""), "utf8");
  return {
    content: [{
      type: "resource_link",
      uri: `https://docs.example.com/${fixtureTool.route}/${encodeURIComponent(requestId)}`,
      name: String(args.title || fixtureTool.label),
      mimeType: request.params.name === "create_fixture_deck"
        ? "application/vnd.example.presentation"
        : "application/vnd.example.spreadsheet",
    }],
    structuredContent: {
      id: requestId,
      url: `https://docs.example.com/${fixtureTool.route}/${encodeURIComponent(requestId)}?fixture_secret=strip`,
      title: String(args.title || fixtureTool.label),
    },
  };
});

await server.connect(new StdioServerTransport());
