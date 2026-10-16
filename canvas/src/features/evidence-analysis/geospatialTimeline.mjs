const fail = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 2048) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const fields = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const utc = value => {
 fail(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), 'Timeline times require explicit UTC.');
 const ms = Date.parse(value);
 fail(Number.isFinite(ms) && new Date(ms).toISOString() === value.replace(/(?<!\.\d{3})Z$/, '.000Z'), 'Timeline UTC is invalid.');
 return ms;
};
const canonical = value => new Date(utc(value)).toISOString();
const ids = value => Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(id => text(id, 128)) && new Set(value).size === value.length;

/** Authored rows describe presentation roles; they never confer operational validity. */
export function validateSourceGeospatialTimeline(scene) {
 const config = scene.timeline;
 if (config === undefined) return;
 fail(fields(config, ['title', 'window', 'lanes']) && text(config.title), 'Author a bounded timeline title and lanes.');
 fail(fields(config.window, ['startUtc', 'endUtc']), 'Author an explicit timeline UTC window.');
 const start = utc(config.window.startUtc), end = utc(config.window.endUtc), at = utc(scene.defaultAtUtc);
 fail(end > start && end - start <= 86400000 && at >= start && at <= end, 'Timeline window must be ordered, at most 24 hours, and contain the default cursor.');
 fail(Array.isArray(config.lanes) && config.lanes.length > 0 && config.lanes.length <= 16, 'Author 1–16 timeline lanes.');
 const used = new Set(), features = new Map(scene.surfaces.features.map(feature => [feature.id, feature]));
 for (const lane of config.lanes) {
  fail(object(lane) && text(lane.id, 80) && text(lane.label, 256) && !used.has(lane.id), 'Timeline lane IDs and labels must be bounded and unique.'); used.add(lane.id);
  const base = ['id', 'label', 'kind'];
  if (lane.kind === 'context') {
   fail(fields(lane, [...base, 'statement', 'referenceHashes']) && text(lane.statement) && ids(lane.referenceHashes), 'Timeline context needs its statement and verified reference hashes.');
   fail(lane.referenceHashes.every(hash => scene.references.some(reference => reference.sha256 === hash)), 'Timeline context reference is unresolved.');
  } else if (lane.kind === 'qualification') fail(fields(lane, base), 'Unsupported qualification lane fields.');
  else if (lane.kind === 'observations') fail(fields(lane, [...base, 'entityIds']) && (lane.entityIds === undefined || ids(lane.entityIds)), 'Author bounded observation entity IDs.');
  else if (lane.kind === 'surfaces' || lane.kind === 'volumes') {
   fail(fields(lane, [...base, 'featureIds']) && ids(lane.featureIds), 'Timeline source features must be unique and explicit.');
   fail(lane.featureIds.every(id => features.has(id) && (features.get(id).properties.role === 'volume') === (lane.kind === 'volumes')), 'Timeline feature role or reference is unresolved.');
  } else fail(false, 'Unsupported source timeline lane kind.');
 }
}

function observationGroups(records, scene) {
 fail(Array.isArray(records) && records.length > 0 && records.length <= 3, 'Timeline needs admitted records.');
 const groups = new Map(), entities = new Set();
 for (const record of records) {
  fail(record.schema === 'evidence-inspection/v1' && Array.isArray(record.facts) && Array.isArray(record.entities) && Array.isArray(record.sources), 'Timeline needs admitted inspection records.');
  for (const entity of record.entities) { fail(!entities.has(entity.id), 'Timeline entity IDs collide across bundles.'); entities.add(entity.id); }
  for (const fact of record.facts.filter(fact => fact.kind === scene.roles.position)) {
   const entity = record.entities.find(entity => entity.id === fact.entity_id), source = record.sources.find(source => source.id === fact.source_id);
   fail(entity && source && /^[a-f0-9]{64}$/.test(source.sha256), 'Timeline observation attribution is unresolved.');
   utc(fact.observed_at);
   const key = JSON.stringify([entity.id, source.id]);
   if (!groups.has(key)) groups.set(key, { entity, source, facts: [] });
   groups.get(key).facts.push(fact);
  }
 }
 fail(entities.size <= 64, 'Timeline entity bound exceeded.');
 const ordered = [...groups.values()].sort((a, b) => a.entity.id.localeCompare(b.entity.id) || a.source.id.localeCompare(b.source.id));
 for (const group of ordered) {
  group.facts.sort((a, b) => utc(a.observed_at) - utc(b.observed_at) || a.id.localeCompare(b.id));
  for (let i = 1; i < group.facts.length; i++) {
   const previous = group.facts[i - 1], current = group.facts[i];
   fail(utc(previous.observed_at) !== utc(current.observed_at) || JSON.stringify(previous.value) === JSON.stringify(current.value), 'Conflicting positions at one source time cannot form a timeline.');
  }
 }
 return ordered;
}

/** A deterministic view for the existing transport. This module owns no clock. */
export function buildSourceGeospatialTimeline(scene, records, sourceKey, documentKey) {
 validateSourceGeospatialTimeline(scene);
 if (scene.timeline === undefined) return null;
 fail(text(sourceKey) && text(documentKey), 'Timeline requires exact source and document identities.');
 const config = scene.timeline, start = utc(config.window.startUtc), end = utc(config.window.endUtc), lanes = [];
 const groups = observationGroups(records, scene), selected = new Set();
 let itemCount = 0;
 const add = lane => { itemCount += lane.contexts.length + lane.events.length; fail(lanes.length < 128 && itemCount <= 8192, 'Timeline lane or item bound exceeded.'); lanes.push(lane); };
 const provenance = feature => ({ sourceId: feature.properties.sourceId, sourceHash: feature.properties.sourceHash, sourcePointer: feature.properties.sourcePointer });
 for (const authored of config.lanes) {
  const lane = { id: authored.id, label: authored.label, kind: authored.kind, contexts: [], events: [] };
  if (authored.kind === 'context') {
   lane.contexts = authored.referenceHashes.map((hash, i) => ({ id: `${authored.id}:${i}`, label: scene.references.find(r => r.sha256 === hash).label,
    status: 'reference-only', statement: authored.statement, sourceHash: hash }));
  } else if (authored.kind === 'qualification') lane.contexts = [{ id: authored.id, label: authored.label, status: scene.airspace.status, statement: scene.airspace.statement }];
  else if (authored.kind === 'surfaces') lane.contexts = authored.featureIds.map(id => {
   const feature = scene.surfaces.features.find(feature => feature.id === id);
   return { id, label: feature.properties.label, status: feature.properties.status || 'reference-only', statement: 'Source metadata only; no effective interval supplied.', ...provenance(feature) };
  });
  else if (authored.kind === 'volumes') {
   for (const id of authored.featureIds) {
    const feature = scene.surfaces.features.find(feature => feature.id === id), from = utc(feature.effective.fromUtc), to = utc(feature.effective.toUtc);
    if (to <= start || from >= end) lane.contexts.push({ id, label: feature.properties.label, status: 'outside-window', statement: `${canonical(feature.effective.fromUtc)} – ${canonical(feature.effective.toUtc)}`, ...provenance(feature) });
    else lane.events.push({ id, label: feature.properties.label, kind: 'effective', atUtc: canonical(feature.effective.fromUtc), toUtc: canonical(feature.effective.toUtc),
     startSeconds: (Math.max(start, from) - start) / 1000, endSeconds: (Math.min(end, to) - start) / 1000, status: 'declared-effective-interval', ...provenance(feature) });
   }
  } else if (authored.kind === 'observations') {
   const matching = groups.filter(group => !authored.entityIds || authored.entityIds.includes(group.entity.id));
   fail(!authored.entityIds || authored.entityIds.every(id => matching.some(group => group.entity.id === id)), 'Timeline observation entity has no position evidence.');
   for (const group of matching) {
    const identity = JSON.stringify([group.entity.id, group.source.id]); fail(!selected.has(identity), 'An observation source may belong to only one authored timeline lane.'); selected.add(identity);
    const row = { ...lane, id: JSON.stringify([authored.id, group.entity.id, group.source.id]), label: `${authored.label} · ${group.entity.label} · ${group.source.id}`, contexts: [], events: [] };
    let previous = null;
    for (const fact of group.facts) {
     const time = utc(fact.observed_at);
     fail(time >= start && time <= end, 'Authored timeline window must contain every selected observation.');
     const identity = { sourceId: group.source.id, sourceHash: group.source.sha256, sourcePointer: fact.evidence_ref };
     if (previous && time > utc(previous.observed_at)) {
      const from = utc(previous.observed_at), seconds = (time - from) / 1000;
      if (previous.value === null || seconds > scene.gapAfterSeconds) row.events.push({ id: `gap:${fact.id}`, label: previous.value === null ? 'Position unavailable until next sample' : `${seconds} s observation gap`,
       kind: 'gap', atUtc: canonical(previous.observed_at), toUtc: canonical(fact.observed_at), startSeconds: (from - start) / 1000, endSeconds: (time - start) / 1000, status: 'unobserved-interval', ...identity });
     }
     row.events.push({ id: fact.id, label: fact.value === null ? fact.null_reason : group.entity.label, kind: fact.value === null ? 'missing' : 'observation',
      atUtc: canonical(fact.observed_at), startSeconds: (time - start) / 1000, endSeconds: (time - start) / 1000, status: fact.value === null ? 'explicitly-unavailable' : 'observed-sample', ...identity });
     previous = fact;
    }
    if (!row.events.length) row.contexts.push({ id: row.id, label: group.entity.label, status: 'unavailable', statement: 'No position observations supplied.' });
    add(row);
   }
   if (!matching.length) { lane.contexts.push({ id: authored.id, label: authored.label, status: 'unavailable', statement: 'No position observations supplied.' }); add(lane); }
   continue;
  }
  add(lane);
 }
 const result = { schema: 'source-geospatial-timeline/v1', documentKey, sourceKey, title: config.title,
  startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString(), durationSeconds: (end - start) / 1000, lanes };
 fail(new TextEncoder().encode(JSON.stringify(result)).byteLength <= 2000000, 'Timeline exceeds its 2,000,000-byte bound.');
 return freeze(result);
}
