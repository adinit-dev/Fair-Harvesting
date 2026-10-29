export function median(values) {
  const numbers = values.map(Number).filter(value => Number.isFinite(value)).sort((a, b) => a - b)
  if (!numbers.length) return null
  const middle = Math.floor(numbers.length / 2)
  return numbers.length % 2 ? numbers[middle] : Number(((numbers[middle - 1] + numbers[middle]) / 2).toFixed(2))
}

export function parsePriceUnit(unit) {
  const normalized = String(unit || '').toLowerCase().replace(/inr\s*/g, '').replace(/rupees?/g, '₹').trim()
  if (/quintal|100\s*kg/.test(normalized)) return { unit: 'quintal', kgMultiplier: 100 }
  if (/tonne|metric\s*ton/.test(normalized)) return { unit: 'tonne', kgMultiplier: 1000 }
  if (/\bkg\b|kilogram/.test(normalized)) return { unit: 'kg', kgMultiplier: 1 }
  return null
}

export function normalizeObservedModal(record) {
  record = { ...record, observationDate: record.observationDate || record.arrival_date || record.arrivalDate || record['Arrival_Date'] || record.date, modalPrice: record.modalPrice ?? record.modal_price ?? record['Modal Price'], commodity: record.commodity || record.Commodity, state: record.state || record.State, market: record.market || record.Market }
  const parsed = parsePriceUnit(record.priceUnit)
  const modal = Number(record.modalPrice)
  if (!parsed || !Number.isFinite(modal) || modal < 0) return null
  return {
    ...record,
    normalizedUnit: parsed.unit,
    modalPricePerKg: Number((modal / parsed.kgMultiplier).toFixed(6)),
  }
}

function normalizedCommodity(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

export function buildMandiBenchmark(records, { maxAgeDays = 7, commodity = '', state = '' } = {}) {
  const cutoff = Date.now() - maxAgeDays * 86400000
  const targetCommodity = normalizedCommodity(commodity)
  const targetState = String(state || '').trim().toLowerCase()
  const comparable = records.map(normalizeObservedModal).filter(Boolean).filter(record => {
    const observedAt = Date.parse(record.observationDate)
    const commodityMatches = !targetCommodity || normalizedCommodity(record.commodity) === targetCommodity
    const stateMatches = !targetState || !record.state || String(record.state).trim().toLowerCase() === targetState
    return !Number.isNaN(observedAt) && observedAt >= cutoff && commodityMatches && stateMatches
  })
  if (!comparable.length) return { available: false, observationCount: 0, modalPrices: [], minModalPrice: null, medianModalPrice: null, maxModalPrice: null, suggestedMinPricePerKg: null, suggestedMaxPricePerKg: null, records: [], confidence: 'Insufficient evidence', explanation: 'No sufficiently recent comparable observations were verified.' }
  const modalities = comparable.map(record => record.modalPricePerKg).sort((a, b) => a - b)
  const medianValue = median(modalities)
  const lower = median(modalities.slice(0, Math.floor(modalities.length / 2)))
  const upper = median(modalities.slice(Math.ceil(modalities.length / 2)))
  const newest = comparable.map(record => record.observationDate).sort().at(-1)
  const freshnessDays = Math.max(0, Math.floor((Date.now() - Date.parse(newest)) / 86400000))
  const confidence = comparable.length >= 5 && freshnessDays <= 2 ? 'Higher' : comparable.length >= 3 && freshnessDays <= 7 ? 'Moderate' : 'Low'
  return {
    available: true,
    observationCount: comparable.length,
    records: comparable,
    modalPricesPerKg: modalities,
    minModalPricePerKg: modalities[0],
    medianModalPricePerKg: medianValue,
    maxModalPricePerKg: modalities[modalities.length - 1],
    suggestedMinPricePerKg: lower ?? modalities[0],
    suggestedMaxPricePerKg: upper ?? modalities.at(-1),
    newestObservationDate: newest,
    freshnessDays,
    confidence,
    scope: targetState && comparable.every(record => String(record.state || '').trim().toLowerCase() === targetState) ? 'Local/state observations' : 'Regional proxy observations',
    explanation: `Robust reference range uses median halves of ${comparable.length} recent comparable wholesale observations normalized to INR per kg. It is not a guaranteed farm-gate offer.`,
  }
}
