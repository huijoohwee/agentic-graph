import { looksLowFidelityWebpageMarkdown, looksSyntheticWebpageArtifactMarkdown } from '@/lib/websites/webpageClientConvert'

export function testWebpageClientConvertQualityGateDetectsSyntheticArtifactMarkers() {
  const synthetic = [
    '# Title',
    '',
    '## 📋 TABLE OF CONTENTS',
    '',
    '### Icons',
    '',
    '## 🗂️ ASSET CATALOG',
    '',
    '**Fidelity Level:** 100% Source-Faithful (No Invented Content)',
    '',
  ].join('\n')
  if (!looksSyntheticWebpageArtifactMarkdown(synthetic)) {
    throw new Error('expected synthetic artifact markdown to be detected')
  }
}

export function testWebpageClientConvertQualityGateDoesNotFlagNormalMarkdown() {
  const normal = [
    '# Canvas Studio',
    '',
    '| [Studio Home](/) | [Downloads](/downloads) | [Pricing](/pricing) | [Prompt Gallery](/gallery) | [Docs](/docs) | [Download Studio](/download) |',
    '| --- | --- | --- | --- | --- | --- |',
    '',
    'Backed by',
    '',
    'Dream on canvas.',
    'Land in code.',
    '',
  ].join('\n')
  if (looksSyntheticWebpageArtifactMarkdown(normal)) {
    throw new Error('expected normal markdown not to be flagged as synthetic')
  }
  if (looksLowFidelityWebpageMarkdown(normal)) {
    throw new Error('expected normal markdown not to be flagged as low fidelity')
  }
}

export function testWebpageClientConvertQualityGateDetectsLoadingShellMarkdown() {
  const shell = [
    '# Shared Chat - Example',
    '',
    '[Get App](https://example.com/app) [Open App](https://example.com/open)',
    '',
    'Loading shared chat...',
    '',
    '[Sign in](https://example.com/sign-in) [Install App](https://example.com/install)',
    '',
  ].join('\n')
  if (!looksLowFidelityWebpageMarkdown(shell)) {
    throw new Error('expected loading-shell markdown to be rejected by the quality gate')
  }
}

export function testWebpageClientConvertQualityGateDetectsBareLoadingIframeShell() {
  const shell = [
    'Loading...',
    '',
    '<iframe height="1" width="1" style="position:absolute;visibility:hidden"></iframe>',
  ].join('\n')
  if (!looksLowFidelityWebpageMarkdown(shell)) {
    throw new Error('expected bare loading iframe shell markdown to be rejected by the quality gate')
  }
}

export function testWebpageClientConvertQualityGateDetectsHtmlHeavyLoadingChrome() {
  const shortcutChrome = Array.from(
    { length: 18 },
    (_, index) => `<a href="/shortcut-${index + 1}">Open App Shortcut ${index + 1}</a>`,
  ).join('')
  const shell = [
    '<main>',
    '<header><a href="/app">Get App</a><a href="/open">Open App</a><a href="/website">Visit Website</a><a href="/signin">Sign in</a><a href="/install">Install App</a></header>',
    '<section>',
    '<h1>Shared Conversation</h1>',
    '<p>Loading shared chat...</p>',
    `<nav>${shortcutChrome}</nav>`,
    '</section>',
    '</main>',
  ].join('\n')
  if (!looksLowFidelityWebpageMarkdown(shell)) {
    throw new Error('expected html-heavy loading chrome to be rejected by the quality gate')
  }
}

export function testWebpageClientConvertQualityGateDetectsConnectionErrorShellMarkdown() {
  const shell = [
    '# Claude',
    '',
    "[source](https://claude.ai/chat/6706219f-f8d2-418a-90a9-aae18de752a7)",
    '',
    '## Can\'t reach Claude',
    '',
    '### Check your connection.',
    '',
    'Try again',
  ].join('\n')
  if (!looksLowFidelityWebpageMarkdown(shell)) {
    throw new Error('expected connection-error shell markdown to be rejected by the quality gate')
  }
}

export function testWebpageClientConvertQualityGateDetectsCookieConsentWallMarkdown() {
  const shell = [
    'We use cookies and similar tools ("cookies") for the following purposes.',
    '',
    '### Essential',
    'Essential cookies are necessary to provide our site and services and cannot be deactivated.',
    'Allowed',
    '',
    '### Performance',
    'Performance cookies provide anonymous statistics about how customers navigate our site so we can improve site experience and performance.',
    'Allowed',
    '',
    '### Functional',
    'Functional cookies help us provide useful site features, remember your preferences, and display relevant content.',
    'Allowed',
    '',
    '### Advertising',
    'Advertising cookies may be set through our site by us or our advertising partners and help us deliver relevant marketing content.',
  ].join('\n')
  if (!looksLowFidelityWebpageMarkdown(shell)) {
    throw new Error('expected cookie-consent wall markdown to be rejected by the quality gate')
  }
}
