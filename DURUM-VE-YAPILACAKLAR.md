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
`images` (ürün görselleri), `customers` (Google ile giriş yapan müşteriler), `rate_limits`. Tablolar ilk istekte otomatik
oluşturulur; ilk kurulumda `src/data/products.json` ürünleri ve örnek
yorumlar bir kez yüklenir.

### Ne nerede tutuluyor
| Veri | Yer |
|---|---|
| Ürünler, site ayarları, yorumlar, siparişler, iletişim mesajları, ürün görselleri | Sunucu (Postgres) |
| Sepet, favoriler, son bakılanlar | Ziyaretçinin tarayıcısı (kişisel, doğru yer) |
| Son katalog | Tarayıcı önbelleği (hızlı açılış için; her açılışta sunucudan yenilenir) |

### API uçları
- Müşteri hesabı: `GET /api/auth/google/start|callback`, `GET /api/me`,
  `PUT /api/me/favorites`, `GET /api/me/orders`, `POST /api/me/claim|logout|delete`
- Herkese açık: `GET /api/catalog`, `POST /api/orders`, `POST /api/orders/track`,
  `POST /api/reviews`, `POST /api/reviews/:id/helpful`, `POST /api/messages`,
  `GET /api/images/:id`, `GET /api/health`
- Admin (oturum çerezi + `X-Ravun-Admin: 1` başlığı gerekir):
  `/api/admin/login|logout|session`, `products`, `settings`, `orders/:id`,
  `reviews/:id`, `messages/:id`, `images`, `import`, `notify` (+ `notify/detect`, `notify/test`),
  `pin`, `backup`, `restore`

### Güvenlik
- PIN tarayıcı koduna gömülmüyor. Sunucu ortam değişkenindeki `ADMIN_PIN` geçerlidir;
  panelden (Güvenlik & yedek) değiştirilirse yeni PIN veritabanında scrypt ile saklanır
  ve öncelik kazanır. PIN değişince diğer cihazlardaki oturumlar kapanır.
  **Panel PIN'ini unutursanız:** Neon → SQL Editor:
  `DELETE FROM settings WHERE key = 'admin_auth';` → ortam değişkenindeki PIN yeniden geçerli olur.
- Oturum: imzalı, `HttpOnly` + `SameSite=Strict` çerez (8 saat).
- Hatalı PIN: IP başına 5 deneme, sonra 15 dakika kilit (sunucuda tutulur).
- Sipariş/yorum/mesaj gönderimi IP başına sınırlı (spam koruması).
- Sipariş fiyatları sunucuda güncel katalogdan hesaplanır; tarayıcıda
  değiştirilen fiyat siparişe yansımaz.
- Müşteri yorumları onaylanana kadar yayınlanmaz (Panel → Yorumlar).

## Sipariş yönetimi
- **Telegram bildirimi:** Panel → Bildirimler. @BotFather ile bot oluşturup token'ı
  yapıştırın, bota "merhaba" yazın, "Sohbeti bul" → Kaydet → "Deneme mesajı gönder".
  Yeni sipariş, yorum ve mesajlar anında Telegram'a düşer (her biri ayrı açılıp
  kapatılabilir). Token veritabanında saklanır, sitede/katalogda asla görünmez.
  Telegram'a ulaşılamazsa sipariş yine kaydedilir.
- **Hazır WhatsApp mesajları:** Sipariş detayında duruma göre şablon (sipariş alındı,
  ödeme bilgisi, onaylandı, üretimde, paketleniyor, kargoya verildi, teslim edildi,
  iptal). Mesaj düzenlenebilir; "Kaydet ve WhatsApp'ta gönder" hem durumu kaydeder
  hem mesajı açar. Kargo firması, takip adresi ve ödeme bilgisi Bildirimler
  sayfasından girilir.
- **Müşteri sipariş takibi:** `/siparis-takip` — sipariş numarası + telefonun son
  4 hanesiyle durum, adım adım geçmiş, kargo kodu ve kargo takip linki. Siparişi
  veren cihaz siparişi hatırlar (sepet sonrası "Siparişimi takip et" tek dokunuş).
  Müşterinin adı soyadı/telefonu/notu yanıtta yer almaz; IP başına sorgu sınırı var.
- **Yazdırma:** Sipariş listesinde ve detayında yazıcı simgesi → sipariş fişi
  (ürünler, hediye notları, toplam, not, paketleme kontrol kutuları).

## Ürün ve içerik yönetimi
- **Ürün kopyala:** Ürünler listesinde kopyala simgesi → tüm bilgiler ve fotoğraflar
  dolu form açılır; kopya yeni numarayla, gizli olarak ve aslının hemen arkasına eklenir.
- **Sitede gör:** Görünür ürünlerin sitedeki sayfasını yeni sekmede açar.
- **Kategoriler** (Site ayarları → Kategoriler): ekle, yeniden adlandır, sürükleyerek
  sırala (sitedeki filtre sırası), boşsa sil. Ad değişince o kategorideki ürünler
  aynı kayıtta güncellenir. Her kategorinin koleksiyon sayfası başlığı/görseli düzenlenebilir.
- **Ana sayfa slaytları** (Site ayarları → Hero): en fazla 6 slayt; görsel yükleme,
  metinler, telefonda görünen kısmı seçmek için odak noktası (bilgisayar/telefon
  önizlemeli), sürükleyerek sıralama, "Bu Parçayı Gör" butonunu bir ürüne bağlama.
- **Yorumlara yanıt** (Yorumlar → yanıt simgesi): hazır yanıtlar, sitede yorumun
  altında "Ravun Atölye yanıtladı" olarak görünür; onay bekleyen yorum aynı anda
  yayınlanabilir.

## Güvenlik, yedek ve raporlar
- **PIN değiştir** (Güvenlik & yedek): mevcut PIN ile onay; 6–12 rakam, 123456/000000
  gibi kolay PIN'ler reddedilir. "Sunucu PIN'ine dön" panel PIN'ini kaldırır.
- **Yedek:** tek tıkla JSON (ürünler, site ve sipariş mesaj ayarları, siparişler,
  yorumlar ve yanıtları, mesajlar). Fotoğrafların kendisi, Telegram token'ı ve PIN
  dosyaya yazılmaz. **Geri yükleme:** dosya özeti gösterilir, "GERİ YÜKLE" yazarak
  onaylanır, başlamadan önce mevcut veriler otomatik indirilir. Sınır 4 MB; daha
  büyük veride/sunucu taşırken `pg_dump` kullanın (fotoğraflar da dahil olur).
- **Satış raporları** (Raporlar): son 7/30/90 gün, bu ay, geçen ay, bu yıl, tümü.
  Ciro, sipariş, ortalama sepet, iptal oranı (önceki döneme göre değişimle), hediye
  paketi oranı, günlük/haftalık/aylık ciro grafiği, en çok satan ürünler, kategori
  dağılımı, durum dağılımı ve Excel'e (CSV) aktarma. İptaller ciroya dahil edilmez.

## Ravun'a özgü detaylar
- **Parça kimliği:** Ürün sayfasında lazerle kazınmış ahşap etiket görünümünde kart
  (parça no, ahşap, epoksi, ölçü, el işçiliği süresi, bitiş, "tek parça" mührü).
- **İkinci fotoğraf:** Ürün kartının üzerine gelince (fareli cihazlarda) galerideki
  ikinci fotoğraf görünür.
- **Sipariş takibi:** adımlar atölye simgeleriyle (fiş, onay mührü, epoksi dökümü,
  paket, kargo, ev); bulunulan adım hafifçe nabız atar.
- **Özel 404:** "Bu parça atölyeden çıkmamış"; kaldırılmış ürün linklerinde
  "Bu parça artık koleksiyonda değil" + "Benzerini sor" (WhatsApp). Arama motorlarına
  `noindex` bildirilir.
- **Panel:** kenar çubuğunda Ravun logosu, fotoğraflı giriş ekranı, günün selamı ve
  yapılacaklar ("1 sipariş onay bekliyor" gibi tıklanabilir), her sayfada "Siteyi aç".
- **Telefonda uygulama gibi:** Panel ana ekrana eklenebilir (`/admin.webmanifest`,
  "Ravun Panel" adı ve simgesi). Telefonda panelde bir kez öneri kartı çıkar.

## Görsel kimlik: Ceviz & Zümrüt
- Üç ana renk: ceviz (koyu kahve), zümrüt epoksi (yeşil), krem. Mercan yalnızca
  "Sipariş Ver", "İletişime Geç" ve favori kalbinde.
- Üst etiketler zümrüt ve başında ince reçine çizgisi; başlıklardaki italik vurgular
  reçine parıltılı zümrüt; yıldızlar bal rengi.
- Kayan yazı bandı akan zümrüt epoksi şeridi; footer sade koyu ceviz.
- Hepsi `src/style.css` sonundaki "CEVİZ & ZÜMRÜT" bloğunda; geri almak için o blok
  silinebilir.

## Müşteri hesabı: Google ile giriş
Müşteri isterse Google hesabıyla giriş yapar (şifre yok). Giriş zorunlu değil;
üye olmadan sipariş her zaman açık.
- **Hesabım** (`/hesabim`): siparişler ve durum adımları, favori sayısı, çıkış,
  hesabı silme (siparişler atölyede kalır, hesapla bağı kopar).
- **Favoriler** giriş yapınca hesaba kaydedilir; telefonda ve bilgisayarda aynı
  görünür (cihazdaki favoriler girişte hesaptakilerle birleşir).
- Giriş yapmışken verilen siparişler hesaba bağlanır; o cihazdan daha önce verilmiş
  siparişler de girişte otomatik bağlanır. Sepette ad ve telefon hazır gelir.
- Panelde sipariş detayında "Google hesabı: …" görünür.
- Akış tamamen sunucuda; sitede Google betiği çalışmaz, gizli anahtar tarayıcıya gitmez.
- `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` tanımlı değilse sitede hiçbir giriş
  düğmesi görünmez.

**Kurulum (bir kez):**
1. https://console.cloud.google.com → üstten yeni proje oluştur (ör. "Ravun").
2. **Google Auth Platform** (eski adıyla "OAuth consent screen") → Başlayın:
   uygulama adı "Ravun", destek e-postası, kitle **Harici (External)**.
3. **Kitle (Audience)** → uygulamayı **Yayınla (Publish app)** — "Test" modunda
   yalnızca eklenen test kullanıcıları giriş yapabilir. (Ad, e-posta ve profil
   fotoğrafı dışında izin istenmediği için Google incelemesi gerekmez.)
4. **İstemciler (Clients)** → İstemci oluştur → **Web uygulaması** →
   **Yetkili yönlendirme URI'leri**:
   - `https://ravun-tau.vercel.app/api/auth/google/callback`
   - `https://ravun-git-claude-clever-pascal-x6xs7m-cangcmz0-s-projects.vercel.app/api/auth/google/callback`
   - (kendi alan adınız olunca: `https://ALANADI/api/auth/google/callback`)
5. Verilen **İstemci kimliği** ve **İstemci gizli anahtarı**nı Vercel → Settings →
   Environment Variables'a `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` olarak
   (Production + Preview) ekle → Redeploy.

## Yasal metinler ve SEO
- **Yasal sayfalar** (`/yasal/...`, sitenin alt kısmında bağlantılar): Ön Bilgilendirme
  Formu, Mesafeli Satış Sözleşmesi, İade ve Değişim Koşulları, KVKK Aydınlatma Metni,
  Çerez Politikası. Satıcı bilgileri Panel → Site ayarları → **Yasal bilgiler**'den
  gelir (unvan, adres, vergi bilgisi zorunlu). Kişiye özel üretimlerde cayma hakkı
  istisnası metinlerde yer alır. Metinler genel şablondur; bir avukata kontrol ettirin.
- **Siparişte onay:** Sepette ön bilgilendirme formu ve mesafeli satış sözleşmesi onay
  kutusu zorunlu; onay zamanı ve metin sürümü siparişe kaydedilir (sunucu da onaysız
  siparişi reddeder).
- **Çerez bildirimi:** Yalnızca zorunlu çerez/depolama kullanıldığı için onay değil
  bilgilendirme gösterilir; "Tamam" sonrası tekrar çıkmaz.
- **Ürün sayfası:** satın alma alanında iade süresi satırı (koşullara bağlantılı).
- **Google:** ürün yapısal verisine iade politikası ve yorum puanı eklendi.
- **Site haritası** (`/sitemap.xml`) artık veritabanından üretilir; panelden eklenen
  ürünler de girer.

## İndirim kuponları ve fotoğraflı yorumlar

- **Kuponlar** (panel → Kuponlar): yüzde ya da sabit tutar indirim, en az sepet
  tutarı, kullanım sınırı, son gün ve açık/kapalı düğmesi. Müşteri kodu sepette
  "İndirim kodunuz var mı?" alanına yazar. Kod büyük/küçük harf ve Türkçe harf
  farkı gözetmez (`hoşgeldin10` = `HOSGELDIN10`). İndirim yalnızca sunucuda
  hesaplanır; sipariş kaydına `subtotal`, `discount`, `coupon` yazılır ve
  kullanım sayısı aynı işlemde artar. Panel ciroları ve raporlar indirimli
  tutarı kullanır; sipariş detayı, yazdırma fişi, Telegram bildirimi ve
  sipariş takip sayfası kuponu gösterir. Kuponlar yedeğe dahildir.
- **Fotoğraflı yorumlar**: müşteri yoruma en fazla 3 fotoğraf ekleyebilir.
  Fotoğraflar tarayıcıda 1280 px WebP'ye küçültülür (genelde 50–150 KB),
  sunucu tek fotoğrafı 900 KB ile sınırlar. Yorum gibi fotoğraflar da panelden
  onaylanana kadar sitede görünmez. Ürün sayfasında "Fotoğraflı" filtresi ve
  büyük görüntüleyici var.

## SEO kontrol listesi (Ekim 2026)

Var olanlar: 404 sayfası (noindex), üstte çağrı düğmeleri, iç bağlantılar
(ilgili ve son bakılan ürünler), sipariş sonrası teşekkür ekranı, ürün
sayfasında yol (breadcrumb) ve Google verisi, sayfa başına başlık/açıklama/
paylaşım görseli, robots.txt, otomatik site haritası, müşteri yorumları
(fotoğraflı), görsel alt metinleri, ürün/yorum/iade zengin sonuçları, KVKK ve
çerez metinleri.

Bu turda eklenenler:
- Ürün sayfasında 5 sık sorulan soru ve Google için FAQ verisi.
- Kurum verisinde telefon, e-posta ve adres (Site ayarları → Yasal bilgiler).
- İletişim sayfasında telefon, e-posta, adres ve "Haritada aç" bağlantısı.
- Masaüstünde sağ altta sabit WhatsApp düğmesi (mobilde alt menüde zaten var).
- **Google Search Console**: Site ayarları → Yasal bilgiler sekmesinde
  doğrulama dosyasının adı yazılır; site `/googleXXXX.html` adresinden
  doğru içeriği verir. Sonra Search Console'da `sitemap.xml` eklenir.

Sizin eklemeniz gerekenler: atölye/ekip fotoğrafları ve müşteri hikâyeleri
(Hikâye sayfasına), Google İşletme Profili.

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
- Sipariş durumu değişince müşteriye mesaj otomatik gitmiyor; panelde hazır
  WhatsApp mesajı tek tıkla gönderiliyor (WhatsApp Business API ücretli olduğu için).
- Online ödeme yok; ödeme WhatsApp üzerinden konuşuluyor.
- Telefonla (SMS kodu) giriş yok; SMS firması hesabı açılınca otomatik sipariş
  mesajlarıyla birlikte eklenecek.
- ETBİS kaydı (Ticaret Bakanlığı e-ticaret bilgi sistemi) site dışında yapılmalı.
