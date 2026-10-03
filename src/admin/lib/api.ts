// ── ADMIN API İSTEMCİSİ ──
// Panel artık verileri tarayıcıda (localStorage) değil, sunucudaki
// veritabanında tutar. Tüm okuma/yazma işlemleri bu dosyadan geçer.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizeProducts, normalizeSiteSettings } from './ravun-data'

export class ApiError extends Error {
  status: number
  data: any
  constructor(status: number, message: string, data: any = {}) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function request<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        // Sunucu, durum değiştiren admin isteklerinde bu başlığı arar (CSRF koruması).
        'X-Ravun-Admin': '1',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Oturum süresi dolduysa giriş sayfasına dön.
    if (res.status === 401 && path.startsWith('/admin/') && !path.startsWith('/admin/login')) {
      const back = window.location.pathname.replace(/^\/admin/, '') || '/'
      window.location.href = `/admin/sign-in?redirect=${encodeURIComponent(back)}`
    }
    throw new ApiError(res.status, data?.error || `İstek başarısız (${res.status})`, data)
  }
  return data as T
}

export function errorMessage(err: unknown, fallback = 'İşlem başarısız.') {
  return err instanceof Error && err.message ? err.message : fallback
}

// ── OTURUM ──
export async function getSession() {
  return request<{ authed: boolean; configured: boolean }>('/admin/session')
}
export async function login(pin: string) {
  return request<{ ok: boolean }>('/admin/login', 'POST', { pin })
}
export async function logout() {
  return request('/admin/logout', 'POST', {})
}

// ── GÖRSELLER ──
export async function uploadImage(dataUrl: string) {
  const { url } = await request<{ url: string }>('/admin/images', 'POST', { dataUrl })
  return url
}

// Ürün/ayar içinde kalmış base64 görselleri (eski localStorage verisi) yükleyip
// sunucu adresleriyle değiştirir.
async function uploadInlineImages<T>(value: T, cache = new Map<string, string>()): Promise<T> {
  if (typeof value === 'string') {
    if (!value.startsWith('data:image/')) return value
    if (!cache.has(value)) cache.set(value, await uploadImage(value))
    return cache.get(value) as any
  }
  if (Array.isArray(value)) {
    const out: any[] = []
    for (const v of value) out.push(await uploadInlineImages(v, cache))
    return out as any
  }
  if (value && typeof value === 'object') {
    const out: any = {}
    for (const [k, v] of Object.entries(value)) out[k] = await uploadInlineImages(v, cache)
    return out
  }
  return value
}

// ── ÜRÜNLER ──
export async function fetchProducts(): Promise<any[]> {
  const { products } = await request<{ products: any[] }>('/admin/products')
  return products.length ? normalizeProducts(products) : []
}
export async function saveProducts(products: any[]): Promise<any[]> {
  const prepared = await uploadInlineImages(products)
  const res = await request<{ products: any[] }>('/admin/products', 'PUT', { products: prepared })
  return res.products.length ? normalizeProducts(res.products) : []
}

// ── SİTE AYARLARI ──
export async function fetchSettings() {
  const { settings } = await request<{ settings: any }>('/admin/settings')
  return normalizeSiteSettings(settings)
}
export async function saveSettings(settings: any) {
  const prepared = await uploadInlineImages(settings)
  const res = await request<{ settings: any }>('/admin/settings', 'PUT', { settings: prepared })
  return normalizeSiteSettings(res.settings)
}

// ── SİPARİŞLER ──
export async function fetchOrders(): Promise<any[]> {
  const { orders } = await request<{ orders: any[] }>('/admin/orders')
  return orders
}
export async function updateOrder(id: number, patch: { status?: string; cargoCode?: string; note?: string }) {
  const { order } = await request<{ order: any }>(`/admin/orders/${id}`, 'PATCH', patch)
  return order
}
export async function deleteOrder(id: number) {
  await request(`/admin/orders/${id}`, 'DELETE')
}

// ── YORUMLAR ──
export async function fetchReviews(): Promise<Record<string, any[]>> {
  const { reviews } = await request<{ reviews: Record<string, any[]> }>('/admin/reviews')
  return reviews
}
export async function setReviewApproved(id: number, approved: boolean) {
  await request(`/admin/reviews/${id}`, 'PATCH', { approved })
}
export async function deleteReview(id: number) {
  await request(`/admin/reviews/${id}`, 'DELETE')
}

// ── İLETİŞİM MESAJLARI ──
export async function fetchMessages(): Promise<any[]> {
  const { messages } = await request<{ messages: any[] }>('/admin/messages')
  return messages
}
export async function setMessageRead(id: number, read: boolean) {
  await request(`/admin/messages/${id}`, 'PATCH', { read })
}
export async function deleteMessage(id: number) {
  await request(`/admin/messages/${id}`, 'DELETE')
}

// ── ESKİ TARAYICI VERİSİNİ SUNUCUYA AKTARMA ──
export async function importLegacy(payload: { products?: any[]; settings?: any; orders?: any[]; reviews?: any }) {
  const prepared = await uploadInlineImages({
    products: payload.products,
    settings: payload.settings,
    reviews: payload.reviews,
  })
  // Sipariş kalemlerindeki görseller yalnızca önizleme; yüklemeye gerek yok.
  return request<{ imported: { products: number; orders: number; reviews: number; settings: boolean } }>(
    '/admin/import', 'POST', { ...prepared, orders: payload.orders },
  )
}
