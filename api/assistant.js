import { buildPurchaseComparison, buildSellDecision, buildSellingScenarios, quantityInKg, validateCommonInput } from '../src/lib/assistantCalculations.js'
import { fetchMandiObservations } from './lib/mandi.js'
import { estimateTransport } from './lib/transport.js'
import { buildMandiBenchmark } from './lib/mandiBenchmark.js'
import { fetchWeather } from './lib/weather.js'
import { fetchPlatformListings } from './lib/platformListings.js'
import { getStorageGuidance } from './lib/storageGuidance.js'
import { authenticateSupabaseRequest, bodySize, validateContentType } from './lib/requestSecurity.js'

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

async function getBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
      const text = Buffer.isBuffer(req.body) ? req.body.toString() : req.body
      try { return Promise.resolve(JSON.parse(text || '{}')) } catch { return Promise.reject(new Error('Request body must be valid JSON.')) }
    }
    if (req.body && typeof req.body === 'object' && !ArrayBuffer.isView(req.body)) return Promise.resolve(req.body)
    if (ArrayBuffer.isView(req.body)) {
      try { return Promise.resolve(JSON.parse(Buffer.from(req.body.buffer, req.body.byteOffset, req.body.byteLength).toString() || '{}')) } catch { return Promise.reject(new Error('Request body must be valid JSON.')) }
    }
  }
  if (req.rawBody !== undefined) {
    const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString() : String(req.rawBody)
    try { return JSON.parse(raw || '{}') } catch { throw new Error('Request body must be valid JSON.') }
  }
  if (typeof req.text === 'function') {
    try { return JSON.parse(await req.text() || '{}') } catch { throw new Error('Request body must be valid JSON.') }
  }
  if (typeof req.arrayBuffer === 'function') {
    try { return JSON.parse(Buffer.from(await req.arrayBuffer()).toString() || '{}') } catch { throw new Error('Request body must be valid JSON.') }
  }
  return new Promise((resolve, reject) => {
    let size = 0
    let body = ''
    const consumeChunk = chunk => {
      const chunkText = Buffer.isBuffer(chunk) ? chunk.toString() : ArrayBuffer.isView(chunk)
        ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString()
        : chunk && typeof chunk === 'object'
          ? JSON.stringify(chunk)
          : String(chunk)
      size += Buffer.byteLength(chunkText)
      if (size > MAX_BODY_BYTES) reject(new Error('Request body is too large.'))
      else body += chunkText
    }
    req.on('readable', () => {
      let chunk
      while ((chunk = req.read()) !== null) consumeChunk(chunk)
    })
    req.on('data', consumeChunk)
    if (typeof req.resume === 'function') req.resume()
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('Request body must be valid JSON.')) }
    })
    req.on('error', reject)
  })
}

function buildPrompt(mode, input, calculated, marketEvidence, weatherEvidence, retrievedAt) {
  const context = {
    intent: mode,
    farmerProvidedInputs: input,
    deterministicCalculations: calculated,
    marketEvidence,
    weatherEvidence,
    retrievalTimestamp: retrievedAt,
    instructions: {
      allowedEvidence: 'Use only market evidence and sources supplied in this context. Wholesale mandi prices are not farm-gate guarantees.',
      forbiddenClaims: 'Do not invent prices, costs, buyers, trends, forecasts, shelf life, quality verification, weather, transport rates, or sources.',
      decisionRule: 'Do not make a definitive sell/buy timing recommendation when future market evidence or required costs are incomplete.',
      freshness: 'Treat crop-specific freshness or shelf-life timing as unknown unless the supplied evidence explicitly contains verified freshness information.',
      calculations: 'Treat all supplied financial totals as authoritative; discuss rather than recalculate or change them.',
    },
  }
  return `Create a concise, evidence-backed FairHarvest agricultural decision report using this JSON context only. The intent field is authoritative: never change, reinterpret, or contradict it. Refer only to the transaction dates, crop, quantity, unit, location, and price supplied in farmerProvidedInputs. Return JSON only with keys: executiveSummary, recommendation, situationAnalysis, marketAnalysis, weatherAnalysis, practicalNextSteps, missingInformation, uncertainty, followUpQuestions, sources. recommendation must be a concise string. Arrays may be used only for practicalNextSteps, missingInformation, followUpQuestions, and sources. Limit practicalNextSteps and missingInformation to 5 items and followUpQuestions to 3. Do not duplicate limitations across sections. Weather is forecast evidence, not observed weather or certainty. Never invent prices, weather values, dates, sources, crop freshness, or buyers. Every source must cite only a supplied source ID. Context: ${JSON.stringify(context)}`
}

function transactionDate(input, mode) {
  return mode === 'sell' ? input.sellingDeadline || '' : input.requiredBy
}

function pastDateErrors(input, mode) {
  const date = transactionDate(input, mode)
  if (!date) return []
  const today = new Date().toISOString().slice(0, 10)
    return /^\d{4}-[0-9]{2}-[0-9]{2}$/.test(date) && date < today
    ? [`${mode === 'sell' ? 'Selling deadline' : 'Required delivery date'} must not be in the past. Correct it before analysis.`]
    : []
}

function weatherCoversDate(weatherEvidence, date) {
  if (!weatherEvidence?.available || !date || !weatherEvidence.forecastPeriod?.start || !weatherEvidence.forecastPeriod?.end) return null
  return date >= weatherEvidence.forecastPeriod.start && date <= weatherEvidence.forecastPeriod.end
}

function buildDecisionStatus(mode, input, calculated, marketEvidence, weatherEvidence, validationErrors = []) {
  if (validationErrors.length) return 'Important information missing'
  const hasQuote = Number(input.currentOffer) > 0
  const incompleteCosts = Array.isArray(calculated)
    ? calculated.some(item => item.costsComplete === false)
    : !calculated?.current || calculated.current.deliveredCost == null && hasQuote
  if (!hasQuote) return 'Important information missing'
  const date = transactionDate(input, mode)
  const dateOutsideForecast = weatherEvidence?.available && date && weatherCoversDate(weatherEvidence, date) === false
  if (dateOutsideForecast) return 'Timing or logistics needs review'
  if (incompleteCosts) return 'Compare alternatives first'
  if (marketEvidence.available) return 'Evidence supports proceeding'
  return 'Compare alternatives first'
}

function text(value, limit = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function stringArray(value, limit = 12) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim().slice(0, 1000)).slice(0, limit)
    : []
}

function safeExplanation(value, marketEvidence, weatherEvidence) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { summary: 'AI report was unavailable; deterministic analysis remains available.' }
  const suppliedIds = new Set([
    marketEvidence?.sourceId, marketEvidence?.source, marketEvidence?.resourceId,
    weatherEvidence?.provider, weatherEvidence?.sourceId,
  ].filter(Boolean))
  const sources = Array.isArray(value.sources)
    ? value.sources.filter(source => source && suppliedIds.has(source.sourceId)).map(source => ({ sourceId: String(source.sourceId), label: text(source.label, 300) || String(source.sourceId) })).slice(0, 20)
    : []
  const summary = text(value.summary) || text(value.executiveSummary) || 'AI report was unavailable; deterministic analysis remains available.'
  return {
    summary,
    executiveSummary: text(value.executiveSummary) || summary,
    recommendation: text(value.recommendation),
    situationAnalysis: text(value.situationAnalysis),
    benchmarkAnalysis: text(value.benchmarkAnalysis || value.marketAnalysis) || (marketEvidence.available ? '' : 'Comparable market benchmark unavailable; no observed mandi prices are supplied.'),
    weatherAnalysis: text(value.weatherAnalysis),
    timingRisks: text(value.timingRisks) || text(value.timingAndRisks),
    practicalNextSteps: stringArray(value.practicalNextSteps, 5),
    missingInformation: stringArray(value.missingInformation, 5),
    uncertainty: text(value.uncertainty),
    followUpQuestions: stringArray(value.followUpQuestions, 10),
    sources,
  }
}

async function askGroq(mode, input, calculated, marketEvidence, weatherEvidence, retrievedAt) {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) return { live: false, explanation: { summary: 'AI report unavailable: GROQ_API_KEY is not configured.' } }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: buildPrompt(mode, input, calculated, marketEvidence, weatherEvidence, retrievedAt) }]
      }),
    })
    if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}.`)
    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('Groq returned no assistant content.')
    let report
    try { report = JSON.parse(content) } catch { throw new Error('Groq returned invalid JSON report.') }
    const explanation = safeExplanation(report, marketEvidence, weatherEvidence)
    if (!text(report.summary) && !text(report.executiveSummary)) throw new Error('Groq report did not contain a summary.')
    return { live: true, explanation }
  } finally {
    clearTimeout(timeout)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST is required.' })
  try {
    validateContentType(req)
    if (bodySize(req) > MAX_BODY_BYTES) return json(res, 413, { error: 'Request body is too large.' })
    const auth = await authenticateSupabaseRequest(req)
    if (auth.configured && !auth.user) return json(res, auth.unavailable ? 503 : 401, { error: auth.unavailable ? 'Authentication service is temporarily unavailable.' : 'Authentication is required.' })
  } catch (error) {
    return json(res, error.statusCode || 400, { error: error.statusCode === 415 ? error.message : 'Invalid assistant request.' })
  }
  if (rateLimited(getClientKey(req))) return json(res, 429, { error: 'Too many requests. Please try again shortly.' })
  try {
    const body = await getBody(req)
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) return json(res, 413, { error: 'Request body is too large.' })
    const mode = body.mode === 'buy' ? 'buy' : body.mode === 'sell' ? 'sell' : null
    if (!mode) return json(res, 400, { error: 'Invalid assistant request.' })
    const errors = [...validateCommonInput(body.input, mode), ...pastDateErrors(body.input, mode)]
    if (errors.length) return json(res, 400, { error: 'Invalid assistant input.', details: [...new Set(errors)] })

    let marketEvidence = { available: false, message: 'Market data unavailable.', observations: [], benchmark: { available: false, observationCount: 0, records: [] } }
    if (mode === 'sell' || mode === 'buy') {
      const input = body.input
      const location = mode === 'sell' ? input.state : input.destination
      const mandi = await fetchMandiObservations({
        commodity: input.produce,
        state: location,
      })
      if (mandi.available) {
        const benchmark = buildMandiBenchmark(mandi.data, { commodity: input.produce, state: mode === 'sell' ? input.state : input.destination })
        marketEvidence = {
          available: benchmark.available,
          source: mandi.source,
          sourceId: `data.gov.in:${mandi.resourceId}`,
          resourceId: mandi.resourceId,
          sourceUrl: `https://data.gov.in/resource/${encodeURIComponent(mandi.resourceId)}`,
          retrievedAt: mandi.retrievedAt,
          observations: benchmark.records,
          benchmark,
        }
      } else if (mandi.error) {
        marketEvidence.message = mandi.error.message
      }
    }

    const platformListings = await fetchPlatformListings({
      commodity: body.input.produce,
      state: mode === 'sell' ? body.input.state : body.input.destination,
      district: mode === 'sell' ? body.input.district : '',
    })
    const storageGuidance = getStorageGuidance(body.input.produce, body.input.quality)
    const weatherEvidence = await fetchWeather(mode === 'sell' ? body.input.state : body.input.destination)
    const relevantTransactionDate = transactionDate(body.input, mode)
    weatherEvidence.relevantToTransaction = weatherCoversDate(weatherEvidence, relevantTransactionDate)

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
    const sellDecision = mode === 'sell' ? buildSellDecision(body.input, marketEvidence.benchmark) : null
    const decisionStatus = buildDecisionStatus(mode, body.input, calculated, marketEvidence, weatherEvidence, errors)
    const recommendation = {
      decisionStatus,
      label: decisionStatus === 'Evidence supports proceeding'
        ? (mode === 'sell' ? 'Best-supported option' : 'Purchase assessment ready')
        : decisionStatus === 'Timing or logistics needs review' ? 'Timing review required' : 'Provisional recommendation',
      rationale: decisionStatus === 'Evidence supports proceeding'
        ? 'The supplied evidence and calculations support the current assessment.'
        : 'The current evidence does not support a definitive action without further review.',
    }
    let ai
    let aiError = null
    try {
      ai = await askGroq(mode, body.input, calculated, marketEvidence, weatherEvidence, new Date().toISOString())
    } catch (error) {
      aiError = error.name === 'AbortError' ? 'AI request timed out.' : 'AI explanation unavailable.'
      ai = { live: false, explanation: { summary: aiError, recommendation: '', uncertainty: 'The deterministic calculations remain available; the AI explanation could not be retrieved.', followUpQuestions: [] } }
    }
    ai.explanation = { ...ai.explanation, decisionStatus }
    if (decisionStatus !== 'Evidence supports proceeding') ai.explanation.recommendation = 'No definitive action is supported by the currently incomplete evidence.'
    return json(res, 200, {
      mode,
      live: ai.live,
      calculated,
      sellDecision,
      transport,
      recommendation,
      explanation: ai.explanation,
      aiError,
      marketEvidence,
      weatherEvidence,
      platformListings,
      storageGuidance,
      dataSource: marketEvidence.available ? 'data.gov.in observations plus farmer-provided inputs' : 'Farmer-provided inputs only; market data unavailable',
      dataTimestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMessage = error.name === 'AbortError' ? 'AI request timed out.' : 'Assistant request failed.'
    return json(res, error.name === 'AbortError' ? 504 : 502, { error: errorMessage })
  }
}
