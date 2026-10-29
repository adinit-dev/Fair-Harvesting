import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchPlatformListings } from '../api/lib/platformListings.js'

const envNames = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

function withEnv(values, callback) {
  const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]))
  envNames.forEach(name => delete process.env[name])
  Object.assign(process.env, values)
  return Promise.resolve(callback()).finally(() => {
    envNames.forEach(name => delete process.env[name])
    Object.entries(previous).forEach(([name, value]) => { if (value !== undefined) process.env[name] = value })
  })
}

test('platform listings normalize units and reject unrelated commodities', async () => {
  const rows = [
    { id: '1', produce_name: 'Turmeric', quantity: 5, unit: 'quintal', asking_price_per_unit: 2000, state: 'Arunachal Pradesh', district: 'Itanagar', harvest_date: '2026-10-21', status: 'active' },
    { id: '2', produce_name: 'Rice', quantity: 10, unit: 'quintal', asking_price_per_unit: 3000, state: 'Arunachal Pradesh', district: 'Itanagar', harvest_date: '2026-10-21', status: 'active' },
  ]
  const result = await withEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-key' }, () => fetchPlatformListings({ commodity: 'Turmeric', state: 'Arunachal Pradesh', options: { fetchImpl: async () => ({ ok: true, status: 200, async json() { return rows } }) } }))
  assert.equal(result.available, true)
  assert.equal(result.observations.length, 1)
  assert.equal(result.observations[0].pricePerKg, 20)
  assert.equal(result.observations[0].priceType, 'asking price')
})

test('platform listing comparison reports unavailable configuration honestly', async () => {
  const result = await withEnv({}, () => fetchPlatformListings({ commodity: 'Tomato' }))
  assert.equal(result.available, false)
  assert.deepEqual(result.observations, [])
  assert.match(result.message, /not configured/i)
})
