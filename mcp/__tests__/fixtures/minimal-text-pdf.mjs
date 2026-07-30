const escapedPdfText = (value) => (
  String(value).replace(/[()\\]/g, (match) => `\\${match}`)
);

function minimalPdfWithStreams(streams, {
  includeFont,
  contentValues = [],
  contentStreamExtras = [],
  extraObjects = [],
  pageExtras = [],
}) {
  const pageIds = streams.map((_, index) => 3 + (index * 2));
  const fontId = 3 + (streams.length * 2);
  const objects = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    {
      id: 2,
      body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${streams.length} >>`,
    },
  ];
  for (let index = 0; index < streams.length; index += 1) {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = streams[index];
    const resources = includeFont
      ? `<< /ProcSet [ /PDF ] /Font << /F1 ${fontId} 0 R >> >>`
      : "<< /ProcSet [ /PDF ] >>";
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${contentValues[index] || `${contentId} 0 R`} ${pageExtras[index] || ""} >>`,
    });
    objects.push({
      id: contentId,
      body: `<< /Length ${Buffer.byteLength(stream, "latin1")} ${contentStreamExtras[index] || ""} >>\nstream\n${stream}\nendstream`,
    });
  }
  if (includeFont) {
    objects.push({
      id: fontId,
      body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    });
  }
  objects.push(...extraObjects);
  const chunks = ["%PDF-1.4\n"];
  const offsets = new Map();
  for (const object of objects) {
    offsets.set(object.id, Buffer.byteLength(chunks.join(""), "latin1"));
    chunks.push(`${object.id} 0 obj\n${object.body}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(""), "latin1");
  const size = Math.max(...objects.map((object) => object.id)) + 1;
  chunks.push(`xref\n0 ${size}\n`, "0000000000 65535 f \n");
  for (let id = 1; id < size; id += 1) {
    chunks.push(`${String(offsets.get(id)).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(""), "latin1");
}

export const minimalTextPdf = (text) => minimalPdfWithStreams([
  `BT /F1 24 Tf 72 720 Td (${escapedPdfText(text)}) Tj ET`,
], { includeFont: true });

export const minimalBlankPdf = () => minimalPdfWithStreams([
  "q\nQ",
], { includeFont: false });

export const minimalTextAndBlankPdf = (text) => minimalPdfWithStreams([
  `BT /F1 24 Tf 72 720 Td (${escapedPdfText(text)}) Tj ET`,
  "q\nQ",
], { includeFont: true });

export const minimalTextAndVectorPdf = (text) => minimalPdfWithStreams([
  `BT /F1 24 Tf 72 720 Td (${escapedPdfText(text)}) Tj ET`,
  "q\n0 0 m 100 0 l S\nQ",
], { includeFont: true });

export const minimalVectorPdf = () => minimalPdfWithStreams([
  "q\n0 0 m 100 0 l S\nQ",
], { includeFont: false });

export const minimalTextAndMalformedContentsPdf = (text) => minimalPdfWithStreams([
  `BT /F1 24 Tf 72 720 Td (${escapedPdfText(text)}) Tj ET`,
  "q\nQ",
], {
  includeFont: true,
  contentValues: ["", "<< /Malformed true >>"],
});

export const minimalTextAndUnsupportedFilterPdf = (text, filter = "/BogusDecode") => minimalPdfWithStreams([
  `BT /F1 24 Tf 72 720 Td (${escapedPdfText(text)}) Tj ET`,
  "q\n0 0 m 100 0 l S\nQ",
], {
  includeFont: true,
  contentStreamExtras: ["", `/Filter ${filter}`],
});

export const minimalAnnotatedBlankPdf = () => minimalPdfWithStreams([
  "q\nQ",
], {
  includeFont: false,
  pageExtras: ["/Annots [5 0 R]"],
  extraObjects: [{
    id: 5,
    body: "<< /Type /Annot /Subtype /Text /Rect [72 720 96 744] /Contents (visible note) >>",
  }],
});

export const minimalMalformedContentsPdf = () => minimalPdfWithStreams([
  "q\nQ",
], {
  includeFont: false,
  contentValues: ["<< /Malformed true >>"],
});
