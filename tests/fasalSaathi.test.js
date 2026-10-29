import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFasalSaathiAssistantInput, createFasalSaathiInput, extractFasalSaathiSpeech, intentSpecificUnresolved, isLatestExtractionRequest, mergeFasalSaathiExtraction, missingFasalSaathiFields, validateFasalSaathiInput, validateProducePhoto } from '../src/lib/fasalSaathi.js'
import { normalizeExtraction } from '../api/extract.js'
import { buildMandiBenchmark } from '../api/lib/mandiBenchmark.js'

test('sell mode validates the minimal required fields', () => {
  assert.deepEqual(validateFasalSaathiInput(createFasalSaathiInput('sell'), 'sell'), [
    'Produce is required.', 'Quantity must be greater than zero.', 'Location is required.', 'Harvest / availability date is required.'
  ])
})

test('buy mode requires produce, quantity, and delivery location', () => {
  assert.deepEqual(validateFasalSaathiInput(createFasalSaathiInput('buy'), 'buy'), [
    'Produce is required.', 'Quantity must be greater than zero.', 'Delivery location is required.'
  ])
})

test('speech extraction populates supported fields for manual review', () => {
  const extracted = extractFasalSaathiSpeech('sell turmeric 10 quintals at 2000 rupees in Itanagar tomorrow', 'sell')
  assert.equal(extracted.quantity, '10')
  assert.equal(extracted.unit, 'quintal')
  assert.equal(extracted.price, '2000')
  assert.equal(extracted.location, 'Itanagar')
  assert.ok(extracted.harvestDate)
})

test('missing fields remain explicit', () => {
  assert.deepEqual(missingFasalSaathiFields({ produce: 'Rice', quantity: '5', unit: 'kg' }, 'sell'), ['Location', 'Availability date'])
})

test('speech extraction handles the tomato sell example and leaves missing fields explicit', () => {
  const extracted = extractFasalSaathiSpeech('I want to sell 50 kilograms of tomatoes in Guwahati tomorrow.', 'sell')
  assert.deepEqual(extracted, {
    quantity: '50', unit: 'kg', produce: 'tomatoes', location: 'Guwahati', harvestDate: extracted.harvestDate,
  })
  assert.ok(extracted.harvestDate)
})

test('empty speech extraction returns no uncertain fields', () => {
  assert.deepEqual(extractFasalSaathiSpeech('', 'sell'), {})
})

test('merging speech preserves manually entered values', () => {
  const current = { ...createFasalSaathiInput('sell'), produce: 'Turmeric', quantity: '10', location: '' }
  assert.deepEqual(mergeFasalSaathiExtraction(current, { produce: 'Tomatoes', quantity: '50', location: 'Guwahati' }, { manualFields: new Set(['produce', 'quantity']) }), { location: 'Guwahati' })
})

test('explicit voice override changes a protected manual field', () => {
  const current = { ...createFasalSaathiInput('sell'), quantity: '20' }
  const updates = mergeFasalSaathiExtraction(current, { quantity: '50' }, { manualFields: new Set(['quantity']), overrideManual: true })
  assert.deepEqual(updates, { quantity: '50' })
})

test('second recording updates auto-extracted fields and fills missing fields', () => {
  const current = { ...createFasalSaathiInput('sell'), produce: 'Tomatoes', quantity: '20', unit: 'kg' }
  const updates = mergeFasalSaathiExtraction(current, { quantity: '50', location: 'Guwahati', price: '24' }, { autoFields: new Set(['produce', 'quantity', 'unit']) })
  assert.deepEqual(updates, { quantity: '50', location: 'Guwahati', price: '24' })
})

test('empty and invalid extraction values preserve existing fields', () => {
  const current = { produce: 'Tomatoes', quantity: '20', unit: 'kg' }
  assert.deepEqual(mergeFasalSaathiExtraction(current, { produce: '', quantity: '-1', unit: null }), {})
})

test('older extraction responses cannot overwrite the latest recording', () => {
  assert.equal(isLatestExtractionRequest(1, 2), false)
  assert.equal(isLatestExtractionRequest(2, 2), true)
})

test('suggests robust turmeric market range and excludes unrelated commodities', () => {
  const benchmark = buildMandiBenchmark([
    { commodity: 'Turmeric', state: 'Assam', market: 'A', arrival_date: new Date().toISOString().slice(0, 10), modal_price: '8000', min_price: '7000', max_price: '9000', priceUnit: 'INR per quintal' },
    { commodity: 'Turmeric', state: 'Assam', market: 'B', arrival_date: new Date().toISOString().slice(0, 10), modal_price: '8200', min_price: '7200', max_price: '9200', priceUnit: 'INR per quintal' },
    { commodity: 'Rice', state: 'Assam', market: 'C', arrival_date: new Date().toISOString().slice(0, 10), modal_price: '3000', min_price: '2800', max_price: '3200', priceUnit: 'INR per quintal' },
  ], { commodity: 'Turmeric', state: 'Assam' })
  assert.equal(benchmark.available, true)
  assert.equal(benchmark.observationCount, 2)
  assert.equal(benchmark.medianModalPricePerKg, 81)
})

test('sell and buy extraction unresolved fields remain intent-specific', () => {
  assert.deepEqual(intentSpecificUnresolved({ unresolved: ['price', 'quality', 'location'] }, 'sell'), ['location'])
  assert.deepEqual(intentSpecificUnresolved({ unresolved: ['price', 'quality', 'requiredByDate'] }, 'buy'), [])
})

test('sell and buy inputs use their existing assistant contracts', () => {
  const sell = buildFasalSaathiAssistantInput({ produce: 'Tomatoes', quantity: '50', unit: 'kg', harvestDate: '2026-10-29', quality: 'A', location: 'Guwahati', price: '24', date: '' }, 'sell')
  assert.equal(sell.state, 'Guwahati')
  assert.equal(sell.harvestDate, '2026-10-29')
  const buy = buildFasalSaathiAssistantInput({ produce: 'Tomatoes', quantity: '50', unit: 'kg', destination: 'Guwahati', requiredBy: '2026-10-30', quality: 'A', price: '24' }, 'buy')
  assert.equal(buy.destination, 'Guwahati')
  assert.equal(buy.requiredBy, '2026-10-30')
})

test('structured extraction preserves nulls and normalizes spoken units', () => {
  const result = normalizeExtraction({ intent: 'sell', produce: 'Tomatoes', quantity: '50', unit: 'kilograms', location: { market: 'Guwahati' }, availabilityDate: null, unresolved: ['quality'] }, 'sell tomatoes', 'sell')
  assert.equal(result.unit, 'kg')
  assert.equal(result.location, 'Guwahati')
  assert.equal(result.availabilityDate, null)
  assert.deepEqual(result.unresolved, ['quality'])
})

test('structured extraction rejects invalid quantities and prices', () => {
  const result = normalizeExtraction({ intent: 'sell', quantity: '-1', price: 'not-a-price' }, 'sell', 'sell')
  assert.equal(result.quantity, null)
  assert.equal(result.price, null)
})

test('mandi benchmark uses normalized recent modal observations', () => {
  const benchmark = buildMandiBenchmark([
    { observationDate: new Date().toISOString().slice(0, 10), modalPrice: 2000, priceUnit: 'INR per quintal', commodity: 'Tomato' },
    { observationDate: new Date().toISOString().slice(0, 10), modalPrice: 2400, priceUnit: 'INR per quintal', commodity: 'Tomato' },
  ])
  assert.equal(benchmark.available, true)
  assert.equal(benchmark.observationCount, 2)
  assert.equal(benchmark.medianModalPricePerKg, 22)
})

test('mandi benchmark excludes unrelated commodities and stale records', () => {
  const today = new Date().toISOString().slice(0, 10)
  const benchmark = buildMandiBenchmark([
    { observationDate: today, modalPrice: 2000, priceUnit: 'INR per quintal', commodity: 'Turmeric' },
    { observationDate: today, modalPrice: 900, priceUnit: 'INR per quintal', commodity: 'Turmeric raw' },
    { observationDate: today, modalPrice: 50, priceUnit: 'INR per kilogram', commodity: 'Rice' },
    { observationDate: '2020-01-01', modalPrice: 2200, priceUnit: 'INR per quintal', commodity: 'Turmeric' },
  ], { commodity: 'Turmeric' })
  assert.equal(benchmark.available, true)
  assert.equal(benchmark.observationCount, 1)
  assert.equal(benchmark.medianModalPricePerKg, 20)
})

test('photo validation supports common produce images and rejects unsafe files', () => {
  assert.equal(validateProducePhoto({ type: 'image/jpeg', size: 1024 }), null)
  assert.match(validateProducePhoto({ type: 'application/pdf', size: 1024 }), /JPG, PNG, or WebP/)
  assert.match(validateProducePhoto({ type: 'image/png', size: 11 * 1024 * 1024 }), /smaller than 10 MB/) 
})
