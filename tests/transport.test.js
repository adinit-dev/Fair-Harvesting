import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateTransport } from '../api/lib/transport.js'

test('returns a farmer-provided transport quote without inventing route data', () => {
  const result = estimateTransport({ quantityKg: 500, transportQuote: 300, destination: 'Market' })
  assert.equal(result.status, 'verified-quote')
  assert.equal(result.amount, 300)
  assert.equal(result.source, 'farmer-provided')
})

test('returns unavailable without a verified rate and source', () => {
  const result = estimateTransport({ quantityKg: 500 })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.amount, null)
})

test('calculates only explicitly configured rate estimates', () => {
  const result = estimateTransport({ quantityKg: 500, ratePerKg: 2, rateSource: 'verified configuration', destination: 'Market' })
  assert.equal(result.status, 'estimated')
  assert.equal(result.amount, 1000)
  assert.equal(result.source, 'verified configuration')
})
