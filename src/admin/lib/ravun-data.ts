// ── RAVUN PAYLAŞILAN VERİ/GÜVENLİK KATMANI ──
// Bu dosya, sitenin (src/main.jsx) PIN doğrulama, oturum yönetimi ve
// ürün/sipariş/yorum/ayar veri mantığının admin paneli için TypeScript'e
// taşınmış halidir. Site tarafındaki mantık BİREBİR aynı kalır; burası
// admin panelinin kendi (React 19 / TanStack Router) bundle'ından
// erişebilmesi için ayrı tutulmuştur. İkisi de aynı localStorage
// anahtarlarını okuyup yazdığı için veriler senkron kalır.

/* eslint-disable @typescript-eslint/no-explicit-any */
import PRODUCT_SEED from '../../data/products.json'

const A = '/assets/'
const ENV: any = (import.meta as any).env || {}
export const SITE_URL = ENV.VITE_SITE_URL || 'https://ravun-tau.vercel.app'

// ── GÜVENLİK / PIN GİRİŞİ ──
export const ADMIN_PIN_SHA256: string = ENV.VITE_ADMIN_PIN_HASH || ''
const ADMIN_PIN_SALT = 'ravun-local-admin-v2'
const ADMIN_SESSION_KEY = 'ravun:adm_s'
const ADMIN_LOCK_KEY = 'ravun:adm_l'
const ADMIN_ATTEMPT_KEY = 'ravun:adm_a'
const ADMIN_TOKEN_KEY = 'ravun:adm_t'
export const MAX_LOGIN_ATTEMPTS = 5
export const LOCK_DURATION_MS = 60000
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function timingSafeEqual(a: string, b: string) {
  const aa = String(a || ''); const bb = String(b || '')
  let out = aa.length ^ bb.length
  const len = Math.max(aa.length, bb.length)
  for (let i = 0; i < len; i++) out |= (aa.charCodeAt(i) || 0) ^ (bb.charCodeAt(i) || 0)
  return out === 0
}
export async function verifyAdminPin(inputPin: string) {
  try {
    if (!ADMIN_PIN_SHA256) return false
    const normalized = String(inputPin || '').trim().slice(0, 32)
    if (!normalized) return false
    const digest = await sha256Hex(`${ADMIN_PIN_SALT}:${normalized}`)
    return timingSafeEqual(digest, ADMIN_PIN_SHA256)
  } catch { return false }
}
function generateSessionToken() {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}
function getBrowserFingerprint() {
  return btoa([
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|')).slice(0, 24)
}
export function isValidAdminSession() {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY)
    if (!raw) return false
    const session = JSON.parse(atob(raw))
    if (!session.token || !session.exp || !session.fingerprint) return false
    if (Date.now() > session.exp) { clearAdminSession(); return false }
    const storedToken = sessionStorage.getItem(ADMIN_TOKEN_KEY)
    if (!storedToken || storedToken !== session.token) return false
    if (session.fingerprint !== getBrowserFingerprint()) return false
    return true
  } catch { return false }
}
export function createAdminSession() {
  const token = generateSessionToken()
  const session = { token, exp: Date.now() + SESSION_TIMEOUT_MS, fingerprint: getBrowserFingerprint(), created: Date.now() }
  sessionStorage.setItem(ADMIN_SESSION_KEY, btoa(JSON.stringify(session)))
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
  return token
}
export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY)
  sessionStorage.removeItem(ADMIN_TOKEN_KEY)
  sessionStorage.removeItem(ADMIN_LOCK_KEY)
  sessionStorage.removeItem(ADMIN_ATTEMPT_KEY)
}
export function getLoginAttempts() {
  try { return Number(sessionStorage.getItem(ADMIN_ATTEMPT_KEY) || 0) } catch { return 0 }
}
export function getLockedUntil() {
  try { return Number(sessionStorage.getItem(ADMIN_LOCK_KEY) || 0) } catch { return 0 }
}
export function registerFailedAttempt() {
  const next = getLoginAttempts() + 1
  try { sessionStorage.setItem(ADMIN_ATTEMPT_KEY, String(next)) } catch { /* noop */ }
  if (next >= MAX_LOGIN_ATTEMPTS) {
    const until = Date.now() + LOCK_DURATION_MS
    try { sessionStorage.setItem(ADMIN_LOCK_KEY, String(until)) } catch { /* noop */ }
    return { attempts: next, lockedUntil: until }
  }
  return { attempts: next, lockedUntil: 0 }
}
export function clearLoginAttempts() {
  try { sessionStorage.removeItem(ADMIN_LOCK_KEY); sessionStorage.removeItem(ADMIN_ATTEMPT_KEY) } catch { /* noop */ }
}

// ── GÜVENLİ DEPOLAMA (site ile aynı anahtarlar / kodlama) ──
function b64EncodeUtf8(str: string) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))))
}
function b64DecodeUtf8(str: string) {
  return decodeURIComponent(atob(str).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
}
function _sk(key: string) { return btoa('rv:' + key).replace(/=/g, '') }
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(_sk(key))
    if (!raw || raw.length > 7_000_000) return fallback
    const decoded = b64DecodeUtf8(raw)
    if (decoded.length > 5_000_000) return fallback
    const parsed = JSON.parse(decoded)
    if (parsed === null || parsed === undefined) return fallback
    return parsed
  } catch { return fallback }
}
export function writeStored(key: string, value: any) {
  try {
    const encoded = b64EncodeUtf8(JSON.stringify(value))
    if (encoded.length > 7_000_000) return false
    localStorage.setItem(_sk(key), encoded)
    return true
  } catch { return false }
}

// ── TEMİZLEME / GÜVENLİ DEĞER YARDIMCILARI ──
const SECURITY_LIMITS = { text: 220, longText: 1400, url: 1200, image: 4_800_000, list: 40 }
export function cleanText(value: any, max = SECURITY_LIMITS.text) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}
export function safeNumber(value: any, fallback = 0, min = 0, max = 10_000_000) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
export function safeHexColor(value: any, fallback = '#1a6b4a') {
  const v = cleanText(value, 24)
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : fallback
}
export function safeUrl(value: any, fallback = '#') {
  const raw = cleanText(value, SECURITY_LIMITS.url)
  if (!raw) return fallback
  if (raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return raw
  try { const u = new URL(raw, SITE_URL); return ['https:', 'http:'].includes(u.protocol) ? u.toString() : fallback } catch { return fallback }
}
export function safeImageSrc(value: any, fallback = `${A}products_hero-1.webp`) {
  const raw = cleanText(value, SECURITY_LIMITS.image)
  if (!raw) return fallback
  if (raw.startsWith('/assets/') || raw.startsWith(A)) return raw
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(raw) && raw.length <= SECURITY_LIMITS.image) return raw
  if (/^blob:/i.test(raw)) return raw
  try { const u = new URL(raw, SITE_URL); return ['https:', 'http:'].includes(u.protocol) ? u.toString() : fallback } catch { return fallback }
}
export function safeList(value: any, fallback: any[] = [], maxItems = SECURITY_LIMITS.list, mapper: any = cleanText) {
  const src = Array.isArray(value) ? value : fallback
  return src.slice(0, maxItems).map(mapper).filter(Boolean)
}
function normalizeDetailPoints(value: any, fallback: any[] = []) {
  const source = Array.isArray(value) && value.length ? value : (Array.isArray(fallback) ? fallback : [])
  return source.slice(0, 6).map((point: any, index: number) => ({
    x: safeNumber(point?.x, 50 + index * 7, 6, 94),
    y: safeNumber(point?.y, 50, 8, 92),
    title: cleanText(point?.title || `Detay ${index + 1}`, 70),
    text: cleanText(point?.text || 'Ravun atölyesinde elde tamamlanan özel detay.', 180),
  })).filter((point: any) => point.title)
}
export function certificateNo(product: any) {
  const id = safeNumber(product?.id, 1, 1, 999999)
  return cleanText(product?.certificateNo || `RVN-${String(id).padStart(3, '0')}`, 40)
}
function normalizeText(value: any) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
function defaultCareTips(product: any = {}) {
  const mats = normalizeText((product.materials || []).join(' '))
  const base = [
    'Yüzeyi kuru veya hafif nemli yumuşak bezle silin.',
    'Alkol, çamaşır suyu ve aşındırıcı kimyasallardan uzak tutun.',
    'Uzun süre direkt güneş ve yoğun nem altında bırakmayın.',
  ]
  if (mats.includes('gida') || normalizeText(product.category).includes('sunum')) base.push('Gıda teması sonrası yüzeyi bekletmeden kurulayın.')
  else base.push('Sıcak, ıslak veya ağır objeleri uzun süre aynı noktada bırakmayın.')
  return base
}

// ── KATEGORİ ──
export const CATEGORIES = ['Tümü', 'Duvar Rafı', 'Bıçak Standı', 'Masaüstü', 'Sunum Tahtası', 'Paketleme']
export const CATEGORY_DETAILS: Record<string, any> = {
  'tum': { eyebrow: 'TÜM KOLEKSİYON', title: 'Atölyeden çıkan seçili parçalar', desc: 'Ahşap, epoksi ve elde tamamlanan sınırlı üretim ürünleri tek alanda inceleyin.', image: `${A}products_hero-3.webp` },
  'duvar-rafi': { eyebrow: 'DUVAR RAFI', title: 'Duvara karakter katan parçalar', desc: 'Ceviz damarları, epoksi akışları ve doğal yağ bitişiyle mekâna sıcaklık katan raflar.', image: `${A}products_hero-1.webp` },
  'bicak-standi': { eyebrow: 'BIÇAK STANDI', title: 'Mutfakta heykelsi düzen', desc: 'Bıçaklar için güvenli, dengeli ve dekoratif ahşap/epoksi stand seçenekleri.', image: `${A}product-atlas.webp` },
  'masaustu': { eyebrow: 'MASAÜSTÜ', title: 'Çalışma alanına imza dokunuş', desc: 'Kalemlik, masa seti ve küçük dekoratif objelerle masa üzerinde sıcak bir Ravun dili.', image: `${A}product-atlas.webp` },
  'sunum-tahtasi': { eyebrow: 'SUNUM TAHTASI', title: 'Masada ilk dikkat çeken detay', desc: 'Gıda güvenli yağ bitişli, epoksi akışlı ve elde tamamlanan servis parçaları.', image: `${A}products_hero-1.webp` },
  'paketleme': { eyebrow: 'PAKETLEME', title: 'Marka dokusunu tamamlayan setler', desc: 'Keten, mantar ve deri detaylı etiket/paketleme diliyle butik sunum parçaları.', image: `${A}tags-cork.webp` },
}
export const DEFAULT_CATEGORY_SETTINGS = Object.fromEntries(Object.entries(CATEGORY_DETAILS).map(([key, value]) => [key, { ...value }]))
export function categoryKey(value: any) {
  const key = normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const aliases: Record<string, string> = {
    'tum': 'tum', 'tumu': 'tum',
    'bicak-standi': 'bicak-standi', 'b-cak-stand': 'bicak-standi', 'b-cak-standi': 'bicak-standi',
    'duvar-rafi': 'duvar-rafi', 'duvar-raf': 'duvar-rafi',
    'masaustu': 'masaustu', 'masa-ustu': 'masaustu',
    'sunum-tahtasi': 'sunum-tahtasi', 'sunum-tahta': 'sunum-tahtasi',
    'paketleme': 'paketleme',
  }
  return aliases[key] || key
}
export function categoryLabelFromKey(key: string, fallback = '') {
  const labels: Record<string, string> = { 'tum': 'Tümü', 'duvar-rafi': 'Duvar Rafı', 'bicak-standi': 'Bıçak Standı', 'masaustu': 'Masaüstü', 'sunum-tahtasi': 'Sunum Tahtası', 'paketleme': 'Paketleme' }
  return labels[key] || fallback || key.split('-').map((x) => x ? x[0].toLocaleUpperCase('tr-TR') + x.slice(1) : x).join(' ')
}

// ── ÜRÜN DURUMU ──
export const PRODUCT_STATUS: Record<string, any> = {
  available: { label: 'Satışta', short: 'Satışta', tone: 'available', canOrder: true, archive: false },
  single: { label: 'Tek parça', short: 'Tek parça', tone: 'single', canOrder: true, archive: false },
  production: { label: 'Satışta', short: 'Satışta', tone: 'available', canOrder: true, archive: false },
  preorder: { label: 'Satışta', short: 'Satışta', tone: 'available', canOrder: true, archive: false },
  similar: { label: 'Arşiv', short: 'Arşiv', tone: 'sold', canOrder: false, archive: true },
  sold: { label: 'Satıldı', short: 'Satıldı', tone: 'sold', canOrder: false, archive: true },
  draft: { label: 'Taslak', short: 'Taslak', tone: 'draft', canOrder: false, archive: false },
}
export function normalizeProductStatus(value: any, product: any = {}) {
  const raw = normalizeText(value || product?.status || '').replace(/-/g, ' ')
  if (raw.includes('taslak') || raw.includes('draft')) return 'draft'
  if (['sold', 'satildi'].includes(raw) || raw.includes('satil')) return 'sold'
  if (raw.includes('arsiv') || raw.includes('archive')) return 'similar'
  if (raw.includes('tek') || raw.includes('single') || String(product?.tag || '').toLocaleLowerCase('tr-TR').includes('tek')) return 'single'
  const stock = normalizeText(product?.stock || '')
  if (stock.includes('taslak')) return 'draft'
  if (stock.includes('satildi')) return 'sold'
  return 'available'
}
export function productStatusInfo(product: any) {
  const key = normalizeProductStatus(product?.status, product)
  return { ...PRODUCT_STATUS.available, ...(PRODUCT_STATUS[key] || PRODUCT_STATUS.available), key }
}

// ── ÜRÜNLER ──
export const INITIAL_PRODUCTS: any[] = PRODUCT_SEED as any[]
export function normalizeProducts(value: any): any[] {
  const source = Array.isArray(value) && value.length ? value.slice(0, 250) : INITIAL_PRODUCTS
  return source.map((product: any, index: number) => {
    const fallback = INITIAL_PRODUCTS.find((x) => x.id === product?.id) || INITIAL_PRODUCTS[index % INITIAL_PRODUCTS.length] || INITIAL_PRODUCTS[0]
    const rawGallery = Array.isArray(product?.gallery) && product.gallery.length ? product.gallery : (product?.image ? [product.image] : fallback.gallery)
    const gallery = safeList(rawGallery, fallback.gallery || [fallback.image], 24, (img: any) => safeImageSrc(img, fallback.image))
    const fallbackImage = gallery[0] || fallback.image || `${A}products_hero-1.webp`
    return {
      ...fallback, ...product,
      id: safeNumber(product?.id, fallback.id || index + 1, 1, 999999),
      title: cleanText(product?.title || fallback.title, 120),
      category: categoryLabelFromKey(categoryKey(product?.category || fallback.category || 'Masaüstü'), product?.category || fallback.category || 'Masaüstü'),
      tag: cleanText(product?.tag || fallback.tag || 'ATÖLYE', 40),
      desc: cleanText(product?.desc || fallback.desc || '', 260),
      longDesc: cleanText(product?.longDesc || fallback.longDesc || product?.desc || '', 1400),
      price: safeNumber(product?.price, 0, 0, 10_000_000),
      delivery: cleanText(product?.delivery || fallback.delivery || '2–3 hafta', 80),
      stock: cleanText(product?.stock || fallback.stock || 'Sipariş üzerine', 80),
      status: normalizeProductStatus(product?.status || fallback.status, { ...fallback, ...product }),
      archiveVisible: Boolean(product?.archiveVisible || fallback.archiveVisible),
      visible: product?.visible !== false,
      homeVisible: product?.homeVisible !== undefined ? Boolean(product.homeVisible) : (fallback?.homeVisible !== undefined ? Boolean(fallback.homeVisible) : index < 3),
      sortOrder: safeNumber(product?.sortOrder, fallback?.sortOrder ?? ((fallback?.id || index + 1) * 10), 0, 999999),
      featured: Boolean(product?.featured),
      gallery,
      image: safeImageSrc(product?.image || fallbackImage, fallbackImage),
      materials: safeList(product?.materials, fallback.materials || [], 24, (x: any) => cleanText(x, 70)),
      dimensions: cleanText(product?.dimensions || fallback.dimensions || '', 120),
      weight: cleanText(product?.weight || fallback.weight || '', 50),
      sizes: safeList(product?.sizes, fallback.sizes || ['Standart'], 24, (x: any) => cleanText(x, 60)),
      colors: safeList(product?.colors, fallback.colors || ['#1a6b4a'], 24, (x: any) => safeHexColor(x)),
      colorNames: safeList(product?.colorNames, fallback.colorNames || ['Zümrüt'], 24, (x: any) => cleanText(x, 50)),
      story: cleanText(product?.story || fallback.story || product?.longDesc || fallback.longDesc || product?.desc || '', 900),
      craftTime: cleanText(product?.craftTime || fallback.craftTime || product?.delivery || fallback.delivery || 'Atölye sürecine göre', 80),
      finish: cleanText(product?.finish || fallback.finish || 'Doğal yağ bitiş', 80),
      repeatable: cleanText(product?.repeatable || fallback.repeatable || 'Aynı desen tekrarlanmaz', 120),
      certificateNo: certificateNo(product?.certificateNo ? product : { ...fallback, id: product?.id || fallback.id }),
      productionMood: cleanText(product?.productionMood || fallback.productionMood || 'Tekil atölye parçası', 110),
      giftEligible: product?.giftEligible !== false,
      materialNote: cleanText(product?.materialNote || fallback.materialNote || 'Doğal malzeme dokusu her parçada küçük farklılıklar gösterebilir.', 260),
      careSummary: cleanText(product?.careSummary || fallback.careSummary || 'Yumuşak bezle temizleyin; yoğun nem, direkt güneş ve kimyasal temizleyicilerden uzak tutun.', 320),
      careTips: safeList(product?.careTips, fallback.careTips || defaultCareTips(product), 8, (x: any) => cleanText(x, 160)),
      packageNote: cleanText(product?.packageNote || fallback.packageNote || 'Korumalı kutu, bakım notu ve Ravun etiketiyle hazırlanır.', 220),
      detailPoints: normalizeDetailPoints(product?.detailPoints, fallback.detailPoints || []),
    }
  })
}
export function repairProducts(products: any) {
  const current = normalizeProducts(products)
  const byId = new Map(current.map((p) => [Number(p.id), p]))
  INITIAL_PRODUCTS.forEach((base) => {
    const existing = byId.get(base.id)
    if (!existing) byId.set(base.id, { ...base })
    else byId.set(base.id, {
      ...existing,
      category: categoryLabelFromKey(categoryKey(existing.category || base.category), existing.category || base.category),
      visible: existing.visible !== false,
      image: existing.image || base.image,
      gallery: Array.isArray(existing.gallery) && existing.gallery.length ? existing.gallery : base.gallery,
    })
  })
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id))
}
export function money(n: any) { return new Intl.NumberFormat('tr-TR').format(Number(n) || 0) + ' TL' }

/** Yüklenen görseli localStorage kotasını korumak için sıkıştırır: max 2000px kenar, JPEG q=0.92 */
export function compressImageFile(file: File, { maxDim = 2000, quality = 0.92 }: { maxDim?: number, quality?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Dosya okunamadı'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Görsel işlenemedi'))
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * ratio); height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// ── YORUMLAR ──
export const INITIAL_REVIEWS: Record<string, any[]> = {
  1: [{ id: 1, name: 'Selin K.', avatar: 'S', rating: 5, date: 'Mart 2025', text: 'Rafın fotoğrafları güzeldi ama elinize aldığınızda gerçek kalitesini anlıyorsunuz.', helpful: 8, approved: true }, { id: 2, name: 'Emre T.', avatar: 'E', rating: 5, date: 'Şubat 2025', text: 'Salonumun en dikkat çekici noktası oldu.', helpful: 5, approved: true }],
  2: [{ id: 1, name: 'Burak M.', avatar: 'B', rating: 5, date: 'Nisan 2025', text: 'Mutfak tezgahımın üzerinde hem fonksiyonel hem sanat eseri.', helpful: 11, approved: true }],
  3: [{ id: 1, name: 'Can Ö.', avatar: 'C', rating: 5, date: 'Mayıs 2025', text: 'Masama ayrı bir karakter kattı. Küçük boyutuna rağmen çok sağlam.', helpful: 9, approved: true }, { id: 2, name: 'Merve S.', avatar: 'M', rating: 5, date: 'Nisan 2025', text: 'Fiyatına kesinlikle değer. El yapımı olduğu her açıdan belli.', helpful: 6, approved: true }],
  4: [{ id: 1, name: 'Nilüfer B.', avatar: 'N', rating: 5, date: 'Haziran 2025', text: 'Peynir ve meze tabağı olarak kullanıyorum. Hem şık hem dayanıklı.', helpful: 14, approved: true }],
  5: [{ id: 1, name: 'Leyla Ç.', avatar: 'L', rating: 5, date: 'Temmuz 2025', text: "Ofis masam tamamen değişti. 3'lü set birbirine çok uyumlu.", helpful: 7, approved: true }],
  6: [{ id: 1, name: 'Pınar E.', avatar: 'P', rating: 5, date: 'Ağustos 2025', text: 'Butik markam için etiket seti aldım, müşterilerden çok güzel dönüşler aldım.', helpful: 18, approved: true }, { id: 2, name: 'Serkan T.', avatar: 'S', rating: 5, date: 'Temmuz 2025', text: 'Detay kalitesi inanılmaz. Baskı net, materyaller çok kaliteli.', helpful: 9, approved: true }],
}
export function normalizeReviews(value: any): Record<string, any[]> {
  const base = (value && typeof value === 'object' && !Array.isArray(value)) ? value : INITIAL_REVIEWS
  const fixed: Record<string, any[]> = {}
  const productIds = new Set([...INITIAL_PRODUCTS.map((p) => String(p.id)), ...Object.keys(base || {})].slice(0, 300))
  productIds.forEach((pid) => {
    const list = Array.isArray(base?.[pid]) ? base[pid].slice(0, 500) : []
    fixed[pid] = list.filter(Boolean).map((r: any, i: number) => ({
      id: safeNumber(r?.id, Date.now() + i, 1, 999999999999),
      name: cleanText(r?.name || 'Ravun Müşterisi', 70),
      avatar: cleanText(r?.avatar || String(r?.name || 'R').charAt(0).toLocaleUpperCase('tr-TR'), 2),
      rating: Math.min(5, Math.max(1, Number(r?.rating) || 5)),
      date: cleanText(r?.date || 'Yeni', 60),
      text: cleanText(r?.text || '', 700),
      helpful: safeNumber(r?.helpful, 0, 0, 99999),
      approved: r?.approved !== false,
    }))
  })
  return fixed
}

// ── SİPARİŞLER ──
export const ORDER_STATUSES: [string, string][] = [
  ['pending', 'Beklemede'], ['approved', 'Onaylandı'], ['production', 'Üretimde'],
  ['packing', 'Paketleniyor'], ['cargo', 'Kargoda'], ['delivered', 'Teslim edildi'],
]
export function orderStatusLabel(status: string) { return ORDER_STATUSES.find(([k]) => k === status)?.[1] || 'Beklemede' }
export function orderTotal(order: any) { return (order.items || []).reduce((s: number, x: any) => s + (Number(x.price) || 0) * (Number(x.qty) || 1), 0) }
function normalizeCartForOrder(value: any): any[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 200).map((item: any) => ({
    ...item,
    title: cleanText(item?.title || '', 120),
    price: safeNumber(item?.price, 0, 0, 10_000_000),
    qty: safeNumber(item?.qty, 1, 1, 99),
    image: safeImageSrc(item?.image, `${A}products_hero-1.webp`),
  }))
}
export function normalizeOrders(value: any): any[] {
  return Array.isArray(value) ? value.slice(0, 5000).map((o: any) => ({
    ...o,
    id: o?.id ?? Date.now(),
    orderNo: cleanText(o?.orderNo || `RVN-${Date.now()}`, 40),
    status: cleanText(o?.status || 'pending', 40),
    customerName: cleanText(o?.customerName || '', 90),
    customerPhone: cleanText(o?.customerPhone || '', 30),
    cargoCode: cleanText(o?.cargoCode || '', 80),
    note: cleanText(o?.note || '', 500),
    items: normalizeCartForOrder(o?.items || []),
  })) : []
}

// ── SİTE AYARLARI ──
export const DEFAULT_SITE_SETTINGS = {
  styleVersion: 'ravun-v107-clean-commerce',
  heroTag: 'SİPARİŞ ÜZERİNE', heroLine1: 'Atölyeden', heroLine2: 'masanıza.',
  heroCta: 'Bu Parçayı Gör ↗', heroSecondCta: 'TÜM KOLEKSİYON',
  collectionEyebrow: 'KOLEKSİYON', collectionTitle: 'Atölyeden çıkan\nher parça.', collectionDesc: 'Özel üretim, sipariş üzerine. Her biri tek.',
  atelierEyebrow: 'ATÖLYEDEN', atelierTitle: 'Sade çizgi,\nyumuşak anlatım.', atelierDesc: 'Metinler daha kısa ve zarif; ürün fotoğrafları kartın içine taşmadan, kırpılmadan yerleşir.',
  announcement: '',
  storyTitle: 'Ahşabın doğal çizgisi, epoksinin sakin akışıyla birleşir.', storyDesc: 'Ravun’da her ürün aynı kalıptan çıkan bir obje değil; ahşabın damarına göre yeniden yorumlanan tekil bir parça.',
  packageTitle: 'Korumalı paketleme, bakım notu ve Ravun etiketiyle teslim.', packageDesc: 'Siparişler darbe emici iç destek, pamuklu sarım ve marka kartıyla hazırlanır.',
  footerDesc: 'Doğal ahşap ve epoksi reçineyi el işçiliğiyle buluşturan butik atölye.', footerLocation: "Beykoz, İstanbul · 2018'den beri",
  instagram: '@ravun.atolye', instagramUrl: 'https://instagram.com/ravun.atolye', pinterestLabel: 'Pinterest — yakında',
  categorySettings: DEFAULT_CATEGORY_SETTINGS,
  giftTitle: 'Hediye olarak hazırlansın', giftDesc: 'Kraft kutu, Ravun kartı, not alanı ve korumalı sunum seçeneği.', giftPrice: 180,
  showAtelierFeature: false, showEditions: false, showArchive: true, showStoryPreview: true, showPromise: false,
  showProcess: false, showTrustFlow: false, showBrandExperience: false, showJournal: false, showCta: true,
}
export function normalizeSiteSettings(value: any): typeof DEFAULT_SITE_SETTINGS {
  const incoming = value && typeof value === 'object' ? value : {}
  const mergedCats = { ...DEFAULT_CATEGORY_SETTINGS, ...(incoming.categorySettings && typeof incoming.categorySettings === 'object' ? incoming.categorySettings : {}) }
  const safeCats = Object.fromEntries(Object.entries(mergedCats).map(([key, cat]: [string, any]) => [categoryKey(key), {
    eyebrow: cleanText(cat?.eyebrow || (DEFAULT_CATEGORY_SETTINGS as any)[categoryKey(key)]?.eyebrow || '', 60),
    title: cleanText(cat?.title || (DEFAULT_CATEGORY_SETTINGS as any)[categoryKey(key)]?.title || '', 120),
    desc: cleanText(cat?.desc || (DEFAULT_CATEGORY_SETTINGS as any)[categoryKey(key)]?.desc || '', 280),
    image: safeImageSrc(cat?.image, (DEFAULT_CATEGORY_SETTINGS as any)[categoryKey(key)]?.image || `${A}products_hero-1.webp`),
  }]))
  return {
    ...DEFAULT_SITE_SETTINGS, ...incoming,
    styleVersion: DEFAULT_SITE_SETTINGS.styleVersion,
    heroTag: cleanText(incoming.heroTag || DEFAULT_SITE_SETTINGS.heroTag, 60),
    heroLine1: cleanText(incoming.heroLine1 || DEFAULT_SITE_SETTINGS.heroLine1, 90),
    heroLine2: cleanText(incoming.heroLine2 || DEFAULT_SITE_SETTINGS.heroLine2, 90),
    heroCta: cleanText(incoming.heroCta || DEFAULT_SITE_SETTINGS.heroCta, 60),
    heroSecondCta: cleanText(incoming.heroSecondCta || DEFAULT_SITE_SETTINGS.heroSecondCta, 60),
    collectionEyebrow: cleanText(incoming.collectionEyebrow || DEFAULT_SITE_SETTINGS.collectionEyebrow, 60),
    giftTitle: cleanText(incoming.giftTitle || DEFAULT_SITE_SETTINGS.giftTitle, 90),
    giftDesc: cleanText(incoming.giftDesc || DEFAULT_SITE_SETTINGS.giftDesc, 240),
    giftPrice: safeNumber(incoming.giftPrice, Number(DEFAULT_SITE_SETTINGS.giftPrice) || 0, 0, 100000),
    footerDesc: cleanText(incoming.footerDesc || DEFAULT_SITE_SETTINGS.footerDesc, 240),
    footerLocation: cleanText(incoming.footerLocation || DEFAULT_SITE_SETTINGS.footerLocation, 120),
    instagram: cleanText(incoming.instagram || DEFAULT_SITE_SETTINGS.instagram, 80),
    instagramUrl: safeUrl(incoming.instagramUrl || DEFAULT_SITE_SETTINGS.instagramUrl, 'https://instagram.com/'),
    pinterestLabel: cleanText(incoming.pinterestLabel || DEFAULT_SITE_SETTINGS.pinterestLabel, 80),
    showAtelierFeature: typeof incoming.showAtelierFeature === 'boolean' ? incoming.showAtelierFeature : DEFAULT_SITE_SETTINGS.showAtelierFeature,
    showEditions: typeof incoming.showEditions === 'boolean' ? incoming.showEditions : DEFAULT_SITE_SETTINGS.showEditions,
    showArchive: typeof incoming.showArchive === 'boolean' ? incoming.showArchive : DEFAULT_SITE_SETTINGS.showArchive,
    showStoryPreview: typeof incoming.showStoryPreview === 'boolean' ? incoming.showStoryPreview : DEFAULT_SITE_SETTINGS.showStoryPreview,
    showPromise: typeof incoming.showPromise === 'boolean' ? incoming.showPromise : DEFAULT_SITE_SETTINGS.showPromise,
    showProcess: typeof incoming.showProcess === 'boolean' ? incoming.showProcess : DEFAULT_SITE_SETTINGS.showProcess,
    showTrustFlow: typeof incoming.showTrustFlow === 'boolean' ? incoming.showTrustFlow : DEFAULT_SITE_SETTINGS.showTrustFlow,
    showBrandExperience: typeof incoming.showBrandExperience === 'boolean' ? incoming.showBrandExperience : DEFAULT_SITE_SETTINGS.showBrandExperience,
    showJournal: typeof incoming.showJournal === 'boolean' ? incoming.showJournal : DEFAULT_SITE_SETTINGS.showJournal,
    showCta: typeof incoming.showCta === 'boolean' ? incoming.showCta : DEFAULT_SITE_SETTINGS.showCta,
    categorySettings: safeCats,
  }
}

// ── YÜKSEK SEVİYE VERİ ERİŞİMİ (site ile aynı localStorage anahtarları) ──
export function loadProducts() { return repairProducts(readStored('ravun:products', INITIAL_PRODUCTS)) }
export function saveProducts(products: any[]) { writeStored('ravun:products', products) }
export function loadReviews() { return normalizeReviews(readStored('ravun:reviews', INITIAL_REVIEWS)) }
export function saveReviews(reviews: Record<string, any[]>) { writeStored('ravun:reviews', reviews) }
export function loadOrders() { return normalizeOrders(readStored('ravun:orders', [])) }
export function saveOrders(orders: any[]) { writeStored('ravun:orders', orders) }
export function loadSiteSettings() { return normalizeSiteSettings(readStored('ravun:siteSettings', DEFAULT_SITE_SETTINGS)) }
export function saveSiteSettings(settings: any) { writeStored('ravun:siteSettings', settings) }
