const finite = value => typeof value === 'number' && Number.isFinite(value)
const UNIT_TO_KG = { kg: 1, quintal: 100, tonne: 1000 }

export function quantityInKg(quantity, unit) {
  const number = Number(quantity)
  const multiplier = UNIT_TO_KG[String(unit || '').toLowerCase()]
  return finite(number) && multiplier ? Number((number * multiplier).toFixed(6)) : null
}

export function pricePerKg(price, unit) {
  if (price === '' || price === null || price === undefined) return null
  const number = Number(price)
  const multiplier = UNIT_TO_KG[String(unit || '').toLowerCase()]
  return finite(number) && multiplier ? Number((number / multiplier).toFixed(6)) : null
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

export function validateNumber(value, name, { required = true, min = 0 } = {}) {
  if (value === undefined || value === null || value === '') return required ? `${name} is required.` : null
  const number = Number(value)
  if (!finite(number)) return `${name} must be a valid number.`
  if (number < min) return `${name} must be at least ${min}.`
  return null
}

export function validateCommonInput(input, mode) {
  const errors = []
  if (!input || typeof input !== 'object') return ['A JSON object is required.']
  if (!String(input.produce || '').trim()) errors.push('Produce is required.')
  errors.push(validateNumber(input.quantity, 'Quantity', { min: 0.000001 }))
  if (!['kg', 'quintal', 'tonne'].includes(String(input.unit || '').toLowerCase())) errors.push('Unit must be kg, quintal, or tonne.')
  errors.push(validateNumber(input.currentOffer, 'Current offer or budget', { required: false, min: 0 }))
  if (input.currentOffer !== undefined && input.currentOffer !== null && input.currentOffer !== '' && Number(input.currentOffer) <= 0) errors.push('Current offer or budget must be greater than zero when provided.')
  errors.push(validateNumber(input.transportCost, 'Transport cost', { required: false, min: 0 }))
  errors.push(validateNumber(input.transportQuote, 'Transport quote', { required: false, min: 0 }))
  errors.push(validateNumber(input.handlingCost, 'Handling cost', { required: false, min: 0 }))
  errors.push(validateNumber(input.storageCostPerDay, 'Storage cost per day', { required: false, min: 0 }))
  errors.push(validateNumber(input.packagingCost, 'Packaging cost', { required: false, min: 0 }))
  errors.push(validateNumber(input.commissionCost, 'Commission cost', { required: false, min: 0 }))
  if (mode === 'sell') {
    if (!String(input.harvestDate || '').trim()) errors.push('Harvest date is required.')
    else if (!validDate(input.harvestDate)) errors.push('Harvest date must be a valid date.')
    else if (input.cropStatus === 'harvested' && new Date(`${input.harvestDate}T00:00:00Z`) > new Date()) errors.push('Harvest date cannot be in the future.')
    if (!['harvested', 'growing'].includes(input.cropStatus)) errors.push('Crop status must be harvested or growing.')
    if (!String(input.qualityGrade || '').trim()) errors.push('Quality or grade is required; use "not sure" if unknown.')
    if (input.sellingDeadline) {
      if (!validDate(input.sellingDeadline)) errors.push('Selling deadline must be a valid date.')
      else if (new Date(`${input.sellingDeadline}T00:00:00Z`) < new Date(`${input.harvestDate}T00:00:00Z`)) errors.push('Selling deadline cannot be before the harvest date.')
    }
    if (input.minimumPrice !== undefined && input.minimumPrice !== '' && Number(input.minimumPrice) > Number(input.currentOffer)) errors.push('Minimum acceptable price cannot exceed the current offer.')
  }
  if (mode === 'buy' && !String(input.destination || '').trim()) errors.push('Destination is required.')
  if (mode === 'buy' && input.requiredBy) {
    if (!validDate(input.requiredBy)) errors.push('Required-by date must be a valid date.')
    else if (new Date(`${input.requiredBy}T00:00:00Z`) < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) errors.push('Required-by date must not be in the past.')
  }
  return errors.filter(Boolean)
}

export function grossProduceValue(quantity, pricePerUnit) {
  if (pricePerUnit === '' || pricePerUnit === null || pricePerUnit === undefined) return null
  const quantityNumber = Number(quantity)
  const price = Number(pricePerUnit)
  if (!finite(quantityNumber) || !finite(price) || quantityNumber < 0 || price < 0) return null
  return Number((quantityNumber * price).toFixed(2))
}

export function totalKnownCosts(...costValues) {
  if (costValues.some(value => value === undefined || value === null || value === '')) return null
  const numbers = costValues.map(Number)
  if (numbers.some(value => !finite(value) || value < 0)) return null
  return Number(numbers.reduce((total, value) => total + value, 0).toFixed(2))
}

function partialKnownCosts(...costValues) {
  const provided = costValues.filter(value => value !== undefined && value !== null && value !== '')
  const numbers = provided.map(Number)
  if (numbers.some(value => !finite(value) || value < 0)) return null
  return Number(numbers.reduce((total, value) => total + value, 0).toFixed(2))
}

export function estimatedNetProceeds(quantity, pricePerUnit, ...costValues) {
  const gross = grossProduceValue(quantity, pricePerUnit)
  const costs = totalKnownCosts(...costValues)
  return gross === null || costs === null ? null : Number((gross - costs).toFixed(2))
}

export function deliveredCost(quantity, pricePerUnit, transportCost = 0, handlingCost = 0) {
  const gross = grossProduceValue(quantity, pricePerUnit)
  const costs = totalKnownCosts(transportCost, handlingCost)
  return gross === null || costs === null ? null : Number((gross + costs).toFixed(2))
}

export function costPerUnit(quantity, pricePerUnit, transportCost = 0, handlingCost = 0) {
  const total = deliveredCost(quantity, pricePerUnit, transportCost, handlingCost)
  const quantityNumber = Number(quantity)
  return total === null || !finite(quantityNumber) || quantityNumber <= 0 ? null : Number((total / quantityNumber).toFixed(2))
}

function daysFromHarvest(harvestDate) {
  const date = new Date(`${harvestDate}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

function scenarioCosts(input, waitDays) {
  const values = [input.transportCost, input.handlingCost, input.packagingCost, input.commissionCost]
  if (waitDays > 0) values.push(input.storageCostPerDay === '' || input.storageCostPerDay === undefined ? null : Number(input.storageCostPerDay) * waitDays)
  return {
    knownTotal: partialKnownCosts(...values),
    complete: totalKnownCosts(...values) !== null,
  }
}

export function buildSellingScenarios(input, evidence = []) {
  const quantity = Number(input.quantity)
  const price = input.currentOffer === '' || input.currentOffer === null || input.currentOffer === undefined ? null : Number(input.currentOffer)
  const days = daysFromHarvest(input.harvestDate)
  const observedPrice = evidence.find(item => Number(item.modalPrice) >= 0)?.modalPrice
  return [0, 3, 7].map(waitDays => {
    const costSummary = scenarioCosts(input, waitDays)
    return {
      id: waitDays === 0 ? 'now' : `wait-${waitDays}`,
      label: waitDays === 0 ? 'Sell today' : `Wait ${waitDays} days`,
      quantity,
      unit: input.unit,
      quantityInKg: quantityInKg(quantity, input.unit),
      pricePerKg: pricePerKg(price, input.unit),
      priceUnit: input.unit,
      revenueUnit: input.unit,
      priceAssumption: waitDays === 0 ? 'Farmer-provided current offer' : 'Hypothetical unchanged-price scenario; not a forecast',
      assumedPricePerUnit: price,
      observedMarketPricePerUnit: observedPrice ?? null,
      assumptions: ['No future price change is assumed.', 'Freshness and shelf life require crop-specific evidence.'],
      knownCosts: costSummary.knownTotal,
      costsComplete: costSummary.complete,
      costStatus: costSummary.complete
        ? costSummary.knownTotal === 0 ? 'Total entered costs are ₹0.' : 'All scenario costs are entered.'
        : costSummary.knownTotal === 0 ? '₹0 in entered costs; total costs are unknown.' : `₹${costSummary.knownTotal} in entered costs; other costs are unknown.`,
      grossRevenue: grossProduceValue(quantity, price),
      netProceeds: costSummary.complete ? estimatedNetProceeds(quantity, price, costSummary.knownTotal) : null,
      freshnessConcern: days === null ? 'Harvest date unavailable.' : waitDays === 0 ? 'Freshness effect is not assessed without crop-specific evidence.' : 'Freshness effects and shelf life are unknown without verified crop-specific evidence.',
      risks: waitDays === 0 ? ['Current offer may expire if buyer timing changes.'] : ['No future price is predicted.', 'Freshness effects are unknown without verified crop-specific evidence.'],
    }
  })
}

export function buildSellDecision(input, benchmark = null) {
  const quantity = Number(input.quantity)
  const offer = input.currentOffer === '' || input.currentOffer == null ? null : Number(input.currentOffer)
  const hasConfirmedOffer = offer !== null && Number.isFinite(offer) && offer > 0 && input.confirmedBuyer === 'yes'
  const market = benchmark?.available ? benchmark : null
  const quantityKg = quantityInKg(quantity, input.unit)
  const knownCosts = partialSellCosts(input)
  const costsComplete = ![input.transportCost, input.handlingCost, input.packagingCost, input.commissionCost].some(value => value === '' || value === null || value === undefined)
  const scenarios = [{
    id: 'sell-now',
    label: 'Sell now',
    available: hasConfirmedOffer || market !== null,
    pricePerKg: hasConfirmedOffer ? pricePerKg(offer, input.unit) : market?.medianModalPricePerKg ?? null,
    priceBasis: hasConfirmedOffer ? 'confirmed buyer offer' : market ? 'market reference only, not a confirmed sale' : 'unavailable',
    grossRevenue: hasConfirmedOffer ? grossProduceValue(quantity, offer) : market ? Number((quantityKg * market.medianModalPricePerKg).toFixed(2)) : null,
    knownCosts,
    netProceeds: costsComplete && knownCosts !== null && (hasConfirmedOffer || market) ? Number(((hasConfirmedOffer ? grossProduceValue(quantity, offer) : quantityKg * market.medianModalPricePerKg) - knownCosts).toFixed(2)) : null,
    costsComplete,
  }]
  return {
    action: market ? (hasConfirmedOffer ? 'Sell / hold comparison needs evidence' : 'Compare offer and market before selling') : 'Insufficient evidence',
    status: market ? 'Compare alternatives first' : 'Unable to assess reliably',
    suggestedAskingPrice: market ? { min: market.suggestedMinPricePerKg, median: market.medianModalPricePerKg, max: market.suggestedMaxPricePerKg, basis: market.explanation } : null,
    scenarios,
    hold: {
      id: 'hold-3-7-days',
      available: false,
      reason: 'Future price direction cannot currently be estimated reliably from the available data.',
    },
  }
}

function partialSellCosts(input) {
  const values = [input.transportCost, input.handlingCost, input.packagingCost, input.commissionCost]
  const supplied = values.filter(value => value !== '' && value !== null && value !== undefined)
  if (!supplied.length) return null
  const numbers = supplied.map(Number)
  return numbers.some(value => !finite(value) || value < 0) ? null : Number(numbers.reduce((total, value) => total + value, 0).toFixed(2))
}

export function buildPurchaseComparison(input) {
  const quantity = Number(input.quantity)
  const price = input.currentOffer === '' || input.currentOffer === null || input.currentOffer === undefined ? null : Number(input.currentOffer)
  const transportProvided = input.transportCost !== '' && input.transportCost !== null && input.transportCost !== undefined
  const handlingProvided = input.handlingCost !== '' && input.handlingCost !== null && input.handlingCost !== undefined
  const transport = transportProvided ? Number(input.transportCost) : null
  const handling = handlingProvided ? Number(input.handlingCost) : null
  const completeCosts = transport !== null && handling !== null && finite(transport) && finite(handling)
  const alternatives = Array.isArray(input.alternativeOffers) ? input.alternativeOffers : []
  return {
    current: { label: 'Buy now', quotedBy: 'User-provided supplier quote', produceCost: grossProduceValue(quantity, price), deliveredCost: completeCosts ? deliveredCost(quantity, price, transport, handling) : null, costPerUnit: completeCosts ? costPerUnit(quantity, price, transport, handling) : null, costsComplete: completeCosts, risks: ['Availability and delivery timing should be confirmed with the supplier.', ...(completeCosts ? [] : ['Transport and handling costs are incomplete; delivered cost is unavailable.'])] },
    alternatives: alternatives.filter(offer => finite(Number(offer.price))).map(offer => ({ ...offer, source: 'User-provided alternative offer', deliveredCost: offer.transportCost !== undefined && offer.transportCost !== '' && offer.handlingCost !== undefined && offer.handlingCost !== '' ? deliveredCost(quantity, Number(offer.price), Number(offer.transportCost), Number(offer.handlingCost)) : null, costPerUnit: offer.transportCost !== undefined && offer.transportCost !== '' && offer.handlingCost !== undefined && offer.handlingCost !== '' ? costPerUnit(quantity, Number(offer.price), Number(offer.transportCost), Number(offer.handlingCost)) : null })),
    marketEvidence: 'Market data unavailable.',
  }
}
