import { parseKgColor, type KgTokenBundle, type KgTheme } from '@/lib/ui/tokens-ssot'
import type { DesignTokenSummary } from './designTokenSummary'

export type DesignFinding = {
  rule: 'token-reference' | 'token-value' | 'declared-contrast'
  severity: 'error' | 'warning' | 'unassessed'
  nodeId: string
  path: string
  evidence: string
  action: string
}
const sameValue = (left: string, right: string) => {
  const a = parseKgColor(left), b = parseKgColor(right)
  return a && b ? a.every((v, i) => v === b[i]) : left.trim() === right.trim()
}
const luminance = (color: number[]) => color.slice(0, 3).map(v => v / 255)
  .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)

/** Review declared values only. This is not an attestation of rendered accessibility. */
export function auditDesignTokens(summary: DesignTokenSummary, bundle: KgTokenBundle, theme: KgTheme) {
  const findings: DesignFinding[] = []
  let findingCount = 0, checked = 0, unassessed = 0, violations = 0
  const add = (finding: DesignFinding) => {
    findingCount += 1
    if (finding.severity === 'unassessed') unassessed += 1
    else violations += 1
    if (findings.length < 100) findings.push(finding)
  }
  const tokens = new Map(bundle.tokens.map(t => [t.name, t]))
  const byVariable = new Map(bundle.tokens.map(t => [t.cssVar as string, t]))
  const values = new Map(summary.observations.map(o => [`${o.nodeId}\0${o.path}`, o.value]))
  const matches: Array<{ nodeId: string; path: string; value: string; tokens: string[] }> = []
  const resolveColor = (raw: unknown) => {
    const text = String(raw ?? '')
    const variable = /^var\((--kg-[a-z0-9-]+)\)$/.exec(text)
    return variable ? byVariable.get(variable[1])?.[theme] ?? text : text
  }
  for (const observation of summary.observations) {
    const { nodeId, path, value } = observation
    if (path.startsWith('properties.designTokens.')) {
      const property = `properties.${path.slice('properties.designTokens.'.length)}`
      const token = tokens.get(String(value))
      const actual = values.get(`${nodeId}\0${property}`)
      if (!token) {
        checked += 1
        add({ rule: 'token-reference', severity: 'error', nodeId, path,
          evidence: `Unknown authored token: ${value}`, action: 'Choose a token from the authored list.' })
      } else if (actual === undefined) {
        add({ rule: 'token-value', severity: 'unassessed', nodeId, path: property,
          evidence: 'The bound property was not observed.', action: 'Inspect the source property and scan limits.' })
      } else {
        checked += 1
        if (!sameValue(resolveColor(actual), token[theme])) add({ rule: 'token-value', severity: 'warning', nodeId, path: property,
          evidence: `${actual} differs from ${token.name} (${token[theme]}) in ${theme}.`,
          action: 'Review the explicit binding before changing the source value.' })
      }
      continue
    }
    const valueText = String(value)
    if (valueText.startsWith('var(')) {
      const variable = /^var\((--kg-[a-z0-9-]+)\)$/.exec(valueText)
      if (!variable) add({ rule: 'token-reference', severity: 'unassessed', nodeId, path,
        evidence: 'The observed CSS expression is outside the review subset.', action: 'Inspect computed browser styles.' })
      else {
        checked += 1
        if (!byVariable.has(variable[1])) add({ rule: 'token-reference', severity: 'error', nodeId, path,
          evidence: `Unknown shared variable: ${variable[1]}`, action: 'Choose an authored token or declare a local value.' })
      }
    }
    if (/color|fill|stroke|background|border|radius|height|width|gap/i.test(path)) {
      const matching = bundle.tokens.filter(t => sameValue(resolveColor(value), t[theme])).map(t => t.name)
      if (matching.length && matches.length < 24) matches.push({ nodeId, path, value: valueText, tokens: matching })
    }
    if (!/(?:^|\.)(?:color|textColor)$/.test(path)) continue
    const parent = path.slice(0, path.lastIndexOf('.') + 1)
    const background = values.get(`${nodeId}\0${parent}backgroundColor`) ?? values.get(`${nodeId}\0${parent}background`)
    const opacity = values.get(`${nodeId}\0${parent}opacity`)
    const foregroundColor = parseKgColor(resolveColor(value)), backgroundColor = parseKgColor(resolveColor(background))
    if (!foregroundColor || !backgroundColor || foregroundColor[3] !== 1 || backgroundColor[3] !== 1 || opacity !== 1) {
      add({ rule: 'declared-contrast', severity: 'unassessed', nodeId, path,
        evidence: 'An opaque declared foreground/background pair with opacity: 1 is required.',
        action: 'Inspect computed colors, ancestor opacity and the actual rendered text.' })
      continue
    }
    checked += 1
    const a = luminance(foregroundColor), b = luminance(backgroundColor)
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    if (ratio < 4.5) add({ rule: 'declared-contrast', severity: 'warning', nodeId, path,
      evidence: `Declared normal-text contrast ${ratio.toFixed(2)}:1 is below 4.5:1.`,
      action: 'Review this pair in the rendered interface before changing source tokens.' })
  }
  return {
    status: checked === 0 ? 'unassessed' : violations > 0 ? 'findings' : 'checked',
    checked, unassessed, findingCount, findings, matches,
    truncated: summary.truncated || findingCount > findings.length,
    scope: 'declared-properties-only; browser layout, hierarchy, focus and motion require observation',
  }
}
