import { EVIDENCE_OPERATIONS } from './evidenceCatalog.mjs';
import { executeEvidence, invokeEvidenceCommand } from './executeEvidence.mjs';
// Existing Node host, stdin JSON arguments, stdout JSON result; no network or server.
const [operation, ...extra] = process.argv.slice(2);
if (operation === '--list' && extra.length === 0) process.stdout.write(JSON.stringify(EVIDENCE_OPERATIONS) + '\n');
else {
  let result;
  try {
    if (!operation || extra.length) throw new Error('Supply one operation name or quoted invocation and JSON arguments on stdin.');
    const parts = []; let size = 0;
    for await (const part of process.stdin) {
      size += part.length;
      if (size > 12_010_000) throw new Error('CLI request exceeds its JSON framing byte limit.');
      parts.push(part);
    }
    const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)));
    result = operation.startsWith('/') ? await invokeEvidenceCommand(operation, input) : await executeEvidence(operation, input);
  } catch (error) { result = { ok: false, error: { code: 'INPUT', message: error.message, path: 'stdin' } }; }
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.ok === false) process.exitCode = 1;
}
