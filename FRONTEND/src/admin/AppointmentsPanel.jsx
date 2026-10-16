import { useEffect, useState } from "react";
import { Calendar, Pencil, Phone, UserCircle, Wallet } from "lucide-react";
import { getErrorMessage } from "../api";
import { PAYMENT_METHODS, formatMoney, formatPhoneNumber, getLocalDateStr, paymentLabel } from "../utils";

const inputClass =
  "bg-neutral-900 border border-neutral-600 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-emerald-500";

const chip = (active) =>
  `px-2 py-1 rounded-md border transition-colors ${
    active ? "bg-emerald-600 border-emerald-500 text-white" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white"
  }`;

const DISCOUNTS = [10, 15, 20];

// Ödeme: kesimden sonra müşteriden alınan tutar ve yöntemi tek adımda girilir. Ödeme anında indirim yapılabilir
// (hazır yüzde ya da elle tutar); indirim yapıldıysa liste fiyatı üstü çizili gösterilir.
// Gün sonu kasa, POS komisyonu ve ciro bu bilgilerle hesaplanır.
function CheckoutRow({ app, adminApi, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState(null);
  const [saving, setSaving] = useState(false);
  const discounted = app.price != null && app.listPrice != null && app.price !== app.listPrice;
  const canPay = app.status === "CONFIRMED";

  const start = () => {
    setPrice(app.price == null ? "" : String(app.price));
    setNote(app.priceNote || "");
    setMethod(app.paymentMethod);
    setEditing(true);
  };

  const save = async (body) => {
    setSaving(true);
    try {
      const response = await adminApi.patch(`/appointments/${app.id}/payment`, body);
      onSaved(response.data);
      setEditing(false);
    } catch (error) {
      alert(getErrorMessage(error, "Ödeme kaydedilemedi."));
    }
    setSaving(false);
  };

  if (editing) {
    const atListPrice = app.listPrice != null && Number(price) === app.listPrice;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Liste fiyatında ve notsuz: indirim kaydı tutulmaz
          save({ method, price: atListPrice && !note.trim() ? null : price, note });
        }}
        className="space-y-2.5 bg-neutral-900 border border-neutral-700 rounded-lg p-3"
      >
        {app.listPrice != null && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-neutral-400 mr-1">İndirim:</span>
            <button
              type="button"
              onClick={() => setPrice(String(app.listPrice))}
              className={chip(atListPrice)}
            >
              Yok ({formatMoney(app.listPrice)})
            </button>
            {DISCOUNTS.map((d) => {
              const value = Math.round(app.listPrice * (1 - d / 100));
              return (
                <button key={d} type="button" onClick={() => setPrice(String(value))} className={chip(Number(price) === value)}>
                  %{d} → {formatMoney(value)}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-neutral-300 flex items-center gap-2">
            Alınan (₺)
            <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputClass} w-28`} />
          </label>
          <input
            placeholder="Not (örn. öğrenci indirimi)"
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
            className={`${inputClass} flex-1 min-w-40`}
          />
        </div>
        {canPay && (
          <div className="grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => setMethod(value)} className={`py-2 rounded-lg text-sm font-medium border ${
                method === value ? "bg-emerald-600 border-emerald-500 text-white" : "bg-neutral-800 border-neutral-700 text-neutral-300"
              }`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {canPay && app.paymentMethod && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ method: null })}
              className="mr-auto text-xs text-neutral-400 hover:text-red-400 underline"
            >
              Ödemeyi kaldır
            </button>
          )}
          <button type="button" onClick={() => setEditing(false)} className="text-sm px-3 py-1.5 text-neutral-400 hover:text-white">
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={saving || price === "" || (canPay && !method)}
            className="text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-400 text-white px-4 py-1.5 rounded-lg"
          >
            {saving ? "Kaydediliyor..." : canPay && !method ? "Ödeme yöntemi seçin" : "Kaydet"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-neutral-400">Tutar:</span>
      {app.price == null ? (
        <span className="text-amber-400">fiyat girilmedi</span>
      ) : (
        <span className="text-white font-semibold">{formatMoney(app.price)}</span>
      )}
      {discounted && <span className="text-neutral-500 line-through">{formatMoney(app.listPrice)}</span>}
      {app.priceNote && <span className="text-neutral-400">· {app.priceNote}</span>}
      {canPay &&
        (app.paymentMethod ? (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">{paymentLabel(app.paymentMethod)}</span>
        ) : (
          <span className="text-xs text-amber-400">· ödeme alınmadı</span>
        ))}
      {app.status !== "CANCELLED" && app.status !== "NO_SHOW" && (
        app.paymentMethod || !canPay ? (
          <button onClick={start} className="ml-auto text-xs text-neutral-400 hover:text-white flex items-center gap-1">
            <Pencil size={12} /> Düzenle
          </button>
        ) : (
          <button onClick={start} className="ml-auto text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-md flex items-center gap-1">
            <Wallet size={12} /> Ödeme Al
          </button>
        )
      )}
    </div>
  );
}

// Seçilen çalışanın günlük randevuları; yönetici iptal ederse müşteriye SMS gider
function AppointmentsPanel({ adminApi, employees }) {
  const [employeeId, setEmployeeId] = useState(null);
  const [date, setDate] = useState(getLocalDateStr());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);

  const selectedId = employeeId || employees.find((e) => e.active)?.id || employees[0]?.id;
  const selected = employees.find((e) => e.id === selectedId);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const response = await adminApi.get("/appointments", {
        params: { employeeId: selectedId, date },
      });
      setAppointments(response.data);
    } catch (error) {
      alert(getErrorMessage(error, "Randevular yüklenemedi."));
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedId && date) fetchAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, date]);

  const handleCancel = async (id) => {
    if (!window.confirm("Bu randevuyu iptal etmek istediğinize emin misiniz? Müşteriye SMS ile bildirilecek."))
      return;
    try {
      const response = await adminApi.patch(`/appointments/${id}/cancel`);
      alert(response.data.message);
      fetchAppointments();
    } catch (error) {
      alert(getErrorMessage(error, "Randevu iptal edilirken bir hata oluştu."));
    }
  };

  // Saati geçmiş randevu: müşteri gelmediyse işaretlenir (ciroya sayılmaz), yanlışlıkla yapıldıysa geri alınır
  const handleNoShow = async (app, noShow) => {
    try {
      const response = await adminApi.patch(`/appointments/${app.id}/no-show`, { noShow });
      setAppointments((list) => list.map((a) => (a.id === app.id ? response.data : a)));
    } catch (error) {
      alert(getErrorMessage(error, "İşlem yapılamadı."));
    }
  };

  const badge = {
    CANCELLED: { label: "İPTAL", className: "bg-red-500/20 text-red-400" },
    NO_SHOW: { label: "GELMEDİ", className: "bg-amber-500/20 text-amber-400" },
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {employees.map((emp) => (
          <button
            key={emp.id}
            onClick={() => setEmployeeId(emp.id)}
            className={`py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
              selectedId === emp.id
                ? "bg-neutral-700 text-white border border-neutral-500"
                : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-700"
            }`}
          >
            {emp.firstName} {emp.lastName}
            {!emp.active && <span className="ml-1 text-xs text-neutral-500">(pasif)</span>}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <Calendar size={14} className="shrink-0" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 bg-neutral-800 border border-neutral-600 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
        />
      </label>

      <div className="space-y-2">
        {loading ? (
          <p className="text-center text-neutral-400 py-4">Randevular yükleniyor...</p>
        ) : appointments.length > 0 ? (
          appointments.map((app) => (
            <div
              key={app.id}
              className={`p-3 rounded-xl border flex flex-col gap-1.5 ${
                app.status === "CANCELLED" || app.status === "NO_SHOW"
                  ? "bg-neutral-800/50 border-neutral-700/50 opacity-75"
                  : "bg-neutral-800 border-neutral-700"
              }`}
            >
              <div className="flex justify-between items-center gap-2">
                <span
                  className={`font-bold ${badge[app.status] ? "text-neutral-400" : "text-emerald-400"}`}
                >
                  {new Date(app.startTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  <span className="text-sm font-normal text-neutral-400 ml-2">
                    {app.packageName ? `${app.packageName} (${app.services.join(" + ")})` : app.serviceName}
                  </span>
                </span>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    badge[app.status]?.className || "bg-emerald-500/20 text-emerald-400"
                  }`}
                >
                  {badge[app.status]?.label || "ONAYLI"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5 text-white font-medium">
                  <UserCircle size={14} className="text-neutral-400" />
                  {app.customerFullName}
                </span>
                <a
                  href={`tel:${app.customerPhone.replace(/\s/g, "")}`}
                  className="flex items-center gap-1.5 text-neutral-300 hover:text-white"
                >
                  <Phone size={14} className="text-neutral-400" />
                  {formatPhoneNumber(app.customerPhone)}
                </a>
              </div>
              <CheckoutRow
                app={app}
                adminApi={adminApi}
                onSaved={(updated) => setAppointments((list) => list.map((a) => (a.id === updated.id ? updated : a)))}
              />
              {app.status !== "CANCELLED" && new Date(app.startTime) > new Date() && (
                <div className="text-right">
                  <button
                    onClick={() => handleCancel(app.id)}
                    className="text-xs text-neutral-400 hover:text-red-400 underline transition-colors"
                  >
                    Yönetici Olarak İptal Et
                  </button>
                </div>
              )}
              {app.status !== "CANCELLED" && new Date(app.startTime) <= new Date() && (
                <div className="text-right">
                  {app.status === "NO_SHOW" ? (
                    <button
                      onClick={() => handleNoShow(app, false)}
                      className="text-xs text-neutral-400 hover:text-white underline transition-colors"
                    >
                      Geri Al (geldi)
                    </button>
                  ) : (
                    <button
                      onClick={() => handleNoShow(app, true)}
                      className="text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-white px-3 py-1.5 rounded-md transition-colors"
                    >
                      Gelmedi
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="text-center text-neutral-400 py-8 bg-neutral-900 rounded-lg">
            {selected ? `${selected.firstName} ${selected.lastName} için bu tarihte randevu bulunmuyor.` : "Çalışan yok."}
          </p>
        )}
      </div>
    </div>
  );
}

export default AppointmentsPanel;
