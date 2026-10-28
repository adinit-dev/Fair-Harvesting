import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { request } from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function loadLocalEnv() {
  try {
    const contents = await readFile(path.join(root, '.env'), 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match || process.env[match[1]]) continue
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

await loadLocalEnv()

const model = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b'
if (!process.env.GROQ_API_KEY?.trim()) {
  console.log(`Live Groq test skipped: GROQ_API_KEY is not configured. Model: ${model}`)
  process.exit(0)
}

const { default: handler } = await import('../api/assistant.js')
const server = createServer((req, res) => {
  res.status = status => {
    res.statusCode = status
    return res
  }
  handler(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Local test harness failure.' }))
  })
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const input = {
  produce: 'rice',
  variety: 'local',
  quantity: '10',
  unit: 'kg',
  harvestDate: '2026-10-28',
  qualityGrade: 'A',
  cropStatus: 'harvested',
  storageConditions: 'dry',
  location: 'Assam',
  currentOffer: '50',
  transportCost: '10',
  handlingCost: '5',
}

const response = await new Promise((resolve, reject) => {
  const req = request({
    hostname: '127.0.0.1',
    port,
    path: '/api/assistant',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, result => {
    let body = ''
    result.setEncoding('utf8')
    result.on('data', chunk => { body += chunk })
    result.on('end', () => resolve({ status: result.statusCode, body }))
  })
  req.on('error', reject)
  req.end(JSON.stringify({ mode: 'sell', input }))
})

await new Promise(resolve => server.close(resolve))
let payload
try {
  payload = JSON.parse(response.body)
} catch {
  payload = null
}

console.log(`Live Groq test HTTP status: ${response.status}`)
console.log(`Model: ${model}`)
console.log(`Response JSON: ${Boolean(payload)}`)
console.log(`Response shape: ${payload ? ['live', 'calculated', 'explanation', 'dataSource', 'dataTimestamp'].every(key => key in payload) : false}`)
console.log(`Live explanation returned: ${payload?.live === true}`)
if (response.status !== 200) console.log(`Sanitized error: ${payload?.error || 'No error body returned.'}`)
if (response.status !== 200 || payload?.live !== true) process.exitCode = 1
