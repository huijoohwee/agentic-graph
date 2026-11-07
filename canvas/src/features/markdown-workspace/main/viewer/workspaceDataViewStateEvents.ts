/** Same-document settings subscribers; browser storage events cover other tabs. */
const listeners = new Set<(scope: string) => void>()
export function notifyDataViewState(scope: string): void { for (const listener of listeners) listener(scope) }
export function subscribeDataViewState(listener: (scope: string) => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }
