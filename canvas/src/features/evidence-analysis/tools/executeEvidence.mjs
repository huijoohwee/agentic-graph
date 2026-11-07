import { findEvidenceOperation, validateEvidenceArguments } from './evidenceCatalog.mjs';
import { readAuthoredEvidenceConfig } from './authoredCatalog.mjs';
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const failure = (code, message, path = '') => ({ ok: false, error: { code, message, path } });
const role = operation => operation.startsWith('aviation.') ? 'record' : operation.split('.')[0];

export async function executeEvidence(name, supplied) {
  const definition = findEvidenceOperation(name);
  if (!definition) return failure('TOOL', 'Unknown evidence operation.', 'operation');
  const invalid = validateEvidenceArguments(definition, supplied);
  if (invalid) return invalid;
  // Snapshot arrays and strings before imports/hashing; callers cannot replace a pending request.
  const args = { ...supplied, ...(supplied.bundles ? { bundles: [...supplied.bundles] } : {}) };
  try {
    const texts = args.bundles || [args.bundle ?? args.notice];
    let remaining = 2_000_000;
    const bytes = [];
    const limit = () => failure('LIMIT', 'Combined original inputs exceed 2,000,000 UTF-8 bytes.', 'bundles');
    for (const text of texts) {
      // UTF-16 length is a lower bound on UTF-8 bytes. Reject before allocating
      // this input when it cannot fit, and never encode a later input on failure.
      if (text.length > remaining) return limit();
      const value = encoder.encode(text);
      if (value.byteLength > remaining) return limit();
      if (decoder.decode(value) !== text) throw Object.assign(new Error('Inputs must contain valid Unicode.'), { code: 'INPUT', path: 'bundle' });
      remaining -= value.byteLength; bytes.push(value);
    }
    const profile = await readAuthoredEvidenceConfig(args.profileId);
    const kernel = await import('../core/evidence-kernel.mjs');
    const operation = definition.operation;
    if (operation === 'notice.triage') {
      const { triageNotice } = await import('../core/notice-triage.mjs');
      return await triageNotice(bytes[0], args.atUtc, await readAuthoredEvidenceConfig(args.policyId), profile, await readAuthoredEvidenceConfig(args.viewId));
    }
    if (operation === 'arrival.evaluate') {
      const { analyzeArrivals } = await import('../core/arrival-analysis.mjs');
      const handles = [];
      for (const value of bytes) handles.push(await kernel.admit(value, profile));
      return analyzeArrivals(handles, await readAuthoredEvidenceConfig(args.policyId));
    }
    const handle = await kernel.admit(bytes[0], profile);
    if (operation === 'aviation.inspect') return kernel.inspect(handle);
    if (operation === 'aviation.source') return kernel.sourceEvidence(handle, args.factId);
    if (operation === 'aviation.export') {
      const pack = await kernel.exportPack(handle);
      const { digest } = await import('../core/contracts.mjs');
      return { schema: 'evidence-export/v1', text: decoder.decode(pack), byteLength: pack.byteLength,
        sha256: await digest(pack), profile: kernel.inspect(handle).profile, derivedHash: handle.identity.derivedSha256 };
    }
    if (operation === 'aviation.replay') return (await import('../core/evidence-replay.mjs')).replay(handle, args.entityId, args.atUtc);
    if (operation === 'volume.project') return (await import('../core/volume-project.mjs')).projectVolume(handle, args.entityId, args.atUtc, await readAuthoredEvidenceConfig(args.viewId));
    if (operation === 'route.benchmark') return (await import('../core/route-benchmark.mjs')).benchmarkRoute(handle, args.entityId, await readAuthoredEvidenceConfig(args.policyId));
    return failure('TOOL', 'Unsupported evidence operation.', 'operation');
  } catch (error) {
    return failure(typeof error?.code === 'string' ? error.code : 'EVIDENCE', error instanceof Error ? error.message : 'Evidence evaluation failed.', typeof error?.path === 'string' ? error.path : '');
  }
}

// Browser documents select authored IDs explicitly; transports can supply the same IDs directly.
export async function dispatchEvidence(operation, args, config) {
  const kind = role(operation), profileRole = kind === 'notice' ? 'volume' : kind;
  const selected = { profileId: config?.profiles?.[profileRole] };
  if (['arrival', 'route', 'notice'].includes(kind)) selected.policyId = config?.policies?.[kind];
  if (['volume', 'notice'].includes(kind)) selected.viewId = config?.policies?.volume;
  for (const key of Object.keys(selected)) {
    if (typeof selected[key] !== 'string') return failure('CONFIG', 'The source document must select an authored profile and policy.', key);
    if (Object.hasOwn(args || {}, key) && args[key] !== selected[key]) return failure('CONFIG', 'Invocation configuration conflicts with its source document.', key);
  }
  return executeEvidence(operation, { ...args, ...selected });
}

export async function invokeEvidenceCommand(invocation, args) {
  const match = typeof invocation === 'string' && /^\/([a-z]+\.[a-z]+) @evidence #evidence$/.exec(invocation);
  if (!match || !findEvidenceOperation(match[1])) return failure('GRAMMAR', 'Use an exact declared /operation @evidence #evidence invocation.', 'invocation');
  return executeEvidence(match[1], args);
}
