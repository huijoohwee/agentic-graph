import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  extractWebsiteCollectionRecords,
  parseWebsiteCollectionRecordsFromConversionJson,
} from '@/lib/websites/websiteCollectionRecords'
import { buildWebsiteCollectionTableMarkdown } from '@/lib/websites/websiteCollectionTableMarkdown'

test('Devpost hackathon listings convert to collection records', () => {
  const markdown = readFileSync(new URL('../__fixtures__/devpost-hackathons.sample.md', import.meta.url), 'utf8')
  const rows = extractWebsiteCollectionRecords({
    url: 'https://devpost.com/hackathons',
    markdown,
  })
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    recordType: 'hackathon',
    sourceUrl: 'https://medo.devpost.com/?ref_feature=challenge&ref_medium=discover',
    sourcePageUrl: 'https://medo.devpost.com/?ref_feature=challenge&ref_medium=discover',
    title: 'Build with MeDo Hackathon',
    location: 'Online',
    status: '18 days left',
    timeline: 'Apr 09 - May 20, 2026',
    prize: '$50,000 in prizes',
    participants: '5357 participants',
    organizer: 'Baidu',
    tagsText: 'Beginner Friendly Low/No Code Machine Learning/AI',
  })
  assert.equal(rows[1]?.title, 'Agents Assemble - The Healthcare AI Endgame')
  assert.equal(rows[1]?.organizer, 'Prompt Opinion (Darena Health)')
})

test('collection records round-trip from conversion JSON into a multi-dimensional table document', () => {
  const conversionJson = JSON.stringify({
    ok: true,
    source_url: 'https://devpost.com/hackathons',
    collectionRecords: [{
      recordType: 'hackathon',
      sourceUrl: 'https://medo.devpost.com/?ref_feature=challenge&ref_medium=discover',
      sourcePageUrl: 'https://medo.devpost.com/?ref_feature=challenge&ref_medium=discover',
      title: 'Build with MeDo Hackathon',
      location: 'Online',
      status: '18 days left',
      timeline: 'Apr 09 - May 20, 2026',
      prize: '$50,000 in prizes',
      participants: '5357 participants',
      organizer: 'Baidu',
      tagsText: 'Beginner Friendly Low/No Code Machine Learning/AI',
    }],
  }, null, 2)
  const rows = parseWebsiteCollectionRecordsFromConversionJson(conversionJson)
  assert.equal(rows.length, 1)
  const markdown = buildWebsiteCollectionTableMarkdown({
    rootUrl: 'https://devpost.com/hackathons',
    importId: 'devpost-collection',
    rows: [{ ...rows[0]!, nodeId: 'root', docLink: './hackathons.md' }],
  })
  assert.match(markdown, /kgCanvas2dRenderer: "multiDimTable"/)
  assert.match(markdown, /kgMultiDimTableModeEnabled: true/)
  assert.match(markdown, /\| Title \| Location \| Status \| Dates \| Prize \| Participants \| Organizer \| Tags \| Source \| Doc \|/)
  assert.match(markdown, /Build with MeDo Hackathon/)
  assert.match(markdown, /\[Open\]\(https:\/\/medo\.devpost\.com\/\?ref_feature=challenge&ref_medium=discover\)/)
  assert.match(markdown, /\[Doc\]\(\.\/hackathons\.md\)/)
})
