# Ravun — Sistem Durumu ve Kurulum

## Mimari (Ekim 2026)

Site artık gerçek bir sunucu + veritabanı ile çalışıyor. Önceden tüm veriler
her ziyaretçinin kendi tarayıcısında (localStorage) duruyordu; panelde yapılan
değişiklikleri müşteriler görmüyor, müşteri siparişleri panele ulaşmıyordu.

```
Tarayıcı (site + /admin paneli)
        │  fetch /api/...
        ▼
api/index.js            ← Vercel fonksiyonu (yalnızca server/http.js'i çağırır)
server/standalone.js    ← VPS'te aynı kodu çalıştıran Node sunucusu
        │
server/http.js          ← Node (req,res) adaptörü
server/routes.js        ← tüm API uçları
server/auth.js          ← PIN doğrulama, HttpOnly oturum çerezi, istek sınırlama
server/sanitize.js      ← gelen her verinin temizlenmesi
server/db.js            ← PostgreSQL, tablolar ilk istekte otomatik kurulur
        │
PostgreSQL (Vercel'de Neon, VPS'te kendi Postgres'iniz)
```

Veritabanında: `products`, `settings`, `orders`, `reviews`, `messages`,
`images` (ürün görselleri), `rate_limits`. Tablolar ilk istekte otomatik
oluşturulur; ilk kurulumda `src/data/products.json` ürünleri ve örnek
yorumlar bir kez yüklenir.

### Ne nerede tutuluyor
| Veri | Yer |
|---|---|
| Ürünler, site ayarları, yorumlar, siparişler, iletişim mesajları, ürün görselleri | Sunucu (Postgres) |
| Sepet, favoriler, son bakılanlar | Ziyaretçinin tarayıcısı (kişisel, doğru yer) |
| Son katalog | Tarayıcı önbelleği (hızlı açılış için; her açılışta sunucudan yenilenir) |

### API uçları
- Herkese açık: `GET /api/catalog`, `POST /api/orders`, `POST /api/reviews`,
  `POST /api/reviews/:id/helpful`, `POST /api/messages`, `GET /api/images/:id`,
  `GET /api/health`
- Admin (oturum çerezi + `X-Ravun-Admin: 1` başlığı gerekir):
  `/api/admin/login|logout|session`, `products`, `settings`, `orders/:id`,
  `reviews/:id`, `messages/:id`, `images`, `import`

### Güvenlik
- PIN artık tarayıcı koduna gömülmüyor; yalnızca sunucu ortam değişkeninde.
- Oturum: imzalı, `HttpOnly` + `SameSite=Strict` çerez (8 saat).
- Hatalı PIN: IP başına 5 deneme, sonra 15 dakika kilit (sunucuda tutulur).
- Sipariş/yorum/mesaj gönderimi IP başına sınırlı (spam koruması).
- Sipariş fiyatları sunucuda güncel katalogdan hesaplanır; tarayıcıda
  değiştirilen fiyat siparişe yansımaz.
- Müşteri yorumları onaylanana kadar yayınlanmaz (Panel → Yorumlar).

## Vercel kurulumu (bir kez)

1. **Veritabanı ekle:** Vercel → proje → **Storage** → **Create Database** →
   **Neon (Postgres)** → projeye bağla. `DATABASE_URL` otomatik eklenir.
2. **PIN tanımla:** Settings → Environment Variables →
   `ADMIN_PIN` = en az 6 haneli, tahmin edilmesi zor bir PIN.
   (Eski `VITE_ADMIN_PIN_HASH` değişkeni varsa silin; artık kullanılmıyor.
   Silinmezse sunucu geriye dönük olarak onu da PIN hash'i kabul eder.)
3. İsteğe bağlı: `SESSION_SECRET` = uzun rastgele metin.
   (Sunucu bölgesi `vercel.json` içinde Frankfurt — `fra1` — olarak ayarlı;
   Neon veritabanını da Frankfurt'ta oluşturun.)
4. **Redeploy** edin. Kontrol: `https://SITE/api/health` →
   `{"ok":true,"admin":true}` dönmeli.
5. `/admin`'e PIN ile girin. Daha önce panelde bu tarayıcıda değişiklik
   yaptıysanız Panel sayfasında **"Bu tarayıcıda eski kayıtlar bulundu"**
   kartı çıkar → **Sunucuya aktar**.

## VPS'e taşıma

Aynı kod, değişiklik gerekmez:
```
# Node 20+ ve PostgreSQL kurulu olmalı
git clone … && cd ravun
npm ci
cp .env.example .env      # DATABASE_URL ve ADMIN_PIN'i doldurun
npm run build
npm start                 # PORT varsayılan 3000
```
`npm start` hem siteyi (`dist/`) hem `/api`'yi tek süreçte sunar ve
`vercel.json`'daki güvenlik başlıklarını aynen uygular. Önüne Nginx/Caddy ile
HTTPS koyun (`X-Forwarded-Proto` ve `X-Forwarded-For` başlıklarını iletin).
Sürekli çalışması için `pm2` ya da systemd servisi kullanın.

Veriyi Neon'dan VPS'e taşımak: `pg_dump "$NEON_URL" | psql "$VPS_URL"`.

## Yerel geliştirme
```
cp .env.example .env      # DATABASE_URL (yerel Postgres) ve ADMIN_PIN
npm install
npm run dev               # site + panel + API birlikte (Vite içinde)
```

## Eski listeden kapananlar
- ✅ Admin'deki ~15 TypeScript hatası giderildi (`npx tsc --noEmit -p tsconfig.app.json` temiz).
- ✅ Site Ayarları > Görünürlük: 10 anahtarın hepsi artık ana sayfada bir bölümü
  açıp kapatıyor (önceden 8'inin sitede karşılığı yoktu).
- ✅ Tarayıcıda uçtan uca test: PIN girişi ve kilit; ürün ekleme (görsel
  yüklemeli), düzenleme, gizleme, silme; sipariş durumu, kargo kodu, not,
  iptal, silme; yorum onaylama; mesajlar; site ayarları; Panel kartları ve
  grafik; eski tarayıcı verisini aktarma; müşteri tarafında sipariş, yorum
  ve iletişim formu. Gerçek Postgres ile, `npm start` üzerinden denendi.
  Vercel + Neon üzerinde ilk kurulumdan sonra `/api/health` ile doğrulanmalı.

## Bilinen eksikler / sonraki adımlar
- ✅ Admin panelinde sürükle-bırak: ürün sırası (tutamaçtan sürükleyerek; fare,
  dokunmatik ve klavye) ve ürün fotoğrafları (dosyaları sürükleyip bırakarak yükleme,
  sürükleyerek sıralama, kapak yapma, kaldırma).
- `scripts/prerender.mjs` SEO önizleme sayfalarını hâlâ `src/data/products.json`'dan
  üretiyor. Panelden eklenen yeni ürünler normal çalışır ama paylaşım
  önizlemesi (og:image vb.) genel site bilgisini gösterir.
- Sipariş durumu değişince müşteriye otomatik bildirim (e-posta/WhatsApp) yok.
- Online ödeme yok; ödeme WhatsApp üzerinden konuşuluyor.
- Kök dizindeki `style.css` sitede kullanılmıyor (asıl dosya `src/style.css`).
