const configuredApiBase = String((import.meta.env || {}).VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${configuredApiBase}${normalizedPath}`
}

export function apiHeaders(session, headers = {}) {
  const token = session?.access_token
  return {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function readAssistantResponse(response) {
  const text = await response.text()
  if (!text.trim()) {
    throw new Error(`Assistant API returned an empty response (HTTP ${response.status}). Start the app with the Vercel development command.`)
  }

  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`Assistant API returned a non-JSON response (HTTP ${response.status}). Please try again.`)
  }

  if (!response.ok) {
    const error = new Error(payload.error || `Assistant API request failed (HTTP ${response.status}).`)
    if (Array.isArray(payload.details)) error.details = payload.details
    throw error
  }

  return payload
}
