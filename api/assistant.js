import { buildPurchaseComparison, buildSellingScenarios, quantityInKg, validateCommonInput } from '../src/lib/assistantCalculations.js'
import { fetchMandiObservations } from './lib/mandi.js'
import { estimateTransport } from './lib/transport.js'

const MAX_BODY_BYTES = 16 * 1024
const requestTimestamps = new Map()
const WINDOW_MS = 60 * 1000
const MAX_REQUESTS = 10

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify(body))
}

function getClientKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
}

function rateLimited(key) {
  const now = Date.now()
  const recent = (requestTimestamps.get(key) || []).filter(timestamp => now - timestamp < WINDOW_MS)
  recent.push(now)
  requestTimestamps.set(key, recent)
  return recent.length > MAX_REQUESTS
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let body = ''
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk)
      if (size > MAX_BODY_BYTES) reject(new Error('Request body is too large.'))
      else body += chunk
    })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('Request body must be valid JSON.')) }
    })
    req.on('error', reject)
  })
}

function buildPrompt(mode, input, calculated, marketEvidence) {
  return `You are FairHarvest's ${mode === 'sell' ? 'Selling' : 'Purchase'} Assistant. Explain deterministic calculations and clearly separate farmer-provided inputs, observed market evidence, hypothetical scenarios, and forecasts. Never invent prices, sources, shelf life, quality verification, transport quotes, or future price predictions. If evidence or costs are incomplete, do not make a definitive sell or wait recommendation; explain the conditions that would change the decision and use the phrase "Provisional recommendation". Freshness effects are unknown unless verified crop-specific evidence is supplied. Return concise JSON with keys: summary, recommendation, uncertainty, followUpQuestions. Input: ${JSON.stringify(input)}. Calculations: ${JSON.stringify(calculated)}. Market evidence: ${JSON.stringify(marketEvidence)}`
}

function safeExplanation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { summary: 'AI explanation was unavailable.' }
  const text = key => typeof value[key] === 'string' ? value[key].slice(0, 4000) : ''
  const questions = Array.isArray(value.followUpQuestions)
    ? value.followUpQuestions.filter(item => typeof item === 'string').slice(0, 10)
    : []
  return {
    summary: text('summary') || 'AI explanation was unavailable.',
    recommendation: text('recommendation'),
    uncertainty: text('uncertainty'),
    followUpQuestions: questions,
  }
}

async function askGroq(mode, input, calculated, marketEvidence) {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) return { live: false, explanation: { summary: 'AI explanation unavailable: GROQ_API_KEY is not configured.' } }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: buildPrompt(mode, input, calculated, marketEvidence) }],
      }),
    })
    if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}.`)
    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('Groq returned no assistant content.')
    try { return { live: true, explanation: safeExplanation(JSON.parse(content)) } } catch { return { live: true, explanation: safeExplanation({ summary: content }) } }
  } finally {
    clearTimeout(timeout)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST is required.' })
  if (rateLimited(getClientKey(req))) return json(res, 429, { error: 'Too many requests. Please try again shortly.' })
  try {
    const body = await getBody(req)
    const mode = body.mode === 'buy' ? 'buy' : body.mode === 'sell' ? 'sell' : null
    if (!mode) return json(res, 400, { error: 'Invalid assistant request.' })
    const errors = validateCommonInput(body.input, mode)
    if (errors.length) return json(res, 400, { error: 'Invalid assistant input.', details: errors })

    let marketEvidence = { available: false, message: 'Market data unavailable.', observations: [] }
    if (mode === 'sell') {
      const input = body.input
      const mandi = await fetchMandiObservations({
        commodity: input.produce,
        state: input.state,
        district: input.district,
        market: input.nearestMarket,
      })
      if (mandi.available) {
        marketEvidence = {
          available: true,
          source: mandi.source,
          resourceId: mandi.resourceId,
          retrievedAt: mandi.retrievedAt,
          observations: mandi.data,
        }
      } else if (mandi.error) {
        marketEvidence.message = mandi.error.message
      }
    }

    const transport = mode === 'sell'
      ? estimateTransport({
        quantityKg: quantityInKg(body.input.quantity, body.input.unit),
        transportQuote: body.input.transportQuote,
        ratePerKg: process.env.TRANSPORT_RATE_PER_KG,
        rateSource: process.env.TRANSPORT_RATE_SOURCE,
        destination: body.input.nearestMarket,
      })
      : null
    const calculationInput = mode === 'sell' && body.input.transportCost === '' && transport?.amount !== null
      ? { ...body.input, transportCost: transport.amount }
      : body.input
    const calculated = mode === 'sell' ? buildSellingScenarios(calculationInput, marketEvidence.observations) : buildPurchaseComparison(body.input)
    const recommendation = mode === 'sell'
      ? {
        label: !marketEvidence.available || calculated.some(scenario => scenario.costsComplete === false) ? 'Provisional recommendation' : 'Best-supported option',
        rationale: !marketEvidence.available || calculated.some(scenario => scenario.costsComplete === false)
          ? 'External market evidence or required costs are incomplete; compare the stated assumptions before deciding.'
          : 'All configured evidence and scenario costs are available for comparison.',
      }
      : null
    let ai
    let aiError = null
    try {
      ai = await askGroq(mode, body.input, calculated, marketEvidence)
    } catch (error) {
      aiError = error.name === 'AbortError' ? 'AI request timed out.' : 'AI explanation unavailable.'
      ai = { live: false, explanation: { summary: aiError, recommendation: '', uncertainty: 'The deterministic calculations remain available; the AI explanation could not be retrieved.', followUpQuestions: [] } }
    }
    return json(res, 200, {
      mode,
      live: ai.live,
      calculated,
      transport,
      recommendation,
      explanation: ai.explanation,
      aiError,
      marketEvidence,
      dataSource: marketEvidence.available ? 'data.gov.in observations plus farmer-provided inputs' : 'Farmer-provided inputs only; market data unavailable',
      dataTimestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMessage = error.name === 'AbortError' ? 'AI request timed out.' : 'Assistant request failed.'
    return json(res, error.name === 'AbortError' ? 504 : 502, { error: errorMessage })
  }
}
