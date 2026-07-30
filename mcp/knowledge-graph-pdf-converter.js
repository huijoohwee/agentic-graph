import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

const boundedInteger = (value, fallback, maximum) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, maximum);
};

const safePdfName = (sourcePath) => {
  const name = path.basename(String(sourcePath || "document.pdf"))
    .replace(/[^A-Za-z0-9._-]+/g, "-");
  return name.toLowerCase().endsWith(".pdf") ? name : `${name || "document"}.pdf`;
};

function validateExtractedMarkdown(markdownRaw) {
  const lines = String(markdownRaw || "").split(/\r?\n/);
  const pageCount = lines.filter((line) => /^## Page [1-9][0-9]*\s*$/.test(line.trim())).length;
  if (!pageCount) throw new Error("Native PDF converter found no readable pages.");
  const meaningfulLines = lines.slice(1).filter((line) => {
    const trimmed = line.trim();
    return trimmed && !/^## Page [1-9][0-9]*\s*$/.test(trimmed);
  });
  if (!meaningfulLines.length) throw new Error("Native PDF converter found no extractable text; image-only or encrypted PDF input requires an explicit local OCR lane.");
  return { pageCount, textLineCount: meaningfulLines.length };
}

function runNativePdfCli({
  rootDir,
  inputPath,
  abortSignal,
  timeoutMs,
  maxOutputBytes,
}) {
  const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
  const converterCli = path.join(rootDir, "canvas", "src", "cli", "convert-pdf-to-graph-markdown.ts");
  const tsconfig = path.join(rootDir, "canvas", "tsconfig.json");
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error("PDF conversion was aborted."));
      return;
    }
    const child = spawn(process.execPath, [tsxCli, "--tsconfig", tsconfig, converterCli, "--input", inputPath], {
      cwd: rootDir,
      env: {
        PATH: process.env.PATH || "",
        TMPDIR: process.env.TMPDIR || os.tmpdir(),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let settled = false;
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const stop = (message) => {
      child.kill("SIGKILL");
      settle(new Error(message));
    };
    const onAbort = () => stop("PDF conversion was aborted.");
    const timer = setTimeout(() => stop(`PDF conversion exceeded ${timeoutMs}ms.`), timeoutMs);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => settle(new Error(`Native PDF converter could not start: ${error.message}`)));
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        stop(`PDF conversion output exceeded ${maxOutputBytes} bytes.`);
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-8192);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        settle(new Error(`Native PDF converter exited ${String(code ?? signal ?? "unknown")}: ${stderr.trim()}`));
        return;
      }
      if (!stdout.trim()) {
        settle(new Error("Native PDF converter returned empty Markdown."));
        return;
      }
      try {
        const extraction = validateExtractedMarkdown(stdout);
        settle(null, { markdown: stdout, diagnostics: [], extraction });
      } catch (error) {
        settle(error);
      }
    });
  });
}

export function createLocalKnowledgeGraphPdfConverter({
  rootDir,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
} = {}) {
  const absoluteRoot = path.resolve(String(rootDir || process.cwd()));
  const boundedTimeoutMs = boundedInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 10 * 60_000);
  const boundedMaxOutputBytes = boundedInteger(maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES, 64 * 1024 * 1024);
  return async ({ sourcePath, bytes, abortSignal }) => {
    if (!Buffer.isBuffer(bytes)) throw new Error("PDF conversion requires the discovered source bytes.");
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-knowledge-graph-pdf-"));
    const inputPath = path.join(temporaryRoot, safePdfName(sourcePath));
    try {
      await fs.writeFile(inputPath, bytes, { flag: "wx" });
      return await runNativePdfCli({
        rootDir: absoluteRoot,
        inputPath,
        abortSignal,
        timeoutMs: boundedTimeoutMs,
        maxOutputBytes: boundedMaxOutputBytes,
      });
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  };
}
