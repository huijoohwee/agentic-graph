import React, { useMemo, useState } from 'react'
import { BookOpen, Database, FileText, GitBranch, Network, Sparkles } from 'lucide-react'
import { runGraphRagTextPipeline } from '@/lib/graph/graphragTextPipeline'
import { AIE_BOOK_CHAPTER_SNIPPETS, type AieBookChapterId } from '@/features/demo/aieBookChapterSnippets'

const ICONS = {
  nltkPreprocess: FileText,
  hfTokenize: Sparkles,
  spacyNerPos: Database,
  tripleExtract: GitBranch,
  graphConstruct: Network,
} as const

const getArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
export const AIE_BOOK_DEMO_CONTENT_CLASS_NAME = 'kg-aie-book-demo-content'
export const AIE_BOOK_CHAPTER_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3'
export const AIE_BOOK_STAGE_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2'
export const AIE_BOOK_GRAPH_STATS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-3 text-center sm:grid-cols-3'
export const AIE_BOOK_INSIGHTS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-4 text-sm md:grid-cols-2'

const GraphRagAieBookChapterSummariesDemo = () => {
  const [step, setStep] = useState(0)
  const [selectedChapter, setSelectedChapter] = useState<AieBookChapterId>('ch6')

  const chapter = AIE_BOOK_CHAPTER_SNIPPETS[selectedChapter]
  const pipeline = useMemo(() => runGraphRagTextPipeline(chapter.text), [chapter.text])
  const steps = pipeline.stages
  const clampedStep = Math.max(0, Math.min(step, Math.max(0, steps.length - 1)))
  const currentStep = steps[clampedStep] || steps[0]

  const Icon = currentStep ? ICONS[currentStep.id] : Network
  const output = (currentStep?.output || {}) as Record<string, unknown>

  const preprocessTokens = getArray(output.tokens).map(String)
  const preprocessLemmas = getArray(output.lemmas).map(String)
  const hfSubwords = getArray(output.subwords).map(String)
  const hfWordTokens = typeof output.word_tokens === 'number' ? output.word_tokens : null
  const hfSubwordTokens = typeof output.subword_tokens === 'number' ? output.subword_tokens : null
  const nerEntities = getArray(output.entities) as Array<{ text?: unknown; label?: unknown }>
  const tripleStrings = getArray(output.triples).map(String)
  const graphNodes = getArray(output.nodes).map(String)
  const graphEdgeCount = typeof output.edges === 'number' ? output.edges : null
  const graphCommunityCount = typeof output.communities === 'number' ? output.communities : null

  return (
    <section className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 p-8">
      <section className={AIE_BOOK_DEMO_CONTENT_CLASS_NAME}>
        <section className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-[var(--kg-shadow-overlay)] border border-white/20">
          <section className="flex items-center gap-3 mb-2">
            <BookOpen className="w-10 h-10 text-indigo-400" />
            <h1 className="text-4xl font-bold text-white">GraphRAG Pipeline: AI Engineering Book</h1>
          </section>
          <p className="text-indigo-200 mb-6">Extracting knowledge graphs from book chapter summaries</p>

          <section className="mb-6 bg-black/30 rounded-xl p-4 border border-white/10">
            <label className="text-sm font-medium text-indigo-300 mb-2 block">Select Chapter:</label>
            <section className={AIE_BOOK_CHAPTER_GRID_CLASS_NAME}>
              {(
                Object.entries(AIE_BOOK_CHAPTER_SNIPPETS) as Array<
                  [AieBookChapterId, (typeof AIE_BOOK_CHAPTER_SNIPPETS)[AieBookChapterId]]
                >
              ).map(([key, ch]) => (
                <button
                  key={key}
                  onClick={() => setSelectedChapter(key)}
                  className={`px-4 py-3 rounded-lg font-medium transition-all text-left ${
                    selectedChapter === key
                      ? 'bg-indigo-500 text-white shadow-none scale-105'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  <section className="text-xs opacity-70 mb-1">{key.toUpperCase()}</section>
                  <section className="text-sm">{ch.title.split(':')[1]}</section>
                </button>
              ))}
            </section>
          </section>

          <section className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {steps.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setStep(i)}
                className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                  clampedStep === i
                    ? 'bg-indigo-500 text-white shadow-none scale-105'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {i + 1}. {s.name}
              </button>
            ))}
          </section>

          <section className={AIE_BOOK_STAGE_GRID_CLASS_NAME}>
            <section className="bg-black/30 rounded-xl p-6 border border-white/10">
              <section className="flex items-center gap-2 mb-4">
                <Icon className="w-6 h-6 text-indigo-400" />
                <h3 className="text-xl font-bold text-white">{currentStep?.name || 'Stage'}</h3>
              </section>
              <section className="bg-slate-800 rounded-lg p-4 mb-4">
                <pre className="text-sm text-green-300 overflow-x-auto">{String(currentStep?.code || '')}</pre>
              </section>
              <section className="text-sm text-indigo-200">
                <strong>Input:</strong>
                <p className="mt-2 text-white/80 italic text-xs leading-relaxed max-h-32 overflow-y-auto">
                  {String(currentStep?.input || chapter.text)}
                </p>
              </section>
            </section>

            <section className="bg-black/30 rounded-xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-4">Output</h3>
              <section className="space-y-3 max-h-96 overflow-y-auto">
                {currentStep?.id === 'nltkPreprocess' && (
                  <>
                    <section>
                      <strong className="text-indigo-300">Tokens:</strong>
                      <section className="flex flex-wrap gap-2 mt-2">
                        {preprocessTokens.slice(0, 12).map((t, i) => (
                          <span key={i} className="px-2 py-1 bg-blue-500/30 text-blue-200 rounded text-xs">
                            {t}
                          </span>
                        ))}
                      </section>
                    </section>
                    <section>
                      <strong className="text-indigo-300">Lemmas:</strong>
                      <section className="flex flex-wrap gap-2 mt-2">
                        {preprocessLemmas.slice(0, 10).map((l, i) => (
                          <span key={i} className="px-2 py-1 bg-green-500/30 text-green-200 rounded text-xs">
                            {l}
                          </span>
                        ))}
                      </section>
                    </section>
                  </>
                )}

                {currentStep?.id === 'hfTokenize' && (
                  <>
                    <section>
                      <strong className="text-indigo-300">Subword Tokens:</strong>
                      <section className="flex flex-wrap gap-2 mt-2">
                        {hfSubwords.slice(0, 40).map((s, i) => (
                          <span key={i} className="px-2 py-1 bg-orange-500/30 text-orange-200 rounded text-xs">
                            {s}
                          </span>
                        ))}
                      </section>
                    </section>
                    <p className="text-white/70 text-sm mt-2">
                      {hfWordTokens != null && hfSubwordTokens != null
                        ? `Word tokens: ${hfWordTokens} | Subword tokens: ${hfSubwordTokens}`
                        : ''}
                    </p>
                  </>
                )}

                {currentStep?.id === 'spacyNerPos' && (
                  <>
                    <section>
                      <strong className="text-indigo-300">Named Entities:</strong>
                      {nerEntities.slice(0, 12).map((e, i) => (
                        <section key={i} className="mt-2 flex items-center gap-2">
                          <span className="px-3 py-1 bg-pink-500/30 text-pink-200 rounded text-sm">
                            {String(e.text || '')}
                          </span>
                          <span className="text-xs text-white/50">{String(e.label || '')}</span>
                        </section>
                      ))}
                    </section>
                    <section className="mt-4">
                      <strong className="text-indigo-300">POS Example:</strong>
                      <p className="text-white/70 text-sm mt-1 font-mono">{String(output.pos || '')}</p>
                    </section>
                  </>
                )}

                {currentStep?.id === 'tripleExtract' && (
                  <section>
                    <strong className="text-indigo-300">Extracted Triples:</strong>
                    {tripleStrings.slice(0, 20).map((t, i) => (
                      <section key={i} className="mt-2 text-xs text-cyan-200 font-mono bg-cyan-900/20 p-2 rounded">
                        {t}
                      </section>
                    ))}
                  </section>
                )}

                {currentStep?.id === 'graphConstruct' && (
                  <section className="space-y-3">
                    <section className={AIE_BOOK_GRAPH_STATS_GRID_CLASS_NAME}>
                      <section className="bg-indigo-500/20 p-3 rounded-lg">
                        <section className="text-2xl font-bold text-white">{graphNodes.length}</section>
                        <section className="text-xs text-indigo-200">Nodes</section>
                      </section>
                      <section className="bg-blue-500/20 p-3 rounded-lg">
                        <section className="text-2xl font-bold text-white">{graphEdgeCount ?? 0}</section>
                        <section className="text-xs text-blue-200">Edges</section>
                      </section>
                      <section className="bg-green-500/20 p-3 rounded-lg">
                        <section className="text-2xl font-bold text-white">{graphCommunityCount ?? 0}</section>
                        <section className="text-xs text-green-200">Communities</section>
                      </section>
                    </section>
                    <section>
                      <strong className="text-indigo-300 text-sm">Knowledge Graph Nodes:</strong>
                      <section className="flex flex-wrap gap-2 mt-2">
                        {graphNodes.slice(0, 30).map((n, i) => (
                          <span key={i} className="px-3 py-1 bg-violet-500/30 text-violet-200 rounded-lg text-xs">
                            {n}
                          </span>
                        ))}
                      </section>
                    </section>
                  </section>
                )}
              </section>
            </section>
          </section>

          <section className="mt-8 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 rounded-xl p-6 border border-indigo-500/30">
            <h3 className="text-lg font-bold text-white mb-3">Insights from {chapter.title}</h3>
            <section className={AIE_BOOK_INSIGHTS_GRID_CLASS_NAME}>
              <section className="bg-black/20 p-3 rounded-lg">
                <section className="text-indigo-300 font-medium mb-1">Entities (sample)</section>
                <section className="text-white/80">
                  {nerEntities
                    .slice(0, 6)
                    .map(e => String(e.text || ''))
                    .filter(Boolean)
                    .join(', ')}
                </section>
              </section>
              <section className="bg-black/20 p-3 rounded-lg">
                <section className="text-indigo-300 font-medium mb-1">Triples (sample)</section>
                <section className="text-white/80">{tripleStrings.slice(0, 2).join(' ')}</section>
              </section>
            </section>
          </section>

          <section className="mt-6 bg-black/20 rounded-xl p-4 border border-white/10">
            <section className="text-sm text-gray-300">
              <span className="font-semibold text-indigo-300">Source:</span> AI Engineering Book (Chapter Summaries) •
              <span className="font-semibold text-indigo-300 ml-3">FOSS Stack:</span> NLTK → HF Tokenizers → spaCy →
              NetworkX
            </section>
          </section>
        </section>
      </section>
    </section>
  )
}

export default GraphRagAieBookChapterSummariesDemo
