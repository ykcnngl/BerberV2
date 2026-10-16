import { useEffect, useState } from "react";
import { Banknote, Calendar, CreditCard, Landmark, Minus, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { getErrorMessage } from "../api";
import { PAYMENT_METHODS, formatMoney, getLocalDateStr, paymentLabel } from "../utils";

const inputClass =
  "bg-neutral-900 border border-neutral-600 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-emerald-500 [color-scheme:dark]";

const chipClass = (active) =>
  `py-1.5 px-3 rounded-md text-xs font-medium transition-colors border ${
    active ? "bg-emerald-600 text-white border-emerald-500" : "bg-neutral-900 text-neutral-300 hover:text-white border-neutral-700"
  }`;

const PAYMENT_ICONS = { CASH: Banknote, CARD: CreditCard, TRANSFER: Landmark };

const nowTime = () => new Date().toTimeString().slice(0, 5);

// Randevusuz gelen müşteriye satış: çalışan, hizmetler ve/veya ürünler, ödeme yöntemi
function SaleForm({ adminApi, date, employees, services, products, onSaved }) {
  const [employeeId, setEmployeeId] = useState(null);
  const [lines, setLines] = useState([]); // { kind, id, name, quantity, price }
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [time, setTime] = useState(nowTime());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const activeEmployees = employees.filter((e) => e.active);
  const employee = employees.find((e) => e.id === employeeId);
  // Çalışan seçiliyse yalnızca verdiği hizmetler
  const availableServices = services.filter((s) => s.active && (!employee || employee.serviceIds.includes(s.id)));
  const availableProducts = products.filter((p) => p.active);
  const total = lines.reduce((sum, l) => sum + (Number(l.price) || 0) * l.quantity, 0);
  const hasService = lines.some((l) => l.kind === "SERVICE");

  const add = (kind, item) =>
    setLines((list) => {
      const existing = list.find((l) => l.kind === kind && l.id === item.id);
      if (existing) return list.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [...list, { kind, id: item.id, name: item.name, quantity: 1, price: item.price == null ? "" : String(item.price) }];
    });

  const update = (line, changes) => setLines((list) => list.map((l) => (l === line ? { ...l, ...changes } : l)));
  const remove = (line) => setLines((list) => list.filter((l) => l !== line));

  const reset = () => {
    setLines([]);
    setPaymentMethod(null);
    setNote("");
    setTime(nowTime());
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.post("/sales", {
        employeeId,
        paymentMethod,
        note,
        time: `${date}T${time}`,
        items: lines.map((l) => ({ kind: l.kind, id: l.id, quantity: l.quantity, price: l.price })),
      });
      reset();
      onSaved();
    } catch (error) {
      alert(getErrorMessage(error, "Satış kaydedilemedi."));
    }
    setSaving(false);
  };

  const missing = !lines.length
    ? "Hizmet veya ürün ekleyin"
    : hasService && !employeeId
      ? "Çalışanı seçin"
      : lines.some((l) => l.price === "")
        ? "Fiyatı boş kalem var"
        : !paymentMethod
          ? "Ödeme yöntemini seçin"
          : null;

  return (
    <div className="bg-neutral-800 rounded-xl p-3 border border-neutral-700 space-y-3">
      <h2 className="font-semibold text-white">Yeni Satış <span className="text-xs font-normal text-neutral-500">· randevusuz müşteri</span></h2>

      <div>
        <p className="text-xs text-neutral-400 mb-1.5">İşlemi yapan</p>
        <div className="flex flex-wrap gap-1.5">
          {activeEmployees.map((e) => (
            <button key={e.id} onClick={() => setEmployeeId(employeeId === e.id ? null : e.id)} className={chipClass(employeeId === e.id)}>
              {e.firstName} {e.lastName}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-neutral-400 mb-1.5">Hizmet ekle</p>
        <div className="flex flex-wrap gap-1.5">
          {availableServices.map((s) => (
            <button key={s.id} onClick={() => add("SERVICE", s)} className={chipClass(false)}>
              + {s.name} {s.price != null && <span className="text-neutral-500">{formatMoney(s.price)}</span>}
            </button>
          ))}
        </div>
      </div>

      {availableProducts.length > 0 && (
        <div>
          <p className="text-xs text-neutral-400 mb-1.5">Ürün ekle</p>
          <div className="flex flex-wrap gap-1.5">
            {availableProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => add("PRODUCT", p)}
                disabled={p.stock <= 0}
                className={`${chipClass(false)} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                + {p.name} <span className="text-neutral-500">{formatMoney(p.price)} · {p.stock} ad.</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <ul className="divide-y divide-neutral-700/60 bg-neutral-900 rounded-lg px-3">
          {lines.map((l) => (
            <li key={`${l.kind}-${l.id}`} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate text-white">{l.name}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => (l.quantity > 1 ? update(l, { quantity: l.quantity - 1 }) : remove(l))}
                  className="p-1 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                  aria-label="Azalt"
                >
                  <Minus size={12} />
                </button>
                <span className="w-6 text-center text-white">{l.quantity}</span>
                <button onClick={() => update(l, { quantity: l.quantity + 1 })} className="p-1 rounded bg-neutral-800 text-neutral-300 hover:text-white" aria-label="Artır">
                  <Plus size={12} />
                </button>
              </div>
              <input
                type="number"
                min={0}
                step="any"
                value={l.price}
                placeholder="₺"
                onChange={(e) => update(l, { price: e.target.value })}
                className={`${inputClass} w-20 text-right`}
                aria-label="Birim fiyat"
              />
              <button onClick={() => remove(l)} className="p-1 text-neutral-500 hover:text-red-400" aria-label="Kaldır">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {PAYMENT_METHODS.map(({ value, label }) => {
          const Icon = PAYMENT_ICONS[value];
          return (
            <button
              key={value}
              onClick={() => setPaymentMethod(value)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border ${
                paymentMethod === value ? "bg-emerald-600 border-emerald-500 text-white" : "bg-neutral-900 border-neutral-700 text-neutral-300"
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${inputClass} w-28`} aria-label="Saat" />
        <input
          placeholder="Not (isteğe bağlı)"
          value={note}
          maxLength={120}
          onChange={(e) => setNote(e.target.value)}
          className={`${inputClass} flex-1 min-w-32`}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-bold text-emerald-400">{formatMoney(total)}</p>
        <button
          onClick={save}
          disabled={saving || Boolean(missing)}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-400 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          {saving ? "Kaydediliyor..." : missing || "Satışı Kaydet"}
        </button>
      </div>
    </div>
  );
}

// Kasa: günün randevusuz satışları ve gün sonu tahsilat özeti (randevular + satışlar, ödeme yöntemine göre)
function SalesPanel({ adminApi, employees, services }) {
  const [date, setDate] = useState(getLocalDateStr());
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [report, setReport] = useState(null);

  const load = async () => {
    try {
      const [salesRes, productsRes, reportRes] = await Promise.all([
        adminApi.get("/sales", { params: { date } }),
        adminApi.get("/products"),
        // Gün sonu: sabit aylık giderler (kira vb.) günlük hesaba katılmaz
        adminApi.get("/report", { params: { from: date, to: date, fixed: 0 } }),
      ]);
      setSales(salesRes.data);
      setProducts(productsRes.data);
      setReport(reportRes.data);
    } catch (error) {
      alert(getErrorMessage(error, "Kasa bilgileri yüklenemedi."));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handleDelete = async (sale) => {
    if (!window.confirm(`${formatMoney(sale.total)} tutarındaki satış silinsin mi? Ürünler stoğa geri eklenir.`)) return;
    try {
      await adminApi.delete(`/sales/${sale.id}`);
      load();
    } catch (error) {
      alert(getErrorMessage(error, "Satış silinemedi."));
    }
  };

  const payments = report?.payments;

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <Calendar size={14} className="shrink-0" />
        <input type="date" value={date} max={getLocalDateStr()} onChange={(e) => setDate(e.target.value)} className={`${inputClass} flex-1`} />
      </label>

      {/* Gün sonu kasa */}
      {payments && (
        <div className="bg-neutral-800 rounded-xl p-3 border border-neutral-700 space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-white">Gün Sonu</h2>
            <p className="text-sm text-neutral-400">
              Toplam <span className="text-emerald-400 font-bold">{formatMoney(report.revenue.total)}</span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Nakit (kasada)", payments.cash, Banknote],
              ["Kart (POS)", payments.card, CreditCard],
              ["IBAN", payments.transfer, Landmark],
            ].map(([label, value, Icon]) => (
              <div key={label} className="bg-neutral-900 rounded-lg p-2 border border-neutral-700">
                <p className="text-[0.7rem] text-neutral-400 flex items-center justify-center gap-1">
                  <Icon size={12} /> {label}
                </p>
                <p className="text-sm md:text-base font-bold text-white">{formatMoney(value)}</p>
              </div>
            ))}
          </div>
          {payments.unknown > 0 && (
            <p className="text-xs text-amber-400 flex items-start gap-1.5">
              <TriangleAlert size={14} className="shrink-0 mt-px" />
              {formatMoney(payments.unknown)} tutarındaki randevuların ödeme yöntemi işaretlenmedi. Randevular sekmesinden
              işaretleyin.
            </p>
          )}
        </div>
      )}

      <SaleForm adminApi={adminApi} date={date} employees={employees} services={services} products={products} onSaved={load} />

      <div className="bg-neutral-800 rounded-xl p-3 border border-neutral-700">
        <h2 className="font-semibold text-white mb-1">Satışlar ({sales.length})</h2>
        {sales.length === 0 ? (
          <p className="text-center text-neutral-500 py-4 bg-neutral-900 rounded-lg text-sm">Bu tarihte randevusuz satış yok.</p>
        ) : (
          <ul className="divide-y divide-neutral-700/60">
            {sales.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="text-neutral-400 w-11 shrink-0">{s.time.slice(11, 16)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-white truncate">
                    {s.items.map((i) => (i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name)).join(" + ")}
                  </span>
                  <span className="block text-xs text-neutral-500 truncate">
                    {[s.employeeName, paymentLabel(s.paymentMethod), s.note].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-emerald-400 whitespace-nowrap">{formatMoney(s.total)}</span>
                <button onClick={() => handleDelete(s)} className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-700" aria-label="Sil">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SalesPanel;
