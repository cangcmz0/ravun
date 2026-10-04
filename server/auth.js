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
function envPinHash() {
  if (process.env.ADMIN_PIN) return sha256Hex(`${PIN_SALT}:${String(process.env.ADMIN_PIN).trim()}`)
  return String(process.env.ADMIN_PIN_HASH || process.env.VITE_ADMIN_PIN_HASH || '').trim().toLowerCase()
}

// Panelden değiştirilen PIN veritabanında (settings, 'admin_auth') scrypt ile
// saklanır ve ortam değişkenindeki PIN'in önüne geçer. Unutulursa Neon/Postgres'te
// bu satır silinince ortam değişkenindeki PIN yeniden geçerli olur.
//   { hash: "scrypt$N$r$p$salt$key", sessionKey, updatedAt }
// sessionKey oturum imzasına katılır: PIN değişince tüm açık oturumlar kapanır.
async function loadAdminAuth() {
  const p = await db()
  const { rows } = await p.query("SELECT data FROM settings WHERE key = 'admin_auth'")
  return rows[0]?.data || {}
}

const SCRYPT = { N: 16384, r: 8, p: 1 }
function scryptAsync(pin, salt, params = SCRYPT) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(pin, salt, 32, { ...params, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))))
}
async function hashPin(pin) {
  const salt = crypto.randomBytes(16)
  const key = await scryptAsync(pin, salt)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}
async function checkScrypt(pin, stored) {
  const [kind, N, r, p, salt, key] = String(stored || '').split('$')
  if (kind !== 'scrypt' || !salt || !key) return false
  const got = await scryptAsync(pin, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) })
  const want = Buffer.from(key, 'base64')
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

export async function adminConfigured() {
  if (envPinHash()) return true
  return Boolean((await loadAdminAuth()).hash)
}

export async function pinInfo() {
  const auth = await loadAdminAuth()
  return { source: auth.hash ? 'panel' : 'env', updatedAt: auth.updatedAt || null, envAvailable: Boolean(envPinHash()) }
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

export async function verifyPin(pin) {
  const normalized = String(pin || '').trim().slice(0, 64)
  if (!normalized) return false
  const auth = await loadAdminAuth()
  if (auth.hash) return checkScrypt(normalized, auth.hash)
  const expected = envPinHash()
  if (!expected) return false
  return safeEqual(sha256Hex(`${PIN_SALT}:${normalized}`), expected)
}

// Yeni PIN kuralları: 6–12 rakam; 000000 ya da 123456 gibi kolay tahmin edilenler reddedilir.
export function pinProblem(pin) {
  const v = String(pin || '').trim()
  if (!/^\d{6,12}$/.test(v)) return 'PIN 6–12 haneli ve yalnızca rakamlardan oluşmalı.'
  if (/^(\d)\1+$/.test(v)) return 'Tüm haneleri aynı olan PIN kullanılamaz.'
  const d = [...v].map(Number)
  const step = d[1] - d[0]
  if (Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return 'Sıralı rakamlardan oluşan PIN (123456 gibi) kullanılamaz.'
  return ''
}

export async function setPanelPin(pin) {
  await (await db()).query(
    `INSERT INTO settings (key, data, updated_at) VALUES ('admin_auth', $1, now())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [{ hash: await hashPin(String(pin).trim()), sessionKey: crypto.randomBytes(16).toString('hex'), updatedAt: new Date().toISOString() }],
  )
}

// Panel PIN'ini kaldırır: ortam değişkenindeki PIN yeniden geçerli olur.
export async function clearPanelPin() {
  await (await db()).query("DELETE FROM settings WHERE key = 'admin_auth'")
}

async function secret() {
  // SESSION_SECRET tanımlıysa o kullanılır; değilse PIN hash'inden türetilir.
  // Panelden PIN değiştirilince sessionKey de değişir ve eski oturumlar geçersizleşir.
  const auth = await loadAdminAuth()
  const base = process.env.SESSION_SECRET || sha256Hex(`ravun-session:${envPinHash()}`)
  return auth.sessionKey ? `${base}:${auth.sessionKey}` : base
}

function sign(payload, key) {
  return crypto.createHmac('sha256', key).update(payload).digest('base64url')
}

export async function createSessionCookie(secure) {
  const exp = Date.now() + SESSION_MS
  const nonce = crypto.randomBytes(12).toString('base64url')
  const payload = `${exp}.${nonce}`
  const token = `${payload}.${sign(payload, await secret())}`
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

export async function isAuthed(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [exp, nonce, sig] = parts
  if (!(Number(exp) > Date.now())) return false
  if (!(await adminConfigured())) return false
  return safeEqual(sig, sign(`${exp}.${nonce}`, await secret()))
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
