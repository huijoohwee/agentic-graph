/** Original, deliberately small English grammar filter; no imported corpus or model.
 * It suppresses only these explicitly maintained function words, not arbitrary languages.
 * Negation and modal words remain available as evidence.
 */
export const KEYWORD_FUNCTION_WORDS: ReadonlySet<string> = new Set([
  ...'a an the this that these those'.split(' '),
  ...'i me my we us our you your he him his she her it its they them their'.split(' '),
  ...'is are am was were be been being'.split(' '),
  ...'and or but if then as of for from to in on at by with about into'.split(' '),
])
