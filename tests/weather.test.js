import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchWeather } from '../api/lib/weather.js'

test('Open-Meteo resolves the requested location and extracts a forecast', async () => {
  const requested = []
  const fetchImpl = async url => {
    requested.push(String(url))
    if (String(url).includes('geocoding-api')) return { ok: true, json: async () => ({ results: [{ name: 'Guwahati', latitude: 26.1445, longitude: 91.7362, country_code: 'IN' }] }) }
    return { ok: true, json: async () => ({ timezone: 'Asia/Kolkata', daily: {
      time: ['2026-10-29', '2026-10-30'], temperature_2m_max: [31, 30], temperature_2m_min: [22, 21], precipitation_sum: [2, 8], precipitation_probability_max: [40, 70], wind_speed_10m_max: [12, 15],
    } }) }
  }
  const result = await fetchWeather('Guwahati', { fetchImpl })
  assert.equal(result.available, true)
  assert.equal(result.location, 'Guwahati')
  assert.equal(result.latitude, 26.1445)
  assert.equal(result.daily[1].precipitationSum, 8)
  assert.equal(result.daily[1].precipitationProbabilityMax, 70)
  assert.ok(requested[1].includes('latitude=26.1445'))
  assert.ok(requested[1].includes('longitude=91.7362'))
})

test('weather remains unavailable for missing location', async () => {
  const result = await fetchWeather('  ')
  assert.equal(result.available, false)
  assert.match(result.message, /location was not provided/i)
})

test('weather handles geocoding errors and malformed forecasts', async () => {
  const geoError = await fetchWeather('UnknownPlaceXYZ', { fetchImpl: async () => ({ ok: true, json: async () => ({ results: [] }) }) })
  assert.equal(geoError.available, false)

  let calls = 0
  const malformed = await fetchWeather('Agartala', { fetchImpl: async () => {
    calls += 1
    if (calls === 1) return { ok: true, json: async () => ({ results: [{ name: 'Agartala', latitude: 23.8, longitude: 91.3, country_code: 'IN' }] }) }
    return { ok: true, json: async () => ({ daily: {} }) }
  } })
  assert.equal(malformed.available, false)
})

test('weather handles an aborted provider request', async () => {
  const result = await fetchWeather('Imphal', {
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error) })
    }),
  })
  assert.equal(result.available, false)
  assert.match(result.message, /timed out/i)
})

test('weather handles provider HTTP errors', async () => {
  const result = await fetchWeather('Shillong', { fetchImpl: async url => String(url).includes('geocoding-api') ? { ok: true, json: async () => ({ results: [{ name: 'Shillong', latitude: 25.5, longitude: 91.9, country_code: 'IN' }] }) } : { ok: false, status: 429 } })
  assert.equal(result.available, false)
})
