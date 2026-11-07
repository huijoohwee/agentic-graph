import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { admit, canonicalJson, inspect, parseJson, utcMillis } from './core/evidence-kernel.mjs';
import profile from './profiles/aviation-v1.json' with { type: 'json' };

const encoder = new TextEncoder();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
// Offline preparation only. Selection/geography are authored inputs, never runtime defaults.
function milliseconds(seconds) {
  requireValue(typeof seconds === 'number' && Number.isFinite(seconds), 'Invalid source epoch/offset.');
  const match = String(seconds).match(/^(-?)(\d+)(?:\.(\d{1,3}))?$/u);
  requireValue(match, 'Source time must be exactly representable at millisecond precision.');
  return (match[1] ? -1n : 1n) * (BigInt(match[2]) * 1000n + BigInt((match[3] || '').padEnd(3, '0')));
}
export async function importReadsb(raw, selection) {
  requireValue(raw instanceof Uint8Array && raw.length < 400000, 'Source must be UTF-8 JSON below 400 kB.');
  raw = Uint8Array.from(raw);
  canonicalJson(selection);
  selection = parseJson(JSON.stringify(selection), 'selection');
  requireValue(selection.schema === 'readsb-selection/v1', 'Unsupported selection schema.');
  requireValue(await digest(raw) === selection.sourceSha256, 'Source SHA-256 does not match the selected artifact.');
  const originalText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  const trace = parseJson(originalText, 'readsb');
  requireValue(/^[a-f0-9]{6}$/u.test(trace.icao) && Array.isArray(trace.trace), 'Expected an ICAO trace.');
  const start = utcMillis(selection.startUtc), end = utcMillis(selection.endUtc);
  requireValue(Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 86400000, 'Invalid selected UTC window.');
  requireValue(Number.isInteger(selection.maxPoints) && selection.maxPoints > 0 && selection.maxPoints <= 100, 'Select at most 100 source points.');
  const bounds = selection.studyArea;
  for (const [key, limit] of [['latitude', 90], ['longitude', 180]]) {
    requireValue(Array.isArray(bounds[key]) && bounds[key].length === 2 && bounds[key].every(x => Number.isFinite(x) && Math.abs(x) <= limit)
      && bounds[key][0] <= bounds[key][1], 'Invalid study bounds.');
  }
  requireValue(Number.isInteger(selection.excludeFlags) && selection.excludeFlags >= 0 && selection.excludeFlags <= 15, 'Invalid quality flag filter.');
  requireValue(typeof selection.positionSource === 'string' && selection.positionSource.length > 0, 'Declare position source.');
  const sourceId = 'readsb-observations', entityId = trace.icao, selected = [];
  const base = milliseconds(trace.timestamp);
  trace.trace.forEach((row, index) => {
    requireValue(Array.isArray(row) && row.length >= 10, `Invalid trace row ${index}.`);
    const time = Number(base + milliseconds(row[0]));
    requireValue(Number.isSafeInteger(time), 'Unsafe source timestamp.');
    requireValue([row[1], row[2]].every(Number.isFinite) && Number.isInteger(row[6]), `Invalid coordinates or flags in row ${index}.`);
    if (time < start || time > end || row[1] < bounds.latitude[0] || row[1] > bounds.latitude[1]
      || row[2] < bounds.longitude[0] || row[2] > bounds.longitude[1] || (row[6] & selection.excludeFlags) || row[9] !== selection.positionSource) return;
    requireValue(row[3] === null || row[3] === 'ground' || Number.isFinite(row[3]), `Invalid altitude in row ${index}.`);
    selected.push({ row, index, observed: new Date(time).toISOString() });
  });
  requireValue(selected.length > 0 && selected.length <= selection.maxPoints, 'Selected trace is empty or exceeds the point cap. Narrow the authored window.');
  const facts = [], mappings = [];
  function add(kind, value, unit, datum, observed, nullReason, upstreamPointer) {
    const id = `${sourceId}-${facts.length}`;
    facts.push({ id, entity_id: entityId, source_id: sourceId, kind, observed_at: observed, retrieved_at: selection.retrievedAt,
      value, unit, datum, null_reason: nullReason });
    mappings.push({ factId: id, upstreamPointer });
  }
  for (const { row, index, observed } of selected) {
    add('position', { latitude: row[1], longitude: row[2] }, 'deg', 'WGS84', observed, null, `/trace/${index}`);
    const numeric = typeof row[3] === 'number';
    add('altitude', numeric ? row[3] : null, 'ft', row[6] & 8 ? 'geometric' : 'pressure', observed,
      numeric ? null : row[3] === 'ground' ? 'Source reports ground; no numeric altitude or touchdown time is inferred.' : 'Altitude absent in the source row.', `/trace/${index}/3`);
  }
  const first = selected.reduce((a, b) => a.observed < b.observed ? a : b).observed;
  for (const field of profile.fields.filter(field => !['position', 'altitude'].includes(field.key))) {
    add(field.key, null, field.units[0], field.datums[0], first,
      'Not supplied as a time-aligned observation by this adapter; source metadata is preserved without enrichment or inference.', null);
  }
  const envelope = {
    schema: 'readsb-derived-source/v1',
    upstream: { url: selection.sourceUrl, sha256: selection.sourceSha256, retrieved_at: selection.retrievedAt, text: originalText },
    selection, selectedIndices: selected.map(point => point.index), mappings,
    transformation: 'readsb-adapter/v1: epoch+offset exact milliseconds; position degrees; numeric altitude feet with flag 8 geometric otherwise pressure; ground/null preserved as unknown. Filtered points are not interpolated. Metadata and unobserved fields are not inferred.',
    facts,
  };
  const sourceText = JSON.stringify(envelope);
  const bundle = {
    schema: profile.bundleSchema, profile: { id: profile.id, version: profile.version },
    dataset: { id: selection.datasetId, title: selection.title, classification: 'imported' },
    sources: [{ id: sourceId, origin: `${selection.sourceUrl} · Offline mapped observations; exact upstream bytes are nested in the original envelope.`,
      rights: { status: 'operator-attested', statement: selection.rightsStatement }, retrieved_at: selection.retrievedAt,
      original: { media_type: 'application/json', text: sourceText, sha256: await digest(encoder.encode(sourceText)) } }],
    entities: [{ id: entityId, label: selection.entityLabel }],
    facts: facts.map((fact, index) => ({ ...fact, evidence_ref: `/facts/${index}` })),
  };
  // Compact source strings retain upstream newlines as escapes, preserving the file line budget.
  const bytes = encoder.encode(JSON.stringify(bundle) + '\n');
  await admit(bytes, profile);
  return bytes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, selectionFile, destination, ...extra] = process.argv.slice(2);
  if (!source || !selectionFile || !destination || extra.length) throw new Error('Usage: node scripts/import-readsb.mjs <source.json> <selection.json> <new-bundle.json>');
  const bytes = await importReadsb(await readFile(source), parseJson(await readFile(selectionFile, 'utf8'), 'selection'));
  await writeFile(destination, bytes, { flag: 'wx' });
  const record = inspect(await admit(bytes, profile));
  console.log(JSON.stringify({ bytes: bytes.length, identity: record.identity, stats: record.stats }));
}
