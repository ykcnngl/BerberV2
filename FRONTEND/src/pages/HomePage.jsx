import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  ArrowRight,
  AtSign,
  Brush,
  Clock,
  Crown,
  Droplets,
  Eye,
  Hand,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Scissors,
  Sparkles,
  X,
} from "lucide-react";
import { API_URL } from "../api";
import siteConfig from "../siteConfig";
import { formatMoney } from "../utils";
import GalleryGrid from "../components/GalleryGrid";

const EXPERIENCE_ICONS = { scissors: Scissors, beard: Brush, sparkles: Droplets, eye: Eye, hand: Hand, crown: Crown };

const initials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("tr-TR");

// Bölüm başlığı: ince çizgi + küçük üst başlık + büyük başlık
function SectionTitle({ eyebrow, title, align = "left", children }) {
  return (
    <div className={`mb-12 md:mb-16 ${align === "center" ? "text-center mx-auto max-w-2xl" : "max-w-2xl"}`}>
      <p
        className={`flex items-center gap-4 text-bronze-400 text-xs tracking-[0.35em] uppercase mb-5 ${
          align === "center" ? "justify-center" : ""
        }`}
      >
        <span className="h-px w-10 bg-bronze-400/60" />
        {eyebrow}
        {align === "center" && <span className="h-px w-10 bg-bronze-400/60" />}
      </p>
      <h2 className="text-3xl md:text-5xl font-light uppercase tracking-[0.08em] text-white leading-tight">{title}</h2>
      {children && <p className="mt-6 text-neutral-400 leading-relaxed">{children}</p>}
    </div>
  );
}

function Wordmark({ small = false }) {
  return (
    <span className="flex items-center gap-3">
      <img src={siteConfig.logo} alt="" className={small ? "h-7 w-auto" : "h-9 w-auto"} />
      <span className="flex flex-col leading-none">
        <span className={`font-medium uppercase text-white ${small ? "text-xs tracking-[0.3em]" : "text-sm tracking-[0.35em]"}`}>
          {siteConfig.name}
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[0.6rem] tracking-[0.4em] uppercase text-bronze-400">
          <span className="h-px w-3 bg-bronze-400/60" />
          {siteConfig.brandLine}
        </span>
      </span>
    </span>
  );
}

function HomePage() {
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.title = `${siteConfig.name} ${siteConfig.brandLine} | ${siteConfig.tagline}`;
    // Sunucuya ulaşılamazsa site yine açılır; sadece veritabanından gelen bölümler boş kalır
    axios.get(`${API_URL}/services`).then((r) => setServices(r.data)).catch(() => {});
    axios.get(`${API_URL}/packages`).then((r) => setPackages(r.data)).catch(() => {});
    axios.get(`${API_URL}/employees`).then((r) => setEmployees(r.data)).catch(() => {});
    axios
      .get(`${API_URL}/gallery`)
      .then((r) => setGallery(r.data.map((g) => ({ id: g.id, src: `${API_URL}${g.imagePath}`, caption: g.caption }))))
      .catch(() => {});

    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { href: "#hizmetler", label: "Hizmetler" },
    ...(gallery.length ? [{ href: "#calismalarimiz", label: "Çalışmalarımız" }] : []),
    { href: "#salon", label: "Salon" },
    { href: "#iletisim", label: "İletişim" },
  ];
  const marqueeWords = siteConfig.experiences.map((e) => e.title);
  const mapQuery = encodeURIComponent(siteConfig.mapQuery || siteConfig.address);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans">
      {/* ÜST MENÜ */}
      <header
        className={`fixed top-0 inset-x-0 z-30 transition-all duration-500 ${
          scrolled || menuOpen ? "bg-neutral-950/90 backdrop-blur-md border-b border-white/5" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8 h-20 flex items-center justify-between">
          <a href="#" aria-label={`${siteConfig.name} ana sayfa`}>
            <Wordmark />
          </a>
          <nav className="hidden lg:flex items-center gap-10 text-[0.7rem] tracking-[0.3em] uppercase text-neutral-300">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-bronze-300 transition-colors">
                {l.label}
              </a>
            ))}
            <Link to="/randevu?sekme=randevularim" className="hover:text-bronze-300 transition-colors">
              Randevularım
            </Link>
            <Link
              to="/randevu"
              className="border border-bronze-400 text-bronze-300 hover:bg-bronze-400 hover:text-neutral-950 px-6 py-3 transition-colors"
            >
              Randevu Al
            </Link>
          </nav>
          <button className="lg:hidden text-neutral-200" onClick={() => setMenuOpen((o) => !o)} aria-label="Menü">
            {menuOpen ? <X size={26} strokeWidth={1.5} /> : <Menu size={26} strokeWidth={1.5} />}
          </button>
        </div>
        {menuOpen && (
          <nav className="lg:hidden px-5 pb-8 pt-2 flex flex-col gap-6 text-sm tracking-[0.25em] uppercase text-neutral-300">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            <Link to="/randevu?sekme=randevularim">Randevularım</Link>
            <Link to="/randevu" className="bg-bronze-400 text-neutral-950 font-semibold px-6 py-4 text-center">
              Randevu Al
            </Link>
          </nav>
        )}
      </header>

      {/* KAPAK */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(196,164,124,0.12),transparent_55%)]" />
        {/* Mobilde fotoğraf yan sütuna sığmadığı için arka plana soluk olarak konur */}
        <img src={siteConfig.heroImage} alt="" className="sm:hidden absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="sm:hidden absolute inset-0 bg-gradient-to-b from-neutral-950/60 via-neutral-950/40 to-neutral-950" />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 pt-28 pb-16 grid lg:grid-cols-2 gap-14 items-center w-full">
          <div className="animate-fade-up">
            <p className="flex items-center gap-4 text-bronze-400 text-[0.7rem] tracking-[0.4em] uppercase mb-8">
              <span className="h-px w-12 bg-bronze-400/60" />
              {siteConfig.tagline}
            </p>
            <h1 className="text-white">
              <span className="block text-5xl sm:text-6xl xl:text-7xl font-extralight uppercase tracking-[0.12em]">
                {siteConfig.slogan.first}
              </span>
              <span className="block font-script text-bronze-400 text-6xl sm:text-7xl xl:text-8xl mt-2 sm:ml-16">
                {siteConfig.slogan.second}
              </span>
            </h1>
            <p className="mt-8 text-neutral-400 max-w-lg leading-relaxed">{siteConfig.heroText}</p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/randevu"
                className="group bg-bronze-400 hover:bg-bronze-300 text-neutral-950 font-semibold text-xs tracking-[0.3em] uppercase px-9 py-5 transition-colors flex items-center gap-3"
              >
                Randevu Al
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href={gallery.length ? "#calismalarimiz" : "#hizmetler"}
                className="border border-white/20 hover:border-white/60 text-white text-xs tracking-[0.3em] uppercase px-9 py-5 transition-colors"
              >
                {gallery.length ? "Çalışmalarımız" : "Hizmetler"}
              </a>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-neutral-500">
              <span className="flex items-center gap-2">
                <MapPin size={16} className="text-bronze-400" /> Balçova / İzmir
              </span>
              {siteConfig.phone && (
                <a href={`tel:${siteConfig.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-white">
                  <Phone size={16} className="text-bronze-400" /> {siteConfig.phone}
                </a>
              )}
            </div>
          </div>

          <div className="relative animate-fade-up [animation-delay:200ms] hidden sm:block">
            <div className="absolute -inset-4 md:-inset-6 border border-bronze-400/30 translate-x-4 translate-y-4 md:translate-x-6 md:translate-y-6" />
            <img
              src={siteConfig.heroImage}
              alt={`${siteConfig.name} salon`}
              className="relative w-full aspect-[4/3.3] object-cover"
            />
            <div className="absolute -bottom-6 -left-6 bg-neutral-950 border border-white/10 px-6 py-5 hidden md:block">
              <p className="text-[0.65rem] tracking-[0.3em] uppercase text-neutral-500">Online randevu</p>
              <p className="mt-1 text-white tracking-wide">7/24 · Sıra beklemeden</p>
            </div>
          </div>
        </div>
      </section>

      {/* KAYAN HİZMET ŞERİDİ */}
      <div className="border-y border-white/10 py-6 overflow-hidden select-none" aria-hidden="true">
        <div className="flex w-max animate-marquee">
          {[...marqueeWords, ...marqueeWords, ...marqueeWords, ...marqueeWords].map((w, i) => (
            <span key={i} className="flex items-center gap-10 px-5 text-sm tracking-[0.4em] uppercase text-neutral-500">
              {w}
              <span className="text-bronze-400 text-lg">✕</span>
            </span>
          ))}
        </div>
      </div>

      {/* NELER YAPIYORUZ */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-24 md:py-32">
        <SectionTitle eyebrow="Deneyim" title="Neler yapıyoruz">
          Erkek bakımının her adımı tek çatı altında. Uzman ellerde, hijyenik ve özenli.
        </SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-white/10">
          {siteConfig.experiences.map((e, i) => {
            const Icon = EXPERIENCE_ICONS[e.icon] || Sparkles;
            return (
              <div
                key={e.title}
                className="group border-r border-b border-white/10 p-8 md:p-10 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-start justify-between">
                  <Icon size={30} strokeWidth={1.2} className="text-bronze-400" />
                  <span className="text-xs text-neutral-700 tracking-widest">0{i + 1}</span>
                </div>
                <h3 className="mt-8 text-lg uppercase tracking-[0.18em] text-white">{e.title}</h3>
                <p className="mt-3 text-sm text-neutral-500 leading-relaxed">{e.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ONLINE RANDEVU MENÜSÜ (hizmetler veritabanından) */}
      <section id="hizmetler" className="bg-neutral-900/40 border-y border-white/5 scroll-mt-20">
        <div className="max-w-4xl mx-auto px-5 md:px-8 py-24 md:py-32">
          <SectionTitle eyebrow="Hizmetlerimiz" title="Online randevu" align="center">
            Ekibimizden dilediğiniz kişiyi, hizmetinizi ve saatinizi seçin.
          </SectionTitle>
          {/* Paketler (yönetici panelinden eklenir; paket fiyatı gösterilir) */}
          {packages.length > 0 && (
            <div className="mb-14">
              <p className="text-center text-[0.65rem] tracking-[0.4em] uppercase text-bronze-400 mb-6">Paketler</p>
              <ul className="grid gap-4 md:grid-cols-2">
                {packages.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/randevu?paket=${p.id}`}
                      className="group flex h-full flex-col border border-bronze-400/30 hover:border-bronze-400 bg-white/[0.02] p-6 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-white uppercase tracking-[0.15em] group-hover:text-bronze-300 transition-colors">
                          {p.name}
                        </h3>
                        <span className="text-bronze-400 font-semibold whitespace-nowrap">{formatMoney(p.price)}</span>
                      </div>
                      <p className="mt-2 text-sm text-neutral-300">{p.serviceNames.join(" + ")}</p>
                      {p.description && <p className="mt-2 text-sm text-neutral-500 leading-relaxed">{p.description}</p>}
                      <p className="mt-auto pt-4 text-xs text-neutral-500 flex items-center gap-1.5">
                        <Clock size={13} /> {p.durationMinutes} dakika
                        <ArrowRight size={16} className="ml-auto text-neutral-600 group-hover:text-bronze-400 group-hover:translate-x-1 transition-all" />
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {services.length === 0 ? (
            <p className="text-center text-neutral-600">Hizmet listesi şu anda yüklenemedi.</p>
          ) : (
            <ul className="divide-y divide-white/10 border-y border-white/10">
              {services.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/randevu?hizmet=${s.id}`}
                    className="group flex items-center gap-4 py-7 px-2 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white uppercase tracking-[0.15em] group-hover:text-bronze-300 transition-colors">
                        {s.name}
                      </h3>
                      <p className="mt-1 text-xs text-neutral-500 flex items-center gap-1.5">
                        <Clock size={13} /> {s.durationMinutes} dakika
                      </p>
                    </div>
                    <ArrowRight size={18} className="text-neutral-600 group-hover:text-bronze-400 group-hover:translate-x-1 transition-all" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-12 text-center">
            <Link
              to="/randevu"
              className="inline-block bg-bronze-400 hover:bg-bronze-300 text-neutral-950 font-semibold text-xs tracking-[0.3em] uppercase px-10 py-5 transition-colors"
            >
              Hemen Randevu Al
            </Link>
          </div>
        </div>
      </section>

      {/* ÇALIŞMALARIMIZ (yönetici panelinden eklenir) */}
      {gallery.length > 0 && (
        <section id="calismalarimiz" className="max-w-7xl mx-auto px-5 md:px-8 py-24 md:py-32 scroll-mt-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionTitle eyebrow="Portfolyo" title="Çalışmalarımız" />
            {siteConfig.instagram && (
              <a
                href={`https://instagram.com/${siteConfig.instagram}`}
                target="_blank"
                rel="noreferrer"
                className="mb-12 md:mb-16 flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-neutral-400 hover:text-bronze-300"
              >
                <AtSign size={16} /> {siteConfig.instagram}
              </a>
            )}
          </div>
          <GalleryGrid items={gallery} />
        </section>
      )}

      {/* SALON */}
      <section id="salon" className="border-t border-white/5 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-24 md:py-32 grid lg:grid-cols-2 gap-16 items-center">
          <div className="grid grid-cols-5 gap-4">
            <img
              src={siteConfig.gallery.salon[0].src}
              alt={siteConfig.gallery.salon[0].alt}
              loading="lazy"
              className="col-span-3 w-full h-full object-cover aspect-[3/4]"
            />
            <img
              src={siteConfig.gallery.salon[1].src}
              alt={siteConfig.gallery.salon[1].alt}
              loading="lazy"
              className="col-span-2 w-full object-cover aspect-[3/4] mt-16"
            />
          </div>
          <div>
            <SectionTitle eyebrow="Salonumuz" title="Sıcak ışık, sakin bir atmosfer">
              Balçova'daki salonumuzda modern ekipmanlar, rahat koltuklar ve özenle tasarlanmış ayrı bakım
              odaları sizi bekliyor. Her ziyaret, kendinize ayırdığınız keyifli bir mola.
            </SectionTitle>
          </div>
        </div>
      </section>

      {/* VİP ODA */}
      <section className="bg-gradient-to-b from-neutral-900/60 to-neutral-950 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-24 md:py-32 grid md:grid-cols-[1fr_auto] gap-16 items-center">
          <div>
            <p className="flex items-center gap-4 text-bronze-400 text-xs tracking-[0.35em] uppercase">
              <span className="h-px w-10 bg-bronze-400/60" />
              VİP Oda
            </p>
            <h2 className="mt-6 text-3xl md:text-5xl font-light uppercase tracking-[0.08em] text-white leading-tight max-w-xl">
              {siteConfig.vip.title}
            </h2>
            <ul className="mt-10 grid grid-cols-2 gap-x-8 gap-y-5 max-w-md">
              {siteConfig.vip.features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm tracking-wide text-neutral-300">
                  <Crown size={16} strokeWidth={1.4} className="text-bronze-400 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative justify-self-center">
            <div className="absolute -inset-3 border border-bronze-400/30 -translate-x-3 translate-y-3" />
            <img src={siteConfig.vip.image} alt="VİP oda koltuğu" loading="lazy" className="relative w-60 md:w-72 object-cover" />
          </div>
        </div>
      </section>

      {/* EKİBİMİZ */}
      {employees.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 md:px-8 py-24 md:py-32">
          <SectionTitle eyebrow="Kadromuz" title="Ekibimiz" align="center">
            Size uygun saatte, dilediğiniz ekip üyemizden randevu alın.
          </SectionTitle>
          <div className="flex flex-wrap justify-center gap-6">
            {employees.map((e) => (
              <Link
                key={e.id}
                to={`/randevu?ekip=${e.id}`}
                className="group w-60 border border-white/10 hover:border-bronze-400/50 p-8 text-center transition-colors"
              >
                <div className="w-24 h-24 mx-auto rounded-full border border-bronze-400/50 p-1.5">
                  <div className="w-full h-full rounded-full bg-neutral-900 flex items-center justify-center text-2xl font-light tracking-widest text-bronze-300">
                    {initials(e.name)}
                  </div>
                </div>
                <h3 className="mt-6 uppercase tracking-[0.2em] text-white">{e.name}</h3>
                {services.some((s) => e.serviceIds.includes(s.id)) && (
                  <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                    {services
                      .filter((s) => e.serviceIds.includes(s.id))
                      .map((s) => s.name)
                      .join(" · ")}
                  </p>
                )}
                <p className="mt-4 text-[0.65rem] tracking-[0.3em] uppercase text-neutral-500 group-hover:text-bronze-300 transition-colors">
                  Randevu al →
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* İLETİŞİM */}
      <section id="iletisim" className="border-t border-white/5 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-24 md:py-32 grid lg:grid-cols-2 gap-16">
          <div>
            <SectionTitle eyebrow="Ziyaret edin" title="Bizi bulun" />
            <ul className="space-y-8">
              <li className="flex gap-5">
                <MapPin size={22} strokeWidth={1.4} className="text-bronze-400 shrink-0 mt-1" />
                <div>
                  <p className="text-white leading-relaxed">{siteConfig.address}</p>
                  {siteConfig.addressNote && <p className="text-sm text-neutral-500 mt-1">{siteConfig.addressNote}</p>}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-3 text-xs tracking-[0.25em] uppercase text-bronze-400 hover:text-bronze-300"
                  >
                    Yol tarifi al →
                  </a>
                </div>
              </li>
              {siteConfig.phone && (
                <li className="flex gap-5 items-center">
                  <Phone size={22} strokeWidth={1.4} className="text-bronze-400 shrink-0" />
                  <a href={`tel:${siteConfig.phone.replace(/\s/g, "")}`} className="text-white hover:text-bronze-300">
                    {siteConfig.phone}
                  </a>
                </li>
              )}
              {siteConfig.whatsapp && (
                <li className="flex gap-5 items-center">
                  <MessageCircle size={22} strokeWidth={1.4} className="text-bronze-400 shrink-0" />
                  <a href={`https://wa.me/${siteConfig.whatsapp}`} target="_blank" rel="noreferrer" className="text-white hover:text-bronze-300">
                    WhatsApp
                  </a>
                </li>
              )}
              {siteConfig.instagram && (
                <li className="flex gap-5 items-center">
                  <AtSign size={22} strokeWidth={1.4} className="text-bronze-400 shrink-0" />
                  <a
                    href={`https://instagram.com/${siteConfig.instagram}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white hover:text-bronze-300"
                  >
                    {siteConfig.instagram}
                  </a>
                </li>
              )}
              <li className="flex gap-5">
                <Clock size={22} strokeWidth={1.4} className="text-bronze-400 shrink-0 mt-0.5" />
                <ul className="space-y-1">
                  {siteConfig.hours.map((h) => (
                    <li key={h.days} className="text-white">
                      {h.days} <span className="text-neutral-500 mx-2">·</span> {h.time}
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </div>
          <div className="min-h-80 border border-white/10">
            <iframe
              title="Harita"
              src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
              className="w-full h-full min-h-80 grayscale invert-[0.9] contrast-[0.9]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      {/* KAPANIŞ */}
      <section className="relative overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(196,164,124,0.10),transparent_60%)]" />
        <div className="relative max-w-4xl mx-auto px-5 py-28 text-center">
          <img src={siteConfig.logo} alt="" className="h-14 w-auto mx-auto opacity-90" />
          <p className="mt-10 text-3xl md:text-5xl font-extralight uppercase tracking-[0.12em] text-white">
            {siteConfig.slogan.first}{" "}
            <span className="font-script normal-case tracking-normal text-bronze-400 text-5xl md:text-7xl">
              {siteConfig.slogan.second}
            </span>
          </p>
          <Link
            to="/randevu"
            className="mt-12 inline-block bg-bronze-400 hover:bg-bronze-300 text-neutral-950 font-semibold text-xs tracking-[0.3em] uppercase px-10 py-5 transition-colors"
          >
            Randevunuzu Alın
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <Wordmark small />
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-8 text-xs tracking-[0.2em] uppercase text-neutral-500">
            <Link to="/randevu?sekme=randevularim" className="hover:text-neutral-300">
              Randevumu görüntüle / iptal et
            </Link>
            <span>
              © {new Date().getFullYear()} {siteConfig.name}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
