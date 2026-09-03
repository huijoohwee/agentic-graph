import fs from 'node:fs'
import path from 'node:path'

function loadInterviewEnv() {
  const rootEnvPath = path.resolve(process.cwd(), '..', '.env.interview')
  if (!fs.existsSync(rootEnvPath)) return
  const text = fs.readFileSync(rootEnvPath, 'utf8')
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || ''
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    const match = trimmed.match(/^AGENTIC_OS_EDA_MLP_INTERVIEW_MD_PATH\s*=\s*(.+)\s*$/)
    if (!match) continue
    const value = String(match[1] || '').trim()
    if (!value) continue
    if (!process.env.AGENTIC_OS_EDA_MLP_INTERVIEW_MD_PATH) {
      process.env.AGENTIC_OS_EDA_MLP_INTERVIEW_MD_PATH = value
    }
  }
}

loadInterviewEnv()

await import('./ci.js')

