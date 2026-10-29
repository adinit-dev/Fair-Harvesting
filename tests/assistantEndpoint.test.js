import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import handler from '../api/assistant.js'
import { readAssistantResponse } from '../src/lib/assistantApi.js'

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

test('rejects past buy delivery dates instead of manufacturing a timing recommendation', async () => {
  const result = await invoke({
    mode: 'buy',
    input: { produce: 'Rice', quantity: 10, unit: 'kg', currentOffer: 20, destination: 'Guwahati', requiredBy: '2000-01-01' },
  })
  assert.equal(result.status, 400)
  assert.ok(result.body.details.some(detail => /past/i.test(detail)))
})

test('rejects past sell deadlines instead of manufacturing a timing recommendation', async () => {
  const result = await invoke({
    mode: 'sell',
    input: { produce: 'Rice', quantity: 10, unit: 'kg', currentOffer: 20, harvestDate: '2026-10-01', sellingDeadline: '2000-01-01', qualityGrade: 'A', cropStatus: 'harvested', state: 'Assam' },
  })
  assert.equal(result.status, 400)
  assert.ok(result.body.details.some(detail => /past/i.test(detail)))
})

test('frontend response reader accepts successful JSON responses', async () => {
  const payload = { mode: 'sell', calculated: [] }
  assert.deepEqual(await readAssistantResponse(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })), payload)
})

test('frontend response reader explains empty responses', async () => {
  await assert.rejects(readAssistantResponse(new Response('', { status: 404 })), /empty response \(HTTP 404\)/)
})

test('frontend response reader explains invalid JSON responses', async () => {
  await assert.rejects(readAssistantResponse(new Response('<html>not found</html>', { status: 502 })), /non-JSON response \(HTTP 502\)/)
})

test('frontend response reader preserves server error details', async () => {
  await assert.rejects(
    readAssistantResponse(new Response(JSON.stringify({ error: 'Invalid assistant input.', details: ['Quantity is required.'] }), { status: 400 })),
    error => error.message === 'Invalid assistant input.' && error.details?.[0] === 'Quantity is required.',
  )
})

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

test('displays a validated Groq-generated report and deterministic calculations', async () => {
  const previousKey = process.env.GROQ_API_KEY
  const previousFetch = globalThis.fetch
  process.env.GROQ_API_KEY = 'test-only-key'
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { choices: [{ message: { content: JSON.stringify({
        executiveSummary: 'Rice at this farmer-provided offer totals ₹200 gross.',
        summary: 'The 10 kg rice lot can be sold against the stated offer.',
        recommendation: 'Compare the ₹20/kg offer with verified mandi evidence before selling.',
        situationAnalysis: 'The lot is small and the farmer supplied a ₹20/kg offer.',
        benchmarkAnalysis: 'No comparable market benchmark was supplied.',
        timingRisks: 'No future price is forecast.',
        practicalNextSteps: ['Confirm buyer availability and transport terms.'],
        missingInformation: ['Verified market observations and complete costs.'],
        uncertainty: 'The deterministic value is available, but market evidence is not.',
        followUpQuestions: ['What is the confirmed buyer offer?'],
        sources: [],
      }) } }] }
    },
  })
  try {
    const result = await invoke({
      mode: 'sell',
      input: { produce: 'rice', quantity: 10, unit: 'kg', currentOffer: 20, harvestDate: '2026-10-01', qualityGrade: 'not sure', cropStatus: 'harvested' },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.live, true)
    assert.equal(result.body.calculated[0].grossRevenue, 200)
    assert.match(result.body.explanation.executiveSummary, /₹200 gross/)
    assert.match(result.body.explanation.situationAnalysis, /lot is small/)
    assert.deepEqual(result.body.explanation.followUpQuestions, ['What is the confirmed buyer offer?'])
    assert.equal(result.body.explanation.sources.length, 0)
  } finally {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = previousKey
    globalThis.fetch = previousFetch
  }
})

test('includes verified Open-Meteo evidence in the Groq request', async () => {
  const previousKey = process.env.GROQ_API_KEY
  const previousFetch = globalThis.fetch
  process.env.GROQ_API_KEY = 'test-only-key'
  let groqBody = null
  let weatherCalls = 0
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url)
    if (target.includes('geocoding-api')) {
      weatherCalls += 1
      return { ok: true, json: async () => ({ results: [{ name: 'Guwahati', latitude: 26.1445, longitude: 91.7362, country_code: 'IN' }] }) }
    }
    if (target.includes('api.open-meteo.com')) {
      weatherCalls += 1
      return { ok: true, json: async () => ({ timezone: 'Asia/Kolkata', daily: { time: ['2026-10-29'], temperature_2m_max: [31], temperature_2m_min: [22], precipitation_sum: [5], precipitation_probability_max: [60], wind_speed_10m_max: [10] } }) }
    }
    groqBody = JSON.parse(init.body)
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ executiveSummary: 'Weather-aware rice decision.', summary: 'Weather-aware rice decision.', recommendation: 'Review the supplied forecast.', practicalNextSteps: ['Check rainfall before delivery.'] }) } }] }) }
  }
  try {
    const result = await invoke({ mode: 'sell', input: { produce: 'rice', quantity: 10, unit: 'kg', currentOffer: 20, state: 'Guwahati', harvestDate: '2026-10-29', qualityGrade: 'not sure', cropStatus: 'harvested' } })
    assert.equal(result.status, 200)
    assert.equal(result.body.weatherEvidence.available, true)
    assert.equal(weatherCalls, 2)
    assert.match(groqBody.messages[0].content, /weatherEvidence/i)
    assert.match(groqBody.messages[0].content, /precipitationSum/)
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
    assert.equal(result.body.explanation.summary, 'AI explanation unavailable.')
    assert.deepEqual(result.body.explanation.followUpQuestions, [])
  } finally {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = previousKey
    globalThis.fetch = previousFetch
  }
})
