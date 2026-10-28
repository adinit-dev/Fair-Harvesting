import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchMandiObservations } from '../api/lib/mandi.js'

const envNames = ['DATA_GOV_IN_API_KEY', 'DATA_GOV_IN_RESOURCE_ID', 'DATA_GOV_IN_PRICE_UNIT']

function withEnv(values, callback) {
  const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]))
  for (const name of envNames) {
    if (values[name] === undefined) delete process.env[name]
    else process.env[name] = values[name]
  }
  return Promise.resolve(callback()).finally(() => {
    for (const name of envNames) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  })
}

function providerResponse(records) {
  return { ok: true, status: 200, async json() { return { records } } }
}

test('reports missing mandi configuration without fallback data', async () => {
  const result = await withEnv({}, () => fetchMandiObservations({ commodity: 'Rice' }))
  assert.equal(result.available, false)
  assert.deepEqual(result.data, [])
  assert.match(result.error.message, /DATA_GOV_IN_PRICE_UNIT/)
})

test('rejects empty and stale mandi observations', async () => {
  const previousFetch = globalThis.fetch
  const config = {
    DATA_GOV_IN_API_KEY: 'test-key',
    DATA_GOV_IN_RESOURCE_ID: 'test-resource',
    DATA_GOV_IN_PRICE_UNIT: 'INR per quintal',
  }
  try {
    globalThis.fetch = async () => providerResponse([])
    const empty = await withEnv(config, () => fetchMandiObservations({ commodity: 'Rice' }))
    assert.equal(empty.available, false)
    assert.match(empty.error.message, /No matching/)

    globalThis.fetch = async () => providerResponse([{
      commodity: 'Rice',
      arrival_date: '2020-01-01',
      modal_price: '2000',
    }])
    const stale = await withEnv(config, () => fetchMandiObservations({ commodity: 'Rice' }))
    assert.equal(stale.available, false)
    assert.match(stale.error.message, /older/)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('preserves verified unit and source metadata for recent observations', async () => {
  const previousFetch = globalThis.fetch
  const config = {
    DATA_GOV_IN_API_KEY: 'test-key',
    DATA_GOV_IN_RESOURCE_ID: 'test-resource',
    DATA_GOV_IN_PRICE_UNIT: 'INR per quintal',
  }
  try {
    globalThis.fetch = async () => providerResponse([{
      State: 'Meghalaya',
      District: 'Ri-Bhoi',
      Market: 'Test Market',
      Commodity: 'Rice',
      arrival_date: new Date().toISOString().slice(0, 10),
      modal_price: '2000',
    }])
    const result = await withEnv(config, () => fetchMandiObservations({ commodity: 'Rice' }))
    assert.equal(result.available, true)
    assert.equal(result.data[0].priceUnit, 'INR per quintal')
    assert.equal(result.data[0].source, 'data.gov.in')
    assert.equal(result.data[0].market, 'Test Market')
  } finally {
    globalThis.fetch = previousFetch
  }
})
