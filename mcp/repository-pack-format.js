import { createHash } from "node:crypto";

import {
  REPOSITORY_PACK_FORMAT_VERSION,
  REPOSITORY_PACK_INVOCATION,
} from "./repository-pack-contract.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);
const longestBacktickRun = (text) => {
  let longest = 0;
  let current = 0;
  for (const character of text) {
    current = character === "`" ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
};
const markdownFence = (text) => "`".repeat(Math.max(4, longestBacktickRun(text) + 1));

export const digestRepositoryPackSource = (entries) => {
  const hash = createHash("sha256");
  for (const entry of entries) {
    for (const value of [
      entry.path,
      entry.state,
      String(entry.sizeBytes),
      entry.sha256 || "",
      entry.reason || "",
      entry.gitIndexIdentity || "",
    ]) {
      hash.update(value);
      hash.update("\0");
    }
  }
  return hash.digest("hex");
};

const renderManifest = ({ gitRevision, request, sourceSetSha256, counts, bounds, omissions }) => [
  "# Repository Pack Manifest",
  "",
  `- Schema: ${json(REPOSITORY_PACK_FORMAT_VERSION)}`,
  `- Invocation: ${json(REPOSITORY_PACK_INVOCATION)}`,
  `- Git revision: ${json(gitRevision)}`,
  `- Repository path: ${json(request.repositoryPath)}`,
  `- Output directory: ${json(request.outputDirectory)}`,
  `- Include path count: ${request.includePaths.length}`,
  `- Exclude path count: ${request.excludePaths.length}`,
  `- Source-set SHA-256: ${sourceSetSha256}`,
  `- Counts: ${json(counts)}`,
  `- Bounds: ${json(bounds)}`,
  `- Omissions: ${json(omissions)}`,
];

const renderPathIndex = (entries) => [
  "# Path Index",
  "",
  ...entries.map((entry, index) => `${index + 1}. ${json({
    path: entry.path,
    state: entry.state,
    bytes: entry.sizeBytes,
    sha256: entry.sha256 || null,
    reason: entry.reason || null,
  })}`),
];

const renderSourceRecord = (entry, index) => {
  const text = entry.content.toString("utf8");
  const fence = markdownFence(text);
  return [
    `## Source ${String(index + 1).padStart(6, "0")}`,
    "",
    `- Path: ${json(entry.path)}`,
    `- Bytes: ${entry.sizeBytes}`,
    `- SHA-256: ${entry.sha256}`,
    "",
    `${fence}text`,
    text,
    fence,
  ].join("\n");
};

const renderOnce = (input, outputBytes) => {
  const counts = { ...input.counts, outputBytes };
  const embedded = input.entries.filter((entry) => entry.state === "embedded");
  const lines = [
    ...renderManifest({ ...input, counts }),
    "",
    ...renderPathIndex(input.entries),
    "",
    "# Source Records",
    ...embedded.flatMap((entry, index) => ["", renderSourceRecord(entry, index)]),
  ];
  return Buffer.from(`${lines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
};

export const buildRepositoryPackMarkdown = (input) => {
  let outputBytes = 0;
  let buffer = renderOnce(input, outputBytes);
  for (let iteration = 0; iteration < 8 && buffer.length !== outputBytes; iteration += 1) {
    outputBytes = buffer.length;
    buffer = renderOnce(input, outputBytes);
  }
  if (buffer.length !== outputBytes) {
    outputBytes = buffer.length;
    buffer = renderOnce(input, outputBytes);
  }
  return {
    buffer,
    sha256: sha256(buffer),
    outputBytes: buffer.length,
  };
};
