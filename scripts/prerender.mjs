// scripts/prerender.mjs
//
// NEDEN BU DOSYA VAR:
// Site tamamen client-side render (SSR yok). Ürün detay sayfasına paylaş
// butonuyla gidip linki WhatsApp/Facebook/Twitter'da paylaştığınızda, o
// platformların önizleme botları JavaScript ÇALIŞTIRMAZ — sadece HTML'i
// okur. index.html'in <head> kısmındaki meta etiketleri her zaman genel
// "Ravun | Ahşap ve Epoksi..." başlığını taşıdığı için, paylaşılan her
// ürün linki (satış kanalınız WhatsApp olduğu için özellikle önemli)
// her zaman aynı jenerik önizlemeyi gösteriyordu.
//
// Bu script `vite build`den SONRA çalışır ve dist/ içine, her ürün ve
// sabit sayfa (koleksiyon, hikaye, iletişim) için doğru <title>,
// description, og:*, twitter:* ve JSON-LD etiketleriyle STATİK bir
// index.html kopyası üretir: dist/urun/<id>/index.html,
// dist/koleksiyon/index.html vb. Vercel, rewrite kurallarından ÖNCE
// dosya sistemini kontrol ettiği için (bkz. vercel.json) bu statik
// dosyalar, tam URL eşleşince SPA fallback'inin önüne geçer — crawler
// doğru meta'yı anında görür, gerçek kullanıcı ise aynı JS/CSS
// bundle'ını yükleyip normal React uygulamasını çalıştırmaya devam eder.
//
// SINIR: Bu script sadece BUILD ANINDA bilinen ürünleri (src/data/products.json)
// işler. Admin panelinden eklenen/düzenlenen ürünler sadece o anki ziyaretçinin
// tarayıcısında (localStorage) yaşadığı için, yeni bir ürün eklendiğinde onun
// doğru paylaşım önizlemesine kavuşması için projenin yeniden build+deploy
// edilmesi gerekir. Gerçek bir backend/veritabanı eklenene kadar bu böyle kalır.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = (process.env.VITE_SITE_URL || 'https://ravun-tau.vercel.app').replace(/\/+$/, '');

function fail(msg) {
  console.error(`[prerender] ${msg}`);
  process.exit(1);
}

if (!existsSync(DIST)) fail('dist/ bulunamadı — önce `vite build` çalışmalı.');

const templatePath = path.join(DIST, 'index.html');
const template = readFileSync(templatePath, 'utf-8');

const products = JSON.parse(readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf-8'));

// ── Yardımcılar (main.jsx'teki mantıkla birebir aynı kalsın diye buraya da yazıldı) ──
function absoluteUrl(p = '/') {
  return `${SITE_URL}${p.startsWith('/') ? '' : '/'}${p}`;
}
function certificateNo(product) {
  const id = Number(product?.id) || 1;
  return product?.certificateNo || `RVN-${String(id).padStart(3, '0')}`;
}
function pagePathFor(id) {
  return `/urun/${id}`;
}
function metaDescriptionForProduct(product) {
  const raw = `${product.title} — ${product.desc} Parça No: ${certificateNo(product)}. Ravun atölyesinde özel üretim ahşap ve epoksi tasarım.`;
  return raw.length > 300 ? raw.slice(0, 300) : raw;
}
function isSold(product) {
  return /satil/i.test(String(product?.status || ''));
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) { return escapeHtml(s); }
// GÜVENLİK: JSON.stringify çıktısı doğrudan bir <script> etiketinin içine
// gömülüyor. İçerikte (ürün başlığı/açıklaması gibi admin girişli metinlerden
// gelebilecek) "</script>" veya "<!--" geçerse, tarayıcının HTML parser'ı script
// etiketini erken kapatıp ardından gelen her şeyi normal HTML/script olarak
// yorumlayabilir (klasik "script içine JSON gömme" açığı). '<' karakterini
// \u003c olarak kaçışlamak JSON'un anlamını değiştirmeden bu riski kapatır.
function jsonForScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function structuredDataForProduct(product) {
  const org = {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: 'Ravun', url: absoluteUrl('/'), logo: absoluteUrl('/assets/ravun-logo.webp'),
    sameAs: ['https://instagram.com/ravun.atolye'],
  };
  const images = (product.gallery?.length ? product.gallery : [product.image]).slice(0, 6).map(absoluteUrl);
  const productLd = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: product.title,
    description: metaDescriptionForProduct(product),
    image: images,
    sku: certificateNo(product),
    brand: { '@type': 'Brand', name: 'Ravun' },
    category: product.category,
    material: (product.materials || []).join(', '),
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(pagePathFor(product.id)),
      priceCurrency: 'TRY',
      price: String(Number(product.price || 0)),
      availability: isSold(product) ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ravun', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Koleksiyon', item: absoluteUrl('/koleksiyon') },
      { '@type': 'ListItem', position: 3, name: product.title, item: absoluteUrl(pagePathFor(product.id)) },
    ],
  };
  return [org, productLd, breadcrumb];
}

function structuredDataForSite() {
  return [
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'Ravun', url: absoluteUrl('/'), logo: absoluteUrl('/assets/ravun-logo.webp'), sameAs: ['https://instagram.com/ravun.atolye'] },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Ravun', url: absoluteUrl('/'), potentialAction: { '@type': 'SearchAction', target: absoluteUrl('/koleksiyon?q={search_term_string}'), 'query-input': 'required name=search_term_string' } },
  ];
}

// ── HTML üretimi: dist/index.html'i şablon alıp <head> içindeki meta bloklarını değiştirir ──
function renderPage({ title, description, url, image, type = 'website', structuredData, priceMeta }) {
  let html = template;
  // GÜVENLİK/DOĞRULUK: String.replace(regex, "...") kullanıldığında replacement
  // string'i içinde "$&", "$$", "$1" gibi özel kalıplar varsa .replace() bunları
  // harfiyen metin olarak değil, ÖZEL DEĞİŞİM KALIBI olarak yorumlar. Ürün başlığı
  // veya açıklamasında "$" geçen bir metin (örn. fiyat, dövizli not) bu yüzden
  // önizleme HTML'ini sessizce bozabilirdi. Tüm replace çağrılarını fonksiyon
  // olarak vermek ($ kalıplarını devre dışı bırakır) bu riski kapatır.
  const rep = (str) => () => str;

  html = html.replace(/<title>.*?<\/title>/s, rep(`<title>${escapeHtml(title)}</title>`));

  html = html.replace(
    /<meta name="description" content="[^"]*"\/>/,
    rep(`<meta name="description" content="${escapeAttr(description)}"/>`)
  );

  html = html.replace(
    /<link rel="canonical" href="[^"]*"\/>/,
    rep(`<link rel="canonical" href="${escapeAttr(url)}"/>`)
  );

  html = html.replace(/<meta property="og:type" content="[^"]*"\/>/, rep(`<meta property="og:type" content="${type}"/>`));
  html = html.replace(/<meta property="og:url" content="[^"]*"\/>/, rep(`<meta property="og:url" content="${escapeAttr(url)}"/>`));
  html = html.replace(/<meta property="og:title" content="[^"]*"\/>/, rep(`<meta property="og:title" content="${escapeAttr(title)}"/>`));
  html = html.replace(/<meta property="og:description" content="[^"]*"\/>/, rep(`<meta property="og:description" content="${escapeAttr(description)}"/>`));
  html = html.replace(/<meta property="og:image" content="[^"]*"\/>/, rep(`<meta property="og:image" content="${escapeAttr(image)}"/>`));
  // Ürün görselleri og-image.jpg (1200x630) ile aynı orana sahip olmayabilir —
  // yanlış oranla sabit width/height vermek önizlemeyi bozar, o yüzden ürün
  // sayfalarında bu iki satırı kaldırıyoruz; ana sayfada olduğu gibi kalıyor.
  if (type === 'product') {
    html = html.replace(/\s*<meta property="og:image:width" content="[^"]*"\/>\n/, '\n');
    html = html.replace(/\s*<meta property="og:image:height" content="[^"]*"\/>\n/, '\n');
    if (priceMeta) {
      html = html.replace(
        '<meta property="og:site_name" content="Ravun Atölye"/>',
        rep(`<meta property="og:site_name" content="Ravun Atölye"/>\n  <meta property="product:price:amount" content="${escapeAttr(priceMeta.amount)}"/>\n  <meta property="product:price:currency" content="TRY"/>`)
      );
    }
  }

  html = html.replace(/<meta name="twitter:title" content="[^"]*"\/>/, rep(`<meta name="twitter:title" content="${escapeAttr(title)}"/>`));
  html = html.replace(/<meta name="twitter:description" content="[^"]*"\/>/, rep(`<meta name="twitter:description" content="${escapeAttr(description)}"/>`));
  html = html.replace(/<meta name="twitter:image" content="[^"]*"\/>/, rep(`<meta name="twitter:image" content="${escapeAttr(image)}"/>`));

  const ldJson = `<script type="application/ld+json" id="ravun-structured-data">${jsonForScript(structuredData)}</script>`;
  html = html.replace('</head>', rep(`  ${ldJson}\n</head>`));

  return html;
}

function writePage(relPath, html) {
  const outDir = path.join(DIST, relPath);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
  console.log(`[prerender] yazıldı: dist/${relPath}/index.html`);
}

// ── Sabit sayfalar ──
const STATIC_PAGES = [
  { slug: 'koleksiyon', title: 'Koleksiyon | Ravun', description: 'Ravun koleksiyonu: ahşap, epoksi ve özel üretim el yapımı tasarım parçaları.' },
  { slug: 'hikaye', title: 'Hikaye | Ravun', description: 'Ravun atölyesinin ahşap, epoksi ve el işçiliği hikayesi.' },
  { slug: 'iletisim', title: 'İletişim | Ravun', description: 'Ravun ile özel sipariş, teklif ve atölye iletişimi.' },
];

const homeImage = absoluteUrl('/og-image.jpg');
for (const p of STATIC_PAGES) {
  const url = absoluteUrl(`/${p.slug}`);
  const html = renderPage({
    title: p.title,
    description: p.description,
    url,
    image: homeImage,
    type: 'website',
    structuredData: structuredDataForSite(),
  });
  writePage(p.slug, html);
}

// ── Ürün sayfaları ──
let count = 0;
for (const product of products) {
  if (product?.visible === false) continue; // gizli ürünler için sayfa üretme
  const url = absoluteUrl(pagePathFor(product.id));
  const html = renderPage({
    title: `${product.title} | Ravun`,
    description: metaDescriptionForProduct(product),
    url,
    image: absoluteUrl(product.image),
    type: 'product',
    structuredData: structuredDataForProduct(product),
    priceMeta: { amount: String(Number(product.price || 0)) },
  });
  writePage(`urun/${product.id}`, html);
  count++;
}

console.log(`[prerender] tamam — ${STATIC_PAGES.length} sabit sayfa + ${count} ürün sayfası üretildi.`);
