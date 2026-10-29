import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPurchaseComparison, buildSellDecision, buildSellingScenarios, costPerUnit, estimatedNetProceeds, grossProduceValue, pricePerKg, quantityInKg, validateCommonInput } from '../src/lib/assistantCalculations.js'

test('calculates gross value and net proceeds deterministically', () => {
  assert.equal(grossProduceValue(100, 25), 2500)
  assert.equal(estimatedNetProceeds(100, 25, 100, 50), 2350)
  assert.equal(costPerUnit(100, 25, 100, 50), 26.5)
})

test('rejects zero quantities and negative costs', () => {
  assert.ok(validateCommonInput({ produce: 'Rice', quantity: 0, unit: 'kg', currentOffer: 10, transportCost: -1, handlingCost: 0, harvestDate: '2026-10-01' }, 'sell').length >= 2)
})

test('rejects zero selling prices', () => {
  const errors = validateCommonInput({ produce: 'Rice', quantity: 10, unit: 'kg', currentOffer: 0, harvestDate: '2026-10-01', qualityGrade: 'not sure', cropStatus: 'harvested' }, 'sell')
  assert.ok(errors.some(error => error.includes('Current offer')))
})

test('does not invent purchase market data', () => {
  const result = buildPurchaseComparison({ quantity: 10, currentOffer: 20, transportCost: 5, handlingCost: 2 })
  assert.equal(result.marketEvidence, 'Market data unavailable.')
  assert.equal(result.current.deliveredCost, 207)
})

test('builds three selling scenarios without future price predictions', () => {
  const result = buildSellingScenarios({ quantity: 10, unit: 'kg', currentOffer: 20, transportCost: 5, handlingCost: 2, harvestDate: '2026-10-01' })
  assert.equal(result.length, 3)
  assert.equal(result[1].grossRevenue, 200)
  assert.ok(result[2].assumptions.some(item => item.includes('No future price change')))
})

test('validates supported selling units and optional unknown costs', () => {
  const valid = validateCommonInput({ produce: 'Rice', quantity: 10, unit: 'quintal', currentOffer: 2000, harvestDate: '2026-10-01', qualityGrade: 'not sure', cropStatus: 'harvested' }, 'sell')
  assert.deepEqual(valid, [])
  const invalid = validateCommonInput({ produce: 'Rice', quantity: 10, unit: 'bag', currentOffer: 2000, harvestDate: '2026-10-01', qualityGrade: 'A', cropStatus: 'harvested' }, 'sell')
  assert.ok(invalid.some(error => error.includes('kg, quintal, or tonne')))
})

test('does not claim net proceeds when required cost inputs are missing', () => {
  const result = buildSellingScenarios({ quantity: 10, unit: 'kg', currentOffer: 20, transportCost: '', handlingCost: 2, harvestDate: '2026-10-01' })
  assert.equal(result[0].grossRevenue, 200)
  assert.equal(result[0].knownCosts, 2)
  assert.equal(result[0].costStatus, '₹2 in entered costs; other costs are unknown.')
  assert.equal(result[0].netProceeds, null)
})

test('labels market observations as evidence without turning them into forecasts', () => {
  const result = buildSellingScenarios({ quantity: 10, unit: 'kg', currentOffer: 20, transportCost: 5, handlingCost: 2, packagingCost: 1, commissionCost: 1, harvestDate: '2026-10-01' }, [{ modalPrice: '1800' }])
  assert.equal(result[0].observedMarketPricePerUnit, '1800')
  assert.match(result[1].priceAssumption, /not a forecast/)
})

test('converts supported units consistently', () => {
  assert.equal(quantityInKg(2, 'quintal'), 200)
  assert.equal(quantityInKg(1.5, 'tonne'), 1500)
  assert.equal(pricePerKg(2000, 'quintal'), 20)
  assert.equal(pricePerKg(50, 'kg'), 50)
})

test('rejects invalid date order and future harvested dates', () => {
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const errors = validateCommonInput({
    produce: 'Rice',
    quantity: 10,
    unit: 'kg',
    currentOffer: 20,
    harvestDate: future,
    sellingDeadline: '2026-01-01',
    qualityGrade: 'not sure',
    cropStatus: 'harvested',
  }, 'sell')
  assert.ok(errors.some(error => error.includes('future')))
  assert.ok(errors.some(error => error.includes('before the harvest')))
})

test('keeps equivalent quintal, kilogram, and tonne revenue equal', () => {
  const inputs = [
    { quantity: 5, unit: 'quintal', currentOffer: 2000 },
    { quantity: 500, unit: 'kg', currentOffer: 20 },
    { quantity: 0.5, unit: 'tonne', currentOffer: 20000 },
  ]
  const results = inputs.map(input => buildSellingScenarios({ ...input, transportCost: 300, handlingCost: 100, packagingCost: '', commissionCost: '', storageCostPerDay: '', harvestDate: '2026-10-28' }))
  assert.deepEqual(results.map(result => result[0].quantityInKg), [500, 500, 500])
  assert.deepEqual(results.map(result => result[0].pricePerKg), [20, 20, 20])
  assert.deepEqual(results.map(result => result[0].grossRevenue), [10000, 10000, 10000])
  assert.deepEqual(results.map(result => result[0].knownCosts), [400, 400, 400])
  assert.deepEqual(results.map(result => result[0].netProceeds), [null, null, null])
})

test('does not double-count costs and labels waiting prices as hypothetical', () => {
  const result = buildSellingScenarios({
    quantity: 5,
    unit: 'quintal',
    currentOffer: 2000,
    transportCost: 300,
    handlingCost: 100,
    packagingCost: 50,
    commissionCost: 25,
    storageCostPerDay: 10,
    harvestDate: '2026-10-28',
  })
  assert.equal(result[0].knownCosts, 475)
  assert.equal(result[1].knownCosts, 505)
  assert.equal(result[2].knownCosts, 545)
  assert.match(result[1].priceAssumption, /Hypothetical unchanged-price scenario; not a forecast/)
  assert.match(result[2].priceAssumption, /Hypothetical unchanged-price scenario; not a forecast/)
})

test('distinguishes zero entered costs from a zero total and avoids freshness claims', () => {
  const result = buildSellingScenarios({
    quantity: 5,
    unit: 'quintal',
    currentOffer: 2000,
    transportCost: 0,
    handlingCost: 0,
    packagingCost: '',
    commissionCost: '',
    storageCostPerDay: '',
    harvestDate: '2026-10-28',
  })
  assert.equal(result[0].costStatus, '₹0 in entered costs; total costs are unknown.')
  assert.equal(result[0].netProceeds, null)
  assert.match(result[1].freshnessConcern, /unknown/)
  assert.doesNotMatch(result[1].freshnessConcern, /may affect freshness/)
})

test('sell decision uses market benchmark as reference and never invents a hold forecast', () => {
  const result = buildSellDecision({ quantity: 40, unit: 'kg', currentOffer: '', confirmedBuyer: 'unknown' }, {
    available: true,
    medianModalPricePerKg: 80,
    suggestedMinPricePerKg: 75,
    suggestedMaxPricePerKg: 85,
    explanation: 'Verified wholesale benchmark.',
  })
  assert.equal(result.suggestedAskingPrice.median, 80)
  assert.equal(result.hold.available, false)
  assert.match(result.hold.reason, /cannot currently be estimated reliably/)
})

test('sell decision is insufficient evidence without comparable mandi observations', () => {
  const result = buildSellDecision({ quantity: 40, unit: 'kg', currentOffer: '', confirmedBuyer: 'unknown' }, { available: false })
  assert.equal(result.action, 'Insufficient evidence')
  assert.equal(result.suggestedAskingPrice, null)
})

test('rejects invalid prices before any recommendation can be calculated', () => {
  const errors = validateCommonInput({
    produce: 'Rice',
    quantity: 5,
    unit: 'quintal',
    currentOffer: 'not-a-price',
    harvestDate: '2026-10-28',
    qualityGrade: 'not sure',
    cropStatus: 'harvested',
  }, 'sell')
  assert.ok(errors.some(error => error.includes('Current offer')))
})
