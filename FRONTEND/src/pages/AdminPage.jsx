import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { BarChart3, CalendarDays, Images, Lock, LogOut, Package, Scissors, ShieldCheck, Users } from "lucide-react";
import { API_URL, getErrorMessage } from "../api";
import siteConfig from "../siteConfig";
import AppointmentsPanel from "../admin/AppointmentsPanel";
import EmployeesPanel from "../admin/EmployeesPanel";
import GalleryPanel from "../admin/GalleryPanel";
import PackagesPanel from "../admin/PackagesPanel";
import ReportPanel from "../admin/ReportPanel";
import ServicesPanel from "../admin/ServicesPanel";

// Yönetici paneli (/yonetim). Şifre sadece bellekte tutulur; sayfa yenilenince tekrar giriş istenir.
function AdminPage() {
  const [password, setPassword] = useState(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [activeTab, setActiveTab] = useState("appointments");
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);

  // Tüm yönetici isteklerine şifre başlığı eklenir; 401 gelirse oturum kapatılır
  const adminApi = useMemo(() => {
    const api = axios.create({
      baseURL: `${API_URL}/admin`,
      headers: { "X-Admin-Password": password },
    });
    api.interceptors.response.use(undefined, (error) => {
      if (error.response?.status === 401) setPassword(null);
      return Promise.reject(error);
    });
    return api;
  }, [password]);

  const loadEmployees = async () => {
    try {
      const response = await adminApi.get("/employees");
      setEmployees(response.data);
    } catch (error) {
      alert(getErrorMessage(error, "Çalışanlar yüklenemedi."));
    }
  };

  // Pasif hizmetler dahil tüm hizmetler
  const loadServices = async () => {
    try {
      const response = await adminApi.get("/services");
      setServices(response.data);
    } catch (error) {
      alert(getErrorMessage(error, "Hizmetler yüklenemedi."));
    }
  };

  useEffect(() => {
    document.title = `Yönetim | ${siteConfig.name}`;
  }, []);

  useEffect(() => {
    if (!password) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEmployees();
    loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/admin/login`, { password: passwordInput });
      setPassword(passwordInput);
    } catch (error) {
      alert(getErrorMessage(error, "Giriş yapılamadı."));
    }
    setPasswordInput("");
  };

  if (!password) {
    return (
      <div className="min-h-screen bg-neutral-900 text-neutral-100 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="max-w-sm w-full bg-neutral-800 rounded-2xl shadow-xl p-8 border border-neutral-700 flex flex-col items-center"
        >
          <div className="w-16 h-16 bg-neutral-700 rounded-full flex items-center justify-center mb-6 border-4 border-neutral-600">
            <Lock size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Yetkili Girişi</h1>
          <p className="text-sm text-neutral-400 mb-6 text-center">
            Bu alanı sadece işletme yetkilileri görüntüleyebilir.
          </p>
          <input
            type="password"
            placeholder="Yönetici Şifresi"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            className="w-full text-center bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 mb-4 tracking-widest"
          />
          <button
            type="submit"
            disabled={!passwordInput}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold p-3 rounded-lg transition-colors"
          >
            Giriş Yap
          </button>
          <Link to="/" className="mt-6 text-sm text-neutral-500 hover:text-neutral-300">
            Siteye dön
          </Link>
        </form>
      </div>
    );
  }

  // Menü: telefonda 3'erli iki satır, geniş ekranda tek satır; yana taşmaz
  const tabs = [
    { id: "appointments", label: "Randevular", icon: CalendarDays },
    { id: "report", label: "Rapor", icon: BarChart3 },
    { id: "employees", label: "Çalışanlar", icon: Users },
    { id: "services", label: "Hizmetler", icon: Scissors },
    { id: "packages", label: "Paketler", icon: Package },
    { id: "gallery", label: "Galeri", icon: Images },
  ];

  return (
    <div className="h-[100dvh] bg-neutral-900 text-neutral-100 flex justify-center">
      <div className="w-full max-w-3xl flex flex-col h-full">
        <header className="flex items-center justify-between px-4 pt-3 pb-2">
          <h1 className="text-base md:text-lg font-bold text-emerald-400 flex items-center gap-2">
            <ShieldCheck size={20} /> Yönetici Paneli
          </h1>
          <button
            onClick={() => setPassword(null)}
            className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white"
          >
            <LogOut size={16} /> Çıkış
          </button>
        </header>

        <nav className="mx-4 grid grid-cols-3 sm:grid-cols-6 gap-1 bg-neutral-800 p-1 rounded-xl border border-neutral-700">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === id ? "bg-emerald-600 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>

        {/* Sekme içeriği ekranın kalanını kullanır; uzun listeler yalnızca bu alanın içinde kayar */}
        <main className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {activeTab === "appointments" && <AppointmentsPanel adminApi={adminApi} employees={employees} />}
        {activeTab === "report" && <ReportPanel adminApi={adminApi} />}
        {activeTab === "employees" && (
          <EmployeesPanel
            adminApi={adminApi}
            employees={employees}
            services={services}
            onChanged={loadEmployees}
          />
        )}
        {activeTab === "services" && (
          <ServicesPanel
            adminApi={adminApi}
            services={services}
            employees={employees}
            onChanged={() => Promise.all([loadServices(), loadEmployees()])}
          />
        )}
        {activeTab === "packages" && <PackagesPanel adminApi={adminApi} services={services} employees={employees} />}
        {activeTab === "gallery" && <GalleryPanel adminApi={adminApi} />}
        </main>
      </div>
    </div>
  );
}

export default AdminPage;
