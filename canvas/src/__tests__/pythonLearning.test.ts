import test from 'node:test'
import { resolveMarkdownWorkspaceDocumentPanePreset, resolveMarkdownWorkspaceInitialPaneVisibility, resolveMarkdownWorkspacePaneAvailability } from '../features/markdown-workspace/main/types'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { PythonEvaluator } from '../features/python-learning/pythonEvaluator'
import { parseLearningPython } from '../features/python-learning/pythonParser'
import { PYTHON_LIMITS } from '../features/python-learning/pythonModel'
import { LearningSimulation } from '../features/python-learning/learningSimulation'
import { LEARNING_LESSONS, gradeLearningLesson } from '../features/python-learning/learningLessons'

async function execute(source: string) {
  const runtime = new PythonEvaluator(source, { call: async name => { throw new Error(`Unexpected capability ${name}`) } })
  const spans = []
  for await (const span of runtime.run()) spans.push(span)
  return { output: runtime.output.join(''), variables: runtime.inspectVariables(), spans }
}
// Only these authored fixtures run in the host oracle; learner input never reaches a host process.
const fixtures = [
  'print(1 + 2 * 3, (1 + 2) * 3, -7 // 3, -7 % 3, 7 // -3, 7 % -3)',
  'print(5 / 2, 6 / 3, 1.0 + 2, True + 3, -0.0, 1e-5, 1e16)',
  'print(1.0 // 0.1, -1.0 // 0.1, 1.0 % -0.1, -1.0 % 0.1)',
  'print(9007199254740993 / 3, 100000000000000000000000000000 / 7)',
  'print(not 1 == 2, not False and True, 0 or 7, "yes" and 3, 1 < 2 < 3, 2 < 1 < 3)',
  'print(9007199254740993 > 9007199254740992.0, True == 1, None == False, "😀" > "\\ue000")',
  'print("a" * 3, -2 * "b", "go" + "al", "\\u03c0", "\\n", "a\\tb")',
  'print(abs(-3), abs(-2.5), min(4, 2, 7), max(4, 2, 7))',
  'total = 0\nfor i in range(5, -2, -2):\n    total = total + i\nprint(total, i)',
  'n = 0\nwhile n < 10:\n    n = n + 1\n    if n == 2:\n        continue\n    elif n == 5:\n        break\n    else:\n        print(n)\nprint(n)',
  'x = 7\ndef add(y):\n    z = x + y\n    return z\nprint(add(3), x)',
  'def f(n):\n    for i in range(n):\n        if i == 2:\n            return i\n    return None\nprint(f(1), f(5))',
  'def f():\n    print("once")\n    return 2\nprint(1 < f() < 3, False and missing(), True or missing())',
  'r = range(0)\nprint(r == range(2, 1), range(0, 3, 2) == range(0, 4, 2), print == print)',
  'a = 1\na = 2\nprint(a) # comment\npass',
]
test('supported procedural semantics agree with the exact local Python oracle', async t => {
  t.diagnostic(execFileSync('python3', ['--version'], { encoding: 'utf8' }).trim())
  for (const fixture of fixtures) {
    const expected = execFileSync('python3', ['-I', '-c', fixture], { encoding: 'utf8', timeout: 2000 })
    assert.equal((await execute(fixture)).output, expected, fixture)
  }
})
test('Python binding, arity and arithmetic errors remain visible', async () => {
  for (const [source, error] of [
    ['print(x)\nx = 1', /NameError/],
    ['x = 1\ndef f():\n    print(x)\n    x = 2\nf()', /UnboundLocalError/],
    ['print(1 / 0)', /ZeroDivisionError/], ['print(1 + "x")', /TypeError/],
    ['print = 3\nprint(1)', /not callable/], ['def f(x):\n    return x\nf()', /expects 1/],
    ['range(1, 4, 0)', /cannot be zero/],
  ] as const) await assert.rejects(execute(source), error)
})
test('unsupported syntax cannot acquire host capabilities or silently change semantics', async () => {
  for (const source of ['import os', 'open("x")', 'fetch("https://example.invalid")', '__import__("os")',
    'print.__class__', 'x = [1, 2]', 'x = {"a": 1}', 'print(2 ** 8)', 'class X:\n    pass',
    'def f():\n    def g():\n        pass', 'break', 'return 1', 'x = 1; print(x)',
    'x = 1 + not True', 'x = True == not False', 'def f(x, x):\n    pass', 'x = 0123']) {
    await assert.rejects(execute(source), Error, source)
  }
})
test('all declared resource boundaries stop runaway work', async () => {
  for (const source of ['while True:\n    pass', 'def f():\n    return f()\nf()', 'x = "a" * 1000000000000000000',
    'x = 2\nwhile True:\n    x = x * x', 'for x in range(1000000):\n    print("a" * 4096)',
    Array.from({ length: 260 }, (_, i) => `v${i} = ${i}`).join('\n')]) await assert.rejects(execute(source), /limit|exceed|Recursive/i)
  assert.throws(() => parseLearningPython('x'.repeat(PYTHON_LIMITS.sourceBytes + 1)), /32 KiB/)
  assert.throws(() => parseLearningPython('x = ' + '9'.repeat(310)), /Integer literal limit/)
  assert.throws(() => parseLearningPython('x = ' + '('.repeat(40) + '1' + ')'.repeat(40)), /nesting limit/)
})
test('actual AST depth includes left-associative expressions and their enclosing statements', () => {
  const sum = (count: number) => Array(count).fill('1').join(' + ')
  const depth = PYTHON_LIMITS.parseDepth
  for (const [accepted, rejected] of [
    [`value = ${sum(depth - 1)}`, `value = ${sum(depth)}`],
    [`if True:\n    value = ${sum(depth - 2)}`, `if True:\n    value = ${sum(depth - 1)}`],
    [`value = ${'abs('.repeat(depth - 2)}1${')'.repeat(depth - 2)}`, `value = ${'abs('.repeat(depth - 1)}1${')'.repeat(depth - 1)}`],
  ]) {
    assert.doesNotThrow(() => parseLearningPython(accepted))
    assert.throws(() => parseLearningPython(rejected), { code: 'limit-exceeded', message: 'AST depth limit.' })
  }
  assert.throws(() => new PythonEvaluator(`drive(1, 1)\nvalue = ${sum(40)}`, {
    call: async () => assert.fail('Invalid AST must be rejected before any simulation capability is invoked.'),
  }), { code: 'limit-exceeded', message: 'AST depth limit.' })
})
test('three original lessons pass, incorrect starters fail, seeded repeat and stepping agree', async () => {
  for (const lesson of LEARNING_LESSONS) {
    const outcomes: string[] = []
    for (let repetition = 0; repetition < 3; repetition++) {
      const simulation = new LearningSimulation(lesson), evaluator = new PythonEvaluator(lesson.solution, simulation)
      const iterator = evaluator.run()
      while (!(await iterator.next()).done) { /* Same source stepping path used by the worker. */ }
      const snapshot = simulation.snapshot()
      assert.equal(gradeLearningLesson(lesson, snapshot, evaluator.metrics, true).passed, true)
      outcomes.push(JSON.stringify({ snapshot, trace: simulation.trace, output: evaluator.output }))
      assert.ok(JSON.stringify(simulation.trace).length < PYTHON_LIMITS.traceBytes)
      assert.equal((simulation.inspectWorld() as any).entities[0].components.LearningPose.ticks, snapshot.ticks)
      simulation.dispose(); simulation.dispose(); assert.throws(() => simulation.snapshot(), /disposed/)
    }
    assert.equal(outcomes[0], outcomes[1]); assert.equal(outcomes[1], outcomes[2])
    const simulation = new LearningSimulation(lesson), evaluator = new PythonEvaluator(lesson.starter, simulation)
    for await (const span of evaluator.run()) { assert.ok(span.line > 0) }
    assert.equal(gradeLearningLesson(lesson, simulation.snapshot(), evaluator.metrics, true).passed, false)
    simulation.dispose()
  }
})
test('native physics supplies collision/sensor truth and enforces simulation inputs', async () => {
  const simulation = new LearningSimulation(LEARNING_LESSONS[2]), span = { line: 3, column: 1 }
  assert.ok(simulation.snapshot().distance > 5)
  await simulation.call('drive', [6n, 60n], span)
  assert.ok(simulation.snapshot().collisions > 0)
  assert.ok(simulation.snapshot().x < 5.75)
  assert.ok(simulation.snapshot().distance < 0.2)
  await assert.rejects(simulation.call('drive', [7n, 1n], span), /-6..6/)
  await assert.rejects(simulation.call('turn', [361n], span), /-360/)
  await assert.rejects(simulation.call('drive', [1n, { kind: 'float', value: 1 }], span), /integer/)
  await simulation.call('drive', [0n, 3600n], span)
  await assert.rejects(simulation.call('drive', [0n, 3600n], span), /7,200/)
  simulation.dispose()
})
test('Python source keeps its own workspace pane and never enables format conversion', () => {
  for (const path of ['/learning.py', 'workspace:///notes/Lesson.PY?revision=2#start']) {
    assert.equal(resolveMarkdownWorkspaceDocumentPanePreset(path), 'python')
    const initial = resolveMarkdownWorkspaceInitialPaneVisibility({ activeDocumentKey: path })
    assert.equal(initial.python, true); assert.equal(initial.json || initial.markdown || initial.html, false)
    const available = resolveMarkdownWorkspacePaneAvailability({ activeDocumentKey: path, modelAssetFormat: 'glb' })
    assert.equal(available.python, true); assert.equal(available.bin || available.json || available.markdown, false)
  }
})
