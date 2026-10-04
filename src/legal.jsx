// ── YASAL METİNLER ──
// 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği ile 6698 sayılı KVKK
// kapsamında sitede bulunması gereken metinler. Satıcı bilgileri panelden
// (Site ayarları → Yasal bilgiler) gelir. Metinler genel şablondur; işletmeye
// özel durumlar için bir hukukçuya kontrol ettirilmesi önerilir.

export const LEGAL_DOCS = [
  ['on-bilgilendirme-formu', 'Ön Bilgilendirme Formu'],
  ['mesafeli-satis-sozlesmesi', 'Mesafeli Satış Sözleşmesi'],
  ['iade-ve-degisim', 'İade ve Değişim Koşulları'],
  ['kvkk-aydinlatma-metni', 'KVKK Aydınlatma Metni'],
  ['cerez-politikasi', 'Çerez Politikası'],
];
export const LEGAL_SLUGS = LEGAL_DOCS.map(([s]) => s);
export const legalTitle = (slug) => LEGAL_DOCS.find(([s]) => s === slug)?.[1] || 'Yasal bilgiler';

function seller(settings, contact) {
  const s = settings || {};
  return {
    name: s.sellerName || 'Ravun Atölye',
    address: s.sellerAddress || s.footerLocation || 'Beykoz, İstanbul',
    tax: s.sellerTax || '',
    phone: s.sellerPhone || contact.phone,
    email: s.sellerEmail || contact.email,
    kep: s.sellerKep || '',
    mersis: s.sellerMersis || '',
    returnDays: Number(s.returnDays) >= 14 ? Number(s.returnDays) : 14,
    shipping: s.shippingNote || 'Kargo ücreti ve teslimat koşulları sipariş onayında alıcıya yazılı olarak bildirilir.',
  };
}

function SellerTable({ s }) {
  const rows = [
    ['Unvan', s.name], ['Adres', s.address], ['Vergi dairesi / no', s.tax], ['Telefon', s.phone],
    ['E-posta', s.email], ['KEP adresi', s.kep], ['MERSİS no', s.mersis],
  ].filter(([, v]) => v);
  return <dl className="lgSeller">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

const Exceptions = () => (
  <ul>
    <li>Tüketicinin istekleri veya kişisel ihtiyaçları doğrultusunda hazırlanan ürünler (ölçü, renk, ahşap/epoksi seçimi, yazı veya isim gibi kişiye özel üretimler),</li>
    <li>Ambalajı açılmış, kullanılmış veya iade edilemeyecek ölçüde zarar görmüş ürünler,</li>
    <li>Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinde sayılan diğer haller.</li>
  </ul>
);

function OnBilgilendirme({ s, go }) {
  return <>
    <h2>1. Satıcı bilgileri</h2>
    <SellerTable s={s}/>
    <h2>2. Ürünün temel nitelikleri ve fiyatı</h2>
    <p>Siparişe konu ürünlerin adı, malzemesi, ölçüsü, seçilen seçenekleri (boyut, renk, hediye paketi), adedi ve vergiler dahil toplam satış fiyatı sipariş adımında sepet özetinde gösterilir. Her ürün el yapımıdır; doğal ahşabın damar ve ton yapısı fotoğraftakinden küçük farklılıklar gösterebilir.</p>
    <h2>3. Ödeme</h2>
    <p>Sitede kart bilgisi alınmaz. Sipariş kaydedildikten sonra satıcı alıcıyla iletişime geçer; ödeme banka havalesi/EFT veya taraflarca kararlaştırılan başka bir yöntemle yapılır. Ödeme alınmadan üretim ve gönderim başlamaz.</p>
    <h2>4. Teslimat</h2>
    <p>Ürünler, ürün sayfasında belirtilen üretim süresi sonunda alıcının bildirdiği adrese kargo ile gönderilir. Teslim süresi, kişiye özel üretimler dışında sipariş onayından itibaren 30 günü geçemez. {s.shipping}</p>
    <h2>5. Cayma hakkı</h2>
    <p>Alıcı, ürünü teslim aldığı günden itibaren <b>{s.returnDays} gün</b> içinde hiçbir gerekçe göstermeden ve cezai şart ödemeden sözleşmeden cayabilir. Cayma bildirimi bu süre içinde e-posta ({s.email}) veya telefon/WhatsApp ({s.phone}) ile yazılı olarak yapılır. Satıcı, bildirimin ulaşmasından itibaren 14 gün içinde ödenen tutarı alıcının ödeme yöntemine uygun şekilde iade eder.</p>
    <p>Aşağıdaki ürünlerde cayma hakkı kullanılamaz:</p>
    <Exceptions/>
    <p>Ayrıntılar için <button type="button" className="linkBtn" onClick={() => go('legal:iade-ve-degisim')}>İade ve Değişim Koşulları</button>.</p>
    <h2>6. Şikâyet ve itiraz</h2>
    <p>Alıcı, şikâyet ve itirazlarını Ticaret Bakanlığınca her yıl belirlenen parasal sınırlar dahilinde yerleşim yerindeki veya işlemin yapıldığı yerdeki Tüketici Hakem Heyetine ya da Tüketici Mahkemesine iletebilir.</p>
  </>;
}

function MesafeliSatis({ s, go }) {
  return <>
    <h2>Madde 1 – Taraflar</h2>
    <p><b>Satıcı:</b></p>
    <SellerTable s={s}/>
    <p><b>Alıcı:</b> Sipariş sırasında adını, soyadını ve telefonunu bildiren, siparişi elektronik ortamda onaylayan kişi.</p>
    <h2>Madde 2 – Konu</h2>
    <p>İşbu sözleşmenin konusu, alıcının satıcıya ait internet sitesi üzerinden elektronik ortamda siparişini verdiği, nitelikleri ve satış fiyatı sipariş özetinde belirtilen ürünün satışı ve teslimi ile ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri gereğince tarafların hak ve yükümlülüklerinin belirlenmesidir.</p>
    <h2>Madde 3 – Ürün, fiyat ve ödeme</h2>
    <p>Ürünün türü, seçenekleri, adedi ve vergiler dahil satış fiyatı sipariş özetinde yer alır. Ödeme, sipariş kaydından sonra satıcının bildirdiği banka hesabına havale/EFT ile veya taraflarca kararlaştırılan yöntemle yapılır.</p>
    <h2>Madde 4 – Teslimat</h2>
    <p>Ürün, ürün sayfasında belirtilen üretim süresi sonunda alıcının bildirdiği adrese kargo ile teslim edilir. Teslimat, kişiye özel üretimler dışında sipariş onayından itibaren en geç 30 gün içinde yapılır. {s.shipping} Ürün, kargo firmasına teslim edildikten sonra alıcıya ulaşana kadar oluşan hasarlardan satıcı sorumludur; alıcı hasarlı paketi kargo görevlisine tutanak tutturarak teslim almamalıdır.</p>
    <h2>Madde 5 – Cayma hakkı</h2>
    <p>Alıcı, ürünü teslim aldığı tarihten itibaren {s.returnDays} gün içinde gerekçe göstermeksizin cayma hakkını kullanabilir. Cayma bildirimi satıcıya yazılı olarak (e-posta: {s.email}) veya telefon/WhatsApp ({s.phone}) ile yapılır. Satıcı, cayma bildiriminin kendisine ulaştığı tarihten itibaren 14 gün içinde toplam bedeli iade eder. Alıcı, cayma bildiriminden itibaren 10 gün içinde ürünü satıcıya geri gönderir.</p>
    <h2>Madde 6 – Cayma hakkının istisnaları</h2>
    <Exceptions/>
    <h2>Madde 7 – Ayıplı ürün</h2>
    <p>Teslim edilen üründe ayıp bulunması halinde alıcı, 6502 sayılı Kanun'un 11. maddesindeki seçimlik haklarını (bedel iadesi, indirim, ücretsiz onarım veya değiştirme) kullanabilir. Doğal ahşabın damar, renk ve doku farklılıkları ile el işçiliğinden kaynaklanan küçük izler ayıp sayılmaz.</p>
    <h2>Madde 8 – Uyuşmazlıkların çözümü</h2>
    <p>Uyuşmazlıklarda Ticaret Bakanlığınca ilan edilen parasal sınırlar dahilinde Tüketici Hakem Heyetleri, bu sınırları aşan durumlarda Tüketici Mahkemeleri yetkilidir.</p>
    <h2>Madde 9 – Yürürlük</h2>
    <p>Alıcı, siparişi tamamlamadan önce <button type="button" className="linkBtn" onClick={() => go('legal:on-bilgilendirme-formu')}>Ön Bilgilendirme Formu</button>'nu ve işbu sözleşmeyi okuyup elektronik ortamda onayladığını kabul eder. Sözleşme, siparişin tamamlanmasıyla yürürlüğe girer.</p>
  </>;
}

function Iade({ s }) {
  return <>
    <p>Atölyemizde her parça elde üretilir. Memnun kalmadığınız bir durum olursa aşağıdaki adımlarla iade veya değişim yapabilirsiniz.</p>
    <h2>Süre</h2>
    <p>Ürünü teslim aldığınız günden itibaren <b>{s.returnDays} gün</b> içinde cayma hakkınızı kullanabilirsiniz.</p>
    <h2>İade edilemeyen ürünler</h2>
    <Exceptions/>
    <h2>Nasıl iade edilir?</h2>
    <ol>
      <li>İade talebinizi sipariş numaranızla birlikte e-posta ({s.email}) veya WhatsApp ({s.phone}) üzerinden iletin.</li>
      <li>Ürünü, mümkünse orijinal ambalajı ve koruyucu dolgusuyla, bildirimden itibaren 10 gün içinde kargoya verin.</li>
      <li>Ürün atölyeye ulaşıp kontrol edildikten sonra, cayma bildiriminizden itibaren en geç 14 gün içinde ödemeniz iade edilir.</li>
    </ol>
    <h2>Hasarlı teslimat</h2>
    <p>Paket hasarlı ulaşırsa kargo görevlisine tutanak tutturun ve fotoğrafla birlikte bize hemen yazın. Ürünü yenileriz ya da ücretini iade ederiz.</p>
    <h2>Değişim</h2>
    <p>Stoktaki hazır ürünlerde, ürün kullanılmamış ve hasarsız olmak şartıyla değişim yapılabilir. Kişiye özel üretimlerde değişim yapılamaz.</p>
  </>;
}

function Kvkk({ s }) {
  return <>
    <p>{s.name} olarak kişisel verilerinizi 6698 sayılı Kişisel Verilerin Korunması Kanunu'na (KVKK) uygun şekilde işliyoruz. Bu metin, veri sorumlusu sıfatıyla sizi bilgilendirmek için hazırlanmıştır.</p>
    <h2>Veri sorumlusu</h2>
    <SellerTable s={s}/>
    <h2>İşlenen kişisel veriler</h2>
    <ul>
      <li><b>Sipariş:</b> ad soyad, telefon, teslimat bilgileri, sipariş içeriği ve notlarınız.</li>
      <li><b>İletişim formu:</b> ad, e-posta, telefon ve mesajınız.</li>
      <li><b>Yorumlar:</b> yazdığınız ad ve yorum metni.</li>
      <li><b>Google ile giriş (isteğe bağlı):</b> Google hesabınızdaki ad, e-posta adresi ve profil fotoğrafı; favori listeniz.</li>
      <li><b>İşlem güvenliği:</b> IP adresi ve istek zamanı (kötüye kullanımı önlemek için kısa süreli).</li>
    </ul>
    <h2>Amaçlar ve hukuki sebepler</h2>
    <p>Verileriniz; siparişinizin alınması, üretimi, teslimatı ve sizinle iletişim kurulması (KVKK m.5/2-c, sözleşmenin ifası), fatura ve ticari kayıtların tutulması (m.5/2-ç, hukuki yükümlülük), site güvenliğinin sağlanması ve hizmetin iyileştirilmesi (m.5/2-f, meşru menfaat) amaçlarıyla işlenir. Pazarlama amaçlı ileti, ayrıca onayınız olmadan gönderilmez.</p>
    <h2>Aktarım</h2>
    <p>Verileriniz yalnızca hizmetin gerektirdiği ölçüde; teslimat için kargo firmalarıyla, sitenin barındırıldığı ve veritabanının tutulduğu bulut hizmet sağlayıcılarıyla (sunucuları yurt dışında, Avrupa Birliği'nde bulunabilir) ve yasal zorunluluk halinde yetkili kamu kurumlarıyla paylaşılır. Yurt dışına aktarım KVKK m.9'da öngörülen güvencelerle yapılır. WhatsApp üzerinden iletişim kurmayı seçtiğinizde mesajlarınız WhatsApp (Meta) altyapısından geçer.</p>
    <h2>Saklama süresi</h2>
    <p>Sipariş ve fatura kayıtları ilgili mevzuatta öngörülen süre (genel olarak 10 yıl) boyunca saklanır. Hesabınızı sildiğinizde hesap bilgileriniz ve favori listeniz silinir; yasal saklama yükümlülüğü olan sipariş kayıtları bu süre sonunda imha edilir.</p>
    <h2>Haklarınız</h2>
    <p>KVKK m.11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, silinmesini ya da yok edilmesini isteme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz. Başvurularınızı {s.email} adresine iletebilirsiniz; en geç 30 gün içinde yanıtlanır.</p>
  </>;
}

function Cerez({ s }) {
  return <>
    <p>Bu sitede <b>reklam veya izleme çerezi kullanılmaz</b>. Yalnızca sitenin çalışması için zorunlu olan çerezler ve tarayıcı depolaması kullanılır; bunlar için onay gerekmez.</p>
    <h2>Kullanılan çerezler ve depolama</h2>
    <div className="lgTable">
      <table>
        <thead><tr><th>Ad</th><th>Amaç</th><th>Süre</th></tr></thead>
        <tbody>
          <tr><td>ravun_customer</td><td>Google ile giriş yaptıysanız oturumunuzu açık tutar</td><td>30 gün</td></tr>
          <tr><td>ravun_oauth</td><td>Google ile giriş sırasında güvenlik doğrulaması</td><td>10 dakika</td></tr>
          <tr><td>ravun_admin</td><td>Yalnızca yönetim panelinin oturumu</td><td>8 saat</td></tr>
          <tr><td>Tarayıcı depolaması</td><td>Sepet, favoriler, son bakılan ürünler, bu cihazdan verilen siparişler ve hızlı açılış için ürün listesi</td><td>Siz silene kadar</td></tr>
        </tbody>
      </table>
    </div>
    <h2>Üçüncü taraflar</h2>
    <p>Yazı tipleri Google Fonts üzerinden yüklenir; bu sırada tarayıcınız Google sunucularına bağlanır. Google ile giriş yapmayı seçerseniz giriş işlemi Google'ın kendi sayfasında gerçekleşir.</p>
    <h2>Çerezleri yönetme</h2>
    <p>Tarayıcı ayarlarınızdan çerezleri ve site verilerini silebilirsiniz. Bu durumda sepetiniz ve bu cihazdaki favorileriniz silinir, oturumunuz kapanır. Sorularınız için: {s.email}.</p>
  </>;
}

const BODIES = {
  'on-bilgilendirme-formu': OnBilgilendirme,
  'mesafeli-satis-sozlesmesi': MesafeliSatis,
  'iade-ve-degisim': Iade,
  'kvkk-aydinlatma-metni': Kvkk,
  'cerez-politikasi': Cerez,
};

export function LegalPage({ doc, settings, go, contact }) {
  const Body = BODIES[doc] || OnBilgilendirme;
  const s = seller(settings, contact);
  return (
    <main className="page lgPage">
      <section className="favoritesHero lgHero"><p>YASAL BİLGİLER</p><h1>{legalTitle(doc)}</h1><span>Son güncelleme: Ekim 2026</span></section>
      <div className="lgWrap">
        <nav className="lgNav" aria-label="Yasal metinler">
          {LEGAL_DOCS.map(([slug, title]) => (
            <button key={slug} type="button" className={slug === doc ? 'on' : ''} onClick={() => go(`legal:${slug}`)} aria-current={slug === doc ? 'page' : undefined}>{title}</button>
          ))}
        </nav>
        <article className="lgBody">
          <Body s={s} go={go}/>
        </article>
      </div>
    </main>
  );
}
