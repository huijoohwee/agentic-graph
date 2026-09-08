import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PRIMARY_SURFACE_NAME = /^(?:App|Root|[A-Z].*(?:View|Panel|Canvas|Page|Surface))$/
const SKIPPED_DIRS = new Set(['__tests__', 'tests', 'node_modules', 'dist', 'build', 'coverage'])
type Violation = { component: string; line: number }

// The policy permits layout-only wrappers. This bounded source guard checks the
// direct render roots of named primary surfaces; export/render integration tests
// separately cover generated HTML. Test strings and vendor bundles are not UI.
function findGenericPrimarySurfaceRoots(text: string, filename: string): Violation[] {
  if (!/<div\b/.test(text)) return []
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const violations: Violation[] = []
  const componentName = (node: ts.FunctionLikeDeclaration): string => {
    if (node.name && ts.isIdentifier(node.name)) return node.name.text
    let parent: ts.Node | undefined = node.parent
    while (parent && (ts.isCallExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent))) parent = parent.parent
    if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text
    return parent && ts.isExportAssignment(parent) ? path.basename(filename, '.tsx') : ''
  }
  const inspectRoot = (node: ts.Node | undefined, component: string): void => {
    if (!node) return
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return inspectRoot(node.expression, component)
    if (ts.isConditionalExpression(node)) {
      inspectRoot(node.whenTrue, component); inspectRoot(node.whenFalse, component); return
    }
    if (ts.isBinaryExpression(node)) {
      inspectRoot(node.left, component); inspectRoot(node.right, component); return
    }
    if (ts.isJsxExpression(node)) return inspectRoot(node.expression, component)
    if (ts.isJsxFragment(node)) {
      node.children.forEach(child => inspectRoot(child, component)); return
    }
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return
    const opening = ts.isJsxElement(node) ? node.openingElement : node
    const tag = opening.tagName.getText(source)
    if (tag === 'div') violations.push({ component, line: source.getLineAndCharacterOfPosition(opening.getStart(source)).line + 1 })
    if (ts.isJsxElement(node) && (['Fragment', 'React.Fragment', 'Suspense', 'React.Suspense'].includes(tag) || tag.endsWith('.Provider'))) {
      node.children.forEach(child => inspectRoot(child, component))
    }
  }
  const isFunction = (node: ts.Node): node is ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction =>
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
  const visit = (node: ts.Node): void => {
    if (isFunction(node) && node.body) {
      const name = componentName(node)
      if (PRIMARY_SURFACE_NAME.test(name)) {
        const body = node.body
        const findReturns = (candidate: ts.Node): void => {
          if (candidate !== body && isFunction(candidate)) return
          if (ts.isReturnStatement(candidate)) return inspectRoot(candidate.expression, name)
          ts.forEachChild(candidate, findReturns)
        }
        if (ts.isBlock(body)) findReturns(body)
        else inspectRoot(body, name)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

function assertPrimarySurfaceGuardBehavior(): void {
  const cases: Array<[string, string, number]> = [
    ['function PaymentView() { return <main><div className="row" /></main> }', 'PaymentView.tsx', 0],
    ['function TestPanel() { return <div /> }', 'TestPanel.tsx', 1],
    ['const TestPanel = React.memo(() => <div />)', 'TestPanel.tsx', 1],
    ['export default () => <div />', 'CheckoutPage.tsx', 1],
    ['function TestView() { return ready ? <section /> : <div /> }', 'TestView.tsx', 1],
    ['function TestView() { return <Context.Provider value={0}><><div /></></Context.Provider> }', 'TestView.tsx', 1],
    ['function TestView() { return <section>{items.map(item => <div key={item} />)}</section> }', 'TestView.tsx', 0],
    ['function TestView() { const renderRow = () => <div />; return <section>{renderRow()}</section> }', 'TestView.tsx', 0],
    ['const example = "function TestPanel() { return <div /> }"', 'Example.tsx', 0],
    ['function LayoutRow() { return <div /> }', 'LayoutRow.tsx', 0],
  ]
  for (const [text, filename, count] of cases) assert.equal(findGenericPrimarySurfaceRoots(text, filename).length, count, filename + ': ' + text)
}

export function testRepoSourcesForbidGenericDivisionMarkup() {
  assertPrimarySurfaceGuardBehavior()
  const violations: string[] = []
  let filesRead = 0; let bytesRead = 0; let parsedFiles = 0
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (SKIPPED_DIRS.has(entry.name)) continue
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) { visit(filename); continue }
      if (!entry.isFile() || !filename.endsWith('.tsx')) continue
      const text = readFileSync(filename, 'utf8')
      filesRead += 1; bytesRead += Buffer.byteLength(text)
      if (/<div\b/.test(text)) parsedFiles += 1
      for (const result of findGenericPrimarySurfaceRoots(text, filename)) {
        violations.push(`${path.relative(SOURCE_ROOT, filename)}:${result.line} ${result.component} uses a generic primary surface root`)
      }
    }
  }
  visit(SOURCE_ROOT)
  if (process.env.AG_TEST_PROFILE_SOURCE_SCAN === '1') console.log('SEMANTIC_SURFACE_SCAN ' + JSON.stringify({ filesRead, bytesRead, parsedFiles }))
  assert.equal(violations.length, 0, `Expected authored primary surfaces to use semantic containers; layout wrappers remain permitted:\n${violations.join('\n')}`)
}
