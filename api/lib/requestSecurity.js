const JSON_TYPES = new Set(['application/json', 'application/*+json'])

function header(req, name) {
  const headers = req?.headers || {}
  return headers[name.toLowerCase()] || headers[name] || ''
}

function validateContentType(req, allowed = 'json') {
  const contentType = String(header(req, 'content-type')).split(';')[0].trim().toLowerCase()
  if (!contentType) return
  if (allowed === 'json' && !([...JSON_TYPES].some(type => type === contentType) || contentType.endsWith('+json'))) {
    throw Object.assign(new Error('Unsupported content type.'), { statusCode: 415 })
  }
  if (allowed === 'audio' && (!contentType.startsWith('audio/') || contentType === 'audio/*')) {
    throw Object.assign(new Error('Unsupported audio type.'), { statusCode: 415 })
  }
}

function bodySize(req) {
  const length = Number(header(req, 'content-length'))
  return Number.isFinite(length) && length >= 0 ? length : 0
}

function bearerToken(req) {
  const value = String(header(req, 'authorization'))
  const match = value.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] || ''
}

async function authenticateSupabaseRequest(req) {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
  if (!url || !anonKey) return { configured: false, user: null }
  const token = bearerToken(req)
  if (!token || token.length > 4096) return { configured: true, user: null }
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return { configured: true, user: null }
    const user = await response.json()
    return { configured: true, user: user?.id ? user : null }
  } catch {
    return { configured: true, user: null, unavailable: true }
  }
}

export { authenticateSupabaseRequest, bodySize, validateContentType }
