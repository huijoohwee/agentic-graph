import { getKgTokenFallback, type KgTheme, type KgTokenDef } from '../../../grph-shared/src/ui/kgTokens'

// Project only the shared tokens this server-rendered surface consumes.
const palette: KgTokenDef['cssVar'][] = [
  '--kg-app-bg', '--kg-surface-bg', '--kg-panel-bg-hover', '--kg-divider',
  '--kg-text-primary', '--kg-text-secondary', '--kg-canvas-accent',
]
const theme = (mode: KgTheme) => palette.map(name => `${name}:${getKgTokenFallback(name, mode)}`).join(';')

export const storageAuthPageStyles = `
:root{color-scheme:light dark;${theme('light')};
  --auth-space-xs:.5rem;--auth-space-sm:.75rem;--auth-space-md:1rem;
  --auth-space-lg:1.5rem;--auth-space-xl:2rem;--auth-space-2xl:3rem;
  --auth-width:28rem;--auth-page-top:clamp(3rem,9vh,6rem);--auth-radius:.5rem;
  --auth-border:1px;--auth-focus-width:2px;--auth-focus-offset:4px;
  --auth-action-height:3rem;--auth-logo-size:2rem;
  --auth-font:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --auth-text:1rem;--auth-small:.875rem;--auth-title:2rem;--auth-leading:1.6;
  --auth-heading-leading:1.2;--auth-weight:500;--auth-strong:600}
@media(prefers-color-scheme:dark){:root{${theme('dark')}}}
*{box-sizing:border-box}
body{margin:0;min-block-size:100svh;background:var(--kg-app-bg);color:var(--kg-text-primary);
  font:var(--auth-text)/var(--auth-leading) var(--auth-font)}
.kg-auth{inline-size:100%;max-inline-size:calc(var(--auth-width) + var(--auth-space-xl));
  margin-inline:auto;padding:var(--auth-page-top) var(--auth-space-md) var(--auth-space-2xl)}
.kg-auth-brand{display:flex;align-items:center;gap:var(--auth-space-xs);
  margin-block-end:var(--auth-space-xl);font-weight:var(--auth-strong)}
.kg-auth-brand svg{inline-size:var(--auth-logo-size);block-size:var(--auth-logo-size)}
h1{margin:0;font-size:var(--auth-title);font-weight:var(--auth-strong);line-height:var(--auth-heading-leading)}
p{margin:0;color:var(--kg-text-secondary)}
.kg-auth-intro{margin-block-start:var(--auth-space-sm)}
.kg-auth-providers{display:grid;gap:var(--auth-space-sm);margin-block:var(--auth-space-xl)}
.kg-auth-action{display:flex;align-items:center;justify-content:center;inline-size:100%;
  min-block-size:var(--auth-action-height);padding:var(--auth-space-sm) var(--auth-space-md);
  border:var(--auth-border) solid var(--kg-divider);border-radius:var(--auth-radius);
  background:var(--kg-surface-bg);color:var(--kg-text-primary);font:inherit;
  font-weight:var(--auth-weight);text-decoration:none;cursor:pointer;text-align:center}
.kg-auth-action:hover{background:var(--kg-panel-bg-hover);border-color:var(--kg-text-secondary)}
a{color:inherit;text-underline-offset:var(--auth-border)}
a:focus-visible,button:focus-visible{outline:var(--auth-focus-width) solid var(--kg-canvas-accent);
  outline-offset:var(--auth-focus-offset)}
.kg-auth-note{font-size:var(--auth-small)}
.kg-auth-footer{display:grid;justify-items:center;gap:var(--auth-space-xs);margin-block-start:var(--auth-space-xl);
  padding-block-start:var(--auth-space-lg);border-block-start:var(--auth-border) solid var(--kg-divider);text-align:center}
.kg-auth-return{display:inline-flex;align-items:center;min-block-size:var(--auth-action-height)}
.kg-auth-linking{margin-block-start:var(--auth-space-xl)}
.kg-auth-linking h2{font-size:var(--auth-text);font-weight:var(--auth-strong);margin:0}
.kg-auth-linking .kg-auth-providers{margin-block:var(--auth-space-md)}
`
