// ── API YÖNLENDİRİCİ ──
// Çerçeveden bağımsız: { method, path, query, body, headers, ip, secure }
// alır, { status, headers, body } döner. Vercel fonksiyonu, Vite geliştirme
// sunucusu ve VPS'teki bağımsız Node sunucusu aynı fonksiyonu kullanır.
import crypto from 'crypto'
import { db, tx } from './db.js'
import {
  adminConfigured, verifyPin, isAuthed, createSessionCookie, clearSessionCookie,
  rateLimit, clearRateLimit, LOGIN_MAX_FAILS, LOGIN_LOCK_MS,
} from './auth.js'
import {
  cleanText, safeNumber, sanitizeProduct, sanitizeSettings, sanitizeReviewInput,
  sanitizeContactInput, ORDER_STATUS_KEYS,
} from './sanitize.js'
import {
  loadNotify, saveNotify, sanitizeNotify, publicNotify, sendTelegram, detectChats,
  notifyEvent, orderMessage, reviewMessage, contactMessage, siteOrigin,
} from './notify.js'

const json = (status, body, headers = {}) => ({ status, headers, body })
const fail = (status, error, extra = {}) => json(status, { error, ...extra })
const NO_STORE = { 'Cache-Control': 'no-store' }

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
function monthLabel(d) {
  const date = new Date(d)
  return `${MONTHS_TR[date.getMonth()]} ${date.getFullYear()}`
}

function reviewRow(r) {
  return {
    id: Number(r.id),
    productId: r.product_id,
    name: r.name,
    avatar: (r.name || 'R').charAt(0).toLocaleUpperCase('tr-TR'),
    rating: r.rating,
    date: r.date_label || monthLabel(r.created_at),
    text: r.text,
    helpful: r.helpful,
    approved: r.approved,
    createdAt: r.created_at,
  }
}

function groupReviews(rows) {
  const out = {}
  for (const r of rows) (out[r.product_id] ||= []).push(reviewRow(r))
  return out
}

function orderRow(r) {
  return {
    ...r.data,
    id: Number(r.id),
    orderNo: r.order_no,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function makeOrderNo() {
  const d = new Date()
  const ymd = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `RVN-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

function productOrderable(p) {
  if (!p || p.visible === false) return false
  const st = String(p.status || '').toLowerCase()
  return !['sold', 'similar', 'draft'].includes(st)
}

async function loadSettings(client) {
  const { rows } = await client.query("SELECT data FROM settings WHERE key = 'site'")
  return rows[0]?.data || {}
}

// ── HALKA AÇIK UÇLAR ──
async function getCatalog() {
  const p = await db()
  const [products, reviews, settings] = await Promise.all([
    p.query('SELECT data FROM products ORDER BY id'),
    p.query('SELECT * FROM reviews WHERE approved ORDER BY created_at DESC, id DESC'),
    loadSettings(p),
  ])
  return json(200, {
    products: products.rows.map((r) => r.data).filter((x) => x.visible !== false),
    reviews: groupReviews(reviews.rows),
    settings,
  }, {
    // Tarayıcı her açılışta güncel veriyi ister; yalnızca Vercel CDN'i kısa
    // süre önbelleğe alır (panel değişiklikleri en geç ~30 sn içinde yayına çıkar).
    'Cache-Control': 'no-cache',
    'Vercel-CDN-Cache-Control': 'max-age=30, stale-while-revalidate=300',
  })
}

async function createOrder(req) {
  const rl = await rateLimit(`order:${req.ip}`, 10, 10 * 60 * 1000)
  if (!rl.ok) return fail(429, 'Çok fazla sipariş denemesi. Lütfen biraz sonra tekrar deneyin.', { retryAfter: rl.retryAfter })
  const body = req.body || {}
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : []
  if (!items.length) return fail(400, 'Sepet boş.')
  const result = await tx(async (client) => {
    const ids = [...new Set(items.map((i) => Math.round(Number(i?.baseId ?? i?.id))).filter(Number.isFinite))]
    const { rows } = await client.query('SELECT id, data FROM products WHERE id = ANY($1::int[])', [ids])
    const byId = new Map(rows.map((r) => [r.id, r.data]))
    const settings = await loadSettings(client)
    const giftPrice = safeNumber(settings.giftPrice, 180, 0, 100000)
    const lines = []
    for (const it of items) {
      const prod = byId.get(Math.round(Number(it?.baseId ?? it?.id)))
      if (!productOrderable(prod)) continue
      const giftWrap = Boolean(it.giftWrap) && prod.giftEligible !== false
      const unit = safeNumber(prod.price, 0) + (giftWrap ? giftPrice : 0)
      lines.push({
        id: cleanText(it.id ?? prod.id, 80),
        baseId: prod.id,
        title: prod.title,
        price: unit,
        giftPrice: giftWrap ? giftPrice : 0,
        qty: Math.round(safeNumber(it.qty, 1, 1, 99)),
        image: prod.image,
        certificateNo: prod.certificateNo,
        status: prod.status,
        selectedSize: cleanText(it.selectedSize, 60),
        selectedColor: cleanText(it.selectedColor, 60),
        giftWrap,
        giftStyle: giftWrap ? cleanText(it.giftStyle, 80) : '',
        giftNote: giftWrap ? cleanText(it.giftNote, 300) : '',
        giftRecipient: giftWrap ? cleanText(it.giftRecipient, 80) : '',
        giftDelivery: giftWrap ? cleanText(it.giftDelivery, 80) : '',
      })
    }
    if (!lines.length) return fail(409, 'Sepetteki ürünler artık satışta değil.')
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0)
    const data = {
      items: lines,
      total,
      customerName: cleanText(body.customerName, 90),
      customerPhone: cleanText(body.customerPhone, 30),
      note: cleanText(body.note, 500),
      cargoCode: '',
      source: 'site',
      history: [{ status: 'pending', at: new Date().toISOString() }],
    }
    let orderNo = makeOrderNo()
    for (let attempt = 0; attempt < 3; attempt++) {
      const ins = await client.query(
        'INSERT INTO orders (order_no, status, data) VALUES ($1, $2, $3) ON CONFLICT (order_no) DO NOTHING RETURNING *',
        [orderNo, 'pending', data],
      )
      if (ins.rowCount) return json(201, { order: orderRow(ins.rows[0]) })
      orderNo = makeOrderNo()
    }
    return fail(500, 'Sipariş numarası üretilemedi.')
  })
  // Bildirim, sipariş kesin olarak kaydedildikten sonra gönderilir.
  if (result.status === 201) await notifyEvent(await db(), 'orders', orderMessage(result.body.order, siteOrigin(req)))
  return result
}

// ── SİPARİŞ TAKİBİ (müşteri) ──
// Sipariş numarası + siparişte verilen telefonun son 4 hanesi ile sorgulanır.
// Müşterinin adı/telefonu/notu gibi kişisel bilgiler yanıtta yer almaz.
const compactNo = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

async function trackOrder(req) {
  const rl = await rateLimit(`track:${req.ip}`, 20, 10 * 60 * 1000)
  if (!rl.ok) return fail(429, 'Çok fazla sorgu yapıldı. Lütfen biraz sonra tekrar deneyin.', { retryAfter: rl.retryAfter })
  const no = compactNo(req.body?.orderNo).slice(0, 40)
  const phone = String(req.body?.phone || '').replace(/\D/g, '')
  if (no.length < 6 || phone.length < 4) return fail(400, 'Sipariş numarasını ve telefonunuzun son 4 hanesini yazın.')
  const p = await db()
  const { rows } = await p.query(
    "SELECT * FROM orders WHERE regexp_replace(upper(order_no), '[^A-Z0-9]', '', 'g') = $1 LIMIT 1",
    [no],
  )
  const row = rows[0]
  const stored = String(row?.data?.customerPhone || '').replace(/\D/g, '')
  if (!row || stored.length < 4 || stored.slice(-4) !== phone.slice(-4)) {
    return fail(404, 'Bu bilgilerle eşleşen sipariş bulunamadı. Sipariş numarasını ve telefonu kontrol edin.')
  }
  const o = orderRow(row)
  const cfg = await loadNotify(p)
  const code = o.cargoCode || ''
  const tpl = cfg.cargoTrackUrl || ''
  return json(200, {
    order: {
      orderNo: o.orderNo,
      status: o.status,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      history: Array.isArray(o.history) ? o.history.slice(-30) : [],
      firstName: String(o.customerName || '').trim().split(/\s+/)[0] || '',
      total: o.total,
      cargoCode: code,
      cargoCompany: code ? cfg.cargoCompany || '' : '',
      cargoTrackUrl: code && tpl ? tpl.replace(/\{kod\}/g, encodeURIComponent(code)) : '',
      items: (o.items || []).map((it) => ({
        baseId: it.baseId,
        title: it.title,
        qty: it.qty,
        price: it.price,
        image: it.image,
        selectedSize: it.selectedSize,
        selectedColor: it.selectedColor,
        giftWrap: Boolean(it.giftWrap),
      })),
    },
  }, NO_STORE)
}

async function createReview(req) {
  const productId = Math.round(Number(req.body?.productId))
  const { name, text, rating } = sanitizeReviewInput(req.body)
  if (!Number.isFinite(productId) || !name || !text) return fail(400, 'Ad ve yorum zorunludur.')
  const rl = await rateLimit(`review:${req.ip}`, 5, 60 * 60 * 1000)
  if (!rl.ok) return fail(429, 'Çok fazla yorum gönderildi. Lütfen daha sonra tekrar deneyin.', { retryAfter: rl.retryAfter })
  const p = await db()
  const exists = await p.query("SELECT data->>'title' AS title FROM products WHERE id = $1", [productId])
  if (!exists.rowCount) return fail(404, 'Ürün bulunamadı.')
  await p.query('INSERT INTO reviews (product_id, name, rating, text, approved) VALUES ($1,$2,$3,$4,false)', [productId, name, rating, text])
  await notifyEvent(p, 'reviews', reviewMessage({ productId, name, rating, text }, exists.rows[0].title, siteOrigin(req)))
  return json(201, { ok: true, pending: true })
}

async function markHelpful(req, id) {
  const reviewId = Math.round(Number(id))
  if (!Number.isFinite(reviewId)) return fail(400, 'Geçersiz yorum.')
  const rl = await rateLimit(`helpful:${req.ip}:${reviewId}`, 1, 30 * 24 * 60 * 60 * 1000)
  const p = await db()
  if (rl.ok) await p.query('UPDATE reviews SET helpful = helpful + 1 WHERE id = $1 AND approved', [reviewId])
  const { rows } = await p.query('SELECT helpful FROM reviews WHERE id = $1', [reviewId])
  return json(200, { helpful: rows[0]?.helpful ?? 0 })
}

async function createMessage(req) {
  const msg = sanitizeContactInput(req.body)
  if (!msg.isim || !msg.eposta) return fail(400, 'İsim ve e-posta zorunludur.')
  const rl = await rateLimit(`message:${req.ip}`, 5, 60 * 60 * 1000)
  if (!rl.ok) return fail(429, 'Çok fazla mesaj gönderildi. Lütfen daha sonra tekrar deneyin.', { retryAfter: rl.retryAfter })
  const p = await db()
  await p.query('INSERT INTO messages (data) VALUES ($1)', [msg])
  await notifyEvent(p, 'messages', contactMessage(msg, siteOrigin(req)))
  return json(201, { ok: true })
}

async function getImage(id) {
  if (!/^[a-f0-9]{24}\.(webp|jpg|png|gif)$/.test(id)) return fail(404, 'Bulunamadı')
  const p = await db()
  const { rows } = await p.query('SELECT mime, data FROM images WHERE id = $1', [id])
  if (!rows[0]) return fail(404, 'Bulunamadı')
  return {
    status: 200,
    headers: {
      'Content-Type': rows[0].mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
    body: rows[0].data,
  }
}

// ── ADMIN UÇLARI ──
const IMAGE_TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }
const MAX_IMAGE_BYTES = 3 * 1024 * 1024

async function saveImage(client, dataUrl) {
  const m = /^data:(image\/(?:webp|jpeg|png|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m) { const e = new Error('Desteklenmeyen görsel biçimi (WebP, JPEG, PNG, GIF).'); e.status = 400; throw e }
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) { const e = new Error('Görsel çok büyük (en fazla 3 MB).'); e.status = 413; throw e }
  const id = `${crypto.randomBytes(12).toString('hex')}.${IMAGE_TYPES[m[1]]}`
  await client.query('INSERT INTO images (id, mime, data) VALUES ($1, $2, $3)', [id, m[1], buf])
  return `/api/images/${id}`
}

async function login(req) {
  if (!adminConfigured()) return fail(503, 'Sunucuda ADMIN_PIN tanımlı değil. Kurulum adımlarına bakın.')
  const key = `login:${req.ip}`
  const check = await rateLimit(key, LOGIN_MAX_FAILS, LOGIN_LOCK_MS, { consume: false })
  if (!check.ok) return fail(429, 'Çok fazla hatalı deneme. Bir süre bekleyin.', { retryAfter: check.retryAfter })
  if (verifyPin(req.body?.pin)) {
    await clearRateLimit(key)
    return json(200, { ok: true }, { 'Set-Cookie': createSessionCookie(req.secure), ...NO_STORE })
  }
  const after = await rateLimit(key, LOGIN_MAX_FAILS, LOGIN_LOCK_MS)
  const remaining = after.ok ? after.remaining : 0
  if (remaining <= 0) {
    const locked = await rateLimit(key, LOGIN_MAX_FAILS, LOGIN_LOCK_MS, { consume: false })
    return fail(429, 'Çok fazla hatalı deneme. Bir süre bekleyin.', { retryAfter: locked.retryAfter || LOGIN_LOCK_MS / 1000 })
  }
  return fail(401, 'Hatalı PIN.', { remaining })
}

async function adminRoute(req, seg) {
  const [resource, id] = seg
  const m = req.method
  const p = await db()

  if (resource === 'products') {
    if (m === 'GET') {
      const { rows } = await p.query('SELECT data FROM products ORDER BY id')
      return json(200, { products: rows.map((r) => r.data) }, NO_STORE)
    }
    if (m === 'PUT') {
      const list = Array.isArray(req.body?.products) ? req.body.products.slice(0, 500) : null
      if (!list) return fail(400, 'Ürün listesi bekleniyor.')
      const clean = list.map(sanitizeProduct).filter(Boolean)
      const ids = [...new Set(clean.map((x) => x.id))]
      if (ids.length !== clean.length) return fail(400, 'Aynı ID ile birden fazla ürün var.')
      await tx(async (c) => {
        await c.query('DELETE FROM products WHERE NOT (id = ANY($1::int[]))', [ids])
        for (const prod of clean) {
          await c.query(
            `INSERT INTO products (id, data, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
            [prod.id, prod],
          )
        }
      })
      return json(200, { products: clean }, NO_STORE)
    }
  }

  if (resource === 'settings') {
    if (m === 'GET') return json(200, { settings: await loadSettings(p) }, NO_STORE)
    if (m === 'PUT') {
      const clean = sanitizeSettings(req.body?.settings)
      await p.query(
        `INSERT INTO settings (key, data, updated_at) VALUES ('site', $1, now())
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [clean],
      )
      return json(200, { settings: clean }, NO_STORE)
    }
  }

  if (resource === 'orders') {
    if (m === 'GET' && !id) {
      const { rows } = await p.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5000')
      return json(200, { orders: rows.map(orderRow) }, NO_STORE)
    }
    const oid = Math.round(Number(id))
    if (!Number.isFinite(oid)) return fail(400, 'Geçersiz sipariş.')
    if (m === 'PATCH') {
      const b = req.body || {}
      const status = b.status !== undefined ? cleanText(b.status, 40) : undefined
      if (status !== undefined && !ORDER_STATUS_KEYS.includes(status)) return fail(400, 'Geçersiz durum.')
      const patch = {}
      if (b.cargoCode !== undefined) patch.cargoCode = cleanText(b.cargoCode, 80)
      if (b.note !== undefined) patch.note = cleanText(b.note, 500)
      // Durum değiştiyse müşterinin takip sayfasında görünen geçmişe eklenir.
      const { rows } = await p.query(
        `UPDATE orders SET
           data = CASE WHEN $2::text IS NOT NULL AND $2::text <> status
             THEN jsonb_set(data || $3::jsonb, '{history}',
               COALESCE(data->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', $2::text, 'at', now())))
             ELSE data || $3::jsonb END,
           status = COALESCE($2, status),
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [oid, status ?? null, patch],
      )
      if (!rows[0]) return fail(404, 'Sipariş bulunamadı.')
      return json(200, { order: orderRow(rows[0]) }, NO_STORE)
    }
    if (m === 'DELETE') {
      await p.query('DELETE FROM orders WHERE id = $1', [oid])
      return json(200, { ok: true }, NO_STORE)
    }
  }

  if (resource === 'reviews') {
    if (m === 'GET' && !id) {
      const { rows } = await p.query('SELECT * FROM reviews ORDER BY created_at DESC, id DESC')
      return json(200, { reviews: groupReviews(rows) }, NO_STORE)
    }
    const rid = Math.round(Number(id))
    if (!Number.isFinite(rid)) return fail(400, 'Geçersiz yorum.')
    if (m === 'PATCH') {
      const { rows } = await p.query('UPDATE reviews SET approved = $2 WHERE id = $1 RETURNING *', [rid, Boolean(req.body?.approved)])
      if (!rows[0]) return fail(404, 'Yorum bulunamadı.')
      return json(200, { review: reviewRow(rows[0]) }, NO_STORE)
    }
    if (m === 'DELETE') {
      await p.query('DELETE FROM reviews WHERE id = $1', [rid])
      return json(200, { ok: true }, NO_STORE)
    }
  }

  if (resource === 'messages') {
    if (m === 'GET' && !id) {
      const { rows } = await p.query('SELECT * FROM messages ORDER BY created_at DESC LIMIT 2000')
      return json(200, { messages: rows.map((r) => ({ ...r.data, id: Number(r.id), read: r.is_read, createdAt: r.created_at })) }, NO_STORE)
    }
    const mid = Math.round(Number(id))
    if (!Number.isFinite(mid)) return fail(400, 'Geçersiz mesaj.')
    if (m === 'PATCH') {
      await p.query('UPDATE messages SET is_read = $2 WHERE id = $1', [mid, Boolean(req.body?.read)])
      return json(200, { ok: true }, NO_STORE)
    }
    if (m === 'DELETE') {
      await p.query('DELETE FROM messages WHERE id = $1', [mid])
      return json(200, { ok: true }, NO_STORE)
    }
  }

  if (resource === 'notify') {
    const cfg = await loadNotify(p)
    if (m === 'GET' && !id) return json(200, { notify: publicNotify(cfg) }, NO_STORE)
    if (m === 'PUT' && !id) {
      const next = sanitizeNotify(req.body?.notify, cfg)
      await saveNotify(p, next)
      return json(200, { notify: publicNotify(next) }, NO_STORE)
    }
    if (m === 'POST' && id === 'detect') {
      const chats = await detectChats(cfg, typeof req.body?.token === 'string' ? req.body.token : '')
      return json(200, { chats }, NO_STORE)
    }
    if (m === 'POST' && id === 'test') {
      await sendTelegram(cfg, '✅ <b>Ravun bildirimleri çalışıyor.</b>\nYeni sipariş, yorum ve mesajlar buraya gelecek.')
      return json(200, { ok: true }, NO_STORE)
    }
  }

  if (resource === 'images' && m === 'POST') {
    const url = await saveImage(p, req.body?.dataUrl)
    return json(201, { url }, NO_STORE)
  }

  // Tarayıcıda (localStorage) kalmış eski panel verilerini sunucuya aktarır.
  // Görseller istemci tarafında önce /admin/images ile yüklenmiş olmalıdır.
  if (resource === 'import' && m === 'POST') {
    const b = req.body || {}
    const result = { products: 0, orders: 0, reviews: 0, settings: false }
    await tx(async (c) => {
      if (Array.isArray(b.products)) {
        for (const prod of b.products.slice(0, 500).map(sanitizeProduct).filter(Boolean)) {
          await c.query(
            `INSERT INTO products (id, data, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
            [prod.id, prod],
          )
          result.products++
        }
      }
      if (b.settings && typeof b.settings === 'object') {
        await c.query(
          `INSERT INTO settings (key, data, updated_at) VALUES ('site', $1, now())
           ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [sanitizeSettings(b.settings)],
        )
        result.settings = true
      }
      if (Array.isArray(b.orders)) {
        for (const o of b.orders.slice(0, 5000)) {
          const orderNo = cleanText(o?.orderNo, 40)
          if (!orderNo) continue
          const items = (Array.isArray(o.items) ? o.items : []).slice(0, 200).map((it) => ({
            id: cleanText(it?.id, 80),
            baseId: Math.round(safeNumber(it?.baseId ?? it?.id, 0)),
            title: cleanText(it?.title, 120),
            price: safeNumber(it?.price, 0),
            qty: Math.round(safeNumber(it?.qty, 1, 1, 99)),
            image: String(it?.image || '').startsWith('data:') ? '' : cleanText(it?.image, 1200),
            certificateNo: cleanText(it?.certificateNo, 40),
            selectedSize: cleanText(it?.selectedSize, 60),
            selectedColor: cleanText(it?.selectedColor, 60),
            giftWrap: Boolean(it?.giftWrap),
            giftStyle: cleanText(it?.giftStyle, 80),
            giftNote: cleanText(it?.giftNote, 300),
            giftRecipient: cleanText(it?.giftRecipient, 80),
            giftDelivery: cleanText(it?.giftDelivery, 80),
          }))
          const status = ORDER_STATUS_KEYS.includes(o.status) ? o.status : 'pending'
          const created = Number.isFinite(Date.parse(o.createdAt)) ? new Date(o.createdAt) : new Date()
          const ins = await c.query(
            `INSERT INTO orders (order_no, status, data, created_at) VALUES ($1, $2, $3, $4)
             ON CONFLICT (order_no) DO NOTHING`,
            [orderNo, status, {
              items,
              total: items.reduce((s, x) => s + x.price * x.qty, 0),
              customerName: cleanText(o.customerName, 90),
              customerPhone: cleanText(o.customerPhone, 30),
              note: cleanText(o.note, 500),
              cargoCode: cleanText(o.cargoCode || o.trackingCode, 80),
              source: 'import',
            }, created],
          )
          result.orders += ins.rowCount
        }
      }
      if (b.reviews && typeof b.reviews === 'object') {
        for (const [pid, list] of Object.entries(b.reviews).slice(0, 500)) {
          for (const r of (Array.isArray(list) ? list : []).slice(0, 500)) {
            const { name, text, rating } = sanitizeReviewInput(r)
            if (!name || !text) continue
            const ins = await c.query(
              `INSERT INTO reviews (product_id, name, rating, text, helpful, approved, date_label)
               SELECT $1, $2, $3, $4, $5, $6, $7
               WHERE NOT EXISTS (SELECT 1 FROM reviews WHERE product_id = $1 AND name = $2 AND text = $4)`,
              [Math.round(Number(pid)), name, rating, text, Math.round(safeNumber(r.helpful, 0, 0, 99999)), r.approved !== false, cleanText(r.date, 60) || null],
            )
            result.reviews += ins.rowCount
          }
        }
      }
    })
    return json(200, { ok: true, imported: result }, NO_STORE)
  }

  return fail(404, 'Bulunamadı')
}

// ── GİRİŞ NOKTASI ──
export async function route(req) {
  const seg = req.path.split('/').filter(Boolean)
  const m = req.method
  try {
    if (seg[0] === 'health') {
      const p = await db()
      await p.query('SELECT 1')
      // Gizli bilgi içermeyen teşhis alanları: hangi ortam/commit/bölgede çalışıldığı.
      return json(200, {
        ok: true,
        admin: adminConfigured(),
        env: process.env.VERCEL_ENV || 'local',
        commit: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
        region: process.env.VERCEL_REGION || null,
      }, NO_STORE)
    }
    if (seg[0] === 'catalog' && m === 'GET') return await getCatalog()
    if (seg[0] === 'orders' && m === 'POST' && seg.length === 1) return await createOrder(req)
    if (seg[0] === 'orders' && seg[1] === 'track' && m === 'POST') return await trackOrder(req)
    if (seg[0] === 'reviews' && m === 'POST' && seg.length === 1) return await createReview(req)
    if (seg[0] === 'reviews' && seg[2] === 'helpful' && m === 'POST') return await markHelpful(req, seg[1])
    if (seg[0] === 'messages' && m === 'POST' && seg.length === 1) return await createMessage(req)
    if (seg[0] === 'images' && m === 'GET' && seg[1]) return await getImage(seg[1])

    if (seg[0] === 'admin') {
      // Durum değiştiren her admin isteği özel başlık taşımalı: başka bir
      // siteden form/fetch ile (CSRF) tetiklenemez.
      if (m !== 'GET' && req.headers['x-ravun-admin'] !== '1') return fail(403, 'Geçersiz istek.')
      if (seg[1] === 'login' && m === 'POST') return await login(req)
      if (seg[1] === 'logout' && m === 'POST') return json(200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req.secure), ...NO_STORE })
      if (seg[1] === 'session' && m === 'GET') return json(200, { authed: isAuthed(req), configured: adminConfigured() }, NO_STORE)
      if (!isAuthed(req)) return fail(401, 'Oturum gerekli.')
      return await adminRoute(req, seg.slice(1))
    }
    return fail(404, 'Bulunamadı')
  } catch (err) {
    if (err.status && err.status < 500) return fail(err.status, err.message)
    console.error('[api]', m, req.path, err)
    if (err.status === 503) return fail(503, 'Veritabanı yapılandırılmamış.')
    return fail(500, 'Sunucu hatası.')
  }
}
