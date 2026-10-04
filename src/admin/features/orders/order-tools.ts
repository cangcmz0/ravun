// Sipariş detayında kullanılan yardımcılar:
// • Müşteriye hazır WhatsApp mesajları (duruma göre şablonlar)
// • Yazdırılabilir sipariş fişi
/* eslint-disable @typescript-eslint/no-explicit-any */
import { money, orderStatusLabel, orderTotal } from '@/lib/ravun-data'

export type MessageConfig = {
  paymentInfo?: string
  cargoCompany?: string
  cargoTrackUrl?: string
}

// 0532…, 532…, +90 532…, 90532… → 90532… (wa.me uluslararası biçim ister)
export function normalizeTrPhone(phone?: string) {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = `9${d}`
  else if (d.length === 10 && d.startsWith('5')) d = `90${d}`
  return d
}

export function trackingLink(orderNo: string) {
  return `${window.location.origin}/siparis-takip?no=${encodeURIComponent(orderNo)}`
}

export function cargoLink(code: string, cfg?: MessageConfig) {
  const tpl = cfg?.cargoTrackUrl || ''
  return code && tpl ? tpl.replace(/\{kod\}/g, encodeURIComponent(code)) : ''
}

type Ctx = {
  name: string
  orderNo: string
  total: string
  items: string
  cargoCode: string
  cargoCompany: string
  cargoUrl: string
  track: string
  paymentInfo: string
  reviewUrl: string
}

export type WaTemplate = { key: string; label: string; needsCargo?: boolean; build: (c: Ctx) => string }

const hello = (c: Ctx) => `Merhaba${c.name ? ` ${c.name}` : ''}, Ravun Atölye'den yazıyoruz.`

export const WA_TEMPLATES: WaTemplate[] = [
  {
    key: 'received',
    label: 'Sipariş alındı',
    build: (c) =>
      `${hello(c)}\n\n${c.orderNo} numaralı siparişiniz bize ulaştı:\n${c.items}\nToplam: ${c.total}\n\nÖdeme ve teslimat detaylarını birlikte netleştirelim. Siparişinizi buradan takip edebilirsiniz:\n${c.track}`,
  },
  {
    key: 'payment',
    label: 'Ödeme bilgisi',
    build: (c) =>
      `${hello(c)}\n\n${c.orderNo} numaralı siparişinizin tutarı: ${c.total}\n\n${c.paymentInfo || 'Ödeme bilgilerini hemen paylaşıyoruz.'}\n\nÖdemeniz bize ulaştığında siparişinizi onaylayıp üretime alacağız.`,
  },
  {
    key: 'approved',
    label: 'Onaylandı',
    build: (c) =>
      `${hello(c)}\n\n${c.orderNo} numaralı siparişiniz onaylandı. Kısa süre içinde atölyede hazırlamaya başlıyoruz.\n\nSiparişinizin durumunu buradan takip edebilirsiniz:\n${c.track}`,
  },
  {
    key: 'production',
    label: 'Üretimde',
    build: (c) =>
      `${hello(c)}\n\nSiparişinizin (${c.orderNo}) üretimine başladık. Her parça atölyemizde elde hazırlandığı için özenle ilerliyoruz; hazır olduğunda size haber vereceğiz.\n\nTakip: ${c.track}`,
  },
  {
    key: 'packing',
    label: 'Paketleniyor',
    build: (c) =>
      `${hello(c)}\n\n${c.orderNo} numaralı siparişiniz hazır, şu anda özenle paketleniyor. Kargoya verdiğimizde takip kodunu ileteceğiz.\n\nTakip: ${c.track}`,
  },
  {
    key: 'cargo',
    label: 'Kargoya verildi',
    needsCargo: true,
    build: (c) =>
      [
        `${hello(c)}`,
        '',
        `${c.orderNo} numaralı siparişiniz kargoya verildi.`,
        c.cargoCompany ? `Kargo firması: ${c.cargoCompany}` : '',
        `Takip kodu: ${c.cargoCode || '—'}`,
        c.cargoUrl ? `Kargo takibi: ${c.cargoUrl}` : '',
        '',
        `Sipariş durumunuz: ${c.track}`,
      ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'),
  },
  {
    key: 'delivered',
    label: 'Teslim edildi',
    build: (c) =>
      `${hello(c)}\n\nSiparişiniz size ulaştı, umarız parçanızı çok seversiniz.\n\nDeneyiminizi kısa bir yorumla paylaşırsanız bizi çok mutlu edersiniz:\n${c.reviewUrl}\n\nTeşekkürler, Ravun Atölye`,
  },
  {
    key: 'cancelled',
    label: 'İptal',
    build: (c) =>
      `${hello(c)}\n\n${c.orderNo} numaralı siparişiniz iptal edildi. Bir sorunuz ya da yeni bir talebiniz olursa buradan yazabilirsiniz.`,
  },
]

// Seçili duruma en uygun şablon
export const TEMPLATE_FOR_STATUS: Record<string, string> = {
  pending: 'received',
  approved: 'approved',
  production: 'production',
  packing: 'packing',
  cargo: 'cargo',
  delivered: 'delivered',
  cancelled: 'cancelled',
}

export function buildMessage(key: string, order: any, cargoCode: string, cfg?: MessageConfig) {
  const tpl = WA_TEMPLATES.find((t) => t.key === key) || WA_TEMPLATES[0]
  const items = (order.items || [])
    .map((it: any) => {
      const variant = [it.selectedSize, it.selectedColor].filter(Boolean).join(', ')
      return `• ${it.qty} × ${it.title}${variant ? ` (${variant})` : ''}${it.giftWrap ? ' + hediye paketi' : ''}`
    })
    .join('\n')
  const firstProduct = (order.items || []).find((it: any) => it.baseId)?.baseId
  const origin = window.location.origin
  return tpl.build({
    name: String(order.customerName || '').trim().split(/\s+/)[0] || '',
    orderNo: order.orderNo,
    total: money(orderTotal(order)),
    items,
    cargoCode,
    cargoCompany: cfg?.cargoCompany || '',
    cargoUrl: cargoLink(cargoCode, cfg),
    track: trackingLink(order.orderNo),
    paymentInfo: cfg?.paymentInfo || '',
    reviewUrl: firstProduct ? `${origin}/urun/${firstProduct}#yorumlar` : origin,
  })
}

export function whatsappUrl(phone: string, text: string) {
  return `https://wa.me/${normalizeTrPhone(phone)}?text=${encodeURIComponent(text)}`
}

// ── YAZDIRMA ──
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string)

export function printOrder(order: any) {
  const origin = window.location.origin
  const abs = (src: string) => (src && src.startsWith('/') ? origin + src : src)
  const date = order.createdAt ? new Date(order.createdAt).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }) : ''
  const rows = (order.items || [])
    .map((it: any) => {
      const variant = [it.selectedSize, it.selectedColor].filter(Boolean).join(' · ')
      const gift = it.giftWrap
        ? `<div class="gift">🎁 Hediye paketi${it.giftStyle ? ` · ${esc(it.giftStyle)}` : ''}${it.giftRecipient ? ` · Alıcı: ${esc(it.giftRecipient)}` : ''}${it.giftDelivery ? ` · ${esc(it.giftDelivery)}` : ''}${it.giftNote ? `<br><i>“${esc(it.giftNote)}”</i>` : ''}</div>`
        : ''
      const img = it.image && !String(it.image).startsWith('data:') ? `<img src="${esc(abs(it.image))}" alt="">` : '<span class="ph"></span>'
      return `<tr><td class="thumb">${img}</td><td><b>${esc(it.title)}</b>${variant ? `<div class="muted">${esc(variant)}</div>` : ''}${it.certificateNo ? `<div class="muted">Parça no: ${esc(it.certificateNo)}</div>` : ''}${gift}</td><td class="num">${esc(it.qty)}</td><td class="num">${esc(money(it.price))}</td><td class="num">${esc(money(it.price * it.qty))}</td></tr>`
    })
    .join('')
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(order.orderNo)} · Sipariş fişi</title>
<style>
@page{margin:14mm}
*{box-sizing:border-box}
body{font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#2b2118;margin:0;padding:24px}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #2b2118;padding-bottom:12px;margin-bottom:16px}
header img{height:40px;width:130px;object-fit:cover;object-position:center 53%}
header .no{text-align:right}header .no b{font-size:18px;letter-spacing:.02em}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.box{border:1px solid #d9cfc2;border-radius:8px;padding:10px 12px}
h4{margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8b6534}
table{width:100%;border-collapse:collapse}
th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8b6534;text-align:left;border-bottom:1px solid #d9cfc2;padding:6px 4px}
td{border-bottom:1px solid #eee5da;padding:8px 4px;vertical-align:top}
.num{text-align:right;white-space:nowrap}
.thumb{width:52px}.thumb img,.thumb .ph{display:block;width:44px;height:44px;border-radius:6px;object-fit:cover;background:#f0e8d8}
.muted{color:#7a6a58;font-size:12px}.gift{margin-top:4px;font-size:12px;color:#5a4632}
.total{display:flex;justify-content:flex-end;gap:24px;font-size:16px;margin-top:12px}
.note{margin-top:16px}
.checks{margin-top:22px;display:flex;gap:18px;flex-wrap:wrap;color:#5a4632}
.checks span::before{content:"";display:inline-block;width:12px;height:12px;border:1.5px solid #8b6534;border-radius:3px;margin-right:6px;vertical-align:-2px}
footer{margin-top:28px;border-top:1px solid #d9cfc2;padding-top:10px;font-size:11px;color:#7a6a58;text-align:center}
</style></head><body>
<header><img src="${origin}/assets/ravun-logo.webp" alt="Ravun"><div class="no"><div class="muted">Sipariş fişi</div><b>${esc(order.orderNo)}</b><div class="muted">${esc(date)}</div></div></header>
<div class="grid">
<div class="box"><h4>Müşteri</h4><b>${esc(order.customerName || '—')}</b><div>${esc(order.customerPhone || '')}</div></div>
<div class="box"><h4>Durum</h4><b>${esc(orderStatusLabel(order.status))}</b>${order.cargoCode ? `<div>Kargo kodu: ${esc(order.cargoCode)}</div>` : ''}</div>
</div>
<table><thead><tr><th></th><th>Ürün</th><th class="num">Adet</th><th class="num">Birim</th><th class="num">Tutar</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Ürün bilgisi yok.</td></tr>'}</tbody></table>
<div class="total"><span>Toplam</span><b>${esc(money(orderTotal(order)))}</b></div>
${order.note ? `<div class="note box"><h4>Not</h4>${esc(order.note)}</div>` : ''}
<div class="checks"><span>Ürün kontrol edildi</span><span>Bakım kartı eklendi</span><span>Paketlendi</span><span>Kargoya verildi</span></div>
<footer>Ravun Atölye · El yapımı ahşap ve epoksi tasarım · ${esc(window.location.host)}</footer>
</body></html>`
  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  let printed = false
  const go = () => {
    if (printed) return
    printed = true
    w.focus()
    w.print()
  }
  // Görseller yüklenince yazdır; yüklenemeseler de en geç 1.5 sn sonra.
  w.addEventListener('load', go)
  setTimeout(go, 1500)
  return true
}
