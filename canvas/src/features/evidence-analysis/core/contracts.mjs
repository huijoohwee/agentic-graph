// Portable evidence byte boundary; no host, scenario, or transport ownership.
export const MAX_BYTES = 499999;
export async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
