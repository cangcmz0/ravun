// ── NODE HTTP ADAPTÖRÜ ──
// Node'un (req, res) arayüzünü routes.js'in sade istek/yanıt biçimine çevirir.
// Vercel fonksiyonu, Vite dev sunucusu ve VPS sunucusu bunu ortak kullanır.
import { route } from './routes.js'

const MAX_BODY = 4 * 1024 * 1024

async function readBody(req) {
  // Vercel, gövdeyi önceden ayrıştırıp req.body olarak verebilir.
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) return parseJson(req.body.toString('utf8'))
    if (typeof req.body === 'string') return parseJson(req.body)
    return req.body
  }
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) {
      const e = new Error('İstek çok büyük.')
      e.status = 413
      throw e
    }
    chunks.push(chunk)
  }
  return parseJson(Buffer.concat(chunks).toString('utf8'))
}

function parseJson(text) {
  if (!text) return undefined
  try { return JSON.parse(text) } catch {
    const e = new Error('Geçersiz JSON.')
    e.status = 400
    throw e
  }
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return fwd || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

export async function handleNode(req, res) {
  const url = new URL(req.url, 'http://localhost')
  // Vercel'de /api/(.*) → /api/index?__path=$1 olarak yeniden yazılır.
  const path = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '')
  url.searchParams.delete('__path')
  let result
  try {
    const body = await readBody(req)
    result = await route({
      method: req.method,
      path,
      query: Object.fromEntries(url.searchParams),
      body,
      headers: req.headers,
      ip: clientIp(req),
      secure: req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket?.encrypted),
    })
  } catch (err) {
    result = { status: err.status || 500, headers: {}, body: { error: err.status ? err.message : 'Sunucu hatası.' } }
  }
  const headers = { 'X-Content-Type-Options': 'nosniff', ...result.headers }
  let payload = result.body
  if (!Buffer.isBuffer(payload)) {
    headers['Content-Type'] = 'application/json; charset=utf-8'
    payload = JSON.stringify(payload ?? {})
  }
  res.statusCode = result.status
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(payload)
}
