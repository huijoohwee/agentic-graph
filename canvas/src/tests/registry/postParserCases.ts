import type { TestCaseTuple } from '../runner/testRunnerTypes'
import { TEST_CASES_POST_PARSER_0 } from './postParserCases0'
import { TEST_CASES_POST_PARSER_1 } from './postParserCases1'
import { TEST_CASES_POST_PARSER_2 } from './postParserCases2'
import { TEST_CASES_POST_PARSER_3 } from './postParserCases3'
import { TEST_CASES_POST_PARSER_4 } from './postParserCases4'
import { TEST_CASES_POST_PARSER_5 } from './postParserCases5'
import { TEST_CASES_POST_PARSER_6 } from './postParserCases6'
import { TEST_CASES_POST_PARSER_7 } from './postParserCases7'
import { TEST_CASES_POST_PARSER_8 } from './postParserCases8'
import { COLLABORATION_TEST_CASES } from './collaborationCases'

const dedupeExactTestCaseTuples = (tuples: readonly TestCaseTuple[]): TestCaseTuple[] => {
  const seen = new Set<string>()
  const deduped: TestCaseTuple[] = []
  for (const tuple of tuples) {
    const key = JSON.stringify(tuple)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(tuple)
  }
  return deduped
}

export const ALL_POST_PARSER_CASES: TestCaseTuple[] = dedupeExactTestCaseTuples([
  ...COLLABORATION_TEST_CASES,
  ...TEST_CASES_POST_PARSER_0,
  ...TEST_CASES_POST_PARSER_5,
  ...TEST_CASES_POST_PARSER_6,
  ...TEST_CASES_POST_PARSER_7,
  ...TEST_CASES_POST_PARSER_8,
  ...TEST_CASES_POST_PARSER_1,
  ...TEST_CASES_POST_PARSER_4,
  ...TEST_CASES_POST_PARSER_2,
  ...TEST_CASES_POST_PARSER_3,
])
