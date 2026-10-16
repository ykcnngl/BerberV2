import { useState } from "react";
import { Clock, Pencil, Plus, Power, Users } from "lucide-react";
import { getErrorMessage } from "../api";
import { formatMoney } from "../utils";

const emptyForm = { name: "", durationMinutes: "30", price: "" };

const inputClass =
  "w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500";

// Hizmet ekleme/düzenleme formu
function ServiceForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit({
      name: form.name,
      durationMinutes: Number(form.durationMinutes) || null,
      price: form.price === "" ? null : Number(form.price),
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 space-y-4">
      <input
        placeholder="Hizmet adı (örn. Saç Kesimi)"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className={inputClass}
      />
      <label className="block text-sm text-neutral-400">
        Süre (dakika)
        <input
          type="number"
          min={5}
          max={600}
          step={5}
          value={form.durationMinutes}
          onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
          className={`${inputClass} mt-1`}
        />
      </label>
      <label className="block text-sm text-neutral-400">
        Fiyat (₺) <span className="text-neutral-500">— sitede gösterilmez, ciro raporunda kullanılır</span>
        <input
          type="number"
          min={0}
          step="any"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className={`${inputClass} mt-1`}
        />
      </label>

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-neutral-400 hover:text-white">
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 text-white font-semibold px-5 py-2 rounded-lg"
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </form>
  );
}

// Hizmet listesi: ekle, düzenle, pasife al ve hizmeti verecek ekip üyelerini ata
function ServicesPanel({ adminApi, services, employees, onChanged }) {
  const [editingId, setEditingId] = useState(null); // "new" = yeni hizmet

  const [savingId, setSavingId] = useState(null);

  // Ekip üyesine tıklanınca hizmet ona atanır ya da üzerinden kaldırılır
  const handleToggleProvider = async (svc, emp) => {
    const current = employees.filter((e) => e.serviceIds.includes(svc.id)).map((e) => e.id);
    const employeeIds = current.includes(emp.id) ? current.filter((id) => id !== emp.id) : [...current, emp.id];
    setSavingId(svc.id);
    try {
      await adminApi.put(`/services/${svc.id}/employees`, { employeeIds });
      await onChanged();
    } catch (error) {
      alert(getErrorMessage(error, "Ekip ataması kaydedilemedi."));
    }
    setSavingId(null);
  };

  const handleSave = async (id, form) => {
    try {
      if (id === "new") {
        await adminApi.post("/services", form);
      } else {
        await adminApi.put(`/services/${id}`, form);
      }
      setEditingId(null);
      await onChanged();
    } catch (error) {
      alert(getErrorMessage(error, "Hizmet kaydedilemedi."));
    }
  };

  const handleToggleActive = async (svc) => {
    const message = svc.active
      ? `${svc.name} pasife alınsın mı? Sitede görünmez ve yeni randevu alınamaz, mevcut randevular silinmez.`
      : `${svc.name} tekrar aktif edilsin mi?`;
    if (!window.confirm(message)) return;
    try {
      await adminApi.patch(`/services/${svc.id}/active`, { active: !svc.active });
      await onChanged();
    } catch (error) {
      alert(getErrorMessage(error, "İşlem yapılamadı."));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-400">İsimlere dokunarak hizmeti kimin vereceğini seçin.</p>
        {editingId !== "new" && (
          <button
            onClick={() => setEditingId("new")}
            className="text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
          >
            <Plus size={14} /> Ekle
          </button>
        )}
      </div>
      {editingId === "new" && (
        <ServiceForm initial={emptyForm} onSubmit={(form) => handleSave("new", form)} onCancel={() => setEditingId(null)} />
      )}

      {services.map((svc) => {
        if (editingId === svc.id) {
          return (
            <ServiceForm
              key={svc.id}
              initial={{
                name: svc.name,
                durationMinutes: String(svc.durationMinutes),
                price: svc.price == null ? "" : String(svc.price),
              }}
              onSubmit={(form) => handleSave(svc.id, form)}
              onCancel={() => setEditingId(null)}
            />
          );
        }
        // Pasif ekip üyeleri sadece zaten atanmışsa gösterilir (kaldırılabilsin diye)
        const assignable = employees.filter((e) => e.active || e.serviceIds.includes(svc.id));
        const hasProvider = employees.some((e) => e.active && e.serviceIds.includes(svc.id));
        return (
          <div
            key={svc.id}
            className={`bg-neutral-800 border rounded-xl p-3 ${svc.active ? "border-neutral-700" : "border-neutral-800 opacity-60"}`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white text-sm">
                  {svc.name}
                  {!svc.active && (
                    <span className="ml-2 text-[0.65rem] bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded-full">Pasif</span>
                  )}
                </h3>
                <p className="text-xs text-neutral-400 flex items-center gap-1 mt-0.5">
                  <Clock size={12} /> {svc.durationMinutes} dk ·{" "}
                  {svc.price == null ? <span className="text-amber-400">fiyat girilmedi</span> : formatMoney(svc.price)}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setEditingId(svc.id)}
                  className="p-1.5 bg-neutral-700 hover:bg-neutral-600 rounded-lg"
                  aria-label="Düzenle"
                  title="Düzenle"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleToggleActive(svc)}
                  className={`p-1.5 rounded-lg ${
                    svc.active ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-emerald-600/20 text-emerald-400"
                  }`}
                  aria-label={svc.active ? "Pasife al" : "Aktif et"}
                  title={svc.active ? "Pasife al" : "Aktif et"}
                >
                  <Power size={14} />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Users size={12} className="text-neutral-500" />
              {assignable.map((emp) => {
                const assigned = emp.serviceIds.includes(svc.id);
                return (
                  <button
                    key={emp.id}
                    disabled={savingId === svc.id}
                    onClick={() => handleToggleProvider(svc, emp)}
                    className={`px-2 py-1 rounded-md text-xs border transition-colors disabled:opacity-50 ${
                      assigned
                        ? "bg-emerald-600/20 border-emerald-500 text-white"
                        : "border-neutral-600 text-neutral-500 hover:text-white"
                    }`}
                  >
                    {emp.firstName} {emp.lastName}
                    {!emp.active && " (pasif)"}
                  </button>
                );
              })}
              {!assignable.length && <span className="text-xs text-neutral-500">Önce çalışan ekleyin.</span>}
              {assignable.length > 0 && !hasProvider && <span className="text-xs text-amber-400">kimse seçilmedi</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ServicesPanel;
