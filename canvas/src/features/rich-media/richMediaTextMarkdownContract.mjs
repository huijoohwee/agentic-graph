export const RICH_MEDIA_TEXT_MARKDOWN_SCHEMA = "agentic-graph-rich-media-text/v1";

const yamlString = value => JSON.stringify(String(value ?? ""));

const isHtmlDocument = value => (
  /^\s*<!doctype\s+html\b/i.test(value)
  || /^\s*<html\b/i.test(value)
  || /<head\b[\s>]/i.test(value)
  || /<body\b[\s>]/i.test(value)
);

export function buildRichMediaTextMarkdownDocument(args = {}) {
  const body = String(args.body || "").replace(/^\uFEFF/, "").trim();
  if (isHtmlDocument(body)) {
    throw new Error("Rich Media Panel text must be Markdown, not an HTML document.");
  }
  return [
    "---",
    `schema: ${yamlString(RICH_MEDIA_TEXT_MARKDOWN_SCHEMA)}`,
    `title: ${yamlString(String(args.title || "").trim() || "Rich Media Panel Text")}`,
    'media_kind: "text"',
    'content_type: "text/markdown"',
    `source_contract: ${yamlString(String(args.sourceContract || "").trim())}`,
    "---",
    "",
    body,
  ].join("\n");
}
