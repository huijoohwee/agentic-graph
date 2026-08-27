import fc from "fast-check";

export function propertyConfig(numRuns) {
  if (!Number.isInteger(numRuns) || numRuns < 100) {
    throw new TypeError("property numRuns must be an integer >= 100");
  }
  const seed = Number(process.env.AGENTICGRAPH_PBT_SEED ?? Date.now());
  console.log(`[agenticgraph-agentic-commerce:pbt] seed=${seed} numRuns=${numRuns}`);
  return { seed, numRuns, endOnFailure: false };
}

export function tag(feature, propertyNumber, propertyText) {
  return `Feature: ${feature}, Property ${propertyNumber}: ${propertyText}`;
}

export { fc };
