const SUPABASE_REST_TIMEOUT_MS = 8000

function normalizeUnit(unit) {
  const value = String(unit || '').trim().toLowerCase()
  if (['kg', 'kilogram', 'kilograms'].includes(value)) return { unit: 'kg', divisor: 1 }
  if (['quintal', 'quintals'].includes(value)) return { unit: 'quintal', divisor: 100 }
  if (['tonne', 'ton', 'metric ton', 'metric tonne', 'tonnes'].includes(value)) return { unit: 'tonne', divisor: 1000 }
  return null
}

function normalizeCommodity(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

export async function fetchPlatformListings({ commodity, state, district, limit = 100, options = {} } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key || !commodity) return { available: false, observations: [], message: commodity ? 'Platform listing comparison unavailable because Supabase is not configured for server access.' : 'A commodity is required.' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? SUPABASE_REST_TIMEOUT_MS)
  try {
    const params = new URLSearchParams({ select: 'id,produce_name,variety,quantity,unit,asking_price_per_unit,min_price_per_unit,state,district,village,quality_grade,harvest_date,created_at,status', status: 'eq.active', produce_name: `ilike.${commodity}` })
    params.set('limit', String(Math.min(Math.max(Number(limit) || 100, 1), 500)))
    const response = await (options.fetchImpl || globalThis.fetch)(`${url.replace(/\/$/, '')}/rest/v1/produce_listings?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Platform listing provider returned HTTP ${response.status}.`)
    const records = await response.json()
    if (!Array.isArray(records)) throw new Error('Platform listing response was malformed.')
    const target = normalizeCommodity(commodity)
    const targetState = String(state || '').trim().toLowerCase()
    const targetDistrict = String(district || '').trim().toLowerCase()
    const observations = records.map(record => {
      const normalizedUnit = normalizeUnit(record.unit)
      const price = Number(record.asking_price_per_unit ?? record.min_price_per_unit)
      if (!normalizedUnit || !Number.isFinite(price) || price < 0) return null
      return {
        id: record.id,
        source: 'FasalSaathi listing',
        sourceId: `platform-listing:${record.id}`,
        commodity: record.produce_name,
        variety: record.variety || null,
        quality: record.quality_grade || null,
        state: record.state || null,
        district: record.district || null,
        village: record.village || null,
        quantity: Number(record.quantity),
        unit: normalizedUnit.unit,
        pricePerUnit: price,
        pricePerKg: Number((price / normalizedUnit.divisor).toFixed(6)),
        observationDate: record.harvest_date || record.created_at?.slice(0, 10),
        priceType: record.asking_price_per_unit != null ? 'asking price' : 'minimum acceptable price',
      }
    }).filter(Boolean).filter(record => normalizeCommodity(record.commodity) === target && (!targetState || !record.state || record.state.toLowerCase() === targetState) && (!targetDistrict || !record.district || record.district.toLowerCase() === targetDistrict))

    const validDates = observations.filter(record => !Number.isNaN(Date.parse(record.observationDate)))
    const unique = Array.from(new Map(validDates.map(record => [record.id, record])).values())
    return { available: unique.length > 0, observations: unique, retrievedAt: new Date().toISOString(), message: unique.length ? undefined : 'No comparable active FasalSaathi listings were found.' }
  } catch (error) {
    return { available: false, observations: [], message: error.name === 'AbortError' ? 'Platform listing request timed out.' : 'Platform listing comparison is temporarily unavailable.' }
  } finally {
    clearTimeout(timeout)
  }
}

export { normalizeUnit }
