# Ravun — Admin Panel Entegrasyonu: Şu Anki Durum

Bu proje, sitenin (`ravun-main`) eski gömülü admin panelini kaldırıp yeni
temayı (`shadcn-admin`) `/admin` altında entegre etme işinin devamında.
**Giriş noktası, Panel (Dashboard), Ürünler, Siparişler, Yorumlar VE Site
Ayarları sayfalarının hepsi çalışıyor ve gerçek veriyle besleniyor.**

## ✅ Bu oturumda yapılan kontrol (otomatik doğrulama)
Aşağıdaki "Site Ayarları" planı **zaten koddaydı** (önceki bir oturumda
tamamlanmış ama bu dosya güncellenmemişti) — `src/admin/features/settings/index.tsx`
tek dosyalık, 6 sekmeli (Hero / Koleksiyon & Atölye / Kategoriler /
Paketleme & Hediye / Instagram & Footer / Görünürlük) formun kendisi,
`src/admin/routes/_authenticated/settings.tsx` düz route dosyası olarak
duruyor, eski `profile/account/appearance/notifications/display` klasörleri
ve `sidebar-nav.tsx`/`content-section.tsx` zaten yoktu. Bu oturumda:
- `npm install` ✅ temiz.
- `npx vite build` ✅ hatasız (Site Ayarları dahil tüm sayfalar build'e giriyor).
- Tam `npm run build` (vite build + `scripts/prerender.mjs`) ✅ hatasız,
  3 sabit sayfa + 6 ürün sayfası önizleme üretti.
- `npx tsc --noEmit` çalıştırıldı — **Site Ayarları/admin veri katmanıyla
  ilgisi olmayan**, önceki şablondan kalma ~15 tip hatası var
  (`nav-group.tsx`, `sign-out-dialog.tsx`, `input-otp.tsx`, birkaç
  `*.test.ts(x)` dosyası — `vitest`/`axios`/`input-otp` paketleri kurulu
  değil). `vite build` bunları ayrıca tip kontrolünden geçirmediği için
  mevcut derlemeyi etkilemiyorlar; temiz bir proje isteniyorsa ayrı bir
  işte ele alınabilir.

## ✅ Tamamlanan (önceki oturumlardan)
1. Eski admin panel siteden temizce kaldırıldı (`src/main.jsx`).
2. Yeni panel projesi budandı (`src/admin/`) — Clerk, Users, Tasks, Apps,
   Chats, sahte Sign-up/OTP sayfaları ve test dosyaları kaldırıldı.
3. Paylaşılan veri/güvenlik modülü: `src/admin/lib/ravun-data.ts` — PIN
   doğrulama, oturum/kilitleme, ürün/sipariş/yorum/ayar mantığı site ile
   birebir aynı localStorage anahtarlarını kullanıyor.
4. Gerçek PIN girişi + hatalı deneme sayacı + kilitleme.
5. Route koruması — oturumsuz hiçbir `/admin/*` sayfası açılmaz.
6. Sidebar menüsü: Panel, Ürünler, Siparişler, Yorumlar, Site Ayarları.
7. Giriş noktası bağlandı (`src/main.jsx`) — `/admin` dynamic import ile
   yükleniyor, site tasarımını etkilemiyor.
8. **Ürünler sayfası** (`/admin/products`) — arama, kategori filtresi,
   tablo, çoklu seçim + toplu görünür/gizle/sil, sekmeli ekle/düzenle
   formu, görsel sıkıştırma.
9. **Siparişler sayfası** (`/admin/orders`) — arama, durum filtresi,
   tablo, detay dialog'u (görsel/beden/renk, müşteri ara/WhatsApp linki,
   durum/kargo kodu/not düzenleme), sil. Veri: `loadOrders()/saveOrders()`.
10. **Yorumlar sayfası** (`/admin/reviews`) — tüm ürünlerin yorumlarını tek
    tabloda birleştirir, arama, ürün/onay filtresi, tekil/toplu
    onayla/gizle/sil. Veri: `loadReviews()/saveReviews()`.

## ✅ Bu oturumda eklenen — Dashboard artık gerçek veriyle çalışıyor
### `src/admin/features/dashboard/`
- **`index.tsx`**: sahte "Analytics" sekmesi (clicks/bounce rate) ve
  işlevsiz "Download" butonu tamamen kaldırıldı. 4 KPI kartı gerçek
  veriyle: Toplam Ürün (+ görünür sayısı, `loadProducts()`), Bekleyen
  Sipariş (+ toplam sipariş sayısı, `loadOrders()`), Toplam Ciro
  (`orderTotal()` toplamı, `status !== 'cancelled'` hariç tutularak —
  Siparişler sayfasıyla aynı kural), Ortalama Puan (+ toplam yorum
  sayısı, `loadReviews()` düzleştirilip ortalama alınıyor). Başlık ve
  sekme adları Türkçeleştirildi (Panel / Genel Bakış), çünkü panelin geri
  kalanı zaten Türkçe.
- **`components/overview.tsx`**: sahte rastgele bar chart yerine, içinde
  bulunulan yılın aylarına göre gerçek ciro grafiği (`loadOrders()` +
  `orderTotal()`, `createdAt` alanına göre gruplanıyor, iptal hariç). O
  yıl hiç ciro yoksa boş grafik yerine bilgilendirici bir mesaj basıyor.
- **`components/recent-sales.tsx`**: sahte "Olivia Martin" vb. yerine
  gerçek son 5 sipariş (müşteri adı, sipariş no, durum etiketi, tutar).
  Sipariş yoksa boş durum mesajı gösteriyor.
- **`components/analytics.tsx`** ve **`analytics-chart.tsx`** silindi —
  **SIRA DOĞRU UYGULANDI**: önce `index.tsx`'teki import/JSX güncellendi,
  ondan SONRA bu iki dosya silindi.
- `npm install` + `npx vite build` ile doğrulandı — temiz geçti, hata/uyarı
  yok. (Not: bu ortamda `npm run build`'in ikinci adımı olan
  `scripts/prerender.mjs` ayrıca çalıştırılmadı; o script sadece ana site
  ürün sayfalarını statik önizleme için işliyor, admin panelini
  etkilemiyor — ama bir sonraki oturum tam `npm run build`'i de
  çalıştırıp doğrulamalı.)

## ✅ Tamamlandı — Site Ayarları (aşağıdaki plan birebir uygulanmış hâliyle
kodda duruyor, referans olarak bırakıldı)

Amaç: mevcut genel şablon (Profile/Account/Appearance/Notifications/
Display sekmeleri, `src/admin/features/settings/{profile,account,
appearance,notifications,display}/`) tamamen kaldırılıp yerine
`DEFAULT_SITE_SETTINGS`'e (bkz. `src/admin/lib/ravun-data.ts`, satır
~402-417) bağlı **tek sayfalık, sekmeli bir form** gelecek.

### Önerilen sekme/alan planı
`DEFAULT_SITE_SETTINGS`'teki tüm alanları kapsayacak şekilde:
1. **Hero**: `heroTag`, `heroLine1`, `heroLine2`, `heroCta`,
   `heroSecondCta`, `announcement` (üst duyuru şeridi — boşsa site hiç
   göstermiyor, bkz. `src/main.jsx` satır ~2251).
2. **Koleksiyon & Atölye**: `collectionEyebrow`, `collectionTitle`,
   `collectionDesc`, `atelierEyebrow`, `atelierTitle`, `atelierDesc`,
   `storyTitle`, `storyDesc`.
   - ⚠️ **ÖNEMLİ**: `collectionTitle` ve `atelierTitle` sitede `\n`'e göre
     bölünüp `<br/>` ile iki satır olarak basılıyor (bkz. `src/main.jsx`
     satır ~1697 ve ~2356, `.split('\n')`). Bu iki alan **Textarea**
     olmalı (Input değil), yoksa kullanıcı ikinci satırı giremez.
3. **Kategoriler**: `categorySettings` — `DEFAULT_CATEGORY_SETTINGS`
   (= `CATEGORY_DETAILS`) içindeki 6 sabit anahtar için (sırasıyla) `tum`,
   `duvar-rafi`, `bicak-standi`, `masaustu`, `sunum-tahtasi`, `paketleme`:
   her biri için `eyebrow` (Input), `title` (Input), `desc` (Textarea),
   `image` (Input + basit `<img>` önizleme, `onError` ile kırık görselde
   gizle). Sekme/bölüm başlıklarında `categoryLabelFromKey(key)` kullan
   (zaten `ravun-data.ts`'te var — "Tümü", "Duvar Rafı" vb. döndürüyor).
   Görsel yükleme/sıkıştırma (Ürünler'deki gibi) İSTENMEDİ, sadece metin
   path/URL alanı yeterli.
4. **Paketleme & Hediye**: `packageTitle`, `packageDesc` (Textarea —
   sitede `\n` bölme yok ama uzun metin, Textarea rahat), `giftTitle`,
   `giftDesc`, `giftPrice` (number input, TL).
5. **Instagram & Footer**: `instagram`, `instagramUrl`, `pinterestLabel`,
   `footerDesc`, `footerLocation`.
6. **Görünürlük** (`showXxx` switch'leri) — **DİKKAT, önemli bulgu**:
   `src/main.jsx` içinde grep ile kontrol edildi, sadece **`showStoryPreview`**
   ve **`showCta`** gerçekten sitede bir bölümü açıp kapatıyor (satır
   ~2467-2468). Diğer 8 tanesi (`showAtelierFeature`, `showEditions`,
   `showArchive`, `showPromise`, `showProcess`, `showTrustFlow`,
   `showBrandExperience`, `showJournal`) ya hiç çağrılmayan bir
   komponente bağlı (`AtelierFeature`, `EditionsSection`,
   `ArchivePreview`, `Process`, `BrandExperience` tanımlı ama JSX'te hiç
   kullanılmıyor) ya da (`showTrustFlow`, `showJournal`, `showPromise`)
   karşılığında hiçbir komponent bile yok. Yani bu 8 switch şu an
   sitede **hiçbir görsel etki yapmıyor**. Formda hepsini göstermek
   mantıklı (şema `DEFAULT_SITE_SETTINGS`'te var, ileride site tarafı
   bağlanabilir) ama **yanlış/var olmayan bir işlev iddia etmeden**:
   `showStoryPreview`/`showCta` için doğru açıklama yaz ("Ana sayfada
   Hikaye önizlemesini gösterir" / "Ana sayfa altındaki CTA bölümünü
   gösterir"), diğer 8'i ayrı bir grupta, "bu anahtarların şu an sitede
   karşılığı yok, ileride kullanılmak üzere duruyor" notuyla göster.

### Veri okuma/yazma
- Formu başlatmak için `useState(() => loadSiteSettings())` kullan —
  `loadSiteSettings()` zaten `normalizeSiteSettings()` uygulayıp eksik
  alanları dolduruyor, ayrı bir `useEffect` yüklemesine gerek yok (senkron
  localStorage okuması).
- Kaydet butonunda `saveSiteSettings(form)` ile **doğrudan** kaydet —
  `saveSiteSettings()` normalize ETMİYOR (diğer `saveProducts()` /
  `saveOrders()` ile aynı konvansiyon: normalize sadece okumada olur).

### Route değişikliği — **SIRA ÖNEMLİ** (Dashboard'ta bu oturumda doğru
uygulanan kural burada da geçerli)
1. **ÖNCE**: `src/admin/features/settings/index.tsx`'i komple yeniden
   yaz — artık `Outlet`/`SidebarNav` yerine yukarıdaki tek-sayfa/sekmeli
   formun kendisi olacak (Header/Main/ThemeSwitch/ConfigDrawer/
   ProfileDropdown + Tabs — `orders.tsx`/`products.tsx`'teki header
   deseniyle aynı, `<Search/>` yok).
2. **ÖNCE**: `src/admin/routes/_authenticated/settings.tsx` adında YENİ,
   DÜZ (klasörsüz) bir route dosyası oluştur — `orders.tsx` ile birebir
   aynı desen:
   ```tsx
   import { createFileRoute } from '@tanstack/react-router'
   import { Settings } from '@/features/settings'

   export const Route = createFileRoute('/_authenticated/settings')({
     component: Settings,
   })
   ```
3. **ONDAN SONRA** (yeni form + yeni route çalışır hale geldikten SONRA)
   şunları sil:
   - `src/admin/routes/_authenticated/settings/` klasörünün tamamı
     (`route.tsx`, `index.tsx`, `appearance.tsx`) — yeni düz
     `settings.tsx` bunun yerine geçiyor.
   - `src/admin/features/settings/profile/`, `account/`, `appearance/`,
     `notifications/`, `display/` klasörleri.
   - `src/admin/features/settings/components/sidebar-nav.tsx` ve
     `components/content-section.tsx` (artık kullanılmıyor).
   - Ters sıra (önce silip sonra route/form güncellemek) build'i kırar —
     Dashboard'ta yaşanan hatanın aynısı.
4. `routeTree.gen.ts` elle düzenlenmiyor — `vite build` (veya `vite dev`)
   sırasında `@tanstack/router-plugin` otomatik yeniden üretiyor
   (`vite.config.js`'teki `tanstackRouter(...)` eklentisi,
   `routesDirectory: "./src/admin/routes"`).
5. Bitince `npx vite build` (ideal olarak tam `npm run build`) ile
   doğrula, hata yoksa yeni bir zip teslim et.

## ❌ Hâlâ yapılmadı (Site Ayarları'ndan bağımsız, genel)
- **Tarayıcıda uçtan uca doğrulama hiç yapılmadı** — şimdiye kadarki her
  şey yalnızca `npm run build` / `vite build` seviyesinde doğrulandı. PIN
  ile giriş, ürün ekle/düzenle/sil, sipariş durumu değiştirme/kargo
  kodu/silme, yorum onayla/gizle/silme, Panel KPI/grafik akışlarının
  hiçbiri gerçek tarayıcıda tıklanarak test edilmedi.

## Kendi bilgisayarında denemek istersen
```
npm install
npm run dev
```
`/admin`'e girip PIN ile giriş yaptıktan sonra Panel, Ürünler, Siparişler,
Yorumlar, Site ayarları linklerinin hepsi açılıyor olmalı (ilk dördü
gerçek veriyle çalışıyor, Site ayarları hâlâ şablon).

PIN için `.env` dosyasına `VITE_ADMIN_PIN_HASH` gerekiyor — repo'da örnek
bir hash bırakıldı, gerçek PIN'in hash'ini üretmek için:
```
node -e "const c=require('crypto');console.log(c.createHash('sha256').update('ravun-local-admin-v2:PININIZ').digest('hex'))"
```
