import { register } from 'node:module'

// Node has no CSS renderer. Verify asset existence, then leave visual assertions
// to browser/build checks. Register before dynamically importing React surfaces.
register(`data:text/javascript,${encodeURIComponent(`
  import { readFileSync } from 'node:fs';
  export function load(url, context, nextLoad) {
    if (url.startsWith('file:') && new URL(url).pathname.endsWith('.css')) {
      readFileSync(new URL(url));
      return { format: 'module', shortCircuit: true, source: 'export {};' };
    }
    return nextLoad(url, context);
  }
`)}`, import.meta.url)
