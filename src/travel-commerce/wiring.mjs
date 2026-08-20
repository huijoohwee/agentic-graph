import { BundleGraphStore } from "./bundle-graph-store.mjs";
import { EnvelopeLedger } from "./envelope-ledger.mjs";
import { ReoptWorker } from "./reopt-worker.mjs";
import { ProvenanceArchive } from "./edge-services.mjs";
import { ReplanSurface } from "./replan-surface.mjs";
export function createTwoLegTravelCommerceRuntime({ quote, settle } = {}) { const store = new BundleGraphStore("bundle-1"); store.insertLeg({ legId: "flight", principalId: "principal-1", committedOfferId: "flight-old", committedAmount: 1000, category: "flight" }); store.insertLeg({ legId: "experience", principalId: "principal-1", committedOfferId: "experience-old", committedAmount: 500, category: "experience" }); store.insertEdge({ fromLegId: "flight", toLegId: "experience" }); const surface = new ReplanSurface(); const worker = new ReoptWorker({ store, ledger: new EnvelopeLedger("principal-1", 5000), quote: quote ?? (async legId => ({ kind: "offer", offerId: `${legId}-new`, amount: 700 })), settle, archive: new ProvenanceArchive().write.bind(new ProvenanceArchive()), log: entry => surface.project(entry.outcome) }); return { store, worker, surface }; }
