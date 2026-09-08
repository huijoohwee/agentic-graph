import type { TestCaseTuple } from '../runner/testRunnerTypes'

export const TEST_CASES_PRE_PARSER: TestCaseTuple[] = [
  ['testIsolation.repositoryFixtures.candidateAndSiblings', '../__tests__/repositoryFixtureRoots.test', 'testRepositoryFixturesPreserveCandidateAndSiblingSources'],
  ['testIsolation.repositoryFixtures.pinnedDocs', '../__tests__/repositoryFixtureRoots.test', 'testRepositoryFixturesRequireExactPinnedDocs'],
  ['canvas.shortcuts.arrangeAndNudge', '../__tests__/arrangeShortcuts.test', 'testArrangeShortcutsParseAndNudge'],
  [
    'flowCollisionSticking: testCorrectlyNestsH2InsideH1AndEnforcesContainmentSeparation',
    '../__tests__/flowCollisionSticking.test',
    'testCorrectlyNestsH2InsideH1AndEnforcesContainmentSeparation',
  ],
  [
    'markdownDocumentPathNormalization: testMarkdownDocumentPathNormalization',
    '../__tests__/markdownDocumentPathNormalization.test',
    'testMarkdownDocumentPathNormalization',
  ],
  [
    'codebasePathCoercion.absoluteUnderRoot.toRel',
    '../__tests__/codebaseRelPathFromAbsolute.test',
    'testCodebaseRelPathCoercionFromAbsoluteUnderRoot',
  ],
  [
    'graphMetadata.readGraphDataRevision.normalizesFiniteNonNegativeIntegers',
    '../__tests__/codebaseRelPathFromAbsolute.test',
    'testGraphDataRevisionMetadataReaderNormalizesFiniteNonNegativeIntegers',
  ],
  ['routing.basePath.resolveRouterBasename', '../__tests__/routingBasePath.test', 'testResolveRouterBasenameFromBaseUrl'],
]
