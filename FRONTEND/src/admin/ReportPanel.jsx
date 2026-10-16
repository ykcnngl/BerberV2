import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { getErrorMessage } from "../api";
import { formatDate, formatMoney, getLocalDateStr, toLocalDateStr } from "../utils";
import ExpensesSection from "./ExpensesSection";

const inputClass =
  "bg-neutral-900 border border-neutral-600 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]";

const chipClass = (active) =>
  `py-1.5 px-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
    active
      ? "bg-emerald-600 text-white"
      : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-700"
  }`;

// Hazır tarih aralıkları (Pazartesi haftanın ilk günü)
const presets = () => {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const t = toLocalDateStr(today);
  return [
    { label: "Bugün", from: t, to: t },
    { label: "Dün", from: toLocalDateStr(yesterday), to: toLocalDateStr(yesterday) },
    { label: "Bu Hafta", from: toLocalDateStr(monday), to: t },
    { label: "Bu Ay", from: toLocalDateStr(firstOfMonth), to: t },
  ];
};

// Basit tablo: başlık satırı + satırlar; onRowClick verilirse satırlar tıklanabilir
function Table({ headers, rows, onRowClick }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-neutral-400 border-b border-neutral-700">
          {headers.map((h, i) => (
            <th key={h} className={`py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.key}
            onClick={onRowClick ? () => onRowClick(row.key) : undefined}
            className={`border-b border-neutral-700/50 last:border-0 ${onRowClick ? "cursor-pointer hover:bg-neutral-700/40" : ""}`}
          >
            {row.cells.map((c, i) => (
              <td key={i} className={`py-2 ${i === 0 ? "text-left text-white" : "text-right text-neutral-200"}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Ciro ve kim hangi hizmetten kaç işlem yaptı. Üstten "Toplam" ya da bir çalışan seçilir.
// Saati geçmiş, iptal edilmemiş ve "gelmedi" işaretlenmemiş randevular sayılır; indirim yapılan
// randevularda düzenlenmiş tutar kullanılır. "Toplam"da giderler ve net kâr da gösterilir.
function ReportPanel({ adminApi }) {
  const [from, setFrom] = useState(getLocalDateStr());
  const [to, setTo] = useState(getLocalDateStr());
  const [selectedId, setSelectedId] = useState(null); // null = Toplam
  const [view, setView] = useState("summary"); // "summary" = Özet, "expenses" = Giderler
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await adminApi.get("/report", { params: { from, to } });
      setReport(response.data);
    } catch (error) {
      alert(getErrorMessage(error, "Rapor yüklenemedi."));
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (from && to) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const selectedEmployee = report?.employees.find((e) => e.employeeId === selectedId);
  const stats = selectedEmployee ? selectedEmployee.stats : report?.total;
  const title = selectedEmployee ? selectedEmployee.employeeName : "Toplam (Tüm Salon)";
  const rangeText = from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;

  return (
    <div className="space-y-3">
      {/* Özet / Giderler */}
      <div className="grid grid-cols-2 gap-1 bg-neutral-800 p-1 rounded-xl border border-neutral-700">
        {[
          ["summary", "Özet"],
          ["expenses", "Giderler"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`py-2 rounded-lg text-sm font-medium ${view === id ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 1. Tarih seçimi */}
      <div className="bg-neutral-800 rounded-xl p-3 border border-neutral-700 space-y-2">
        <div className="grid grid-cols-4 gap-1.5">
          {presets().map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setFrom(p.from);
                setTo(p.to);
              }}
              className={chipClass(from === p.from && to === p.to)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-sm text-neutral-300">
          <Calendar size={14} className="shrink-0" />
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          <span>—</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </div>
      </div>

      {/* GİDERLER görünümü */}
      {view === "expenses" && from && to && (
        <>
          {report && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Ciro", report.total.revenue, "text-emerald-400"],
                ["Gider", report.expenses, "text-red-300"],
                ["Net", report.net, report.net < 0 ? "text-red-400" : "text-white"],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-neutral-800 rounded-xl p-3 border border-neutral-700">
                  <p className="text-xs text-neutral-400">{label}</p>
                  <p className={`text-sm md:text-lg font-bold ${color}`}>{formatMoney(value)}</p>
                </div>
              ))}
            </div>
          )}
          <ExpensesSection adminApi={adminApi} from={from} to={to} onChanged={fetchReport} />
        </>
      )}

      {/* 2. Kimin raporu: Toplam ya da tek çalışan */}
      {view === "summary" && report && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelectedId(null)} className={chipClass(!selectedEmployee)}>
            Toplam
          </button>
          {report.employees.map((emp) => (
            <button
              key={emp.employeeId}
              onClick={() => setSelectedId(emp.employeeId)}
              className={chipClass(selectedId === emp.employeeId)}
            >
              {emp.employeeName}
            </button>
          ))}
        </div>
      )}

      {/* 3. Sonuç */}
      {view !== "summary" ? null : loading && !report ? (
        <p className="text-center text-neutral-400 py-4">Rapor yükleniyor...</p>
      ) : stats ? (
        <div className={`bg-neutral-800 rounded-xl p-3 border border-neutral-700 space-y-3 ${loading ? "opacity-60" : ""}`}>
          <div>
            <h2 className="text-sm font-semibold text-white">
              {title} <span className="font-normal text-neutral-500">· {rangeText}</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-neutral-900 rounded-lg p-2.5 border border-neutral-700">
              <p className="text-xs text-neutral-400">Ciro</p>
              <p className="text-lg md:text-2xl font-bold text-emerald-400">{formatMoney(stats.revenue)}</p>
            </div>
            <div className="bg-neutral-900 rounded-lg p-2.5 border border-neutral-700">
              <p className="text-xs text-neutral-400">İşlem Sayısı</p>
              <p className="text-lg md:text-2xl font-bold text-white">{stats.count}</p>
            </div>
            {!selectedEmployee && (
              <>
                <div className="bg-neutral-900 rounded-lg p-2.5 border border-neutral-700">
                  <p className="text-xs text-neutral-400">Gider</p>
                  <p className="text-lg md:text-2xl font-bold text-red-300">{formatMoney(report.expenses)}</p>
                </div>
                <div className="bg-neutral-900 rounded-lg p-2.5 border border-neutral-700">
                  <p className="text-xs text-neutral-400">Net (Ciro − Gider)</p>
                  <p className={`text-lg md:text-2xl font-bold ${report.net < 0 ? "text-red-400" : "text-white"}`}>
                    {formatMoney(report.net)}
                  </p>
                </div>
              </>
            )}
          </div>

          {stats.packages.length > 0 && (
            <Table
              headers={["Paket", "Adet", "Tutar"]}
              rows={stats.packages.map((p) => ({
                key: p.packageName,
                cells: [p.packageName, p.count, formatMoney(p.revenue)],
              }))}
            />
          )}

          {stats.services.length ? (
            <Table
              headers={["Hizmet", "Adet", "Tutar"]}
              rows={stats.services.map((s) => ({
                key: s.serviceName,
                cells: [s.serviceName, s.count, formatMoney(s.revenue)],
              }))}
            />
          ) : (
            <p className="text-center text-neutral-400 py-6 bg-neutral-900 rounded-lg">
              Bu tarihlerde yapılmış işlem yok.
            </p>
          )}

          {stats.noShowCount > 0 && (
            <p className="text-sm text-amber-400">
              Gelmeyen müşteri: {stats.noShowCount} (ciroya dahil değil)
            </p>
          )}
        </div>
      ) : null}

      {/* 4. Toplam seçiliyken çalışanların özeti; satıra tıklayınca o çalışana geçilir */}
      {view === "summary" && report && !selectedEmployee && report.employees.length > 0 && (
        <div className="bg-neutral-800 rounded-xl p-3 border border-neutral-700">
          <h2 className="text-sm font-semibold text-white">
            Çalışanlar <span className="font-normal text-xs text-neutral-500">· detay için isme dokunun</span>
          </h2>
          <Table
            headers={["Çalışan", "İşlem", "Ciro"]}
            rows={report.employees.map((e) => ({
              key: e.employeeId,
              cells: [e.employeeName, e.stats.count, formatMoney(e.stats.revenue)],
            }))}
            onRowClick={setSelectedId}
          />
        </div>
      )}
    </div>
  );
}

export default ReportPanel;
