// ── ADMIN KİMLİK DOĞRULAMA ──
// PIN artık tarayıcıya hiç gönderilmez/gömülmez; yalnızca sunucu ortam
// değişkenlerinde durur. Oturum, imzalı ve HttpOnly bir çerezle tutulur
// (JavaScript okuyamaz, başka siteden gönderilemez).
import crypto from 'crypto'
import { db } from './db.js'

const PIN_SALT = 'ravun-local-admin-v2'
const COOKIE = 'ravun_admin'
const SESSION_MS = 8 * 60 * 60 * 1000 // 8 saat

export const LOGIN_MAX_FAILS = 5
export const LOGIN_LOCK_MS = 15 * 60 * 1000

function sha256Hex(v) {
  return crypto.createHash('sha256').update(v).digest('hex')
}

// ADMIN_PIN (düz) ya da ADMIN_PIN_HASH (sha256("ravun-local-admin-v2:PIN"))
// kabul edilir. Eski kurulumlardaki VITE_ADMIN_PIN_HASH de geriye dönük okunur.
function expectedPinHash() {
  if (process.env.ADMIN_PIN) return sha256Hex(`${PIN_SALT}:${String(process.env.ADMIN_PIN).trim()}`)
  return String(process.env.ADMIN_PIN_HASH || process.env.VITE_ADMIN_PIN_HASH || '').trim().toLowerCase()
}

export function adminConfigured() {
  return Boolean(expectedPinHash())
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab)
    return false
  }
  return crypto.timingSafeEqual(ab, bb)
}

export function verifyPin(pin) {
  const expected = expectedPinHash()
  const normalized = String(pin || '').trim().slice(0, 64)
  if (!expected || !normalized) return false
  return safeEqual(sha256Hex(`${PIN_SALT}:${normalized}`), expected)
}

function secret() {
  // SESSION_SECRET tanımlıysa o kullanılır; değilse PIN hash'inden türetilir
  // (PIN değişince tüm açık oturumlar otomatik geçersiz olur).
  return process.env.SESSION_SECRET || sha256Hex(`ravun-session:${expectedPinHash()}`)
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createSessionCookie(secure) {
  const exp = Date.now() + SESSION_MS
  const nonce = crypto.randomBytes(12).toString('base64url')
  const payload = `${exp}.${nonce}`
  const token = `${payload}.${sign(payload)}`
  return serializeCookie(COOKIE, token, { maxAge: SESSION_MS / 1000, secure })
}

export function clearSessionCookie(secure) {
  return serializeCookie(COOKIE, '', { maxAge: 0, secure })
}

function serializeCookie(name, value, { maxAge, secure }) {
  return [
    `${name}=${value}`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAge)}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function parseCookies(header) {
  const out = {}
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  })
  return out
}

export function isAuthed(req) {
  if (!adminConfigured()) return false
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [exp, nonce, sig] = parts
  if (!safeEqual(sig, sign(`${exp}.${nonce}`))) return false
  return Number(exp) > Date.now()
}

// ── İSTEK SINIRLAMA (veritabanı üzerinden; sunucusuz ortamda da çalışır) ──
// Pencere içinde `limit` aşıldıysa { ok:false, retryAfter } döner.
export async function rateLimit(key, limit, windowMs, { consume = true } = {}) {
  const p = await db()
  const now = new Date()
  const { rows } = await p.query('SELECT count, reset_at FROM rate_limits WHERE key = $1', [key])
  const row = rows[0]
  const active = row && new Date(row.reset_at) > now
  const count = active ? row.count : 0
  if (count >= limit) {
    return { ok: false, retryAfter: Math.ceil((new Date(row.reset_at) - now) / 1000) }
  }
  if (consume) {
    const reset = active ? row.reset_at : new Date(now.getTime() + windowMs)
    await p.query(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET count = $2, reset_at = $3`,
      [key, count + 1, reset],
    )
  }
  return { ok: true, remaining: limit - count - (consume ? 1 : 0) }
}

export async function clearRateLimit(key) {
  const p = await db()
  await p.query('DELETE FROM rate_limits WHERE key = $1', [key])
}
