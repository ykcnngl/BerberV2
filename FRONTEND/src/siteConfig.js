// İşletmenin web sitesinde görünen bilgileri (Instagram @arif_tuzunalp hesabından alındı).
// Boş bırakılan alanlar sitede gösterilmez. Hizmet fiyatları, ekip ve galeri veritabanından gelir.
const siteConfig = {
  name: "Arif Tüzünalp",
  brandLine: "Barber's Club",
  tagline: "Erkek Kuaförü ve Güzellik Salonu",
  slogan: { first: "İyi görün,", second: "iyi hisset." },
  heroText:
    "Saç ve sakal kesiminden cilt bakımına, Balçova'daki salonumuzda her detay size özel. Sıra beklemeden size uygun saati seçin, randevunuzu birkaç saniyede alın.",

  // Görseller FRONTEND/public/brand klasöründe
  logo: "/brand/logo-white.png",
  heroImage: "/brand/salon-koltuk.webp",

  // İletişim
  phone: "0507 593 18 66",
  whatsapp: "", // WhatsApp hattı varsa uluslararası formatta, örn. "905075931866"
  address: "Onur Mah. Mithatpaşa Cad. Tosun Kapı No:59 Daire:6, Balçova / İzmir",
  addressNote: "Balçova Media Market karşısı",
  mapQuery: "Mithatpaşa Caddesi 59, Onur Mahallesi, Balçova, İzmir", // haritada aranacak adres
  instagram: "arif_tuzunalp",

  // Çalışma saatleri (backend'deki açılış/kapanış saatleriyle aynı olmalı: 09:00 - 20:00)
  hours: [{ days: "Her gün", time: "09:00 - 20:00" }],

  // "Neler yapıyoruz" bölümü (Instagram öne çıkanlarından)
  experiences: [
    { icon: "scissors", title: "Saç Kesimi", text: "Yüz hatlarınıza ve tarzınıza uygun, modern ve klasik kesimler." },
    { icon: "beard", title: "Sakal Tasarımı", text: "Net hatlar, yüzünüze uygun, bakımlı ve dengeli bir sakal formu." },
    { icon: "sparkles", title: "Cilt Bakımı", text: "Hydrafacial ve profesyonel bakım uygulamalarıyla yenilenen bir cilt." },
    { icon: "eye", title: "Ölçülü Kaş Alımı", text: "Doğal, erkeksi ve yüzünüze uygun; inceltmeden şekillendirme." },
    { icon: "hand", title: "Manikür & Pedikür", text: "Hijyenik ekipmanlarla el ve ayak bakımı." },
    { icon: "crown", title: "VİP Oda", text: "Konforun ve ayrıcalığın özel alanı: mahremiyet ve huzur içinde hizmet." },
  ],

  vip: {
    image: "/brand/vip-oda.webp",
    title: "Konforun ve ayrıcalığın özel alanı.",
    features: ["Özel alan", "Üst düzey konfor", "Mahremiyet ve huzur", "Ayrıcalıklı hizmet"],
  },

  gallery: {
    salon: [
      { src: "/brand/salon-oda.webp", alt: "Arif Tüzünalp salonu" },
      { src: "/brand/cilt-bakim.webp", alt: "Cilt bakım odası" },
    ],
  },
};

export default siteConfig;
