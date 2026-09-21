import React from 'react'
import { MarkdownEditorPane } from '../markdown-workspace/main/editor/MarkdownEditorPane'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import { LEARNING_LESSONS, learningLesson } from './learningLessons'
import { pythonLearningRuntime as runtime } from './learningRuntime'
import { PYTHON_LIMITS, PYTHON_RUNTIME_REVISION, sourceBytes } from './pythonModel'
import { LearningScene } from './LearningScene'
import { LearningDebriefControls } from './LearningDebriefControls'
import { LearningOfflineControls } from './LearningOfflineControls'
import { getMarkdownWorkspaceActionBridge } from '../markdown-explorer/workspaceActionBridge'
import './pythonLearning.css'

export default function PythonLearningPane(props: {
  source: string; onChange: (source: string) => void; documentId: string; uri: string
  readOnly?: boolean; themeMode: 'dark' | 'light'; wordWrap: boolean
  editorRef: React.MutableRefObject<MonacoTextEditorHandle | null>; onCaretLine?: (line: number) => void
}) {
  const panelTypography = usePanelTypography()
  const [lessonId, setLessonId] = React.useState('travel')
  const [notice, setNotice] = React.useState('')
  const [mobileView, setMobileView] = React.useState<'code' | 'result'>('code')
  const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.read, runtime.read)
  const lesson = learningLesson(lessonId), result = snapshot.result
  React.useLayoutEffect(() => {
    runtime.bind({ workspaceId: 'local-editor-workspace', documentId: props.documentId, source: props.source, lessonId, readOnly: props.readOnly })
  }, [props.documentId, props.source, props.readOnly, lessonId])
  React.useEffect(() => {
    const hidden = () => runtime.setHidden(document.hidden)
    const leaving = () => runtime.stop()
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', leaving)
    hidden()
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', leaving); runtime.dispose() }
  }, [])
  const control = async (operation: Parameters<typeof runtime.control>[0]) => {
    try { setNotice(''); await runtime.control(operation) } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
  }
  const running = snapshot.state === 'running' || snapshot.state === 'validating'
  const disabled = props.readOnly || sourceBytes(props.source) > PYTHON_LIMITS.sourceBytes
  return <section className="python-learning" aria-label="Python learning workspace" data-learning-state={snapshot.state}>
    <div className="python-learning-controls">
      <label>Lesson <select aria-label="Python lesson" value={lessonId} onChange={event => { setLessonId(event.target.value); setNotice('Lesson changed. Source is preserved.'); }}>
        {LEARNING_LESSONS.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <button disabled={disabled || running} onClick={() => { props.onChange(lesson.starter); setNotice('Starter placed in this file. Run when ready.'); }}>Replace source with starter</button>
      <button disabled={props.readOnly} onClick={() => {
        const save = getMarkdownWorkspaceActionBridge().save
        if (!save) { setNotice('File saving is unavailable in this embedded editor.'); return }
        save(); setNotice('Source save requested through Editor Workspace. Check its save status before closing.')
      }}>Save source</button>
      {(['validate', 'run', 'step', 'pause', 'stop', 'reset', 'hint'] as const).map(operation => <button key={operation}
        disabled={operation === 'hint' ? false : operation === 'stop' || operation === 'reset' ? false : operation === 'pause' ? !running : disabled || running}
        onClick={() => void control(operation)}>{operation[0].toUpperCase() + operation.slice(1)}</button>)}
    </div>
    <p className="python-learning-objective">{lesson.objective}</p>
    {notice ? <p role="status">{notice}</p> : null}
    {snapshot.error ? <p role="alert"><button onClick={() => props.editorRef.current?.revealLine?.(snapshot.error!.span.line)}>Line {snapshot.error.span.line}</button>: {snapshot.error.message}</p> : null}
    <div className="python-learning-mobile-views" role="group" aria-label="Python workspace view">
      <button aria-pressed={mobileView === 'code'} onClick={() => setMobileView('code')}>Code</button>
      <button aria-pressed={mobileView === 'result'} onClick={() => setMobileView('result')}>Scene and results</button>
    </div>
    <div className="python-learning-body" data-mobile-view={mobileView}>
      <section className="python-learning-code" aria-label="Python source">
        <MarkdownEditorPane value={props.source} onChange={props.onChange} language="python" uri={props.uri} readOnly={props.readOnly}
          editorRef={props.editorRef} onCaretLine={props.onCaretLine} wordWrap={props.wordWrap} themeMode={props.themeMode}
          panelTypography={panelTypography} ariaLabel="Python source text" paneAriaLabel="Python editor" />
        <details><summary>Supported Python and scene API</summary>
          <p>Bounded procedural Python: numbers, strings, booleans, variables, arithmetic, comparisons, if/elif/else, while, for/range, positional functions, return, break, continue, pass, print, abs, min and max.</p>
          <p>drive(speed, ticks): −6…6 m/s, 1…3,600 ticks per call. turn(degrees): −360…360. distance(): forward metres. at_goal(): boolean. Each second is 60 ticks.</p>
          <p>Imports, objects, containers, recursion, packages, file and network access are unsupported. Limits: 32 KiB source, 50,000 evaluation steps, 7,200 ticks, five seconds active compute. Step completes one statement; a drive call may cover many ticks.</p>
        </details>
      </section>
      <section className="python-learning-result" aria-label="Python scene and results">
        <LearningScene lesson={lesson} scene={!snapshot.stale ? result?.scene : undefined} />
        <p role="status">{snapshot.state}{snapshot.stale ? ' · previous result is stale' : ''}{result && !snapshot.stale ? ` · line ${result.span.line} · tick ${result.scene.ticks}` : ''}</p>
        {result && !snapshot.stale ? <>
          <p>{result.grade.passed ? 'Lesson passed' : 'Keep exploring'} · {result.grade.criteria.filter(c => c.passed).length}/4 criteria</p>
          <ul>{result.grade.criteria.map(c => <li key={c.id}>{c.passed ? '✓' : '○'} {c.label}</li>)}</ul>
          <pre aria-label="Python output">{result.output || '(no output)'}</pre>
          <details><summary>Variables and run identity</summary><pre>{JSON.stringify({ variables: result.variables, ...result.identity }, null, 2)}</pre></details>
        </> : null}
        {snapshot.hint > 0 ? <ol aria-label="Progressive hints">{lesson.hints.slice(0, snapshot.hint).map(hint => <li key={hint}>{hint}</li>)}</ol> : null}
        <details><summary>Worked solution</summary><pre>{lesson.solution}</pre></details>
        <LearningDebriefControls readOnly={props.readOnly} onRestore={(source, lessonId) => { setLessonId(lessonId); props.onChange(source) }} />
        <LearningOfflineControls />
        <small>{PYTHON_RUNTIME_REVISION} · local worker · no model calls</small>
      </section>
    </div>
  </section>
}
