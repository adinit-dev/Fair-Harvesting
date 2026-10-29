const MAX_AUDIO_BYTES = 10 * 1024 * 1024
import { authenticateSupabaseRequest, bodySize, validateContentType } from './lib/requestSecurity.js'

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify(body))
}

async function requestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body
    if (req.body instanceof Uint8Array) return Buffer.from(req.body.buffer, req.body.byteOffset, req.body.byteLength)
    if (typeof req.body === 'string') return Buffer.from(req.body)
  }
  if (typeof req.arrayBuffer === 'function') return Buffer.from(await req.arrayBuffer())
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_AUDIO_BYTES) { reject(new Error('Audio is too large.')); return }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST is required.' })
  try {
    validateContentType(req, 'audio')
    if (bodySize(req) > MAX_AUDIO_BYTES) return json(res, 413, { error: 'The recording is too large. Please record a shorter message.' })
    const auth = await authenticateSupabaseRequest(req)
    if (auth.configured && !auth.user) return json(res, auth.unavailable ? 503 : 401, { error: auth.unavailable ? 'Authentication service is temporarily unavailable.' : 'Authentication is required.' })
  } catch (error) {
    return json(res, error.statusCode || 400, { error: error.statusCode === 415 ? error.message : 'Invalid transcription request.' })
  }
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) return json(res, 503, { error: 'Voice transcription is unavailable because GROQ_API_KEY is not configured. You can continue manually.' })

  try {
    const audio = await requestBody(req)
    if (!audio.length) return json(res, 400, { error: 'The recording is empty. Please record again.' })
    if (audio.length > MAX_AUDIO_BYTES) return json(res, 413, { error: 'The recording is too large. Please record a shorter message.' })

    const extension = String(req.headers['x-fasal-audio-extension'] || 'webm').replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'webm'
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim() || 'audio/webm'
    const form = new FormData()
    form.append('file', new Blob([audio], { type: mime }), `recording.${extension}`)
    form.append('model', 'whisper-large-v3-turbo')
    form.append('response_format', 'json')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    let transcription
    try {
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      })
      if (!response.ok) return json(res, 502, { error: 'The configured speech service rejected the recording. Please retry or enter details manually.' })
      transcription = await response.json()
    } finally {
      clearTimeout(timeout)
    }

    const text = typeof transcription?.text === 'string' ? transcription.text.trim() : ''
    if (!text) return json(res, 200, { text: '', error: 'No speech was detected. Please retry or type manually.' })
    return json(res, 200, { text })
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'Speech transcription timed out. Please retry with a shorter recording.'
      : 'Voice analysis failed. Your recording was kept; please retry or enter details manually.'
    return json(res, 502, { error: message })
  }
}
