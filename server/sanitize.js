// ── SUNUCU TARAFI VERİ TEMİZLEME ──
// İstemciden (site ya da panel) gelen her veri veritabanına yazılmadan önce
// buradan geçer. Tarayıcı tarafındaki normalize fonksiyonlarıyla aynı
// sınırları uygular; istemci atlatılsa bile bozuk/zararlı veri kaydedilmez.

export function cleanText(value, max = 220) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// Satır sonlarını koruyan sürüm (ör. "Atölyeden çıkan\nher parça." başlıkları)
export function cleanMultiline(value, max = 1400) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

export function safeNumber(value, fallback = 0, min = 0, max = 10_000_000) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function safeHexColor(value, fallback = '#1a6b4a') {
  const v = cleanText(value, 24)
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : fallback
}

export function safeUrl(value, fallback = '') {
  const raw = cleanText(value, 1200)
  if (!raw) return fallback
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  if (raw.startsWith('mailto:') || raw.startsWith('tel:')) return raw
  try {
    const u = new URL(raw)
    return ['https:', 'http:'].includes(u.protocol) ? u.toString() : fallback
  } catch {
    return fallback
  }
}

// Veritabanına yalnızca kısa görsel adresleri yazılır: site varlıkları
// (/assets/...), sunucuya yüklenmiş görseller (/api/images/...) veya https.
// Base64 data: URL'leri önce /api/admin/images ile yüklenmelidir.
export function safeImageSrc(value, fallback = '') {
  const raw = cleanText(value, 1200)
  if (!raw) return fallback
  if (raw.startsWith('/assets/') || raw.startsWith('/api/images/')) return raw
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.toString() : fallback
  } catch {
    return fallback
  }
}

export function safeList(value, maxItems, mapper) {
  return (Array.isArray(value) ? value : []).slice(0, maxItems).map(mapper).filter(Boolean)
}

export function sanitizeProduct(p) {
  if (!p || typeof p !== 'object') return null
  const id = Math.round(safeNumber(p.id, 0, 0, 999999))
  if (!id) return null
  const gallery = safeList(p.gallery, 24, (x) => safeImageSrc(x))
  const image = safeImageSrc(p.image) || gallery[0] || '/assets/products_hero-1.webp'
  return {
    id,
    title: cleanText(p.title, 120) || `Ürün ${id}`,
    category: cleanText(p.category, 60) || 'Masaüstü',
    tag: cleanText(p.tag, 40),
    desc: cleanText(p.desc, 260),
    longDesc: cleanText(p.longDesc, 1400),
    price: safeNumber(p.price, 0, 0, 10_000_000),
    delivery: cleanText(p.delivery, 80),
    stock: cleanText(p.stock, 80),
    status: cleanText(p.status, 40) || 'available',
    archiveVisible: Boolean(p.archiveVisible),
    visible: p.visible !== false,
    homeVisible: p.homeVisible !== false,
    sortOrder: safeNumber(p.sortOrder, id * 10, 0, 999999),
    featured: Boolean(p.featured),
    gallery: gallery.length ? gallery : [image],
    image,
    materials: safeList(p.materials, 24, (x) => cleanText(x, 70)),
    dimensions: cleanText(p.dimensions, 120),
    weight: cleanText(p.weight, 50),
    sizes: safeList(p.sizes, 24, (x) => cleanText(x, 60)),
    colors: safeList(p.colors, 24, (x) => safeHexColor(x)),
    colorNames: safeList(p.colorNames, 24, (x) => cleanText(x, 50)),
    story: cleanText(p.story, 900),
    craftTime: cleanText(p.craftTime, 80),
    finish: cleanText(p.finish, 80),
    repeatable: cleanText(p.repeatable, 120),
    certificateNo: cleanText(p.certificateNo, 40) || `RVN-${String(id).padStart(3, '0')}`,
    productionMood: cleanText(p.productionMood, 110),
    giftEligible: p.giftEligible !== false,
    materialNote: cleanText(p.materialNote, 260),
    careSummary: cleanText(p.careSummary, 320),
    careTips: safeList(p.careTips, 8, (x) => cleanText(x, 160)),
    packageNote: cleanText(p.packageNote, 220),
  }
}

const SETTINGS_TEXT_LIMITS = {
  heroTag: 60, heroLine1: 90, heroLine2: 90, heroCta: 60, heroSecondCta: 60,
  collectionEyebrow: 60, collectionDesc: 280, atelierEyebrow: 60, atelierDesc: 400,
  announcement: 200, storyTitle: 200, storyDesc: 600, packageTitle: 200, packageDesc: 600,
  footerDesc: 240, footerLocation: 120, instagram: 80, pinterestLabel: 80,
  giftTitle: 90, giftDesc: 240, styleVersion: 60,
}
const SETTINGS_MULTILINE = { collectionTitle: 160, atelierTitle: 160 }
const SETTINGS_FLAGS = [
  'showAtelierFeature', 'showEditions', 'showArchive', 'showStoryPreview', 'showPromise',
  'showProcess', 'showTrustFlow', 'showBrandExperience', 'showJournal', 'showCta',
]

export function sanitizeSettings(s) {
  const src = s && typeof s === 'object' ? s : {}
  const out = {}
  for (const [k, max] of Object.entries(SETTINGS_TEXT_LIMITS)) if (k in src) out[k] = cleanText(src[k], max)
  for (const [k, max] of Object.entries(SETTINGS_MULTILINE)) if (k in src) out[k] = cleanMultiline(src[k], max)
  for (const k of SETTINGS_FLAGS) if (typeof src[k] === 'boolean') out[k] = src[k]
  if ('instagramUrl' in src) out.instagramUrl = safeUrl(src.instagramUrl, 'https://instagram.com/')
  if ('giftPrice' in src) out.giftPrice = safeNumber(src.giftPrice, 0, 0, 100000)
  if (src.categorySettings && typeof src.categorySettings === 'object') {
    out.categorySettings = {}
    for (const [key, cat] of Object.entries(src.categorySettings).slice(0, 30)) {
      const k = cleanText(key, 40)
      if (!k || !cat || typeof cat !== 'object') continue
      out.categorySettings[k] = {
        eyebrow: cleanText(cat.eyebrow, 60),
        title: cleanText(cat.title, 120),
        desc: cleanText(cat.desc, 280),
        image: safeImageSrc(cat.image, '/assets/products_hero-1.webp'),
      }
    }
  }
  return out
}

export function sanitizeReviewInput(r) {
  const name = cleanText(r?.name, 60).replace(/[<>]/g, '')
  const text = cleanText(r?.text, 1200).replace(/[<>]/g, '')
  const rating = Math.round(safeNumber(r?.rating, 5, 1, 5))
  return { name, text, rating }
}

export function sanitizeContactInput(m) {
  return {
    isim: cleanText(m?.isim, 90),
    eposta: cleanText(m?.eposta, 120),
    telefon: cleanText(m?.telefon, 30),
    parca: cleanText(m?.parca, 60),
    mesaj: cleanText(m?.mesaj, 1200),
  }
}

export const ORDER_STATUS_KEYS = ['pending', 'approved', 'production', 'packing', 'cargo', 'delivered', 'cancelled']
