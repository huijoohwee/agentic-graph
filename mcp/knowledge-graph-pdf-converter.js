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

function validatePageObservations(value) {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new Error("Native PDF converter returned inconsistent page observations.");
  }
  if (value.length === 0) throw new Error("Native PDF converter found no readable pages.");
  return value.map((entry, index) => {
    const pageNumber = Number(entry?.pageNumber);
    const contentByteCount = Number(entry?.contentByteCount);
    const contentStreamCount = Number(entry?.contentStreamCount);
    const decodedContentStreamCount = Number(entry?.decodedContentStreamCount);
    const contentDecodeComplete = entry?.contentDecodeComplete;
    const contentTruncated = entry?.contentTruncated;
    const contentShapeValid = entry?.contentShapeValid;
    const hasAnnotationsEntry = entry?.hasAnnotationsEntry;
    const textFragmentCount = Number(entry?.textFragmentCount);
    const markdownTextLineCount = Number(entry?.markdownTextLineCount);
    if (pageNumber !== index + 1
      || !Number.isSafeInteger(contentByteCount)
      || contentByteCount < 0
      || !Number.isSafeInteger(contentStreamCount)
      || contentStreamCount < 0
      || !Number.isSafeInteger(decodedContentStreamCount)
      || decodedContentStreamCount < 0
      || decodedContentStreamCount > contentStreamCount
      || typeof contentDecodeComplete !== "boolean"
      || typeof contentTruncated !== "boolean"
      || typeof contentShapeValid !== "boolean"
      || typeof hasAnnotationsEntry !== "boolean"
      || !Number.isSafeInteger(textFragmentCount)
      || textFragmentCount < 0
      || !Number.isSafeInteger(markdownTextLineCount)
      || markdownTextLineCount < 0
      || typeof entry?.structurallyBlank !== "boolean"
      || (
        entry.structurallyBlank
        && (
          textFragmentCount !== 0
          || markdownTextLineCount !== 0
          || !contentDecodeComplete
          || decodedContentStreamCount !== contentStreamCount
          || contentTruncated
          || !contentShapeValid
          || hasAnnotationsEntry
        )
      )) {
      throw new Error("Native PDF converter returned invalid page observations.");
    }
    return {
      pageNumber,
      contentByteCount,
      contentStreamCount,
      decodedContentStreamCount,
      contentDecodeComplete,
      contentTruncated,
      contentShapeValid,
      hasAnnotationsEntry,
      textFragmentCount,
      markdownTextLineCount,
      structurallyBlank: entry.structurallyBlank,
    };
  });
}

function validateNativePdfOutput(outputRaw, sourcePath) {
  let output;
  try {
    output = JSON.parse(String(outputRaw || ""));
  } catch {
    throw new Error("Native PDF converter returned an invalid result envelope.");
  }
  const markdown = String(output?.markdown || "");
  if (!markdown.trim()) throw new Error("Native PDF converter returned no Markdown.");
  const lines = markdown.split(/\r?\n/);
  const pageObservations = validatePageObservations(output?.pageObservations);
  const pageCount = pageObservations.length;
  const markerNumbers = lines.flatMap((line) => {
    const match = /^## Page ([1-9][0-9]*)\s*$/.exec(line.trim());
    return match ? [Number(match[1])] : [];
  });
  if (markerNumbers.length !== pageCount
    || markerNumbers.some((pageNumber, index) => pageNumber !== index + 1)) {
    throw new Error("Native PDF converter returned inconsistent page markers.");
  }
  const textLineCount = pageObservations.reduce(
    (total, page) => total + page.markdownTextLineCount,
    0,
  );
  const unsafePages = pageObservations.filter((page) => (
    !page.contentShapeValid
    || !page.contentDecodeComplete
    || page.contentTruncated
    || page.decodedContentStreamCount !== page.contentStreamCount
  ));
  if (unsafePages.length) {
    throw new Error("Native PDF converter could not safely decode every page content stream.");
  }
  const blankPages = pageObservations.filter(
    (page) => page.textFragmentCount === 0 && page.structurallyBlank,
  );
  const nonTextPages = pageObservations.filter(
    (page) => page.markdownTextLineCount === 0 && !page.structurallyBlank,
  );
  if (!textLineCount && blankPages.length !== pageCount) {
    throw new Error("Native PDF converter found nonblank pages with no extractable text; image-only, encrypted, or unsupported visual content requires an explicit local OCR lane.");
  }
  const blankPageCount = blankPages.length;
  const nonTextPageCount = nonTextPages.length;
  const contentClass = (() => {
    if (blankPageCount === pageCount) return "blank";
    if (blankPageCount > 0 && nonTextPageCount > 0) return "text-with-blank-and-nontext-pages";
    if (blankPageCount > 0) return "text-with-blank-pages";
    if (nonTextPageCount > 0) return "text-with-nontext-pages";
    return "text";
  })();
  const diagnostics = [];
  if (blankPageCount) {
    diagnostics.push({
      code: blankPageCount === pageCount ? "pdf_blank_document" : "pdf_blank_pages",
      sourcePath,
      message: blankPageCount === pageCount
        ? `PDF ${sourcePath} is structurally valid and contains only blank pages; no text was fabricated.`
        : `PDF ${sourcePath} contains ${blankPageCount} structurally blank page(s); no text was fabricated for them.`,
      blankPageCount,
      pageCount,
    });
  }
  if (nonTextPageCount) {
    diagnostics.push({
      code: "pdf_nontext_pages",
      sourcePath,
      message: `PDF ${sourcePath} contains ${nonTextPageCount} nonblank page(s) with no extractable text; those pages are represented structurally and no visual semantics or OCR text was fabricated.`,
      nonTextPageCount,
      pageCount,
      pages: nonTextPages.map((page) => page.pageNumber),
    });
  }
  return {
    markdown,
    diagnostics,
    extraction: {
      pageCount,
      textLineCount,
      blankPageCount,
      nonTextPageCount,
      blankPages: blankPages.map((page) => page.pageNumber),
      nonTextPages: nonTextPages.map((page) => page.pageNumber),
      contentClass,
    },
  };
}

function runNativePdfCli({
  rootDir,
  inputPath,
  sourcePath,
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
    const child = spawn(process.execPath, [
      tsxCli,
      "--tsconfig",
      tsconfig,
      converterCli,
      "--input",
      inputPath,
      "--json",
    ], {
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
        settle(new Error("Native PDF converter returned an empty result."));
        return;
      }
      try {
        settle(null, validateNativePdfOutput(stdout, sourcePath));
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
        sourcePath: String(sourcePath || safePdfName(sourcePath)),
        abortSignal,
        timeoutMs: boundedTimeoutMs,
        maxOutputBytes: boundedMaxOutputBytes,
      });
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  };
}
