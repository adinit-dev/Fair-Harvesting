const MAX_BODY_BYTES = 32 * 1024
import { authenticateSupabaseRequest, bodySize, validateContentType } from './lib/requestSecurity.js'

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify(body))
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString() || '{}')
  if (typeof req.text === 'function') return JSON.parse(await req.text() || '{}')
  return new Promise((resolve, reject) => {
    let size = 0
    let body = ''
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) reject(new Error('Request body is too large.'))
      else body += chunk.toString()
    })
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('Request body must be valid JSON.')) } })
    req.on('error', reject)
  })
}

function emptyString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeExtraction(value, transcript, mode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Structured extraction output was invalid.')
  const unitMap = { kilograms: 'kg', kilogram: 'kg', kilos: 'kg', kilo: 'kg', kg: 'kg', quintals: 'quintal', quintal: 'quintal', q: 'quintal', tonnes: 'tonne', tonne: 'tonne', ton: 'tonne', tons: 'tonne' }
  const unit = unitMap[String(value.unit || '').toLowerCase().trim()]
  const normalized = {
    intent: value.intent === 'buy' ? 'buy' : value.intent === 'sell' ? 'sell' : mode,
    produce: emptyString(value.produce) || null,
    quantity: value.quantity === null || value.quantity === undefined || value.quantity === '' ? null : String(value.quantity),
    unit: unit || null,
    location: emptyString(value.location?.market || value.location?.district || value.location?.state || value.location) || null,
    district: emptyString(value.location?.district) || null,
    state: emptyString(value.location?.state) || null,
    market: emptyString(value.location?.market) || null,
    availabilityDate: emptyString(value.availabilityDate) || emptyString(value.harvestDate) || null,
    requiredByDate: emptyString(value.requiredByDate) || null,
    quality: emptyString(value.quality) || null,
    grade: emptyString(value.grade) || null,
    price: value.price === null || value.price === undefined || value.price === '' ? null : String(value.price),
    unresolved: Array.isArray(value.unresolved) ? value.unresolved.filter(item => typeof item === 'string').slice(0, 20) : [],
    detectedLanguage: emptyString(value.detectedLanguage) || null,
    originalTranscript: transcript,
  }
  if (normalized.quantity !== null && (!Number.isFinite(Number(normalized.quantity)) || Number(normalized.quantity) <= 0)) normalized.quantity = null
  if (normalized.price !== null && (!Number.isFinite(Number(normalized.price)) || Number(normalized.price) < 0)) normalized.price = null
  return normalized
}

export { normalizeExtraction }

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST is required.' })
  try {
    validateContentType(req)
    if (bodySize(req) > MAX_BODY_BYTES) return json(res, 413, { error: 'Request body is too large.' })
    const auth = await authenticateSupabaseRequest(req)
    if (auth.configured && !auth.user) return json(res, auth.unavailable ? 503 : 401, { error: auth.unavailable ? 'Authentication service is temporarily unavailable.' : 'Authentication is required.' })
  } catch (error) {
    return json(res, error.statusCode || 400, { error: error.statusCode === 415 ? error.message : 'Invalid extraction request.' })
  }
  try {
    const body = await readJson(req)
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) return json(res, 413, { error: 'Request body is too large.' })
    const transcript = emptyString(body.transcript)
    const mode = body.mode === 'buy' ? 'buy' : 'sell'
    if (!transcript) return json(res, 400, { error: 'A transcript is required.' })
    const apiKey = process.env.GROQ_API_KEY?.trim()
    if (!apiKey) return json(res, 503, { error: 'Structured voice extraction is unavailable because GROQ_API_KEY is not configured. You can continue manually.' })

    const prompt = `Extract FairHarvest request fields from the transcript. Return JSON only. Use null or [] for unknown values; never invent defaults. Intent must be sell or buy. Unit must be kg, quintal, tonne, or null. Dates must be YYYY-MM-DD. Relative dates may be resolved only if clear. Return keys: intent, produce, quantity, unit, location (object with state, district, market), availabilityDate, requiredByDate, quality, grade, price, unresolved, detectedLanguage. If a location is only a city, put it in location.market, not in state/district. Transcript: ${JSON.stringify(transcript)}. Default intent: ${mode}.`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: prompt }],
        }),
      })
      if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}.`)
      const payload = await response.json()
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error('Groq returned no extraction content.')
      const extraction = normalizeExtraction(JSON.parse(content), transcript, mode)
      return json(res, 200, extraction)
    } finally { clearTimeout(timeout) }
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'Structured extraction timed out. You can retry or enter the details manually.'
      : 'Structured extraction failed. You can retry or enter the details manually.'
    return json(res, 502, { error: message })
  }
}
