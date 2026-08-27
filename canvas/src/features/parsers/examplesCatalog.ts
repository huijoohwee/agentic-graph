import { DEFAULT_SCHEMA_CONFIG_PATH, schemaConfigFilePath, toDatasetPath } from '@/lib/graph/file'
import type { DatasetPath, SchemaConfigPath } from '@/lib/graph/file'

export type ExampleId =
  | 'sampleTop3Portfolio'
  | 'genericKgVisualization'
  | 'exampleWorkflow'
  | 'multiOntologyWorkflow'
  | 'edaMlpPipeline'

export type ExampleConfig = {
  id: ExampleId
  label: string
  datasetPath: DatasetPath
  schemaPath: SchemaConfigPath
}

export const EXAMPLE_DATASETS: ExampleConfig[] = [
  {
    id: 'sampleTop3Portfolio',
    label: 'Sample Top-3 portfolio test graph',
    datasetPath: toDatasetPath('public/unicorn-investors-top-3-3d.json'),
    schemaPath: DEFAULT_SCHEMA_CONFIG_PATH,
  },
  {
    id: 'genericKgVisualization',
    label: 'Knowledge graph visualization',
    datasetPath: toDatasetPath('data/test-data/neutral-kg.jsonld'),
    schemaPath: DEFAULT_SCHEMA_CONFIG_PATH,
  },
  {
    id: 'exampleWorkflow',
    label: 'Example workflow graph',
    datasetPath: toDatasetPath('docs/assets/example-workflow.jsonld'),
    schemaPath: schemaConfigFilePath('agenticgraph-example-workflow-schema-config.jsonld'),
  },
  {
    id: 'multiOntologyWorkflow',
    label: 'Multi-ontology assessment graph',
    datasetPath: toDatasetPath('docs/assets/multi-ontology-kg.jsonld'),
    schemaPath: schemaConfigFilePath('agenticgraph-interviewer-schema-config.jsonld'),
  },
  {
    id: 'edaMlpPipeline',
    label: 'EDA→MLP pipeline path graph',
    datasetPath: toDatasetPath('data/test-data/eda-mlp-path.json'),
    schemaPath: DEFAULT_SCHEMA_CONFIG_PATH,
  },
]

export const EXAMPLES_BY_ID: Record<ExampleId, ExampleConfig> = EXAMPLE_DATASETS.reduce(
  (acc, cfg) => {
    acc[cfg.id] = cfg
    return acc
  },
  {} as Record<ExampleId, ExampleConfig>,
)
