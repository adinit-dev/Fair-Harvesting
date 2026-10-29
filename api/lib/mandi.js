const MANDI_API_BASE = 'https://api.data.gov.in/resource'
const DEFAULT_TIMEOUT_MS = 8000
const MAX_OBSERVATION_AGE_DAYS = 7
const mandiCache = new Map()

function getConfig() {
  const apiKey = process.env.DATA_GOV_IN_API_KEY?.trim()
  const resourceId = process.env.DATA_GOV_IN_RESOURCE_ID?.trim()
  const priceUnit = process.env.DATA_GOV_IN_PRICE_UNIT?.trim()
  if (!apiKey || !resourceId || !priceUnit) {
    return { error: new Error('Mandi data is unavailable: configure DATA_GOV_IN_API_KEY, DATA_GOV_IN_RESOURCE_ID, and verified DATA_GOV_IN_PRICE_UNIT metadata.') }
  }
  return { apiKey, resourceId, priceUnit }
}

function firstValue(record, names) {
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null && record[name] !== '') return record[name]
  }
  return null
}

function normalizeObservationDate(value) {
  const text = String(value || '').trim()
  const match = text.match(/^([0-3]\d)[/-]([01]\d)[/-](\d{4})(?:\s.*)?$/)
  if (!match) return text
  return `${match[3]}-${match[2]}-${match[1]}`
}

function normalizeRecord(record, retrievedAt, priceUnit, resourceId) {
  return {
    state: firstValue(record, ['state', 'State']),
    district: firstValue(record, ['district', 'District']),
    market: firstValue(record, ['market', 'Market']),
    commodity: firstValue(record, ['commodity', 'Commodity']),
    variety: firstValue(record, ['variety', 'Variety']),
    grade: firstValue(record, ['grade', 'Grade']),
    observationDate: normalizeObservationDate(firstValue(record, ['arrival_date', 'Arrival_Date', 'arrival date', 'date'])),
    minPrice: firstValue(record, ['min_price', 'Min Price', 'min_price_per_quintal']),
    maxPrice: firstValue(record, ['max_price', 'Max Price', 'max_price_per_quintal']),
    modalPrice: firstValue(record, ['modal_price', 'Modal Price', 'modal_price_per_quintal']),
    priceUnit,
    source: 'data.gov.in',
    sourceId: `data.gov.in:${resourceId}`,
    sourceUrl: `https://data.gov.in/resource/${encodeURIComponent(resourceId)}`,
    retrievedAt,
  }
}

export async function fetchMandiObservations({ commodity, state, district, market, limit = 100, options = {} } = {}) {
  const config = getConfig()
  if (config.error) return { data: [], error: config.error, available: false }
  if (!String(commodity || '').trim()) return { data: [], error: new Error('A commodity is required to retrieve mandi observations.'), available: false }

  const retrievedAt = new Date().toISOString()
  const cacheKey = JSON.stringify({ commodity, state, district, market, resourceId: config.resourceId })
  const cached = mandiCache.get(cacheKey)
  const cacheTtlMs = options.cacheTtlMs ?? 30 * 60 * 1000
  if (cached && Date.now() - cached.cachedAt < cacheTtlMs) return cached.value
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const params = new URLSearchParams({
    'api-key': config.apiKey,
    format: 'json',
    limit: String(Math.min(Math.max(Number(limit) || 100, 1), 1000)),
  })
  params.set('filters[Commodity]', String(commodity).trim())
  if (state) params.set('filters[State]', String(state).trim())
  if (district) params.set('filters[District]', String(district).trim())
  if (market) params.set('filters[Market]', String(market).trim())

  try {
    const response = await fetchImpl(`${MANDI_API_BASE}/${encodeURIComponent(config.resourceId)}?${params}`, { signal: controller.signal })
    if (response.status === 401 || response.status === 403) throw new Error('Mandi data authentication was rejected by the provider.')
    if (response.status === 429) throw new Error('Mandi data provider rate limit reached.')
    if (response.status === 404) throw new Error('Configured mandi data resource ID was not found.')
    if (!response.ok) throw new Error(`Mandi data provider returned HTTP ${response.status}.`)
    const payload = await response.json()
    if (!Array.isArray(payload.records)) throw new Error('Mandi data response did not contain a records array.')
    const records = payload.records.map((record) => normalizeRecord(record, retrievedAt, config.priceUnit, config.resourceId))
    if (records.length === 0) throw new Error('No matching mandi observations were returned.')
    if (records.some(record => !record.commodity || !record.observationDate || record.modalPrice === null)) {
      throw new Error('Mandi data response fields or price units could not be verified for this resource.')
    }
    const cutoff = Date.now() - MAX_OBSERVATION_AGE_DAYS * 86400000
    if (records.some(record => Number.isNaN(Date.parse(record.observationDate)) || Date.parse(record.observationDate) < cutoff)) {
      throw new Error(`Mandi observations are older than the ${MAX_OBSERVATION_AGE_DAYS}-day evidence window.`)
    }
    const result = {
      data: records,
      error: null,
      available: true,
      source: 'data.gov.in',
      resourceId: config.resourceId,
      retrievedAt,
    }
    mandiCache.set(cacheKey, { cachedAt: Date.now(), value: result })
    return result
  } catch (error) {
    return {
      data: [],
      error: error.name === 'AbortError' ? new Error('Mandi data request timed out.') : error,
      available: false,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export { mandiCache }
