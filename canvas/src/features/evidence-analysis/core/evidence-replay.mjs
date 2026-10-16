import { canonicalJson, comparisonValue, EvidenceError, normalizedValue, readEvidence, utcMillis } from './evidence-kernel.mjs';

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// A query has no implicit clock, interpolation, source preference, or missing-data repair.
export function replay(handle, entityId, atUtc) {
  const data = readEvidence(handle), query = utcMillis(atUtc);
  const entity = data.derived.entities.find(item => item.id === entityId);
  if (!entity) throw new EvidenceError('ENTITY', 'Select an admitted entity.', 'entityId');
  const facts = data.derived.facts.filter(fact => fact.entity_id === entityId && utcMillis(fact.observed_at) <= query);
  const gaps = [];
  const fields = data.profile.fields.map(field => {
    const candidates = facts.filter(fact => fact.kind === field.key), sourceTimes = new Map();
    for (const fact of candidates) {
      const times = sourceTimes.get(fact.source_id) || [];
      const millis = utcMillis(fact.observed_at);
      if (times.at(-1) !== millis) times.push(millis);
      sourceTimes.set(fact.source_id, times);
    }
    for (const [sourceId, times] of sourceTimes) {
      const endpoints = times.at(-1) < query ? [...times, query] : times;
      for (let index = 1; index < endpoints.length; index += 1) {
        const durationSeconds = (endpoints[index] - endpoints[index - 1]) / 1000;
        if (durationSeconds > data.profile.gapAfterSeconds) gaps.push({ kind: field.key, sourceId,
          fromUtc: new Date(endpoints[index - 1]).toISOString(), toUtc: new Date(endpoints[index]).toISOString(), durationSeconds });
      }
    }
    // Keep all records tied at each source's newest observation: an ID never breaks a conflict.
    const selected = candidates.filter(fact => utcMillis(fact.observed_at) === sourceTimes.get(fact.source_id).at(-1));
    const ageSeconds = selected.length ? Math.max(...selected.map(fact => (query - utcMillis(fact.observed_at)) / 1000)) : null;
    const values = selected.map(fact => ({ factId: fact.id, sourceId: fact.source_id, value: normalizedValue(fact, field),
      unit: field.canonicalUnit, datum: fact.datum, null_reason: fact.null_reason }));
    const distinct = new Set(selected.map(fact => canonicalJson({ value: comparisonValue(fact, field), unit: field.canonicalUnit, datum: fact.datum })));
    return { kind: field.key, label: field.label, facts: selected, values,
      missing: selected.length === 0 || selected.every(fact => fact.value === null),
      stale: ageSeconds !== null && ageSeconds > data.profile.staleAfterSeconds,
      ageSeconds, conflict: distinct.size > 1 };
  });
  return freeze({ schema: 'evidence-replay/v1', profile: data.derived.profile, algorithm: data.derived.algorithm,
    identity: data.identity, entity, atUtc, fields, facts, gaps,
    cost: { modelCalls: 0, billedApiCalls: 0, estimatedCost: 0 } });
}
