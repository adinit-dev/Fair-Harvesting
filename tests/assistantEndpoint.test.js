import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import handler from '../api/assistant.js'

function invoke(body) {
  const request = new EventEmitter()
  request.method = 'POST'
  request.headers = {}
  request.socket = { remoteAddress: 'test-client' }
  const response = {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this },
    setHeader(name, value) { this.headers[name] = value },
    end(value) { this.body = value; this.finished = true },
  }
  const promise = handler(request, response)
  request.emit('data', JSON.stringify(body))
  request.emit('end')
  return promise.then(() => ({ status: response.statusCode, body: JSON.parse(response.body) }))
}

test('rejects invalid assistant requests before contacting Groq', async () => {
  const result = await invoke({ mode: 'sell', input: {} })
  assert.equal(result.status, 400)
  assert.equal(result.body.error, 'Invalid assistant input.')
})

test('returns deterministic results when the upstream AI request fails', async () => {
  const previousKey = process.env.GROQ_API_KEY
  const previousFetch = globalThis.fetch
  process.env.GROQ_API_KEY = 'test-only-key'
  globalThis.fetch = async () => { throw new Error('provider secret detail') }
  try {
    const result = await invoke({
      mode: 'sell',
      input: {
        produce: 'rice',
        quantity: 10,
        unit: 'kg',
        currentOffer: 20,
        transportCost: 5,
        handlingCost: 2,
        harvestDate: '2026-10-01',
        qualityGrade: 'not sure',
        cropStatus: 'harvested',
      },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.live, false)
    assert.equal(result.body.calculated[0].grossRevenue, 200)
    assert.equal(result.body.aiError, 'AI explanation unavailable.')
    assert.equal(result.body.recommendation.label, 'Provisional recommendation')
    assert.equal(result.body.transport.status, 'unavailable')
    assert.equal(JSON.stringify(result.body).includes('provider secret detail'), false)
  } finally {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = previousKey
    globalThis.fetch = previousFetch
  }
})

test('sanitizes malformed model responses', async () => {
  const previousKey = process.env.GROQ_API_KEY
  const previousFetch = globalThis.fetch
  process.env.GROQ_API_KEY = 'test-only-key'
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { choices: [{ message: { content: JSON.stringify({ summary: { unsafe: true }, followUpQuestions: [1, 'Keep inputs'] }) } }] }
    },
  })
  try {
    const result = await invoke({
      mode: 'sell',
      input: {
        produce: 'rice',
        quantity: 10,
        unit: 'kg',
        currentOffer: 20,
        harvestDate: '2026-10-01',
        qualityGrade: 'not sure',
        cropStatus: 'harvested',
      },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.explanation.summary, 'AI explanation was unavailable.')
    assert.deepEqual(result.body.explanation.followUpQuestions, ['Keep inputs'])
  } finally {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = previousKey
    globalThis.fetch = previousFetch
  }
})
