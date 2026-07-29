import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import './style.css';
import PRODUCT_SEED from './data/products.json';
const A = '/assets/';
const ENV = import.meta.env || {};
const SITE_URL = ENV.VITE_SITE_URL || 'https://ravun-tau.vercel.app';
const WA_NUMBER = ENV.VITE_WHATSAPP_NUMBER || '905375614967';
const WA_EMAIL = ENV.VITE_CONTACT_EMAIL || 'atolye@ravun.com.tr';
const WA_DISPLAY = `+${WA_NUMBER.replace(/^(\d{2})(\d{3})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5')}`;
const API_URL = ENV.VITE_API_URL || '';
const IS_PROD = ENV.MODE === 'production';
/* ── GÜVENLİK KATMANI ──
   Not: Frontend tabanlı PIN sadece geçici yerel korumadır. VPS aşamasında backend auth'a bağlanacak şekilde yapı ayrılmıştır.
   PIN hash'i kaynak koduna gömülmemeli; .env dosyasından VITE_ADMIN_PIN_HASH ile sağlanmalıdır.
   Üretim adımları: 1) Güçlü bir PIN seçin (min. 8 karakter).
                    2) Hash üretin: node -e "const c=require('crypto');console.log(c.createHash('sha256').update('ravun-local-admin-v2:PININIZ').digest('hex'))"
                    3) Çıktıyı .env dosyasına VITE_ADMIN_PIN_HASH=<hash> olarak ekleyin. */
const ADMIN_PIN_SHA256 = ENV.VITE_ADMIN_PIN_HASH || '';
if (!ADMIN_PIN_SHA256) {
  console.error('[Ravun] VITE_ADMIN_PIN_HASH tanımlanmamış — .env dosyasını kontrol edin. Admin girişi devre dışı.');
}
/* BULGU DÜZELTMESİ: panelde "(1234)" gibi PIN'i sabit metin olarak göstermek,
   PIN her değiştiğinde yanlış/eski bilgi göstermeye devam ederdi (ve panelde
   gerçek PIN'i asla göstermemeliyiz zaten). Bunun yerine yalnızca "hâlâ bilinen
   zayıf varsayılan PIN mi" diye kontrol ediyoruz — hash'i karşılaştırıyoruz,
   PIN'in kendisini hiçbir yerde tutmuyoruz. */
const KNOWN_WEAK_DEFAULT_PIN_HASH = '32456b37e2f184491ff7824b906b0f04fd2327eb36f39c5c50bb7f241be9f061'; // "1234"
const ADMIN_PIN_IS_DEFAULT = ADMIN_PIN_SHA256 === KNOWN_WEAK_DEFAULT_PIN_HASH;
const ADMIN_PIN_SALT = 'ravun-local-admin-v2';
const ADMIN_SESSION_KEY = 'ravun:adm_s';
const ADMIN_LOCK_KEY = 'ravun:adm_l';
const ADMIN_ATTEMPT_KEY = 'ravun:adm_a';
const ADMIN_TOKEN_KEY = 'ravun:adm_t';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60000; // 60 saniye (30'dan artırıldı)
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 saat
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
}
function timingSafeEqual(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  let out = aa.length ^ bb.length;
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) out |= (aa.charCodeAt(i) || 0) ^ (bb.charCodeAt(i) || 0);
  return out === 0;
}
/* PIN doğrulama — hash karşılaştırması */
async function verifyAdminPin(inputPin) {
  try {
    if (!ADMIN_PIN_SHA256) return false; // hash yapılandırılmamışsa girişe izin verme
    const normalized = String(inputPin || '').trim().slice(0, 32);
    if (!normalized) return false;
    const digest = await sha256Hex(`${ADMIN_PIN_SALT}:${normalized}`);
    return timingSafeEqual(digest, ADMIN_PIN_SHA256);
  } catch {
    return false;
  }
}
/* Token üretimi — oturum için rastgele imzalı token */
function generateSessionToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}
/* Oturum geçerlilik kontrolü */
function isValidAdminSession() {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return false;
    const session = JSON.parse(atob(raw));
    if (!session.token || !session.exp || !session.fingerprint) return false;
    if (Date.now() > session.exp) { clearAdminSession(); return false; }
    const storedToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (!storedToken || storedToken !== session.token) return false;
    /* BULGU DÜZELTMESİ: fingerprint alanı oturum oluşturulurken hesaplanıp
       saklanıyordu ama daha önce hiçbir yerde geri kontrol edilmiyordu — var olan
       ama işlevsiz bir kontrol izlenimi veriyordu. sessionStorage zaten sekmeye/
       origin'e özel olduğu için bu tek başına güçlü bir sınır değil, ama session
       verisi başka bir bağlama kopyalanırsa (örn. paylaşılan bir dosyadan) en
       azından o cihaz/tarayıcı ortamıyla eşleşmediğini yakalar. */
    if (session.fingerprint !== getBrowserFingerprint()) return false;
    return true;
  } catch { return false; }
}
/* Browser parmak izi — basit ama etkili */
function getBrowserFingerprint() {
  return btoa([
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ].join('|')).slice(0, 24);
}
/* Yeni oturum oluştur */
function createAdminSession() {
  const token = generateSessionToken();
  const session = {
    token,
    exp: Date.now() + SESSION_TIMEOUT_MS,
    fingerprint: getBrowserFingerprint(),
    created: Date.now()
  };
  sessionStorage.setItem(ADMIN_SESSION_KEY, btoa(JSON.stringify(session)));
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  return token;
}
/* Oturumu temizle */
function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_LOCK_KEY);
  sessionStorage.removeItem(ADMIN_ATTEMPT_KEY);
}
const INITIAL_PRODUCTS = PRODUCT_SEED;
const INITIAL_REVIEWS = {
  1:[{id:1,name:'Selin K.',avatar:'S',rating:5,date:'Mart 2025',text:'Rafın fotoğrafları güzeldi ama elinize aldığınızda gerçek kalitesini anlıyorsunuz.',helpful:8,approved:true},{id:2,name:'Emre T.',avatar:'E',rating:5,date:'Şubat 2025',text:'Salonumun en dikkat çekici noktası oldu.',helpful:5,approved:true}],
  2:[{id:1,name:'Burak M.',avatar:'B',rating:5,date:'Nisan 2025',text:'Mutfak tezgahımın üzerinde hem fonksiyonel hem sanat eseri.',helpful:11,approved:true}],
  3:[{id:1,name:'Can Ö.',avatar:'C',rating:5,date:'Mayıs 2025',text:'Masama ayrı bir karakter kattı. Küçük boyutuna rağmen çok sağlam.',helpful:9,approved:true},{id:2,name:'Merve S.',avatar:'M',rating:5,date:'Nisan 2025',text:'Fiyatına kesinlikle değer. El yapımı olduğu her açıdan belli.',helpful:6,approved:true}],
  4:[{id:1,name:'Nilüfer B.',avatar:'N',rating:5,date:'Haziran 2025',text:'Peynir ve meze tabağı olarak kullanıyorum. Hem şık hem dayanıklı.',helpful:14,approved:true}],
  5:[{id:1,name:'Leyla Ç.',avatar:'L',rating:5,date:'Temmuz 2025',text:"Ofis masam tamamen değişti. 3'lü set birbirine çok uyumlu.",helpful:7,approved:true}],
  6:[{id:1,name:'Pınar E.',avatar:'P',rating:5,date:'Ağustos 2025',text:'Butik markam için etiket seti aldım, müşterilerden çok güzel dönüşler aldım.',helpful:18,approved:true},{id:2,name:'Serkan T.',avatar:'S',rating:5,date:'Temmuz 2025',text:'Detay kalitesi inanılmaz. Baskı net, materyaller çok kaliteli.',helpful:9,approved:true}],
};
const CATEGORIES = ['Tümü','Duvar Rafı','Bıçak Standı','Masaüstü','Sunum Tahtası','Paketleme'];
const CATEGORY_DETAILS = {
  'tum': { eyebrow:'TÜM KOLEKSİYON', title:'Atölyeden çıkan seçili parçalar', desc:'Ahşap, epoksi ve elde tamamlanan sınırlı üretim ürünleri tek alanda inceleyin.', image:`${A}products_hero-3.webp` },
  'duvar-rafi': { eyebrow:'DUVAR RAFI', title:'Duvara karakter katan parçalar', desc:'Ceviz damarları, epoksi akışları ve doğal yağ bitişiyle mekâna sıcaklık katan raflar.', image:`${A}products_hero-1.webp` },
  'bicak-standi': { eyebrow:'BIÇAK STANDI', title:'Mutfakta heykelsi düzen', desc:'Bıçaklar için güvenli, dengeli ve dekoratif ahşap/epoksi stand seçenekleri.', image:`${A}product-atlas.webp` },
  'masaustu': { eyebrow:'MASAÜSTÜ', title:'Çalışma alanına imza dokunuş', desc:'Kalemlik, masa seti ve küçük dekoratif objelerle masa üzerinde sıcak bir Ravun dili.', image:`${A}product-atlas.webp` },
  'sunum-tahtasi': { eyebrow:'SUNUM TAHTASI', title:'Masada ilk dikkat çeken detay', desc:'Gıda güvenli yağ bitişli, epoksi akışlı ve elde tamamlanan servis parçaları.', image:`${A}products_hero-1.webp` },
  'paketleme': { eyebrow:'PAKETLEME', title:'Marka dokusunu tamamlayan setler', desc:'Keten, mantar ve deri detaylı etiket/paketleme diliyle butik sunum parçaları.', image:`${A}tags-cork.webp` }
};
const DEFAULT_CATEGORY_SETTINGS = Object.fromEntries(Object.entries(CATEGORY_DETAILS).map(([key, value]) => [key, {...value}]));
const slides = [
  { tag:'SİPARİŞ ÜZERİNE', line1:'Atölyeden', line2:'masanıza.', image:`${A}products_hero-1.webp` },
  { tag:'RAVUN ATÖLYE', line1:'Sanat olarak', line2:'işlev.', image:`${A}products_hero-3.webp` },
  { tag:'SINIRLI ÜRETİM', line1:'Her parça,', line2:'tek.', image:`${A}products_hero-2.webp` },
];
const DEFAULT_SITE_SETTINGS = {
  styleVersion: 'ravun-v107-clean-commerce',
  heroTag: 'SİPARİŞ ÜZERİNE',
  heroLine1: 'Atölyeden',
  heroLine2: 'masanıza.',
  heroCta: 'Bu Parçayı Gör ↗',
  heroSecondCta: 'TÜM KOLEKSİYON',
  collectionEyebrow: 'KOLEKSİYON',
  collectionTitle: 'Atölyeden çıkan\nher parça.',
  collectionDesc: 'Özel üretim, sipariş üzerine. Her biri tek.',
  atelierEyebrow: 'ATÖLYEDEN',
  atelierTitle: 'Sade çizgi,\nyumuşak anlatım.',
  atelierDesc: 'Metinler daha kısa ve zarif; ürün fotoğrafları kartın içine taşmadan, kırpılmadan yerleşir.',
  announcement: '',
  storyTitle: 'Ahşabın doğal çizgisi, epoksinin sakin akışıyla birleşir.',
  storyDesc: 'Ravun’da her ürün aynı kalıptan çıkan bir obje değil; ahşabın damarına göre yeniden yorumlanan tekil bir parça.',
  packageTitle: 'Korumalı paketleme, bakım notu ve Ravun etiketiyle teslim.',
  packageDesc: 'Siparişler darbe emici iç destek, pamuklu sarım ve marka kartıyla hazırlanır.',
  footerDesc: 'Doğal ahşap ve epoksi reçineyi el işçiliğiyle buluşturan butik atölye.',
  footerLocation: 'Beykoz, İstanbul · 2018\'den beri',
  instagram: '@ravun.atolye',
  instagramUrl: 'https://instagram.com/ravun.atolye',
  pinterestLabel: 'Pinterest — yakında',
  categorySettings: DEFAULT_CATEGORY_SETTINGS,
  giftTitle: 'Hediye olarak hazırlansın',
  giftDesc: 'Kraft kutu, Ravun kartı, not alanı ve korumalı sunum seçeneği.',
  giftPrice: 180,
  showAtelierFeature: false,
  showEditions: false,
  showArchive: true,
  showStoryPreview: true,
  showPromise: false,
  showProcess: false,
  showTrustFlow: false,
  showBrandExperience: false,
  showJournal: false,
  showCta: true
};
const steps = [
  ['01','Tasarım','Eskiz defterimizde başlıyor. Ahşabın damar yönü ve epoksi rengi mekânla birlikte çiziliyor.','TASARIM BRİFİ 7–10 GÜN SÜRÜYOR'],
  ['02','Döküm','Seçilen ahşap kurutulur, kalıba alınır; pigmentli epoksi kontrollü şekilde katmanlı dökülür.','HER DÖKÜM 18–22°C SABİT SICAKLIKTA'],
  ['03','Cilalama','El ile zımpara 80\'den 3000 grit\'e kadar. Sonra doğal yağ ve sert balmumu üç kat emdiriliyor.','EN AZ 18 SAAT EL CİLASI'],
  ['04','Teslim','Atölyede son fotoğraf; pamuklu örtüye sarılıp korumalı kutuda sigortalı kargo ile yola çıkıyor.','YURT İÇİ 3–4 İŞ GÜNÜ · SİGORTALI'],
];
/* ── YARDIMCILAR ── */
function money(n) { return new Intl.NumberFormat('tr-TR').format(n) + ' TL'; }
function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function categoryKey(value) {
  const key = normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const aliases = {
    'tum': 'tum',
    'tumu': 'tum',
    'bicak-standi': 'bicak-standi',
    'b-cak-stand': 'bicak-standi',
    'b-cak-standi': 'bicak-standi',
    'duvar-rafi': 'duvar-rafi',
    'duvar-raf': 'duvar-rafi',
    'masaustu': 'masaustu',
    'masa-ustu': 'masaustu',
    'sunum-tahtasi': 'sunum-tahtasi',
    'sunum-tahta': 'sunum-tahtasi',
    'paketleme': 'paketleme'
  };
  return aliases[key] || key;
}
function categoryLabelFromKey(key, fallback='') {
  const labels = {
    'tum': 'Tümü',
    'duvar-rafi': 'Duvar Rafı',
    'bicak-standi': 'Bıçak Standı',
    'masaustu': 'Masaüstü',
    'sunum-tahtasi': 'Sunum Tahtası',
    'paketleme': 'Paketleme'
  };
  return labels[key] || fallback || key.split('-').map(x => x ? x[0].toLocaleUpperCase('tr-TR') + x.slice(1) : x).join(' ');
}
function sameCategory(a, b) {
  if (categoryKey(b) === 'tum') return true;
  return categoryKey(a) === categoryKey(b);
}
function categoryDetail(key, settings) {
  const normalized = categoryKey(key);
  const managed = settings?.categorySettings?.[normalized];
  const fallback = CATEGORY_DETAILS[normalized] || CATEGORY_DETAILS.tum;
  return {...fallback, ...(managed && typeof managed === 'object' ? managed : {})};
}
/* ── V90–V94: ÜRÜN DURUMU, ARŞİV, HEDİYE, WHATSAPP VE BAKIM ── */
const PRODUCT_STATUS = {
  available: {label:'Satışta', short:'Satışta', action:'Sepete Ekle', tone:'available', canOrder:true, archive:false},
  single: {label:'Tek parça', short:'Tek parça', action:'Sepete Ekle', tone:'single', canOrder:true, archive:false},
  production: {label:'Satışta', short:'Satışta', action:'Sepete Ekle', tone:'available', canOrder:true, archive:false},
  preorder: {label:'Satışta', short:'Satışta', action:'Sepete Ekle', tone:'available', canOrder:true, archive:false},
  similar: {label:'Arşiv', short:'Arşiv', action:'Detayı Gör', tone:'sold', canOrder:false, archive:true},
  sold: {label:'Satıldı', short:'Satıldı', action:'Satıldı', tone:'sold', canOrder:false, archive:true},
  draft: {label:'Taslak', short:'Taslak', action:'Detayı Gör', tone:'draft', canOrder:false, archive:false}
};
function normalizeProductStatus(value, product={}) {
  const raw = normalizeText(value || product?.status || '').replace(/-/g,' ');
  if(raw.includes('taslak') || raw.includes('draft')) return 'draft';
  if(['sold','satildi','satildi'].includes(raw) || raw.includes('satil')) return 'sold';
  if(raw.includes('arsiv') || raw.includes('archive')) return 'similar';
  if(raw.includes('tek') || raw.includes('single') || String(product?.tag||'').toLocaleLowerCase('tr-TR').includes('tek')) return 'single';
  const stock = normalizeText(product?.stock || '');
  if(stock.includes('taslak')) return 'draft';
  if(stock.includes('satildi') || stock.includes('satildi')) return 'sold';
  // Kullanıcının isteği: otomatik durum etiketi üretme.
  // Ürünler admin panelden tek tek girilecek; açıkça satıldı denmedikçe satışta kabul edilir.
  return 'available';
}
function productStatusInfo(product) {
  const key = normalizeProductStatus(product?.status, product);
  return {...PRODUCT_STATUS.available, ...(PRODUCT_STATUS[key] || PRODUCT_STATUS.available), key};
}
function productCanBeOrdered(product) { return Boolean(productStatusInfo(product).canOrder); }
function productIsArchive(product) { const st = productStatusInfo(product); return Boolean(product?.archiveVisible || st.archive); }
function productStatusWa(product) {
  const st = productStatusInfo(product);
  const cert = certificateNo(product);
  const msg = st.key === 'sold' || st.key === 'similar'
    ? `Merhaba, ${product.title} arşiv parçası hakkında bilgi almak istiyorum.
Parça No: ${cert}`
    : `Merhaba, ${product.title} ürününü sipariş etmek istiyorum.
Parça No: ${cert}`;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}
function defaultCareTips(product={}) {
  const mats = normalizeText((product.materials || []).join(' '));
  const base = [
    'Yüzeyi kuru veya hafif nemli yumuşak bezle silin.',
    'Alkol, çamaşır suyu ve aşındırıcı kimyasallardan uzak tutun.',
    'Uzun süre direkt güneş ve yoğun nem altında bırakmayın.'
  ];
  if (mats.includes('gida') || normalizeText(product.category).includes('sunum')) base.push('Gıda teması sonrası yüzeyi bekletmeden kurulayın.');
  else base.push('Sıcak, ıslak veya ağır objeleri uzun süre aynı noktada bırakmayın.');
  return base;
}
function buildProductWhatsAppMessage(product, opts={}) {
  const st = productStatusInfo(product);
  const lines = [
    'Merhaba, Ravun sitesinden bu parça hakkında yazıyorum.',
    '',
    `Ürün: ${product.title}`,
    `Parça No: ${certificateNo(product)}`,
    `Durum: ${st.label}`,
    `Fiyat: ${money(product.price)}`,
    opts.size ? `Boyut: ${opts.size}` : '',
    opts.color ? `Ton/Renk: ${opts.color}` : '',
    opts.giftWrap ? 'Hediye paketi: Evet' : '',
    opts.giftStyle ? `Paket tipi: ${opts.giftStyle}` : '',
    opts.giftRecipient ? `Alıcı adı: ${opts.giftRecipient}` : '',
    opts.giftDelivery ? `İstenen tarih: ${opts.giftDelivery}` : '',
    opts.giftNote ? `Hediye notu: ${opts.giftNote}` : '',
    '',
    st.archive ? 'Aynısı yoksa benzerini hazırlama imkanı var mı?' : 'Sipariş/üretim detaylarını konuşabilir miyiz?'
  ].filter(Boolean);
  return lines.join('\n');
}
function productOrderWa(product, opts={}) {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(buildProductWhatsAppMessage(product, opts))}`;
}
function cartItemLine(item) {
  const st = productStatusInfo(item);
  const details = [
    item.selectedSize ? `Boyut: ${item.selectedSize}` : '',
    item.selectedColor ? `Ton: ${item.selectedColor}` : '',
    item.giftWrap ? `Hediye: ${item.giftStyle || 'Hediye paketi'}` : '',
    item.giftRecipient ? `Alıcı: ${item.giftRecipient}` : '',
    item.giftDelivery ? `Tarih: ${item.giftDelivery}` : '',
    item.giftNote ? `Not: ${item.giftNote}` : ''
  ].filter(Boolean);
  return `• ${item.title} x${item.qty}: ${money(item.price*item.qty)}\n  Parça No: ${certificateNo(item)} · Durum: ${st.label}${details.length ? `\n  ${details.join('\n  ')}` : ''}`;
}
function buildCartWhatsAppMessage({cart,total,itemCount,giftCount,customer,created}) {
  return [
    'Merhaba, Ravun üzerinden sipariş vermek istiyorum.',
    '',
    '🧾 Sipariş Özeti',
    cart.map(cartItemLine).join('\n'),
    '',
    `Toplam ürün: ${itemCount}`,
    giftCount ? `Hediye paketli ürün: ${giftCount}` : '',
    `Toplam: ${money(total)}`,
    customer?.name ? `Müşteri: ${customer.name}` : '',
    customer?.phone ? `Telefon: ${customer.phone}` : '',
    customer?.note ? `Sipariş notu: ${customer.note}` : '',
    created ? `Sipariş No: ${created.orderNo}` : '',
    '',
    'Müsaitseniz teslim süresi ve ödeme bilgisini paylaşabilir misiniz?'
  ].filter(Boolean).join('\n');
}
const SECURITY_LIMITS = { text: 220, longText: 1400, url: 1200, image: 4_800_000, list: 40 };
function cleanText(value, max = SECURITY_LIMITS.text) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function safeNumber(value, fallback = 0, min = 0, max = 10_000_000) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function safeHexColor(value, fallback = '#1a6b4a') {
  const v = cleanText(value, 24);
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : fallback;
}
function safeUrl(value, fallback = '#') {
  const raw = cleanText(value, SECURITY_LIMITS.url);
  if (!raw) return fallback;
  if (raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return raw;
  try {
    const u = new URL(raw, SITE_URL);
    return ['https:', 'http:'].includes(u.protocol) ? u.toString() : fallback;
  } catch { return fallback; }
}
function safeImageSrc(value, fallback = `${A}products_hero-1.webp`) {
  const raw = cleanText(value, SECURITY_LIMITS.image);
  if (!raw) return fallback;
  if (raw.startsWith('/assets/') || raw.startsWith(A)) return raw;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(raw) && raw.length <= SECURITY_LIMITS.image) return raw;
  if (/^blob:/i.test(raw)) return raw;
  try {
    const u = new URL(raw, SITE_URL);
    return ['https:', 'http:'].includes(u.protocol) ? u.toString() : fallback;
  } catch { return fallback; }
}
function safeList(value, fallback = [], maxItems = SECURITY_LIMITS.list, mapper = cleanText) {
  const src = Array.isArray(value) ? value : fallback;
  return src.slice(0, maxItems).map(mapper).filter(Boolean);
}
function normalizeDetailPoints(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : (Array.isArray(fallback) ? fallback : []);
  return source.slice(0, 6).map((point, index) => ({
    x: safeNumber(point?.x, 50 + (index * 7), 6, 94),
    y: safeNumber(point?.y, 50, 8, 92),
    title: cleanText(point?.title || `Detay ${index + 1}`, 70),
    text: cleanText(point?.text || 'Ravun atölyesinde elde tamamlanan özel detay.', 180)
  })).filter(point => point.title);
}
function certificateNo(product) {
  const id = safeNumber(product?.id, 1, 1, 999999);
  return cleanText(product?.certificateNo || `RVN-${String(id).padStart(3, '0')}`, 40);
}
function safeOpen(url) {
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (w) w.opener = null;
}
function recentProductIds(value, products = INITIAL_PRODUCTS) {
  const valid = new Set((products || []).map(p => Number(p.id)));
  return Array.isArray(value) ? [...new Set(value.map(Number).filter(id => valid.has(id)))] : [];
}
function relatedProducts(product, products, limit = 4) {
  const visible = sortProductsForStore((products || []).filter(p => p && p.visible !== false && Number(p.id) !== Number(product?.id)));
  const same = visible.filter(p => categoryKey(p.category) === categoryKey(product?.category));
  const featured = visible.filter(p => p.featured && !same.some(x => x.id === p.id));
  const rest = visible.filter(p => !same.some(x => x.id === p.id) && !featured.some(x => x.id === p.id));
  return [...same, ...featured, ...rest].slice(0, limit);
}
function sortProductsForStore(list) {
  return [...(list || [])].sort((a,b)=>{
    const ao = safeNumber(a?.sortOrder, Number(a?.id)||0, 0, 999999);
    const bo = safeNumber(b?.sortOrder, Number(b?.id)||0, 0, 999999);
    if (ao !== bo) return ao - bo;
    if (Boolean(b?.featured) !== Boolean(a?.featured)) return Number(Boolean(b?.featured)) - Number(Boolean(a?.featured));
    return (Number(a?.id)||0) - (Number(b?.id)||0);
  });
}
function repairProducts(products) {
  const current = normalizeProducts(products);
  const byId = new Map(current.map(p => [Number(p.id), p]));
  INITIAL_PRODUCTS.forEach(base => {
    const existing = byId.get(base.id);
    if (!existing) byId.set(base.id, {...base});
    else byId.set(base.id, {
      ...existing,
      category: categoryLabelFromKey(categoryKey(existing.category || base.category), existing.category || base.category),
      visible: existing.visible !== false,
      image: existing.image || base.image,
      gallery: Array.isArray(existing.gallery) && existing.gallery.length ? existing.gallery : base.gallery
    });
  });
  return [...byId.values()].sort((a,b)=>Number(a.id)-Number(b.id));
}
function avgRating(reviews) {
  const a = (reviews||[]).filter(r=>r.approved);
  return a.length ? a.reduce((s,r)=>s+r.rating,0)/a.length : 0;
}
/* ── GÜVENLİ DEPOLAMA: veriler base64 kodlanmış, kaba okumaya karşı korumalı ── */
/* Not: düz btoa/atob yalnızca Latin1 karakter setini destekler — Türkçe
   karakterler (ş, ğ, ı gibi Latin1 dışına düşenler) verildiğinde
   InvalidCharacterError fırlatıp kaydı sessizce başarısız kılıyordu.
   Bu yüzden tüm JSON verisi UTF-8 güvenli sarmalayıcılarla kodlanır. */
function b64EncodeUtf8(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
}
function b64DecodeUtf8(str) {
  return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}
function _sk(key) {
  return btoa('rv:' + key).replace(/=/g,'');
}
/* BULGU DÜZELTMESİ: writeStored (özellikle 'ravun:products') JSON.stringify + base64
   encode işlemini senkron çalıştırıyor; ürün galerileri admin panelden yüklenen
   base64 görseller içerdiğinde bu string birkaç MB'a çıkabiliyor. Önceden bu yazma
   işlemi her state değişiminde (örn. admin panelde bir alana yazılan HER karakterde)
   anında tetikleniyordu — ana thread'i her tuş vuruşunda uzun süre bloke edip
   input'un scroll/odak davranışında sıçramaya yol açan asıl kaynak buydu. Bu hook,
   yazmayı kullanıcı bir süre durana kadar erteler (debounce) ki her tuş vuruşu değil,
   sadece yazma bittiğinde bir kez ağır encode/localStorage işlemi çalışsın. */
function useAutosave(key, value, delay = 500) {
  useEffect(() => {
    const t = setTimeout(() => writeStored(key, value), delay);
    return () => clearTimeout(t);
  }, [key, value, delay]);
}
function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(_sk(key));
    if (!raw || raw.length > 7_000_000) return fallback;
    const decoded = b64DecodeUtf8(raw);
    if (decoded.length > 5_000_000) return fallback;
    const parsed = JSON.parse(decoded);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}
function writeStored(key, value) {
  try {
    const encoded = b64EncodeUtf8(JSON.stringify(value));
    if (encoded.length > 7_000_000) return;
    localStorage.setItem(_sk(key), encoded);
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22)) {
      console.warn('[Ravun] localStorage kotası doldu — veri kaydedilemedi:', key);
      /* Kullanıcıyı yalnızca ilk kez uyar (konsol spam'i önle) */
      if (!writeStored._quotaWarned) {
        writeStored._quotaWarned = true;
        setTimeout(() => {
          const banner = document.getElementById('rv-quota-banner');
          if (!banner) {
            const el = document.createElement('div');
            el.id = 'rv-quota-banner';
            el.setAttribute('role', 'alert');
            el.style.cssText = 'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);z-index:9999;background:#b91c1c;color:#fff;padding:.75rem 1.25rem;border-radius:.5rem;font-size:.875rem;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:90vw;text-align:center';
            el.textContent = '⚠️ Tarayıcı depolama alanı doldu. Bazı veriler kaydedilemedi. Önbelleği temizleyerek yer açabilirsiniz.';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 7000);
          }
        }, 0);
      }
    } else {
      console.warn('[Ravun] writeStored hatası:', key, err);
    }
  }
}
function normalizeSiteSettings(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  const mergedCats = {
    ...DEFAULT_CATEGORY_SETTINGS,
    ...(incoming.categorySettings && typeof incoming.categorySettings === 'object' ? incoming.categorySettings : {})
  };
  const safeCats = Object.fromEntries(Object.entries(mergedCats).map(([key, cat]) => [categoryKey(key), {
    eyebrow: cleanText(cat?.eyebrow || DEFAULT_CATEGORY_SETTINGS[categoryKey(key)]?.eyebrow || '', 60),
    title: cleanText(cat?.title || DEFAULT_CATEGORY_SETTINGS[categoryKey(key)]?.title || '', 120),
    desc: cleanText(cat?.desc || DEFAULT_CATEGORY_SETTINGS[categoryKey(key)]?.desc || '', 280),
    image: safeImageSrc(cat?.image, DEFAULT_CATEGORY_SETTINGS[categoryKey(key)]?.image || `${A}products_hero-1.webp`)
  }]));
  const staleVisualPreset = incoming.styleVersion !== DEFAULT_SITE_SETTINGS.styleVersion;
  return {
    ...DEFAULT_SITE_SETTINGS,
    ...incoming,
    styleVersion: DEFAULT_SITE_SETTINGS.styleVersion,
    heroTag: cleanText(staleVisualPreset ? DEFAULT_SITE_SETTINGS.heroTag : (incoming.heroTag || DEFAULT_SITE_SETTINGS.heroTag), 60),
    heroLine1: cleanText(staleVisualPreset ? DEFAULT_SITE_SETTINGS.heroLine1 : (incoming.heroLine1 || DEFAULT_SITE_SETTINGS.heroLine1), 90),
    heroLine2: cleanText(staleVisualPreset ? DEFAULT_SITE_SETTINGS.heroLine2 : (incoming.heroLine2 || DEFAULT_SITE_SETTINGS.heroLine2), 90),
    heroCta: cleanText(staleVisualPreset ? DEFAULT_SITE_SETTINGS.heroCta : (incoming.heroCta || DEFAULT_SITE_SETTINGS.heroCta), 60),
    heroSecondCta: cleanText(staleVisualPreset ? DEFAULT_SITE_SETTINGS.heroSecondCta : (incoming.heroSecondCta || DEFAULT_SITE_SETTINGS.heroSecondCta), 60),
    collectionEyebrow: cleanText(incoming.collectionEyebrow || DEFAULT_SITE_SETTINGS.collectionEyebrow, 60),
    giftTitle: cleanText(incoming.giftTitle || DEFAULT_SITE_SETTINGS.giftTitle, 90),
    giftDesc: cleanText(incoming.giftDesc || DEFAULT_SITE_SETTINGS.giftDesc, 240),
    giftPrice: safeNumber(incoming.giftPrice, Number(DEFAULT_SITE_SETTINGS.giftPrice)||0, 0, 100000),
    footerDesc: cleanText(incoming.footerDesc || DEFAULT_SITE_SETTINGS.footerDesc, 240),
    footerLocation: cleanText(incoming.footerLocation || DEFAULT_SITE_SETTINGS.footerLocation, 120),
    instagram: cleanText(incoming.instagram || DEFAULT_SITE_SETTINGS.instagram, 80),
    instagramUrl: safeUrl(incoming.instagramUrl || DEFAULT_SITE_SETTINGS.instagramUrl, 'https://instagram.com/'),
    pinterestLabel: cleanText(incoming.pinterestLabel || DEFAULT_SITE_SETTINGS.pinterestLabel, 80),
    showAtelierFeature: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showAtelierFeature : (typeof incoming.showAtelierFeature === 'boolean' ? incoming.showAtelierFeature : DEFAULT_SITE_SETTINGS.showAtelierFeature),
    showEditions: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showEditions : (typeof incoming.showEditions === 'boolean' ? incoming.showEditions : DEFAULT_SITE_SETTINGS.showEditions),
    showArchive: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showArchive : (typeof incoming.showArchive === 'boolean' ? incoming.showArchive : DEFAULT_SITE_SETTINGS.showArchive),
    showStoryPreview: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showStoryPreview : (typeof incoming.showStoryPreview === 'boolean' ? incoming.showStoryPreview : DEFAULT_SITE_SETTINGS.showStoryPreview),
    showPromise: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showPromise : (typeof incoming.showPromise === 'boolean' ? incoming.showPromise : DEFAULT_SITE_SETTINGS.showPromise),
    showProcess: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showProcess : (typeof incoming.showProcess === 'boolean' ? incoming.showProcess : DEFAULT_SITE_SETTINGS.showProcess),
    showTrustFlow: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showTrustFlow : (typeof incoming.showTrustFlow === 'boolean' ? incoming.showTrustFlow : DEFAULT_SITE_SETTINGS.showTrustFlow),
    showBrandExperience: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showBrandExperience : (typeof incoming.showBrandExperience === 'boolean' ? incoming.showBrandExperience : DEFAULT_SITE_SETTINGS.showBrandExperience),
    showJournal: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showJournal : (typeof incoming.showJournal === 'boolean' ? incoming.showJournal : DEFAULT_SITE_SETTINGS.showJournal),
    showCta: staleVisualPreset ? DEFAULT_SITE_SETTINGS.showCta : (typeof incoming.showCta === 'boolean' ? incoming.showCta : DEFAULT_SITE_SETTINGS.showCta),
    categorySettings: safeCats
  };
}
function normalizeProducts(value) {
  const source = Array.isArray(value) && value.length ? value.slice(0, 250) : INITIAL_PRODUCTS;
  return source.map((product, index) => {
    const fallback = INITIAL_PRODUCTS.find(x => x.id === product?.id) || INITIAL_PRODUCTS[index % INITIAL_PRODUCTS.length] || INITIAL_PRODUCTS[0];
    const rawGallery = Array.isArray(product?.gallery) && product.gallery.length ? product.gallery : (product?.image ? [product.image] : fallback.gallery);
    const gallery = safeList(rawGallery, fallback.gallery || [fallback.image], 24, img => safeImageSrc(img, fallback.image));
    const fallbackImage = gallery[0] || fallback.image || `${A}products_hero-1.webp`;
    return {
      ...fallback,
      ...product,
      id: safeNumber(product?.id, fallback.id || index + 1, 1, 999999),
      title: cleanText(product?.title || fallback.title, 120),
      category: categoryLabelFromKey(categoryKey(product?.category || fallback.category || 'Masaüstü'), product?.category || fallback.category || 'Masaüstü'),
      tag: cleanText(product?.tag || fallback.tag || 'ATÖLYE', 40),
      desc: cleanText(product?.desc || fallback.desc || '', 260),
      longDesc: cleanText(product?.longDesc || fallback.longDesc || product?.desc || '', 1400),
      price: safeNumber(product?.price, 0, 0, 10_000_000),
      delivery: cleanText(product?.delivery || fallback.delivery || '2–3 hafta', 80),
      stock: cleanText(product?.stock || fallback.stock || 'Sipariş üzerine', 80),
      status: normalizeProductStatus(product?.status || fallback.status, {...fallback, ...product}),
      archiveVisible: Boolean(product?.archiveVisible || fallback.archiveVisible),
      visible: product?.visible !== false,
      homeVisible: product?.homeVisible !== undefined ? Boolean(product.homeVisible) : (fallback?.homeVisible !== undefined ? Boolean(fallback.homeVisible) : index < 3),
      sortOrder: safeNumber(product?.sortOrder, fallback?.sortOrder ?? ((fallback?.id || index + 1) * 10), 0, 999999),
      featured: Boolean(product?.featured),
      gallery,
      image: safeImageSrc(product?.image || fallbackImage, fallbackImage),
      materials: safeList(product?.materials, fallback.materials || [], 24, x => cleanText(x, 70)),
      dimensions: cleanText(product?.dimensions || fallback.dimensions || '', 120),
      weight: cleanText(product?.weight || fallback.weight || '', 50),
      sizes: safeList(product?.sizes, fallback.sizes || ['Standart'], 24, x => cleanText(x, 60)),
      colors: safeList(product?.colors, fallback.colors || ['#1a6b4a'], 24, x => safeHexColor(x)),
      colorNames: safeList(product?.colorNames, fallback.colorNames || ['Zümrüt'], 24, x => cleanText(x, 50)),
      story: cleanText(product?.story || fallback.story || product?.longDesc || fallback.longDesc || product?.desc || '', 900),
      craftTime: cleanText(product?.craftTime || fallback.craftTime || product?.delivery || fallback.delivery || 'Atölye sürecine göre', 80),
      finish: cleanText(product?.finish || fallback.finish || 'Doğal yağ bitiş', 80),
      repeatable: cleanText(String(product?.repeatable || fallback.repeatable || 'Aynı desen tekrarlanmaz').replace(/Benzeri hazırlanabilir/gi, 'Aynı desen tekrarlanmaz').replace(/Benzeri özel siparişle hazırlanabilir\./gi, 'Satılan parça arşivde kalır.'), 120),
      certificateNo: certificateNo(product?.certificateNo ? product : {...fallback, id: product?.id || fallback.id}),
      productionMood: cleanText(product?.productionMood || fallback.productionMood || 'Tekil atölye parçası', 110),
      giftEligible: product?.giftEligible !== false,
      materialNote: cleanText(product?.materialNote || fallback.materialNote || 'Doğal malzeme dokusu her parçada küçük farklılıklar gösterebilir.', 260),
      careSummary: cleanText(product?.careSummary || fallback.careSummary || 'Yumuşak bezle temizleyin; yoğun nem, direkt güneş ve kimyasal temizleyicilerden uzak tutun.', 320),
      careTips: safeList(product?.careTips, fallback.careTips || defaultCareTips(product), 8, x => cleanText(x, 160)),
      packageNote: cleanText(product?.packageNote || fallback.packageNote || 'Korumalı kutu, bakım notu ve Ravun etiketiyle hazırlanır.', 220),
      detailPoints: normalizeDetailPoints(product?.detailPoints, fallback.detailPoints || [])
    };
  });
}
function normalizeReviews(value) {
  const base = (value && typeof value === 'object' && !Array.isArray(value)) ? value : INITIAL_REVIEWS;
  const fixed = {};
  const productIds = new Set([...INITIAL_PRODUCTS.map(p => String(p.id)), ...Object.keys(base || {})].slice(0, 300));
  productIds.forEach(pid => {
    const list = Array.isArray(base?.[pid]) ? base[pid].slice(0, 500) : [];
    fixed[pid] = list.filter(Boolean).map((r, i) => ({
      id: safeNumber(r?.id, Date.now() + i, 1, 999999999999),
      name: cleanText(r?.name || 'Ravun Müşterisi', 70),
      avatar: cleanText(r?.avatar || String(r?.name || 'R').charAt(0).toLocaleUpperCase('tr-TR'), 2),
      rating: Math.min(5, Math.max(1, Number(r?.rating) || 5)),
      date: cleanText(r?.date || 'Yeni', 60),
      text: cleanText(r?.text || '', 700),
      helpful: safeNumber(r?.helpful, 0, 0, 99999),
      approved: r?.approved !== false
    }));
  });
  return fixed;
}
function reviewList(allReviews, productId, approvedOnly = true) {
  const list = Array.isArray(allReviews?.[productId]) ? allReviews[productId] : [];
  return approvedOnly ? list.filter(r => r?.approved !== false) : list;
}
function normalizeFavorites(value, products = INITIAL_PRODUCTS) {
  const valid = new Set((products || []).map(p => Number(p.id)));
  return Array.isArray(value) ? [...new Set(value.map(Number).filter(id => valid.has(id)))].slice(0, 500) : [];
}
function normalizeCart(value, products = INITIAL_PRODUCTS) {
  if (!Array.isArray(value)) return [];
  const byId = new Map((products || []).map(p => [Number(p.id), p]));
  return value.slice(0, 200).map(item => {
    const baseKey = item?.baseId ?? item?.id;
    const base = byId.get(Number(baseKey));
    if (!base) return null;
    return {
      ...base,
      ...item,
      id: item?.id ?? base.id,
      baseId: base.id,
      title: cleanText(item?.title || base.title, 120),
      /* BULGU DÜZELTMESİ: önceden item?.price (tarayıcıda localStorage üzerinden
         herkes tarafından değiştirilebilen bir değer) tercih ediliyordu. Böylece
         biri kendi sepetindeki fiyatı DevTools ile düşürüp WhatsApp sipariş
         mesajında yanlış toplamla karşınıza çıkabilirdi. Fiyat artık her zaman
         güncel ürün kataloğundan (base.price) okunuyor; tek kaynak bu. */
      price: safeNumber(base.price, 0, 0, 10_000_000),
      qty: safeNumber(item?.qty, 1, 1, 99),
      image: safeImageSrc(item?.image || base.image, base.image),
      giftNote: cleanText(item?.giftNote || '', 300),
      giftStyle: cleanText(item?.giftStyle || '', 80),
      giftRecipient: cleanText(item?.giftRecipient || '', 80),
      giftDelivery: cleanText(item?.giftDelivery || '', 80),
      selectedSize: cleanText(item?.selectedSize || '', 60),
      selectedColor: cleanText(item?.selectedColor || '', 60)
    };
  }).filter(Boolean);
}
function normalizeOrders(value) {
  return Array.isArray(value) ? value.slice(0, 5000).map(o => ({
    ...o,
    id: cleanText(o?.id || `RVN-${Date.now()}`, 40),
    status: cleanText(o?.status || 'pending', 40),
    customerName: cleanText(o?.customerName || '', 90),
    customerPhone: cleanText(o?.customerPhone || '', 30),
    trackingCode: cleanText(o?.trackingCode || '', 80),
    note: cleanText(o?.note || '', 500),
    items: normalizeCart(o?.items || [])
  })) : [];
}
const PAGE_SLUGS = { collection:'koleksiyon', story:'hikaye', contact:'iletisim', favorites:'favoriler' };
const SLUG_TO_PAGE = Object.fromEntries(Object.entries(PAGE_SLUGS).map(([k,v])=>[v,k]));
function pagePath(page, product) {
  if (page === 'product' && product) return `/urun/${product.id}`;
  if (page && page !== 'home') return `/${PAGE_SLUGS[page] || page}`;
  return '/';
}
function absoluteUrl(path = '/') {
  try { return new URL(path, SITE_URL).toString(); }
  catch { return `${SITE_URL}${String(path || '/').startsWith('/') ? '' : '/'}${path || ''}`; }
}
function imageUrlForMeta(src) {
  if (!src || String(src).startsWith('data:') || String(src).startsWith('blob:')) return absoluteUrl('/assets/hero-1.webp');
  return absoluteUrl(src);
}
function metaDescriptionFor(page, product) {
  if (page === 'product' && product) return cleanText(`${product.title} — ${product.desc} Parça No: ${certificateNo(product)}. Ravun atölyesinde özel üretim ahşap ve epoksi tasarım.`, 300);
  if (page === 'collection') return 'Ravun koleksiyonu: ahşap, epoksi ve özel üretim el yapımı tasarım parçaları.';
  if (page === 'story') return 'Ravun atölyesinin ahşap, epoksi ve el işçiliği hikayesi.';
  if (page === 'contact') return 'Ravun ile özel sipariş, teklif ve atölye iletişimi.';
  if (page === 'favorites') return 'Ravun favori parçalarınız ve kaydettiğiniz özel üretim tasarımlar.';
  return 'Ravun — ahşap, epoksi ve el yapımı premium tasarım atölyesi.';
}
function structuredDataFor(page, product) {
  const org = {
    '@context':'https://schema.org',
    '@type':'Organization',
    name:'Ravun',
    url:absoluteUrl('/'),
    logo:absoluteUrl('/assets/ravun-logo.webp'),
    sameAs:['https://instagram.com/ravun.atolye']
  };
  if (page === 'product' && product) {
    const status = productStatusInfo(product);
    const availability = status.key === 'sold' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
    return [org, {
      '@context':'https://schema.org',
      '@type':'Product',
      name:product.title,
      description:metaDescriptionFor('product', product),
      image:(product.gallery && product.gallery.length ? product.gallery : [product.image]).slice(0, 6).map(imageUrlForMeta),
      sku:certificateNo(product),
      brand:{'@type':'Brand', name:'Ravun'},
      category:product.category,
      material:(product.materials || []).join(', '),
      offers:{
        '@type':'Offer',
        url:absoluteUrl(pagePath('product', product)),
        priceCurrency:'TRY',
        price:String(Number(product.price || 0)),
        availability,
        itemCondition:'https://schema.org/NewCondition'
      }
    }, {
      '@context':'https://schema.org',
      '@type':'BreadcrumbList',
      itemListElement:[
        {'@type':'ListItem', position:1, name:'Ravun', item:absoluteUrl('/')},
        {'@type':'ListItem', position:2, name:'Koleksiyon', item:absoluteUrl(pagePath('collection'))},
        {'@type':'ListItem', position:3, name:product.title, item:absoluteUrl(pagePath('product', product))}
      ]
    }];
  }
  return [org, {
    '@context':'https://schema.org',
    '@type':'WebSite',
    name:'Ravun',
    url:absoluteUrl('/'),
    potentialAction:{'@type':'SearchAction', target:absoluteUrl(`${pagePath('collection')}?q={search_term_string}`), 'query-input':'required name=search_term_string'}
  }];
}
function setMetaTag(selector, attr, value) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    const prop = selector.match(/property="([^"]+)/)?.[1];
    const name = selector.match(/name="([^"]+)/)?.[1];
    if (prop) el.setAttribute('property', prop);
    if (name) el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}
function updateStructuredData(page, product) {
  let el = document.getElementById('ravun-structured-data');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'ravun-structured-data';
    document.head.appendChild(el);
  }
  /* .textContent DOM API üzerinden atandığı için HTML parse edilmiyor, dolayısıyla
     "</script>" içerikli bir değer script'i erken kapatamaz — ama yine de savunma
     katmanı olarak '<' karakteri kaçışlanır (bkz. scripts/prerender.mjs'teki
     jsonForScript ile aynı önlem, statik derleme çıktısıyla tutarlılık için). */
  el.textContent = JSON.stringify(structuredDataFor(page, product)).replace(/</g, '\\u003c');
}
function updateMeta(page, product) {
  const title = page === 'product' && product
    ? `${product.title} | Ravun`
    : page === 'collection' ? 'Koleksiyon | Ravun'
    : page === 'story' ? 'Hikaye | Ravun'
    : page === 'contact' ? 'İletişim | Ravun'
    : page === 'favorites' ? 'Favoriler | Ravun'
    : 'Ravun | Ahşap & Epoksi Atölyesi';
  const description = metaDescriptionFor(page, product);
  const url = absoluteUrl(pagePath(page, product));
  const image = imageUrlForMeta(product?.image || '/assets/hero-1.webp');
  document.title = title;
  setMetaTag('meta[name="description"]','content',description);
  setMetaTag('meta[name="theme-color"]','content','#F7F3E8');
  setMetaTag('meta[property="og:type"]','content',page === 'product' && product ? 'product' : 'website');
  setMetaTag('meta[property="og:site_name"]','content','Ravun');
  setMetaTag('meta[property="og:title"]','content',title);
  setMetaTag('meta[property="og:description"]','content',description);
  setMetaTag('meta[property="og:image"]','content',image);
  setMetaTag('meta[property="og:url"]','content',url);
  setMetaTag('meta[name="twitter:card"]','content','summary_large_image');
  setMetaTag('meta[name="twitter:title"]','content',title);
  setMetaTag('meta[name="twitter:description"]','content',description);
  setMetaTag('meta[name="twitter:image"]','content',image);
  if (page === 'product' && product) {
    setMetaTag('meta[property="product:price:amount"]','content',String(Number(product.price || 0)));
    setMetaTag('meta[property="product:price:currency"]','content','TRY');
  }
  let canonical = document.querySelector('link[rel="canonical"]');
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}
  canonical.href = url;
  updateStructuredData(page, product);
}
function productSharePayload(product) {
  const title = `${product.title} | Ravun`;
  const url = absoluteUrl(pagePath('product', product));
  const text = `${product.title} — ${product.desc} Parça No: ${certificateNo(product)}`;
  return {title, text, url};
}
function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(()=>true).catch(()=>false);
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly',''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return Promise.resolve(ok);
  } catch { return Promise.resolve(false); }
}
/* ── SVG İKONLAR ── */
const ICart=()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>;
const IWA=()=><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/></svg>;
const IHeart=({f})=><svg width="18" height="18" viewBox="0 0 24 24" fill={f?'#e05c4a':'none'} stroke={f?'#e05c4a':'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
const ISearch=()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IHome=()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>;
const IUser=()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21a8 8 0 10-16 0"/><circle cx="12" cy="7" r="4"/></svg>;
const IClose=()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IFilter=()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>;
const ITruck=()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const IZoom=()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>;
const IShare=()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
const IAdmin=()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const ICheck=()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IHand=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11V6.8a1.8 1.8 0 113.6 0V11"/><path d="M10.6 10V5.8a1.8 1.8 0 113.6 0V11"/><path d="M14.2 10.6V7.4a1.8 1.8 0 113.6 0v6.1c0 4.2-2.7 6.8-6.5 6.8H10c-2.1 0-3.8-.9-5-2.5l-2.1-2.9a1.9 1.9 0 013-2.3l1.1 1.2"/><path d="M7 15.2V11"/></svg>;
const ILeaf=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 3.5C13.5 3.8 6.8 7.2 5 13.2c-1 3.4.9 6.1 4.2 6.1 6.1 0 10.2-7.1 11.3-15.8z"/><path d="M4 20c3.8-6.2 8.2-9.7 14-12"/></svg>;
const IBox=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 3.7 7.5 12 12l8.3-4.5L12 3z"/><path d="M3.7 7.5V16.5L12 21l8.3-4.5v-9"/><path d="M12 12v9"/><path d="M8 5.2l8.3 4.5"/></svg>;
const ICustom=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.4 5 5.4.8-3.9 3.8.9 5.4L12 15.5 7.2 18l.9-5.4-3.9-3.8 5.4-.8L12 3z"/><path d="M12 8.8v3.4l2.6 1.5"/></svg>;
const ITrash=()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>;
const IEye=({open})=>open?<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
const IThumbUp=()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>;
const IImage=()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const IChevron=({dir='right'})=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:dir==='left'?'rotate(180deg)':dir==='up'?'rotate(-90deg)':dir==='down'?'rotate(90deg)':'none'}}><polyline points="9 18 15 12 9 6"/></svg>;
const IStar=()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
/* ── STAR RATING ── */
function StarRating({rating, count, size='sm', interactive=false, onSet}){
  const [hover,setHover]=useState(0);
  const full=Math.floor(rating), half=rating%1>=0.5;
  if(interactive) return (
    <div className={`starRow ${size}`}>
      {[1,2,3,4,5].map(n=>(
        <button key={n} className={`pickStar ${(hover||rating)>=n?'pickActive':''}`}
          onMouseEnter={()=>setHover(n)} onMouseLeave={()=>setHover(0)}
          onClick={()=>onSet(n)}>★</button>
      ))}
    </div>
  );
  return (
    <div className={`starRow ${size}`}>
      {[1,2,3,4,5].map(i=>(
        <span key={i} className={`star ${i<=full?'full':i===full+1&&half?'half':'empty'}`}>★</span>
      ))}
      {rating>0&&<span className="starNum">{rating.toFixed(1)}</span>}
      {count!==undefined&&count>0&&<span className="starCount">({count} yorum)</span>}
    </div>
  );
}
/* ── ZOOM LIGHTBOX ── */
function ZoomLightbox({images=[],index=0,alt,onClose,onIndex}){
  const safeImages = Array.isArray(images) && images.length ? images : [];
  const src = safeImages[index] || safeImages[0] || '';
  const goImg = (next)=>{ const len=safeImages.length||1; const ni=((next%len)+len)%len; onIndex?.(ni); };
  const [scale,setScale]=useState(1);
  const [pos,setPos]=useState({x:0,y:0});
  const [drag,setDrag]=useState(null);
  const [fit,setFit]=useState('contain');
  const wrapRef=useRef(null);
  const imgRef=useRef(null);
  const touchDistance=useRef(null);
  const pinchStart=useRef(null);
  const raf=useRef(null);
  // scaleRef: clampPos'un stale closure sorununu önlemek için güncel scale değerini tutar
  const scaleRef=useRef(scale);
  const posRef=useRef(pos);
  const zoomAtPointRef=useRef(null);
  const dragRef=useRef(null);
  const swipeStart=useRef(null);
  useEffect(()=>{scaleRef.current=scale;},[scale]);
  useEffect(()=>{posRef.current=pos;},[pos]);
  useEffect(()=>{dragRef.current=drag;},[drag]);
  useEffect(()=>{
    setScale(1);
    setPos({x:0,y:0});
    setDrag(null);
    touchDistance.current=null;
    pinchStart.current=null;
  },[src,index]);
  useEffect(()=>{
    const prevOverflow=document.body.style.overflow;
    const prevOverscroll=document.body.style.overscrollBehavior;
    const prevHtmlOverflow=document.documentElement.style.overflow;
    document.body.style.overflow='hidden';
    document.body.style.overscrollBehavior='contain';
    document.documentElement.style.overflow='hidden';
    document.body.classList.add('modal-open');
    const preventBgScroll=e=>{
      if(!wrapRef.current?.contains(e.target)&&!e.target.closest?.('.zoomThumbs'))
        e.preventDefault();
    };
    document.addEventListener('touchmove',preventBgScroll,{passive:false});
    const onKey=e=>{
      if(e.key==='Escape'){e.preventDefault();onClose();}
      if(e.key==='ArrowRight'){e.preventDefault();goImg(index+1);}
      if(e.key==='ArrowLeft'){e.preventDefault();goImg(index-1);}
      if(e.key==='+')setScaleSafe(v=>v+.5);
      if(e.key==='-')setScaleSafe(v=>v-.5);
      if(e.key==='0'){setScale(1);setPos({x:0,y:0});}
    };
    window.addEventListener('keydown',onKey);
    return()=>{
      document.body.style.overflow=prevOverflow;
      document.body.style.overscrollBehavior=prevOverscroll;
      document.documentElement.style.overflow=prevHtmlOverflow;
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown',onKey);
      document.removeEventListener('touchmove',preventBgScroll);
      if(raf.current)cancelAnimationFrame(raf.current);
    };
  },[onClose,index,safeImages.length]);
  // scaleRef kullanarak stale closure'dan kaçınıyoruz
  const clampPos=useCallback((x,y,nextScale)=>{
    const sc = nextScale !== undefined ? nextScale : scaleRef.current;
    const wrap=wrapRef.current?.getBoundingClientRect();
    const img=imgRef.current?.getBoundingClientRect();
    if(!wrap||!img||sc<=1)return{x:0,y:0};
    const baseW=img.width/scaleRef.current;
    const baseH=img.height/scaleRef.current;
    const maxX=Math.max(0,(baseW*sc-wrap.width)/2+16);
    const maxY=Math.max(0,(baseH*sc-wrap.height)/2+16);
    return {x:Math.max(-maxX,Math.min(maxX,x)),y:Math.max(-maxY,Math.min(maxY,y))};
  },[]);
  const setScaleSafe=useCallback(next=>{
    setScale(old=>{
      const raw=typeof next==='function'?next(old):next;
      const nextScale=Math.min(6,Math.max(1,Number(raw)||1));
      setPos(current=>nextScale===1?{x:0,y:0}:clampPos(current.x,current.y,nextScale));
      return nextScale;
    });
  },[clampPos]);
  const zoomAtPoint=useCallback((clientX,clientY,nextScale)=>{
    const wrap=wrapRef.current?.getBoundingClientRect();
    if(!wrap)return setScaleSafe(nextScale);
    setScale(old=>{
      const target=Math.min(6,Math.max(1,Number(nextScale)||1));
      if(target===1){setPos({x:0,y:0});return 1;}
      const dx=clientX-(wrap.left+wrap.width/2);
      const dy=clientY-(wrap.top+wrap.height/2);
      const ratio=target/old;
      setPos(current=>clampPos(current.x*ratio-dx*(ratio-1),current.y*ratio-dy*(ratio-1),target));
      return target;
    });
  },[clampPos,setScaleSafe]);
  useEffect(()=>{zoomAtPointRef.current=zoomAtPoint;},[zoomAtPoint]);
  // Wheel eventi native (non-passive) olarak yakala, sayfa scroll olmasın
  useEffect(()=>{
    const el=wrapRef.current;
    if(!el)return;
    const onWheel=e=>{
      e.preventDefault();
      e.stopPropagation();
      const fn=zoomAtPointRef.current;
      if(fn)fn(e.clientX,e.clientY,scaleRef.current-e.deltaY*0.0035);
    };
    el.addEventListener('wheel',onWheel,{passive:false});
    return()=>el.removeEventListener('wheel',onWheel);
  },[]);
  const beginDrag=(clientX,clientY)=>{
    if(scaleRef.current<=1)return;
    const d={x:clientX-posRef.current.x,y:clientY-posRef.current.y};
    dragRef.current=d;
    setDrag(d);
  };
  const moveDrag=(clientX,clientY)=>{
    const d=dragRef.current;
    if(!d||scaleRef.current<=1)return;
    const next=clampPos(clientX-d.x,clientY-d.y,scaleRef.current);
    if(raf.current)cancelAnimationFrame(raf.current);
    raf.current=requestAnimationFrame(()=>setPos(next));
  };
  // iOS'ta React synthetic events passive olduğundan e.preventDefault() çalışmaz.
  // Pinch zoom ve drag için native non-passive listener kullanıyoruz.
  useEffect(()=>{
    const el=wrapRef.current;
    if(!el)return;
    const onNativeTM=e=>{
      if(e.touches.length===1&&scaleRef.current>1){
        e.preventDefault();
        const d=dragRef.current;
        if(!d)return;
        const t=e.touches[0];
        const next=clampPos(t.clientX-d.x,t.clientY-d.y,scaleRef.current);
        if(raf.current)cancelAnimationFrame(raf.current);
        raf.current=requestAnimationFrame(()=>setPos(next));
      }
      if(e.touches.length===2){
        e.preventDefault();
        const a=e.touches[0],b=e.touches[1];
        const dist=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
        const start=pinchStart.current;
        if(start&&touchDistance.current){
          const ratio=dist/touchDistance.current;
          const fn=zoomAtPointRef.current;
          if(fn)fn((a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2,start.scale*ratio);
        }
      }
    };
    el.addEventListener('touchmove',onNativeTM,{passive:false});
    return()=>el.removeEventListener('touchmove',onNativeTM);
  },[clampPos]);
  return (
    <div className="zoomLayer zoomReal" onClick={(e)=>{if(e.target===e.currentTarget)onClose?.();}} role="dialog" aria-modal="true" aria-label={`${alt} yakınlaştırılmış görsel`}>
      <div className="zoomBar" onClick={e=>e.stopPropagation()}>
        <span className="zoomAlt">{alt}</span>
        <div className="zoomControls">
          <button onClick={e=>{e.stopPropagation();setScaleSafe(v=>v+.5);}} aria-label="Yakınlaştır">＋</button>
          <span>{Math.round(scale*100)}%</span>
          <button onClick={e=>{e.stopPropagation();setScaleSafe(v=>v-.5);}} aria-label="Uzaklaştır">－</button>
          <button onClick={e=>{e.stopPropagation();setScaleSafe(2);}} aria-label="2 kat yakınlaştır">2×</button>
          <button onClick={e=>{e.stopPropagation();setScale(1);setPos({x:0,y:0});}} aria-label="Zoom sıfırla">↺</button>
          <button onClick={e=>{e.stopPropagation();setFit(f=>f==='contain'?'natural':'contain');setScale(1);setPos({x:0,y:0});}} aria-label="Görsel sığdırma modu">{fit==='contain'?'Doğal':'Sığdır'}</button>
        </div>
        <button className="zoomClose" onClick={(e)=>{e.preventDefault();e.stopPropagation();onClose?.();}} aria-label="Kapat"><IClose/></button>
      </div>
      {safeImages.length>1&&<>
        <button className="zoomNav zoomPrev" onClick={e=>{e.stopPropagation();goImg(index-1);}} aria-label="Önceki görsel">‹</button>
        <button className="zoomNav zoomNext" onClick={e=>{e.stopPropagation();goImg(index+1);}} aria-label="Sonraki görsel">›</button>
      </>}
      <div ref={wrapRef} className={`zoomImgWrap zoomFit-${fit}`}
        onClick={e=>{ if(e.target===e.currentTarget) onClose?.(); else e.stopPropagation(); }}
        onDoubleClick={e=>{e.stopPropagation();scale>1?(setScale(1),setPos({x:0,y:0})):zoomAtPoint(e.clientX,e.clientY,2.6);}}
        onWheel={e=>e.stopPropagation()}
        onMouseDown={e=>{e.stopPropagation(); if(e.button!==0 || scale<=1) return; e.preventDefault(); beginDrag(e.clientX,e.clientY);}}
        onMouseMove={e=>moveDrag(e.clientX,e.clientY)}
        onMouseUp={()=>setDrag(null)}
        onMouseLeave={()=>setDrag(null)}
        onTouchStart={e=>{
          if(e.touches.length===1){
            if(scale>1) beginDrag(e.touches[0].clientX,e.touches[0].clientY);
            else swipeStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
          }
          if(e.touches.length===2){
            swipeStart.current=null;
            const a=e.touches[0],b=e.touches[1];
            const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
            touchDistance.current=d;
            pinchStart.current={scale,midX:(a.clientX+b.clientX)/2,midY:(a.clientY+b.clientY)/2};
          }
        }}
        onTouchMove={e=>e.stopPropagation()}
        onTouchEnd={e=>{
          if(swipeStart.current&&scale<=1&&e.changedTouches.length){
            const dx=e.changedTouches[0].clientX-swipeStart.current.x;
            const dy=Math.abs(e.changedTouches[0].clientY-swipeStart.current.y);
            if(Math.abs(dx)>48&&Math.abs(dx)>dy*1.4&&safeImages.length>1){
              dx<0?goImg(index+1):goImg(index-1);
            }
          }
          swipeStart.current=null;
          dragRef.current=null;
          setDrag(null);
          touchDistance.current=null;
          pinchStart.current=null;
        }}
        style={{cursor:scale>1?(drag?'grabbing':'grab'):'zoom-in'}}>
        <img ref={imgRef} className="zoomImg" src={src} alt={alt} draggable={false}
          onClick={e=>{e.stopPropagation(); scale<=1 ? zoomAtPoint(e.clientX,e.clientY,2.4) : setScaleSafe(1);}}
          style={{transform:`translate3d(${pos.x}px,${pos.y}px,0) scale(${scale})`,transition:drag?'none':'transform .12s cubic-bezier(.2,.8,.2,1)'}} />
      </div>
      {safeImages.length>1&&<div className="zoomThumbs" onClick={e=>e.stopPropagation()}>
        {safeImages.map((img,i)=><button key={img+i} className={i===index?'zoomThumbActive':''} onClick={()=>goImg(i)} aria-label={`Görsel ${i+1}`}><img src={img} alt=""/></button>)}
      </div>}
      <p className="zoomHelpText">Çift tıkla · tekerlekle yakınlaştır · sürükle · yön tuşları · ESC</p>
    </div>
  );
}
/* ── REVIEW SECTION ── */
function ReviewSection({productId, allReviews, setAllReviews}){
  const [tab,setTab]=useState('list');
  const [form,setForm]=useState({name:'',text:'',rating:5});
  const [helpfulMap,setHelpfulMap]=useState({});
  const [sent,setSent]=useState(false);
  const reviews=useMemo(()=>reviewList(allReviews, productId),[allReviews,productId]);
  const avg=useMemo(()=>reviews.length?reviews.reduce((s,r)=>s+r.rating,0)/reviews.length:0,[reviews]);
  const dist=useMemo(()=>{const d={5:0,4:0,3:0,2:0,1:0};reviews.forEach(r=>{d[r.rating]=(d[r.rating]||0)+1;});return d;},[reviews]);
  const submitReview=()=>{
    const cleanName = (form.name||'').trim().slice(0, 60).replace(/[<>]/g,'');
    const cleanText = (form.text||'').trim().slice(0, 1200).replace(/[<>]/g,'');
    if(!cleanName || !cleanText) return;
    // Spam önlemi: aynı IP'den çok fazla yorum engeli (basit client-side)
    const recentKey = 'rv_review_ts';
    try {
      const last = Number(sessionStorage.getItem(recentKey)||0);
      if(Date.now() - last < 30000) return; // 30 sn bekleme
      sessionStorage.setItem(recentKey, String(Date.now()));
    } catch {}
    const rating = Math.min(5, Math.max(1, Number(form.rating)||5));
    const nr={
      id: Date.now(),
      name: cleanName,
      avatar: cleanName[0].toLocaleUpperCase('tr-TR'),
      rating,
      date: 'Şimdi',
      text: cleanText,
      helpful: 0,
      approved: true
    };
    setAllReviews(prev=>({...prev,[productId]:[nr,...(prev[productId]||[])]}));
    setForm({name:'',text:'',rating:5}); setSent(true);
    setTimeout(()=>{setSent(false);setTab('list');},2500);
  };
  const markHelpful=id=>{
    if(helpfulMap[id])return;
    setAllReviews(prev=>({...prev,[productId]:(prev[productId]||[]).map(r=>r.id===id?{...r,helpful:r.helpful+1}:r)}));
    setHelpfulMap(m=>({...m,[id]:true}));
  };
  return (
    <div className="reviewSection">
      <div className="reviewOverview">
        <div className="reviewBigBlock">
          <span className="reviewBigNum">{avg>0?avg.toFixed(1):'—'}</span>
          <StarRating rating={avg} size="lg"/>
          <span className="reviewSubLabel">{reviews.length} değerlendirme</span>
        </div>
        <div className="reviewBars">
          {[5,4,3,2,1].map(n=>(
            <div key={n} className="ratingBarRow">
              <span className="ratingBarLabel">{n}★</span>
              <div className="ratingBarTrack"><div className="ratingBarFill" style={{width:reviews.length?`${(dist[n]/reviews.length)*100}%`:'0%'}}/></div>
              <span className="ratingBarCount">{dist[n]||0}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="reviewTabBar">
        <button className={tab==='list'?'reviewTabActive':''} onClick={()=>setTab('list')}>Yorumlar <span className="tabBadge">{reviews.length}</span></button>
        <button className={tab==='write'?'reviewTabActive':''} onClick={()=>setTab('write')}>Yorum Yaz ✎</button>
      </div>
      {tab==='list'&&(
        <div className="reviewListArea">
          {reviews.length===0?<p className="reviewEmpty">Henüz yorum yok. İlk yorumu siz yazın!</p>
            :reviews.map(r=>(
            <div key={r.id} className="reviewItem">
              <div className="reviewHead">
                <div className="reviewAvatar">{r.avatar}</div>
                <div className="reviewMeta"><strong>{r.name}</strong><span>{r.date}</span></div>
                <StarRating rating={r.rating} size="xs"/>
              </div>
              <p className="reviewText">{r.text}</p>
              <button className={`helpfulBtn ${helpfulMap[r.id]?'helpfulDone':''}`} onClick={()=>markHelpful(r.id)}>
                <IThumbUp/> Faydalı ({r.helpful})
              </button>
            </div>
          ))}
        </div>
      )}
      {tab==='write'&&(
        <div className="writeReviewArea">
          {sent?<div className="reviewSentMsg"><ICheck/> Yorumunuz eklendi, teşekkürler!</div>:(
            <>
              <div className="writeReviewField"><label>Puanınız</label><StarRating rating={form.rating} size="md" interactive onSet={n=>setForm(f=>({...f,rating:n}))}/></div>
              <div className="writeReviewField"><label>Adınız</label><input className="reviewInput" placeholder="Ad Soyad" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
              <div className="writeReviewField"><label>Yorumunuz</label><textarea className="reviewTextarea" placeholder="Ürün hakkındaki deneyiminizi paylaşın…" rows={4} value={form.text} onChange={e=>setForm(f=>({...f,text:e.target.value}))}/></div>
              <button className="reviewSubmit" onClick={submitReview} disabled={!form.name||!form.text}>Yorum Gönder ↗</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
/* ── ÜRÜN DETAY ── */
function ProductDetailPage({product, go, add, allReviews, setAllReviews, favorites, toggleFav, products, recentIds, settings}){
  const [zoom,setZoom]=useState(false);
  const [zoomSrc,setZoomSrc]=useState('');
  const zoomHistoryRef=useRef(false);
  const zoomScrollYRef=useRef(0);
  const swipeRef=useRef({x:0,y:0,until:0});
  const [activeImg,setActiveImg]=useState(0);
  const [selColor,setSelColor]=useState(0);
  const [selSize,setSelSize]=useState(0);
  const [tab,setTab]=useState('details');
  const [giftWrap,setGiftWrap]=useState(false);
  const [giftStyle,setGiftStyle]=useState('Kraft kutu + Ravun kartı');
  const [giftNote,setGiftNote]=useState('');
  const [giftRecipient,setGiftRecipient]=useState('');
  const [giftDelivery,setGiftDelivery]=useState('');
  const [copied,setCopied]=useState(false);
  const gallery=product.gallery||[product.image];
  const activeSrc=gallery[activeImg] || product.image;
  const isFav=Array.isArray(favorites) && favorites.includes(product.id);
  const related=useMemo(()=>relatedProducts(product, products || INITIAL_PRODUCTS, 4),[product,products]);
  const recentlyViewed=useMemo(()=>recentProductIds(recentIds || [], products || INITIAL_PRODUCTS).filter(id=>id!==product.id).map(id=>(products||INITIAL_PRODUCTS).find(p=>p.id===id)).filter(Boolean).slice(0,4),[recentIds,products,product.id]);
  const reviews=useMemo(()=>reviewList(allReviews, product.id),[allReviews,product.id]);
  const avg=avgRating(reviewList(allReviews, product.id));
  const certNo=certificateNo(product);
  const status=productStatusInfo(product);
  const statusUrl=productStatusWa(product);
  const detailPoints=[]; // v105: ürün fotoğrafındaki 1-2-3 detay işaretleri kapatıldı
  const similarWa=encodeURIComponent(`Merhaba, ${product.title} ürününün aynısı değilse bile buna benzer özel bir Ravun parçası hazırlanabilir mi?\nParça No: ${certNo}`);
  const selectedColorName=product.colorNames?.[selColor] || '';
  const selectedSizeName=product.sizes?.[selSize] || '';
  const smartWaUrl=productOrderWa(product,{color:selectedColorName,size:selectedSizeName,giftWrap,giftStyle,giftNote,giftRecipient,giftDelivery});
  const handleGalleryTouchStart=e=>{
    const t=e.touches?.[0]; if(!t)return; swipeRef.current={x:t.clientX,y:t.clientY,until:0};
  };
  const handleGalleryTouchEnd=e=>{
    const t=e.changedTouches?.[0]; if(!t||gallery.length<2)return;
    const dx=t.clientX-(swipeRef.current.x||0);
    const dy=t.clientY-(swipeRef.current.y||0);
    if(Math.abs(dx)>48 && Math.abs(dx)>Math.abs(dy)*1.35){
      e.preventDefault();
      setActiveImg(i=>dx<0?(i+1)%gallery.length:(i-1+gallery.length)%gallery.length);
      swipeRef.current.until=Date.now()+420;
    }
  };
  const handleMainImageClick=()=>{ if(Date.now() < (swipeRef.current.until||0)) return; openZoom(); };
  useEffect(()=>{setActiveImg(0);setSelColor(0);setSelSize(0);setTab('details');setZoom(false);zoomHistoryRef.current=false;setZoomSrc('');setGiftWrap(false);setGiftNote('');setGiftRecipient('');setGiftDelivery('');setGiftStyle('Kraft kutu + Ravun kartı');window.scrollTo({top:0,behavior:'smooth'});},[product.id]);
  useEffect(()=>{
    const onKey=e=>{
      if(zoom || gallery.length<2) return;
      if(e.key==='ArrowLeft') { setActiveImg(i=>(i-1+gallery.length)%gallery.length); }
      if(e.key==='ArrowRight') { setActiveImg(i=>(i+1)%gallery.length); }
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[zoom,gallery.length]);
  const shareProduct=async()=>{
    const payload=productSharePayload(product);
    try{
      if(navigator.share){await navigator.share(payload);return;}
    }catch{}
    safeOpen(`https://wa.me/?text=${encodeURIComponent(payload.text+'\n'+payload.url)}`);
  };
  const copyProductLink=async()=>{
    const payload=productSharePayload(product);
    const ok=await copyToClipboard(payload.url);
    setCopied(ok);
    setTimeout(()=>setCopied(false),1800);
  };
  const openZoom=useCallback(()=>{
    zoomScrollYRef.current=window.scrollY || 0;
    document.body.classList.add('modal-open');
    setZoomSrc(activeSrc);
    if(!zoomHistoryRef.current){
      try{
        window.history.pushState({page:'product', productId:product.id, zoom:true}, '', window.location.href);
        zoomHistoryRef.current=true;
      }catch{}
    }
    setZoom(true);
  },[activeSrc,product.id]);
  const closeZoom=useCallback(()=>{
    document.body.classList.remove('modal-open');
    if(zoomHistoryRef.current && window.history.state?.zoom){
      try{ window.history.back(); return; }catch{}
    }
    zoomHistoryRef.current=false;
    setZoom(false);
    requestAnimationFrame(()=>window.scrollTo({top:zoomScrollYRef.current||0,left:0,behavior:'auto'}));
  },[]);
  useEffect(()=>{
    if(!zoom)return;
    const onZoomPop=()=>{
      document.body.classList.remove('modal-open');
      zoomHistoryRef.current=false;
      setZoom(false);
      requestAnimationFrame(()=>window.scrollTo({top:zoomScrollYRef.current||0,left:0,behavior:'auto'}));
    };
    window.addEventListener('popstate',onZoomPop);
    return()=>window.removeEventListener('popstate',onZoomPop);
  },[zoom]);
  return (
    <>
      {zoom&&createPortal(<ZoomLightbox images={gallery} index={activeImg} alt={product.title} onIndex={(i)=>{setActiveImg(i);setZoomSrc(gallery[i]);}} onClose={closeZoom}/>,document.body)}
      <main className="page productDetailPage">
        <nav className="pdBreadcrumb reveal">
          <button onClick={()=>go('home')}>Ana Sayfa</button><span>›</span>
          <button onClick={()=>go('collection')}>Koleksiyon</button><span>›</span>
          <span>{product.category}</span><span>›</span><span>{product.title}</span>
        </nav>
        <div className="pdLayout">
          <div className="pdGallery reveal">
            <div className="pdMainImg"
              onTouchStart={handleGalleryTouchStart}
              onTouchEnd={handleGalleryTouchEnd}
              onClick={handleMainImageClick}>
              <img key={activeImg} src={activeSrc} alt={product.title} draggable={false} decoding="async" fetchpriority="high"/>
              {detailPoints.map((point,i)=>(
                <button key={`${point.title}-${i}`} className="pdDetailMarker" style={{left:`${point.x}%`,top:`${point.y}%`}} onClick={e=>e.stopPropagation()} aria-label={`${point.title}: ${point.text}`}>
                  <span>{i+1}</span><b><em>{point.title}</em><small>{point.text}</small></b>
                </button>
              ))}
              {gallery.length>1&&<>
                <button className="pdImgArrow pdImgPrev" onClick={e=>{e.preventDefault();e.stopPropagation();setActiveImg(i=>(i-1+gallery.length)%gallery.length);}} aria-label="Önceki fotoğraf">‹</button>
                <button className="pdImgArrow pdImgNext" onClick={e=>{e.preventDefault();e.stopPropagation();setActiveImg(i=>(i+1)%gallery.length);}} aria-label="Sonraki fotoğraf">›</button>
              </>}
              <div className="pdZoomHint"><IZoom/> Tıkla / Yakınlaştır</div>
              <span className={`pdStatusBadge pdStatus-${status.tone}`}>{status.label}</span>
              <button className={`favBtn ${isFav?'favActive':''}`} onClick={e=>{e.stopPropagation();toggleFav(product.id);}} aria-label="Favoriye ekle">
                <IHeart f={isFav}/>
              </button>
            </div>
            {gallery.length>1&&(
              <div className="pdThumbStrip">
                {gallery.map((img,i)=>(
                  <button key={i} className={`pdThumb ${i===activeImg?'pdThumbActive':''}`} onClick={()=>setActiveImg(i)} aria-label={`${product.title} görsel ${i+1}`}>
                    <img src={img} alt={`${product.title} ${i+1}`} loading="lazy" decoding="async"/>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="pdInfo reveal">
            <p className="pdCat">{product.category}</p>
            <h1 className="pdTitle">{product.title}</h1>
            <div className="pdRatingRow">
              <StarRating rating={avg} count={reviews.length} size="md"/>
              <button className="pdRatingJump" onClick={()=>setTab('reviews')}>Yorumları gör →</button>
            </div>
            <div className="pdPrice"><strong>{money(product.price)}</strong><em>Fiyat malzeme seçimine göre değişebilir</em></div>
            <p className="pdDesc">{product.desc}</p>
            {product.colors&&(
              <div className="optionRow">
                <span className="optionLabel">RENK — <b>{product.colorNames[selColor]}</b></span>
                <div className="colorPicker">{product.colors.map((c,i)=><button key={i} className={`colorDot ${i===selColor?'selColor':''}`} style={{background:c}} onClick={()=>setSelColor(i)} title={product.colorNames[i]} aria-label={`Renk seç: ${product.colorNames[i]}`}/>)}</div>
              </div>
            )}
            {product.sizes&&(
              <div className="optionRow">
                <span className="optionLabel">BOYUT — <b>{product.sizes[selSize]}</b></span>
                <div className="sizePicker">{product.sizes.map((s,i)=><button key={i} className={`sizeBtn ${i===selSize?'selSize':''}`} onClick={()=>setSelSize(i)} aria-label={`Boyut seç: ${s}`}>{s}</button>)}</div>
              </div>
            )}
            {product.giftEligible!==false&&<div className={`giftPanel ${giftWrap?'giftPanelOpen':''}`}>
              <div className="giftHead">
                <span className="giftIcon">🎁</span>
                <div><b>{settings?.giftTitle || 'Hediye paketi'}</b><small>{settings?.giftDesc || 'Kutu, not kartı ve korumalı sunum seçeneği'} {Number(settings?.giftPrice||0)>0?`(+${money(Number(settings.giftPrice))})`:''}</small></div>
                <label className="giftSwitch"><input type="checkbox" checked={giftWrap} onChange={e=>setGiftWrap(e.target.checked)} aria-label="Hediye paketi seç"/><span></span></label>
              </div>
              {giftWrap&&<div className="giftOptions giftOptionsPro">
                <label>Paket tipi<select value={giftStyle} onChange={e=>setGiftStyle(e.target.value)} aria-label="Hediye paketi tipi"><option>Kraft kutu + Ravun kartı</option><option>Premium siyah kutu</option><option>Keten sarım + deri etiket</option><option>Sade korumalı hediye paketi</option></select></label>
                <label>Alıcı adı<input value={giftRecipient} onChange={e=>setGiftRecipient(e.target.value)} maxLength={60} placeholder="İsim yazılacaksa" aria-label="Hediye alıcı adı"/></label>
                <label>İstenen teslim tarihi<input value={giftDelivery} onChange={e=>setGiftDelivery(e.target.value)} maxLength={60} placeholder="Örn. 14 Haziran'a yetişir mi?" aria-label="Hediye teslim tarihi"/></label>
                <label className="giftWide">Hediye notu<textarea value={giftNote} onChange={e=>setGiftNote(e.target.value)} maxLength={180} placeholder="Kısa hediye notu yaz…" aria-label="Hediye notu"/></label>
                <small className="giftWide">Bu bilgiler sepete, sipariş taslağına ve WhatsApp mesajına otomatik eklenir.</small>
              </div>}
            </div>}
            <div className="pdActions">
              <button className={`addBtn pdAddBtn ${!status.canOrder?'archiveRequestBtn':''}`} disabled={!status.canOrder} onClick={()=>status.canOrder && add({...product,giftWrap,giftStyle,giftNote,giftRecipient,giftDelivery,giftPrice:Number(settings?.giftPrice||0),selectedSize:selectedSizeName,selectedColor:selectedColorName})}>{status.archive ? 'Satıldı' : 'Sepete Ekle'}</button>
              <a className="waModalBtn" href={status.canOrder?smartWaUrl:statusUrl} target="_blank" rel="noreferrer"><IWA/> WhatsApp</a>
              <button className="shareBtn" onClick={shareProduct} aria-label="Ürünü paylaş"><IShare/> Paylaş</button>
              <button className={`shareBtn copyLinkBtn ${copied?'copied':''}`} onClick={copyProductLink} aria-label="Ürün linkini kopyala">{copied?'✓ Kopyalandı':'Linki Kopyala'}</button>
            </div>
            <div className="pdDelivery"><ITruck/><span>Teslim: {product.delivery} · Sigortalı kargo</span></div>
            <div className="pdTrustMini" aria-label="Ravun güven bilgileri">
              <div><span className="trustIcon"><IHand/></span><span><b>El yapımı</b><small>Tek tek üretilir</small></span></div>
              <div><span className="trustIcon"><ILeaf/></span><span><b>Doğal ahşap</b><small>Damar yapısı korunur</small></span></div>
              <div><span className="trustIcon"><IBox/></span><span><b>Korumalı kutu</b><small>Sigortalı gönderim</small></span></div>
              <div><span className="trustIcon"><ICustom/></span><span><b>Kişiye özel</b><small>Ölçü ve ton konuşulur</small></span></div>
            </div>
            <div className="pdCertificateMini">
              <div><small>RAVUN SERTİFİKASI</small><b>{certNo}</b><span>{product.repeatable}</span></div>
              <a href={`https://wa.me/${WA_NUMBER}?text=${similarWa}`} target="_blank" rel="noreferrer">Detay Sor ↗</a>
            </div>
          </div>
        </div>
        <div className="pdTabsSection">
          <div className="pdTabBar">
            <button className={tab==='details'?'pdTabActive':''} onClick={()=>setTab('details')}>Ürün Detayları</button>
            <button className={tab==='reviews'?'pdTabActive':''} onClick={()=>setTab('reviews')}>Yorumlar <span className="tabBadge">{reviews.length}</span></button>
          </div>
          {tab==='details'&&(
            <div className="pdTabContent" key="details">
              <div className="pdAccordion">
                <details open>
                  <summary>Açıklama</summary>
                  <p>{product.longDesc || product.desc}</p>
                </details>
                <details>
                  <summary>Malzeme ve ölçü</summary>
                  <p>
                    {product.materials?.length > 0 && <><strong style={{color:'var(--text-main)',fontWeight:800}}>Malzemeler:</strong> {product.materials.join(', ')}<br/></>}
                    {product.dimensions && <><strong style={{color:'var(--text-main)',fontWeight:800}}>Ölçü:</strong> {product.dimensions}<br/></>}
                    {product.weight && <><strong style={{color:'var(--text-main)',fontWeight:800}}>Ağırlık:</strong> {product.weight}<br/></>}
                    {product.materialNote && <><br/>{product.materialNote}</>}
                  </p>
                </details>
                <details>
                  <summary>Bakım rehberi</summary>
                  {product.careSummary && <p>{product.careSummary}</p>}
                  {(product.careTips||[]).length > 0 && <ul>{(product.careTips||[]).map(t=><li key={t}>{t}</li>)}</ul>}
                </details>
                <details>
                  <summary>Kargo ve paketleme</summary>
                  <p>
                    {product.packageNote && <>{product.packageNote}<br/><br/></>}
                    <strong style={{color:'var(--text-main)',fontWeight:800}}>Tahmini teslim:</strong> {product.delivery} · Sigortalı kargo ile gönderilir.
                  </p>
                </details>
              </div>
            </div>
          )}
        {tab==='reviews'&&(
            <div className="pdTabContent" key="reviews">
              <ReviewSection productId={product.id} allReviews={allReviews} setAllReviews={setAllReviews}/>
            </div>
          )}
        </div>
        <ProductAtelierIdentity product={product}/>
        <ProductCraftStory product={product}/>
        {related.length>0&&(
          <div className="pdRelated reveal">
            <div className="pdRelatedHead"><p>BENZERLERİ</p><h2>Beğenebileceğin<br/>diğer parçalar</h2></div>
            <div className="pdRelatedGrid">
              {related.map(p=>(
                <button key={p.id} className="pdRelatedCard" onClick={()=>go('product',p)}>
                  <div className="pdRelatedImg"><img src={p.image} alt={p.title} loading="lazy"/><div className="cardHoverOverlay"><span>İncele ↗</span></div></div>
                  <div className="pdRelatedInfo"><small>{p.category}</small><b>{p.title}</b><span>{money(p.price)}</span></div>
                </button>
              ))}
            </div>
          </div>
        )}
        {recentlyViewed.length>0&&(
          <div className="pdRelated recentViewed reveal">
            <div className="pdRelatedHead"><p>SON BAKTIKLARIN</p><h2>Geri dönmek<br/>isteyebileceğin parçalar</h2></div>
            <div className="pdRelatedGrid">
              {recentlyViewed.map(p=>(
                <button key={p.id} className="pdRelatedCard" onClick={()=>go('product',p)}>
                  <div className="pdRelatedImg"><img src={p.image} alt={p.title} loading="lazy"/><div className="cardHoverOverlay"><span>Tekrar İncele ↗</span></div></div>
                  <div className="pdRelatedInfo"><small>{p.category}</small><b>{p.title}</b><span>{money(p.price)}</span></div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
function ProductAtelierIdentity({product}){
  const certNo=certificateNo(product);
  const materialLine=(product.materials||[]).slice(0,3).join(' · ') || 'Ravun seçili malzeme';
  return (
    <section className="pdIdentityBlock reveal" aria-label="Ravun ürün hikayesi ve sertifika">
      <article className="identityStoryCard">
        <p>BU PARÇANIN HİKAYESİ</p>
        <h2>{product.title}<br/><em>neden özel?</em></h2>
        <span>{product.story || product.longDesc || product.desc}</span>
        <div className="identityMetaGrid">
          {product.craftTime && <div><small>Üretim süresi</small><b>{product.craftTime}</b></div>}
          {product.finish && <div><small>Yüzey bitişi</small><b>{product.finish}</b></div>}
          {product.repeatable && <div><small>Tekrar durumu</small><b>{product.repeatable}</b></div>}
        </div>
      </article>
      <aside className="certificateCard" aria-label="Ravun dijital sertifika">
        <div className="certificatePattern" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
        <small>RAVUN ATÖLYE</small>
        <h3>Dijital Parça Sertifikası</h3>
        <strong>{certNo}</strong>
        <dl>
          <div><dt>Parça</dt><dd>{product.title}</dd></div>
          <div><dt>Malzeme</dt><dd>{materialLine}</dd></div>
          <div><dt>Ruh</dt><dd>{product.productionMood}</dd></div>
        </dl>
        <span>Her ürünün damar, ton ve elde bitiriş farkı sertifika değerini oluşturur.</span>
      </aside>
    </section>
  );
}
function ProductCraftStory({product}){
  const faqs=[
    ['Teslim süresi nedir?', `${product.delivery || '7-14 iş günü'} içinde üretim ve paketleme tamamlanır. Özel ölçü taleplerinde süre değişebilir.`],
    ['Ahşap damarları aynı olur mu?', 'Hayır. Doğal ahşapta her damar farklıdır; bu yüzden her Ravun parçası tek üretim hissi taşır.'],
    ['Kişiselleştirme yapılır mı?', 'Ölçü, epoksi tonu ve kullanım amacına göre WhatsApp üzerinden özel sipariş konuşulabilir.'],
    ['Nasıl temizlemeliyim?', 'Nemli olmayan yumuşak bez kullanın. Direkt güneş ve yoğun kimyasal temizleyicilerden kaçının.']
  ];
  return (
    <section className="pdCraftBlock reveal" aria-label="Üretim ve bakım bilgileri">
      <div className="craftHead"><p>ATÖLYE BİLGİSİ</p><h2>Malzeme,<br/><em>üretim ve bakım.</em></h2><span>Her Ravun parçasının arkasında titiz bir süreç yatar. Aşağıda bu ürüne dair tüm teknik bilgiyi bulabilirsiniz.</span></div>
      <div className="craftTimeline">
        {steps.map(([n,t,d])=><article key={n}><strong>{n}</strong><div><h3>{t}</h3><p>{d}</p></div></article>)}
      </div>
      <div className="pdCareGrid">
        <article className="pdCareCard pdPackageCard">
          <img src={`${A}brand-tags-canvas.webp`} alt="Ravun paketleme ve marka etiketi" loading="lazy"/>
          <div><p>PAKETLEME</p><h3>{product.packageNote || 'Korumalı kutu, bakım notu ve marka etiketi.'}</h3><span>Ürün yüzeyi çizilmeye karşı sarılır, köşeler desteklenir ve gönderim öncesi son kontrol yapılır.</span></div>
        </article>
        <article className="pdCareCard">
          <p>BAKIM REHBERİ</p>
          <h3>{product.careSummary || 'Uzun ömürlü kullanım için'}</h3>
          <ul>
            {(product.careTips || defaultCareTips(product)).map(t=><li key={t}>{t}</li>)}
          </ul>
        </article>
        <article className="pdCareCard pdMaterialCard">
          <p>MALZEME NOTU</p>
          <h3>{(product.materials||[]).slice(0,3).join(' · ') || 'Ravun malzemesi'}</h3>
          <span>{product.materialNote || 'Doğal malzeme dokusu her parçada küçük farklılıklar gösterebilir.'}</span>
        </article>
      </div>
      <div className="pdFaqBlock">
        <div className="pdFaqTitle"><p>SSS</p><h3>Sık sorulanlar</h3></div>
        <div className="pdFaqList">{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </div>
    </section>
  );
}
function ProductShareSeoStrip({product}){
  const [copied,setCopied]=useState(false);
  const payload=productSharePayload(product);
  const waUrl=`https://wa.me/?text=${encodeURIComponent(payload.text+'\n'+payload.url)}`;
  const doCopy=async()=>{
    const ok=await copyToClipboard(payload.url);
    setCopied(ok);
    setTimeout(()=>setCopied(false),1800);
  };
  return (
    <section className="pdShareSeoStrip reveal" aria-label="Ürün paylaşım ve link bilgisi">
      <div className="pdShareSeoCopy">
        <p>PAYLAŞIM HAZIR</p>
        <h3>Ürün linki düzenli, sosyal paylaşım bilgisi hazır.</h3>
        <span>WhatsApp veya Instagram DM için ürün adı, parça numarası ve link karışmadan kopyalanır.</span>
      </div>
      <div className="pdShareSeoActions">
        <code>{payload.url}</code>
        <div>
          <button type="button" onClick={doCopy}>{copied?'✓ Link kopyalandı':'Linki kopyala'}</button>
          <a href={waUrl} target="_blank" rel="noreferrer"><IWA/> WhatsApp’ta paylaş</a>
        </div>
      </div>
    </section>
  );
}
/* ── ÜRÜN KARTI ── */
function ProductCard({p, add, onDetail, allReviews, favorites, toggleFav}){
  const reviews=reviewList(allReviews, p.id);
  const avg=reviews.length?reviews.reduce((s,r)=>s+r.rating,0)/reviews.length:0;
  const status=productStatusInfo(p);
  const handlePrimary=()=>{ if(productCanBeOrdered(p)) add(p); else onDetail(p); };
  const [cardZoom,setCardZoom]=useState(false);
  const [cardZoomIdx,setCardZoomIdx]=useState(0);
  const cardGallery=p.gallery&&p.gallery.length?p.gallery:[p.image];
  const openZoom=e=>{e.stopPropagation();setCardZoomIdx(0);setCardZoom(true);};
  const certNo=certificateNo(p);
  const isFav=favorites&&favorites.includes(p.id);
  return (
    <article className={`productCard reveal in status-${status.tone}`} onClick={()=>onDetail(p)} style={{cursor:'pointer'}}>
      {cardZoom&&createPortal(<ZoomLightbox images={cardGallery} index={cardZoomIdx} alt={p.title} onIndex={setCardZoomIdx} onClose={()=>setCardZoom(false)}/>,document.body)}
      <div className="photoWrap">
        <img className="cardImg primaryImg" src={p.image} alt={p.title} loading="lazy"/>
        <div className="cardBadges"><small>{p.tag}</small></div>
        {status.archive&&<div className="archiveVeil"><span>Satıldı</span></div>}
        {toggleFav&&<button className={`cardFavBtn${isFav?' favActive':''}`} onClick={e=>{e.stopPropagation();toggleFav(p.id);}} aria-label="Favorilere ekle">{isFav?'♥':'♡'}</button>}
        <div className="cardZoomHint" onClick={openZoom} style={{cursor:'zoom-in',pointerEvents:'all'}}><IZoom/> Yakınlaştır</div>
      </div>
      <div className="productInfo">
        <div className="productMetaRow">
          <p className="productCatLabel">{p.category}</p>
          <span className="productCertNo">{certNo}</span>
        </div>
        <h3>{p.title}</h3>
        {avg>0&&<StarRating rating={avg} count={reviews.length} size="xs"/>}
        <span className="productDesc">{p.desc}</span>
        <div className="priceLine">
          <div className="priceBlock">
            <strong>{money(p.price)}</strong>
            <em>{status.archive ? 'Arşiv parçası' : p.delivery}</em>
          </div>
          <div className="cardActions" onClick={e=>e.stopPropagation()}>
            <button className={`addBtn${!status.canOrder?' archiveRequestBtn':''}`} onClick={handlePrimary}>
              {status.archive ? 'Satıldı' : 'Sepete Ekle'}
            </button>
            <button className="detailBtn" onClick={()=>onDetail(p)} aria-label={`${p.title} detayına git`}>↗</button>
          </div>
        </div>
        {p.materials?.length>0&&(
          <div className="productMiniMeta">
            {p.materials.slice(0,3).map(m=><i key={m}>{m}</i>)}
          </div>
        )}
      </div>
    </article>
  );
}
/* ── KOLEKSİYON GALERİ KARTI ── */
function GalleryCard({p, add, onDetail, allReviews, favorites, toggleFav, index}){
  const reviews = reviewList(allReviews, p.id);
  const avg = reviews.length ? reviews.reduce((s,r)=>s+r.rating,0)/reviews.length : 0;
  const status = productStatusInfo(p);
  const handlePrimary = () => { if(productCanBeOrdered(p)) add(p); else onDetail(p); };
  const [gz,setGz]=useState(false);
  const [gzIdx,setGzIdx]=useState(0);
  const gallery=p.gallery&&p.gallery.length?p.gallery:[p.image];
  return (
    <article className={`galleryCard reveal status-${status.tone}`}>
      {gz&&createPortal(<ZoomLightbox images={gallery} index={gzIdx} alt={p.title} onIndex={setGzIdx} onClose={()=>setGz(false)}/>,document.body)}
      <div className="galleryCardImg" onClick={()=>onDetail(p)} style={{cursor:'pointer'}}>
        <img src={p.image} alt={p.title} loading={index<6?'eager':'lazy'} decoding="async"/>
        {status.archive && <div className="galleryVeil"><span>Satıldı</span></div>}
        <div className="galleryCardBadge">{p.tag}</div>
        <div className="galleryZoomHint" onClick={e=>{e.stopPropagation();setGzIdx(0);setGz(true);}} style={{cursor:'zoom-in',pointerEvents:'all'}}><IZoom/> Yakınlaştır</div>
      </div>
      <div className="galleryCardBody">
        <div className="galleryCardMeta">
          <span className="galleryCardCat">{p.category}</span>
        </div>
        <h3 className="galleryCardTitle" style={{cursor:'pointer'}} onClick={()=>onDetail(p)}>{p.title}</h3>
        {avg>0 && <div className="galleryCardRating"><StarRating rating={avg} count={reviews.length} size="xs"/></div>}
        <div className="galleryCardFooter">
          <div className="galleryCardPrice">
            <strong>{money(p.price)}</strong>
            <em>{status.archive ? 'Arşiv' : p.delivery}</em>
          </div>
          <div className="galleryCardActions" onClick={e=>e.stopPropagation()}>
            <button className={`galleryAddBtn ${!status.canOrder?'galleryArchiveBtn':''}`} onClick={handlePrimary}>
              {status.archive ? 'Satıldı' : 'Sepete Ekle'}
            </button>
            <button className="galleryDetailBtn" onClick={e=>{e.stopPropagation();onDetail(p);}} aria-label="Detay">↗</button>
          </div>
        </div>
      </div>
    </article>
  );
}
/* ── KOLEKSİYON — GALERİ LAYOUT ── */
function Collection({add, standalone=false, goProduct, products, allReviews, favorites, toggleFav, cart, onCart, settings}){
  const [filterKey,setFilterKey]=useState('tum');
  const gridRef=useRef(null);
  const visible=useMemo(()=>sortProductsForStore(products.filter(p=>p.visible!==false)),[products]);
  const categories=useMemo(()=>{
    const map=new Map();
    map.set('tum', {key:'tum', label:'Tümü', count:visible.length});
    CATEGORIES.slice(1).forEach(cat=>{
      const key=categoryKey(cat);
      if(key && !map.has(key)) map.set(key, {key, label:categoryLabelFromKey(key, cat), count:0});
    });
    visible.forEach(p=>{
      const key=categoryKey(p.category);
      if(!key) return;
      const label=categoryLabelFromKey(key, p.category);
      const item=map.get(key) || {key, label, count:0};
      item.count += 1;
      item.label = item.label || label;
      map.set(key,item);
    });
    return [...map.values()].filter(cat=>cat.key==='tum'||cat.count>0);
  },[visible]);
  useEffect(()=>{
    if(filterKey !== 'tum' && !categories.some(cat=>cat.key===filterKey)) setFilterKey('tum');
  },[categories, filterKey]);
  const filtered=useMemo(()=>{
    if(filterKey==='tum') return visible;
    return visible.filter(p=>categoryKey(p.category)===filterKey);
  },[visible,filterKey]);
  useEffect(()=>{
    const t=setTimeout(()=>{
      gridRef.current?.querySelectorAll('.galleryCard.reveal').forEach((el,i)=>{
        setTimeout(()=>el.classList.add('in'), i*55);
      });
    }, 40);
    return ()=>clearTimeout(t);
  },[filterKey, filtered.length]);
  const selectCategory=key=>{ setFilterKey(key); };
  if(!standalone){
    /* Ana sayfadaki inline küçük koleksiyon */
    return (
      <section id="collection" className="collectionSection">
        <div className="collMain">
          {filtered.length===0?(
            <div className="collEmpty"><span>🔍</span><p>Bu filtreye uygun ürün bulunamadı.</p></div>
          ):(
            <div className="gridProducts homeProducts">
              {filtered.slice(0,3).map(p=>(
                <ProductCard key={p.id} p={p} add={add} onDetail={goProduct} allReviews={allReviews} favorites={favorites} toggleFav={toggleFav}/>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <section id="collection" className="collGallerySection">
      {/* Üst başlık bandı */}
      <div className="collGalleryHero">
        <div className="collGalleryHeroInner">
          <div className="collGalleryHeroLeft">
            <p className="collGalleryEyebrow">{settings?.collectionEyebrow || 'KOLEKSİYON'}</p>
            <h1 className="collGalleryTitle">
              {(settings?.collectionTitle || 'Atölyeden çıkan\nher parça.').split('\n').map((line,i)=>
                <React.Fragment key={i}>{i===1?<em>{line}</em>:line}{i===0&&<br/>}</React.Fragment>
              )}
            </h1>
          </div>
          <div className="collGalleryHeroRight">
            <p className="collGallerySubtitle">{settings?.collectionDesc || 'Özel üretim, sipariş üzerine. Her biri tek.'}</p>
            <div className="collGalleryCount"><strong>{filtered.length}</strong> parça</div>
          </div>
        </div>
        {/* Kategori filtre çubuğu */}
        <nav className="collGalleryCats" aria-label="Kategori filtrele">
          {categories.map(cat=>(
            <button
              key={cat.key}
              type="button"
              className={`collGalleryCatBtn ${filterKey===cat.key?'active':''}`}
              onClick={()=>selectCategory(cat.key)}
              aria-pressed={filterKey===cat.key}
            >
              {cat.label}
              {cat.key!=='tum' && <span className="collGalleryCatCount">{cat.count}</span>}
            </button>
          ))}
        </nav>
      </div>
      {/* Galeri grid */}
      <div className="collGalleryBody" ref={gridRef}>
        {filtered.length===0 ? (
          <div className="collEmpty">
            <span>✦</span>
            <p>Bu kategoride henüz ürün yok.</p>
            <button onClick={()=>setFilterKey('tum')}>Tümünü Gör</button>
          </div>
        ) : (
          <div className="collGalleryGrid">
            {filtered.map((p,i)=>(
              <GalleryCard
                key={p.id}
                p={p}
                index={i}
                add={add}
                onDetail={goProduct}
                allReviews={allReviews}
                favorites={favorites}
                toggleFav={toggleFav}
              />
            ))}
          </div>
        )}
        {/* Alt atölye notu */}
        <div className="collGalleryFooterNote">
          <span className="collGalleryFooterDots">
            <i style={{background:'#1a6b4a'}}/><i style={{background:'#8B4513'}}/><i style={{background:'#2a2a2a'}}/>
          </span>
          <p>Her ürün siparişe özel, el yapımı olarak üretilir. Fotoğraflardaki dokular özgündür; aynı parça tekrar üretilemez.</p>
          <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer" className="collGalleryWaLink">
            <IWA/> Özel sipariş için WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
/* ── GEÇİCİ SİPARİŞ SİSTEMİ (VPS/DB ÖNCESİ LOCALSTORAGE) ── */
const ORDER_STATUSES = [
  ['pending','Beklemede'],
  ['approved','Onaylandı'],
  ['production','Üretimde'],
  ['packing','Paketleniyor'],
  ['cargo','Kargoda'],
  ['delivered','Teslim edildi']
];
function makeOrderNo(){
  const d=new Date();
  const y=String(d.getFullYear()).slice(-2);
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  const rand=Math.random().toString(36).slice(2,6).toUpperCase();
  return `RVN-${y}${m}${day}-${rand}`;
}
function orderStatusLabel(status){
  return ORDER_STATUSES.find(([k])=>k===status)?.[1] || 'Beklemede';
}
function orderTotal(order){
  return (order.items||[]).reduce((s,x)=>s+(Number(x.price)||0)*(Number(x.qty)||1),0);
}
/* Yüklenen görseli localStorage kotasını korumak için sıkıştırır: max 2000px kenar, JPEG q=0.92 */
function compressImageFile(file, {maxDim = 2000, quality = 0.92} = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Görsel işlenemedi'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function Process(){
  return (
    <section id="process" className="process sectionSoft">
      <div className="sectionHead narrow reveal"><p>SÜREÇ</p><h2>Üretim notları</h2><span>Bu alan varsayılan ana sayfadan kaldırıldı.</span></div>
      <div className="processGrid">{steps.map(([n,t,d,s])=><article key={n} className="stepCard reveal"><div className="stepTop"><strong>{n}</strong><span/></div><h3>{t}</h3><p>{d}</p><small>{s}</small></article>)}</div>
    </section>
  );
}
/* ── HİKAYE PREVİEW ── */
function StoryPreview({go}){
  return (
    <section className="story storyPreview section">
      <div className="storyText reveal">
        <p>HİKAYEMİZDEN</p>
        <h2>Ahşabın damarı,<br/><em>epoksinin derinliği.</em></h2>
        <span>Ravun'da her parça önce malzemesiyle seçilir, sonra mekânına göre şekillenir. Aynı parça bir daha üretilmez.</span>
        <button onClick={()=>go('story')}>Hikayeyi Oku <b>↗</b></button>
      </div>
      <div className="storyPhotos reveal">
        <img src={`${A}products_hero-1.webp`} alt="Ravun epoksi ürün detayı" loading="lazy" decoding="async"/>
        <img src={`${A}products_hero-3.webp`} alt="Ravun atölye çalışması" loading="lazy" decoding="async"/>
      </div>
    </section>
  );
}
/* ── HİKAYE SAYFASI ── */
function StoryPage({go}){
  return (
    <main className="page storyPage">
      <section className="pageHero"><p>HİKAYE</p><h1>Doğadan ilham,<br/><em>elin değeri.</em></h1><span>Ravun, doğal ahşabın karakterini epoksinin derinliğiyle buluşturan butik bir atölye markasıdır.</span></section>
      <section className="storyLong section">
        <div className="storyText reveal"><p>ATÖLYE FELSEFESİ</p><h2>Malzeme aceleye<br/><em>gelmez.</em></h2><span>Her parça ahşap seçimiyle başlar. Cilalama aşamasında doğal yağ ve balmumu ile yüzey son dokusuna ulaşır.</span><button onClick={()=>go('contact')}>Özel Parça İçin Yaz <b>↗</b></button></div>
        <div className="storyPhotos reveal"><img src={`${A}tags-canvas.webp`} alt="Kumaş etiket" loading="lazy" decoding="async"/><img src={`${A}tags-cork.webp`} alt="Deri ve mantar tag" loading="lazy" decoding="async"/></div>
      </section>
      <Palette/>
      <CTA go={go}/>
    </main>
  );
}
/* ── PALET ── */
function Palette(){
  const wood=['Anadolu Cevizi','Türk Meşesi','Iroko','Akçaağaç'];
  const resin=['Zümrüt Yeşili','Bal Tonu','Mineral Mavi','Saddle Tan','Buz Mavisi','Obsidiyen'];
  return <section className="palette sectionSoft"><div className="sectionHead reveal"><p>ATÖLYE PALETİ</p><h2>Malzeme, ton<br/>ve doku.</h2></div><div className="paletteGrid reveal">{wood.map((x,i)=><div key={x}><b>Ahşap</b><h3>{x}</h3><p>{['Koyu, sıcak, ince damar','Kuvvetli damar, sert','Su geçirmez, doğal yağlı','Açık ton, ince doku'][i]}</p></div>)}{resin.map((x,i)=><div key={x}><b>Epoksi</b><h3>{x}</h3><p>{['İmza tonumuz','Sıcak, yarı saydam','Derin okyanus','Deri tonu','Şeffaf, ışıklı','Üç pigmentli set'][i]}</p></div>)}</div></section>;
}
/* ── PREMIUM PROMISE ── */
function PremiumPromise(){
  return <section className="promise section"><div className="promiseInner reveal">{[['01','Sade bilgi','Kısa ürün notları.'],['02','Temiz görünüm','Boşluklu kart yapısı.'],['03','Korumalı paket','Kutu ve bakım notu.']].map(([n,t,d])=><article key={n}><small>{n}</small><h3>{t}</h3><p>{d}</p></article>)}</div></section>;
}
/* ── CTA ── */
function CTA({go}){
  return <section className="ctaWrap section"><div className="cta reveal"><img src={`${A}cta-banner.webp`} alt="Yeşil epoksi dokusu" loading="lazy" decoding="async"/><div className="ctaShade"/><div><p>SİPARİŞ ÜZERİNE</p><h2>Sıra dışı bir parça<br/>için <em>bize yazın.</em></h2><span>İhtiyacınızı, ölçülerinizi ve hayalinizdeki tonu birlikte konuşalım.</span><div><button onClick={()=>go('contact')}>İletişime Geç ↗</button><button onClick={()=>go('collection')}>Koleksiyona Göz At</button></div></div></div></section>;
}
/* ── İLETİŞİM FORMU KAYIT YARDIMCILARI ── */
const CONTACT_STORE_KEY = 'ravun:contactMsgs';
function readContactMsgs() {
  try {
    const raw = localStorage.getItem(_sk(CONTACT_STORE_KEY));
    if (!raw) return [];
    const decoded = b64DecodeUtf8(raw);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveContactMsg(msg) {
  try {
    const list = readContactMsgs();
    const newList = [msg, ...list].slice(0, 50); // en fazla 50 mesaj sakla
    const encoded = b64EncodeUtf8(JSON.stringify(newList));
    localStorage.setItem(_sk(CONTACT_STORE_KEY), encoded);
    return true;
  } catch { return false; }
}
function formatMsgDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  } catch { return iso; }
}
/* ── İLETİŞİM ── */
function ContactPage(){return <main className="page"><Contact/></main>;}
function Contact(){
  const EMPTY = {isim:'',eposta:'',telefon:'',parca:'',mesaj:''};
  const [form,setForm] = useState(EMPTY);
  const [sent,setSent] = useState(false);
  const [sending,setSending] = useState(false);
  const [savedMsgs,setSavedMsgs] = useState(()=>readContactMsgs());
  const [showInbox,setShowInbox] = useState(false);
  const [waFailed,setWaFailed] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const isValid = form.isim.trim().length>0 && form.eposta.trim().length>0;
  const submit = () => {
    if(!isValid || sending) return;
    setSending(true);
    setWaFailed(false);
    // 1. Mesajı hemen localStorage'a kaydet — WA açılmasa bile veri güvende
    const entry = {
      id: Date.now(),
      sentAt: new Date().toISOString(),
      isim: cleanText(form.isim, 90),
      eposta: cleanText(form.eposta, 120),
      telefon: cleanText(form.telefon, 30),
      parca: cleanText(form.parca, 60),
      mesaj: cleanText(form.mesaj, 1200),
      waStatus: 'pending', // 'sent' | 'pending' | 'failed'
    };
    const saved = saveContactMsg(entry);
    setSavedMsgs(readContactMsgs());
    // 2. WhatsApp'ı aç
    const text = `Merhaba, Ravun formu üzerinden ulaşıyorum.\n\nİsim: ${entry.isim}\nE-posta: ${entry.eposta}\nTelefon: ${entry.telefon||'—'}\nİlgilendiğim ürün: ${entry.parca||'—'}\n\nMesaj: ${entry.mesaj||'—'}`;
    setTimeout(() => {
      try {
        const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
        const win = window.open(waUrl, '_blank', 'noopener,noreferrer');
        // Yeni sekme açılamazsa (popup blocker vb.) kaydedildi ama WA açılmadı
        if(!win) {
          setWaFailed(true);
          // Durumu 'failed' olarak güncelle
          try {
            const msgs = readContactMsgs();
            const updated = msgs.map(m => m.id===entry.id ? {...m,waStatus:'failed'} : m);
            localStorage.setItem(_sk(CONTACT_STORE_KEY), b64EncodeUtf8(JSON.stringify(updated)));
            setSavedMsgs(updated);
          } catch {}
        } else {
          // WA açıldı, durumu 'sent' yap
          try {
            const msgs = readContactMsgs();
            const updated = msgs.map(m => m.id===entry.id ? {...m,waStatus:'sent'} : m);
            localStorage.setItem(_sk(CONTACT_STORE_KEY), b64EncodeUtf8(JSON.stringify(updated)));
            setSavedMsgs(updated);
          } catch {}
        }
      } catch { setWaFailed(true); }
      setSent(true);
      setSending(false);
      setForm(EMPTY);
    }, 380);
  };
  const resendWa = (msg) => {
    const text = `Merhaba, Ravun formu üzerinden ulaşıyorum.\n\nİsim: ${msg.isim}\nE-posta: ${msg.eposta}\nTelefon: ${msg.telefon||'—'}\nİlgilendiğim ürün: ${msg.parca||'—'}\n\nMesaj: ${msg.mesaj||'—'}`;
    safeOpen(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`);
  };
  const deleteMsg = (id) => {
    try {
      const updated = readContactMsgs().filter(m=>m.id!==id);
      localStorage.setItem(_sk(CONTACT_STORE_KEY), b64EncodeUtf8(JSON.stringify(updated)));
      setSavedMsgs(updated);
    } catch {}
  };
  return (
    <section id="contact" className="contact section">
      <div className="contactCopy reveal">
        <p className="pill">İLETİŞİM</p>
        <h2>Hayalinizdeki parçayı<br/><em>birlikte tasarlayalım.</em></h2>
        <span>Formu doldurun ya da doğrudan bize yazın. Her mesaja en geç 48 saat içinde yanıt veriyoruz.</span>
        {sent ? (
          <div className="formSent">
            <span>✓</span>
            <div>
              <p>{waFailed ? 'Mesajınız kaydedildi. WhatsApp açılamadı — aşağıdan tekrar gönderebilirsiniz.' : 'Mesajınız kaydedildi ve WhatsApp\'a iletildi!'}</p>
              {waFailed && savedMsgs.length>0 && (
                <button className="contactInboxBtn" style={{marginTop:'10px'}} onClick={()=>{setSent(false);setShowInbox(true);}}>
                  Kaydedilen Mesajları Gör ↗
                </button>
              )}
              <button className="contactInboxBtn" style={{marginTop:'8px',opacity:.7}} onClick={()=>{setSent(false);setWaFailed(false);}}>
                Yeni Mesaj Gönder
              </button>
            </div>
          </div>
        ) : showInbox ? (
          <div className="contactInbox">
            <div className="contactInboxHead">
              <strong>Gönderilen Mesajlar ({savedMsgs.length})</strong>
              <button onClick={()=>setShowInbox(false)}>← Forma Dön</button>
            </div>
            {savedMsgs.length===0 ? (
              <p className="contactInboxEmpty">Henüz kayıtlı mesaj yok.</p>
            ) : savedMsgs.map(msg=>(
              <div key={msg.id} className="contactInboxItem">
                <div className="contactInboxMeta">
                  <strong>{msg.isim}</strong>
                  <span className={`contactInboxStatus ${msg.waStatus==='sent'?'statusSent':msg.waStatus==='failed'?'statusFailed':'statusPending'}`}>
                    {msg.waStatus==='sent'?'✓ WA İletildi':msg.waStatus==='failed'?'⚠ WA Açılmadı':'· Beklemede'}
                  </span>
                  <time>{formatMsgDate(msg.sentAt)}</time>
                </div>
                {msg.parca&&<p className="contactInboxParca">→ {msg.parca}</p>}
                {msg.mesaj&&<p className="contactInboxMesaj">"{msg.mesaj}"</p>}
                <div className="contactInboxActions">
                  <button onClick={()=>resendWa(msg)}>WhatsApp ile Tekrar Gönder ↗</button>
                  <button className="contactInboxDelete" onClick={()=>deleteMsg(msg.id)}>Sil</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="contactForm">
            <label>İSİM *<input placeholder="Ad Soyad" value={form.isim} onChange={set('isim')} autoComplete="name"/></label>
            <label>E-POSTA *<input placeholder="merhaba@example.com" type="email" value={form.eposta} onChange={set('eposta')} autoComplete="email"/></label>
            <label>TELEFON<input placeholder="+90 ..." value={form.telefon} onChange={set('telefon')} autoComplete="tel"/></label>
            <label>İLGİLENDİĞİN PARÇA
              <select value={form.parca} onChange={set('parca')}>
                <option value="">Seçiniz</option>
                <option>Duvar Rafı</option>
                <option>Bıçak Standı</option>
                <option>Masaüstü</option>
                <option>Sunum Tahtası</option>
                <option>Özel Sipariş</option>
              </select>
            </label>
            <label className="full">MESAJ<textarea placeholder="Ölçü, renk, teslim tarihi ve aklındaki fikri yaz." value={form.mesaj} onChange={set('mesaj')}/></label>
            <button type="button" className="submitBtn" onClick={submit} disabled={sending||!isValid}>
              {sending?'Kaydediliyor…':'WhatsApp ile Gönder ↗'}
            </button>
            {savedMsgs.length>0&&(
              <button type="button" className="contactInboxBtn" onClick={()=>setShowInbox(true)}>
                Geçmiş Mesajlar ({savedMsgs.length})
              </button>
            )}
          </div>
        )}
      </div>
      <div className="contactSide reveal">
        <div className="mapCard"><svg viewBox="0 0 500 260" aria-hidden="true"><path d="M0 155 C95 120 160 140 230 155 S360 85 500 130"/><circle cx="300" cy="123" r="9"/></svg><span>⌾ BEYKOZ ATÖLYE</span></div>
        <ul><li><a href={`mailto:${WA_EMAIL}`}>✉ {WA_EMAIL}</a></li><li><a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer">☏ {WA_DISPLAY}</a></li><li>◎ @ravun.atolye</li><li>⌖ Beykoz, İstanbul</li></ul>
      </div>
    </section>
  );
}
/* ── SEPET DRAWER ── */
function CartDrawer({open, cart, setOpen, inc, dec, createOrder, clearCart, go}){
  const [customer,setCustomer]=useState({name:'',phone:'',note:''});
  const [created,setCreated]=useState(null);
  const total=useMemo(()=>cart.reduce((s,x)=>s+x.price*x.qty,0),[cart]);
  const giftCount=cart.filter(x=>x.giftWrap).length;
  const itemCount=cart.reduce((s,x)=>s+Number(x.qty||0),0);
  const waMsg=encodeURIComponent(buildCartWhatsAppMessage({cart,total,itemCount,giftCount,customer,created}));
  useEffect(()=>{
    if(!open)return;
    // Not: body scroll kilidi App seviyesinde (drawer) merkezi olarak yönetilir —
    // burada ayrıca modal-open class'ı ekleyip çıkarmak diğer overlay'lerle (arama,
    // hamburger menü) çakışıp scroll kilidinin erken açılmasına yol açıyordu.
    const onKey=e=>{if(e.key==='Escape')setOpen(false);};
    window.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('keydown',onKey);};
  },[open,setOpen]);
  useEffect(()=>{
    if(!open){
      // Sipariş oluşturulmuşsa (taslak veya WhatsApp) drawer kapanırken sepeti temizle —
      // önceden sepet hiç temizlenmiyordu, tamamlanan sipariş kalemleri sepette kalıyordu.
      if(created) clearCart?.();
      setCreated(null);
      setCustomer({name:'',phone:'',note:''});
    }
  },[open]);
  const submitOrder=()=>{
    if(cart.length===0)return;
    const order=createOrder({customerName:customer.name,customerPhone:customer.phone,note:customer.note});
    setCreated(order);
  };
  const ensureOrderForWa=()=>{
    if(cart.length===0)return;
    if(!created){
      const order=createOrder({customerName:customer.name,customerPhone:customer.phone,note:customer.note});
      setCreated(order);
    }
  };
  const addNoteChip=(text)=>setCustomer(c=>({
    ...c,
    note: cleanText([c.note, text].filter(Boolean).join(c.note ? ' · ' : ''), 500)
  }));
  return (
    <div className={open?'cartLayer show':'cartLayer'} role="dialog" aria-modal="true" aria-label="Sepet">
      <button className="cartDim" onClick={()=>setOpen(false)} aria-label="Kapat"/>
      <aside className="drawer checkoutDrawer">
        <div className="drawerHead ravunCartHead"><div><small className="checkoutKicker">SEPET</small><h3>{itemCount} parça</h3></div><button onClick={()=>setOpen(false)} aria-label="Sepeti kapat"><IClose/></button></div>
        {cart.length>0&&<div className="checkoutSteps" aria-label="Sipariş adımları"><span className="isDone">Sepet</span><span>Bilgi</span><span>WhatsApp</span></div>}
        {cart.length===0?<div className="emptyCartState"><div className="emptyCartIcon"><ICart/></div><h4>Sepetiniz boş</h4><p>Beğendiğiniz parçayı ekleyin; sipariş için WhatsApp üzerinden bizimle buluşacaksınız.</p><button onClick={()=>{setOpen(false);go?.('collection');}}>Koleksiyonu Keşfet</button></div>
          :cart.map(item=>(
          <div className="cartItem" key={item.id}>
            <img src={item.image} alt={item.title}/>
            <div><b>{item.title}</b><span>{money(item.price)}</span>
              {(item.selectedSize||item.selectedColor)&&<small className="cartGiftLine">{[item.selectedSize,item.selectedColor].filter(Boolean).join(' · ')}</small>}
              {item.giftWrap&&<small className="cartGiftLine">🎁 {item.giftStyle||'Hediye paketi'}{item.giftRecipient?` · ${item.giftRecipient}`:''}{item.giftDelivery?` · ${item.giftDelivery}`:''}{item.giftNote?` · “${item.giftNote}”`:''}</small>}
              <div><button onClick={()=>dec(item.id)} aria-label="Azalt">−</button><em>{item.qty}</em><button onClick={()=>inc(item.id)} aria-label="Artır">+</button></div>
            </div>
          </div>
        ))}
        {cart.length>0&&<div className="checkoutSummary">
          <div><span>Ürün adedi</span><b>{itemCount}</b></div>
          <div><span>Hediye paketi</span><b>{giftCount ? `${giftCount} ürün` : 'Yok'}</b></div>
          <div><span>Teslim şekli</span><b>WhatsApp onaylı</b></div>
        </div>}
        <div className="drawerTotal"><span>Toplam</span><strong>{money(total)}</strong></div>
        {cart.length>0&&(
          <div className="drawerOrderBox">
            <div><b>Sipariş taslağı</b><small>VPS/veritabanı gelene kadar admin panelinde yerel kayıt olarak tutulur.</small></div>
            <input value={customer.name} onChange={e=>setCustomer(c=>({...c,name:e.target.value}))} placeholder="Ad Soyad"/>
            <input value={customer.phone} onChange={e=>setCustomer(c=>({...c,phone:e.target.value}))} placeholder="Telefon"/>
            <div className="noteChips" aria-label="Hızlı sipariş notları">
              {['Hediye paketi olsun','Ölçü konuşalım','Teslim tarihi önemli'].map(chip=><button key={chip} type="button" onClick={()=>addNoteChip(chip)}>{chip}</button>)}
            </div>
            <textarea value={customer.note} onChange={e=>setCustomer(c=>({...c,note:e.target.value}))} placeholder="Ölçü, renk, özel istek notu" rows="2"/>
            <button className="draftOrderBtn" onClick={submitOrder} disabled={!!created}>{created?'✓ Taslak Oluşturuldu':'Sipariş Taslağı Oluştur'}</button>
            <small className="checkoutHint">Taslak oluşturunca admin panelindeki sipariş listesine düşer. WhatsApp mesajı da aynı bilgileri taşır.</small>
            {created&&<p className="orderCreated">✓ {created.orderNo} oluşturuldu. Admin panelinden takip edebilirsin.</p>}
          </div>
        )}
        <a className="waOrder" href={`https://wa.me/${WA_NUMBER}?text=${waMsg}`} target="_blank" rel="noreferrer" onClick={ensureOrderForWa}>WhatsApp ile Sipariş Ver</a>
      </aside>
    </div>
  );
}
/* ── GLOBAL ARAMA OVERLAY ── */
function SearchOverlay({open, onClose, products, goProduct}){
  const [q,setQ]=useState('');
  const inputRef=useRef(null);
  useEffect(()=>{
    if(!open)return;
    // Not: body scroll kilidi App seviyesinde (searchOpen) merkezi olarak yönetilir —
    // burada tekrar overflow set/restore etmek diğer overlay'lerle (sepet, hamburger menü)
    // çakışıp scroll kilidinin erken açılmasına yol açıyordu.
    const t=setTimeout(()=>inputRef.current?.focus(),60);
    const onKey=e=>{if(e.key==='Escape')onClose();};
    window.addEventListener('keydown',onKey);
    return()=>{clearTimeout(t);window.removeEventListener('keydown',onKey);setQ('');};
  },[open,onClose]);
  const results=useMemo(()=>{
    const v=q.trim().toLocaleLowerCase('tr-TR');
    if(!v)return products.filter(p=>p.visible).slice(0,6);
    return products.filter(p=>p.visible&&(p.title.toLocaleLowerCase('tr-TR').includes(v)||p.desc.toLocaleLowerCase('tr-TR').includes(v)||p.category.toLocaleLowerCase('tr-TR').includes(v))).slice(0,8);
  },[q,products]);
  if(!open)return null;
  return (
    <div className="searchLayer" role="dialog" aria-modal="true" aria-label="Ürün arama">
      <button className="searchDim" onClick={onClose} aria-label="Aramayı kapat"/>
      <div className="searchPanel">
        <div className="searchTop"><span><ISearch/></span><input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Ürün, kategori veya malzeme ara…" aria-label="Ürün ara"/><button onClick={onClose} aria-label="Kapat"><IClose/></button></div>
        <p className="searchHint">{q?`${results.length} sonuç bulundu`:'Öne çıkan ürünler'}</p>
        <div className="searchResults">
          {results.length===0?<div className="searchEmpty">Bu aramada ürün bulunamadı.</div>:results.map(p=>(
            <button key={p.id} className="searchItem" onClick={()=>{onClose();goProduct(p);}}>
              <img src={p.image} alt={p.title}/><div><small>{p.category}</small><b>{p.title}</b><span>{money(p.price)}</span></div><em>İncele ↗</em>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
/* ── FAVORİLER SAYFASI ── */
function FavoritesPage({products, favorites, add, goProduct, allReviews, toggleFav, go}){
  const favProducts=products.filter(p=>Array.isArray(favorites)&&favorites.includes(p.id)&&p.visible);
  return (
    <main className="page favoritesPage">
      <section className="favoritesHero reveal"><p>FAVORİLER</p><h1>Beğendiğin<br/><em>parçalar.</em></h1><span>Kaydettiğin ürünler bu cihazda saklanır. Dilediğin zaman sepete ekleyebilir veya detayını inceleyebilirsin.</span></section>
      <section className="favoritesBody">
        {favProducts.length===0?(
          <div className="favoritesEmpty reveal"><div><IHeart f={false}/></div><h2>Henüz favori ürün yok</h2><p>Koleksiyondaki kalp ikonlarına dokunarak sevdiğin parçaları burada toplayabilirsin.</p><button onClick={()=>go('collection')}>Koleksiyonu Keşfet ↗</button></div>
        ):(
          <div className="gridProducts collectionFull">
            {favProducts.map(p=><ProductCard key={p.id} p={p} add={add} onDetail={goProduct} allReviews={allReviews} favorites={favorites} toggleFav={toggleFav}/>) }
          </div>
        )}
      </section>
    </main>
  );
}
/* ── MOBİL ALT MENÜ ── */
function BottomNav({page, go, onSearch, onCart, favCount, cartCount}){
  const waText=encodeURIComponent('Merhaba, Ravun sitesinden yazıyorum. Ürün/sipariş hakkında bilgi almak istiyorum.');
  return (
    <nav className="bottomNav" aria-label="Mobil hızlı menü" role="navigation">
      <button className={page==='home'?'active':''} onClick={()=>go('home')} aria-label="Ana Sayfa"><IHome/><span>Ana</span></button>
      <button className={page==='collection'?'active':''} onClick={()=>go('collection')} aria-label="Koleksiyon"><IFilter/><span>Koleksiyon</span></button>
      <button className="bottomCartBtn" onClick={onCart} aria-label={cartCount>0?`Sepet (${cartCount})`:'Sepet'}><ICart/>{cartCount>0&&<b>{cartCount}</b>}<span>Sepet</span></button>
      <button onClick={onSearch} aria-label="Ara"><ISearch/><span>Ara</span></button>
      <a className="bottomWaBtn" href={`https://wa.me/${WA_NUMBER}?text=${waText}`} target="_blank" rel="noreferrer" aria-label="WhatsApp ile yaz"><IWA/></a>
    </nav>
  );
}
/* ── GİZLİ ADMİN ERİŞİMİ ──
   Herkese açık bir "Admin" butonu göstermek yerine, giriş imkanı
   alt bilgideki telif satırına gizlenir: art arda 10 kez tıklanınca
   (tıklamalar arası boşluk çok uzarsa sayaç sıfırlanır) admin girişi açılır.
   Bu satırın görünümünde/imlecinde HERHANGİ bir değişiklik yapılmaz —
   normal bir metin gibi durmaya devam eder. */
const SECRET_TAP_COUNT = 10;
const SECRET_TAP_WINDOW_MS = 1600;
function useSecretTap(onTrigger, required = SECRET_TAP_COUNT){
  const stateRef = useRef({count:0, last:0});
  return useCallback(()=>{
    const now = Date.now();
    const s = stateRef.current;
    if (now - s.last > SECRET_TAP_WINDOW_MS) s.count = 0;
    s.count += 1;
    s.last = now;
    if (s.count >= required){
      s.count = 0;
      onTrigger?.();
    }
  },[onTrigger,required]);
}
/* ── FOOTER ── */
function Footer({go, settings, onAdmin}){
  const handleSecretTap = useSecretTap(onAdmin);
  return (
    <footer className="footer">
      <div><img src={`${A}ravun-logo.webp`} alt="Ravun" loading="lazy" width="120" height="32"/><p>{settings?.footerDesc || 'Doğal ahşap ve epoksi reçineyi el işçiliğiyle buluşturan butik atölye.'}</p><span>{settings?.footerLocation || "Beykoz, İstanbul · 2018'den beri"}</span></div>
      <nav><b>Atölye</b><button onClick={()=>go('collection')}>Koleksiyon</button><button onClick={()=>go('story')}>Hikayemiz</button><button onClick={()=>go('contact')}>Sipariş</button></nav>
      <nav><b>Sosyal</b><a href={safeUrl(settings?.instagramUrl || 'https://instagram.com/ravun.atolye', 'https://instagram.com/')} target="_blank" rel="noreferrer">{settings?.instagram || '@ravun.atolye'}</a><span className="footerSoon">{settings?.pinterestLabel || 'Pinterest — yakında'}</span></nav>
      <nav><b>İletişim</b><a href={`mailto:${WA_EMAIL}`}>{WA_EMAIL}</a><a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer">{WA_DISPLAY}</a></nav>
      <small onClick={handleSecretTap} style={{userSelect:'none'}}>© 2026 Ravun Atölye · Tüm hakları saklıdır.</small>
    </footer>
  );
}
/* ── HEADER ── */
function Header({count, favCount, onCart, page, go, onSearch, settings, onNavToggle}){
  const [open,setOpenRaw]=useState(false);
  const [scrolled,setScrolled]=useState(false);
  // Not: body scroll kilidi App seviyesinde (navOpen) merkezi olarak yönetilir —
  // burada ayrıca overflow set/restore etmek diğer overlay'lerle (arama, sepet)
  // çakışıp scroll kilidinin erken açılmasına yol açıyordu.
  const setOpen=useCallback((v)=>{
    setOpenRaw(prev=>{
      const next=typeof v==='function'?v(prev):v;
      onNavToggle?.(next);
      return next;
    });
  },[onNavToggle]);
  useEffect(()=>()=>onNavToggle?.(false),[onNavToggle]);
  useEffect(()=>{
    const onScroll=()=>setScrolled(window.scrollY>10||page!=='home');
    onScroll(); window.addEventListener('scroll',onScroll,{passive:true});
    return()=>window.removeEventListener('scroll',onScroll);
  },[page]);
  const nav=target=>{setOpen(false);go(target);};
  return (
    <header className={`header ${scrolled?'scrolled':''}`}>
      {settings?.announcement&&<div className="topAnnounce">{settings.announcement}</div>}
      <button className="logoButton" onClick={()=>nav('home')} aria-label="Ravun ana sayfa">
        <img src={`${A}ravun-logo.webp`} alt="Ravun" className="logo"/>
      </button>
      {open&&<div className="navOverlay" onClick={()=>setOpen(false)} aria-hidden="true"/>}
      <nav className={open?'nav open':'nav'}>
        <button className={page==='collection'?'active':''} onClick={()=>nav('collection')}>Koleksiyon</button>
        <button className={page==='story'?'active':''} onClick={()=>nav('story')}>Hikaye</button>
        <button className={page==='contact'?'active':''} onClick={()=>nav('contact')}>İletişim</button>
      </nav>
      <div className="headActions">
        <button className="cartRound" onClick={onCart} aria-label="Sepet"><ICart/>{count>0&&<b>{count}</b>}</button>
        <button className="orderBtn" onClick={()=>nav('contact')}>Sipariş Ver ↗</button>
        <button className={`hamb ${open?'hambOpen':''}`} onClick={()=>setOpen(!open)} aria-label={open?'Menüyü kapat':'Menüyü aç'} aria-expanded={open}><i/><i/><i/></button>
      </div>
    </header>
  );
}
/* ── HERO ── */
function Hero({go, settings}){
  const [active,setActive]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setActive(v=>(v+1)%slides.length),4500);return()=>clearInterval(t);},[]);
  const s={...slides[active], tag:settings?.heroTag || slides[active].tag, line1:settings?.heroLine1 || slides[active].line1, line2:settings?.heroLine2 || slides[active].line2};
  const heroSrc = slides[active]?.image || slides[0].image;
  return (
    <section id="hero" className="hero" style={{'--hero-img': `url(${heroSrc})`}}>
      {slides.map((slide,i)=><img key={slide.image} src={slide.image} alt="Ravun atölye ürünü" className={`heroImg ${i===active?'active':''}`} loading={i===active?'eager':'lazy'} fetchpriority={i===active?'high':'low'}/>)}
      <div className="heroOverlay"/>
      <div key={active} className="heroContent heroEnter">
        <p className="kicker">· {s.tag}</p>
        <h1><span>{s.line1}</span><em>{s.line2}</em></h1>
        <div className="heroCtas">
          <button className="heroPrimaryBtn" onClick={()=>go('collection')}>{settings?.heroCta || 'Bu Parçayı Gör ↗'}</button>
          <button className="heroSecondaryBtn" onClick={()=>go('collection')}>{settings?.heroSecondCta || 'TÜM KOLEKSİYON'} <b>→</b></button>
        </div>
      </div>
      {/* Sol alt — slayt göstergesi */}
      <div className="sliderHint">
        {slides.map((_,i)=>(
          <button key={i} className={active===i?'active':''} onClick={()=>setActive(i)}>
            <span className="sliderLine"/>
            <span className="sliderNum">0{i+1}</span>
          </button>
        ))}
      </div>
      {/* Sağ alt — aşağı kaydır */}
      <button className="scrollHint" onClick={()=>document.getElementById('atelier-feature')?.scrollIntoView({behavior:'smooth'}) || window.scrollBy({top:window.innerHeight,behavior:'smooth'})} aria-label="Aşağı kaydır">
        AŞAĞI KAYDIR <span>↓</span>
      </button>
    </section>
  );
}
/* ── MARQUEE ── */
function Marquee(){
  const items=['El dökümü','Tek parça','Anadolu ahşabı','Doğal yağ bitiş','Sigortalı kargo','Sipariş üzerine','Türk cevizi','Zümrüt epoksi'];
  const loop=[...items,...items,...items];
  return (
    <div className="marquee">
      <span className="srOnly">{items.join(' · ')}</span>
      <div className="marqueeTrack" aria-hidden="true">
        {loop.map((x,i)=>(
          <React.Fragment key={i}>
            <span className="marqueeItem">{x}</span>
            <span className="marqueeSep"><IStar/></span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
/* ── ANA SAYFA ÜRÜNLER BÖLÜMÜ ── */
function HomeProducts({add, go, goProduct, products, allReviews, favorites, toggleFav}){
  const visible=sortProductsForStore(products.filter(p=>p.visible && p.homeVisible!==false)).slice(0,3);
  const fallbackVisible=visible.length ? visible : sortProductsForStore(products.filter(p=>p.visible)).slice(0,3);
  return (
    <section className="homeProductsSection section">
      <div className="hpHeader reveal">
        <div className="hpHeaderLeft">
          <p className="hpEyebrow">KOLEKSİYON</p>
          <h2 className="hpTitle">Atölyeden<br/><em>seçkin parçalar</em></h2>
        </div>
        <div className="hpHeaderRight">
          <p className="hpSubtitle">Ahşap, epoksi ve elde tamamlanan sınırlı üretim ürünler. Her parça tekil; benzeri sipariş üzerine hazırlanır.</p>
          <button className="hpViewAllBtn" onClick={()=>go('collection')}>Tüm Koleksiyonu Gör <b>↗</b></button>
        </div>
      </div>
      <div className="gridProducts homeProductsClean">
        {fallbackVisible.map(p=>(
          <ProductCard key={p.id} p={p} add={add} onDetail={goProduct} allReviews={allReviews} favorites={favorites} toggleFav={toggleFav}/>
        ))}
      </div>
    </section>
  );
}
function AtelierFeature({settings}){
  const pillars=[
    {num:'01', img:`${A}tags-canvas.webp`, alt:'Kumaş marka etiketi', title:'Tek parça ruh', desc:'Her ürün ahşabın damar yönüne göre yeniden yorumlanır; kalıptan değil, dokudan çıkar.'},
    {num:'02', img:`${A}products_hero-3.webp`, alt:'Ahşap epoksi ürün raf', title:'Elde tamamlanmış', desc:'Son yağ, balmumu ve yüzey finisajı makineden değil, ustanın elinden geçer.'},
    {num:'03', img:`${A}brand-tags-canvas.webp`, alt:'Paketleme etiketi', title:'Marka dili', desc:'Keten, mantar ve deri etiketlerle her teslimat ilk temas anından başlar.'},
  ];
  return (
    <section className="atelierFeature sectionSoft">
      <div className="atelierFeatureHeader reveal">
        <div>
          <p className="afEyebrow">{settings?.atelierEyebrow || 'ATÖLYEDEN'}</p>
          <h2 className="afTitle">{(settings?.atelierTitle || 'Sade çizgi,\nyumuşak anlatım.').split('\n').map((line,i)=><React.Fragment key={i}>{line}{i===0&&<br/>}</React.Fragment>)}</h2>
        </div>
        <p className="afDesc">{settings?.atelierDesc || 'Her Ravun parçası; ahşabın damarından epoksi akışına, son yağ bitişine kadar tek bir bütün olarak planlanır.'}</p>
      </div>
      <div className="atelierFeatureGrid reveal">
        {pillars.map(({num,img,alt,title,desc})=>(
          <article key={num}>
            <div className="afImgWrap"><img src={img} alt={alt} loading="lazy"/><span className="afNum">{num}</span></div>
            <div className="afBody"><h3>{title}</h3><p>{desc}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}
/* ── BRAND EXPERIENCE / V69-V70 ── */
function BrandExperience({go}){
  const pillars=[
    ['01','Atölyeden','Damar yönü, epoksi akışı ve son yağ dokusu tek bir parça gibi planlanır.'],
    ['02','Paketleme','Pamuklu koruma, kraft katman ve bakım kartı ile hediye hissi korunur.'],
    ['03','Malzeme Kütüphanesi','Ceviz, meşe ve zeytin tonları; yeşil, bal ve mineral epoksiyle eşleştirilir.'],
    ['04','Ürün Hikayesi','Her ürünün üretim notu, ölçüsü ve bakım önerisi satın alma kararını kolaylaştırır.']
  ];
  return (
    <section className="brandExperience section">
      <div className="brandExperienceCopy reveal">
        <p>RAVUN DİLİ</p>
        <h2>Sadece ürün değil,<br/><em>atölyeden çıkan bir iz.</em></h2>
        <span>Site genelinde daha sakin geçişler, daha büyük görsel alanları ve daha net bilgi bloklarıyla premium mağaza hissi güçlendirildi.</span>
        <button onClick={()=>go('story')}>Marka Hikayesini Aç ↗</button>
      </div>
      <div className="brandPillarGrid reveal">
        {pillars.map(([n,t,d])=><article key={n} className="brandPillar"><small>{n}</small><h3>{t}</h3><p>{d}</p></article>)}
      </div>
    </section>
  );
}
function EditionsSection({go}){
  const editions=[
    ['01','Signature','Ceviz, zümrüt epoksi ve Ravun sertifikasıyla tekil imza parçaları.','Koleksiyon'],
    ['02','Gift Mode','Not kartı, hediye paketi ve WhatsApp üzerinden özel teslim notu.','Hediye'],
    ['03','Archive','Satılmış parçalar ilham olarak kalır; benzeri özel siparişe açılır.','Arşiv'],
    ['04','Custom Brief','Ölçü, renk ve kullanım alanı konuşularak yeni parça tasarlanır.','Özel']
  ];
  return (
    <section className="editionsSection section">
      <div className="sectionHead reveal"><div><p>RAVUN SİSTEMİ</p><h2>Klasik mağaza değil,<br/>butik atölye deneyimi.</h2></div><button className="viewAllBtn" onClick={()=>go('contact')}>Özel Sipariş Konuş ↗</button></div>
      <div className="editionGrid reveal">
        {editions.map(([n,t,d,k])=><article key={n}><small>{n}</small><b>{k}</b><h3>{t}</h3><p>{d}</p></article>)}
      </div>
    </section>
  );
}
function AtelierJournal(){
  const notes=[
    ['Bugün','Yeni ceviz parçaları damar yönüne göre ayrıldı.'],
    ['Döküm','Zümrüt ton için daha sakin, açık pigment karışımı denendi.'],
    ['Paket','Keten sarım + deri etiketli hediye sunumu hazırlandı.']
  ];
  return <section className="atelierJournal sectionSoft"><div className="journalInner reveal"><div><p>ATÖLYE GÜNLÜĞÜ</p><h2>Marka canlı<br/><em>görünsün.</em></h2><span>Bu alan, ileride admin panelden değiştirilebilir mini üretim notları için hazırlandı.</span></div><div className="journalCards">{notes.map(([t,d])=><article key={t}><b>{t}</b><p>{d}</p></article>)}</div></div></section>;
}
function ArchivePreview({products, goProduct}){
  const archived=useMemo(()=>sortProductsForStore(products.filter(productIsArchive)).slice(0,4),[products]);
  if(!archived.length)return null;
  return (
    <section className="archivePreview sectionSoft">
      <div className="archiveShell reveal">
        <div className="archiveCopy">
          <p>RAVUN ARŞİV</p>
          <h2>Satılan parçalar<br/><em>ilham olarak kalır.</em></h2>
          <span>Satılan parçalar arşivde ilham olarak kalır; ürün detayında malzeme ve ölçü bilgisi görülebilir.</span>
        </div>
        <div className="archiveGrid">
          {archived.map(p=>{
            const st=productStatusInfo(p);
            return <article key={p.id} className={`archiveCard archiveCard-${st.tone}`}>
              <button className="archiveImg" onClick={()=>goProduct(p)} aria-label={`${p.title} arşiv detayını aç`}><img src={p.image} alt={p.title} loading="lazy"/><b>{st.label}</b></button>
              <div><small>{certificateNo(p)} · {p.category}</small><h3>{p.title}</h3><p>{p.repeatable || 'Benzeri özel siparişle hazırlanabilir.'}</p><a href={productStatusWa(p)} target="_blank" rel="noreferrer">Detayı konuş ↗</a></div>
            </article>;
          })}
        </div>
      </div>
    </section>
  );
}
function OrderTrustFlow({go}){
  const flow=[
    ['01','Parçayı seç','Ürün detayında ölçü, malzeme ve bakım bilgisini görürsün. İstersen favoriye alıp sonra dönebilirsin.'],
    ['02','Notunu ekle','Sepette hediye paketi, özel ölçü, teslim tarihi veya benzer üretim isteğini kısa not olarak girersin.'],
    ['03','WhatsApp onayı','Mesaj otomatik hazırlanır; fiyat, süre, ödeme ve teslim detayını netleştiririz.'],
    ['04','Atölye teslimi','Ürün hazırlanır, son fotoğraf kontrolü yapılır ve korumalı paketle kargoya verilir.']
  ];
  return (
    <section className="orderTrustFlow sectionSoft" aria-label="Ravun sipariş süreci">
      <div className="sectionHead reveal">
        <div><p>SİPARİŞ</p><h2>Kısa sipariş notu</h2></div>
        <button className="viewAllBtn" onClick={()=>go('contact')}>Sipariş İçin Yaz ↗</button>
      </div>
      <div className="trustFlowGrid reveal">
        {flow.map(([n,t,d])=><article key={n}><small>{n}</small><h3>{t}</h3><p>{d}</p></article>)}
      </div>
      <div className="trustFlowNote reveal"><b>Netlik önce gelir.</b><span>Ürün sepete eklense bile son onay WhatsApp üzerinden alınır; ölçü, hediye paketi ve teslim tarihi karışmaz.</span></div>
    </section>
  );
}
/* ── ANA SAYFA ── */
function Home({add, go, goProduct, products, allReviews, favorites, toggleFav, settings}){
  return <>
    <Hero go={go} settings={settings}/>
    <Marquee/>
    <HomeProducts add={add} go={go} goProduct={goProduct} products={products} allReviews={allReviews} favorites={favorites} toggleFav={toggleFav}/>
    {settings?.showStoryPreview!==false&&<StoryPreview go={go}/>}
    {settings?.showCta!==false&&<CTA go={go}/>}
  </>;
}
/* ── SAYFA GEÇİŞ ── */
function PageTransition({pageKey, children}){
  const [visible,setVisible]=useState(false);
  const [content,setContent]=useState(children);
  const [animKey,setAnimKey]=useState(pageKey);
  useEffect(()=>{
    if(pageKey===animKey){requestAnimationFrame(()=>setVisible(true));return;}
    setVisible(false);
    const t=setTimeout(()=>{setContent(children);setAnimKey(pageKey);requestAnimationFrame(()=>requestAnimationFrame(()=>setVisible(true)));},220);
    return()=>clearTimeout(t);
  },[pageKey]);
  useEffect(()=>{if(pageKey===animKey)setContent(children);},[children]);
  return <div className={`pageTransition ${visible?'pageVisible':''}`}>{content}</div>;
}
function parseInitialRoute(products){
  // Eski linkler (#product-5, #collection) hâlâ dolaşımda olabilir — pathname'e yönlendir.
  const legacyHash = window.location.hash.replace('#','');
  if(legacyHash && window.location.pathname==='/'){
    let legacyPage=null, legacyProduct=null;
    if(legacyHash.startsWith('product-')){
      const id=Number(legacyHash.replace('product-',''));
      const product=products.find(p=>p.id===id);
      if(product){ legacyPage='product'; legacyProduct=product; }
    } else if(['home','collection','story','contact','favorites'].includes(legacyHash)){
      legacyPage=legacyHash;
    }
    if(legacyPage){
      const newUrl=pagePath(legacyPage, legacyProduct);
      window.history.replaceState({page:legacyPage, productId:legacyProduct?.id||null}, '', newUrl);
      return {page:legacyPage, product:legacyProduct};
    }
  }
  const path = window.location.pathname.replace(/\/+$/,'') || '/';
  if(path==='/') return {page:'home', product:null};
  const productMatch = path.match(/^\/urun\/([^/]+)$/);
  if(productMatch){
    const id = Number(productMatch[1]);
    const product = products.find(p=>p.id===id);
    if(product) return {page:'product', product};
    return {page:'collection', product:null};
  }
  const slug = path.replace(/^\//,'');
  const page = SLUG_TO_PAGE[slug];
  if(page) return {page, product:null};
  return {page:'home', product:null};
}
class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={hasError:false};}
  static getDerivedStateFromError(){return {hasError:true};}
  componentDidCatch(err){console.error('Ravun render error:',err);}
  render(){
    if(this.state.hasError){
      const clearSiteCache = () => {
        try {
          // Hem eski düz anahtarları hem şifreli anahtarları temizle
          ['ravun:products','ravun:reviews','ravun:favorites','ravun:cart','ravun:orders','ravun:recent','ravun:siteSettings'].forEach(k => {
            localStorage.removeItem(k);
            try{ localStorage.removeItem(btoa('rv:'+k).replace(/=/g,'')); }catch{}
          });
          clearAdminSession();
        } catch {}
        window.location.href = '/';
      };
      return <div className="safeError"><h2>Bir şey ters gitti.</h2><p>Sayfayı yenileyip tekrar deneyin. Sorun devam ederse site önbelleğini temizleyin.</p><button onClick={()=>location.reload()}>Sayfayı Yenile</button><button onClick={clearSiteCache} className="safeErrorSecondary">Site Önbelleğini Temizle</button></div>;
    }
    return this.props.children;
  }
}
/* ── APP ── */
function App(){
  const [products,setProducts]=useState(()=>repairProducts(readStored('ravun:products', INITIAL_PRODUCTS)));
  const initialRoute = useMemo(()=>parseInitialRoute(products),[]);
  const [allReviews,setAllReviews]=useState(()=>normalizeReviews(readStored('ravun:reviews', INITIAL_REVIEWS)));
  const [favorites,setFavorites]=useState(()=>normalizeFavorites(readStored('ravun:favorites', []), products));
  const [page,setPage]=useState(initialRoute.page);
  const [currentProduct,setCurrentProduct]=useState(initialRoute.product);
  const [cart,setCart]=useState(()=>normalizeCart(readStored('ravun:cart', []), products));
  const [orders,setOrders]=useState(()=>normalizeOrders(readStored('ravun:orders', [])));
  const [recentIds,setRecentIds]=useState(()=>recentProductIds(readStored('ravun:recent', []), products));
  const [siteSettings,setSiteSettings]=useState(()=>normalizeSiteSettings(readStored('ravun:siteSettings', DEFAULT_SITE_SETTINGS)));
  const [drawer,setDrawer]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [navOpen,setNavOpen]=useState(false);
  const [toast,setToast]=useState('');
  const toastTimer=useRef(null);
  useEffect(()=>{
    // Overlay açıkken scroll kilitle — position:fixed KULLANMIYORUZ (iOS scroll kaybı)
    // Tüm overlay'ler (sepet, arama, hamburger menü, admin) burada tek noktadan
    // yönetilir; her biri kendi overflow kilidini ayrı yönetirse (önceki hata),
    // biri kapanınca diğeri hâlâ açıkken scroll kilidi erken açılabiliyordu.
    const shouldLock=Boolean(drawer || searchOpen || navOpen);
    if(shouldLock){
      document.body.classList.add('modal-open');
      document.body.style.overflow='hidden';
    } else {
      const t=setTimeout(()=>{
        document.body.classList.remove('modal-open');
        document.body.style.overflow='';
      },200);
      return()=>{clearTimeout(t);document.body.classList.remove('modal-open');document.body.style.overflow='';};
    }
    return()=>{document.body.classList.remove('modal-open');document.body.style.overflow='';};
  },[drawer,searchOpen,navOpen]);
  useEffect(()=>{
    try{document.body.classList.remove('modal-open');document.body.style.overflow='';document.body.style.touchAction='';}catch{}
    window.scrollTo({top:0,left:0,behavior:'auto'});
  },[]);
  const go=useCallback((target,product=null, push=true)=>{
    // v105: Sayfa değiştirirken açık kalmış overlay/scroll kilidi temizlenir.
    try{
      document.body.classList.remove('modal-open');
      document.body.style.overflow='';
      document.body.style.touchAction='';
    }catch{}
    setDrawer(false);
    setSearchOpen(false);
    if(push){
      const url = pagePath(target, target==='product'?product:null);
      window.history.pushState({page:target, productId:product?.id||null}, '', url);
    }
    const y=0;
    if(target==='product'&&product){setCurrentProduct(product);setPage('product');setTimeout(()=>window.scrollTo({top:y,left:0,behavior:'auto'}),0);return;}
    setPage(target);setCurrentProduct(null);setTimeout(()=>window.scrollTo({top:y,left:0,behavior:'auto'}),0);
  },[]);
  useEffect(()=>{
    const current = parseInitialRoute(products);
    window.history.replaceState({page:current.page, productId:current.product?.id||null}, '', window.location.href);
    const onPop=e=>{
      const st=e.state || parseInitialRoute(products);
      const product=st.productId?products.find(p=>p.id===st.productId):st.product;
      if((st.page||'home')==='product' && !product){ go('collection', null, false); return; }
      go(st.page||'home', product, false);
    };
    window.addEventListener('popstate',onPop);
    return()=>window.removeEventListener('popstate',onPop);
  },[go,products]);
  useAutosave('ravun:products', products);
  useAutosave('ravun:reviews', allReviews);
  useEffect(()=>{ if(currentProduct){ const fresh=products.find(p=>p.id===currentProduct.id); if(fresh && fresh!==currentProduct) setCurrentProduct(fresh); } },[products,currentProduct]);
  useAutosave('ravun:favorites', favorites);
  useAutosave('ravun:cart', cart);
  useAutosave('ravun:orders', orders);
  useAutosave('ravun:recent', recentIds);
  useAutosave('ravun:siteSettings', siteSettings);
  useEffect(()=>updateMeta(page,currentProduct),[page,currentProduct]);
  useEffect(()=>{ if(page==='product'&&currentProduct){ setRecentIds(ids=>[currentProduct.id,...(ids||[]).filter(id=>id!==currentProduct.id)].slice(0,8)); } },[page,currentProduct?.id]);
  useEffect(()=>{const nav=e=>go(e.detail);window.addEventListener('ravun:navigate',nav);return()=>window.removeEventListener('ravun:navigate',nav);},[go]);
  useEffect(()=>{
    const PLACEHOLDER_SVG=`data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320"><rect width="400" height="320" fill="#F0E8D8"/><rect x="0" y="0" width="400" height="4" fill="#C4876A" opacity="0.6"/><text x="200" y="140" text-anchor="middle" font-size="44" fill="#8B6534" opacity="0.18" font-family="Georgia,serif" font-style="italic" font-weight="500">R</text><text x="200" y="168" text-anchor="middle" font-size="11" fill="#8B6534" opacity="0.42" letter-spacing="0.22em" font-family="system-ui,sans-serif" font-weight="700">RAVUN ATÖLYE</text><text x="200" y="188" text-anchor="middle" font-size="10" fill="#B09070" opacity="0.5" letter-spacing="0.12em" font-family="system-ui,sans-serif">gorsel yuklenemedi</text></svg>')}`;
    const onImgError=e=>{
      const img=e.target;
      if(!img||img.dataset.ravunFallback==='1')return;
      const cur=img.src||'';
      const isAsset=cur.includes('/assets/');
      if(img.dataset.ravunFallback==='retry'||!isAsset||cur.includes('products_hero-1')){
        img.dataset.ravunFallback='1';
        img.src=PLACEHOLDER_SVG;
        img.style.objectFit='contain';
        img.style.padding='16px';
        img.alt=img.alt||'Ravun görseli';
        return;
      }
      img.dataset.ravunFallback='retry';
      img.src='/assets/products_hero-1.webp';
    };
    document.addEventListener('error',onImgError,true);
    return()=>document.removeEventListener('error',onImgError,true);
  },[]);
  useEffect(()=>{
    const run=()=>{
      document.querySelectorAll('.reveal.in').forEach(el=>el.classList.remove('in'));
      const els=[...document.querySelectorAll('.reveal')];
      const io=new IntersectionObserver(entries=>entries.forEach(e=>e.isIntersecting&&e.target.classList.add('in')),{threshold:0.04,rootMargin:'0px 0px -16px 0px'});
      els.forEach(el=>io.observe(el));
      return io;
    };
    let io=run();
    const t=setTimeout(()=>{io.disconnect();io=run();},300);
    return()=>{clearTimeout(t);io.disconnect();};
  },[page,currentProduct]);
  const add=p=>{
    if(!productCanBeOrdered(p)){
      safeOpen(productStatusWa(p));
      if(toastTimer.current)clearTimeout(toastTimer.current);
      setToast(`${p.title} için benzer üretim talebi açılıyor`);
      toastTimer.current=setTimeout(()=>setToast(''),2200);
      return;
    }
    const giftPrice=Number(p.giftWrap ? (p.giftPrice||0) : 0);
    const cartId = p.giftWrap ? `${p.id}-gift-${Date.now()}` : p.id;
    setCart(items=>p.giftWrap ? [...items,{...p,price:Number(p.price||0)+giftPrice,id:cartId,baseId:p.id,qty:1}] : (items.find(x=>x.id===p.id)?items.map(x=>x.id===p.id?{...x,qty:x.qty+1}:x):[...items,{...p,qty:1}]));
    if(toastTimer.current)clearTimeout(toastTimer.current);
    setToast(`${p.title} sepete eklendi`);
    toastTimer.current=setTimeout(()=>setToast(''),2200);
  };
  const dec=id=>setCart(items=>items.map(x=>x.id===id?{...x,qty:x.qty-1}:x).filter(x=>x.qty>0));
  const incQty=id=>setCart(items=>items.map(x=>x.id===id?{...x,qty:x.qty+1}:x));
  const createOrder=(customer={})=>{
    // cart snapshot - stale closure önlemi için anlık değer alınır
    const cartSnapshot=[...cart];
    const order={id:Date.now(),orderNo:makeOrderNo(),status:'pending',items:cartSnapshot.map(({id,title,price,qty,image,giftWrap,giftStyle,giftNote,giftRecipient,giftDelivery,selectedSize,selectedColor,certificateNo,status})=>({id,title,price,qty,image,giftWrap,giftStyle,giftNote,giftRecipient,giftDelivery,selectedSize,selectedColor,certificateNo,status})),customerName:customer.customerName||'',customerPhone:customer.customerPhone||'',note:customer.note||'',cargoCode:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    setOrders(os=>[order,...os]);
    if(toastTimer.current)clearTimeout(toastTimer.current);
    setToast(`${order.orderNo} sipariş taslağı oluşturuldu`);
    toastTimer.current=setTimeout(()=>setToast(''),2600);
    return order;
  };
  const toggleFav=id=>setFavorites(f=>Array.isArray(f)&&f.includes(id)?f.filter(x=>x!==id):[...(Array.isArray(f)?f:[]),id]);
  const goProduct=p=>go('product',p);
  const handleAdmin=()=>{ window.location.href='/admin'; };
  const pageContent=(
    <>
      {page==='home'&&<Home add={add} go={go} goProduct={goProduct} products={products} allReviews={allReviews} favorites={favorites} toggleFav={toggleFav} settings={siteSettings}/>}
      {page==='collection'&&<main className="page"><Collection add={add} standalone goProduct={goProduct} products={products} allReviews={allReviews} favorites={favorites} toggleFav={toggleFav} cart={cart} onCart={()=>setDrawer(true)} settings={siteSettings}/></main>}
      {page==='story'&&<StoryPage go={go}/>}
      {page==='contact'&&<ContactPage/>}
      {page==='favorites'&&<FavoritesPage products={products} favorites={favorites} add={add} goProduct={goProduct} allReviews={allReviews} toggleFav={toggleFav} go={go}/>}
      {page==='product'&&currentProduct&&<ProductDetailPage product={currentProduct} go={go} add={add} allReviews={allReviews} setAllReviews={setAllReviews} favorites={favorites} toggleFav={toggleFav} products={products} recentIds={recentIds} settings={siteSettings}/>}
      <Footer go={go} settings={siteSettings} onAdmin={handleAdmin}/>
    </>
  );
  return (
    <>
      <Header page={page} go={go} count={cart.reduce((s,x)=>s+x.qty,0)} favCount={favorites.length} onCart={()=>setDrawer(true)} onSearch={()=>setSearchOpen(true)} settings={siteSettings} onNavToggle={setNavOpen}/>
      <PageTransition pageKey={page+(currentProduct?.id||'')}>{pageContent}</PageTransition>
      <CartDrawer open={drawer} cart={cart} setOpen={setDrawer} inc={incQty} dec={dec} createOrder={createOrder} clearCart={()=>setCart([])} go={go}/>
      <SearchOverlay open={searchOpen} onClose={()=>setSearchOpen(false)} products={products} goProduct={goProduct}/>
      <BottomNav page={page} go={go} onSearch={()=>setSearchOpen(true)} onCart={()=>setDrawer(true)} favCount={favorites.length} cartCount={cart.reduce((s,x)=>s+x.qty,0)}/>
      {toast&&<div className="toast" role="status">✓ {toast}</div>}
    </>
  );
}
/* ── GİRİŞ NOKTASI: /admin ise yeni paneli, değilse siteyi mount et ──
   Admin paneli (TanStack Router + Tailwind) yalnızca /admin altına
   girildiğinde dynamic import ile yüklenir. Böylece:
   1) Admin bundle'ı (Tailwind reset + router + tüm admin sayfaları) site
      ziyaretçisinin indirdiği pakete hiç girmez.
   2) Admin'in Tailwind stil sıfırlaması yalnızca /admin'de uygulanır,
      site tasarımını etkilemez. */
const rootEl = document.getElementById('root');
if (window.location.pathname.startsWith('/admin')) {
  import('./admin/main.tsx')
    .then(({ mountAdminApp }) => mountAdminApp(rootEl))
    .catch(err => {
      console.error('[Ravun] Admin paneli yüklenemedi:', err);
      rootEl.innerHTML = '<div style="padding:2rem;font-family:system-ui,sans-serif;color:#7a2e2e">Admin paneli yüklenirken bir hata oluştu. Sayfayı yenileyin.</div>';
    });
} else {
  createRoot(rootEl).render(<ErrorBoundary><App/></ErrorBoundary>);
}
