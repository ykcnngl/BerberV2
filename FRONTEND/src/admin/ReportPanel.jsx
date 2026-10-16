import { useEffect, useState } from "react";
import { Calendar, Download, TriangleAlert } from "lucide-react";
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

// Kâr/zarar dökümünün bir satırı
function Line({ label, value, sign = "", strong = false, color = "text-neutral-200" }) {
  return (
    <div className={`flex justify-between py-1 ${strong ? "border-t border-neutral-700 mt-1 pt-2 font-bold text-base" : "text-sm"}`}>
      <span className={strong ? "text-white" : "text-neutral-400"}>{label}</span>
      <span className={color}>
        {sign}
        {formatMoney(value)}
      </span>
    </div>
  );
}

const card = "bg-neutral-800 rounded-xl p-3 border border-neutral-700";

// Rapordaki ödeme yöntemleri (backend: employees[].payments)
const PAYMENT_ROWS = [
  ["cash", "Nakit"],
  ["card", "Kart"],
  ["transfer", "IBAN"],
  ["unknown", "Belirtilmemiş"],
];

// Muhasebe raporu. Üstten "Toplam" ya da bir çalışan seçilir.
// Gelir: saati geçmiş, iptal edilmemiş ve "gelmedi" işaretlenmemiş randevular (indirimli tutarla) + kasadan
// girilen randevusuz satışlar. Net = gelir − giderler − primler − POS komisyonu.
function ReportPanel({ adminApi, employees }) {
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

  // Mali müşavir için Excel (CSV). Şifre başlığı gerektiği için dosya axios ile indirilir.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await adminApi.get("/report/export", { params: { from, to }, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `muhasebe_${from}_${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Dosya indirilemedi.");
    }
    setExporting(false);
  };

  const selectedEmployee = report?.employees.find((e) => e.employeeId === selectedId);
  const hasUnknown = report?.payments.unknown > 0;
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
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-300">
          <Calendar size={14} className="shrink-0" />
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          <span>—</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          <button
            onClick={exportCsv}
            disabled={exporting || !from || !to}
            className="ml-auto flex items-center gap-1 text-xs bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg"
            title="Mali müşavir için Excel dosyası"
          >
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* GİDERLER görünümü */}
      {view === "expenses" && from && to && (
        <>
          {report && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Gelir", report.revenue.total, "text-emerald-400"],
                ["Gider + Prim + POS + KDV", report.expenses + report.commissions + report.posFee + report.vat, "text-red-300"],
                ["Net", report.net, report.net < 0 ? "text-red-400" : "text-white"],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-neutral-800 rounded-xl p-3 border border-neutral-700">
                  <p className="text-xs text-neutral-400">{label}</p>
                  <p className={`text-sm md:text-lg font-bold ${color}`}>{formatMoney(value)}</p>
                </div>
              ))}
            </div>
          )}
          <ExpensesSection adminApi={adminApi} employees={employees} from={from} to={to} onChanged={fetchReport} />
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
        <div className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
          <div className={`${card} space-y-3`}>
            <h2 className="text-sm font-semibold text-white">
              {title} <span className="font-normal text-neutral-500">· {rangeText}</span>
            </h2>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-neutral-900 rounded-lg p-2.5 border border-neutral-700">
                <p className="text-xs text-neutral-400">{selectedEmployee ? "Hizmet Cirosu" : "Toplam Gelir"}</p>
                <p className="text-lg md:text-2xl font-bold text-emerald-400">
                  {formatMoney(selectedEmployee ? stats.revenue : report.revenue.total)}
                </p>
              </div>
              <div className="bg-neutral-900 rounded-lg p-2.5 border border-neutral-700">
                <p className="text-xs text-neutral-400">İşlem Sayısı</p>
                <p className="text-lg md:text-2xl font-bold text-white">
                  {stats.count}
                  {stats.walkInCount > 0 && (
                    <span className="text-xs font-normal text-neutral-500"> ({stats.walkInCount} randevusuz)</span>
                  )}
                </p>
              </div>
            </div>

            {/* Kâr / zarar (tüm salon) */}
            {!selectedEmployee && (
              <div className="bg-neutral-900 rounded-lg px-3 py-2 border border-neutral-700">
                <Line label="Hizmet cirosu" value={report.revenue.services} />
                {report.revenue.products > 0 && <Line label="Ürün satışı" value={report.revenue.products} />}
                <Line label="Giderler" value={report.expenses} sign="− " color="text-red-300" />
                {report.commissions > 0 && <Line label="Çalışan primleri" value={report.commissions} sign="− " color="text-red-300" />}
                {report.vat > 0 && (
                  <Line label={`KDV (%${String(report.vatRate).replace(".", ",")}, gelirin içindeki)`} value={report.vat} sign="− " color="text-red-300" />
                )}
                {report.posFee > 0 && (
                  <Line label={`POS komisyonu (%${String(report.cardCommissionRate).replace(".", ",")})`} value={report.posFee} sign="− " color="text-red-300" />
                )}
                <Line label="Net kâr" value={report.net} strong color={report.net < 0 ? "text-red-400" : "text-emerald-400"} />
              </div>
            )}

            {/* Çalışan hakedişi */}
            {selectedEmployee && (
              <div className="bg-neutral-900 rounded-lg px-3 py-2 border border-neutral-700">
                <Line
                  label={selectedEmployee.commissionRate ? `Prim (%${String(selectedEmployee.commissionRate).replace(".", ",")})` : "Prim (oran girilmedi)"}
                  value={selectedEmployee.commission}
                />
                <Line label="Maaş / personel giderleri" value={selectedEmployee.salary} />
                <Line label="Toplam hakediş" value={selectedEmployee.payable} strong color="text-white" />
              </div>
            )}

            {/* Çalışanın ödeme yöntemine göre işlemleri */}
            {selectedEmployee && selectedEmployee.stats.count > 0 && (
              <Table
                headers={["Ödeme", "İşlem", "Tutar"]}
                rows={PAYMENT_ROWS.filter(([key]) => key !== "unknown" || selectedEmployee.payments.unknown.count > 0).map(
                  ([key, label]) => ({
                    key,
                    cells: [label, selectedEmployee.payments[key].count, formatMoney(selectedEmployee.payments[key].amount)],
                  }),
                )}
              />
            )}

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
              <p className="text-center text-neutral-400 py-6 bg-neutral-900 rounded-lg">Bu tarihlerde yapılmış işlem yok.</p>
            )}

            {!selectedEmployee && report.products.length > 0 && (
              <Table
                headers={["Ürün", "Adet", "Tutar"]}
                rows={report.products.map((p) => ({
                  key: p.productName,
                  cells: [p.productName, p.count, formatMoney(p.revenue)],
                }))}
              />
            )}

            {stats.noShowCount > 0 && (
              <p className="text-sm text-amber-400">Gelmeyen müşteri: {stats.noShowCount} (ciroya dahil değil)</p>
            )}
          </div>

          {/* Tahsilat: ödeme yöntemine göre */}
          {!selectedEmployee && report.revenue.total > 0 && (
            <div className={card}>
              <h2 className="text-sm font-semibold text-white mb-1">Tahsilat</h2>
              <Line label="Nakit" value={report.payments.cash} />
              <Line label="Kart (POS)" value={report.payments.card} />
              <Line label="IBAN / Havale" value={report.payments.transfer} />
              {report.payments.unknown > 0 && (
                <p className="text-xs text-amber-400 flex items-start gap-1.5 mt-1">
                  <TriangleAlert size={14} className="shrink-0 mt-px" />
                  {formatMoney(report.payments.unknown)} tutarındaki randevunun ödeme yöntemi işaretlenmedi.
                </p>
              )}
            </div>
          )}

          {/* Giderlerin kategorilere dağılımı */}
          {!selectedEmployee && report.expenseCategories.length > 0 && (
            <div className={`${card} space-y-2`}>
              <h2 className="text-sm font-semibold text-white">Gider Dağılımı</h2>
              {report.expenseCategories.map((c) => (
                <div key={c.category} className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-300">{c.label}</span>
                    <span className="text-red-300">{formatMoney(c.amount)}</span>
                  </div>
                  <div className="h-1.5 bg-neutral-900 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-red-400/70 rounded-full" style={{ width: `${(c.amount / report.expenses) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* 4. Toplam seçiliyken çalışanların özeti ve hakedişleri; satıra tıklayınca o çalışana geçilir */}
      {view === "summary" && report && !selectedEmployee && report.employees.length > 0 && (
        <div className={card}>
          <h2 className="text-sm font-semibold text-white">
            Çalışanlar <span className="font-normal text-xs text-neutral-500">· detay için isme dokunun</span>
          </h2>
          <Table
            headers={["Çalışan", "İşlem", "Ciro", "Hakediş"]}
            rows={report.employees.map((e) => ({
              key: e.employeeId,
              cells: [e.employeeName, e.stats.count, formatMoney(e.stats.revenue), formatMoney(e.payable)],
            }))}
            onRowClick={setSelectedId}
          />
        </div>
      )}

      {/* 5. Çalışanlara göre tahsilat: kim kaç işlemi nakit / kart / IBAN ile aldı */}
      {view === "summary" && report && !selectedEmployee && report.employees.some((e) => e.stats.count > 0) && (
        <div className={card}>
          <h2 className="text-sm font-semibold text-white">Çalışanlara Göre Tahsilat</h2>
          <Table
            headers={["Çalışan", ...PAYMENT_ROWS.filter(([key]) => key !== "unknown" || hasUnknown).map(([, label]) => label)]}
            rows={report.employees
              .filter((e) => e.stats.count > 0)
              .map((e) => ({
                key: e.employeeId,
                cells: [
                  e.employeeName,
                  ...PAYMENT_ROWS.filter(([key]) => key !== "unknown" || hasUnknown).map(([key]) => (
                    <span key={key} className="block leading-tight">
                      {e.payments[key].count} işlem
                      <span className="block text-xs text-neutral-500">{formatMoney(e.payments[key].amount)}</span>
                    </span>
                  )),
                ],
              }))}
            onRowClick={setSelectedId}
          />
          <p className="text-xs text-neutral-500 mt-2">Randevusuz satışlar ürünler dahil tüm tutarıyla satışı yapan çalışana yazılır.</p>
        </div>
      )}
    </div>
  );
}

export default ReportPanel;
