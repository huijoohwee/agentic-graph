# agentic-graph-pdf-ocr-document

## Overview

This document describes the PDF → Markdown conversion pipeline, focusing on the optional OCR enhancement stage and the provider selection surface.

**Primary goal**: improve Markdown fidelity (text + embedded images) while keeping a fully local default path and making OCR/enrichment opt-in and config-driven.

## Architecture

### Base Conversion (Native, In-Repo)

- Input: PDF bytes (URL fetch or local file upload)
- Output: Markdown text + extracted image assets

Key properties:

- Extracts text via PDF content streams and ToUnicode/CMap decoding.
- Extracts embedded images from page resources and emits Markdown image tokens.
- Normalizes extracted Markdown to reduce common spacing/word-join artifacts.

### Image Embedding Strategy

The converter produces Markdown that remains renderable when persisted as a plain text workspace document:

- Preferred: inline `data:<mime>;base64,...` image URLs (bounded by size caps)
- Fallback: `/__pdf_assets/<token>/...` same-origin URLs (served by the dev/preview server while cached)

## Rendering Contract

- Markdown rendering must preserve same-origin internal asset routes like `/__pdf_assets/<token>/...` (and other internal runtime routes such as `/@...`) as already-resolved URLs; they must not be rewritten into filesystem-backed `/@fs/...` URLs.
- For large Markdown documents, the renderer’s fast-parse mode must still preserve safe HTML blocks for media/table tags so PDF converters that emit HTML tables (e.g. Docling) remain renderable.

### OCR Enhancement (Optional)

When enabled, the converter can run OCR against extracted page images and inject the returned Markdown into each page section.

Key properties:

- OCR runs on images only (no PDF rendering dependency).
- OCR is executed server-side during conversion.
- OCR output headings are shifted down to avoid breaking the page section structure.

## End-to-End Flow

1. Client posts PDF (or PDF URL) to `/__convert_pdf`.
2. Dev/preview server converts PDF using a provider (`native` by default).
3. Native provider returns `{ markdown, assets[] }`.
4. Server writes assets into a temp directory and serves them under `/__pdf_assets/<token>/...`.
5. Markdown normalization runs.
6. Server optionally rewrites eligible asset links to `data:` URIs.
7. Client receives Markdown and proceeds with the normal Import → Parse → Store → Render pipeline.

## Configuration

### Provider selection

- `AGENTIC_OS_PDF_MODE=online`: prefer online enrichment providers (if configured)
- `AGENTIC_OS_PDF_PROVIDER=native|docling-remote`: explicit provider selection
- `AGENTIC_OS_DOCLING_ENDPOINT`: HTTP endpoint for Docling-based PDF→Markdown conversion
- `AGENTIC_OS_PDF_PROVIDER_FALLBACK_TO_NATIVE=1`: if Docling conversion fails, fall back to native conversion

### OCR (server-side)

- `AGENTIC_OS_PDF_OCR_ENABLE=1`: enable OCR enhancement during conversion
- `AGENTIC_OS_PDF_OCR_ENDPOINT`: HTTP endpoint that accepts `{ filename, prompt, imageBase64 }` and returns `{ ok, markdown }`
- `AGENTIC_OS_PDF_OCR_MODE=fallback|always`: apply OCR only when extracted text is sparse vs always
- `AGENTIC_OS_PDF_OCR_MIN_TEXT_CHARS`: sparse-text threshold used by `fallback`
- `AGENTIC_OS_PDF_OCR_MAX_IMAGES_PER_PAGE`: max page images sent to OCR
- `AGENTIC_OS_PDF_OCR_TIMEOUT_MS`: request timeout
- `AGENTIC_OS_PDF_OCR_PROMPT`: optional prompt forwarded to the OCR endpoint

### MainPanel Settings (UI)

The client can override OCR per conversion via the PDF import settings:

- `pdfImportOcrEnabled`
- `pdfImportOcrMode`

These settings are serialized into `/__convert_pdf` query params:

- `ocr=1|0`
- `ocrMode=always|fallback`

### Native table reconstruction (client → server)

When using the in-repo `native` provider, the converter can attempt table reconstruction by inferring column-aligned rows from PDF text fragment positions and emitting Markdown pipe tables.

Settings keys:

- `pdfImportReconstructTables`
- `pdfImportTableMinColumns`
- `pdfImportTableMinRows`
- `pdfImportTableMaxRows`

Query params:

- `reconstructTables=1|0`
- `tableMinColumns=<int>`
- `tableMinRows=<int>`
- `tableMaxRows=<int>`
