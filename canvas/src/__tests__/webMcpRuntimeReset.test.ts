import {
  installAgenticGraphWebMcpRuntime,
  resetAgenticGraphWebMcpRuntimeForTests,
} from '@/features/agent-ready/webMcpRuntime'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export function testWebMcpRuntimeResetDetachesOwnedFallbackForSameDocumentReinstall() {
  const { restore } = initJsdomHarness()
  const navigatorObject = window.navigator as Navigator & { modelContext?: unknown }
  const documentObject = document as Document & { modelContext?: unknown }
  try {
    resetAgenticGraphWebMcpRuntimeForTests()
    Reflect.deleteProperty(navigatorObject, 'modelContext')
    Reflect.deleteProperty(documentObject, 'modelContext')
    installAgenticGraphWebMcpRuntime()
    const initialFallbackContext = navigatorObject.modelContext
    if (!initialFallbackContext || documentObject.modelContext !== initialFallbackContext) {
      throw new Error('expected the first install to own one shared fallback context')
    }

    resetAgenticGraphWebMcpRuntimeForTests()
    if (navigatorObject.modelContext || documentObject.modelContext) {
      throw new Error('expected reset to detach the owned fallback from navigator and document')
    }
    installAgenticGraphWebMcpRuntime()
    if (!navigatorObject.modelContext
      || navigatorObject.modelContext === initialFallbackContext
      || documentObject.modelContext !== navigatorObject.modelContext
      || document.documentElement.dataset.kgWebmcpContext !== 'fallback-readable'
      || document.documentElement.dataset.kgWebmcpHostContext !== 'awaiting-model-context') {
      throw new Error('expected same-document reinstall to create a fresh truthful fallback context')
    }
  } finally {
    resetAgenticGraphWebMcpRuntimeForTests()
    restore()
  }
}
