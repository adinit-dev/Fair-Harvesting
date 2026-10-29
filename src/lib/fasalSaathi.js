export const createFasalSaathiInput = mode => ({
  produce: '', quantity: '', unit: 'kg', location: '', date: '', quality: 'not sure', price: '',
  ...(mode === 'sell'
    ? { harvestDate: '', currentOffer: '', qualityGrade: 'not sure' }
    : { destination: '', requiredBy: '', qualityRequirements: '', currentOffer: '', alternativeOffers: [] }),
})

export function validateFasalSaathiInput(input, mode) {
  const errors = []
  if (!String(input.produce || '').trim()) errors.push('Produce is required.')
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) errors.push('Quantity must be greater than zero.')
  if (!['kg', 'quintal', 'tonne'].includes(String(input.unit || '').toLowerCase())) errors.push('Choose kg, quintal, or tonne.')
  if (!String(input.location || input.destination || '').trim()) errors.push(`${mode === 'sell' ? 'Location' : 'Delivery location'} is required.`)
  if (mode === 'sell' && !String(input.harvestDate || '').trim()) errors.push('Harvest / availability date is required.')
  if (mode === 'buy' && input.requiredBy && Number.isNaN(new Date(`${input.requiredBy}T00:00:00Z`).getTime())) errors.push('Enter a valid required-by date.')
  if (input.harvestDate && Number.isNaN(new Date(`${input.harvestDate}T00:00:00Z`).getTime())) errors.push('Enter a valid harvest / availability date.')
  if (input.price !== '' && input.price !== undefined && (!Number.isFinite(Number(input.price)) || Number(input.price) < 0)) errors.push('Price must be zero or greater.')
  return errors
}

export function missingFasalSaathiFields(input, mode) {
  const missing = []
  if (!String(input.produce || '').trim()) missing.push('Produce')
  if (!String(input.quantity || '').trim()) missing.push('Quantity')
  if (mode === 'sell') {
    if (!String(input.location || '').trim()) missing.push('Location')
    if (!String(input.harvestDate || '').trim()) missing.push('Availability date')
  } else {
    if (!String(input.destination || '').trim()) missing.push('Delivery location')
  }
  return missing
}

export function extractFasalSaathiSpeech(transcript, mode) {
  const text = String(transcript || '')
  const extracted = {}
  const quantity = text.match(/\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|quintals?|q|tonnes?|tons?)\b/i)
  if (quantity) {
    extracted.quantity = quantity[1]
    const unit = quantity[2].toLowerCase().replace(/s$/, '')
    extracted.unit = unit.startsWith('quintal') || unit === 'q' ? 'quintal' : unit.startsWith('ton') ? 'tonne' : 'kg'
  }
  const price = text.match(/(?:price|offer|budget|₹|rs\.?)\s*(?:is\s*)?(\d+(?:\.\d+)?)/i) || text.match(/(?:at|for)\s+(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?)?/i)
  if (price) extracted.price = price[1]
  const cropText = text.replace(/\b\d+(?:\.\d+)?\s*(?:kg|kgs|kilograms?|quintals?|q|tonnes?|tons?)\b/gi, '').replace(/\b(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:rupees?|₹|rs\.?)\b/gi, '')
  const crop = cropText.match(/(?:sell|buy|produce|crop)\s+(?:of\s+)?([a-z][a-z -]{2,30}?)(?=\s+(?:in|at|near|for|tomorrow|today|with)|[.,]|$)/i)
  if (crop) extracted.produce = crop[1].replace(/\bat\s+\d+.*$/i, '').trim()
  const location = text.match(/(?:in|at|near)\s+([a-z][a-z -]{2,40}?)(?:\s+(?:on|by|for|with|at|tomorrow)|$)/i)
  if (location) extracted[mode === 'sell' ? 'location' : 'destination'] = location[1].trim()
  if (/\btomorrow\b/i.test(text)) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    extracted[mode === 'sell' ? 'harvestDate' : 'requiredBy'] = tomorrow.toISOString().slice(0, 10)
  }
  return extracted
}

export function mergeFasalSaathiExtraction(current, extracted, { manualFields = new Set(), autoFields = new Set(), overrideManual = false } = {}) {
  const updates = {}
  for (const [key, value] of Object.entries(extracted)) {
    if (value === '' || value === null || value === undefined || !String(value).trim()) continue
    if (key === 'quantity' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) continue
    if ((key === 'price' || key === 'currentOffer') && (!Number.isFinite(Number(value)) || Number(value) < 0)) continue
    if (key === 'unit' && !['kg', 'quintal', 'tonne'].includes(String(value).toLowerCase())) continue
    if (manualFields.has(key) && !overrideManual) continue
    const currentValue = String(current[key] ?? '').trim()
    const canUpdate = !currentValue || autoFields.has(key) || overrideManual
    if (canUpdate) updates[key] = value
  }
  return updates
}

export function isLatestExtractionRequest(requestId, currentRequestId) {
  return requestId === currentRequestId
}

export function intentSpecificUnresolved(payload, mode) {
  const requiredIntentFields = mode === 'sell'
    ? ['produce', 'quantity', 'unit', 'location', 'availabilityDate', 'harvestDate']
    : ['produce', 'quantity', 'unit', 'location', 'destination']
  const result = Array.isArray(payload?.unresolved) ? payload.unresolved : []
  return result.filter(field => requiredIntentFields.includes(field)).slice(0, 10)
}

export function buildFasalSaathiAssistantInput(input, mode) {
  if (mode === 'sell') return {
    produce: input.produce,
    quantity: input.quantity,
    unit: input.unit,
    harvestDate: input.harvestDate,
    cropStatus: 'harvested',
    qualityGrade: input.quality,
    state: input.location,
    district: '',
    nearestMarket: '',
    currentOffer: input.price,
    transportCost: '',
    transportQuote: '',
    handlingCost: '',
    storageCostPerDay: '',
    packagingCost: '',
    commissionCost: '',
    sellingDeadline: input.date,
    confirmedBuyer: 'unknown',
    alternativeOffers: [],
  }
  return {
    produce: input.produce,
    quantity: input.quantity,
    unit: input.unit,
    currentOffer: input.price,
    destination: input.destination,
    requiredBy: input.requiredBy,
    qualityRequirements: input.quality,
    transportCost: '',
    handlingCost: '',
    alternativeOffers: [],
  }
}

export function validateProducePhoto(file, maxBytes = 10 * 1024 * 1024) {
  if (!file) return null
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG, or WebP image.'
  if (file.size > maxBytes) return 'The photo must be smaller than 10 MB.'
  return null
}
