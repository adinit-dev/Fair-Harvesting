const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast'
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search'
const DEFAULT_TIMEOUT_MS = 8000
const weatherCache = new Map()

function unavailable(message) {
  return { available: false, provider: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/', message }
}

function validCoordinates(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 && Number(longitude) >= -180 && Number(longitude) <= 180
}

export async function fetchWeather(location, options = {}) {
  const query = String(location || '').trim()
  if (!query) return unavailable('Weather is unavailable because a location was not provided.')
  const cacheKey = query.toLowerCase()
  const cached = weatherCache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < 10 * 60 * 1000) return cached.value

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const geoResponse = await fetchImpl(`${GEOCODING_BASE}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`, { signal: controller.signal })
    if (!geoResponse.ok) throw new Error(`Weather location lookup returned HTTP ${geoResponse.status}.`)
    const geoPayload = await geoResponse.json()
    const place = Array.isArray(geoPayload.results)
      ? geoPayload.results.find(item => String(item.country_code || '').toUpperCase() === 'IN') || geoPayload.results[0]
      : null
    const latitude = place?.latitude
    const longitude = place?.longitude
    if (!place || !validCoordinates(latitude, longitude)) throw new Error('The entered location could not be resolved to valid coordinates.')

    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
      forecast_days: '7', timezone: 'auto',
    })
    const response = await fetchImpl(`${WEATHER_BASE}?${params}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}.`)
    const payload = await response.json()
    const daily = payload.daily
    if (!Array.isArray(daily?.time) || !daily.time.length) throw new Error('Open-Meteo returned no forecast days.')
    const retrievedAt = new Date().toISOString()
    const result = {
      available: true,
      provider: 'Open-Meteo',
      location: place.name || query,
      locationInput: query,
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezone: payload.timezone || null,
      forecastPeriod: { start: daily.time[0], end: daily.time[daily.time.length - 1] },
      daily: daily.time.map((date, index) => ({
        date,
        temperatureMax: daily.temperature_2m_max?.[index] ?? null,
        temperatureMin: daily.temperature_2m_min?.[index] ?? null,
        precipitationSum: daily.precipitation_sum?.[index] ?? null,
        precipitationProbabilityMax: daily.precipitation_probability_max?.[index] ?? null,
        windSpeedMax: daily.wind_speed_10m_max?.[index] ?? null,
      })),
      retrievedAt,
      sourceUrl: 'https://open-meteo.com/',
      attribution: 'Weather data by Open-Meteo.',
    }
    weatherCache.set(cacheKey, { cachedAt: Date.now(), value: result })
    return result
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Weather forecast request timed out.'
      : error?.message || 'Weather forecast is currently unavailable.'
    return unavailable(message)
  } finally {
    clearTimeout(timeout)
  }
}

export { weatherCache }
