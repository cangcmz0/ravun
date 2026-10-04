// ── MÜŞTERİ HESABI (Google ile giriş) ──
// Şifre yok: müşteri Google hesabıyla giriş yapar. Akış tamamen sunucuda
// (OAuth "authorization code"): sitede Google'ın betiği çalışmaz, client secret
// tarayıcıya hiç gitmez.
// Gerekli ortam değişkenleri: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Tanımlı değilse giriş kapalıdır ve sitede giriş düğmesi görünmez.
import crypto from 'crypto'
import { db } from './db.js'
import { cleanText } from './sanitize.js'
import { parseCookies } from './auth.js'

const COOKIE = 'ravun_customer'
const STATE_COOKIE = 'ravun_oauth'
const SESSION_MS = 30 * 24 * 60 * 60 * 1000 // 30 gün

const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

// Oturum imzası için anahtar: ortam değişkeni ya da ilk kullanımda üretilip
// veritabanında saklanan rastgele değer (admin PIN'inden bağımsız).
let cachedKey = null
async function sessionKey() {
  if (process.env.CUSTOMER_SESSION_SECRET) return process.env.CUSTOMER_SESSION_SECRET
  if (cachedKey) return cachedKey
  const p = await db()
  await p.query(
    "INSERT INTO settings (key, data) VALUES ('customer_auth', $1) ON CONFLICT (key) DO NOTHING",
    [{ key: crypto.randomBytes(32).toString('hex') }],
  )
  const { rows } = await p.query("SELECT data FROM settings WHERE key = 'customer_auth'")
  cachedKey = rows[0].data.key
  return cachedKey
}

const hmac = (key, v) => crypto.createHmac('sha256', key).update(v).digest('base64url')
function safeEqual(a, b) {
  const ab = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

function cookie(name, value, { maxAge, secure, path = '/api' }) {
  return [`${name}=${value}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAge)}`, secure ? 'Secure' : '']
    .filter(Boolean).join('; ')
}

export async function customerCookie(id, secure) {
  const exp = Date.now() + SESSION_MS
  const payload = `${id}.${exp}`
  return cookie(COOKIE, `${payload}.${hmac(await sessionKey(), payload)}`, { maxAge: SESSION_MS / 1000, secure })
}
export function clearCustomerCookie(secure) {
  return cookie(COOKIE, '', { maxAge: 0, secure })
}

// Geçerli oturum varsa müşteri numarasını döner.
export async function customerId(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (!token) return null
  const [id, exp, sig] = token.split('.')
  if (!id || !exp || !sig || !(Number(exp) > Date.now())) return null
  if (!safeEqual(sig, hmac(await sessionKey(), `${id}.${exp}`))) return null
  const n = Number(id)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export async function loadCustomer(client, id) {
  if (!id) return null
  const { rows } = await client.query('SELECT * FROM customers WHERE id = $1', [id])
  return rows[0] || null
}

// Giriş sonrası dönülecek sayfa: yalnızca sitenin kendi sayfaları.
export function safeReturnPath(v) {
  const s = String(v || '')
  return /^\/(?!\/|api(\/|$))[^\s\\]*$/.test(s) ? s.slice(0, 200) : '/hesabim'
}

// 1) Google'a yönlendirme: CSRF'e karşı tek kullanımlık "state" çereze yazılır.
export function startLogin(req, origin) {
  const state = crypto.randomBytes(16).toString('hex')
  const back = safeReturnPath(req.query?.return)
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })
  return {
    location: `${AUTH_URL()}?${params}`,
    cookie: cookie(STATE_COOKIE, encodeURIComponent(`${state}|${back}`), { maxAge: 600, secure: req.secure, path: '/api/auth' }),
  }
}

function decodeJwtPayload(jwt) {
  const part = String(jwt || '').split('.')[1]
  if (!part) return null
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) } catch { return null }
}

// 2) Google'dan dönüş: kod, sunucudan sunucuya (TLS) token ile değiştirilir.
// Kimlik belirteci doğrudan Google'ın token adresinden alındığı için imza yerine
// iddialar (iss, aud, exp, doğrulanmış e-posta) kontrol edilir (OpenID Connect §3.1.3.7).
export async function finishLogin(req, origin) {
  const fail = (reason) => ({ ok: false, reason })
  const saved = decodeURIComponent(parseCookies(req.headers.cookie)[STATE_COOKIE] || '')
  const [state, back] = saved.split('|')
  if (req.query?.error) return { ...fail('iptal'), back: safeReturnPath(back) }
  if (!state || !req.query?.state || !safeEqual(state, req.query.state) || !req.query.code) return fail('hata')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  let tokens
  try {
    const res = await fetch(TOKEN_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
      signal: ctrl.signal,
    })
    tokens = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.warn('[google] token hatası:', res.status, tokens?.error)
      return fail('hata')
    }
  } catch (err) {
    console.warn('[google] token isteği başarısız:', err.message)
    return fail('hata')
  } finally {
    clearTimeout(timer)
  }

  const c = decodeJwtPayload(tokens.id_token)
  const now = Date.now() / 1000
  if (!c || !['accounts.google.com', 'https://accounts.google.com'].includes(c.iss) || c.aud !== process.env.GOOGLE_CLIENT_ID ||
    !(c.exp > now) || !c.sub || !c.email || c.email_verified === false) {
    console.warn('[google] kimlik belirteci reddedildi')
    return fail('hata')
  }

  const p = await db()
  const { rows } = await p.query(
    `INSERT INTO customers (google_sub, email, name, picture, last_login_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,
       picture = EXCLUDED.picture, last_login_at = now()
     RETURNING id`,
    [cleanText(c.sub, 80), cleanText(c.email, 160), cleanText(c.name || c.email.split('@')[0], 90), safePicture(c.picture)],
  )
  return { ok: true, id: Number(rows[0].id), back: safeReturnPath(back) }
}

export function clearStateCookie(secure) {
  return cookie(STATE_COOKIE, '', { maxAge: 0, secure, path: '/api/auth' })
}

function safePicture(v) {
  const s = String(v || '')
  return /^https:\/\/[a-z0-9.-]*googleusercontent\.com\/[^\s"'<>]*$/i.test(s) ? s.slice(0, 600) : ''
}

export function publicCustomer(row) {
  return row ? { name: row.name, email: row.email, picture: row.picture || '', phone: row.phone || '' } : null
}
