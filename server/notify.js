// ── TELEGRAM BİLDİRİMLERİ ──
// Yeni sipariş, yorum ve mesajlar atölyenin Telegram'ına anında düşer.
// Ayarlar panelden girilir ve veritabanında (settings tablosu, 'notify'
// anahtarı) tutulur; bu anahtar herkese açık katalogla asla paylaşılmaz.
// İsteğe bağlı olarak ortam değişkenleriyle de verilebilir:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Bildirim gönderilemezse (Telegram'a ulaşılamaz, token hatalı…) sipariş/yorum
// yine kaydedilir; hata yalnızca sunucu günlüğüne yazılır.
import { cleanText } from './sanitize.js'

const API_BASE = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '')
const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/
const SEND_TIMEOUT_MS = 4000

export const NOTIFY_EVENTS = ['orders', 'reviews', 'messages']

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
}

export function sanitizeNotify(src, prev = {}) {
  const s = src && typeof src === 'object' ? src : {}
  const out = { ...prev }
  // Token yalnızca açıkça gönderildiyse değişir; boş metin token'ı siler.
  if (typeof s.telegramToken === 'string') {
    const t = s.telegramToken.trim()
    if (t && !TOKEN_RE.test(t)) {
      const e = new Error('Bot token biçimi hatalı. BotFather\'ın verdiği "123456:ABC…" metnini olduğu gibi yapıştırın.')
      e.status = 400
      throw e
    }
    out.telegramToken = t
  }
  if (s.telegramChatId !== undefined) {
    const id = String(s.telegramChatId ?? '').trim()
    if (id && !/^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$/.test(id)) {
      const e = new Error('Sohbet kimliği hatalı.')
      e.status = 400
      throw e
    }
    out.telegramChatId = id
  }
  if (s.events && typeof s.events === 'object') {
    out.events = {}
    for (const k of NOTIFY_EVENTS) out.events[k] = s.events[k] !== false
  }
  if (s.paymentInfo !== undefined) out.paymentInfo = String(s.paymentInfo ?? '').replace(/\r/g, '').slice(0, 600).trim()
  if (s.cargoCompany !== undefined) out.cargoCompany = cleanText(s.cargoCompany, 60)
  if (s.cargoTrackUrl !== undefined) {
    const u = String(s.cargoTrackUrl ?? '').trim().slice(0, 300)
    out.cargoTrackUrl = /^https:\/\/[^\s<>"']+$/i.test(u) ? u : ''
  }
  return out
}

export async function loadNotify(client) {
  const { rows } = await client.query("SELECT data FROM settings WHERE key = 'notify'")
  return rows[0]?.data || {}
}

export async function saveNotify(client, data) {
  await client.query(
    `INSERT INTO settings (key, data, updated_at) VALUES ('notify', $1, now())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [data],
  )
}

// Panelde gösterilecek hali: token asla geri gönderilmez.
export function publicNotify(cfg) {
  const token = cfg.telegramToken || process.env.TELEGRAM_BOT_TOKEN || ''
  return {
    hasToken: Boolean(token),
    tokenHint: token ? `…${token.slice(-4)}` : '',
    tokenFromEnv: !cfg.telegramToken && Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramChatId: cfg.telegramChatId || process.env.TELEGRAM_CHAT_ID || '',
    events: Object.fromEntries(NOTIFY_EVENTS.map((k) => [k, cfg.events?.[k] !== false])),
    paymentInfo: cfg.paymentInfo || '',
    cargoCompany: cfg.cargoCompany || '',
    cargoTrackUrl: cfg.cargoTrackUrl || '',
  }
}

function credentials(cfg) {
  return {
    token: cfg.telegramToken || process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: cfg.telegramChatId || process.env.TELEGRAM_CHAT_ID || '',
  }
}

async function callTelegram(token, method, payload) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE()}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: ctrl.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) {
      const e = new Error(telegramError(res.status, data.description))
      e.status = 400
      throw e
    }
    return data.result
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('Telegram yanıt vermedi (zaman aşımı).')
      e.status = 504
      throw e
    }
    if (err.status) throw err
    const e = new Error('Telegram\'a ulaşılamadı.')
    e.status = 502
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function telegramError(status, description = '') {
  const d = String(description || '')
  if (status === 401 || /unauthorized/i.test(d)) return 'Bot token geçersiz. BotFather\'dan aldığınız token\'ı kontrol edin.'
  if (/chat not found/i.test(d)) return 'Sohbet bulunamadı. Bota Telegram\'dan bir mesaj yazıp "Sohbeti bul"a tekrar basın.'
  if (/blocked/i.test(d)) return 'Bot engellenmiş. Telegram\'da botun engelini kaldırın.'
  return `Telegram hatası: ${d || status}`
}

export async function sendTelegram(cfg, text) {
  const { token, chatId } = credentials(cfg)
  if (!token || !chatId) {
    const e = new Error('Önce bot token ve sohbet kimliğini kaydedin.')
    e.status = 400
    throw e
  }
  return callTelegram(token, 'sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
}

// Bota son yazan sohbetleri bulur (kurulumda sohbet kimliğini elle aramaya gerek kalmaz).
export async function detectChats(cfg, tokenOverride) {
  const token = (tokenOverride || '').trim() || credentials(cfg).token
  if (!token) {
    const e = new Error('Önce bot token\'ı girin.')
    e.status = 400
    throw e
  }
  const updates = await callTelegram(token, 'getUpdates', { limit: 50, timeout: 0 })
  const seen = new Map()
  for (const u of Array.isArray(updates) ? updates : []) {
    const chat = (u.message || u.edited_message || u.channel_post || u.my_chat_member)?.chat
    if (!chat?.id) continue
    const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id)
    seen.set(String(chat.id), { id: String(chat.id), name: cleanText(name, 80), type: chat.type })
  }
  return [...seen.values()].reverse()
}

// Olay bildirimi: hata asla yukarı taşınmaz.
export async function notifyEvent(client, kind, text) {
  try {
    const cfg = await loadNotify(client)
    if (cfg.events?.[kind] === false) return false
    const { token, chatId } = credentials(cfg)
    if (!token || !chatId) return false
    await sendTelegram(cfg, text)
    return true
  } catch (err) {
    console.warn(`[notify] ${kind} bildirimi gönderilemedi:`, err.message)
    return false
  }
}

// ── MESAJ METİNLERİ ──
const tl = (n) => `${Math.round(Number(n) || 0).toLocaleString('tr-TR')} TL`

// Bildirimdeki "Panelde aç" linki, isteği karşılayan adrese gider (önizleme
// ortamındaki sipariş önizleme paneline, canlıdaki canlıya). SITE_URL ile sabitlenebilir.
export function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '')
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host
  if (!host) return (process.env.VITE_SITE_URL || '').replace(/\/+$/, '')
  return `${req.secure ? 'https' : 'http'}://${String(host).split(',')[0].trim()}`
}

export function orderMessage(order, origin) {
  const lines = [`🛒 <b>Yeni sipariş</b> · <code>${escapeHtml(order.orderNo)}</code>`, '']
  for (const it of order.items || []) {
    const variant = [it.selectedSize, it.selectedColor].filter(Boolean).join(' · ')
    lines.push(`• ${it.qty} × ${escapeHtml(it.title)}${variant ? ` <i>(${escapeHtml(variant)})</i>` : ''} — ${tl(it.price * it.qty)}`)
    if (it.giftWrap) lines.push(`   🎁 Hediye paketi${it.giftNote ? `: “${escapeHtml(it.giftNote)}”` : ''}`)
  }
  lines.push('')
  if (order.discount) lines.push(`🏷 Kupon ${escapeHtml(order.coupon)}: −${tl(order.discount)}`)
  lines.push(`<b>Toplam: ${tl(order.total)}</b>`)
  lines.push(`👤 ${escapeHtml(order.customerName || '—')}`)
  if (order.customerPhone) lines.push(`📞 ${escapeHtml(order.customerPhone)}`)
  if (order.note) lines.push(`📝 ${escapeHtml(order.note)}`)
  if (origin) lines.push('', `<a href="${escapeHtml(origin)}/admin/orders">Panelde aç</a>`)
  return lines.join('\n')
}

export function reviewMessage(review, productTitle, origin) {
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)
  const lines = [
    `⭐ <b>Yeni yorum onay bekliyor</b>`,
    `${escapeHtml(productTitle || `Ürün ${review.productId}`)} · ${stars}`,
    '',
    `“${escapeHtml(review.text.slice(0, 600))}”`,
    `— ${escapeHtml(review.name)}`,
  ]
  if (review.photos) lines.push(`📷 ${review.photos} fotoğraf eklendi`)
  if (origin) lines.push('', `<a href="${escapeHtml(origin)}/admin/reviews">Onaylamak için panele git</a>`)
  return lines.join('\n')
}

export function contactMessage(msg, origin) {
  const lines = [`✉️ <b>Yeni iletişim mesajı</b>`, `👤 ${escapeHtml(msg.isim)}`]
  if (msg.eposta) lines.push(`📧 ${escapeHtml(msg.eposta)}`)
  if (msg.telefon) lines.push(`📞 ${escapeHtml(msg.telefon)}`)
  if (msg.parca) lines.push(`🪵 ${escapeHtml(msg.parca)}`)
  if (msg.mesaj) lines.push('', escapeHtml(msg.mesaj.slice(0, 1200)))
  if (origin) lines.push('', `<a href="${escapeHtml(origin)}/admin/messages">Panelde aç</a>`)
  return lines.join('\n')
}
