export function minimalTextPdf(textRaw) {
  const text = String(textRaw).replace(/[()\\]/g, (match) => `\\${match}`);
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    { id: 3, body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>" },
    { id: 4, body: `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream` },
    { id: 5, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
  ];
  const chunks = ["%PDF-1.4\n"];
  const offsets = new Map();
  for (const object of objects) {
    offsets.set(object.id, Buffer.byteLength(chunks.join(""), "latin1"));
    chunks.push(`${object.id} 0 obj\n${object.body}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(""), "latin1");
  chunks.push("xref\n0 6\n", "0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    chunks.push(`${String(offsets.get(id)).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(""), "latin1");
}
