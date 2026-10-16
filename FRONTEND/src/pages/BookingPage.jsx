import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Package as PackageIcon,
  XCircle,
} from "lucide-react";
import { API_URL, getErrorMessage, requestVerificationCode } from "../api";
import CodeVerification from "../CodeVerification";
import siteConfig from "../siteConfig";
import { DAYS, dayLabel, dayOfWeekOf, formatMoney, formatPhoneNumber, getLocalDateStr, toLocalDateStr } from "../utils";

const STEPS = ["Ekip", "Hizmet", "Tarih", "Onay"];
const MAX_DAYS_AHEAD = 60;

// "2026-10-15" + 3 gün -> "2026-10-18" (yerel tarih)
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toLocalDateStr(new Date(y, m - 1, d + n));
};

const optionClass = (selected) =>
  `rounded-xl border text-left transition-colors ${
    selected
      ? "bg-neutral-800 border-bronze-400 text-white"
      : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-600"
  }`;

const inputClass =
  "w-full bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-white focus:outline-none focus:border-bronze-400";

// Müşterinin randevu aldığı ve randevularını yönettiği sayfa. Ekran yüksekliğine sığar; randevu alma
// adımları (ekip -> hizmet/paket -> tarih ve saat -> bilgiler) yana kayarak ilerler, sayfa aşağı uzamaz.
// URL parametreleri: ?ekip=<id> ?hizmet=<id> ?paket=<id> ?sekme=randevularim (ana sayfadaki butonlardan gelir)
function BookingPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    searchParams.get("sekme") === "randevularim" ? "appointments" : "book",
  );
  const [step, setStep] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  // Seçim: birkaç hizmet (selectedServiceIds) ya da tek paket (selectedPackage); ikisi birlikte olmaz
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [initError, setInitError] = useState("");
  const todayStr = getLocalDateStr();

  // --- YENİ RANDEVU STATELERİ ---
  const [date, setDate] = useState(todayStr);
  const [weekStart, setWeekStart] = useState(todayStr);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookingCodeSent, setBookingCodeSent] = useState(false);
  const [booked, setBooked] = useState(null); // başarıyla alınan randevunun özeti

  // --- MÜŞTERİ OTURUMU ---
  // Randevu almak ve görmek için telefon SMS koduyla doğrulanır; oturum 30 dk geçerlidir
  // ve iki sekmede ortaktır (aynı numara için tekrar kod istenmez).
  const [customerToken, setCustomerToken] = useState(null);
  const [verifiedPhone, setVerifiedPhone] = useState(null);

  // --- RANDEVULARIM STATELERİ ---
  const [searchPhone, setSearchPhone] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [myAppointments, setMyAppointments] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Sadece en az bir aktif hizmet atanmış ekip üyeleri listelenir
  const provides = (emp, serviceIds) => serviceIds.every((id) => emp.serviceIds.includes(id));
  const servicesOf = (emp) => (emp ? services.filter((s) => emp.serviceIds.includes(s.id)) : []);
  const packagesOf = (emp) => (emp ? packages.filter((p) => provides(emp, p.serviceIds)) : []);
  const bookableEmployees = employees.filter((e) => servicesOf(e).length > 0);
  const employeeServices = servicesOf(selectedEmployee);
  const employeePackages = packagesOf(selectedEmployee);

  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id));
  const hasSelection = Boolean(selectedPackage) || selectedServiceIds.length > 0;
  const selectionKey = selectedPackage ? `p:${selectedPackage.id}` : selectedServiceIds.join(",");
  const totalMinutes = selectedPackage
    ? selectedPackage.durationMinutes
    : selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);
  const selectionLabel = selectedPackage ? selectedPackage.name : selectedServices.map((s) => s.name).join(" + ");

  // Ekip, hizmet ve paket listesini veritabanından çek; URL'de seçim varsa onu uygula
  useEffect(() => {
    document.title = `Randevu Al | ${siteConfig.name}`;
    const fetchInitialData = async () => {
      try {
        const [employeesRes, servicesRes, packagesRes] = await Promise.all([
          axios.get(`${API_URL}/employees`),
          axios.get(`${API_URL}/services`),
          axios.get(`${API_URL}/packages`),
        ]);
        const emps = employeesRes.data;
        const svcs = servicesRes.data;
        const pkgs = packagesRes.data;
        const bookable = emps.filter((e) => svcs.some((s) => provides(e, [s.id])));
        const wantedService = svcs.find((s) => s.id === searchParams.get("hizmet"));
        const wantedPackage = pkgs.find((p) => p.id === searchParams.get("paket"));
        const wantedEmployee = bookable.find((e) => e.id === searchParams.get("ekip"));
        const wantedIds = wantedPackage ? wantedPackage.serviceIds : wantedService ? [wantedService.id] : [];
        // Ana sayfadaki listeden gelindiyse ve hizmeti/paketi tek kişi veriyorsa onu seç
        const providers = wantedIds.length ? bookable.filter((e) => provides(e, wantedIds)) : [];
        const initialEmployee =
          wantedEmployee ||
          (providers.length === 1 ? providers[0] : null) ||
          (bookable.length === 1 ? bookable[0] : null);
        const fits = initialEmployee && provides(initialEmployee, wantedIds);
        setEmployees(emps);
        setServices(svcs);
        setPackages(pkgs);
        setSelectedEmployee(initialEmployee);
        if (wantedPackage && fits) setSelectedPackage(wantedPackage);
        else if (wantedService && fits) setSelectedServiceIds([wantedService.id]);
        // Seçimi hazır gelen adımlar atlanır (paket seçiliyse doğrudan tarih adımı)
        if (initialEmployee) setStep(wantedPackage && fits ? 2 : 1);
        if (!bookable.length) {
          setInitError("Şu anda randevu alınabilecek ekip üyesi veya hizmet bulunmuyor.");
        }
      } catch (error) {
        setInitError(
          getErrorMessage(error, "Sunucuya bağlanılamadı. Lütfen daha sonra tekrar deneyin."),
        );
      }
    };
    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ekip üyesi seçilince hizmet adımına geçilir; yeni kişinin vermediği hizmetler ve paket seçimden çıkarılır
  const handleEmployeeChange = (emp) => {
    setSelectedEmployee(emp);
    setSelectedSlot(null);
    if (selectedPackage && !provides(emp, selectedPackage.serviceIds)) setSelectedPackage(null);
    setSelectedServiceIds((ids) => ids.filter((id) => emp.serviceIds.includes(id)));
    setSlots([]);
    setStep(1);
  };

  // Hizmetler birden fazla seçilebilir; hizmet seçilince paket seçimi kalkar
  const toggleService = (svc) => {
    setSelectedPackage(null);
    setSelectedServiceIds((ids) => (ids.includes(svc.id) ? ids.filter((id) => id !== svc.id) : [...ids, svc.id]));
    setSelectedSlot(null);
  };

  const selectPackage = (pkg) => {
    setSelectedPackage((current) => (current?.id === pkg.id ? null : pkg));
    setSelectedServiceIds([]);
    setSelectedSlot(null);
  };

  const selectionParams = () =>
    selectedPackage ? { packageId: selectedPackage.id } : { serviceIds: selectedServiceIds.join(",") };

  const isDayOff = (d) => selectedEmployee?.weeklyOffDays?.includes(dayOfWeekOf(d));

  const fetchSlots = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/available-slots`, {
        params: { employeeId: selectedEmployee.id, ...selectionParams(), date },
      });
      setSlots(response.data);
    } catch (error) {
      console.error("Saatler çekilirken hata oluştu:", error);
      setSlots([]);
    }
    setLoading(false);
  };

  // Seçim değiştikçe sunucudan veri çekilir (yükleniyor durumu fetch içinde set edilir)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (date && activeTab === "book" && selectedEmployee && hasSelection) fetchSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, activeTab, selectedEmployee, selectionKey]);

  const resetCustomerVerification = () => {
    setCustomerToken(null);
    setVerifiedPhone(null);
    setCodeSent(false);
    setBookingCodeSent(false);
    setMyAppointments([]);
  };

  const startCustomerSession = (token, phone) => {
    setCustomerToken(token);
    setVerifiedPhone(phone);
  };

  const hasSessionFor = (phone) => customerToken !== null && verifiedPhone === phone;

  const submitBooking = async (token) => {
    setLoading(true);
    try {
      const payload = {
        employeeId: selectedEmployee.id,
        ...(selectedPackage ? { packageId: selectedPackage.id } : { serviceIds: selectedServiceIds }),
        startTime: `${date}T${selectedSlot}`,
        customerFullName: customerName,
        customerPhone,
      };
      await axios.post(`${API_URL}/appointments`, payload, {
        headers: { "X-Customer-Token": token },
      });
      setBooked({ date, time: selectedSlot, employee: selectedEmployee.name, label: selectionLabel });
      setSelectedSlot(null);
    } catch (error) {
      if (error.response?.status === 401) resetCustomerVerification();
      alert(getErrorMessage(error, "Üzgünüz, bir hata oluştu."));
      setSelectedSlot(null);
      setStep(2);
    }
    setBookingCodeSent(false);
    setLoading(false);
    fetchSlots();
  };

  const phoneComplete = customerPhone.replace(/\s/g, "").length === 11;
  const canConfirm = Boolean(selectedSlot) && customerName.trim().length >= 2 && phoneComplete && !loading;

  // Numara bu oturumda doğrulandıysa direkt kaydet, yoksa önce SMS kodu gönder
  const handleBooking = async () => {
    if (!canConfirm) return;
    if (hasSessionFor(customerPhone)) {
      await submitBooking(customerToken);
      return;
    }
    setLoading(true);
    if (await requestVerificationCode(customerPhone)) setBookingCodeSent(true);
    setLoading(false);
  };

  const handleBookingVerified = async (token) => {
    startCustomerSession(token, customerPhone);
    await submitBooking(token);
  };

  // Yeni randevu için sihirbazı başa al (ad ve telefon hatırlanır)
  const startOver = () => {
    setBooked(null);
    setSelectedServiceIds([]);
    setSelectedPackage(null);
    setSelectedSlot(null);
    setStep(bookableEmployees.length === 1 ? 1 : 0);
  };

  const handleRequestCode = async () => {
    setSearchLoading(true);
    if (await requestVerificationCode(searchPhone)) setCodeSent(true);
    setSearchLoading(false);
  };

  const fetchMyAppointments = async (token) => {
    setSearchLoading(true);
    try {
      const response = await axios.get(`${API_URL}/appointments`, {
        headers: { "X-Customer-Token": token },
      });
      setMyAppointments(response.data);
    } catch (error) {
      if (error.response?.status === 401) resetCustomerVerification();
      alert(getErrorMessage(error, "Randevular çekilirken hata oluştu."));
    }
    setSearchLoading(false);
  };

  // Oturum varken Randevularım sekmesine gelince listeyi çek (randevu alırken doğrulanmış olabilir)
  useEffect(() => {
    if (activeTab === "appointments" && customerToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchMyAppointments(customerToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, customerToken]);

  // Müşteri iptali: backend randevunun doğrulanmış telefona ait olduğunu kontrol eder
  const handleCustomerCancel = async (appointmentId) => {
    if (!window.confirm("Bu randevuyu iptal etmek istediğinize emin misiniz?"))
      return;
    try {
      const response = await axios.patch(
        `${API_URL}/appointments/${appointmentId}/cancel`,
        null,
        { headers: { "X-Customer-Token": customerToken } },
      );
      alert(response.data.message);
      fetchMyAppointments(customerToken);
    } catch (error) {
      if (error.response?.status === 401) resetCustomerVerification();
      alert(getErrorMessage(error, "Randevu iptal edilirken bir hata oluştu."));
    }
  };

  // Adım ileri gidebilir mi
  const canAdvance = [Boolean(selectedEmployee), hasSelection, Boolean(selectedSlot)][step];
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const lastDay = addDays(todayStr, MAX_DAYS_AHEAD);

  const tabClass = (tab) =>
    `flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
      activeTab === tab ? "bg-bronze-400 text-neutral-950" : "text-neutral-400 hover:text-white"
    }`;

  // Yana kayan adım paneli; görünmeyen adımlar klavye/ekran okuyucu için devre dışı
  const StepPanel = ({ index, title, children }) => (
    <section
      className="w-full shrink-0 h-full overflow-y-auto px-4 pb-4"
      inert={step !== index}
      aria-hidden={step !== index}
    >
      <h2 className="text-xs uppercase tracking-[0.25em] text-neutral-500 mb-3">{title}</h2>
      {children}
    </section>
  );

  return (
    <div className="h-[100dvh] bg-neutral-950 text-neutral-100 flex justify-center bg-[radial-gradient(ellipse_at_top,rgba(196,164,124,0.08),transparent_50%)]">
      <div className="w-full max-w-md flex flex-col h-full">
        {/* ÜST BAŞLIK */}
        <header className="flex items-center justify-between px-4 pt-4 pb-3">
          <Link to="/" className="flex items-center gap-1.5 text-xs tracking-[0.2em] uppercase text-neutral-500 hover:text-white">
            <ArrowLeft size={14} /> Ana sayfa
          </Link>
          <Link to="/" className="flex items-center gap-2" aria-label={siteConfig.name}>
            <img src={siteConfig.logo} alt="" className="h-6 w-auto" />
            <span className="text-[0.65rem] tracking-[0.3em] uppercase text-white">{siteConfig.name}</span>
          </Link>
        </header>

        {/* ANA SEKMELER */}
        <div className="mx-4 flex gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
          <button onClick={() => setActiveTab("book")} className={tabClass("book")}>
            Yeni Randevu
          </button>
          <button onClick={() => setActiveTab("appointments")} className={tabClass("appointments")}>
            Randevularım
          </button>
        </div>

        {initError && (
          <p className="mx-4 mt-3 text-center text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">
            {initError}
          </p>
        )}

        {/* 1. YENİ RANDEVU: yana kayan adımlar */}
        {activeTab === "book" && !booked && (
          <>
            {/* Adım göstergesi: tamamlanan adımlara tıklanarak geri dönülebilir */}
            <ol className="flex gap-2 px-4 pt-4 pb-3">
              {STEPS.map((label, i) => (
                <li key={label} className="flex-1">
                  <button
                    onClick={() => i < step && setStep(i)}
                    disabled={i >= step}
                    className="w-full text-left disabled:cursor-default"
                  >
                    <span className={`block h-1 rounded-full ${i <= step ? "bg-bronze-400" : "bg-neutral-800"}`} />
                    <span className={`block mt-1.5 text-[0.7rem] ${i === step ? "text-white" : "text-neutral-500"}`}>
                      {i + 1}. {label}
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="flex-1 min-h-0 overflow-hidden">
              <div
                className="flex h-full transition-transform duration-300 ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(-${step * 100}%)` }}
              >
                {/* 1. ADIM: EKİP */}
                {StepPanel({
                  index: 0,
                  title: "Ekibimizden seçin",
                  children: (
                    <div className="grid grid-cols-2 gap-2">
                      {bookableEmployees.map((emp) => (
                        <button
                          key={emp.id}
                          onClick={() => handleEmployeeChange(emp)}
                          className={`${optionClass(selectedEmployee?.id === emp.id)} p-3`}
                        >
                          <span className="block font-medium text-sm">{emp.name}</span>
                          <span className="block mt-1 text-[0.7rem] leading-snug text-neutral-500 line-clamp-2">
                            {servicesOf(emp).map((s) => s.name).join(" · ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  ),
                })}

                {/* 2. ADIM: PAKET VEYA HİZMETLER */}
                {StepPanel({
                  index: 1,
                  title: selectedEmployee ? `${selectedEmployee.name} · hizmet seçin` : "Hizmet seçin",
                  children: (
                    <div className="space-y-3">
                      {employeePackages.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => selectPackage(p)}
                          className={`${optionClass(selectedPackage?.id === p.id)} w-full p-3`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 font-medium text-sm">
                              <PackageIcon size={15} className="text-bronze-400 shrink-0" /> {p.name}
                            </span>
                            <span className="text-bronze-400 font-semibold text-sm whitespace-nowrap">{formatMoney(p.price)}</span>
                          </span>
                          <span className="block mt-1 text-[0.7rem] text-neutral-500">
                            {p.serviceNames.join(" + ")} · {p.durationMinutes} dk
                          </span>
                        </button>
                      ))}
                      {employeePackages.length > 0 && (
                        <p className="text-[0.7rem] text-neutral-500 text-center">veya bir ya da birkaç hizmet seçin</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {employeeServices.map((s) => {
                          const checked = selectedServiceIds.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              onClick={() => toggleService(s)}
                              aria-pressed={checked}
                              className={`${optionClass(checked)} p-3 flex items-start gap-2`}
                            >
                              <span
                                className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                  checked ? "bg-bronze-400 border-bronze-400" : "border-neutral-600"
                                }`}
                              >
                                {checked && <Check size={12} className="text-neutral-950" strokeWidth={3} />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-medium leading-snug">{s.name}</span>
                                <span className="block text-[0.7rem] text-neutral-500">{s.durationMinutes} dk</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ),
                })}

                {/* 3. ADIM: TARİH VE SAAT */}
                {StepPanel({
                  index: 2,
                  title: "Tarih ve saat",
                  children: (
                    <div className="space-y-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setWeekStart(addDays(weekStart, -7) < todayStr ? todayStr : addDays(weekStart, -7))}
                          disabled={weekStart <= todayStr}
                          className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-30"
                          aria-label="Önceki hafta"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <div className="flex-1 grid grid-cols-7 gap-1">
                          {weekDays.map((d) => {
                            const off = isDayOff(d) || d > lastDay;
                            const selected = d === date;
                            return (
                              <button
                                key={d}
                                onClick={() => {
                                  setDate(d);
                                  setSelectedSlot(null);
                                }}
                                disabled={off}
                                className={`py-2 rounded-lg text-center transition-colors disabled:opacity-30 ${
                                  selected ? "bg-bronze-400 text-neutral-950" : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                                }`}
                              >
                                <span className="block text-[0.6rem] uppercase">
                                  {DAYS.find((x) => x.value === dayOfWeekOf(d))?.short}
                                </span>
                                <span className="block text-sm font-semibold">{Number(d.slice(8))}</span>
                                {/* Bugün: altında küçük nokta */}
                                <span className={`block mx-auto mt-0.5 h-1 w-1 rounded-full ${d === todayStr ? (selected ? "bg-neutral-950" : "bg-bronze-400") : "bg-transparent"}`} />
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setWeekStart(addDays(weekStart, 7))}
                          disabled={addDays(weekStart, 7) > lastDay}
                          className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-30"
                          aria-label="Sonraki hafta"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>

                      <div>
                        <p className="text-[0.7rem] text-neutral-500 mb-2">
                          {new Date(`${date}T00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}
                          {totalMinutes > 0 && ` · ${totalMinutes} dk`}
                        </p>
                        {loading && !slots.length ? (
                          <p className="text-center text-neutral-400 py-6 text-sm">Yükleniyor...</p>
                        ) : slots.length > 0 ? (
                          <div className="grid grid-cols-4 gap-2">
                            {slots.map((time) => (
                              <button
                                key={time}
                                onClick={() => {
                                  setSelectedSlot(time);
                                  setStep(3);
                                }}
                                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                                  selectedSlot === time
                                    ? "bg-bronze-400 text-neutral-950"
                                    : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                                }`}
                              >
                                {time.substring(0, 5)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-center text-neutral-400 py-6 bg-neutral-900 rounded-xl text-sm">
                            {isDayOff(date)
                              ? `${selectedEmployee?.name} ${dayLabel(dayOfWeekOf(date))} günleri çalışmıyor.`
                              : "Bu güne ait uygun saat bulunmuyor."}
                          </p>
                        )}
                      </div>
                    </div>
                  ),
                })}

                {/* 4. ADIM: BİLGİLER VE ONAY */}
                {StepPanel({
                  index: 3,
                  title: "Bilgileriniz",
                  children: (
                    <div className="space-y-3">
                      {/* Seçim özeti */}
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-sm">
                        <p className="text-white font-medium">{selectionLabel}</p>
                        <p className="text-neutral-400 mt-0.5">
                          {selectedEmployee?.name} ·{" "}
                          {new Date(`${date}T00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" })}{" "}
                          · <span className="text-bronze-400 font-semibold">{selectedSlot}</span>
                        </p>
                        {selectedPackage && <p className="text-bronze-400 mt-0.5">{formatMoney(selectedPackage.price)}</p>}
                      </div>

                      {bookingCodeSent ? (
                        <CodeVerification
                          phone={customerPhone}
                          submitLabel="Doğrula ve Randevuyu Onayla"
                          onVerified={handleBookingVerified}
                          onBack={() => setBookingCodeSent(false)}
                        />
                      ) : (
                        <>
                          <input
                            type="text"
                            placeholder="Adınız Soyadınız"
                            autoComplete="name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className={inputClass}
                          />
                          <input
                            type="tel"
                            placeholder="Telefon (05XX XXX XXXX)"
                            autoComplete="tel"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(formatPhoneNumber(e.target.value))}
                            maxLength={13}
                            className={inputClass}
                          />
                          {phoneComplete && !hasSessionFor(customerPhone) && (
                            <p className="text-[0.7rem] text-neutral-500 text-center">
                              Onay için telefonunuza SMS ile doğrulama kodu gönderilecek.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  ),
                })}
              </div>
            </div>

            {/* ALT GEZİNTİ: Geri / İleri ya da Onayla */}
            {!bookingCodeSent && (
              <div className="flex gap-2 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-neutral-900">
                {step > 0 && (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="px-5 py-3 rounded-xl border border-neutral-700 text-neutral-300 hover:text-white"
                  >
                    Geri
                  </button>
                )}
                {step < 3 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={!canAdvance}
                    className="flex-1 py-3 rounded-xl font-semibold bg-bronze-400 hover:bg-bronze-300 text-neutral-950 disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {step === 1 && hasSelection ? `İleri · ${totalMinutes} dk` : "İleri"}
                  </button>
                ) : (
                  <button
                    onClick={handleBooking}
                    disabled={!canConfirm}
                    className="flex-1 py-3 rounded-xl font-semibold bg-bronze-400 hover:bg-bronze-300 text-neutral-950 disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {loading ? "İşleniyor..." : "Randevuyu Onayla"}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* RANDEVU ALINDI */}
        {activeTab === "book" && booked && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
            <CheckCircle size={48} className="text-bronze-400" />
            <h2 className="text-lg text-white">Randevunuz onaylandı</h2>
            <p className="text-sm text-neutral-300">
              {booked.label}
              <br />
              {booked.employee} ·{" "}
              {new Date(`${booked.date}T00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}{" "}
              {booked.time}
            </p>
            <p className="text-xs text-neutral-500">Randevu bilgileriniz SMS ile gönderilecek.</p>
            <div className="flex gap-2 mt-4 w-full">
              <button onClick={() => setActiveTab("appointments")} className="flex-1 py-3 rounded-xl border border-neutral-700 text-neutral-300">
                Randevularım
              </button>
              <button onClick={startOver} className="flex-1 py-3 rounded-xl bg-bronze-400 text-neutral-950 font-semibold">
                Yeni Randevu
              </button>
            </div>
          </div>
        )}

        {/* 2. RANDEVULARIM */}
        {activeTab === "appointments" && (
          <div className="flex-1 min-h-0 flex flex-col px-4 pt-4 pb-4">
            {!customerToken ? (
              codeSent ? (
                <CodeVerification
                  phone={searchPhone}
                  submitLabel="Doğrula ve Randevularımı Göster"
                  onVerified={(token) => startCustomerSession(token, searchPhone)}
                  onBack={() => setCodeSent(false)}
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-400">Randevularınızı görmek için telefon numaranızı doğrulayın.</p>
                  <input
                    type="tel"
                    placeholder="Telefon (05XX XXX XXXX)"
                    autoComplete="tel"
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(formatPhoneNumber(e.target.value))}
                    maxLength={13}
                    className={inputClass}
                  />
                  <button
                    onClick={handleRequestCode}
                    disabled={searchPhone.length < 13 || searchLoading}
                    className="w-full bg-bronze-400 hover:bg-bronze-300 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-semibold p-3 rounded-xl transition-colors"
                  >
                    {searchLoading ? "Gönderiliyor..." : "Doğrulama Kodu Gönder"}
                  </button>
                </div>
              )
            ) : (
              <>
                <div className="flex justify-between items-center mb-3 bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                  <span className="flex items-center gap-2 text-sm text-neutral-300">
                    <CheckCircle size={16} className="text-bronze-400" /> {verifiedPhone}
                  </span>
                  <button
                    onClick={resetCustomerVerification}
                    className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors"
                  >
                    <LogOut size={14} /> Çıkış
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                  {searchLoading ? (
                    <p className="text-center text-neutral-400 py-4">Aranıyor...</p>
                  ) : myAppointments.length > 0 ? (
                    myAppointments.map((app) => (
                      <div key={app.id} className="bg-neutral-900 p-3 rounded-xl border border-neutral-800 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-white">
                            {new Date(app.startTime).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" })}
                          </span>
                          <span className="text-bronze-400 font-bold">
                            {new Date(app.startTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-neutral-400 mt-1">
                          {app.serviceName} · {app.employeeName}
                        </p>
                        <div className="flex justify-between items-center mt-2">
                          {app.status === "CANCELLED" ? (
                            <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                              <XCircle size={14} /> İptal Edildi
                            </span>
                          ) : app.status === "NO_SHOW" ? (
                            <span className="inline-flex items-center gap-1 text-neutral-400 text-xs font-medium">
                              <XCircle size={14} /> Gelinmedi
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-bronze-400 text-xs font-medium">
                              <CheckCircle size={14} /> Onaylı
                            </span>
                          )}
                          {app.status !== "CANCELLED" && new Date(app.startTime) > new Date() && (
                            <button
                              onClick={() => handleCustomerCancel(app.id)}
                              className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                            >
                              İptal Et
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-neutral-400 py-8 bg-neutral-900 rounded-xl text-sm">
                      Bu numaraya ait randevu bulunamadı.
                    </p>
                  )}
                </div>
                {myAppointments.length > 0 && (
                  <p className="text-center text-[0.7rem] text-neutral-500 pt-2">
                    Son 1 haftadaki ve ileri tarihli randevularınız gösterilir.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default BookingPage;
