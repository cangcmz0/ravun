// ── İNDİRİM KUPONLARI ──
// Panelden tanımlanır (settings 'coupons'); indirim her zaman sunucuda
// hesaplanır, tarayıcıdan gelen tutara güvenilmez.
import { cleanText, safeNumber } from './sanitize.js'

const MAX_COUPONS = 100

// Türkçe harfler ASCII'ye çevrilir: "indirim", "İNDİRİM" ve "INDIRIM" aynı koddur.
const TR_ASCII = { ç: 'C', Ç: 'C', ğ: 'G', Ğ: 'G', ı: 'I', İ: 'I', i: 'I', ö: 'O', Ö: 'O', ş: 'S', Ş: 'S', ü: 'U', Ü: 'U' }
export function couponCode(v) {
  return String(v || '').replace(/[çÇğĞıİiöÖşŞüÜ]/g, (ch) => TR_ASCII[ch]).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
}

function cleanDate(v) {
  const s = String(v || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) ? s : ''
}

// Panelden gelen liste temizlenir; kullanım sayıları sunucudaki kayıttan korunur.
export function sanitizeCoupons(list, current = []) {
  const usedByCode = new Map((current || []).map((c) => [c.code, c.used || 0]))
  const seen = new Set()
  const out = []
  for (const raw of (Array.isArray(list) ? list : []).slice(0, MAX_COUPONS)) {
    const code = couponCode(raw?.code)
    if (code.length < 3 || seen.has(code)) continue
    seen.add(code)
    const type = raw?.type === 'amount' ? 'amount' : 'percent'
    out.push({
      code,
      type,
      value: type === 'percent' ? Math.round(safeNumber(raw?.value, 10, 1, 90)) : Math.round(safeNumber(raw?.value, 100, 1, 1_000_000)),
      minTotal: Math.round(safeNumber(raw?.minTotal, 0, 0, 10_000_000)),
      maxUses: Math.round(safeNumber(raw?.maxUses, 0, 0, 1_000_000)),
      used: usedByCode.get(code) || 0,
      expiresAt: cleanDate(raw?.expiresAt),
      active: raw?.active !== false,
      note: cleanText(raw?.note, 120),
    })
  }
  return out
}

export async function loadCoupons(client, { lock = false } = {}) {
  const { rows } = await client.query(`SELECT data FROM settings WHERE key = 'coupons'${lock ? ' FOR UPDATE' : ''}`)
  return Array.isArray(rows[0]?.data?.list) ? rows[0].data.list : []
}

export async function saveCoupons(client, list) {
  await client.query(
    `INSERT INTO settings (key, data, updated_at) VALUES ('coupons', $1, now())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [{ list }],
  )
}

// Kuponu sepet tutarına uygular: { ok, coupon, discount } ya da { ok:false, error }.
export function applyCoupon(list, rawCode, subtotal, now = new Date()) {
  const code = couponCode(rawCode)
  const c = (list || []).find((x) => x.code === code)
  if (!code || !c || !c.active) return { ok: false, error: 'Bu kupon kodu geçerli değil.' }
  // Son gün dahil: Türkiye saatiyle gün sonuna kadar geçerli.
  if (c.expiresAt && now > new Date(`${c.expiresAt}T23:59:59+03:00`)) return { ok: false, error: 'Bu kuponun süresi dolmuş.' }
  if (c.maxUses && (c.used || 0) >= c.maxUses) return { ok: false, error: 'Bu kuponun kullanım hakkı dolmuş.' }
  if (c.minTotal && subtotal < c.minTotal) {
    return { ok: false, error: `Bu kupon ${c.minTotal.toLocaleString('tr-TR')} ₺ ve üzeri siparişlerde geçerli.` }
  }
  const raw = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : c.value
  const discount = Math.max(0, Math.min(raw, subtotal))
  return { ok: true, coupon: c, discount }
}

export function couponLabel(c) {
  return c.type === 'percent' ? `%${c.value} indirim` : `${c.value.toLocaleString('tr-TR')} ₺ indirim`
}
